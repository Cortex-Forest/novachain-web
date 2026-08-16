# Nova 娱乐链 REST API 文档 / Nova REST API Reference

> 中英文双语文档。在线测试：用任意 Swagger UI 加载本目录 `swagger.yaml`（如 `npx @apidevtools/swagger-cli` 或 Swagger Editor）。
> Bilingual reference. Load `swagger.yaml` in any Swagger UI to try endpoints live.
> Base URL（节点地址 / node）: `http://127.0.0.1:8080` · Content-Type: `application/json` · 所有响应均为 JSON。

## 一、签名协议 / Signed Transaction Protocol

除只读查询外，所有写操作都是 **Nova 链交易**，由调用方私钥签名，格式与链上 `Tx.signing_data()` 完全一致：

```
signing_data = sender + receiver + canonical_amount(amount) + timestamp + parents + data + sender_public_key
signature    = Ed25519(signing_data)   # 64 bytes hex；抗量子节点亦接受 Dilithium5（2592B 公钥）
canonical_amount(n) = n.toFixed(8).replace(/0+$/,'').replace(/\.$/,'')   # 最多 8 位小数，去末尾 0
address = "0x" + sha3_512(sender_public_key)[:40]
```

- 模块操作（预言机/桥/DEX/治理/DID/订阅/SocialFi）：`sender == receiver`，业务字段放 `data`（JSON 字符串 `{"op":"nova:xxx:yyy", ...}`）。
- 普通转账：`sender != receiver`，`data` 为备注 memo。
- 质押类：`data` 为固定字符串 `"nova:stake"` / `"nova:unstake"` / `"nova:claim"`。
- `timestamp` 为 Unix 秒，与节点时间差超过 300 秒将被拒绝；`parents` 固定为 `[]`。
- 错误码 / Error codes：`400` 参数或签名/规则校验失败（`{"error":"..."}`）、`404` 资源不存在、`500` 服务端异常。交易类错误统一为 `{"error":"交易校验失败（签名/规则）"}`。

### SDK 快速上手 / Quick Start (npm)

```bash
npm i @nova/sdk
```

```js
import { NovaWallet, NovaContent, NovaStaking } from '@nova/sdk';

const wallet = await NovaWallet.create();                  // BIP39 助记词 + SLIP-10 派生（m/44'/223'/0'/0'/0'）
const content = new NovaContent(wallet);
await content.publish({ title: '我的第一首歌', content: '加密正文...', price: 10 });

const staking = new NovaStaking(wallet);
await staking.stake(100);
await staking.checkin();
```

浏览器直连（无需构建工具）：`<script src="nova-sdk-open.js"></script>` → `window.NovaSDK`。

## 二、钱包类 / Wallet

### `GET /api/status` — 节点状态 / Node status
无参数。响应示例：
```json
{ "node": "0.0.0.0:9000", "height": 128, "consensus": "checkpoint", "algorithm": "Ed25519",
  "total_stake": 5000.0, "deploy_count": 3, "call_count": 12, "storage_nodes": 4 }
```

### `GET /api/balance/{addr}` — 查询余额 / Balance
`addr`：Nova 地址（`0x` + 40 hex）。
```json
{ "addr": "0xb86a...1084", "balance": 1234.5 }
```

### `POST /api/send` — 转账 / Transfer
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sender | string | ✅ | 发送方地址 |
| receiver | string | ✅ | 接收方地址 |
| amount | number | ✅ | NOVA 数量（>0） |
| data | string | - | 备注 memo |
| timestamp | number | ✅ | Unix 秒 |
| parents | array | - | 固定 `[]` |
| sender_public_key | string | ✅ | 32B 公钥 hex |
| signature | string | ✅ | 64B 签名 hex |

```json
{ "txid": "882a07c268d4f5ac1b2f7eb7ca6b302547df179c7a3cb2ff001650709f8dc34b" }
```

### `GET /api/txs/{addr}?limit=50` — 交易历史 / Tx history
按时间倒序返回该地址历史交易 `{"addr": "...", "txs": [{txid, sender, receiver, amount, timestamp, data, ...}]}`。

### `GET /api/tx/{txid}` — 单笔交易 / Single tx
```json
{ "txid": "...", "sender": "0x...", "receiver": "0x...", "amount": 10, "timestamp": 1786890000,
  "parents": [], "data": "...", "sender_public_key": "...", "signature": "..." }
```
404：交易不存在或尚未上链。

