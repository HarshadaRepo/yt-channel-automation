"""Channel pipeline, free tools only. Three steps with a human review in between:

  python run.py topics --n 30            # add topic ideas to topics/backlog.json
  python run.py draft                    # next topic -> script, fact-check, auto-fix -> drafts/<slug>/
  #   ...read drafts/<slug>/script.json and factcheck.json, fix anything flagged,
  #   then set "approved": true in script.json...
  python run.py render drafts/<slug>/script.json      # AI voice + animation -> output/<slug>/
  python run.py upload output/<slug>                  # dry run; add --live to really upload

All free: Claude Code (`claude -p`, your Claude plan) writes, Kokoro speaks (open-source,
human-sounding), Remotion animates maps/globes/charts (animator/), YouTube Data API uploads.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from pipeline import assemble, images, soundtrack, tts, upload, visuals

ROOT = Path(__file__).resolve().parent
BACKLOG = ROOT / "topics" / "backlog.json"
ANIMATOR = Path(os.environ.get("YT_ANIMATOR", ROOT / "animator"))
FPS = 30


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def load_backlog() -> list[dict]:
    return json.loads(BACKLOG.read_text()) if BACKLOG.exists() else []


def save_backlog(items: list[dict]):
    BACKLOG.write_text(json.dumps(items, indent=2, ensure_ascii=False))


def cmd_topics(a):
    from pipeline.script_gen import generate_topics

    items = load_backlog()
    new = generate_topics(a.n, [t["title"] for t in items], a.writer)
    items += [{**t, "status": "idea"} for t in new]
    save_backlog(items)
    print(f"added {len(new)} topics; backlog now {len(items)}")


def cmd_draft(a):
    from pipeline.script_gen import fact_check, generate_script, generate_short, pick_format, revise

    items = load_backlog()
    topic = a.topic
    if not topic:
        nxt = next((t for t in items if t["status"] == "idea"), None)
        if not nxt:
            raise SystemExit("backlog empty: run `python run.py topics` first")
        topic = f'{nxt["title"]} ({nxt["angle"]})'
    recent = [t["title"] for t in items if t["status"] != "idea"][-10:]
    used = [t["format"] for t in items if t.get("format")]
    # Hats (2026-10-13): only AI-painted pictures, one per sentence; no talking host, no 3D or other animation.
    visuals = os.environ.get("YT_VISUALS", "pictures")
    script = generate_script(topic, a.minutes, recent, a.writer, pick_format(used), visuals)
    claims = fact_check(script, a.writer)
    if any(c["verdict"] != "solid" for c in claims):
        # fixes applied; factcheck.json keeps the originals
        keep = {k: script[k] for k in ("format", "narrator", "visuals")}
        script = {**revise(script, claims, a.writer), **keep}
    script["short"] = generate_short(script, a.writer)
    script["approved"] = False
    d = ROOT / "drafts" / slug(script["title"])
    d.mkdir(parents=True, exist_ok=True)
    (d / "script.json").write_text(json.dumps(script, indent=2, ensure_ascii=False))
    (d / "factcheck.json").write_text(json.dumps(claims, indent=2, ensure_ascii=False))
    for t in items:
        if not a.topic and t["status"] == "idea" and topic.startswith(t["title"]):
            t["status"] = "drafted"
            t["format"] = script["format"]
            break
    save_backlog(items)
    flagged = [c for c in claims if c["verdict"] != "solid"]
    print(f"draft: {d}\n{len(script['scenes'])} scenes, {len(claims)} claims checked, {len(flagged)} flagged:")
    for c in flagged:
        print(f"  [{c['verdict']}] {c['claim']}\n      -> {c['fix']}")


def cmd_render(a):
    script = json.loads(Path(a.script).read_text())
    if not script.get("approved", True) and not a.force:
        raise SystemExit('script not approved yet: review it, then set "approved": true (or pass --force)')
    out = ROOT / "output" / slug(script["title"])
    job = out / "job"
    (job / "audio").mkdir(parents=True, exist_ok=True)
    if script.get("visuals") == "pictures":
        from pipeline.script_gen import only_pictures
        script["scenes"] = only_pictures(script["scenes"])
        if script.get("short"):
            script["short"]["scenes"] = only_pictures(script["short"]["scenes"])
    (out / "script.json").write_text(json.dumps(script, indent=2, ensure_ascii=False))

    scenes, durs = _voice(script["scenes"], job, a, script.get("narrator"))
    scenes = images.illustrate(scenes, job)
    spec = {"title": script["title"], "channel": a.channel, "scenes": scenes, "style": script.get("style", "atlas")}
    (job / "video.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False))

    print(f"animating {sum(durs) / 60:.1f} min of video...")
    subprocess.run(["node", str(ANIMATOR / "render.mjs"), str(job)], check=True)
    video = out / "video.mp4"
    _finish(job / "video.mp4", video, scenes, durs, script.get("style", "atlas"), a)

    assemble.write_srt(scenes, durs, out / "captions.srt")
    # Thumbnail: a painted cartoon when the script asks for one, else a frame of the video.
    painted = job / "thumb-painted.png"
    if script.get("thumbnail_picture") and images.Painter().paint(script["thumbnail_picture"], painted, thumb=True):
        thumb = visuals.banner_thumbnail(script["thumbnail_text"], painted, out / "thumbnail.jpg")
    else:
        thumb = _still_thumbnail(script, scenes, job, out)
    if not a.keep_work:
        shutil.rmtree(job)
    print(f"video: {video} ({sum(durs) / 60:.1f} min)\nthumbnail: {thumb}")
    _render_short(script, out, a)


def _still_thumbnail(script: dict, scenes: list[dict], job: Path, out: Path) -> Path:
    best = next((i for t in ("image", "model3d", "terrain3d", "globe3d", "map") for i, s in enumerate(scenes) if s["type"] == t), 0)
    frame = sum(s["durationInFrames"] for s in scenes[:best]) + int(scenes[best]["durationInFrames"] * 0.7)
    subprocess.run(["node", str(ANIMATOR / "render.mjs"), str(job), "--still", str(frame)], check=True)
    return visuals.thumbnail(script["thumbnail_text"], job / f"still_{frame}.png", out / "thumbnail.jpg")


def _render_short(script: dict, out: Path, a):
    if script.get("short"):  # vertical YouTube Short teasing the full video
        sjob = out / "short-job"
        (sjob / "audio").mkdir(parents=True, exist_ok=True)
        sscenes, sdurs = _voice(script["short"]["scenes"], sjob, a, script.get("narrator"))
        sscenes = images.illustrate(sscenes, sjob, vertical=True)
        spec = {"title": script["short"]["title"], "channel": a.channel, "scenes": sscenes, "vertical": True,
                "style": script.get("style", "atlas")}
        (sjob / "video.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False))
        print(f"animating the Short ({sum(sdurs):.0f} s)...")
        subprocess.run(["node", str(ANIMATOR / "render.mjs"), str(sjob)], check=True)
        _finish(sjob / "video.mp4", out / "short.mp4", sscenes, sdurs, script.get("style", "atlas"), a)
        if not a.keep_work:
            shutil.rmtree(sjob)
        print(f"short: {out / 'short.mp4'}")


def _mouth(wav: Path, frames: int) -> list[float]:
    """How open a cartoon character's mouth is on each frame: the narration's loudness, 0-1."""
    import numpy as np

    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav), "-f", "s16le", "-ac", "1", "-ar", "24000", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, "<i2").astype(float)
    hop = 24000 // FPS
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(x) else 0.0 for i in range(frames)])
    ref = np.percentile(rms[rms > 0], 90) if (rms > 0).any() else 1.0
    level = np.clip(rms / (ref + 1e-9), 0, 1)
    level[level < 0.12] = 0
    return [round(float(v), 2) for v in level]


def _finish(rendered: Path, final: Path, scenes: list[dict], durs: list[float], style: str, a):
    """Add the background score and sound effects (or a track given with --music)."""
    if a.music:
        assemble.add_music(rendered, Path(a.music), final)
    elif a.no_score:
        shutil.move(rendered, final)
    else:
        music = soundtrack.score(style, scenes, durs, rendered.with_name("score.wav"))
        soundtrack.mix(rendered, music, final)


def _voice(script_scenes: list[dict], job: Path, a, narrator: str | None = None) -> tuple[list[dict], list[float]]:
    scenes, durs = [], []
    wavs = tts.synth_scenes(script_scenes, job / "audio", a.tts, a.voice, a.speed, narrator)
    for i, (scene, wav) in enumerate(zip(script_scenes, wavs)):
        d = tts.duration(wav) + 0.3  # small breath between scenes
        frames = max(45, round(d * FPS))
        extra = {"mouth": _mouth(wav, frames)} if scene.get("type") == "character" else {}
        scenes.append({**scene, "narration": tts.plain(scene["narration"]), "audio": f"audio/s{i:02}.wav", "durationInFrames": frames, **extra})
        durs.append(frames / FPS)
        print(f"voice {i + 1}/{len(script_scenes)}: {d:.1f}s")
    return scenes, durs


def cmd_upload(a):
    out = Path(a.folder)
    script = json.loads((out / "script.json").read_text())
    resp = upload.upload(out / "video.mp4", out / "thumbnail.jpg", script, a.publish_at, dry_run=not a.live)
    record = {}
    if a.live and resp.get("id"):
        record = {"id": resp["id"], "url": f"https://youtu.be/{resp['id']}"}
        (out / "youtube.json").write_text(json.dumps(record))
    short = script.get("short")
    if short and (out / "short.mp4").exists():
        full = f"\n\nWatch the full story: {record['url']}" if record else ""
        meta = {**short, "description": short["description"] + full, "tags": script.get("tags", [])}
        sresp = upload.upload(out / "short.mp4", None, meta, a.publish_at, dry_run=not a.live)
        if a.live and sresp.get("id"):
            record.update(short_id=sresp["id"], short_url=f"https://youtube.com/shorts/{sresp['id']}")
            (out / "youtube.json").write_text(json.dumps(record))


def cmd_short(a):
    from pipeline.script_gen import generate_short

    p = Path(a.script)
    script = json.loads(p.read_text())
    script["short"] = generate_short(script, a.writer)
    p.write_text(json.dumps(script, indent=2, ensure_ascii=False))
    print(f'short: {script["short"]["title"]} ({len(script["short"]["scenes"])} scenes)')


def cmd_auth(a):
    if not a.code:
        url, verifier = upload.auth_url()
        print("1. Open this link, sign in with the channel's Google account and allow access:\n" + url)
        print("2. Your browser then shows an error page on localhost. Copy that page's full address and run:")
        flag = f" --verifier {verifier}" if verifier else ""
        print(f"   python run.py auth{flag} --code '<the address>'")
        return
    token = upload.auth_finish(a.code, a.verifier or "")
    (ROOT / "token.json").write_text(token)
    print("Saved token.json. For GitHub Actions, store its contents as the YT_TOKEN secret.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("topics")
    p.add_argument("--n", type=int, default=30)
    p.add_argument("--writer", default="claude-code", choices=["claude-code", "api"])
    p.set_defaults(fn=cmd_topics)

    p = sub.add_parser("draft")
    p.add_argument("--topic", help="override the next backlog topic")
    p.add_argument("--minutes", type=float, default=8)
    p.add_argument("--writer", default="claude-code", choices=["claude-code", "api"])
    p.set_defaults(fn=cmd_draft)

    p = sub.add_parser("short", help="add a YouTube Short to an existing script")
    p.add_argument("script")
    p.add_argument("--writer", default="claude-code", choices=["claude-code", "api"])
    p.set_defaults(fn=cmd_short)

    p = sub.add_parser("render")
    p.add_argument("script")
    p.add_argument("--tts", choices=["gemini", "chatterbox", "kokoro"],
                   help="force one voice; default tries Gemini models, then Chatterbox, then Kokoro")
    p.add_argument("--voice", help="gemini: Charon (default), Sadaltager, Algenib, Gacrux, Sulafat; kokoro: af_heart (default), am_michael")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--channel", default="ATLAS OF ODD FACTS", help="name shown in the corner")
    p.add_argument("--music", help="royalty-free track, e.g. from the YouTube Audio Library")
    p.add_argument("--no-score", action="store_true", help="skip the generated background score and sound effects")
    p.add_argument("--force", action="store_true")
    p.add_argument("--keep-work", action="store_true")
    p.set_defaults(fn=cmd_render)

    p = sub.add_parser("auth", help="one-time YouTube sign-in")
    p.add_argument("--code", help="the localhost address your browser landed on")
    p.add_argument("--verifier", help="printed by the first `auth` run")
    p.set_defaults(fn=cmd_auth)

    p = sub.add_parser("upload")
    p.add_argument("folder")
    p.add_argument("--live", action="store_true", help="really upload (default: dry run)")
    p.add_argument("--publish-at", help="RFC3339 time to auto-publish (needs an audited API project)")
    p.set_defaults(fn=cmd_upload)

    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
