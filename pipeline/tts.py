"""Narration. Two free backends:

- gemini (default when GEMINI_API_KEY is set): Google's Gemini TTS, the most human-sounding
  free option. Each scene gets a delivery direction ("hushed and awed", "urgent, building
  tension") and inline cues like <short pause> or <breath>, so the voice rises and falls like a
  real narrator. Free API key: https://aistudio.google.com/apikey (free tier has daily limits,
  and Google may use free-tier content to improve its products).
  Narrator voices: Charon (informative), Sadaltager (knowledgeable), Algenib (gravelly),
  Gacrux (mature), Sulafat (warm), Kore (firm).
- kokoro: open-source Kokoro (Apache-2.0), offline on CPU, no key, but flatter delivery.
  Best-rated voices: af_heart, af_bella; male: am_michael, bm_george. Model (~350 MB)
  downloads once into models/.
"""
import base64
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

MODELS = Path(os.environ.get("YT_MODELS", Path(__file__).resolve().parent.parent / "models"))
KOKORO_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
GEMINI_MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
NARRATOR = ("Seasoned documentary narrator telling a gripping true story to a friend: warm, curious, "
            "natural conversational rhythm, real emphasis on surprising words, never flat or robotic.")
CUE = re.compile(r"<[^>]+>")
_kokoro = None


def default_backend() -> str:
    return "gemini" if os.environ.get("GEMINI_API_KEY") else "kokoro"


def plain(text: str) -> str:
    """Narration without inline delivery cues (for captions and voices that don't support them)."""
    return re.sub(r"\s{2,}", " ", CUE.sub(" ", text)).strip()


def _kokoro_model():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        MODELS.mkdir(exist_ok=True)
        for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
            if not (MODELS / f).exists():
                print(f"downloading {f} (first run only)...")
                urllib.request.urlretrieve(KOKORO_BASE + f, MODELS / f)
        _kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    return _kokoro


def _gemini(text: str, out_wav: Path, voice: str, style: str | None):
    body = {
        "model": GEMINI_MODEL,
        "input": [{"type": "user_input", "content": [{
            "type": "text", "text": text,
            "annotations": [{"type": "speech_metadata", "style": f"{NARRATOR} {style or ''}".strip()}],
        }]}],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": voice}]},
    }
    req = urllib.request.Request(GEMINI_URL, data=json.dumps(body).encode(), method="POST", headers={
        "x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:  # free tier rate limit: wait and retry
                time.sleep(20 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini TTS {e.code}: {e.read()[:500]!r}") from e
    data = next((c["data"] for s in resp.get("steps", []) for c in s.get("content", []) if c.get("data")), None)
    if not data:
        raise RuntimeError(f"Gemini TTS returned no audio: {str(resp)[:500]}")
    raw = out_wav.with_suffix(".gemini")
    raw.write_bytes(base64.b64decode(data))
    # Normalise whatever container comes back (WAV by default, raw 24 kHz PCM otherwise).
    is_wav = raw.read_bytes()[:4] == b"RIFF"
    src = ["-i", str(raw)] if is_wav else ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", str(raw)]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-ar", "24000", "-ac", "1", str(out_wav)], check=True)
    raw.unlink()


def synth(text: str, out_wav: Path, backend: str | None = None, voice: str | None = None,
          speed: float = 1.0, style: str | None = None) -> Path:
    out_wav = Path(out_wav)
    backend = backend or default_backend()
    if backend == "gemini":
        _gemini(text, out_wav, voice or "Charon", style)
    elif backend == "kokoro":
        import soundfile as sf

        voice = voice or "af_heart"
        lang = "en-gb" if voice.startswith("b") else "en-us"
        samples, sr = _kokoro_model().create(plain(text), voice=voice, speed=speed, lang=lang)
        sf.write(str(out_wav), samples, sr)
    else:
        raise ValueError(f"unknown TTS backend {backend}")
    _normalize(out_wav)
    return out_wav


def _normalize(wav: Path):
    """Even out loudness across scenes, near YouTube's playback level."""
    tmp = wav.with_suffix(".norm.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", "24000", "-ac", "1", str(tmp)], check=True)
    tmp.replace(wav)


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())
