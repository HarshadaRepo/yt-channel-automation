# YouTube channel automation

Animated history & geography explainers, made with free tools:

| Step | Tool | Where it runs |
|---|---|---|
| Topic ideas, script, fact-check, fixes | Claude (Claude Code, structured JSON with per-scene animation + voice directions) | Scheduled Claude routine, opens a "Draft:" pull request |
| **Approval** | You read the script in the PR and press **Merge** (or close it to reject) | GitHub |
| Narration | Gemini TTS with a tone direction per scene (Kokoro offline fallback) | GitHub Actions |
| Animation | Remotion (`animator/`): spinning globe, flying maps, routes, shock-wave rings, counters, timelines, captions | GitHub Actions |
| Upload | YouTube Data API, **private**, AI disclosure on | GitHub Actions; you publish in YouTube Studio |

## Secrets (Settings → Secrets and variables → Actions)

| Name | What |
|---|---|
| `GEMINI_API_KEY` | Free key from aistudio.google.com/apikey |
| `YT_CLIENT_SECRET` | Full text of the Google Cloud "Desktop app" OAuth client JSON |
| `YT_TOKEN` | Output of `python run.py auth` (one-time YouTube sign-in) |

Optional variable `CHANNEL_NAME` sets the name in the video corner.

Google Cloud setup: enable *YouTube Data API v3*, configure the OAuth consent screen (External),
create an OAuth client of type *Desktop app*, and press **Publish app** on the consent screen so the
sign-in doesn't expire after 7 days. Until Google audits the API project, uploads stay private.

## Run locally

```bash
pip install -r requirements.txt && (cd animator && npm install)   # plus ffmpeg
python run.py topics --n 30                     # refill topics/backlog.json
python run.py draft                             # drafts/<slug>/script.json + factcheck.json
python run.py render drafts/<slug>/script.json --force
python run.py upload output/<slug>              # dry run; --live uploads (private)
cd animator && npm run studio                   # preview/tweak animations live
```

## Staying monetisable

YouTube's inauthentic-content policy demonetises channels that look mass-produced. Keep the human
review (the PR merge), vary topics and structure, keep real sources in descriptions, and don't publish
more than you review. Partner Program: 1,000 subscribers + 4,000 watch hours in 12 months (or 10M
Shorts views in 90 days).
