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
- The first 15 seconds decide whether a viewer stays. Sentence 1 is the single most surprising
  fact or image of the whole story, stated plainly (never scene-setting like "Picture the year 500
  BC", a greeting, "In this video" or a definition). Sentence 2-3 raise the question the video
  answers and promise the payoff ("...and the answer changed how empires worked"). Keep an open
  question running, re-hook with a new mystery about a third and two thirds of the way in, and pay
  off every promise the title and thumbnail make.
- Title: catchy, trendy and dead simple: plain everyday words a 12-year-old understands at a
  glance, no jargon or obscure names unless the name itself is famous, max 60 characters (ideally
  under 50), the searched keyword first. Use proven patterns: a curiosity gap ("Why...", "The Real
  Reason...", "How X Actually..."), a specific number or extreme ("4,800 km", "the only country..."),
  or a twist ("...and Nobody Noticed"). Honest: the video must deliver what it promises. No ALL CAPS
  sentences, no false claims, no "you won't believe". Never the "Topic: Description" label format:
  the title must make a surprising claim or ask a question a viewer wants answered. Bad: "Persian
  Royal Road: The Ancient Mail Route". Good: "How Persia Sent Messages Faster Than Any Army".
  Bad: "Mohenjo-daro: Ancient Drains". Good: "This 4,500-Year-Old City Had Better Drains Than Rome".
- `thumbnail_text`: 2-4 punchy words that add to the title rather than repeat it.
- `tags`: 15-20 YouTube tags that real people search for and that are trending for this subject:
  first the exact search phrases ("why is kaliningrad part of russia", "kaliningrad explained"),
  then the topic, places, people and era, then popular broad ones (history, geography, history
  facts, ancient history, documentary, explained, did you know); under 450 characters in total.
- `hashtags`: 3-5 popular, related hashtags, no spaces, most relevant first, mixing the topic with
  big trending ones (e.g. "#Krakatoa", "#History", "#HistoryFacts", "#DidYouKnow", "#Geography").
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
  * illustration: a colourful 2D cartoon picture that slowly pans and zooms. `picture` describes
    exactly what to paint for THIS sentence, as a literal, concrete, visible scene: the main
    subject first, then who/what, doing what, where, when (era, time of day) and with which
    emotion, with the era's real details ("a tired Egyptian farmer in a linen kilt kneels by an
    empty grain basket beside a dry Nile field, worried face, mud-brick houses behind"). Name the
    real place, era and objects; never ask for abstract ideas, symbols, diagrams, maps or text.
    One clear subject per picture.
    `camera`: push (zoom in) | dolly (zoom out) | flyover (pan right) | orbit (pan left).
  * character: the channel's talking cartoon host: a plain, friendly round-head person in a simple
    t-shirt with short hair, the same look in every video (no costumes, no beards, no robes, nothing
    that marks a religion, ethnicity or nationality). Their mouth moves with the narration.
    `expression`: neutral | happy | shocked | angry | worried | thinking | smug. Give it a short
    funny or dramatic `speech` bubble (under 70 characters) OR a big `label`. There is only ever
    this one host on screen. Bubbles are illustrative, not real quotes. Use the host to react,
    joke and ask the viewer's questions.
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
  story scenes, at least two are character scenes (always the one host), and map + globe3d together are at most a quarter of the scenes. Never use the same
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

# Each video gets a different storytelling format and narrator persona, so uploads don't all
# open, flow and sound the same. run.py picks one not used by the last few drafts.
FORMATS = {
    "investigation": (
        "Investigative mystery. Cold-open on the strangest piece of evidence, then work the case: clues, "
        "suspects or theories, dead ends, and the best current answer at the end.",
        "Gripping investigative storyteller, low and intense, leaning in, building suspense, quick between clues."),
    "countdown": (
        "Countdown. A punchy cold open teasing number 1, then a ranked list from least to most surprising, "
        "each entry a mini-story with its own payoff; number 1 is the biggest jaw-drop.",
        "High-energy countdown host, upbeat and quick, playful emphasis, real excitement on each reveal."),
    "you_are_there": (
        "You-are-there. Drop the viewer into the moment in the second person (\"It's 1883. You're standing "
        "on a ship...\"), live through the event as it unfolds, then zoom out to why it matters today.",
        "Immersive cinematic narrator, vivid and present-tense, tense and fast in the action, hushed in awe."),
    "myth_buster": (
        "Myth vs reality. Open with the version everyone believes, then take it apart claim by claim with "
        "evidence, ending on the true story, which is stranger than the myth.",
        "Witty, confident myth-buster, a little sarcastic, quick, punchy, delighted by the truth."),
    "journey": (
        "Journey. Follow one route, person or object from start to finish across the map; each stop "
        "reveals a new surprise; end where it is today.",
        "Adventurous travel-documentary narrator, energetic and warm, a sense of motion and discovery."),
    "what_if": (
        "What-if. Open with a bold hypothetical (what if this never happened?), explain what actually "
        "happened and why, then show the alternate world and what it reveals about ours.",
        "Curious, thoughtful explainer, brisk, playful wonder, rising energy on the big what-if."),
    "chronicle": (
        "Epic chronicle. A cold open at the dramatic peak, then rewind and tell the rise and fall in "
        "acts, with the stakes rising each act and a reflective final line.",
        "Epic historical narrator, deep and confident, dramatic swells, quick through action, slower only for the final line."),
    "ground_level": (
        "History from the ground up. Question title about everyday life (\"What did X do when...\"). Follow "
        "one ordinary person down a ladder of worsening options; each chapter rests on one named artefact or "
        "source, debunk a popular claim along the way, and end on a twist that reframes the question.",
        "Calm, warm, curious documentary storyteller speaking to 'you', unhurried but never slow, quietly fascinated."),
    "explainer": (
        "Fast explainer. Open with a striking question about how the world works, answer it in clear "
        "steps with numbers and comparisons, and end with a twist fact.",
        "Smart, fast-talking explainer like a popular YouTube science channel, crisp and lively, never slow."),
}

LONLAT = {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}

SIDE = {"type": "object", "properties": {"label": {"type": "string"}, "icon": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}}}, "required": ["label"]}

