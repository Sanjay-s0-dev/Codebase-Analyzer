# httpx: async HTTP client; base64: decode GitHub blob content
import httpx, base64, asyncio
from pathlib import Path
from typing import Optional
from config import settings

CODE_EXTENSIONS = {
    ".py",".js",".ts",".jsx",".tsx",".java",".go",".rs",".cpp",".c",".h",
    ".cs",".rb",".php",".swift",".kt",".scala",".sh",".yaml",".yml",
    ".toml",".json",".sql",".graphql",".proto",".tf",".md"
}
SKIP_DIRS  = {"node_modules",".git","__pycache__",".venv","venv","dist","build",
              ".next","coverage",".pytest_cache","target","vendor"}
SKIP_FILES = {"package-lock.json","yarn.lock","poetry.lock","Pipfile.lock",
              "Cargo.lock","go.sum","composer.lock",".DS_Store"}

def _headers() -> dict:
    # Inject GitHub token if configured (raises rate limit 60→5000 req/hr)
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h

def _parse_url(url: str) -> tuple[str, str]:
    # Handles https://github.com/owner/repo and bare owner/repo forms
    url = url.rstrip("/").replace("https://","").replace("http://","")
    parts = url.split("/")
    if "github.com" in parts:
        i = parts.index("github.com")
        return parts[i+1], parts[i+2].replace(".git","")
    return parts[-2], parts[-1].replace(".git","")

def _is_code(path: str) -> bool:
    p = Path(path)
    if any(part in SKIP_DIRS for part in p.parts): return False
    if p.name in SKIP_FILES: return False
    return p.suffix.lower() in CODE_EXTENSIONS

async def fetch_repo_files(repo_url: str, max_files: int = 20) -> dict:
    owner, repo = _parse_url(repo_url)
    headers     = _headers()

    # Git Trees API: one request for the full recursive file tree
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1",
            headers=headers
        )
        r.raise_for_status()
        all_blobs = [i for i in r.json().get("tree",[]) if i.get("type")=="blob"]

    code_blobs = [b for b in all_blobs if _is_code(b["path"])]
    selected   = sorted(code_blobs, key=lambda b: b.get("size",0), reverse=True)[:max_files]

    files = []
    async with httpx.AsyncClient(timeout=20) as client:
        for blob in selected:
            # Contents API returns file as base64-encoded string
            r = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{blob['path']}",
                headers=headers
            )
            if r.status_code != 200: continue
            data = r.json()
            if data.get("encoding") != "base64": continue
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            files.append({"path": blob["path"], "content": content,
                          "lines": content.count("\n")+1, "size": blob.get("size",0)})
            await asyncio.sleep(0.3)  # ~3 req/s, stays within rate limits

    return {
        "owner": owner, "repo": repo,
        "total_files_in_repo": len(all_blobs),
        "code_files_found": len(code_blobs),
        "files_analyzed": len(files),
        "total_lines": sum(f["lines"] for f in files),
        "files": files,
    }
