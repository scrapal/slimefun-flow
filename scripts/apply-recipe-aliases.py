#!/usr/bin/env python3
import copy
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "slimefun-items.json"

RECIPE_TYPE_OVERRIDES = {
    "infinityexpansion:singularity_constructor": "奇点构造机",
    "infinityexpansion:infinity_forge": "无尽工作台",
    "infinityexpansion:void_harvester": "虚空收割机",
}


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    all_items = [*data.get("items", []), *data.get("vanillaItems", [])]

    override_recipe_type_labels(all_items)
    copied = apply_alias_recipes(all_items)

    data.setdefault("meta", {})
    data["meta"]["recipeAliasCopied"] = copied
    data["meta"]["recipeAliasNote"] = "为无命名空间的同名附属物品补充有命名空间物品的配方，避免材料树把它们误判为基础材料。"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Copied {copied} alias recipes.")


def override_recipe_type_labels(items):
    for item in items:
        recipe_type = item.get("recipeType")
        if recipe_type in RECIPE_TYPE_OVERRIDES:
            item["recipeType"] = RECIPE_TYPE_OVERRIDES[recipe_type]

        if (
            item.get("addonName") == "无尽贪婪"
            and str(item.get("id", "")).startswith("INFINITYEXPANSION:")
            and str(item.get("id", "")).endswith("_SINGULARITY")
            and item.get("recipe")
            and item.get("recipeType") == "冶炼炉"
        ):
            item["recipeType"] = "奇点构造机"


def apply_alias_recipes(items):
    namespaced_by_suffix = defaultdict(list)
    for item in items:
        item_id = item.get("id", "")
        if ":" not in item_id or not item.get("recipe"):
            continue
        namespaced_by_suffix[item_id.split(":", 1)[1]].append(item)

    copied = 0
    for item in items:
        item_id = item.get("id", "")
        if ":" in item_id or item.get("recipe") or item.get("addonName") == "Minecraft":
            continue

        candidates = [
            candidate
            for candidate in namespaced_by_suffix.get(item_id, [])
            if normalized_name(candidate) == normalized_name(item)
        ]
        if len(candidates) != 1:
            continue

        source = candidates[0]
        for field_name in ("recipe", "recipeSlots", "output"):
            if source.get(field_name) is not None:
                item[field_name] = copy.deepcopy(source[field_name])

        item["recipeType"] = source.get("recipeType") or item.get("recipeType") or "未知配方"
        item["recipeAliasOf"] = source["id"]
        item["recipeAliasAddon"] = source.get("addonName")
        copied += 1

    return copied


def normalized_name(item):
    return str(item.get("name") or "").replace(" ", "").strip()


if __name__ == "__main__":
    main()
