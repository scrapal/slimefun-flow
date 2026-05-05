#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from PIL import Image


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: render-minecraft-item-icon.py OUTPUT INPUT_PNG [INPUT_PNG ...]")

    output = Path(sys.argv[1])
    layers = [load_layer(Path(path)) for path in sys.argv[2:]]
    frame_count = max(len(layer["frames"]) for layer in layers)
    rendered = []
    durations = []

    for frame_index in range(frame_count):
        canvas = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        duration_ticks = 1

        for layer in layers:
            frame = layer["frames"][frame_index % len(layer["frames"])]
            duration_ticks = max(duration_ticks, frame["time"])
            canvas.alpha_composite(frame["image"])

        rendered.append(canvas)
        durations.append(max(50, duration_ticks * 50))

    output.parent.mkdir(parents=True, exist_ok=True)
    if len(rendered) > 1:
        rendered[0].save(
            output,
            save_all=True,
            append_images=rendered[1:],
            duration=durations,
            loop=0,
            disposal=2,
        )
    else:
        rendered[0].save(output)


def load_layer(path):
    image = Image.open(path).convert("RGBA")
    meta = load_meta(path)
    tile_size = image.width
    frame_total = image.height // tile_size if image.width and image.height >= image.width else 1
    frame_total = max(1, frame_total)
    default_time = int(meta.get("frametime", 1) or 1)
    frame_defs = meta.get("frames")

    if isinstance(frame_defs, list) and frame_defs:
        frames = [parse_frame(frame, default_time) for frame in frame_defs]
    elif frame_total > 1:
        frames = [{"index": index, "time": default_time} for index in range(frame_total)]
    else:
        frames = [{"index": 0, "time": default_time}]

    rendered = []
    for frame in frames:
        index = max(0, min(frame_total - 1, frame["index"]))
        y = index * tile_size
        tile = image.crop((0, y, tile_size, y + tile_size))
        if tile.size != (16, 16):
            tile = tile.resize((16, 16), Image.Resampling.NEAREST)
        rendered.append({"image": tile, "time": max(1, frame["time"])})

    return {"frames": rendered}


def load_meta(path):
    meta_path = Path(f"{path}.mcmeta")
    if not meta_path.exists():
        return {}

    try:
        return json.loads(meta_path.read_text(encoding="utf-8")).get("animation", {}) or {}
    except Exception:
        return {}


def parse_frame(frame, default_time):
    if isinstance(frame, int):
        return {"index": frame, "time": default_time}
    if isinstance(frame, dict):
        return {"index": int(frame.get("index", 0) or 0), "time": int(frame.get("time", default_time) or default_time)}
    return {"index": 0, "time": default_time}


if __name__ == "__main__":
    main()
