# 部署说明

这是纯静态站点，不需要后端服务。

## 部署前检查

公开部署版本不应包含以下文件：

- `*.jar`
- `*.zip`
- `.DS_Store`
- `textures/`
- `resourcepack/`
- `generated-icons/`

这些路径已经写入 `.gitignore`，并已从当前提交索引中移除。它们可以继续留在本机用于本地开发，但不应上传到公开仓库或部署平台。

## 重要：首次提交历史

当前仓库最早的一次提交曾包含 Jar、Zip 和大量材质文件。即使后续提交删除了它们，公开 Git 仓库的历史里仍可能保留这些文件。

如果要推到 GitHub/GitLab 等公开仓库，先重写历史，只保留清理后的状态。最简单做法：

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

本站公开部署版不分发 Minecraft 原版材质或第三方资源包图片，但配方数据仍应在页面中明确为非官方参考。
