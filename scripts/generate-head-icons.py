#!/usr/bin/env python3
import json
import re
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "slimefun-items.json"
OUTPUT_DIR = ROOT / "generated-icons" / "heads"
CACHE_DIR = ROOT / "generated-icons" / "head-textures"
TEXTURE_URL = "https://textures.minecraft.net/texture/{}"


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    all_items = [*data.get("items", []), *data.get("vanillaItems", [])]

    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    failed = 0
    rendered_hashes = {}

    for item in all_items:
        item.pop("headBlockIcon", None)
        texture_hash = normalize_hash(item.get("headTexture"))
        if not texture_hash:
            continue

        if texture_hash not in rendered_hashes:
            skin_path = fetch_head_texture(texture_hash)
            if not skin_path:
                failed += 1
                continue

            with Image.open(skin_path) as skin:
                head_icon = render_head_icon(skin.convert("RGBA"))

            output_path = OUTPUT_DIR / f"{texture_hash}.png"
            head_icon.save(output_path)
            rendered_hashes[texture_hash] = f"./{output_path.relative_to(ROOT).as_posix()}"

        item["headBlockIcon"] = rendered_hashes[texture_hash]
        generated += 1

    data.setdefault("meta", {})["generatedHeadBlockIcons"] = generated
    data.setdefault("meta", {})["generatedHeadBlockIconTextures"] = len(rendered_hashes)
    data.setdefault("meta", {})["failedHeadBlockIconTextures"] = failed
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {generated} head block icons from {len(rendered_hashes)} unique head textures. Failed {failed}.")


def fetch_head_texture(texture_hash):
    cache_path = CACHE_DIR / f"{texture_hash}.png"
    if cache_path.exists():
        return cache_path

    request = urllib.request.Request(TEXTURE_URL.format(texture_hash), headers={"User-Agent": "slimefun-flow/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                cache_path.write_bytes(response.read())
            return cache_path
        except (urllib.error.URLError, TimeoutError):
            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))

    return None


def render_head_icon(skin):
    top = crop_head_part(skin, "top")
    side = crop_head_part(skin, "right")
    front = crop_head_part(skin, "front")

    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    draw_face(draw, side, origin=(13, 17), u_vec=(1.25, 0.62), v_vec=(0, 1.62), shade=0.78)
    draw_face(draw, front, origin=(33, 27), u_vec=(1.25, -0.62), v_vec=(0, 1.62), shade=0.94)
    draw_face(draw, top, origin=(33, 7), u_vec=(1.25, 0.62), v_vec=(-1.25, 0.62), shade=1.08)

    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)

    framed = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    canvas.thumbnail((58, 58), Image.Resampling.NEAREST)
    framed.alpha_composite(canvas, ((64 - canvas.width) // 2, (64 - canvas.height) // 2))
    return framed


def crop_head_part(skin, part):
    scale = max(1, skin.width // 64)
    regions = {
        "top": ((8, 0, 16, 8), (40, 0, 48, 8)),
        "right": ((0, 8, 8, 16), (32, 8, 40, 16)),
        "front": ((8, 8, 16, 16), (40, 8, 48, 16)),
    }
    base_box, overlay_box = regions[part]
    base = crop_scaled(skin, base_box, scale)
    overlay = crop_scaled(skin, overlay_box, scale)

    if not is_visually_empty(overlay):
        base.alpha_composite(overlay)

    return base.resize((16, 16), Image.Resampling.NEAREST)


def crop_scaled(image, box, scale):
    x1, y1, x2, y2 = box
    return image.crop((x1 * scale, y1 * scale, x2 * scale, y2 * scale)).convert("RGBA")


def draw_face(draw, tile, origin, u_vec, v_vec, shade):
    pixels = tile.load()
    ox, oy = origin
    ux, uy = u_vec
    vx, vy = v_vec

    for y in range(tile.height):
        for x in range(tile.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            color = (min(255, int(r * shade)), min(255, int(g * shade)), min(255, int(b * shade)), a)
            p0 = (ox + x * ux + y * vx, oy + x * uy + y * vy)
            p1 = (p0[0] + ux, p0[1] + uy)
            p2 = (p0[0] + ux + vx, p0[1] + uy + vy)
            p3 = (p0[0] + vx, p0[1] + vy)
            draw.polygon([p0, p1, p2, p3], fill=color)


def is_visually_empty(image):
    pixels = list(image.getdata())
    opaque = [pixel for pixel in pixels if pixel[3] > 12]
    if len(opaque) < 8:
        return True
    average_alpha = sum(pixel[3] for pixel in pixels) / len(pixels)
    return average_alpha < 8


def normalize_hash(value):
    text = str(value or "").strip().lower()
    if re.fullmatch(r"[0-9a-f]{32,128}", text):
        return text
    return None


if __name__ == "__main__":
    main()
