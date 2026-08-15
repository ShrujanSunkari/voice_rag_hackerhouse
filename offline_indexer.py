import os
import chromadb
from sentence_transformers import SentenceTransformer

# 1. Setup ChromaDB and Embedding Model
print("Initializing Embedding Model and ChromaDB...")
embedder = SentenceTransformer('all-MiniLM-L6-v2')
chroma_client = chromadb.PersistentClient(path="./chroma_db")

collection_name = "msmarco_indic_chunks"
try:
    chroma_client.delete_collection(name=collection_name)
except:
    pass
collection = chroma_client.create_collection(name=collection_name)

# 2. Local Sample Data (Simulating Hindi MSMARCO data for hackathon speed)
sample_data = [
    {"query_id": "q1", "query": "भारत की राजधानी क्या है?", "passage": "नई दिल्ली भारत की राजधानी है और यह यमुना नदी के किनारे स्थित है।"},
    {"query_id": "q2", "query": "कृषि का महत्व क्या है?", "passage": "भारत एक कृषि प्रधान देश है जहाँ Sउपनिवेशिक काल से ही खेती मुख्य व्यवसाय रहा है।"},
    {"query_id": "q3", "query": "विज्ञान और प्रौद्योगिकी", "passage": "आधुनिक युग में तकनीकी विकास तेजी से हो रहा है जिसमें कृत्रिम बुद्धिमत्ता मुख्य है।"}
]

# 3. The 4 Required Chunking Strategies
def chunk_metadata(doc_id, text, metadata):
    return [{"chunk_id": f"{doc_id}_meta", "text": text, "strategy": "metadata", **metadata}]

def chunk_semantic(doc_id, text, metadata):
    sentences = [s.strip() + "।" for s in text.replace(".", "।").split("।") if s.strip()]
    return [{"chunk_id": f"{doc_id}_sem_{i}", "text": s, "strategy": "semantic", **metadata} for i, s in enumerate(sentences)]

def chunk_fixed_overlap(doc_id, text, metadata, window=10, overlap=2):
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

# 4. Process and Extract Chunks
documents = []
metadatas = []
ids = []

print("Applying 4 chunking strategies...")
for row in sample_data:
    doc_id = row['query_id']
    query = row['query']
    passage_text = row['passage']
    
    base_meta = {"docId": doc_id, "language": "hi"}
    
    all_chunks = []
    all_chunks.extend(chunk_metadata(doc_id, passage_text, base_meta))
    all_chunks.extend(chunk_semantic(doc_id, passage_text, base_meta))
    all_chunks.extend(chunk_fixed_overlap(doc_id, passage_text, base_meta))
    all_chunks.extend(chunk_hybrid(doc_id, passage_text, query, base_meta))
    
    for chunk in all_chunks:
        ids.append(chunk['chunk_id'])
        documents.append(chunk['text'])
        clean_meta = {k: v for k, v in chunk.items() if k not in ['chunk_id', 'text'] and v is not None}
        metadatas.append(clean_meta)

# 5. Embed and Index
print(f"Embedding and indexing {len(ids)} chunks into ChromaDB...")
collection.add(
    documents=documents,
    metadatas=metadatas,
    ids=ids
)

print("✅ Offline indexing complete! Database saved to ./chroma_db")