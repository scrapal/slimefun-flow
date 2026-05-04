#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "slimefun-items.json"

LOCAL_ASSET_FIELDS = {
    "localIcon",
    "resourcePackIcon",
    "resourcePackSource",
    "blockIcon",
    "headBlockIcon",
    "headTexture",
}


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    removed = 0

    for item in [*data.get("items", []), *data.get("vanillaItems", [])]:
        for field in LOCAL_ASSET_FIELDS:
            if field in item:
                item.pop(field, None)
                removed += 1

    data.setdefault("meta", {})
    data["meta"]["deploySafe"] = True
    data["meta"]["deploySafeNote"] = "公开部署版不包含 Minecraft 原版材质、第三方资源包图片、Jar 或 Zip 文件；图标由网页占位符显示。"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Removed {removed} local/third-party asset references from {DATA_PATH.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
