"""
parse_and_regrade.py
===================
Reads results_v4.txt (last run's output containing query, verdict, and reason).
Performs offline pattern matching to identify and flag inconsistent verdicts
without calling any LLM.
"""
import sys, os, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

RESULTS_FILE = "results_v4.txt"

if not os.path.exists(RESULTS_FILE):
    print(f"Error: {RESULTS_FILE} not found.")
    sys.exit(1)

with open(RESULTS_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# We want to extract each block in DETAILED BREAKDOWN
# Format:
# [VERDICT] Q: query
#     Reason: reason_text
# Note: we search for the DETAILED BREAKDOWN: section
breakdown_match = re.search(r"DETAILED BREAKDOWN:(.*)", content, re.DOTALL)
if not breakdown_match:
    print("Error: Could not find DETAILED BREAKDOWN: section in results_v4.txt")
    sys.exit(1)

breakdown_text = breakdown_match.group(1)

# Regex to capture: [VERDICT] Q: query_text \n    Reason: reason_text
pattern = r"\[([A-Z-]+)\] Q: ([^\n]+)\n\s+Reason:\s*([^\n]+(?:\n\s+Reason:[^\n]+)*)"
# Wait, let's parse line by line to be safe, or split by double newlines or similar.
# In results_v4.txt, each query block starts with "[VERDICT] Q: " and is separated by single/double newlines.
blocks = re.split(r"\n\n(?=\[[A-Z-]+\] Q:)", breakdown_text.strip())

parsed_results = []
idx = 1
for block in blocks:
    lines = block.strip().split("\n")
    if len(lines) < 2:
        continue
    
    # Parse verdict and query
    header_line = lines[0].strip()
    match = re.match(r"^\[([A-Z-]+)\] Q:\s*(.*)$", header_line)
    if not match:
        continue
        
    verdict = match.group(1)
    query = match.group(2)
    
    # Parse reason (can be multiple lines)
    reason_lines = []
    for line in lines[1:]:
        line_strip = line.strip()
        if line_strip.startswith("Reason:"):
            reason_lines.append(line_strip[7:].strip())
        elif line_strip.startswith("Verdict:") or line_strip.startswith("Reason :"):
            # handle validate_prod_cached format or similar
            reason_lines.append(re.sub(r"^(Reason\s*:|Verdict\s*:|Reason:)", "", line_strip).strip())
        else:
            reason_lines.append(line_strip)
            
    reason = " ".join(reason_lines).strip()
    
    parsed_results.append({
        "idx": idx,
        "query": query,
        "verdict": verdict,
        "reason": reason
    })
    idx += 1

out = open("flagged_anomalies.txt", "w", encoding="utf-8")
def log_print(msg=""):
    print(msg)
    out.write(msg + "\n")

log_print(f"Successfully parsed {len(parsed_results)} queries from {RESULTS_FILE}.\n")

# 1. Define override signals
refusal_signals = [
    "उपलब्ध है", "जानकारी है", "मौका था", "मौका मिल सकता था", 
    "मिलती है", "उल्लेख है", "contains", "present", "available", 
    "could have", "should have", "जानकारी देनी चाहिए थी", "उत्तर उपलब्ध है"
]

log_print("=" * 80)
log_print("1. CHECKING CORRECTLY-REFUSED VERDICTS FOR ANSWERS PRESENT IN CONTEXT")
log_print("=" * 80)

flagged_refusals = []
for item in parsed_results:
    if item["verdict"] == "CORRECTLY-REFUSED":
        reason_lower = item["reason"].lower()
        
        # Check for presence indicators
        matched_sigs = []
        for sig in refusal_signals:
            if sig in item["reason"] or (sig.isalpha() and sig in reason_lower):
                # Ensure it's not negated like "not available" or "does not contain" or "उपलब्ध नहीं है"
                if sig == "available" and "not available" in reason_lower:
                    continue
                if sig == "contains" and "does not contain" in reason_lower:
                    continue
                if sig == "present" and "not present" in reason_lower:
                    continue
                if sig == "उपलब्ध है" and "उपलब्ध नहीं है" in item["reason"]:
                    continue
                if sig == "जानकारी है" and "जानकारी नहीं" in item["reason"]:
                    continue
                matched_sigs.append(sig)
                
        if matched_sigs:
            flagged_refusals.append((item, matched_sigs))
            log_print(f"Q{item['idx']:02d}: {item['query']}")
            log_print(f"    Verdict: {item['verdict']}")
            log_print(f"    Reason : {item['reason']}")
            log_print(f"    Matched Signal(s): {matched_sigs}")
            log_print("-" * 80)

if not flagged_refusals:
    log_print("No CORRECTLY-REFUSED anomalies flagged.")

log_print("\n" + "=" * 80)
log_print("2. CHECKING OTHER VERDICTS FOR CONTRADICTIONS")
log_print("=" * 80)

flagged_others = []
for item in parsed_results:
    if item["verdict"] == "INCORRECTLY-REFUSED":
        # If reasoning says it correctly refused or context lacked answer
        if "correctly refused" in item["reason"].lower() or "नहीं मिली" in item["reason"]:
            flagged_others.append(item)
            log_print(f"Q{item['idx']:02d}: {item['query']}")
            log_print(f"    Verdict: {item['verdict']}")
            log_print(f"    Reason : {item['reason']}")
            log_print("-" * 80)
            
    elif item["verdict"] == "CORRECT":
        # If reasoning says it is incorrect or wrong
        if "गलत" in item["reason"] or "inaccurate" in item["reason"].lower() or "incorrect" in item["reason"].lower() or "not match" in item["reason"].lower():
            flagged_others.append(item)
            log_print(f"Q{item['idx']:02d}: {item['query']}")
            log_print(f"    Verdict: {item['verdict']}")
            log_print(f"    Reason : {item['reason']}")
            log_print("-" * 80)
            
    elif item["verdict"] == "INCORRECT":
        # If reasoning says it is correct or matches
        if "सही" in item["reason"] and "सही नहीं" not in item["reason"]:
            flagged_others.append(item)
            log_print(f"Q{item['idx']:02d}: {item['query']}")
            log_print(f"    Verdict: {item['verdict']}")
            log_print(f"    Reason : {item['reason']}")
            log_print("-" * 80)

if not flagged_others:
    log_print("No other anomalies flagged.")

log_print("\n" + "=" * 80)
log_print("3. COMPLETE LIST FOR MANUAL VERIFICATION")
log_print("=" * 80)
for item in parsed_results:
    log_print(f"Q{item['idx']:02d}: {item['query']}")
    log_print(f"    Verdict: {item['verdict']}")
    log_print(f"    Reason : {item['reason']}")
    log_print("-" * 80)
out.close()
