#!/usr/bin/env python
"""Render the satirical 2-minute site explainer ("mandatory annual orientation")
as a 1920x1080 video (or 1080x1920 for Shorts with --vertical): site screenshots
with slow Ken Burns moves, brand title cards, a compliance-module progress bar,
burned-in captions and the narration.

    python scripts/make-explainer.py
    python scripts/make-explainer.py --vertical      # 9:16 for Shorts, Reels and TikTok

Inputs, all in clips/explainer/ (not committed):
  shots/<name>.png   1920x1080 screenshots of the live site (headless Edge:
                     msedge --headless=new --window-size=1920,1080 --screenshot=...)
  shots-v/<name>.png 1080x1920 phone-layout screenshots for --vertical
                     (--window-size=540,960 --force-device-scale-factor=2)
  vo/<n>.mp3         narration for scene n (1-8), one file per line in SCENES

Output: clips/explainer/medics-musings-explainer[-vertical].mp4 (+ .srt, script.txt).
Needs Pillow and ffmpeg on the PATH.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

import brand as b

W, H = 1920, 1080
VERT = False     # set by --vertical; W and H flip to 1080x1920
NAME = "medics-musings-explainer"
FPS = 30
OUT = b.ROOT / "clips" / "explainer"
LEAD, TAIL, SLIDE = 0.45, 0.7, 0.55   # seconds: silence before/after each line, shot-to-shot push

# (label for the lower third, shots, narration). Shot names: shots/<name>.png or a generated card.
SCENES = [
    ("", ["@title"],
     "Welcome to your mandatory annual Medics Musings orientation. This module is non-billable, "
     "carries zero CME credits, and cannot be skipped. Please silence your pager."),
    ("Exhibit A: the homepage", ["home"],
     "Medics Musings is a medical satire podcast. Two physicians, former medical school classmates "
     "Leo A. Gordon and Dan Gardner, let artificial intelligence discuss healthcare... so that they don't have to."),
    ("The attendings", ["@hosts"],
     "Between them: decades of clinical experience. One podcast. And no prior authorization required."),
    ("Required listening (non-formulary)", ["@episodes"],
     "Episodes cover the essentials of modern medicine: robots in elder care, the inguinal hernia peace "
     "process, and a burlesque career in Tulsa. Available wherever you pretend to listen during rounds."),
    ("Continuing education (unaccredited)", ["eponyms", "timeline", "explained"],
     "For continuing education, browse the Eponym Index, to learn who is really behind the names. Then the "
     "Timeline of surgery and medicine, and plain-language explainers on prior authorization, AI scribes, "
     "and hernias. None of it is on the boards. Probably."),
    ("Downtime procedures", ["wordrounds", "news"],
     "And when the EHR goes down... again... there's Word Rounds, a daily medical word search, plus the "
     "News of the Day and the Top Ten. The clock is running, like a surgical time-out that nobody called."),
    ("Incident reporting", ["teach", "submit"],
     "Educators can teach with it. Everyone else can submit their worst story. Our lawyers ask that you "
     "anonymise it. Our hosts ask that you make it funny."),
    ("", ["@end"],
     "Ask your doctor if Medics Musings is right for you. Side effects may include laughing during rounds, "
     "eye-rolling at administrators, and an irresistible urge to subscribe. Medics Musings dot com. "
     "Diagnose your commute."),
]
END_HOLD = 3.0

# Where each screenshot's content sits, so the zoom drifts toward it (fractions of the frame).
FOCUS = {"home": (0.45, 0.42), "wordrounds": (0.40, 0.45), "news": (0.30, 0.40)}
DEFAULT_FOCUS = (0.40, 0.35)
VERT_FOCUS = (0.5, 0.0)


# ---- Timing ------------------------------------------------------------------------------------

def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def timeline():
    t, rows = 0.0, []
    for i, (label, shots, text) in enumerate(SCENES, 1):
        vo = duration(OUT / "vo" / f"{i}.mp3")
        lead = LEAD + (0.6 if i == 1 else 0)
        tail = END_HOLD if i == len(SCENES) else TAIL
        rows.append(dict(n=i, label=label, shots=shots, text=text, start=t,
                         vo_start=t + lead, vo_dur=vo, dur=lead + vo + tail))
        t += lead + vo + tail
    return rows, t


# ---- Cards -------------------------------------------------------------------------------------

def base():
    img = Image.new("RGB", (W, H), b.BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 64):              # faint chart-paper grid
        d.line([(x, 0), (x, H)], fill=(16, 22, 29))
    for y in range(0, H, 64):
        d.line([(0, y), (W, y)], fill=(16, 22, 29))
    return img


def stamp(text, size, color):
    """A rotated rubber-stamp label, returned as RGBA."""
    f = b.font(b.MONO, size)
    tmp = ImageDraw.Draw(Image.new("L", (1, 1)))
    tw = int(tmp.textlength(text, font=f))
    im = Image.new("RGBA", (tw + 60, size + 44), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([4, 4, im.width - 5, im.height - 5], radius=10, outline=color, width=5)
    d.text((30, 18), text, font=f, fill=color)
    return im.rotate(-4, expand=True, resample=Image.BICUBIC)


def title_card():
    img = base()
    d = ImageDraw.Draw(img)
    d.text((160, 250), "MANDATORY ANNUAL TRAINING · MODULE 1 OF 8", font=b.font(b.MONO, 30), fill=b.PULSE)
    b.wordmark(d, 156, 300, 170)
    d.text((160, 500), "ORIENTATION FOR NEW LISTENERS", font=b.font(b.HEADLINE, 84), fill=b.TEXT)
    b.pulse_line(d, 160, 660, 900, width=6)
    y = 720
    for k, v in [("CME credits", "0.00"), ("Billable", "No"), ("Skippable", "No"), ("Run time", "about 2 min")]:
        d.text((160, y), f"{k.upper():<12}", font=b.font(b.MONO, 30), fill=b.MUTED)
        d.text((480, y), v, font=b.font(b.MONO, 30), fill=b.TEXT)
        y += 48
    s = stamp("NON-BILLABLE", 64, b.ACCENT)
    img.paste(s, (1180, 700), s)
    art = b.poster(500)
    img.paste(art, (W - art.width - 150, 130))
    return img


def hosts_card():
    img = base()
    d = ImageDraw.Draw(img)
    size = 430
    for i, (photo, name) in enumerate([("host-leo.jpg", "LEO A. GORDON, MD"), ("host-dan.jpg", "DAN GARDNER, MD")]):
        p = Image.open(b.ROOT / photo).convert("RGB")
        side = min(p.size)
        p = p.crop(((p.width - side) // 2, 0, (p.width + side) // 2, side)).resize((size, size), Image.LANCZOS)
        x = 200 + i * (size + 110)
        img.paste(p, (x, 100))
        d.rectangle([x, 100, x + size - 1, 100 + size - 1], outline=b.BORDER, width=3)
        d.text((x, 100 + size + 20), name, font=b.font(b.HEADLINE, 56), fill=b.TEXT)
        d.text((x, 100 + size + 92), "ATTENDING · CO-HOST", font=b.font(b.MONO, 24), fill=b.MUTED)
    s = stamp("ONE SHARED LOGIN", 46, b.PULSE)
    img.paste(s, (1300, 330), s)
    return img


def episodes_card():
    img = base()
    arts = ["the-robot-who-wipes-my-butt", "pax-inguinalis-part-2",
            "tassel-twirling-in-tulsa-bumps-grinds-and-scalpels", "out-of-touch"]
    tw, th = 640, 336
    for i, slug in enumerate(arts):
        a = Image.open(b.ROOT / "og" / f"{slug}.jpg").convert("RGB").resize((tw, th), Image.LANCZOS)
        x = 300 + (i % 2) * (tw + 40)
        y = 80 + (i // 2) * (th + 36)
        shadow = Image.new("RGBA", (tw + 40, th + 40), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rectangle([20, 20, tw + 20, th + 20], fill=(0, 0, 0, 160))
        shadow = shadow.filter(ImageFilter.GaussianBlur(12))
        img.paste(shadow, (x - 12, y - 8), shadow)
        img.paste(a, (x, y))
    s = stamp("NO PRIOR AUTH", 52, b.PULSE)
    img.paste(s, (1240, 790), s)
    return img


def end_card():
    img = base()
    d = ImageDraw.Draw(img)
    d.text((160, 110), "ASK YOUR DOCTOR IF", font=b.font(b.HEADLINE, 92), fill=b.TEXT)
    b.wordmark(d, 156, 205, 160)
    d.text((160, 380), "IS RIGHT FOR YOU.", font=b.font(b.HEADLINE, 92), fill=b.TEXT)
    b.pulse_line(d, 160, 530, 700, width=6)
    d.text((160, 565), "medicsmusings.com", font=b.font(b.MONO, 56), fill=b.ACCENT)
    d.text((160, 645), "Subscribe. Diagnose your commute.", font=b.font(b.SANS_BOLD, 40), fill=b.TEXT)
    fine = ("Side effects may include laughing during rounds, eye-rolling at administrators, sudden fluency in "
            "eponyms and an irresistible urge to subscribe. Not evaluated by any committee that meets on time. "
            "Satire. Not medical advice. Do not operate heavy machinery or the EHR while listening. "
            "If laughter lasts more than four hours, tell a colleague.")
    f = b.font(b.SANS, 22)
    y = 730
    for line in b.wrap(d, fine, f, 1600):
        d.text((160, y), line, font=f, fill=b.MUTED)
        y += 30
    art = b.poster(440)
    img.paste(art, (W - art.width - 170, 150))
    return img


# Vertical cards keep their content above y~1250, where the lower third and captions sit.

def centered(d, y, text, fnt, fill):
    d.text(((W - d.textlength(text, font=fnt)) / 2, y), text, font=fnt, fill=fill)


def wordmark_centered(d, y, size):
    w = d.textlength("MEDICSMUSINGS", font=b.font(b.HEADLINE, size))
    b.wordmark(d, (W - w) / 2, y, size)


def title_card_v():
    img = base()
    d = ImageDraw.Draw(img)
    art = b.poster(560)
    img.paste(art, ((W - art.width) // 2, 110))
    wordmark_centered(d, 690, 150)
    centered(d, 880, "ORIENTATION FOR NEW LISTENERS", b.font(b.HEADLINE, 68), b.TEXT)
    b.pulse_line(d, 140, 1000, 800, width=6)
    y = 1050
    for k, v in [("CME credits", "0.00"), ("Billable", "No"), ("Skippable", "No")]:
        d.text((140, y), k.upper(), font=b.font(b.MONO, 30), fill=b.MUTED)
        d.text((460, y), v, font=b.font(b.MONO, 30), fill=b.TEXT)
        y += 48
    s = stamp("NON-BILLABLE", 48, b.ACCENT)
    img.paste(s, (W - s.width - 70, 1040), s)
    return img


def hosts_card_v():
    img = base()
    d = ImageDraw.Draw(img)
    size = 450
    for i, (photo, name) in enumerate([("host-leo.jpg", "LEO A. GORDON, MD"), ("host-dan.jpg", "DAN GARDNER, MD")]):
        p = Image.open(b.ROOT / photo).convert("RGB")
        side = min(p.size)
        p = p.crop(((p.width - side) // 2, 0, (p.width + side) // 2, side)).resize((size, size), Image.LANCZOS)
        x = 60 + i * (size + 60)
        img.paste(p, (x, 200))
        d.rectangle([x, 200, x + size - 1, 200 + size - 1], outline=b.BORDER, width=3)
        d.text((x, 200 + size + 20), name, font=b.font(b.HEADLINE, 48), fill=b.TEXT)
        d.text((x, 200 + size + 82), "ATTENDING · CO-HOST", font=b.font(b.MONO, 22), fill=b.MUTED)
    s = stamp("ONE SHARED LOGIN", 50, b.PULSE)
    img.paste(s, ((W - s.width) // 2, 880), s)
    return img


def episodes_card_v():
    img = base()
    arts = ["the-robot-who-wipes-my-butt", "pax-inguinalis-part-2",
            "tassel-twirling-in-tulsa-bumps-grinds-and-scalpels", "out-of-touch"]
    tw, th = 700, 368
    for i, slug in enumerate(arts[:3]):
        a = Image.open(b.ROOT / "og" / f"{slug}.jpg").convert("RGB").resize((tw, th), Image.LANCZOS)
        img.paste(a, (60 + (i % 2) * 260, 90 + i * (th + 20)))
    s = stamp("NO PRIOR AUTH", 40, b.PULSE)
    img.paste(s, (W - s.width - 30, 1080), s)
    return img


def end_card_v():
    img = base()
    d = ImageDraw.Draw(img)
    art = b.poster(480)
    img.paste(art, ((W - art.width) // 2, 100))
    centered(d, 630, "ASK YOUR DOCTOR IF", b.font(b.HEADLINE, 84), b.TEXT)
    wordmark_centered(d, 720, 150)
    centered(d, 900, "IS RIGHT FOR YOU.", b.font(b.HEADLINE, 84), b.TEXT)
    centered(d, 1030, "medicsmusings.com", b.font(b.MONO, 54), b.ACCENT)
    centered(d, 1110, "Subscribe. Diagnose your commute.", b.font(b.SANS_BOLD, 40), b.TEXT)
    fine = ("Side effects may include laughing during rounds, eye-rolling at administrators, sudden fluency in "
            "eponyms and an irresistible urge to subscribe. Not evaluated by any committee that meets on time. "
            "Satire. Not medical advice. Do not operate heavy machinery or the EHR while listening. "
            "If laughter lasts more than four hours, tell a colleague.")
    f = b.font(b.SANS, 24)
    y = 1600
    for line in b.wrap(d, fine, f, 920):
        d.text((80, y), line, font=f, fill=b.MUTED)
        y += 32
    return img


CARDS = {"@title": title_card, "@hosts": hosts_card, "@episodes": episodes_card, "@end": end_card}
CARDS_V = {"@title": title_card_v, "@hosts": hosts_card_v, "@episodes": episodes_card_v, "@end": end_card_v}


def load_shot(name):
    cards = CARDS_V if VERT else CARDS
    if name in cards:
        return cards[name]()
    if not VERT:
        return Image.open(OUT / "shots" / f"{name}.png").convert("RGB").resize((W, H), Image.LANCZOS)
    # Drop the phone screenshot below the ticker so the site's own header stays visible.
    img = Image.new("RGB", (W, H), b.BG)
    img.paste(Image.open(OUT / "shots-v" / f"{name}.png").convert("RGB").resize((W, H), Image.LANCZOS), (0, 60))
    return img


def focus(name):
    return VERT_FOCUS if VERT else FOCUS.get(name, DEFAULT_FOCUS)


# ---- Overlay (per scene) and per-frame chrome -------------------------------------------------------

def scene_overlay(row, total):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    # Bottom gradient for the captions and lower third.
    gh = 900 if VERT else 420
    grad = Image.new("L", (1, gh))
    for y in range(gh):
        grad.putpixel((0, y), int(235 * (y / gh) ** 1.4))
    ov.paste(Image.new("RGBA", (W, gh), b.BG + (255,)), (0, H - gh), grad.resize((W, gh)))
    # Top ticker.
    d.rectangle([0, 0, W, 54], fill=b.BG + (235,))
    d.text((40, 13), f"MANDATORY TRAINING · MODULE {row['n']} OF {len(SCENES)}", font=b.font(b.MONO, 24), fill=b.PULSE)
    msg = "ATTENDANCE RECORDED" if VERT else "DO NOT CLOSE THIS WINDOW · YOUR ATTENDANCE IS BEING RECORDED"
    f = b.font(b.MONO, 22)
    d.text((W - 40 - d.textlength(msg, font=f), 15), msg, font=f, fill=b.MUTED)
    if row["label"]:
        lf = b.font(b.HEADLINE, 58)
        text = row["label"].upper()
        tw = d.textlength(text, font=lf)
        y = H - (700 if VERT else 312)
        d.rectangle([60, y, 60 + tw + 64, y + 88], fill=b.BG + (235,))
        d.rectangle([60, y, 72, y + 88], fill=b.ACCENT)
        d.text((96, y + 6), text, font=lf, fill=b.TEXT)
    return ov


def progress_bar(img, t, total):
    d = ImageDraw.Draw(img)
    frac = min(1, t / total)
    y = H - 10
    d.rectangle([0, y, W, H], fill=b.SURFACE)
    d.rectangle([0, y, int(W * frac), H], fill=b.ACCENT)
    f = b.font(b.MONO, 20)
    label = f"COMPLETION {int(frac * 100):3d}%"
    d.text((W - 40 - d.textlength(label, font=f), H - 40), label, font=f, fill=b.MUTED)


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def kenburns(img, p, focus, zoom=0.07):
    """Zoom from 1.0 to 1+zoom toward the focus point as p goes 0..1."""
    z = 1 + zoom * ease(p)
    cw, ch = W / z, H / z
    fx, fy = focus
    x = (W - cw) * fx
    y = (H - ch) * fy
    return img.resize((W, H), Image.BILINEAR, box=(x, y, x + cw, y + ch))


def scene_frame(row, shots, t):
    """Frame for time t (seconds into the scene)."""
    n = len(shots)
    seg = row["dur"] / n
    k = min(n - 1, int(t / seg))
    local = t - k * seg
    cur = kenburns(shots[k][0], local / seg, shots[k][1])
    # Push to the next shot during the last SLIDE seconds of a segment.
    if k < n - 1 and local > seg - SLIDE:
        a = ease((local - (seg - SLIDE)) / SLIDE)
        nxt = kenburns(shots[k + 1][0], 0, shots[k + 1][1])
        off = int(W * a)
        frame = Image.new("RGB", (W, H))
        frame.paste(cur, (-off, 0))
        frame.paste(nxt, (W - off, 0))
        return frame
    return cur


# ---- Captions ----------------------------------------------------------------------------------

def chunks(text, max_chars=None):
    max_chars = max_chars or (44 if VERT else 62)
    parts = re.split(r"(?<=[.!?:,])\s+", text.replace("...", "…"))
    out, cur = [], ""
    for p in parts:
        if cur and len(cur) + 1 + len(p) > max_chars:
            out.append(cur)
            cur = p
        else:
            cur = f"{cur} {p}".strip()
    if cur:
        out.append(cur)
    return out


def srt_time(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def ass_time(t):
    h, rem = divmod(max(0, t), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def captions(rows):
    cues = []
    for r in rows:
        cs = chunks(r["text"])
        total = sum(len(c) for c in cs)
        t = r["vo_start"]
        for c in cs:
            d = r["vo_dur"] * len(c) / total
            cues.append((t, t + d, c))
            t += d
    return cues


def write_subs(cues):
    (OUT / f"{NAME}.srt").write_text(
        "\n".join(f"{i}\n{srt_time(a)} --> {srt_time(z)}\n{c}\n" for i, (a, z, c) in enumerate(cues, 1)),
        encoding="utf-8")
    text = "&H00EAF1F4"
    box = "&H40140F0B"
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 0",
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        (f"Style: Cap,IBM Plex Sans,60,{text},{text},{box},{box},-1,0,0,0,100,100,0,0,3,16,0,2,90,90,380,1"
         if VERT else
         f"Style: Cap,IBM Plex Sans,48,{text},{text},{box},{box},-1,0,0,0,100,100,0,0,3,14,0,1,92,92,96,1"),
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for a, z, c in cues:
        lines.append(f"Dialogue: 0,{ass_time(a)},{ass_time(z)},Cap,,0,0,0,,{c}")
    (OUT / "captions.ass").write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---- Render ------------------------------------------------------------------------------------

def main():
    global W, H, VERT, NAME
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vertical", action="store_true", help="1080x1920 for Shorts, Reels and TikTok")
    if ap.parse_args().vertical:
        W, H, VERT, NAME = 1080, 1920, True, "medics-musings-explainer-vertical"
    rows, total = timeline()
    print(f"{len(rows)} scenes, {total:.1f} s")
    (OUT / "script.txt").write_text(
        "\n\n".join(f"[{r['n']}] {r['start']:.1f}s  {r['label']}\n{r['text']}" for r in rows) + "\n", encoding="utf-8")
    write_subs(captions(rows))

    # Narration: each line delayed to its scene's start.
    inputs, filt = [], []
    for r in rows:
        inputs += ["-i", str(OUT / "vo" / f"{r['n']}.mp3")]
        ms = int(r["vo_start"] * 1000)
        filt.append(f"[{r['n'] - 1}:a]adelay={ms}|{ms}[a{r['n']}]")
    mix = "".join(f"[a{r['n']}]" for r in rows)
    filt.append(f"{mix}amix=inputs={len(rows)}:normalize=0,apad,atrim=0:{total:.3f}[a]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filt),
                    "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "narration.m4a"], cwd=OUT, check=True)

    fonts_rel = Path(b.FONTS).relative_to(b.ROOT).as_posix()
    enc = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", "narration.m4a",
        "-vf", f"subtitles=captions.ass:fontsdir=../../{fonts_rel},format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", str(FPS),
        "-c:a", "copy", "-shortest", "-movflags", "+faststart",
        f"{NAME}.mp4",
    ], cwd=OUT, stdin=subprocess.PIPE)

    frame_no = 0
    for r in rows:
        shots = [(load_shot(s), focus(s)) for s in r["shots"]]
        ov = scene_overlay(r, total)
        end = r["start"] + r["dur"]
        while frame_no / FPS < end:
            t = frame_no / FPS
            local = t - r["start"]
            img = scene_frame(r, shots, local)
            img.paste(ov, (0, 0), ov)
            progress_bar(img, t, total)
            # Dip to dark across scene cuts.
            dip = min(local, r["dur"] - local)
            if dip < 0.2:
                img = Image.blend(Image.new("RGB", (W, H), b.BG), img, max(0, dip / 0.2))
            enc.stdin.write(img.tobytes())
            frame_no += 1
        print(f"  scene {r['n']} done ({frame_no} frames)", flush=True)
    enc.stdin.close()
    enc.wait()
    (OUT / "narration.m4a").unlink()
    print(f"Wrote {OUT / (NAME + '.mp4')}")


if __name__ == "__main__":
    main()
