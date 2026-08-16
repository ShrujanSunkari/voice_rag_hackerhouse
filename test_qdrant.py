# LEGACY: Kept for audit trail only.
# This script references deleted Qdrant collections and hardcoded testing keys.
import sys
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

QDRANT_URL = os.environ.get("QDRANT_URL")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
COLLECTION_NAME = "echo_sight_hindi"

client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
embedder = SentenceTransformer("all-MiniLM-L6-v2")

for q in ['What is granulated onion?', 'How much does a T-Rex weigh?', 'What is smudge?']:
    query_vector = embedder.encode(q).tolist()
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=1
    )
    for point in results.points:
        print(f"{q} -> Score: {point.score}, Context: {point.payload.get('text')[:100]}")
