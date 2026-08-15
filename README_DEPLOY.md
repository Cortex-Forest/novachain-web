# Nova Chain 网站部署说明

独立前端仓库（`novachain-web`），网站文件位于仓库根目录：
- `index.html`：产品落地页，展示路线图、团队介绍与 CTA
- `nova.html`：交互式体验页，支持钱包、质押、合约与验证
- `404.html` / `.nojekyll` / `vercel.json`：静态站点配套文件
- `apps.html`：应用中心（钱包、资产概览与 8 大生态应用入口）
- `music.html`：音乐 · 生成式播放器与链上发行唱片
- `words.html`：文字 · 公开/加密发布、文本市场、付费解锁、保证金与社区仲裁
- `games.html`：游戏 · 量子骰子、星轨冲刺与链上排行榜
- `video.html`：视频 · 创作者频道、打赏与签名海报 NFT
- `live.html`：直播 · 直播间、弹幕与礼物打赏
- `social.html`：社交 · 动态流、点赞评论与链上时间戳
- `stage.html`：虚拟演出 · 沉浸式舞台与 NFT 门票
- `nft.html`：NFT 收藏品 · 市场、铸造、转让与交易记录
- `apps-common.js` / `apps-common.css`：应用中心公共库（钱包连接、演示支付、NFT、社交数据与设计系统）
- `wallet.html`：Web3 钱包（BIP39 助记词、AES-256 加密保险库、密码/生物识别解锁、多账户、交易预览与安全防护）
- `wallet-crypto.js`：钱包加密内核（BIP39 / Ed25519 / AES-GCM / PBKDF2 / WebAuthn）
- `wallet-evm.js`：多链 EVM 内核（Keccak-256 / secp256k1 / BIP32+BIP44 / EIP-155 交易签名 / ABI 解码，零外部依赖）

## 钱包多链说明（阶段四）
- 内置以太坊 / BSC / Polygon 预设网络（公共 RPC：`ethereum-rpc.publicnode.com`、`bsc-rpc.publicnode.com`、`polygon-bor-rpc.publicnode.com`），可在「多链」面板添加/删除自定义 EVM 网络（RPC 需支持 CORS 与 `eth_*` JSON-RPC）。
- EVM 地址由助记词按 BIP44 标准路径 `m/44'/60'/0'/0/n` 派生；导入的 hex 私钥账户由 Nova 私钥确定性派生（面板有注明）。
- 签名前展示 calldata 解码（内置 transfer/approve/transferFrom 等常用选择器库）与 Gas 估算；EVM 交易走 EIP-155 传统交易（legacy）签名并广播。
- WalletConnect v2 为演示模式：可解析 `wc:` URI 与模拟 DApp 签名请求，真实配对需接入官方中继与项目 ID。
- 生物识别（WebAuthn PRF）与 WebCrypto 依赖 HTTPS 或 localhost；本地验证运行 `node scripts/test-wallet-crypto.mjs`、`node scripts/test-wallet-evm.mjs`、`node scripts/e2e_wallet.mjs`。
## 钱包资产与收益（阶段五）
- 新增「资产」面板：资产分类展示（代币 / NFT / 密文资产）、NFT 可视化卡片（本地生态收藏 + 链上碎片 NFT）、收益统计（质押、推荐、创作/存储/区块奖励）与早期激励进度（签到天数进度条、3 年锁仓剩余时间、达标徽章、一键签到）。
- 后端 `/api/early/info` 新增 `lock_start_time` / `lock_unlocked` / `referral_count` 字段供前端展示锁仓剩余时间与推荐人数。
- 收益估算口径：质押年化 = 当前区块奖励 × 年出块数（60s/块）× 我的质押占比；推荐预计 = 邀请人数 × 当前单笔推荐奖励（减半机制）。

## Vercel（推荐）
1. 在 Vercel 导入本仓库 `novachain-web`。
2. Framework Preset 选 `Other`，Root Directory 保持为空（仓库根目录 `/`）。
3. 部署后访问生成的项目地址即可；无需任何子目录配置。

## GitHub Pages
本仓库前端文件位于根目录，两种方式均可：
- 简单方式：Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`，目录 `/`。
- 推荐方式：配置 GitHub Actions 工作流（`actions/upload-pages-artifact` + `actions/deploy-pages`），Pages 源选择 `GitHub Actions`。
