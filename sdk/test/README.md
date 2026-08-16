# Nova SDK 测试 / Nova SDK Tests

## 加密内核测试（无需节点）/ Crypto core tests (offline)

```bash
node sdk/test/nova-sdk-crypto.test.js
```

覆盖：RFC 8032 Ed25519 向量、BIP39 助记词往返、SLIP-10 派生与钱包页 `wallet-crypto.js` 一致性、签名交易 `signing_data` 格式、P-256 公钥导出、合约地址派生。

## 端到端测试（需要本地节点）/ End-to-end (requires local node)

1. 将 `sdk/test/run_local_node.py` 复制到 `novachain` 仓库根目录（它 import `nova_node`），启动测试节点：

```bash
cd C:\Users\Administrator\novachain
python run_local_node.py        # 端口 18081，预注资测试钱包 20000 NOVA
```

2. 运行测试：

```bash
cd C:\Users\Administrator\novachain-web
node sdk/test/nova-sdk-e2e.js
```

全部通过输出 `PASS=33 FAIL=0`（含水龙头 3 项）。水龙头用例需要本地节点以 `--faucet`（`run_local_node.py` 已默认开启）启动。