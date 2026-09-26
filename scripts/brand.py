"""Shared look for generated images: colours, fonts and text helpers.

Used by make-share-images.py and make-clips.py. Needs Pillow.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"

BG = (11, 15, 20)
SURFACE = (19, 26, 34)
TEXT = (244, 241, 234)
MUTED = (136, 146, 160)
ACCENT = (255, 90, 60)
PULSE = (53, 211, 153)
BORDER = (36, 48, 59)

HEADLINE = FONTS / "BigShouldersDisplay-ExtraBold.ttf"
MONO = FONTS / "IBMPlexMono-SemiBold.ttf"
SANS_BOLD = FONTS / "IBMPlexSans-Bold.ttf"
SANS = FONTS / "IBMPlexSans-Regular.ttf"


def font(path, size):
    return ImageFont.truetype(str(path), size)


def load_data():
    return json.loads((ROOT / "data" / "episodes.json").read_text(encoding="utf-8"))


def date_label(iso):
    from datetime import date
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def series_label(ep, data):
    """'Pax Inguinalis · Part 2' for series episodes, else ''."""
    if not ep.get("series"):
        return ""
    name = data["series"][ep["series"]]
    return f"{name} · {ep.get('partLabel') or 'Part ' + str(ep['part'])}"


def wrap(draw, text, fnt, width):
    """Greedy word wrap to a pixel width."""
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit_text(draw, text, path, width, max_lines, sizes):
    """Largest size (from `sizes`, big to small) whose wrap fits in max_lines."""
    for size in sizes:
        fnt = font(path, size)
        lines = wrap(draw, text, fnt, width)
        if len(lines) <= max_lines:
            return fnt, lines
    fnt = font(path, sizes[-1])
    lines = wrap(draw, text, fnt, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=fnt) > width and " " in lines[-1]:
            lines[-1] = lines[-1].rsplit(" ", 1)[0]
        lines[-1] += "…"
    return fnt, lines


def pulse_line(draw, x, y, w, color=PULSE, width=4):
    """The site's EKG divider, scaled to width w with its baseline at y."""
    pts = [(0, 20), (200, 20), (215, 4), (228, 36), (242, 20), (260, 20), (272, 12), (284, 28), (296, 20), (640, 20)]
    s = w / 640
    draw.line([(x + px * s, y + (py - 20) * s * 1.2) for px, py in pts], fill=color, width=width, joint="curve")


def poster(height):
    """Channel artwork scaled to a given height."""
    art = Image.open(ROOT / "channel-poster.jpg").convert("RGB")
    w = round(art.width * height / art.height)
    return art.resize((w, height), Image.LANCZOS)


def fade_left(img, fade_w, color=BG):
    """Blend the left edge of img into a solid colour."""
    overlay = Image.new("RGB", img.size, color)
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    for x in range(fade_w):
        md.line([(x, 0), (x, img.height)], fill=round(255 * (1 - x / fade_w)))
    return Image.composite(overlay, img, mask)


def wordmark(draw, x, y, size):
    """'MEDICS' + accent 'MUSINGS' like the site header. Returns its width."""
    f = font(HEADLINE, size)
    draw.text((x, y), "MEDICS", font=f, fill=TEXT)
    w1 = draw.textlength("MEDICS", font=f)
    draw.text((x + w1, y), "MUSINGS", font=f, fill=ACCENT)
    return w1 + draw.textlength("MUSINGS", font=f)
