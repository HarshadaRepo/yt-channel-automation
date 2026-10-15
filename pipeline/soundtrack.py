"""Background score and sound effects, synthesised from scratch (no licences, no downloads).

Every look in animator/src/theme.ts has its own key, tempo and instruments, so a volcano video
doesn't sound like a Roman one. The arrangement follows the script: drums drop out on hushed
scenes and build on urgent ones, a whoosh marks every cut, and a low hit lands on title, stat,
chapter and versus reveals. mix() ducks the score under the narration.
"""
import subprocess
from pathlib import Path

import numpy as np

SR = 32000
RNG = np.random.default_rng(7)

# key root (MIDI), scale intervals, chord roots as scale degrees, tempo, and the instrument palette
LOOKS = {
    "ancient": dict(root=50, scale=[0, 1, 4, 5, 7, 8, 10], prog=[0, 1, 0, 6], bpm=92,
                    pluck="oud", drums="frame", pad=0.8, arp=[0, 2, 4, 2, 1, 2, 4, 6]),
    "mystery": dict(root=57, scale=[0, 2, 3, 5, 7, 8, 10], prog=[0, 5, 3, 4], bpm=76,
                    pluck="bell", drums="tick", pad=1.0, arp=[0, 4, 2, 7, 0, 4, 9, 7]),
    "ocean": dict(root=50, scale=[0, 2, 4, 6, 7, 9, 11], prog=[0, 4, 5, 3], bpm=100,
                  pluck="harp", drums="soft", pad=0.8, arp=[0, 2, 4, 7, 9, 7, 4, 2]),
    "empire": dict(root=48, scale=[0, 2, 3, 5, 7, 8, 10], prog=[0, 5, 2, 6], bpm=88,
                   pluck="brass", drums="taiko", pad=1.0, arp=[0, 0, 4, 0, 0, 4, 2, 4]),
    "modern": dict(root=53, scale=[0, 2, 3, 5, 7, 8, 10], prog=[0, 5, 2, 6], bpm=112,
                   pluck="synth", drums="electro", pad=0.7, arp=[0, 4, 7, 4, 9, 7, 4, 2]),
    "arctic": dict(root=52, scale=[0, 2, 4, 6, 7, 9, 11], prog=[0, 3, 5, 4], bpm=80,
                   pluck="bell", drums="none", pad=1.0, arp=[0, 4, 7, 11, 9, 7, 4, 2]),
    "inferno": dict(root=49, scale=[0, 2, 3, 5, 7, 8, 10], prog=[0, 0, 5, 6], bpm=96,
                    pluck="brass", drums="toms", pad=0.9, arp=[0, 0, 3, 0, 0, 5, 3, 1]),
    "atlas": dict(root=55, scale=[0, 2, 4, 5, 7, 9, 11], prog=[0, 5, 3, 4], bpm=96,
                  pluck="harp", drums="lofi", pad=0.8, arp=[0, 2, 4, 7, 4, 2, 4, 9]),
}

CALM = ("hushed", "solemn", "quiet", "slow", "ominous", "reflective", "gentle", "sad", "somber", "eerie", "whisper")
HOT = ("urgent", "excited", "building", "fast", "dramatic", "intense", "triumphant", "quickening", "epic", "energetic")
REVEAL = ("title", "stat", "list", "versus")


def _hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def _note(look: dict, degree: int, octave: int = 0) -> float:
    sc = look["scale"]
    return look["root"] + 12 * (octave + degree // len(sc)) + sc[degree % len(sc)]


def _env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-3)) * np.exp(-t / decay)


