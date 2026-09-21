#!/usr/bin/env python3
"""Synthesises walkthrough narration with the Kokoro neural voice.

Reads a JSON array of narration lines on stdin, writes one WAV per line into
``--out-dir`` and prints ``{"sampleRate": int, "clips": [{"file", "duration"}]}``
on stdout. Model files are cached under ``--cache-dir`` and pinned by SHA-256.

Usage: python3 narrate_kokoro.py --out-dir DIR [--voice af_heart] [--speed 1.0]
Requires: pip install kokoro-onnx  (Kokoro-82M and its voices are Apache-2.0).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
import wave
from pathlib import Path

# Release assets of thewh1teagle/kokoro-onnx; the digests pin the exact files
# this script was validated against, so a tampered download is never loaded.
ASSETS = {
    "kokoro-v1.0.onnx": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
        "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
    ),
    "voices-v1.0.bin": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    ),
}


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def fetch(name: str, cache_dir: Path) -> Path:
    url, expected = ASSETS[name]
    target = cache_dir / name
    if target.exists() and digest(target) == expected:
        return target

    print(f"Downloading {name}...", file=sys.stderr)
    download = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(url) as response, download.open("wb") as handle:
        shutil.copyfileobj(response, handle)

    actual = digest(download)
    if actual != expected:
        download.unlink(missing_ok=True)
        raise SystemExit(f"{name} checksum mismatch: expected {expected}, got {actual}")

    download.replace(target)
    return target


def write_wav(path: Path, samples, sample_rate: int) -> float:
    import numpy as np

    pcm = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes((pcm * 32767.0).astype("<i2").tobytes())
    return len(pcm) / sample_rate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--lang", default="en-us")
    args = parser.parse_args()

    lines = json.load(sys.stdin)
    if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
        raise SystemExit("stdin must contain a JSON array of narration lines.")

    try:
        from kokoro_onnx import Kokoro
    except ImportError as error:  # pragma: no cover - environment guard
        raise SystemExit(
            "kokoro-onnx is not installed. Run `pip install kokoro-onnx`, "
            "or set WALKTHROUGH_TTS=espeak for the robotic fallback voice."
        ) from error

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    kokoro = Kokoro(str(fetch("kokoro-v1.0.onnx", cache_dir)), str(fetch("voices-v1.0.bin", cache_dir)))
    if args.voice not in kokoro.get_voices():
        raise SystemExit(f"Unknown voice {args.voice}. Available: {', '.join(sorted(kokoro.get_voices()))}")

    clips = []
    sample_rate = 24000
    for index, line in enumerate(lines):
        samples, sample_rate = kokoro.create(line, voice=args.voice, speed=args.speed, lang=args.lang)
        file = out_dir / f"narration-{index:02d}.wav"
        clips.append({"file": str(file), "duration": write_wav(file, samples, sample_rate)})

    json.dump({"sampleRate": sample_rate, "clips": clips}, sys.stdout)


if __name__ == "__main__":
    main()
