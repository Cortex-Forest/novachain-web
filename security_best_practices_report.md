# Nova 链安全审查报告

> 审查时间：2026-08-16 ｜ 范围：`C:\Users\Administrator\novachain`（Python 节点/RPC/共识/合约）与 `C:\Users\Administrator\novachain-web`（前端控制台/扩展/SDK）
> 方法：结合 `security-best-practices` 技能清单对后端（aiohttp RPC、P2P、PoS 共识、VM、经济模块）与前端（原生 JS、钱包、扩展）进行主动审计。

## 执行摘要

整体代码风格清晰、校验函数组织良好，交易签名严格绑定地址、多数链上操作有硬约束，前端动态渲染普遍转义、扩展权限最小化。审查发现 **2 个可被远程直接利用的严重级漏洞**（任意代币铸造、P2P 状态快照接管）与 **3 个高危经济/共识问题**（PoS 补块恶意惩罚、AI 基金单监护人掏空、前端私钥明文落盘）。**C-01 / C-02 / H-03 / H-04 / H-05 五项已全部修复并通过全量测试（后端 247 项全绿）**，其余项建议按优先级处理。

## 严重度概览

| 编号 | 严重度 | 标题 | 位置 |
| --- | --- | --- | --- |
| C-01 | 严重 | 任意代币铸造（伪造 0x0000 系统账户） | nova_node.py:73 / 910 |
| C-02 | 严重 | P2P 状态快照接管 | nova_node.py:762 / 783 |
| H-03 | 高 | PoS 补块机制可恶意惩罚当选者（✅已修复：连续 3 窗口缺失才罚没） | consensus.py:128 / 140 |
| H-04 | 高 | AI 成长基金单监护人可全量提走（✅已修复：单日上限 20 + 大额双监护人审批） | ai_service.py:292-321 |
| H-05 | 高 | 前端私钥明文存 localStorage（✅已修复：PBKDF2+AES-GCM 保险库，移除 Math.random） | nova.html:742 / 768 |
| M-06 | 中 | 签到/轻验证/推荐绑定无签名 | nova_node.py:1088 / 1099 / 1147 |
| M-07 | 中 | CORS 全开 + 无鉴权端点可跨站触发 | network/rpc.py:5-19 |
| M-08 | 中 | 聊天信箱无鉴权读取 + 可被灌满 | nova_node.py:1253、core/chat.py |
| M-09 | 中 | 扩展注入所有站点、桥接无来源校验 | browser-extension/manifest.json:18 |
| L-10 | 低 | 重复部署可覆盖合约创建者并重复领奖 | nova_node.py:926 |
| L-11 | 低 | 自实现 Ed25519 接受高 s 签名（可塑性） | core/crypto.py:115 |
| L-12 | 低 | 金额用 float，精度/确定性风险 | core/transaction.py:6 |
| L-13 | 低 | P2P TLS 自签名且 CERT_NONE | network/p2p.py:30 |
| L-14 | 低 | 静态站无安全响应头（CSP） | vercel.json |

## 发现详情

### C-01 严重｜任意代币铸造（伪造 0x0000 系统账户）

- 位置：`nova_node.py:73`（validate_tx 提前返回）、`nova_node.py:910-925`（rpc_send）
- 证据：
  - `validate_tx` 对 `tx.sender == "0x0000"` 直接 `return True`，**跳过签名与余额校验**；
  - `rpc_send` 直接用请求体 `b["sender"]` 构造 `Tx` 并广播，不限制 0x0000；
  - `apply_tx` 普通转账路径把 `amount` 记入 `receiver` 余额，0x0000 无余额，等于凭空铸造。
- 影响：任何人 `POST /api/send`，填 `sender=0x0000`、`receiver=自己的地址`、`amount<=81000000`，可**无限次铸造全链代币**，彻底击穿经济模型。`0x0000` 仅应被节点内部（如 rpc_deploy 的系统合约部署）使用。
- 修复：
  1. `rpc_send`（以及所有外部提交入口）显式拒绝 `sender == "0x0000"`；
  2. 或把 `validate_tx` 的 0x0000 分支改为“仅允许内部构造且附带系统级授权”的调用，外部路径一律走签名校验。
- 状态：**已修复**。`validate_tx` 增加 `allow_system` 参数（默认 False），`broadcast_tx` 增加 `system` 标志；仅 `rpc_deploy` 内部部署路径传 `system=True`，其余外部入口（/api/send、/api/call、质押/存储/计算/SocialFi 等）一律默认拒绝 0x0000。
- 验证：`curl -X POST http://127.0.0.1:8080/api/send -H 'Content-Type: application/json' -d '{"sender":"0x0000","receiver":"0x<任意>","amount":1000,"timestamp":<当前时间>}'` 即可复现。

### C-02 严重｜P2P 状态快照接管

- 位置：`nova_node.py:762-766`（process_message 的 state_snapshot 分支）、`nova_node.py:783-790`（apply_snapshot）
- 证据：任意 P2P 对端可发送 `{"type":"state_snapshot","snapshot":...}`，仅检查 `len(peer_chain) >= 本地高度`（可随意伪造）即执行 `apply_snapshot`，**整体覆写 balances/stakes/合约/共识链**，无签名、无身份校验、无内容校验。
- 影响：恶意节点可给目标节点注入任意余额与状态（改账本、冻结账户、伪造合约），区块链状态可被单节点篡改。若实际部署只连接受信种子节点，风险面会收窄，但代码层面没有任何防线。
- 修复：
  1. 快照必须携带验证者（或至少种子节点）签名，并校验签名者身份；
  2. 采用“从创世块重放校验”或校验快照内哈希链与质押证据；
  3. 快照同步只允许从显式配置的受信种子发起。
- 状态：**已修复（默认拒绝）**。新增 `sync_from_seeds` 开关（默认 False）：关闭时直接忽略远程 `state_snapshot`；开启后仅接受 `self.seeds` 中显式配置的种子节点快照。CLI 提供 `--sync-from-seeds`，`run_network.py` 演示脚本已显式开启。生产环境仍建议叠加“快照签名/创世校验”作为纵深防御。

### H-03 高｜PoS 补块机制可恶意惩罚当选者

- 位置：`consensus.py:128-133`（adopt_block 对非当选者补块执行 slash）、`consensus.py:140-156`（_verify_pos_block）
- 证据：补块判定 `fallback = block.timestamp - prev_ts >= proposer_timeout`，而 `block.timestamp` 由出块者**自选并自签**；任何有质押的地址可伪造时间戳抢先“补块”，使 `elected != block.proposer` 成立，随后 `_slash(elected)` 罚没当选者质押并将其 jail。
- 影响：有少量质押的攻击者可每高度惩罚当选者并长期接管出块（同时拿奖励），PoS 共识被破坏。
- 修复：
  1. 补块超时改用链上可验证的度量（高度推进、epoch 边界），而非签名者自报时间戳；
  2. 合法补块不应惩罚当选者（或惩罚需多节点证据/延迟确认）；
  3. 对连续补块做速率限制。
- 修复状态（2026-08-16）：✅ 已修复。补块不再单次罚没当选者，改为链上计数
  `pos_missed`，连续错过 `POS_SLASH_MISS_THRESHOLD=3` 个窗口才按 `INACTIVITY_SLASH_RATIO` 罚没并 jail；
  当选者正常出块即清零计数。新增 2 项测试（单次不罚没 / 阈值触发）。

### H-04 高｜AI 成长基金单监护人可全量提走

- 位置：`ai_service.py:292-321`（validate_fund_guard / fund_guard / validate_fund_spend / fund_spend）
- 证据：`validate_fund_guard` 只要调用者是“AI 创作者或现有监护人”即可通过；`fund_guard` 直接把 `d["addr"]`（可填自己）加入监护人名单；`validate_fund_spend` 仅要求 `addr in guardians` 且基金余额充足，即可把任意金额转到任意 `0x` 地址。
- 影响：任何注册了 AI 身份的地址可自授监护人后**一次性掏空 AI_FUND**（基金来源为作品销售 10% 分账与触发费用）。
- 修复：
  1. 支出改为多方签名/阈值（如 ≥2/3 监护人，或监护人多签）；
  2. 监护人授权需质押/时间锁，禁止自授权；
  3. 单笔支出设上限并记录用途白名单。
