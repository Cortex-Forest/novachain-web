# Nova Chain 网站部署说明

独立前端仓库（`novachain-web`），网站文件位于仓库根目录：
- `index.html`：产品落地页，展示路线图、团队介绍与 CTA
- `nova.html`：交互式体验页，支持钱包、质押、合约与验证
- `404.html` / `.nojekyll` / `vercel.json`：静态站点配套文件

## Vercel（推荐）
1. 在 Vercel 导入本仓库 `novachain-web`。
2. Framework Preset 选 `Other`，Root Directory 保持为空（仓库根目录 `/`）。
3. 部署后访问生成的项目地址即可；无需任何子目录配置。

## GitHub Pages
本仓库前端文件位于根目录，两种方式均可：
- 简单方式：Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`，目录 `/`。
- 推荐方式：配置 GitHub Actions 工作流（`actions/upload-pages-artifact` + `actions/deploy-pages`），Pages 源选择 `GitHub Actions`。
