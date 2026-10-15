"""
Rebuild the scroll-controlled hero frame sequence from the source video.

    python scripts/extract_frames.py                 # default video + settings
    python scripts/extract_frames.py --fps 16 --video assets-src/hero/agrimind-hero.mp4

Writes:
    frontend/public/assets/hero-frames/desktop/frame_0001.webp ...  (1440 px wide)
    frontend/public/assets/hero-frames/mobile/frame_0001.webp  ...  (768 px wide)
    frontend/public/assets/hero-frames/poster.webp                  (first frame, static fallback)
    frontend/public/assets/hero-frames/manifest.json

The zero-padded numbers are the frame order. The page never sorts or shuffles them.
Requires ffmpeg + ffprobe on PATH (https://ffmpeg.org/download.html,
or `winget install ffmpeg` / `brew install ffmpeg` / `sudo apt install ffmpeg`).
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_VIDEO = ROOT / "assets-src" / "hero" / "agrimind-hero.mp4"
OUT_DIR = ROOT / "frontend" / "public" / "assets" / "hero-frames"

# Where each AgriMind area appears in the source video (seconds), checked by eye
# against a timestamped contact sheet of the footage. Used by the hero to show the matching caption.
ZONES = [
    {"id": "production", "title": "Crop Production Tracking", "start": 0.0, "end": 2.3},
    {"id": "irrigation", "title": "Pre-Irrigation Management", "start": 2.3, "end": 3.9},
    {"id": "leaf", "title": "AI Leaf Prediction", "start": 3.9, "end": 5.3},
    {"id": "price", "title": "Crop Price Prediction", "start": 5.3, "end": 7.3},
    {"id": "recommend", "title": "AI Crop Recommendation", "start": 7.3, "end": 10.0},
]

SIZES = {"desktop": 1440, "mobile": 768}


def need(tool):
    if shutil.which(tool) is None:
        sys.exit(f"{tool} not found on PATH. Install ffmpeg (it includes ffprobe) and try again.")


def probe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate:format=duration",
         "-of", "json", str(video)],
        check=True, capture_output=True, text=True).stdout
    data = json.loads(out)
    stream = data["streams"][0]
    num, den = stream["r_frame_rate"].split("/")
    return {"width": stream["width"], "height": stream["height"],
            "fps": float(num) / float(den), "duration": float(data["format"]["duration"])}


def extract(video, folder, width, fps, quality):
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video),
         "-vf", f"fps={fps},scale={width}:-2:flags=lanczos",
         "-c:v", "libwebp", "-quality", str(quality), "-compression_level", "6",
         str(folder / "frame_%04d.webp")],
        check=True)
    return sorted(folder.glob("frame_*.webp"))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    parser.add_argument("--fps", type=float, default=16, help="frames per second of video to keep (16 -> 160 frames for 10 s)")
    parser.add_argument("--quality", type=int, default=62)
    args = parser.parse_args()

    need("ffmpeg")
    need("ffprobe")
    if not args.video.exists():
        sys.exit(f"Video not found: {args.video}")

    info = probe(args.video)
    print(f"Source: {info['width']}x{info['height']}, {info['fps']:g} fps, {info['duration']:.2f} s")

    sets, count = {}, None
    for name, width in SIZES.items():
        frames = extract(args.video, OUT_DIR / name, width, args.fps, args.quality)
        size_mb = sum(f.stat().st_size for f in frames) / 1e6
        print(f"{name}: {len(frames)} frames, {width}px wide, {size_mb:.1f} MB")
        count = len(frames) if count is None else min(count, len(frames))
        height = round(width * info["height"] / info["width"] / 2) * 2
        sets[name] = {"width": width, "height": height,
                      "pattern": f"/assets/hero-frames/{name}/frame_{{index}}.webp"}

    shutil.copyfile(OUT_DIR / "desktop" / "frame_0001.webp", OUT_DIR / "poster.webp")

    zones = []
    for z in ZONES:
        first = min(count - 1, int(z["start"] / info["duration"] * count))
        last = min(count - 1, max(first, int(z["end"] / info["duration"] * count) - 1))
        zones.append({**z, "firstFrame": first, "lastFrame": last})

    manifest = {
        "source": args.video.name,
        "sourceDuration": info["duration"],
        "frameCount": count,
        "fps": args.fps,
        "indexPad": 4,
        "poster": "/assets/hero-frames/poster.webp",
        "sets": sets,
        "zones": zones,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {OUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
