"""AI-painted pictures, one per illustration scene, each showing what that sentence says.

Services, tried in turn:
- Cloudflare Workers AI (CF_ACCOUNT_ID + CF_API_TOKEN), free 10,000 neurons a day: FLUX.2 klein
  (sharper, follows the prompt far better, ~100 neurons a picture) for the first KLEIN_PICTURES
  pictures of a run, then FLUX.1 schnell (~60), so a long video still fits the daily allowance.
- Gemini image models, only when GEMINI_IMAGES=1: they need billing on the key (no free tier).
- Pollinations, only when POLLINATIONS=1: its anonymous tier now asks for payment after a
  couple of pictures and ignores most of the prompt (tested 2026-10-11).
Pictures are cached by prompt, so a re-run spends nothing. A scene whose picture can't be made
falls back to an animated story scene. When GEMINI_API_KEY is set, every picture is shown to a
Gemini vision model with its sentence; a picture that doesn't fit is painted once more.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path(os.environ.get("IMAGE_CACHE", Path(__file__).resolve().parent.parent / ".image-cache"))
API = "https://generativelanguage.googleapis.com/v1beta"
POLLINATIONS = "https://image.pollinations.ai/prompt/"
CF_MODELS = os.environ.get(
    "CF_IMAGE_MODELS", "@cf/black-forest-labs/flux-2-klein-4b,@cf/black-forest-labs/flux-1-schnell").split(",")
CHECK_MODELS = os.environ.get("GEMINI_CHECK_MODELS", "gemini-flash-lite-latest,gemini-flash-latest").split(",")
KLEIN_PICTURES = int(os.environ.get("KLEIN_PICTURES", "75"))
MAX_REPAINTS = int(os.environ.get("MAX_REPAINTS", "15"))  # per video, to stay inside the free allowance

# One fixed style for the whole channel, so every picture looks like it came from the same film.
# Hats 2026-10-13: pictures must be good quality and match the narration; no cartoon round-heads.
STYLE = (
    "Highly detailed cinematic digital painting, like a still from a big-budget history documentary: "
    "rich natural colour, dramatic but believable light, sharp focus, realistic human proportions and "
    "faces, historically accurate clothing, tools, buildings and landscape for the time and place. "
    "Wide 16:9 frame with one clear subject in the middle. No text, no letters, no words, no captions, "
    "no signature, no logo, no watermark, no borders."
)
THUMB_STYLE = (
    "Eye-catching YouTube thumbnail painting: one huge, dramatic, instantly readable subject, bold "
    "saturated colours, strong contrast and rim light, simple uncluttered background, empty space at "
    "the top for a title. Realistic proportions, cinematic. No maps, no labels, no signs, no books or "
    "documents. No text, no letters, no words, no logo, no play button."
)
SAFE = re.compile(r"\b(blood\w*|bloody|naked|nude|corpses?|dead bod\w*|gore|kill\w*|wound\w*|bath\w*|"
                  r"skin|flesh|sexy|torture\w*|executions?|beheaded|severed)\b", re.I)


class QuotaExceeded(RuntimeError):
    pass


class Unsafe(RuntimeError):
    """The model's safety filter rejected the prompt (often a false alarm on history words)."""


def _key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts).encode()).hexdigest()


def _gemini_models() -> list[str]:
    """Image-capable Gemini models on this key, newest first (GEMINI_IMAGE_MODELS overrides)."""
    if os.environ.get("GEMINI_IMAGE_MODELS"):
        return os.environ["GEMINI_IMAGE_MODELS"].split(",")
    if not os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_IMAGES") != "1":
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