STYLES = ["ancient", "mystery", "ocean", "empire", "modern", "arctic", "inferno", "atlas"]

SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["title", "map", "stat", "timeline", "compare", "model3d", "globe3d",
                                            "terrain3d", "sky3d", "story", "document", "versus", "list", "character", "illustration"]},
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
        "expression": {"type": "string", "enum": ["neutral", "happy", "shocked", "angry", "worried", "thinking", "smug"]},
        "speech": {"type": "string"},
        "picture": {"type": "string"},
        "era": {"type": "string"},
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
        "thumbnail_picture": {"type": "string"},
        "era": {"type": "string"},
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
        "or share, with a strong curiosity gap. Every topic must be easy to show with painted pictures of "
        "people, places and events. "
        "Each title is a catchy, honest curiosity hook in simple everyday words that a normal person "
        "would click, under 60 characters, "
        "answerable with well-documented facts. Avoid anything already covered:\n" + have
    )
    return ask(prompt, TOPICS_SCHEMA, backend)["topics"]


def pick_format(recent_formats: list[str]) -> str:
    """A storytelling format the last few videos didn't use."""
    import random

    fresh = [f for f in FORMATS if f not in recent_formats[-4:]] or list(FORMATS)
    return random.choice(fresh)


ILLUSTRATED = (
    "VISUALS FOR THIS VIDEO (overrides the Mix rule): a blend of painted storybook pictures and real "
    "motion animation. About half of the scenes are `illustration` scenes, each covering only 1-2 "
    "sentences (5-10 seconds), every picture showing people doing what the sentence says. The other "
    "half is motion animation: model3d and terrain3d for places and monuments, character scenes "
    "(at least two, always the one host) for reactions and punchlines, story scenes for "
    "journeys and crowds, a globe3d to place the story, plus the odd stat or document. Alternate "
    "them so the video never runs more than three pictures in a row. Also write `thumbnail_picture`: "
    "one bold image idea for the thumbnail (a round-head cartoon character with a huge exaggerated "
    "reaction on the left, the subject big on the right). Picture models garble writing, so the "
    "thumbnail idea must contain nothing that carries words: no maps, labels, signs, books, "
    "passports, documents or flags with emblems; show the subject as an object, place or scene."
)


