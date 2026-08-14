/* wallet-crypto.js 单元测试（Node 20+）
 * 运行: node scripts/test-wallet-crypto.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../wallet-crypto.js');
const N = globalThis.NovaCrypto;

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

console.log('词表: ' + (N.wordCount === 2048 ? '已注入 (' + N.wordCount + ')' : '未注入 (' + N.wordCount + ') 部分测试将跳过'));

// ---- 基础工具 ----
check('base64 往返', () => {
    const b = N.randomBytes(32);
    eq(N.bytesToHex(N.base64ToBytes(N.bytesToBase64(b))), N.bytesToHex(b), 'b64');
    eq(N.bytesToHex(N.base64urlToBytes(N.bytesToBase64url(b))), N.bytesToHex(b), 'b64url');
});

// ---- AES-GCM ----
await checkAsync('AES-256-GCM 加解密往返', async () => {
    const key = N.randomBytes(32);
    const box = await N.aesGcmEncrypt(key, new TextEncoder().encode('hello nova'));
    const pt = await N.aesGcmDecrypt(key, box.iv, box.ct);
    eq(new TextDecoder().decode(pt), 'hello nova');
});
await checkAsync('AES-GCM 错误密钥解密失败', async () => {
    const box = await N.aesGcmEncrypt(N.randomBytes(32), new TextEncoder().encode('x'));
    let threw = false;
    try { await N.aesGcmDecrypt(N.randomBytes(32), box.iv, box.ct); } catch (e) { threw = true; }
    assert.ok(threw, '应抛异常');
});

// ---- 密码 KDF + 主密钥包裹 ----
await checkAsync('密码包裹/解包主密钥', async () => {
    const mk = N.randomBytes(32);
    const wrap = await N.wrapWithPassword(mk, 'test-password-123');
    const unwrapped = await N.unwrapWithPassword(wrap, 'test-password-123');
    eq(N.bytesToHex(unwrapped), N.bytesToHex(mk));
    let threw = false;
    try { await N.unwrapWithPassword(wrap, 'wrong'); } catch (e) { threw = true; }
    assert.ok(threw, '错误密码应解密失败');
});

// ---- 保险库账户加密 ----
await checkAsync('账户密钥用主密钥加密', async () => {
    const mk = N.randomBytes(32);
    const wrap = await N.encryptWithMaster(mk, 'abcd1234'.repeat(8));
    const pt = await N.decryptWithMaster(mk, wrap);
    eq(pt, 'abcd1234'.repeat(8));
});

// ---- SLIP-0010 官方主密钥向量 ----
await checkAsync('SLIP-0010 主密钥向量', async () => {
    const seed = N.hexToBytes('000102030405060708090a0b0c0d0e0f');
    const node = await N.deriveEd25519FromPath(seed, 'm');
    eq(N.bytesToHex(node), '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7', '主密钥');
});
await checkAsync('SLIP-0010 m/0\' 向量', async () => {
    const seed = N.hexToBytes('000102030405060708090a0b0c0d0e0f');
    const node = await N.deriveEd25519FromPath(seed, "m/0'");
    eq(N.bytesToHex(node), '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3', 'm/0\' 密钥');
});
await checkAsync('Nova 路径派生确定性', async () => {
    const seed = N.randomBytes(64);
    const a = await N.deriveEd25519FromPath(seed, N.NOVA_DERIVATION_PATH);
    const b = await N.deriveEd25519FromPath(seed, N.NOVA_DERIVATION_PATH);
    eq(N.bytesToHex(a), N.bytesToHex(b), '同种子同路径应一致');
});

if (N.wordCount === 2048) {
    // ---- BIP39 官方测试向量 ----
    const vectors = [
        ['00000000000000000000000000000000', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'],
        ['7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', 'legal winner thank year wave sausage worth useful legal winner thank yellow'],
        ['80808080808080808080808080808080', 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'],
        ['ffffffffffffffffffffffffffffffff', 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong']
    ];
    for (const [ent, mne] of vectors) {
        await checkAsync('BIP39 向量 entropy->mnemonic ' + ent.slice(0, 8) + '…', async () => {
            eq(await N.entropyToMnemonic(N.hexToBytes(ent)), mne);
        });
        await checkAsync('BIP39 向量 mnemonic->entropy ' + mne.slice(0, 12) + '…', async () => {
            eq(N.bytesToHex(await N.mnemonicToEntropy(mne)), ent);
        });
    }
    await checkAsync('BIP39 生成 12 词并通过校验', async () => {
        const m = await N.generateMnemonic(128);
        eq(m.trim().split(/\s+/).length, 12);
        assert.ok(await N.validateMnemonic(m), '应通过校验');
    });
    await checkAsync('BIP39 篡改单词校验失败（确定性）', async () => {
        // 已知合法向量：末尾约是 about；把末词改成 abandon 必然破坏校验和
        const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(' ');
        words[11] = 'abandon';
        assert.ok(!(await N.validateMnemonic(words.join(' '))), '篡改末词后应失败');
        assert.ok(!(await N.validateMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo')), 'zoo x12 应失败');
    });
    await checkAsync('BIP39 TREZOR 种子向量', async () => {
        const mne = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
        const seed = await N.mnemonicToSeed(mne, 'TREZOR');
        eq(N.bytesToHex(seed), 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04', 'seed');
    });
} else {
    console.log('  ⚠ 跳过 BIP39 词表相关测试（等待词表注入）');
}

console.log('\n' + (failed ? '❌ ' + failed + ' 失败 / ' + passed + ' 通过' : '✅ 全部通过 (' + passed + ')'));
process.exit(failed ? 1 : 0);

