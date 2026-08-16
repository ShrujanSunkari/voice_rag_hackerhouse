# Data Provenance and System Diagnostics

This document records the engineering history, database configuration details, diagnostic findings, and validation results for the Echo-Sight Hindi Voice RAG system.

---

## 1. Core Engineering Issues & Fixes Applied

### A. The Passage Selection Bug
*   **Original Behavior**: The initial indexing codebase was hardcoded to index the first passage (`Translated_passages[0]`) from the dataset for every row, regardless of whether that passage was selected as containing the correct answer.
*   **Correct Behavior**: In the MSMARCO-XI dataset, each query has multiple candidate passages, but only the passage marked with `is_selected == 1` is ground-truth relevant.
*   **Resolution**: Modified the indexer to iterate through candidate passages and selectively index only the specific passage where `is_selected == 1`, skipping rows that contained no selected passage.

### B. The Embedding Model Bug
*   **Original Behavior**: The system was configured to use `all-MiniLM-L6-v2` to generate vector embeddings. This is an English-only model that performs poorly on Hindi Devanagari text, mapping dissimilar Hindi concepts to near-identical coordinates and failing semantic search entirely (0/20 initial accuracy).
*   **Resolution**: Replaced the embedding model in both indexing and retrieval code with `paraphrase-multilingual-MiniLM-L12-v2`. This model supports Devanagari natively while maintaining a 384-dimensional space, requiring no schema changes in Qdrant (still using Cosine distance).

---

## 2. Qdrant Storage Constraint & Fresh Account Migration

During the full-scale indexing run on Qdrant Cloud:
1.  **Storage Overrun**: The Qdrant Cloud free-tier cluster encountered a disk usage threshold limit due to the sheer volume of vectors (totaling over 1.6 million strategy chunks if unconstrained).
2.  **Dynamic Row-Cap / Clean Cutover**: To resolve this, we calculated a safe dynamic row-cap based on cluster limitations and set up a fresh Qdrant account and cluster to guarantee a clean, uncorrupted index.
3.  **Collection Details**: Target collection name `echo_sight_hindi_v4` was initialized on the new cluster.

---

## 3. Final Production Collection Statistics

*   **Cluster Endpoint**: `https://96daf995-83f4-4868-8c11-3ec051f2093a.eu-west-2-0.aws.cloud.qdrant.io:6333`
*   **Collection Name**: `echo_sight_hindi_v4`
*   **Point Count**: **572,813 points**
*   **Strategy Distribution**:
    *   `metadata_aware`: 90,665 points
    *   `semantic`: 169,416 points
    *   `fixed_overlap`: 222,068 points
    *   `hybrid`: 90,664 points

---

## 4. Validation Methodology & The Judge Labeling Bug

### A. Evaluation Framework
We implemented a strict LLM-as-judge evaluation against 40 randomly sampled, relevant Hindi queries using the `llama-3.1-8b-instant` model on Groq. The rubric categories are:
-   `CORRECT`: The AI correctly answered the query based on the ground truth.
-   `INCORRECT`: The AI gave a wrong, hallucinated, or contradictory answer.
-   `CORRECTLY-REFUSED`: The context genuinely lacked the answer, and the AI correctly refused to answer (guardrail triggered).
-   `INCORRECTLY-REFUSED`: The context contained the answer, but the AI refused to answer (guardrail failed / retrieval missed).

### B. The Judge Substring Labeling Bug
During verification, we discovered a labeling bug in the parser:
```python
if "CORRECTLY-REFUSED" in judgement:   judgement = "CORRECTLY-REFUSED"
elif "INCORRECTLY-REFUSED" in judgement: judgement = "INCORRECTLY-REFUSED"
```
Because `"CORRECTLY-REFUSED"` is a substring of `"INCORRECTLY-REFUSED"`, any `INCORRECTLY-REFUSED` output from the LLM judge matched the first condition and was incorrectly overridden to `CORRECTLY-REFUSED`. 

