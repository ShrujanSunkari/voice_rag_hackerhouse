import os
import time
import requests
import json
import re
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, AliasChoices, ConfigDict
from typing import Literal
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
from groq import Groq
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

qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

print("Loading local embedder for queries...")
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
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

class QueryResponse(BaseModel):
    synthesized_answer: str
    evidence_shards: list[str]
    latency_ms: float
    transcript: str = ""

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
    return {
        "P50": get_percentile(request_latencies, 50),
        "P70": get_percentile(request_latencies, 70),
        "P100": get_percentile(request_latencies, 100),
    }

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
def groq_translate_to_hindi(query: str) -> str:
    prompt = f"Translate the following Hinglish/English/Hindi text into clean Devanagari Hindi. Output ONLY the translated Hindi text, nothing else.\n\nText: {query}"
    completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=100
    )
    return completion.choices[0].message.content.strip()

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
def groq_generate_answer(context_text: str, query: str) -> RAGResponse:
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
    
    completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=300,
    )
    raw_response = completion.choices[0].message.content.strip()
    status = "UNANSWERABLE" if "UNANSWERABLE" in raw_response or "क्षमा करें" in raw_response else "ANSWERED"
    return RAGResponse(synthesized_answer=raw_response, status=status)

def retrieve_context(search_query: str):
    import time
    t0 = time.time()
    query_vector = embedder.encode(search_query).tolist()
    t1 = time.time()
    search_response = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=10,
        with_payload=True
    )
    t2 = time.time()
    return search_response.points, {
        "embedding_ms": (t1 - t0) * 1000,
        "qdrant_network_ms": (t2 - t1) * 1000,
        "total_ms": (t2 - t0) * 1000
    }

@app.post("/api/query", response_model=QueryResponse)
async def process_voice_query(request: QueryRequest):
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
            
    search_result, _ = retrieve_context(search_query)

    if not search_result or search_result[0].score < 0.45:
        latency = round((time.time() - start_time) * 1000, 2)
        request_latencies.append(latency)
        return QueryResponse(
            synthesized_answer="HINDI: क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली।\nENGLISH: UNANSWERABLE: Sorry, I couldn't find enough information on this topic.",
            evidence_shards=[],
            latency_ms=latency,
            transcript=request.transcript
        )

    retrieved_shards = [hit.payload.get("text", "") for hit in search_result]
    context_text = "\n\n".join(retrieved_shards)

    try:
        rag_res = groq_generate_answer(context_text, request.transcript)
        final_answer = rag_res.synthesized_answer
    except Exception as e:
        print(f"Groq API Error: {e}")
        final_answer = "Error connecting to the language model."

    latency = round((time.time() - start_time) * 1000, 2)
    request_latencies.append(latency)
    
    return QueryResponse(
        synthesized_answer=final_answer,
        evidence_shards=retrieved_shards,
        latency_ms=latency,
        transcript=request.transcript
    )

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