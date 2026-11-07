"""Find where each spoken word really is in the narration audio (free, on the CPU).

Hats 2026-11-07: pictures and subtitles drifted from the voice. Gemini voices ~20 scenes in one
take, and cutting that take back into scenes by guessing from the text length snapped to the
wrong pauses. faster-whisper (open-source speech recognition) gives each heard word a time; the
heard words are matched to the script's words, so scene cuts and subtitle words land where they
are actually spoken. Without the package or its model everything falls back to the old guesses.
"""
import difflib
import json
import os
import re
from pathlib import Path

MODEL = os.environ.get("ALIGN_MODEL", "base.en")
_model = None
_broken = False


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower().replace("&", "and"))


def heard(wav: Path) -> list[tuple[str, float, float]] | None:
    """[(word, start, end)] in seconds, or None when speech recognition isn't available."""
    global _model, _broken
    if _broken:
        return None
    try:
        if _model is None:
            from faster_whisper import WhisperModel

            _model = WhisperModel(MODEL, device="cpu", compute_type="int8")
        segments, _ = _model.transcribe(str(wav), word_timestamps=True, beam_size=1,
                                        condition_on_previous_text=False, vad_filter=False)
        out = []
        for seg in segments:
            for w in seg.words or []:
                for part in w.word.replace("-", " ").split():  # "two-thirds" -> two, thirds
                    if norm(part):
                        out.append((norm(part), float(w.start), float(w.end)))
        return out
    except Exception as e:
        print(f"word alignment unavailable ({e}); timing from text length instead")
        _broken = True
        return None


def _tokens(text: str) -> list[str]:
    return [norm(p) for w in re.sub(r"<[^>]*>", " ", text).split() for p in w.replace("-", " ").split()]


def _match(script: list[str], words: list[tuple[str, float, float]]) -> tuple[dict[int, int], float]:
    """script token index -> heard word index, and the share of script tokens found."""
    got = [w[0] for w in words]
    sm = difflib.SequenceMatcher(None, script, got, autojunk=False)
    pairs = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            pairs[a + k] = b + k
    return pairs, len(pairs) / max(1, len(script))


def scene_cuts(wav: Path, texts: list[str]) -> list[float] | None:
    """Times to cut a take of several scenes at (one between each pair of scenes), or None."""
    words = heard(wav)
    if not words:
        return None
    toks, owner = [], []
    for i, t in enumerate(texts):
        tt = [x for x in _tokens(t) if x]
        toks += tt
        owner += [i] * len(tt)
    pairs, share = _match(toks, words)
    if share < 0.6:
        print(f"word alignment matched only {share:.0%} of the words; timing from text length instead")
        return None
    cuts = []
    for i in range(len(texts) - 1):
        # last heard word of scene i and first heard word of scene i+1
        ends = [words[pairs[k]][2] for k in range(len(toks)) if owner[k] <= i and k in pairs]
        starts = [words[pairs[k]][1] for k in range(len(toks)) if owner[k] > i and k in pairs]
        if not ends or not starts:
            return None
        a, b = max(ends), min(starts)
        cut = (a + b) / 2 if b >= a else b
        if cuts and cut <= cuts[-1] + 0.2:
            return None
        cuts.append(cut)
    print(f"scene cuts from word alignment ({share:.0%} of words matched)")
    return cuts


def save_word_times(wav: Path, text: str) -> bool:
    """Write <wav>.words.json: the start time of every subtitle word (as the captions split them)."""
    words = heard(wav)
    shown = [w for w in re.sub(r"<[^>]*>", " ", text).split() if w]
    if not words or not shown:
        return False
    # one token per shown word: its first part ("two-thirds" -> "two")
    toks = [(_tokens(w) or [""])[0] for w in shown]
    pairs, share = _match(toks, words)
    if share < 0.5:
        return False
    starts: list[float | None] = [words[pairs[k]][1] if k in pairs else None for k in range(len(shown))]
    # words the recogniser missed get a time between their found neighbours
    known = [k for k, s in enumerate(starts) if s is not None]
    for k in range(len(starts)):
        if starts[k] is None:
            prev = max((j for j in known if j < k), default=None)
            nxt = min((j for j in known if j > k), default=None)
            if prev is not None and nxt is not None:
                starts[k] = starts[prev] + (starts[nxt] - starts[prev]) * (k - prev) / (nxt - prev)
            elif prev is not None:
                starts[k] = starts[prev] + 0.3 * (k - prev)
            else:
                starts[k] = max(0.0, starts[nxt] - 0.3 * (nxt - k))
    for k in range(1, len(starts)):  # never run backwards
        starts[k] = max(starts[k], starts[k - 1])
    end = max(w[2] for w in words)
    Path(str(wav) + ".words.json").write_text(json.dumps({"starts": starts, "end": end}))
    return True
