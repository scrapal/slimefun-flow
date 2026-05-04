# 部署说明

这是纯静态站点，不需要后端服务。

## 部署前检查

公开仓库仍不应包含以下源文件：

- `*.jar`
- `*.zip`
- `.DS_Store`

当前版本会发布网页展示用的 PNG 图标资源，包括 `textures/`、`resourcepack/` 和 `generated-icons/heads`、`generated-icons/blocks`。上线或商业化前请确认这些材质允许公开分发和商业使用。

## 重要：首次提交历史

如果误提交了 Jar、Zip 或不应公开的素材，即使后续提交删除，公开 Git 仓库的历史里仍可能保留这些文件。需要先重写历史，只保留可公开状态。最简单做法：

```bash
git checkout --orphan deploy-clean
git add .
git commit -m "Prepare deploy-safe static site"
git branch -D main
git branch -m main
```

如果已经推送到远端，需要谨慎处理远端历史。

## Cloudflare Pages

推荐设置：

- Framework preset：`None`
- Build command：留空
- Build output directory：`/`

连接 Git 仓库后，每次推送 `main` 分支会自动部署。

## GitHub Pages

推荐设置：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/root`

## 上线前必须改的内容

- `privacy.html` 里的联系方式
- `terms.html` 里的站点责任说明，如需要可加你的站点名称
- 如果接入广告或统计，更新 `privacy.html` 的“统计与广告”段落

## 广告与变现

建议先使用免费工具积累流量，再申请广告。广告平台通常会检查：

- 是否有隐私政策
- 是否有关于/联系页面
- 是否有足够原创内容
- 是否存在版权风险内容

如果站点展示 Minecraft 原版材质或第三方资源包图片，需要额外确认版权、授权和广告平台政策；配方数据也应在页面中明确为非官方参考。
