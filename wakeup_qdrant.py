import os
from qdrant_client import QdrantClient
from dotenv import load_dotenv

load_dotenv()
qdrant_client = QdrantClient(
    url=os.environ.get("QDRANT_URL"), 
    api_key=os.environ.get("QDRANT_API_KEY"), 
    prefer_grpc=True,
    timeout=60
)
print("Waking up Qdrant...")
try:
    print(qdrant_client.get_collections())
    print("Qdrant is awake!")
except Exception as e:
    print(f"Error: {e}")
