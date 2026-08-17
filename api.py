import os
import time
import requests
import json
import re
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, AliasChoices, ConfigDict
from typing import Literal
from qdrant_client import QdrantClient
from fastembed import TextEmbedding
from groq import Groq
from groq import RateLimitError as GroqRateLimitError, APIStatusError as GroqAPIStatusError
from tenacity import retry, stop_after_attempt, wait_exponential
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# 1. SETUP & CREDENTIALS
# ==========================================
QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")

qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, prefer_grpc=True)
groq_client = Groq(api_key=GROQ_API_KEY)

print("Loading local embedder for queries...")
embedder = TextEmbedding(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
print("Warming up embedder...")
_ = list(embedder.embed(["warmup query"]))
print("API Setup Complete.")

COLLECTION_NAME = "echo_sight_hindi_v4"
app = FastAPI(title="Echo-Sight Voice RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

request_latencies = []

# ==========================================
# 2. DATA MODELS
# ==========================================
class QueryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    transcript: str = Field(..., validation_alias=AliasChoices("transcript", "query"))

class SynthesisRequest(BaseModel):
    transcript: str
    evidence_shards: list[str]

class QueryResponse(BaseModel):
    synthesized_answer: str
    evidence_shards: list[str]
    latency_ms: float
    transcript: str = ""
    model_used: str = ""
    is_degraded: bool = False

class RAGResponse(BaseModel):
    synthesized_answer: str
    status: Literal["ANSWERED", "UNANSWERABLE"]

# ==========================================
# 3. METRICS & ENDPOINTS
# ==========================================
def get_percentile(data, p):
    if not data:
        return 0
    s_data = sorted(data)
    idx = int((len(s_data) - 1) * p / 100.0)
    return s_data[idx]

@app.get("/api/metrics")
def get_metrics():
    try:
        with open("latency_summary.json", "r") as f:
            data = json.load(f)
        return {
            "retrieval": data.get("retrieval_metrics", {}),
            "full_pipeline": data.get("full_pipeline_metrics", {}),
            "sample_size": data.get("num_queries", 100)
        }
    except Exception as e:
        return {
            "retrieval": {"P50": 0, "P70": 0, "P100": 0},
            "full_pipeline": {"P50": 0, "P70": 0, "P100": 0},
            "sample_size": 0,
            "error": str(e)
        }


# ==========================================
# 4. GROQ FALLBACK CHAIN
# ==========================================
import logging

def get_active_groq_models():
    try:
        # Ask Groq what models are currently active and available
        available_models = groq_client.models.list().data
        model_ids = [m.id for m in available_models]
        
        # EXCLUDE whisper, vision, and prompt-guard models
        excluded_keywords = ["whisper", "vision", "prompt-guard"]
        valid_models = [m for m in model_ids if not any(kw in m.lower() for kw in excluded_keywords)]
        
        # Prioritize capable Llama models
        llama_models = [m for m in valid_models if "llama" in m.lower() and ("70b" in m.lower() or "8b" in m.lower())]
        other_models = [m for m in valid_models if m not in llama_models]
        
        fallback_list = llama_models + other_models
        logging.info(f"Dynamically loaded capable text models: {fallback_list[:3]}")
        return fallback_list
    except Exception as e:
        logging.error(f"Could not fetch models: {e}")
        return ["llama-3.3-70b-versatile"] # Absolute fallback

def generate_with_fallback(
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 512,
) -> tuple[str, str, bool]:
    """Try each dynamically fetched model in order.
    Returns (raw_text, model_used, is_degraded).
    """
    last_error = None
    active_models = get_active_groq_models()
    
    for model_name in active_models:
        try:
            logging.info(f"Attempting inference with model: {model_name}")
            response = groq_client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            raw = response.choices[0].message.content.strip()
            # Pass 1: strip fully-closed <think>...</think> blocks
            raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL)
            # Pass 2: strip unclosed <think>... that runs to end of string
            raw = re.sub(r'<think>.*', '', raw, flags=re.DOTALL)
            raw = raw.strip()
            is_degraded = model_name != active_models[0]
            if is_degraded:
                logging.info(f"Using fallback model '{model_name}'.")
            return raw, model_name, is_degraded
        except Exception as e:
            logging.warning(f"⚠️ Failed on '{model_name}'. Reason: {str(e)[:100]}... Skipping to next.")
            last_error = e
            continue
            
    logging.error("❌ All dynamic Groq models failed.")
    
    # Graceful fallback so the app doesn't crash on the frontend
    fallback_text = (
        "HINDI: क्षमा करें, सेवा अभी व्यस्त है। कृपया थोड़ी देर बाद पुनः प्रयास करें।\n"
        "ENGLISH: Sorry, the service is currently busy due to high demand. Please try again shortly."
    )
    return fallback_text, "none", True



@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
def groq_translate_to_hindi(query: str) -> str:
    prompt = f"Translate the following Hinglish/English/Hindi text into clean Devanagari Hindi. Output ONLY the translated Hindi text, nothing else.\n\nText: {query}"
    completion = groq_client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=100
    )
    return completion.choices[0].message.content.strip()

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
def groq_generate_answer(context_text: str, query: str) -> tuple[RAGResponse, str, bool]:
    prompt_template = """
CRITICAL INSTRUCTION: You are a strict, highly accurate AI assistant. You MUST answer the user's question using ONLY the information provided in the Context below.

Context (Hindi):
{context}

User's Question (Might be English or Hindi):
{question}

RULES:
1. If the Context DOES NOT contain the answer, you MUST return exactly this format:
HINDI: क्षमा करें, दिए गए संदर्भ में इस प्रश्न का उत्तर उपलब्ध नहीं है।
ENGLISH: UNANSWERABLE: Sorry, the answer is not available in the provided context.

2. If the Context DOES contain the answer, provide a clear, accurate answer in BOTH Hindi and English. Format your response exactly like this:
HINDI: [Your Hindi answer here]
ENGLISH: [Your English answer here]

DO NOT add any other text, markdown, or conversational filler outside of the HINDI: and ENGLISH: labels.
"""
    prompt = prompt_template.format(context=context_text, question=query)
    messages = [{"role": "user", "content": prompt}]

    raw_response, model_used, is_degraded = generate_with_fallback(
        messages=messages, temperature=0.2, max_tokens=300
    )
    status = "UNANSWERABLE" if "UNANSWERABLE" in raw_response or "क्षमा करें" in raw_response else "ANSWERED"
    return RAGResponse(synthesized_answer=raw_response, status=status), model_used, is_degraded

