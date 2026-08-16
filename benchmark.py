import os
import sys
import time
import json
import csv
import datetime
import pandas as pd

# Fix Unicode output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Import from the refactored api.py
from api import retrieve_context, groq_generate_answer

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

def run_pass(name, queries, full_pipeline=False):
    latencies = []
    emb_latencies = []
    qd_latencies = []
    total = len(queries)
    start_all = time.time()
    
    print(f"\n--- Pass: {name} ({total} queries) ---")
    
    for i, query in enumerate(queries):
        start = time.time()
        
        search_result, timings = retrieve_context(query)
        
        if full_pipeline:
            if search_result and search_result[0].score >= 0.45:
                retrieved_shards = [hit.payload.get("text", "") for hit in search_result]
                context_text = "\n\n".join(retrieved_shards)
                try:
                    groq_generate_answer(context_text, query)
                except Exception:
                    pass
        
        latency = round((time.time() - start) * 1000, 2)
        latencies.append(latency)
        emb_latencies.append(timings["embedding_ms"])
        qd_latencies.append(timings["qdrant_network_ms"])
        
        elapsed = time.time() - start_all
        avg = elapsed / (i + 1)
        remaining = avg * (total - i - 1)
        print(f"[{i+1}/{total}] {latency}ms | elapsed: {format_eta(elapsed)} | ETA: {format_eta(remaining)}")
    
    return latencies, emb_latencies, qd_latencies

def main():
    print("Loading 100 unique real queries from real_queries.json...")
    with open("real_queries.json", "r", encoding="utf-8") as f:
        queries = json.load(f)
        
    print(f"Using {len(queries)} unique queries for the benchmark.")
    
    retrieval_latencies, embedding_latencies, qdrant_latencies = run_pass("Retrieval-Only", queries, full_pipeline=False)
    
    full_latencies, _, _ = run_pass("Full Pipeline", queries, full_pipeline=True)
    
    # Save raw results
    results = []
    for i, query in enumerate(queries):
        results.append({
            "query": query,
            "embedding_ms": embedding_latencies[i],
            "qdrant_network_ms": qdrant_latencies[i],
            "retrieval_total_ms": retrieval_latencies[i],
            "full_pipeline_latency_ms": full_latencies[i]
        })

    # Calculate percentiles
    emb_p50 = get_percentile(embedding_latencies, 50)
    emb_p70 = get_percentile(embedding_latencies, 70)
    emb_p100 = get_percentile(embedding_latencies, 100)

    qd_p50 = get_percentile(qdrant_latencies, 50)
    qd_p70 = get_percentile(qdrant_latencies, 70)
    qd_p100 = get_percentile(qdrant_latencies, 100)

    ret_p50 = get_percentile(retrieval_latencies, 50)
    ret_p70 = get_percentile(retrieval_latencies, 70)
    ret_p100 = get_percentile(retrieval_latencies, 100)
    
    full_p50 = get_percentile(full_latencies, 50)
    full_p70 = get_percentile(full_latencies, 70)
    full_p100 = get_percentile(full_latencies, 100)
    
    timestamp = datetime.datetime.now().isoformat()
    
    # Save CSV
    csv_file = "latency_results.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["query", "embedding_ms", "qdrant_network_ms", "retrieval_total_ms", "full_pipeline_latency_ms"])
        writer.writeheader()
        for r in results:
            writer.writerow(r)
            
    # Save JSON Summary
    summary = {
        "timestamp": timestamp,
        "num_queries": len(queries),
        "target_ms": 200,
        "component_metrics": {
            "embedding_ms": {"P50": emb_p50, "P70": emb_p70, "P100": emb_p100},
            "qdrant_network_ms": {"P50": qd_p50, "P70": qd_p70, "P100": qd_p100}
        },
        "retrieval_metrics": {
            "P50": ret_p50,
            "P70": ret_p70,
            "P100": ret_p100
        },
        "full_pipeline_metrics": {
            "P50": full_p50,
            "P70": full_p70,
            "P100": full_p100
        }
    }
    json_file = "latency_summary.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=4)
        
    print(f"\nSaved raw latencies to {csv_file}")
    print(f"Saved summary to {json_file}")
    
    # Print Summary Table
    print("\n" + "="*85)
    print("LATENCY BENCHMARK SUMMARY (Instrumented Breakdown)")
    print("="*85)
    print(f"{'Metric Component':<30} | {'P50':<8} | {'P70':<8} | {'P100':<8} | {'Target':<6} | {'Pass?'}")
    print("-" * 85)
    
    print(f"{'Embedding (Local)':<30} | {emb_p50:<6.2f}ms | {emb_p70:<6.2f}ms | {emb_p100:<6.2f}ms | {'-':<6} | -")
    print(f"{'Qdrant Query (Network RTT)':<30} | {qd_p50:<6.2f}ms | {qd_p70:<6.2f}ms | {qd_p100:<6.2f}ms | {'-':<6} | -")
    
    ret_pass = "Yes" if ret_p70 <= 200 else "No"
    print(f"{'Retrieval Total':<30} | {ret_p50:<6.2f}ms | {ret_p70:<6.2f}ms | {ret_p100:<6.2f}ms | {'200ms':<6} | {ret_pass}")
    
    full_pass = "Yes" if full_p70 <= 200 else "No"
    print(f"{'Full Pipeline (Inc. LLM)':<30} | {full_p50:<6.2f}ms | {full_p70:<6.2f}ms | {full_p100:<6.2f}ms | {'200ms':<6} | {full_pass}")
    print("="*85)

if __name__ == "__main__":
    main()
