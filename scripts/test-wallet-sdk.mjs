/* Nova 钱包 SDK 单元测试（Node 直跑，不依赖浏览器）
 * 用法：node scripts/test-wallet-sdk.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sdk = require('../sdk/nova-wallet-sdk.js');

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.error('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* 全局桩环境：可控的消息收发与定时器 */
function makeEnv({ chromeRuntimeId } = {}) {
  const listeners = {};
  const posted = [];
  const timers = [];
  const prev = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    postMessage: globalThis.postMessage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    chrome: globalThis.chrome,
    novaWallet: globalThis.novaWallet
  };
  globalThis.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  globalThis.removeEventListener = (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); };
  globalThis.postMessage = (msg) => { posted.push(msg); };
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  globalThis.clearTimeout = () => {};
  if (chromeRuntimeId) globalThis.chrome = { runtime: { id: chromeRuntimeId } };
  else delete globalThis.chrome;
  delete globalThis.novaWallet;
  sdk._provider = null;
  return {
    fire: (data) => { (listeners.message || []).slice().forEach(fn => fn({ data })); },
    posted,
    timers,
    fireTimer: (ms) => { const t = timers.find(x => x.ms === ms); if (t) t.fn(); return !!t; },
    restore: () => {
      globalThis.addEventListener = prev.addEventListener;
      globalThis.removeEventListener = prev.removeEventListener;
      globalThis.postMessage = prev.postMessage;
      globalThis.setTimeout = prev.setTimeout;
      globalThis.clearTimeout = prev.clearTimeout;
      if (prev.chrome === undefined) delete globalThis.chrome; else globalThis.chrome = prev.chrome;
      if (prev.novaWallet === undefined) delete globalThis.novaWallet; else globalThis.novaWallet = prev.novaWallet;
      sdk._provider = null;
    }
  };
}

/* ---------- 1. UMD 导出与常量 ---------- */
console.log('流程1 UMD 导出与常量');
check('SDK 对象导出', typeof sdk === 'object' && sdk.VERSION === '1.0.0');
check('协议版本 = 1', sdk.PROTOCOL_VERSION === 1);
check('ERR 常量（EIP-1193 风格）', sdk.ERR.NO_PROVIDER === 4001 && sdk.ERR.NOT_CONNECTED === 4100 && sdk.ERR.UNKNOWN === -1);
check('SDK 方法齐全', ['detectProvider', 'connect', 'isConnected', 'getAddress', 'getBalance', 'sendTransaction', 'signMessage', 'request', 'onAccountsChanged'].every(m => typeof sdk[m] === 'function'));

/* ---------- 2. 无扩展环境：NO_PROVIDER（hello 握手超时） ---------- */
console.log('流程2 无扩展 → NO_PROVIDER');
{
  const env = makeEnv();
  try {
    const p = sdk.detectProvider();
    const req = p.request('connect', {}).then(() => null).catch(e => e);
    check('握手先发 hello 消息', env.posted[0] && env.posted[0].source === 'nova-wallet-dapp' && env.posted[0].event === 'hello', JSON.stringify(env.posted[0]));
    check('握手 800ms 超时定时器已设置', env.timers.some(t => t.ms === 800));
    env.fireTimer(800); // 无扩展应答 -> 握手超时 -> NO_PROVIDER
    const err = await req;
    check('无扩展时 request 拒绝', !!err && err.code === 4001, JSON.stringify(err));
    check('错误信息提示安装扩展', err && err.message.includes('未检测到 Nova 钱包扩展'), err && err.message);
  } finally { env.restore(); }
}

/* ---------- 3. 扩展上下文（chrome.runtime.id）：直连 + 消息形状 + 应答 ---------- */
console.log('流程3 扩展上下文直连');
{
  const env = makeEnv({ chromeRuntimeId: 'ext-test-1' });
  try {
    const p = sdk.detectProvider();
    const req = p.request('getBalance', { address: '0xabc' });
    check('请求消息形状正确', env.posted[0] && env.posted[0].source === 'nova-wallet-dapp' && env.posted[0].method === 'getBalance' && env.posted[0].params.address === '0xabc' && env.posted[0].version === 1, JSON.stringify(env.posted[0]));
    env.fire({ source: 'nova-wallet-ext', id: env.posted[0].id, ok: true, result: { balance: 12.5, node: 'http://127.0.0.1:8080' } });
    const r = await req;
    check('应答正确解析', r && r.balance === 12.5 && r.node === 'http://127.0.0.1:8080', JSON.stringify(r));
    // 错误应答映射
    const req2 = p.request('connect', {});
    env.fire({ source: 'nova-wallet-ext', id: env.posted[1].id, ok: false, error: { code: 4001, message: '用户拒绝' } });
    const e2 = await req2.then(() => null).catch(e => e);
    check('错误码与信息透传', e2 && e2.code === 4001 && e2.message === '用户拒绝', JSON.stringify(e2));
  } finally { env.restore(); }
}

/* ---------- 4. 主世界握手：hello -> ready -> 请求 ---------- */
console.log('流程4 hello→ready 握手');
{
  const env = makeEnv();
  try {
    const p = sdk.detectProvider();
    const req = p.request('getAddress', {});
    check('先发 hello（未握手）', env.posted[0] && env.posted[0].event === 'hello');
    env.fire({ source: 'nova-wallet-ext', event: 'ready', version: 1 });
    await Promise.resolve();
    check('握手后发出业务请求', env.posted[1] && env.posted[1].method === 'getAddress', JSON.stringify(env.posted[1]));
    env.fire({ source: 'nova-wallet-ext', id: env.posted[1].id, ok: true, result: { address: '0xA' } });
    const r = await req;
    check('握手后请求成功', r && r.address === '0xA', JSON.stringify(r));
  } finally { env.restore(); }
}

