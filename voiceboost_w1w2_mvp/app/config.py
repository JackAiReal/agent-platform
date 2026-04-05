from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = DATA_DIR / "outputs"
CALIB_DIR = DATA_DIR / "calibration"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8010"))

for p in (DATA_DIR, UPLOAD_DIR, OUTPUT_DIR, CALIB_DIR):
    p.mkdir(parents=True, exist_ok=True)
