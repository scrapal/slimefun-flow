# 粘液科技配方流程图

一个本地网页小工具：搜索粘液科技物品后，自动生成合成材料流程图，并递归显示可合成材料的衍生配方。

> 公开部署说明：本仓库的部署安全版本不包含 Minecraft 原版材质、第三方资源包图片、插件 Jar 或资源包 Zip 文件。部署前请阅读 `DEPLOYMENT.md`。

## 使用

在目录里启动一个静态服务器：

```bash
python3 -m http.server 5173
```

然后打开 `http://localhost:5173`。页面需要通过 HTTP 读取 `data/slimefun-items.json`，不建议直接双击 `index.html`。

流程图节点支持 checklist：勾选一个材料会同时勾选它的衍生材料，并自动收起该分支；进度按当前目标物品保存到浏览器 `localStorage`。
流程图里可合成材料节点右上角会显示 `+/-`，点击节点空白区域可以展开或收起它的下级材料。
右侧栏会显示当前物品基础信息、合成来源、最佳挖掘工具，以及可推断的工具/护甲耐久和伤害属性。
页面底部提供关于、隐私政策和使用条款页面，便于公开部署和广告平台审核。

## 数据格式

内置数据在 `data/slimefun-items.json`。可以在页面左侧导入同结构 JSON 替换数据：

```json
{
  "items": [
    {
      "id": "STEEL_INGOT",
      "name": "钢锭",
      "englishName": "Steel Ingot",
      "addonName": "Slimefun",
      "category": "科技",
      "icon": "iron_ingot",
      "localIcon": "./textures/item/iron_ingot.png",
      "headTexture": "可选，Minecraft 头颅材质哈希",
      "recipeType": "冶炼炉",
      "output": 1,
      "recipe": [
        { "id": "IRON_INGOT", "qty": 1 },
        { "id": "COAL", "qty": 1 }
      ]
    }
  ],
  "vanillaItems": [
    { "id": "IRON_INGOT", "name": "铁锭", "englishName": "Iron Ingot", "addonName": "Minecraft", "icon": "iron_ingot" }
  ]
}
```

`icon` 使用 Minecraft 原版物品 ID，例如 `iron_ingot`、`redstone`、`crafting_table`。
`localIcon` 是从本地 `textures/` 目录匹配出的 PNG；原版物品使用原版材质，不使用屏障兜底。
`headTexture` 是可选字段；有它时页面优先使用 `textures.minecraft.net` 的头颅材质。
`resourcePackIcon` 是可选字段；有它时页面最优先使用本地资源包导出的 PNG。
`addonName` 是附属名称标签，Slimefun 核心物品填 `Slimefun`，原版材料填 `Minecraft`，其他附属按插件名填写。
摆放出来的机器或祭坛结构，`recipeType` 填 `多方块结构`，不要填 `原版工作台`。
`output` 是每次合成产出数量；流程图递归材料数量会按它折算。

## 更新官方数据

脚本参考本地 `Slimefun4-RC.jar`，并结合 Slimefun4 官方源码抽取可识别配方，把动态/特殊注册材料作为基础材料占位：

```bash
node scripts/sync-official-slimefun.mjs
python3 scripts/import-slimefun-asst.py
node scripts/apply-resourcepack.mjs
node scripts/apply-local-textures.mjs
python3 scripts/generate-block-icons.py
python3 scripts/generate-head-icons.py
python3 scripts/prepare-deploy-data.py
```

`import-slimefun-asst.py` 会读取 `slimefunAsstOL-main.zip`，用其中的物品/配方覆盖同 ID 配方，并补齐附属名称。
原版物品中文名来自 `data/minecraft-zh_cn.json`，导入时会优先把 `Minecraft` 材料显示为中文，英文保留在 `englishName`。
资源包脚本会优先读取 `Slimefun-ResourcePack.zip`，再用 `【1.21.4粘液材质】Slimefun-Resourcepack.zip` 补充，把匹配到的 Slimefun PNG 导出到 `resourcepack/`。
本地贴图脚本会读取 `textures/`，为原版材料和没有资源包材质的物品补齐 `localIcon`。
方块图标脚本会读取资源包模型 UV，把方块展开图拼成立方体预览，写入 `blockIcon`；普通 `item/generated` 图标不会强行拼方块。
头颅图标脚本会读取 `headTexture`，把 Minecraft 头颅皮肤拼成立方体预览，写入 `headBlockIcon`。
公开部署前运行 `prepare-deploy-data.py`，它会从 `data/slimefun-items.json` 中移除本地材质、资源包图片和头颅贴图引用，让站点使用自有占位图。
源码里的复杂机器、服务器魔改配方和未收录附属插件仍可能需要手动补充。
