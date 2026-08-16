"""
LEGACY: Kept for audit trail only.
This script was used to validate the early testing collections on the old cluster.
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

QDRANT_URL      = os.environ.get("QDRANT_URL")
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
GROQ_API_KEY    = os.environ.get("GROQ_API_KEY")
COLLECTION_NAME = "echo_sight_hindi_test_v2" # <-- New Test Collection

print("Initialising clients...")
client  = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
groq_client = Groq(api_key=GROQ_API_KEY)
print("Clients ready.\n")

def hr(char="=", n=90): print(char * n)
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

def full_pipeline(query):
    points = retrieve(query, limit=3)
    if not points or points[0].score < 0.45:
        return None, None, None
    shards = [p.payload.get("text","") for p in points]
    context = "\n\n".join(shards)
    answer = generate(context, query)
    return points, shards, answer

section(f"CORRECTNESS TEST: {COLLECTION_NAME} (20 real MSMARCO-XI Hindi queries)")

print("\nLoading the EXACT 1000 rows that were indexed...")
try:
    df = pd.read_parquet(
        "https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/validation/hinval.parquet",
        columns=["query","passages"]
    )
    def has_selected(p):
        try:
            sel = p.get("is_selected",[]) if isinstance(p,dict) else []
            return any(s==1 for s in sel)
        except: return False
        
    # MUST MATCH INDEXER EXACTLY:
    # 1. Sample 1000 rows with random_state=42
    sample_df = df.sample(min(1000, len(df)), random_state=42).reset_index(drop=True)
    # 2. Filter to only those with valid passages
    valid_df = sample_df[sample_df["passages"].apply(has_selected)]
    
    # Now sample 20 for testing
    sample = valid_df.sample(20, random_state=77).reset_index(drop=True)
    print(f"  Sampled 20 test queries from the valid indexed set.\n")

    def get_ground_truth(p):
        try:
            passages_text = p.get("Translated_passages", p.get("passage_text", []))
            selected = p.get("is_selected",[])
            for i,s in enumerate(selected):
                if s==1 and i < len(passages_text):
                    return str(passages_text[i])[:300]
        except: pass
        return ""

    correct = 0
    part3_results = []

    print(f"{'#':<3} {'Query (50ch)':<52} {'Score':<7} {'GT match':<8} {'Correct?'}")
    print("-"*90)

    for idx, row in sample.iterrows():
        query = str(row["query"])
        gt_passage = get_ground_truth(row["passages"])

        points, shards, answer = full_pipeline(query)

        if points is None:
            score = 0.0
            retrieved_snippet = "[BELOW THRESHOLD - no result]"
            answer = "UNANSWERABLE (score < 0.45)"
            is_correct = False
        else:
            score = round(points[0].score, 4)
            retrieved_snippet = (shards[0] if shards else "")[:150]
            def shared_words(a, b):
                a_words = set(re.findall(r'\w+', a.lower()))
                b_words = set(re.findall(r'\w+', b.lower()))
                a_words = {w for w in a_words if len(w) > 2}
                b_words = {w for w in b_words if len(w) > 2}
                return len(a_words & b_words)

            gt_in_chunk = shared_words(retrieved_snippet, gt_passage) >= 3
            gt_in_answer = shared_words(answer or "", gt_passage) >= 3
            is_correct = (gt_in_chunk or gt_in_answer) and answer and "UNANSWERABLE" not in answer
            if is_correct: correct += 1

        part3_results.append({
            "idx": idx+1,
            "query": query,
            "score": score,
            "retrieved_snippet": retrieved_snippet,
            "answer": answer,
            "gt_passage": gt_passage,
            "correct": is_correct
        })

        q_short = (query[:50] + "…") if len(query)>50 else query
        print(f"{idx+1:<3} {q_short:<52} {score:<7.4f} {'YES' if (points and gt_passage) else 'N/A':<8} {'Y' if is_correct else 'N'}")

    accuracy = correct / 20
    print(f"\n  New Accuracy: {correct}/20 = {accuracy:.1%}")
    
    print(f"\n{'─'*90}")
    print("  DETAILED RESULTS (First 5 Failures):")
    print(f"{'─'*90}")
    failures = [r for r in part3_results if not r["correct"]][:5]
    for r in failures:
        print(f"\n  Q{r['idx']:02d}: {r['query']}")
        print(f"  Score     : {r['score']}")
        print(f"  Retrieved : {r['retrieved_snippet'][:200]!r}")
        print(f"  GT Passage: {r['gt_passage'][:200]!r}")
        print(f"  Answer    : {(r['answer'] or '')[:200]!r}")

except Exception as e:
    print(f"  ERROR: {e}")