# Hats (2026-10-12): no 3D or other motion graphics, the 3D looked the same in every video.
# Hats (2026-10-13): no talking host either; more pictures, each matching what is being said.
PICTURES = (
    "VISUALS FOR THIS VIDEO (overrides the Mix rule and the other scene types): EVERY scene is an "
    "`illustration` scene; no other scene types at all (no host or character, no 3D, globes, maps, "
    "stats, timelines, title cards or documents; put numbers and dates in the narration and the "
    "`caption`). Each scene is ONE sentence, or two very short ones (4-7 seconds, at most 22 "
    "words), so the picture changes often and always matches the words being heard. Its `picture` "
    "paints exactly what that sentence talks about, literally: if the sentence is about a stone "
    "layer, show the stone layer; a number or comparison becomes a concrete scene of it (a road "
    "stretching to the horizon, crowds of workers); a question to the viewer shows the thing asked "
    "about. Vary the shots (wide establishing views, close-ups of hands and objects, crowds, "
    "interiors, landscapes, night and day) so no two pictures look alike, but keep the same people, "
    "place and era consistent with the story. Picture models garble writing and crowded scenes, so "
    "never ask for text, signs, maps, inscriptions, or more than a few main figures. "
    "Set the script's `era` to the story's main time and place in a few words (e.g. \"Achaemenid "
    "Persia, about 500 BC\"); it is put in front of every picture so the painter draws that era. A "
    "scene set in another time gives its own `era` (\"today\", \"Roman Empire, 100 AD\"). Every "
    "`picture` in a historical scene shows only that era's clothing, buildings, tools and transport: "
    "nothing modern. Also write "
    "`thumbnail_picture`: one bold, dramatic image idea for the thumbnail (the single most striking "
    "subject, big and close, with strong emotion or scale, no cartoon characters), with nothing that "
    "carries words: no maps, labels, signs, books, passports, documents or flags with emblems."
)
PICTURE_TYPES = ("illustration",)


def only_pictures(scenes: list[dict]) -> list[dict]:
    """Safety net for the pictures look: any other scene type becomes a painted picture of its narration."""
    out = []
    for sc in scenes:
        if sc.get("type") in PICTURE_TYPES:
            out.append({**sc, "camera": sc.get("camera") if sc.get("camera") in ("push", "dolly", "flyover", "orbit") else "push"})
        else:
            keep = {k: sc[k] for k in ("narration", "delivery", "caption", "icon", "era") if k in sc}
            out.append({**keep, "type": "illustration", "picture": sc.get("picture") or sc["narration"],
                        "camera": sc.get("camera") if sc.get("camera") in ("push", "dolly", "flyover", "orbit") else "push"})
    return out


