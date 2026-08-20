# 🎙️ Echo-Sight: Real-Time Bilingual Voice RAG

![App UI](./public/ui-screenshot.png)

> An ultra-low-latency Voice RAG platform delivering bilingual (Hindi/English) answers in near real-time.

---

## 🚀 The Vision

Most Retrieval-Augmented Generation (RAG) systems are slow, text-bound, and restricted to English. Echo-Sight listens to a voice query, searches hundreds of thousands of documents instantly, and speaks the answer back in fluent **Hindi and English** — all in under a second.

---

## 🧠 How We Built It

The biggest bottleneck in any RAG pipeline is network latency during vector retrieval. To achieve sub-100ms retrieval, we bypassed cloud latency by edge-deploying a local **Qdrant** vector database directly on an **Azure VM**. Combined with **Groq's** LPU inference engine, we brought our vector retrieval latency down to just **62ms**.

**Two-phase query pipeline:**
- **Phase 1 — Fast Extractive Path:** Vector retrieval + BM25 re-ranking returns an immediate answer before the LLM even starts.
- **Phase 2 — Polished Synthesis:** Groq (Llama-3.1) generates a fluent bilingual response grounded in the retrieved evidence.

The frontend shows the fast answer immediately, then silently upgrades it with the LLM result — giving users the feeling of instant response with the quality of full generation.

---

## 🏗️ Architecture Flow

```
[User Voice] → [Sarvam AI STT (saaras:v3)] → [Hinglish/Hindi Transcript]
                                                         |
                                               [Groq Translation / Cleanup]
                                                         |
                                              [Local Qdrant (62ms retrieval)]
                                                         |
                                          [Groq LPU Generation (Llama-3.1)]
                                                         |
                                     [Bilingual Answer — Hindi + English]
```

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | Next.js on Vercel | Secure HTTPS UI, voice capture, streaming display |
| **Backend** | FastAPI on Azure VM | Orchestration, retrieval, synthesis |
| **Vector DB** | Qdrant (edge-deployed) | 62ms local retrieval over 778K passages |
| **LLM** | Groq (Llama-3.1 LPU) | Contextual generation + Hindi/English translation |
| **STT** | Sarvam AI saaras:v3 | High-accuracy Hindi speech-to-text |

> **Mixed Content solved:** The Vercel frontend proxies all backend calls through a Next.js server-side rewrite (`/api/backend/*` → `http://104.211.75.92:8000/*`), so the browser never makes an HTTP request directly.

---

## ⚡ Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/echo-sight.git
cd echo-sight

# Frontend dependencies
npm install

# Backend dependencies
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Description |
|---|---|
| `QDRANT_URL` | Qdrant cluster endpoint URL |
| `QDRANT_API_KEY` | Qdrant read/write access key |
| `GROQ_API_KEY` | Groq Cloud API key |
| `SARVAM_API_KEY` | Sarvam AI access key |
| `NEXT_PUBLIC_SARVAM_API_KEY` | Same as above (exposed to browser for WebSocket STT) |

### 3. Run

```bash
# Terminal 1 — Backend (FastAPI)
uvicorn api:app --reload --port 8000

# Terminal 2 — Frontend (Next.js)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> [!IMPORTANT]
> The backend expects a pre-populated Qdrant collection named `echo_sight_hindi_v4` configured for **384 dimensions** (Cosine distance) using the `paraphrase-multilingual-MiniLM-L12-v2` embedding model. Re-indexing the full MSMARCO-XI dataset (778K rows) takes significant time. See [DATA_PROVENANCE.md](DATA_PROVENANCE.md) for the full indexing history.

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `api.py` | FastAPI server — `/api/retrieve`, `/api/synthesize`, `/api/metrics` |
| `app/page.tsx` | Main Next.js UI — voice capture, two-phase display, evidence cards |
| `next.config.mjs` | Server-side proxy rewrite (`/api/backend/*` → Azure VM) |
| `corrected_indexer.py` | Production indexer that built the 778K-passage Qdrant collection |
| `validate_prod_cached.py` | 40-query LLM-as-a-judge accuracy validation (results cached in `val_cache.json`) |
| `benchmark.py` | Latency profiling — measures P50 / P70 / P100 across 100 queries |
| `regrade.py` | Post-hoc validation with consistency checks to correct judge labeling errors |
| `DATA_PROVENANCE.md` | Full history of indexing bugs, fixes, cluster migrations, and accuracy metrics |

---

## 📊 Performance

| Metric | Result |
|---|---|
| Vector retrieval (P50) | **62 ms** |
| Full pipeline (P70) | **~146 ms** |
| Corpus size | **778K passages** |
| Embedding model | `paraphrase-multilingual-MiniLM-L12-v2` (384-dim) |
| LLM | Groq Llama-3.1 (LPU) |
| STT | Sarvam saaras:v3 |

---

## 🛠️ Deployment

- **Frontend:** Deployed on [Vercel](https://vercel.com) — push to `main` triggers auto-deploy.
- **Backend:** Running on Azure VM via `uvicorn api:app --host 0.0.0.0 --port 8000`.
- **Qdrant:** Docker-deployed on the same Azure VM for zero-network-hop retrieval.

---

## 📜 License

MIT — see `LICENSE` for details.