### `GET /api/stats` — 全网激励参数 / Network incentive params
返回 `deploy_reward`、`referral_reward`、`block_reward`、`storage_reward_per_gb_day`、`quantum_safe` 等。

## 三、合约类 / Smart Contract

### `POST /api/deploy` — 部署合约 / Deploy (NexLang bytecode)
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| bytecode | string | ✅ | NexLang 合约源码/字节码（≤ 安全上限） |
| creator | string | - | 部署者地址；提供时需同时给出签名 |
| signature | string | 条件 | 签名消息 `deploy:{contract_addr}:{bytecode}` |
| sender_public_key | string | 条件 | 部署者公钥 |

合约地址为确定性派生：`0x + sha3_256(bytecode)[:40]`。同地址限部署 1 个合约，部署成功发放部署奖励。
```json
{ "contract": "0x5abbc3500366bd4a7294a25475953e5ccc854377", "txid": "...", "reward": 50 }
```

### `POST /api/call` — 调用合约 / Call contract
`{ sender, contract, amount, message, timestamp, sender_public_key, signature }`，`message` 为调用数据。
```json
{ "txid": "..." }
```

### `GET /api/contract/{addr}` — 合约信息 / Contract info
```json
{ "addr": "0x...", "is_contract": true, "creator": "0x...", "code_size": 128 }
```
非法地址返回 400；非合约返回 `{"addr":"...","is_contract":false}`。

## 四、内容类 / Content (SocialFi)

统一入口 `POST /api/op`（亦可用 `/api/socialfi`），签名格式见上文，业务字段放 `data`：

| op | 业务字段 | amount 语义 |
|---|---|---|
| `nova:text:create` | title, visibility(`public`/`sealed`), tier(`basic`/`advanced`/`pro`), price, content(公开必填), identifier, cid, cipher_cid/cipher_data+key_cipher(密文) | 保证金（基础 10 / 进阶 100 / 专业 1000，信誉分≥80 打 5 折） |
| `nova:text:buy` | text_id, buyer_pub(密文= P256 公钥 `04`+128hex) | 内容价格 |
| `nova:text:unlist` / `nova:text:destroy` | text_id | 0 |
| `nova:text:complain` / `nova:text:vote` | text_id, reason / option | 0 |
| `nova:fan:*`、`nova:blindbox:*`、`nova:graph:*` 等 | 见社交模块源码 | 依操作而定 |

发布响应：
```json
{ "status": "ok", "txid": "...", "op": "nova:text:create", "id": "txt_99ef5a6409687ac50bef", "summary": "发布「我的第一首歌」" }
```

### 查询接口
- `GET /api/socialfi/text`：文本资产、合约公钥（密文发布用）、文本信誉分、保证金档位。
- `GET /api/socialfi/overview`：粉丝代币/盲盒/策展/图谱等全局计数。
- `GET /api/text/key`：文本合约公钥（ECIES 加密正文密钥）。
- `GET /api/reputation/{addr}`：社会信誉分（`score`、`comp` 明细）。
- `GET /api/graph/recommend/{addr}`：社交图谱推荐。

## 五、质押类 / Staking

### `POST /api/stake` — 质押 / Stake
`{ addr, amount, timestamp, sender_public_key, signature }`，data 固定 `"nova:stake"`。最低 100、单地址与全网均有上限。
```json
{ "status": "已质押", "txid": "...", "amount": 100 }
```

### `POST /api/unstake` — 解押（7 天冷却）/ Unstake (7-day cooldown)
`amount` 必须 ≤ 当前质押，且冷却中总量 ≤ 质押 25%。
```json
{ "status": "7天冷静期", "txid": "..." }
```

### `POST /api/claim` — 领取返还 / Claim
```json
{ "status": "已返还", "txid": "..." }
```

### `GET /api/stakes` — 质押全景 / All stakes
`{ "stakes": { "0x...": 100 }, "total": 100 }`。

### `POST /api/checkin` — 签到（无签名）/ Check-in (unsigned)
`{ "addr": "...", "fingerprint": "可选设备指纹" }`。同一 IP 24 小时限 1 个轻节点、同设备唯一、间隔 ≥ 20 小时；前 8100 名获得 100 NOVA 锁仓空投。

