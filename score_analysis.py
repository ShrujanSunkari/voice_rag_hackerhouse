import json
from api import retrieve_context

refused_queries = [
    "को है बोलिवर, टी.एन.",
    "हम जनगणना ब्यूरो संख्या हैं",
    "क्या आप बांग्ला नामक भाषा बोल सकते हैं?",
    "एम्यूएड होम्योपैथिक क्या है?",
    "कौन सी काउंटी आर्डेन एन.सी. है",
    "कौन सी काउंटी बेलमोंट सीए है"
]

# CORRECT from results_v4.txt, a mix to find threshold
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

output = []

output.append("\n=== KNOWN-UNANSWERABLE QUERIES (CORRECTLY-REFUSED by LLM) ===")
for q in refused_queries:
    pts, _ = retrieve_context(q)
    top = pts[0] if pts else None
    score = top.score if top else None
    text_snippet = (top.payload.get("text","")[:60] if top else "N/A").replace("\n"," ")
    output.append(f"  score={score:.4f}  Q: {q[:40]}")
    output.append(f"            chunk: {text_snippet}...")

output.append("\n=== KNOWN-ANSWERABLE QUERIES (CORRECT in LLM path) ===")
for q in answerable_queries:
    pts, _ = retrieve_context(q)
    top = pts[0] if pts else None
    score = top.score if top else None
    output.append(f"  score={score:.4f}  Q: {q[:40]}")

with open("score_analysis.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(output))

if __name__ == "__main__":
    pass