def _multipart(fields: dict) -> tuple[bytes, str]:
    boundary = "----yt" + hashlib.sha1(json.dumps(fields).encode()).hexdigest()
    body = b"".join(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                    for k, v in fields.items()) + f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def _cloudflare(prompt: str, out: Path, seed: int, w: int, h: int, model: str):
    account = os.environ["CF_ACCOUNT_ID"].strip()
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"
    auth = f"Bearer {os.environ['CF_API_TOKEN'].strip()}"
    flux2 = "flux-2" in model  # FLUX.2 models take multipart form data and a fixed number of steps
    body = {"prompt": prompt[:2000], "seed": seed, "width": w, "height": h, **({} if flux2 else {"steps": 4})}

    def request():
        data, ctype = _multipart(body) if flux2 else (json.dumps(body).encode(), "application/json")
        return urllib.request.Request(url, data=data, method="POST", headers={"Authorization": auth, "Content-Type": ctype})

    req = request()
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:400]
            if e.code == 429 or b"neurons" in msg or b"allocation" in msg.lower():
                raise QuotaExceeded(f"cloudflare: {msg[:200]!r}") from e
            if b"NSFW" in msg:
                raise Unsafe(f"{model}: {msg[:160]!r}") from e
            # Each model accepts different options; drop the one it names and ask again.
            bad = re.search(rb"properties '([^']+)'", msg)
            names = [n.strip().lstrip("/") for n in bad.group(1).decode().split(",")] if bad else []
            if e.code == 400 and any(n in body for n in names):
                for n in names:
                    body.pop(n, None)
                req = request()
                continue
            # 409 "prediction failed" and 5xx are passing hiccups on Cloudflare's side.
            if e.code in (409, 500, 502, 503, 504) and attempt < 5:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"cloudflare {e.code}: {msg!r}") from e
    if data[:3] in (b"\xff\xd8\xff", b"\x89PN"):  # some models answer with the image itself
        out.write_bytes(data)
        return
    image = (json.loads(data).get("result") or {}).get("image")
    if not image:
        raise RuntimeError(f"cloudflare returned no image: {data[:300]!r}")
    out.write_bytes(base64.b64decode(image))


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
        self.services = ([f"cloudflare:{m}" for m in CF_MODELS] if os.environ.get("CF_ACCOUNT_ID") and os.environ.get("CF_API_TOKEN") else []) \
            + _gemini_models() + (["pollinations"] if os.environ.get("POLLINATIONS") == "1" else [])
        self.dead: set[str] = set()
        self.klein = 0
        print(f"image services: {self.services or 'none configured'}")

    def paint(self, description: str, out: Path, vertical: bool = False, thumb: bool = False, seed: int = 0) -> bool:
        out = Path(out)
        # The subject comes first: FLUX follows the start of a prompt most closely.
        prompt = f"{description.strip().rstrip('.')}. {'Tall 9:16 portrait composition. ' if vertical else ''}{THUMB_STYLE if thumb else STYLE}"
        hit = CACHE / f"{_key(prompt, vertical, seed)}.img"
        if hit.exists():
            shutil.copy(hit, out)
            return True
        for svc in self.services:
            if svc in self.dead or ("flux-2" in svc and self.klein >= KLEIN_PICTURES):
                continue
            try:
                if svc.startswith("cloudflare:"):
                    model = svc.split(":", 1)[1]
                    self.klein += "flux-2" in model
                    # klein is billed per 512px tile, so 1024x576 (upscaled in the video) keeps a whole
                    # video inside the free allowance; schnell is cheap enough for full size.
                    w, h = ((576, 1024) if vertical else (1024, 576)) if "flux-2" in model else ((768, 1344) if vertical else (1344, 768))
                    try:
                        _cloudflare(prompt, out, seed + 1, w, h, model)
                    except Unsafe as e:
                        print(f"safety filter: {e}; trying a gentler wording")
                        _cloudflare("Family-friendly. " + SAFE.sub("", prompt), out, seed + 1, w, h, model)
                elif svc == "pollinations":
                    _pollinations(prompt, out, seed + 1, *((768, 1344) if vertical else (1344, 768)))
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
                if svc.startswith("gemini"):
                    self.dead.add(svc)
        return False


