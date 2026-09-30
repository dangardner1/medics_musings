#!/usr/bin/env python
"""Promo images for posting about the site: og/promo/<angle>.jpg (1200x630,
link previews) and og/promo/<angle>-square.jpg (1080x1080, Instagram/LinkedIn).

    python scripts/make-promo-images.py

Edit ANGLES below to change the wording, then re-run. Needs Pillow.
"""
from PIL import Image, ImageDraw

import brand as b

OUT = b.ROOT / "og" / "promo"

# (slug, eyebrow, headline, subline, url path)
ANGLES = [
    ("eponym-game", "DAILY GAME", "Name that eponym.", "One real medical eponym a day. Five guesses. Guessing is free, unlike the MRI.", "/games/eponym/"),
    ("word-rounds", "DAILY GAME", "Word Rounds.", "A medical word search on a new theme every day. The clock is running, like a time-out nobody called.", "/games/word-rounds/"),
    ("news-of-the-day", "EVERY MORNING", "Health care news, with a straight face. Almost.", "One real story a day, linked, with a satirical headline and take from two doctors.", "/news/"),
    ("top-10", "EVERY MONDAY", "The Top 10 in AI and health care.", "Real papers and headlines, ranked, with one satirical take each. The hype gets roasted, the authors don't.", "/top-10/"),
    ("line-of-the-day", "DAILY", "Line of the day.", "One line from the episodes each morning, straight from the transcript. No laugh track required.", "/line-of-the-day/"),
    ("for-educators", "FOR TEACHERS & PROGRAM DIRECTORS", "Grand rounds, but people stay awake.", "Free discussion guides built around satirical episodes, plus plain-English explainers and eponym histories.", "/teach/"),
    ("podcast", "THE PODCAST", "Healthcare, unfiltered.", "Two physicians, medical satire, and the occasional bucket of ice water. Games, explainers and daily news too.", "/"),
]


def art_panel(width, height):
    """The channel artwork cropped to the host illustration, faded into the background."""
    art = b.poster(round(height * 1.45))
    left = (art.width - width) // 2 + 40
    top = round(art.height * 0.19)
    panel = b.fade_left(art.crop((left, top, left + width, top + height)), round(width * 0.73))
    mask = Image.new("L", panel.size, 0)
    md = ImageDraw.Draw(mask)
    for y in range(160):
        md.line([(0, y), (width, y)], fill=round(255 * (1 - y / 160)))
    fade = round(height * 0.42)
    for y in range(fade):
        md.line([(0, height - 1 - y), (width, height - 1 - y)], fill=round(255 * (1 - y / fade)))
    return Image.composite(Image.new("RGB", panel.size, b.BG), panel, mask)


def wide(eyebrow, headline, sub, path):
    W, H, PAD = 1200, 630, 72
    img = Image.new("RGB", (W, H), b.BG)
    img.paste(art_panel(300, H), (W - 300, 0))
    d = ImageDraw.Draw(img)
    text_w = W - PAD - 330
    b.wordmark(d, PAD, 56, 40)
    d.text((PAD, 150), eyebrow, font=b.font(b.MONO, 24), fill=b.PULSE)
    hf, hl = b.fit_text(d, headline.upper(), b.HEADLINE, text_w, 2, [104, 92, 80, 70])
    y = 192
    for line in hl:
        d.text((PAD, y), line, font=hf, fill=b.TEXT)
        y += round(hf.size * 0.98)
    sf, sl = b.fit_text(d, sub, b.SANS, text_w, 3, [30, 28, 26])
    y += 18
    for line in sl:
        d.text((PAD, y), line, font=sf, fill=b.MUTED)
        y += round(sf.size * 1.35)
    b.pulse_line(d, PAD, H - 62, 200)
    d.text((PAD + 220, H - 78), "medicsmusings.com" + (path if path != "/" else ""), font=b.font(b.MONO, 26), fill=b.TEXT)
    d.rectangle([0, H - 8, W, H], fill=b.ACCENT)
    return img


def square(eyebrow, headline, sub, path):
    S, PAD = 1080, 80
    img = Image.new("RGB", (S, S), b.BG)
    art = art_panel(380, 520)
    img.paste(art, (S - 380, S - 520 - 8))
    d = ImageDraw.Draw(img)
    text_w = S - 2 * PAD
    b.wordmark(d, PAD, 80, 48)
    d.text((PAD, 200), eyebrow, font=b.font(b.MONO, 28), fill=b.PULSE)
    hf, hl = b.fit_text(d, headline.upper(), b.HEADLINE, text_w, 3, [132, 118, 104, 92])
    y = 246
    for line in hl:
        d.text((PAD, y), line, font=hf, fill=b.TEXT)
        y += round(hf.size * 0.98)
    sf, sl = b.fit_text(d, sub, b.SANS, S - PAD - 400, 5, [34, 31, 28])
    y += 26
    for line in sl:
        d.text((PAD, y), line, font=sf, fill=b.MUTED)
        y += round(sf.size * 1.35)
    b.pulse_line(d, PAD, S - 96, 220)
    d.text((PAD, S - 72), "medicsmusings.com" + (path if path != "/" else ""), font=b.font(b.MONO, 30), fill=b.TEXT)
    d.rectangle([0, S - 8, S, S], fill=b.ACCENT)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, eyebrow, headline, sub, path in ANGLES:
        wide(eyebrow, headline, sub, path).save(OUT / f"{slug}.jpg", quality=88, optimize=True, progressive=True)
        square(eyebrow, headline, sub, path).save(OUT / f"{slug}-square.jpg", quality=88, optimize=True, progressive=True)
    print(f"Made {len(ANGLES) * 2} promo images in {OUT.relative_to(b.ROOT)}")


if __name__ == "__main__":
    main()
