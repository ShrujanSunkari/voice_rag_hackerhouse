"""
validate_fastpath.py
====================
Grades the extractive fast_answer against the same 40 cached queries/ground-truths
used in the LLM validation (val_cache.json / results_v4.txt).

Cost:
  - 0 retrieval calls  — reuses cached retrieved_snippet from val_cache.json
  - 0 generation calls — fast_answer is local extractive (top chunk, no LLM)
  - 40 judge calls     — one per query, same rubric as validate_prod_cached.py
"""
import os, sys, json, re
from dotenv import load_dotenv
load_dotenv()

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
CACHE_FILE   = "val_cache.json"

groq_client  = Groq(api_key=GROQ_API_KEY)

# ── Load cache ────────────────────────────────────────────────────────────────
with open(CACHE_FILE, "r", encoding="utf-8") as f:
    cache_data = json.load(f)
print(f"Loaded {len(cache_data)} cached queries.")

# ── Build fast_answer from the cached retrieved_snippet (same logic as api.py) ─
def make_fast_answer(retrieved_snippet: str) -> str:
    """Mirrors /api/retrieve: extractive top-chunk, NO LLM."""
    if retrieved_snippet == "[BELOW THRESHOLD - no confident match]":
        return "HINDI: क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली।"
    # retrieved_snippet is "\n\n".join(shards); the fast path takes top chunk only
    top_chunk = retrieved_snippet.split("\n\n")[0]
    return f"HINDI: {top_chunk}"

# ── Judge function — same rubric as validate_prod_cached.py ───────────────────
@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=20))
def judge(query, retrieved_chunk, generated_answer, ground_truth) -> tuple[str, str]:
    prompt = f"""You are an expert evaluator for an AI Q&A system.

[QUERY]: {query}
[RETRIEVED_CHUNK]: {retrieved_chunk[:500]}
[GROUND_TRUTH]: {ground_truth}
[GENERATED_ANSWER]: {generated_answer}

RULES:
1. If GENERATED_ANSWER correctly and substantively answers the QUERY based on the GROUND_TRUTH, output judgement "CORRECT"
2. If GENERATED_ANSWER provides a wrong, inaccurate, or hallucinated answer, output judgement "INCORRECT"
3. If GENERATED_ANSWER is a refusal (e.g. contains "UNANSWERABLE", "क्षमा करें", or "उत्तर उपलब्ध नहीं है"):
   - If the RETRIEVED_CHUNK genuinely DOES NOT contain information needed to answer the QUERY, output judgement "CORRECTLY-REFUSED"
   - If the RETRIEVED_CHUNK DOES contain information that could answer the QUERY, output judgement "INCORRECTLY-REFUSED"

Note: GENERATED_ANSWER is a raw Hindi extractive chunk — it is NOT a polished answer.
Judge whether the chunk TEXT substantively contains the correct answer to the QUERY.

OUTPUT FORMAT:
Your response must contain EXACTLY ONE of these four exact phrases (and no other formatting for the judgement):
CORRECT
INCORRECT
CORRECTLY-REFUSED
INCORRECTLY-REFUSED

Then provide a brief reason on a new line.
"""
    resp = groq_client.chat.completions.create(
        model="qwen/qwen3.6-27b",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0, max_tokens=250
    )
    full_response = resp.choices[0].message.content.strip()
    
    # Strip <think> block if present
    if "</think>" in full_response:
        final_answer = full_response.split("</think>")[-1].strip()
    else:
        final_answer = full_response
        
    final_answer_upper = final_answer.upper()
    
    if "INCORRECTLY-REFUSED" in final_answer_upper or "INCORRECTLY REFUSED" in final_answer_upper:  judgement = "INCORRECTLY-REFUSED"
    elif "CORRECTLY-REFUSED" in final_answer_upper or "CORRECTLY REFUSED" in final_answer_upper:  judgement = "CORRECTLY-REFUSED"
    elif "INCORRECT" in final_answer_upper and "CORRECTLY-REFUSED" not in final_answer_upper and "CORRECTLY REFUSED" not in final_answer_upper: judgement = "INCORRECT"
    elif "CORRECT" in final_answer_upper and "INCORRECT" not in final_answer_upper: judgement = "CORRECT"
    else: judgement = "UNKNOWN"
    
    # Sometimes it says just "JUDGEMENT: CORRECT"
    if judgement == "UNKNOWN":
        if "CORRECT" in final_answer_upper and "INCORRECT" not in final_answer_upper:
            judgement = "CORRECT"
        elif "INCORRECT" in final_answer_upper:
            judgement = "INCORRECT"

    
    reason = final_answer.replace('\n', ' ')[:80] + "..."
    return judgement, reason

# ── Run grading ───────────────────────────────────────────────────────────────
results = []
for idx, (query, info) in enumerate(cache_data.items(), 1):
    retrieved_snippet = info["retrieved_snippet"]
    gt_passage        = info["gt_passage"]

    fast_ans = make_fast_answer(retrieved_snippet)
    judgement, reason = judge(query, retrieved_snippet, fast_ans, gt_passage)

    results.append({"idx": idx, "query": query, "judgement": judgement, "reason": reason})
    q_short = (query[:40] + "…") if len(query) > 40 else query
    print(f"Q{idx:02d}: {q_short:<43} | {judgement:<22} | {reason[:55]}")

# ── Summary ───────────────────────────────────────────────────────────────────
total   = len(results)
correct = sum(1 for r in results if r["judgement"] in ("CORRECT", "CORRECTLY-REFUSED"))
wrong   = sum(1 for r in results if r["judgement"] == "INCORRECT")
inc_ref = sum(1 for r in results if r["judgement"] == "INCORRECTLY-REFUSED")
cr_ref  = sum(1 for r in results if r["judgement"] == "CORRECTLY-REFUSED")
corr    = sum(1 for r in results if r["judgement"] == "CORRECT")
acc     = correct / total

print("\n" + "=" * 65)
print("FAST-PATH ACCURACY SUMMARY")
print("=" * 65)
print(f"  CORRECT                : {corr}")
print(f"  CORRECTLY-REFUSED      : {cr_ref}")
print(f"  INCORRECT (hallucin.)  : {wrong}")
print(f"  INCORRECTLY-REFUSED    : {inc_ref}")
print(f"  ─────────────────────────────────────────")
print(f"  TOTAL ACCURACY         : {correct}/{total} = {acc:.1%}")
print("=" * 65)

# Save summary
with open("fastpath_accuracy.json", "w", encoding="utf-8") as f:
    json.dump({
        "correct": corr, "correctly_refused": cr_ref,
        "incorrect": wrong, "incorrectly_refused": inc_ref,
        "total": total, "accuracy_pct": round(acc * 100, 1)
    }, f, indent=4)
print("Saved to fastpath_accuracy.json")
