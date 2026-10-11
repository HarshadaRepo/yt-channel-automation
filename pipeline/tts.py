"""Narration. Free voices, tried in this order until one has allowance left (see chain()):
Gemini TTS models in turn (each has its own daily limit), then Chatterbox, then Kokoro.

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
import hashlib
import shutil
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
# Each Gemini TTS model has its own free daily limit, so they are tried in turn before the open-source voices.
GEMINI_MODELS = os.environ.get(
    "GEMINI_TTS_MODELS", "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview").split(",")
# Chatterbox clones this narrator sample so the open-source fallback sounds like the usual narrator.
NARRATOR_SAMPLE = Path(__file__).resolve().parent.parent / "assets" / "narrator.wav"
CACHE = Path(os.environ.get("TTS_CACHE", Path(__file__).resolve().parent.parent / ".tts-cache"))
NARRATOR = ("Top YouTube explainer narrator telling a gripping true story to a friend: brisk, energetic, "
            "confident pace (about 170 words a minute), warm and curious, punchy emphasis on surprising words, "
            "short natural pauses only, never slow, drawn-out, flat or robotic.")
PACING = "Keep a brisk, lively pace with short pauses; never slow or drawn-out."
# Every voice is sped up a little after synthesis and long silences are shortened, so the
# narration moves at the pace of popular explainer channels. 1.0 keeps the raw speed.
PACE = float(os.environ.get("NARRATION_PACE", "1.08"))
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


class QuotaExceeded(RuntimeError):
    """The voice service's daily allowance is used up; try the next one."""


