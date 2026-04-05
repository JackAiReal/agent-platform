import math
import random
import struct
import wave

sr = 44100
seconds = 8

with wave.open("demo.wav", "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)

    for i in range(sr * seconds):
        t = i / sr
        # voice-like fundamental + harmonics + small noise
        s = (
            0.38 * math.sin(2 * math.pi * 180 * t)
            + 0.18 * math.sin(2 * math.pi * 360 * t)
            + 0.10 * math.sin(2 * math.pi * 700 * t)
            + 0.04 * random.uniform(-1, 1)
        )
        s = max(-0.95, min(0.95, s))
        wf.writeframes(struct.pack("<h", int(s * 32767)))

print("demo.wav generated")
