import json
import time
from api import process_retrieve, QueryRequest

def test_fast_path():
    try:
        with open("val_cache.json", "r", encoding="utf-8") as f:
            cache = json.load(f)
    except FileNotFoundError:
        print("val_cache.json not found.")
        return

    queries = list(cache.keys())[:10]
    results = []
    results.append(f"{'Query (Truncated)':<30} | {'Latency (ms)':<15} | {'Status'}")
    results.append("-" * 65)
    
    for q in queries:
        req = QueryRequest(transcript=q)
        start = time.time()
        res = process_retrieve(req)
        elapsed = round((time.time() - start) * 1000, 2)
        latency = res.get("retrieval_latency_ms", elapsed)
        has_answer = "UNANSWERABLE" not in res.get("synthesized_answer", "")
        # replace newlines in query to avoid breaking table
        q_clean = q.replace('\n', ' ')
        results.append(f"{q_clean[:30]:<30} | {latency:<15.2f} | {'ANSWERED' if has_answer else 'UNANSWERABLE'}")

    with open("timing_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(results))

if __name__ == "__main__":
    test_fast_path()