def generate_script(topic: str, minutes: float = 8, recent_titles: list[str] | None = None,
                    backend: str = "claude-code", fmt: str = "explainer", visuals: str = "mixed") -> dict:
    avoid = "\n".join(f"- {t}" for t in (recent_titles or [])) or "- none"
    structure, persona = FORMATS[fmt]
    prompt = (
        f"Write the full video script.\nTopic: {topic}\n"
        f"Length: about {minutes} minutes of narration (~{int(minutes * 150)} words), "
        + (f"{min(int(minutes * 9), 58)}-{min(int(minutes * 10), 64)} very short scenes (one sentence, 4-7 seconds each).\n" if visuals == "pictures"
           else f"{int(minutes * 6)}-{int(minutes * 8)} short scenes (5-10 seconds each).\n" if visuals == "illustrated"
           else f"{int(minutes * 2.5)}-{int(minutes * 3.5)} scenes.\n")
        + f"Storytelling format for this video: {structure}\n"
        f"Narrator persona (write lines this narrator would say, and set each scene's delivery to fit): {persona}\n"
        "Don't reuse openings, catchphrases or sign-offs from recent videos; the hook, the transitions and "
        "the ending line must feel new.\n"
        f"Recent titles:\n{avoid}"
        + (f"\n{ILLUSTRATED}" if visuals == "illustrated" else f"\n{PICTURES}" if visuals == "pictures" else "")
    )
    script = ask(prompt, SCRIPT_SCHEMA, backend)
    if visuals == "pictures":
        script["scenes"] = only_pictures(script["scenes"])
    script["visuals"] = visuals
    script["format"] = fmt
    script["narrator"] = persona
    return script


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
    fixed = ask(prompt, SCRIPT_SCHEMA, backend)
    if script.get("visuals") == "pictures":
        fixed["scenes"] = only_pictures(fixed["scenes"])
    return fixed


def generate_short(script: dict, backend: str = "claude-code") -> dict:
    """A vertical YouTube Short summing up a finished (fact-checked) script, pointing to the full video."""
    look = ("Visuals: ONLY `illustration` scenes (painted pictures, tall portrait framing, a fresh "
            "shot each, the subject large and close so it reads on a phone), one sentence per scene, each `picture` showing literally what its "
            "sentence says; no host or character and no other scene types. "
            if script.get("visuals") == "pictures" else
            "Visuals: alternate `illustration` scenes (painted pictures, tall portrait framing) with "
            "motion animation (model3d, character, terrain3d), about half each. "
            if script.get("visuals") == "illustrated" else "")
    pictures = script.get("visuals") == "pictures"
    # Hats 2026-10-13: the Short sums up the WHOLE video, not just a teaser of the opening.
    prompt = (look +
        "Write a YouTube Short (vertical, 9:16) that tells the WHOLE story of this video in under a "
        "minute, so someone who only watches the Short still learns the full summary: 45-58 seconds of "
        "narration (115-130 words, never more than 130) in "
        + ("11-14 one-sentence scenes. " if pictures else "4-6 scenes. ")
        + "Structure: scene 1 hooks in the first 2 seconds with the single most jaw-dropping fact or "
        "question; then walk through EVERY main part of the video in the same order, one punchy sentence "
        "each with its key fact or number (the setup, how/why it happened, the turning point, the "
        "surprising consequence); then the payoff, the video's big answer or most surprising ending fact; "
        "the last line invites them to the full video (e.g. \"Full story with all the details on our "
        "channel.\"). Every sentence must carry a real fact: no filler, no vague teasing. Use ONLY facts "
        "already in the script below, word them the same way, and reuse its numbers. "
        + ("Make it eye-catching from the first frame: scene 1's picture is the most dramatic image of "
           "the story, big and close. " if pictures else
           "Every scene is animated: make it eye-catching from the first frame, with mostly model3d, globe3d, "
           "terrain3d, story and character scenes plus a big stat; at most one map. ")
        + "Keep labels short (they must fit a narrow screen), versus points max 2 each, compare "
        "scenes max 3 items, timelines max 4 events. Title: under 50 characters, catchy, trendy, honest, in simple everyday words. "
        "3-5 popular, related hashtags, first one #Shorts. Description: 1-2 lines plus "
        "\"Animation and narration are AI-assisted; script reviewed by a human.\"\n\n"
        f"FULL SCRIPT:\n{json.dumps({k: script[k] for k in ('title', 'scenes')}, ensure_ascii=False)}"
    )
    short = ask(prompt, SHORT_SCHEMA, backend)
    if script.get("visuals") == "pictures":
        short["scenes"] = only_pictures(short["scenes"])
    return short
