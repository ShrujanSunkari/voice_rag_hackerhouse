import os
import sys
import time
import json
import csv
import datetime

# Fix Unicode output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from api import process_retrieve, QueryRequest

def get_percentile(data, p):
    if not data:
        return 0
    s_data = sorted(data)
    idx = int((len(s_data) - 1) * p / 100.0)
    return s_data[idx]

def format_eta(seconds):
    if seconds < 60:
        return f"{int(seconds)}s"
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}m{s}s"

def main():
    print("Loading 100 unique real queries from real_queries.json...")
    with open("real_queries.json", "r", encoding="utf-8") as f:
        queries = json.load(f)[:100]
        
    print(f"Using {len(queries)} unique queries for the benchmark.")
    
    # Warmup call
    _ = process_retrieve(QueryRequest(transcript="warmup"))

    latencies = []
    results = []
    
    total = len(queries)
    start_all = time.time()
    
    print(f"\n--- Running Fast-Path Benchmark ---")
    
    for i, query in enumerate(queries):
        start = time.time()
        
        req = QueryRequest(transcript=query)
        res = process_retrieve(req)
        
        latency = round((time.time() - start) * 1000, 2)
        latencies.append(latency)
        
        results.append({
            "query": query,
            "fast_path_latency_ms": latency
        })
        
        elapsed = time.time() - start_all
        avg = elapsed / (i + 1)
        remaining = avg * (total - i - 1)
        if (i + 1) % 10 == 0 or i == 0:
            print(f"[{i+1}/{total}] {latency}ms | elapsed: {format_eta(elapsed)} | ETA: {format_eta(remaining)}")
    
    p50 = get_percentile(latencies, 50)
    p70 = get_percentile(latencies, 70)
    p100 = get_percentile(latencies, 100)
    
    timestamp = datetime.datetime.now().isoformat()
    
    # Save CSV
    csv_file = "latency_results_fastpath.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["query", "fast_path_latency_ms"])
        writer.writeheader()
        for r in results:
            writer.writerow(r)
            
    # Save JSON Summary
    summary = {
        "timestamp": timestamp,
        "num_queries": len(queries),
        "target_ms": 200,
        "fast_path_metrics": {
            "P50": p50,
            "P70": p70,
            "P100": p100
        }
    }
    json_file = "latency_summary_fastpath.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=4)
        
    print(f"\nSaved raw latencies to {csv_file}")
    print(f"Saved summary to {json_file}")
    
    print("\n" + "="*60)
    print("FAST-PATH LATENCY BENCHMARK SUMMARY")
    print("="*60)
    print(f"Total Queries: {len(queries)}")
    print(f"P50 Latency:   {p50:.2f} ms")
    print(f"P70 Latency:   {p70:.2f} ms")
    print(f"P100 Latency:  {p100:.2f} ms")
    print("="*60)

if __name__ == "__main__":
    main()
