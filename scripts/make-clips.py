#!/usr/bin/env python
"""Cut short vertical video clips (1080x1920) from an episode for Shorts, Reels,
TikTok and LinkedIn: episode artwork and title, a live waveform, and captions
that highlight each word as it's spoken.

    PY=C:/Users/dgard/.venvs/medics-whisper/Scripts/python
    $PY scripts/make-clips.py AUDIO SLUG --list            # show the best moments
    $PY scripts/make-clips.py AUDIO SLUG                   # render the top 3
    $PY scripts/make-clips.py AUDIO SLUG --count 5
    $PY scripts/make-clips.py AUDIO SLUG --start 2:15 --length 40   # a moment you pick

Output goes to clips/<slug>/ (not committed): clip-1.mp4 ... plus clip-1.txt with
the caption text and a ready-to-paste post. The first run transcribes the episode
with word timings (a few minutes; cached in clips/<slug>/words.json).

Needs faster-whisper, Pillow and ffmpeg on the PATH.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import brand as b

W, H = 1080, 1920
FPS = 30
SITE = "https://www.medicsmusings.com"

# Words that make a poor first word for a clip that has to stand on its own.
WEAK_STARTS = {"and", "but", "so", "because", "which", "that", "it", "this", "they", "he", "she",
               "yeah", "right", "exactly", "oh", "um", "uh", "or", "then", "also", "well"}


# ---- Word timings ---------------------------------------------------------------------

def load_words(audio, cache, model_name):
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel
    from transcribe import VOCAB, correct

    print(f"Transcribing with word timings ({model_name}); this is cached for next time...", flush=True)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(audio), language="en", beam_size=5, word_timestamps=True,
        initial_prompt=VOCAB, condition_on_previous_text=False,
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"w": text, "s": round(w.start, 2), "e": round(w.end, 2)})
        print(f"\r  {min(100, int(100 * seg.end / info.duration)):3d}%", end="", flush=True)
    print()
    # Fix known mishearings (ecdysiast, Nirdlinger, ...) word by word.
    for w in words:
        w["w"] = correct(w["w"])
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(words), encoding="utf-8")
    return words


def merge_fragments(words):
    """Whisper splits 'brother-in-law' and "don't" into pieces; rejoin them."""
    out = []
    for w in words:
        if out and (re.match(r"^(-|'|’|n't\b|%|\.\d)", w["w"]) or out[-1]["w"].endswith("-")):
            out[-1] = {"w": out[-1]["w"] + w["w"], "s": out[-1]["s"], "e": w["e"]}
        else:
            out.append(dict(w))
    return out


def sentences(words):
    """Group words into sentences: (start_index, end_index_inclusive)."""
    out, start = [], 0
    for i, w in enumerate(words):
        if re.search(r"[.!?][\"')\]]*$", w["w"]) and not re.fullmatch(r"(Dr|Mr|Mrs|Ms|St|vs)\.", w["w"]):
            out.append((start, i))
            start = i + 1
    if start < len(words):
        out.append((start, len(words) - 1))
    return out


# ---- Picking moments ------------------------------------------------------------------

def score_window(words, a, z):
    text = " ".join(w["w"] for w in words[a:z + 1])
    first = re.sub(r"\W", "", words[a]["w"]).lower()
    dur = words[z]["e"] - words[a]["s"]
    score = 0.0
    if first in WEAK_STARTS:
        score -= 3
    if words[a]["w"][:1].isupper():
        score += 1
    score += 1.2 * text.count("?") + 1.5 * text.count("!")
    score += 0.6 * min(3, len(re.findall(r"\b\d[\d,.]*\b", text)))  # specifics are quotable
    last = [w["w"] for w in words[z - 8:z + 1]]
    tail = " ".join(last)
    # A short final sentence reads as a punchline.
    tail_sentence = re.split(r"(?<=[.!?])\s", " ".join(w["w"] for w in words[max(a, z - 14):z + 1]))[-1]
    if len(tail_sentence.split()) <= 7:
        score += 2
    if tail.endswith(("!", "?")):
        score += 0.5
    # Prefer 30-45 seconds, the sweet spot for Shorts and Reels.
    score -= abs(dur - 38) / 12
    # Speech density: very sparse windows are usually pauses or music.
    rate = (z - a + 1) / max(dur, 1)
    if rate < 1.6:
        score -= 2
    return score, text, dur


def candidates(words, min_len=25, max_len=55, skip_start=8):
    sents = sentences(words)
    out = []
    for i, (a, _) in enumerate(sents):
        if words[a]["s"] < skip_start:
            continue
        for j in range(i, len(sents)):
            z = sents[j][1]
            dur = words[z]["e"] - words[a]["s"]
            if dur > max_len:
                break
            if dur >= min_len:
                s, text, d = score_window(words, a, z)
                out.append({"a": a, "z": z, "start": words[a]["s"], "end": words[z]["e"], "score": s, "text": text, "dur": d})
    return sorted(out, key=lambda c: -c["score"])


def pick(cands, count, gap=20):
    chosen = []
    for c in cands:
        if all(c["end"] + gap < o["start"] or c["start"] > o["end"] + gap for o in chosen):
            chosen.append(c)
        if len(chosen) == count:
            break
    return sorted(chosen, key=lambda c: c["start"])


def mmss(t):
    return f"{int(t // 60)}:{int(t % 60):02d}"


def parse_time(s):
    parts = [float(p) for p in s.split(":")]
    return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))


# ---- Artwork ------------------------------------------------------------------------------

def background(ep, data, path):
    img = Image.new("RGB", (W, H), b.BG)
    d = ImageDraw.Draw(img)

    b.wordmark(d, 90, 110, 64)

    art = b.poster(700)
    art_x = (W - art.width) // 2
    img.paste(art, (art_x, 230))
    d.rectangle([art_x - 2, 228, art_x + art.width + 1, 230 + art.height + 1], outline=b.BORDER, width=2)

    eyebrow = (b.series_label(ep, data) or "Medics Musings · medical satire podcast").upper()
    d.text((90, 975), eyebrow, font=b.font(b.MONO, 30), fill=b.PULSE)
    title_font, lines = b.fit_text(d, ep["title"].upper(), b.HEADLINE, W - 180, 3, [96, 88, 80, 72, 64, 56])
    y = 1020
    for line in lines:
        d.text((90, y), line, font=title_font, fill=b.TEXT)
        y += round(title_font.size * 0.98)

    # Caption panel (captions are drawn by ffmpeg on top of this).
    d.rounded_rectangle([60, 1440, W - 60, 1720], radius=18, fill=b.SURFACE, outline=b.BORDER, width=2)

    b.pulse_line(d, 90, 1812, 300)
    d.text((420, 1790), "Full episode: medicsmusings.com", font=b.font(b.MONO, 30), fill=b.TEXT)
    d.rectangle([0, H - 10, W, H], fill=b.ACCENT)
    img.save(path)


# ---- Captions ---------------------------------------------------------------------------------

def ass_time(t):
    t = max(0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def ass_escape(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


def chunk_words(words, max_chars=26, max_words=6):
    """Break the clip's words into short caption lines."""
    chunks, cur = [], []
    for w in words:
        trial = " ".join(x["w"] for x in cur + [w])
        if cur and (len(trial) > max_chars or len(cur) >= max_words):
            chunks.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.!?,;:]$", w["w"]) and len(cur) >= 2:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def write_ass(words, t0, path):
    accent = "&H003C5AFF"   # #FF5A3C in ASS's AABBGGRR
    text = "&H00EAF1F4"     # #F4F1EA
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 0",
        "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Cap,IBM Plex Sans,76,{text},{text},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,110,110,0,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    chunks = chunk_words(words)
    for ci, chunk in enumerate(chunks):
        chunk_end = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else chunk[-1]["e"] + 0.6
        for i, w in enumerate(chunk):
            start = w["s"] if i else chunk[0]["s"]
            end = chunk[i + 1]["s"] if i + 1 < len(chunk) else chunk_end
            parts = []
            for j, x in enumerate(chunk):
                word = ass_escape(x["w"])
                parts.append("{\\c" + accent + "}" + word + "{\\c" + text + "}" if j == i else word)
            lines.append(
                f"Dialogue: 0,{ass_time(start - t0)},{ass_time(end - t0)},Cap,,0,0,0,,{{\\pos(540,1580)}}" + " ".join(parts)
            )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---- Render -------------------------------------------------------------------------------------

