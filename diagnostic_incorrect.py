"""
diagnostic_incorrect.py
=======================
For each of the 17 INCORRECT queries from the production validation run,
checks whether the ground-truth passage EXISTS anywhere in echo_sight_hindi_v4,
even if it wasn't retrieved as the top result.

Method:
1. Embed the GT passage → do similarity search (top-10) → if any result
   has cosine similarity >= 0.85, the GT IS in the index.
2. Also do a string-overlap check on the top-10 retrieved text payloads
   (comparing unigrams) as a fallback for translation noise cases.

Writes output to diagnostic_results.txt
"""
import os, time
from dotenv import load_dotenv
load_dotenv()

import pyarrow.parquet as pq
import pandas as pd
from qdrant_client import QdrantClient
from qdrant_client.http.models import Filter, FieldCondition, MatchText
from sentence_transformers import SentenceTransformer

QDRANT_URL      = os.environ.get("QDRANT_URL")
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
COLLECTION_NAME = "echo_sight_hindi_v4"
LOCAL_PARQUET   = r"C:\Users\sunka\.cache\huggingface\hub\datasets--ai4bharat--MSMARCO-XI\snapshots\bf5cdc1f26e581e519018e434db14edd1b77602b\train\hintrain.parquet"
OUT_FILE        = "diagnostic_results.txt"
SIMILARITY_THRESHOLD = 0.82  # cosine sim above this → GT passage likely in index

# The 17 INCORRECT query strings (same order as results_v4.txt)
INCORRECT_QUERIES = [
    "हम जनगणना ब्यूरो संख्या हैं",
    "उपशीर्षक के साथ साहित्य समीक्षा कैसे लिखें",
    "टाइम टू चार्ज कैपेसिटर इन फ्लैशलाइट में",
    "क्या है एफ.सी.आई. वर्ग",
    "क्या है डाउनफोर्स?",
    "टीवी चैनल में डीटी का क्या अर्थ है",
    "प्रबंधकीय भूमिकाओं की परिभाषा",
    "आप कितने साल पहले के कार्यान्वयन को याद करते हैं?",
    "जी.एम. पेन्सके ट्रक किराए पर लेने के वेतन",
    "कथं नु पेरिग्रीन बाज़ विलुप्त हुई",
    "दरवोकेट में क्या है",
    "धमनियों और शिराओं में रक्त किस रंग का होता है",
    "मातृभूमि सुरक्षा विभाग की आवश्यकता है",
    "विकिरण विज्ञानी के लिए वेतन",
    "सबसे बड़ा फैन्यूक रोबोट",
    "यदि आप अंतरराज्यीय सड़क पर धीमी गति से गाड़ी चला रहे हैं तो आप किस लेन का उपयोग करेंगे",
    "मनुष्य और चिम्पांजी वंशानुगत रूप से कैसे संबंधित हैं?",
]

out = open(OUT_FILE, "w", encoding="utf-8")
def log(msg=""):
    out.write(msg + "\n")
    out.flush()

log("=" * 90)
log("DIAGNOSTIC: Ground-truth passage existence check for 17 INCORRECT queries")
log(f"Collection: {COLLECTION_NAME}")
log("=" * 90)

client   = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
log("Clients ready.\n")

# Load the same sample used in validation (random_state=77)
pf = pq.ParquetFile(LOCAL_PARQUET)
batch = next(pf.iter_batches(batch_size=5000, columns=["query", "passages"]))
df = batch.to_pandas()

def has_selected(p):
    try:
        sel = p.get("is_selected", []) if isinstance(p, dict) else []
        return any(s == 1 for s in sel)
    except: return False

valid_df = df[df["passages"].apply(has_selected)].reset_index(drop=True)
sample   = valid_df.sample(min(40, len(valid_df)), random_state=77).reset_index(drop=True)

def get_ground_truth(p):
    try:
        texts    = p.get("Translated_passages", p.get("passage_text", []))
        selected = p.get("is_selected", [])
        for i, s in enumerate(selected):
            if s == 1 and i < len(texts):
                return str(texts[i]).strip()
    except: pass
    return ""

def get_row_index_in_full_df(query_str):
    """Get the original row index from the first-5000-row batch."""
    matches = df[df["query"] == query_str]
    if len(matches) > 0:
        return matches.index[0]
    return -1

def word_overlap(text_a, text_b):
    """Fraction of ground-truth words that appear in retrieved text."""
    a_words = set(w for w in text_a.split() if len(w) > 2)
    b_words = set(w for w in text_b.split() if len(w) > 2)
    if not a_words:
        return 0.0
    return len(a_words & b_words) / len(a_words)

