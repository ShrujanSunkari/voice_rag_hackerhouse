"""
LEGACY: Kept for audit trail only.
This script references deleted Qdrant collections (echo_sight_hindi_v2).
Superseded by corrected_indexer.py and configurations documented in DATA_PROVENANCE.md.
"""
"""
full_indexer.py – Production Full-Scale Indexer
===============================================
- Streams the FULL hintrain dataset using HF datasets streaming.
- Filters to ONLY is_selected==1.
- Uses paraphrase-multilingual-MiniLM-L12-v2 for proper Hindi embeddings.
- Indexes into `echo_sight_hindi_v2`.
- Flushes in robust batches.
- Handles exceptions and flushes on error.
"""
import os, sys, io, uuid, json, datetime, gc, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, Distance, VectorParams
from sentence_transformers import SentenceTransformer
from datasets import load_dataset

QDRANT_URL      = "https://a0441c7c-5f39-4170-961b-e64c0ef95fe5.us-west-1-0.aws.cloud.qdrant.io:6333"
QDRANT_API_KEY  = os.environ.get("QDRANT_API_KEY")
PROD_COLLECTION = "echo_sight_hindi_v2"
MIN_CHUNK_WORDS = 8
BATCH_SIZE      = 200
VECTOR_DIM      = 384
MAX_RETRIES     = 3

print("Loading embedding model...")
embedder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
print("Connecting to Qdrant...")
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60)

# Create collection if it doesn't exist
existing = [c.name for c in client.get_collections().collections]
if PROD_COLLECTION not in existing:
    print(f"Creating collection '{PROD_COLLECTION}'...")
    client.create_collection(
        collection_name=PROD_COLLECTION,
        vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
    )
else:
    info = client.get_collection(PROD_COLLECTION)
    print(f"Collection '{PROD_COLLECTION}' already exists with {info.points_count:,} points.")

def get_selected_passage(passages_obj):
    if not isinstance(passages_obj, dict): return None, None
    trans = passages_obj.get("Translated_passages", passages_obj.get("passage_text", []))
    selected = passages_obj.get("is_selected", [])
    try:
        t_list = list(trans)
        s_list = list(selected)
    except: return None, None
    for i, s in enumerate(s_list):
        if s == 1 and i < len(t_list):
            txt = str(t_list[i]).strip()
            if len(txt) > 0: return txt, i
    return None, None

def _valid(text): return len(text.split()) >= MIN_CHUNK_WORDS

def chunk_metadata_aware(doc_id, passage_text, query, meta):
    enriched = f"[Query: {query}] [DocID: {doc_id}] {passage_text}"
    if not _valid(enriched): return []
    return [{"chunk_id": f"{doc_id}_meta", "text": enriched, "strategy": "metadata_aware", **meta}]

def chunk_semantic(doc_id, passage_text, query, meta):
    import re
    raw_sentences = re.split(r'(?<=[।.?!])\s+', passage_text)
    chunks = []
    for i, sent in enumerate(raw_sentences):
        sent = sent.strip()
        if not sent or not _valid(sent): continue
        chunks.append({"chunk_id": f"{doc_id}_sem_{i}", "text": sent, "strategy": "semantic", **meta})
    if not chunks and _valid(passage_text):
        chunks.append({"chunk_id": f"{doc_id}_sem_0", "text": passage_text, "strategy": "semantic", **meta})
    return chunks

def chunk_fixed_overlap(doc_id, passage_text, query, meta, window=40, overlap=10):
    words = passage_text.split()
    step  = window - overlap
    chunks, i, seg = [], 0, 0
    while i < len(words):
        text = " ".join(words[i:i + window])
        if _valid(text):
            chunks.append({"chunk_id": f"{doc_id}_fw_{seg}", "text": text, "strategy": "fixed_overlap", **meta})
        i += step
        seg += 1
    return chunks

def chunk_hybrid(doc_id, passage_text, query, meta):
    text = f"{query} — {passage_text}"
    if not _valid(text): return []
    return [{"chunk_id": f"{doc_id}_hyb", "text": text, "strategy": "hybrid", **meta}]

strategies = ["metadata_aware","semantic","fixed_overlap","hybrid"]

pending_points = []
stats = {
    "rows_processed": 0,
    "rows_skipped": 0,
    "total_chunks": 0,
    "strategy_counts": {s:0 for s in strategies}
}

def flush_batch():
    global pending_points
    if not pending_points: return
    for attempt in range(MAX_RETRIES):
        try:
            client.upsert(collection_name=PROD_COLLECTION, points=pending_points)
            break
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                print(f"\nCRITICAL ERROR ON UPSERT: {e}")
                print("Emergency flush failed. Exiting.")
                sys.exit(1)
            time.sleep(2 ** attempt)
    pending_points.clear()
    gc.collect()

print(f"\nStarting streaming indexing for {PROD_COLLECTION}...")
# Stream the train split directly from the parquet file
dataset = load_dataset(
    "parquet", 
    data_files="https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/train/hintrain.parquet", 
    split="train", 
    streaming=True
)

start_time = time.time()
try:
    for row in dataset:
        doc_id = str(row.get("query_id", uuid.uuid4()))
        query = str(row.get("query", "")).strip()
        passages = row.get("passages", {})

        passage_text, sel_idx = get_selected_passage(passages)
        if passage_text is None:
            stats["rows_skipped"] += 1
            continue

        base_meta = {
            "doc_id": doc_id,
            "language": "hi",
            "source_split": "train",
            "passage_index": int(sel_idx)
        }

        all_chunks = []
        all_chunks.extend(chunk_metadata_aware(doc_id, passage_text, query, base_meta))
        all_chunks.extend(chunk_semantic(doc_id, passage_text, query, base_meta))
        all_chunks.extend(chunk_fixed_overlap(doc_id, passage_text, query, base_meta))
        all_chunks.extend(chunk_hybrid(doc_id, passage_text, query, base_meta))

        for chunk in all_chunks:
            text = chunk.pop("text")
            vector = embedder.encode(text, show_progress_bar=False).tolist()
            payload = {"text": text, **chunk}
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk["chunk_id"]))
            pending_points.append(PointStruct(id=point_id, vector=vector, payload=payload))
            stats["strategy_counts"][chunk["strategy"]] += 1
            stats["total_chunks"] += 1

        stats["rows_processed"] += 1

        if len(pending_points) >= BATCH_SIZE:
            flush_batch()
            elapsed = time.time() - start_time
            rate = stats["rows_processed"] / elapsed if elapsed > 0 else 0
            sys.stdout.write(f"\rRows: {stats['rows_processed']:,} | Skipped: {stats['rows_skipped']:,} | Chunks: {stats['total_chunks']:,} | Rate: {rate:.1f} rows/s")
            sys.stdout.flush()

except KeyboardInterrupt:
    print("\nInterrupted by user. Performing emergency flush...")
except Exception as e:
    print(f"\nUnhandled exception: {e}. Performing emergency flush...")

flush_batch()

print("\n\n" + "="*65)
print("FULL-SCALE INDEXING COMPLETE")
print("="*65)
print(f"  Rows processed : {stats['rows_processed']:,}")
print(f"  Rows skipped   : {stats['rows_skipped']:,}")
print(f"  Total chunks   : {stats['total_chunks']:,}")
for s, cnt in stats['strategy_counts'].items():
    print(f"    {s:<20}: {cnt:,} chunks")

final_info = client.get_collection(PROD_COLLECTION)
print(f"  Collection '{PROD_COLLECTION}' final point count: {final_info.points_count:,}")
print("="*65)
