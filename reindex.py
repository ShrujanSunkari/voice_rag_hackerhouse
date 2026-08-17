import os, sys, io, uuid, time
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct, Distance, VectorParams
from fastembed import TextEmbedding
from fastembed.common.model_description import PoolingType, ModelSource
from datasets import load_dataset

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
load_dotenv()

QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
NEW_COLLECTION = "rag_e5_collection"
VECTOR_DIM = 384
BATCH_SIZE = 100

print("Connecting to Qdrant...")
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60)

# Create collection if it doesn't exist
existing = [c.name for c in client.get_collections().collections]
if NEW_COLLECTION not in existing:
    print(f"Creating new collection '{NEW_COLLECTION}'...")
    client.create_collection(
        collection_name=NEW_COLLECTION,
        vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
    )
else:
    print(f"Collection '{NEW_COLLECTION}' already exists.")

print("Loading local ONNX embedder (fastembed)...")
TextEmbedding.add_custom_model(
    model="intfloat/multilingual-e5-small",
    pooling=PoolingType.MEAN,
    normalization=True,
    sources=ModelSource(hf="intfloat/multilingual-e5-small"),
    dim=VECTOR_DIM,
    model_file="onnx/model.onnx"
)
embedder = TextEmbedding(model_name="intfloat/multilingual-e5-small")

def get_selected_passage(passages_obj):
    if not isinstance(passages_obj, dict): return None
    trans = passages_obj.get("Translated_passages", passages_obj.get("passage_text", []))
    selected = passages_obj.get("is_selected", [])
    try:
        t_list = list(trans)
        s_list = list(selected)
    except: return None
    for i, s in enumerate(s_list):
        if s == 1 and i < len(t_list):
            txt = str(t_list[i]).strip()
            if len(txt) > 0: return txt
    return None

print("Streaming dataset...")
dataset = load_dataset("sarvamai/hintrain", split="train", streaming=True)

points_batch = []
total_indexed = 0
MAX_DOCS = 1000 # Adjust this if you want the full dataset

for idx, item in enumerate(dataset):
    if idx >= MAX_DOCS:
        break
        
    doc_id = item.get("query_id", str(uuid.uuid4()))
    raw_text = get_selected_passage(item.get("passages"))
    
    if not raw_text or len(raw_text.split()) < 8:
        continue

    # TASK 2: Prepend the "passage: " prefix required by e5-small
    formatted_text = f"passage: {raw_text}"
    
    # Embed the chunk
    vector = list(embedder.embed([formatted_text]))[0].tolist()
    
    payload = {
        "text": raw_text, # Store the raw text without prefix for the frontend!
        "query": item.get("query", ""),
        "doc_id": doc_id
    }
    
    point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{doc_id}_{idx}"))
    points_batch.append(PointStruct(id=point_id, vector=vector, payload=payload))
    
    if len(points_batch) >= BATCH_SIZE:
        client.upsert(collection_name=NEW_COLLECTION, points=points_batch)
        total_indexed += len(points_batch)
        print(f"Indexed {total_indexed} passages...")
        points_batch = []

if points_batch:
    client.upsert(collection_name=NEW_COLLECTION, points=points_batch)
    total_indexed += len(points_batch)

print(f"Done! Successfully reindexed {total_indexed} passages into '{NEW_COLLECTION}'.")
