// Nova SDK 加密内核测试（离线）：RFC 8032 / BIP39 / SLIP-10 / 签名格式 / P-256 / 合约地址
// 运行：node sdk/test/nova-sdk-crypto.test.js
const sdk = require('../nova-sdk-open.js');
const crypto = require('crypto');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); }
}

(async () => {
  // RFC 8032 Ed25519 test vector 1（空消息）
  const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const pub = sdk.utils.bytesToHex(await sdk.utils.ed25519PublicKey(sdk.utils.hexToBytes(seed)));
  check('Ed25519 公钥符合 RFC8032', pub === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', pub);
  const sig = sdk.utils.bytesToHex(await sdk.utils.ed25519Sign(sdk.utils.hexToBytes(seed), new Uint8Array(0)));
  check('Ed25519 签名符合 RFC8032', sig === 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b', sig);
  check('Ed25519 验签通过', await sdk.utils.ed25519Verify(sdk.utils.hexToBytes(pub), new Uint8Array(0), sdk.utils.hexToBytes(sig)));
  check('Ed25519 篡改验签失败', !(await sdk.utils.ed25519Verify(sdk.utils.hexToBytes(pub), new Uint8Array([1]), sdk.utils.hexToBytes(sig))));

  // BIP39
  const m = await sdk.utils.generateMnemonic(128);
  check('BIP39 12 词', m.split(' ').length === 12);
  check('BIP39 校验和有效', await sdk.utils.validateMnemonic(m));
  const ent = await sdk.utils.mnemonicToEntropy(m);
  check('BIP39 往返一致', (await sdk.utils.entropyToMnemonic(ent)) === m);

  // SLIP-10 与钱包页实现一致性
  global.window = global;
  require('../../wallet-crypto.js');
  const k1 = await sdk.utils.deriveNovaKey(m);
  const k2 = await global.NovaCrypto.deriveNovaKey(m);
  check('SLIP-10 派生与 wallet-crypto.js 一致', k1 === k2, [k1.slice(0, 8), k2.slice(0, 8)]);

  // 钱包与签名格式
  const w = await sdk.NovaWallet.fromMnemonic(m);
  check('钱包地址 0x+40hex', /^0x[0-9a-f]{40}$/.test(w.getAddress()));
  const data = JSON.stringify({ op: 'nova:oracle:node:register', pubkey: '0x' + 'ab'.repeat(64) });
  const tx = await w.signTransaction({ sender: w.address, receiver: w.address, amount: 500, data: data });
  const canonical = sdk.utils.canonicalAmount(500);
  const msg = tx.sender + tx.receiver + canonical + tx.timestamp + '[]' + data + w.pub;
  check('signing_data 验签通过', await w.verifyMessage(msg, tx.signature, w.pub));
  check('canonicalAmount(500)=500', canonical === '500');
  check('canonicalAmount(0.1)=0.1', sdk.utils.canonicalAmount(0.1) === '0.1');
  check('canonicalAmount(0)=0', sdk.utils.canonicalAmount(0) === '0');
  check('签名 64B / 公钥 32B', tx.signature.length === 128 && w.pub.length === 64);

  // P-256 公钥格式（密文购买 buyer_pub）
  const kp = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', kp.publicKey));
  const p256 = sdk.utils.bytesToHex(raw);
  check('P-256 公钥 04+128hex', /^04[0-9a-f]{128}$/.test(p256));

  // 合约地址派生（sha3_256）
  const bc = 'nova:music:revenue:v1;split:90/10';
  check('合约地址 0x+40hex', /^0x[0-9a-f]{40}$/.test(sdk.utils.deployAddress(bc)));

  console.log(`\nPASS=${pass} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });