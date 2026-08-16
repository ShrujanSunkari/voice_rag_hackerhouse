# LEGACY: Kept for audit trail only.
# This script references deleted Qdrant collections.
# Superseded by corrected_indexer.py and full-scale indexing configurations documented in DATA_PROVENANCE.md.
import os
import json
import argparse
import uuid
import datetime
import pandas as pd
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct
from dotenv import load_dotenv

load_dotenv()

# 1. Setup argparse
parser = argparse.ArgumentParser(description="Offline Indexer for Qdrant")
parser.add_argument("--strategy", type=str, choices=["metadata", "semantic", "fixed_overlap", "hybrid"], required=True, help="Chunking strategy to use")
parser.add_argument("--limit", type=int, default=50, help="Number of rows to process from parquet file")
args = parser.parse_args()

# 2. Setup Qdrant and Embedding Model
print("Initializing Embedding Model and QdrantClient...")
embedder = SentenceTransformer('all-MiniLM-L6-v2')

QDRANT_URL = "https://a0441c7c-5f39-4170-961b-e64c0ef95fe5.us-west-1-0.aws.cloud.qdrant.io:6333"
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
collection_name = "echo_sight_hindi"

qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

# 3. Load Parquet Data
print(f"Loading data from hintrain.parquet (limit={args.limit})...")
df = pd.read_parquet('hintrain.parquet')
sample_data = df.head(args.limit)

# 4. The 4 Required Chunking Strategies
def chunk_metadata(doc_id, text, metadata):
    return [{"chunk_id": f"{doc_id}_meta", "text": text, "strategy": "metadata", **metadata}]

def chunk_semantic(doc_id, text, metadata):
    sentences = [s.strip() + "।" for s in text.replace(".", "।").split("।") if s.strip()]
    return [{"chunk_id": f"{doc_id}_sem_{i}", "text": s, "strategy": "semantic", **metadata} for i, s in enumerate(sentences)]

def chunk_fixed_overlap(doc_id, text, metadata, window=30, overlap=5):
    # Using larger window than 10 words for practical use, though logic remains same
    words = text.split()
    chunks = []
    for i in range(0, len(words), window - overlap):
        chunk_text = " ".join(words[i:i + window])
        if chunk_text:
            chunks.append({"chunk_id": f"{doc_id}_fixed_{i}", "text": chunk_text, "strategy": "fixed_overlap", **metadata})
    return chunks

def chunk_hybrid(doc_id, text, query, metadata):
    hybrid_text = f"Query Context: {query} | Passage: {text}"
    return [{"chunk_id": f"{doc_id}_hyb", "text": hybrid_text, "strategy": "hybrid", **metadata}]

# 5. Process and Extract Chunks
points = []
print(f"Applying '{args.strategy}' chunking strategy...")

for _, row in sample_data.iterrows():
    doc_id = str(row['query_id'])
    query = str(row['query'])
    # Extract passages correctly
    passages_obj = row['passages']
    passage_text = ""
    if isinstance(passages_obj, dict) and 'Translated_passages' in passages_obj:
        translated = passages_obj['Translated_passages']
        if len(translated) > 0:
            passage_text = " ".join([str(t) for t in translated])
    else:
        passage_text = str(passages_obj)
        
    if not passage_text.strip():
        continue
    
    base_meta = {"doc_id": doc_id, "language": "hi"}
    
    chunks = []
    if args.strategy == "metadata":
        chunks = chunk_metadata(doc_id, passage_text, base_meta)
    elif args.strategy == "semantic":
        chunks = chunk_semantic(doc_id, passage_text, base_meta)
    elif args.strategy == "fixed_overlap":
        chunks = chunk_fixed_overlap(doc_id, passage_text, base_meta)
    elif args.strategy == "hybrid":
        chunks = chunk_hybrid(doc_id, passage_text, query, base_meta)
    
    for chunk in chunks:
        # Generate a deterministic UUID based on chunk_id so we overwrite existing chunks instead of duplicating
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk['chunk_id']))
        text = chunk.pop('text')
        
        # Embed the text
        vector = embedder.encode(text).tolist()
        
        # Prepare payload
        payload = {"text": text, **chunk}
        
        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

# 6. Embed and Index
print(f"Uploading {len(points)} chunks into Qdrant collection '{collection_name}'...")
if points:
    # Upload in batches
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        qdrant_client.upsert(
            collection_name=collection_name,
            points=batch
        )

# 7. Write Manifest
manifest = {
    "timestamp": datetime.datetime.now().isoformat(),
    "strategy": args.strategy,
    "rows_processed": len(sample_data),
    "chunks_created": len(points),
    "collection": collection_name
}
with open("manifest.json", "w") as f:
    json.dump(manifest, f, indent=4)

print("Offline indexing complete! Manifest saved to manifest.json")