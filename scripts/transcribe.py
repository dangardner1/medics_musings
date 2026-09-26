#!/usr/bin/env python
"""Transcribe an episode with Whisper (faster-whisper) into transcripts/<slug>.txt.

The episode page shows that file as its transcript (paragraphs separated by a
blank line) and adds it to the page's search data. Runs locally and is free.

One-time setup (already done on this machine):
    python -m venv C:/Users/dgard/.venvs/medics-whisper
    C:/Users/dgard/.venvs/medics-whisper/Scripts/python -m pip install faster-whisper

Usage:
    C:/Users/dgard/.venvs/medics-whisper/Scripts/python scripts/transcribe.py AUDIO SLUG [--model medium.en]

    AUDIO  mp3, m4a, mp4 or wav file
    SLUG   the episode's slug in data/episodes.json (the /episodes/<slug>/ part)

Then run `node scripts/build-episodes.mjs` to put the transcript on the page.
The first run downloads the model (medium.en is about 1.5 GB) into the Hugging
Face cache; later runs reuse it.

Whisper doesn't label speakers, so a conversation reads as continuous text;
paragraphs break at pauses and roughly every few sentences.
"""
import argparse
import re
import sys
import time
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent

# Names and terms the show uses; helps Whisper spell them correctly.
VOCAB = (
    "Medics Musings. Leo A. Gordon, MD and Dan Gardner, MD. Laparoscopic surgery, "
    "obturator hernia, Richter's hernia, rectus abdominis, intra-abdominal pressure, "
    "Cooper's ligaments, fat necrosis, ecdysiast, Laplace, anastomosis, gallbladder, "
    "Pax Inguinalis, Algo Chats-a-Lot, Mencken, Nirdlinger."
)

ABBREVIATIONS = ("dr", "mr", "mrs", "ms", "st", "jr", "sr", "vs", "md", "no", "a", "h.l", "u.s")


def is_sentence_end(text: str) -> bool:
    t = text.strip()
    if not t or t[-1] not in ".?!":
        return False
    last = t.split()[-1].rstrip(".?!").lower()
    return last not in ABBREVIATIONS


def build_paragraphs(segments, pause=1.2, max_sentences=5, max_chars=650):
    """Group Whisper segments into readable paragraphs."""
    paragraphs, current, sentences, prev_end = [], [], 0, None
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        gap = (seg.start - prev_end) if prev_end is not None else 0
        length = sum(len(s) + 1 for s in current)
        if current and is_sentence_end(current[-1]) and (
            gap >= pause or sentences >= max_sentences or length >= max_chars
        ):
            paragraphs.append(" ".join(current))
            current, sentences = [], 0
        current.append(text)
        if is_sentence_end(text):
            sentences += 1
        prev_end = seg.end
    if current:
        paragraphs.append(" ".join(current))
    return [re.sub(r"\s+", " ", p).strip() for p in paragraphs]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("slug")
    ap.add_argument("--model", default="medium.en", help="Whisper model (tiny.en, small.en, medium.en, large-v3)")
    ap.add_argument("--out", default=str(ROOT / "transcripts"))
    args = ap.parse_args()

    audio = Path(args.audio)
    if not audio.exists():
        print(f"Audio file not found: {audio}", file=sys.stderr)
        return 1

    print(f"Loading {args.model} (downloads on first use)...", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    started = time.time()
    segments, info = model.transcribe(
        str(audio),
        language="en",
        beam_size=5,
        vad_filter=True,
        initial_prompt=VOCAB,
        condition_on_previous_text=False,  # avoids repetition loops on long audio
    )
    duration = info.duration
    collected = []
    for seg in segments:
        collected.append(seg)
        pct = min(100, int(100 * seg.end / duration)) if duration else 0
        print(f"\r  {pct:3d}%  {seg.end / 60:5.1f} of {duration / 60:.1f} min", end="", flush=True)
    print()

    paragraphs = build_paragraphs(collected)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{args.slug}.txt"
    out_file.write_text("\n\n".join(paragraphs) + "\n", encoding="utf-8")
    words = sum(len(p.split()) for p in paragraphs)
    print(f"Wrote {out_file} ({len(paragraphs)} paragraphs, {words} words) in {(time.time() - started) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
