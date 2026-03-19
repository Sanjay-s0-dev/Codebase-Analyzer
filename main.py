# FastAPI + BackgroundTasks for async job execution without blocking the response
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
import uuid, time

from database import init_db, get_db, AnalysisJob
from fetcher  import fetch_repo_files
from analyzer import run_full_analysis

app = FastAPI(title="Codebase Analyzer API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def on_startup(): init_db()

class AnalyzeRequest(BaseModel):
    repo_url: str

# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

def _run_job(job_id: str, repo_url: str):
    # Runs in a thread — fetches repo then calls AI pipeline, updates job status throughout
    import asyncio
    from database import SessionLocal
    db, start = SessionLocal(), time.time()
    try:
        job = db.query(AnalysisJob).filter_by(job_id=job_id).first()
        job.status = "running"; db.commit()

        repo_data = asyncio.run(fetch_repo_files(repo_url))
        analysis  = asyncio.run(run_full_analysis(repo_data))
        elapsed   = round(time.time() - start, 2)

        job.status                = "completed"
        job.completed_at          = datetime.utcnow()
        job.file_count            = repo_data["files_analyzed"]
        job.total_lines           = repo_data["total_lines"]
        job.analysis_time_seconds = elapsed
        job.result = {"repo_url": repo_url, "owner": repo_data["owner"],
                      "repo": repo_data["repo"], "files_analyzed": repo_data["files_analyzed"],
                      "total_lines": repo_data["total_lines"],
                      "analysis_time_s": elapsed, "analysis": analysis}
        db.commit()
    except Exception as e:
        job = db.query(AnalysisJob).filter_by(job_id=job_id).first()
        job.status = "failed"; job.error = str(e); db.commit()
    finally:
        db.close()

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/analyze", summary="Start a new repo analysis")
async def start_analysis(req: AnalyzeRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    # Return cached result if the same repo was already analyzed successfully
    cached = (db.query(AnalysisJob)
                .filter_by(repo_url=req.repo_url, status="completed")
                .order_by(AnalysisJob.created_at.desc()).first())
    if cached:
        return {"job_id": cached.job_id, "status": "completed", "message": "Cached result available."}

    job_id = str(uuid.uuid4())
    db.add(AnalysisJob(job_id=job_id, repo_url=req.repo_url))
    db.commit()
    bg.add_task(_run_job, job_id, req.repo_url)
    return {"job_id": job_id, "status": "pending", "message": "Poll GET /analysis/{job_id} for results."}

@app.get("/analysis/{job_id}", summary="Get result or current status")
def get_analysis(job_id: str, db: Session = Depends(get_db)):
    job = db.query(AnalysisJob).filter_by(job_id=job_id).first()
    if not job: raise HTTPException(404, "Job not found")
    if job.status == "completed":
        return {"job_id": job.job_id, "status": job.status, "repo_url": job.repo_url,
                "analyzed_at": job.completed_at,
                "metadata": {"file_count": job.file_count, "total_lines": job.total_lines,
                             "analysis_time_seconds": job.analysis_time_seconds},
                "result": job.result}
    if job.status == "failed":
        return {"job_id": job.job_id, "status": "failed", "error": job.error}
    return {"job_id": job.job_id, "status": job.status, "message": "Analysis in progress…"}

@app.get("/history", summary="List all analyzed repos")
def get_history(db: Session = Depends(get_db)):
    # Returns summary rows ordered newest-first
    return [{"job_id": j.job_id, "repo_url": j.repo_url, "status": j.status,
             "created_at": j.created_at, "completed_at": j.completed_at,
             "file_count": j.file_count, "total_lines": j.total_lines,
             "analysis_time": j.analysis_time_seconds}
            for j in db.query(AnalysisJob).order_by(AnalysisJob.created_at.desc()).all()]

@app.get("/health")
def health(): return {"status": "ok"}