### 其它
- `POST /api/unlock`：解锁到期锁仓 `{ "unlocked": 0 }`。
- `GET /api/early/info`：早期激励信息。
- `POST /api/referral`：绑定推荐人 `{ invitee, referrer }`。
- `POST /api/light/verify`：轻节点验证。
## 六、订阅类 / Subscription

统一入口 `POST /api/sub/op`（模块操作签名格式）。

| op | 业务字段 | amount 语义 |
|---|---|---|
| `nova:sub:create` / `nova:sub:update` | tiers = `[{id, name, price, period('monthly'/'lifetime'), benefits[]}]` | 0 |
| `nova:sub:subscribe` | creator, tier_id, auto_renew | 档位价格（90% 归创作者 / 10% 生态基金） |
| `nova:sub:renew` | creator, user（节点续费，余额不足自动取消） | 0 |
| `nova:sub:cancel` | creator（月付可取消，永久会员不可） | 0 |

查询：
- `GET /api/sub/summary`：全局统计（创作者数、订阅数、生态基金分成）。
- `GET /api/sub/creator/{addr}`：创作者档位、订阅者数、累计收入。
- `GET /api/sub/status/{user}/{creator}`：订阅状态 `{status: none|active|expired|cancelled, expires_at, auto_renew, tier_name}`。

## 七、仲裁类 / Arbitration

- `GET /api/arb/summary`：案件数、仲裁员数、保证金池。
- `GET /api/arb/arbitrators`：在职仲裁员列表（地址/信誉/案件数）。
- `GET /api/arb/candidates`：候选池与投票状态。
- `GET /api/arb/cases?status=open`：案件列表；`GET /api/arb/cases/{case_id}`：案件详情（投诉保证金、双方陈述、投票）。
- `GET /api/arb/user/{addr}`：用户的投诉/保证金/信誉；`GET /api/arb/panel/{addr}`：仲裁员面板。
- `GET /api/arb/notifications/{addr}`、`POST /api/arb/notifications/read`：通知与已读。
- 写操作经 `POST /api/op`（`nova:arb:*` 系列：stake/apply/raise/arbitrate/vote/complain 等）。

## 八、预言机 / Oracle

统一入口 `POST /api/oracle/op`。

| op | 业务字段 | amount 语义 | 权限 |
|---|---|---|---|
| `nova:oracle:node:register` | pubkey（ECVRF-P256 公钥 `0x`+128hex） | 500 NOVA 质押 | 任意地址 |
| `nova:oracle:node:exit` / `nova:oracle:node:claim` | - | 0 | 节点本人 |
| `nova:oracle:vrf:request` | hint | 0 | 任意地址（≤3 个进行中请求） |
| `nova:oracle:vrf:fulfill` | request_id, proof（{gamma,c,s}） | 0 | 预言机节点 |
| `nova:oracle:price:update` | feed(`USDT/USD`/`ETH/USD`), source(`chainlink`/`pyth`/`binance`/`okx`/`gate`), price | 0 | 预言机节点 |
| `nova:oracle:report` | target, feed（偏离聚合价 >25% 可举报罚没） | 0 | 预言机节点 |
| `nova:oracle:ai:submit` | content_hash（64hex 或 bafy CID）, meta | 0 | 任意地址 |
| `nova:oracle:ai:verify` | content_hash, verdict(bool) | 0 | 预言机节点（通过奖励 0.1 NOVA） |

查询：
- `GET /api/oracle/summary`：节点数、质押、请求数、聚合价、AI 验证统计。
- `GET /api/oracle/price/{feed}`：聚合价（中位数，5 分钟频次，>10% 偏离剔除）`{feed, price, ts, sources, method}`。
- `GET /api/oracle/vrf/{request_id}`：VRF 结果 `{status, random, proof, alpha, node, ...}`，任何人可用公钥+证明验证。
- `GET /api/oracle/nodes`：节点列表；`GET /api/oracle/ai/{content_hash}`：AI 验证状态。

## 九、跨链桥 / Bridge

统一入口 `POST /api/bridge/op`。

