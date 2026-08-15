import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import pyarrow.parquet as pq

# Safely extract a small batch
parquet_file = pq.ParquetFile("hintrain.parquet")
df = next(parquet_file.iter_batches(batch_size=50)).to_pandas()

print("🌟 GOLDEN TEST PROMPTS FROM YOUR DATABASE 🌟\n")
for index, row in df.head(10).iterrows():
    query_text = row.get("query", "").strip()
    
    # Extract passage safely
    passages = row.get("passages", {})
    trans_passages = passages.get("Translated_passages", []) if isinstance(passages, dict) else getattr(passages, "Translated_passages", [])
    
    if query_text and trans_passages and str(trans_passages[0]).strip():
        print(f"🎤 You Ask: {query_text}")
        print(f"📄 DB Has: {str(trans_passages[0]).strip()[:100]}...\n")
