"""Write topics, scripts and fact-checks with Claude.

Default backend "claude-code" runs the Claude Code CLI headless (`claude -p`),
which uses your existing Claude plan, so there's no extra API bill. Install
Claude Code and log in once with `claude`. Backend "api" uses the paid
Anthropic API (ANTHROPIC_API_KEY) and is optional.
"""
import json
import subprocess
import tempfile

NICHE = (
    "a faceless, animated YouTube channel of surprising history and geography facts: "
    "strange borders, lost cities, record-breaking events, how places got their shape, "
    "odd laws of nature and why the map looks the way it does"
)

SYSTEM = f"""You write for {NICHE}.
Voice: warm, curious, conversational, concrete, like a friend who loves maps. One surprising,
well-established fact per beat. No filler, no clickbait the script doesn't pay off.
Rules:
- Original writing only. Never reproduce or closely paraphrase another creator's script or title.
- Only state facts that are well established; hedge anything uncertain ("historians think...").
- Open with a hook that poses the question in under 15 words.
- Every scene is ANIMATED, so pick the scene type that shows the idea best and fill its fields:
  * map: a spinning globe ("globe") or flat map ("flat") that flies to `center` [lon, lat],
    zooming zoomFrom -> zoomTo (1 = whole globe / world, 3-8 = region, 10-30 = city).
    `highlight` = country names as in Natural Earth (e.g. "Indonesia", "United States of America").
    `markers` = places with label + emoji icon. `routes` = animated great-circle journeys with an
    emoji travelling along them (ships, armies, explorers, sound waves). `rings` = expanding
    shock-wave circles (maxRadius in degrees). Use real coordinates.
  * stat: one big animated number (value, prefix, suffix, label, icon).
  * timeline: 2-5 events with year, short label and emoji.
  * compare: 2-4 animated bars (label, value, icon) with a unit.
  * title: kinetic text (heading, subheading, icon); use for the opening and chapter breaks.
  Use maps for at least half the scenes. Vary types; never the same type more than twice in a row.
- `caption` is a 1-4 word on-screen tag (e.g. "KRAKATOA, 1883"). `icon` is one emoji.
- 1-3 sentences of narration per scene, written to be SPOKEN: contractions, varied sentence length,
  rhetorical questions, the occasional short punchy line.
- `delivery` tells the voice actor how to perform the scene, e.g. "hushed, slow, ominous",
  "excited, quickening pace", "wry and amused", "solemn, respectful". Make the emotion follow the
  story so the tone keeps changing. You may put a few inline cues in the narration where a real
  narrator would: <short pause>, <long pause>, <breath>, <sigh>, <laugh>. Use them sparingly.
- The description names 2-4 real, checkable sources (book, paper or institution; no invented
  URLs) and ends with: "Animation and narration are AI-assisted; script reviewed by a human."
"""

LONLAT = {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["title", "map", "stat", "timeline", "compare"]},
        "narration": {"type": "string"},
        "delivery": {"type": "string"},
        "caption": {"type": "string"},
        "icon": {"type": "string"},
        "heading": {"type": "string"},
        "subheading": {"type": "string"},
        "projection": {"type": "string", "enum": ["globe", "flat"]},
        "center": LONLAT,
        "rotateFrom": LONLAT,
        "zoomFrom": {"type": "number"},
        "zoomTo": {"type": "number"},
        "highlight": {"type": "array", "items": {"type": "string"}},
        "markers": {"type": "array", "items": {"type": "object", "properties": {
            "lonlat": LONLAT, "label": {"type": "string"}, "icon": {"type": "string"}}, "required": ["lonlat", "label"]}},
        "routes": {"type": "array", "items": {"type": "object", "properties": {
            "from": LONLAT, "to": LONLAT, "icon": {"type": "string"}}, "required": ["from", "to"]}},
        "rings": {"type": "object", "properties": {
            "center": LONLAT, "maxRadius": {"type": "number"}, "count": {"type": "integer"}}, "required": ["center", "maxRadius"]},
        "value": {"type": "number"},
        "prefix": {"type": "string"},
        "suffix": {"type": "string"},
        "label": {"type": "string"},
        "events": {"type": "array", "items": {"type": "object", "properties": {
            "year": {"type": "string"}, "label": {"type": "string"}, "icon": {"type": "string"}}, "required": ["year", "label"]}},
        "items": {"type": "array", "items": {"type": "object", "properties": {
            "label": {"type": "string"}, "value": {"type": "number"}, "icon": {"type": "string"}}, "required": ["label", "value"]}},
        "unit": {"type": "string"},
    },
    "required": ["type", "narration", "delivery", "caption", "icon"],
}

SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "hook": {"type": "string"},
        "scenes": {"type": "array", "items": SCENE_SCHEMA},
        "description": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "thumbnail_text": {"type": "string"},
    },
    "required": ["title", "hook", "scenes", "description", "tags", "thumbnail_text"],
}

TOPICS_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "angle": {"type": "string"},
                    "pillar": {"type": "string", "enum": ["history", "geography", "both"]},
                },
                "required": ["title", "angle", "pillar"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["topics"],
    "additionalProperties": False,
}

FACTCHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claim": {"type": "string"},
                    "verdict": {"type": "string", "enum": ["solid", "needs_hedge", "wrong_or_myth"]},
                    "note": {"type": "string"},
                    "fix": {"type": "string"},
                },
                "required": ["claim", "verdict", "note", "fix"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["claims"],
    "additionalProperties": False,
}


def ask(prompt: str, schema: dict, backend: str = "claude-code", system: str = SYSTEM) -> dict:
    if backend == "claude-code":
        out = subprocess.run(
            ["claude", "-p", prompt, "--output-format", "json", "--tools", "",
             "--system-prompt", system, "--json-schema", json.dumps(schema)],
            capture_output=True, text=True, timeout=900, cwd=tempfile.gettempdir(),
        )
        if out.returncode != 0:
            raise RuntimeError(f"claude -p failed: {out.stderr[-2000:]}")
        res = json.loads(out.stdout)
        if res.get("is_error") or "structured_output" not in res:
            raise RuntimeError(f"claude -p returned no structured output: {res.get('result')}")
        return res["structured_output"]

    if backend == "api":
        import anthropic

        response = anthropic.Anthropic().beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=16000,
            system=system,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"request declined: {response.stop_details}")
        return json.loads(next(b.text for b in response.content if b.type == "text"))

    raise ValueError(f"unknown backend {backend}")


def generate_topics(n: int, existing: list[str], backend: str = "claude-code") -> list[dict]:
    have = "\n".join(f"- {t}" for t in existing) or "- none"
    prompt = (
        f"Propose {n} new video topics. Mix history, geography and topics that are both. Every topic must be easy to show on an animated map. "
        "Each title is a curiosity question a normal person would type or click, under 70 characters, "
        "answerable with well-documented facts. Avoid anything already covered:\n" + have
    )
    return ask(prompt, TOPICS_SCHEMA, backend)["topics"]


def generate_script(topic: str, minutes: float = 8, recent_titles: list[str] | None = None,
                    backend: str = "claude-code") -> dict:
    avoid = "\n".join(f"- {t}" for t in (recent_titles or [])) or "- none"
    prompt = (
        f"Write the full video script.\nTopic: {topic}\n"
        f"Length: about {minutes} minutes of narration (~{int(minutes * 150)} words), "
        f"{int(minutes * 2.5)}-{int(minutes * 3.5)} scenes.\n"
        "Vary the structure from our recent videos so uploads don't feel templated "
        "(e.g. timeline, countdown, myth-vs-fact, journey, what-if).\n"
        f"Recent titles:\n{avoid}"
    )
    return ask(prompt, SCRIPT_SCHEMA, backend)


def fact_check(script: dict, backend: str = "claude-code") -> list[dict]:
    """Second, skeptical pass. Anything not 'solid' should be fixed before rendering."""
    narration = "\n".join(s["narration"] for s in script["scenes"])
    narration += "\n\nON-SCREEN DATA:\n" + json.dumps(
        [{k: v for k, v in s.items() if k not in ("narration",)} for s in script["scenes"]], ensure_ascii=False)
    prompt = (
        "You are a skeptical fact-checker. List every factual claim in this narration, judge it, "
        "and give a corrected or hedged wording when it isn't solid. Flag popular myths. Also check that "
        "map coordinates, numbers and years shown on screen match the facts.\n\n"
        + narration
    )
    return ask(prompt, FACTCHECK_SCHEMA, backend, system="You are a careful science and history fact-checker.")["claims"]


def revise(script: dict, claims: list[dict], backend: str = "claude-code") -> dict:
    """Apply the fact-checker's fixes, keeping structure and voice."""
    flagged = [c for c in claims if c["verdict"] != "solid"]
    if not flagged:
        return script
    prompt = (
        "Revise this script so every flagged claim uses the suggested fix (or is cut). "
        "If a flagged 'myth' is one the script is already debunking, make sure it is clearly framed as a myth. "
        "Keep everything else, the structure and the voice the same.\n\n"
        f"FLAGGED:\n{json.dumps(flagged, indent=1, ensure_ascii=False)}\n\n"
        f"SCRIPT:\n{json.dumps(script, indent=1, ensure_ascii=False)}"
    )
    return ask(prompt, SCRIPT_SCHEMA, backend)
