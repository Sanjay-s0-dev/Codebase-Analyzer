# SQLAlchemy ORM + SQLite persistence
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

engine       = create_engine("sqlite:///./codebase_analyzer.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"
    job_id                = Column(String, primary_key=True, index=True)
    repo_url              = Column(String, index=True)
    status                = Column(String, default="pending")  # pending|running|completed|failed
    created_at            = Column(DateTime, default=datetime.utcnow)
    completed_at          = Column(DateTime, nullable=True)
    file_count            = Column(Integer, nullable=True)
    total_lines           = Column(Integer, nullable=True)
    analysis_time_seconds = Column(Float, nullable=True)
    result                = Column(JSON, nullable=True)
    error                 = Column(Text, nullable=True)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    # FastAPI dependency — yields session, closes on exit
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