# Build lookup: query -> row data from the validation sample
query_to_row = {}
for idx, row in sample.iterrows():
    query_to_row[str(row["query"])] = (idx, row)

# Strategy names (row_index % 4 from corrected_indexer.py)
STRATEGIES = ["metadata_aware", "semantic", "fixed_overlap", "hybrid"]

absent_count  = 0
present_count = 0
absent_list   = []
present_list  = []

for q in INCORRECT_QUERIES:
    if q not in query_to_row:
        log(f"[WARN] Query not found in sample: {q}")
        continue

    sample_idx, row = query_to_row[q]
    gt_passage = get_ground_truth(row["passages"])
    row_index_in_batch = get_row_index_in_full_df(q)
    strategy   = STRATEGIES[row_index_in_batch % 4] if row_index_in_batch >= 0 else "unknown"

    if not gt_passage:
        log(f"[SKIP] No GT passage for: {q}")
        continue

    log(f"\nQ: {q}")
    log(f"  GT passage ({len(gt_passage)} chars): {gt_passage[:120]}...")
    log(f"  Row index in batch: {row_index_in_batch} | Chunking strategy (idx%4): {strategy}")

    # Method 1: Embed GT passage → vector search → check top-10 similarity
    gt_vec  = embedder.encode(gt_passage).tolist()
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=gt_vec,
        limit=10,
        with_payload=True
    ).points

    # Also embed the query and check top-10
    q_vec     = embedder.encode(q).tolist()
    q_results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=q_vec,
        limit=10,
        with_payload=True
    ).points

    # Check if any top-10 GT-vector result is a near-match
    gt_search_best_score  = results[0].score  if results  else 0.0
    gt_search_best_text   = results[0].payload.get("text","") if results else ""
    gt_overlap_in_top10   = max(word_overlap(gt_passage, r.payload.get("text","")) for r in results) if results else 0.0

    # Check word overlap of GT passage against the query-vector top-10 results
    q_search_overlap      = max(word_overlap(gt_passage, r.payload.get("text","")) for r in q_results) if q_results else 0.0
    q_search_best_score   = q_results[0].score if q_results else 0.0

    # Decision: if GT-vector search returns cosine >= threshold OR word overlap >= 0.50 → PRESENT
    in_index = gt_search_best_score >= SIMILARITY_THRESHOLD or gt_overlap_in_top10 >= 0.50

    log(f"  GT-vec top-1 cosine: {gt_search_best_score:.3f} | GT word overlap in GT-top10: {gt_overlap_in_top10:.2f}")
    log(f"  Q-vec top-1 cosine : {q_search_best_score:.3f} | GT word overlap in Q-top10:  {q_search_overlap:.2f}")

    if in_index:
        verdict = "PRESENT_IN_INDEX_BUT_NOT_RETRIEVED"
        present_count += 1
        present_list.append({
            "query": q,
            "strategy": strategy,
            "gt_vec_cosine": gt_search_best_score,
            "gt_word_overlap": gt_overlap_in_top10,
            "q_top1_cosine": q_search_best_score,
            "best_retrieved_text": gt_search_best_text[:150],
        })
    else:
        verdict = "COMPLETELY_ABSENT_FROM_INDEX"
        absent_count += 1
        absent_list.append({"query": q, "strategy": strategy})

    log(f"  >>> {verdict}")
    time.sleep(0.1)  # rate-limit

# Summary
log("\n" + "=" * 90)
log("SUMMARY")
log("=" * 90)
log(f"  ABSENT from index (expected — answer simply not indexed): {absent_count}/17")
log(f"  PRESENT in index but NOT retrieved (retrieval quality issue): {present_count}/17")

log("\n--- COMPLETELY ABSENT (acceptable failures) ---")
for item in absent_list:
    log(f"  [{item['strategy']:>16}]  {item['query']}")

log("\n--- PRESENT BUT NOT RETRIEVED (retrieval quality failures) ---")
for item in present_list:
    log(f"  [{item['strategy']:>16}]  Query: {item['query']}")
    log(f"                    GT-cosine: {item['gt_vec_cosine']:.3f} | Word overlap: {item['gt_word_overlap']:.2f} | Q-top1: {item['q_top1_cosine']:.3f}")
    log(f"                    Best match: {item['best_retrieved_text']}...")
    log()

# Strategy breakdown for Y (present-but-not-retrieved)
if present_list:
    log("--- Strategy breakdown for retrieval failures ---")
    from collections import Counter
    strat_counts = Counter(item['strategy'] for item in present_list)
    for s, c in strat_counts.most_common():
        log(f"  {s:<20}: {c} failure(s)")

out.close()
print(f"Done. Results written to {OUT_FILE}")
