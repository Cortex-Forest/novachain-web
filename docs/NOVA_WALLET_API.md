# Nova 钱包 API 文档（开发者接入指南）

> 适用版本：钱包升级 v1.0.0（阶段八 · 开发者生态）
> 范围：JS SDK 接入、页面↔扩展桥协议、后端 RPC 接口、Chrome 扩展构建
> 语言：中文（SDK 错误信息为中文，便于钱包用户理解）

---

## 1. 快速开始

### 1.1 引入 SDK

浏览器直接引入（推荐，CDN 或本地静态资源）：

```html
<script src="sdk/nova-wallet-sdk.js"></script>
<script>
  window.NovaWalletSDK.connect()
    .then(({ connected, accounts }) => console.log(connected, accounts))
    .catch(err => console.error(err.code, err.message));
</script>
```

Node / 打包器（UMD 同时支持 CommonJS）：

```js
const NovaWalletSDK = require('nova-wallet-sdk.js');
```

### 1.2 三行接入

```js
const sdk = NovaWalletSDK;

// 1) 连接钱包（未安装扩展时抛 ERR.NO_PROVIDER，可引导用户安装）
const { connected, accounts } = await sdk.connect();

// 2) 读取地址与余额
const { address } = await sdk.getAddress();
const { balance, node } = await sdk.getBalance(address);

// 3) 发起转账（扩展弹窗内完成预览/密码/广播）
await sdk.sendTransaction({ to: '0x...', amount: 100, memo: '订单 #123' });
```

### 1.3 前提

- 已安装并启用 Chrome 扩展版 Nova 钱包（见 §8 构建加载方式）。
- 扩展内钱包需至少创建过一个账户（账户会同步到扩展存储，content script 据此应答 DApp）。

---

## 2. SDK API 参考

SDK 暴露为 `window.NovaWalletSDK`，同时把统一 Provider 挂到 `window.novaWallet`（方便 DApp 直接使用与 MetaMask 风格迁移）。

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `detectProvider()` | 无 | Provider | 优先复用 `window.novaWallet`，否则创建 postMessage 桥 Provider |
| `connect()` | 无 | `{ connected, accounts }` | 读取当前账户列表（不弹窗） |
| `isConnected()` | 无 | `{ connected, accounts }` | 是否已连接 |
| `getAddress()` | 无 | `{ address }` | 当前主账户地址 |
| `getBalance(address?)` | `address` 可选 | `{ balance, node }` | 查询余额（缺省用当前账户） |
| `sendTransaction({ to, amount, memo? })` | 必填 `to`/`amount` | `{ pending, status }` | 转入扩展待确认队列，由用户在钱包弹窗内完成 |
| `signMessage(message)` | string | `{ pending, status }` | 签名消息请求（扩展内确认；网页钱包内规划中） |
| `request(method, params?)` | 见 §3 | Promise | 通用方法分发 |
| `onAccountsChanged(fn)` | function | 当前 SDK | 订阅账户切换事件 |
| `destroy()` | 无 | 无 | 移除消息监听（页面卸载时调用，释放资源） |

### 2.1 sendTransaction 参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `to` | string | ✅ | 接收地址（Nova 0x 地址） |
| `amount` | number | ✅ | 转账数量（NOVA） |
| `memo` | string | ❌ | 备注，默认空字符串 |

### 2.2 事件：accountsChanged

```js
NovaWalletSDK.onAccountsChanged((accounts) => {
  console.log('当前账户切换为：', accounts[0]);
  renderUI(accounts);
});
```

触发时机：扩展钱包内创建/切换/删除账户后，扩展向页面推送新账户列表。

---

## 3. 通用 request 方法

`request(method, params)` 支持以下 method（与扩展 content script 协议一一对应）：

| method | params | 返回 result |
| --- | --- | --- |
| `connect` | `{}` | `{ accounts }` |
| `isConnected` | `{}` | `{ connected, accounts }` |
| `getAddress` | `{}` | `{ address }` |
| `getBalance` | `{ address? }` | `{ balance, node }` |
| `send_transaction` | `{ to, amount, memo, from }` | `{ pending, status }` |
| `sign_message` | `{ message, from }` | `{ pending, status }` |

