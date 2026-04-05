from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"
TASK_DB_PATH = DATA_DIR / "tasks" / "tasks.json"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "1"))

# Optional external RVC inference command template.
# Example:
# export RVC_INFER_CMD='python /path/to/infer.py --input {input} --output {output} --model {model} --pitch {pitch}'
RVC_INFER_CMD = os.getenv("RVC_INFER_CMD", "")

for p in [DATA_DIR, UPLOAD_DIR, RESULT_DIR, TASK_DB_PATH.parent]:
    p.mkdir(parents=True, exist_ok=True)
