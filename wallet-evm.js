/* Nova 钱包 EVM 内核（纯 JS，零外部依赖，浏览器/Node 通用）
 *
 * 提供：
 *  - Keccak-256（Ethereum 兼容哈希）
 *  - secp256k1 椭圆曲线（点运算 / ECDSA 签名验签 / RFC6979 确定性随机数）
 *  - BIP32（secp256k1）子密钥派生，支持标准 BIP44 路径 m/44'/60'/0'/0/n
 *  - EVM 地址派生（EIP-55 校验和地址）
 */
(function (global) {
    'use strict';

    var TE = new TextEncoder();
    var TD = new TextDecoder();

    // ============================================================
    // 基础工具
    // ============================================================
    function bytesToHex(bytes) {
        return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    function hexToBytes(hex) {
        var clean = String(hex || '').replace(/^0x/, '');
        if (!clean) return new Uint8Array();
        var out = new Uint8Array(clean.length / 2);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
        return out;
    }
    function concatBytes() {
        var total = 0, i;
        for (i = 0; i < arguments.length; i++) total += arguments[i].length;
        var out = new Uint8Array(total), p = 0;
        for (i = 0; i < arguments.length; i++) { out.set(arguments[i], p); p += arguments[i].length; }
        return out;
    }
    function toArrayBuffer(bytes) {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    function asciiToBytes(s) {
        var out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
        return out;
    }
    function bytesToBigInt(bytes) {
        return BigInt('0x' + bytesToHex(bytes));
    }
    function bigIntToBytes(v, len) {
        var hex = v.toString(16);
        if (hex.length > len * 2) throw new Error('数值超出目标长度');
        return hexToBytes(hex.padStart(len * 2, '0'));
    }

    // ============================================================
    // Keccak-256（Ethereum 兼容哈希，rate=1088bit / 24 轮）
    // ============================================================
    var KECCAK_MASK = (1n << 64n) - 1n;
    var KECCAK_RC = [
        0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
        0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
        0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
        0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
        0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
        0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
        0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
        0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
    ];
    var KECCAK_R = [
        [0, 36, 3, 41, 18],
        [1, 44, 10, 45, 2],
        [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56],
        [27, 20, 39, 8, 14]
    ];
    function keccakRotl(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & KECCAK_MASK; }
    function keccakF1600(state) {
        var x, y, i;
        for (var round = 0; round < 24; round++) {
            var C = new Array(5), D = new Array(5), B = new Array(25);
            for (x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
            for (x = 0; x < 5; x++) {
                D[x] = C[(x + 4) % 5] ^ keccakRotl(C[(x + 1) % 5], 1);
                for (y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
            }
            for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = keccakRotl(state[x + 5 * y], KECCAK_R[x][y]);
            for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) state[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y]);
            state[0] ^= KECCAK_RC[round];
        }
    }
    function keccak256(bytes) {
        var rate = 136, state = new Array(25).fill(0n);
        var block = new Uint8Array(rate), offset = 0, i, j, b;
        function absorb(blk) {
            for (j = 0; j < 17; j++) {
                var lane = 0n;
                for (b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(blk[j * 8 + b]);
                state[j] ^= lane;
            }
            keccakF1600(state);
        }
        for (i = 0; i < bytes.length; i++) {
            block[offset++] = bytes[i];
            if (offset === rate) { absorb(block); offset = 0; block.fill(0); }
        }
        block[offset] = 0x01;
        block[rate - 1] |= 0x80;
        absorb(block);
        var out = new Uint8Array(32);
        for (j = 0; j < 32; j++) out[j] = Number((state[j >> 3] >> BigInt(8 * (j & 7))) & 0xffn);
        return out;
    }

    // ============================================================
    // secp256k1 椭圆曲线
    // ============================================================
    var SECP_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
    var SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    var SECP_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
    var SECP_GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
    var SECP_HALF_N = SECP_N >> 1n;
    var G_POINT = { X: SECP_GX, Y: SECP_GY, Z: 1n };
    var INF_POINT = { X: 0n, Y: 1n, Z: 0n };

    function modP(v) { var r = v % SECP_P; return r < 0n ? r + SECP_P : r; }
    function modN(v) { var r = v % SECP_N; return r < 0n ? r + SECP_N : r; }
    function modInverse(a, m) {
        var t = 0n, newT = 1n, r = m, newR = ((a % m) + m) % m;
        while (newR !== 0n) {
            var q = r / newR;
            var tmpT = newT; newT = t - q * newT; t = tmpT;
            var tmpR = newR; newR = r - q * newR; r = tmpR;
        }
        if (r !== 1n) throw new Error('模逆不存在');
        if (t < 0n) t += m;
        return t;
    }
    function modExp(base, exp, m) {
        var r = 1n; base %= m;
        while (exp > 0n) {
            if (exp & 1n) r = (r * base) % m;
            base = (base * base) % m;
            exp >>= 1n;
        }
        return r;
    }
    function isInf(p) { return p.Z === 0n; }
    function pointDouble(p) {
        if (isInf(p) || p.Y === 0n) return INF_POINT;
        var Y2 = modP(p.Y * p.Y);
        var S = modP(4n * p.X * Y2);
        var M = modP(3n * p.X * p.X);
        var X3 = modP(M * M - 2n * S);
        var Y3 = modP(M * (S - X3) - 8n * Y2 * Y2);
        var Z3 = modP(2n * p.Y * p.Z);
        return { X: X3, Y: Y3, Z: Z3 };
    }
    function pointAdd(p1, p2) {
        if (isInf(p1)) return p2;
        if (isInf(p2)) return p1;
        var Z1Z1 = modP(p1.Z * p1.Z), Z2Z2 = modP(p2.Z * p2.Z);
        var U1 = modP(p1.X * Z2Z2), U2 = modP(p2.X * Z1Z1);
        var S1 = modP(p1.Y * Z2Z2 * p2.Z), S2 = modP(p2.Y * Z1Z1 * p1.Z);
        if (U1 === U2) {
            if (S1 !== S2) return INF_POINT;
            return pointDouble(p1);
        }
        var H = modP(U2 - U1);
        var R = modP(S2 - S1);
        var HH = modP(H * H);
        var HHH = modP(HH * H);
        var V = modP(U1 * HH);
        var X3 = modP(R * R - HHH - 2n * V);
        var Y3 = modP(R * (V - X3) - S1 * HHH);
        var Z3 = modP(H * p1.Z * p2.Z);
        return { X: X3, Y: Y3, Z: Z3 };
    }
    function pointScalarMult(p, k) {
        var q = INF_POINT, addend = p;
        k = modN(k);
        while (k > 0n) {
            if (k & 1n) q = pointAdd(q, addend);
            addend = pointDouble(addend);
            k >>= 1n;
        }
        return q;
    }
    function pointToAffine(p) {
        if (isInf(p)) return null;
        var zi = modInverse(p.Z, SECP_P);
        var zi2 = modP(zi * zi);
        var zi3 = modP(zi2 * zi);
        return { x: modP(p.X * zi2), y: modP(p.Y * zi3) };
    }
    function secpPubkey(dBytes, compressed) {
        var d = bytesToBigInt(dBytes);
        if (d === 0n || d >= SECP_N) throw new Error('无效私钥');
        var P = pointToAffine(pointScalarMult(G_POINT, d));
        var x = bigIntToBytes(P.x, 32), y = bigIntToBytes(P.y, 32);
        if (compressed) return concatBytes(new Uint8Array([P.y & 1n ? 3 : 2]), x);
        return concatBytes(new Uint8Array([4]), x, y);
    }
    function secpPointDecompress(pub33) {
        if (pub33.length !== 33 || (pub33[0] !== 2 && pub33[0] !== 3)) throw new Error('无效压缩公钥');
        var x = bytesToBigInt(pub33.slice(1));
        if (x >= SECP_P) throw new Error('无效公钥');
        var y2 = modP(x * x * x + 7n);
        var y = modExp(y2, (SECP_P + 1n) >> 2n, SECP_P);
        if (modP(y * y) !== y2) throw new Error('非曲线点');
        if ((y & 1n) !== BigInt(pub33[0] & 1)) y = SECP_P - y;
        return concatBytes(new Uint8Array([4]), bigIntToBytes(x, 32), bigIntToBytes(y, 32));
    }

    // ============================================================
    // ECDSA 签名 / 验签（RFC6979 确定性随机数，低 s 规范化）
    // ============================================================
    function requireSubtle() {
        if (!global.crypto || !global.crypto.subtle) throw new Error('当前环境不支持 WebCrypto（需 HTTPS 或 localhost）');
        return global.crypto.subtle;
    }
    async function sha256(bytes) { return new Uint8Array(await requireSubtle().digest('SHA-256', toArrayBuffer(bytes))); }
    async function sha512(bytes) { return new Uint8Array(await requireSubtle().digest('SHA-512', toArrayBuffer(bytes))); }
    async function hmacSha512(keyBytes, dataBytes) {
        var key = await requireSubtle().importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
        return new Uint8Array(await requireSubtle().sign('HMAC', key, toArrayBuffer(dataBytes)));
    }
    async function hmacSha256(keyBytes, dataBytes) {
        var key = keyBytes.length > 64 ? await sha256(keyBytes) : keyBytes;
        var kp = new Uint8Array(64); kp.set(key);
        var ipad = new Uint8Array(64), opad = new Uint8Array(64);
        for (var i = 0; i < 64; i++) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c; }
        var inner = await sha256(concatBytes(ipad, dataBytes));
        return sha256(concatBytes(opad, inner));
    }
    async function rfc6979K(dBytes, h1Bytes) {
        var xb = bigIntToBytes(bytesToBigInt(dBytes), 32);
        var V = new Uint8Array(32).fill(1);
        var K = new Uint8Array(32);
        K = await hmacSha256(K, concatBytes(V, new Uint8Array([0]), xb, h1Bytes));
        V = await hmacSha256(K, V);
        K = await hmacSha256(K, concatBytes(V, new Uint8Array([1]), xb, h1Bytes));
        V = await hmacSha256(K, V);
        for (;;) {
            V = await hmacSha256(K, V);
            var T = bytesToBigInt(V);
            if (T >= SECP_N) T -= SECP_N;
            if (T > 0n && T < SECP_N) return T;
            K = await hmacSha256(K, concatBytes(V, new Uint8Array([0])));
            V = await hmacSha256(K, V);
        }
    }
    async function ecdsaSign(dBytes, msgHashBytes) {
        if (msgHashBytes.length !== 32) throw new Error('消息哈希必须为 32 字节');
        var d = bytesToBigInt(dBytes);
        if (d === 0n || d >= SECP_N) throw new Error('无效私钥');
        var z = bytesToBigInt(msgHashBytes);
        if (z >= SECP_N) z -= SECP_N;
        var k = await rfc6979K(dBytes, msgHashBytes);
        var R = pointToAffine(pointScalarMult(G_POINT, k));
        var r = modN(R.x);
        if (r === 0n) throw new Error('签名失败');
        var s = modN(modInverse(k, SECP_N) * (z + r * d));
        if (s === 0n) throw new Error('签名失败');
        var recid = (R.y & 1n) === 1n ? 1 : 0;
        if (r >= SECP_N) recid |= 2;
        if (s > SECP_HALF_N) s = SECP_N - s;
        var rB = bigIntToBytes(r, 32), sB = bigIntToBytes(s, 32);
        return {
            r: rB,
            s: sB,
            recid: recid,
            v: recid + 27,
            signature: concatBytes(rB, sB, new Uint8Array([recid + 27]))
        };
    }
    function ecdsaVerify(pubBytes, msgHashBytes, rB, sB) {
        var uncompressed = pubBytes.length === 33 ? secpPointDecompress(pubBytes) : pubBytes;
        if (uncompressed.length !== 65 || uncompressed[0] !== 4) throw new Error('无效公钥');
        var P = { X: bytesToBigInt(uncompressed.slice(1, 33)), Y: bytesToBigInt(uncompressed.slice(33)), Z: 1n };
        var r = bytesToBigInt(rB), s = bytesToBigInt(sB);
        if (r < 1n || r >= SECP_N || s < 1n || s >= SECP_N) return false;
        var z = bytesToBigInt(msgHashBytes);
        if (z >= SECP_N) z -= SECP_N;
        var w = modInverse(s, SECP_N);
        var u1 = modN(z * w), u2 = modN(r * w);
        var R = pointAdd(pointScalarMult(G_POINT, u1), pointScalarMult(P, u2));
        var aff = pointToAffine(R);
        if (!aff) return false;
        return modN(aff.x) === r;
    }

    // ============================================================
    // BIP32（secp256k1）派生，标准 BIP44 EVM 路径 m/44'/60'/0'/0/n
    // ============================================================
    function ser32(i) {
        return new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
    }
    async function bip32Master(seed) {
        var I = await hmacSha512(asciiToBytes('Bitcoin seed'), seed);
        var k = bytesToBigInt(I.slice(0, 32));
        if (k === 0n || k >= SECP_N) throw new Error('无效种子');
        return { key: I.slice(0, 32), chainCode: I.slice(32) };
    }
    async function bip32CkdPriv(node, index) {
        var data;
        if (index >= 0x80000000) {
            data = concatBytes(new Uint8Array([0]), node.key, ser32(index));
        } else {
            data = concatBytes(secpPubkey(node.key, true), ser32(index));
        }
        var I = await hmacSha512(node.chainCode, data);
        var IL = bytesToBigInt(I.slice(0, 32));
        if (IL >= SECP_N) throw new Error('无效派生');
        var k = modN(bytesToBigInt(node.key) + IL);
        if (k === 0n) throw new Error('无效派生');
        return { key: bigIntToBytes(k, 32), chainCode: I.slice(32) };
    }
    async function deriveBip32Path(seed, path) {
        var trimmed = String(path || '').trim();
        var parts = trimmed.replace(/^[mM]\//, '').split('/');
        if (parts.length === 1 && parts[0] === '') parts = [];
        var node = await bip32Master(seed);
        for (var i = 0; i < parts.length; i++) {
            var seg = parts[i].trim();
            if (!seg) continue;
            var hardened = /[hH']$/.test(seg);
            var num = parseInt(seg.replace(/[hH']$/, ''), 10);
            if (isNaN(num) || num < 0 || num >= 0x80000000) throw new Error('无效派生路径: ' + path);
            node = await bip32CkdPriv(node, hardened ? num + 0x80000000 : num);
        }
        return node;
    }

    // ============================================================
    // EVM 地址（EIP-55 校验和）
    // ============================================================
    function pubkeyToAddress(pubBytes) {
        var uncompressed = pubBytes.length === 33 ? secpPointDecompress(pubBytes) : pubBytes;
        if (uncompressed.length !== 65 || uncompressed[0] !== 4) throw new Error('无效公钥');
        var h = keccak256(uncompressed.slice(1));
        return '0x' + bytesToHex(h.slice(12));
    }
    function toChecksumAddress(address) {
        var lower = String(address || '').toLowerCase().replace(/^0x/, '');
        if (!/^[0-9a-f]{40}$/.test(lower)) throw new Error('无效地址');
        var h = bytesToHex(keccak256(asciiToBytes(lower)));
        var out = '0x';
        for (var i = 0; i < 40; i++) {
            out += parseInt(h[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
        }
        return out;
    }
    function isAddress(s) { return /^0x[0-9a-fA-F]{40}$/.test(String(s || '')); }
    function privateKeyToAddress(dBytes) { return pubkeyToAddress(secpPubkey(dBytes, false)); }
    function privateKeyToChecksumAddress(dBytes) { return toChecksumAddress(privateKeyToAddress(dBytes)); }

    // ============================================================
    // 合约调用解析（选择器库 + ABI 解码）
    // ============================================================
    var SIGNATURES = {
        '0xa9059cbb': 'transfer(address,uint256)',
        '0x095ea7b3': 'approve(address,uint256)',
        '0x23b872dd': 'transferFrom(address,address,uint256)',
        '0x70a08231': 'balanceOf(address)',
        '0x40c10f19': 'mint(address,uint256)',
        '0x42966c68': 'burn(uint256)',
        '0x2e1a7d4d': 'withdraw(uint256)',
        '0xd0e30db0': 'deposit()',
        '0xa694fc3a': 'stake(uint256)',
        '0x4e71d92d': 'claim()',
        '0xa22cb465': 'setApprovalForAll(address,bool)',
        '0x42842e0e': 'safeTransferFrom(address,address,uint256)',
        '0x6352211e': 'ownerOf(uint256)',
        '0x18160ddd': 'totalSupply()'
    };
    function functionSelector(signature) {
        return '0x' + bytesToHex(keccak256(asciiToBytes(signature)).slice(0, 4));
    }
    function decodeStaticArg(type, word) {
        var hex = bytesToHex(word);
        if (/^uint(\d+)?$/.test(type)) return BigInt('0x' + hex).toString();
        if (type === 'address') return '0x' + hex.slice(24);
        if (type === 'bool') return BigInt('0x' + hex) !== 0n;
        if (type === 'bytes32' || type === 'bytes4' || type === 'bytes8' || type === 'bytes16') {
            var trimmed = hex.replace(/0+$/, '');
            return '0x' + (trimmed || '0');
        }
        if (/^int(\d+)?$/.test(type)) {
            var bits = parseInt((type.match(/\d+/) || [256])[0], 10);
            return String(BigInt.asIntN(bits, BigInt('0x' + hex)));
        }
        return '0x' + hex;
    }
    function abiDecodeArgs(signature, payload) {
        if (!signature) return [];
        var m = signature.match(/^[a-zA-Z0-9_]+\((.*)\)$/);
        if (!m) return [];
        var types = m[1] ? m[1].split(',') : [];
        var out = [], dyn = [], head = 0, i;
        for (i = 0; i < types.length; i++) {
            var t = types[i];
            var word = payload.slice(head, head + 32);
            if (word.length < 32) break;
            if (t === 'string' || t === 'bytes') {
                dyn.push({ type: t, off: Number(BigInt('0x' + bytesToHex(word))) });
                out.push(null);
            } else {
                out.push(decodeStaticArg(t, word));
            }
            head += 32;
        }
        for (i = 0; i < dyn.length; i++) {
            var d = dyn[i];
            var lenWord = payload.slice(d.off, d.off + 32);
            if (lenWord.length < 32) { out[i] = '(解析失败)'; continue; }
            var len = Number(BigInt('0x' + bytesToHex(lenWord)));
            if (len > 1e6) { out[i] = '(数据过长)'; continue; }
            var raw = payload.slice(d.off + 32, d.off + 32 + len);
            out[i] = d.type === 'string' ? TD.decode(raw) : '0x' + bytesToHex(raw);
        }
        return out;
    }
    function decodeCalldata(dataHex) {
        var data = hexToBytes(dataHex);
        if (!data.length) return { selector: null, signature: '(普通转账，无 calldata)', args: [] };
        var sel = '0x' + bytesToHex(data.slice(0, 4));
        var signature = SIGNATURES[sel] || null;
        var args = signature ? abiDecodeArgs(signature, data.slice(4)) : [];
        return {
            selector: sel,
            signature: signature || (sel + '（未收录，请谨慎）'),
            args: args
        };
    }
    // ============================================================
    // RLP 编码 + 传统 EIP-155 交易签名
    // ============================================================
    function rlpIntBytes(v) {
        if (v === 0n) return new Uint8Array();
        var hex = v.toString(16);
        if (hex.length % 2) hex = '0' + hex;
        return hexToBytes(hex);
    }
    function rlpItem(bytes) {
        if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
        return concatBytes(new Uint8Array([0x80 + bytes.length]), bytes);
    }
    function rlpList(items) {
        var payload = new Uint8Array(0);
        for (var i = 0; i < items.length; i++) payload = concatBytes(payload, items[i]);
        var len = payload.length, prefix;
        if (len < 56) prefix = new Uint8Array([0xc0 + len]);
        else {
            var lenHex = len.toString(16);
            if (lenHex.length % 2) lenHex = '0' + lenHex;
            prefix = concatBytes(new Uint8Array([0xf7 + lenHex.length / 2]), hexToBytes(lenHex));
        }
        return concatBytes(prefix, payload);
    }
    async function signLegacyEvmTx(tx, dBytes) {
        // tx: { nonce, gasPrice, gasLimit, to('0x…' 或 null 部署), value, data(Uint8Array), chainId }
        var toBytes = tx.to ? hexToBytes(tx.to) : new Uint8Array();
        var fields = [
            rlpItem(rlpIntBytes(tx.nonce)),
            rlpItem(rlpIntBytes(tx.gasPrice)),
            rlpItem(rlpIntBytes(tx.gasLimit)),
            rlpItem(toBytes),
            rlpItem(rlpIntBytes(tx.value)),
            rlpItem(tx.data || new Uint8Array())
        ];
        var signing = rlpList(fields.concat([
            rlpItem(rlpIntBytes(BigInt(tx.chainId))),
            rlpItem(new Uint8Array()),
            rlpItem(new Uint8Array())
        ]));
        var hash = keccak256(signing);
        var sig = await ecdsaSign(dBytes, hash);
        var v = BigInt(tx.chainId) * 2n + 35n + BigInt(sig.recid);
        var out = rlpList(fields.concat([rlpItem(rlpIntBytes(v)), rlpItem(sig.r), rlpItem(sig.s)]));
        return { raw: '0x' + bytesToHex(out), hash: '0x' + bytesToHex(hash), v: v, r: bytesToHex(sig.r), s: bytesToHex(sig.s) };
    }
    // ============================================================
    // 导出
    // ============================================================
    global.NovaEVM = {
        SECP_P: SECP_P,
        SECP_N: SECP_N,
        SECP_GX: SECP_GX,
        SECP_GY: SECP_GY,
        EVM_DERIVATION_PATH: "m/44'/60'/0'/0/0",
        bytesToHex: bytesToHex,
        hexToBytes: hexToBytes,
        bytesToBigInt: bytesToBigInt,
        bigIntToBytes: bigIntToBytes,
        keccak256: keccak256,
        modP: modP,
        modN: modN,
        modInverse: modInverse,
        pointScalarMult: pointScalarMult,
        secpPubkey: secpPubkey,
        secpPointDecompress: secpPointDecompress,
        pubkeyToAddress: pubkeyToAddress,
        toChecksumAddress: toChecksumAddress,
        privateKeyToAddress: privateKeyToAddress,
        privateKeyToChecksumAddress: privateKeyToChecksumAddress,
        isAddress: isAddress,
        ecdsaSign: ecdsaSign,
        ecdsaVerify: ecdsaVerify,
        bip32Master: bip32Master,
        deriveBip32Path: deriveBip32Path,
        rlpItem: rlpItem,
        rlpList: rlpList,
        signLegacyEvmTx: signLegacyEvmTx,
        functionSelector: functionSelector,
        decodeCalldata: decodeCalldata,
        deriveEvmKey: async function (seed, path) {
            var node = await deriveBip32Path(seed, path || "m/44'/60'/0'/0/0");
            return node.key;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);