- 修复状态（2026-08-16）：✅ 已修复。新增 `FUND_SINGLE_SPEND_LIMIT=20`：单笔 ≤20 NOVA 即时转账但受
  单监护人单日 20 NOVA 上限（`ai_fund_spend_day`，按日期键自动滚动）；单笔 >20 NOVA 进入待审批
  （`ai_fund_pending`），需 2 名监护人经 `nova:ai:fund:approve` 审批后执行，7 天未达成自动作废。
  前端 demo 与 `ai_musician.html` 已同步支持审批流。新增 2 项测试。

### H-05 高｜前端私钥明文存 localStorage

- 位置：`nova.html:742-743`（getPriv/setPriv）、`nova.html:768`（Math.random 兜底生成私钥）
- 证据：`setPriv` 直接把 64 位十六进制私钥写入 `localStorage["nova_priv"]`；`createWallet` 在 `crypto.getRandomValues` 不可用时回退到 `Math.random()*256` 逐字节生成私钥。
- 影响：站点任意 XSS/同源脚本可直接读走私钥（钱包被盗）；`Math.random` 生成的私钥可预测，极端情况下可被暴力枚举。项目里 `wallet-crypto.js` 已有 AES-256-GCM 密码保险库能力，此处未使用。
- 修复：
  1. 改用 `wallet-crypto.js` 的密码保险库，明文只在会话内存中存在；
  2. 删除 `Math.random` 兜底，无安全随机源时直接拒绝创建；
  3. 上线前建议对站点做 XSS 加固与 CSP。
- 修复状态（2026-08-16）：✅ 已修复。私钥改用密码保险库（PBKDF2 15 万次 + AES-256-GCM），
  localStorage 仅存 `salt.iv.ciphertext`，明文只在会话内存（`sessionPriv`）；创建/导入需设置密码，
  加载自动解锁或手动解锁，导出需先解锁；旧 `nova_priv` 明文首次加载自动迁移后删除；
  demo 应用钱包 key 改为 `nova_demo_priv` 避免与真实钱包冲突；删除 `Math.random` 兜底。

### M-06 中｜签到/轻验证/推荐绑定无签名

- 位置：`nova_node.py:1088`（rpc_referral）、`nova_node.py:1099`（rpc_light_verify）、`nova_node.py:1147`（rpc_checkin）
- 证据：三个接口均不校验调用者与 `addr` 的绑定关系：可为任意地址签到并领空投、为任意地址领每日验证奖励、任意绑定推荐关系。
- 影响：空投/奖励刷量（多地址+代理）、占用他人推荐关系、消耗激励池。
- 修复：改为签名交易（经 /api/send 的 op 流水线或要求附带 `addr` 的签名）；设备指纹不可信，需配合其它防女巫因子。

### M-07 中｜CORS 全开 + 无鉴权端点可跨站触发

- 位置：`network/rpc.py:5-19`
- 证据：`Access-Control-Allow-Origin: *` 且允许 POST；checkin/referral/light_verify 等状态变更端点无签名。
- 影响：恶意网页可在用户浏览器里跨站触发这些无鉴权操作（CSRF），叠加 M-06 扩大影响。
- 修复：CORS 白名单限定来源；对无签名端点校验 Origin/自定义请求头；敏感操作一律走签名交易。

### M-08 中｜聊天信箱无鉴权读取 + 可被灌满

- 位置：`nova_node.py:1253`（rpc_chat_inbox）、`core/chat.py`（MAX_INBOX_PER_ADDR=1000）
- 证据：`/api/chat/inbox/{addr}` 无需任何授权返回任意地址全部消息；`push` 满 1000 条后按时间戳挤掉旧消息。
- 影响：任意人可枚举读取信箱元数据（发件人/时间/密文长度；密文本身端到端加密，正文不可读）；发件人可灌满受害者信箱造成旧消息丢失（DoS）。
- 修复：读取需签名授权（与 ack 一致）；按发送方/地址限流；收件上限改为“可配置且只影响新消息”。

