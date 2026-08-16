"""
regrade.py
==========
Loads the cached 40 validation queries from `val_cache.json`.
Re-runs the LLM judging step, applies a post-hoc consistency check to align
verdict labels with the reasoning text, and outputs the final manual pass.
"""
import os, sys, json, time, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from dotenv import load_dotenv
load_dotenv()

from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
CACHE_FILE   = "val_cache.json"
OUT_FILE     = "results_v4.txt"

# Verify cache exists
if not os.path.exists(CACHE_FILE):
    print(f"Error: {CACHE_FILE} not found. Please run validate_prod_cached.py first to build the cache.")
    sys.exit(1)

with open(CACHE_FILE, "r", encoding="utf-8") as f:
    cache_data = json.load(f)

print(f"Loaded {len(cache_data)} cached runs from {CACHE_FILE}.")

groq_client = Groq(api_key=GROQ_API_KEY)

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=20))
def evaluate_with_llm(query, retrieved_chunk, generated_answer, ground_truth):
    prompt = f"""You are an expert evaluator for an AI Q&A system.

[QUERY]: {query}
[RETRIEVED_CHUNK]: {retrieved_chunk}
[GROUND_TRUTH]: {ground_truth}
[GENERATED_ANSWER]: {generated_answer}

RULES:
1. If GENERATED_ANSWER correctly and substantively answers the QUERY based on the GROUND_TRUTH, output: "CORRECT"
2. If GENERATED_ANSWER provides a wrong, inaccurate, or hallucinated answer, output: "INCORRECT"
3. If GENERATED_ANSWER is a refusal (e.g. contains "UNANSWERABLE", "क्षमा करें", or "उत्तर उपलब्ध नहीं है"):
   - Read the RETRIEVED_CHUNK carefully. If the RETRIEVED_CHUNK genuinely DOES NOT contain the information needed to answer the QUERY, then the AI's refusal was correct. Output: "CORRECTLY-REFUSED"
   - If the RETRIEVED_CHUNK DOES contain information that could answer the QUERY, but the AI refused to answer anyway, this is a failure. You MUST output: "INCORRECTLY-REFUSED"

Your response must be exactly two lines:
Line 1: Only the judgment category (CORRECT, INCORRECT, CORRECTLY-REFUSED, INCORRECTLY-REFUSED).
Line 2: A one-sentence explanation of why.

Response:"""
    resp = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0, max_tokens=150
    )
    lines = resp.choices[0].message.content.strip().split('\n')
    judgement = lines[0].strip()
    reason = lines[1].strip() if len(lines) > 1 else ""
    
    # Clean up judgment
    if "INCORRECTLY-REFUSED" in judgement:   judgement = "INCORRECTLY-REFUSED"
    elif "CORRECTLY-REFUSED" in judgement:   judgement = "CORRECTLY-REFUSED"
    elif "INCORRECT" in judgement:          judgement = "INCORRECT"
    elif "CORRECT" in judgement:            judgement = "CORRECT"
    else:                                   judgement = "UNKNOWN"
    return judgement, reason

def apply_consistency_check(verdict, reason):
    """
    Applies post-hoc check: if the verdict is CORRECTLY-REFUSED but the reasoning
    states that the answer WAS present or could be answered, overrides to INCORRECTLY-REFUSED.
    """
    if verdict == "CORRECTLY-REFUSED":
        reason_lower = reason.lower()
        
        # English override indicators
        english_indicators = [
            "containing", "contained", "could have", "was present", 
            "was available", "had the answer", "does contain", "does have the answer"
        ]
        
        # Hindi override indicators
        has_hindi_indicator = False
        if "उल्लेख है" in reason or "मौका था" in reason or "जानकारी है" in reason or "उत्तर देना चाहिए" in reason:
            has_hindi_indicator = True
        if "उपलब्ध है" in reason and "उपलब्ध नहीं है" not in reason:
            has_hindi_indicator = True
            
        has_english_indicator = any(ind in reason_lower for ind in english_indicators)
        
        if has_hindi_indicator or has_english_indicator:
            return "INCORRECTLY-REFUSED", True
            
    return verdict, False

print("\nRunning judging step and consistency checking on cached data...")
results = []
idx = 1
for query, info in cache_data.items():
    retrieved_snippet = info["retrieved_snippet"]
    answer            = info["answer"]
    gt_passage        = info["gt_passage"]

    judgement, reason = evaluate_with_llm(query, retrieved_snippet, answer, gt_passage)
    
    # Run post-hoc consistency check
    final_judgement, overridden = apply_consistency_check(judgement, reason)
    
    results.append({
        "idx": idx,
        "query": query,
        "raw_judgement": judgement,
        "judgement": final_judgement,
        "reason": reason,
        "overridden": overridden
    })
    
    print(f"Graded {idx}/40: {query[:30]}... -> {final_judgement} (Overridden: {overridden})")
    idx += 1
    time.sleep(1.0) # Rate-limit padding

# Calculate final tallies
correct             = sum(1 for r in results if r["judgement"] == "CORRECT")
correctly_refused   = sum(1 for r in results if r["judgement"] == "CORRECTLY-REFUSED")
incorrectly_refused = sum(1 for r in results if r["judgement"] == "INCORRECTLY-REFUSED")
incorrect           = sum(1 for r in results if r["judgement"] == "INCORRECT")

total_correct = correct + correctly_refused
accuracy      = total_correct / len(results)

# Write results to results_v4.txt
with open(OUT_FILE, "w", encoding="utf-8") as out:
    def log(msg=""):
        out.write(msg + "\n")
        print(msg)

    log("=" * 100)
    log("CORRECTED LLM-JUDGE VALIDATION (WITH POST-HOC CONSISTENCY CHECK)")
    log(f"Collection: {COLLECTION_NAME}")
    log("=" * 100)
    
    log(f"\nFINAL TALLIES:")
    log(f"  CORRECT             : {correct}/{len(results)}")
    log(f"  CORRECTLY-REFUSED   : {correctly_refused}/{len(results)}")
    log(f"  INCORRECTLY-REFUSED : {incorrectly_refused}/{len(results)}")
    log(f"  INCORRECT           : {incorrect}/{len(results)}")
    log(f"  -------------------------------------------------------------")
    log(f"  FINAL ACCURACY (CORRECT + CORRECTLY-REFUSED): {total_correct}/{len(results)} = {accuracy:.1%}")
    log("=" * 100)
    
    log("\nFULL MANUAL PASS (EVERY QUERY AND REASON VERBATIM):")
    log("=" * 100)
    for r in results:
        log(f"\nQ{r['idx']:02d}: {r['query']}")
        log(f"    Verdict: {r['judgement']} (Raw LLM: {r['raw_judgement']}, Overridden: {r['overridden']})")
        log(f"    Reason : {r['reason']}")
        log("-" * 80)

print(f"\nCompleted successfully. Final results written to {OUT_FILE}")