> `from` 由扩展自动注入为当前账户，DApp 无需也不能伪造。

---

## 4. postMessage 桥协议（页面 ↔ 扩展）

SDK 与扩展 content script 通过 `window.postMessage` 通信，消息对象带 `source` 标记，互不干扰页面自身消息。

### 4.1 页面 → 扩展（DApp 请求）

```json
{
  "source": "nova-wallet-dapp",
  "id": "sdk1_k3x9f",
  "method": "getBalance",
  "params": { "address": "0xabc..." },
  "version": 1
}
```

### 4.2 扩展 → 页面（请求应答）

成功：

```json
{
  "source": "nova-wallet-ext",
  "id": "sdk1_k3x9f",
  "ok": true,
  "result": { "balance": 123.45, "node": "http://127.0.0.1:8080" }
}
```

失败：

```json
{
  "source": "nova-wallet-ext",
  "id": "sdk1_k3x9f",
  "ok": false,
  "error": { "code": 4100, "message": "Not connected: open the extension wallet first" }
}
```

### 4.3 扩展 → 页面（事件推送）

```json
{ "source": "nova-wallet-ext", "event": "accountsChanged", "accounts": ["0xabc..."] }
{ "source": "nova-wallet-ext", "event": "ready", "version": 1 }
```

- `ready`：扩展 content script 注入完成时广播，SDK 据此判定扩展已安装（毫秒级）。
- `hello`（页面→扩展）：SDK 在主世界无 `chrome.runtime` 时发出的握手请求，扩展收到后立即回 `ready`；普通请求由扩展应答。
- 协议版本号 `< 1` 的请求会被扩展以 `-32600` 拒绝。

### 4.4 安全约束

- 页面无法伪造扩展应答：应答 `id` 必须匹配 SDK 内部递增且带时间戳的请求 id。
- `from`（签名发起账户）由扩展注入，DApp 传入会被覆盖。
- 扩展仅响应 `source === 'nova-wallet-dapp'` 的消息，其余一律忽略。

---

## 5. 错误码（与 EIP-1193 风格对齐）

| code | 含义 | 常见场景 |
| --- | --- | --- |
| `4001` | 未检测到扩展 / 用户拒绝 | 未安装扩展；用户在弹窗内点了拒绝 |
| `4002` | 余额查询失败 | 节点不可达（默认 RPC `http://127.0.0.1:8080`） |
| `4100` | 未连接 | 扩展钱包内还没有账户，或未打开过钱包 |
| `-32600` | 协议版本不支持 | DApp 协议版本过旧 |
| `-32601` | 未知方法 | `request('foo')` 之类的方法名拼错 |
| `-1` | 内部错误 / 请求超时 | 8 秒无应答（扩展未启用等） |

`ERR` 常量：`NovaWalletSDK.ERR.NO_PROVIDER`（=4001）、`ERR.USER_REJECTED`（=4001）、`ERR.NOT_CONNECTED`（=4100）、`ERR.UNKNOWN`（=-1）。

---

## 6. 后端 RPC 接口（Nova 节点）

默认 RPC 地址：`http://127.0.0.1:8080`。扩展 `background.js` 代理余额查询；网页钱包直接调用。以下为钱包与生态页使用的接口。

### 6.1 节点状态

`GET /api/status`

```json
{
  "node": "seed", "peers": 3, "dag": 120,
  "total_stake": 25000, "deploy_count": 5, "referral_issued": 12, "call_count": 8,
  "height": 42, "checkpoint": 10, "consensus": "pos",
  "validator": "0x...", "storage_providers": 2, "pins": 3, "compute_tasks": 1,
  "fan_tokens": 2, "markets": 1, "socialfi_events": 9,
  "quantum_safe": true, "algorithm": "CRYSTALS-Dilithium5"
}
```

### 6.2 余额查询

`GET /api/balance/{addr}`

```json
{ "addr": "0xabc...", "balance": 123.45 }
```

### 6.3 发送交易

`POST /api/send`，Body：

```json
{
  "sender": "0xabc...",
  "receiver": "0xdef...",
  "amount": 100,
  "parents": [],
  "data": "",
  "sender_public_key": "0x...",
  "signature": "0x...",
  "timestamp": 1789000000
}
```