| op | 业务字段 | amount 语义 | 权限 |
|---|---|---|---|
| `nova:bridge:node:register` | - | 1000 NOVA 质押 | 任意地址 |
| `nova:bridge:node:exit` / `nova:bridge:node:claim` | - | 0 | 桥节点 |
| `nova:bridge:asset:register` | symbol | 0 | 桥节点 |
| `nova:bridge:deposit` | asset, source_chain(`bsc`/`eth`/`polygon`), source_tx(64hex), source_addr, amount, user | 0 | 桥节点监听存款事件后登记 |
| `nova:bridge:deposit:sign` / `nova:bridge:deposit:claim` | deposit_id | 0 | 桥节点（3/5 多签，大额 24h 延迟） |
| `nova:bridge:withdraw` | asset, target_chain, target_addr, amount(包装资产) | NOVA 时=跨出额；包装资产=0（销毁） | 任意用户 |
| `nova:bridge:withdraw:sign` / `nova:bridge:withdraw:confirm` | withdraw_id, release_tx | 0 | 桥节点 |

查询：
- `GET /api/bridge/summary`：节点、资产供应量、手续费池、日额度使用（100 万 USDT）、罚没。
- `GET /api/bridge/asset/{symbol}`：包装资产 `{supply, balances, ...}`。
- `GET /api/bridge/deposits` / `GET /api/bridge/withdrawals`：跨入/跨出记录（倒序 100 条）。

## 十、DEX / 去中心化交易所

统一入口 `POST /api/dex/op`（交易对 id 形如 `NOVA/USDT`、`NOVA/nETH`）。

| op | 业务字段 | amount 语义 |
|---|---|---|
| `nova:dex:pair:create` | pair_id | 0 |
| `nova:dex:add` | pair_id, amount0(NOVA), amount1(包装资产) | NOVA 注入量（=amount0） |
| `nova:dex:remove` | pair_id, shares, min0, min1（滑点保护下限） | 0 |
| `nova:dex:swap` | pair_id, amount_in, token_in(0=NOVA/1=包装), min_out | token_in=0 时=amount_in |
| `nova:dex:farm:stake` / `nova:dex:farm:unstake` / `nova:dex:farm:claim` | pair_id, shares / - | 0 |

规则：AMM 恒定乘积 `x·y=k`；每笔 0.3% 手续费（0.25% 归 LP，0.05% 回购销毁）；滑点超过 `min_out` 自动取消（默认 5%）；大额交易可查分拆建议后逐片执行。

查询：
- `GET /api/dex/summary`：交易对储备、挖矿池 APR、暂停状态。
- `GET /api/dex/quote?pair=NOVA%2FUSDT&amount_in=100&token_in=0`：报价 `{amount_out, price_impact, price}`。
- `GET /api/dex/split?pair=...&amount_in=...&token_in=0`：分拆建议 `{pieces, per_piece, total_out}`。
- `GET /api/dex/lp/{addr}`：LP 持仓；`GET /api/dex/farm/{pair}/{addr}`：挖矿收益 `{staked, pending_reward, apr}`。

## 十一、治理 / Governance

统一入口 `POST /api/gov/op`。

| op | 业务字段 | 说明 |
|---|---|---|
| `nova:gov:propose` | ptype(`param`/`fund`/`upgrade`/`arb`), title, description, 及分类型字段（见下） | 需权益 ≥1000 或 100 人联署 |
| `nova:gov:endorse` | proposal_id | 公示期联署 |
| `nova:gov:vote` | proposal_id, support(bool) | 1 NOVA = 1 票（含质押/锁仓） |
| `nova:gov:delegate` | to | 投票权委托 |
| `nova:gov:confirm` | proposal_id | 基金支出 3/5 节点多签 |
| `nova:gov:execute` / `nova:gov:cancel` | proposal_id | 时间锁 48h 后自动执行 |

提案分类型字段：param=`{target(economy/dex/bridge/arbitration), key, value}`；fund=`{recipient, amount}`；upgrade=`{upgrade_height, content}`；arb=`{key, value}`。

查询：
- `GET /api/gov/summary`：提案数、进行中/通过/已执行、流通量与 quorum。
- `GET /api/gov/proposals?status=discussion|voting|passed|rejected|executed`：提案列表。
- `GET /api/gov/proposals/{pid}`：提案详情（赞成/反对、投票率、时间锁）。
- `GET /api/gov/power/{addr}`：投票权与委托 `{voting_power, delegate}`。

## 十二、DID 与声誉 / DID & Reputation

统一入口 `POST /api/did/op`。

