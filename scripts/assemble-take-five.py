"""Assemble the "Take Five" breathing pause: eight short voice clips (clips/takefive/calm/,
the Dan voice on ElevenLabs v3, softly and slowly) placed on a fixed timeline so they line up with the
breathing circle on /break-room/take-five/ (5 cycles of 4 s in, 6 s out, starting at 8 s).

    python scripts/assemble-take-five.py

Writes audio/take-five.mp3 (about 1 minute). Needs ffmpeg on the PATH.
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "clips" / "takefive" / "calm"
OUT = ROOT / "audio" / "take-five.mp3"
TOTAL = 66.0

# (clip, start second)
TIMELINE = [
    ("A_intro", 0.5),
    ("B_in1", 8.0), ("C_out1", 12.2),
    ("D_in", 18.0), ("E_out", 22.0),
    ("D_in", 28.0), ("E_out", 32.0),
    ("F_feet", 34.5),
    ("D_in", 38.0), ("E_out", 42.0),
    ("G_tired", 44.5),
    ("D_in", 48.0), ("E_out", 52.0),
    ("H_close", 58.0),
]


def main():
    inputs, chains, mix = [], [], []
    for i, (name, start) in enumerate(TIMELINE):
        inputs += ["-i", str(CLIPS / f"{name}.mp3")]
        ms = int(start * 1000)
        chains.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=mono,adelay={ms}[c{i}]")
        mix.append(f"[c{i}]")
    graph = ";".join(chains) + ";" + "".join(mix) + (
        f"amix=inputs={len(mix)}:normalize=0:dropout_transition=0,apad=whole_dur={TOTAL},"
        f"atrim=0:{TOTAL},afade=t=out:st={TOTAL - 1.5}:d=1.5,loudnorm=I=-18:LRA=7:TP=-1.5[out]"
    )
    OUT.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
         "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100",
         "-metadata", "title=Take Five: a one-minute breathing pause", "-metadata", "artist=Medics Musings",
         str(OUT)],
        check=True,
    )
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