class Checker:
    """Asks a Gemini vision model whether a picture shows what its sentence says. Never blocks a video:
    with no key, no quota or any error it simply approves."""

    def __init__(self):
        self.models = [m for m in CHECK_MODELS if m] if os.environ.get("GEMINI_API_KEY") else []

    def fits(self, image: Path, sentence: str, picture: str) -> tuple[bool, str]:
        prompt = (
            "This picture illustrates one sentence of a history/geography YouTube video.\n"
            f"Sentence: {sentence}\nWhat the picture was meant to show: {picture}\n"
            "Would a viewer hearing the sentence find the picture clearly related and correct? Fail it if it "
            "shows the wrong subject, era or place, if the main subject is missing, if people or animals are "
            "badly deformed (extra limbs, melted faces), or if it contains visible text or letters. Small "
            "artistic liberties are fine. Answer JSON: {\"fits\": true|false, \"problem\": \"...\"}"
        )
        body = {"contents": [{"parts": [
                    {"inlineData": {"mimeType": "image/png" if image.read_bytes()[:3] == b"\x89PN" else "image/jpeg",
                                    "data": base64.b64encode(image.read_bytes()).decode()}},
                    {"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
        waits = 0
        while self.models:
            model = self.models[0]
            req = urllib.request.Request(f"{API}/models/{model}:generateContent", data=json.dumps(body).encode(), method="POST",
                                         headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    resp = json.loads(r.read())
                text = resp["candidates"][0]["content"]["parts"][0]["text"]
                verdict = json.loads(text)
                return bool(verdict.get("fits", True)), str(verdict.get("problem", ""))[:160]
            except urllib.error.HTTPError as e:
                msg = e.read()[:400].lower()
                if e.code in (429, 500, 503) and b"per day" not in msg and waits < 3:
                    waits += 1  # per-minute limit or a hiccup: wait and ask again
                    time.sleep(20)
                    continue
                print(f"picture check with {model} unavailable ({e.code}); {'trying the next model' if len(self.models) > 1 else 'skipping checks'}")
                self.models.pop(0)
            except Exception as e:
                print(f"picture check failed: {e}")
                return True, ""
        return True, ""


def illustrate(scenes: list[dict], job: Path, vertical: bool = False) -> list[dict]:
    """Paint every illustration scene into job/images (a failed one reuses the nearest painted picture)."""
    illus = [i for i, s in enumerate(scenes) if s["type"] == "illustration"]
    if not illus:
        return scenes
    (job / "images").mkdir(parents=True, exist_ok=True)
    painter = Painter()
    if not painter.services:
        print("no image service configured (CF_ACCOUNT_ID/CF_API_TOKEN): pictures become story scenes")
        return [{**s, "type": "story"} if s["type"] == "illustration" else s for s in scenes]
    checker = Checker()
    out = list(scenes)
    made = repainted = 0
    failed = []
    for n, i in enumerate(illus):
        s = scenes[i]
        path = job / "images" / f"i{i:02}.png"
        desc = s.get("picture") or s["narration"]
        # a failed picture gets one more try with another seed before falling back
        if not (painter.paint(desc, path, vertical, seed=i) or painter.paint(desc, path, vertical, seed=i + 1000)):
            print(f"picture {n + 1}/{len(illus)}: failed")
            failed.append(i)
            continue
        ok, problem = checker.fits(path, s["narration"], desc)
        if not ok and repainted < MAX_REPAINTS:
            # One more go with another seed and the subject stated twice; keep it if the check passes.
            repainted += 1
            alt = path.with_name(f"i{i:02}b.png")
            ok2 = False
            if painter.paint(f"{desc}. Clearly show: {desc}", alt, vertical, seed=i + 2000):
                ok2, _ = checker.fits(alt, s["narration"], desc)
                if ok2:
                    alt.replace(path)
            print(f"picture {n + 1}/{len(illus)}: repainted ({problem})" + ("" if ok2 else ", kept the first one"))
        else:
            print(f"picture {n + 1}/{len(illus)}" + ("" if ok else f": doesn't fit ({problem}), out of repaints"))
        out[i] = {**s, "type": "image", "src": f"images/{path.name}"}
        made += 1
    # Still missing: reuse the nearest painted picture with a different camera move, so the video
    # stays all pictures; only with nothing painted at all does it fall back to a story scene.
    painted = [i for i in illus if out[i]["type"] == "image"]
    moves = ["push", "dolly", "flyover", "orbit"]
    for i in failed:
        if painted:
            near = min(painted, key=lambda j: abs(j - i))
            cam = moves[(moves.index(out[near].get("camera", "push")) + 1) % 4] if out[near].get("camera") in moves else "dolly"
            out[i] = {**scenes[i], "type": "image", "src": out[near]["src"], "camera": cam}
        else:
            out[i] = {**scenes[i], "type": "story"}
    print(f"painted {made}/{len(illus)} pictures ({repainted} repainted after the fit check)")
    return out
