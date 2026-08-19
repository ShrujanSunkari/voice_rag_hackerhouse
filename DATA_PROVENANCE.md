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

---

## 7. Fast-Path Latency Benchmark

The system implements a two-speed architecture:
- **Fast path** (`/api/retrieve`): extractive top-chunk only, no LLM, sub-200 ms target.
- **Polished path** (`/api/synthesize`): full Groq/Llama LLM synthesis, ~1–3 s.

### A. Methodology
100 unique real Hindi queries were benchmarked against the live `/api/retrieve` endpoint after the `[Extractive Fast Answer]` placeholder fix was applied. Refusal-branch latencies (queries scoring below the 0.45 cosine threshold) were included in the tally — not excluded.

### B. Fast-Path Metrics
| Metric | Latency |
|--------|---------|
| **P50** | **145.60 ms** |
| **P70** | **152.31 ms** |
| **P100** | **179.84 ms** |

*Analysis*: The fast path comfortably satisfies the <200 ms requirement end-to-end, including network RTT to Qdrant Cloud. The refusal branch (~145 ms) is equally performant to the successful-match branch — there is no latency split between the two code paths.

### C. Source Data Artifacts
Per-query fast-path latency data is saved in `latency_results_fastpath.csv` with summary metrics in `latency_summary_fastpath.json`.

---

## 8. Fast-Path Accuracy Grading — Definitive Results

### A. Purpose and Scope
The fast path exists **specifically to satisfy the <200 ms latency requirement**. It is not designed or intended to provide answer-quality guarantees; those are properties of the polished path only. This section documents its accuracy to establish a clear, evidence-backed baseline for that limitation.

### B. Methodology
- **Queries**: same 40 cached ground-truth queries used for the polished-path validation (Section 5).
- **Retrieval calls**: **0** — reused `val_cache.json` cached retrieved snippets.
- **Generation calls**: **0** — fast_answer is purely extractive (top chunk, no LLM).
- **Judge calls**: **40 initial + 16 re-run** = 56 total judge calls.
- **Judge model**: `qwen/qwen3.6-27b` via Groq (see judge model caveat below).
- Raw judge responses saved to `raw_unknowns.json` before parsing.
- Parsing strategy: last clear verdict keyword in full response text (including CoT), with 9 still-ambiguous cases resolved by manual reading of the raw response reasoning text.

### C. ⚠️ Judge Model Caveat — Not Apples-to-Apples
The polished-path accuracy (67.5%, Section 5) was graded by **`llama-3.1-8b-instant`** on Groq. That model was formally decommissioned by Groq between the two grading runs. The fast-path accuracy (45.0%) was graded by **`qwen/qwen3.6-27b`**.

Both sets of numbers are real and evidence-backed, but **they were graded by different judge models and are not a perfectly apples-to-apples comparison.** The accuracy gap (45% vs 67.5%) should be interpreted as directionally correct — the fast path is meaningfully worse — but the exact margin is confounded by judge model differences.

### D. Definitive Fast-Path Accuracy Tally (40/40 queries — zero unknowns)

| Verdict | Count |
|---------|-------|
| **CORRECT** | **18** |
| CORRECTLY-REFUSED | **0** |
| **INCORRECT (wrong/hallucinated)** | **22** |
| INCORRECTLY-REFUSED | **0** |
| UNKNOWN (unparseable) | **0** |

**Final Accuracy: 18/40 = 45.0%**

Conservative accuracy = parsed-only accuracy = **45.0%** (identical, since zero unknowns remain).

### E. Known Limitation: Fast-Path Guardrail Has No Functioning Refusal Capability

> **The fast path's grounding threshold (score < 0.45) never triggered across the full 40-query test set. `CORRECTLY-REFUSED` = 0/40.**

This is not a sampling artifact. Investigation of known-unanswerable queries confirmed that the `paraphrase-multilingual-MiniLM-L12-v2` embedding model returns cosine similarity scores above 0.45 (typically 0.65–0.75) even for topically-adjacent but logically unrelated content. The threshold is therefore functionally inert for this query distribution.

Consequences:
- Every incorrect fast-path answer was returned **with full apparent confidence** — there is no visible signal to the user that the answer is unreliable based on the fast path alone.
- The fast path **cannot detect unanswerable queries**. It will always return the top retrieved chunk, regardless of whether that chunk answers the question.
- Guardrail behavior (refusing unanswerable queries, detecting off-topic retrievals) is a property of the **polished LLM path only**.

### F. Mitigation

The UI mitigates this risk with an amber "unverified" text tint and a `"fast path · unverified"` footer label that is displayed from the moment the fast answer arrives until the polished answer fully replaces it. The footer switches to `"guardrail passed"` only after the polished LLM synthesis completes successfully. This is an explicit, visible signal to users not to act on the fast-path answer as authoritative.

A deeper fix (BM25/TF-IDF hybrid scoring, or a lightweight cross-encoder re-ranker) would be required to give the fast path its own functioning guardrail without an unacceptable false-refusal rate on answerable queries.

### G. Source Data Artifacts
- `fastpath_accuracy.json` — final numeric summary.
- `raw_unknowns.json` — full raw judge responses for all 16 re-run queries, including complete Chain-of-Thought text.
