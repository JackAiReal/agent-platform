import contextlib
import shlex
import shutil
import struct
import subprocess
import wave
from pathlib import Path
from typing import Callable, Tuple

from app.config import RVC_INFER_CMD


class PipelineError(RuntimeError):
    pass


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def run_cmd(cmd: list[str], cwd: Path | None = None):
    proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True)
    if proc.returncode != 0:
        raise PipelineError(
            f"Command failed: {' '.join(shlex.quote(c) for c in cmd)}\n"
            f"stdout: {proc.stdout[-1200:]}\n"
            f"stderr: {proc.stderr[-1200:]}"
        )


def normalize_to_wav(src: Path, out_wav: Path):
    if has_ffmpeg():
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ar",
            "44100",
            "-ac",
            "2",
            "-vn",
            str(out_wav),
        ]
        run_cmd(cmd)
        return

    if src.suffix.lower() != ".wav":
        raise PipelineError("未检测到 ffmpeg，当前仅支持上传 WAV。请安装 ffmpeg 后再上传 mp3/m4a。")
    shutil.copy(src, out_wav)


def find_demucs_outputs(root: Path) -> Tuple[Path | None, Path | None]:
    vocals = None
    instrumental = None
    for p in root.rglob("*.wav"):
        name = p.name.lower()
        if name == "vocals.wav":
            vocals = p
        elif name in ("no_vocals.wav", "instrumental.wav"):
            instrumental = p
    return vocals, instrumental


def separate_vocals(input_wav: Path, work_dir: Path) -> Tuple[Path, Path]:
    demucs = shutil.which("demucs")
    if demucs is None:
        # fallback path for first-run local debugging
        return input_wav, input_wav

    output_dir = work_dir / "separated"
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        demucs,
        "--two-stems=vocals",
        "-o",
        str(output_dir),
        str(input_wav),
    ]
    run_cmd(cmd)

    vocals, instrumental = find_demucs_outputs(output_dir)
    if not vocals or not instrumental:
        # fallback if demucs output pattern differs
        return input_wav, input_wav

    return vocals, instrumental


def convert_voice(vocals_wav: Path, model_name: str, pitch_shift: int, out_wav: Path):
    if not RVC_INFER_CMD:
        shutil.copy(vocals_wav, out_wav)
        return

    cmd_str = RVC_INFER_CMD.format(
        input=str(vocals_wav),
        output=str(out_wav),
        model=model_name,
        pitch=pitch_shift,
    )
    proc = subprocess.run(cmd_str, shell=True, capture_output=True, text=True)
    if proc.returncode != 0:
        raise PipelineError(
            f"RVC infer failed. cmd={cmd_str}\nstdout: {proc.stdout[-1200:]}\nstderr: {proc.stderr[-1200:]}"
        )


def _mix_wav_python(instrumental_wav: Path, converted_vocals_wav: Path, out_wav: Path):
    with contextlib.closing(wave.open(str(instrumental_wav), "rb")) as wf1, contextlib.closing(
        wave.open(str(converted_vocals_wav), "rb")
    ) as wf2:
        p1 = wf1.getparams()
        p2 = wf2.getparams()
        if (p1.nchannels, p1.sampwidth, p1.framerate) != (p2.nchannels, p2.sampwidth, p2.framerate):
            raise PipelineError("无 ffmpeg 模式下，伴奏与人声 WAV 参数必须一致。")

        if p1.sampwidth != 2:
            raise PipelineError("无 ffmpeg 模式下，仅支持 16-bit PCM WAV。")

        frames1 = wf1.readframes(wf1.getnframes())
        frames2 = wf2.readframes(wf2.getnframes())

        if len(frames1) < len(frames2):
            frames1 += b"\x00" * (len(frames2) - len(frames1))
        elif len(frames2) < len(frames1):
            frames2 += b"\x00" * (len(frames1) - len(frames2))

        sample_count = len(frames1) // 2
        s1 = struct.unpack("<" + "h" * sample_count, frames1)
        s2 = struct.unpack("<" + "h" * sample_count, frames2)

        out_samples = []
        for a, b in zip(s1, s2):
            v = int((a + b) * 0.5)
            if v > 32767:
                v = 32767
            elif v < -32768:
                v = -32768
            out_samples.append(v)

        mixed = struct.pack("<" + "h" * sample_count, *out_samples)

        with contextlib.closing(wave.open(str(out_wav), "wb")) as out:
            out.setparams(p1)
            out.writeframes(mixed)


def mixdown(instrumental_wav: Path, converted_vocals_wav: Path, out_wav: Path, out_mp3: Path):
    if has_ffmpeg():
        mix_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(instrumental_wav),
            "-i",
            str(converted_vocals_wav),
            "-filter_complex",
            "[0:a]volume=1.0[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2,alimiter=limit=0.95[a]",
            "-map",
            "[a]",
            "-ar",
            "44100",
            "-ac",
            "2",
            str(out_wav),
        ]
        run_cmd(mix_cmd)

        mp3_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(out_wav),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(out_mp3),
        ]
        run_cmd(mp3_cmd)
        return

    _mix_wav_python(instrumental_wav, converted_vocals_wav, out_wav)
    shutil.copy(out_wav, out_mp3)


def run_pipeline(
    source_path: Path,
    work_dir: Path,
    voice_model: str,
    pitch_shift: int,
    progress: Callable[[int, str], None],
) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)

    normalized = work_dir / "source.wav"
    progress(10, "预处理音频")
    normalize_to_wav(source_path, normalized)

    progress(35, "分离人声与伴奏")
    vocals, inst = separate_vocals(normalized, work_dir)

    converted = work_dir / "vocals_converted.wav"
    progress(60, "AI音色转换")
    convert_voice(vocals, voice_model, pitch_shift, converted)

    out_wav = work_dir / "cover.wav"
    out_mp3 = work_dir / "cover.mp3"
    progress(85, "混音导出")
    mixdown(inst, converted, out_wav, out_mp3)

    progress(100, "完成")
    return out_mp3
