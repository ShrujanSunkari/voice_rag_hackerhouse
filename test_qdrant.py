import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

QDRANT_URL = "https://a0441c7c-5f39-4170-961b-e64c0ef95fe5.us-west-1-0.aws.cloud.qdrant.io:6333"
QDRANT_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6YjhmZDY3ZjEtODE4Mi00NDkwLWIyOWUtMDQ0MThlZmE1M2VhIn0.gTT_CXAjS7fLwLJYYn-F6JYR-SjMXd5kfB4kOKqtpeE"
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
