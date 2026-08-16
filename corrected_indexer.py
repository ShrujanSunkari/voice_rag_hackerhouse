"""
LEGACY: Kept for audit trail only.
This script references test collections (echo_sight_hindi_test) and has been superseded by full-scale indexing configurations documented in DATA_PROVENANCE.md.
"""
"""
corrected_indexer.py  –  Fixed offline indexer
================================================
Fixes vs original offline_indexer.py:
  1. Filters to ONLY the is_selected==1 passage per row (not passage[0])
  2. Skips rows with no selected passage
  3. Streams directly from HF (works even without full local parquet)
  4. Genuinely distinct chunking strategies:
     - metadata_aware : full passage + all metadata fields attached
     - semantic       : split on sentence boundaries (।/. boundaries in Hindi)
     - fixed_overlap  : sliding-window with configurable word window + overlap
     - hybrid         : query prepended to passage (query-contextualised chunk)
  5. Minimum length filter: skip chunks under MIN_CHUNK_WORDS words
  6. Indexes into a NEW test collection (echo_sight_hindi_test) for validation
     before any overwrite of the production collection
"""
import os, sys, io, uuid, json, datetime, argparse, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    PointStruct, Distance, VectorParams, CreateCollection
)
from dotenv import load_dotenv

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────
QDRANT_URL      = "https://a0441c7c-5f39-4170-961b-e64c0ef95fe5.us-west-1-0.aws.cloud.qdrant.io:6333"
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
TEST_COLLECTION = "echo_sight_hindi_test_v2"   # ← never touches production collection
PROD_COLLECTION = "echo_sight_hindi"
HF_VALIDATION   = "https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/validation/hinval.parquet"
HF_TRAIN        = "https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/train/hintrain.parquet"
MIN_CHUNK_WORDS = 8   # discard chunks shorter than this
BATCH_SIZE      = 50
VECTOR_DIM      = 384

# ─── Parse args ───────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--strategy", choices=["metadata_aware","semantic","fixed_overlap","hybrid","all"],
                    default="all", help="Chunking strategy")
parser.add_argument("--limit",    type=int, default=500,
                    help="Max rows to index (use 500-1000 for test run)")
parser.add_argument("--split",    choices=["train","validation"], default="validation",
                    help="Which HF split to use (validation is smaller, faster for testing)")
parser.add_argument("--recreate", action="store_true",
                    help="Drop and recreate the test collection before indexing")
args = parser.parse_args()

strategies = ["metadata_aware","semantic","fixed_overlap","hybrid"] \
             if args.strategy == "all" else [args.strategy]

# ─── Clients ──────────────────────────────────────────────────────────────────
print("Loading embedding model...")
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
print("Connecting to Qdrant...")
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

# ─── Ensure test collection exists ────────────────────────────────────────────
existing = [c.name for c in client.get_collections().collections]
if TEST_COLLECTION in existing and args.recreate:
    print(f"Dropping existing '{TEST_COLLECTION}'...")
    client.delete_collection(TEST_COLLECTION)
    existing.remove(TEST_COLLECTION)

if TEST_COLLECTION not in existing:
    print(f"Creating collection '{TEST_COLLECTION}'...")
    client.create_collection(
        collection_name=TEST_COLLECTION,
        vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
    )
    print("Collection created.")
else:
    info = client.get_collection(TEST_COLLECTION)
    print(f"Collection '{TEST_COLLECTION}' exists ({info.points_count:,} points). Upserting.")

# ─── Load dataset ─────────────────────────────────────────────────────────────
src_url = HF_VALIDATION if args.split == "validation" else HF_TRAIN
print(f"\nLoading {args.split} split from HF ({args.limit} rows)...")
df = pd.read_parquet(src_url, columns=["query_id","query","passages"])
print(f"Total rows available: {len(df):,}")

# ─── Helper: extract is_selected==1 passage ───────────────────────────────────
def get_selected_passage(passages_obj):
    """Returns (text, passage_index) for the first is_selected==1 passage.
    Returns (None, None) if no selected passage found."""
    if not isinstance(passages_obj, dict):
        return None, None
    trans    = passages_obj.get("Translated_passages", passages_obj.get("passage_text", []))
    selected = passages_obj.get("is_selected", [])
    try:
        trans_list = list(trans)
        sel_list   = list(selected)
    except Exception:
        return None, None
    for idx, s in enumerate(sel_list):
        if s == 1 and idx < len(trans_list):
            text = str(trans_list[idx]).strip()
            if len(text) > 0:
                return text, idx
    return None, None

# ─── Chunking strategies ──────────────────────────────────────────────────────
def _valid(text):
    """True if chunk meets minimum word-count threshold."""
    return len(text.split()) >= MIN_CHUNK_WORDS

def chunk_metadata_aware(doc_id, passage_text, query, meta):
    """Single chunk: full passage with all metadata baked into the text prefix."""
    enriched = f"[Query: {query}] [DocID: {doc_id}] {passage_text}"
    if not _valid(enriched):
        return []
    return [{
        "chunk_id": f"{doc_id}_meta",
        "text": enriched,
        "strategy": "metadata_aware",
        **meta
    }]

