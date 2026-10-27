import os
from pathlib import Path

# Load environment variables from .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent.parent

# API Key for Google Gemini / Gemma
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Upload directory configuration
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
if os.getenv("VERCEL"):
    upload_path = Path("/tmp") / UPLOAD_DIR
else:
    upload_path = BASE_DIR / UPLOAD_DIR
upload_path.mkdir(parents=True, exist_ok=True)
