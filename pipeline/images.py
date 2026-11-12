"""AI-painted pictures, one per illustration scene, each showing what that sentence says.

Services, tried in turn:
- Cloudflare Workers AI (CF_ACCOUNT_ID + CF_API_TOKEN), free 10,000 neurons a day: FLUX.2 klein
  (sharper, follows the prompt far better, ~100-160 neurons a picture), with FLUX.1 schnell (~67)
  as the fallback. CF_BUDGET caps both together per run, and the main video leaves SHORT_RESERVE
  of it for the thumbnail and the Short; pictures past the budget reuse a neighbour.
- Gemini image models, only when GEMINI_IMAGES=1: they need billing on the key (no free tier).
- AI Horde (free volunteer GPUs, no account), the backup for pictures Cloudflare refuses or can't afford.
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
CF_BUDGET = int(os.environ.get("CF_BUDGET", "9400"))  # Cloudflare neurons per run, all models (10,000 free a day)
SHORT_RESERVE = int(os.environ.get("SHORT_RESERVE", "4400"))  # 14 tall Short pictures at 156 neurons, ~12 repaints, the thumbnail
QUOTA_WAIT = int(os.environ.get("YT_QUOTA_WAIT_MIN", "90")) * 60  # seconds to wait for a used-up allowance
QUOTA_POLL = 600
MIN_PAINTED = 0.5  # fail the render below this share of painted pictures
_spent = 0.0  # Cloudflare neurons used so far in this run, shared by every Painter


def _cf_cost(model: str, w: int, h: int) -> float:
    """Neurons for one picture: klein bills per 512px tile, schnell per tile plus its 4 steps."""
    tiles = -(-w // 512) * -(-h // 512)
    return tiles * 26.05 if "flux-2" in model else tiles * 4.8 + 4 * 9.6
MAX_REPAINTS = int(os.environ.get("MAX_REPAINTS", "24"))  # per video, to stay inside the free allowance
TRIES = 2  # repaints per bad picture before it is replaced by a good neighbouring one
FREE_TRIES = 2  # more repaints on the free AI Horde after those

# Hats 2026-10-15: cartoon pictures. Hats 2026-11-05: a different look for each video and Short
# (so the channel doesn't look mass-produced), and only good pictures. Every look is a 2D cartoon
# (Hats 2026-10-12: no 3D); one look is used for a whole video so its pictures match each other.
ART_STYLES = {
    "cel": "Colourful 2D cartoon illustration, like a frame from a modern animated educational series: clean "
           "bold outlines, flat cel shading with soft gradients, bright friendly palette",
    "storybook": "Hand-painted 2D storybook cartoon illustration: soft gouache brush textures, warm golden "
                 "light, gentle rounded shapes, rich earthy colours, like a classic picture book",
    "vector": "Flat 2D vector-art cartoon illustration: simple geometric shapes, crisp edges, no outlines, a "
              "limited harmonious colour palette with long soft shadows, like a polished explainer animation",
    "comic": "2D comic-book cartoon illustration: confident black ink outlines, bold flat colours, subtle "
             "halftone dot shading, dramatic camera angle and lighting, like a graphic novel panel",
    "papercut": "2D layered paper cut-out cartoon illustration: shapes cut from coloured craft paper, visible "
                "paper texture, soft drop shadows between the flat layers, handmade collage look",
    "watercolor": "2D ink-and-watercolour cartoon illustration: loose expressive ink lines, transparent "
                  "watercolour washes bleeding softly at the edges, airy light palette, sketchbook feel",
    "noir": "2D cartoon illustration with moody cinematic lighting: deep blues and teals with warm orange "
            "highlights, strong silhouettes and rim light, clean shapes, like a dramatic animated feature",
    # Hats 2026-11-12: the look of a reference video they liked (simple round-head people, dark scenes).
    "minimal": "Cinematic 2D cartoon illustration for a modern animated documentary: simple round-headed "
               "cartoon characters with clean bold outlines, expressive faces and slightly exaggerated "
               "proportions, detailed but simplified surroundings; dark spy-thriller mood with dramatic "
               "shadows, moody blue and charcoal backgrounds and subtle warm orange highlights; clear "
               "foreground and background, the main subject easy to recognise; not photorealistic, not 3D, "
               "not anime",
}
DEFAULT_ART = "cel"
STYLE_RULES = (
    "Expressive cartoon characters with simple well-drawn faces and hands, correct clothing, buildings and "
    "landscape for the era and place in the description, and nothing from any other time (no modern "
    "houses, streets, pipes, clothes, vehicles or objects in a historical scene). One single scene in one "
    "place, with one clear subject in the middle: no split screen, no collage, no landmarks from other "
    "cities or countries. No text, no letters, no words, no newspapers or signs with writing, no captions, "
    "no signature, no logo, no watermark, no borders."
)


def art_style(name: str | None) -> str:
    return f"{ART_STYLES.get(name or DEFAULT_ART, ART_STYLES[DEFAULT_ART])}. {STYLE_RULES}"


def pick_art(recent: list[str], avoid: str | None = None) -> str:
    """A look the last few videos didn't use (and not `avoid`, the main video's look for its Short)."""
    # Hats 2026-11-07: every video and Short keeps the channel's one look (the classic colourful
    # cartoon of the earlier videos); the other looks stay here only in case Hats asks for them.
    return os.environ.get("ART_STYLE", DEFAULT_ART)


STYLE = art_style(DEFAULT_ART)
THUMB_STYLE = (
    "Eye-catching YouTube thumbnail in a colourful 2D cartoon style, close-up and dramatic: the main "
    "subject large on the RIGHT two thirds of the frame, filling it, with a person's face showing a strong "
    "emotion (shock, awe, fear, wonder) whenever the story has people; the LEFT third is plain dark sky, "
    "shadow or wall with nothing in it. Bold outlines, very saturated colours, strong light-dark contrast, "
    "a glowing rim light on the subject, simple background. Correct clothing, buildings and landscape for "
    "the era named at the start, nothing modern in a historical scene. No maps, no labels, no signs, no "
    "books or documents. No text, no letters, no words, no logo, no play button."
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



# AI Horde (aihorde.net): free volunteer GPUs, anonymous key, no account. Slow (a queue) and the quality
# depends on the model, so it is only the backup for pictures Cloudflare refuses or can't afford
# (Hats 2026-11-09: "use some other free ai"). HORDE=0 turns it off; HORDE_MAX_MIN caps its time per run.
HORDE = "https://aihorde.net/api/v2"
HORDE_MAX = int(os.environ.get("HORDE_MAX_MIN", "200")) * 60
HORDE_PREFER = ("flux", "sdxl", "albedobase", "juggernaut", "dreamshaper xl")
_horde_used = 0.0
_horde_model: list[str] | None = None


def _horde_call(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(HORDE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": os.environ.get("HORDE_KEY", "0000000000"), "Content-Type": "application/json",
                                          "Client-Agent": "yt-channel-automation:1.0:github",
                                          "User-Agent": "yt-channel-automation/1.0 (+https://github.com/HarshadaRepo/yt-channel-automation)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def _horde_models() -> list[str]:
    """The best-looking models volunteers are serving now (FLUX or SDXL family), most workers first."""
    global _horde_model
    if _horde_model is None:
        try:
            ms = sorted(_horde_call("/status/models?type=image"), key=lambda m: -m.get("count", 0))
        except Exception as e:
            print(f"AI Horde unreachable: {e}")
            ms = []
        # one family only, since FLUX and SDXL want different steps and guidance
        fams = [[m["name"] for m in ms if p in m["name"].lower() and m.get("count")] for p in HORDE_PREFER]
        _horde_model = next((f[:3] for f in fams if f), [])
        print(f"AI Horde models: {_horde_model or 'none suitable'}")
    return _horde_model


def _horde(prompt: str, out: Path, seed: int, w: int, h: int):
    global _horde_used
    if _horde_used >= HORDE_MAX:
        raise RuntimeError("AI Horde time for this run used up")
    models = _horde_models()
    if not models:
        raise RuntimeError("no suitable AI Horde model online")
    t0 = time.time()
    try:
        def submit(w: int, h: int) -> dict:
            return _horde_call("/generate/async", {
            "prompt": prompt[:1000] + " ### text, letters, watermark, deformed, extra fingers, blurry",
            "params": {"width": w, "height": h, "steps": 4 if "flux" in models[0].lower() else 30,
                       "cfg_scale": 1 if "flux" in models[0].lower() else 6, "sampler_name": "k_euler",
                       "seed": str(seed), "n": 1},
            "models": models, "nsfw": False, "censor_nsfw": True, "r2": True, "shared": False})

        try:
            job = submit(w, h)
        except urllib.error.HTTPError as e:  # anonymous requests may be limited in size: ask smaller
            print(f"AI Horde refused {w}x{h} ({e.code}: {e.read()[:160]!r}); asking smaller")
            job = submit(*((448, 768) if h > w else (768, 448)))
        jid = job["id"]
        while time.time() - t0 < 600:
            time.sleep(10)
            st = _horde_call(f"/generate/check/{jid}")
            if st.get("done"):
                break
            if st.get("faulted") or not st.get("is_possible", True):
                raise RuntimeError(f"AI Horde could not make it: {st}")
        else:
            try:  # give the slot back
                urllib.request.urlopen(urllib.request.Request(f"{HORDE}/generate/status/{jid}", method="DELETE",
                                                              headers={"Client-Agent": "yt-channel-automation:1.0:github"}), timeout=30)
            except Exception:
                pass
            raise RuntimeError("AI Horde took over 10 minutes")
        gen = (_horde_call(f"/generate/status/{jid}").get("generations") or [{}])[0]
        if gen.get("censored") or not gen.get("img"):
            raise RuntimeError("AI Horde returned no picture")
        img = gen["img"]
        data = urllib.request.urlopen(urllib.request.Request(img, headers={"User-Agent": "yt-channel-automation/1.0"}), timeout=120).read() if img.startswith("http") else base64.b64decode(img)
        from io import BytesIO

        from PIL import Image

        Image.open(BytesIO(data)).convert("RGB").save(out, "PNG")
    finally:
        _horde_used += time.time() - t0


class Painter:
    """Makes pictures with the first service that still works; remembers which ones ran out."""

    waited = 0  # seconds spent waiting for Cloudflare's allowance in this run

    def __init__(self, reserve: int = 0, art: str | None = None):
        self.reserve = reserve
        self.style = art_style(art)
        self.services = ([f"cloudflare:{m}" for m in CF_MODELS] if os.environ.get("CF_ACCOUNT_ID") and os.environ.get("CF_API_TOKEN") else []) \
            + (["horde"] if os.environ.get("HORDE", "1") == "1" else []) + _gemini_models() + (["pollinations"] if os.environ.get("POLLINATIONS") == "1" else [])
        self.dead: set[str] = set()
        self.spent: set[str] = set()  # the services that ran out of their daily allowance
        print(f"image services: {self.services or 'none configured'}")

    def paint(self, description: str, out: Path, vertical: bool = False, thumb: bool = False, seed: int = 0,
              free_only: bool = False) -> bool:
        global _spent
        out = Path(out)
        # The subject comes first: FLUX follows the start of a prompt most closely.
        prompt = f"{description.strip().rstrip('.')}. {'Tall 9:16 portrait composition. ' if vertical else ''}{THUMB_STYLE if thumb else self.style}"
        hit = CACHE / f"{_key(prompt, vertical, seed)}.img"
        if hit.exists():
            shutil.copy(hit, out)
            return True
        for svc in self.services:
            if svc in self.dead or (free_only and svc.startswith("cloudflare:")):
                continue
            try:
                if svc.startswith("cloudflare:"):
                    model = svc.split(":", 1)[1]
                    # klein is billed per 512px tile: 1024x512 (2 tiles, upscaled and trimmed to 16:9
                    # in the video) leaves room in the free allowance to repaint every bad picture;
                    # the few Short pictures get a sharper 768x1344.
                    # schnell is cheap enough for full size.
                    w, h = ((768, 1344) if vertical else (1344, 768) if thumb else (1024, 512)) if "flux-2" in model else ((768, 1344) if vertical else (1344, 768))
                    # Both models draw on the same daily allowance, so the budget (minus what is kept
                    # for the Short) covers them together.
                    if _spent + _cf_cost(model, w, h) > CF_BUDGET - self.reserve:
                        continue
                    _spent += _cf_cost(model, w, h)
                    try:
                        _cloudflare(prompt, out, seed + 1, w, h, model)
                    except Unsafe as e:
                        print(f"safety filter: {e}; trying a gentler wording")
                        _cloudflare("Family-friendly. " + SAFE.sub("", prompt), out, seed + 1, w, h, model)
                elif svc == "horde":
                    _horde(prompt, out, seed + 1, *((576, 1024) if vertical else (1024, 576)))
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
                self.spent.add(svc)
                # Cloudflare's allowance is a rolling 24 hours, so a run that starts a little earlier
                # than yesterday's finds it still used up, and it frees again within the hour. Wait
                # for it rather than paint the rest on the slow backup (2026-11-12: 200 minutes of
                # AI Horde and 14 missing pictures).
                cf = [s for s in self.services if s.startswith("cloudflare:")]
                if svc == cf[-1] and Painter.waited < QUOTA_WAIT and not free_only:
                    print(f"Cloudflare allowance used up; waiting {QUOTA_POLL // 60} min for it to free up")
                    time.sleep(QUOTA_POLL)
                    Painter.waited += QUOTA_POLL
                    self.revive()
                    return self.paint(description, out, vertical, thumb, seed)
            except Exception as e:
                print(f"image service {svc} failed: {e}")
                if svc.startswith("gemini"):
                    self.dead.add(svc)
        return False

    def out_of_allowance(self) -> bool:
        return bool(self.spent) and all(svc in self.dead for svc in self.services)

    def revive(self) -> None:
        self.dead -= self.spent
        self.spent.clear()


class Checker:
    """Asks a Gemini vision model whether a picture shows what its sentence says. Never blocks a video:
    with no key, no quota or any error it simply approves."""

    def __init__(self):
        self.models = [m for m in CHECK_MODELS if m] if os.environ.get("GEMINI_API_KEY") else []

    def fits(self, image: Path, sentence: str, picture: str) -> tuple[bool, str, bool]:
        """(fits, problem, wrong_era): wrong_era when it shows things from another time, e.g. modern
        streets or clothes in an ancient story."""
        prompt = (
            "This picture illustrates one sentence of a history/geography YouTube video.\n"
            f"Sentence: {sentence}\nWhat the picture was meant to show: {picture}\n"
            "Would a viewer hearing the sentence find the picture clearly related and correct? Fail it ONLY if "
            "it shows the wrong main subject, era or place, if the main subject is missing, if a person's face "
            "or body is badly deformed (extra limbs, melted or cloned faces), or if writing stands out (signs, "
            "pages or labels with letters). Pass it despite artistic liberties: a different pose, number of "
            "people or small detail, or an idea or number in the sentence that a picture can't show. When the "
            "description names a real, famous person, fail it if the cartoon doesn't look like them. Set wrong_era if anything in it (buildings, clothes, objects, "
            "vehicles, streets) belongs to a different time than the era the description names; the drawing style "
            "itself (comic, paper cut-out, watercolour) is never an era problem. Also fail split screens, collages and "
            "landmarks from another city. Answer JSON: "
            "{\"fits\": true|false, \"wrong_era\": true|false, \"problem\": \"...\"}"
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
                wrong_era = bool(verdict.get("wrong_era", False))
                return bool(verdict.get("fits", True)) and not wrong_era, str(verdict.get("problem", ""))[:160], wrong_era
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
                return True, "", False
        return True, "", False


def _own_picture(own: Path | None, number: int) -> Path | None:
    """Hats's own picture for this scene (pictures/007.png next to script.json), if given."""
    if not own:
        return None
    for ext in ("png", "jpg", "jpeg", "webp"):
        f = own / f"{number:03}.{ext}"
        if f.exists():
            return f
    return None


