from __future__ import annotations

from pathlib import Path
from typing import Optional
from uuid import uuid4
import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.calibration import auto_calibrate
from app.config import CALIB_DIR, DATA_DIR, OUTPUT_DIR, UPLOAD_DIR
from app.dsp import detect_risks, process_audio
from app.presets import PRESETS
from app.wav_io import WavError, read_wav, write_wav

app = FastAPI(title="VoiceBoost W1-W2 MVP", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/files", StaticFiles(directory=str(DATA_DIR)), name="files")


@app.get("/health")
def health():
    return {"ok": True, "product": "voiceboost-w1w2"}


@app.get("/presets")
def list_presets():
    return {"items": PRESETS}


@app.post("/calibrate")
async def calibrate(source: UploadFile = File(...)):
    req_id = uuid4().hex
    suffix = Path(source.filename or "sample.wav").suffix or ".wav"
    src = UPLOAD_DIR / f"{req_id}{suffix}"
    src.write_bytes(await source.read())

    try:
        audio, sr, _ = read_wav(src)
    except WavError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = auto_calibrate(audio, sr)
    result["request_id"] = req_id

    out_json = CALIB_DIR / f"{req_id}.json"
    out_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    return result


@app.post("/process")
async def process(
    source: UploadFile = File(...),
    preset: str = Form("chat"),
    calibration_json: Optional[str] = Form(None),
):
    if preset not in PRESETS:
        raise HTTPException(status_code=400, detail=f"preset must be one of {list(PRESETS.keys())}")

    req_id = uuid4().hex
    suffix = Path(source.filename or "sample.wav").suffix or ".wav"
    src = UPLOAD_DIR / f"{req_id}{suffix}"
    src.write_bytes(await source.read())

    try:
        audio, sr, _ = read_wav(src)
    except WavError as e:
        raise HTTPException(status_code=400, detail=str(e))

    params = dict(PRESETS[preset])
    if calibration_json:
        try:
            extra = json.loads(calibration_json)
            params.update(extra)
        except Exception:
            raise HTTPException(status_code=400, detail="calibration_json must be valid JSON")

    out = process_audio(audio, sr, params)
    risks = detect_risks(out)

    out_path = OUTPUT_DIR / f"{req_id}_processed.wav"
    write_wav(out_path, out, sr)

    return {
        "request_id": req_id,
        "preset": preset,
        "sample_rate": sr,
        "params": params,
        "risks": risks,
        "output_url": f"/files/outputs/{out_path.name}",
    }
