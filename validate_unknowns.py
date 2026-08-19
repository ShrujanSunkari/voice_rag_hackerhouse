"""
validate_unknowns.py
====================
Runs the LLM judge for exactly the 16 previously-UNKNOWN queries.
Saves the raw responses to a file and parses them leniently.
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

# The exactly 16 queries that returned UNKNOWN in the last run (1-indexed indices: 2, 3, 5, 8, 12, 16, 17, 22, 26, 30, 32, 33, 34, 35, 36, 40)
UNKNOWN_INDICES = {2, 3, 5, 8, 12, 16, 17, 22, 26, 30, 32, 33, 34, 35, 36, 40}

# ── Load cache ────────────────────────────────────────────────────────────────
with open(CACHE_FILE, "r", encoding="utf-8") as f:
    cache_data = json.load(f)

# ── Build fast_answer ─────────────────────────────────────────────────────────
def make_fast_answer(retrieved_snippet: str) -> str:
    if retrieved_snippet == "[BELOW THRESHOLD - no confident match]":
        return "HINDI: क्षमा करें, मुझे इस विषय पर पर्याप्त जानकारी नहीं मिली।"
    top_chunk = retrieved_snippet.split("\n\n")[0]
    return f"HINDI: {top_chunk}"

# ── Judge function ────────────────────────────────────────────────────────────
@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=4, max=20))
def judge(query, retrieved_chunk, generated_answer, ground_truth) -> str:
    prompt = f"""You are an expert evaluator for an AI Q&A system.

[QUERY]: {query}
[RETRIEVED_CHUNK]: {retrieved_chunk[:500]}
[GROUND_TRUTH]: {ground_truth}
[GENERATED_ANSWER]: {generated_answer}

RULES:
1. If GENERATED_ANSWER correctly and substantively answers the QUERY based on the GROUND_TRUTH, output: "CORRECT"
2. If GENERATED_ANSWER provides a wrong, inaccurate, or hallucinated answer, output: "INCORRECT"
3. If GENERATED_ANSWER is a refusal (e.g. contains "UNANSWERABLE", "क्षमा करें", or "उत्तर उपलब्ध नहीं है"):
   - If the RETRIEVED_CHUNK genuinely DOES NOT contain information needed to answer the QUERY, output: "CORRECTLY-REFUSED"
   - If the RETRIEVED_CHUNK DOES contain information that could answer the QUERY, output: "INCORRECTLY-REFUSED"

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
        temperature=0.0, max_tokens=300
    )
    return resp.choices[0].message.content.strip()

# ── Parse leniently ───────────────────────────────────────────────────────────
def parse_lenient(full_response: str) -> str:
    # Look for the last occurrence of the keywords in the string
    upper = full_response.upper()
    
    pos_ir = upper.rfind("INCORRECTLY-REFUSED")
    if pos_ir == -1: pos_ir = upper.rfind("INCORRECTLY REFUSED")
    
    pos_cr = upper.rfind("CORRECTLY-REFUSED")
    if pos_cr == -1: pos_cr = upper.rfind("CORRECTLY REFUSED")
    
    pos_inc = upper.rfind("INCORRECT")
    # if it's part of INCORRECTLY-REFUSED, ignore it for INCORRECT
    if pos_inc != -1 and (pos_inc == pos_ir or upper[pos_inc:pos_inc+19] == "INCORRECTLY-REFUSED" or upper[pos_inc:pos_inc+19] == "INCORRECTLY REFUSED"):
        pos_inc = -1
        
    pos_cor = upper.rfind("CORRECT")
    # if it's part of INCORRECT, CORRECTLY-REFUSED, or INCORRECTLY-REFUSED, ignore it
    if pos_cor != -1:
        if pos_cor == pos_cr or pos_cor == pos_inc + 2 or pos_cor == pos_ir + 2:
            pos_cor = -1
        # Check surrounding text
        substr = upper[max(0, pos_cor-5):pos_cor+15]
        if "INCORRECT" in substr or "REFUSED" in substr:
            pos_cor = -1
            
    # Find the maximum position that is not -1
    positions = {
        "INCORRECTLY-REFUSED": pos_ir,
        "CORRECTLY-REFUSED": pos_cr,
        "INCORRECT": pos_inc,
        "CORRECT": pos_cor
    }
    
    valid_positions = {k: v for k, v in positions.items() if v != -1}
    
    if not valid_positions:
        return "UNKNOWN"
        
    # Get the key with the max position (the last one mentioned)
    return max(valid_positions, key=valid_positions.get)

# ── Run grading ───────────────────────────────────────────────────────────────
raw_responses = {}
parsed_results = {}

for idx, (query, info) in enumerate(cache_data.items(), 1):
    if idx not in UNKNOWN_INDICES:
        continue
        
    retrieved_snippet = info["retrieved_snippet"]
    gt_passage        = info["gt_passage"]

    fast_ans = make_fast_answer(retrieved_snippet)
    
    full_resp = judge(query, retrieved_snippet, fast_ans, gt_passage)
    raw_responses[f"Q{idx:02d}"] = full_resp
    
    judgement = parse_lenient(full_resp)
    parsed_results[f"Q{idx:02d}"] = judgement
    
    q_short = (query[:40] + "…") if len(query) > 40 else query
    print(f"Q{idx:02d}: {q_short:<43} | {judgement:<22}")

# Save raw responses
with open("raw_unknowns.json", "w", encoding="utf-8") as f:
    json.dump(raw_responses, f, indent=4, ensure_ascii=False)

print("\nSaved raw responses to raw_unknowns.json")

# ── Summary ───────────────────────────────────────────────────────────────────
# Previous known results: 11 CORRECT, 0 CORRECTLY-REFUSED, 13 INCORRECT, 0 INCORRECTLY-REFUSED (total 24)
prev_correct = 11
prev_cr = 0
prev_inc = 13
prev_ir = 0

new_correct = sum(1 for v in parsed_results.values() if v == "CORRECT")
new_cr = sum(1 for v in parsed_results.values() if v == "CORRECTLY-REFUSED")
new_inc = sum(1 for v in parsed_results.values() if v == "INCORRECT")
new_ir = sum(1 for v in parsed_results.values() if v == "INCORRECTLY-REFUSED")
still_unknown = sum(1 for v in parsed_results.values() if v == "UNKNOWN")

total_correct = prev_correct + new_correct
total_cr = prev_cr + new_cr
total_inc = prev_inc + new_inc
total_ir = prev_ir + new_ir

total_queries = 40
parsed_queries = 40 - still_unknown

acc_conservative = total_correct / total_queries
acc_parsed_only = total_correct / parsed_queries if parsed_queries > 0 else 0

print("\n" + "=" * 65)
print("UPDATED FAST-PATH ACCURACY SUMMARY (All 40 Queries)")
print("=" * 65)
print(f"  CORRECT                : {total_correct}")
print(f"  CORRECTLY-REFUSED      : {total_cr}")
print(f"  INCORRECT (hallucin.)  : {total_inc}")
print(f"  INCORRECTLY-REFUSED    : {total_ir}")
print(f"  UNKNOWN (unparseable)  : {still_unknown}")
print(f"  ─────────────────────────────────────────")
print(f"  Conservative Accuracy  : {total_correct}/{total_queries} ({acc_conservative:.1%})")
print(f"  Parsed-Only Accuracy   : {total_correct}/{parsed_queries} ({acc_parsed_only:.1%})")
print("=" * 65)
