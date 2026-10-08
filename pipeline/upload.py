"""Upload to YouTube with the Data API v3 (OAuth, your own Google Cloud project).

Setup (done once, by you):
  1. Google Cloud console: create a project, enable "YouTube Data API v3".
  2. OAuth consent screen (External, add yourself as test user), then create an
     OAuth client ID of type "Desktop app" and download it as client_secret.json.
  3. On the OAuth consent screen press "Publish app" (otherwise Google expires the
     sign-in after 7 days). Then run `python run.py auth` once and follow the prompts;
     it prints the token JSON to store as the YT_TOKEN secret (or saves token.json).

Notes:
  - Uploads from an unverified API project are locked to PRIVATE until Google
    audits the project. Until then, upload private and publish by hand in Studio,
    or apply for the audit (YouTube API Services compliance form).
  - status.containsSyntheticMedia is YouTube's "altered or synthetic content"
    disclosure. Set it True whenever the video shows realistic AI-made people,
    places or events; it's False for obviously stylised illustrations + TTS
    narration, but setting True is the safe default.
  - Default is dry run: prints the request and touches nothing.
"""
import json
import os
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
HERE = Path(__file__).resolve().parent.parent


def _client_config() -> dict:
    """OAuth client: YT_CLIENT_SECRET env (the JSON text, used in GitHub Actions) or client_secret.json."""
    raw = os.environ.get("YT_CLIENT_SECRET")
    return json.loads(raw) if raw else json.loads((HERE / "client_secret.json").read_text())


def _service():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    raw = os.environ.get("YT_TOKEN")  # token JSON from `python run.py auth`, stored as a GitHub secret
    token = HERE / "token.json"
    if raw:
        creds = Credentials.from_authorized_user_info(json.loads(raw), SCOPES)
    elif token.exists():
        creds = Credentials.from_authorized_user_file(str(token), SCOPES)
    else:
        raise SystemExit("No YouTube token: run `python run.py auth` once.")
    if not creds.valid:
        creds.refresh(Request())
    return build("youtube", "v3", credentials=creds)


def auth_url() -> tuple[str, str]:
    """Step 1 of a copy-paste sign-in that works without a local browser."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(_client_config(), SCOPES, redirect_uri="http://localhost:8765/")
    url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return url, flow.code_verifier or ""


def auth_finish(redirected_url: str, code_verifier: str = "") -> str:
    """Step 2: the URL the browser was sent to after signing in (it won't load; that's fine)."""
    from urllib.parse import parse_qs, urlparse

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(_client_config(), SCOPES, redirect_uri="http://localhost:8765/")
    if code_verifier:
        flow.code_verifier = code_verifier
    code = parse_qs(urlparse(redirected_url).query).get("code", [redirected_url.strip()])[0]
    flow.fetch_token(code=code)
    return flow.credentials.to_json()


def upload(video: Path, thumb: Path, meta: dict, publish_at: str | None = None,
           synthetic: bool = True, dry_run: bool = True) -> dict:
    body = {
        "snippet": {
            "title": meta["title"][:100],
            "description": meta["description"][:5000],
            "tags": meta.get("tags", [])[:30],
            "categoryId": "27",  # Education
            "defaultLanguage": "en",
        },
        "status": {
            "privacyStatus": "private",
            "selfDeclaredMadeForKids": False,
            "containsSyntheticMedia": synthetic,
            **({"publishAt": publish_at} if publish_at else {}),
        },
    }
    if dry_run:
        print("[dry run] would upload", video, "with:\n", json.dumps(body, indent=2, ensure_ascii=False))
        return body

    from googleapiclient.http import MediaFileUpload

    yt = _service()
    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(str(video), chunksize=-1, resumable=True))
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    try:
        yt.thumbnails().set(videoId=resp["id"], media_body=MediaFileUpload(str(thumb))).execute()
    except Exception as e:  # custom thumbnails need a phone-verified channel (youtube.com/verify)
        print("Thumbnail not set (verify the channel at https://www.youtube.com/verify):", e)
    print("Uploaded:", f"https://youtu.be/{resp['id']}")
    return resp