def retrieve_context(search_query: str):
    import time
    from qdrant_client import models
    
    if len(search_query) > 512:
        search_query = search_query[:512]
        
    t0 = time.time()
    query_vector = list(embedder.embed([search_query]))[0].tolist()
    t1 = time.time()
    search_response = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=10,
        with_payload=["text", "source", "title"],
        search_params=models.SearchParams(hnsw_ef=64)
    )
    t2 = time.time()
    return search_response.points, {
        "embedding_ms": (t1 - t0) * 1000,
        "qdrant_network_ms": (t2 - t1) * 1000,
        "total_ms": (t2 - t0) * 1000
    }

@app.post("/api/retrieve")
def process_retrieve(request: QueryRequest):
    search_query_fast = request.transcript
    search_result_fast, latency_dict = retrieve_context(search_query_fast)
    
    evidence_shards_fast = []
    fast_answer = ""
    if not search_result_fast or search_result_fast[0].score < 0.45:
        fast_answer = "HINDI: क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली।\nENGLISH: UNANSWERABLE: Sorry, I couldn't find enough information on this topic."
    else:
        evidence_shards_fast = [hit.payload.get("text", "") for hit in search_result_fast]
        # Just use the raw top chunk to be instantly fast without any overlap calculations
        top_chunk = evidence_shards_fast[0]
        fast_answer = f"HINDI: {top_chunk}\nENGLISH: [Extractive Fast Answer]"

    return {
        "type": "fast_answer",
        "synthesized_answer": fast_answer,
        "evidence_shards": evidence_shards_fast,
        "retrieval_latency_ms": latency_dict["total_ms"],
        "transcript": request.transcript,
        "model_used": "extractive",
        "is_degraded": False
    }

