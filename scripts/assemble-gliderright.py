"""Assemble the GlideRight infomercial: the announcer and fine-print clips in
clips/gliderright/vo/ (A01.mp3 ... FEND.mp3, one per block of the script), laid out
in script order (docs/gliderright-voiceover.md), with three synthesized sound cues,
then loudness-normalized to an MP3.

    python scripts/assemble-gliderright.py

Writes clips/gliderright/gliderright-playbook.mp3 and timings.txt (when each slide
starts). The finished MP3 is also kept at audio/gliderright-playbook.mp3.
Needs ffmpeg and ffprobe on the PATH.
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent / "clips" / "gliderright"
VO = HERE / "vo"
OUT = HERE / "gliderright-playbook.mp3"
SR = 44100

# The fine print is read fast, like the legal tag on a drug ad.
TEMPO = {"F03": 1.12, "F07": 1.12, "F08": 1.12, "F10": 1.10, "FEND": 1.22}

# (slide label, [clips], seconds of silence after the slide)
SLIDES = [
    ("1  Have you oiled your balls today?", ["A01"], 0.75),
    ("2  Anatomy of a Bad Walk", ["A02", "SQUEAK", "A02b"], 0.85),
    ("3  The Friction Factor", ["A03", 0.25, "F03"], 0.85),
    ("4  The Medical Breakthrough (WBLT)", ["A04"], 0.85),
    ("5  Smooth Gliding in Under a Minute", ["A05"], 0.85),
    ("6  The Lubrication Showdown", ["A06"], 0.85),
    ("7  Decibels of Squeak / The Swagger Index", ["A07", 0.25, "F07"], 0.85),
    ("8  Real Life, Smoother Steps", ["A08", 0.25, "F08"], 0.85),
    ("9  Good to Know", ["A09"], 0.85),
    ("10 Pick Your Glide", ["A10", 0.25, "F10"], 0.95),
    ("11 The Frictionless Formula", ["A11"], 1.0),
    ("End card", ["FEND"], 1.5),
]

# Synthesized cues (aevalsrc expressions in t seconds).
SQUEAK = ("0.32*sin(2*PI*(1800*t-700*t*t))*exp(-1.2*t)", 0.95)
DING = ("0.38*sin(2*PI*1318.5*t)*exp(-5*t)+0.14*sin(2*PI*2637*t)*exp(-8*t)", 0.9)


def dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)["format"]["duration"])


def hold_music(seconds):
    """A cheerful, slightly sad arpeggio, the kind you hear while waiting on a payer."""
    notes = [523.25, 659.25, 783.99, 987.77, 783.99, 659.25]  # C E G B G E
    step = 0.36
    n = int(seconds / step) + 1
    terms = []
    for i in range(n):
        f = notes[i % len(notes)]
        t0 = i * step
        # Odd harmonics give it that little-synthesizer sound; each note decays.
        w = f"2*PI*{f}*(t-{t0:.3f})"
        terms.append(f"between(t,{t0:.3f},{t0 + step:.3f})*exp(-4*(t-{t0:.3f}))*(sin({w})+0.33*sin(3*{w})+0.2*sin(5*{w}))")
    return "0.07*(" + "+".join(terms) + ")*min(1,(" + f"{seconds}-t)/1.2)", seconds


def main():
    inputs, chains, mixes, marks = [], [], [], []
    count = [0]  # number of ffmpeg inputs so far (each file or synth is one input)
    t = 0.4  # lead-in

    def add_file(path, start, tempo=1.0, gain=1.0):
        i = count[0]
        count[0] += 1
        inputs.extend(["-i", str(path)])
        ms = int(start * 1000)
        f = f"[{i}:a]aresample={SR},aformat=channel_layouts=stereo"
        if tempo != 1.0:
            f += f",atempo={tempo}"
        if gain != 1.0:
            f += f",volume={gain}"
        chains.append(f"{f},adelay={ms}|{ms}[c{i}]")
        mixes.append(f"[c{i}]")

    def add_synth(expr_dur, start, gain=1.0):
        expr, seconds = expr_dur
        i = count[0]
        count[0] += 1
        # The expression is quoted so its commas aren't read as filter separators.
        inputs.extend(["-f", "lavfi", "-t", f"{seconds}", "-i", f"aevalsrc='{expr}':s={SR}:d={seconds}"])
        ms = int(start * 1000)
        chains.append(f"[{i}:a]aformat=channel_layouts=stereo,volume={gain},adelay={ms}|{ms}[c{i}]")
        mixes.append(f"[c{i}]")

    for label, items, after in SLIDES:
        marks.append((t, label))
        a10_start = None
        for it in items:
            if isinstance(it, float):
                t += it
            elif it == "SQUEAK":
                add_synth(SQUEAK, t + 0.1, gain=0.5)
                t += SQUEAK[1] + 0.1
            else:
                p = VO / f"{it}.mp3"
                tempo = TEMPO.get(it, 1.0)
                length = dur(p) / tempo
                if it == "A10":
                    a10_start = t
                    add_synth(DING, t + 1.15, gain=0.9)  # on "the single bottle"
                if it == "F10":
                    add_synth(hold_music(length + 1.6), t - 0.3, gain=1.0)
                add_file(p, t, tempo)
                t += length
        t += after
    total = t

    graph = ";".join(chains) + ";" + "".join(mixes) + f"amix=inputs={len(mixes)}:normalize=0:dropout_transition=0,apad=whole_dur={total:.2f},atrim=0:{total:.2f},loudnorm=I=-16:LRA=9:TP=-1.5[out]"
    cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
           "-c:a", "libmp3lame", "-b:a", "192k", "-ar", str(SR),
           "-metadata", "title=Have You Oiled Your Balls Today? (The GlideRight Playbook)",
           "-metadata", "artist=Medics Musings", "-metadata", "comment=Satire. GlideRight is fictional.",
           str(OUT)]
    subprocess.run(cmd, check=True)

    lines = [f"{int(m // 60)}:{m % 60:04.1f}  {label}" for m, label in marks]
    (HERE / "timings.txt").write_text("\n".join(lines) + f"\n\nTotal {int(total // 60)}:{total % 60:04.1f}\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"Wrote {OUT.name}, {dur(OUT):.1f} s")


if __name__ == "__main__":
    main()
