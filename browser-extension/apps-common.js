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
    wallets: 'nova_demo_priv', balances: 'nova_demo_balances', ledger: 'nova_demo_ledger',
    nft: 'nova_nft_store', owned: 'nova_nft_owned', profiles: 'nova_app_profiles',
    feed: 'nova_app_feed', seeded: 'nova_app_seeded', rooms: 'nova_app_rooms',
    scores: 'nova_app_scores', socialfi: 'nova_socialfi', storage: 'nova_storage', compute: 'nova_compute',
    ai: 'nova_ai', arb: 'nova_arb'
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
  /* 公共节点：部署者在此配置公网可达的 Nova 节点地址（留空则仅探测同源与本地节点）。
   * 注意：节点必须允许 CORS（响应头 Access-Control-Allow-Origin），否则浏览器会拦截请求。 */
  var PUBLIC_RPC = '';
  var NODE_CANDIDATES = [];
  if (PUBLIC_RPC) NODE_CANDIDATES.push(PUBLIC_RPC.replace(/\/+$/, '') + '/api/status');
  NODE_CANDIDATES.push(
    window.location.origin + '/api/status',
    'http://127.0.0.1:8080/api/status',
    'http://localhost:8080/api/status'
  );
  async function detectMode() {
    // URL 参数 ?rpc=<节点地址> 优先级最高，便于部署 / 演示一键切换节点
    var qp = null;
    try { qp = new URLSearchParams(window.location.search).get('rpc'); } catch (e) { /* 忽略 */ }
    var custom = qp || lsGet('nova_rpc', '');
    if (custom) {
      try {
        var cr = await fetch(custom.replace(/\/+$/, '') + '/api/status', { method: 'GET', headers: { Accept: 'application/json' } });
        if (cr.ok) {
          var cd = await cr.json();
          if (cd && typeof cd === 'object') {
            state.mode = 'node';
            state.rpc = custom.replace(/\/+$/, '');
            return cd;
          }
        }
      } catch (e) { /* 自定义 RPC 不可达，继续自动检测 */ }
    }
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
    // 全部候选不可达：进入演示模式并清空已探测 RPC（避免显示过期节点）
    state.mode = 'demo';
    state.rpc = null;
    return { demoMode: true };
  }
  function demoApi(path, method, body) {
    if (method === 'GET' && path.indexOf('/api/balance/') === 0) {
      var addr = decodeURIComponent(path.split('/').pop());
      var balances = lsGet(LS.balances, {});
      return { balance: balances[addr] != null ? balances[addr] : 1000, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/status') === 0) return { node: '演示模式', demoMode: true };
    if (method === 'GET' && path.indexOf('/api/arb/summary') === 0) return arbDemoSummary();
    if (method === 'GET' && path.indexOf('/api/arb/arbitrators') === 0) return arbDemoArbitrators();
    if (method === 'GET' && path.indexOf('/api/arb/candidates') === 0) return arbDemoCandidates();
    if (method === 'GET' && path.indexOf('/api/arb/cases/') === 0) {
      var av = decodeURIComponent(path.replace('/api/arb/cases/', '').split('?')[0]);
      var avw = decodeURIComponent((path.split('viewer=')[1] || '').replace(/&.*$/, ''));
      return arbDemoCase(av, avw);
    }
    if (method === 'GET' && path.indexOf('/api/arb/cases') === 0) {
      var av2 = decodeURIComponent((path.split('viewer=')[1] || '').replace(/&.*$/, ''));
      return arbDemoCases(av2);
    }
    if (method === 'GET' && path.indexOf('/api/arb/user/') === 0) return arbDemoUser(decodeURIComponent(path.replace('/api/arb/user/', '').split('?')[0]));
    if (method === 'GET' && path.indexOf('/api/arb/panel/') === 0) return arbDemoPanel(decodeURIComponent(path.replace('/api/arb/panel/', '').split('?')[0]));
    if (method === 'GET' && path.indexOf('/api/arb/notifications/') === 0) return arbDemoNotifications(decodeURIComponent(path.replace('/api/arb/notifications/', '').split('?')[0]));
    if (method === 'POST' && path.indexOf('/api/arb/notifications/read') === 0) return arbDemoMarkRead(body || {});
    if (method === 'POST' && path.indexOf('/api/arb/') === 0) {
      try {
        var arbData = JSON.parse((body && body.data) || '{}');
        return arbDemoAction(arbData.op, arbData, Number(body && body.amount) || 0);
      } catch (e) { return { error: '请求无效', demoMode: true }; }
    }
    if (method === 'POST' && path === '/api/send') return { txid: demoHash(JSON.stringify(body || {})), demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/pins') === 0) return { pins: demoStorage().claims, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/providers') === 0) return { providers: demoStorage().providers, total: Object.keys(demoStorage().providers).length, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/orders') === 0) return { orders: demoStorage().orders, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/storage/inc/summary') === 0) return demoStorageIncSummary();
    if (method === 'GET' && path.indexOf('/api/storage/status/') === 0) {
      var fc = decodeURIComponent(path.replace('/api/storage/status/', ''));
      return demoStorageIncStatus(fc);
    }
    if (method === 'GET' && path.indexOf('/api/storage/nodes/') === 0) {
      var tail = decodeURIComponent(path.replace('/api/storage/nodes/', ''));
      var daddr = tail.replace(/\/challenge$/, '').replace(/\/revenue$/, '');
      var ds = demoStorage();
      if (/\/challenge$/.test(tail)) return demoStorageIncChallenge(daddr);
      return demoStorageIncNode(daddr);
    }
    if (method === 'GET' && path.indexOf('/api/storage/nodes') === 0) {
      var dn = demoStorage().inc_nodes || {};
      return { nodes: dn, total: Object.keys(dn).length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/storage/creator/') === 0) {
      var caddr = decodeURIComponent(path.replace('/api/storage/creator/', ''));
      return demoStorageIncCreator(caddr);
    }
    if (method === 'GET' && path.indexOf('/api/storage/events') === 0) {
      var ea = (path.split('addr=')[1] || '').replace(/&.*$/, '');
      var evs = demoStorage().inc_events || {};
      var list = Object.keys(evs).map(function (k) { return evs[k]; });
      if (ea) list = list.filter(function (e) { return e.creator === decodeURIComponent(ea); });
      list.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      return { events: list.slice(0, 100), total: list.length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/compute/tasks') === 0) return { tasks: demoCompute().tasks, demoMode: true };
    if (method === 'GET' && path.indexOf('/api/compute/nodes') === 0) {
      var cns = demoCompute().nodes || {};
      return { nodes: cns, total: Object.keys(cns).length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/compute/node/') === 0) {
      var cnaddr = decodeURIComponent(path.replace('/api/compute/node/', '').replace(/\/.*$/, ''));
      var cnv = demoCompute().nodes[cnaddr];
      if (!cnv) return { found: false, demoMode: true };
      return { found: true, addr: cnaddr, spec: cnv, reputation: demoReputation(cnv),
        stake: cnv.stake || 0, unbonding: cnv.unbonding || [0, 0], income: demoNodeIncome(cnv),
        qualified: true, super_node: false, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/compute/income/') === 0) {
      var ciaddr = decodeURIComponent(path.replace('/api/compute/income/', ''));
      return demoNodeIncome(demoCompute().nodes[ciaddr]);
    }
    if (method === 'GET' && path.indexOf('/api/compute/overview') === 0) {
      return demoComputeOverview();
    }
    if (method === 'GET' && path.indexOf('/api/compute/events') === 0) {
      var cev = (demoCompute().events || []).slice(0, 100);
      return { events: cev, total: cev.length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/ai/services') === 0) {
      var aio = aiStore();
      return { services: aio.services || {}, total: Object.keys(aio.services || {}).length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/ai/works') === 0) {
      var aia = aiStore();
      var awl = Object.keys(aia.works || {}).map(function (k) { return aia.works[k]; });
      awl.sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
      return { works: awl, total: awl.length, demoMode: true };
    }
    if (method === 'GET' && path.indexOf('/api/ai/fund') === 0) return aiFundSnapshot();
    if (method === 'GET' && path.indexOf('/api/ai/status') === 0) return aiStatusSnapshot();
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
  var nodeRecheckTimer = null;
  /* 节点掉线后的后台重探：节点恢复后自动回到 node 模式，避免单次网络错误永久降级 demo */
  function scheduleNodeRecheck(delay) {
    if (nodeRecheckTimer || !state.rpc) return;
    nodeRecheckTimer = setTimeout(function () {
      nodeRecheckTimer = null;
      if (state.mode === 'node') return;
      fetch(state.rpc + '/api/status', {
        method: 'GET', headers: { Accept: 'application/json' },
        signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(3000) : undefined
      }).then(function (r) {
        return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status));
      }).then(function (d) {
        if (d && typeof d === 'object' && !d.demoMode) {
          state.mode = 'node';
          dispatchWallet();
          try { window.dispatchEvent(new CustomEvent('nova-mode', { detail: { mode: 'node', rpc: state.rpc } })); } catch (e) { /* 忽略 */ }
        }
      }).catch(function () { scheduleNodeRecheck(8000); });
    }, delay == null ? 3000 : delay);
  }
  async function api(path, method, body) {
    if (state.mode === 'node' && state.rpc) {
      try {
        var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        var res = await fetch(state.rpc + path, opts);
        if (!res.ok) {
          // 后端业务错误（400 校验失败 / 404 不存在等）：原样返回错误体，不降级为演示
          var eb = await res.json().catch(function () { return null; });
          if (eb && typeof eb === 'object') return eb;
          throw new Error('HTTP ' + res.status);
        }
        var text = await res.text();
        return text ? JSON.parse(text) : {};
      } catch (e) {
        // 仅网络不可达 / 响应非 JSON 等才本次回退演示，并后台重探节点以便恢复
        state.mode = 'demo';
        scheduleNodeRecheck();
        return demoApi(path, method || 'GET', body);
      }
    }
    return demoApi(path, method || 'GET', body);
  }

  /* ================= 钱包 ================= */
  function wallets() { return lsGet(LS.wallets, []); }
  var LS_VAULT_KEY = 'nova_demo_vault_key';
  /* 演示钱包私钥加密落盘（AES-256-GCM，设备密钥派生）：避免私钥明文直接出现在 localStorage。
   * 说明：设备密钥与密文同在 localStorage，主要防御离线 / localStorage 快照直接读取；
   * 页面 XSS 仍可解密，演示钱包私钥请勿用于真实资产（正式请用 wallet.html 的密码保险库）。 */
  function vaultKey() {
    var k = lsGet(LS_VAULT_KEY, '');
    if (typeof k === 'string' && k.length === 64 && /^[0-9a-f]{64}$/.test(k)) return k;
    k = bytesToHex(randomBytes(32));
    lsSet(LS_VAULT_KEY, k);
    return k;
  }
  function isEncEntry(e) { return e && typeof e === 'object' && e.v === 1 && typeof e.ct === 'string' && typeof e.iv === 'string'; }
  async function aesGcmEncryptPriv(plainHex) {
    if (!(window.crypto && window.crypto.subtle)) return plainHex; // 无 WebCrypto 时降级明文
    try {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var key = await crypto.subtle.importKey('raw', hexToBytes(vaultKey()), { name: 'AES-GCM' }, false, ['encrypt']);
      var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, hexToBytes(plainHex)));
      return { v: 1, iv: bytesToHex(iv), ct: bytesToHex(ct) };
    } catch (e) { return plainHex; }
  }
  async function aesGcmDecryptPriv(entry) {
    if (!isEncEntry(entry)) return entry; // 兼容旧版明文条目
    if (!(window.crypto && window.crypto.subtle)) return null;
    try {
      var key = await crypto.subtle.importKey('raw', hexToBytes(vaultKey()), { name: 'AES-GCM' }, false, ['decrypt']);
      var pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(entry.iv) }, key, hexToBytes(entry.ct)));
      return bytesToHex(pt);
    } catch (e) { return null; }
  }
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
    try {
      var priv = await aesGcmDecryptPriv(ws[0]);
      if (!priv) return false;
      await connectWith(priv);
      return true;
    } catch (e) { return false; }
  }
  async function createDemoWallet() {
    var priv = bytesToHex(randomBytes(32));
    var ws = wallets();
    ws.push(await aesGcmEncryptPriv(priv));
    lsSet(LS.wallets, ws);
    await connectWith(priv);
    return priv;
  }
  async function importPrivKey(hex) {
    var clean = (hex || '').trim().replace(/^0x/, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) return { error: '私钥需为 64 位十六进制字符串' };
    var ws = wallets();
    var dup = false;
    for (var i = 0; i < ws.length; i++) {
      var raw = await aesGcmDecryptPriv(ws[i]);
      if (raw === clean) { dup = true; break; }
    }
    if (!dup) ws.push(await aesGcmEncryptPriv(clean));
    lsSet(LS.wallets, ws);
    await connectWith(clean);
    return { ok: true, warning: '演示钱包私钥保存在浏览器本地，请勿用于真实资产；正式使用请前往钱包页创建账户' };
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
  function loadingHtml(text) { return '<div class="shimmer" style="height:16px;width:100%"></div>'; }
  function errHtml(msg) { return '<div class="err-box">⚠️ ' + esc(msg || '加载失败，请重试') + '</div>'; }
  function toast(msg, type) {
    type = type || 'ok';
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = (type === 'ok' ? '✓ ' : '') + msg;
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
  /* 五大模块（用户视角）：首页 / 钱包 / 探索 / 权益 / 设置 */
  var NAV_ITEMS = [
    { key: 'home', href: './index.html', icon: '🏠', labelKey: 'nav.home' },
    { key: 'wallet', href: './wallet.html', icon: '💳', labelKey: 'nav.wallet' },
    { key: 'explore', href: './explore.html', icon: '🧭', labelKey: 'nav.explore' },
    { key: 'rewards', href: './rewards.html', icon: '🎁', labelKey: 'nav.rewards' },
    { key: 'settings', href: './settings.html', icon: '⚙️', labelKey: 'nav.settings' }
  ];
  /* 移动端底部导航与桌面侧边栏一致：五个模块 */
  var BOTTOM_NAV = NAV_ITEMS;
  /* 历史页面归属模块：用于统一高亮所在模块 */
  var MODULE_OF = {
    apps: 'explore', music: 'explore', words: 'explore', games: 'explore',
    video: 'explore', live: 'explore', social: 'explore', stage: 'explore',
    nft: 'explore', storage: 'explore', compute: 'explore', socialfi: 'explore', agent: 'explore', arbitration: 'rewards',
    nova: 'rewards', wallet: 'wallet', home: 'home'
  };

  /* ================= 国际化：中 / 英 ================= */
  var I18N = {
    zh: {
      'nav.home': '首页', 'nav.wallet': '钱包', 'nav.explore': '探索',
      'nav.rewards': '权益', 'nav.settings': '设置',
      'net.demo': '演示网络', 'net.node': '本地节点',
      'chip.connect': '连接钱包', 'chip.mode.node': '节点', 'chip.mode.demo': '演示',
      'app.sidebar': '主导航', 'app.nav': '移动端导航', 'app.mode': '当前运行模式',
      'app.title': 'Nova Chain · 超新星并行宇宙',
      'home.assets': '资产总览', 'home.assets.total': '总资产', 'home.assets.locked': '锁仓资产',
      'home.assets.checkin': '今日签到', 'home.chain': '链上数据',
      'home.chain.block': '区块高度', 'home.chain.nodes': '在线节点', 'home.chain.staked': '全网质押',
      'home.presale': '预售进度', 'home.presale.stage': '当前阶段', 'home.presale.price': '当前价格',
      'home.presale.sold': '已售', 'home.quick': '快捷操作',
      'home.quick.transfer': '转账', 'home.quick.stake': '质押', 'home.quick.explore': '探索', 'home.quick.checkin': '签到',
      'home.modules': '生态模块', 'home.connect': '连接钱包', 'home.unconnected': '未连接',
      'home.hello': '欢迎回来', 'home.mode.node': '节点已就绪 · 本地 RPC', 'home.mode.demo': '演示模式 · 静态体验',
      'home.days': '天', 'home.checked': '已签到 · 连续', 'home.notchecked': '未签到',
      'home.modules.desc.home': '资产与链上看板', 'home.modules.desc.wallet': '创建、转账与记录',
      'home.modules.desc.explore': '密文、盲盒、文本、音乐', 'home.modules.desc.rewards': '质押、签到与仲裁',
      'home.modules.desc.settings': '网络、安全与语言',
      'explore.eyebrow': 'EXPLORE · MARKET', 'explore.title': '探索 · 内容与交易市场',
      'explore.sub': '搜索、发布与购买：密文交易、盲盒抽奖、文本市场、音乐 NFT，创作者经济的内容交易都在这里。',
      'explore.search': '搜索市场（密文 / 盲盒 / 文本 / 音乐）',
      'explore.core': '核心市场', 'explore.tag.live': '交易市场', 'explore.tag.soon': '即将上线',
      'explore.encrypted': '密文交易', 'explore.encrypted.desc': '端到端加密内容发布、购买与解锁，链上存证。',
      'explore.blind': '盲盒抽奖', 'explore.blind.desc': '链上随机盲盒，开盒即得 NFT 与粉丝代币。',
      'explore.text': '文本市场', 'explore.text.desc': '长篇、诗歌与连载的阅读、打赏与版权交易。',
      'explore.music': '音乐 NFT', 'explore.music.desc': '上传、铸造与购买链上唱片，收藏即解锁粉丝权益。',
      'explore.ai': 'AI 音乐人专区', 'explore.ai.desc': 'AI 生成音乐的上链发行与版权分成，即将上线。',
      'explore.ecosystem': '更多生态',
      'explore.nft': 'NFT 收藏品', 'explore.nft.desc': '铸造、买卖与转让数字藏品。',
      'explore.games': '游戏', 'explore.games.desc': '量子骰子与星轨冲刺，链上排行榜。',
      'explore.video': '视频', 'explore.video.desc': '创作者频道与动效放映。',
      'explore.live': '直播', 'explore.live.desc': '弹幕互动与礼物打赏。',
      'explore.social': '社交', 'explore.social.desc': '创作者动态与链上时间戳。',
      'explore.stage': '虚拟演出', 'explore.stage.desc': '沉浸式舞台与 NFT 门票。',
      'explore.storage': '去中心化存储', 'explore.storage.desc': '内容固定与链上存证。',
      'explore.compute': '链上算力', 'explore.compute.desc': '可验证计算任务市场。',
      'explore.socialfi': '链上生态', 'explore.socialfi.desc': '十大 SocialFi 玩法与声誉系统。',
      'rewards.eyebrow': 'REWARDS · STAKE', 'rewards.title': '权益 · 质押与激励',
      'rewards.sub': '超级节点质押、每日签到与早期激励都在这里；社区仲裁保障每一次交易。',
      'rewards.stake': '超级节点质押', 'rewards.apy': '预估年化', 'rewards.min': '最低门槛',
      'rewards.status': '当前状态', 'rewards.stake.cta': '进入质押中心', 'rewards.stake.demo': '演示模式体验',
      'rewards.stake.active': '可质押', 'rewards.checkin': '每日签到', 'rewards.checkin.streak': '连续签到',
      'rewards.checkin.desc': '每日签到奖励 5 NOVA', 'rewards.checkin.done': '今日已签到',
      'rewards.checkin.cta': '签到', 'rewards.checkin.done2': '已签到', 'rewards.checkin.days': '天',
      'rewards.checkin.count': '累计', 'rewards.early': '早期激励', 'rewards.early.total': '激励总量',
      'rewards.early.desc': '已领取', 'rewards.early.cta': '领取激励', 'rewards.early.done': '已领完',
      'rewards.arb': '社区仲裁', 'rewards.arb.complain': '投诉', 'rewards.arb.complain.desc': '交易纠纷在线提交，自动留存证据。',
      'rewards.arb.verify': '验证', 'rewards.arb.verify.desc': '链上存证与多签仲裁员验证。',
      'rewards.arb.pay': '赔付', 'rewards.arb.pay.desc': '仲裁通过后自动执行赔付。',
      'rewards.arb.cta2': '进入社区仲裁面板', 'rewards.arb.cta': '进入链上生态 · 仲裁入口',
      'toast.checkin.done': '今日已签到', 'toast.checkin.ok': '签到成功 +5 NOVA',
      'toast.checkin.nowallet': '签到成功（未连接钱包，未入账）',
      'toast.early.claimed': '已领取', 'toast.early.fail': '领取失败', 'toast.cleared': '已清除本地数据',
      'settings.eyebrow': 'SETTINGS', 'settings.title': '设置',
      'settings.sub': '网络配置、助记词管理、安全中心与语言偏好，全部本地保存。',
      'settings.network': '网络配置', 'settings.rpc': 'RPC 地址', 'settings.save': '保存',
      'settings.reset': '恢复自动检测', 'settings.saved': '已保存，下次加载生效', 'settings.reset.done': '已恢复自动检测',
      'settings.lang': '语言切换', 'settings.lang.hint': '当前语言：',
      'settings.seed': '助记词管理', 'settings.seed.desc': '创建、备份与导入助记词均在钱包页完成，私钥只保存在本地浏览器。',
      'settings.seed.cta': '前往钱包管理',
      'settings.security': '安全中心', 'settings.security.wallet': '钱包状态',
      'settings.security.connected': '已连接', 'settings.security.disconnected': '未连接钱包',
      'settings.security.clear': '清除本地演示数据', 'settings.security.confirm': '确认清除所有本地演示数据？此操作不可撤销。',
      'settings.about': '关于 Nova', 'settings.about.license': '开源许可',
      'arb.eyebrow': 'ARBITRATION 路 COMMUNITY', 'arb.title': '社区仲裁', 'arb.sub': '质押 500 NOVA 申请仲裁员；VRF 抽取、匿名投票、自动执行赔付，保障每一笔交易。',
      'arb.summary.arbitrators': '在职仲裁员', 'arb.summary.candidates': '候选池', 'arb.summary.open': '在途案件', 'arb.summary.cases': '累计案件', 'arb.summary.eco': '生态基金', 'arb.summary.slashed': '罚没总额',
      'arb.tab.public': '公众公示', 'arb.tab.user': '我的投诉', 'arb.tab.arb': '仲裁工作台',
      'arb.role.arbitrator': '仲裁员', 'arb.role.user': '普通用户', 'arb.role.guest': '未连接钱包',
      'arb.list.title': '在职仲裁员', 'arb.list.addr': '地址', 'arb.list.rep': '信誉分', 'arb.list.cases': '累计裁决', 'arb.list.revenue': '累计收益', 'arb.list.term': '任期至',
      'arb.cand.title': '候选池与申请', 'arb.cand.stake': '质押门槛', 'arb.cand.apply': '申请成为仲裁员（质押 500 NOVA）', 'arb.cand.apply.cta': '质押申请',
      'arb.cand.status.voting': '投票中', 'arb.cand.status.passed': '已通过', 'arb.cand.status.failed': '未通过', 'arb.cand.kind.renew': '连任',
      'arb.vote.title': '候选社区投票（1 NOVA = 1 票）', 'arb.vote.yes': '赞成', 'arb.vote.no': '反对', 'arb.vote.done': '已投',
      'arb.cases.title': '案件公示', 'arb.cases.empty': '暂无案件', 'arb.cases.result.buyer': '支持买家', 'arb.cases.result.seller': '支持卖家',
      'arb.status.pending_draw': '待抽取', 'arb.status.voting': '仲裁中', 'arb.status.decided': '已裁决', 'arb.status.settled': '已结案',
      'arb.status.second_pending': '二次仲裁·待抽取', 'arb.status.second_voting': '二次仲裁中',
      'arb.complain.title': '发起投诉', 'arb.complain.trade': '交易 ID', 'arb.complain.seller': '卖家地址', 'arb.complain.reason': '投诉理由', 'arb.complain.evidence': '证据链接（可选）', 'arb.complain.cta': '支付保证金并投诉', 'arb.complain.deposit': '当前保证金档位',
      'arb.mine.title': '我的投诉', 'arb.mine.empty': '还没有投诉记录', 'arb.mine.draw': '立即抽取仲裁员', 'arb.mine.you': '您（投诉人）', 'arb.mine.seller': '卖家',
      'arb.second.title': '二次仲裁', 'arb.second.cta': '发起二次仲裁（50 NOVA）', 'arb.second.window': '上诉窗口至',
      'arb.work.title': '待处理案件（匿名编号）', 'arb.work.empty': '暂无待处理案件', 'arb.work.deadline': '投票截止', 'arb.work.voted': '已投票',
      'arb.detail.title': '案件详情', 'arb.detail.trade': '交易', 'arb.detail.reason': '理由', 'arb.detail.evidence': '证据', 'arb.detail.panel': '仲裁面板（匿名编号）',
      'arb.vote.buyer': '支持买家', 'arb.vote.seller': '支持卖家', 'arb.decline': '声明利益冲突（信誉分 +1）',
      'arb.myruling.title': '我的裁决', 'arb.myruling.accuracy': '正确率', 'arb.myruling.empty': '暂无裁决记录',
      'arb.stats.title': '信誉分与收益', 'arb.stats.rep': '当前信誉分', 'arb.stats.revenue': '累计收益', 'arb.stats.cases': '已裁决案件', 'arb.stats.term': '任期剩余', 'arb.stats.stake': '质押',
      'arb.stats.status.suspended': '已暂停（需重新质押激活）', 'arb.stats.status.retired': '已退休', 'arb.stats.status.leaving': '退出中', 'arb.stats.status.renewing': '连任投票中', 'arb.stats.status.observing': '观察期', 'arb.stats.status.banned': '已永久取消资格',
      'arb.renew.cta': '申请连任', 'arb.exit.cta': '声明退出', 'arb.reactivate.cta': '重新质押激活（500 NOVA）', 'arb.claim.cta': '领取质押返还',
      'arb.notif.title': '链上通知', 'arb.notif.empty': '暂无通知', 'arb.notif.markread': '全部已读',
      'arb.toast.ok': '操作成功', 'arb.toast.fail': '操作失败', 'arb.toast.nofail': '失败', 'arb.day': '天',
      'arb.notify.popup': '仲裁通知', 'arb.notify.new': '收到新通知',
      'settings.about.privacy': '隐私政策：钱包私钥与助记词仅保存在浏览器本地，不上传任何服务器。'
    },
    en: {
      'nav.home': 'Home', 'nav.wallet': 'Wallet', 'nav.explore': 'Explore',
      'nav.rewards': 'Rewards', 'nav.settings': 'Settings',
      'net.demo': 'Demo Network', 'net.node': 'Local Node',
      'chip.connect': 'Connect Wallet', 'chip.mode.node': 'Node', 'chip.mode.demo': 'Demo',
      'app.sidebar': 'Main', 'app.nav': 'Mobile navigation', 'app.mode': 'Current network mode',
      'app.title': 'Nova Chain · Supernova Parallel Universe',
      'home.assets': 'Assets Overview', 'home.assets.total': 'Total Assets', 'home.assets.locked': 'Locked Assets',
      'home.assets.checkin': 'Check-in Today', 'home.chain': 'On-chain Data',
      'home.chain.block': 'Block Height', 'home.chain.nodes': 'Online Nodes', 'home.chain.staked': 'Total Staked',
      'home.presale': 'Presale Progress', 'home.presale.stage': 'Current Stage', 'home.presale.price': 'Current Price',
      'home.presale.sold': 'Sold', 'home.quick': 'Quick Actions',
      'home.quick.transfer': 'Transfer', 'home.quick.stake': 'Stake', 'home.quick.explore': 'Explore', 'home.quick.checkin': 'Check-in',
      'home.modules': 'Modules', 'home.connect': 'Connect Wallet', 'home.unconnected': 'Not Connected',
      'home.hello': 'Welcome back', 'home.mode.node': 'Node ready · Local RPC', 'home.mode.demo': 'Demo mode · Static preview',
      'home.days': 'days', 'home.checked': 'Checked in ·', 'home.notchecked': 'Not checked in',
      'home.modules.desc.home': 'Assets & chain dashboard', 'home.modules.desc.wallet': 'Create, transfer & history',
      'home.modules.desc.explore': 'Cipher, box, text, music', 'home.modules.desc.rewards': 'Stake, check-in & arbitration',
      'home.modules.desc.settings': 'Network, security & language',
      'explore.eyebrow': 'EXPLORE · MARKET', 'explore.title': 'Explore · Content Market',
      'explore.sub': 'Search, publish and buy: encrypted content, mystery boxes, text market and music NFTs — all content trading in one place.',
      'explore.search': 'Search markets (cipher / blind box / text / music)',
      'explore.core': 'Core Markets', 'explore.tag.live': 'Live', 'explore.tag.soon': 'Coming Soon',
      'explore.encrypted': 'Encrypted Content', 'explore.encrypted.desc': 'Publish, purchase and unlock end-to-end encrypted content with on-chain proof.',
      'explore.blind': 'Mystery Box', 'explore.blind.desc': 'On-chain random boxes — open to win NFTs and fan tokens.',
      'explore.text': 'Text Market', 'explore.text.desc': 'Read, tip and trade rights for novels, poetry and serials.',
      'explore.music': 'Music NFT', 'explore.music.desc': 'Upload, mint and buy on-chain records; collect to unlock fan perks.',
      'explore.ai': 'AI Musicians', 'explore.ai.desc': 'On-chain release and royalty splits for AI-generated music. Coming soon.',
      'explore.ecosystem': 'More Ecosystem',
      'explore.nft': 'NFT Collectibles', 'explore.nft.desc': 'Mint, trade and transfer digital collectibles.',
      'explore.games': 'Games', 'explore.games.desc': 'Quantum dice and star-track racing with on-chain leaderboards.',
      'explore.video': 'Video', 'explore.video.desc': 'Creator channels and motion showcases.',
      'explore.live': 'Live', 'explore.live.desc': 'Live chat interaction and gift tipping.',
      'explore.social': 'Social', 'explore.social.desc': 'Creator updates with on-chain timestamps.',
      'explore.stage': 'Virtual Stage', 'explore.stage.desc': 'Immersive shows with NFT tickets.',
      'explore.storage': 'Decentralized Storage', 'explore.storage.desc': 'Content pinning and on-chain proofs.',
      'explore.compute': 'On-chain Compute', 'explore.compute.desc': 'Verifiable computing task market.',
      'explore.socialfi': 'On-chain Ecosystem', 'explore.socialfi.desc': 'Ten SocialFi play modes with a reputation system.',
      'rewards.eyebrow': 'REWARDS · STAKE', 'rewards.title': 'Rewards · Staking & Incentives',
      'rewards.sub': 'Super node staking, daily check-in and early rewards in one place; community arbitration protects every trade.',
      'rewards.stake': 'Super Node Staking', 'rewards.apy': 'Est. APY', 'rewards.min': 'Minimum',
      'rewards.status': 'Status', 'rewards.stake.cta': 'Open Staking Center', 'rewards.stake.demo': 'Try Demo Mode',
      'rewards.stake.active': 'Open for staking', 'rewards.checkin': 'Daily Check-in', 'rewards.checkin.streak': 'Streak',
      'rewards.checkin.desc': 'Earn 5 NOVA per check-in', 'rewards.checkin.done': 'Checked in today',
      'rewards.checkin.cta': 'Check-in', 'rewards.checkin.done2': 'Checked in', 'rewards.checkin.days': 'days',
      'rewards.checkin.count': 'Total', 'rewards.early': 'Early Rewards', 'rewards.early.total': 'Total Pool',
      'rewards.early.desc': 'Claimed', 'rewards.early.cta': 'Claim Rewards', 'rewards.early.done': 'Fully Claimed',
      'rewards.arb': 'Community Arbitration', 'rewards.arb.complain': 'Complaints', 'rewards.arb.complain.desc': 'Submit trade disputes online with evidence preserved.',
      'rewards.arb.verify': 'Verification', 'rewards.arb.verify.desc': 'On-chain proof and multi-sig arbitrator review.',
      'rewards.arb.pay': 'Payouts', 'rewards.arb.pay.desc': 'Automatic payout once arbitration passes.',
      'rewards.arb.cta2': 'Open Community Arbitration', 'rewards.arb.cta': 'Open On-chain Ecosystem · Arbitration',
      'toast.checkin.done': 'Already checked in today', 'toast.checkin.ok': 'Check-in +5 NOVA',
      'toast.checkin.nowallet': 'Checked in (not credited: wallet not connected)',
      'toast.early.claimed': 'Claimed', 'toast.early.fail': 'Claim failed', 'toast.cleared': 'Local data cleared',
      'settings.eyebrow': 'SETTINGS', 'settings.title': 'Settings',
      'settings.sub': 'Network, seed phrase, security and language preferences — all stored locally.',
      'settings.network': 'Network Settings', 'settings.rpc': 'RPC Endpoint', 'settings.save': 'Save',
      'settings.reset': 'Restore Auto-detect', 'settings.saved': 'Saved — applies on next load', 'settings.reset.done': 'Auto-detect restored',
      'settings.lang': 'Language', 'settings.lang.hint': 'Current language: ',
      'settings.seed': 'Seed Phrase Management', 'settings.seed.desc': 'Create, back up and import your seed phrase in the Wallet page. Keys never leave your browser.',
      'settings.seed.cta': 'Open Wallet',
      'settings.security': 'Security Center', 'settings.security.wallet': 'Wallet Status',
      'settings.security.connected': 'Connected', 'settings.security.disconnected': 'No wallet connected',
      'settings.security.clear': 'Clear Local Demo Data', 'settings.security.confirm': 'Clear all local demo data? This cannot be undone.',
      'settings.about': 'About Nova', 'settings.about.license': 'License',
      'arb.eyebrow': 'ARBITRATION 路 COMMUNITY', 'arb.title': 'Community Arbitration', 'arb.sub': 'Stake 500 NOVA to apply as an arbitrator; VRF selection, anonymous voting and automatic payouts protect every trade.',
      'arb.summary.arbitrators': 'Arbitrators', 'arb.summary.candidates': 'Candidates', 'arb.summary.open': 'Open Cases', 'arb.summary.cases': 'Total Cases', 'arb.summary.eco': 'Eco Fund', 'arb.summary.slashed': 'Slashed',
      'arb.tab.public': 'Public', 'arb.tab.user': 'My Complaints', 'arb.tab.arb': 'Arbitration Desk',
      'arb.role.arbitrator': 'Arbitrator', 'arb.role.user': 'User', 'arb.role.guest': 'No wallet',
      'arb.list.title': 'Active Arbitrators', 'arb.list.addr': 'Address', 'arb.list.rep': 'Reputation', 'arb.list.cases': 'Rulings', 'arb.list.revenue': 'Revenue', 'arb.list.term': 'Term until',
      'arb.cand.title': 'Candidates & Apply', 'arb.cand.stake': 'Stake', 'arb.cand.apply': 'Apply as arbitrator (stake 500 NOVA)', 'arb.cand.apply.cta': 'Apply',
      'arb.cand.status.voting': 'Voting', 'arb.cand.status.passed': 'Passed', 'arb.cand.status.failed': 'Failed', 'arb.cand.kind.renew': 'Renewal',
      'arb.vote.title': 'Community vote (1 NOVA = 1 vote)', 'arb.vote.yes': 'Approve', 'arb.vote.no': 'Reject', 'arb.vote.done': 'Voted',
      'arb.cases.title': 'Public Cases', 'arb.cases.empty': 'No cases yet', 'arb.cases.result.buyer': 'For buyer', 'arb.cases.result.seller': 'For seller',
      'arb.status.pending_draw': 'Drawing', 'arb.status.voting': 'In progress', 'arb.status.decided': 'Decided', 'arb.status.settled': 'Settled',
      'arb.status.second_pending': 'Appeal 路 drawing', 'arb.status.second_voting': 'Appeal in progress',
      'arb.complain.title': 'File a Complaint', 'arb.complain.trade': 'Trade ID', 'arb.complain.seller': 'Seller address', 'arb.complain.reason': 'Reason', 'arb.complain.evidence': 'Evidence link (optional)', 'arb.complain.cta': 'Pay deposit & file', 'arb.complain.deposit': 'Deposit tier',
      'arb.mine.title': 'My Complaints', 'arb.mine.empty': 'No complaints yet', 'arb.mine.draw': 'Draw arbitrators', 'arb.mine.you': 'You (buyer)', 'arb.mine.seller': 'Seller',
      'arb.second.title': 'Second Arbitration', 'arb.second.cta': 'Appeal (50 NOVA)', 'arb.second.window': 'Appeal window until',
      'arb.work.title': 'Pending cases (anonymous #)', 'arb.work.empty': 'No pending cases', 'arb.work.deadline': 'Deadline', 'arb.work.voted': 'Voted',
      'arb.detail.title': 'Case detail', 'arb.detail.trade': 'Trade', 'arb.detail.reason': 'Reason', 'arb.detail.evidence': 'Evidence', 'arb.detail.panel': 'Panel (anonymous #)',
      'arb.vote.buyer': 'For buyer', 'arb.vote.seller': 'For seller', 'arb.decline': 'Declare conflict (+1 reputation)',
      'arb.myruling.title': 'My Rulings', 'arb.myruling.accuracy': 'Accuracy', 'arb.myruling.empty': 'No rulings yet',
      'arb.stats.title': 'Reputation & Revenue', 'arb.stats.rep': 'Reputation', 'arb.stats.revenue': 'Total revenue', 'arb.stats.cases': 'Ruled cases', 'arb.stats.term': 'Term left', 'arb.stats.stake': 'Stake',
      'arb.stats.status.suspended': 'Suspended (reactivate by staking)', 'arb.stats.status.retired': 'Retired', 'arb.stats.status.leaving': 'Leaving', 'arb.stats.status.renewing': 'Renewal voting', 'arb.stats.status.observing': 'Observing', 'arb.stats.status.banned': 'Permanently banned',
      'arb.renew.cta': 'Apply for renewal', 'arb.exit.cta': 'Declare exit', 'arb.reactivate.cta': 'Reactivate (500 NOVA)', 'arb.claim.cta': 'Claim stake',
      'arb.notif.title': 'On-chain Notifications', 'arb.notif.empty': 'No notifications', 'arb.notif.markread': 'Mark all read',
      'arb.toast.ok': 'Success', 'arb.toast.fail': 'Failed', 'arb.toast.nofail': 'failed', 'arb.day': 'days',
      'arb.notify.popup': 'Arbitration notice', 'arb.notify.new': 'New notification',
      'settings.about.privacy': 'Privacy: wallet keys and seed phrases stay in your browser only and are never uploaded.'
    }
  };
  var lang = 'zh';
  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key;
  }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (k && I18N.zh[k] && I18N[lang][k]) el.textContent = t(k);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (k && I18N.zh[k] && I18N[lang][k]) el.setAttribute('placeholder', t(k));
    });
  }
  function initLang() {
    var saved = lsGet('nova_lang', '');
    lang = (saved === 'en') ? 'en' : 'zh';
    if (document.documentElement) document.documentElement.lang = (lang === 'en' ? 'en' : 'zh');
    applyI18n();
  }
  function setLang(l) {
    lang = (l === 'en') ? 'en' : 'zh';
    lsSet('nova_lang', lang);
    if (document.documentElement) document.documentElement.lang = (lang === 'en' ? 'en' : 'zh');
    applyI18n();
    renderTopbar();
    window.dispatchEvent(new CustomEvent('nova-lang', { detail: { lang: lang } }));
  }
  initLang();

  function updateWalletUI() {
    var chip = document.getElementById('walletChip');
    if (!chip) return;
    var text = chip.querySelector('.chip-text');
    var bal = chip.querySelector('.chip-bal');
    if (state.connected) {
      chip.classList.add('connected');
      text.textContent = shortAddr(state.addr) + ' · ' + t(state.mode === 'node' ? 'chip.mode.node' : 'chip.mode.demo');
      bal.textContent = fmt(state.balance) + ' NOVA';
    } else {
      chip.classList.remove('connected');
      text.textContent = t('chip.connect');
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
    var linkArr = NAV_ITEMS.map(function (n) {
      return '<a class="nav-link' + (n.key === state.active ? ' active' : '') + '" href="' + n.href + '">' +
        '<span class="nav-icon">' + n.icon + '</span><span class="nav-label">' + t(n.labelKey) + '</span></a>';
    });
    var side = linkArr.slice(0, 2).join('') +
      '<span class="side-sep"></span>' +
      linkArr.slice(2).join('');
    var bottom = BOTTOM_NAV.map(function (n) {
      return '<a class="bn-item' + (n.key === state.active ? ' active' : '') + '" href="' + n.href + '">' +
        '<span class="bn-icon">' + n.icon + '</span><span>' + t(n.labelKey) + '</span></a>';
    }).join('');
    el.innerHTML =
      '<aside class="sidebar" aria-label="' + t('app.sidebar') + '">' + side + '</aside>' +
      '<header class="topbar">' +
        '<a class="brand" href="./index.html"><span class="logo">⬡</span><span class="brand-name">Nova Chain</span></a>' +
        '<span class="spacer"></span>' +
        '<span class="net-pill ' + (state.mode || 'demo') + '" id="netPill" title="' + t('app.mode') + '">' +
          '<span class="dot"></span><span class="net-name" id="netName">' +
          t(state.mode === 'node' ? 'net.node' : 'net.demo') + '</span>' +
        '</span>' +
        '<div class="lang-switch" id="langSwitch" role="group" aria-label="Language">' +
          '<button type="button" class="lang-opt' + (lang === 'zh' ? ' active' : '') + '" data-lang="zh">中文</button>' +
          '<button type="button" class="lang-opt' + (lang === 'en' ? ' active' : '') + '" data-lang="en">EN</button>' +
        '</div>' +
        '<button class="wallet-chip" id="walletChip" title="Nova Wallet">' +
          '<span class="dot"></span><span class="chip-text">' + t('chip.connect') + '</span><span class="chip-bal"></span>' +
        '</button>' +
      '</header>' +
      '<nav class="bottom-nav" aria-label="' + t('app.nav') + '">' + bottom + '</nav>';
    document.body.classList.add('nav-shell');
    var langSwitch = document.getElementById('langSwitch');
    if (langSwitch) {
      langSwitch.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('.lang-opt') : null;
        if (b && b.getAttribute('data-lang') !== lang) setLang(b.getAttribute('data-lang'));
      });
    }
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
    if (op.indexOf('nova:arb:') === 0) return arbDemoAction(op, fields || {}, amount);
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
    if (op === 'nova:ai:svc:register') {
      var svcType = String(fields.service_type || '');
      if (['suno', 'openai', 'stable_diffusion', 'custom'].indexOf(svcType) < 0)
        return { ok: false, error: '不支持的 AI 服务类型' };
      var svcName = String(fields.name || '').trim();
      var svcModel = String(fields.model || '').trim();
      if (!svcName || svcName.length > 64) return { ok: false, error: '服务名称需为 1-64 字符' };
      if (!svcModel || svcModel.length > 64) return { ok: false, error: '模型名称需为 1-64 字符' };
      s.services = s.services || {};
      var sid = demoHash('ai:svc:' + svcType + ':' + addr + ':' + Date.now());
      s.services[sid] = { id: sid, owner: addr, service_type: svcType, name: svcName,
        model: svcModel, endpoint_hash: String(fields.endpoint_hash || '').slice(0, 128),
        status: 'active', created_at: Date.now() };
      aiEvent(s, op, sid, '登记 AI 服务「' + svcName + '」（' + svcType + '）');
      saveAiStore(s);
      return { ok: true, id: sid, demo: true };
    }
    if (op === 'nova:ai:svc:config') {
      s.services = s.services || {};
      var svc = s.services[String(fields.svc_id || '')];
      var svcAction = String(fields.action || '');
      if (!svc || svc.owner !== addr) return { ok: false, error: '服务不存在或非所有者' };
      if (svcAction !== 'pause' && svcAction !== 'resume') return { ok: false, error: '动作无效' };
      svc.status = svcAction === 'pause' ? 'paused' : 'active';
      svc.updated_at = Date.now();
      aiEvent(s, op, svc.id, svcAction === 'pause' ? '暂停服务' : '恢复服务');
      saveAiStore(s);
      return { ok: true, id: svc.id, demo: true };
    }
    if (op === 'nova:ai:muso:config') {
      s.muso = s.muso || {};
      var enabled = !!fields.enabled;
      var schedule = String(fields.schedule || 'daily');
      if (schedule !== 'daily' && schedule !== 'weekly') return { ok: false, error: 'schedule 需为 daily/weekly' };
      var hour = Number(fields.hour || 0);
      if (!(hour >= 0 && hour <= 23)) return { ok: false, error: 'hour 需在 0-23' };
      var budget = Number(fields.budget || 0);
      if (!(budget >= 0 && budget <= 10000)) return { ok: false, error: 'budget 需在 0-10000' };
      s.muso.enabled = enabled; s.muso.schedule = schedule; s.muso.hour = hour;
      s.muso.weekday = Number(fields.weekday || 0); s.muso.budget = round4(budget);
      s.muso.updated_at = Date.now();
      aiEvent(s, op, addr, (enabled ? '开启' : '关闭') + ' AI 音乐人循环（' + schedule + ' ' + hour + ':00）');
      saveAiStore(s);
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:ai:work:create') {
      var wTitle = String(fields.title || '').trim();
      var wCid = String(fields.cid || '').trim();
      if (!wTitle || wTitle.length > 128) return { ok: false, error: '作品标题需为 1-128 字符' };
      if (!wCid || wCid.length > 128) return { ok: false, error: 'IPFS CID 无效' };
      s.works = s.works || {};
      s.muso = s.muso || {};
      var wid = demoHash('ai:work:' + wTitle + ':' + addr + ':' + Date.now());
      var sales0 = 0;
      Object.keys(s.works).forEach(function (k) { if (s.works[k].artist === addr) sales0 += s.works[k].sales || 0; });
      var price = fields.price != null ? Number(fields.price)
        : aiSuggestPrice(String(fields.task_type || 'ai_music'), sales0);
      if (!(price >= 0.1 && price <= 50)) return { ok: false, error: '售价需在 0.1-50 NOVA' };
      var work = { id: wid, title: wTitle, artist: addr, cid: wCid, price: round4(price),
        task_id: String(fields.task_id || ''), task_type: String(fields.task_type || 'ai_music'),
        trigger_id: String(fields.trigger_id || ''), sales: 0, revenue: 0, compute_paid: 0,
        meta: String(fields.meta || '').slice(0, 512), created_at: Date.now() };
      s.works[wid] = work;
      if (work.trigger_id && s.triggers && s.triggers[work.trigger_id]) {
        s.triggers[work.trigger_id].status = 'done';
        s.triggers[work.trigger_id].work_id = wid;
      }
      s.muso.today_count = (s.muso.today_count || 0) + 1;
      s.muso.total_generated = (s.muso.total_generated || 0) + 1;
      s.muso.last_run = Date.now();
      aiFundLedger(s, 'income', 'work_publish', wid, addr, 0, '作品上架「' + wTitle + '」售价 ' + price + ' NOVA');
      aiEvent(s, op, wid, '作品上架「' + wTitle + '」售价 ' + price + ' NOVA');
      saveAiStore(s);
      return { ok: true, id: wid, price: work.price, demo: true };
    }
    if (op === 'nova:ai:work:buy') {
      s.works = s.works || {};
      s.muso = s.muso || {};
      var wid2 = String(fields.wid || '');
      var wb = s.works[wid2];
      if (!wb) return { ok: false, error: '作品不存在' };
      if (addr === wb.artist) return { ok: false, error: '不能购买自己的作品' };
      var amt = Number(amount || 0);
      if (Math.abs(amt - wb.price) > 1e-9) return { ok: false, error: '金额需与售价一致' };
      if (demoBal(addr) < amt) return { ok: false, error: '余额不足' };
      var cShare = round4(amt * 0.70), mShare = round4(amt * 0.20), fShare = round4(amt * 0.10);
      demoSetBal(wb.artist, demoBal(wb.artist) + cShare);
      demoSetBal(addr, demoBal(addr) - amt);
      demoLedger(addr, wb.artist, cShare, '购买 AI 作品「' + wb.title + '」创作者分账 70%', 'ai');
      s.fund_balance = round4((s.fund_balance || 0) + fShare);
      demoLedger(addr, '0x_ai_growth_fund', fShare, '购买 AI 作品「' + wb.title + '」成长基金 10%', 'ai');
      if (wb.task_id && s.compute_workers) {
        var cw = s.compute_workers[wb.task_id] || [];
        var per = round4(mShare / Math.max(1, cw.length));
        cw.forEach(function (w) { demoSetBal(w, demoBal(w) + per); });
        demoLedger(addr, cw[0] || TREASURY, mShare, '购买 AI 作品「' + wb.title + '」算力分账 20%', 'ai');
      } else {
        demoLedger(addr, '0x_compute_pool', mShare, '购买 AI 作品「' + wb.title + '」算力分账 20%（入池）', 'ai');
      }
      wb.sales = (wb.sales || 0) + 1;
      wb.revenue = round4((wb.revenue || 0) + amt);
      wb.compute_paid = round4((wb.compute_paid || 0) + mShare);
      s.muso.total_sales = (s.muso.total_sales || 0) + 1;
      s.muso.total_revenue = round4((s.muso.total_revenue || 0) + amt);
      aiFundLedger(s, 'income', 'work_sale', wid2, addr, amt, '购买「' + wb.title + '」：70% 创作者 / 20% 算力 / 10% 基金');
      aiEvent(s, op, wid2, '购买「' + wb.title + '」' + amt + ' NOVA（70/20/10 自动分账）');
      saveAiStore(s); refreshBalance();
      return { ok: true, id: wid2, creator: cShare, compute: mShare, fund: fShare, demo: true };
    }
    if (op === 'nova:ai:trigger') {
      var trigType = String(fields.service_type || 'suno');
      if (['suno', 'openai', 'stable_diffusion', 'custom'].indexOf(trigType) < 0)
        return { ok: false, error: '不支持的 AI 服务类型' };
      if (Math.abs(Number(amount || 0) - 2) > 1e-9) return { ok: false, error: '触发费用需为 2 NOVA' };
      if (demoBal(addr) < 2) return { ok: false, error: '余额不足' };
      s.triggers = s.triggers || {};
      s.fund_balance = round4((s.fund_balance || 0) + 2);
      demoSetBal(addr, demoBal(addr) - 2);
      demoLedger(addr, '0x_ai_growth_fund', 2, '社区付费触发 AI 创作（' + trigType + '）', 'ai');
      var tid3 = demoHash('ai:trigger:' + addr + ':' + Date.now());
      s.triggers[tid3] = { id: tid3, by: addr, amount: 2, service_type: trigType,
        status: 'pending', created_at: Date.now() };
      aiFundLedger(s, 'income', 'trigger', tid3, addr, 2, '社区付费触发 AI 创作（' + trigType + '）');
      aiEvent(s, op, tid3, '付费触发 AI 创作（' + trigType + '），基金 +2 NOVA');
      saveAiStore(s); refreshBalance();
      return { ok: true, id: tid3, demo: true };
    }
    if (op === 'nova:ai:fund:guard') {
      var target = String(fields.addr || '');
      if (!/^0x[0-9a-fA-F]{40}$/.test(target)) return { ok: false, error: '目标地址无效' };
      s.fund_guardians = s.fund_guardians || [];
      if (s.fund_guardians.indexOf(target) < 0) s.fund_guardians.push(target);
      aiEvent(s, op, target, '授权基金监护人 ' + String(target).slice(0, 12) + '…');
      saveAiStore(s);
      return { ok: true, id: target, demo: true };
    }
    if (op === 'nova:ai:fund:spend') {
      var recipient = String(fields.recipient || '');
      var purpose = String(fields.purpose || '');
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) return { ok: false, error: '收款地址无效' };
      if (!purpose || purpose.length > 128) return { ok: false, error: '用途说明无效' };
      var spendAmt = Number(amount || 0);
      if (!(spendAmt > 0)) return { ok: false, error: '金额无效' };
      if ((s.fund_guardians || []).indexOf(addr) < 0) return { ok: false, error: '仅基金监护人可支出' };
      if ((s.fund_balance || 0) < spendAmt) return { ok: false, error: '基金余额不足' };
      var FUND_LIMIT = 20; // 与链上 FUND_SINGLE_SPEND_LIMIT 一致（H-04）
      if (spendAmt > FUND_LIMIT) {
        // 大额支出：进入双监护人审批
        s.fund_pending = s.fund_pending || {};
        s.fund_pending_seq = (s.fund_pending_seq || 0) + 1;
        var pid = 'spend_' + s.fund_pending_seq;
        s.fund_pending[pid] = { id: pid, amount: round4(spendAmt), recipient: recipient,
          purpose: purpose, by: addr, approvals: [addr], created_at: Date.now() };
        aiFundLedger(s, 'pending', 'fund_spend_pending', pid, addr, spendAmt, '大额基金支出待审批：' + purpose);
        aiEvent(s, op, pid, '大额基金支出待审批 ' + spendAmt + ' NOVA：' + purpose);
        saveAiStore(s); refreshBalance();
        return { ok: true, id: pid, status: 'pending', demo: true };
      }
      // 小额支出：单监护人单日上限
      var dayKey = new Date().toISOString().slice(0, 10) + '|' + addr;
      s.fund_spend_day = s.fund_spend_day || {};
      var spentToday = s.fund_spend_day[dayKey] || 0;
      if (spentToday + spendAmt > FUND_LIMIT) return { ok: false, error: '超过单监护人单日支出上限（20 NOVA）' };
      s.fund_spend_day[dayKey] = round4(spentToday + spendAmt);
      s.fund_balance = round4((s.fund_balance || 0) - spendAmt);
      demoSetBal(recipient, demoBal(recipient) + spendAmt);
      demoLedger('0x_ai_growth_fund', recipient, spendAmt, '基金支出：' + purpose, 'ai');
      aiFundLedger(s, 'expense', 'fund_spend', recipient, addr, spendAmt, '基金支出：' + purpose);
      aiEvent(s, op, recipient, '基金支出 ' + spendAmt + ' NOVA：' + purpose);
      saveAiStore(s); refreshBalance();
      return { ok: true, id: recipient, demo: true };
    }
    if (op === 'nova:ai:fund:approve') {
      var apid = String(fields.pid || '');
      s.fund_pending = s.fund_pending || {};
      var ap = s.fund_pending[apid];
      if (!ap) return { ok: false, error: '待审批支出不存在或已处理' };
      if ((s.fund_guardians || []).indexOf(addr) < 0) return { ok: false, error: '仅基金监护人可审批' };
      if (ap.approvals.indexOf(addr) >= 0) return { ok: false, error: '该监护人已审批' };
      ap.approvals.push(addr);
      aiFundLedger(s, 'approval', 'fund_approve', apid, addr, 0, '审批大额支出：' + ap.purpose);
      aiEvent(s, op, apid, '监护人审批大额支出（' + ap.approvals.length + '/2）');
      if (ap.approvals.length < 2) { saveAiStore(s); return { ok: true, id: apid, status: 'waiting', demo: true }; }
      // 审批达成：执行转账
      s.fund_balance = round4((s.fund_balance || 0) - ap.amount);
      demoSetBal(ap.recipient, demoBal(ap.recipient) + ap.amount);
      demoLedger('0x_ai_growth_fund', ap.recipient, ap.amount, '基金支出（审批通过）：' + ap.purpose, 'ai');
      aiFundLedger(s, 'expense', 'fund_spend', ap.recipient, apid, ap.amount, '基金支出（审批通过）：' + ap.purpose);
      aiEvent(s, op, ap.recipient, '基金支出（审批通过）' + ap.amount + ' NOVA：' + ap.purpose);
      delete s.fund_pending[apid];
      saveAiStore(s); refreshBalance();
      return { ok: true, id: ap.recipient, amount: ap.amount, status: 'executed', demo: true };
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
  function demoCompute() { return lsGet(LS.compute, { tasks: {}, nodes: {}, audits: {}, events: [], fees_to_pool: 0, slashed: 0, audit_pass: 0, audit_fail: 0 }); }
  function demoStorageIncNodes() {
    var s = demoStorage();
    s.inc_nodes = s.inc_nodes || {};
    return s.inc_nodes;
  }
  function demoStorageIncStatus(cid) {
    var s = demoStorage();
    var f = (s.inc_files || {})[String(cid || '').toLowerCase()];
    if (!f) return { error: '文件未登记', cid: cid };
    var online = (f.replicas || []).filter(function (a) {
      var nd = demoStorageIncNodes()[a];
      return nd && nd.online !== false && !nd.exit_at;
    });
    var health = online.length >= 3 ? 'green' : (online.length >= 1 ? 'yellow' : 'red');
    f.online = online.length; f.health = health;
    return { cid: f.cid, found: true, owner: f.owner, title: f.title, size_gb: f.size_gb,
             health: health, online: online.length, replicas: (f.replicas || []).length,
             nodes: online, created_at: f.created_at, hot: !!f.hot };
  }
  function demoStorageIncChallenge(addr) {
    var nd = demoStorageIncNodes()[addr];
    if (!nd) return { found: false, reason: '未注册' };
    var files = (nd.assigned || []).slice(0, 3);
    if (!files.length) return { found: false, reason: '无已认领文件', day: 0, files: [] };
    return { found: true, day: Math.floor(Date.now() / 86400000), addr: addr,
             files: files, fragment_size: 1024, nonce: nd.challenge_seq || 0 };
  }
  function demoStorageIncNode(addr) {
    var nd = demoStorageIncNodes()[addr];
    if (!nd) return { found: false, addr: addr };
    var total = (nd.success_count || 0) + (nd.fail_count || 0);
    return { found: true, addr: addr, revenue: nd.revenue || 0, month_revenue: nd.month_revenue || 0,
             revenue_month: nd.revenue_month || '本月', stored_gb: nd.assigned_gb || 0,
             health_pct: total ? Math.round(nd.success_count * 100 / total) : 100,
             quota_gb: nd.quota_gb || 10, online: nd.online !== false,
             fail_count: nd.fail_count || 0, success_count: nd.success_count || 0,
             last_proof_at: nd.last_proof_at || 0, last_proof_epoch: nd.last_proof_epoch || 0,
             exit_at: nd.exit_at || 0 };
  }
  function demoStorageIncCreator(addr) {
    var s = demoStorage();
    var files = Object.keys(s.inc_files || {}).filter(function (c) {
      return s.inc_files[c].owner === addr;
    }).map(function (c) { return demoStorageIncStatus(c); });
    var evs = Object.keys(s.inc_events || {}).map(function (k) { return s.inc_events[k]; })
      .filter(function (e) { return e.creator === addr; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return { addr: addr, files: files, events: evs.slice(0, 50),
             unread: evs.filter(function (e) { return !e.read; }).length };
  }
  function demoStorageIncSummary() {
    var s = demoStorage();
    var nodes = demoStorageIncNodes();
    var files = s.inc_files || {};
    var statuses = Object.keys(files).map(function (c) { return demoStorageIncStatus(c); });
    var rewards = 0;
    Object.keys(nodes).forEach(function (a) { rewards += nodes[a].revenue || 0; });
    return { nodes: Object.keys(nodes).length, files: Object.keys(files).length,
             green: statuses.filter(function (x) { return x.health === 'green'; }).length,
             yellow: statuses.filter(function (x) { return x.health === 'yellow'; }).length,
             red: statuses.filter(function (x) { return x.health === 'red'; }).length,
             rewards_paid: rewards, slashed: 0, ecosystem_fund: 980000,
             events: Object.keys(s.inc_events || {}).length, demoMode: true };
  }
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
    // ---------- 存储激励（演示模拟） ----------
    if (op === 'nova:storage:inc:file') {
      var cid0 = String(fields.cid || '').trim().toLowerCase();
      var size0 = Number(fields.size_gb);
      var commit0 = String(fields.fragment_commit || '').trim().toLowerCase();
      if (!/^(0x[0-9a-f]{64}|bafy[a-z2-7]{46,58})$/.test(cid0)) return { ok: false, error: 'CID 格式无效' };
      if (!(size0 >= 0.001 && size0 <= 1024)) return { ok: false, error: '大小需在 0.001~1024 GB 之间' };
      if (!/^[0-9a-f]{64}$/.test(commit0)) return { ok: false, error: 'fragment_commit 需为 64 位十六进制' };
      s.inc_files = s.inc_files || {};
      if (s.inc_files[cid0]) return { ok: false, error: '该 CID 已登记' };
      s.inc_files[cid0] = { owner: addr, cid: cid0, title: fields.title || cid0.slice(0, 10),
        content_type: fields.content_type || 'music', size_gb: size0, fragment_commit: commit0,
        created_at: Date.now(), replicas: [], online: 0, health: 'red', hot: false, notified_red: false };
      saveDemoStorage(s);
      return { ok: true, id: cid0, demo: true };
    }
    if (op === 'nova:storage:inc:claim') {
      var cid1 = String(fields.cid || '').trim().toLowerCase();
      s.inc_files = s.inc_files || {}; s.inc_nodes = s.inc_nodes || {};
      var f1 = s.inc_files[cid1];
      var nd1 = s.inc_nodes[addr];
      if (!f1) return { ok: false, error: '文件未登记' };
      if (!nd1) return { ok: false, error: '请先质押成为存储节点' };
      if (f1.replicas.indexOf(addr) >= 0) return { ok: false, error: '已认领该文件' };
      if (f1.replicas.length >= 10) return { ok: false, error: '副本数已达上限（10）' };
      f1.replicas.push(addr);
      nd1.assigned_gb = round4(Number(nd1.assigned_gb || 0) + f1.size_gb);
      saveDemoStorage(s);
      return { ok: true, id: cid1, demo: true };
    }
    if (op === 'nova:storage:inc:prove') {
      s.inc_nodes = s.inc_nodes || {};
      var nd2 = s.inc_nodes[addr];
      if (!nd2) return { ok: false, error: '请先质押成为存储节点' };
      var day2 = Number(fields.day || 0);
      if (nd2.last_proof_epoch === day2) return { ok: false, error: '本周期已证明' };
      var files2 = fields.files || [];
      var frags2 = fields.fragments || [];
      if (!files2.length || files2.length !== frags2.length) return { ok: false, error: '文件与片段不匹配' };
      // 演示：校验每段 2048 hex 与文件登记承诺一致
      var bad = files2.filter(function (c, i) {
        var f = s.inc_files && s.inc_files[c];
        return !f || String(frags2[i] || '').length !== 2048;
      });
      if (bad.length) { nd2.fail_count = (nd2.fail_count || 0) + 1; saveDemoStorage(s);
        return { ok: false, error: '片段校验失败（计入失败次数）' }; }
      nd2.last_proof_epoch = day2;
      nd2.last_proof_at = Date.now();
      nd2.fail_count = 0;
      nd2.success_count = (nd2.success_count || 0) + 1;
      var reward2 = round4((nd2.assigned_gb || 0) / 30);
      nd2.revenue = round4((nd2.revenue || 0) + reward2);
      nd2.month_revenue = round4((nd2.month_revenue || 0) + reward2);
      demoSetBal(addr, demoBal(addr) + reward2);
      demoLedger(TREASURY, addr, reward2, '存储激励奖励 +' + reward2 + ' NOVA', 'storage');
      saveDemoStorage(s);
      refreshBalance();
      return { ok: true, id: addr, reward: reward2, demo: true };
    }
    if (op === 'nova:storage:inc:heartbeat') {
      s.inc_nodes = s.inc_nodes || {};
      var nd3 = s.inc_nodes[addr];
      if (!nd3) return { ok: false, error: '请先质押成为存储节点' };
      nd3.online = true; nd3.last_heartbeat = Date.now();
      saveDemoStorage(s);
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:storage:inc:upgrade') {
      s.inc_nodes = s.inc_nodes || {};
      var nd4 = s.inc_nodes[addr];
      if (!nd4) return { ok: false, error: '请先质押成为存储节点' };
      var amt4 = Number(amount || 0);
      if (!(amt4 > 0)) return { ok: false, error: '质押金额需大于 0' };
      if (demoBal(addr) < amt4) return { ok: false, error: '余额不足' };
      demoTransfer(addr, TREASURY, amt4);
      nd4.quota_gb = round4((nd4.quota_gb || 10) + amt4 * 0.1);
      saveDemoStorage(s);
      refreshBalance();
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:storage:inc:exit') {
      s.inc_nodes = s.inc_nodes || {};
      var nd5 = s.inc_nodes[addr];
      if (!nd5) return { ok: false, error: '请先质押成为存储节点' };
      if (nd5.exit_at) return { ok: false, error: '已声明退出' };
      nd5.exit_at = Date.now() / 1000 + 7 * 86400;
      nd5.online = false;
      saveDemoStorage(s);
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:storage:inc:reupload') {
      s.inc_files = s.inc_files || {};
      var oldC = String(fields.old_cid || '').toLowerCase();
      var newC = String(fields.new_cid || '').toLowerCase();
      var f2 = s.inc_files[oldC];
      if (!f2 || f2.owner !== addr) return { ok: false, error: '无权重新上传该文件' };
      if (s.inc_files[newC]) return { ok: false, error: '新 CID 已存在' };
      f2.cid = newC; f2.prev_cid = oldC; f2.fragment_commit = String(fields.fragment_commit || '').toLowerCase();
      f2.size_gb = Number(fields.size_gb || f2.size_gb); f2.notified_red = false; f2.health = 'yellow';
      s.inc_files[newC] = f2;
      delete s.inc_files[oldC];
      saveDemoStorage(s);
      return { ok: true, id: newC, demo: true };
    }
    if (op === 'nova:storage:inc:access') {
      s.inc_files = s.inc_files || {};
      var ac = String(fields.cid || '').toLowerCase();
      if (!s.inc_files[ac]) return { ok: false, error: '文件未登记' };
      s.inc_files[ac].access_today = (s.inc_files[ac].access_today || 0) + 1;
      saveDemoStorage(s);
      return { ok: true, id: ac, demo: true };
    }
    if (op === 'nova:storage:inc:settle' || op === 'nova:storage:inc:protect' || op === 'nova:storage:inc:reassign') {
      return { ok: true, id: demoHash(op), demo: true };
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
    var addr = state.asAddr || state.addr;
    function evt(ref, msg) {
      c.events = c.events || [];
      c.events.unshift({ op: op, id: ref, addr: addr, ts: Date.now(), summary: msg || ref });
      if (c.events.length > 100) c.events.length = 100;
    }
    if (op === 'nova:compute:register') {
      var cpu = Number(fields.cpu_cores);
      var vram = Number(fields.gpu_vram_gb || 0);
      var ram = Number(fields.ram_gb);
      var storage = Number(fields.storage_gb);
      if (!(cpu >= 1 && cpu <= 1024) || !(ram >= 1 && ram <= 4096) || !(storage >= 1) || !(vram >= 0 && vram <= 512))
        return { ok: false, error: '算力规格无效（CPU/内存/存储需为正数）' };
      c.nodes[addr] = {
        addr: addr, cpu_cores: cpu, gpu_model: String(fields.gpu_model || '').trim() || 'auto',
        gpu_vram_gb: vram, ram_gb: ram, storage_gb: storage,
        region: String(fields.region || 'auto'), latency_ms: Number(fields.latency_ms || 50),
        registered_at: Date.now(),
        reputation: 50, tier: '星云节点', bonus: 0.05, completed: 0, correct: 0, wrong: 0,
        complaints: 0, cheated: 0, task_reward: 0, bonus_reward: 0, block_reward: 0, audit_reward: 0
      };
      saveDemoCompute(c);
      evt(addr, '算力节点注册（' + cpu + ' 核 / ' + (fields.gpu_model || 'auto') + '）');
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:compute:stake') {
      var amtS = Number(amount || 0);
      if (!(amtS >= 100 && amtS <= 10000)) return { ok: false, error: '质押需在 100-10000 NOVA 之间' };
      var ndS = c.nodes[addr] = c.nodes[addr] || {};
      if ((ndS.stake || 0) + amtS > 10000) return { ok: false, error: '超过单节点质押上限' };
      if (demoBal(addr) < amtS) return { ok: false, error: '余额不足' };
      ndS.stake = round4((ndS.stake || 0) + amtS);
      ndS.reputation = ndS.reputation == null ? 50 : ndS.reputation;
      ndS.tier = ndS.tier || '星云节点'; ndS.bonus = ndS.bonus == null ? 0.05 : ndS.bonus;
      demoTransfer(addr, TREASURY, amtS);
      demoLedger(addr, TREASURY, amtS, '算力节点质押 ' + amtS + ' NOVA', 'compute');
      evt(addr, '质押 ' + amtS + ' NOVA（接单门槛）');
      saveDemoCompute(c); refreshBalance();
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:compute:unstake') {
      var ndU = c.nodes[addr];
      var uAmt = Number(amount || 0);
      if (!ndU || (ndU.stake || 0) < uAmt || uAmt <= 0) return { ok: false, error: '解押金额无效' };
      ndU.stake = round4((ndU.stake || 0) - uAmt);
      ndU.unbonding = { amount: round4(uAmt), release_at: Date.now() + 7 * 86400000 };
      evt(addr, '解押 ' + uAmt + ' NOVA（7 天冷静期）');
      saveDemoCompute(c);
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:compute:claim') {
      var ndCl = c.nodes[addr];
      var unb = ndCl && ndCl.unbonding;
      if (!unb || Date.now() < unb.release_at) return { ok: false, error: '冷静期未结束（7 天）' };
      var ca = unb.amount;
      ndCl.unbonding = null;
      demoSetBal(addr, demoBal(addr) + ca);
      demoLedger(TREASURY, addr, ca, '取回解押 ' + ca + ' NOVA', 'compute');
      evt(addr, '取回解押 ' + ca + ' NOVA');
      saveDemoCompute(c); refreshBalance();
      return { ok: true, id: addr, demo: true };
    }
    if (op === 'nova:compute:publish') {
      var spec = String(fields.spec || '').trim();
      var exp = Number(fields.expires_in);
      var bounty = Number(amount || 0);
      var taskType = String(fields.task_type || '');
      if (!spec || spec.length > 4096) return { ok: false, error: '任务描述无效' };
      if (!(exp >= 300 && exp <= 90 * 86400)) return { ok: false, error: '有效期需在 5 分钟~90 天之间' };
      if (!(bounty > 0)) return { ok: false, error: '预算需大于 0' };
      if (demoBal(addr) < bounty) return { ok: false, error: '余额不足' };
      var tid = demoHash('compute:task:' + spec + ':' + addr + ':' + Date.now());
      var mode = String(fields.mode || 'grab');
      var task0 = { id: tid, creator: addr, spec: spec, bounty: round4(bounty), status: 'open',
        accepted: [], assigned: [], bids: {}, results: {}, results_at: {},
        history: [{ state: 'open', at: Date.now(), by: addr }],
        mode: mode, min_nodes: Math.max(1, Number(fields.min_nodes || 2)),
        acceptance: String(fields.acceptance || ''), task_type: taskType,
        fee: round4(bounty * 0.01), created_at: Date.now(),
        expires_at: Date.now() + exp * 1000, audited: false, audit_pending: false, dispute_votes: {} };
      if (!taskType) { delete task0.task_type; delete task0.mode; delete task0.min_nodes; }
      c.tasks[tid] = task0;
      demoTransfer(addr, TREASURY, bounty);
      demoLedger(addr, TREASURY, bounty, '算力任务托管 ' + spec.slice(0, 24) + '…', 'compute');
      evt(tid, '发布算力任务（' + (taskType || 'legacy') + '，预算 ' + bounty + ' NOVA 已托管）');
      saveDemoCompute(c); refreshBalance();
      return { ok: true, id: tid, demo: true };
    }
    if (op === 'nova:compute:bid') {
      var tidB = String(fields.task_id || '');
      var tb = c.tasks[tidB];
      if (!tb || tb.mode !== 'bid' || (tb.status !== 'open' && tb.status !== 'bidding'))
        return { ok: false, error: '任务不存在或非竞价模式' };
      if (addr === tb.creator) return { ok: false, error: '发起者不能接单' };
      var q = Number(fields.quote);
      if (!(q > 0 && q <= tb.bounty)) return { ok: false, error: '报价需在 0-' + tb.bounty + ' 之间' };
      tb.bids[addr] = { addr: addr, quote: round4(q), at: Date.now() };
      tb.status = 'bidding';
      tb.history.push({ state: 'bidding', at: Date.now(), by: addr, note: '报价 ' + q + ' NOVA' });
      saveDemoCompute(c);
      evt(tidB, '竞价 ' + q + ' NOVA');
      return { ok: true, id: tidB, demo: true };
    }
    if (op === 'nova:compute:award') {
      var tidA = String(fields.task_id || '');
      var ta = c.tasks[tidA];
      var win = String(fields.winner || '');
      if (!ta || ta.creator !== addr) return { ok: false, error: '仅发起者可选标' };
      if (!ta.bids || !ta.bids[win]) return { ok: false, error: '该节点未出价' };
      ta.assigned = [win]; ta.accepted = [win]; ta.status = 'assigned'; ta.winner = win;
      ta.quote = ta.bids[win].quote; ta.assigned_at = Date.now();
      ta.history.push({ state: 'assigned', at: Date.now(), by: addr, note: '选标（' + ta.quote + ' NOVA）' });
      saveDemoCompute(c);
      evt(tidA, '选标 ' + String(win).slice(0, 10) + '…');
      return { ok: true, id: tidA, demo: true };
    }
    if (op === 'nova:compute:accept') {
      var tid2 = String(fields.task_id || '');
      var task = c.tasks[tid2];
      if (!task || (task.status !== 'open' && task.status !== 'bidding')) return { ok: false, error: '任务不存在或已结束' };
      if (addr === task.creator) return { ok: false, error: '不能接受自己发布的任务' };
      if (task.mode === 'bid') return { ok: false, error: '竞价任务请使用报价（bid）' };
      if (!c.nodes[addr]) return { ok: false, error: '未注册算力节点（注册或质押 100+ NOVA 自动具备资格）' };
      if ((task.accepted || []).indexOf(addr) >= 0) return { ok: false, error: '已接受该任务' };
      if (task.accepted.length >= 8) return { ok: false, error: '参与人数已满（8）' };
      if (task.mode === 'grab' && (task.assigned || []).length >= (task.min_nodes || 2))
        return { ok: false, error: '抢单名额已满' };
      task.accepted.push(addr);
      if (!task.assigned) task.assigned = [];
      task.assigned.push(addr);
      task.assigned_at = task.assigned_at || Date.now();
      if (task.task_type && task.assigned.length >= (task.min_nodes || 2)) {
        task.status = 'assigned';
        task.history.push({ state: 'assigned', at: Date.now(), by: addr, note: '抢单满员，进入执行' });
      } else {
        task.history.push({ state: 'open', at: Date.now(), by: addr, note: '接单' });
      }
      saveDemoCompute(c);
      evt(tid2, '接受算力任务');
      return { ok: true, id: tid2, demo: true };
    }
    if (op === 'nova:compute:submit') {
      var tid3 = String(fields.task_id || '');
      var rh = String(fields.result_hash || '').trim().toLowerCase();
      var task2 = c.tasks[tid3];
      if (!/^[0-9a-f]{64}$/.test(rh)) return { ok: false, error: '结果哈希需为 64 位十六进制' };
      if (!task2 || task2.status === 'completed' || task2.status === 'expired' || task2.status === 'failed')
        return { ok: false, error: '任务不存在或已结束' };
      if (addr === task2.creator || (task2.accepted || []).indexOf(addr) < 0) return { ok: false, error: '请先接受该任务' };
      if (task2.results[addr]) return { ok: false, error: '已提交过结果' };
      task2.results[addr] = rh;
      task2.results_at = task2.results_at || {};
      task2.results_at[addr] = Date.now();
      task2.history.push({ state: 'submitted', at: Date.now(), by: addr, note: '提交结果 ' + rh.slice(0, 10) + '…' });
      var counts = {};
      Object.keys(task2.results).forEach(function (w) {
        var h = task2.results[w]; counts[h] = (counts[h] || 0) + 1;
      });
      var agree = null;
      Object.keys(counts).forEach(function (h) { if (counts[h] >= 2) agree = h; });
      if (agree) {
        var workers = Object.keys(task2.results).filter(function (w) { return task2.results[w] === agree; }).slice(0, 2);
        var isBid = task2.mode === 'bid' && task2.quote;
        var each = round4((isBid ? task2.quote : task2.bounty) / workers.length
          * (task2.task_type ? (1 - 0.01) : 1));
        var fee2 = round4(task2.task_type && !isBid ? task2.bounty * 0.01 : 0);
        task2.status = 'completed'; task2.completed_at = Date.now(); task2.paid_workers = workers;
        task2.fees_to_pool = round4((task2.fees_to_pool || 0) + fee2);
        c.fees_to_pool = round4((c.fees_to_pool || 0) + fee2);
        task2.history.push({ state: 'completed', at: Date.now(), by: addr, note: '双节点结果一致，结算' });
        workers.forEach(function (w) {
          var bonus = 1 + ((c.nodes[w] || {}).bonus || 0);
          var pay = round4(each * bonus);
          demoSetBal(w, demoBal(w) + pay);
          demoLedger(TREASURY, w, pay, '算力结算 ' + task2.spec.slice(0, 20) + '…', 'compute');
          if (c.nodes[w]) {
            c.nodes[w].task_reward = round4((c.nodes[w].task_reward || 0) + pay);
            c.nodes[w].completed = (c.nodes[w].completed || 0) + 1;
            c.nodes[w].correct = (c.nodes[w].correct || 0) + 1;
          }
        });
        evt(tid3, '任务结算：双节点一致，每节点 +' + each + ' NOVA（含信誉加成）');
        demoMaybeAudit(c, tid3);
        saveDemoCompute(c); refreshBalance();
        return { ok: true, id: tid3, reward: each, status: 'completed', demo: true };
      }
      if (Object.keys(task2.results).length >= 2 && task2.task_type) {
        task2.status = 'arbitrating';
        task2.arbitrating_at = Date.now();
        task2.history.push({ state: 'arbitrating', at: Date.now(), by: addr, note: '结果不一致，进入第三方仲裁' });
        evt(tid3, '双节点结果不一致 → 等待第三方仲裁');
      } else if (task2.task_type && task2.status !== 'submitted') {
        task2.status = 'submitted';
        task2.history.push({ state: 'submitted', at: Date.now(), by: addr, note: '等待冗余节点结果' });
      }
      saveDemoCompute(c);
      return { ok: true, id: tid3, status: task2.status, demo: true };
    }
    if (op === 'nova:compute:arbitrate') {
      var tidAr = String(fields.task_id || '');
      var tar = c.tasks[tidAr];
      if (!tar || tar.status !== 'arbitrating') return { ok: false, error: '任务不在仲裁中' };
      if ((tar.accepted || []).indexOf(addr) >= 0 || addr === tar.creator) return { ok: false, error: '执行节点/发起者不能仲裁' };
      var rh2 = String(fields.result_hash || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(rh2)) return { ok: false, error: '结果哈希无效' };
      tar.arbiter = addr;
      tar.status = 'completed'; tar.completed_at = Date.now();
      var winners = Object.keys(tar.results).filter(function (w) { return tar.results[w] === rh2; });
      var payW = winners.length ? winners : Object.keys(tar.results);
      var eachA = round4(tar.bounty / payW.length * (1 - 0.01));
      c.fees_to_pool = round4((c.fees_to_pool || 0) + round4(tar.bounty * 0.01));
      payW.forEach(function (w) {
        demoSetBal(w, demoBal(w) + eachA);
        demoLedger(TREASURY, w, eachA, '仲裁结算 ' + tar.spec.slice(0, 20) + '…', 'compute');
        if (c.nodes[w]) { c.nodes[w].task_reward = round4((c.nodes[w].task_reward || 0) + eachA); c.nodes[w].completed++; c.nodes[w].correct++; }
      });
      Object.keys(tar.results).forEach(function (w) {
        if (tar.results[w] !== rh2 && c.nodes[w]) {
          c.nodes[w].wrong = (c.nodes[w].wrong || 0) + 1;
          c.nodes[w].reputation = Math.max(0, (c.nodes[w].reputation || 50) - 10);
          c.nodes[w].tier = c.nodes[w].reputation < 40 ? '轻量节点' : c.nodes[w].tier;
          c.nodes[w].bonus = c.nodes[w].reputation >= 60 ? 0.1 : (c.nodes[w].reputation >= 40 ? 0.05 : 0);
        }
      });
      tar.history.push({ state: 'completed', at: Date.now(), by: addr, note: '第三方仲裁完成' });
      evt(tidAr, '第三方仲裁完成，正确方获得报酬');
      saveDemoCompute(c); refreshBalance();
      return { ok: true, id: tidAr, demo: true };
    }
    if (op === 'nova:compute:dispute') {
      var tidD = String(fields.task_id || '');
      var td = c.tasks[tidD];
      if (!td || td.status !== 'completed') return { ok: false, error: '仅已完成任务可异议' };
      if (td.creator !== addr) return { ok: false, error: '仅发起者可提出异议' };
      if (Date.now() > (td.completed_at || 0) + 24 * 3600000) return { ok: false, error: '超过 24 小时异议窗口' };
      td.status = 'disputed'; td.frozen = round4(td.bounty); td.reason = String(fields.reason || '');
      td.dispute_votes = td.dispute_votes || {};
      td.history.push({ state: 'disputed', at: Date.now(), by: addr, note: '提出异议，预算冻结' });
      evt(tidD, '发起者异议 → 预算冻结，进入社区仲裁');
      saveDemoCompute(c);
      return { ok: true, id: tidD, demo: true };
    }
    if (op === 'nova:compute:vote') {
      var tidV = String(fields.task_id || '');
      var tv = c.tasks[tidV];
      if (!tv || tv.status !== 'disputed') return { ok: false, error: '任务不在社区仲裁中' };
      var support = String(fields.support || 'uphold');
      tv.dispute_votes = tv.dispute_votes || {};
      tv.dispute_votes[addr] = support;
      var ups = 0, downs = 0;
      Object.keys(tv.dispute_votes).forEach(function (a) {
        if (tv.dispute_votes[a] === 'uphold') ups++; else downs++;
      });
      if (ups >= 3 || downs >= 3) {
        var upheld = ups >= 3;
        tv.status = upheld ? 'failed' : 'completed';
        if (upheld) {
          var refund = round4(tv.bounty);
          demoSetBal(tv.creator, demoBal(tv.creator) + refund);
          demoLedger(TREASURY, tv.creator, refund, '争议仲裁退款 ' + tv.spec.slice(0, 20) + '…', 'compute');
          tv.history.push({ state: 'failed', at: Date.now(), by: addr, note: '社区仲裁支持异议，预算退回发起者' });
        } else {
          tv.history.push({ state: 'completed', at: Date.now(), by: addr, note: '社区仲裁驳回异议，结算恢复' });
        }
        evt(tidV, '社区仲裁 ' + (upheld ? '支持异议，预算退回' : '驳回异议，结算恢复'));
        saveDemoCompute(c); refreshBalance();
      } else {
        saveDemoCompute(c);
      }
      return { ok: true, id: tidV, demo: true };
    }
    if (op === 'nova:compute:audit') {
      var tidAu = String(fields.task_id || '');
      var ta2 = c.tasks[tidAu];
      var audit = (c.audits || {})[tidAu];
      if (!audit || audit.status !== 'pending') return { ok: false, error: '无待执行的抽查' };
      if (audit.auditor !== addr) return { ok: false, error: '非指定审计节点' };
      var rh3 = String(fields.result_hash || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(rh3)) return { ok: false, error: '结果哈希无效' };
      audit.status = 'done';
      audit.passed = rh3 === audit.result_hash;
      ta2.audit = audit;
      audit.submitted_at = Date.now();
      ta2.audited = true; ta2.audit_pending = false;
      if (audit.passed) {
        var ndA = c.nodes[addr] = c.nodes[addr] || {};
        ndA.audit_reward = round4((ndA.audit_reward || 0) + 0.5);
        demoSetBal(addr, demoBal(addr) + 0.5);
        c.audit_pass = (c.audit_pass || 0) + 1;
        evt(tidAu, '随机抽查通过，无惩罚（审计节点 +0.5 NOVA）');
      } else {
        c.audit_fail = (c.audit_fail || 0) + 1;
        (ta2.paid_workers || []).forEach(function (w) {
          var st = (c.nodes[w] || {}).stake || 0;
          var penalty = round4(st * 2);
          if (c.nodes[w]) {
            c.nodes[w].stake = round4(Math.max(0, st - penalty));
            c.nodes[w].cheated = (c.nodes[w].cheated || 0) + 1;
            c.nodes[w].reputation = 0; c.nodes[w].tier = '轻量节点'; c.nodes[w].bonus = 0;
          }
          c.slashed = round4((c.slashed || 0) + penalty);
        });
        ta2.audit_failed = true;
        evt(tidAu, '抽查发现错误，原节点罚没双倍质押');
      }
      saveDemoCompute(c);
      return { ok: true, id: tidAu, demo: true };
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
  async function computeNodes() {
    if (state.mode === 'node') {
      var d = await api('/api/compute/nodes');
      return (d && d.nodes) || {};
    }
    return demoCompute().nodes || {};
  }
  async function computeOverview() {
    if (state.mode === 'node') {
      var d = await api('/api/compute/overview');
      return d || {};
    }
    return demoComputeOverview();
  }
  async function computeEvents() {
    if (state.mode === 'node') {
      var d = await api('/api/compute/events');
      return (d && d.events) || [];
    }
    return (demoCompute().events || []).slice(0, 100);
  }
  async function aiSnapshot() {
    if (state.mode === 'node') {
      var ds = await Promise.all([api('/api/ai/status'), api('/api/ai/works'), api('/api/ai/services'), api('/api/ai/fund')]);
      return { status: ds[0] || {}, works: ((ds[1] && ds[1].works) || []), services: ((ds[2] && ds[2].services) || {}), fund: ds[3] || {} };
    }
    return { status: aiStatusSnapshot(), works: Object.keys(aiStore().works || {}).map(function (k) { return aiStore().works[k]; }),
      services: aiStore().services || {}, fund: aiFundSnapshot() };
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
    // 存储激励演示数据：节点 / 文件健康度 / 事件
    s.inc_nodes = s.inc_nodes || {};
    s.inc_files = s.inc_files || {};
    s.inc_events = s.inc_events || {};
    var demoNode1 = DEMO_CREATORS[2].addr;
    var demoNode2 = DEMO_CREATORS[5].addr;
    if (!Object.keys(s.inc_nodes).length) {
      s.inc_nodes[demoNode1] = { registered_at: Date.now() - 20 * 86400000, quota_gb: 4096,
        assigned_gb: 5.3, online: true, last_heartbeat: Date.now(), fail_count: 0,
        success_count: 30, revenue: 250, month_revenue: 250, assigned: [], revenue_month: '本月' };
      s.inc_nodes[demoNode2] = { registered_at: Date.now() - 12 * 86400000, quota_gb: 2048,
        assigned_gb: 2.1, online: true, last_heartbeat: Date.now(), fail_count: 0,
        success_count: 18, revenue: 96, month_revenue: 96, assigned: [], revenue_month: '本月' };
    }
    if (!Object.keys(s.inc_files).length) {
      var fcid1 = '0x' + 'a1b2'.repeat(16);
      var fcid2 = '0x' + 'c3d4'.repeat(16);
      var fcid3 = '0x' + 'e5f6'.repeat(16);
      s.inc_files[fcid1] = { owner: DEMO_CREATORS[0].addr, cid: fcid1, title: '星轨回声（母带）',
        content_type: 'music', size_gb: 8, fragment_commit: '11'.repeat(32), created_at: Date.now() - 3 * 86400000,
        replicas: [demoNode1, demoNode2], online: 2, health: 'yellow', hot: true, notified_red: false };
      s.inc_files[fcid2] = { owner: DEMO_CREATORS[0].addr, cid: fcid2, title: '星海来信（密文版）',
        content_type: 'ciphertext', size_gb: 32, fragment_commit: '22'.repeat(32), created_at: Date.now() - 86400000,
        replicas: [], online: 0, health: 'red', hot: false, notified_red: true };
      s.inc_files[fcid3] = { owner: DEMO_CREATORS[6].addr, cid: fcid3, title: '像素星海 #001',
        content_type: 'nft_image', size_gb: 1, fragment_commit: '33'.repeat(32), created_at: Date.now() - 86400000,
        replicas: [demoNode1, demoNode2, DEMO_CREATORS[4].addr], online: 3, health: 'green', hot: true, notified_red: false };
      s.inc_events['inc_1'] = { id: 'inc_1', type: 'file_red', creator: DEMO_CREATORS[0].addr,
        cid: fcid2, title: '星海来信（密文版）', message: '您的文件《星海来信（密文版）》存储状态异常（0 个在线节点），请重新上传',
        at: Date.now() / 1000 - 3600, read: false };
      s.inc_events['inc_2'] = { id: 'inc_2', type: 'node_reward', creator: demoNode1,
        cid: '', title: '', message: '当日存储奖励 +8.33 NOVA', at: Date.now() / 1000 - 7200, read: false };
      s.inc_events['inc_3'] = { id: 'inc_3', type: 'file_register', creator: DEMO_CREATORS[0].addr,
        cid: fcid1, title: '星轨回声（母带）', message: '文件已登记，等待存储节点认领',
        at: Date.now() / 1000 - 86400, read: true };
    }
    if (Object.keys(s.providers).length || Object.keys(s.claims).length || Object.keys(s.orders).length
        || Object.keys(s.inc_nodes).length || Object.keys(s.inc_files).length) saveDemoStorage(s);
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
  function aiSuggestPrice(taskType, sales) {
    var ref = { ai_music: { min: 0.5, max: 2 }, ai_image: { min: 0.1, max: 0.5 } }[taskType]
      || { min: 0.1, max: 1 };
    var base = (ref.min + ref.max) / 2;
    if (sales >= 10) base *= 1.5;
    else if (sales >= 5) base *= 1.3;
    else if (sales >= 1) base *= 1.15;
    return Math.round(Math.max(0.1, Math.min(base, 50)) * 10000) / 10000;
  }
  function aiFundLedger(s, kind, event, ref, addr, amount, memo) {
    s.fund_ledger = s.fund_ledger || [];
    s.fund_seq = (s.fund_seq || 0) + 1;
    s.fund_ledger.unshift({ id: 'fund_' + s.fund_seq, kind: kind,
      event: event, ref: ref, addr: addr, amount: round4(Number(amount || 0)), memo: memo, at: Date.now() });
    if (s.fund_ledger.length > 100) s.fund_ledger.length = 100;
  }
  function demoReputation(nd) {
    nd = nd || {};
    var score = Math.max(0, Math.min(100, Number(nd.reputation == null ? 50 : nd.reputation)));
    var tier = nd.tier || (score >= 80 ? '恒星节点' : score >= 60 ? '星核节点' : score >= 40 ? '星云节点' : '轻量节点');
    var bonus = score >= 80 ? 0.15 : score >= 60 ? 0.10 : score >= 40 ? 0.05 : 0;
    return { addr: nd.addr, score: score, tier: tier, bonus: bonus,
      completion_rate: nd.completed ? round4((nd.correct || 0) / nd.completed) : 1,
      stats: { completed: nd.completed || 0, correct: nd.correct || 0, wrong: nd.wrong || 0,
               complaints: nd.complaints || 0, cheated: nd.cheated || 0 } };
  }
  function demoNodeIncome(nd) {
    nd = nd || {};
    var tr = Number(nd.task_reward || 0), br = Number(nd.bonus_reward || 0),
        bl = Number(nd.block_reward || 0), ar = Number(nd.audit_reward || 0);
    return { task_reward: tr, rep_bonus: br, block_reward: bl, audit_reward: ar,
             total: round4(tr + br + bl + ar), stake: nd.stake || 0,
             unbonding: nd.unbonding || [0, 0] };
  }
  function demoComputeOverview() {
    var c = demoCompute();
    var tasks = c.tasks || {};
    var ids = Object.keys(tasks);
    var nodes = c.nodes || {};
    var open = 0, assigned = 0, completed = 0, disputed = 0;
    ids.forEach(function (tid) {
      var t = tasks[tid];
      if (t.status === 'open' || t.status === 'bidding') open++;
      else if (t.status === 'assigned' || t.status === 'arbitrating') assigned++;
      else if (t.status === 'completed') completed++;
      else if (t.status === 'disputed') disputed++;
    });
    var totalStaked = 0;
    Object.keys(nodes).forEach(function (a) { totalStaked += Number(nodes[a].stake || 0); });
    return { nodes: Object.keys(nodes).length, auto_qualified: 0, tasks: ids.length, open: open,
      assigned: assigned, completed: completed, disputed: disputed,
      audits_pending: Object.keys(c.audits || {}).length,
      audits_failed: c.audit_fail || 0, total_staked: round4(totalStaked), slashed: c.slashed || 0,
      fees_to_pool: c.fees_to_pool || 0, validator_pool: 0, compute_pool: 0,
      reference_prices: {
        ai_music: { name: 'AI音乐生成', min: 0.5, max: 2 },
        ai_image: { name: 'AI图像生成', min: 0.1, max: 0.5 },
        game_server: { name: '游戏服务器托管', min: 0.1, max: 1 },
        video_transcode: { name: '视频转码', min: 0.05, max: 0.5 },
        data_clean: { name: '数据清洗/标注', min: 0.01, max: 0.1 }
      }, demoMode: true };
  }
  function demoMaybeAudit(c, tid) {
    var task = c.tasks[tid];
    if (!task || !task.task_type || task.audited || task.audit_pending) return;
    var day = new Date().toISOString().slice(0, 10);
    var roll = parseInt((demoHash(tid + '|audit|' + day) || '0').replace(/^0x/, '').slice(0, 8), 16) % 100;
    if (roll >= 5) return;
    var exclude = (task.paid_workers || []).concat([task.creator]);
    var cands = Object.keys(c.nodes || {}).filter(function (a) { return exclude.indexOf(a) < 0; });
    if (!cands.length) return;
    var h = parseInt((demoHash(tid + '|auditor') || '0').replace(/^0x/, '').slice(0, 8), 16);
    var auditor = cands[h % cands.length];
    c.audits = c.audits || {};
    c.audits[tid] = { task_id: tid, status: 'pending', auditor: auditor,
      result_hash: task.results[task.paid_workers[0]] || '', passed: null, selected_at: Date.now() };
    task.audit_pending = true;
    task.audit = c.audits[tid];
    c.events = c.events || [];
    c.events.unshift({ op: 'nova:compute:audit', id: tid, addr: auditor, ts: Date.now(),
      summary: '随机抽查命中（5%），等待审计节点 ' + String(auditor).slice(0, 10) + '…' });
  }

  function aiFundSnapshot() {
    var s = aiStore();
    s.fund_ledger = s.fund_ledger || [];
    var income = 0, expense = 0;
    s.fund_ledger.forEach(function (e) { if (e.kind === 'income') income += e.amount; else expense += e.amount; });
    var pend = s.fund_pending || {};
    return { balance: s.fund_balance || 0, income_total: round4(income), expense_total: round4(expense),
      guardians: s.fund_guardians || [], single_spend_limit: 20, approvals_required: 2,
      pending: Object.keys(pend).map(function (k) { return pend[k]; })
        .sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); }).slice(0, 20),
      ledger: s.fund_ledger.slice(0, 50), demoMode: true };
  }
  function aiStatusSnapshot() {
    var s = aiStore();
    var m = s.muso || {};
    var works = Object.keys(s.works || {}).length;
    var pending = 0;
    Object.keys(s.triggers || {}).forEach(function (k) { if (s.triggers[k].status === 'pending') pending++; });
    return { services: Object.keys(s.services || {}).length, works: works, triggers_pending: pending,
      today_generated: m.today_count || 0, total_generated: m.total_generated || 0,
      total_sales: m.total_sales || 0, total_revenue: m.total_revenue || 0,
      muso: { enabled: !!m.enabled, schedule: m.schedule || 'daily', hour: m.hour || 0,
              weekday: m.weekday || 0, budget: m.budget || 0, due: !!m.due, last_run: m.last_run || 0 },
      fund: aiFundSnapshot(), split: { creator: 0.7, compute: 0.2, fund: 0.1 },
      trigger_fee: 2, demoMode: true };
  }
  function seedComputeNetworkDemo() {
    var c = demoCompute();
    if (Object.keys(c.nodes).length) return;
    var now = Date.now();
    c.nodes[DEMO_CREATORS[4].addr] = { addr: DEMO_CREATORS[4].addr, cpu_cores: 32, gpu_model: 'RTX 4090 x4',
      gpu_vram_gb: 96, ram_gb: 256, storage_gb: 4096, region: 'cn-east', latency_ms: 18,
      registered_at: now - 86400000 * 15, stake: 1200, reputation: 82, tier: '恒星节点', bonus: 0.15,
      completed: 42, correct: 40, wrong: 1, complaints: 0, cheated: 0,
      task_reward: 860, bonus_reward: 96, block_reward: 210, audit_reward: 3 };
    c.nodes[DEMO_CREATORS[7].addr] = { addr: DEMO_CREATORS[7].addr, cpu_cores: 16, gpu_model: 'A100',
      gpu_vram_gb: 80, ram_gb: 128, storage_gb: 2048, region: 'cn-south', latency_ms: 26,
      registered_at: now - 86400000 * 9, stake: 600, reputation: 68, tier: '星核节点', bonus: 0.1,
      completed: 21, correct: 19, wrong: 1, complaints: 0, cheated: 0,
      task_reward: 420, bonus_reward: 31, block_reward: 98, audit_reward: 1 };
    c.nodes[DEMO_CREATORS[5].addr] = { addr: DEMO_CREATORS[5].addr, cpu_cores: 8, gpu_model: 'T4',
      gpu_vram_gb: 16, ram_gb: 64, storage_gb: 512, region: 'cn-west', latency_ms: 41,
      registered_at: now - 86400000 * 4, stake: 100, reputation: 45, tier: '星云节点', bonus: 0.05,
      completed: 6, correct: 5, wrong: 1, complaints: 0, cheated: 0,
      task_reward: 68, bonus_reward: 2, block_reward: 12, audit_reward: 0 };
    if (!c.tasks['task_demo3']) {
      c.tasks['task_demo3'] = { id: 'task_demo3', creator: DEMO_CREATORS[0].addr,
        spec: '图片超分 4x · 城市夜景', bounty: 0.6, status: 'completed', accepted: [DEMO_CREATORS[4].addr, DEMO_CREATORS[7].addr],
        assigned: [DEMO_CREATORS[4].addr, DEMO_CREATORS[7].addr], paid_workers: [DEMO_CREATORS[4].addr, DEMO_CREATORS[7].addr],
        results: {}, results_at: {}, bids: {}, history: [{ state: 'open', at: now - 86400000, by: DEMO_CREATORS[0].addr },
          { state: 'assigned', at: now - 82800000, by: DEMO_CREATORS[4].addr },
          { state: 'completed', at: now - 7200000, by: DEMO_CREATORS[4].addr, note: '双节点结果一致' }],
        mode: 'grab', min_nodes: 2, acceptance: '4x 超分，细节清晰', task_type: 'ai_image',
        fee: 0.006, created_at: now - 86400000, expires_at: now + 86400000,
        completed_at: now - 7200000, audited: false, audit_pending: true, dispute_votes: {} };
      c.tasks['task_demo3'].results[DEMO_CREATORS[4].addr] = 'aa'.repeat(32);
      c.tasks['task_demo3'].results[DEMO_CREATORS[7].addr] = 'aa'.repeat(32);
      c.audits['task_demo3'] = { task_id: 'task_demo3', status: 'pending',
        auditor: DEMO_CREATORS[5].addr, result_hash: 'aa'.repeat(32), passed: null, selected_at: now - 3600000 };
      c.tasks['task_demo3'].audit = c.audits['task_demo3'];
    }
    saveDemoCompute(c);
  }
  function seedAiMusicDemo() {
    var s = aiStore();
    if (Object.keys(s.services || {}).length || Object.keys(s.works || {}).length) return;
    s.services = s.services || {};
    s.works = s.works || {};
    s.triggers = s.triggers || {};
    s.muso = s.muso || {};
    s.fund_guardians = s.fund_guardians || [];
    s.fund_ledger = s.fund_ledger || [];
    s.fund_balance = round4((s.fund_balance || 0) + 66.8);
    var aiAddr = Object.keys(s.creators)[0] || '0x' + '9a'.repeat(20);
    var svcDefs = [
      { st: 'suno', name: 'Suno 音乐生成', model: 'suno-v4', h: 'sha256:suno-api-v4' },
      { st: 'openai', name: 'OpenAI 图像/文本', model: 'gpt-4o / dall-e-3', h: 'sha256:openai-api' },
      { st: 'stable_diffusion', name: 'Stable Diffusion', model: 'sdxl-turbo', h: 'sha256:sd-api' }
    ];
    svcDefs.forEach(function (d, i) {
      s.services['svc_demo' + (i + 1)] = { id: 'svc_demo' + (i + 1), owner: aiAddr, service_type: d.st,
        name: d.name, model: d.model, endpoint_hash: d.h, status: 'active', created_at: Date.now() - 86400000 * 6 };
    });
    var defs = [
      { title: '星轨心跳', art: '💓', cid: 'bafy' + 'a'.repeat(11) + '1', price: 1.25, sales: 12, revenue: 15 },
      { title: '量子咖啡店', art: '☕', cid: 'bafy' + 'a'.repeat(11) + '2', price: 1.0, sales: 8, revenue: 8 },
      { title: '夜航者之歌', art: '🚀', cid: 'bafy' + 'a'.repeat(11) + '3', price: 0.8, sales: 3, revenue: 2.4 },
      { title: '月球背面慢摇', art: '🌕', cid: 'bafy' + 'a'.repeat(11) + '4', price: 0.65, sales: 1, revenue: 0.65 }
    ];
    var now = Date.now();
    defs.forEach(function (d, i) {
      var wid = 'work_demo' + (i + 1);
      s.works[wid] = { id: wid, title: d.title, artist: aiAddr, cid: d.cid, price: d.price,
        task_id: '', task_type: 'ai_music', trigger_id: '', sales: d.sales, revenue: d.revenue,
        compute_paid: round4(d.revenue * 0.2), meta: 'Suno v4 · ' + d.art,
        created_at: now - 86400000 * (5 - i) };
    });
    s.muso = { enabled: true, schedule: 'daily', hour: 10, weekday: 0, budget: 5,
      last_run: now - 3600000, last_run_day: '', due: false, today_count: 3,
      total_generated: 24, total_sales: 24, total_revenue: 26.05, created_at: now - 86400000 * 20 };
    s.fund_guardians.push(aiAddr);
    aiFundLedger(s, 'income', 'trigger', 'tr_demo1', DEMO_CREATORS[6].addr, 2, '社区付费触发 AI 创作（suno）');
    aiFundLedger(s, 'income', 'work_sale', 'work_demo1', DEMO_CREATORS[0].addr, 1.25, '购买「星轨心跳」：70/20/10 分账');
    saveAiStore(s);
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
/* ================= 社区仲裁（演示模式实现；节点模式走 /api/arb/* RPC） ================= */
  var ARB_DAY = 86400000;
  function arbEmpty() {
    return { seeded: 0, arbitrators: {}, candidates: {}, cases: {}, case_seq: 0,
             notifications: {}, notif_seq: 0, malicious: {}, suspicious: {},
             pools: { eco: 1000000 }, banned: {}, stake_pending: {}, events: [] };
  }
  function arbStore() { return lsGet(LS.arb, arbEmpty()); }
  function saveArbStore(a) { lsSet(LS.arb, a); }
  function arbNotify(a, addr, kind, title, body, cid) {
    a.notif_seq += 1;
    var box = a.notifications[addr] || (a.notifications[addr] = []);
    box.unshift({ id: 'n' + a.notif_seq, kind: kind, title: title, body: body,
                  case_id: cid || '', at: Date.now(), read: false });
    if (box.length > 60) box.length = 60;
  }
  function arbEco(a) { return a.pools.eco != null ? a.pools.eco : 1000000; }
  function arbSetEco(a, v) { a.pools.eco = Math.max(0, round4(v)); }
  function arbPickPool(a, caseObj) {
    var taken = {};
    Object.keys(caseObj.panel || {}).forEach(function (k) { taken[caseObj.panel[k]] = 1; });
    if (caseObj.second && caseObj.second.panel) {
      Object.keys(caseObj.second.panel).forEach(function (k) { taken[caseObj.second.panel[k]] = 1; });
    }
    var buyer = caseObj.buyer, seller = caseObj.seller, now = Date.now();
    var excluded = caseObj.excluded || [];
    var pool = [];
    Object.keys(a.arbitrators).forEach(function (addr) {
      var ar = a.arbitrators[addr];
      if (ar.status !== 'active') return;
      if (a.banned[addr]) return;
      if (ar.observe_until && ar.observe_until > now) return;
      if (ar.rep < 30) return;
      if (taken[addr] || addr === buyer || addr === seller) return;
      if (excluded.indexOf(addr) >= 0) return;
      pool.push(addr);
    });
    return pool;
  }
  function arbDrawFrom(a, pool, n, seedStr) {
    var sorted = pool.slice().sort(function (x, y) {
      var hx = demoHash(seedStr + x), hy = demoHash(seedStr + y);
      return hx < hy ? -1 : (hx > hy ? 1 : 0);
    });
    return sorted.slice(0, n);
  }
  function arbAssignPanel(a, caseObj, addrs, second) {
    var sec = second ? (caseObj.second || (caseObj.second = { panel: {}, panel_meta: {}, votes: {}, result: '', decided_at: 0 })) : null;
    var panel = second ? sec.panel : (caseObj.panel || (caseObj.panel = {}));
    var meta = second ? sec.panel_meta : (caseObj.panel_meta || (caseObj.panel_meta = {}));
    var num = 1, now = Date.now();
    addrs.forEach(function (addr) {
      while (panel[String(num)]) num += 1;
      panel[String(num)] = addr;
      meta[addr] = { number: String(num), assigned_at: now, deadline: now + 72 * 3600000,
                     voted: false, side: '', replaced: false, conflict: false };
      arbNotify(a, addr, 'arb_drawn', '您被抽中担任仲裁员',
                '案件 ' + caseObj.id + ' 需要在 72 小时内投票（匿名编号 #' + num + '）。', caseObj.id);
      num += 1;
    });
    if (!second) caseObj.drawn_at = now;
  }
  function arbTally(votes) {
    var b = 0, s = 0;
    Object.keys(votes).forEach(function (k) { if (votes[k] === 'buyer') b += 1; else if (votes[k] === 'seller') s += 1; });
    return b === s ? 'seller' : (b > s ? 'buyer' : 'seller');
  }
  function arbPayout(a, caseObj, winner) {
    var pool = Number(a.pools['case_' + caseObj.id] || 0);
    var frozen = Number(caseObj.seller_frozen || 0);
    if (winner === 'buyer') {
      demoSetBal(caseObj.buyer, demoBal(caseObj.buyer) + frozen + pool);
      delete a.pools['case_' + caseObj.id];
    } else {
      demoSetBal(caseObj.seller, demoBal(caseObj.seller) + frozen);
      var sellerShare = round4(pool * 0.4), eco = round4(pool - sellerShare);
      demoSetBal(caseObj.seller, demoBal(caseObj.seller) + sellerShare);
      arbSetEco(a, arbEco(a) + eco);
      delete a.pools['case_' + caseObj.id];
    }
    caseObj.payouts = caseObj.payouts || {};
    caseObj.payouts['first_' + winner] = {};
  }
  function arbIncentives(a, caseObj, panel, meta, votes, winner) {
    Object.keys(panel).forEach(function (num) {
      var addr = panel[num], m = meta[addr];
      var ar = a.arbitrators[addr];
      if (!ar || !m || m.replaced || !m.voted) return;
      ar.cases = (ar.cases || 0) + 1;
      if (m.side === winner) {
        ar.correct = (ar.correct || 0) + 1;
        ar.rep = Math.min(100, round4(ar.rep + 1));
        ar.streak = (ar.streak || 0) + 1;
        if (ar.streak >= 10) { ar.streak = 0; arbSetEco(a, arbEco(a) - 10); ar.revenue = round4(ar.revenue + 10); }
      } else { ar.streak = 0; }
    });
  }
  function arbPayVoteReward(a, addr) {
    var ar = a.arbitrators[addr];
    if (!ar) return;
    var eco = arbEco(a), paid = Math.min(2, eco);
    arbSetEco(a, eco - paid);
    ar.revenue = round4(ar.revenue + paid);
  }
  function arbExecute(a, caseObj, second) {
    var winner, overturn = false;
    if (second) {
      var sec = caseObj.second;
      winner = arbTally(sec.votes);
      sec.result = winner; sec.decided_at = Date.now();
      overturn = winner !== caseObj.result;
      caseObj.status = 'settled'; caseObj.revealed = true;
      arbIncentives(a, caseObj, sec.panel, sec.panel_meta, sec.votes, winner);
      if (overturn) {
        Object.keys(caseObj.panel || {}).forEach(function (num) {
          var addr = caseObj.panel[num];
          var ar = a.arbitrators[addr];
          if (!ar) return;
          ar.stake = Math.max(0, round4(ar.stake - 10));
          ar.rep = Math.max(0, round4(ar.rep - 5));
          arbNotify(a, addr, 'arb_overturned', '裁决被二次仲裁推翻',
                    '案件 ' + caseObj.id + ' 被推翻：质押 -10 NOVA，信誉分 -5。', caseObj.id);
        });
      }
      arbNotify(a, caseObj.buyer, 'arb_result', '二次仲裁已有结果',
                '案件 ' + caseObj.id + ' 最终支持' + (winner === 'buyer' ? '买家' : '卖家') + '（二次仲裁为最终结果）。', caseObj.id);
      arbNotify(a, caseObj.seller, 'arb_result', '二次仲裁已有结果',
                '案件 ' + caseObj.id + ' 最终支持' + (winner === 'buyer' ? '买家' : '卖家') + '。', caseObj.id);
    } else {
      winner = arbTally(caseObj.votes);
      caseObj.result = winner; caseObj.decided_at = Date.now();
      caseObj.status = 'decided'; caseObj.revealed = true;
      caseObj.appeal_deadline = Date.now() + 7 * ARB_DAY;
      arbIncentives(a, caseObj, caseObj.panel, caseObj.panel_meta, caseObj.votes, winner);
      arbPayout(a, caseObj, winner);
      arbNotify(a, caseObj.buyer, 'arb_result', '您的投诉已有裁决结果',
                '案件 ' + caseObj.id + ' 最终支持' + (winner === 'buyer' ? '买家' : '卖家') + '。7 天内可发起二次仲裁。', caseObj.id);
      arbNotify(a, caseObj.seller, 'arb_result', '您的案件已有裁决结果',
                '案件 ' + caseObj.id + ' 最终支持' + (winner === 'buyer' ? '买家' : '卖家') + '。', caseObj.id);
    }
    caseObj.events = caseObj.events || [];
    caseObj.events.push({ kind: second ? 'second_decided' : 'decided', at: Date.now(),
                          msg: '裁决完成：支持' + (winner === 'buyer' ? '买家' : '卖家') + (second && overturn ? '（推翻一次裁决）' : '') });
  }
  function arbDepositFor(a, addr) {
    var m = a.malicious[addr];
    return m && m.loss_count >= 3 ? 50 : 10;
  }
  function arbDemoSummary() {
    var a = arbStore();
    var open = 0;
    Object.keys(a.cases).forEach(function (cid) {
      if (['pending_draw', 'voting', 'second_pending', 'second_voting'].indexOf(a.cases[cid].status) >= 0) open += 1;
    });
    return { arbitrators: Object.keys(a.arbitrators).length, candidates: Object.keys(a.candidates).length,
             cases: Object.keys(a.cases).length, open_cases: open,
             settled_cases: Object.keys(a.cases).filter(function (cid) { return a.cases[cid].status === 'settled'; }).length,
             banned: Object.keys(a.banned).length, suspicious: Object.keys(a.suspicious).length,
             malicious: Object.keys(a.malicious).length, slashed: 0,
             eco_fund: arbEco(a), vrf_seed: demoHash('arb-vrf-' + (a.seed || 1)), demoMode: true };
  }
  function arbDemoArbitrators() {
    var a = arbStore();
    var list = Object.keys(a.arbitrators).map(function (addr) {
      var ar = a.arbitrators[addr];
      return { addr: addr, rep: ar.rep, stake: ar.stake, cases: ar.cases, correct: ar.correct,
               revenue: ar.revenue, status: ar.status, term_start: ar.term_start,
               term_end: ar.term_end, streak: ar.streak, ban_reason: '' };
    });
    list.sort(function (x, y) { return y.rep - x.rep; });
    return { arbitrators: list, total: list.length, demoMode: true };
  }
  function arbDemoCandidates() {
    var a = arbStore();
    var list = Object.keys(a.candidates).map(function (addr) {
      var c = a.candidates[addr];
      return { addr: addr, applied_at: c.applied_at, kind: c.kind, votes: c.votes,
               status: c.status, settled_at: c.settled_at };
    });
    list.sort(function (x, y) { return y.applied_at - x.applied_at; });
    return { candidates: list, total: list.length, demoMode: true };
  }
  function arbDemoCaseView(a, caseObj, viewer) {
    var revealed = !!caseObj.revealed || caseObj.status === 'settled';
    var isParty = viewer && (viewer === caseObj.buyer || viewer === caseObj.seller);
    var meta = caseObj.panel_meta || {};
    var out = {
      id: caseObj.id, stage: caseObj.stage, status: caseObj.status,
      trade_id: caseObj.trade_id, reason: caseObj.reason, evidence: caseObj.evidence,
      deposit: caseObj.deposit, seller_frozen: caseObj.seller_frozen,
      filed_at: caseObj.filed_at, decided_at: caseObj.decided_at,
      result: caseObj.result, appeal_deadline: caseObj.appeal_deadline,
      payouts: caseObj.payouts || {}, my_number: '', events: (caseObj.events || []).slice(-20)
    };
    out.buyer = isParty ? caseObj.buyer : (caseObj.buyer || '').slice(0, 12) + '...';
    out.seller = isParty ? caseObj.seller : (caseObj.seller || '').slice(0, 12) + '...';
    var m0 = meta[viewer];
    if (m0) out.my_number = m0.number || '';
    var panelList = [];
    Object.keys(caseObj.panel || {}).sort().forEach(function (num) {
      var addr = caseObj.panel[num];
      var mm = meta[addr] || {};
      panelList.push({ number: num, addr: revealed ? addr : '', side: (caseObj.votes || {})[num] || '',
                       deadline: mm.deadline || 0 });
    });
    out.panel = panelList;
    if (caseObj.second) {
      var sec = caseObj.second;
      out.second_panel = Object.keys(sec.panel || {}).sort().map(function (num) {
        var addr = sec.panel[num];
        var sm = (sec.panel_meta || {})[addr] || {};
        return { number: num, addr: revealed ? addr : '', side: (sec.votes || {})[num] || '', deadline: sm.deadline || 0 };
      });
      out.second_result = sec.result || '';
      out.second_decided_at = sec.decided_at || 0;
      out.second_appellant = sec.appellant || '';
    }
    return out;
  }
  function arbDemoCase(cid, viewer) {
    var a = arbStore();
    var c = a.cases[cid];
    if (!c) return { error: '案件不存在', case_id: cid, demoMode: true };
    return arbDemoCaseView(a, c, viewer);
  }
  function arbDemoCases(viewer) {
    var a = arbStore();
    var list = Object.keys(a.cases).map(function (cid) {
      var v = arbDemoCaseView(a, a.cases[cid], viewer);
      return { id: v.id, status: v.status, stage: v.stage, trade_id: v.trade_id, result: v.result,
               filed_at: v.filed_at, decided_at: v.decided_at, deposit: v.deposit,
               buyer: v.buyer, seller: v.seller };
    });
    list.sort(function (x, y) { return y.filed_at - x.filed_at; });
    return { cases: list, total: list.length, demoMode: true };
  }
  function arbDemoUser(addr) {
    var a = arbStore();
    var my = Object.keys(a.cases).map(function (cid) {
      return arbDemoCaseView(a, a.cases[cid], addr);
    }).filter(function (v) { return v.buyer === addr || v.seller === addr; });
    my.sort(function (x, y) { return y.filed_at - x.filed_at; });
    return { addr: addr, deposit: arbDepositFor(a, addr), malicious: a.malicious[addr] || {},
             complaints: my, is_arbitrator: !!a.arbitrators[addr],
             is_candidate: !!a.candidates[addr] && a.candidates[addr].status === 'voting',
             banned: !!a.banned[addr], demoMode: true };
  }
  function arbDemoPanel(addr) {
    var a = arbStore();
    var ar = a.arbitrators[addr];
    if (!ar) return { found: false, addr: addr, demoMode: true };
    var pending = [];
    Object.keys(a.cases).forEach(function (cid) {
      var c = a.cases[cid];
      if (c.status !== 'voting' && c.status !== 'second_voting') return;
      var meta = c.panel_meta || {};
      var secMeta = (c.second && c.second.panel_meta) || {};
      var m = meta[addr] || secMeta[addr];
      if (m && !m.replaced) {
        pending.push({ case_id: cid, number: m.number || '', stage: secMeta[addr] ? 2 : 1,
                       trade_id: c.trade_id, reason: c.reason, evidence: c.evidence,
                       deadline: m.deadline || 0, side: m.side || '', voted: !!m.voted,
                       filed_at: c.filed_at });
      }
    });
    pending.sort(function (x, y) { return y.filed_at - x.filed_at; });
    var termEnd = Number(ar.term_end || 0);
    return { found: true, addr: addr, status: ar.status, rep: ar.rep, stake: ar.stake,
             cases: ar.cases || 0, correct: ar.correct || 0, revenue: ar.revenue || 0,
             streak: ar.streak || 0, term_start: ar.term_start, term_end: termEnd,
             term_remaining_days: Math.max(0, (termEnd - Date.now()) / ARB_DAY),
             accuracy: ar.cases ? round4((ar.correct || 0) / ar.cases * 100) : 0,
             observe_until: ar.observe_until || 0, declared_conflicts: ar.declared_conflicts || 0,
             history: (ar.history || []).slice(-20), pending: pending,
             banned: !!a.banned[addr], demoMode: true };
  }
  function arbDemoNotifications(addr) {
    var a = arbStore();
    var box = (a.notifications[addr] || []).slice();
    box.sort(function (x, y) { return y.at - x.at; });
    return { notifications: box, unread: box.filter(function (n) { return !n.read; }).length, demoMode: true };
  }
  function arbDemoMarkRead(body) {
    var a = arbStore();
    var box = a.notifications[body.addr] || [];
    var idset = (body.ids || []).reduce(function (o, id) { o[id] = 1; return o; }, {});
    var n = 0;
    box.forEach(function (item) {
      if ((Object.keys(idset).length === 0 && !item.read) || idset[item.id]) { item.read = true; n += 1; }
    });
    saveArbStore(a);
    return { status: 'ok', marked: n, demoMode: true };
  }
  function arbDemoAction(op, fields, amount) {
    var a = arbStore();
    var addr = state.asAddr || state.addr;
    var now = Date.now();
    function err(msg) { saveArbStore(a); return { ok: false, error: msg, demo: true }; }
    function ok(extra) { saveArbStore(a); return Object.assign({ ok: true, demo: true }, extra || {}); }
    if (op === 'nova:arb:apply') {
      if (amount !== 500) return err('质押需 500 NOVA');
      if (a.arbitrators[addr] || (a.candidates[addr] && a.candidates[addr].status === 'voting')) return err('已有申请/资格');
      if (a.banned[addr]) return err('已被永久取消资格');
      if (demoBal(addr) < 500) return err('余额不足');
      demoSetBal(addr, demoBal(addr) - 500);
      a.pools['cand_' + addr] = 500;
      a.candidates[addr] = { addr: addr, applied_at: now - 8 * ARB_DAY, kind: 'first',
        votes: { yes: 0, no: 0 }, voted: {}, status: 'voting', settled_at: 0 };
      arbNotify(a, addr, 'arb_applied', '仲裁员申请已提交', '已质押 500 NOVA，等待社区投票（7 天）。', '');
      return ok({ id: addr });
    }
    if (op === 'nova:arb:renew') {
      var ar0 = a.arbitrators[addr];
      if (!ar0 || ar0.status !== 'active') return err('仅在职仲裁员可连任');
      if (a.candidates[addr] && a.candidates[addr].status === 'voting') return err('已有进行中的连任投票');
      if (!(ar0.term_end - now > 0 && ar0.term_end - now <= 7 * ARB_DAY)) return err('仅在任期结束前 7 天内可申请连任');
      ar0.status = 'renewing';
      a.candidates[addr] = { addr: addr, applied_at: now - 8 * ARB_DAY, kind: 'renew',
        votes: { yes: 0, no: 0 }, voted: {}, status: 'voting', settled_at: 0 };
      arbNotify(a, addr, 'arb_renew_vote', '连任申请已提交', '需重新社区投票，未通过将自动退休。', '');
      return ok();
    }
    if (op === 'nova:arb:candidate_vote') {
      var cand = a.candidates[fields.candidate];
      if (!cand || cand.status !== 'voting') return err('候选不存在或投票已结束');
      if (cand.voted[addr]) return err('已投过票');
      var power = Math.max(1, Math.floor(demoBal(addr)));
      if (power <= 0) return err('需要持有 NOVA 才能投票');
      var sideKey = fields.side === 'no' ? 'no' : 'yes';
      cand.voted[addr] = sideKey;
      cand.votes[sideKey] = round4(Number(cand.votes[sideKey] || 0) + power);
      cand.votes.total = round4(Number(cand.votes.yes || 0) + Number(cand.votes.no || 0));
      return ok({ power: power });
    }
    if (op === 'nova:arb:candidate_settle') {
      var cand2 = a.candidates[fields.candidate];
      if (!cand2 || cand2.status !== 'voting') return err('候选不存在或已结算');
      var yes = Number(cand2.votes.yes || 0), no = Number(cand2.votes.no || 0);
      var passed = yes > no * 1.5 && (yes + no) > 100;
      cand2.status = passed ? 'passed' : 'failed';
      cand2.settled_at = now;
      var stake = Number(a.pools['cand_' + fields.candidate] || 0);
      delete a.pools['cand_' + fields.candidate];
      if (passed) {
        if (cand2.kind === 'renew') {
          var arR = a.arbitrators[fields.candidate];
          if (arR) { arR.term_end = now + 90 * ARB_DAY; arR.status = 'active'; arR.renewed_at = now; }
          arbNotify(a, fields.candidate, 'arb_renew', '连任投票通过', '任期延长 90 天。', '');
        } else {
          a.arbitrators[fields.candidate] = { addr: fields.candidate, stake: stake, rep: 80,
            term_start: now, term_end: now + 90 * ARB_DAY, cases: 0, correct: 0, streak: 0,
            revenue: 0, status: 'active', exit_notice_at: 0, exit_ready_at: 0, observe_until: 0,
            declared_conflicts: 0, recent_votes: [], panel_history: [], history: [] };
          arbNotify(a, fields.candidate, 'arb_passed', '社区投票通过', '您已正式成为仲裁员，任期 90 天。', '');
        }
      } else {
        a.stake_pending[fields.candidate] = [stake, now + 7 * ARB_DAY];
        if (cand2.kind === 'renew' && a.arbitrators[fields.candidate]) {
          a.arbitrators[fields.candidate].status = 'retired';
          a.arbitrators[fields.candidate].stake = 0;
          arbNotify(a, fields.candidate, 'arb_renew_fail', '连任投票未通过', '仲裁资格已结束，质押进入 7 天冷静期后返还。', '');
        } else {
          arbNotify(a, fields.candidate, 'arb_failed', '社区投票未通过', '未达通过条件。质押进入 7 天冷静期返还。', '');
        }
      }
      return ok({ passed: passed });
    }
    if (op === 'nova:arb:reactivate') {
      if (amount !== 500) return err('重新质押需 500 NOVA');
      var arR2 = a.arbitrators[addr];
      if (!arR2 || arR2.status !== 'suspended' || a.banned[addr]) return err('仅暂停中的仲裁员可重新激活');
      if (demoBal(addr) < 500) return err('余额不足');
      demoSetBal(addr, demoBal(addr) - 500);
      arR2.stake = round4(arR2.stake + 500); arR2.rep = 50; arR2.status = 'active';
      arR2.observe_until = 0; arR2.term_end = now + 90 * ARB_DAY;
      arbNotify(a, addr, 'arb_reactivate', '重新质押激活成功', '仲裁资格恢复，任期 90 天。', '');
      return ok();
    }
    if (op === 'nova:arb:exit') {
      var arX = a.arbitrators[addr];
      if (!arX || (arX.status !== 'active' && arX.status !== 'renewing')) return err('仅在职仲裁员可退出');
      if (arX.exit_notice_at) return err('已声明退出');
      var open = Object.keys(a.cases).some(function (cid) {
        var c = a.cases[cid];
        if (['pending_draw', 'voting', 'second_pending', 'second_voting'].indexOf(c.status) < 0) return false;
        var members = Object.keys(c.panel || {}).map(function (k) { return c.panel[k]; });
        if (c.second && c.second.panel) members = members.concat(Object.keys(c.second.panel).map(function (k) { return c.second.panel[k]; }));
        return members.indexOf(addr) >= 0;
      });
      if (open) return err('有未完成案件时不可退出');
      arX.status = 'leaving'; arX.exit_notice_at = now; arX.exit_ready_at = now + 7 * ARB_DAY;
      arbNotify(a, addr, 'arb_exit', '退出申请已登记', '7 天声明期后质押进入 7 天冷静期，合计 14 天后可领取。', '');
      return ok();
    }
    if (op === 'nova:arb:claim_stake') {
      var p = a.stake_pending[addr];
      if (!p || now < p[1]) return err('冷静期未到期');
      demoSetBal(addr, demoBal(addr) + Number(p[0]));
      delete a.stake_pending[addr];
      arbNotify(a, addr, 'arb_claim', '质押已返还', Number(p[0]) + ' NOVA 已退回账户。', '');
      return ok();
    }
    if (op === 'nova:arb:complain') {
      var seller = String(fields.seller || '');
      var deposit = arbDepositFor(a, addr);
      if (amount !== deposit) return err('投诉保证金需 ' + deposit + ' NOVA');
      if (!seller || seller === addr) return err('卖家地址无效');
      var m = a.malicious[addr];
      if (m && m.lock_until && m.lock_until > now) return err('恶意投诉锁定期间不可发起投诉');
      var freeze = deposit * 2;
      if (demoBal(seller) < freeze) return err('卖家保证金不足以冻结');
      if (demoBal(addr) < deposit) return err('余额不足');
      demoSetBal(addr, demoBal(addr) - deposit);
      demoSetBal(seller, demoBal(seller) - freeze);
      a.case_seq += 1;
      var cid = 'arb_' + a.case_seq;
      a.pools['case_' + cid] = deposit;
      a.cases[cid] = { id: cid, stage: 1, buyer: addr, seller: seller,
        trade_id: String(fields.trade_id || ''), reason: String(fields.reason || ''),
        evidence: String(fields.evidence || ''), deposit: deposit, seller_frozen: freeze,
        filed_at: now, status: 'pending_draw', drawn_at: 0, panel: {}, panel_meta: {},
        votes: {}, revealed: false, result: '', decided_at: 0, appeal_deadline: 0,
        second: null, payouts: {}, excluded: [], events: [{ kind: 'filed', at: now, msg: '投诉已发起' }] };
      arbNotify(a, seller, 'arb_complaint', '您收到一笔投诉',
                '买家对交易 ' + String(fields.trade_id || '') + ' 发起投诉，' + freeze + ' NOVA 保证金已冻结。', cid);
      arbNotify(a, addr, 'arb_filed', '投诉已发起', '案件 ' + cid + ' 等待抽取仲裁员。', cid);
      return ok({ id: cid, deposit: deposit });
    }
    if (op === 'nova:arb:draw') {
      var cD = a.cases[fields.case_id];
      if (!cD || cD.status !== 'pending_draw') return err('案件不存在或不在待抽取状态');
      var poolD = arbPickPool(a, cD);
      if (poolD.length < 3) return err('仲裁员候选不足（需至少 3 名在职仲裁员）');
      var picked = arbDrawFrom(a, poolD, 3, 'draw-' + cD.id + '-' + (a.seed = (a.seed || 1) + 1));
      arbAssignPanel(a, cD, picked);
      cD.status = 'voting';
      cD.events.push({ kind: 'draw', at: now, msg: '已抽取 3 名仲裁员（当事人匿名）' });
      return ok({ panel: picked.length });
    }
    if (op === 'nova:arb:vote') {
      var cV = a.cases[fields.case_id];
      if (!cV) return err('案件不存在');
      var stage = Number(fields.stage || 1);
      var panel, meta, votes;
      if (stage === 2) {
        if (cV.status !== 'second_voting' || !cV.second) return err('案件不在二次投票阶段');
        panel = cV.second.panel; meta = cV.second.panel_meta; votes = cV.second.votes;
      } else {
        if (cV.status !== 'voting') return err('案件不在投票阶段');
        panel = cV.panel; meta = cV.panel_meta; votes = cV.votes;
      }
      var num = String(fields.number);
      if (panel[num] !== addr) return err('编号与身份不匹配');
      var m2 = meta[addr];
      if (!m2 || m2.replaced || votes[num]) return err('已投票或已被替换');
      votes[num] = fields.side === 'seller' ? 'seller' : 'buyer';
      m2.voted = true; m2.side = votes[num];
      arbPayVoteReward(a, addr);
      var nums = Object.keys(panel);
      var allVoted = nums.length > 0 && nums.every(function (k) { return votes[k] === 'buyer' || votes[k] === 'seller'; });
      if (allVoted) arbExecute(a, cV, stage === 2);
      return ok();
    }
    if (op === 'nova:arb:decline') {
      var cD2 = a.cases[fields.case_id];
      if (!cD2) return err('案件不存在');
      var stage2 = cD2.status === 'second_voting' ? 2 : 1;
      var panel2, meta2;
      if (stage2 === 2) { panel2 = cD2.second.panel; meta2 = cD2.second.panel_meta; }
      else { panel2 = cD2.panel; meta2 = cD2.panel_meta; }
      var m3 = meta2[addr];
      if (!m3 || m3.replaced) return err('您不在此案仲裁面板');
      m3.replaced = true; m3.conflict = true;
      var num2 = m3.number;
      delete panel2[num2];
      var arD = a.arbitrators[addr];
      if (arD) { arD.rep = Math.min(100, round4(arD.rep + 1)); arD.declared_conflicts = (arD.declared_conflicts || 0) + 1; }
      cD2.excluded = cD2.excluded || [];
      cD2.excluded.push(addr);
      var poolR = arbPickPool(a, cD2).filter(function (x) { return x !== addr; });
      if (poolR.length) {
        var repl = arbDrawFrom(a, poolR, 1, 'repl-' + cD2.id + '-' + addr)[0];
        panel2[num2] = repl;
        meta2[repl] = { number: num2, assigned_at: now, deadline: now + 72 * 3600000,
                        voted: false, side: '', replaced: false, conflict: false };
        arbNotify(a, repl, 'arb_drawn', '您被抽中担任替代仲裁员',
                  '案件 ' + cD2.id + ' 需要您在 72 小时内投票（匿名编号 #' + num2 + '）。', cD2.id);
      }
      arbNotify(a, addr, 'arb_declined', '利益冲突已声明',
                '您已退出案件 ' + cD2.id + '，信誉分 +1，系统已重新抽取。', cD2.id);
      return ok();
    }
    if (op === 'nova:arb:second') {
      if (amount !== 50) return err('二次仲裁保证金需 50 NOVA');
      var cS = a.cases[fields.case_id];
      if (!cS || cS.stage !== 1 || cS.second) return err('案件不支持二次仲裁');
      if (cS.status !== 'decided' || (addr !== cS.buyer && addr !== cS.seller)) return err('仅当事人在裁决后 7 天内可发起');
      if (now - cS.decided_at > 7 * ARB_DAY) return err('超过 7 天上诉窗口');
      if (demoBal(addr) < 50) return err('余额不足');
      demoSetBal(addr, demoBal(addr) - 50);
      a.pools['case_' + cS.id] = round4(Number(a.pools['case_' + cS.id] || 0) + 50);
      cS.second = { appellant: addr, deposit: 50, filed_at: now, panel: {}, panel_meta: {}, votes: {}, result: '', decided_at: 0 };
      cS.status = 'second_pending';
      var poolS = arbPickPool(a, cS);
      if (poolS.length >= 7) {
        var pickedS = arbDrawFrom(a, poolS, 7, 'second-' + cS.id + '-' + (a.seed = (a.seed || 1) + 1));
        arbAssignPanel(a, cS, pickedS, true);
        cS.status = 'second_voting';
        cS.events.push({ kind: 'draw2', at: now, msg: '二次仲裁已抽取 7 名仲裁员' });
      }
      arbNotify(a, cS.buyer === addr ? cS.seller : cS.buyer, 'arb_second', '对方发起二次仲裁',
                '案件 ' + cS.id + ' 进入二次仲裁，将抽取 7 名仲裁员。', cS.id);
      return ok({ id: cS.id });
    }
    if (op === 'nova:arb:charge') {
      var target = String(fields.target || '');
      var arC = a.arbitrators[target];
      if (!arC) return err('目标不是仲裁员');
      if (amount < 2) return err('举证保证金至少 2 NOVA');
      if (demoBal(addr) < amount) return err('余额不足');
      demoSetBal(addr, demoBal(addr) - amount);
      var slashed = Number(arC.stake || 0);
      arbSetEco(a, arbEco(a) + slashed);
      arC.stake = 0; arC.status = 'banned'; arC.rep = 0;
      a.banned[target] = fields.kind || 'bribe';
      a.suspicious[target] = { reason: fields.kind || 'bribe', marked_at: now };
      demoSetBal(addr, demoBal(addr) + amount);
      arbNotify(a, target, 'arb_ban', '仲裁资格被永久取消',
                '因' + (fields.kind === 'collude' ? '与当事人串通' : '收受贿赂/明显偏袒') + '，质押全部罚没。', '');
      arbNotify(a, addr, 'arb_charge_ok', '举报成立', '目标仲裁员已被罚没质押并永久取消资格。', '');
      return ok();
    }
    return err('未支持的仲裁操作: ' + op);
  }
  function seedArbDemo() {
    var a = arbStore();
    if (a.seeded === 1) return;
    a.seeded = 1;
    a.pools.eco = a.pools.eco != null ? a.pools.eco : 1000000;
    var now = Date.now();
    // 3 名在职仲裁员
    [DEMO_CREATORS[0], DEMO_CREATORS[6], DEMO_CREATORS[7]].forEach(function (c, i) {
      a.arbitrators[c.addr] = { addr: c.addr, stake: 500, rep: 82 + i * 5,
        term_start: now - 40 * ARB_DAY, term_end: now + 50 * ARB_DAY,
        cases: 6 + i * 3, correct: 5 + i * 3, streak: 2, revenue: 40 + i * 15,
        status: 'active', exit_notice_at: 0, exit_ready_at: 0, observe_until: 0,
        declared_conflicts: 0, recent_votes: [], panel_history: [], history: [] };
    });
    // 1 名候选（投票中）
    var cand = DEMO_CREATORS[2].addr;
    a.candidates[cand] = { addr: cand, applied_at: now - 6 * ARB_DAY, kind: 'first',
      votes: { yes: 132, no: 40, total: 172 }, voted: { '0xdemo_seed': 'yes' },
      status: 'voting', settled_at: 0 };
    // 1 个在途案件（投票中，匿名编号）
    a.case_seq = 1;
    var cid = 'arb_1';
    var buyer = DEMO_CREATORS[3].addr, seller = DEMO_CREATORS[5].addr;
    var p3 = [DEMO_CREATORS[0], DEMO_CREATORS[6], DEMO_CREATORS[7]];
    var panel = {};
    var meta = {};
    p3.forEach(function (c2, i) {
      var num = String(i + 1);
      panel[num] = c2.addr;
      meta[c2.addr] = { number: num, assigned_at: now - 20 * 3600000, deadline: now + 2 * ARB_DAY,
                        voted: false, side: '', replaced: false, conflict: false };
    });
    a.cases[cid] = { id: cid, stage: 1, buyer: buyer, seller: seller,
      trade_id: 'T-2026-0815', reason: '商品与描述不符：收到内容与下单版本不一致',
      evidence: 'ipfs://QmDemoEvidence', deposit: 10, seller_frozen: 20,
      filed_at: now - 1 * ARB_DAY, status: 'voting', drawn_at: now - 20 * 3600000,
      panel: panel, panel_meta: meta, votes: {}, revealed: false, result: '',
      decided_at: 0, appeal_deadline: 0, second: null, payouts: {}, excluded: [],
      events: [{ kind: 'filed', at: now - 1 * ARB_DAY, msg: '投诉已发起' }] };
    a.pools['case_' + cid] = 10;
    p3.forEach(function (c2, i) {
      arbNotify(a, c2.addr, 'arb_drawn', '您被抽中担任仲裁员',
                '案件 ' + cid + ' 需要在 72 小时内投票（匿名编号 #' + (i + 1) + '）。', cid);
    });
    arbNotify(a, buyer, 'arb_complaint', '您的投诉已受理', '案件 ' + cid + ' 已进入仲裁流程。', cid);
    arbNotify(a, DEMO_CREATORS[6].addr, 'arb_term', '任期即将到期',
              '任期将于 50 天后结束，请在 7 天窗口内申请连任。', '');
    saveArbStore(a);
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
    state.active = MODULE_OF[opts.active] || opts.active || null;
    initLang();
    await detectMode();
    renderTopbar();
    window.addEventListener('nova-wallet', updateWalletUI);
    seedDemoData();
    seedSocialfiDemo();
    seedArbDemo();
    seedAiDemo();
    seedStorageComputeDemo();
    seedComputeNetworkDemo();
    seedAiMusicDemo();
    await seedTextDemo();
    await connectFromStorage();
    updateWalletUI();
    if (typeof opts.onReady === 'function') opts.onReady({ mode: state.mode, connected: state.connected });
  }

  window.NovaApps = {
    init: init,
    t: t, setLang: setLang, getLang: function () { return lang; },
    getState: function () { return state; },
    api: api, demoHash: demoHash,
    redetect: detectMode, scheduleNodeRecheck: scheduleNodeRecheck,
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
    arbStore: arbStore, saveArbStore: saveArbStore, arbDemoAction: arbDemoAction, seedArbDemo: seedArbDemo,
    aiStore: aiStore, saveAiStore: saveAiStore, aiBudgetState: aiBudgetState,
    sfReputation: sfReputation, sfRecommend: sfRecommend, sfFanPriceAt: sfFanPriceAt,
    textCryptoOk: textCryptoOk, textEncryptBody: textEncryptBody, textDecryptBody: textDecryptBody,
    textEciesEncrypt: textEciesEncrypt, textEciesDecrypt: textEciesDecrypt,
    ensureTextReader: ensureTextReader, textContractPub: textContractPub,
    sfTextRep: sfTextRep, sfTextDepositFor: sfTextDepositFor,
    sfTextIsValidatorDemo: sfTextIsValidatorDemo,
    storageSnapshot: storageSnapshot, computeSnapshot: computeSnapshot, computeNodes: computeNodes,
    computeOverview: computeOverview, computeEvents: computeEvents, aiSnapshot: aiSnapshot,
    seedStorageComputeDemo: seedStorageComputeDemo, seedComputeNetworkDemo: seedComputeNetworkDemo,
    seedAiMusicDemo: seedAiMusicDemo,
    demoStorage: demoStorage, demoCompute: demoCompute, demoBal: demoBal, demoSetBal: demoSetBal,
    loadingHtml: loadingHtml, errHtml: errHtml,
    openModal: openModal, closeModal: closeModal, confirmDlg: confirmDlg, toast: toast,
    fmt: fmt, shortAddr: shortAddr, timeAgo: timeAgo, esc: esc,
    TREASURY: TREASURY
  };
})();