def _gemini(text: str, out_wav: Path, voice: str, style: str | None, model: str = GEMINI_MODELS[0],
            narrator: str | None = None):
    body = {
        "model": model,
        "input": [{"type": "user_input", "content": [{
            "type": "text", "text": text,
            "annotations": [{"type": "speech_metadata", "style": f"{narrator or NARRATOR} {PACING} {style or ''}".strip()}],
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
            msg = e.read()[:500]
            # Per-minute limits clear quickly; the free tier's daily cap does not, so stop at once.
            if e.code == 429 and b"per day" in msg:
                raise QuotaExceeded(f"{model}: daily limit reached") from e
            if e.code in (429, 500, 503) and attempt < 5:
                time.sleep(20 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini TTS {model} {e.code}: {msg!r}") from e
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
    elif backend == "chatterbox":
        _chatterbox(text, out_wav, style)
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


# Characters of narration per Gemini request (about 2.5 minutes of audio).
CHUNK_CHARS = int(os.environ.get("TTS_CHUNK_CHARS", "2200"))


def chain(backend: str | None = None) -> list[str]:
    """Voices to try, best first. 'gemini' expands to every Gemini TTS model."""
    if backend == "gemini":
        return [f"gemini:{m}" for m in GEMINI_MODELS]
    if backend:
        return [backend]
    first = [f"gemini:{m}" for m in GEMINI_MODELS] if os.environ.get("GEMINI_API_KEY") else []
    return first + ["chatterbox", "kokoro"]


def synth_scenes(scenes: list[dict], audio_dir: Path, backend: str | None = None, voice: str | None = None,
                 speed: float = 1.0, narrator: str | None = None) -> list[Path]:
    """Voice every scene with the best voice that still has allowance left; returns one WAV per scene.

    A whole video always uses one voice: if a voice runs out part-way, it starts again with the next.
    Finished audio is cached by its text, so a re-run after a failed build spends no allowance.
    """
    audio_dir = Path(audio_dir)
    outs = [audio_dir / f"s{i:02}.wav" for i in range(len(scenes))]
    errors = []
    for b in chain(backend):
        try:
            if b.startswith("gemini:"):
                _gemini_scenes(scenes, outs, b.split(":", 1)[1], voice, narrator)
            else:
                keys = [_key(b, voice, speed, sc["narration"], sc.get("delivery")) for sc in scenes]
                todo = [i for i, (k, out) in enumerate(zip(keys, outs)) if not _from_cache(k, out)]
                if b == "chatterbox" and todo:  # one process for all scenes: the model loads once
                    _chatterbox_many([(scenes[i]["narration"], outs[i], scenes[i].get("delivery")) for i in todo])
                for i in todo:
                    if b != "chatterbox":
                        print(f"voice ({b}) {i + 1}/{len(scenes)}")
                        synth(scenes[i]["narration"], outs[i], b, voice if b == "kokoro" else None, speed, scenes[i].get("delivery"))
                    else:
                        _normalize(outs[i])
                    _to_cache(keys[i], outs[i])
            for out in outs:
                _tighten(out)
            print(f"narration voiced with {b}")
            return outs
        except Exception as e:  # out of allowance or broken: fall through to the next voice
            print(f"voice {b} unavailable: {e}")
            errors.append(f"{b}: {e}")
    raise RuntimeError("no voice available:\n" + "\n".join(errors))


def _gemini_scenes(scenes: list[dict], outs: list[Path], model: str, voice: str | None,
                   narrator: str | None = None):
    # Gemini's free tier allows only ~10 requests a day per model, so scenes are voiced in a few
    # batches (one request each) and each batch is cut back into scenes at the pauses between them.
    groups, cur, size = [], [], 0
    for i, sc in enumerate(scenes):
        if cur and size + len(sc["narration"]) > CHUNK_CHARS:
            groups.append(cur)
            cur, size = [], 0
        cur.append(i)
        size += len(sc["narration"])
    groups.append(cur)
    for g, idx in enumerate(groups):
        text = "\n\n".join(scenes[i]["narration"] for i in idx)
        style = "Delivery, part by part: " + "; ".join(scenes[i].get("delivery") or "natural" for i in idx) + \
            ". Leave a short pause between paragraphs."
        whole = outs[idx[0]].with_name(f"batch{g:02}.wav")
        key = _key(model, voice, 1.0, text, style, narrator)
        if not _from_cache(key, whole):
            print(f"voice batch {g + 1}/{len(groups)} with {model} (scenes {idx[0] + 1}-{idx[-1] + 1})")
            _gemini(text, whole, voice or "Charon", style, model, narrator)
            _to_cache(key, whole)
        _split(whole, [len(plain(scenes[i]["narration"])) for i in idx], [outs[i] for i in idx])
        whole.unlink()
    for out in outs:
        _normalize(out)


def _key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts, ensure_ascii=False).encode()).hexdigest()


def _from_cache(key: str, out: Path) -> bool:
    hit = CACHE / f"{key}.wav"
    if hit.exists():
        shutil.copy(hit, out)
        return True
    return False


def _to_cache(key: str, wav: Path):
    CACHE.mkdir(parents=True, exist_ok=True)
    shutil.copy(wav, CACHE / f"{key}.wav")


CHATTERBOX_VENV = Path(os.environ.get("CHATTERBOX_VENV", Path(__file__).resolve().parent.parent / ".venv-chatterbox"))


def _chatterbox(text: str, out_wav: Path, style: str | None):
    _chatterbox_many([(text, Path(out_wav), style)])


def _chatterbox_many(items: list[tuple[str, Path, str | None]]):
    """Open-source Chatterbox (MIT): expressive, runs on CPU, no key or limit.

    It lives in its own virtualenv, created on first use, because it pins torch and numpy versions
    that would break Kokoro. It clones assets/narrator.wav so it sounds like the usual narrator.
    """
    py = CHATTERBOX_VENV / "bin" / "python"
    if not py.exists():
        print("installing Chatterbox (first use)...")
        subprocess.run(["python3", "-m", "venv", str(CHATTERBOX_VENV)], check=True)
        subprocess.run([str(py), "-m", "pip", "install", "-q", "chatterbox-tts", "setuptools<81",
                        "--extra-index-url", "https://download.pytorch.org/whl/cpu"], check=True)
    ref = str(NARRATOR_SAMPLE) if NARRATOR_SAMPLE.exists() else None
    jobs = []
    for text, out, style in items:
        mood = (style or "").lower()
        ex = 0.7 if any(w in mood for w in ("excit", "urgent", "dramatic", "tense", "quick")) else \
            0.35 if any(w in mood for w in ("hushed", "solemn", "slow", "calm", "quiet")) else 0.5
        jobs.append({"text": plain(text), "out": str(out), "exaggeration": ex, "ref": ref})
    spec = Path(items[0][1]).with_name("chatterbox_jobs.json")
    spec.write_text(json.dumps(jobs))
    subprocess.run([str(py), str(Path(__file__).with_name("chatterbox_worker.py")), str(spec)], check=True)
    spec.unlink()
    for _, out, _ in items:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out), "-ar", "24000", "-ac", "1",
                        str(out.with_suffix(".tmp.wav"))], check=True)
        out.with_suffix(".tmp.wav").replace(out)


def _split(wav: Path, weights: list[int], outs: list[Path]):
    """Cut a batch into scenes: aim for the character-share boundary, snap to the nearest pause."""
    total = duration(wav)
    log = subprocess.run(["ffmpeg", "-i", str(wav), "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    gaps = [(s + e) / 2 for s, e in zip(starts, ends)]
    cuts, acc, prev = [0.0], 0, 0.0
    for w in weights[:-1]:
        acc += w
        target = total * acc / sum(weights)
        near = [x for x in gaps if x > prev + 0.5 and abs(x - target) < max(1.5, total * 0.12)]
        prev = min(near, key=lambda x: abs(x - target)) if near else target
        cuts.append(prev)
    cuts.append(total)
    for out, a, b in zip(outs, cuts, cuts[1:]):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ss", f"{a:.3f}", "-to", f"{b:.3f}",
                        "-ar", "24000", "-ac", "1", str(out)], check=True)


def _tighten(wav: Path):
    """Trim the silence around a scene, cap pauses inside it, then apply PACE (pitch kept)."""
    tmp = wav.with_suffix(".tight.wav")
    trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    filters = [trim, "areverse", trim, "areverse",
               # pauses longer than 0.4 s are cut back to 0.4 s
               "silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.4:stop_silence=0.4"]
    if abs(PACE - 1) > 0.01:
        filters.append(f"atempo={PACE:.3f}")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", ",".join(filters),
                    "-ar", "24000", "-ac", "1", str(tmp)], check=True)
    if duration(tmp) > 0.3:  # never replace a scene with silence
        tmp.replace(wav)
    else:
        tmp.unlink()


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
