"""
validate_prod_cached.py
======================
Runs the 40-query LLM-judge validation against echo_sight_hindi_v4.
Caches the retrieval and generation steps to `val_cache.json` so that
subsequent runs can re-evaluate the judge logic with ZERO extra API calls.

Fixes:
1. Substring matching bug where "INCORRECTLY-REFUSED" matched "CORRECTLY-REFUSED" first.
2. Explicit instructions in judge prompt for refusal cases.
"""
import os, sys, random, json, time, re
import pyarrow.parquet as pq

from dotenv import load_dotenv
load_dotenv()

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential

QDRANT_URL      = os.environ.get("QDRANT_URL")
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY")
COLLECTION_NAME = "echo_sight_hindi_v4"
LOCAL_PARQUET   = r"C:\Users\sunka\.cache\huggingface\hub\datasets--ai4bharat--MSMARCO-XI\snapshots\bf5cdc1f26e581e519018e434db14edd1b77602b\train\hintrain.parquet"
OUT_FILE        = "results_v4.txt"
CACHE_FILE      = "val_cache.json"

out = open(OUT_FILE, "w", encoding="utf-8")
def log(msg=""):
    out.write(msg + "\n")
    out.flush()

log("=" * 80)
log("LLM-JUDGE VALIDATION (WITH RETRY & CACHING): " + COLLECTION_NAME)
log("=" * 80)
log("Initialising clients...")

client      = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embedder    = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
groq_client = Groq(api_key=GROQ_API_KEY)
log("Clients ready.")

# Verify collection
info = client.get_collection(COLLECTION_NAME)
log(f"Collection '{COLLECTION_NAME}': {info.points_count:,} points, status={info.status}")

# --- Pipeline functions ---
def retrieve(query, limit=10):
    vec = embedder.encode(query).tolist()
    resp = client.query_points(collection_name=COLLECTION_NAME, query=vec, limit=limit, with_payload=True)
    return resp.points

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=20))
def generate(context, query):
    prompt = f"""CRITICAL INSTRUCTION: Answer the user's question using ONLY the information in the Context.

Context (Hindi):
{context}

User's Question:
{query}

RULES:
1. If Context does NOT contain the answer: output exactly:
   HINDI: क्षमा करें, दिए गए संदर्भ में इस प्रश्न का उत्तर उपलब्ध नहीं है।
   ENGLISH: UNANSWERABLE: Sorry, the answer is not available in the provided context.
2. If Context DOES contain the answer:
   HINDI: [Hindi answer]
   ENGLISH: [English answer]
DO NOT add any other text."""
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2, max_tokens=300
    )
    return resp.choices[0].message.content.strip()

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=20))
def evaluate_with_llm(query, retrieved_chunk, generated_answer, ground_truth):
    prompt = f"""You are an expert evaluator for an AI Q&A system.

[QUERY]: {query}
[RETRIEVED_CHUNK]: {retrieved_chunk}
[GROUND_TRUTH]: {ground_truth}
[GENERATED_ANSWER]: {generated_answer}

RULES:
1. If GENERATED_ANSWER correctly and substantively answers the QUERY based on the GROUND_TRUTH, output: "CORRECT"
2. If GENERATED_ANSWER provides a wrong, inaccurate, or hallucinated answer, output: "INCORRECT"
3. If GENERATED_ANSWER is a refusal (e.g. contains "UNANSWERABLE", "क्षमा करें", or "उत्तर उपलब्ध नहीं है"):
   - Read the RETRIEVED_CHUNK carefully. If the RETRIEVED_CHUNK genuinely DOES NOT contain the information needed to answer the QUERY, then the AI's refusal was correct. Output: "CORRECTLY-REFUSED"
   - If the RETRIEVED_CHUNK DOES contain information that could answer the QUERY, but the AI refused to answer anyway, this is a failure. You MUST output: "INCORRECTLY-REFUSED"

Your response must be exactly two lines:
Line 1: Only the judgment category (CORRECT, INCORRECT, CORRECTLY-REFUSED, INCORRECTLY-REFUSED).
Line 2: A one-sentence explanation of why.

Response:"""
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0, max_tokens=150
    )
    lines = resp.choices[0].message.content.strip().split('\n')
    judgement = lines[0].strip()
    reason = lines[1].strip() if len(lines) > 1 else ""
    
    # Fix the substring matching bug by checking the longer label first
    if "INCORRECTLY-REFUSED" in judgement:   judgement = "INCORRECTLY-REFUSED"
    elif "CORRECTLY-REFUSED" in judgement:   judgement = "CORRECTLY-REFUSED"
    elif "INCORRECT" in judgement:          judgement = "INCORRECT"
    elif "CORRECT" in judgement:            judgement = "CORRECT"
    else:                                   judgement = "UNKNOWN"
    return judgement, reason

