import time
from api import process_retrieve, QueryRequest

refusal_queries = [
    "को है बोलिवर, टी.एन.",
    "हम जनगणना ब्यूरो संख्या हैं",
    "क्या आप बांग्ला नामक भाषा बोल सकते हैं?",
    "एम्यूएड होम्योपैथिक क्या है?",
    "कौन सी काउंटी आर्डेन एन.सी. है",
    "कौन सी काउंटी बेलमोंट सीए है"
]

def check_refusal_latencies():
    print(f"{'Query (Truncated)':<30} | {'Latency (ms)':<15} | {'Status'}")
    print("-" * 75)
    
    # Warmup
    _ = process_retrieve(QueryRequest(transcript="warmup"))
    
    results = []
    for q in refusal_queries:
        req = QueryRequest(transcript=q)
        start = time.time()
        res = process_retrieve(req)
        latency = round((time.time() - start) * 1000, 2)
        
        ans = res.get("synthesized_answer", "")
        status = "REFUSED" if "UNANSWERABLE" in ans or "क्षमा करें" in ans else "ANSWERED"
        
        q_clean = q.replace('\n', ' ')
        results.append(f"{q_clean[:30]:<30} | {latency:<15.2f} | {status}")
        
    with open("forced_refusals.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(results))

if __name__ == "__main__":
    check_refusal_latencies()