def chunk_semantic(doc_id, passage_text, query, meta):
    """Split on sentence boundaries (।  .  ?  !) giving genuine sentence chunks."""
    import re
    # Split on Hindi danda (।) and common punctuation
    raw_sentences = re.split(r'(?<=[।.?!])\s+', passage_text)
    chunks = []
    for i, sent in enumerate(raw_sentences):
        sent = sent.strip()
        if not sent or not _valid(sent):
            continue
        chunks.append({
            "chunk_id": f"{doc_id}_sem_{i}",
            "text": sent,
            "strategy": "semantic",
            **meta
        })
    # If no sentence boundary found, fall back to full passage
    if not chunks and _valid(passage_text):
        chunks.append({
            "chunk_id": f"{doc_id}_sem_0",
            "text": passage_text,
            "strategy": "semantic",
            **meta
        })
    return chunks

def chunk_fixed_overlap(doc_id, passage_text, query, meta, window=40, overlap=10):
    """Sliding window over words with real overlap (window=40, overlap=10 by default)."""
    words = passage_text.split()
    step  = window - overlap
    chunks = []
    i = 0
    seg = 0
    while i < len(words):
        chunk_words = words[i:i + window]
        text = " ".join(chunk_words)
        if _valid(text):
            chunks.append({
                "chunk_id": f"{doc_id}_fw_{seg}",
                "text": text,
                "strategy": "fixed_overlap",
                **meta
            })
        i += step
        seg += 1
    return chunks

def chunk_hybrid(doc_id, passage_text, query, meta):
    """Query-contextualised chunk: prepend the original query for query-biased retrieval."""
    text = f"{query} — {passage_text}"
    if not _valid(text):
        return []
    return [{
        "chunk_id": f"{doc_id}_hyb",
        "text": text,
        "strategy": "hybrid",
        **meta
    }]

STRATEGY_FN = {
    "metadata_aware": chunk_metadata_aware,
    "semantic":       chunk_semantic,
    "fixed_overlap":  chunk_fixed_overlap,
    "hybrid":         chunk_hybrid,
}

# ─── Main indexing loop ───────────────────────────────────────────────────────
print(f"\nStrategies : {strategies}")
print(f"Row limit  : {args.limit}")
print(f"Collection : {TEST_COLLECTION}\n")

rows_processed   = 0
rows_skipped     = 0
total_chunks     = 0
strategy_counts  = {s: 0 for s in strategies}

pending_points   = []

def flush(pending):
    if not pending:
        return
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i:i+BATCH_SIZE]
        client.upsert(collection_name=TEST_COLLECTION, points=batch)
    pending.clear()

sample_df = df.sample(min(args.limit, len(df)), random_state=42).reset_index(drop=True)

for idx, row in sample_df.iterrows():
    doc_id    = str(row.get("query_id", idx))
    query     = str(row["query"]).strip()
    passages  = row["passages"]

    passage_text, sel_idx = get_selected_passage(passages)
    if passage_text is None:
        rows_skipped += 1
        continue

    base_meta = {
        "doc_id":        doc_id,
        "language":      "hi",
        "source_split":  args.split,
        "passage_index": int(sel_idx) if sel_idx is not None else -1,
    }

    for strategy in strategies:
        fn = STRATEGY_FN[strategy]
        chunks = fn(doc_id, passage_text, query, base_meta)
        for chunk in chunks:
            text = chunk.pop("text")
            vector = embedder.encode(text, show_progress_bar=False).tolist()
            payload = {"text": text, **chunk}
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk["chunk_id"]))
            pending_points.append(PointStruct(id=point_id, vector=vector, payload=payload))
            strategy_counts[strategy] += 1
            total_chunks += 1

    rows_processed += 1

    # Flush every 200 chunks
    if len(pending_points) >= 200:
        flush(pending_points)
        print(f"  Flushed batch — rows: {rows_processed}/{args.limit}, chunks so far: {total_chunks}")

# Final flush
flush(pending_points)

# ─── Summary ──────────────────────────────────────────────────────────────────
final_info = client.get_collection(TEST_COLLECTION)
print(f"\n{'='*65}")
print(f"INDEXING COMPLETE")
print(f"{'='*65}")
print(f"  Rows processed : {rows_processed}")
print(f"  Rows skipped   : {rows_skipped} (no is_selected==1 passage)")
print(f"  Total chunks   : {total_chunks}")
for s, cnt in strategy_counts.items():
    print(f"    {s:<20}: {cnt} chunks")
print(f"  Collection '{TEST_COLLECTION}' point count: {final_info.points_count:,}")
print(f"{'='*65}")

# ─── Write manifest ───────────────────────────────────────────────────────────
manifest = {
    "timestamp":       datetime.datetime.now().isoformat(),
    "collection":      TEST_COLLECTION,
    "split":           args.split,
    "strategies":      strategies,
    "rows_processed":  rows_processed,
    "rows_skipped":    rows_skipped,
    "total_chunks":    total_chunks,
    "strategy_counts": strategy_counts,
}
with open("manifest_test.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=4)
print("Manifest written to manifest_test.json")
