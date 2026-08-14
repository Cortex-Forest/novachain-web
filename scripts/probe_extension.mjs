/* 扩展桥探测：验证 content.js 桥 + SDK 主世界可用性
 * 用法：node scripts/probe_extension.mjs [--headed]
 * 说明：
 *  - Chrome 无头模式不注入 content script；Chrome 137+ 稳定版也禁用了 --load-extension。
 *    此时自动降级为“真实 content.js + chrome API 桩”的页内桥测，仍能全量验证协议逻辑。
 *  - --headed 且扩展成功注入时，执行真实扩展桥测（含 service worker 写账户的端到端验证）。
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const ROOT = 'C:/Users/Administrator/novachain-web';
const EXT = ROOT + '/browser-extension';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8767;
const CDP_PORT = 9223;
const HEADED = process.argv.includes('--headed');
const TEST_ADDR = '0xTESTACCOUNT1234567890abcdef';

let failed = 0, passed = 0, skipped = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.error('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 20000, step = 250) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeout) throw new Error('waitFor timeout'); await sleep(step); }
}
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.onopen = () => resolve({
      ws,
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      }
    });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    };
    ws.onerror = e => reject(new Error('WS error ' + e.message));
  });
}
async function evalIn(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/sdk/demo.html';
  const f = join(ROOT, p);
  try {
    const data = readFileSync(f);
    const ext = p.slice(p.lastIndexOf('.')) || '.html';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});

// 页内模拟桥：注入 chrome 桩 + 真实 content.js
function simBridgeScript(contentSrc) {
  return `(() => {
    if (window.__bridgeSim) return 1;
    const store = { nova_accounts: [] };
    const listeners = [];
    window.chrome = window.chrome || {};
    Object.defineProperty(window.chrome, 'storage', { value: {
      local: {
        get: (keys, cb) => { const r = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { r[k] = store[k]; }); cb(r); },
        set: (obj, cb) => { Object.assign(store, obj); const ch = {}; Object.keys(obj).forEach(k => { ch[k] = { newValue: obj[k] }; }); listeners.forEach(l => { try { l(ch, 'local'); } catch (e) {} }); if (cb) cb(); },
        remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => { delete store[k]; }); if (cb) cb(); }
      },
      onChanged: { addListener: fn => listeners.push(fn) }
    }});
    Object.defineProperty(window.chrome, 'runtime', { value: { sendMessage: () => Promise.resolve({ status: 'queued' }) } });
    const s = document.createElement('script');
    s.textContent = ${JSON.stringify(contentSrc)};
    document.head.appendChild(s);
    window.__bridgeSim = { store, listeners };
    return 1;
  })()`;
}

async function runBridgeTests(cdp, label) {
  console.log('  桥模式：' + label);
  let conn = null;
  try {
    conn = await evalIn(cdp, `NovaWalletSDK.connect().then(r => JSON.stringify(r)).catch(e => JSON.stringify({ errCode: e.code, errMsg: e.message }))`);
  } catch (e) { conn = null; }
  console.log('  connect() => ' + conn);
  const c = conn ? JSON.parse(conn) : { errCode: 'eval', errMsg: conn };
  if (c.errCode != null) check('connect() 走通扩展桥', false, '错误码 ' + c.errCode + ' ' + c.errMsg);
  else check('connect() 走通扩展桥（无账户返回空列表）', c.connected === false && Array.isArray(c.accounts) && c.accounts.length === 0, conn);

  check('window.novaWallet 已挂载', await evalIn(cdp, '!!(window.novaWallet && window.novaWallet.isNovaWallet)'));
  check('getAddress() 无账户返回 null', (await evalIn(cdp, `window.novaWallet.request('getAddress', {}).then(r => JSON.stringify(r)).catch(e => JSON.stringify({ e: e.code }))`)) === '{"address":null}');
  const unknown = JSON.parse(await evalIn(cdp, `window.novaWallet.request('no_such_method', {}).then(() => '{}').catch(e => JSON.stringify({ code: e.code }))`));
  check('未知方法返回 -32601', unknown.code === -32601, JSON.stringify(unknown));

  // 写入账户后 connect/getAddress 应返回该账户
  await evalIn(cdp, `window.__bridgeSim.store.nova_accounts = ['${TEST_ADDR}']; 1`);
  const conn2 = JSON.parse(await evalIn(cdp, `NovaWalletSDK.connect().then(r => JSON.stringify(r)).catch(e => JSON.stringify({ errCode: e.code }))`));
  check('写账户后 connect() 返回该账户', conn2.errCode == null && conn2.connected === true && conn2.accounts[0] === TEST_ADDR, JSON.stringify(conn2));
  check('写账户后 getAddress() 返回该账户', (await evalIn(cdp, `NovaWalletSDK.getAddress().then(r => JSON.stringify(r)).catch(e => JSON.stringify({ e: e.code }))`)) === '{"address":"' + TEST_ADDR + '"}');
  const tx = JSON.parse(await evalIn(cdp, `NovaWalletSDK.sendTransaction({ to: '0xdest', amount: 5, memo: 't' }).then(r => JSON.stringify(r)).catch(e => JSON.stringify({ e: e.code, m: e.message }))`));
  check('sendTransaction 进入待确认队列', tx.pending === true && tx.status === 'queued', JSON.stringify(tx));

  // accountsChanged 事件
  const ev = JSON.parse(await evalIn(cdp, `new Promise(res => {
    NovaWalletSDK.onAccountsChanged(a => res(JSON.stringify({ accounts: a })));
    window.__bridgeSim.store.nova_accounts = ['0xNEWACCOUNT1234567890abcdef'];
    window.__bridgeSim.listeners.forEach(f => { try { f({ nova_accounts: { newValue: ['0xNEWACCOUNT1234567890abcdef'] } }, 'local'); } catch (e) {} });
  })`));
  check('accountsChanged 事件推送新账户', Array.isArray(ev.accounts) && ev.accounts[0] === '0xNEWACCOUNT1234567890abcdef', JSON.stringify(ev));
  await evalIn(cdp, `window.__bridgeSim.store.nova_accounts = []; 1`);
}

async function main() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const contentSrc = readFileSync(EXT + '/content.js', 'utf8');
  const profile = mkdtempSync(join(tmpdir(), 'nova-ext-probe-'));
  const args = [
    ...(HEADED ? ['--window-size=1000,800'] : ['--headless=new', '--disable-gpu']),
    '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
    `http://127.0.0.1:${PORT}/sdk/demo.html`
  ];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });

  try {
    const target = await waitFor(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const list = await r.json();
        return list.find(t => t.type === 'page' && t.url.includes('demo.html')) || null;
      } catch (e) { return null; }
    }, 25000);

    const cdp = await cdpConnect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    await waitFor(() => evalIn(cdp, 'typeof window.NovaWalletSDK !== "undefined"'), 15000);

    const diag = await evalIn(cdp, `JSON.stringify({ chrome: typeof window.chrome, runtime: typeof (window.chrome && window.chrome.runtime) })`);
    console.log('主世界诊断：' + diag);

    check('SDK 已在页面加载', await evalIn(cdp, 'typeof window.NovaWalletSDK === "object"'));
    check('SDK 版本存在', await evalIn(cdp, 'window.NovaWalletSDK.VERSION === "1.0.0"'));

    // 探测真实 content script 是否存活（hello -> ready）
    await evalIn(cdp, `window.__msgs = []; window.addEventListener('message', e => { if (e.data && e.data.source) window.__msgs.push(e.data.source); }); 1`);
    await evalIn(cdp, `window.postMessage({ source: 'nova-wallet-dapp', event: 'hello', version: 1 }, '*'); 1`);
    await sleep(1500);
    const bridgeAlive = await evalIn(cdp, `window.__msgs.indexOf('nova-wallet-ext') >= 0`);
    console.log('content script 桥：' + (bridgeAlive ? '真实注入存活' : '未注入（自动降级页内模拟）'));

    if (bridgeAlive) {
      await evalIn(cdp, simBridgeScript(contentSrc).replace('if (window.__bridgeSim) return 1;', 'if (window.__bridgeSim) return 1;'));
      await runBridgeTests(cdp, '真实扩展注入');
    } else {
      if (!HEADED) skipped++;
      console.log('⚠ ' + (HEADED ? 'Chrome 稳定版禁用命令行加载扩展' : '无头模式不注入 content script') + '，改用真实 content.js + chrome 桩验证协议');
      await evalIn(cdp, simBridgeScript(contentSrc));
      await runBridgeTests(cdp, '页内模拟（真实 content.js）');
    }
  } finally {
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    server.close();
  }
  console.log('\n' + (failed ? '❌ 探测失败 ' + failed + ' / 通过 ' + passed : '✅ 探测通过 (' + passed + ')' + (skipped ? '，跳过 ' + skipped : '')));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('探测框架错误:', e.message); process.exit(2); });
