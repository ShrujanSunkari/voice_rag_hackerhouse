"""
Production validation: 40-query LLM-as-judge against echo_sight_hindi_v4.
Writes all output to results_v4.txt to bypass PowerShell stdout buffering.
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

# Write all output to file so we bypass PowerShell buffering
out = open(OUT_FILE, "w", encoding="utf-8")
def log(msg=""):
    out.write(msg + "\n")
    out.flush()

log("=" * 80)
log(f"LLM-JUDGE VALIDATION: {COLLECTION_NAME} (40 real queries)")
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
1. If GENERATED_ANSWER correctly answers based on GROUND_TRUTH -> "CORRECT"
2. If GENERATED_ANSWER is wrong/hallucinated -> "INCORRECT"
3. If GENERATED_ANSWER is a refusal ("UNANSWERABLE" or "क्षमा करें"):
   - If RETRIEVED_CHUNK genuinely lacks the answer -> "CORRECTLY-REFUSED"
   - If RETRIEVED_CHUNK contains the answer but AI refused -> "INCORRECTLY-REFUSED"

Respond with exactly two lines:
Line 1: The judgment (CORRECT, INCORRECT, CORRECTLY-REFUSED, INCORRECTLY-REFUSED)
Line 2: One-sentence explanation."""
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0, max_tokens=150
    )
    lines = resp.choices[0].message.content.strip().split('\n')
    judgement = lines[0].strip()
    reason = lines[1].strip() if len(lines) > 1 else ""
    if "CORRECTLY-REFUSED" in judgement:   judgement = "CORRECTLY-REFUSED"
    elif "INCORRECTLY-REFUSED" in judgement: judgement = "INCORRECTLY-REFUSED"
    elif "INCORRECT" in judgement:          judgement = "INCORRECT"
    elif "CORRECT" in judgement:            judgement = "CORRECT"
    else:                                   judgement = "UNKNOWN"
    return judgement, reason

def full_pipeline(query):
    points = retrieve(query, limit=10)
    if not points or points[0].score < 0.45:
        return None, None, None
    shards  = [p.payload.get("text", "") for p in points]
    context = "\n\n".join(shards)
    answer  = generate(context, query)
    return points, shards, answer

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

# --- Load 40 queries from local parquet ---
log(f"\nLoading from local parquet: {LOCAL_PARQUET}")
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
log("-" * 80)

# --- Run validation ---
results = []
for idx, row in sample.iterrows():
    query      = str(row["query"])
    gt_passage = get_ground_truth(row["passages"])

    points, shards, answer = full_pipeline(query)

    if points is None:
        retrieved_snippet = "[BELOW THRESHOLD - no confident match]"
        answer            = "UNANSWERABLE"
    else:
        retrieved_snippet = "\n\n".join(shards) if shards else ""

    judgement, reason = evaluate_with_llm(query, retrieved_snippet, answer, gt_passage)

    results.append({"idx": idx + 1, "query": query, "judgement": judgement, "reason": reason})
    q_short = (query[:45] + "…") if len(query) > 45 else query
    log(f"Q{idx+1:02d}: {q_short:<47} | {judgement:<22} | {reason[:55]}")

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