def illustrate(scenes: list[dict], job: Path, vertical: bool = False, reserve: int = 0, art: str | None = None, own: Path | None = None) -> list[dict]:
    """Paint every illustration scene into job/images. A picture that fails the fit check is repainted
    up to TRIES times; one that still fails is never used (Hats 2026-11-05: only quality pictures) and
    the nearest good picture is shown again with another camera move instead.
    `reserve` keeps that many neurons of the sharper model for pictures painted later in the run."""
    illus = [i for i, s in enumerate(scenes) if s["type"] == "illustration"]
    if not illus:
        return scenes
    (job / "images").mkdir(parents=True, exist_ok=True)
    painter = Painter(reserve, art)
    if not painter.services:
        print("no image service configured (CF_ACCOUNT_ID/CF_API_TOKEN): pictures become story scenes")
        return [{**s, "type": "story"} if s["type"] == "illustration" else s for s in scenes]
    print(f"picture look: {art or DEFAULT_ART}")
    checker = Checker()
    out = list(scenes)
    made = drawn = repainted = 0
    failed = []
    waited = 0
    for n, i in enumerate(illus):
        s = scenes[i]
        path = job / "images" / f"i{i:02}.png"
        mine = _own_picture(own, n + 1)
        if mine:  # Hats 2026-11-08: pictures Hats made are used as they are, no painting or check
            from PIL import Image

            Image.open(mine).convert("RGB").save(path)
            print(f"picture {n + 1}/{len(illus)}: Hats's own")
            out[i] = {**s, "type": "image", "src": f"images/{path.name}"}
            made += 1
            drawn += 1
            continue
        desc = s.get("picture") or s["narration"]
        era = (s.get("era") or "").strip().rstrip(".:")
        if era:  # the era first, so every picture is drawn for the story's time
            desc = f"{era}: {desc}"
        # a failed picture gets one more try with another seed before falling back
        ok = painter.paint(desc, path, vertical, seed=i) or painter.paint(desc, path, vertical, seed=i + 1000)
        # Every service out of its daily allowance (it sometimes frees up again within the hour):
        # wait and try again rather than make a video without pictures.
        while not ok and painter.out_of_allowance() and waited < QUOTA_WAIT:
            print(f"image allowance used up; waiting {QUOTA_POLL // 60} min and trying again")
            time.sleep(QUOTA_POLL)
            waited += QUOTA_POLL
            painter.revive()
            ok = painter.paint(desc, path, vertical, seed=i)
        if not ok:
            print(f"picture {n + 1}/{len(illus)}: failed")
            failed.append(i)
            continue
        drawn += 1
        ok, problem, wrong_era = checker.fits(path, s["narration"], desc)
        tries = 0
        # Hats 2026-11-10: a neighbour's picture doesn't show this sentence. When the Cloudflare
        # repaints are used up (TRIES per picture, MAX_REPAINTS per video), the free AI Horde gets
        # FREE_TRIES more goes before the scene falls back to a neighbour.
        horde = "horde" in painter.services
        while not ok and tries < TRIES + (FREE_TRIES if horde else 0) and (repainted < MAX_REPAINTS or horde):
            # Another seed, with the subject stated twice and the usual failure named.
            free = tries >= TRIES or repainted >= MAX_REPAINTS
            tries += 1
            repainted += 1
            alt = path.with_name(f"i{i:02}r{tries}.png")
            fix = f"Strictly {era}, nothing modern" if wrong_era and era else f"Clearly show: {s.get('picture') or desc}"
            again = f"{desc}. {fix}. Avoid this mistake: {problem}"[:900]
            if painter.paint(again, alt, vertical, seed=i + 2000 * tries, free_only=free):
                ok, problem2, wrong_era = checker.fits(alt, s["narration"], desc)
                if ok:
                    alt.replace(path)
                else:
                    problem = problem2 or problem
            else:
                break  # nothing left to paint with
        if not ok:
            print(f"picture {n + 1}/{len(illus)}: rejected ({problem}), showing a good neighbour instead")
            failed.append(i)
            continue
        print(f"picture {n + 1}/{len(illus)}" + (f": good after {tries} repaint(s)" if tries else ""))
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
    print(f"painted {made}/{len(illus)} good pictures ({repainted} repainted after the fit check, "
          f"{len(failed)} replaced by a neighbour)")
    if drawn < len(illus) * MIN_PAINTED:
        # Better no upload than a video of placeholders: the job fails and is re-run later.
        raise RuntimeError(f"only {drawn} of {len(illus)} pictures could be painted; not making the video")
    return out
