#!/usr/bin/env python
"""Quote cards: shareable 1200x630 images of a line from an episode.

Quotes live in data/quotes.json ({ slug: [{ "text": ..., "t": seconds }] }) and
are yours to edit: reorder, trim or replace them, then re-render. Each quote
gets og/quotes/<slug>-<n>.jpg and, after build-episodes.mjs, a share page at
/episodes/<slug>/quotes/<n>/ whose link preview is the card (LinkedIn, X, Slack).

    python scripts/make-quote-cards.py --pick          # suggest 3 lines for episodes with a transcript and no quotes yet
    python scripts/make-quote-cards.py --pick SLUG     # (re)suggest for one episode, replacing its quotes
    python scripts/make-quote-cards.py                 # render cards that don't exist yet
    python scripts/make-quote-cards.py --force [SLUG]  # re-render (after editing a quote)

Suggestions come from transcripts/<slug>.txt; timestamps from transcripts/<slug>.json
(written by transcribe.py) or clips/<slug>/words.json. Proofread picks: Whisper
doesn't know who is speaking or where the joke lands.

Then run `node scripts/build-episodes.mjs`. Needs Pillow.
"""
import json
import re
import sys

from PIL import Image, ImageDraw

import brand as b

W, H = 1200, 630
PAD = 72
QUOTES = b.ROOT / "data" / "quotes.json"
OUT = b.ROOT / "og" / "quotes"

WEAK_STARTS = {"and", "but", "so", "because", "which", "that", "it", "this", "they", "he", "she", "him", "her",
               "yeah", "right", "exactly", "oh", "um", "uh", "or", "then", "also", "well", "now", "okay", "yes", "no"}


# ---- Picking -------------------------------------------------------------------------

def sentences(text):
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])", text)
    return [p.strip() for p in parts if p.strip()]


def score(s):
    words = s.split()
    first = re.sub(r"\W", "", words[0]).lower()
    n = len(s)
    if n < 45 or n > 180 or len(words) < 7:
        return None
    if first in WEAK_STARTS:
        return None
    sc = 0.0
    sc -= abs(n - 105) / 40                       # short enough to read on a card
    sc += 1.5 * s.count("!") + 0.4 * s.count("?")
    sc += 1.0 if re.search(r"\b(never|always|nobody|everyone|only|secret|worst|best)\b", s, re.I) else 0
    sc += 0.8 if re.search(r"\d", s) else 0        # specifics are quotable
    sc += 1.2 if re.search(r"[,;:—-] [^,;:—-]{3,40}[.!]$", s) else 0   # a turn at the end reads as a punchline
    sc -= 2 if re.search(r"\b(welcome|subscribe|podcast|episode|today we|in this)\b", s, re.I) else 0
    sc -= 1.5 if s.endswith("?") else 0
    sc -= 1 if re.search(r"\b(I|we) (think|mean|guess)\b", s) else 0
    return sc


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower())


def timings(slug):
    """[(start_seconds, normalized text)] from transcribe.py's segments or the clip maker's words."""
    seg_file = b.ROOT / "transcripts" / f"{slug}.json"
    if seg_file.exists():
        return [(x["s"], norm(x["t"])) for x in json.loads(seg_file.read_text(encoding="utf-8"))]
    words_file = b.ROOT / "clips" / slug / "words.json"
    if words_file.exists():
        words = json.loads(words_file.read_text(encoding="utf-8"))
        # Sliding windows of 12 words, so a quote's opening words can be found.
        return [(words[i]["s"], norm(" ".join(w["w"] for w in words[i:i + 12]))) for i in range(len(words))]
    return []


def find_time(quote, spans):
    key = " ".join(norm(quote).split()[:5])
    for start, text in spans:
        if key and key in text:
            return round(start, 1)
    return None


def pick(slug, count=3):
    path = b.ROOT / "transcripts" / f"{slug}.txt"
    if not path.exists():
        return []
    sents = sentences(path.read_text(encoding="utf-8"))
    ranked = sorted(((score(s), i, s) for i, s in enumerate(sents) if score(s) is not None), reverse=True)
    chosen, used = [], set()
    for sc, i, s in ranked:
        if any(abs(i - j) < 4 for j in used):   # spread picks across the episode
            continue
        chosen.append((i, s))
        used.add(i)
        if len(chosen) == count:
            break
    spans = timings(slug)
    out = []
    for i, s in sorted(chosen):
        q = {"text": s}
        t = find_time(s, spans)
        if t is not None:
            q["t"] = t
        out.append(q)
    return out


def curly(text):
    """Typographic apostrophes and quotes for the card."""
    text = re.sub(r"(\w)'", r"\1’", text)
    text = re.sub(r'"(\S)', r"“\1", text)
    return text.replace("'", "’").replace('"', "”")


