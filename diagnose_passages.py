"""
Diagnostic: Inspect hintrain.parquet passages field structure
Steps 1-3: Confirm is_selected hypothesis before writing any fix
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pandas as pd
import json

PARQUET_URL = "https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/train/hintrain.parquet"
# Use local file first (it's 5.5KB so it's the mock), try HF URL
import os
local_path = "hintrain.parquet"
local_size = os.path.getsize(local_path) if os.path.exists(local_path) else 0

if local_size < 100_000:
    print(f"Local hintrain.parquet is only {local_size} bytes -- this is the 3-row mock.")
    print("Loading from HF validation set (hinval.parquet) which is accessible...")
    src = "https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/validation/hinval.parquet"
    src_label = "hinval.parquet (HF, validation split)"
else:
    src = local_path
    src_label = f"hintrain.parquet (local, {local_size:,} bytes)"

print(f"Loading passages from: {src_label}")
df = pd.read_parquet(src, columns=["query", "passages"])
print(f"Total rows loaded: {len(df):,}\n")

def hr(n=80): print("=" * n)

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Inspect raw structure of `passages` for 5 sample rows
# ─────────────────────────────────────────────────────────────────────────────
hr()
print("STEP 1: Raw structure of 'passages' field for 5 sample rows")
hr()

sample5 = df.sample(5, random_state=42).reset_index(drop=True)

for i, row in sample5.iterrows():
    p = row["passages"]
    print(f"\n── Row {i+1}: Query: {str(row['query'])[:80]!r}")
    if isinstance(p, dict):
        keys = list(p.keys())
        print(f"   Keys in passages dict: {keys}")
        trans = p.get("Translated_passages", p.get("passage_text", []))
        selected = p.get("is_selected", [])
        print(f"   Number of passages    : {len(trans)}")
        print(f"   is_selected array     : {selected}")
        # Find which index is selected
        sel_indices = [j for j, s in enumerate(selected) if s == 1]
        print(f"   Selected index(es)    : {sel_indices}")
        for j, (t, s) in enumerate(zip(trans, selected)):
            marker = " <-- SELECTED" if s == 1 else ""
            print(f"   [{j}] is_selected={s}{marker}: {str(t)[:120]!r}")
    else:
        print(f"   passages type: {type(p)} -- raw: {str(p)[:200]}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: For 50 rows, count index-0 vs non-zero selected passage position
# ─────────────────────────────────────────────────────────────────────────────
hr()
print("\nSTEP 2: For 50 rows — where is is_selected==1 located?")
hr()

sample50 = df.sample(min(50, len(df)), random_state=7).reset_index(drop=True)

at_idx0 = 0          # is_selected==1 at index 0
at_other = 0         # is_selected==1 at a different index
no_selected = 0      # no passage with is_selected==1 at all
multi_selected = 0   # more than one is_selected==1

for _, row in sample50.iterrows():
    p = row["passages"]
    if not isinstance(p, dict):
        no_selected += 1
        continue
    selected = p.get("is_selected", [])
    sel_indices = [j for j, s in enumerate(selected) if s == 1]
    if len(sel_indices) == 0:
        no_selected += 1
    elif len(sel_indices) > 1:
        multi_selected += 1
        if sel_indices[0] == 0:
            at_idx0 += 1
        else:
            at_other += 1
    elif sel_indices[0] == 0:
        at_idx0 += 1
    else:
        at_other += 1

total_with_selection = at_idx0 + at_other + multi_selected
print(f"\n  Sample size            : 50 rows")
print(f"  is_selected==1 at idx 0: {at_idx0}  ({at_idx0/50*100:.1f}%)")
print(f"  is_selected==1 at other: {at_other}  ({at_other/50*100:.1f}%)")
print(f"  Multi-selected         : {multi_selected}  ({multi_selected/50*100:.1f}%)")
print(f"  No is_selected==1      : {no_selected}  ({no_selected/50*100:.1f}%)")
print(f"\n  *** MISMATCH (indexed wrong passage): {at_other/50*100:.1f}% of rows ***")
print(f"      If the indexer always took [0], approx {at_other/50*100:.1f}% of")
print(f"      778,638 points = ~{int(778638 * at_other/50):,} indexed points are WRONG passages.")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: How many rows have known sentinel text at Translated_passages[0]?
# ─────────────────────────────────────────────────────────────────────────────
hr()
print("\nSTEP 3: Sentinel/generic text at Translated_passages[0]")
hr()

SENTINELS = [
    "नई दिल्ली भारत की राजधानी है",
    "सूप, स्टू और मांस के व्यंजनों में स्वाद बढ़ाने",
    "इसका उपयोग सूप",
    "यह भारत सरकार के सभी तीन अंगों",
]

def get_passage_0(p):
    if isinstance(p, dict):
        trans = p.get("Translated_passages", p.get("passage_text", []))
        try:
            if len(trans) > 0:
                return str(trans[0])
        except Exception:
            pass
    return ""

# Check across ALL rows (not just 50)
sentinel_counts = {s: 0 for s in SENTINELS}
total_rows = len(df)
sample_large = df.sample(min(5000, total_rows), random_state=1).reset_index(drop=True)

for _, row in sample_large.iterrows():
    p0 = get_passage_0(row["passages"])
    for s in SENTINELS:
        if s in p0:
            sentinel_counts[s] += 1

print(f"\n  Sample size checked: {len(sample_large):,} rows")
print(f"\n  Sentinel phrase occurrences at Translated_passages[0]:")
for s, cnt in sentinel_counts.items():
    pct = cnt / len(sample_large) * 100
    est_total = int(778638 * cnt / len(sample_large))
    print(f"    {cnt:5d} rows ({pct:.2f}%) — est. {est_total:,} indexed points")
    print(f"         Fragment: {s!r}")

# Also show top 10 most common passage[0] texts in the sample
print(f"\n  Top 15 most common Translated_passages[0] values (in {len(sample_large):,} row sample):")
p0_series = sample_large["passages"].apply(get_passage_0)
top = p0_series.str[:80].value_counts().head(15)
for txt, cnt in top.items():
    pct = cnt / len(sample_large) * 100
    print(f"    {cnt:5d} ({pct:5.2f}%)  {txt!r}")

print("\n" + "="*80)
print("DIAGNOSTIC COMPLETE — review above before writing any fix code.")
print("="*80)
