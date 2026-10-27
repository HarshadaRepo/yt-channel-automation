"""Fast renderer for picture-only videos: ffmpeg instead of a headless browser.

Remotion renders about one frame a second on a GitHub runner (4 hours for a 6-minute video), which
uses up the free Actions minutes. A picture-only video is just slow camera moves over still
pictures, a fade between them, word-by-word subtitles and the narration, so ffmpeg can make the same
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
FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
# Highlight colour of the word being spoken, per look (theme.ts accent2).
ACCENT2 = {"atlas": "#ffc94d", "ancient": "#f5c242", "mystery": "#9be0c4", "ocean": "#5ce1e6", "empire": "#ffd87a",
           "modern": "#3df0ff", "arctic": "#9fe8ff", "inferno": "#ffb03b"}
MOVES = ("push", "flyover", "dolly", "orbit")


def can_render(scenes: list[dict]) -> bool:
    return bool(scenes) and all(s.get("type") == "image" and s.get("src") for s in scenes)


def _ass_colour(hex_rgb: str, alpha: int = 0) -> str:
    r, g, b = hex_rgb[1:3], hex_rgb[3:5], hex_rgb[5:7]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def _ass_time(sec: float) -> str:
    cs = int(round(sec * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def _captions(text: str, frames: int, vertical: bool, accent: str, out: Path) -> None:
    """The same captions as the animator's <Captions>: a chunk of words with the spoken one highlighted."""
    import re

    words = [w for w in re.sub(r"<[^>]*>", " ", text).split() if w]
    W, H = (1080, 1920) if vertical else (1920, 1080)
    # libass draws Poppins smaller than a browser does at the same size; 1.85x matches the animator.
    size, margin_v, max_w = (round(66 * 1.85), 470, 960) if vertical else (round(46 * 1.85), 70, 1500)
    font = "Poppins ExtraBold" if vertical else "Poppins SemiBold"
    side = (W - max_w) // 2
    head = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\n"
        f"PlayResX: {W}\nPlayResY: {H}\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        f"Style: Cap,{font},{size},&H00FFFFFF,&H00FFFFFF,{_ass_colour('#0a0e16', 0x48)},&H00000000,0,0,0,0,100,100,0,0,"
        f"3,{16 if vertical else 13},0,2,{side},{side},{margin_v + 14},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = []
    if words:
        weights = [len(w) + 2 + (6 if re.search(r"[.,;:!?]$", w) else 0) for w in words]
        total = sum(weights)
        speech = max(1, frames - 10)
        starts, acc = [], 0
        for w in weights:
            starts.append(acc / total * speech)
            acc += w
        chunk = 4 if vertical else 7
        hi = _ass_colour(accent)
        for k, w in enumerate(words):
            a, b = starts[k] / FPS, (starts[k + 1] if k + 1 < len(words) else frames) / FPS
            c0 = k // chunk * chunk
            shown = " ".join(f"{{\\c{hi}&}}{x}{{\\c&HFFFFFF&}}" if c0 + j == k else x
                             for j, x in enumerate(words[c0:c0 + chunk]))
            lines.append(f"Dialogue: 0,{_ass_time(a)},{_ass_time(b)},Cap,,0,0,0,,{shown}")
    out.write_text(head + "\n".join(lines) + "\n")


def _scene(job: Path, i: int, s: dict, vertical: bool, accent: str, tmp: Path) -> Path:
    W, H = (1080, 1920) if vertical else (1920, 1080)
    n = int(s["durationInFrames"])
    cam = s.get("camera") if s.get("camera") in MOVES else MOVES[i % 4]
    e = f"(3*pow(on/{n},2)-2*pow(on/{n},3))"  # smoothstep over the scene, as in ImageScene
    drift = f"(1+0.035*on/{n})"  # the slow push-in every scene gets on entering
    zoom = {"push": f"(1.04+0.14*{e})", "dolly": f"(1.18-0.14*{e})"}.get(cam, "1.12")
    dx = {"flyover": f"(40-80*{e})", "orbit": f"(-40+80*{e})"}.get(cam, "0")
    dy = f"(-10*{e})" if cam in ("push", "dolly") else "0"
    ass = tmp / f"s{i:03}.ass"
    _captions(s.get("narration", ""), n, vertical, accent, ass)
    clip = tmp / f"s{i:03}.mp4"
    # Work at twice the output size so the slow moves don't shimmer, then let zoompan scale down.
    vf = (
        f"scale={2 * W}:{2 * H}:force_original_aspect_ratio=increase:flags=lanczos,crop={2 * W}:{2 * H},"
        f"zoompan=z='{zoom}*{drift}':d={n}:s={W}x{H}:fps={FPS}"
        f":x='iw/2-iw/zoom/2-{dx}*iw/{W}':y='ih/2-ih/zoom/2-{dy}*ih/{H}',"
        f"fade=t=in:st=0:d={14 / FPS:.3f},"
        f"subtitles={ass}:fontsdir={FONTS},format=yuv420p"
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
    accent = ACCENT2.get(spec.get("style", "atlas"), "#ffc94d")
    tmp = job / "fast"
    tmp.mkdir(exist_ok=True)
    with ThreadPoolExecutor(3) as pool:
        clips = list(pool.map(lambda a: _scene(job, a[0], a[1], vertical, accent, tmp), enumerate(scenes)))
    (tmp / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    _narration(job, scenes, tmp / "voice.wav")
    out = job / "video.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                    "-i", str(tmp / "voice.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "256k", "-ar", str(SR), "-ac", "2", "-shortest", str(out)], check=True)
    return out