/* ---------- 5. accountsChanged 事件 ---------- */
console.log('流程5 accountsChanged');
{
  const env = makeEnv({ chromeRuntimeId: 'ext-test-2' });
  try {
    const got = [];
    sdk.onAccountsChanged((a) => got.push(a));
    env.fire({ source: 'nova-wallet-ext', event: 'accountsChanged', accounts: ['0xAA', '0xBB'] });
    check('事件推送到监听器', got.length === 1 && got[0][0] === '0xAA' && got[0][1] === '0xBB', JSON.stringify(got));
  } finally { env.restore(); }
}

/* ---------- 6. 高层方法映射 ---------- */
console.log('流程6 高层方法映射');
{
  const env = makeEnv({ chromeRuntimeId: 'ext-test-3' });
  try {
    // connect 空账户
    let req = sdk.connect();
    env.fire({ source: 'nova-wallet-ext', id: env.posted[0].id, ok: true, result: { accounts: [] } });
    let r = await req;
    check('connect() 无账户 → connected=false', r.connected === false && r.accounts.length === 0, JSON.stringify(r));
    // connect 有账户
    req = sdk.connect();
    env.fire({ source: 'nova-wallet-ext', id: env.posted[1].id, ok: true, result: { accounts: ['0xAA'] } });
    r = await req;
    check('connect() 有账户 → connected=true', r.connected === true && r.accounts[0] === '0xAA', JSON.stringify(r));
    // getAddress 映射 { address }
    req = sdk.getAddress();
    env.fire({ source: 'nova-wallet-ext', id: env.posted[2].id, ok: true, result: { address: '0xAA' } });
    r = await req;
    check('getAddress() → { address }', r && r.address === '0xAA', JSON.stringify(r));
    // getBalance 缺省地址透传 undefined
    req = sdk.getBalance();
    check('getBalance 缺省地址', env.posted[3] && env.posted[3].params.address === undefined, JSON.stringify(env.posted[3]));
    env.fire({ source: 'nova-wallet-ext', id: env.posted[3].id, ok: true, result: { balance: 9 } });
    r = await req;
    check('getBalance() → { balance, node }', r && r.balance === 9 && r.node === null, JSON.stringify(r));
    // sendTransaction 参数校验
    const bad = await sdk.sendTransaction().then(() => null).catch(e => e);
    check('sendTransaction 缺参数拒绝', !!bad && bad.code === -1 && bad.message.includes('参数'), JSON.stringify(bad));
    req = sdk.sendTransaction({ to: '0xdest', amount: 3, memo: 'm' });
    check('sendTransaction → send_transaction + memo', env.posted[4] && env.posted[4].method === 'send_transaction' && env.posted[4].params.to === '0xdest' && env.posted[4].params.amount === 3 && env.posted[4].params.memo === 'm', JSON.stringify(env.posted[4]));
    env.fire({ source: 'nova-wallet-ext', id: env.posted[4].id, ok: true, result: { pending: true, status: 'queued' } });
    r = await req;
    check('sendTransaction 返回 pending', r && r.pending === true, JSON.stringify(r));
    // signMessage
    req = sdk.signMessage('hello');
    check('signMessage → sign_message + 字符串化', env.posted[5] && env.posted[5].method === 'sign_message' && env.posted[5].params.message === 'hello', JSON.stringify(env.posted[5]));
    env.fire({ source: 'nova-wallet-ext', id: env.posted[5].id, ok: true, result: { pending: true } });
    await req;
    check('signMessage 成功返回', true);
  } finally { env.restore(); }
}

/* ---------- 7. 复用 window.novaWallet（页面已注入） ---------- */
console.log('流程7 window.novaWallet 优先');
{
  const env = makeEnv();
  try {
    const calls = [];
    globalThis.novaWallet = {
      isNovaWallet: true,
      request: (m, p) => { calls.push([m, p]); return Promise.resolve({ accounts: ['0xPAGE'] }); },
      onAccountsChanged: () => {}
    };
    const r = await sdk.connect();
    check('detectProvider 复用 window.novaWallet', r.connected === true && r.accounts[0] === '0xPAGE', JSON.stringify(r));
    check('请求转发到页面注入 provider', calls.length === 1 && calls[0][0] === 'connect', JSON.stringify(calls));
  } finally { env.restore(); }
}

/* ---------- 8. 请求超时（8 秒） ---------- */
console.log('流程8 请求超时');
{
  const env = makeEnv({ chromeRuntimeId: 'ext-test-4' });
  try {
    const p = sdk.detectProvider();
    const req = p.request('isConnected', {});
    const fired = env.fireTimer(8000);
    const err = await req.then(() => null).catch(e => e);
    check('8 秒超时触发', fired, '');
    check('超时错误码 -1 且提示扩展', err && err.code === -1 && err.message.includes('超时'), JSON.stringify(err));
  } finally { env.restore(); }
}

/* ---------- 9. destroy 移除监听 ---------- */
console.log('流程9 destroy 清理');
{
  const env = makeEnv({ chromeRuntimeId: 'ext-test-5' });
  try {
    const p = sdk.detectProvider();
    let hit = false;
    p.onAccountsChanged(() => { hit = true; });
    p.destroy();
    env.fire({ source: 'nova-wallet-ext', event: 'accountsChanged', accounts: [] });
    check('destroy 后不再处理事件', hit === false);
  } finally { env.restore(); }
}

console.log('\n' + (failed ? '❌ SDK 测试失败 ' + failed + ' / 通过 ' + passed : '✅ SDK 测试全部通过 (' + passed + ')'));
process.exit(failed ? 1 : 0);
