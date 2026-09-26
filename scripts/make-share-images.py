#!/usr/bin/env python
"""Make a 1200x630 share image for each episode: og/<slug>.jpg.

Links to an episode page shared on social media, Slack or iMessage then show
that episode's title instead of the generic show artwork. build-episodes.mjs
uses og/<slug>.jpg whenever it exists.

    python scripts/make-share-images.py            # all episodes
    python scripts/make-share-images.py --missing  # only episodes without one
    python scripts/make-share-images.py SLUG ...   # specific episodes

Needs Pillow (pip install pillow). Run build-episodes.mjs afterwards.
"""
import sys

from PIL import Image, ImageDraw

import brand as b

W, H = 1200, 630
PAD = 64


def render(ep, data):
    img = Image.new("RGB", (W, H), b.BG)

    # Artwork on the right, fading into the background.
    art = b.poster(H)
    art_x = W - art.width
    img.paste(b.fade_left(art, 170), (art_x, 0))

    d = ImageDraw.Draw(img)
    text_w = art_x - PAD - 30

    b.wordmark(d, PAD, PAD - 8, 40)

    eyebrow = (b.series_label(ep, data) or "Medical satire podcast").upper()
    mono = b.font(b.MONO, 22)
    meta = f"{b.date_label(ep['date'])} · {ep['minutes']} min".upper()
    summary_font = b.font(b.SANS, 26)
    top, bottom = 130, H - 120

    # Largest title size whose whole stack (eyebrow, title, meta, and the
    # one-line summary when the title is short) fits between wordmark and footer.
    for size in [104, 96, 88, 80, 72, 66, 60, 54, 48, 44]:
        title_font, lines = b.fit_text(d, ep["title"].upper(), b.HEADLINE, text_w, 5, [size])
        line_h = round(title_font.size * 0.98)
        summary = b.fit_text(d, ep["summary"], b.SANS, text_w, 3, [26])[1] if len(lines) <= 2 else []
        block = 42 + len(lines) * line_h + 18 + 30 + (24 + len(summary) * 36 if summary else 0)
        if block <= bottom - top:
            break
    y = top + max(0, (bottom - top - block) // 2)

    d.text((PAD, y), eyebrow, font=mono, fill=b.PULSE)
    y += 42
    for line in lines:
        d.text((PAD, y), line, font=title_font, fill=b.TEXT)
        y += line_h
    y += 18
    d.text((PAD, y), meta, font=b.font(b.MONO, 22), fill=b.MUTED)
    y += 30
    if summary:
        y += 24
        for line in summary:
            d.text((PAD, y), line, font=summary_font, fill=b.MUTED)
            y += 36

    b.pulse_line(d, PAD, H - 78, 250)
    d.text((PAD + 270, H - 94), "medicsmusings.com", font=b.font(b.MONO, 24), fill=b.TEXT)
    d.rectangle([0, H - 6, W, H], fill=b.ACCENT)
    return img


def main(argv):
    data = b.load_data()
    out = b.ROOT / "og"
    out.mkdir(exist_ok=True)
    only_missing = "--missing" in argv
    slugs = [a for a in argv if not a.startswith("--")]
    made = 0
    for ep in data["episodes"]:
        if slugs and ep["slug"] not in slugs:
            continue
        path = out / f"{ep['slug']}.jpg"
        if only_missing and path.exists():
            continue
        render(ep, data).save(path, "JPEG", quality=86, optimize=True, progressive=True)
        made += 1
    print(f"Made {made} share image(s) in {out}")


if __name__ == "__main__":
    main(sys.argv[1:])
