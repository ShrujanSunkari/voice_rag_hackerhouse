import os
from dotenv import load_dotenv
load_dotenv()
from groq import Groq
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
models = client.models.list()
for m in models.data:
    print(m.id)
