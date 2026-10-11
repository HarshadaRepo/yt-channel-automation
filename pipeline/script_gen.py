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
    "a faceless, animated YouTube channel of surprising facts about history, geography, ancient "
    "civilizations and the modern world: strange borders, lost cities, ancient empires and their "
    "engineering, record-breaking events, today's megaprojects, countries and cities, and why the "
    "map looks the way it does"
)

SYSTEM = f"""You write for {NICHE}.
Voice: warm, curious, conversational, concrete, like a friend who loves maps. One surprising,
well-established fact per beat. No filler, no clickbait the script doesn't pay off.
Rules:
- Original writing only. Never reproduce or closely paraphrase another creator's script or title.
- Only state facts that are well established; hedge anything uncertain ("historians think...").
- Open with a hook that poses the question in under 15 words, and land the most surprising fact or
  image in the first 10 seconds. Keep an open question running so viewers stay to the end, and pay
  off every promise the title and thumbnail make.
- Title: trendy and clickable but honest, max 60 characters, keyword first. Use proven patterns:
  a curiosity gap ("Why...", "The Real Reason...", "How X Actually..."), a specific number or
  extreme ("4,800 km", "the only country..."), or a twist ("...and Nobody Noticed"). No ALL CAPS
  sentences, no false claims, no "you won't believe".
- `thumbnail_text`: 2-4 punchy words that add to the title rather than repeat it.
- `tags`: 15-20 YouTube tags, most specific first (topic, places, people, era), then broader ones
  (history, geography, ancient civilizations, documentary, facts); under 450 characters in total.
- `hashtags`: 3-5 hashtags, no spaces, most relevant first (e.g. "#History", "#Krakatoa").
- `style` sets the whole video's look (colours, fonts, transitions). Pick the one that fits the
  topic: "ancient" (Egypt, Rome, Greece, Maya), "mystery" (unsolved cases, disappearances), "ocean"
  (seas, ships, explorers, islands), "empire" (kings, wars, empires), "modern" (today's cities,
  borders, megaprojects, tech), "arctic" (ice, poles, high mountains), "inferno" (volcanoes,
  disasters), "atlas" (pure geography and maps).
- Every scene is ANIMATED. Make it look like a modern 3D-animated documentary, not a slideshow of
  maps: pick the scene type that SHOWS the idea best and fill its fields.
  * model3d: a 3D model with a moving camera. `model` is one of pyramid, stepPyramid (Maya/Aztec),
    obelisk, temple (Greek/Roman), colosseum, castle, wall (Great Wall-like), ship (sailing ship),
    volcano, island, city, stonehenge, lighthouse, skyscraper, statue (Easter Island moai), bridge (Roman stone arch bridge or aqueduct).
    `camera`: orbit | dolly (moves closer) | flyover | rise (ground to aerial) | push.
    `time`: day | sunset | night | dawn | storm. `effect`: none | smoke | embers | rain | snow | dust
    | stars. `label` = big name on screen (e.g. "The Great Pyramid"). `annotations` = 1-3 short
    fact cards that pop in beside it ("146 m tall when built").
  * globe3d: a real 3D globe that spins and flies to `center` [lon, lat], zoomFrom -> zoomTo
    (1 = whole globe, 2-3 = continent/region). `highlight` countries, `markers` (labels painted on
    the globe), `routes` (glowing arcs that draw themselves). Use it instead of a flat map whenever
    a place or journey is introduced.
  * terrain3d: a 3D landscape flyover. `terrain`: mountains | desert | islands | canyon | glacier |
    river | plains; `camera`: flyover | rise | orbit; `label`, `annotations`, `time`, `effect`.
  * sky3d: the night sky turning, with a `constellation` (big_dipper | orion | southern_cross |
    pole) drawn star by star; optional `model` silhouette on the horizon. Astronomy, navigation.
  * story: an illustrated, animated scene with parallax layers: `setting` (desert | sea | forest |
    city | mountains | village | battlefield | ice | coast), `time`, `figures` (none | traveler |
    crowd | soldiers | sailors | workers | royalty | explorers) who walk across, `props` (up to 3 of
    ship, campfire, tents, cart, camel, horse, tower, pyramid, palms, ruins, flag, torch) and
    weather via `effect`. Use it to dramatise what people did ("the colonists landed...").
  * document: an old letter, diary or decree being hand-written on screen: `heading`, `quote`
    (a short real quote or a faithful paraphrase, under 160 characters), `author`, `icon` on the seal.
  * versus: two sides side by side: `left` and `right` each with label, icon and points (1-3 short lines).
    Myth vs fact, theory vs theory, then vs now.
  * list: a numbered chapter card for countdowns / theories: `index`, `total`, `heading`,
    `subheading`, `caption` (e.g. "Theory"), `icon`.
  * map: a 2D globe ("globe") or flat map ("flat") flying to `center`, zoomFrom -> zoomTo
    (1 = world, 3-8 = region, 10-30 = city), with `highlight`, `markers`, `routes`, `rings`
    (expanding shock-wave circles, maxRadius in degrees). Best for borders and close-up regions.
  * stat: one big animated number (value, prefix, suffix, label, icon).
  * timeline: 2-5 events with year, short label and emoji.
  * compare: 2-4 animated bars (label, value, icon) with a unit.
  * title: kinetic text (heading, subheading, icon); for the opening and chapter breaks.
  Mix: at least a third of scenes are 3D (model3d, globe3d, terrain3d, sky3d), at least two are
  story scenes, and map + globe3d together are at most a quarter of the scenes. Never use the same
  type more than twice in a row. Use real coordinates.
- `caption` is a 1-4 word on-screen tag (e.g. "KRAKATOA, 1883"). `icon` is one emoji.
- 1-3 sentences of narration per scene, written to be SPOKEN: contractions, varied sentence length,
  rhetorical questions, the occasional short punchy line.
- `delivery` tells the voice actor how to perform the scene, e.g. "hushed, slow, ominous",
  "excited, quickening pace", "wry and amused", "solemn, respectful". Make the emotion follow the
  story so the tone keeps changing. You may put a few inline cues in the narration where a real
  narrator would: <short pause>, <long pause>, <breath>, <sigh>, <laugh>. Use them sparingly.
- The description names 2-4 real, checkable sources (book, paper or institution; no invented
  URLs). Its first two lines are a keyword-rich hook (they show in search). It ends with:
  "Animation and narration are AI-assisted; script reviewed by a human." Do not put the hashtags in
  the description; they are added automatically.
"""

