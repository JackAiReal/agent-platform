from __future__ import annotations

import numpy as np

from app.dsp import rms_db, peak_db


def estimate_noise_floor_db(mono: np.ndarray, sr: int) -> float:
    win = max(256, int(sr * 0.05))  # 50ms
    vals = []
    for i in range(0, len(mono) - win, win):
        chunk = mono[i : i + win]
        vals.append(float(np.sqrt(np.mean(np.square(chunk)) + 1e-10)))
    if not vals:
        return -60.0
    vals = np.array(vals)
    p20 = np.percentile(vals, 20)
    return 20.0 * np.log10(max(p20, 1e-8))


def auto_calibrate(audio: np.ndarray, sr: int) -> dict:
    mono = np.mean(audio, axis=1)

    current_rms_db = rms_db(mono)
    current_peak_db = peak_db(mono)
    noise_floor_db = estimate_noise_floor_db(mono, sr)

    target_rms_db = -18.0
    input_gain_db = max(-6.0, min(10.0, target_rms_db - current_rms_db))

    # higher noise floor -> stronger gate
    gate_threshold_db = max(-45.0, min(-60.0 + (noise_floor_db + 60) * 0.8, -42.0))

    # dynamic range estimate
    crest = current_peak_db - current_rms_db
    if crest > 16:
        comp_ratio = 4.0
    elif crest > 12:
        comp_ratio = 3.0
    else:
        comp_ratio = 2.2

    compressor_threshold_db = max(-28.0, min(-16.0, current_rms_db - 2.0))
    makeup_gain_db = max(0.0, min(6.0, -16.0 - current_rms_db))

    return {
        "analysis": {
            "rms_db": round(current_rms_db, 2),
            "peak_db": round(current_peak_db, 2),
            "noise_floor_db": round(noise_floor_db, 2),
            "crest_factor_db": round(crest, 2),
        },
        "recommended": {
            "input_gain_db": round(input_gain_db, 2),
            "noise_gate_threshold_db": round(gate_threshold_db, 2),
            "noise_gate_floor": 0.25,
            "highpass_hz": 80.0,
            "deesser_threshold": 0.08,
            "deesser_ratio": 3.0,
            "compressor_threshold_db": round(compressor_threshold_db, 2),
            "compressor_ratio": round(comp_ratio, 2),
            "makeup_gain_db": round(makeup_gain_db, 2),
            "limiter_threshold": 0.92,
        },
    }
