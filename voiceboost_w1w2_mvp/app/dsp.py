from __future__ import annotations

import math
import numpy as np


def db_to_linear(db: float) -> float:
    return 10 ** (db / 20.0)


def rms_db(x: np.ndarray, eps: float = 1e-10) -> float:
    r = float(np.sqrt(np.mean(np.square(x)) + eps))
    return 20.0 * math.log10(max(r, eps))


def peak_db(x: np.ndarray, eps: float = 1e-10) -> float:
    p = float(np.max(np.abs(x)) + eps)
    return 20.0 * math.log10(max(p, eps))


def one_pole_highpass(x: np.ndarray, cutoff_hz: float, sr: int) -> np.ndarray:
    if cutoff_hz <= 0:
        return x
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    dt = 1.0 / sr
    alpha = rc / (rc + dt)

    y = np.zeros_like(x)
    y[0] = x[0]
    for i in range(1, len(x)):
        y[i] = alpha * (y[i - 1] + x[i] - x[i - 1])
    return y


def one_pole_lowpass(x: np.ndarray, cutoff_hz: float, sr: int) -> np.ndarray:
    if cutoff_hz <= 0:
        return x
    dt = 1.0 / sr
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    alpha = dt / (rc + dt)

    y = np.zeros_like(x)
    y[0] = alpha * x[0]
    for i in range(1, len(x)):
        y[i] = y[i - 1] + alpha * (x[i] - y[i - 1])
    return y


def noise_gate(x: np.ndarray, threshold_db: float, floor: float) -> np.ndarray:
    thr = db_to_linear(threshold_db)
    out = x.copy()
    mask = np.abs(out) < thr
    out[mask] *= floor
    return out


def compressor(
    x: np.ndarray,
    sr: int,
    threshold_db: float,
    ratio: float,
    attack_ms: float = 6.0,
    release_ms: float = 80.0,
) -> np.ndarray:
    thr = db_to_linear(threshold_db)
    attack = math.exp(-1.0 / max(1, int(sr * attack_ms / 1000.0)))
    release = math.exp(-1.0 / max(1, int(sr * release_ms / 1000.0)))

    env = 0.0
    gain = 1.0
    out = np.zeros_like(x)

    for i, s in enumerate(x):
        a = abs(float(s))
        if a > env:
            env = attack * env + (1 - attack) * a
        else:
            env = release * env + (1 - release) * a

        if env > thr:
            desired = (thr + (env - thr) / ratio) / max(env, 1e-9)
        else:
            desired = 1.0

        # smooth gain change a bit
        gain = 0.95 * gain + 0.05 * desired
        out[i] = s * gain

    return out


def de_esser(x: np.ndarray, sr: int, threshold: float, ratio: float) -> np.ndarray:
    # approximate sibilance band by high-band residual
    low = one_pole_lowpass(x, cutoff_hz=3800.0, sr=sr)
    high = x - low

    high_abs = np.abs(high)
    over = high_abs > threshold
    if np.any(over):
        reduced = high.copy()
        reduced[over] = np.sign(high[over]) * (
            threshold + (high_abs[over] - threshold) / max(ratio, 1.0)
        )
        return low + reduced
    return x


def limiter(x: np.ndarray, threshold: float = 0.92) -> np.ndarray:
    t = max(0.2, min(0.99, threshold))
    out = x.copy()
    over = np.abs(out) > t
    out[over] = np.sign(out[over]) * (t + (1 - t) * np.tanh((np.abs(out[over]) - t) / (1 - t)))
    return np.clip(out, -1.0, 1.0)


def process_channel(x: np.ndarray, sr: int, p: dict) -> np.ndarray:
    y = x.astype(np.float32)
    y *= db_to_linear(float(p.get("input_gain_db", 0.0)))
    y = noise_gate(y, float(p.get("noise_gate_threshold_db", -50.0)), float(p.get("noise_gate_floor", 0.2)))
    y = one_pole_highpass(y, float(p.get("highpass_hz", 80.0)), sr)
    y = de_esser(
        y,
        sr,
        threshold=float(p.get("deesser_threshold", 0.09)),
        ratio=float(p.get("deesser_ratio", 3.0)),
    )
    y = compressor(
        y,
        sr,
        threshold_db=float(p.get("compressor_threshold_db", -20.0)),
        ratio=float(p.get("compressor_ratio", 3.0)),
    )
    y *= db_to_linear(float(p.get("makeup_gain_db", 1.0)))
    y = limiter(y, threshold=float(p.get("limiter_threshold", 0.92)))
    return y


def process_audio(audio: np.ndarray, sr: int, params: dict) -> np.ndarray:
    # audio shape: [N, C]
    out = np.zeros_like(audio)
    for c in range(audio.shape[1]):
        out[:, c] = process_channel(audio[:, c], sr, params)
    return np.clip(out, -1.0, 1.0)


def detect_risks(audio: np.ndarray) -> dict:
    mono = np.mean(audio, axis=1)
    peak = float(np.max(np.abs(mono)))
    rms = float(np.sqrt(np.mean(np.square(mono)) + 1e-10))

    clipping_ratio = float(np.mean(np.abs(mono) > 0.98))
    low_volume = rms < 0.03

    return {
        "peak": peak,
        "rms": rms,
        "clipping_ratio": clipping_ratio,
        "risk_clipping": clipping_ratio > 0.002,
        "risk_too_low": low_volume,
    }
