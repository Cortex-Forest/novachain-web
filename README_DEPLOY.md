# Nova Chain 网站部署说明

独立前端仓库（`novachain-web`），网站文件位于仓库根目录：
- `index.html`：产品落地页，展示路线图、团队介绍与 CTA
- `nova.html`：交互式体验页，支持钱包、质押、合约与验证
- `404.html` / `.nojekyll` / `vercel.json`：静态站点配套文件
- `apps.html`：应用中心（钱包、资产概览与 8 大生态应用入口）
- `music.html`：音乐 · 生成式播放器与链上发行唱片
- `words.html`：文字 · 阅读创作、付费解锁与版权印记
- `games.html`：游戏 · 量子骰子、星轨冲刺与链上排行榜
- `video.html`：视频 · 创作者频道、打赏与签名海报 NFT
- `live.html`：直播 · 直播间、弹幕与礼物打赏
- `social.html`：社交 · 动态流、点赞评论与链上时间戳
- `stage.html`：虚拟演出 · 沉浸式舞台与 NFT 门票
- `nft.html`：NFT 收藏品 · 市场、铸造、转让与交易记录
- `apps-common.js` / `apps-common.css`：应用中心公共库（钱包连接、演示支付、NFT、社交数据与设计系统）

## Vercel（推荐）
1. 在 Vercel 导入本仓库 `novachain-web`。
2. Framework Preset 选 `Other`，Root Directory 保持为空（仓库根目录 `/`）。
3. 部署后访问生成的项目地址即可；无需任何子目录配置。

## GitHub Pages
本仓库前端文件位于根目录，两种方式均可：
- 简单方式：Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`，目录 `/`。
- 推荐方式：配置 GitHub Actions 工作流（`actions/upload-pages-artifact` + `actions/deploy-pages`），Pages 源选择 `GitHub Actions`。
