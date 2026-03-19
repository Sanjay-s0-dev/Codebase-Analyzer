
Analyze any public GitHub repository using AI. Point it at a repo, get back a structured breakdown of the tech stack, architecture, code quality scores, and potential risk areas — all as JSON.

Built with FastAPI and Groq (LLaMA-3). Results are cached in SQLite so re-analyzing the same repo is instant.

---

## What it does

- Fetches the full file tree of any public GitHub repo
- Filters out noise (node_modules, lock files, build output, etc.)
- Picks the top 20 most relevant files by size
- Chunks the code with overlap and sends it to Groq in batches
- Synthesizes everything into one structured JSON result
- Generates a README if the repo doesn't have one
- Caches results so the same repo isn't analyzed twice

---

## Stack

- **FastAPI** — REST API with background job processing
- **Groq** (LLaMA-3.3-70B) — code analysis and synthesis
- **SQLAlchemy** + SQLite — job storage and result caching
- **httpx** — async GitHub API and Groq API calls

---

## Setup

```bash
git clone https://github.com/Sanjay-s0-dev/Codebase-Analyzer
cd Codebase-Analyzer

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Fill in your GROQ_API_KEY and GITHUB_TOKEN
```

**Get your keys:**
- Groq API key → [console.groq.com](https://console.groq.com/keys)
- GitHub token → Settings → Developer Settings → Personal access tokens (no scopes needed)

```bash
uvicorn main:app --reload
```

Open `http://localhost:8000/docs` to use the Swagger UI.

---

## API

### `POST /analyze`
Submit a repo for analysis. Returns a job ID immediately.

```json
{ "repo_url": "https://github.com/owner/repo" }
```

```json
{
  "job_id": "4f344140-39dd-4836-...",
  "status": "pending",
  "message": "Poll GET /analysis/{job_id} for results."
}
```

### `GET /analysis/{job_id}`
Poll for results. Returns status while running, full JSON when done.

### `GET /history`
List all previously analyzed repos with metadata.

---

## Output structure

```json
{
  "tech_stack": {
    "languages": ["Python"],
    "frameworks": ["FastAPI", "Streamlit"],
    "libraries": []
  },
  "architecture_pattern": "Microservices",
  "code_quality": {
    "overall_score": 80,
    "file_organization": 16,
    "naming_conventions": 12,
    "error_handling": 16,
    "documentation": 16,
    "complexity": 20,
    "rationale": "Well structured with good separation of concerns..."
  },
  "risk_areas": [
    {
      "file": "app.py",
      "issue": "Hardcoded API key",
      "severity": "high"
    }
  ],
  "summary": "A RAG-based document Q&A system..."
}
```

---

## Project structure

```
Codebase-Analyzer/
├── main.py           # FastAPI app and endpoints
├── fetcher.py        # GitHub API — tree fetch and file content
├── chunker.py        # Text chunking with overlap and batch grouping
├── analyzer.py       # Groq API calls — batch analysis and synthesis
├── database.py       # SQLAlchemy models and session management
├── config.py         # Environment variable loading
├── requirements.txt
└── .env.example
```

---

## Notes

- Free Groq tier has rate limits — the analyzer adds delays between batches automatically
- Analysis takes 1-3 minutes depending on repo size
- Only public repos are supported
- GitHub token is optional but recommended (raises rate limit from 60 to 5000 req/hr)
