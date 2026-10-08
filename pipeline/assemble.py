"""Post-render helpers: YouTube caption file and optional background music."""
import subprocess
from pathlib import Path


def _ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{s:06.3f}".replace(".", ",")


def write_srt(scenes: list[dict], durations: list[float], out: Path) -> Path:
    t, lines = 0.0, []
    for i, (scene, d) in enumerate(zip(scenes, durations), 1):
        lines += [str(i), f"{_ts(t)} --> {_ts(t + d)}", scene["narration"], ""]
        t += d
    out.write_text("\n".join(lines))
    return out


def add_music(video: Path, music: Path, out: Path, volume: float = 0.10) -> Path:
    """Loop a royalty-free track under the narration (YouTube Audio Library is free for monetised videos)."""
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-stream_loop", "-1", "-i", str(music),
        "-filter_complex", f"[1:a]volume={volume}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(out),
    ], check=True)
    return out
