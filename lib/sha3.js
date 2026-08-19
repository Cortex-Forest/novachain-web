/* 自托管 SHA3-256 / SHA3-512（无第三方 CDN，替代 js-sha3）
 * 实现源自仓库内已验证的 apps-common.js 回退实现，输出与 js-sha3 完全一致（小写 hex 字符串）。
 * API 兼容 js-sha3：sha3_256(input) / sha3_512(input)
 *   input 为 Uint8Array / Array 时按原始字节处理；为字符串时按 UTF-8 文本处理。
 * 提供全局 window.sha3_256 / window.sha3_512，供 nova.html 与 apps-common.js 使用。
 */
(function (global) {
  'use strict';

  var KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  var KECCAK_ROTC = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  var MASK64 = (1n << 64n) - 1n;
  function rotl64(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64; }
  function keccakF(st) {
    var a = new Array(25), i, x, y, round, j, k;
    for (i = 0; i < 25; i++) {
      var v = 0n;
      for (j = 7; j >= 0; j--) v = (v << 8n) | BigInt(st[i * 8 + j]);
      a[i] = v;
    }
    for (round = 0; round < 24; round++) {
      var c = new Array(5), d = new Array(5);
      for (x = 0; x < 5; x++) c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
      for (x = 0; x < 5; x++) d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (i = 0; i < 25; i++) a[i] ^= d[i % 5];
      var b = new Array(25);
      for (x = 0; x < 5; x++) {
        for (y = 0; y < 5; y++) {
          var idx = x + 5 * y;
          var nx = y;
          var ny = (2 * x + 3 * y) % 5;
          var rot = KECCAK_ROTC[idx];
          b[nx + 5 * ny] = rot ? rotl64(a[idx], rot) : a[idx];
        }
      }
      for (i = 0; i < 25; i++) {
        var yy = Math.floor(i / 5);
        a[i] = b[i] ^ ((~b[(i + 1) % 5 + 5 * yy]) & b[(i + 2) % 5 + 5 * yy]);
      }
      a[0] ^= KECCAK_RC[round];
    }
    var out = new Uint8Array(200);
    for (i = 0; i < 25; i++) {
      v = a[i];
      for (k = 0; k < 8; k++) { out[i * 8 + k] = Number(v & 0xffn); v >>= 8n; }
    }
    return out;
  }
  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (Array.isArray(input)) return new Uint8Array(input);
    if (typeof input === 'string') return new TextEncoder().encode(input); // 与 js-sha3 一致：字符串按 UTF-8 文本
    throw new Error('invalid input type');
  }
  function sha3Bits(input, rate, outLen) {
    var bytes = toBytes(input);
    var blockCount = Math.ceil((bytes.length + 1) / rate);
    var data = new Uint8Array(blockCount * rate);
    data.set(bytes);
    var lastStart = (blockCount - 1) * rate;
    var pos = bytes.length - lastStart;
    data[lastStart + pos] = 0x06;          // SHA3 域分隔
    data[lastStart + rate - 1] |= 0x80;    // 结尾填充位
    var state = new Uint8Array(200);
    for (var i = 0; i < blockCount; i++) {
      for (var j = 0; j < rate; j++) state[j] ^= data[i * rate + j];
      state = keccakF(state);
    }
    return state.slice(0, outLen);
  }
  function toHex(bytes) {
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function sha3_256(input) { return toHex(sha3Bits(input, 136, 32)); } // rate=136, 32B 输出
  function sha3_512(input) { return toHex(sha3Bits(input, 72, 64)); }  // rate=72, 64B 输出

  if (global && !global.sha3_256) global.sha3_256 = sha3_256;
  if (global && !global.sha3_512) global.sha3_512 = sha3_512;
})(typeof window !== 'undefined' ? window : globalThis);