def render(audio, out_dir, name, bg_path, words, start, end):
    ass = out_dir / f"{name}.ass"
    write_ass(words, start, ass)
    dur = end - start
    fonts_rel = Path(b.FONTS).relative_to(b.ROOT)
    # Relative paths inside the filter graph avoid Windows drive-letter escaping.
    depth = "../" * len(out_dir.relative_to(b.ROOT).parts)
    filt = (
        f"[1:a]asplit=2[a1][a2];"
        f"[a1]showwaves=s=900x150:mode=cline:rate={FPS}:scale=sqrt:draw=full:colors=0xFF5A3C|0xFF5A3C,format=rgba[wave];"
        f"[0:v][wave]overlay=90:1260:format=auto,"
        f"subtitles={ass.name}:fontsdir={depth}{fonts_rel.as_posix()},format=yuv420p[v];"
        f"[a2]afade=t=in:d=0.3,afade=t=out:st={max(0, dur - 0.8):.2f}:d=0.8[a]"
    )
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-loop", "1", "-framerate", str(FPS), "-i", bg_path.name,
        "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(Path(audio).resolve()),
        "-filter_complex", filt, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
        f"{name}.mp4",
    ]
    subprocess.run(cmd, cwd=out_dir, check=True)
    ass.unlink()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("slug")
    ap.add_argument("--list", action="store_true", help="print the best moments and stop")
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--start", help="start time of a moment you choose, e.g. 2:15")
    ap.add_argument("--length", type=float, default=40, help="seconds, with --start (snapped to sentence ends)")
    ap.add_argument("--model", default="medium.en")
    args = ap.parse_args()

    data = b.load_data()
    ep = next((e for e in data["episodes"] if e["slug"] == args.slug), None)
    if not ep:
        print(f"No episode with slug '{args.slug}' in data/episodes.json", file=sys.stderr)
        return 1

    out_dir = b.ROOT / "clips" / args.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    words = merge_fragments(load_words(args.audio, out_dir / "words.json", args.model))

    if args.start:
        t = parse_time(args.start)
        a = min(range(len(words)), key=lambda i: abs(words[i]["s"] - t))
        ends = [z for _, z in sentences(words) if words[z]["e"] >= words[a]["s"] + args.length * 0.8]
        z = ends[0] if ends else len(words) - 1
        chosen = [{"a": a, "z": z, "start": words[a]["s"], "end": words[z]["e"],
                   "text": " ".join(w["w"] for w in words[a:z + 1])}]
    else:
        cands = candidates(words)
        if args.list:
            for c in pick(cands, 10, gap=5):
                print(f"{mmss(c['start'])}-{mmss(c['end'])} ({c['dur']:.0f}s, score {c['score']:.1f})\n   {c['text'][:220]}\n")
            return 0
        chosen = pick(cands, args.count)

    bg = out_dir / "background.png"
    background(ep, data, bg)
    url = f"{SITE}/episodes/{ep['slug']}/"
    existing = len(list(out_dir.glob("clip-*.mp4")))
    for n, c in enumerate(chosen, start=existing + 1):
        name = f"clip-{n}"
        start = max(0, c["start"] - 0.15)
        end = c["end"] + 0.5
        print(f"Rendering {name}: {mmss(start)}-{mmss(end)} ({end - start:.0f}s)...", flush=True)
        render(args.audio, out_dir, name, bg, words[c["a"]:c["z"] + 1], start, end)
        first = re.split(r"(?<=[.!?])\s", c["text"])[0]
        (out_dir / f"{name}.txt").write_text(
            f"Episode: {ep['title']}\nMoment: {mmss(start)}-{mmss(end)}\n\n"
            f"Captions:\n{c['text']}\n\n"
            f"Suggested post:\n\"{first}\"\n\nFrom \"{ep['title']}\" on Medics Musings, the medical satire podcast "
            f"by Leo A. Gordon, MD and Dan Gardner, MD. Full episode: {url}\n\n"
            f"#podcast #medicine #satire #healthcare #doctors\n",
            encoding="utf-8",
        )
    print(f"Done: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
