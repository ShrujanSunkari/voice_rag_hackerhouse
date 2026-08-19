"""
reparse_raw.py
==============
Re-parses raw_unknowns.json for the still-UNKNOWN queries.
Searches the entire text for the LAST clear verdict keyword.
Prints the full raw response for any still-unknown so the human can review.
"""
import json, sys, re

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

with open("raw_unknowns.json", "r", encoding="utf-8") as f:
    raw = json.load(f)

# These are the ones the parser couldn't resolve in the previous run
still_unknown_keys = {"Q02", "Q03", "Q05", "Q17", "Q30", "Q32", "Q34", "Q36", "Q40"}

# More aggressive parser: looks for the last verdict in the ENTIRE text
# (including inside <think> blocks), and handles "judgement: CORRECT" style
def parse_aggressive(text: str) -> str:
    upper = text.upper()
    
    # Find ALL positions of each keyword
    def rfind_all(keyword):
        pos = -1
        idx = 0
        while True:
            idx = upper.find(keyword, idx)
            if idx == -1:
                break
            pos = idx  # keep updating to get the last one
            idx += 1
        return pos
    
    pos_ir = max(rfind_all("INCORRECTLY-REFUSED"), rfind_all("INCORRECTLY REFUSED"))
    pos_cr = max(rfind_all("CORRECTLY-REFUSED"), rfind_all("CORRECTLY REFUSED"))
    pos_inc = rfind_all("INCORRECT")
    pos_cor = rfind_all("CORRECT")
    
    # Suppress CORRECT if it's actually part of CORRECTLY-REFUSED or INCORRECT
    if pos_cor != -1 and pos_cr != -1 and abs(pos_cor - pos_cr) <= 2:
        pos_cor = -1
    if pos_cor != -1 and pos_inc != -1 and abs(pos_cor - (pos_inc + 2)) <= 1:
        pos_cor = -1
    if pos_cor != -1 and pos_ir != -1 and abs(pos_cor - (pos_ir + 2)) <= 1:
        pos_cor = -1
        
    # Suppress INCORRECT if it's part of INCORRECTLY-REFUSED
    if pos_inc != -1 and pos_ir != -1 and abs(pos_inc - pos_ir) <= 1:
        pos_inc = -1
    
    valid = {k: v for k, v in {
        "INCORRECTLY-REFUSED": pos_ir,
        "CORRECTLY-REFUSED": pos_cr,
        "INCORRECT": pos_inc,
        "CORRECT": pos_cor,
    }.items() if v != -1}
    
    if not valid:
        return "UNKNOWN"
    return max(valid, key=valid.get)

print("\n=== RE-PARSING STILL-UNKNOWN RESPONSES ===\n")
recovered = {}
for key in sorted(still_unknown_keys):
    if key not in raw:
        print(f"{key}: NOT IN raw_unknowns.json")
        continue
    text = raw[key]
    result = parse_aggressive(text)
    recovered[key] = result
    
    # Print the post-</think> section if present, otherwise the last 200 chars
    if "</think>" in text:
        final_part = text.split("</think>")[-1].strip()
    else:
        final_part = text[-300:].strip()
    
    print(f"{key}: {result}")
    print(f"  Final answer section: {final_part[:200]!r}")
    print()

print("\n=== RECOVERED VERDICTS ===")
for k, v in sorted(recovered.items()):
    print(f"  {k}: {v}")

new_correct = sum(1 for v in recovered.values() if v == "CORRECT")
new_cr = sum(1 for v in recovered.values() if v == "CORRECTLY-REFUSED")
new_inc = sum(1 for v in recovered.values() if v == "INCORRECT")
new_ir = sum(1 for v in recovered.values() if v == "INCORRECTLY-REFUSED")
still_unk = sum(1 for v in recovered.values() if v == "UNKNOWN")

# Combined with already-parsed results from task-572:
# From task-572: Q08→CORRECT, Q12→CORRECT, Q16→INCORRECT, Q22→INCORRECT, 
#                Q26→INCORRECT, Q33→CORRECT, Q35→INCORRECT (7 parsed from 16)
prev_parsed = {"Q08": "CORRECT", "Q12": "CORRECT", "Q16": "INCORRECT",
               "Q22": "INCORRECT", "Q26": "INCORRECT", "Q33": "CORRECT", "Q35": "INCORRECT"}

all_new_verdicts = dict(prev_parsed)
all_new_verdicts.update(recovered)

final_correct = 11 + sum(1 for v in all_new_verdicts.values() if v == "CORRECT")
final_cr = 0 + sum(1 for v in all_new_verdicts.values() if v == "CORRECTLY-REFUSED")
final_inc = 13 + sum(1 for v in all_new_verdicts.values() if v == "INCORRECT")
final_ir = 0 + sum(1 for v in all_new_verdicts.values() if v == "INCORRECTLY-REFUSED")
final_unk = sum(1 for v in all_new_verdicts.values() if v == "UNKNOWN")

total = 40
parsed = total - final_unk
acc_con = final_correct / total
acc_par = final_correct / parsed if parsed > 0 else 0

print("\n" + "=" * 65)
print("FINAL FAST-PATH ACCURACY SUMMARY (All 40 Queries)")
print("=" * 65)
print(f"  CORRECT                : {final_correct}")
print(f"  CORRECTLY-REFUSED      : {final_cr}")
print(f"  INCORRECT (hallucin.)  : {final_inc}")
print(f"  INCORRECTLY-REFUSED    : {final_ir}")
print(f"  UNKNOWN (unparseable)  : {final_unk}")
print(f"  ─────────────────────────────────────────")
print(f"  Conservative Accuracy  : {final_correct}/{total} ({acc_con:.1%})")
print(f"  Parsed-Only  Accuracy  : {final_correct}/{parsed} ({acc_par:.1%})")
print("=" * 65)
