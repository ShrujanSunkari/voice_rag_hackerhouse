import time
from api import process_retrieve, QueryRequest

gibberish_queries = [
    "asdfjklqwertyuiopzxcvbnm",
    "994857394857xxyyzz gibberish",
    "असंभव बकवास शब्द कोई अर्थ नहीं",
    "zzzyyyxxx1234567890",
    "sdofjisodjfisodfjiosdjfiosdjf",
    "completely unrelated non existent topic about aliens eating purple hats"
]

def check_refusal_latencies():
    print(f"{'Query (Truncated)':<30} | {'Latency (ms)':<15} | {'Status'}")
    print("-" * 75)
    
    # Warmup
    _ = process_retrieve(QueryRequest(transcript="warmup"))
    
    results = []
    for q in gibberish_queries:
        req = QueryRequest(transcript=q)
        start = time.time()
        res = process_retrieve(req)
        latency = round((time.time() - start) * 1000, 2)
        
        ans = res.get("synthesized_answer", "")
        # The exact refusal string from api.py is "क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली"
        status = "REFUSED" if "क्षमा करें" in ans else "ANSWERED"
        
        q_clean = q.replace('\n', ' ')
        results.append(f"{q_clean[:30]:<30} | {latency:<15.2f} | {status}")
        
    with open("refusal_latencies_actual.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(results))

if __name__ == "__main__":
    check_refusal_latencies()
