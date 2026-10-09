"""Voice a list of passages with Chatterbox. Runs inside its own virtualenv (see tts._chatterbox_many)
so its pinned torch/numpy versions never clash with the rest of the pipeline.

    python chatterbox_worker.py jobs.json     # [{"text", "out", "exaggeration", "ref"}, ...]
"""
import json
import re
import sys

import perth
import torch
import torchaudio

# resemble-perth leaves its watermarker as None when setuptools' pkg_resources is missing.
if getattr(perth, "PerthImplicitWatermarker", None) is None:
    perth.PerthImplicitWatermarker = perth.DummyWatermarker

from chatterbox.tts import ChatterboxTTS  # noqa: E402

model = ChatterboxTTS.from_pretrained(device="cpu")
jobs = json.load(open(sys.argv[1]))
for n, job in enumerate(jobs):
    # Chatterbox is most reliable on short passages: voice sentence groups and join them.
    parts, cur = [], ""
    for sent in re.split(r"(?<=[.!?])\s+", job["text"]):
        if cur and len(cur) + len(sent) > 250:
            parts.append(cur)
            cur = ""
        cur = f"{cur} {sent}".strip()
    if cur:
        parts.append(cur)
    pause = torch.zeros(1, int(model.sr * 0.25))
    audio = []
    for t in parts:
        audio += [model.generate(t, audio_prompt_path=job.get("ref"), exaggeration=job["exaggeration"], cfg_weight=0.5), pause]
    torchaudio.save(job["out"], torch.cat(audio, dim=1), model.sr)
    print(f"chatterbox {n + 1}/{len(jobs)}", flush=True)
