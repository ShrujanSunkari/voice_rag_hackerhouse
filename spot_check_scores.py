"""
spot_check_scores.py
====================
Calls /api/retrieve for 10 real queries and verifies:
1. Returned shard scores are real, distinct, non-formulaic Qdrant values
2. Latency is comfortably under 200ms
"""
import sys, time, json, requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

QUERIES = [
    "व्यवसाय प्रक्रिया प्रबंधन क्या है",
    "नकारात्मक प्रतिक्रिया हृदय गति को कैसे नियंत्रित करती है",
    "खाने के बाद एक व्यक्ति को इतनी नींद क्यों आती है",
    "कोयला कौन सा रंग है",
    "किरायेदार बीमा फ्लोरिडा की कीमतें",
    "रेनाटा नाम का अर्थ है",
    "टाइम टू चार्ज कैपेसिटर इन फ्लैशलाइट में",
    "शोध समन्वयक के लिए वेतन सीमा",
    "कौन सी काउंटी बेलमोंट सीए है",
    "यदि आप अंतरराज्यीय सड़क पर धीमी गति से गाड़ी चला रहे हैं",
]

URL = "http://127.0.0.1:8000/api/retrieve"

print(f"{'Q':>3} | {'Latency (ms)':>13} | {'Top-1 Score':>11} | {'Shard Count':>11} | {'Scores (all shards)' }")
print("-" * 90)

results = []
for i, query in enumerate(QUERIES, 1):
    t0 = time.perf_counter()
    try:
        resp = requests.post(URL, json={"transcript": query}, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"{i:>3} | ERROR: {e}")
        continue
    elapsed_ms = (time.perf_counter() - t0) * 1000

    data = resp.json()
    latency_reported = data.get("retrieval_latency_ms", 0)
    shards = data.get("evidence_shards", [])

    # Check scores
    scores = []
    for s in shards:
        if isinstance(s, dict):
            scores.append(s.get("score", None))
        else:
            scores.append("NO_SCORE")

    top_score = scores[0] if scores else "N/A"
    scores_str = ", ".join(f"{sc:.4f}" for sc in scores[:4] if isinstance(sc, float))
    if len(scores) > 4:
        scores_str += f" ... (+{len(scores)-4})"

    status = "✅" if elapsed_ms < 200 else "❌"
    print(f"{i:>3} | {elapsed_ms:>11.1f}ms {status} | {str(top_score):>11} | {len(shards):>11} | {scores_str}")
    results.append({
        "q": i,
        "latency_ms": round(elapsed_ms, 1),
        "shard_count": len(shards),
        "scores": scores,
        "all_under_200": elapsed_ms < 200,
    })

# Verification checks
print()
all_real_scores = all(
    isinstance(s, float) and s > 0
    for r in results
    for s in r["scores"]
)
formulaic = all(
    abs(r["scores"][j] - (0.94 - j * 0.06)) < 0.001
    for r in results if len(r["scores"]) >= 2
    for j in range(min(2, len(r["scores"])))
)
all_fast = all(r["latency_ms"] < 200 for r in results)
distinct = all(
    len(set(round(s, 4) for s in r["scores"])) > 1
    for r in results if len(r["scores"]) > 1
)

print("=== VERIFICATION ===")
print(f"  All scores real floats (> 0):      {'✅ YES' if all_real_scores else '❌ NO'}")
print(f"  Scores NOT formulaic (0.94-i*0.06):{'✅ YES' if not formulaic else '❌ STILL FORMULAIC'}")
print(f"  Scores distinct within each query: {'✅ YES' if distinct else '❌ NO'}")
print(f"  All latencies < 200 ms:            {'✅ YES' if all_fast else '❌ NO'}")
latencies = [r["latency_ms"] for r in results]
print(f"  Latency range: {min(latencies):.1f}ms – {max(latencies):.1f}ms")
print(f"  Latency median: {sorted(latencies)[len(latencies)//2]:.1f}ms")
