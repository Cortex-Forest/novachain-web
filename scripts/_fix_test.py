# -*- coding: utf-8 -*-
import io
p = r"C:\Users\Administrator\novachain-web\scripts\test-wallet-crypto.mjs"
with io.open(p, encoding="utf-8", newline="") as f:
    src = f.read()
old = """    await checkAsync('BIP39 篡改单词校验失败', async () => {
        const m = (await N.generateMnemonic(128)).split(' ');
        m[5] = m[5] === 'abandon' ? 'ability' : 'abandon';
        assert.ok(!(await N.validateMnemonic(m.join(' '))), '篡改后应失败');
    });"""
new = """    await checkAsync('BIP39 篡改单词校验失败（确定性）', async () => {
        // 已知合法向量：末尾约是 about；把末词改成 abandon 必然破坏校验和
        const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(' ');
        words[11] = 'abandon';
        assert.ok(!(await N.validateMnemonic(words.join(' '))), '篡改末词后应失败');
        assert.ok(!(await N.validateMnemonic('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo')), 'zoo x12 应失败');
    });"""
n = src.count(old)
print("matches:", n)
assert n == 1, n
src = src.replace(old, new)
with io.open(p, "w", encoding="utf-8", newline="\n") as f:
    f.write(src)
print("OK")