| op | 业务字段 | 说明 |
|---|---|---|
| `nova:did:bind` | kind(`email`/`telegram`/`x`/`avatar`), hash（sha3-512 哈希，avatar 可为 CID）, visible | 只存哈希 |
| `nova:did:unbind` | kind | 随时撤销 |
| `nova:did:apply` | portfolio（本人部署的合约地址列表）, statement | 创作者认证申请 |
| `nova:did:vote` | applicant, support(bool) | 社区投票审核 |
| `nova:did:update` | - | 更新资料 |

查询：
- `GET /api/did/summary`：注册数、认证数、平均声誉。
- `GET /api/did/{addr}?viewer={addr}`：DID 资料（隐私：隐藏项仅本人可见）。
- `GET /api/did/reputation/{addr}?viewer={addr}`：声誉分四维明细（创作质量 30% / 社区贡献 25% / 资产稳定 25% / 身份完整 20%，初始 50，满分 100；详情仅本人可见）。

## 十三、链浏览器 / Explorer & Indexer

索引器独立服务启动：`python -m explorer --node-url http://127.0.0.1:8080 --db sqlite:///explorer.db`。

- `GET /api/chain/sync?after_height={h}`：增量同步（新区块、交易、合约部署、全网统计），SDK `NovaEvents` 轮询用。
- `GET /api/chain/block/{height}`：区块详情（交易数、时间戳、前一区块哈希）。
- `GET /api/chain/search?q={query}`：搜索交易/地址/合约/区块（≥8 hex 或数字），即时下拉用。
- `GET /api/chain/stats`：`{height, total_txs, total_addresses, total_contracts, total_staked}`。
- 索引器 GraphQL：`POST /graphql`（查询 `blocks`/`transactions`/`contracts`/`addresses`，分页 `limit`/`offset`，1 分钟结果缓存）。

## 十四、测试网水龙头 / Testnet Faucet

水龙头为测试网专用服务（节点以 `--faucet` 启动时开放，主网自动关闭），从资金池向地址发放测试 NOVA，用于开发者调试合约与生态功能体验。

### `GET /api/faucet/status` — 水龙头状态 / Faucet status

返回资金池余额、单次领取量、今日已发放、限频参数与累计统计。

```json
{ "enabled": true, "pool_balance": 1000000, "amount": 100,
  "today": { "date": "2026-08-16", "count": 3, "amount": 300 },
  "daily_cap": 20000, "daily_ip_cap": 2, "cooldown_seconds": 86400,
  "total_claimed": 12300, "total_recipients": 123 }
```

### `POST /api/faucet/request` — 领取测试币 / Claim test NOVA

请求体（无需签名）：`{ "addr": "0x...", "fingerprint": "可选设备指纹" }`。

限频规则：同一地址每 24 小时限领 1 次 ｜ 同一 IP 每日最多 2 次 ｜ 每日全网发放上限 `daily_cap`。成功响应：

```json
{ "status": "领取成功", "amount": 100, "addr": "0x...", "balance": 100,
  "receipt": "faucet-34d17977ed5e48d8", "remaining_today": 19700 }
```

SDK 用法：

```js
const faucet = new sdk.NovaFaucet('http://127.0.0.1:8080');
await faucet.status();                         // 查询状态
await faucet.request('0x...', 'device-fp');    // 领取测试 NOVA
```

## 十五、社交 / 存储 / 算力 / AI / 聊天 / 其他

| 分类 | 接口 |
|---|---|
| 社交 SocialFi | `POST /api/op`（`nova:fan:*` 粉丝代币、`nova:revenue:*` 收益分账、`nova:achievement:*` 成就、`nova:market:*` 预测市场、`nova:blindbox:*` 盲盒、`nova:curation:*` 策展、`nova:graph:*` 图谱、`nova:bond:*` 债券、`nova:fraction:*` 碎片化 NFT）；`GET /api/socialfi/{domain}` 读取各域数据 |
| 存储 Storage | `POST /api/storage/register|pin|claim|proof|order`；`GET /api/storage/pins|providers|orders|events`；`GET /api/storage/status/{file_hash}`；`GET /api/storage/creator/{addr}` |
| 存储激励 Incentive | `POST /api/storage/inc/file|claim|prove|heartbeat|upgrade|exit|settle|protect|reassign|access|reupload`；`GET /api/storage/inc/summary`；`GET /api/storage/nodes/{addr}/challenge|revenue` |
| 算力 Compute | `POST /api/compute/publish|accept|submit|register`；`GET /api/compute/tasks|nodes|overview|events`；`GET /api/compute/node/{addr}`；`GET /api/compute/income/{addr}` |
| AI | `POST /api/op`（`nova:ai:*` 注册/创作/基金/审批）；`GET /api/ai|/api/ai/{addr}|/api/ai/services|/api/ai/works|/api/ai/fund|/api/ai/status` |
| 聊天 Chat | `POST /api/chat/pubkey|send|ack`；`GET /api/chat/pubkey/{addr}`、`GET /api/chat/inbox/{addr}` |
| 预售 Presale | `POST /api/presale/bind`：`{nova_address, nova_public_key, bsc_address, signature}`，签名消息 `BIND_PRESALE:{bsc_address}` |

