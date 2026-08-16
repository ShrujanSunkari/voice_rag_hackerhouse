# Echo-Sight: Bilingual Voice RAG for Hindi

Echo-Sight is a real-time Bilingual Voice Retrieval-Augmented Generation (RAG) system tailored for Hindi voice queries. It supports voice ingestion, transcribes speech using Sarvam AI, translates Hinglish/English queries to clean Hindi via Groq (Llama-3.1), retrieves relevant passages from Qdrant Cloud vector database, and generates a structured bilingual (Hindi and English) response.

---

## System Architecture

```
[User Voice Input] -> [Sarvam AI STT (saaras:v3)] -> [Transcript (Hinglish/Hindi)]
                                                              |
                                                     [Groq Translation]
                                                              |
[Bilingual Answer] <- [Groq Gen (Llama-3.1)] <- [Qdrant v4 Index Search (Limit=10)]
```

For a comprehensive history of the data indexing bugs, fixes, cluster migration, and validation metrics, refer to [DATA_PROVENANCE.md](DATA_PROVENANCE.md).

---

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm/pnpm

### 1. Clone & Setup Repository
```bash
git clone <repository-url>
cd voice_rag_interface
```

### 2. Backend Environment Setup (Python)
Create a Python virtual environment and install the required dependencies:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Unix/macOS
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 3. Frontend Environment Setup (Node.js)
Install the Next.js dependencies:
```bash
npm install
# or
pnpm install
```

### 4. Configuration (.env)
Copy the environment template and populate it with your actual credentials:
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `QDRANT_URL`: The endpoint URL of your Qdrant cluster.
- `QDRANT_API_KEY`: Your Qdrant Cloud cluster write/read access key.
- `GROQ_API_KEY`: Your Groq Cloud API key.
- `SARVAM_API_KEY`: Your Sarvam AI access key.
- `NEXT_PUBLIC_SARVAM_API_KEY`: (Frontend key) same as `SARVAM_API_KEY`.

### 5. Pre-Existing Data Note
> [!IMPORTANT]
> The backend expects a pre-populated Qdrant collection named `echo_sight_hindi_v4` configured for **384 dimensions** (Cosine distance) using the `paraphrase-multilingual-MiniLM-L12-v2` embedding model.
>
> Re-indexing the full MSMARCO-XI dataset (778K rows) requires significant time and storage. For instructions on how the production collection was built, see the **Data Provenance** details in [DATA_PROVENANCE.md](DATA_PROVENANCE.md).

---

## How to Run

### Run the Backend (FastAPI)
Activate your virtual environment and start the FastAPI server:
```bash
# Windows
venv\Scripts\activate
uvicorn api:app --reload --port 8000

# Unix/macOS
source venv/bin/activate
uvicorn api:app --reload --port 8000
```
The API docs will be available at `http://localhost:8000/docs`.

### Run the Frontend (Next.js)
Start the Next.js development server:
```bash
npm run dev
# or
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the Voice RAG UI.

---

## Active Pipelines and Utility Scripts
- `api.py`: FastAPI server exposing endpoints `/api/query` (text search + generation) and `/api/voice` (raw audio speech-to-text + retrieval + generation).
- `validate_prod_cached.py`: Utility to run the 40-query LLM-as-a-judge accuracy validation. Evaluates generation, retrieval, and guardrail performance locally, saving intermediate steps to `val_cache.json` for rate-limit-safe execution.
- `regrade.py`: Post-hoc validation script that runs the evaluation and enforces consistency checks to correct judge labeling errors.
- `benchmark.py`: Measures latency profile metrics (P50, P70, P100) across 100 benchmark queries.
