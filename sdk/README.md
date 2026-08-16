# @nova/sdk

Nova 娱乐链官方 JavaScript SDK —— 零依赖、UMD 风格，浏览器 `<script>` 与 Node.js / 打包器通用。

## 安装

```bash
npm install @nova/sdk
```

## 快速开始

```js
import { NovaWallet, NovaContent, NovaStaking } from '@nova/sdk';

const wallet = await NovaWallet.create({ nodeUrl: 'https://rpc.nova.chain' });
const content = new NovaContent(wallet);
await content.publish({
  title: '我的第一首歌',
  body: '加密正文...',
  price: 10
});

const staking = new NovaStaking(wallet);
await staking.stake(100);
```

## 模块

| 模块 | 类 | 说明 |
| --- | --- | --- |
| 钱包 | `NovaWallet` | 创建/导入钱包、BIP39 助记词、SLIP-10 派生、Ed25519/P-256 签名、发送交易 |
| 合约 | `NovaContract` | 部署合约、调用方法、查询状态 |
| 内容交易 | `NovaContent` | 发布密文、搜索、购买、下架 |
| 质押激励 | `NovaStaking` | 质押、解质押、签到、奖励查询 |
| 订阅会员 | `NovaSubscription` | 按月/永久/分档订阅、自动续费 |
| 预言机 | `NovaOracle` | VRF 随机数、多源价格、AI 生成结果验证 |
| 跨链桥 | `NovaBridge` | 跨入铸造、跨出销毁、多签节点 |
| DEX | `NovaDex` | AMM 兑换、流动性、流动性挖矿 |
| 治理 | `NovaGovernance` | 提案、投票、委托、时间锁 |
| DID | `NovaDID` | 身份绑定、创作者认证、声誉分 |
| 链浏览器 | `NovaChain` | 区块/交易/搜索查询 |
| 事件 | `NovaEvents` | 交易确认、合约事件、区块轮询 |
| 水龙头 | `NovaFaucet` | 测试网免费领取测试 NOVA |

## 浏览器直接使用

```html
<script src="https://unpkg.com/@nova/sdk"></script>
<script>
  const wallet = await NovaSDK.NovaWallet.fromMnemonic('...', { nodeUrl: 'https://rpc.nova.chain' });
</script>
```

## 运行测试

```bash
# 离线加密内核测试
node test/nova-sdk-crypto.test.js

# 端到端上链测试（先启动本地测试节点：python sdk/test/run_local_node.py）
node test/nova-sdk-e2e.js
```

## License

MIT
