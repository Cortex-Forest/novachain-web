/* wallet-evm.js 单元测试（Node 20+）
 * 运行: node scripts/test-wallet-evm.mjs
 * 覆盖：Keccak-256 / secp256k1 / ECDSA / BIP32 / EVM 地址（EIP-55）
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../wallet-crypto.js');
require('../wallet-evm.js');
const N = globalThis.NovaCrypto;
const E = globalThis.NovaEVM;

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('  ✔ ' + name); }
    catch (e) { failed++; console.error('  ✘ ' + name + '\n    ' + e.message); }
}
async function checkAsync(name, fn) {
    try { await fn(); passed++; console.log('  ✔ ' + name); }
    catch (e) { failed++; console.error('  ✘ ' + name + '\n    ' + e.message); }
}
function eq(actual, expected, label) {
    assert.equal(actual, expected, (label || '') + ' 期望 ' + expected + ' 实际 ' + actual);
}
const utf8 = (s) => new TextEncoder().encode(s);

// ---- Keccak-256 官方向量 ----
check('Keccak-256 空字符串', () => {
    eq(E.bytesToHex(E.keccak256(utf8(''))), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', '空');
});
check('Keccak-256 abc', () => {
    eq(E.bytesToHex(E.keccak256(utf8('abc'))), '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45', 'abc');
});
check('Keccak-256 长句', () => {
    eq(E.bytesToHex(E.keccak256(utf8('The quick brown fox jumps over the lazy dog'))),
        '4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15', 'fox');
});

check('Keccak-256 多块（136/200/4096 字节，Python 参考交叉值）', () => {
    const mk = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256);
    eq(E.bytesToHex(E.keccak256(mk(136))), '742061bcad767ed4c4f5883b1dcb1aad11afdcc140dc469d953759b127b9f9ed', 'n=136');
    eq(E.bytesToHex(E.keccak256(mk(200))), '66d2cdf3ab4c5bd3c75add9b60b14ac5b7789534fa2da3f348853b847359a3a0', 'n=200');
    eq(E.bytesToHex(E.keccak256(mk(4096))), '76295a231bfe3ebd9c161d54151579ec47d822a168c11d53ed0471b01ce83520', 'n=4096');
});

// ---- secp256k1 基础 ----
check('G * n = 无穷远点', () => {
    const G = { X: E.SECP_GX, Y: E.SECP_GY };
    const R = E.pointScalarMult(G, E.SECP_N);
    assert.equal(R.Z, 0n, 'G*n 应为无穷远点 (Z=0)');
});
check('G * (n-1) 与 G * 1 互为 y 对称', () => {
    const pub1 = E.secpPubkey(E.hexToBytes('01'), false);
    const pubNm1 = E.secpPubkey(E.hexToBytes('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140'), false);
    eq(E.bytesToHex(pub1.slice(1, 33)), E.bytesToHex(pubNm1.slice(1, 33)), 'x 应相同');
    const y1 = E.bytesToBigInt(pub1.slice(33)), y2 = E.bytesToBigInt(pubNm1.slice(33));
    eq(y1 + y2, E.SECP_P, 'y 应互为相反数');
});

// ---- 已知私钥 → 地址（Hardhat 标准账户 0） ----
const HH0_PRIV = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const HH0_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
check('私钥 → EVM 地址（未压缩公钥）', () => {
    eq(E.privateKeyToAddress(E.hexToBytes(HH0_PRIV)).toLowerCase(), HH0_ADDR.toLowerCase(), 'addr');
});
check('EIP-55 校验和地址（小写输入）', () => {
    eq(E.toChecksumAddress(HH0_ADDR.toLowerCase()), HH0_ADDR, 'checksum');
});
check('压缩公钥解压后地址一致', () => {
    const pubC = E.secpPubkey(E.hexToBytes(HH0_PRIV), true);
    eq(E.pubkeyToAddress(pubC).toLowerCase(), HH0_ADDR.toLowerCase(), 'compressed addr');
});

// ---- ECDSA 签名 / 验签 ----
await checkAsync('ECDSA 签名-验签往返 + 确定性', async () => {
    const d = E.hexToBytes(HH0_PRIV);
    const h = E.keccak256(utf8('hello nova wallet'));
    const sig1 = await E.ecdsaSign(d, h);
    const sig2 = await E.ecdsaSign(d, h);
    eq(E.bytesToHex(sig1.r), E.bytesToHex(sig2.r), 'r 确定性');
    eq(E.bytesToHex(sig1.s), E.bytesToHex(sig2.s), 's 确定性');
    assert.ok(sig1.v === 27 || sig1.v === 28, 'v 应为 27/28，实际 ' + sig1.v);
    assert.ok(sig1.signature.length === 65, '签名应为 65 字节');
    const pub = E.secpPubkey(d, false);
    assert.ok(E.ecdsaVerify(pub, h, sig1.r, sig1.s), '验签应通过');
    assert.ok(E.ecdsaVerify(E.secpPubkey(d, true), h, sig1.r, sig1.s), '压缩公钥验签应通过');
    const h2 = E.keccak256(utf8('tampered'));
    assert.ok(!E.ecdsaVerify(pub, h2, sig1.r, sig1.s), '篡改消息后验签应失败');
});
await checkAsync('RFC6979 签名（私钥 1 + keccak("")）范围与低 s', async () => {
    const d = E.hexToBytes('01');
    const h = E.keccak256(utf8(''));
    const sig = await E.ecdsaSign(d, h);
    eq(sig.r.length, 32, 'r 长度');
    eq(sig.s.length, 32, 's 长度');
    const r = E.bytesToBigInt(sig.r), s = E.bytesToBigInt(sig.s);
    assert.ok(r > 0n && r < E.SECP_N, 'r 范围');
    assert.ok(s > 0n && s < E.SECP_N, 's 范围');
    assert.ok(s <= E.SECP_N / 2n, '低 s 规范化');
    assert.ok(E.ecdsaVerify(E.secpPubkey(d, false), h, sig.r, sig.s), '自验签');
    // 记录向量供 Python 交叉验证（运行时输出）
    console.log('    r=' + E.bytesToHex(sig.r));
    console.log('    s=' + E.bytesToHex(sig.s));
});

// ---- RLP + EIP-155 传统交易签名（以太坊黄皮书经典向量） ----
await checkAsync('EIP-155 交易签名（黄皮书向量）', async () => {
    const d = E.hexToBytes('4646464646464646464646464646464646464646464646464646464646464646');
    const tx = {
        nonce: 9n,
        gasPrice: 20000000000n,
        gasLimit: 21000n,
        to: '0x3535353535353535353535353535353535353535',
        value: 1000000000000000000n,
        data: new Uint8Array(),
        chainId: 1
    };
    const s = await E.signLegacyEvmTx(tx, d);
    eq(s.hash, '0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53', '签名哈希');
    eq(s.r, '28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276', 'r');
    eq(s.s, '67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83', 's');
    eq(String(s.v), '37', 'v (chainId*2+35+recid)');
    eq(s.raw, '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83', 'raw tx');
});

// ---- 合约调用解析（27） ----
check('函数选择器（keccak 前 4 字节）', () => {
    eq(E.functionSelector('transfer(address,uint256)'), '0xa9059cbb', 'transfer');
    eq(E.functionSelector('approve(address,uint256)'), '0x095ea7b3', 'approve');
    eq(E.functionSelector('transferFrom(address,address,uint256)'), '0x23b872dd', 'transferFrom');
    eq(E.functionSelector('balanceOf(address)'), '0x70a08231', 'balanceOf');
    eq(E.functionSelector('safeTransferFrom(address,address,uint256)'), '0x42842e0e', 'safeTransferFrom');
    eq(E.functionSelector('deposit()'), '0xd0e30db0', 'deposit');
});
check('decodeCalldata：ERC20 transfer', () => {
    const data = '0xa9059cbb' + '0000000000000000000000001234567890abcdef1234567890abcdef12345678' + '00000000000000000000000000000000000000000000000000000000000f4240';
    const d = E.decodeCalldata(data);
    eq(d.signature, 'transfer(address,uint256)', 'sig');
    eq(d.args[0], '0x1234567890abcdef1234567890abcdef12345678', 'to');
    eq(d.args[1], '1000000', 'amount');
});
check('decodeCalldata：approve', () => {
    const data = '0x095ea7b3' + '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' + 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const d = E.decodeCalldata(data);
    eq(d.signature, 'approve(address,uint256)', 'sig');
    eq(d.args[0], '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'spender');
    eq(d.args[1], '115792089237316195423570985008687907853269984665640564039457584007913129639935', 'max uint');
});
check('decodeCalldata：未知选择器提示谨慎', () => {
    const d = E.decodeCalldata('0x12345678' + '00'.repeat(32));
    assert.ok(d.signature.includes('未收录'), d.signature);
});
check('decodeCalldata：空数据为普通转账', () => {
    const d = E.decodeCalldata('');
    assert.ok(d.signature.includes('普通转账'), d.signature);
});

// ---- BIP32 / BIP44 派生（Hardhat 标准账户） ----
if (N.wordCount === 2048) {
    await checkAsync('BIP32 主密钥向量（BIP32 规范 Vector 1）', async () => {
        const seed = E.hexToBytes('000102030405060708090a0b0c0d0e0f');
        const node = await E.bip32Master(seed);
        eq(E.bytesToHex(node.key), 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35', 'master key');
        eq(E.bytesToHex(node.chainCode), '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508', 'chain code');
    });
    await checkAsync('BIP32 m/0\' 向量（BIP32 规范 Vector 1）', async () => {
        const seed = E.hexToBytes('000102030405060708090a0b0c0d0e0f');
        const node = await E.deriveBip32Path(seed, "m/0'");
        eq(E.bytesToHex(node.key), 'edb2e14f9ee77d26dd93b4ecede8d16ed408ce149b6cd80b0715a2d911a0afea', 'm/0\' key');
        eq(E.bytesToHex(node.chainCode), '47fdacbd0f1097043b78c63c20c34ef4ed9a111d980047ad16282c7ae6236141', 'chain code');
    });
    await checkAsync('BIP44 EVM 路径派生 = Hardhat 账户 0', async () => {
        const mne = 'test test test test test test test test test test test junk';
        const seed = await N.mnemonicToSeed(mne, '');
        const priv = await E.deriveEvmKey(seed, "m/44'/60'/0'/0/0");
        eq(E.bytesToHex(priv), HH0_PRIV, '派生私钥');
        eq(E.toChecksumAddress(E.privateKeyToAddress(priv)), HH0_ADDR, '派生地址');
    });
    await checkAsync('BIP44 路径索引 0..2 确定性且互不相同', async () => {
        const mne = 'test test test test test test test test test test test junk';
        const seed = await N.mnemonicToSeed(mne, '');
        const k0 = E.bytesToHex(await E.deriveEvmKey(seed, "m/44'/60'/0'/0/0"));
        const k1 = E.bytesToHex(await E.deriveEvmKey(seed, "m/44'/60'/0'/0/1"));
        const k2 = E.bytesToHex(await E.deriveEvmKey(seed, "m/44'/60'/0'/0/2"));
        assert.notEqual(k0, k1, 'k0≠k1');
        assert.notEqual(k1, k2, 'k1≠k2');
    });
} else {
    console.log('  ⚠ 词表未注入，跳过 BIP44 派生测试');
}

console.log('\n' + (failed ? '❌ ' + failed + ' 失败 / ' + passed + ' 通过' : '✅ 全部通过 (' + passed + ')'));
process.exit(failed ? 1 : 0);