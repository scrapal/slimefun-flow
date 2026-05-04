#!/usr/bin/env python3
import io
import json
import re
import zipfile
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASST_ZIP_PATH = ROOT / "slimefunAsstOL-main.zip"
DATA_PATH = ROOT / "data" / "slimefun-items.json"
MINECRAFT_ZH_CN_PATH = ROOT / "data" / "minecraft-zh_cn.json"
INNER_RECIPES_ZIP = "slimefunAsstOL-main/recipes/recipes.zip"

SLIMEFUN_NAMESPACES = {"simefun4", "slimefun4", "slimefun"}
VANILLA_NAMESPACES = {"minecraft", "vanilla"}
DEFAULT_ICON = "knowledge_book"
VANILLA_TRANSLATIONS = json.loads(MINECRAFT_ZH_CN_PATH.read_text(encoding="utf-8")) if MINECRAFT_ZH_CN_PATH.exists() else {}
VANILLA_ID_PATTERNS = (
    r".+_BED$",
    r".+_BUTTON$",
    r".+_DOOR$",
    r".+_FENCE$",
    r".+_FENCE_GATE$",
    r".+_HEAD$",
    r".+_PRESSURE_PLATE$",
    r".+_SIGN$",
    r".+_SKULL$",
    r".+_SLAB$",
    r".+_STAIRS$",
    r".+_TRAPDOOR$",
    r".+_WALL$",
    r".+_WOOD$",
    r".+_HYPHAE$",
    r"INFESTED_.+",
    r"SMOOTH_.+",
    r"WAXED_.+COPPER.*",
)

RECIPE_TYPE_NAMES = {
    "slimefun:enhanced_crafting_table": "增强型工作台",
    "slimefun:magic_workbench": "魔法工作台",
    "slimefun:armor_forge": "盔甲锻造台",
    "slimefun:smeltery": "冶炼炉",
    "slimefun:grind_stone": "磨石",
    "slimefun:ore_crusher": "矿石粉碎机",
    "slimefun:compressor": "压缩机",
    "slimefun:pressure_chamber": "压力舱",
    "slimefun:ancient_altar": "古代祭坛",
    "slimefun:multiblock": "多方块结构",
    "slimefun:null": "基础材料",
}


