import json
from api import process_retrieve, QueryRequest

def test_fast_path():
    try:
        with open("val_cache.json", "r", encoding="utf-8") as f:
            cache = json.load(f)
    except FileNotFoundError:
        print("val_cache.json not found.")
        return

    queries = list(cache.keys())[:1]
    
    for q in queries:
        req = QueryRequest(transcript=q)
        res = process_retrieve(req)
        ans = res.get("synthesized_answer", "")
        
        if "[Extractive Fast Answer]" in ans:
            print("FAILED: Placeholder text found!")
        elif "ENGLISH:" in ans:
            print("FAILED: ENGLISH: still in the answer!")
        else:
            print("SUCCESS: No placeholder text found. Only HINDI text returned.")

if __name__ == "__main__":
    test_fast_path()