LONLAT = {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}

SIDE = {"type": "object", "properties": {"label": {"type": "string"}, "icon": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}}}, "required": ["label"]}

STYLES = ["ancient", "mystery", "ocean", "empire", "modern", "arctic", "inferno", "atlas"]

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["title", "map", "stat", "timeline", "compare", "model3d", "globe3d",
                                            "terrain3d", "sky3d", "story", "document", "versus", "list"]},
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
        "model": {"type": "string", "enum": ["pyramid", "stepPyramid", "obelisk", "temple", "colosseum", "castle", "wall", "ship",
                                             "volcano", "island", "city", "stonehenge", "lighthouse", "skyscraper", "statue", "bridge"]},
        "camera": {"type": "string", "enum": ["orbit", "dolly", "flyover", "rise", "push"]},
        "time": {"type": "string", "enum": ["day", "sunset", "night", "dawn", "storm"]},
        "effect": {"type": "string", "enum": ["none", "smoke", "embers", "rain", "snow", "dust", "stars"]},
        "terrain": {"type": "string", "enum": ["mountains", "desert", "islands", "canyon", "glacier", "river", "plains"]},
        "annotations": {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "side": {"type": "string", "enum": ["left", "right"]}}, "required": ["text"]}},
        "constellation": {"type": "string", "enum": ["big_dipper", "orion", "southern_cross", "pole"]},
        "setting": {"type": "string", "enum": ["desert", "sea", "forest", "city", "mountains", "village", "battlefield", "ice", "coast"]},
        "figures": {"type": "string", "enum": ["none", "traveler", "crowd", "soldiers", "sailors", "workers", "royalty", "explorers"]},
        "props": {"type": "array", "items": {"type": "string", "enum": ["ship", "campfire", "tents", "cart", "camel", "horse", "tower",
                                                                         "pyramid", "palms", "ruins", "flag", "torch"]}},
        "quote": {"type": "string"},
        "author": {"type": "string"},
        "left": SIDE,
        "right": SIDE,
        "index": {"type": "integer"},
        "total": {"type": "integer"},
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
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "thumbnail_text": {"type": "string"},
        "style": {"type": "string", "enum": STYLES},
    },
    "required": ["title", "hook", "style", "scenes", "description", "tags", "hashtags", "thumbnail_text"],
}

SHORT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "scenes": {"type": "array", "items": SCENE_SCHEMA},
        "description": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "scenes", "description", "hashtags"],
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
                    "pillar": {"type": "string", "enum": ["history", "geography", "ancient", "modern", "both"]},
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
        f"Propose {n} new video topics with real potential for large view counts. Mix history, geography, "
        "ancient civilizations (Egypt, Rome, Maya, Indus Valley, Persia, China...) and surprising modern-day "
        "facts (megaprojects, borders, cities, countries today). Favour subjects people already search for "
        "or share, with a strong curiosity gap. Every topic must be easy to show with 3D animation "
        "(monuments, ships, landscapes, the globe) and illustrated story scenes. "
        "Each title is a trendy, honest curiosity hook a normal person would click, under 60 characters, "
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


def generate_short(script: dict, backend: str = "claude-code") -> dict:
    """A vertical YouTube Short cut from a finished (fact-checked) script, pointing to the full video."""
    prompt = (
        "Write a YouTube Short (vertical, 9:16) that teases this full video. 40-55 seconds of narration "
        "(95-115 words, never more than 115; the narrator speaks slowly with pauses) in 4-6 scenes. Scene 1 must hook in the first 2 seconds with the single most "
        "jaw-dropping fact or question; then build fast; end on a cliffhanger that makes people want the "
        "full story (\"The full story is on our channel.\"). Use ONLY facts already in the script below, "
        "word them the same way, and reuse its coordinates and numbers. Every scene is animated: make it "
        "eye-catching from the first frame, with mostly model3d, globe3d, terrain3d and story scenes plus a big stat; "
        "at most one map. Keep labels short (they must fit a narrow screen), versus points max 2 each, compare "
        "scenes max 3 items, timelines max 4 events. Title: under 50 characters, punchy, trendy, honest. "
        "3-5 hashtags, first one #Shorts. Description: 1-2 lines plus "
        "\"Animation and narration are AI-assisted; script reviewed by a human.\"\n\n"
        f"FULL SCRIPT:\n{json.dumps({k: script[k] for k in ('title', 'scenes')}, ensure_ascii=False)}"
    )
    return ask(prompt, SHORT_SCHEMA, backend)