以上写接口的签名消息各不相同，请以各模块 `validate_op` 为准；SDK（`@nova/sdk`）已封装核心模块，建议优先使用。

## 十六、SDK 模块速查 / SDK Cheat Sheet

```js
const sdk = require('./sdk/nova-sdk-open.js');   // 或 <script src> 后 window.NovaSDK
const wallet = await sdk.NovaWallet.create({ nodeUrl: 'http://127.0.0.1:8080' });

new sdk.NovaContract(wallet).deploy(bytecode, wallet.getAddress());   // 部署合约
new sdk.NovaContent(wallet).publish({ title, content, price, visibility: 'sealed', cipher_cid, key_cipher });
new sdk.NovaContent(wallet).search('歌');                              // 搜索内容
new sdk.NovaStaking(wallet).stake(100);                                // 质押
new sdk.NovaSubscription(wallet).subscribe(creator, 'basic', { autoRenew: true, amount: 5 });
new sdk.NovaOracle(wallet).requestVrf('盲盒 #1');                      // VRF 随机数
new sdk.NovaOracle(wallet).updatePrice('USDT/USD', 'pyth', 1.0001);    // 价格上报（节点）
new sdk.NovaBridge(wallet).withdraw('NOVA', 'BSC', '0x...', 10);       // 跨出
new sdk.NovaDex(wallet).swap('NOVA/USDT', 100, 0);                     // 兑换（默认 5% 滑点保护）
new sdk.NovaGovernance(wallet).propose({ ptype: 'param', title: '...', target: 'economy', key: 'MIN_STAKE', value: 100 });
new sdk.NovaDID(wallet).bind('email', sha3Hex, true);                  // 身份绑定
new sdk.NovaChain('http://127.0.0.1:8080').search(addr);               // 浏览器搜索
new sdk.NovaFaucet('http://127.0.0.1:8080').request(addr);              // 水龙头领取测试币

const ev = new sdk.NovaEvents({ nodeUrl: '...', intervalMs: 3000 });
ev.onTx(t => console.log('新交易', t.txid)).onBlock(b => console.log('新块', b.height)).start();
```

## 十七、错误码汇总 / Error Code Summary

| HTTP | 含义 / Meaning | 常见错误体 |
|---|---|---|
| 200 | 成功 Success | 各接口响应 |
| 400 | 参数无效 / 签名或规则校验失败 | `{"error":"交易校验失败（签名/规则）"}`、`{"error":"缺少 addr/data"}`、`{"error":"金额无效"}` |
| 404 | 资源不存在 Not found | `{"error":"not_found"}`、`{"error":"交易不存在或尚未上链"}` |
| 500 | 服务端异常 Server error | - |

SDK 内建错误码：`4100` 未连接钱包、`4001` 参数无效、`-1` RPC 错误（`err.code`）。

## 十八、Swagger 配置说明 / Swagger

- 文件：`docs/api/swagger.yaml`（OpenAPI 3.0）。
- 在线调试：将 `swagger.yaml` 内容粘贴到 [Swagger Editor](https://editor.swagger.io/)，或本地 `npx swagger-cli bundle swagger.yaml` 校验。
- 请求签名：Swagger UI 无法直接签名，写接口请使用 SDK 或按「签名协议」章节构造签名后填入 `signature` / `sender_public_key`。
- 只读接口（GET）可直接在线测试，返回示例即文档所载。

> 版本 Version: v1.0 · 节点节点 RPC 与索引器 GraphQL 接口保持一致 · 文档自动同步核心模块。
