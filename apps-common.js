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
    scores: 'nova_app_scores'
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
    if (lsGet(LS.seeded, '') === 'v1') return;
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
    { key: 'nft', href: './nft.html', icon: '🖼️', label: 'NFT' }
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

  /* ================= 初始化 ================= */
  async function init(opts) {
    opts = opts || {};
    state.active = opts.active || null;
    await detectMode();
    renderTopbar();
    window.addEventListener('nova-wallet', updateWalletUI);
    seedDemoData();
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
    openModal: openModal, closeModal: closeModal, confirmDlg: confirmDlg, toast: toast,
    fmt: fmt, shortAddr: shortAddr, timeAgo: timeAgo, esc: esc,
    TREASURY: TREASURY
  };
})();
