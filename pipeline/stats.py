"""View counts for every uploaded video and Short, so we can see what works.

Runs on GitHub Actions (this repo's sandbox can't reach YouTube). First tries the YouTube Data API
with YT_TOKEN (needs a read scope, which the upload-only token may lack), then falls back to the
public watch page, which only works once a video has been published.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def _api(ids: list[str]) -> dict:
    try:
        from pipeline.upload import _service
        yt = _service()
        out = {}
        for i in range(0, len(ids), 50):
            res = yt.videos().list(part="statistics,status,snippet,contentDetails", id=",".join(ids[i:i + 50])).execute()
            for v in res.get("items", []):
                st = v.get("statistics", {})
                out[v["id"]] = {"views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
                                "comments": int(st.get("commentCount", 0)), "privacy": v["status"]["privacyStatus"],
                                "published": v["snippet"].get("publishedAt"), "duration": v["contentDetails"]["duration"]}
        return out
    except Exception as e:
        print(f"API not available ({str(e)[:200]}); using public pages")
        return {}


def _page(vid: str) -> dict:
    req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}&hl=en",
                                 headers={"User-Agent": UA, "Accept-Language": "en", "Cookie": "CONSENT=YES+1"})
    try:
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        return {"error": str(e)[:100]}
    views = re.search(r'"viewCount":"(\d+)"', html)
    status = re.search(r'"playabilityStatus":\{"status":"(\w+)"', html)
    date = re.search(r'"publishDate":"([^"]+)"', html)
    return {"views": int(views.group(1)) if views else None, "playable": status.group(1) if status else None,
            "published": date.group(1) if date else None}


def main() -> None:
    rows = json.loads((ROOT / "published.json").read_text())
    ids = [r[k] for r in rows for k in ("id", "short_id") if r.get(k)]
    api = _api(ids)
    out = []
    for r in rows:
        for kind, key in (("video", "id"), ("short", "short_id")):
            vid = r.get(key)
            if vid:
                out.append({"title": r["title"], "kind": kind, "id": vid, **(api.get(vid) or _page(vid))})
    (ROOT / "stats.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    for o in out:
        print(f'{o["kind"]:5} {str(o.get("views")):>7} {o.get("privacy") or o.get("playable") or o.get("error")}  {o["title"][:60]}')


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
