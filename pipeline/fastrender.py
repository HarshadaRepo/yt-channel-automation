"""Fast renderer for picture-only videos: ffmpeg instead of a headless browser.

Remotion renders about one frame a second on a GitHub runner (4 hours for a 6-minute video), which
uses up the free Actions minutes. A picture-only video is just slow camera moves over still
pictures, a fade between them and the narration (Hats 2026-10-22: no subtitles), so ffmpeg can make the same
thing in minutes. Each scene is encoded on its own (in parallel), then the clips are joined without
re-encoding and the narration is laid underneath.
"""

import json
import subprocess
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

FPS = 30
SR = 48000
MOVES = ("push", "flyover", "dolly", "orbit")


def can_render(scenes: list[dict]) -> bool:
    return bool(scenes) and all(s.get("type") == "image" and s.get("src") for s in scenes)


def _scene(job: Path, i: int, s: dict, vertical: bool, tmp: Path) -> Path:
    W, H = (1080, 1920) if vertical else (1920, 1080)
    n = int(s["durationInFrames"])
    cam = s.get("camera") if s.get("camera") in MOVES else MOVES[i % 4]
    e = f"(3*pow(on/{n},2)-2*pow(on/{n},3))"  # smoothstep over the scene, as in ImageScene
    drift = f"(1+0.035*on/{n})"  # the slow push-in every scene gets on entering
    zoom = {"push": f"(1.04+0.14*{e})", "dolly": f"(1.18-0.14*{e})"}.get(cam, "1.12")
    dx = {"flyover": f"(40-80*{e})", "orbit": f"(-40+80*{e})"}.get(cam, "0")
    dy = f"(-10*{e})" if cam in ("push", "dolly") else "0"
    clip = tmp / f"s{i:03}.mp4"
    # Work at twice the output size so the slow moves don't shimmer, then let zoompan scale down.
    vf = (
        f"scale={2 * W}:{2 * H}:force_original_aspect_ratio=increase:flags=lanczos,crop={2 * W}:{2 * H},"
        f"zoompan=z='{zoom}*{drift}':d={n}:s={W}x{H}:fps={FPS}"
        f":x='iw/2-iw/zoom/2-{dx}*iw/{W}':y='ih/2-ih/zoom/2-{dy}*ih/{H}',"
        f"fade=t=in:st=0:d={14 / FPS:.3f},format=yuv420p"
    )
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(job / s["src"]),
                    "-vf", vf, "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-r", str(FPS), "-an", str(clip)], check=True)
    return clip


def _narration(job: Path, scenes: list[dict], out: Path) -> None:
    """Each scene's voice starts with its picture, padded with silence to the scene's length."""
    parts = []
    for s in scenes:
        need = round(int(s["durationInFrames"]) / FPS * SR)
        pcm = np.zeros(need, dtype="<i2")
        if s.get("audio"):
            raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(job / s["audio"]), "-f", "s16le", "-ac", "1",
                                  "-ar", str(SR), "-"], capture_output=True, check=True).stdout
            voice = np.frombuffer(raw, "<i2")[:need]
            pcm[:len(voice)] = voice
        parts.append(pcm)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.concatenate(parts).tobytes())


def render(job: Path, vertical: bool = False) -> Path:
    """Render job/video.json (picture scenes only) to job/video.mp4, like animator/render.mjs does."""
    spec = json.loads((job / "video.json").read_text())
    scenes = spec["scenes"]
    tmp = job / "fast"
    tmp.mkdir(exist_ok=True)
    with ThreadPoolExecutor(3) as pool:
        clips = list(pool.map(lambda a: _scene(job, a[0], a[1], vertical, tmp), enumerate(scenes)))
    (tmp / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    _narration(job, scenes, tmp / "voice.wav")
    out = job / "video.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                    "-i", str(tmp / "voice.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "256k", "-ar", str(SR), "-ac", "2", "-shortest", str(out)], check=True)
    return out
