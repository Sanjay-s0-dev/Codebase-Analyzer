# httpx: async Groq calls; json: parse + serialize structured AI responses
import httpx, json, asyncio
from chunker import build_file_chunks, group_chunks_into_batches, format_batch_for_prompt
from config import settings

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}

async def _call_groq(system: str, user: str, max_tokens: int = 1500) -> str:
    payload = {"model": GROQ_MODEL, "max_tokens": max_tokens, "temperature": 0.2,
               "messages": [{"role":"system","content":system},{"role":"user","content":user}]}
    # Retry up to 4 times with exponential backoff on 429
    for attempt in range(4):
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(GROQ_URL, headers=_headers(), json=payload)
            if r.status_code == 429:
                wait = 10 * (2 ** attempt)  # 10s, 20s, 40s, 80s
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    raise Exception("Groq rate limit: max retries exceeded")

def _safe_json(text: str) -> dict:
    # Try direct parse, then extract between first { and last }, else return error stub
    for attempt in [lambda: json.loads(text),
                    lambda: json.loads(text[text.index("{") : text.rindex("}")+1])]:
        try: return attempt()
        except (ValueError, json.JSONDecodeError): pass
    return {"error": "Could not parse JSON", "raw": text[:300]}

# Prompts
BATCH_SYS = """Senior software architect. Analyze code files and return ONLY valid JSON:
{"languages":[],"frameworks":[],"patterns":[],
 "quality_notes":{"file_organization":"","naming_conventions":"","error_handling":"","documentation":"","complexity":""},
 "risk_areas":[{"file":"","issue":"","severity":"low|medium|high"}]}"""

SYNTH_SYS = """Synthesize partial code reviews into ONE unified JSON (no markdown, no prose):
{"tech_stack":{"languages":[],"frameworks":[],"libraries":[]},
 "architecture_pattern":"MVC|Microservices|Monolith|Serverless|Library|CLI|Other",
 "code_quality":{"overall_score":0-100,"file_organization":0-20,"naming_conventions":0-20,
                 "error_handling":0-20,"documentation":0-20,"complexity":0-20,
                 "rationale":"REQUIRED: 1-2 sentences explaining the score"},
 "risk_areas":[{"file":"","issue":"","severity":"low|medium|high"}],
 "summary":"REQUIRED: 2-3 sentences describing what this project does and its overall quality"}
Each subcategory is strictly scored 0-20. overall_score is exactly the sum of all five subcategories (max 100).
summary and rationale must never be empty strings."""

README_SYS = """Technical writer. Generate a complete README.md in plain Markdown (not JSON).
Include: title, description, tech stack, project structure, setup, usage, contributing."""

async def analyze_batch(batch: list[dict]) -> dict:
    raw = await _call_groq(BATCH_SYS, f"Analyze these files:\n\n{format_batch_for_prompt(batch)}", 1200)
    return _safe_json(raw)

async def synthesize_results(batch_results: list[dict], repo_meta: dict) -> dict:
    meta = f"Repo: {repo_meta.get('owner')}/{repo_meta.get('repo')} | Files: {repo_meta.get('files_analyzed')} | Lines: {repo_meta.get('total_lines')}"
    raw  = await _call_groq(SYNTH_SYS, f"{meta}\n\nPartials:\n{json.dumps(batch_results,indent=2)}")
    return _safe_json(raw)

async def generate_readme(analysis: dict, file_paths: list[str]) -> str:
    return await _call_groq(README_SYS,
        f"Analysis:\n{json.dumps(analysis,indent=2)}\n\nFiles:\n" + "\n".join(file_paths[:40]))

async def run_full_analysis(repo_data: dict) -> dict:
    # Chunk → batch → per-batch analysis → synthesize → optional README
    batches = group_chunks_into_batches(build_file_chunks(repo_data["files"]), 8_000)
    results = []
    for i, batch in enumerate(batches):
        results.append(await analyze_batch(batch))
        if i < len(batches)-1: await asyncio.sleep(10.0)  # avoid Groq rate limits

    final       = await synthesize_results(results, repo_data)
    file_paths  = [f["path"] for f in repo_data["files"]]
    has_readme  = any("readme" in p.lower() for p in file_paths)
    final["generated_readme"] = None if has_readme else await generate_readme(final, file_paths)
    return final