def _tone(freq: float, dur: float, harmonics, decay: float, attack: float = 0.005, detune: float = 0.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (amp, hdecay) in enumerate(harmonics, 1):
        f = freq * k * (1 + detune)
        if f > SR / 2.2:
            break
        out += amp * np.sin(2 * np.pi * f * t + RNG.random() * 6.28) * np.exp(-t / (decay * hdecay))
    return out * np.minimum(1, t / attack)


def _pluck(kind: str, freq: float, dur: float) -> np.ndarray:
    if kind == "bell":
        return _sum(_tone(freq, dur, [(1, 1), (0.4, 0.5), (0.25, 0.3), (0.12, 0.2)], 1.2),
                    0.2 * _tone(freq * 2.76, dur, [(1, 1)], 0.4))
    if kind == "oud":
        return _tone(freq, dur, [(1, 1), (0.7, 0.6), (0.5, 0.4), (0.35, 0.3), (0.2, 0.2)], 0.45)
    if kind == "brass":
        return np.tanh(1.6 * _tone(freq, dur, [(1, 1), (0.6, 1), (0.45, 0.9), (0.3, 0.8), (0.2, 0.7)], 0.7, 0.04))
    if kind == "synth":
        return _tone(freq, dur, [(1, 1), (0.5, 0.7), (0.33, 0.5), (0.25, 0.4), (0.2, 0.3), (0.16, 0.25)], 0.3)
    return _tone(freq, dur, [(1, 1), (0.35, 0.6), (0.15, 0.4), (0.08, 0.3)], 0.9)  # harp


def _noise(n: int, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(RNG.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def _sum(*sigs: np.ndarray) -> np.ndarray:
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs:
        out[: len(x)] += x
    return out


def _kick(level=1.0, low=45.0, high=140.0, decay=0.25):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = low + (high - low) * np.exp(-t / 0.04)
    return level * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)


def _hit(lo, hi, decay, level=1.0, dur=0.4):
    n = int(dur * SR)
    return level * _noise(n, lo, hi) * _env(n, 0.002, decay)


def _drum_bar(kind: str, beat: float, intensity: int) -> list[tuple[float, np.ndarray]]:
    """(offset in seconds, sample) hits for one 4-beat bar."""
    if kind == "none" or intensity == 0:
        return []
    h = []
    s16 = beat / 4
    if kind in ("electro", "lofi", "soft"):
        kicks = [0, 2] if kind != "electro" else [0, 1, 2, 3]
        h += [(b * beat, _kick(0.9 if kind != "soft" else 0.6)) for b in kicks]
        if intensity >= 2:
            snare = _sum(_hit(900, 6000, 0.08, 0.5), 0.3 * _tone(190, 0.4, [(1, 1)], 0.06))
            h += [(b * beat, snare) for b in (1, 3)]
            hat = _hit(7000, 14000, 0.025, 0.18 if kind != "lofi" else 0.12, 0.1)
            h += [(i * s16 * 2, hat) for i in range(8)]
        if intensity >= 3 and kind == "electro":
            h += [(i * s16, _hit(8000, 15000, 0.015, 0.08, 0.06)) for i in range(16) if i % 2]
    elif kind in ("taiko", "toms", "frame"):
        drum = (lambda lvl: _sum(_kick(lvl, 50, 110, 0.4), 0.25 * _hit(80, 600, 0.12, lvl))) if kind != "frame" else \
            (lambda lvl: _sum(_kick(lvl * 0.7, 90, 160, 0.18), 0.35 * _hit(200, 3000, 0.05, lvl)))
        pattern = {"taiko": [0, 1.5, 2, 3, 3.5], "toms": [0, 0.75, 1.5, 2, 2.75, 3.5], "frame": [0, 1, 1.5, 2.5, 3]}[kind]
        h += [(b * beat, drum(1.0 if b == 0 else 0.7)) for b in pattern]
        if intensity >= 2:
            shaker = _hit(4000, 12000, 0.04, 0.1, 0.12)
            h += [(i * s16 * 2, shaker) for i in range(8)]
        if intensity >= 3 and kind == "taiko":
            h += [(3 * beat + i * s16 / 2, _hit(1000, 6000, 0.04, 0.12 + 0.05 * i, 0.15)) for i in range(8)]
    elif kind == "tick":
        h += [(i * beat / 2, _hit(3000, 9000, 0.008, 0.12, 0.05)) for i in range(8)]
        if intensity >= 2:  # heartbeat
            h += [(0, _kick(0.7, 40, 80, 0.15)), (0.28, _kick(0.5, 40, 80, 0.15))]
    return h


def _add(buf: np.ndarray, at: float, sig: np.ndarray, pan: float = 0.0):
    i = int(at * SR)
    if i >= buf.shape[1]:
        return
    sig = sig[: buf.shape[1] - i]
    buf[0, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    buf[1, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def _reverb(x: np.ndarray, seconds: float = 1.8, wet: float = 0.25) -> np.ndarray:
    n_ir = int(seconds * SR)
    out = np.empty_like(x)
    block = 1 << 18
    size = 1 << int(np.ceil(np.log2(block + n_ir)))
    for ch in range(2):
        ir = _noise(n_ir, 200, 7000) * np.exp(-np.arange(n_ir) / SR / (seconds / 5))
        ir /= np.sqrt((ir ** 2).sum())
        IR = np.fft.rfft(ir, size)
        y = np.zeros(x.shape[1] + n_ir)
        for s in range(0, x.shape[1], block):
            seg = x[ch, s:s + block]
            conv = np.fft.irfft(np.fft.rfft(seg, size) * IR, size)[: len(seg) + n_ir]
            y[s:s + len(conv)] += conv
        out[ch] = (1 - wet) * x[ch] + wet * y[: x.shape[1]]
    return out


def _intensity(scene: dict, i: int, n: int) -> int:
    mood = (scene.get("delivery") or "").lower()
    if i == 0:
        return 1
    if any(w in mood for w in CALM) or scene.get("type") == "document":
        return 1
    if any(w in mood for w in HOT):
        return 3
    return 2 if i < n - 1 else 1


def score(style: str, scenes: list[dict], durations: list[float], out: Path) -> Path:
    """Write a stereo score that follows the scene list (durations in seconds)."""
    look = LOOKS.get(style, LOOKS["atlas"])
    total = sum(durations) + 2.0
    buf = np.zeros((2, int(total * SR)))
    music = np.zeros_like(buf)
    beat = 60 / look["bpm"]
    bar = 4 * beat
    starts = np.cumsum([0] + durations[:-1])
    levels = [_intensity(s, i, len(scenes)) for i, s in enumerate(scenes)]

    def level_at(t):
        k = int(np.searchsorted(starts, t, side="right")) - 1
        return levels[max(0, min(k, len(levels) - 1))]

    nbars = int(np.ceil(total / bar))
    for b in range(nbars):
        t0 = b * bar
        lvl = level_at(t0)
        chord = look["prog"][b % len(look["prog"])]
        # pad: the triad, slow attack, soft harmonics, voices spread left/right
        for j, deg in enumerate((chord, chord + 2, chord + 4)):
            f = _hz(_note(look, deg, 0))
            for det, pan in ((-0.003, -0.6), (0.003, 0.6)):
                tone = _tone(f, bar + 1.5, [(1, 1), (0.3, 1), (0.12, 1)], 6.0, 0.6, det)
                tone *= np.minimum(1, (len(tone) - np.arange(len(tone))) / (1.2 * SR))
                _add(music, t0, 0.05 * look["pad"] * tone, pan * (j - 1) / 1.5 if j != 1 else pan * 0.3)
        # bass on the root
        bass = _tone(_hz(_note(look, chord, -2)), bar, [(1, 1), (0.4, 0.6), (0.15, 0.4)], 1.4, 0.01)
        if lvl >= 2:
            _add(music, t0, 0.16 * bass)
            _add(music, t0 + 2 * beat, 0.12 * bass[: int(2 * beat * SR)])
        else:
            _add(music, t0, 0.1 * bass)
        # arpeggio / ostinato
        step = beat / 2 if lvl < 3 else beat / 4
        count = int(round(bar / step))
        for k in range(count):
            if lvl == 1 and k % 2:
                continue
            deg = chord + look["arp"][k % len(look["arp"])]
            note = _pluck(look["pluck"], _hz(_note(look, deg, 1)), min(1.6, step * 4))
            _add(music, t0 + k * step, 0.07 * note, 0.35 * np.sin(k * 1.3))
        for off, hit in _drum_bar(look["drums"], beat, lvl):
            _add(music, t0 + off, 0.22 * hit, 0.15 * RNG.standard_normal())

    music = _reverb(music, 2.2 if style in ("arctic", "mystery", "empire") else 1.6, 0.3)
    buf += music

    # sound effects on the cuts
    for i, (t, sc) in enumerate(zip(starts, scenes)):
        if i:
            n = int(0.7 * SR)
            whoosh = _noise(n, 300, 5000) * np.sin(np.linspace(0, np.pi, n)) ** 2
            sweep = np.linspace(0.4, 1.0, n)
            _add(buf, t - 0.45, 0.14 * whoosh * sweep, -0.4)
            _add(buf, t - 0.40, 0.14 * whoosh[::-1] * sweep, 0.4)
        if sc.get("type") in REVEAL:
            boom = _sum(_kick(1.0, 32, 90, 0.7), 0.3 * _hit(60, 400, 0.4, 1.0, 1.2))
            _add(buf, t + 0.05, 0.35 * boom)

    # fade in and out, then leave headroom
    fade = int(1.5 * SR)
    buf[:, :fade] *= np.linspace(0, 1, fade)
    buf[:, -fade * 2:] *= np.linspace(1, 0, fade * 2)
    buf /= np.abs(buf).max() + 1e-9
    pcm = (buf.T * 0.9 * 32767).astype("<i2")
    raw = Path(out).with_suffix(".pcm")
    raw.write_bytes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", str(raw),
                    str(out)], check=True)
    raw.unlink()
    return Path(out)


def mix(video: Path, music: Path, out: Path, level: float = 0.2) -> Path:
    """Lay the score under the narration and duck it whenever the narrator speaks."""
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(music),
        "-filter_complex",
        "[0:a]aformat=channel_layouts=stereo,asplit=2[v][key];"
        f"[1:a]volume={level}[m];"
        "[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=450[duck];"
        "[v][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", str(out),
    ], check=True)
    return Path(out)
