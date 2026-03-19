# python-dotenv: loads .env into os.environ; os: reads env vars
from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    groq_api_key  = os.getenv("GROQ_API_KEY", "")
    github_token  = os.getenv("GITHUB_TOKEN")
    max_files     = int(os.getenv("MAX_FILES", 20))
    chunk_size    = int(os.getenv("CHUNK_SIZE", 4500))
    chunk_overlap = int(os.getenv("CHUNK_OVERLAP", 300))

settings = Settings()