def main():
    current_data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    existing_items = [*current_data.get("items", []), *current_data.get("vanillaItems", [])]
    existing_by_id = {item["id"]: item for item in existing_items if item.get("id")}

    imported_items, namespace_addons, ingredient_info, recipe_files = parse_assistant_zip()
    merged_by_id = OrderedDict()

    for imported_item in imported_items:
        item_id = imported_item["id"]
        existing_item = existing_by_id.get(item_id, {})
        merged_by_id[item_id] = merge_item(imported_item, existing_item)

    retained_old_items = 0
    for existing_item in existing_items:
        item_id = existing_item.get("id")
        if not item_id or item_id in merged_by_id or existing_item.get("addonName") == "Minecraft":
            continue
        if existing_item.get("sourceFile"):
            continue
        merged_by_id[item_id] = strip_generated_icons(existing_item)
        retained_old_items += 1

    vanilla_by_id = OrderedDict()

    for existing_item in current_data.get("vanillaItems", []):
        item_id = existing_item.get("id")
        if existing_item.get("addonName") == "Minecraft" and item_id and looks_like_vanilla_id(item_id):
            vanilla_by_id[existing_item["id"]] = merge_vanilla_item(item_id, existing_item.get("name"), existing_item)

    for ingredient_id, info in ingredient_info.items():
        if ingredient_id in merged_by_id:
            continue

        existing_item = existing_by_id.get(ingredient_id, {})
        if should_treat_as_vanilla(ingredient_id, info):
            vanilla_by_id[ingredient_id] = merge_vanilla_item(ingredient_id, info.get("name"), existing_item)
            continue

        addon_name = addon_name_for_id(ingredient_id, namespace_addons, info)
        existing_addon_name = existing_item.get("addonName") if existing_item.get("addonName") != "Minecraft" else None
        merged_by_id[ingredient_id] = {
            "id": ingredient_id,
            "name": existing_item.get("name") or info.get("name") or ingredient_id,
            "englishName": existing_item.get("englishName") or ingredient_id,
            "addonName": existing_addon_name or addon_name,
            "category": existing_item.get("category") if existing_addon_name else addon_name,
            "recipeType": existing_item.get("recipeType") or "基础材料",
            "icon": existing_item.get("icon") or DEFAULT_ICON,
            "recipe": existing_item.get("recipe"),
        }

    for item_id, existing_item in existing_by_id.items():
        if item_id in merged_by_id or item_id in vanilla_by_id:
            continue
        if existing_item.get("addonName") == "Minecraft" and looks_like_vanilla_id(item_id):
            vanilla_by_id[item_id] = merge_vanilla_item(item_id, existing_item.get("name"), existing_item)

    for item_id in list(vanilla_by_id):
        if item_id in merged_by_id:
            del vanilla_by_id[item_id]

    output_data = {
        "meta": {
            **current_data.get("meta", {}),
            "source": "Slimefun4-RC.jar + slimefunAsstOL-main.zip",
            "note": "已导入 slimefunAsstOL-main.zip 中的物品和配方；同 ID 物品以助手数据为配方权威，旧数据用于补充图标/头颅等展示字段。",
            "assistantSource": "slimefunAsstOL-main.zip",
            "assistantRecipeFiles": len(recipe_files),
            "assistantImportedItems": len(imported_items),
            "assistantRetainedOldItems": retained_old_items,
        },
        "items": sort_items(list(merged_by_id.values())),
        "vanillaItems": sort_items(list(vanilla_by_id.values())),
    }

    DATA_PATH.write_text(json.dumps(output_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "Imported "
        f"{len(imported_items)} assistant items, retained {retained_old_items} old addon items, "
        f"and wrote {len(output_data['items'])} addon items + {len(output_data['vanillaItems'])} vanilla items."
    )


def parse_assistant_zip():
    imported_items = []
    namespace_addons = {}
    ingredient_info = OrderedDict()
    recipe_files = []

    with zipfile.ZipFile(ASST_ZIP_PATH) as outer_zip:
        recipes_zip_bytes = outer_zip.read(INNER_RECIPES_ZIP)

    with zipfile.ZipFile(io.BytesIO(recipes_zip_bytes)) as recipes_zip:
        jsonl_names = sorted(name for name in recipes_zip.namelist() if name.endswith(".jsonl"))
        jsonl_names.sort(key=lambda name: (name != "SlimeFun4.jsonl", name))

        for file_name in jsonl_names:
            lines = recipes_zip.read(file_name).decode("utf-8").splitlines()
            if not lines:
                continue

            metadata = json.loads(lines[0])
            addon_name = clean_addon_name(metadata.get("displayName") or metadata.get("name") or file_name)
            recipe_files.append(file_name)

            for line_number, line in enumerate(lines[1:], start=2):
                if not line.strip():
                    continue

                raw_item = json.loads(line)
                item_id = normalize_item_id(raw_item.get("id"))
                if not item_id:
                    continue

                raw_namespace = raw_namespace_of(raw_item.get("id"))
                if raw_namespace and raw_namespace not in SLIMEFUN_NAMESPACES and raw_namespace not in VANILLA_NAMESPACES:
                    namespace_addons.setdefault(raw_namespace.upper(), addon_name)

                recipe_slots = normalize_recipe_slots(
                    raw_item.get("recipe"),
                    ingredient_info,
                    "Slimefun" if file_name == "SlimeFun4.jsonl" else addon_name,
                )
                recipe = flatten_recipe_slots(recipe_slots)
                imported_items.append(
                    {
                        "id": item_id,
                        "name": raw_item.get("name") or item_id,
                        "englishName": item_id,
                        "addonName": "Slimefun" if file_name == "SlimeFun4.jsonl" else addon_name,
                        "category": "Slimefun" if file_name == "SlimeFun4.jsonl" else addon_name,
                        "recipeType": normalize_recipe_type(raw_item.get("recipeType")),
                        "recipe": recipe or None,
                        "recipeSlots": recipe_slots or None,
                        "output": normalize_amount(raw_item.get("output", 1)),
                        "icon": DEFAULT_ICON,
                        "sourceFile": file_name,
                        "sourceLine": line_number,
                        **optional_field(raw_item, "research"),
                        **optional_field(raw_item, "researchCost"),
                        **optional_field(raw_item, "sortid"),
                    }
                )

    return imported_items, namespace_addons, ingredient_info, recipe_files


def merge_item(imported_item, existing_item):
    merged = {
        **imported_item,
        "englishName": existing_item.get("englishName") or imported_item.get("englishName") or imported_item["id"],
        "icon": existing_item.get("icon") or imported_item.get("icon") or DEFAULT_ICON,
    }

    for field_name in ("headTexture",):
        if existing_item.get(field_name):
            merged[field_name] = existing_item[field_name]

    return strip_generated_icons(merged)


def merge_vanilla_item(item_id, ingredient_name, existing_item):
    translated_name = vanilla_display_name(item_id)
    return strip_generated_icons(
        {
            "id": item_id,
            "name": translated_name or existing_item.get("name") or ingredient_name or item_id,
            "englishName": existing_item.get("englishName") or item_id,
            "addonName": "Minecraft",
            "category": "原版材料",
            "recipeType": "基础材料",
            "icon": existing_item.get("icon") or item_id.lower(),
            "recipe": None,
        }
    )


def vanilla_display_name(item_id):
    key = item_id.lower()
    return VANILLA_TRANSLATIONS.get(f"item.minecraft.{key}") or VANILLA_TRANSLATIONS.get(f"block.minecraft.{key}")


def normalize_recipe_slots(raw_recipe, ingredient_info, source_addon):
    if not isinstance(raw_recipe, list):
        return None

    slots = []
    has_ingredient = False

    for raw_ingredient in raw_recipe:
        if not isinstance(raw_ingredient, dict):
            slots.append(None)
            continue

        ingredient_id = normalize_item_id(raw_ingredient.get("material"))
        if not ingredient_id:
            slots.append(None)
            continue

        info = ingredient_info.setdefault(
            ingredient_id,
            {"name": raw_ingredient.get("name") or ingredient_id, "sourceAddons": set(), "rawNamespaces": set()},
        )
        info["sourceAddons"].add(source_addon)
        raw_namespace = raw_namespace_of(raw_ingredient.get("material"))
        if raw_namespace:
            info["rawNamespaces"].add(raw_namespace)

        has_ingredient = True
        slots.append({"id": ingredient_id, "qty": normalize_amount(raw_ingredient.get("amount", 1))})

    if not has_ingredient:
        return None

    return slots


def flatten_recipe_slots(recipe_slots):
    if not recipe_slots:
        return None

    materials = OrderedDict()
    for slot in recipe_slots:
        if not slot:
            continue
        materials[slot["id"]] = materials.get(slot["id"], 0) + normalize_amount(slot.get("qty", 1))
    return [{"id": item_id, "qty": normalize_amount(quantity)} for item_id, quantity in materials.items()]


def normalize_item_id(value):
    if value is None:
        return None

    raw_value = str(value).strip()
    if not raw_value:
        return None

    if ":" in raw_value:
        namespace, item_key = raw_value.split(":", 1)
        namespace_key = namespace.lower()
        normalized_key = normalize_key(item_key)

        if namespace_key in SLIMEFUN_NAMESPACES or namespace_key in VANILLA_NAMESPACES:
            return normalized_key

        return f"{namespace_key.upper()}:{normalized_key}"

    return normalize_key(raw_value)


def normalize_key(value):
    normalized = re.sub(r"[^\w]+", "_", str(value).upper(), flags=re.UNICODE)
    return re.sub(r"_+", "_", normalized).strip("_")


def raw_namespace_of(value):
    if value is None or ":" not in str(value):
        return None
    return str(value).split(":", 1)[0].lower()


def should_treat_as_vanilla(item_id, info):
    if ":" in item_id:
        return False

    raw_namespaces = info.get("rawNamespaces") or set()
    if raw_namespaces & VANILLA_NAMESPACES:
        return True

    source_addons = info.get("sourceAddons") or set()
    if source_addons and source_addons <= {"Slimefun"}:
        return True

    return looks_like_vanilla_id(item_id)


def looks_like_vanilla_id(item_id):
    return has_local_vanilla_texture(item_id) or any(re.fullmatch(pattern, item_id) for pattern in VANILLA_ID_PATTERNS)


def has_local_vanilla_texture(item_id):
    icon = item_id.lower()
    candidates = (
        ROOT / "textures" / "item" / f"{icon}.png",
        ROOT / "textures" / "block" / f"{icon}.png",
        ROOT / "textures" / "block" / f"{icon}_top.png",
        ROOT / "textures" / "block" / f"{icon}_front.png",
        ROOT / "textures" / "block" / f"{icon}_side.png",
        ROOT / "textures" / "block" / f"{icon}_end.png",
    )
    return any(path.exists() for path in candidates)


def addon_name_for_id(item_id, namespace_addons, info=None):
    namespace = item_id.split(":", 1)[0] if ":" in item_id else None
    if namespace is None and info:
        source_addons = sorted(addon for addon in info.get("sourceAddons", set()) if addon != "Minecraft")
        if source_addons:
            return source_addons[0]
    return namespace_addons.get(namespace, namespace or "未知附属")


def normalize_recipe_type(value):
    recipe_type = str(value or "基础材料").strip()
    return RECIPE_TYPE_NAMES.get(recipe_type, recipe_type)


def normalize_amount(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 1

    if number.is_integer():
        return int(number)
    return number


def clean_addon_name(value):
    name = str(value or "").strip()
    if name in {"SimeFun4配方", "SlimeFun4配方", "Slimefun4配方"}:
        return "Slimefun"
    return re.sub(r"配方$", "", name) or "未知附属"


def optional_field(raw_item, field_name):
    if field_name in raw_item:
        return {field_name: raw_item[field_name]}
    return {}


def strip_generated_icons(item):
    cleaned = dict(item)
    for field_name in ("resourcePackIcon", "resourcePackModel", "resourcePackCustomModelData", "resourcePackSource", "localIcon", "blockIcon", "headBlockIcon"):
        cleaned.pop(field_name, None)
    cleaned.setdefault("addonName", "未知附属")
    return cleaned


def sort_items(items):
    return sorted(
        items,
        key=lambda item: (
            item.get("addonName") or "",
            item.get("sortid", 999999),
            item.get("name") or "",
            item.get("id") or "",
        ),
    )


if __name__ == "__main__":
    main()