def get_ground_truth(p):
    try:
        texts    = p.get("Translated_passages", p.get("passage_text", []))
        selected = p.get("is_selected", [])
        for i, s in enumerate(selected):
            if s == 1 and i < len(texts):
                return str(texts[i])[:300]
    except:
        pass
    return ""

# Check if cache exists
cache_data = {}
if os.path.exists(CACHE_FILE):
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache_data = json.load(f)
        log(f"Loaded {len(cache_data)} cached queries/answers from {CACHE_FILE}")
    except Exception as e:
        log(f"Failed to load cache: {e}")

# If cache is empty or incomplete, we stream and run retrieval/generation
runs = []
if not cache_data:
    log(f"\nNo cache found. Running retrieval & generation from local parquet: {LOCAL_PARQUET}")
    pf        = pq.ParquetFile(LOCAL_PARQUET)
    total     = pf.metadata.num_rows
    log(f"Total rows: {total:,}")

    batch = next(pf.iter_batches(batch_size=5000, columns=["query", "passages"]))
    import pandas as pd
    df = batch.to_pandas()

    def has_selected(p):
        try:
            sel = p.get("is_selected", []) if isinstance(p, dict) else []
            return any(s == 1 for s in sel)
        except:
            return False

    valid_df = df[df["passages"].apply(has_selected)].reset_index(drop=True)
    sample   = valid_df.sample(min(40, len(valid_df)), random_state=77).reset_index(drop=True)
    log(f"Valid rows: {len(valid_df)}, sampled: {len(sample)}\n")
    
    # Run retrieval/generation and populate cache
    cache_to_save = {}
    for idx, row in sample.iterrows():
        query      = str(row["query"])
        gt_passage = get_ground_truth(row["passages"])
        
        points = retrieve(query, limit=10)
        if not points or points[0].score < 0.45:
            retrieved_snippet = "[BELOW THRESHOLD - no confident match]"
            answer            = "UNANSWERABLE"
        else:
            shards            = [p.payload.get("text", "") for p in points]
            retrieved_snippet = "\n\n".join(shards)
            answer            = generate(retrieved_snippet, query)
            
        cache_to_save[query] = {
            "retrieved_snippet": retrieved_snippet,
            "answer": answer,
            "gt_passage": gt_passage
        }
        
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache_to_save, f, indent=4, ensure_ascii=False)
    cache_data = cache_to_save
    log(f"Cached all {len(cache_data)} runs to {CACHE_FILE}")

# --- Run the corrected judging step ---
log("-" * 80)
log("Running corrected judging step...")
results = []
idx = 1
for query, info in cache_data.items():
    retrieved_snippet = info["retrieved_snippet"]
    answer            = info["answer"]
    gt_passage        = info["gt_passage"]

    judgement, reason = evaluate_with_llm(query, retrieved_snippet, answer, gt_passage)

    results.append({"idx": idx, "query": query, "judgement": judgement, "reason": reason})
    q_short = (query[:45] + "…") if len(query) > 45 else query
    log(f"Q{idx:02d}: {q_short:<47} | {judgement:<22} | {reason[:55]}")
    idx += 1

# --- Summary ---
correct       = sum(1 for r in results if r["judgement"] in ["CORRECT", "CORRECTLY-REFUSED"])
inc_refused   = sum(1 for r in results if r["judgement"] == "INCORRECTLY-REFUSED")
incorrect     = sum(1 for r in results if r["judgement"] == "INCORRECT")
accuracy      = correct / len(results)

log("\n" + "=" * 80)
log(f"  FINAL ACCURACY (CORRECT + CORRECTLY-REFUSED): {correct}/{len(results)} = {accuracy:.1%}")
log(f"  TRUE PIPELINE FAILURES (INCORRECTLY-REFUSED): {inc_refused}/{len(results)}")
log(f"  INCORRECT ANSWERS (HALLUCINATIONS/WRONG)    : {incorrect}/{len(results)}")
log("=" * 80)

log("\nDETAILED BREAKDOWN:")
for r in results:
    log(f"\n[{r['judgement']}] Q: {r['query']}")
    log(f"    Reason: {r['reason']}")

out.close()
print(f"Done. Results written to {OUT_FILE}")
