"""
manual_resolve.py
=================
Manually resolves the 9 still-UNKNOWN cases based on the raw response text
and computes the final authoritative tally.
"""
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# From raw response final-answer sections (observed in reparse_raw.py output):
# Q02: Model found the ISO camera chunk does relate to the query "आइसो सेंसर का क्या अर्थ है"
#      (ISO sensor meaning). Final section shows the retrieved chunk DID contain the answer.
#      → CORRECT
# Q03: "business process management" query. The chunk discusses BPM but final section cuts off.
#      The model says "process optimisation process" which partially answers → INCORRECT
#      (chunk describes a related-but-different concept; model didn't commit)
#      → INCORRECT
# Q05: "पहली श्रेणी का यौन उत्पीड़न" (first-degree sexual assault). Retrieved chunk continues
#      with the legal definition, directly answering. → CORRECT
# Q17: "क्या आप बांग्ला नामक भाषा बोल सकते हैं?" — can you speak Bangla?
#      The chunk talks about Bengali culture vs language, doesn't directly answer "can you speak it"
#      The GT says Bengali/Bangla is a language. Fast-answer chunk is off-topic → INCORRECT
# Q30: "दरवोकेट में क्या है" (what is in Darvocet). Final section shows: model notes the
#      chunk is about "a key that opens a lock" — totally wrong chunk → INCORRECT
# Q32: "मातृभूमि सुरक्षा विभाग" (Homeland Security). Model explicitly states: "generated
#      answer is just a copy of the beginning of the retrieved chunk. It does not answer
#      the query at all." → INCORRECT
# Q34: "त्वचा की जांच" (skin exam). Final section shows the chunk IS the definition of
#      a skin exam (dermoscopy). Model notes: the answer directly defines it → CORRECT
# Q36: "सबसे बड़ा फैन्यूक रोबोट" (largest FANUC robot). Chunk talks about FANUC as largest
#      industrial robot manufacturer — adjacent but doesn't answer "largest robot model" → INCORRECT
# Q40: "मनुष्य और चिम्पांजी वंशानुगत" (genetic relation). Model says chunk: "exactly copies
#      the retrieved chunk" AND that chunk says humans and chimps are most closely related.
#      The chunk DOES contain the answer about DNA relationship → CORRECT

manual_resolutions = {
    "Q02": ("CORRECT",   "Chunk contains ISO sensor/camera meaning, directly answers query"),
    "Q03": ("INCORRECT", "Chunk describes a related concept but doesn't clearly answer the BPM definition query"),
    "Q05": ("CORRECT",   "Legal definition of first-degree sexual assault is present in the chunk"),
    "Q17": ("INCORRECT", "Chunk about Bengali culture vs language doesn't answer 'can you speak Bangla'"),
    "Q30": ("INCORRECT", "Chunk is about an unrelated key/door metaphor, not Darvocet ingredients"),
    "Q32": ("INCORRECT", "Model explicitly: 'does not answer the query at all' — wrong chunk"),
    "Q34": ("CORRECT",   "Chunk is the dermoscopy/skin exam definition, directly answers query"),
    "Q36": ("INCORRECT", "Chunk about FANUC as a company, not about the largest robot model"),
    "Q40": ("CORRECT",   "Chunk contains the human-chimp DNA relationship answer"),
}

# Already parsed verdicts from task-572 for the 16 unknowns (7 resolved):
prev_parsed_unknowns = {
    "Q08": "CORRECT",
    "Q12": "CORRECT",
    "Q16": "INCORRECT",
    "Q22": "INCORRECT",
    "Q26": "INCORRECT",
    "Q33": "CORRECT",
    "Q35": "INCORRECT",
}

# Combine all resolutions from the 16 originally-unknown queries
all_16_verdicts = dict(prev_parsed_unknowns)
for k, (v, _) in manual_resolutions.items():
    all_16_verdicts[k] = v

print("=== ALL 16 FORMERLY-UNKNOWN QUERIES — FINAL VERDICTS ===\n")
for k in sorted(all_16_verdicts):
    v = all_16_verdicts[k]
    note = manual_resolutions.get(k, ("", "auto-parsed"))[1]
    flag = "✓ manual" if k in manual_resolutions else "  auto"
    print(f"  {k}: {v:<22} [{flag}] {note}")

# Original 24 already-resolved queries:
# 11 CORRECT, 0 CORRECTLY-REFUSED, 13 INCORRECT, 0 INCORRECTLY-REFUSED
orig_correct = 11
orig_cr = 0
orig_inc = 13
orig_ir = 0

new_correct = sum(1 for v in all_16_verdicts.values() if v == "CORRECT")
new_cr = sum(1 for v in all_16_verdicts.values() if v == "CORRECTLY-REFUSED")
new_inc = sum(1 for v in all_16_verdicts.values() if v == "INCORRECT")
new_ir = sum(1 for v in all_16_verdicts.values() if v == "INCORRECTLY-REFUSED")
final_unk = sum(1 for v in all_16_verdicts.values() if v == "UNKNOWN")

total_correct = orig_correct + new_correct
total_cr = orig_cr + new_cr
total_inc = orig_inc + new_inc
total_ir = orig_ir + new_ir
total_unk = final_unk

total = 40
parsed = total - total_unk
acc_con = total_correct / total
acc_par = total_correct / parsed if parsed > 0 else 0

print("\n" + "=" * 65)
print("DEFINITIVE FAST-PATH ACCURACY SUMMARY (All 40 Queries)")
print("=" * 65)
print(f"  CORRECT                : {total_correct}")
print(f"  CORRECTLY-REFUSED      : {total_cr}")
print(f"  INCORRECT (hallucin.)  : {total_inc}")
print(f"  INCORRECTLY-REFUSED    : {total_ir}")
print(f"  UNKNOWN (truly unpars.): {total_unk}")
print(f"  ─────────────────────────────────────────")
print(f"  Conservative Accuracy  : {total_correct}/{total} ({acc_con:.1%})")
print(f"  Parsed-Only Accuracy   : {total_correct}/{parsed} ({acc_par:.1%})")
print("=" * 65)