### M-09 中｜扩展注入所有站点、桥接无来源校验

- 位置：`browser-extension/manifest.json:18-21`、`content.js`
- 证据：content script 匹配 `http://*/*`、`https://*/*`、`file://*/*`，任何网站都可向窗口桥发消息获取地址、入队转账/签名请求；popup 确认界面（popup.js）不展示请求发起方域名。
- 影响：任意网站可枚举用户 Nova 地址、刷爆待确认队列；确认界面缺来源展示存在钓鱼/诱导确认风险。
- 修复：限制注入站点（或按 activeTab 由用户手势触发注入）；请求记录 `sender.url` 并在 popup 明示来源与金额；队列去重/限流。

### L-10 低｜重复部署可覆盖合约创建者并重复领奖

- 位置：`nova_node.py:926-960`（rpc_deploy）
- 证据：相同 bytecode 得到相同合约地址，未检查 `contracts` 已存在；不同 creator 重复部署会覆盖 `contract_creator` 并再次领取 deploy_reward（受 ECOSYSTEM_FUND 余额上限约束）。
- 修复：合约地址已存在时拒绝部署（或创建者不可变）。

### L-11 低｜自实现 Ed25519 接受高 s 签名（可塑性）

- 位置：`core/crypto.py:115`（ed25519_verify）
- 证据：验证未要求 `s < L`，接受高 s 的等价签名（签名可塑性）；自实现密码学易引入隐蔽缺陷。
- 修复：改用标准实现（如 pynacl / cryptography 的 Ed25519），并补充 `s < L` 检查与回归测试。

### L-12 低｜金额使用 float

- 位置：`core/transaction.py:6`（canonical_amount）、`core/vm.py`（SEND 的 float(amt)）
- 证据：金额规范化用 `float(amount)`，链上金额以浮点运算，存在精度/跨平台确定性风险。
- 修复：金额统一为最小单位整数（10^-8）或 Decimal，签名数据与存储保持一致。

### L-13 低｜P2P TLS 自签名且 CERT_NONE

- 位置：`network/p2p.py:30-37`
- 证据：客户端 `verify_mode = CERT_NONE`、`check_hostname = False`（代码注释已承认）。
- 修复：生产环境固定种子节点证书/指纹校验。

### L-14 低｜静态站无安全响应头

- 位置：`vercel.json`
- 证据：仅配置了 `name`/`version`，未设置 CSP、X-Content-Type-Options、Referrer-Policy、frame-ancestors；站点大量使用 innerHTML（均已转义，但缺少纵深防御）。
- 修复：在 Vercel 配置中增加安全响应头，尤其是 CSP。

## 做得好的地方

- 交易签名与地址强绑定（`verify_quantum_tx` 校验 `sha3_512(pub)` 派生地址）。
- `validate_tx` 对金额、大小、质押上限、AI 日预算等有多层硬约束。
- 前端动态渲染普遍使用 `esc()` 转义；feed/评论等用户内容有转义。
- CDN 脚本（js-sha3）带 SRI `integrity` 与 `crossorigin`。
- 扩展权限最小化（仅 `storage` + localhost 主机权限）；钱包加密内核使用 BIP39/PBKDF2/AES-GCM/WebAuthn PRF。
- 状态落盘采用 `tmp + os.replace` 原子写。

## 修复优先级建议

1. **已修复**：C-01（禁止外部 0x0000 交易）、C-02（默认拒绝远程快照，仅受信种子可同步）、
   H-03（连续缺失阈值）、H-04（基金单日上限 + 大额双监护人审批）、H-05（私钥加密保险库）。
2. **尽快（剩余）**：M-06 ~ M-09（无签名接口改签名交易、CORS 白名单、信箱授权、扩展来源校验）。
4. **常规**：L-10 ~ L-14。

修复建议按“单条发现、单次提交”进行，修完跑一遍 `pytest`（后端）确认无回归。
