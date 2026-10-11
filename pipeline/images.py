"""AI-painted storybook pictures, one per illustration scene (the Body Unexplained look).

Free services, tried in turn: Gemini image models on GEMINI_API_KEY (each has its own small
free daily limit), then Pollinations (free, no account). Pictures are cached by prompt, so a
re-run spends nothing. A scene whose picture can't be made falls back to an animated story scene.
"""
import base64
import hashlib
import json
import os
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(os.environ.get("IMAGE_CACHE", Path(__file__).resolve().parent.parent / ".image-cache"))
API = "https://generativelanguage.googleapis.com/v1beta"
POLLINATIONS = "https://image.pollinations.ai/prompt/"

# One fixed style for the whole channel, so every picture looks like it came from the same book.
STYLE = (
    "Warm hand-drawn storybook illustration, watercolour wash with clean ink outlines, soft paper "
    "texture, muted sand, ochre, sage and sky-blue palette, gentle daylight, detailed period-accurate "
    "setting. The people are simple cartoon figures: a big plain round head, two dot eyes, expressive "
    "eyebrows and mouth, thin stick arms and legs, wearing period-accurate clothes. Wide 16:9 "
    "composition with the main character clearly acting out the moment. No text, no letters, no "
    "words, no captions, no watermark."
)
THUMB_STYLE = (
    "Bold YouTube thumbnail cartoon: thick black outlines, flat saturated colours, bright blue sky, "
    "warm yellow ground. One big round-head stick-figure character on the left with a huge "
    "exaggerated emotion (bulging eyes, sweat drops, stress lines), the subject large on the right, "
    "empty space at the top for a title. No text, no letters, no words."
)


class QuotaExceeded(RuntimeError):
    pass


def _key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts).encode()).hexdigest()


def _gemini_models() -> list[str]:
    """Image-capable Gemini models on this key, newest first (GEMINI_IMAGE_MODELS overrides)."""
    if os.environ.get("GEMINI_IMAGE_MODELS"):
        return os.environ["GEMINI_IMAGE_MODELS"].split(",")
    if not os.environ.get("GEMINI_API_KEY"):
        return []
    try:
        req = urllib.request.Request(f"{API}/models?pageSize=200", headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]})
        with urllib.request.urlopen(req, timeout=60) as r:
            models = json.loads(r.read()).get("models", [])
    except Exception as e:
        print(f"could not list Gemini models: {e}")
        return []
    names = [m["name"].split("/", 1)[1] for m in models
             if "image" in m["name"] and "generateContent" in m.get("supportedGenerationMethods", [])
             and "imagen" not in m["name"]]
    return sorted(names, reverse=True)


def _gemini(prompt: str, out: Path, model: str, aspect: str):
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
    }
    req = urllib.request.Request(f"{API}/models/{model}:generateContent", data=json.dumps(body).encode(), method="POST",
                                 headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                resp = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:400]
            if e.code == 429 and (b"per day" in msg.lower() or b"limit: 0" in msg or b"quota" in msg.lower() and attempt >= 1):
                raise QuotaExceeded(f"{model}: {msg[:160]!r}") from e
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(15 * (attempt + 1))
                continue
            raise RuntimeError(f"{model} {e.code}: {msg!r}") from e
    for cand in resp.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = (part.get("inlineData") or part.get("inline_data") or {}).get("data")
            if data:
                out.write_bytes(base64.b64decode(data))
                return
    raise RuntimeError(f"{model} returned no image: {str(resp)[:300]}")


def _pollinations(prompt: str, out: Path, seed: int, w: int, h: int):
    q = urllib.parse.urlencode({"width": w, "height": h, "seed": seed, "model": "flux", "nologo": "true", "enhance": "false"})
    url = POLLINATIONS + urllib.parse.quote(prompt[:1800]) + "?" + q
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "yt-channel-automation"}), timeout=240) as r:
                data = r.read()
            if len(data) > 10_000 and data[:3] in (b"\xff\xd8\xff", b"\x89PN"):
                out.write_bytes(data)
                return
            raise RuntimeError(f"not an image ({len(data)} bytes)")
        except Exception as e:
            if attempt == 4:
                raise RuntimeError(f"pollinations: {e}") from e
            time.sleep(10 * (attempt + 1))


class Painter:
    """Makes pictures with the first service that still works; remembers which ones ran out."""

    def __init__(self):
        self.models = _gemini_models()
        self.dead: set[str] = set()
        print(f"image services: {self.models + ['pollinations']}")

    def paint(self, description: str, out: Path, vertical: bool = False, thumb: bool = False, seed: int = 0) -> bool:
        out = Path(out)
        prompt = f"{THUMB_STYLE if thumb else STYLE} {'Tall 9:16 portrait composition.' if vertical else ''} Scene: {description}"
        hit = CACHE / f"{_key(prompt, vertical, seed)}.img"
        if hit.exists():
            shutil.copy(hit, out)
            return True
        w, h = (768, 1344) if vertical else (1344, 768)
        for svc in self.models + ["pollinations"]:
            if svc in self.dead:
                continue
            try:
                if svc == "pollinations":
                    _pollinations(prompt, out, seed + 1, w, h)
                else:
                    _gemini(prompt, out, svc, "9:16" if vertical else "16:9")
                CACHE.mkdir(parents=True, exist_ok=True)
                shutil.copy(out, hit)
                return True
            except QuotaExceeded as e:
                print(f"image service {svc} out of allowance: {e}")
                self.dead.add(svc)
            except Exception as e:
                print(f"image service {svc} failed: {e}")
                if svc != "pollinations":
                    self.dead.add(svc)
        return False


def illustrate(scenes: list[dict], job: Path, vertical: bool = False) -> list[dict]:
    """Paint every illustration scene into job/images; scenes without a picture become story scenes."""
    illus = [i for i, s in enumerate(scenes) if s["type"] == "illustration"]
    if not illus:
        return scenes
    (job / "images").mkdir(parents=True, exist_ok=True)
    painter = Painter()
    out = list(scenes)
    made = 0
    for n, i in enumerate(illus):
        s = scenes[i]
        path = job / "images" / f"i{i:02}.png"
        print(f"picture {n + 1}/{len(illus)}")
        if painter.paint(s.get("picture") or s["narration"], path, vertical, seed=i):
            out[i] = {**s, "type": "image", "src": f"images/{path.name}"}
            made += 1
        else:
            out[i] = {**s, "type": "story"}
    print(f"painted {made}/{len(illus)} pictures")
    return out