成功：`{ "txid": "0x..." }`；校验失败：HTTP 400 `{ "error": "交易校验失败" }`。

### 6.4 交易历史

`GET /api/txs/{addr}` — 本地账本中与该地址相关的已确认交易（按时间倒序）：

```json
{
  "addr": "0xabc...",
  "txs": [
    { "txid": "0x...", "sender": "0xabc...", "receiver": "0xdef...", "amount": 100, "ts": 1789000000 }
  ]
}
```

### 6.5 单笔交易

`GET /api/tx/{txid}` — 命中返回交易条目；不存在返回 HTTP 404 `{ "error": "交易不存在或尚未上链" }`。

### 6.6 合约风险查询

`GET /api/contract/{addr}` — 用于钱包转账前恶意合约风险提示：

```json
{ "addr": "0xabc...", "is_contract": true, "creator": "0x...", "code_size": 512 }
```

非合约地址：`{ "addr": "0x...", "is_contract": false }`。

### 6.7 轻节点签到

`POST /api/checkin`，Body：

```json
{ "addr": "0xabc...", "fingerprint": "optional-device-fingerprint" }
```

成功：`{ "status": "签到成功", "total_days": 13 }`；失败返回 HTTP 400 `{ "error": "..." }`（含 IP/设备/间隔限制）。

### 6.8 早期激励进度

`GET /api/early/info?addr=0x...`

```json
{
  "miner_registered": true, "miner_uptime_days": 12.5,
  "light_checkin_days": 12, "locked_balance": 100,
  "lock_start_time": 1788000000, "lock_unlocked": 0,
  "referral_count": 3, "miner_qualified": true, "light_qualified": false
}
```

---

## 7. Chrome 扩展（MV3）

### 7.1 目录结构

```
browser-extension/
├── manifest.json      # MV3 清单（storage 权限 + content script）
├── background.js      # service worker：余额代理、请求入队（nova_pending）、角标
├── content.js         # 页面↔扩展桥（isolated world）
├── popup.html/js      # 弹窗：内嵌完整钱包 + 待确认请求处理
├── wallet.html        # 由 wallet.html 构建产物（0 内联脚本，CSP 收紧）
├── wallet-app.js      # 内联 JS 外置产物
├── wallet-crypto.js   # 加密/助记词/签名模块
├── wallet-evm.js      # EVM 多链模块
├── apps-common.js     # 公共样式/工具
└── icons/             # 16/48/128 图标
```

### 7.2 构建与加载

```bash
node scripts/build_extension.mjs   # 重新生成 wallet-app.js / wallet.html，校验无内联脚本
```

1. 打开 `chrome://extensions`。
2. 开启右上角「开发者模式」。
3. 点「加载已解压的扩展程序」，选择 `browser-extension/` 目录。
4. 点击工具栏图标，在钱包内创建账户后即可供 DApp 使用。

> 加载失败时先执行 `node scripts/build_extension.mjs` 重新构建，确保 wallet.html 无内联脚本（MV3 要求）。

### 7.3 工作流说明

- DApp 调用 `sendTransaction` → 扩展把请求写入 `nova_pending` 队列并打开弹窗 → 用户在弹窗内看到「待确认转账」，点击「在钱包中确认」后自动填入钱包表单并走完整的交易预览 / 密码 / 广播流程。
- 账户列表存放在扩展 `storage.local.nova_accounts`，由弹窗内钱包 iframe 自动同步，content script 据此应答 DApp 的 `connect` / `getAddress`。

---

## 8. 安全说明

- 私钥只保存在钱包页面本机 `localStorage`（AES-256-GCM 加密），扩展仅同步账户地址，不接触私钥。
- 扩展默认 RPC 为 `http://127.0.0.1:8080`，可通过扩展存储 `nova_rpc` 覆盖为任意可信节点。
- DApp 接入请使用 HTTPS 站点；SDK 对 `accountsChanged` 等事件仅信任 `nova-wallet-ext` 来源的消息。
- 正式接入时建议通过官方域名白名单校验钱包页面来源，防止钓鱼域名仿冒。

---

*文档随钱包版本维护，协议变更以 `sdk/nova-wallet-sdk.js` 头注释与本文档为准。*
