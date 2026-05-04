#!/usr/bin/env python3
import json
import re
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "slimefun-items.json"
OUTPUT_DIR = ROOT / "generated-icons" / "blocks"

MODEL_CACHE = {}


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    all_items = [*data.get("items", []), *data.get("vanillaItems", [])]

    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for item in all_items:
        item.pop("blockIcon", None)

        icon_path = item.get("resourcePackIcon")
        model_json = load_model_json(item)
        if not icon_path or not should_render_as_block(model_json):
            continue

        source_path = ROOT / icon_path.removeprefix("./")
        if not source_path.exists():
            continue

        with Image.open(source_path) as image:
            image = image.convert("RGBA")
            if image.width < 16 or image.height < 16:
                continue

            block_icon = render_block_icon(image, model_json)

        output_path = OUTPUT_DIR / f"{safe_filename(item['id'])}.png"
        block_icon.save(output_path)
        item["blockIcon"] = f"./{output_path.relative_to(ROOT).as_posix()}"
        generated += 1

    data.setdefault("meta", {})["generatedBlockIcons"] = generated
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {generated} block icons from unfolded block textures.")


def should_render_as_block(model_json):
    if not model_json:
        return False

    elements = model_json.get("elements")
    if isinstance(elements, list) and any(element.get("faces", {}).get("up") for element in elements):
        return True

    return model_json.get("parent") in {"block/cube_all", "minecraft:block/cube_all"}


def render_block_icon(texture, model_json):
    faces = extract_faces(texture, model_json)
    top = faces["top"]
    left = faces["left"]
    right = faces["right"]

    if is_visually_empty(left):
        left = right
    if is_visually_empty(right):
        right = left

    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    draw_face(draw, left, origin=(13, 17), u_vec=(1.25, 0.62), v_vec=(0, 1.62), shade=0.72)
    draw_face(draw, right, origin=(33, 27), u_vec=(1.25, -0.62), v_vec=(0, 1.62), shade=0.86)
    draw_face(draw, top, origin=(33, 7), u_vec=(1.25, 0.62), v_vec=(-1.25, 0.62), shade=1.08)

    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)

    framed = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    canvas.thumbnail((58, 58), Image.Resampling.NEAREST)
    framed.alpha_composite(canvas, ((64 - canvas.width) // 2, (64 - canvas.height) // 2))
    return framed


def extract_faces(texture, model_json):
    elements = model_json.get("elements")
    if isinstance(elements, list) and elements:
        element = max(elements, key=element_volume)
        element_faces = element.get("faces", {})
        top = crop_face(texture, element_faces.get("up"))
        left = crop_face(texture, element_faces.get("west") or element_faces.get("north"))
        right = crop_face(texture, element_faces.get("east") or element_faces.get("south"))
        fallback_side = crop_face(texture, element_faces.get("north") or element_faces.get("south"))

        if top and left and right:
            return {
                "top": top,
                "left": left if not is_visually_empty(left) else fallback_side or right,
                "right": right if not is_visually_empty(right) else fallback_side or left,
            }

    return extract_cube_all_faces(texture)


def extract_cube_all_faces(texture):
    tile = 16
    top = texture.crop((0, 0, min(tile, texture.width), min(tile, texture.height))).resize((tile, tile), Image.Resampling.NEAREST)

    if texture.width >= 32:
        bottom = texture.crop((16, 0, 32, min(16, texture.height))).resize((tile, tile), Image.Resampling.NEAREST)
        side = texture.crop((0, 16, 16, min(32, texture.height)))
        if is_visually_empty(side):
            side = bottom
    elif texture.height >= 32:
        side = texture.crop((0, 16, 16, 32))
    else:
        side = top

    if is_visually_empty(side):
        side = top

    return {"top": top, "left": side, "right": side}


def crop_face(texture, face):
    if not face or "uv" not in face:
        return None

    uv = face["uv"]
    x1 = round(min(uv[0], uv[2]) / 16 * texture.width)
    y1 = round(min(uv[1], uv[3]) / 16 * texture.height)
    x2 = round(max(uv[0], uv[2]) / 16 * texture.width)
    y2 = round(max(uv[1], uv[3]) / 16 * texture.height)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(texture.width, x2), min(texture.height, y2)
    if x2 <= x1 or y2 <= y1:
        return None

    cropped = texture.crop((x1, y1, x2, y2))
    rotation = int(face.get("rotation", 0) or 0)
    if rotation:
        cropped = cropped.rotate(-rotation, expand=True)
    return cropped


def element_volume(element):
    start = element.get("from", [0, 0, 0])
    end = element.get("to", [16, 16, 16])
    return abs((end[0] - start[0]) * (end[1] - start[1]) * (end[2] - start[2]))


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


def load_model_json(item):
    model_ref = item.get("resourcePackModel")
    source = item.get("resourcePackSource")
    if not model_ref or not source or ":" not in model_ref:
        return None

    cache_key = (source, model_ref)
    if cache_key in MODEL_CACHE:
        return MODEL_CACHE[cache_key]

    namespace, model_path = model_ref.split(":", 1)
    entry = f"assets/{namespace}/models/{model_path}.json"
    zip_path = ROOT / source
    if not zip_path.exists():
        MODEL_CACHE[cache_key] = None
        return None

    try:
        with zipfile.ZipFile(zip_path) as archive:
            model_json = json.loads(archive.read(entry).decode("utf-8"))
    except Exception:
        model_json = None

    MODEL_CACHE[cache_key] = model_json
    return model_json


def safe_filename(value):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value)).strip("_") or "block"


if __name__ == "__main__":
    main()
