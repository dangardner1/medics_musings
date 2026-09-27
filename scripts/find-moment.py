#!/usr/bin/env python
"""Find the second at which a phrase is said in an episode's transcript.

Used to fill in the "t" (seconds) field for entries in data/eponyms.json and
data/timeline.json: a "Hear it" link on those pages jumps the episode player
to that moment (/episodes/<slug>/?t=<seconds>).

    python scripts/find-moment.py SLUG "phrase to find"
    python scripts/find-moment.py SLUG "phrase" --context   # also print the sentence

Looks in transcripts/<slug>.json (written by transcribe.py) or, if that
doesn't exist, clips/<slug>/words.json (written by make-clips.py).
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

norm = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


def spans(slug):
    """[(start_seconds, normalized_text)] from either transcript format."""
    seg = ROOT / "transcripts" / f"{slug}.json"
    if seg.exists():
        return [(x["s"], norm(x["t"]), x["t"]) for x in json.loads(seg.read_text(encoding="utf-8"))]
    words = ROOT / "clips" / slug / "words.json"
    if words.exists():
        w = json.loads(words.read_text(encoding="utf-8"))
        return [(w[i]["s"], norm(" ".join(x["w"] for x in w[i:i + 10])), " ".join(x["w"] for x in w[i:i + 10]))
                for i in range(len(w))]
    sys.exit(f"No transcripts/{slug}.json or clips/{slug}/words.json found.")


def find(slug, phrase):
    sp = spans(slug)
    key = norm(phrase)
    words = key.split()
    # Try the full phrase, then shorter prefixes (a segment can cut a phrase short).
    for n in range(len(words), 0, -1):
        k = " ".join(words[:n])
        for s, t, raw in sp:
            if k in t:
                return s, raw
    return None, None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("phrase")
    ap.add_argument("--context", action="store_true", help="also print the matched segment's text")
    args = ap.parse_args()

    t, raw = find(args.slug, args.phrase)
    if t is None:
        print(f"Not found: {args.phrase!r} in {args.slug}", file=sys.stderr)
        return 1
    print(round(t))
    if args.context:
        print(f"  -> {raw}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