# ---- Rendering ----------------------------------------------------------------------------

def render(ep, quote, number):
    img = Image.new("RGB", (W, H), b.BG)
    d = ImageDraw.Draw(img)

    # Channel artwork as a faint panel on the right.
    # Enlarged so the crop shows the host illustration, not the poster's lettering.
    art = b.poster(round(H * 1.45))
    art_x = W - 300
    left = (art.width - 300) // 2 + 40
    top_crop = round(art.height * 0.19)
    panel = b.fade_left(art.crop((left, top_crop, left + 300, top_crop + H)), 220)
    # Fade the top and bottom edges too, so no poster lettering shows.
    mask = Image.new("L", panel.size, 0)
    md = ImageDraw.Draw(mask)
    for y in range(160):
        md.line([(0, y), (300, y)], fill=round(255 * (1 - y / 160)))
    for y in range(190):
        md.line([(0, H - 1 - y), (300, H - 1 - y)], fill=round(255 * (1 - y / 190)))
    panel = Image.composite(Image.new("RGB", panel.size, b.BG), panel, mask)
    img.paste(panel, (art_x, 0))
    veil = Image.new("RGB", (300, H), b.BG)
    img.paste(Image.blend(img.crop((art_x, 0, W, H)), veil, 0.45), (art_x, 0))

    b.wordmark(d, PAD, PAD - 20, 38)
    d.text((PAD - 8, 92), "“", font=b.font(b.HEADLINE, 180), fill=b.ACCENT)

    text_w = W - PAD - 330
    top, bottom = 170, H - 150
    for size in [60, 54, 50, 46, 42, 38, 34, 30]:
        f = b.font(b.SANS_BOLD, size)
        lines = b.wrap(d, curly(quote["text"]), f, text_w)
        line_h = round(size * 1.22)
        if len(lines) * line_h <= bottom - top:
            break
    y = top + max(0, (bottom - top - len(lines) * line_h) // 2)
    for line in lines:
        d.text((PAD, y), line, font=f, fill=b.TEXT)
        y += line_h

    src_font, src = b.fit_text(d, f"— {ep['title']}".upper(), b.MONO, text_w, 2, [22, 20, 18])
    y = H - 132
    for line in src:
        d.text((PAD, y), line, font=src_font, fill=b.PULSE)
        y += 28

    b.pulse_line(d, PAD, H - 50, 200)
    d.text((PAD + 220, H - 66), f"medicsmusings.com/e/{number}", font=b.font(b.MONO, 24), fill=b.TEXT)
    d.rectangle([0, H - 6, W, H], fill=b.ACCENT)
    return img


def episode_numbers(data):
    eps = sorted(enumerate(data["episodes"]), key=lambda x: (x[1]["date"], -x[0]))
    return {e["slug"]: n + 1 for n, (_, e) in enumerate(eps)}


def main(argv):
    data = b.load_data()
    by_slug = {e["slug"]: e for e in data["episodes"]}
    slugs = [a for a in argv if not a.startswith("--")]
    for s in slugs:
        if s not in by_slug:
            print(f"No episode with slug '{s}'", file=sys.stderr)
            return 1
    quotes = json.loads(QUOTES.read_text(encoding="utf-8")) if QUOTES.exists() else {}

    if "--pick" in argv:
        targets = slugs or [e["slug"] for e in data["episodes"] if not quotes.get(e["slug"])]
        for slug in targets:
            picks = pick(slug)
            if picks:
                quotes[slug] = picks
                print(f"{slug}:")
                for q in picks:
                    print(f"   {q.get('t', '?')}s  {q['text']}")
        QUOTES.write_text(json.dumps(quotes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Saved suggestions to {QUOTES.relative_to(b.ROOT)}. Edit them, then run this again without --pick.")
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    nums = episode_numbers(data)
    force = "--force" in argv
    made = 0
    for slug, qs in quotes.items():
        if slug not in by_slug or (slugs and slug not in slugs):
            continue
        # Hand-written quotes: look up where they're said, when we can.
        if any("t" not in q for q in qs):
            spans = timings(slug)
            for q in qs:
                if "t" not in q and (t := find_time(q["text"], spans)) is not None:
                    q["t"] = t
        for n, q in enumerate(qs, start=1):
            path = OUT / f"{slug}-{n}.jpg"
            if path.exists() and not force:
                continue
            render(by_slug[slug], q, nums[slug]).save(path, "JPEG", quality=86, optimize=True, progressive=True)
            made += 1
        # Cards left over from quotes that were removed.
        n = len(qs) + 1
        while (OUT / f"{slug}-{n}.jpg").exists():
            (OUT / f"{slug}-{n}.jpg").unlink()
            n += 1
    QUOTES.write_text(json.dumps(quotes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Made {made} quote card(s) in {OUT.relative_to(b.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
