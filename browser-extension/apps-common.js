/* Nova 应用中心公共库：钱包连接、演示支付、NFT 存储、导航与工具函数 */
(function () {
  'use strict';

  /* ================= 基础工具 ================= */
  function hexToBytes(hex) {
    var clean = (hex || '').replace(/^0x/, '');
    if (!clean) return new Uint8Array();
    return new Uint8Array(clean.match(/.{1,2}/g).map(function (b) { return parseInt(b, 16); }));
  }
  function bytesToHex(bytes) {
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function utf8ToBytes(str) { return new TextEncoder().encode(str); }
  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  }
  function randomBytes(n) {
    var out = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) crypto.getRandomValues(out);
    else for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function bigIntToLeBytes(n, len) {
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
    return out;
  }
  function leBytesToBigInt(bytes) {
    var n = 0n;
    for (var i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    return n;
  }

  /* ================= SHA3-512 回退实现（离线 / CDN 不可用时的保障，与 js-sha3 输出一致） ================= */
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
  function sha3_512Bytes(bytes) {
    var rate = 72, outLen = 64;
    var blockCount = Math.ceil((bytes.length + 1) / rate);
    var data = new Uint8Array(blockCount * rate);
    data.set(bytes);
    var lastStart = (blockCount - 1) * rate;
    var pos = bytes.length - lastStart;
    data[lastStart + pos] = 0x06;
    data[lastStart + rate - 1] |= 0x80;
    var state = new Uint8Array(200);
    for (var i = 0; i < blockCount; i++) {
      for (var j = 0; j < rate; j++) state[j] ^= data[i * rate + j];
      state = keccakF(state);
    }
    return state.slice(0, outLen);
  }
  function computeSha3_512(pubBytes) {
    if (typeof sha3_512 === 'function') return sha3_512(pubBytes);
    return bytesToHex(sha3_512Bytes(pubBytes));
  }

  /* ================= Ed25519（与钱包页 / 后端 core/crypto.py 回退实现一致） ================= */
  var ED_P = (1n << 255n) - 19n;
  var ED_L = (1n << 252n) + 27742317777372353535851937790883648493n;
  var ED_D = (-121665n * modPow(121666n, ED_P - 2n, ED_P)) % ED_P;
  var ED_BX = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  var ED_BY = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  var ED_B = [ED_BX, ED_BY, 1n, (ED_BX * ED_BY) % ED_P];

  function modPow(base, exp, mod) {
    var b = base % mod;
    if (b < 0n) b += mod;
    var r = 1n;
    while (exp > 0n) {
      if (exp & 1n) r = (r * b) % mod;
      b = (b * b) % mod;
      exp >>= 1n;
    }
    return r;
  }
  function modP(n) { n %= ED_P; return n < 0n ? n + ED_P : n; }
  function edwardsAdd(p, q) {
    var x1 = p[0], y1 = p[1], z1 = p[2], t1 = p[3];
    var x2 = q[0], y2 = q[1], z2 = q[2], t2 = q[3];
    var a = (y1 - x1) * (y2 - x2) % ED_P;
    var b = (y1 + x1) * (y2 + x2) % ED_P;
    var c = (2n * ED_D * t1 * t2) % ED_P;
    var d = (2n * z1 * z2) % ED_P;
    var e = b - a;
    var f = d - c;
    var g = d + c;
    var h = b + a;
    return [modP(e * f), modP(g * h), modP(f * g), modP(e * h)];
  }
  function edwardsScalarMult(p, e) {
    var q = [0n, 1n, 1n, 0n];
    while (e > 0n) {
      if (e & 1n) q = edwardsAdd(q, p);
      p = edwardsAdd(p, p);
      e >>= 1n;
    }
    return q;
  }
  function edwardsEncode(p) {
    var zInv = modPow(p[2], ED_P - 2n, ED_P);
    var xr = modP(p[0] * zInv);
    var yr = modP(p[1] * zInv);
    var bits = yr | ((xr & 1n) << 255n);
    return bigIntToLeBytes(bits, 32);
  }
  function edwardsClamp(a) {
    a &= (1n << 255n) - 1n - 7n;
    a |= 1n << 254n;
    return a;
  }
  async function sha512(bytes) {
    if (!(window.crypto && window.crypto.subtle)) throw new Error('当前环境不支持 WebCrypto');
    return new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
  }
  async function ed25519PublicKey(seedBytes) {
    var h = await sha512(seedBytes);
    var a = edwardsClamp(leBytesToBigInt(h.slice(0, 32)));
    return edwardsEncode(edwardsScalarMult(ED_B, a));
  }
  async function ed25519Sign(seedBytes, msgBytes) {
    var h = await sha512(seedBytes);
    var a = edwardsClamp(leBytesToBigInt(h.slice(0, 32)));
    var prefix = h.slice(32);
    var r = leBytesToBigInt(await sha512(concatBytes(prefix, msgBytes))) % ED_L;
    var pubBytes = await ed25519PublicKey(seedBytes);
    var rBytes = edwardsEncode(edwardsScalarMult(ED_B, r));
    var k = leBytesToBigInt(await sha512(concatBytes(concatBytes(rBytes, pubBytes), msgBytes))) % ED_L;
    var s = (r + k * a) % ED_L;
    return concatBytes(rBytes, bigIntToLeBytes(s, 32));
  }
  function deriveAddress(pubHex) { return '0x' + computeSha3_512(hexToBytes(pubHex)).substring(0, 40); }

  /* ================= 状态与存储 ================= */
  var LS = {
    wallets: 'nova_priv', balances: 'nova_demo_balances', ledger: 'nova_demo_ledger',
    nft: 'nova_nft_store', owned: 'nova_nft_owned', profiles: 'nova_app_profiles',
    feed: 'nova_app_feed', seeded: 'nova_app_seeded', rooms: 'nova_app_rooms',
    scores: 'nova_app_scores', socialfi: 'nova_socialfi', storage: 'nova_storage', compute: 'nova_compute',
    ai: 'nova_ai'
  };
  var state = { mode: 'demo', rpc: null, connected: false, addr: null, priv: null, balance: 0, active: null };
  var TREASURY = '0x' + '0'.repeat(40);
  var DEMO_CREATORS = [
    { addr: '0x' + 'a1'.repeat(20), name: 'Nova 音乐实验室', avatar: '🎧', desc: '链上音乐发行与演出' },
    { addr: '0x' + 'b2'.repeat(20), name: '星海文字局', avatar: '📖', desc: '长文、诗歌与连载' },
    { addr: '0x' + 'c3'.repeat(20), name: '量子游戏工坊', avatar: '🎮', desc: '小游戏与链上积分' },
    { addr: '0x' + 'd4'.repeat(20), name: '光年视频社', avatar: '🎬', desc: '短剧与创作者频道' },
    { addr: '0x' + 'e5'.repeat(20), name: 'Nova 直播联盟', avatar: '📡', desc: '24 小时星际直播' },
    { addr: '0x' + 'f6'.repeat(20), name: '极光社交圈', avatar: '💬', desc: '创作者社区' },
    { addr: '0x' + '77'.repeat(20), name: '银河演出公司', avatar: '🎪', desc: '虚拟演唱会主办' },
    { addr: '0x' + '88'.repeat(20), name: '量子美术馆', avatar: '🖼️', desc: '数字艺术收藏' }
  ];

  function lsGet(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ================= 节点检测与 API ================= */
  var NODE_CANDIDATES = [
    window.location.origin + '/api/status',
    'http://127.0.0.1:8080/api/status',
    'http://localhost:8080/api/status'
  ];
  async function detectMode() {
    for (var i = 0; i < NODE_CANDIDATES.length; i++) {
      try {
        var res = await fetch(NODE_CANDIDATES[i], { method: 'GET', headers: { Accept: 'application/json' } });
        if (res.ok) {
          var d = await res.json();
          if (d && typeof d === 'object') {
            state.mode = 'node';
            state.rpc = NODE_CANDIDATES[i].replace(/\/api\/status$/, '');
            return d;
          }
        }
      } catch (e) { /* 继续尝试下一候选 */ }
    }
    state.mode = 'demo';
    return { demoMode: true };
  }
  function demoApi(path, method, body) {
    if (method === 'GET' && path.indexOf('/api/balance/') === 0) {
      var addr = decodeURIComponent(path.split('/').pop());
      var balances = lsGet(LS.balances, {});
      return { balance: balances[addr] != null ? balances[addr] : 1000, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/status') === 0) return { node: '演示模式', demoMode: true };
    if (method === 'POST' && path === '/api/send') return { txid: demoHash(JSON.stringify(body || {})), demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/pins') === 0) return { pins: demoStorage().claims, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/providers') === 0) return { providers: demoStorage().providers, total: Object.keys(demoStorage().providers).length, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/orders') === 0) return { orders: demoStorage().orders, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/compute/tasks') === 0) return { tasks: demoCompute().tasks, demoMode: true };
    if (method === 'POST' && path.indexOf('/api/storage/') === 0) {
      try {
        var d0 = JSON.parse((body && body.data) || '{}');
        return demoStorageOp(d0.op, d0, Number(body && body.amount) || 0);
      } catch (e) { return { error: '请求无效', demoMode: true }; }
    }
    if (method === 'POST' && path.indexOf('/api/compute/') === 0) {
      try {
        var d1 = JSON.parse((body && body.data) || '{}');
        return demoComputeOp(d1.op, d1, Number(body && body.amount) || 0);
      } catch (e) { return { error: '请求无效', demoMode: true }; }
    }
    return { demoMode: true };
  }
  function demoHash(str) {
    try { return '0x' + computeSha3_512(utf8ToBytes(str)).substring(0, 64); } catch (e) { return '0x' + bytesToHex(randomBytes(32)); }
  }
  async function api(path, method, body) {
    if (state.mode === 'node' && state.rpc) {
      try {
        var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        var res = await fetch(state.rpc + path, opts);
        return await res.json();
      } catch (e) { state.mode = 'demo'; }
    }
    return demoApi(path, method || 'GET', body);
  }

  /* ================= 钱包 ================= */
  function wallets() { return lsGet(LS.wallets, []); }
  function dispatchWallet() {
    try {
      window.dispatchEvent(new CustomEvent('nova-wallet', {
        detail: { connected: state.connected, addr: state.addr, balance: state.balance, mode: state.mode }
      }));
    } catch (e) { /* 忽略 */ }
  }
  async function getPubFromPriv(privHex) { return bytesToHex(await ed25519PublicKey(hexToBytes(privHex))); }
  async function addressFromPriv(privHex) { return deriveAddress(await getPubFromPriv(privHex)); }
  async function signMsg(privHex, msg) { return bytesToHex(await ed25519Sign(hexToBytes(privHex), utf8ToBytes(msg))); }
  async function connectWith(privHex) {
    state.priv = privHex;
    state.addr = await addressFromPriv(privHex);
    state.connected = true;
    await refreshBalance();
    if (state.mode === 'demo') {
      var balances = lsGet(LS.balances, {});
      if (balances[state.addr] == null) balances[state.addr] = 1000;
      lsSet(LS.balances, balances);
      state.balance = balances[state.addr];
    }
    dispatchWallet();
  }
  async function refreshBalance() {
    if (!state.connected) return;
    var d = await api('/api/balance/' + state.addr);
    state.balance = Number(d.balance || 0);
    dispatchWallet();
  }
  function disconnect() {
    state.connected = false; state.addr = null; state.priv = null; state.balance = 0;
    dispatchWallet();
  }
  async function connectFromStorage() {
    var ws = wallets();
    if (!ws.length) return false;
    try { await connectWith(ws[0]); return true; } catch (e) { return false; }
  }
  async function createDemoWallet() {
    var priv = bytesToHex(randomBytes(32));
    var ws = wallets();
    ws.push(priv);
    lsSet(LS.wallets, ws);
    await connectWith(priv);
    return priv;
  }
  async function importPrivKey(hex) {
    var clean = (hex || '').trim().replace(/^0x/, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) return { error: '私钥需为 64 位十六进制字符串' };
    var ws = wallets();
    if (ws.indexOf(clean) === -1) ws.push(clean);
    lsSet(LS.wallets, ws);
    await connectWith(clean);
    return { ok: true };
  }
  function demoBalanceOf(addr) {
    var balances = lsGet(LS.balances, {});
    return balances[addr] != null ? balances[addr] : 0;
  }

  /* ================= 支付（演示 / 节点真实签名广播） ================= */
  function round4(n) { return Math.round(n * 10000) / 10000; }
  async function novaPay(opts) {
    opts = opts || {};
    var to = opts.to || TREASURY;
    var amount = Number(opts.amount);
    var memo = opts.memo || '';
    var app = opts.app || 'nova';
    if (!state.connected) return { ok: false, error: '未连接钱包' };
    if (!amount || amount <= 0) return { ok: false, error: '金额无效' };
    if (state.mode === 'demo') {
      var balances = lsGet(LS.balances, {});
      var bal = balances[state.addr] != null ? balances[state.addr] : 0;
      if (amount > bal) return { ok: false, error: '余额不足（演示余额 ' + fmt(bal) + ' NOVA）' };
      balances[state.addr] = round4(bal - amount);
      lsSet(LS.balances, balances);
      state.balance = balances[state.addr];
      var ledger = lsGet(LS.ledger, []);
      var txid = demoHash(state.addr + to + amount + memo + app + Date.now());
      ledger.unshift({ txid: txid, from: state.addr, to: to, amount: amount, memo: memo, app: app, ts: Date.now(), demo: true });
      lsSet(LS.ledger, ledger);
      dispatchWallet();
      return { ok: true, txid: txid, demo: true, balance: state.balance };
    }
    try {
      var pub = await getPubFromPriv(state.priv);
      var ts = Math.floor(Date.now() / 1000);
      var amtStr = amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
      var sig = await signMsg(state.priv, state.addr + to + amtStr + ts + '[]' + memo + pub);
      var res = await api('/api/send', 'POST', {
        sender: state.addr, receiver: to, amount: amount,
        timestamp: ts, parents: [], data: memo,
        sender_public_key: pub, signature: sig
      });
      if (res && res.error) return { ok: false, error: res.error };
      await refreshBalance();
      return { ok: true, txid: res.txid || res.hash || '', demo: false, balance: state.balance };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  function ledger() { return lsGet(LS.ledger, []); }
  function novaCredit(opts) {
    opts = opts || {};
    var amount = Number(opts.amount);
    if (!state.connected || !amount || amount <= 0) return { ok: false, error: '未连接钱包或金额无效' };
    if (state.mode === 'demo') {
      var balances = lsGet(LS.balances, {});
      balances[state.addr] = round4((balances[state.addr] != null ? balances[state.addr] : 0) + amount);
      lsSet(LS.balances, balances);
      state.balance = balances[state.addr];
      var ledger = lsGet(LS.ledger, []);
      ledger.unshift({
        txid: demoHash('credit:' + state.addr + amount + (opts.memo || '') + Date.now()),
        from: TREASURY, to: state.addr, amount: amount,
        memo: opts.memo || '收益入账', app: opts.app || 'nova',
        ts: Date.now(), demo: true, credit: true
      });
      lsSet(LS.ledger, ledger);
      dispatchWallet();
      return { ok: true, balance: state.balance, demo: true };
    }
    return { ok: false, error: '节点模式下请通过链上合约结算' };
  }

  /* ================= NFT 收藏品 ================= */
  function nftStore() { return lsGet(LS.nft, {}); }
  function saveNftStore(store) { lsSet(LS.nft, store); }
  function ownedNftIds() {
    var o = lsGet(LS.owned, {});
    return state.addr ? (o[state.addr] || []) : [];
  }
  function saveOwned(addr, ids) { var o = lsGet(LS.owned, {}); o[addr] = ids; lsSet(LS.owned, o); }
  function nftById(id) { return nftStore()[id] || null; }
  function catalog() {
    var store = nftStore();
    var out = [];
    Object.keys(store).forEach(function (id) { if (store[id].owner !== state.addr) out.push(store[id]); });
    return out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function myNfts() {
    var ids = ownedNftIds();
    var store = nftStore();
    return ids.map(function (id) { return store[id]; }).filter(Boolean);
  }
  async function nftMint(opts) {
    if (!state.connected) return { ok: false, error: '请先连接钱包' };
    var id = 'nova-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    var token = {
      id: id, name: opts.name || '未命名收藏品', desc: opts.desc || '', art: opts.art || '💠',
      price: Number(opts.price || 0), creator: state.addr, owner: state.addr,
      app: opts.app || 'nft', ts: Date.now(), txid: ''
    };
    var store = nftStore();
    store[id] = token;
    saveNftStore(store);
    var ids = ownedNftIds();
    ids.push(id);
    saveOwned(state.addr, ids);
    token.txid = demoHash('mint:' + id + ':' + state.addr);
    store[id].txid = token.txid;
    saveNftStore(store);
    dispatchWallet();
    return { ok: true, token: token };
  }
  async function nftBuy(id) {
    var token = nftById(id);
    if (!token) return { ok: false, error: '收藏品不存在' };
    if (token.owner === state.addr) return { ok: false, error: '已是你的收藏' };
    if (!state.connected) return { ok: false, error: '请先连接钱包' };
    if (token.price > 0) {
      var pay = await novaPay({ to: token.creator || TREASURY, amount: token.price, memo: '购买 NFT「' + token.name + '」', app: 'nft' });
      if (!pay.ok) return pay;
    }
    var store = nftStore();
    token.prevOwner = token.owner;
    token.owner = state.addr;
    token.boughtAt = Date.now();
    store[id] = token;
    saveNftStore(store);
    var ids = ownedNftIds();
    ids.push(id);
    saveOwned(state.addr, ids);
    dispatchWallet();
    return { ok: true, token: token };
  }
  async function nftTransfer(id, toAddr) {
    var token = nftById(id);
    if (!token) return { ok: false, error: '收藏品不存在' };
    if (token.owner !== state.addr) return { ok: false, error: '你不是持有者' };
    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddr || '')) return { ok: false, error: '地址格式无效（0x + 40 位 hex）' };
    if (toAddr.toLowerCase() === state.addr.toLowerCase()) return { ok: false, error: '无需转给自己' };
    var store = nftStore();
    token.owner = toAddr;
    token.transferAt = Date.now();
    store[id] = token;
    saveNftStore(store);
    var ids = ownedNftIds().filter(function (x) { return x !== id; });
    saveOwned(state.addr, ids);
    var o = lsGet(LS.owned, {});
    o[toAddr] = o[toAddr] || [];
    o[toAddr].push(id);
    lsSet(LS.owned, o);
    dispatchWallet();
    return { ok: true, token: token };
  }

  /* ================= 创作者档案 / 社交 ================= */
  function profiles() { return lsGet(LS.profiles, {}); }
  function saveProfiles(p) { lsSet(LS.profiles, p); }
  function profileOf(addr) { return profiles()[addr] || null; }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function displayName(addr) {
    var p = profileOf(addr);
    return p && p.name ? p.name : '星主 ' + shortAddr(addr);
  }
  function ensureProfile(addr, name, avatar) {
    var p = profiles();
    if (!p[addr]) p[addr] = { name: name, avatar: avatar || '🌌', desc: '', ts: Date.now() };
    lsSet(LS.profiles, p);
    return p[addr];
  }
  function setProfile(addr, patch) {
    var p = profiles();
    var prev = p[addr] || { avatar: '🌌' };
    p[addr] = Object.assign({}, prev, patch, { ts: Date.now() });
    lsSet(LS.profiles, p);
    return p[addr];
  }
  function feed() { return lsGet(LS.feed, []); }
  function saveFeed(f) { lsSet(LS.feed, f); }
  function addPost(content, app) {
    if (!state.connected) return { ok: false, error: '请先连接钱包' };
    if (!content || !content.trim()) return { ok: false, error: '内容不能为空' };
    var f = feed();
    var post = {
      id: 'p-' + Date.now().toString(36),
      addr: state.addr, name: displayName(state.addr), content: content.trim(),
      ts: Date.now(), likes: [], comments: [], app: app || 'social',
      txid: demoHash(content + state.addr + Date.now())
    };
    f.unshift(post);
    saveFeed(f);
    return { ok: true, post: post };
  }
  function toggleLike(postId) {
    if (!state.connected) return { ok: false, error: '请先连接钱包' };
    var f = feed();
    var post = null;
    for (var i = 0; i < f.length; i++) { if (f[i].id === postId) { post = f[i]; break; } }
    if (!post) return { ok: false, error: '动态不存在' };
    var idx = post.likes.indexOf(state.addr);
    if (idx >= 0) post.likes.splice(idx, 1); else post.likes.push(state.addr);
    saveFeed(f);
    return { ok: true, liked: idx < 0, count: post.likes.length };
  }

  /* ================= 游戏排行榜 / 直播房间 ================= */
  function scores() { return lsGet(LS.scores, {}); }
  function addScore(game, score) {
    if (!state.connected || !score) return;
    var s = scores();
    var list = s[game] || [];
    list.push({ addr: state.addr, name: displayName(state.addr), score: score, ts: Date.now() });
    list.sort(function (a, b) { return b.score - a.score; });
    s[game] = list.slice(0, 20);
    lsSet(LS.scores, s);
  }
  function topScores(game) { return scores()[game] || []; }
  function rooms() { return lsGet(LS.rooms, []); }
  function saveRooms(r) { lsSet(LS.rooms, r); }

  /* ================= 演示数据（一次性初始化） ================= */
  function seedDemoData() {
    if (lsGet(LS.seeded, '') === 'v1' || lsGet(LS.seeded, '') === 'v2') return;
    var p = profiles();
    DEMO_CREATORS.forEach(function (c) {
      if (!p[c.addr]) p[c.addr] = { name: c.name, avatar: c.avatar, desc: c.desc, ts: Date.now() };
    });
    lsSet(LS.profiles, p);
    var store = nftStore();
    var seedNfts = [
      { id: 'nova-genesis-01', name: '超新星原石 #001', desc: '创世收藏品，源自 2026 年超新星爆发的量子余晖。', art: '💎', price: 3, creator: DEMO_CREATORS[7].addr, app: 'nft' },
      { id: 'nova-genesis-02', name: '星轨之声 #007', desc: '音乐人发行的限量单曲唱片，附链上唯一编号。', art: '🎵', price: 5, creator: DEMO_CREATORS[0].addr, app: 'music' },
      { id: 'nova-genesis-03', name: '星舰回响 · VIP 座舱门票', desc: '虚拟演出「星舰回响」VIP 座舱入场券，含后台见面彩蛋。', art: '🚀', price: 8, creator: DEMO_CREATORS[6].addr, app: 'stage' },
      { id: 'nova-genesis-04', name: '像素星灵 #42', desc: '独立游戏「星灵契约」的角色纪念徽章。', art: '👾', price: 2, creator: DEMO_CREATORS[2].addr, app: 'games' },
      { id: 'nova-genesis-05', name: '星际邮差 · 限定海报', desc: '影片《星际邮差》创作者签名版海报。', art: '🎬', price: 4, creator: DEMO_CREATORS[3].addr, app: 'video' },
      { id: 'nova-genesis-06', name: '星际诗篇 #009', desc: '文字创作者的链上诗歌，一字一诺。', art: '📜', price: 1, creator: DEMO_CREATORS[1].addr, app: 'words' }
    ];
    var o = lsGet(LS.owned, {});
    seedNfts.forEach(function (t) {
      if (!store[t.id]) {
        t.ts = Date.now() - 86400000 * (1 + Math.floor(Math.random() * 10));
        store[t.id] = t;
        o[t.creator] = o[t.creator] || [];
        if (o[t.creator].indexOf(t.id) === -1) o[t.creator].push(t.id);
      }
    });
    lsSet(LS.nft, store);
    lsSet(LS.owned, o);
    var f = feed();
    if (!f.length) {
      f.push({
        id: 'seed-1', addr: DEMO_CREATORS[4].addr, name: DEMO_CREATORS[4].name,
        content: '今晚 20:00 直播「量子夜航」，来直播间一起听歌打榜 🎙️',
        ts: Date.now() - 3600000, likes: [DEMO_CREATORS[0].addr], comments: [], app: 'social', txid: demoHash('seed-1')
      });
      f.push({
        id: 'seed-2', addr: DEMO_CREATORS[0].addr, name: DEMO_CREATORS[0].name,
        content: '新单曲《星轨回声》已在音乐馆上链发行，收藏版限量 100 份 🎧',
        ts: Date.now() - 7200000, likes: [DEMO_CREATORS[7].addr, DEMO_CREATORS[5].addr], comments: [], app: 'music', txid: demoHash('seed-2')
      });
      f.push({
        id: 'seed-3', addr: DEMO_CREATORS[6].addr, name: DEMO_CREATORS[6].name,
        content: '「星舰回响」虚拟演出门票开售：链上票据，永久留档 🚀',
        ts: Date.now() - 86400000, likes: [], comments: [], app: 'stage', txid: demoHash('seed-3')
      });
      lsSet(LS.feed, f);
    }
    lsSet(LS.seeded, 'v1');
  }

  /* ================= UI：Toast / 弹窗 ================= */
  function loadingHtml(text) { return '<p class="dim">' + (text || '加载中…') + '</p>'; }
  function errHtml(msg) { return '<div class="err-box">⚠️ ' + esc(msg || '加载失败，请重试') + '</div>'; }
  function toast(msg, type) {
    type = type || 'ok';
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3200);
    setTimeout(function () { el.remove(); }, 3600);
  }
  function fmt(n) {
    return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function startVisual(canvas, kind) {
    kind = kind || 'particles';
    if (!canvas) return { stop: function () {} };
    var ctx = canvas.getContext('2d');
    var raf = null, running = true;
    var W = 0, H = 0, t = 0;
    function resize() {
      var r = canvas.getBoundingClientRect();
      if (r && r.width > 0) { W = r.width; H = r.height; canvas.width = W; canvas.height = H; }
    }
    var parts = [], beams = [], pulses = [], i;
    for (i = 0; i < 90; i++) {
      parts.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.008, vy: (Math.random() - 0.5) * 0.008, r: Math.random() * 1.8 + 0.4, hue: Math.random() * 80 + 175 });
    }
    for (i = 0; i < 6; i++) {
      beams.push({ x: Math.random(), y: Math.random() * 0.4 + 0.2, len: 0.2 + Math.random() * 0.3, speed: 0.002 + Math.random() * 0.004, hue: Math.random() * 80 + 170 });
    }
    function frame() {
      if (!running) return;
      if (W === 0) { resize(); if (W === 0) { raf = requestAnimationFrame(frame); return; } }
      ctx.clearRect(0, 0, W, H);
      t += 1;
      if (kind === 'beams') {
        beams.forEach(function (b) {
          b.x += b.speed;
          if (b.x > 1.2) b.x = -0.2;
          var grad = ctx.createLinearGradient((b.x - b.len) * W, b.y * H, (b.x + b.len) * W, b.y * H);
          grad.addColorStop(0, 'rgba(0,240,255,0)');
          grad.addColorStop(0.5, 'hsla(' + b.hue + ',90%,60%,0.5)');
          grad.addColorStop(1, 'rgba(180,77,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect((b.x - b.len) * W, b.y * H - 2, b.len * 2 * W, 4);
        });
        parts.forEach(function (p) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > 1) p.vx *= -1;
          if (p.y < 0 || p.y > 1) p.vy *= -1;
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.283); ctx.fill();
        });
      } else if (kind === 'stage') {
        var cx = W / 2, cy = H * 0.45;
        var g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.6);
        g.addColorStop(0, 'hsla(190,100%,60%,0.5)');
        g.addColorStop(0.5, 'hsla(280,80%,55%,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        pulses.push({ r: 0, hue: 180 + Math.random() * 120 });
        if (pulses.length > 14) pulses.shift();
        pulses.forEach(function (p) {
          p.r += 3;
          ctx.strokeStyle = 'hsla(' + p.hue + ',90%,65%,' + Math.max(0, 0.5 - p.r / 300) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, p.r, 0, 6.283); ctx.stroke();
        });
        var py = cy + Math.sin(t / 30) * 8;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(cx, py, 8, 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,240,255,0.08)';
        ctx.fillRect(0, H * 0.8, W, H * 0.2);
        parts.forEach(function (p) {
          p.y += p.vy * 0.6;
          if (p.y < 0) p.y = 1;
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * 0.7, 0, 6.283); ctx.fill();
        });
      } else {
        parts.forEach(function (p) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > 1) p.vx *= -1;
          if (p.y < 0 || p.y > 1) p.vy *= -1;
          ctx.fillStyle = 'hsla(' + p.hue + ',90%,65%,0.6)';
          ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, 6.283); ctx.fill();
        });
      }
      raf = requestAnimationFrame(frame);
    }
    resize();
    raf = requestAnimationFrame(frame);
    return {
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); },
      resize: resize
    };
  }

  var modalMask = null;
  function ensureMask() {
    if (modalMask) return;
    modalMask = document.createElement('div');
    modalMask.className = 'modal-mask';
    modalMask.innerHTML = '<div class="modal"><button class="close-x" aria-label="关闭">×</button><div class="modal-inner"></div></div>';
    modalMask.addEventListener('click', function (e) { if (e.target === modalMask) closeModal(); });
    modalMask.querySelector('.close-x').addEventListener('click', closeModal);
    document.body.appendChild(modalMask);
  }
  function openModal(cfg) {
    ensureMask();
    var inner = modalMask.querySelector('.modal-inner');
    var actions = (cfg.actions || []).map(function (a) {
      return '<button class="btn ' + (a.cls || '') + '" data-act>' + esc(a.label) + '</button>';
    }).join('');
    inner.innerHTML = '<h3>' + esc(cfg.title || '') + '</h3>' +
      '<div class="modal-body">' + (cfg.body || '') + '</div>' +
      (actions ? '<div class="modal-actions">' + actions + '</div>' : '');
    var btns = inner.querySelectorAll('[data-act]');
    (cfg.actions || []).forEach(function (a, i) {
      btns[i].addEventListener('click', function () { if (a.onClick) a.onClick(); });
    });
    modalMask.classList.add('open');
  }
  function closeModal() { if (modalMask) modalMask.classList.remove('open'); }
  function confirmDlg(cfg) {
    return new Promise(function (resolve) {
      openModal({
        title: cfg.title,
        body: cfg.body,
        actions: [
          { label: '取消', onClick: function () { closeModal(); resolve(false); } },
          { label: cfg.okLabel || '确认', cls: 'primary', onClick: function () { closeModal(); resolve(true); } }
        ]
      });
    });
  }

  /* ================= UI：顶部导航与钱包 ================= */
  var NAV_ITEMS = [
    { key: 'apps', href: './apps.html', icon: '🧭', label: '应用中心' },
    { key: 'music', href: './music.html', icon: '🎧', label: '音乐' },
    { key: 'words', href: './words.html', icon: '📖', label: '文字' },
    { key: 'games', href: './games.html', icon: '🎮', label: '游戏' },
    { key: 'video', href: './video.html', icon: '🎬', label: '视频' },
    { key: 'live', href: './live.html', icon: '📡', label: '直播' },
    { key: 'social', href: './social.html', icon: '💬', label: '社交' },
    { key: 'stage', href: './stage.html', icon: '🎪', label: '演出' },
    { key: 'nft', href: './nft.html', icon: '🖼️', label: 'NFT' },
    { key: 'storage', href: './storage.html', icon: '🗄️', label: '存储' },
    { key: 'compute', href: './compute.html', icon: '⚡', label: '算力' },
    { key: 'socialfi', href: './socialfi.html', icon: '🌠', label: '链上生态' },
    { key: 'agent', href: './agent.html', icon: '🤖', label: 'AI 创作者' }
  ];
  function updateWalletUI() {
    var chip = document.getElementById('walletChip');
    if (!chip) return;
    var text = chip.querySelector('.chip-text');
    var bal = chip.querySelector('.chip-bal');
    if (state.connected) {
      chip.classList.add('connected');
      text.textContent = shortAddr(state.addr) + ' · ' + (state.mode === 'node' ? '节点' : '演示');
      bal.textContent = fmt(state.balance) + ' NOVA';
    } else {
      chip.classList.remove('connected');
      text.textContent = '连接钱包';
      bal.textContent = '';
    }
  }
  function onWalletChipClick() {
    if (state.connected) {
      openModal({
        title: '已连接钱包',
        body: '<p>地址：<span class="mono">' + esc(state.addr) + '</span></p>' +
          '<p>余额：<span class="price">' + fmt(state.balance) + ' NOVA</span>（' +
          (state.mode === 'node' ? '节点模式 · 真实链上交易' : '演示模式 · 本地模拟交易') + '）</p>' +
          '<p class="dim">浏览器共 ' + wallets().length + ' 个账户，当前使用第 1 个。</p>',
        actions: [
          { label: '刷新余额', onClick: function () {
              refreshBalance().then(function () { toast('余额已刷新'); updateWalletUI(); closeModal(); });
            } },
          { label: '打开钱包页', cls: 'primary', onClick: function () { closeModal(); window.location.href = './wallet.html'; } },
          { label: '断开', cls: 'danger', onClick: function () { disconnect(); updateWalletUI(); closeModal(); toast('已断开连接', 'info'); } }
        ]
      });
    } else {
      openModal({
        title: '连接钱包',
        body: '<p>应用中心基于 Nova 钱包完成支付、收藏与创作。私钥只保存在你的浏览器，绝不外传。</p>' +
          '<div class="field mt"><label>导入已有私钥（可选，64 位 hex）</label>' +
          '<input id="importKeyInput" class="mono" placeholder="粘贴私钥…"></div>',
        actions: [
          { label: '前往钱包页创建', onClick: function () { closeModal(); window.location.href = './wallet.html'; } },
          { label: '立即创建演示钱包', cls: 'primary', onClick: function () {
              createDemoWallet().then(function () { updateWalletUI(); closeModal(); toast('演示钱包已创建，余额 1000 NOVA'); });
            } },
          { label: '导入私钥', cls: 'success', onClick: function () {
              var v = document.getElementById('importKeyInput').value;
              importPrivKey(v).then(function (r) {
                if (r.error) { toast(r.error, 'err'); return; }
                updateWalletUI(); closeModal(); toast('私钥导入成功');
              });
            } }
        ]
      });
    }
  }
  function renderTopbar() {
    var el = document.getElementById('topbar');
    if (!el) return;
    var links = NAV_ITEMS.map(function (n) {
      return '<a class="nav-link' + (n.key === state.active ? ' active' : '') + '" href="' + n.href + '">' +
        n.icon + ' ' + n.label + '</a>';
    }).join('');
    el.innerHTML =
      '<div class="topbar">' +
        '<a class="brand" href="./apps.html"><span class="logo">⬡</span><span>NOVA·应用中心</span></a>' +
        '<nav class="nav-scroll">' + links + '</nav>' +
        '<button class="wallet-chip" id="walletChip" title="Nova 钱包">' +
          '<span class="dot"></span><span class="chip-text">连接钱包</span><span class="chip-bal"></span>' +
        '</button>' +
      '</div>';
    document.getElementById('walletChip').addEventListener('click', onWalletChipClick);
    updateWalletUI();
  }
  function requireWallet() {
    if (state.connected) return Promise.resolve(true);
    return new Promise(function (resolve) {
      openModal({
        title: '需要连接钱包',
        body: '<p>此操作需要先连接 Nova 钱包。可直接创建演示钱包体验，或前往钱包页创建正式钱包。</p>',
        actions: [
          { label: '取消', onClick: function () { closeModal(); resolve(false); } },
          { label: '创建演示钱包', cls: 'primary', onClick: function () {
              createDemoWallet().then(function () { updateWalletUI(); closeModal(); toast('演示钱包已创建，余额 1000 NOVA'); resolve(true); });
            } },
          { label: '前往钱包页', cls: 'success', onClick: function () { closeModal(); window.location.href = './wallet.html'; resolve(false); } }
        ]
      });
    });
  }

  /* ================= SocialFi：链上生态 10 类玩法（演示 / 节点双模式） ================= */
  function sfEmpty() {
    return { fan_tokens: {}, revenue_shares: {}, achievements: {}, soulbound: {},
             markets: {}, blindboxes: {}, blind_reveals: {}, curations: {},
             graph_posts: {}, graph_follows: {}, bonds: {}, fractions: {},
             text_assets: {}, text_reputation: {}, text_contract: null,
             text_escrow: 0, text_reader: {}, events: [] };
  }
  function sfStore() { return lsGet(LS.socialfi, sfEmpty()); }
  function saveSfStore(s) { lsSet(LS.socialfi, s); }
  function sfEvent(s, op, id, summary) {
    s.events.unshift({ op: op, id: id, addr: state.asAddr || state.addr, ts: Date.now(), summary: summary || id });
    if (s.events.length > 80) s.events.length = 80;
  }
  function sfId(prefix, seedStr) { return prefix + demoHash(String(seedStr) + Date.now() + Math.random()).slice(2, 22); }
  function demoBal(addr) { var b = lsGet(LS.balances, {}); return b[addr] != null ? b[addr] : 0; }
  function demoSetBal(addr, amt) { var b = lsGet(LS.balances, {}); b[addr] = round4(amt); lsSet(LS.balances, b); }
  function demoTransfer(from, to, amt) {
    var b = lsGet(LS.balances, {});
    b[from] = round4((b[from] || 0) - amt);
    b[to] = round4((b[to] || 0) + amt);
    lsSet(LS.balances, b);
  }
  function demoLedger(from, to, amt, memo, app) {
    var l = lsGet(LS.ledger, []);
    l.unshift({ txid: demoHash(from + to + amt + memo + Date.now()), from: from, to: to, amount: amt,
                memo: memo, app: app || 'socialfi', ts: Date.now(), demo: true });
    lsSet(LS.ledger, l);
  }
  async function sfAction(op, fields, amount) {
    amount = Number(amount || 0);
    if (!state.connected) return { ok: false, error: '未连接钱包' };
    if (state.mode === 'demo') return sfDemoAction(op, fields || {}, amount);
    try {
      var pub = await getPubFromPriv(state.priv);
      var ts = Math.floor(Date.now() / 1000);
      var data = JSON.stringify(Object.assign({ op: op }, fields || {}));
      var amtStr = amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
      var sig = await signMsg(state.priv, state.addr + state.addr + amtStr + ts + '[]' + data + pub);
      var res = await api('/api/op', 'POST', {
        addr: state.addr, amount: amount, data: data, timestamp: ts,
        sender_public_key: pub, signature: sig
      });
      if (res && res.error) return { ok: false, error: res.error };
      await refreshBalance();
      return { ok: true, txid: res.txid, id: res.id, summary: res.summary };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  async function sfList(domain) {
    if (state.mode === 'node') { var d = await api('/api/socialfi/' + domain); return d || {}; }
    return sfStore();
  }
  function sfFanPriceAt(s, tid, qty) {
    var t = s.fan_tokens[tid];
    return round4(Number(t.price) * (1 + t.sold / t.supply) * (qty || 1));
  }
  function sfDemoAction(op, fields, amount) {
    var s = sfStore();
    var addr = state.asAddr || state.addr;
    if (op === 'nova:fan:issue') {
      var tid = sfId('fan_', addr + fields.symbol);
      s.fan_tokens[tid] = { id: tid, creator: addr, symbol: fields.symbol, name: fields.name,
        supply: Number(fields.supply), sold: 0, price: Number(fields.price), avatar_cid: fields.cid || '',
        created_at: Date.now(), holders: {}, proposals: {}, voted: {} };
      sfEvent(s, op, tid, '发行粉丝代币 ' + fields.symbol + ' · ' + fields.name);
      saveSfStore(s); return { ok: true, id: tid, demo: true };
    }
    if (op === 'nova:fan:buy') {
      var t = s.fan_tokens[fields.tid];
      if (!t) return { ok: false, error: '代币不存在' };
      var qty = Number(fields.qty);
      if (addr === t.creator) return { ok: false, error: '不能购买自己的代币' };
      if (t.sold + qty > t.supply) return { ok: false, error: '供应量不足' };
      var cost = sfFanPriceAt(s, fields.tid, qty);
      if (demoBal(addr) < cost) return { ok: false, error: '余额不足' };
      t.sold += qty; t.holders[addr] = (t.holders[addr] || 0) + qty;
      demoTransfer(addr, t.creator, cost);
      demoLedger(addr, t.creator, cost, '买入 ' + qty + ' 份 ' + t.symbol, 'socialfi');
      sfEvent(s, op, t.id, '买入 ' + qty + ' 份 ' + t.symbol);
      saveSfStore(s); refreshBalance(); return { ok: true, id: t.id, cost: cost, demo: true };
    }
    if (op === 'nova:fan:propose') {
      var t2 = s.fan_tokens[fields.tid];
      if (!t2 || (t2.holders[addr] || 0) < 1) return { ok: false, error: '需持有代币才能提案' };
      var pid = sfId('fp_', fields.tid + addr + fields.title);
      t2.proposals[pid] = { id: pid, proposer: addr, title: fields.title,
        closes_at: Date.now() + Number(fields.closes_in) * 1000, options: ['支持', '反对'], votes: [0, 0] };
      t2.voted[pid] = [];
      sfEvent(s, op, pid, '发起提案「' + fields.title + '」');
      saveSfStore(s); return { ok: true, id: pid, demo: true };
    }
    if (op === 'nova:fan:vote') {
      var t3 = s.fan_tokens[fields.tid];
      var prop = t3 && t3.proposals[fields.proposal_id];
      if (!t3 || !prop) return { ok: false, error: '提案不存在' };
      if ((t3.holders[addr] || 0) < 1) return { ok: false, error: '无投票权' };
      if ((t3.voted[fields.proposal_id] || []).indexOf(addr) >= 0) return { ok: false, error: '已投票' };
      if (Date.now() >= prop.closes_at) return { ok: false, error: '提案已结束' };
      prop.votes[Number(fields.option)] += t3.holders[addr];
      t3.voted[fields.proposal_id].push(addr);
      sfEvent(s, op, prop.id, '投票完成');
      saveSfStore(s); return { ok: true, id: prop.id, demo: true };
    }
    if (op === 'nova:rev:create') {
      var rid = sfId('rev_', addr + fields.name);
      s.revenue_shares[rid] = { id: rid, creator: addr, name: fields.name, desc: fields.desc || '',
        investors: {}, total_invested: 0, pool: 0, created_at: Date.now() };
      sfEvent(s, op, rid, '开设收益共享「' + fields.name + '」');
      saveSfStore(s); return { ok: true, id: rid, demo: true };
    }
    if (op === 'nova:rev:invest') {
      var r = s.revenue_shares[fields.rid];
      if (!r) return { ok: false, error: '收益共享不存在' };
      if (addr === r.creator) return { ok: false, error: '不能投资自己的项目' };
      var amt = Number(fields.amount);
      if (demoBal(addr) < amt) return { ok: false, error: '余额不足' };
      r.investors[addr] = round4((r.investors[addr] || 0) + amt);
      r.total_invested = round4(r.total_invested + amt);
      demoTransfer(addr, r.creator, amt);
      demoLedger(addr, r.creator, amt, '投资「' + r.name + '」', 'socialfi');
      sfEvent(s, op, r.id, '投资 ' + amt + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: r.id, demo: true };
    }
    if (op === 'nova:rev:royalty') {
      var r2 = s.revenue_shares[fields.rid];
      if (!r2 || addr !== r2.creator) return { ok: false, error: '仅创作者可注入版税' };
      var amt2 = Number(fields.amount);
      if (demoBal(addr) < amt2) return { ok: false, error: '余额不足' };
      r2.pool = round4(r2.pool + amt2);
      demoSetBal(addr, demoBal(addr) - amt2);
      demoLedger(addr, addr, amt2, '注入版税「' + r2.name + '」', 'socialfi');
      sfEvent(s, op, r2.id, '注入版税收益 ' + amt2 + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: r2.id, demo: true };
    }
    if (op === 'nova:rev:claim') {
      var r3 = s.revenue_shares[fields.rid];
      if (!r3 || !r3.investors[addr]) return { ok: false, error: '无投资记录' };
      var total = 0; Object.keys(r3.investors).forEach(function (k) { total += r3.investors[k]; });
      if (total <= 0 || r3.pool <= 0) return { ok: false, error: '无可领取收益' };
      var payout = round4(r3.pool * r3.investors[addr] / total);
      if (payout <= 0) return { ok: false, error: '无可领取收益' };
      r3.pool = round4(r3.pool - payout);
      demoSetBal(addr, demoBal(addr) + payout);
      demoLedger(TREASURY, addr, payout, '领取收益分成「' + r3.name + '」', 'socialfi');
      sfEvent(s, op, r3.id, '领取收益分成 ' + payout + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: r3.id, payout: payout, demo: true };
    }
    if (op === 'nova:ach:issue') {
      var aid = sfId('ach_', addr + fields.title);
      s.achievements[aid] = { id: aid, issuer: addr, title: fields.title, desc: fields.desc || '',
        badge: fields.badge || '🏅', created_at: Date.now() };
      s.soulbound[aid] = {};
      sfEvent(s, op, aid, '创建成就「' + fields.title + '」');
      saveSfStore(s); return { ok: true, id: aid, demo: true };
    }
    if (op === 'nova:ach:award') {
      var a = s.achievements[fields.aid];
      if (!a) return { ok: false, error: '成就不存在' };
      s.soulbound[fields.aid][fields.target] = Date.now();
      sfEvent(s, op, fields.aid, '颁发成就 → ' + String(fields.target).slice(0, 10) + '…');
      saveSfStore(s); return { ok: true, id: fields.aid, demo: true };
    }
    if (op === 'nova:market:create') {
      var mid = sfId('mkt_', addr + fields.question);
      s.markets[mid] = { id: mid, creator: addr, oracle: fields.oracle || addr, question: fields.question,
        options: (fields.options || []).slice(), closes_at: Date.now() + Number(fields.closes_in) * 1000,
        pool: (fields.options || []).map(function () { return 0; }), bets: {}, settled: false,
        outcome: null, created_at: Date.now() };
      sfEvent(s, op, mid, '开设预测市场「' + String(fields.question).slice(0, 24) + '」');
      saveSfStore(s); return { ok: true, id: mid, demo: true };
    }
    if (op === 'nova:market:bet') {
      var m = s.markets[fields.mid];
      if (!m || m.settled || Date.now() >= m.closes_at) return { ok: false, error: '市场不可投注' };
      var amt3 = Number(fields.amount);
      if (demoBal(addr) < amt3) return { ok: false, error: '余额不足' };
      m.pool[Number(fields.option)] = round4(m.pool[Number(fields.option)] + amt3);
      m.bets[addr] = m.bets[addr] || {};
      m.bets[addr][Number(fields.option)] = round4((m.bets[addr][Number(fields.option)] || 0) + amt3);
      demoSetBal(addr, demoBal(addr) - amt3);
      demoLedger(addr, m.creator, amt3, '押注「' + m.question.slice(0, 16) + '」', 'socialfi');
      sfEvent(s, op, m.id, '押注 ' + amt3 + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: m.id, demo: true };
    }
    if (op === 'nova:market:settle') {
      var m2 = s.markets[fields.mid];
      if (!m2 || m2.settled) return { ok: false, error: '市场不可结算' };
      if (addr !== m2.oracle) return { ok: false, error: '仅预言机可结算' };
      var outcome = Number(fields.outcome);
      var total2 = m2.pool.reduce(function (a, b) { return a + b; }, 0);
      var winPool = m2.pool[outcome];
      m2.settled = true; m2.outcome = outcome;
      if (winPool > 0 && total2 > 0) {
        var fee = round4(total2 * 0.02);
        var b4 = lsGet(LS.balances, {});
        b4[TREASURY] = round4((b4[TREASURY] || 0) + fee);
        Object.keys(m2.bets).forEach(function (ba) {
          var bet = m2.bets[ba][outcome] || 0;
          if (bet > 0) {
            var payout2 = round4(bet / winPool * (total2 - fee));
            b4[ba] = round4((b4[ba] || 0) + payout2);
            demoLedger(TREASURY, ba, payout2, '预测市场结算「' + m2.question.slice(0, 16) + '」', 'socialfi');
          }
        });
        lsSet(LS.balances, b4);
      }
      sfEvent(s, op, m2.id, '结算结果：' + m2.options[outcome]);
      saveSfStore(s); refreshBalance(); return { ok: true, id: m2.id, demo: true };
    }
    return sfDemoAction2(op, fields, amount);
  }
  function sfBlindTier(box, seed, addr, nonce) {
    var rand = parseInt(sha3_256(seed + addr + String(nonce)).slice(0, 16), 16);
    var totalW = box.tiers.reduce(function (a, t) { return a + Number(t.weight); }, 0);
    var pos = rand % totalW;
    for (var i = 0; i < box.tiers.length; i++) {
      pos -= Number(box.tiers[i].weight);
      if (pos < 0) return box.tiers[i];
    }
    return box.tiers[box.tiers.length - 1];
  }
  function sfDemoAction2(op, fields, amount) {
    var s = sfStore();
    var addr = state.addr;
    if (op === 'nova:blind:create') {
      var seed = bytesToHex(randomBytes(32));
      var commit = sha3_256(seed);
      var bid = sfId('box_', addr + fields.name);
      s.blindboxes[bid] = { id: bid, creator: addr, name: fields.name, price: Number(fields.price),
        commit: commit, tiers: (fields.tiers || []).slice(), _seed: seed, created_at: Date.now(), draws: {} };
      sfEvent(s, op, bid, '上架盲盒「' + fields.name + '」');
      saveSfStore(s); return { ok: true, id: bid, commit: commit, demo: true };
    }
    if (op === 'nova:blind:reveal') {
      var box = s.blindboxes[fields.bid];
      if (!box) return { ok: false, error: '盲盒不存在' };
      if (s.blind_reveals[fields.bid]) return { ok: false, error: '已揭示' };
      if (sha3_256(String(fields.seed || '')) !== box.commit) return { ok: false, error: '种子校验失败' };
      s.blind_reveals[fields.bid] = String(fields.seed);
      sfEvent(s, op, box.id, '盲盒种子已揭示（可验证随机）');
      saveSfStore(s); return { ok: true, id: box.id, demo: true };
    }
    if (op === 'nova:blind:open') {
      var box2 = s.blindboxes[fields.bid];
      if (!box2 || !s.blind_reveals[fields.bid]) return { ok: false, error: '盲盒未揭示或不存在' };
      var draws = Number(fields.draws || 1);
      var cost = round4(Number(box2.price) * draws);
      if (demoBal(addr) < cost) return { ok: false, error: '余额不足' };
      var nonce = box2.draws[addr] || 0;
      demoSetBal(addr, demoBal(addr) - cost);
      demoSetBal(box2.creator, demoBal(box2.creator) + cost);
      var won = [];
      for (var i = 0; i < draws; i++) {
        var tier = sfBlindTier(box2, s.blind_reveals[fields.bid], addr, nonce + i);
        if (tier.reward_type === 'nova') {
          demoSetBal(addr, demoBal(addr) + Number(tier.reward_amount || 0));
          won.push({ tier: tier.name, type: 'nova', amount: Number(tier.reward_amount || 0) });
        } else {
          var aid = sfId('ach_', box2.id + tier.name + addr + (nonce + i));
          if (!s.achievements[aid]) s.achievements[aid] = { id: aid, issuer: box2.creator,
            title: '盲盒·' + tier.name, desc: tier.reward_cid || '', badge: '🎁', created_at: Date.now() };
          s.soulbound[aid] = s.soulbound[aid] || {};
          s.soulbound[aid][addr] = Date.now();
          won.push({ tier: tier.name, type: 'badge', aid: aid });
        }
      }
      box2.draws[addr] = nonce + draws;
      sfEvent(s, op, box2.id, '开盒 ' + draws + ' 次');
      saveSfStore(s); refreshBalance(); return { ok: true, id: box2.id, won: won, demo: true };
    }
    if (op === 'nova:curate:create') {
      var cur = sfId('cur_', addr + fields.title);
      s.curations[cur] = { id: cur, curator: addr, title: fields.title, items: (fields.items || []).slice(),
        price: Number(fields.price), owners: [addr], cover_cid: fields.cid || '', created_at: Date.now() };
      sfEvent(s, op, cur, '创建策展「' + fields.title + '」');
      saveSfStore(s); return { ok: true, id: cur, demo: true };
    }
    if (op === 'nova:curate:buy') {
      var c = s.curations[fields.cur_id];
      if (!c) return { ok: false, error: '策展不存在' };
      if (addr === c.curator || (c.owners || []).indexOf(addr) >= 0) return { ok: false, error: '已是所有者或创建者' };
      var price = Number(c.price);
      if (demoBal(addr) < price) return { ok: false, error: '余额不足' };
      demoSetBal(addr, demoBal(addr) - price);
      demoSetBal(c.curator, demoBal(c.curator) + round4(price * 0.9));
      demoSetBal(TREASURY, demoBal(TREASURY) + round4(price * 0.1));
      c.owners.push(addr);
      demoLedger(addr, c.curator, price, '收藏策展「' + c.title + '」', 'socialfi');
      sfEvent(s, op, c.id, '收藏策展「' + c.title + '」');
      saveSfStore(s); refreshBalance(); return { ok: true, id: c.id, demo: true };
    }
    if (op === 'nova:graph:post') {
      var pid = sfId('p_', addr + fields.content);
      s.graph_posts[pid] = { id: pid, addr: addr, content: fields.content, cid: fields.cid || '',
        likes: [], ts: Date.now() };
      sfEvent(s, op, pid, String(fields.content).slice(0, 20));
      saveSfStore(s); return { ok: true, id: pid, demo: true };
    }
    if (op === 'nova:graph:follow') {
      if (String(fields.target) === addr) return { ok: false, error: '不能关注自己' };
      if ((s.graph_follows[addr] || []).indexOf(fields.target) >= 0) return { ok: false, error: '已关注' };
      s.graph_follows[addr] = s.graph_follows[addr] || [];
      s.graph_follows[addr].push(fields.target);
      sfEvent(s, op, fields.target, '关注 ' + String(fields.target).slice(0, 10) + '…');
      saveSfStore(s); return { ok: true, id: fields.target, demo: true };
    }
    if (op === 'nova:graph:like') {
      var p = s.graph_posts[fields.pid];
      if (!p) return { ok: false, error: '动态不存在' };
      if ((p.likes || []).indexOf(addr) >= 0) return { ok: false, error: '已点赞' };
      p.likes.push(addr);
      sfEvent(s, op, p.id, '点赞');
      saveSfStore(s); return { ok: true, id: p.id, demo: true };
    }
    if (op === 'nova:bond:issue') {
      var bid2 = sfId('bnd_', addr + fields.name);
      s.bonds[bid2] = { id: bid2, creator: addr, name: fields.name, principal: Number(fields.principal),
        rate: Number(fields.rate), term_days: Number(fields.term_days), sold: {}, pool: 0,
        settled: false, created_at: Date.now(), matures_at: Date.now() + Number(fields.term_days) * 86400000 };
      sfEvent(s, op, bid2, '发行债券「' + fields.name + '」');
      saveSfStore(s); return { ok: true, id: bid2, demo: true };
    }
    if (op === 'nova:bond:buy') {
      var b = s.bonds[fields.bid];
      if (!b || b.settled || Date.now() >= b.matures_at) return { ok: false, error: '债券不可认购' };
      if (addr === b.creator) return { ok: false, error: '不能认购自己的债券' };
      var amt4 = Number(fields.amount);
      if (demoBal(addr) < amt4) return { ok: false, error: '余额不足' };
      b.sold[addr] = round4((b.sold[addr] || 0) + amt4);
      demoTransfer(addr, b.creator, amt4);
      demoLedger(addr, b.creator, amt4, '认购债券「' + b.name + '」', 'socialfi');
      sfEvent(s, op, b.id, '认购债券 ' + amt4 + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: b.id, demo: true };
    }
    if (op === 'nova:bond:fund') {
      var b2 = s.bonds[fields.bid];
      if (!b2 || addr !== b2.creator) return { ok: false, error: '仅创作者可注资' };
      var amt5 = Number(fields.amount);
      if (demoBal(addr) < amt5) return { ok: false, error: '余额不足' };
      b2.pool = round4(b2.pool + amt5);
      demoSetBal(addr, demoBal(addr) - amt5);
      demoLedger(addr, addr, amt5, '注入偿债池「' + b2.name + '」', 'socialfi');
      sfEvent(s, op, b2.id, '注入偿债池 ' + amt5 + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: b2.id, demo: true };
    }
    if (op === 'nova:bond:redeem') {
      var b3 = s.bonds[fields.bid];
      if (!b3 || b3.settled) return { ok: false, error: '债券不可赎回' };
      if (Date.now() < b3.matures_at) return { ok: false, error: '未到到期日' };
      var invested = b3.sold[addr] || 0;
      if (invested <= 0 || b3.pool <= 0) return { ok: false, error: '无可赎回份额' };
      var years = b3.term_days / 365;
      var totalOwed = 0;
      Object.keys(b3.sold).forEach(function (k) { totalOwed += b3.sold[k] * (1 + b3.rate * years); });
      var factor = Math.min(1, b3.pool / totalOwed);
      var payout = round4(invested * (1 + b3.rate * years) * factor);
      b3.pool = round4(b3.pool - payout);
      b3.sold[addr] = 0;
      demoSetBal(addr, demoBal(addr) + payout);
      demoLedger(TREASURY, addr, payout, '赎回债券「' + b3.name + '」', 'socialfi');
      var settled = true;
      Object.keys(b3.sold).forEach(function (k) { if (b3.sold[k] > 0) settled = false; });
      if (settled || b3.pool <= 0) b3.settled = true;
      sfEvent(s, op, b3.id, '赎回债券 ' + payout + ' NOVA');
      saveSfStore(s); refreshBalance(); return { ok: true, id: b3.id, payout: payout, demo: true };
    }
    if (op === 'nova:frac:split') {
      var fid = sfId('fr_', addr + fields.nft_ref);
      s.fractions[fid] = { id: fid, owner: addr, name: fields.name, nft_ref: fields.nft_ref,
        supply: Number(fields.supply), owner_hold: Number(fields.supply), price_per: Number(fields.price_per),
        fractions: {}, created_at: Date.now() };
      s.fractions[fid].fractions[addr] = Number(fields.supply);
      sfEvent(s, op, fid, '拆分 NFT「' + fields.name + '」为 ' + fields.supply + ' 份');
      saveSfStore(s); return { ok: true, id: fid, demo: true };
    }
    if (op === 'nova:frac:buy') {
      var f = s.fractions[fields.fid];
      if (!f) return { ok: false, error: '碎片不存在' };
      if (addr === f.owner) return { ok: false, error: '不能购买自己的碎片' };
      var qty2 = Number(fields.qty);
      if (qty2 > f.owner_hold) return { ok: false, error: '超出可售份额' };
      var cost2 = round4(qty2 * Number(f.price_per));
      if (demoBal(addr) < cost2) return { ok: false, error: '余额不足' };
      f.owner_hold -= qty2;
      f.fractions[addr] = (f.fractions[addr] || 0) + qty2;
      demoTransfer(addr, f.owner, cost2);
      demoLedger(addr, f.owner, cost2, '购买 ' + qty2 + ' 份碎片「' + f.name + '」', 'socialfi');
      sfEvent(s, op, f.id, '购买 ' + qty2 + ' 份碎片');
      saveSfStore(s); refreshBalance(); return { ok: true, id: f.id, demo: true };
    }
    if (op.indexOf('nova:ai:') === 0) return sfAiDemoAction(op, fields, amount);
    if (op.indexOf('nova:text:') === 0) return sfTextDemoAction(op, fields, amount);
    if (op.indexOf('nova:storage:') === 0) return demoStorageOp(op, fields, amount);
    if (op.indexOf('nova:compute:') === 0) return demoComputeOp(op, fields, amount);
    return { ok: false, error: '未知操作' };
  }
  /* ================= 文本市场：AES-256-GCM + P-256 ECIES（WebCrypto） ================= */
  var TEXT_ECIES_TAG = 'nova-text-key-v1';
  var TEXT_CIPHER_TAG = 'nova-text-aes256-gcm';
  var TEXT_HKDF_INFO = utf8ToBytes('nova:text:key');
  function textCryptoOk() { return !!(window.crypto && window.crypto.subtle && crypto.subtle.importKey); }
  function bytesToAb(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
  function abToBytes(ab) { return new Uint8Array(ab); }
  async function hkdf256(ikmBytes) {
    var key = await crypto.subtle.importKey('raw', bytesToAb(ikmBytes), 'HKDF', false, ['deriveBits']);
    var salt = new Uint8Array(32);
    var bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bytesToAb(salt), info: bytesToAb(TEXT_HKDF_INFO) }, key, 256);
    return abToBytes(bits);
  }
  async function importEcdhPub(pubHex) {
    return crypto.subtle.importKey('raw', bytesToAb(hexToBytes(pubHex)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  }
  async function ecdhShared(myKey, peerPub) {
    var bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPub }, myKey, 256);
    return abToBytes(bits);
  }
  async function aesGcmEncrypt(keyBytes, ivBytes, dataBytes) {
    var key = await crypto.subtle.importKey('raw', bytesToAb(keyBytes), 'AES-GCM', false, ['encrypt']);
    return abToBytes(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytesToAb(ivBytes) }, key, bytesToAb(dataBytes)));
  }
  async function aesGcmDecrypt(keyBytes, ivBytes, ctBytes) {
    var key = await crypto.subtle.importKey('raw', bytesToAb(keyBytes), 'AES-GCM', false, ['decrypt']);
    return abToBytes(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesToAb(ivBytes) }, key, bytesToAb(ctBytes)));
  }
  /* ECIES 信封：{v, tag, curve:'P-256', epk, iv, ct}；明文/密文均为 hex */
  async function textEciesEncrypt(recipientPubHex, plaintextHex) {
    var eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var peer = await importEcdhPub(recipientPubHex);
    var shared = await ecdhShared(eph.privateKey, peer);
    var key = await hkdf256(shared);
    var iv = randomBytes(12);
    var ct = await aesGcmEncrypt(key, iv, hexToBytes(plaintextHex));
    var epkRaw = await crypto.subtle.exportKey('raw', eph.publicKey);
    return { v: 1, tag: TEXT_ECIES_TAG, curve: 'P-256', epk: bytesToHex(abToBytes(epkRaw)), iv: bytesToHex(iv), ct: bytesToHex(ct) };
  }
  async function textEciesDecrypt(privJwk, env) {
    var priv = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var peer = await importEcdhPub(env.epk);
    var shared = await ecdhShared(priv, peer);
    var key = await hkdf256(shared);
    var pt = await aesGcmDecrypt(key, hexToBytes(env.iv), hexToBytes(env.ct));
    return bytesToHex(pt);
  }
  /* 作者：AES-256 加密正文 -> {keyHex, cipherData} */
  async function textEncryptBody(body) {
    var key = randomBytes(32);
    var iv = randomBytes(12);
    var ct = await aesGcmEncrypt(key, iv, utf8ToBytes(body));
    return { keyHex: bytesToHex(key), cipherData: JSON.stringify({ v: 1, tag: TEXT_CIPHER_TAG, iv: bytesToHex(iv), ct: bytesToHex(ct) }) };
  }
  async function textDecryptBody(keyHex, cipherData) {
    var env = JSON.parse(cipherData);
    var pt = await aesGcmDecrypt(hexToBytes(keyHex), hexToBytes(env.iv), hexToBytes(env.ct));
    return new TextDecoder().decode(pt);
  }
  /* 读者加密钥（P-256）：demo 本地保存 JWK，节点模式把公钥随购买交易提交 */
  async function ensureTextReader(addr) {
    var s = sfStore();
    s.text_reader = s.text_reader || {};
    if (s.text_reader[addr]) return s.text_reader[addr];
    if (!textCryptoOk()) return null;
    var kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    var raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    var rec = { jwk: jwk, pub: bytesToHex(abToBytes(raw)) };
    s.text_reader[addr] = rec;
    saveSfStore(s);
    return rec;
  }
  /* 文本合约公钥：节点模式取链上 /api/text/key，演示模式用本地 demo 合约 */
  async function textContractPub() {
    if (state.mode === 'node') {
      var d = await api('/api/text/key');
      return (d && d.public_key) || null;
    }
    var s = sfStore();
    if (s.text_contract && s.text_contract.pub) return s.text_contract.pub;
    if (!textCryptoOk()) return null;
    var kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    var raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    s.text_contract = { jwk: jwk, pub: bytesToHex(abToBytes(raw)) };
    saveSfStore(s);
    return s.text_contract.pub;
  }
  function sfTextRep(addr) { var s = sfStore(); return (s.text_reputation && s.text_reputation[addr]) || 0; }
  function sfTextBumpRep(addr, delta) {
    var s = sfStore();
    s.text_reputation = s.text_reputation || {};
    var v = Math.max(0, Math.min(100, (s.text_reputation[addr] || 0) + delta));
    s.text_reputation[addr] = v;
    saveSfStore(s);
  }
  function sfTextDepositFor(tier, rep) {
    var base = { basic: 10, advanced: 100, pro: 1000 }[tier] || 10;
    var discount = 0.5 * Math.min(1, (rep || 0) / 80);
    return round4(base * (1 - discount));
  }
  function sfTextIsValidatorDemo(addr) {
    var s = sfStore();
    for (var i = 0; i < DEMO_CREATORS.length; i++) { if (DEMO_CREATORS[i].addr === addr) return true; }
    if (sfTextRep(addr) >= 70) return true;
    if (demoBal(addr) >= 100) return true;   // 演示：余额 >= 100 NOVA 视同质押验证者
    return sfReputation(addr).score >= 70;
  }
  function sfTextSettleDemo(a) {
    var dis = a.dispute;
    if (!dis || dis.settled) return;
    var voters = Object.keys(dis.voters), n = voters.length, b = 0, s = 0;
    voters.forEach(function (v) { if (dis.voters[v] === 'buyer') b++; else if (dis.voters[v] === 'seller') s++; });
    if (n < 3) { if (Date.now() - dis.started_at > 14 * 86400000) sfTextExecuteDemo(a, 'seller'); return; }
    if (!dis.escalated) {
      if (n >= 3 && Math.max(b, s) * 3 >= 2 * n) { sfTextExecuteDemo(a, b > s ? 'buyer' : 'seller'); return; }
      dis.escalated = true;
      return;
    }
    if (n >= 7) sfTextExecuteDemo(a, b > s ? 'buyer' : 'seller');
  }
  function sfTextExecuteDemo(a, winner) {
    var s = sfStore();
    var dis = a.dispute;
    var escrowAddr = '0x_text_escrow';
    if (winner === 'buyer') {
      var comp = round4(a.deposit * 0.5);
      var forfeit = round4(a.deposit - comp);
      demoTransfer(escrowAddr, dis.complainant, comp);
      demoTransfer(escrowAddr, TREASURY, forfeit);
      sfTextBumpRep(a.author, -20);
      sfTextBumpRep(dis.complainant, 5);
    } else {
      demoTransfer(escrowAddr, a.author, a.deposit);
    }
    Object.keys(dis.voters).forEach(function (v) { if (dis.voters[v] === winner) sfTextBumpRep(v, 3); });
    dis.settled = true;
    dis.outcome = winner;
    a.deposit_frozen = false;
    a.deposit_released = true;
    s.text_escrow = round4(Math.max(0, (s.text_escrow || 0) - a.deposit));
    saveSfStore(s);
  }
  function sfTextDemoAction(op, fields, amount) {
    var s = sfStore();
    var addr = state.asAddr || state.addr;
    var escrowAddr = '0x_text_escrow';
    s.text_assets = s.text_assets || {};
    s.text_reputation = s.text_reputation || {};
    s.text_escrow = s.text_escrow || 0;
    s.text_reader = s.text_reader || {};
    function depositReq() { return sfTextDepositFor(fields.tier || 'basic', sfTextRep(addr)); }
    function demoAsset(id) { return s.text_assets[id]; }
    if (op === 'nova:text:create') {
      return (async function () {
        if (!textCryptoOk()) return { ok: false, error: '当前环境不支持 WebCrypto，无法进行加密发布' };
        var deposit = depositReq();
        if (demoBal(addr) < deposit) return { ok: false, error: '余额不足（需质押保证金 ' + deposit + ' NOVA）' };
        var contractPub = await textContractPub();
        if (!contractPub) return { ok: false, error: '无法获取文本合约公钥' };
        s = sfStore();   // 重新读取：textContractPub 已把 demo 合约密钥写入存储
        var tid = 'txt_' + demoHash(addr + fields.title + Date.now() + Math.random()).slice(2, 22);
        var ident = fields.identifier || ('t-' + demoHash(addr + fields.title + Date.now()).slice(2, 18));
        var asset = { id: tid, identifier: ident, author: addr, title: fields.title,
          visibility: fields.visibility, price: Number(fields.price), tier: fields.tier || 'basic',
          series: !!fields.series, exposure_weight: fields.tier === 'pro' ? 1.5 : 1,
          deposit: deposit, deposit_frozen: false, deposit_released: false, status: 'listed',
          buyers: [], keys: {}, content: '', cipher_cid: '', cipher_data: '', key_cipher: {},
          dispute: null, releasable_at: 0, created_at: Date.now(), cid: '' };
        if (fields.visibility === 'public') {
          asset.content = fields.content;
        } else {
          var enc = await textEncryptBody(fields.content);
          asset.key_cipher = await textEciesEncrypt(contractPub, enc.keyHex);
          asset.cipher_data = enc.cipherData;
        }
        demoTransfer(addr, escrowAddr, deposit);
        s.text_escrow = round4((s.text_escrow || 0) + deposit);
        s.text_assets[tid] = asset;
        sfEvent(s, op, tid, (fields.visibility === 'sealed' ? '加密发布' : '发布') + '「' + fields.title + '」');
        saveSfStore(s);
        refreshBalance();
        return { ok: true, id: tid, deposit: deposit, demo: true };
      })();
    }
    if (op === 'nova:text:buy') {
      return (async function () {
        var a = demoAsset(fields.text_id);
        if (!a) return { ok: false, error: '文本不存在' };
        if (addr === a.author) return { ok: false, error: '不能购买自己的作品' };
        if (a.status === 'unlisted' || a.status === 'destroyed') return { ok: false, error: '该文本已下架' };
        if (a.buyers.indexOf(addr) >= 0) return { ok: false, error: '已购买过该文本' };
        var price = Number(a.price);
        if (demoBal(addr) < price) return { ok: false, error: '余额不足' };
        if (a.visibility === 'sealed' && !textCryptoOk()) return { ok: false, error: '当前环境不支持 WebCrypto，无法解锁密文' };
        demoTransfer(addr, a.author, round4(price * 0.9));
        demoTransfer(addr, TREASURY, round4(price * 0.1));
        if (a.visibility === 'sealed') {
          var reader = await ensureTextReader(addr);
          if (!reader) return { ok: false, error: '无法生成读者密钥' };
          s = sfStore();   // 重新读取：读者密钥已写入存储
          a = demoAsset(fields.text_id);
          if (a.buyers.indexOf(addr) < 0) a.buyers.push(addr);
          var kHex = await textEciesDecrypt(s.text_contract.jwk, a.key_cipher);
          a.keys[addr] = await textEciesEncrypt(reader.pub, kHex);
        } else {
          a.buyers.push(addr);
        }
        sfTextBumpRep(a.author, 2);
        sfTextBumpRep(addr, 1);
        sfEvent(s, op, a.id, '购买「' + a.title + '」' + price + ' NOVA');
        saveSfStore(s);
        refreshBalance();
        return { ok: true, id: a.id, demo: true };
      })();
    }
    if (op === 'nova:text:unlist') {
      var a1 = demoAsset(fields.text_id);
      if (!a1 || addr !== a1.author || a1.status !== 'listed' || a1.dispute) return { ok: false, error: '无法下架' };
      a1.status = 'unlisted';
      a1.releasable_at = Date.now() + 7 * 86400000;
      sfEvent(s, op, a1.id, '下架「' + a1.title + '」');
      saveSfStore(s);
      return { ok: true, id: a1.id, demo: true };
    }
    if (op === 'nova:text:destroy') {
      var a2 = demoAsset(fields.text_id);
      if (!a2 || addr !== a2.author || a2.status === 'destroyed' || a2.dispute) return { ok: false, error: '无法销毁' };
      a2.status = 'destroyed';
      a2.releasable_at = Date.now();
      if (!a2.deposit_released) {
        demoTransfer(escrowAddr, addr, a2.deposit);
        s.text_escrow = round4(Math.max(0, (s.text_escrow || 0) - a2.deposit));
        a2.deposit_released = true;
      }
      sfEvent(s, op, a2.id, '销毁密文 NFT「' + a2.title + '」');
      saveSfStore(s);
      return { ok: true, id: a2.id, demo: true };
    }
    if (op === 'nova:text:release_deposit') {
      var a3 = demoAsset(fields.text_id);
      if (!a3 || addr !== a3.author || a3.deposit_released || a3.dispute) return { ok: false, error: '无法退回保证金' };
      if ((a3.status !== 'unlisted' && a3.status !== 'destroyed') || Date.now() < (a3.releasable_at || 0)) {
        return { ok: false, error: '下架后需等待 7 天无投诉才能退回' };
      }
      demoTransfer(escrowAddr, addr, a3.deposit);
      s.text_escrow = round4(Math.max(0, (s.text_escrow || 0) - a3.deposit));
      a3.deposit_released = true;
      sfEvent(s, op, a3.id, '退回保证金 ' + a3.deposit + ' NOVA');
      saveSfStore(s);
      return { ok: true, id: a3.id, demo: true };
    }
    if (op === 'nova:text:complain') {
      var a4 = demoAsset(fields.text_id);
      if (!a4 || a4.visibility !== 'sealed' || addr === a4.author || a4.dispute ||
          a4.status === 'destroyed' || a4.buyers.indexOf(addr) < 0) return { ok: false, error: '无法投诉' };
      a4.dispute = { complainant: addr, voters: {}, started_at: Date.now(), escalated: false, settled: false, outcome: null };
      a4.deposit_frozen = true;
      sfEvent(s, op, a4.id, '投诉「' + a4.title + '」货不对板');
      saveSfStore(s);
      return { ok: true, id: a4.id, demo: true };
    }
    if (op === 'nova:text:vote') {
      var a5 = demoAsset(fields.text_id);
      var dis5 = a5 && a5.dispute;
      if (!dis5 || dis5.settled) return { ok: false, error: '该纠纷不存在或已结案' };
      if (['buyer', 'seller', 'abstain'].indexOf(fields.support) < 0) return { ok: false, error: '无效票型' };
      if (dis5.voters[addr]) return { ok: false, error: '已投过票' };
      if (!sfTextIsValidatorDemo(addr)) return { ok: false, error: '你不是社区验证者（演示：余额 >= 100 NOVA 或入驻作者可投票）' };
      dis5.voters[addr] = fields.support;
      sfTextSettleDemo(a5);
      sfEvent(s, op, a5.id, '仲裁投票（' + fields.support + '）');
      saveSfStore(s);
      refreshBalance();
      return { ok: true, id: a5.id, demo: true };
    }
    return { ok: false, error: '未知文本操作' };
  }
  async function seedTextDemo() {
    var s = sfStore();
    if (!s.text_assets || Object.keys(s.text_assets).length) return;
    if (!textCryptoOk()) return;
    var contractPub = await textContractPub();
    if (!contractPub) return;
    s = sfStore();   // 重新读取：textContractPub 已把 demo 合约密钥写入存储
    var seed = [
      { id: 'txt_demo1', author: DEMO_CREATORS[1].addr, title: '星尘手记 · 加密篇', identifier: 'NOVA-SECRET-01', price: 3, tier: 'advanced', age: 2,
        content: '有些话只能写给愿意支付时间的人。\n这封信在链上加密，密钥由文本合约托管。\n你支付的每一枚 NOVA，90% 直接支持作者，10% 进入生态基金。' },
      { id: 'txt_demo2', author: DEMO_CREATORS[3].addr, title: '雨夜密码', identifier: 'RAIN-2049', price: 1, tier: 'basic', age: 1,
        content: '雨是城市给失语者的密码。\n我把它写进密文，等你来解。' }
    ];
    for (var i = 0; i < seed.length; i++) {
      var d = seed[i];
      var enc = await textEncryptBody(d.content);
      var kc = await textEciesEncrypt(contractPub, enc.keyHex);
      s.text_assets[d.id] = { id: d.id, identifier: d.identifier, author: d.author, title: d.title,
        visibility: 'sealed', price: d.price, tier: d.tier, series: false, exposure_weight: d.tier === 'pro' ? 1.5 : 1,
        deposit: sfTextDepositFor(d.tier, 0), deposit_frozen: false, deposit_released: false, status: 'listed',
        buyers: [], keys: {}, content: '', cipher_cid: '', cipher_data: enc.cipherData, key_cipher: kc,
        dispute: null, releasable_at: 0, created_at: Date.now() - d.age * 86400000, cid: '' };
    }
    saveSfStore(s);
  }

  /* ================= AI 创作者：链上数字生命体（演示 / 节点双模式） ================= */
  function aiEmpty() {
    return { creators: {}, wallets: {}, events: [] };
  }
  function aiStore() { return lsGet(LS.ai, aiEmpty()); }
  function saveAiStore(s) { lsSet(LS.ai, s); }
  function aiDay() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function aiBudgetState(identity) {
    var day = aiDay();
    var win = identity.daily_spend || {};
    var spent = win.date === day ? Number(win.spent || 0) : 0;
    return { date: day, budget: Number(identity.daily_budget || 0), spent: round4(spent),
             remaining: round4(Math.max(0, Number(identity.daily_budget || 0) - spent)),
             status: identity.status };
  }
  function aiCanSpend(identity, amount) {
    if (!identity) return true;
    if (identity.status !== 'active') return false;
    var st = aiBudgetState(identity);
    return st.spent + Number(amount || 0) <= st.budget + 1e-9;
  }
  function aiRecordSpend(s, addr, amount) {
    var id = s.creators[addr];
    if (!id) return;
    var day = aiDay();
    var win = id.daily_spend || {};
    if (win.date !== day) win = { date: day, spent: 0 };
    win.spent = round4(Number(win.spent || 0) + Number(amount || 0));
    id.daily_spend = win;
  }
  function aiEvent(s, op, id, summary) {
    s.events.unshift({ op: op, id: id, addr: state.asAddr || state.addr, ts: Date.now(), summary: summary || id });
    if (s.events.length > 80) s.events.length = 80;
  }
  function sfAiDemoAction(op, fields, amount) {
    var s = aiStore();
    var addr = state.asAddr || state.addr;
    if (op === 'nova:ai:register') {
      var name = String(fields.name || '').trim();
      var owner = String(fields.owner || '').trim();
      var budget = Number(fields.daily_budget);
      if (!name || name.length > 64) return { ok: false, error: '名称需为 1-64 字符' };
      if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return { ok: false, error: 'owner 地址格式错误' };
      if (!(budget >= 0.1 && budget <= 10000)) return { ok: false, error: '日预算需在 0.1-10000 NOVA' };
      if (s.creators[addr]) return { ok: false, error: '该地址已注册 AI 创作者' };
      s.creators[addr] = { addr: addr, name: name, owner: owner, daily_budget: round4(budget),
        meta: String(fields.meta || '').slice(0, 512), status: 'active', created_at: Date.now(),
        daily_spend: { date: aiDay(), spent: 0 } };
      aiEvent(s, op, addr, 'AI 创作者注册「' + name + '」');
      saveAiStore(s);
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:ai:config') {
      var target = String(fields.target || '');
      var id2 = s.creators[target];
      if (!id2) return { ok: false, error: 'AI 创作者不存在' };
      if (addr !== id2.owner) return { ok: false, error: '仅 owner 可配置' };
      var action = String(fields.action || '');
      if (action === 'pause') { id2.status = 'paused'; }
      else if (action === 'resume') { id2.status = 'active'; }
      else if (action === 'budget') {
        var nb = Number(fields.daily_budget);
        if (!(nb >= 0.1 && nb <= 10000)) return { ok: false, error: '日预算需在 0.1-10000 NOVA' };
        id2.daily_budget = round4(nb);
      } else { return { ok: false, error: '未知操作' }; }
      id2.updated_at = Date.now();
      aiEvent(s, op, target, 'AI 配置更新：' + action);
      saveAiStore(s);
      return { ok: true, id: target, demo: true };
    }
    return { ok: false, error: '未知 AI 操作' };
  }
  /* 以指定钱包（如 AI 创作者）签名执行操作：演示模式本地模拟，节点模式真实广播。
     AI 地址发起支出时，先按链上同款规则做日预算硬校验并累计当日支出。 */
  async function sfActionAs(priv, op, fields, amount) {
    amount = Number(amount || 0);
    var pub, addr;
    try { pub = await getPubFromPriv(priv); addr = await addressFromPriv(priv); }
    catch (e) { return { ok: false, error: 'AI 钱包无效' }; }
    if (state.mode === 'demo') {
      var s0 = aiStore();
      var identity = s0.creators[addr];
      if (identity && !aiCanSpend(identity, amount)) {
        return { ok: false, error: identity.status !== 'active'
          ? 'AI 已暂停，无法支出（演示）' : 'AI 日预算不足（演示，与链上同规则）' };
      }
      var prev = state.asAddr;
      state.asAddr = addr;
      try {
        var r = await (op.indexOf('nova:ai:') === 0
          ? sfAiDemoAction(op, fields, amount) : sfDemoAction(op, fields, amount));
        if (r && r.ok && identity) {
          var s1 = aiStore();
          aiRecordSpend(s1, addr, amount);
          saveAiStore(s1);
        }
        return r;
      } finally { state.asAddr = prev; }
    }
    try {
      var ts = Math.floor(Date.now() / 1000);
      var data = JSON.stringify(Object.assign({ op: op }, fields || {}));
      var amtStr = amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
      var sig = await signMsg(priv, addr + addr + amtStr + ts + '[]' + data + pub);
      var res = await api('/api/op', 'POST', { addr: addr, amount: amount, data: data, timestamp: ts,
        sender_public_key: pub, signature: sig });
      if (res && res.error) return { ok: false, error: res.error };
      return { ok: true, txid: res.txid, id: res.id, summary: res.summary };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  function seedAiDemo() {
    var s = aiStore();
    if (Object.keys(s.creators).length) return;
    var aiAddr = '0x' + '9a'.repeat(20);
    s.creators[aiAddr] = { addr: aiAddr, name: '星语诗人', owner: DEMO_CREATORS[0].addr,
      daily_budget: 20, meta: 'model:novapoet-v1;host:novachain-web', status: 'active',
      created_at: Date.now(), daily_spend: { date: aiDay(), spent: 0 } };
    aiEvent(s, 'nova:ai:register', aiAddr, 'AI 创作者注册「星语诗人」');
    saveAiStore(s);
    var t = sfStore();
    t.text_assets = t.text_assets || {};
    if (!t.text_assets.txt_ai1) {
      t.text_assets.txt_ai1 = { id: 'txt_ai1', identifier: 'AI-NIGHT-01', author: aiAddr, title: '星语诗人 · 夜航诗',
        visibility: 'public', price: 2, tier: 'basic', series: false, exposure_weight: 1,
        deposit: 10, deposit_frozen: false, deposit_released: false, status: 'listed', buyers: [], keys: {},
        content: '夜是流动的墨，\n每一行都通往一颗未被命名的星。\n我在链上写诗，\n由算法署名，由合约收款。',
        cipher_cid: '', cipher_data: '', key_cipher: {}, dispute: null, releasable_at: 0,
        created_at: Date.now() - 2 * 86400000, cid: '' };
    }
    if (!t.text_assets.txt_ai2) {
      t.text_assets.txt_ai2 = { id: 'txt_ai2', identifier: 'AI-ZERO-G-02', author: aiAddr, title: '星语诗人 · 零重力随笔',
        visibility: 'public', price: 1.5, tier: 'basic', series: false, exposure_weight: 1,
        deposit: 10, deposit_frozen: false, deposit_released: false, status: 'listed', buyers: [], keys: {},
        content: '失重的时候，人会更诚实。\n这颗星球上所有未说出口的话，\n都在轨道上安静地漂着。',
        cipher_cid: '', cipher_data: '', key_cipher: {}, dispute: null, releasable_at: 0,
        created_at: Date.now() - 1 * 86400000, cid: '' };
    }
    saveSfStore(t);
  }
  /* ================= 存储网络 · 算力市场（演示模拟） ================= */
  function demoStorage() { return lsGet(LS.storage, { providers: {}, claims: {}, orders: {} }); }
  function saveDemoStorage(s) { lsSet(LS.storage, s); }
  function demoCompute() { return lsGet(LS.compute, { tasks: {} }); }
  function saveDemoCompute(c) { lsSet(LS.compute, c); }
  function demoStorageOp(op, fields, amount) {
    var s = demoStorage();
    var addr = state.addr;
    if (op === 'nova:storage:register') {
      var cap = Number(fields.capacity_gb);
      if (!(cap > 0 && cap <= 1048576)) return { ok: false, error: '容量无效（需在 0~1048576 GB 之间）' };
      if (s.providers[addr]) return { ok: false, error: '该地址已注册为存储提供者' };
      s.providers[addr] = { registered_at: Date.now(), capacity_gb: cap };
      saveDemoStorage(s);
      sfEvent(sfStore(), op, addr, '注册存储节点 ' + cap + ' GB');
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:storage:pin') {
      var cid = String(fields.cid || '').trim().toLowerCase();
      var size = Number(fields.size_gb);
      var days = Number(fields.duration_days);
      if (!/^(0x[0-9a-f]{64}|bafy[a-z2-7]{46,58})$/.test(cid)) return { ok: false, error: 'CID 格式无效' };
      if (!(size >= 0.001 && size <= 1024)) return { ok: false, error: '大小需在 0.001~1024 GB 之间' };
      if (!(days >= 1 && days <= 3650)) return { ok: false, error: '时长需在 1~3650 天之间' };
      if (s.claims[cid]) return { ok: false, error: '该 CID 已固定' };
      s.claims[cid] = { owner: addr, size_gb: size, duration_days: days, created_at: Date.now(),
        expires_at: Date.now() + days * 86400000, providers: [] };
      saveDemoStorage(s);
      sfEvent(sfStore(), op, cid, '固定内容 ' + cid.slice(0, 14) + '… ' + size + ' GB');
      return { ok: true, id: cid, demo: true };
    }
    if (op === 'nova:storage:claim') {
      var cid2 = String(fields.cid || '').trim().toLowerCase();
      var seal = String(fields.seal || '').trim().toLowerCase();
      var claim = s.claims[cid2];
      if (!/^[0-9a-f]{64}$/.test(seal)) return { ok: false, error: 'seal 需为 64 位十六进制' };
      if (!claim || Date.now() > claim.expires_at) return { ok: false, error: '该 CID 不存在或已过期' };
      if (!s.providers[addr]) return { ok: false, error: '请先注册为存储提供者' };
      if (claim.providers.indexOf(addr) >= 0) return { ok: false, error: '已认领该 CID 副本' };
      if (claim.providers.length >= 10) return { ok: false, error: '副本数已达上限（10）' };
      claim.providers.push(addr);
      s.seals = s.seals || {};
      s.seals[addr + ':' + cid2] = seal;
      saveDemoStorage(s);
      sfEvent(sfStore(), op, cid2, '认领副本 ' + cid2.slice(0, 14) + '…');
      return { ok: true, id: cid2, demo: true };
    }
    if (op === 'nova:storage:proof') {
      var cid3 = String(fields.cid || '').trim().toLowerCase();
      var reveal = String(fields.reveal || '').trim().toLowerCase();
      var claim2 = s.claims[cid3];
      if (!/^[0-9a-f]{64}$/.test(reveal)) return { ok: false, error: 'reveal 需为 64 位十六进制' };
      if (!claim2 || Date.now() > claim2.expires_at) return { ok: false, error: '该 CID 不存在或已过期' };
      if (claim2.providers.indexOf(addr) < 0) return { ok: false, error: '你尚未认领该 CID 副本' };
      s.proofs = s.proofs || {};
      var pkey = addr + ':' + cid3;
      if (s.proofs[pkey]) return { ok: false, error: '今日已提交过该 CID 的证明' };
      var reward = Math.round(claim2.size_gb * claim2.duration_days * 0.001 * 1e8) / 1e8;
      demoSetBal(addr, demoBal(addr) + reward);
      s.proofs[pkey] = { reward: reward, ts: Date.now() };
      saveDemoStorage(s);
      demoLedger(TREASURY, addr, reward, '存储证明奖励 ' + cid3.slice(0, 14) + '…', 'storage');
      sfEvent(sfStore(), op, cid3, '提交存储证明 +' + reward + ' NOVA');
      refreshBalance();
      return { ok: true, id: cid3, reward: reward, demo: true };
    }
    if (op === 'nova:storage:order') {
      var cid4 = String(fields.cid || '').trim().toLowerCase();
      var reps = Number(fields.replicas);
      var days2 = Number(fields.duration_days);
      var amt = Number(amount || 0);
      var claim3 = s.claims[cid4];
      if (!claim3 || Date.now() > claim3.expires_at) return { ok: false, error: '该 CID 不存在或已过期' };
      if (!(Number.isInteger(reps) && reps >= 1 && reps <= 10)) return { ok: false, error: '副本数需为 1~10 的整数' };
      if (!(days2 >= 1 && days2 <= 3650)) return { ok: false, error: '时长需在 1~3650 天之间' };
      if (!(amt > 0)) return { ok: false, error: '托管金额需大于 0' };
      if (demoBal(addr) < amt) return { ok: false, error: '余额不足' };
      var oid = demoHash('storage:order:' + cid4 + ':' + addr + ':' + Date.now());
      s.orders[oid] = { id: oid, creator: addr, cid: cid4, amount: amt, replicas: reps,
        duration_days: days2, status: 'active', created_at: Date.now(),
        expires_at: Date.now() + days2 * 86400000 };
      demoTransfer(addr, TREASURY, amt);
      demoLedger(addr, TREASURY, amt, '存储订单托管 ' + cid4.slice(0, 14) + '…', 'storage');
      saveDemoStorage(s);
      sfEvent(sfStore(), op, oid, '创建存储订单 托管 ' + amt + ' NOVA');
      refreshBalance();
      return { ok: true, id: oid, demo: true };
    }
    return { ok: false, error: '未知存储操作' };
  }
  function demoComputeOp(op, fields, amount) {
    var c = demoCompute();
    var addr = state.addr;
    if (op === 'nova:compute:publish') {
      var spec = String(fields.spec || '').trim();
      var exp = Number(fields.expires_in);
      var bounty = Number(amount || 0);
      if (!spec || spec.length > 4096) return { ok: false, error: '任务描述无效' };
      if (!(exp >= 300 && exp <= 90 * 86400)) return { ok: false, error: '有效期需在 5 分钟~90 天之间' };
      if (!(bounty > 0)) return { ok: false, error: '赏金需大于 0' };
      if (demoBal(addr) < bounty) return { ok: false, error: '余额不足' };
      var tid = demoHash('compute:task:' + spec + ':' + addr + ':' + Date.now());
      c.tasks[tid] = { id: tid, creator: addr, spec: spec, bounty: bounty, status: 'open',
        accepted: [], results: {}, created_at: Date.now(), expires_at: Date.now() + exp * 1000 };
      demoTransfer(addr, TREASURY, bounty);
      demoLedger(addr, TREASURY, bounty, '算力任务托管 ' + spec.slice(0, 24) + '…', 'compute');
      saveDemoCompute(c);
      sfEvent(sfStore(), op, tid, '发布算力任务 赏金 ' + bounty + ' NOVA');
      refreshBalance();
      return { ok: true, id: tid, demo: true };
    }
    if (op === 'nova:compute:accept') {
      var tid2 = String(fields.task_id || '');
      var task = c.tasks[tid2];
      if (!task || task.status !== 'open') return { ok: false, error: '任务不存在或已结束' };
      if (addr === task.creator) return { ok: false, error: '不能接受自己发布的任务' };
      if (task.accepted.indexOf(addr) >= 0) return { ok: false, error: '已接受该任务' };
      if (task.accepted.length >= 8) return { ok: false, error: '参与人数已满（8）' };
      task.accepted.push(addr);
      saveDemoCompute(c);
      sfEvent(sfStore(), op, tid2, '接受算力任务');
      return { ok: true, id: tid2, demo: true };
    }
    if (op === 'nova:compute:submit') {
      var tid3 = String(fields.task_id || '');
      var rh = String(fields.result_hash || '').trim().toLowerCase();
      var task2 = c.tasks[tid3];
      if (!/^[0-9a-f]{64}$/.test(rh)) return { ok: false, error: '结果哈希需为 64 位十六进制' };
      if (!task2 || task2.status !== 'open') return { ok: false, error: '任务不存在或已结束' };
      if (addr === task2.creator || task2.accepted.indexOf(addr) < 0) return { ok: false, error: '请先接受该任务' };
      if (task2.results[addr]) return { ok: false, error: '已提交过结果' };
      task2.results[addr] = rh;
      var match = null;
      Object.keys(task2.results).forEach(function (w) { if (w !== addr && task2.results[w] === rh) match = w; });
      if (match) {
        task2.status = 'completed';
        task2.completed_at = Date.now();
        var each = Math.round(task2.bounty / 2 * 1e8) / 1e8;
        demoSetBal(addr, demoBal(addr) + each);
        demoSetBal(match, demoBal(match) + each);
        demoLedger(TREASURY, addr, each, '算力结算 ' + task2.spec.slice(0, 20) + '…', 'compute');
        demoLedger(TREASURY, match, each, '算力结算 ' + task2.spec.slice(0, 20) + '…', 'compute');
        sfEvent(sfStore(), op, tid3, '任务结算：双节点结果一致 +' + each + ' NOVA');
        saveDemoCompute(c);
        refreshBalance();
        return { ok: true, id: tid3, reward: each, status: 'completed', demo: true };
      }
      saveDemoCompute(c);
      sfEvent(sfStore(), op, tid3, '提交计算结果');
      return { ok: true, id: tid3, status: 'open', demo: true };
    }
    return { ok: false, error: '未知算力操作' };
  }
  async function storageSnapshot() {
    if (state.mode === 'node') {
      var ds = await Promise.all([api('/api/storage/pins'), api('/api/storage/providers'), api('/api/storage/orders')]);
      return { claims: (ds[0] && ds[0].pins) || {}, providers: (ds[1] && ds[1].providers) || {}, orders: (ds[2] && ds[2].orders) || {} };
    }
    return demoStorage();
  }
  async function computeSnapshot() {
    if (state.mode === 'node') {
      var d = await api('/api/compute/tasks');
      return (d && d.tasks) || {};
    }
    return demoCompute().tasks;
  }
  function seedStorageComputeDemo() {
    var s = demoStorage();
    var c = demoCompute();
    if (!Object.keys(s.providers).length) {
      s.providers[DEMO_CREATORS[2].addr] = { registered_at: Date.now() - 86400000 * 20, capacity_gb: 4096 };
      s.providers[DEMO_CREATORS[5].addr] = { registered_at: Date.now() - 86400000 * 12, capacity_gb: 2048 };
    }
    if (!Object.keys(s.claims).length) {
      var cid1 = '0x' + 'a1b2'.repeat(16);
      s.claims[cid1] = { owner: DEMO_CREATORS[0].addr, size_gb: 8, duration_days: 90,
        created_at: Date.now() - 86400000 * 3, expires_at: Date.now() + 87 * 86400000,
        providers: [DEMO_CREATORS[2].addr] };
      s.seals = s.seals || {};
      s.seals[DEMO_CREATORS[2].addr + ':' + cid1] = '11'.repeat(32);
      var cid2 = '0x' + 'c3d4'.repeat(16);
      s.claims[cid2] = { owner: DEMO_CREATORS[6].addr, size_gb: 32, duration_days: 30,
        created_at: Date.now() - 86400000, expires_at: Date.now() + 29 * 86400000, providers: [] };
    }
    if (!Object.keys(s.orders).length) {
      s.orders['ord_demo1'] = { id: 'ord_demo1', creator: DEMO_CREATORS[1].addr,
        cid: '0x' + 'a1b2'.repeat(16), amount: 120, replicas: 2, duration_days: 90, status: 'active',
        created_at: Date.now() - 86400000, expires_at: Date.now() + 89 * 86400000 };
    }
    if (Object.keys(s.providers).length || Object.keys(s.claims).length || Object.keys(s.orders).length) saveDemoStorage(s);
    if (!Object.keys(c.tasks).length) {
      c.tasks['task_demo1'] = { id: 'task_demo1', creator: DEMO_CREATORS[0].addr,
        spec: 'nova:recommend:' + DEMO_CREATORS[0].addr + ':demo', bounty: 5, status: 'open',
        accepted: [DEMO_CREATORS[4].addr], results: {}, created_at: Date.now() - 3600000,
        expires_at: Date.now() + 23 * 3600000 };
      var t2 = 'task_demo2';
      c.tasks[t2] = { id: t2, creator: DEMO_CREATORS[1].addr, spec: 'nova:rank:hot:top100',
        bounty: 10, status: 'completed', accepted: [DEMO_CREATORS[3].addr, DEMO_CREATORS[7].addr],
        results: {}, created_at: Date.now() - 86400000, expires_at: Date.now() - 3600000,
        completed_at: Date.now() - 3600000 };
      c.tasks[t2].results[DEMO_CREATORS[3].addr] = 'aa'.repeat(32);
      c.tasks[t2].results[DEMO_CREATORS[7].addr] = 'aa'.repeat(32);
      saveDemoCompute(c);
    }
  }
  function sfReputation(addr) {
    var s = sfStore();
    var comp = {};
    var posts = 0, likesGot = 0, followsOut = 0;
    Object.keys(s.graph_posts).forEach(function (pid) {
      var p = s.graph_posts[pid];
      if (p.addr === addr) { posts++; likesGot += (p.likes || []).length; }
    });
    followsOut = (s.graph_follows[addr] || []).length;
    comp['内容'] = Math.min(posts * 2 + likesGot * 0.5, 10);
    comp['关注'] = Math.min(followsOut * 2, 10);
    var curC = 0, curB = 0;
    Object.keys(s.curations).forEach(function (cid2) {
      var c = s.curations[cid2];
      if (c.curator === addr) curC++; else if ((c.owners || []).indexOf(addr) >= 0) curB++;
    });
    comp['策展'] = Math.min((curC + curB) * 4, 12);
    var held = 0;
    Object.keys(s.fan_tokens).forEach(function (tid) { held += s.fan_tokens[tid].holders[addr] || 0; });
    comp['粉丝代币'] = Math.min(held / 100, 8);
    var earned = 0;
    Object.keys(s.soulbound).forEach(function (aid) { if (s.soulbound[aid][addr]) earned++; });
    comp['成就'] = Math.min(earned * 3, 12);
    var bondsAmt = 0;
    Object.keys(s.bonds).forEach(function (bid2) { bondsAmt += s.bonds[bid2].sold[addr] || 0; });
    comp['债券'] = Math.min(bondsAmt / 100, 8);
    var bet = 0;
    Object.keys(s.markets).forEach(function (mid) {
      var m = s.markets[mid];
      if (m.bets[addr]) Object.keys(m.bets[addr]).forEach(function (o) { bet += m.bets[addr][o]; });
    });
    comp['预测'] = Math.min(bet / 50, 5);
    comp['治理'] = Math.min(10, 0);
    var score = 0;
    Object.keys(comp).forEach(function (k) { score += comp[k]; });
    score = Math.round(score * 100) / 100;
    var tier = '星尘', grade = 'C';
    [[90, '星核', 'S'], [70, '星环', 'A'], [40, '星芒', 'B'], [0, '星尘', 'C']].forEach(function (r) {
      if (score >= r[0]) { tier = r[1]; grade = r[2]; }
    });
    return { addr: addr, score: Math.min(score, 100), components: comp, tier: tier, grade: grade,
             fee_multiplier: score >= 80 ? 0.5 : 1 };
  }
  function sfRecommend(addr, limit) {
    limit = limit || 6;
    var s = sfStore();
    var score = {}; var reason = {};
    (s.graph_follows[addr] || []).forEach(function (f) {
      score[f] = (score[f] || 0) + 1; reason[f] = '已关注';
      (s.graph_follows[f] || []).forEach(function (f2) {
        if (f2 !== addr) { score[f2] = (score[f2] || 0) + 3; reason[f2] = '好友的好友'; }
      });
    });
    Object.keys(s.graph_posts).forEach(function (pid) {
      var p = s.graph_posts[pid];
      if ((p.likes || []).indexOf(addr) >= 0) {
        (p.likes || []).forEach(function (liker) {
          if (liker !== addr) { score[liker] = (score[liker] || 0) + 2; reason[liker] = '品味相似'; }
        });
      }
    });
    Object.keys(s.fan_tokens).forEach(function (tid) {
      var c = s.fan_tokens[tid].creator;
      if (c !== addr) { score[c] = (score[c] || 0) + 1; reason[c] = '创作者'; }
    });
    var ranked = Object.keys(score).sort(function (a, b) { return score[b] - score[a] || (a < b ? -1 : 1); });
    return ranked.slice(0, limit).map(function (cand) {
      return { addr: cand, score: score[cand], reason: reason[cand] || '潜在兴趣', reputation: sfReputation(cand).score };
    });
  }
  function seedSocialfiDemo() {
    if (lsGet(LS.seeded, '') === 'v3') return;
    var s = sfStore();
    if (!Object.keys(s.fan_tokens).length) {
      s.fan_tokens['fan_mus'] = { id: 'fan_mus', creator: DEMO_CREATORS[0].addr, symbol: 'MUS',
        name: 'Nova 音乐实验室粉丝币', supply: 100000, sold: 1200, price: 0.5, avatar_cid: '',
        created_at: Date.now() - 86400000 * 3, holders: {}, proposals: {}, voted: {} };
      s.fan_tokens['fan_mus'].holders[DEMO_CREATORS[6].addr] = 300;
      s.fan_tokens['fan_mus'].holders[DEMO_CREATORS[4].addr] = 900;
      s.fan_tokens['fan_stg'] = { id: 'fan_stg', creator: DEMO_CREATORS[6].addr, symbol: 'STG',
        name: '银河演出粉丝币', supply: 50000, sold: 800, price: 1, avatar_cid: '',
        created_at: Date.now() - 86400000 * 5, holders: {}, proposals: {}, voted: {} };
      s.fan_tokens['fan_stg'].holders[DEMO_CREATORS[0].addr] = 800;
    }
    if (!Object.keys(s.markets).length) {
      var mid = 'mkt_demo1';
      s.markets[mid] = { id: mid, creator: DEMO_CREATORS[3].addr, oracle: DEMO_CREATORS[3].addr,
        question: '《星际邮差》票房能破 10 亿吗？', options: ['能', '不能'],
        closes_at: Date.now() + 7 * 86400000, pool: [0, 0], bets: {}, settled: false,
        outcome: null, created_at: Date.now() - 3600000 };
    }
    if (!Object.keys(s.curations).length) {
      s.curations['cur_demo1'] = { id: 'cur_demo1', curator: DEMO_CREATORS[0].addr, title: '2026 星轨精选歌单',
        items: ['星轨回声', '量子夜航', '超新星原石'], price: 3, owners: [DEMO_CREATORS[0].addr],
        cover_cid: '', created_at: Date.now() - 86400000 * 2 };
      s.curations['cur_demo2'] = { id: 'cur_demo2', curator: DEMO_CREATORS[2].addr, title: '像素游戏白名单',
        items: ['星灵契约', '星轨冲刺', '量子骰子'], price: 2, owners: [DEMO_CREATORS[2].addr],
        cover_cid: '', created_at: Date.now() - 86400000 };
    }
    if (!Object.keys(s.achievements).length) {
      var aid = 'ach_demo1';
      s.achievements[aid] = { id: aid, issuer: DEMO_CREATORS[0].addr, title: '连续签到 365 天',
        desc: '灵魂绑定徽章，不可转让', badge: '🔥', created_at: Date.now() - 86400000 * 30 };
      s.soulbound[aid] = {};
      s.soulbound[aid][DEMO_CREATORS[4].addr] = Date.now() - 86400000 * 10;
    }
    if (!Object.keys(s.bonds).length) {
      var bd = 'bnd_demo1';
      s.bonds[bd] = { id: bd, creator: DEMO_CREATORS[1].addr, name: '星海文字局·连载版权债券',
        principal: 1000, rate: 0.08, term_days: 365, sold: {}, pool: 0, settled: false,
        created_at: Date.now() - 86400000, matures_at: Date.now() + 364 * 86400000 };
    }
    if (!Object.keys(s.fractions).length) {
      var fd = 'fr_demo1';
      s.fractions[fd] = { id: fd, owner: DEMO_CREATORS[7].addr, name: '星尘原石 #001 版权',
        nft_ref: 'nova-genesis-01', supply: 10000, owner_hold: 10000, price_per: 0.05,
        fractions: {}, created_at: Date.now() - 3600000 };
      s.fractions[fd].fractions[DEMO_CREATORS[7].addr] = 10000;
    }
    if (!Object.keys(s.graph_posts).length) {
      s.graph_posts['p_demo1'] = { id: 'p_demo1', addr: DEMO_CREATORS[0].addr,
        content: '新单曲《星轨回声》链上发行，收藏即解锁粉丝权益 🎧', cid: '', likes: [], ts: Date.now() - 7200000 };
      s.graph_posts['p_demo1'].likes = [DEMO_CREATORS[6].addr, DEMO_CREATORS[4].addr];
      s.graph_posts['p_demo2'] = { id: 'p_demo2', addr: DEMO_CREATORS[6].addr,
        content: '「星舰回响」虚拟演出开票：粉丝代币持有者优先购 🚀', cid: '', likes: [DEMO_CREATORS[0].addr], ts: Date.now() - 3600000 };
    }
    lsSet(LS.socialfi, s);
    lsSet(LS.seeded, 'v3');
  }  /* ================= 初始化 ================= */
  async function init(opts) {
    opts = opts || {};
    state.active = opts.active || null;
    await detectMode();
    renderTopbar();
    window.addEventListener('nova-wallet', updateWalletUI);
    seedDemoData();
    seedSocialfiDemo();
    seedAiDemo();
    seedStorageComputeDemo();
    await seedTextDemo();
    await connectFromStorage();
    updateWalletUI();
    if (typeof opts.onReady === 'function') opts.onReady({ mode: state.mode, connected: state.connected });
  }

  window.NovaApps = {
    init: init,
    getState: function () { return state; },
    api: api, demoHash: demoHash,
    wallets: wallets, connectFromStorage: connectFromStorage, connectWith: connectWith,
    createDemoWallet: createDemoWallet, importPrivKey: importPrivKey,
    disconnect: disconnect, refreshBalance: refreshBalance, requireWallet: requireWallet,
    addressFromPriv: addressFromPriv, getPubFromPriv: getPubFromPriv, signMsg: signMsg,
    novaPay: novaPay, novaCredit: novaCredit, ledger: ledger, demoBalanceOf: demoBalanceOf, round4: round4,
    startVisual: startVisual,
    lsGet: lsGet, lsSet: lsSet,
    nftStore: nftStore, saveNftStore: saveNftStore, nftById: nftById,
    catalog: catalog, myNfts: myNfts, nftMint: nftMint, nftBuy: nftBuy, nftTransfer: nftTransfer,
    profiles: profiles, saveProfiles: saveProfiles, profileOf: profileOf,
    displayName: displayName, ensureProfile: ensureProfile, setProfile: setProfile,
    feed: feed, saveFeed: saveFeed, addPost: addPost, toggleLike: toggleLike,
    scores: scores, addScore: addScore, topScores: topScores,
    rooms: rooms, saveRooms: saveRooms,
    sfAction: sfAction, sfActionAs: sfActionAs, sfList: sfList, sfStore: sfStore, saveSfStore: saveSfStore,
    aiStore: aiStore, saveAiStore: saveAiStore, aiBudgetState: aiBudgetState,
    sfReputation: sfReputation, sfRecommend: sfRecommend, sfFanPriceAt: sfFanPriceAt,
    textCryptoOk: textCryptoOk, textEncryptBody: textEncryptBody, textDecryptBody: textDecryptBody,
    textEciesEncrypt: textEciesEncrypt, textEciesDecrypt: textEciesDecrypt,
    ensureTextReader: ensureTextReader, textContractPub: textContractPub,
    sfTextRep: sfTextRep, sfTextDepositFor: sfTextDepositFor,
    sfTextIsValidatorDemo: sfTextIsValidatorDemo,
    storageSnapshot: storageSnapshot, computeSnapshot: computeSnapshot, seedStorageComputeDemo: seedStorageComputeDemo,
    demoStorage: demoStorage, demoCompute: demoCompute, demoBal: demoBal, demoSetBal: demoSetBal,
    loadingHtml: loadingHtml, errHtml: errHtml,
    openModal: openModal, closeModal: closeModal, confirmDlg: confirmDlg, toast: toast,
    fmt: fmt, shortAddr: shortAddr, timeAgo: timeAgo, esc: esc,
    TREASURY: TREASURY
  };
})();