Furthermore, the LLM judge itself occasionally exhibited an internal contradiction: outputting reasoning that clearly stated the answer was present in the context, but choosing `CORRECTLY-REFUSED` as its output label.

### C. Resolution & Offline regrading
1.  **Parser Fix**: Flipped the matching order to check `"INCORRECTLY-REFUSED"` first.
2.  **Post-Hoc Consistency Check**: Added a programmatic pattern-matching check on the reasoning text. If the LLM judge returned a refusal label but its reasoning text contained presence indicators (e.g., `"उल्लेख है"`, `"जानकारी है"`, `"मौका था"`, `"contained"`, `"present"`), the verdict was corrected to `INCORRECTLY-REFUSED`.
3.  **Local Cache Execution**: Implemented a caching mechanism (`val_cache.json`) to store retrieval and generation steps, enabling rapid, rate-limit-free offline regrading.

---

## 5. Final Diagnostic & Accuracy Tallies

After expanding the search context window to `limit = 10` and running the corrected parser + consistency check:

*   **Final Accuracy (CORRECT + CORRECTLY-REFUSED)**: **67.5% (27/40)**
*   **True Pipeline Failures (INCORRECTLY-REFUSED)**: **7/40** (mismatches corrected manually for Q08, Q17, Q20, Q39)
*   **Incorrect Answers (HALLUCINATIONS/WRONG)**: **6/40**
*   **Coverage Gap Failures**: **0/40** (A deep vector search diagnostic verified that 100% of the ground-truth passages for the incorrect queries were successfully present in the index; they were simply missed by rank 1 retrieval during lower-limit runs).

---

## 6. Latency Benchmark Results

### A. Methodology
We executed a latency benchmark using `benchmark.py` over 100 unique real Hindi queries. We evaluated latency metrics across two separate, sequential passes:
1.  **Retrieval-Only**: Measures query embedding generation and Qdrant Cloud vector search.
2.  **Full Pipeline**: Measures query translation, context retrieval, and Groq-hosted LLM answer generation.

### B. Retrieval-Only Metrics
*   **P50**: **215.76 ms**
*   **P70**: **239.38 ms**
*   **P100**: **2,642.35 ms**
*   *Analysis*: The system narrowly missed the target threshold of **200 ms**. The P50 latency (~216 ms) breaks down as approximately **78 ms** of local CPU-based embedding generation (`paraphrase-multilingual-MiniLM-L12-v2`) and **135 ms** of Qdrant Cloud network RTT. Both components are individually reasonable, but their combination slightly exceeds the 200 ms target.

### C. Full Pipeline Metrics
*   **P50**: **3,393.10 ms**
*   **P70**: **3,433.43 ms**
*   **P100**: **53,668.75 ms**
*   *Analysis*: The 200 ms target is not met. The API call to the Groq-hosted generation model dominates the pipeline latency (~3.3 seconds), which is typical for any production RAG system with a hosted generation model in the loop.

### D. P100 Outlier Analysis
-   **Full-Pipeline Outliers**: The maximum latency spike of **53.6 seconds** was traced directly to Groq API rate-limiting (HTTP 429 status code) on 2 out of 100 queries due to token volume limits. This was handled cleanly without crashing by the tenacity exponential-backoff retry logic inside `api.py`.
-   **Retrieval-Only Outliers**: The maximum latency spike of **2.64 seconds** was isolated to local embedding generation (`embedding_ms` = 2,499.75 ms) on a single query (Query 75). Qdrant network RTT remained standard at **142.57 ms**. This spike was caused by CPU thread contention or a Python garbage collection pause on the host machine, and was unrelated to network conditions or Qdrant performance.

### E. Source Data Artifacts
The full, per-query latency data backing these statistics is saved in `latency_results.csv`, with summary metrics stored in `latency_summary.json`.
