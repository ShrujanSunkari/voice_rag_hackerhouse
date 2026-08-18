import json
from api import process_retrieve, QueryRequest

def count_refusals():
    with open("real_queries.json", "r", encoding="utf-8") as f:
        queries = json.load(f)[:100]
        
    refusals = 0
    for q in queries:
        req = QueryRequest(transcript=q)
        res = process_retrieve(req)
        ans = res.get("synthesized_answer", "")
        if "UNANSWERABLE" in ans or "क्षमा करें" in ans:
            refusals += 1
            
    print(f"Refusals: {refusals} out of {len(queries)}")

if __name__ == "__main__":
    count_refusals()