@app.post("/api/synthesize")
def process_synthesize(request: SynthesisRequest):
    start_time = time.time()
    
    search_query = request.transcript
    if re.search(r'[a-zA-Z]', search_query):
        try:
            translated = groq_translate_to_hindi(search_query)
            if translated:
                search_query = translated
                print(f"Translated query: '{request.transcript}' -> '{search_query}'")
        except Exception as e:
            print(f"Translation failed: {e}")
            
    MAX_QUERY_CHARS = 512
    if len(search_query) > MAX_QUERY_CHARS:
        print(f"[WARN] Query truncated from {len(search_query)} to {MAX_QUERY_CHARS} chars.")
        search_query = search_query[:MAX_QUERY_CHARS]

    search_result, _ = retrieve_context(search_query)

    if not search_result or search_result[0].score < 0.45:
        polished_answer = "HINDI: क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली।\nENGLISH: UNANSWERABLE: Sorry, I couldn't find enough information on this topic."
        model_used = "none"
        is_degraded = False
        evidence_shards = request.evidence_shards
    else:
        evidence_shards = [hit.payload.get("text", "") for hit in search_result]
        context_text = "\n\n".join(evidence_shards)
        try:
            rag_res, model_used, is_degraded = groq_generate_answer(context_text, request.transcript)
            polished_answer = rag_res.synthesized_answer
        except Exception as e:
            print(f"Groq API Error: {e}")
            polished_answer = "Error connecting to the language model."
            model_used = "none"
            is_degraded = True

    polished_latency = round((time.time() - start_time) * 1000, 2)
    request_latencies.append(polished_latency)
    
    return {
        "type": "polished_answer",
        "synthesized_answer": polished_answer,
        "evidence_shards": evidence_shards,
        "latency_ms": polished_latency,
        "transcript": request.transcript,
        "model_used": model_used,
        "is_degraded": is_degraded
    }

@app.post("/api/voice")
async def process_raw_audio(file: UploadFile = File(...)):
    total_start_time = time.time()
    audio_content = await file.read()
    
    sarvam_url = "https://api.sarvam.ai/speech-to-text"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    files = {"file": (file.filename, audio_content, file.content_type or "audio/wav")}
    data = {"model": "saaras:v3"}
    
    try:
        print("Sending audio to Sarvam AI...")
        # Sarvam STT requires language_code
        data["language_code"] = "hi-IN"
        response = requests.post(sarvam_url, headers=headers, files=files, data=data)
        response.raise_for_status()
        sarvam_data = response.json()
        transcript = sarvam_data.get("transcript", "").strip()
        print(f"Sarvam Transcript: {transcript}")
    except requests.exceptions.HTTPError as e:
        print(f"Sarvam HTTP Error: {e.response.status_code} - {e.response.text}")
        return {
            "transcript": "",
            "synthesized_answer": f"Failed to transcribe audio: {e.response.text}",
            "status": "UNANSWERABLE",
            "evidence_shards": [],
            "latency_ms": 0
        }
    except Exception as e:
        print(f"Sarvam API Error: {e}")
        return {
            "transcript": "",
            "synthesized_answer": "Failed to transcribe audio.",
            "status": "UNANSWERABLE",
            "evidence_shards": [],
            "latency_ms": 0
        }
        
    if not transcript:
        return {
            "transcript": "",
            "synthesized_answer": "Could not transcribe audio.",
            "status": "UNANSWERABLE",
            "evidence_shards": [],
            "latency_ms": 0
        }

    try:
        print("Translating query to Hindi...")
        hindi_query = groq_translate_to_hindi(transcript)
        print(f"Translated query: {hindi_query}")
    except Exception as e:
        print(f"Translation Error: {e}")
        hindi_query = transcript
        
    search_result, _ = retrieve_context(hindi_query)
    
    if not search_result or search_result[0].score < 0.45:
        latency = round((time.time() - total_start_time) * 1000, 2)
        request_latencies.append(latency)
        return {
            "transcript": transcript,
            "synthesized_answer": "मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली। कृपया कोई दूसरा सवाल पूछें।",
            "status": "UNANSWERABLE",
            "evidence_shards": [],
            "latency_ms": latency
        }
        
    retrieved_shards = [hit.payload.get("text", "") for hit in search_result]
    context_text = "\n\n".join(retrieved_shards)
    
    try:
        print("Generating answer...")
        rag_res = groq_generate_answer(context_text, hindi_query)
        ans = rag_res.synthesized_answer
        status = rag_res.status
    except Exception as e:
        print(f"Generation Error: {e}")
        ans = "Error generating answer."
        status = "UNANSWERABLE"
        
    latency = round((time.time() - total_start_time) * 1000, 2)
    request_latencies.append(latency)
    
    return {
        "transcript": transcript,
        "synthesized_answer": ans,
        "status": status,
        "evidence_shards": retrieved_shards,
        "latency_ms": latency
    }