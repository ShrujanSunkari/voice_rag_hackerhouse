"""
Lexical overlap check analysis.

We calculate word-level Jaccard overlap between the query and the top retrieved chunk.
A low overlap means "the chunk doesn't contain the words from the query" — a cheap proxy
for semantic relevance without an LLM call.
"""
import re
from api import retrieve_context

refused_queries = [
    "को है बोलिवर, टी.एन.",
    "हम जनगणना ब्यूरो संख्या हैं",
    "क्या आप बांग्ला नामक भाषा बोल सकते हैं?",
    "एम्यूएड होम्योपैथिक क्या है?",
    "कौन सी काउंटी आर्डेन एन.सी. है",
    "कौन सी काउंटी बेलमोंट सीए है"
]

answerable_queries = [
    "आइसो सेंसर का क्या अर्थ है",
    "व्यवसाय प्रक्रिया प्रबंधन क्या है",
    "नकारात्मक प्रतिक्रिया हृदय गति को कैसे नियंत्रित करती है",
    "पहली श्रेणी का यौन उत्पीड़न क्या है",
    "शोध समन्वयक के लिए वेतन सीमा",
    "उपशीर्षक के साथ साहित्य समीक्षा कैसे लिखें",
    "औसत वेश्यावृत्ति शुल्क",
    "कौन सा वाद्य यंत्र बीथोवेन बजाया जाता है",
    "मातृभूमि सुरक्षा विभाग की आवश्यकता है",
    "त्वचा की जांच क्या है",
    "मनुष्य और चिम्पांजी वंशानुगत रूप से कैसे संबंधित हैं?",
    "आर्द्रता के आंकड़े एकत्र करने के लिए किस उपकरण का उपयोग किया जाता है?"
]

STOPWORDS = {"क्या", "है", "हैं", "की", "के", "का", "को", "में", "से", "और", "या",
             "यह", "वह", "आप", "हम", "एक", "इस", "उस", "जो", "पर", "के", "लिए",
             "कैसे", "कौन", "सी", "नामक"}

def tokenize(text):
    text = text.lower()
    tokens = set(re.split(r'[\s,।?!.;:\-/()]+', text))
    tokens -= STOPWORDS
    tokens -= {'', ' '}
    return tokens

def jaccard(q_tokens, chunk_tokens):
    if not q_tokens or not chunk_tokens:
        return 0.0
    inter = len(q_tokens & chunk_tokens)
    union = len(q_tokens | chunk_tokens)
    return inter / union if union else 0.0

output = []
output.append("=== JACCARD LEXICAL OVERLAP ANALYSIS ===\n")
output.append(f"{'Status':<12} {'Score':>7}  {'Jaccard':>8}  Query")
output.append("-" * 75)

for q in refused_queries:
    pts, _ = retrieve_context(q)
    chunk_text = pts[0].payload.get("text", "") if pts else ""
    score = pts[0].score if pts else 0
    jac = jaccard(tokenize(q), tokenize(chunk_text))
    output.append(f"{'REFUSED':<12} {score:>7.4f}  {jac:>8.4f}  {q[:45]}")

for q in answerable_queries:
    pts, _ = retrieve_context(q)
    chunk_text = pts[0].payload.get("text", "") if pts else ""
    score = pts[0].score if pts else 0
    jac = jaccard(tokenize(q), tokenize(chunk_text))
    output.append(f"{'ANSWERED':<12} {score:>7.4f}  {jac:>8.4f}  {q[:45]}")

with open("jaccard_analysis.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(output))

if __name__ == "__main__":
    pass
