from __future__ import annotations

import wave
from pathlib import Path
import numpy as np


class WavError(RuntimeError):
    pass


def read_wav(path: Path) -> tuple[np.ndarray, int, int]:
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    if sample_width != 2:
        raise WavError("仅支持16-bit PCM WAV")

    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels)
    else:
        data = data.reshape(-1, 1)

    return data, sample_rate, channels


def write_wav(path: Path, audio: np.ndarray, sample_rate: int):
    audio = np.clip(audio, -1.0, 1.0)
    int16 = (audio * 32767.0).astype(np.int16)
    channels = int16.shape[1] if int16.ndim == 2 else 1

    if int16.ndim == 2:
        payload = int16.reshape(-1).tobytes()
    else:
        payload = int16.tobytes()

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(payload)
