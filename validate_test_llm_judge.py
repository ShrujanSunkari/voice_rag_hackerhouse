"""
LEGACY: Kept for audit trail only.
This script was used to validate test collection logic with an LLM judge on earlier collection setups.
Superseded by validate_prod_cached.py and validation configurations documented in DATA_PROVENANCE.md.
"""
import sys, io, os, random, json, time, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
from groq import Groq
import pandas as pd
import pyarrow.parquet as pq
import fsspec

QDRANT_URL      = os.environ.get("QDRANT_URL")
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY")
COLLECTION_NAME = "echo_sight_hindi_v4" 

print("Initialising clients...")
client  = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
groq_client = Groq(api_key=GROQ_API_KEY)
print("Clients ready.\n")

def hr(char="=", n=100): print(char * n)
def section(title):
    hr()
    print(f"  {title}")
    hr()

def retrieve(query, limit=3):
    vec = embedder.encode(query).tolist()
    resp = client.query_points(collection_name=COLLECTION_NAME, query=vec, limit=limit, with_payload=True)
    return resp.points

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
    raw = resp.choices[0].message.content.strip()
    return raw

def evaluate_with_llm(query, retrieved_chunk, generated_answer, ground_truth):
    prompt = f"""You are an expert evaluator for an AI Q&A system. Your job is to evaluate if the AI responded correctly.

Here is the data:
[QUERY]: {query}
[RETRIEVED_CHUNK]: {retrieved_chunk}
[GROUND_TRUTH]: {ground_truth}
[GENERATED_ANSWER]: {generated_answer}

RULES:
1. If the GENERATED_ANSWER provides the correct answer based on the GROUND_TRUTH, output: "CORRECT"
2. If the GENERATED_ANSWER provides a wrong/hallucinated answer, output: "INCORRECT"
3. If the GENERATED_ANSWER is a refusal ("UNANSWERABLE" or "क्षमा करें"):
   - Read the RETRIEVED_CHUNK. If the RETRIEVED_CHUNK genuinely DOES NOT contain the answer to the QUERY, then the AI was right to refuse. Output: "CORRECTLY-REFUSED"
   - If the RETRIEVED_CHUNK DOES contain the answer, but the AI refused anyway, output: "INCORRECTLY-REFUSED"

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
    # Fallback cleanup
    if "CORRECTLY-REFUSED" in judgement: judgement = "CORRECTLY-REFUSED"
    elif "INCORRECTLY-REFUSED" in judgement: judgement = "INCORRECTLY-REFUSED"
    elif "INCORRECT" in judgement: judgement = "INCORRECT"
    elif "CORRECT" in judgement: judgement = "CORRECT"
    else: judgement = "UNKNOWN"
    
    return judgement, reason

def full_pipeline(query):
    points = retrieve(query, limit=3)
    if not points or points[0].score < 0.45:
        return None, None, None
    shards = [p.payload.get("text","") for p in points]
    context = "\n\n".join(shards)
    answer = generate(context, query)
    return points, shards, answer

section(f"LLM JUDGE CORRECTNESS TEST: {COLLECTION_NAME} (40 real queries)")

# Use locally cached parquet (remote URLs stall on this machine)
LOCAL_PARQUET = r'C:\Users\sunka\.cache\huggingface\hub\datasets--ai4bharat--MSMARCO-XI\snapshots\bf5cdc1f26e581e519018e434db14edd1b77602b\train\hintrain.parquet'
print(f"\nLoading validation queries from local cache:\n  {LOCAL_PARQUET}")
try:
    pf = pq.ParquetFile(LOCAL_PARQUET)
    total_rows = pf.metadata.num_rows
    print(f"  Total rows in source: {total_rows:,}")

    # Stream first batch of 5000 rows - fast, no full-file download needed
    batch = next(pf.iter_batches(batch_size=5000, columns=["query", "passages"]))
    df = batch.to_pandas()
    print(f"  Loaded {len(df):,} rows for sampling.")

    def has_selected(p):
        try:
            sel = p.get("is_selected",[]) if isinstance(p,dict) else []
            return any(s==1 for s in sel)
        except: return False
        
    valid_df = df[df["passages"].apply(has_selected)].reset_index(drop=True)
    print(f"  Valid rows (is_selected==1 present): {len(valid_df):,}")
    
    # Sample 40 for testing
    sample = valid_df.sample(min(40, len(valid_df)), random_state=77).reset_index(drop=True)
    print(f"  Sampled {len(sample)} test queries from validation set.\n")

    def get_ground_truth(p):
        try:
            passages_text = p.get("Translated_passages", p.get("passage_text", []))
            selected = p.get("is_selected",[])
            for i,s in enumerate(selected):
                if s==1 and i < len(passages_text):
                    return str(passages_text[i])[:300]
        except: pass
        return ""

    results = []

    for idx, row in sample.iterrows():
        query = str(row["query"])
        gt_passage = get_ground_truth(row["passages"])

        points, shards, answer = full_pipeline(query)

        if points is None:
            retrieved_snippet = "[BELOW THRESHOLD]"
            answer = "UNANSWERABLE"
            judgement, reason = evaluate_with_llm(query, retrieved_snippet, answer, gt_passage)
        else:
            retrieved_snippet = shards[0] if shards else ""
            judgement, reason = evaluate_with_llm(query, retrieved_snippet, answer, gt_passage)

        results.append({
            "idx": idx+1,
            "query": query,
            "answer": answer,
            "gt": gt_passage,
            "retrieved": retrieved_snippet,
            "judgement": judgement,
            "reason": reason
        })
        
        q_short = (query[:40] + "…") if len(query)>40 else query
        print(f"Q{idx+1:02d}: {q_short:<42} | {judgement:<20} | {reason[:50]}...")

    correct_count = sum(1 for r in results if r["judgement"] in ["CORRECT", "CORRECTLY-REFUSED"])
    inc_refused = sum(1 for r in results if r["judgement"] == "INCORRECTLY-REFUSED")
    incorrect = sum(1 for r in results if r["judgement"] == "INCORRECT")

    accuracy = correct_count / 40
    print(f"\n{'='*100}")
    print(f"  FINAL ACCURACY (CORRECT + CORRECTLY-REFUSED): {correct_count}/40 = {accuracy:.1%}")
    print(f"  TRUE PIPELINE FAILURES (INCORRECTLY-REFUSED): {inc_refused}/40")
    print(f"  INCORRECT ANSWERS (HALLUCINATIONS/WRONG)    : {incorrect}/40")
    print(f"{'='*100}")
    
    print("\nDETAILED BREAKDOWN:")
    for r in results:
        print(f"\n[{r['judgement']}] Q: {r['query']}")
        print(f"    Reason : {r['reason']}")
        if r['judgement'] in ["INCORRECT", "INCORRECTLY-REFUSED"]:
            print(f"    Retrv'd: {r['retrieved'][:150]}...")
            print(f"    Answer : {r['answer'][:150]}...")

except Exception as e:
    print(f"  ERROR: {e}")
