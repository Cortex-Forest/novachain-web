/* wallet.html 端到端测试（Node 24 + 无头 Chrome + CDP） */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const ROOT = 'C:/Users/Administrator/novachain-web';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8765;
const CDP_PORT = 9222;

let failed = 0, passed = 0;
let stage = 'init';
function stageLog(s) { stage = s; console.log('· ' + s); }
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- 静态服务器 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/wallet.html';
  const f = join(ROOT, p);
  try {
    const data = readFileSync(f);
    const ext = p.slice(p.lastIndexOf('.')) || '.html';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});

// ---------- CDP 客户端 ----------
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    const events = [];
    const listeners = new Map();
    ws.onopen = () => resolve({
      ws,
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      once(method, handler) {
        if (!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(handler);
      },
      drain() { return events.splice(0, events.length); }
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        events.push(msg);
        const hs = listeners.get(msg.method);
        if (hs) hs.forEach(h => h(msg.params));
      }
    };
    ws.onerror = (e) => reject(new Error('WS error ' + e.message));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('waitFor 超时 @' + stage + ' / ' + fn.toString().slice(0, 80));
    await sleep(step);
  }
}

async function main() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const HANG_PORT = 8766;
  const hangServer = http.createServer(() => { /* 永不响应 */ });
  hangServer.on('connection', () => { /* 保持连接打开 */ });
  await new Promise(r => hangServer.listen(HANG_PORT, '127.0.0.1', r));

  const profile = mkdtempSync(join(tmpdir(), 'nova-wallet-test-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=1280,1000`,
    `http://127.0.0.1:${PORT}/wallet.html`
  ], { stdio: 'ignore' });

  try {
    // 等待 CDP 可用
    const target = await waitFor(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const list = await r.json();
        return list.find(t => t.type === 'page' && t.url.includes('wallet.html')) || null;
      } catch (e) { return null; }
    }, 20000);

    const cdp = await cdpConnect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const errors = [];
    const IGNORE = ['Failed to load resource: the server responded with a status of 404', 'ERR_CONNECTION_REFUSED', 'ERR_FAILED', 'favicon'];
    cdp.once('Runtime.exceptionThrown', p => errors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    cdp.once('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console.error: ' + p.args.map(a => a.value || a.description || '').join(' ')); });
    const isIgnored = m => IGNORE.some(i => m.includes(i));
    cdp.once('Log.entryAdded', p => { if (p.entry.level === 'error' && !isIgnored(p.entry.text)) errors.push('log: ' + p.entry.text); });

    const evalJS = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    };

    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startCreateWallet === 'function'`), 20000);
    await sleep(500);
    check('页面加载无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

    // 固定中文环境（自动检测会跟随浏览器语言，测试断言以中文为准）
    await evalJS(`localStorage.setItem('nova_lang', 'zh'); window.applyLang(); 1`);
    // 37 · 加载优化：本地 SHA3-256 替代 CDN
    check('本地 SHA3-256 就绪', await evalJS(`typeof sha3_256 === 'function'`));
    check('SHA3-256 向量正确', await evalJS(`sha3_256('abc') === '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'`));
    check('CDN 依赖已移除', await evalJS(`!document.querySelector('script[src*="jsdelivr"]')`));

    stageLog('流程23 首次使用引导');
    // ---------- 流程 23：新用户 3 步引导（32） ----------
    await waitFor(() => evalJS(`document.getElementById('onboardMask').classList.contains('show')`));
    check('新用户显示 3 步引导', await evalJS(`document.getElementById('onboardMask').classList.contains('show')`));
    check('第 1 步：欢迎', await evalJS(`document.querySelector('.onboard-step[data-step="1"]').style.display === 'block'`));
    await evalJS(`onboardNext(); 1`);
    check('第 2 步：安全须知', await evalJS(`document.querySelector('.onboard-step[data-step="2"]').style.display === 'block'`));
    await evalJS(`onboardNext(); 1`);
    check('第 3 步：完成', await evalJS(`document.querySelector('.onboard-step[data-step="3"]').style.display === 'block'`));
    await evalJS(`closeOnboarding(); 1`);
    check('引导已关闭并记忆', await evalJS(`!document.getElementById('onboardMask').classList.contains('show') && localStorage.getItem('nova_onboarded') === '1'`));

    stageLog('流程1 新建账户');
    // ---------- 流程 1：新建账户（助记词 → 验证 → 密码 → 保险库） ----------
    await evalJS(`startCreateWallet()`);
    await waitFor(() => evalJS(`document.getElementById('modal-mnemonic').style.display === 'flex'`));
    const words = await evalJS(`Array.from(document.querySelectorAll('#mnemonicGrid .mn-word')).map(e => e.textContent.replace(/^\\d+\\.\\s*/, ''))`);
    check('助记词模态框显示 12 个单词', words.length === 12, 'len=' + words.length);
    check('助记词为合法 BIP39', /^[a-z ]+$/.test(words.join(' ')));

    await evalJS(`mnemonicNext()`);
    await waitFor(() => evalJS(`document.getElementById('modal-verify').style.display === 'flex'`));
    const vIdxs = await evalJS(`Array.from(document.querySelectorAll('#verifyFields input')).map(i => parseInt(i.dataset.idx, 10))`);
    check('验证抽取 3 个随机词', vIdxs.length === 3 && new Set(vIdxs).size === 3, JSON.stringify(vIdxs));
    // 填错一个 → 应报错
    await evalJS(`(() => {
      const inp = document.querySelector('#verifyFields input');
      inp.value = 'wrongword';
      inp.dispatchEvent(new Event('input'));
    })()`);
    await evalJS(`verifySubmit()`);
    const err1 = await evalJS(`document.getElementById('verifyErr').textContent`);
    check('填错单词被拦截', err1.includes('不正确'), err1);
    // 填对
    await evalJS(`(() => {
      document.querySelectorAll('#verifyFields input').forEach(i => {
        const k = parseInt(i.dataset.idx, 10);
        i.value = ${JSON.stringify(words)}[k];
        i.dispatchEvent(new Event('input'));
      });
    })()`);
    await evalJS(`verifySubmit()`);
    await waitFor(() => evalJS(`document.getElementById('modal-password').style.display === 'flex'`));
    // 密码不一致 → 报错
    await evalJS(`(() => {
      document.getElementById('pwNew').value = 'test-pass-123';
      document.getElementById('pwNew2').value = 'different';
    })()`);
    await evalJS(`confirmSetPassword()`);
    const pwErr = await evalJS(`document.getElementById('pwErr').textContent`);
    check('密码不一致被拦截', pwErr.includes('不一致'), pwErr);
    await evalJS(`(() => {
      document.getElementById('pwNew2').value = 'test-pass-123';
    })()`);
    await evalJS(`confirmSetPassword()`);
    await waitFor(() => evalJS(`!!localStorage.getItem('nova_vault_v2')`));
    const vault1 = JSON.parse(await evalJS(`localStorage.getItem('nova_vault_v2')`));
    check('保险库已创建 (v2)', vault1.v === 2 && vault1.accounts.length === 1);
    check('保险库中无私钥/助记词明文', !JSON.stringify(vault1).includes(words[0]) && !JSON.stringify(vault1).includes('a'.repeat(64)), '助记词不应明文出现在 vault');
    const addr1 = await evalJS(`document.getElementById('myAddress').textContent`);
    check('地址已显示', /^0x[0-9a-f]{40}$/.test(addr1), addr1);
    const lockTxt = await evalJS(`document.getElementById('lockStatus').textContent`);
    check('创建后处于解锁状态', lockTxt.includes('已解锁'), lockTxt);
    check('旧明文已清除', await evalJS(`localStorage.getItem('nova_priv') === null && localStorage.getItem('nova_keys') === null`));

    stageLog('流程2 刷新后锁定');
    // ---------- 流程 2：刷新后锁定 ----------
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startCreateWallet === 'function'`), 30000);
    await waitFor(() => evalJS(`document.getElementById('lockStatus').textContent.includes('签名需密码')`), 15000);
    await sleep(200);
    const lockTxt2 = await evalJS(`document.getElementById('lockStatus').textContent`);
    check('刷新后自动锁定', lockTxt2.includes('已锁定'), lockTxt2);
    const addrAfter = await evalJS(`document.getElementById('myAddress').textContent`);
    check('锁定状态地址仍可见（元数据）', addrAfter === addr1, addrAfter);
    check('刷新后无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

    stageLog('流程3 错误密码');
    await evalJS(`setTimeout(() => { requestUnlock('测试', 'hint'); }, 0); 1`);
    await sleep(300);
    await evalJS(`(() => { document.getElementById('authPw').value = 'wrong-password'; authSubmit(); })()`);
    await sleep(300);
    const authErr = await evalJS(`document.getElementById('authErr').textContent`);
    check('错误密码提示', authErr.includes('密码错误'), authErr);
    // 关闭模态框
    await evalJS(`closeModal('modal-auth')`);

    stageLog('流程4 交易预览与签名密码门槛');
    // ---------- 流程 4：签名前预览 + 密码确认 + 演示广播 ----------
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x' + '11'.repeat(20);
      document.getElementById('amount').value = '1.5';
      document.getElementById('memo').value = 'e2e-transfer';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    const pvSender = await evalJS(`document.getElementById('txpSender').textContent`);
    const pvAmount = await evalJS(`document.getElementById('txpAmount').textContent`);
    const pvGas = await evalJS(`document.getElementById('txpGas').textContent`);
    check('签名前展示交易预览', pvSender === addr1 && pvAmount.includes('1.5'), pvSender + ' / ' + pvAmount);
    check('预览展示 Gas 估算', pvGas.includes('0.000001'), pvGas);
    await evalJS(`setTimeout(() => { txPreviewConfirm(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    const signTitle = await evalJS(`document.getElementById('authTitle').textContent`);
    check('签名前弹出密码确认', signTitle.includes('确认签名'), signTitle);
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'test-pass-123';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'none'`));
    await waitFor(() => evalJS(`document.getElementById('txResult').textContent.trim().length > 0`), 15000);
    const txRes = await evalJS(`document.getElementById('txResult').textContent`);
    check('签名后交易已构造（演示广播）', txRes.includes('demoMode') || txRes.includes('txid') || txRes.includes('error'), txRes.slice(0, 120));
    check('演示交易写入历史', await evalJS(`document.querySelectorAll('#txHistoryList .tx-item').length >= 1`));
    check('签名流程无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

    stageLog('流程5 导出助记词');
    // ---------- 流程 5：导出助记词 ----------
    await evalJS(`setTimeout(() => { exportSecret(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'test-pass-123';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.getElementById('modal-export').style.display === 'flex'`));
    const expWords = await evalJS(`Array.from(document.querySelectorAll('#exportGrid .mn-word')).map(e => e.textContent.replace(/^\\d+\\.\\s*/, ''))`);
    check('导出助记词与创建时一致', JSON.stringify(expWords) === JSON.stringify(words), expWords.join(' '));
    await evalJS(`closeModal('modal-export')`);

    stageLog('流程6 多账户');
    // ---------- 流程 6：多账户（再建一个） ----------
    await evalJS(`lockWallet()`);
    await evalJS(`setTimeout(() => { startCreateWallet(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'test-pass-123';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.getElementById('modal-mnemonic').style.display === 'flex'`));
    const words2 = await evalJS(`Array.from(document.querySelectorAll('#mnemonicGrid .mn-word')).map(e => e.textContent.replace(/^\\d+\\.\\s*/, ''))`);
    check('第二个账户助记词不同', JSON.stringify(words2) !== JSON.stringify(words));
    await evalJS(`mnemonicNext()`);
    await waitFor(() => evalJS(`document.getElementById('modal-verify').style.display === 'flex'`));
    await evalJS(`(() => {
      document.querySelectorAll('#verifyFields input').forEach(i => {
        const k = parseInt(i.dataset.idx, 10);
        i.value = ${JSON.stringify(words2)}[k];
        i.dispatchEvent(new Event('input'));
      });
    })()`);
    await evalJS(`verifySubmit()`);
    await waitFor(() => evalJS(`document.getElementById('accountSelect').options.length === 2`));
    const optCount = await evalJS(`document.getElementById('accountSelect').options.length`);
    check('多账户：下拉框有 2 个账户', optCount === 2, 'options=' + optCount);

    stageLog('流程7 导入');
    // ---------- 流程 7：导入（助记词重复 → 切换；hex → 新增旧版账户） ----------
    await evalJS(`(() => {
      const el = document.getElementById('importKey');
      el.value = ${JSON.stringify(words.join(' '))};
    })()`);
    await evalJS(`importWallet()`);
    await sleep(500);
    const selIdx = await evalJS(`document.getElementById('accountSelect').selectedIndex`);
    check('导入重复助记词 → 自动切换', selIdx === 0, 'sel=' + selIdx);

    await evalJS(`(() => {
      const el = document.getElementById('importKey');
      el.value = 'a'.repeat(64);
    })()`);
    await evalJS(`importWallet()`);
    await waitFor(() => evalJS(`document.getElementById('accountSelect').options.length === 3`));
    check('导入 hex 私钥 → 新增旧版账户', await evalJS(`document.getElementById('accountSelect').options.length === 3`));

    stageLog('流程8 锁定导出');
    // ---------- 流程 8：锁定后导出需密码 ----------
    await evalJS(`lockWallet()`);
    await evalJS(`setTimeout(() => { exportSecret(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'test-pass-123';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.getElementById('modal-export').style.display === 'flex'`));
    const exportTitle = await evalJS(`document.getElementById('exportTitle').textContent`);
    // 当前账户是 hex 导入的旧版账户 → 应显示私钥
    check('旧版账户导出显示私钥', exportTitle.includes('私钥'), exportTitle);
    await evalJS(`closeModal('modal-export')`);

    stageLog('流程9 迁移');
    // ---------- 流程 9：迁移（旧明文） ----------
    await evalJS(`localStorage.removeItem('nova_vault_v2'); localStorage.setItem('nova_priv', 'b'.repeat(64)); localStorage.removeItem('nova_keys')`);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startMigrate === 'function'`), 30000);
    await waitFor(() => evalJS(`document.getElementById('modal-migrate').style.display === 'flex'`), 10000);
    check('检测到旧明文弹出迁移提示', true);
    await evalJS(`startMigrate()`);
    await waitFor(() => evalJS(`document.getElementById('modal-password').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('pwNew').value = 'migrate-pass-456';
      document.getElementById('pwNew2').value = 'migrate-pass-456';
    })()`);
    await evalJS(`confirmSetPassword()`);
    await waitFor(() => evalJS(`!!localStorage.getItem('nova_vault_v2')`));
    const vault2 = JSON.parse(await evalJS(`localStorage.getItem('nova_vault_v2')`));
    check('迁移后保险库包含旧账户', vault2.accounts.length === 1 && vault2.accounts[0].legacy === true);
    check('迁移后旧明文已清除', await evalJS(`localStorage.getItem('nova_priv') === null`));
    const migratedAddr = await evalJS(`document.getElementById('myAddress').textContent`);
    check('迁移账户地址正确', migratedAddr.startsWith('0x') && migratedAddr.length === 42, migratedAddr);

    stageLog('流程10 兼容其他页面存储');
    // apps-common.js 其他页面把数组存进 nova_priv，钱包不得误删
    await evalJS(`localStorage.removeItem('nova_vault_v2'); localStorage.setItem('nova_priv', JSON.stringify(['c'.repeat(64)]))`);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startMigrate === 'function'`), 30000);
    await sleep(400);
    const preserved = await evalJS(`localStorage.getItem('nova_priv')`);
    check('其他页面数组格式 nova_priv 被保留', preserved === JSON.stringify(['c'.repeat(64)]), String(preserved).slice(0, 60));
    check('且未误建保险库', await evalJS(`localStorage.getItem('nova_vault_v2') === null`));

    stageLog('流程11 交易预览与取消');
    // ---------- 流程 11：新建加密钱包 → 交易预览 → 取消不落库 ----------
    await evalJS(`localStorage.removeItem('nova_vault_v2'); localStorage.setItem('nova_priv', 'd'.repeat(64)); localStorage.removeItem('nova_keys'); localStorage.removeItem('nova_tx_history_v1')`);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startMigrate === 'function'`), 30000);
    await waitFor(() => evalJS(`document.getElementById('modal-migrate').style.display === 'flex'`), 10000);
    await evalJS(`startMigrate()`);
    await waitFor(() => evalJS(`document.getElementById('modal-password').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('pwNew').value = 'tx-pass-789';
      document.getElementById('pwNew2').value = 'tx-pass-789';
    })()`);
    await evalJS(`confirmSetPassword()`);
    await waitFor(() => evalJS(`!!localStorage.getItem('nova_vault_v2')`));
    const txAddr = await evalJS(`document.getElementById('myAddress').textContent`);
    check('流程11 准备：迁移账户就绪', /^0x[0-9a-f]{40}$/.test(txAddr), txAddr);

    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x' + '12'.repeat(20);
      document.getElementById('amount').value = '50';
      document.getElementById('memo').value = '测试转账';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    const pv2 = await evalJS(`({
      sender: document.getElementById('txpSender').textContent,
      recv: document.getElementById('txpReceiver').textContent,
      amt: document.getElementById('txpAmount').textContent,
      memo: document.getElementById('txpMemo').textContent
    })`);
    check('预览完整交易详情', pv2.sender === txAddr && pv2.recv === '0x' + '12'.repeat(20) && pv2.amt.includes('50') && pv2.memo.includes('测试转账'), JSON.stringify(pv2));
    await evalJS(`closeModal('modal-txpreview')`);
    await sleep(400);
    const emptyHist = await evalJS(`document.querySelectorAll('#txHistoryList .tx-item').length`);
    check('取消预览不写入历史', emptyHist === 0, 'n=' + emptyHist);

    stageLog('流程12 可疑地址警告');
    // ---------- 流程 12：相似地址（防剪贴板劫持）+ 黑洞地址警告 ----------
    const nearAddr = await evalJS(`(() => {
      const a = document.getElementById('myAddress').textContent;
      return a.slice(0, 3) + (a[3] === '0' ? '1' : '0') + a.slice(4);
    })()`);
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '${nearAddr}';
      document.getElementById('amount').value = '10';
      document.getElementById('memo').value = '';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    const warn1 = await evalJS(`document.getElementById('txpWarn').textContent`);
    check('相似地址警告（剪贴板劫持防护）', warn1.includes('相似') && warn1.includes('字符'), warn1);
    await evalJS(`closeModal('modal-txpreview')`);
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x0000000000000000000000000000000000000000';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    const warn2 = await evalJS(`document.getElementById('txpWarn').textContent`);
    check('黑洞地址警告', warn2.includes('黑洞'), warn2);
    await evalJS(`closeModal('modal-txpreview')`);

    stageLog('流程13 大额二次确认');
    // ---------- 流程 13：>1000 NOVA 需要第二次密码确认，错误密码被拦截 ----------
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x' + '34'.repeat(20);
      document.getElementById('amount').value = '5000';
      document.getElementById('memo').value = 'large';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    await evalJS(`setTimeout(() => { txPreviewConfirm(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'tx-pass-789';
      authSubmit();
    })()`);
    // 第一次解锁完成后应立刻弹出第二次确认（大额）
    await waitFor(() => evalJS(`document.getElementById('authTitle').textContent.includes('大额')`), 15000);
    const title2 = await evalJS(`document.getElementById('authTitle').textContent`);
    check('大额转账弹出二次密码确认', title2.includes('大额'), title2);
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'wrong-pass';
      authSubmit();
    })()`);
    await sleep(400);
    const err2 = await evalJS(`document.getElementById('authErr').textContent`);
    check('二次确认错误密码被拦截', err2.includes('密码错误'), err2);
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'tx-pass-789';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.querySelectorAll('#txHistoryList .tx-status.demo').length >= 1`), 15000);
    const txRes2 = await evalJS(`document.getElementById('txResult').textContent`);
    check('大额交易演示广播完成', txRes2.includes('demoMode'), txRes2.slice(0, 120));

    stageLog('流程14 广播超时保护');
    // ---------- 流程 14：连接挂起 RPC → 广播 500ms 超时 → 标记超时 ----------
    await evalJS(`(() => {
      document.getElementById('rpcUrl').value = 'http://127.0.0.1:${HANG_PORT}';
      window.NOVA_TX_TIMEOUT_MS = 500;
      window.NOVA_GAS_TIMEOUT_MS = 200;
    })()`);
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x' + '56'.repeat(20);
      document.getElementById('amount').value = '1';
      document.getElementById('memo').value = '';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`), 10000);
    await evalJS(`setTimeout(() => { txPreviewConfirm(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`), 10000);
    await evalJS(`(() => {
      document.getElementById('authPw').value = 'tx-pass-789';
      authSubmit();
    })()`);
    await waitFor(() => evalJS(`document.querySelectorAll('#txHistoryList .tx-status.timeout').length >= 1`), 15000);
    check('广播超时保护：交易标记为超时', true);
    await evalJS(`(() => {
      document.getElementById('rpcUrl').value = 'http://127.0.0.1:8080';
      window.NOVA_TX_TIMEOUT_MS = undefined;
      window.NOVA_GAS_TIMEOUT_MS = undefined;
      checkNode();
    })()`);
    await sleep(800);

    stageLog('流程15 历史持久化');
    // ---------- 流程 15：刷新后本地交易历史仍保留 ----------
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(() => evalJS(`document.readyState === 'complete' && typeof startMigrate === 'function'`), 30000);
    await waitFor(() => evalJS(`document.getElementById('lockStatus').textContent.includes('签名需密码')`), 15000);
    await waitFor(() => evalJS(`document.querySelectorAll('#txHistoryList .tx-item').length >= 2`), 15000);
    const histN = await evalJS(`document.querySelectorAll('#txHistoryList .tx-item').length`);
    check('刷新后交易历史保留', histN >= 2, 'n=' + histN);
    const histDemo = await evalJS(`document.querySelectorAll('#txHistoryList .tx-status.demo').length`);
    check('历史包含演示记录', histDemo >= 1, 'n=' + histDemo);
    check('历史流程无 JS 错误', errors.length === 0, errors.slice(0, 5).join(' | '));

    stageLog('流程16 域名信任与设备绑定');
    // ---------- 流程 16：官方域名白名单 + 设备指纹绑定 ----------
    const domainTxt = await evalJS(`document.getElementById('domainBanner').textContent`);
    check('本地开发环境域名信任', domainTxt.includes('本地开发环境'), domainTxt);
    const devTag = await evalJS(`localStorage.getItem('nova_device_tag')`);
    check('设备指纹已绑定', !!devTag, String(devTag));
    await evalJS(`localStorage.setItem('nova_device_tag', 'deadbeef'); bindDevice();`);
    const devStatus = await evalJS(`document.getElementById('deviceBindingStatus').textContent`);
    const devBanner = await evalJS(`document.getElementById('deviceBanner').hidden`);
    check('设备指纹变化提示', devStatus.includes('指纹变化') && devBanner === false, devStatus);
    await evalJS(`localStorage.setItem('nova_device_tag', ${JSON.stringify(devTag)}); bindDevice();`);
    const devBanner2 = await evalJS(`document.getElementById('deviceBanner').hidden`);
    check('恢复指纹后提示消失', devBanner2 === true);

    stageLog('流程17 剪贴板劫持防护');
    // ---------- 流程 17：复制后回读剪贴板校验 ----------
    await evalJS(`Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => '0x' + 'ff'.repeat(20) }, configurable: true }); 1`);
    await evalJS(`setTimeout(() => { verifyClipboard('0x' + 'ab'.repeat(20)); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('toast').textContent.includes('篡改')`), 10000);
    check('剪贴板被篡改时警告', true);
    await evalJS(`Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => '0x' + 'ab'.repeat(20) }, configurable: true }); 1`);
    await evalJS(`setTimeout(() => { verifyClipboard('0x' + 'ab'.repeat(20)); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('toast').textContent.includes('校验通过')`), 10000);
    check('剪贴板一致时校验通过', true);

    stageLog('流程18 XSS 输入净化');
    // ---------- 流程 18：聊天消息中的 HTML 必须按纯文本渲染 ----------
    const xssAddr = '0x' + '11'.repeat(20);
    await evalJS(`(() => {
      const t = JSON.parse(localStorage.getItem('nova_chat_threads') || '{}');
      const k = (myAddrCache || '') + '|' + '${xssAddr}';
      t[k] = [{ id: 'x1', dir: 'in', text: '<img src=x onerror="window.__xss=1">', ts: Math.floor(Date.now() / 1000) }];
      localStorage.setItem('nova_chat_threads', JSON.stringify(t));
      selectedContact = '${xssAddr}';
      renderThread();
    })()`);
    const xssHit = await evalJS(`window.__xss`);
    const bubbleTxt = await evalJS(`document.querySelector('#threadBody .msg-bubble').textContent`);
    const imgCount = await evalJS(`document.querySelectorAll('#threadBody img').length`);
    check('恶意 HTML 不执行', xssHit === undefined && imgCount === 0, 'xss=' + xssHit + ' imgs=' + imgCount);
    check('消息按纯文本渲染', bubbleTxt.includes('<img'), bubbleTxt);

    stageLog('流程19 合约风险提示');
    // ---------- 流程 19：转账目标为合约地址时签名前风险提示 ----------
    await evalJS(`window.__origApi = api; api = async (path, method, body, signal) => {
      if (path.startsWith('/api/contract/')) return { is_contract: true, creator: '0x' + 'ff'.repeat(20), code_size: 128 };
      return window.__origApi(path, method, body, signal);
    }; 1`);
    await evalJS(`(() => {
      document.getElementById('toAddr').value = '0x' + '77'.repeat(20);
      document.getElementById('amount').value = '5';
      document.getElementById('memo').value = '';
    })()`);
    await evalJS(`setTimeout(() => { sendTx(); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-txpreview').style.display === 'flex'`));
    const warnC = await evalJS(`document.getElementById('txpWarn').textContent`);
    check('合约地址风险提示', warnC.includes('合约地址'), warnC);
    await evalJS(`api = window.__origApi; closeModal('modal-txpreview'); 1`);

    stageLog('流程20 多链网络与 EVM 账户');
    // ---------- 流程 20：多链面板 / 网络管理 / EVM 地址与余额聚合 ----------
    // 解锁以获得当前账户的助记词/密钥
    await evalJS(`setTimeout(() => { lockWallet(); requestUnlock('解锁钱包', '多链测试'); }, 0); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => { document.getElementById('authPw').value = 'tx-pass-789'; authSubmit(); })()`);
    await waitFor(() => evalJS(`document.getElementById('lockStatus').textContent.includes('已解锁') || document.getElementById('authErr').textContent.length > 0`), 15000);
    const authErr20 = await evalJS(`document.getElementById('authErr').textContent`);
    check('流程20 解锁成功', authErr20 === '', authErr20 + ' | errors=' + JSON.stringify(errors).slice(0, 300));
    // 切到多链面板
    await evalJS(`document.querySelector('.nav-tab[data-panel="multichain"]').click(); 1`);
    await waitFor(() => evalJS(`document.getElementById('panel-multichain').classList.contains('active')`));
    // EVM 地址与 BIP44 派生一致
    const mcAddr = await evalJS(`document.getElementById('mcEvmAddr').textContent`);
    const mcAddrOk = await evalJS(`(async () => {
      const a = currentAccount(); if (!a) return 'no-account';
      const id = a.id;
      const mne = session.mnemonics[id];
      const idx = vaultAccounts().findIndex(x => x.id === id);
      let key;
      if (mne) { const seed = await NovaCrypto.mnemonicToSeed(mne, ''); key = await NovaEVM.deriveEvmKey(seed, "m/44'/60'/0'/0/" + idx); }
      else { const priv = await NovaCrypto.decryptWithMaster(session.masterKey, a.key); key = await NovaEVM.deriveEvmKey(NovaEVM.hexToBytes(priv), "m/44'/60'/0'/0/0"); }
      return NovaEVM.toChecksumAddress(NovaEVM.privateKeyToAddress(key));
    })()`);
    check('EVM 地址为 BIP44 派生且格式正确', /^0x[0-9a-fA-F]{40}$/.test(mcAddr) && mcAddr === mcAddrOk, mcAddr + ' vs ' + mcAddrOk);
    // 网络预设与切换
    const chipCount = await evalJS(`document.querySelectorAll('#networkChips .btn-ghost').length`);
    check('网络预设 ≥ 4（Nova/ETH/BSC/Polygon）', chipCount >= 4, 'chips=' + chipCount);
    await evalJS(`(() => { const b = Array.from(document.querySelectorAll('#networkChips .btn-ghost')).find(x => x.textContent.includes('以太坊')); if (b) b.click(); })(); 1`);
    const netId = await evalJS(`currentNetwork().id`);
    check('点击以太坊芯片后当前网络切换', netId === 'eth', 'net=' + netId);
    await evalJS(`selectNetwork('nova'); 1`);
    // 自定义网络：添加 → 出现 → 删除
    await evalJS(`(() => {
      document.getElementById('mcNetName').value = 'Arbitrum';
      document.getElementById('mcNetChainId').value = '42161';
      document.getElementById('mcNetRpc').value = 'https://arb1.arbitrum.io/rpc';
      addCustomNetworkFromForm();
    })(); 1`);
    const customNet = await evalJS(`currentNetwork().name`);
    check('添加自定义网络并自动切换', customNet === 'Arbitrum', customNet);
    const chipCount2 = await evalJS(`document.querySelectorAll('#networkChips .btn-ghost').length`);
    check('自定义网络出现在列表', chipCount2 === chipCount + 1, 'chips=' + chipCount2);
    await evalJS(`(() => { const l = getNetworks(); const id = l.find(n => n.custom).id; removeCustomNetwork(id); })(); 1`);
    const chipCount3 = await evalJS(`document.querySelectorAll('#networkChips .btn-ghost').length`);
    check('删除自定义网络后恢复', chipCount3 === chipCount, 'chips=' + chipCount3);
    // 资产总览：每行有结果（离线显示离线字样，不抛错）
    const assetRows = await evalJS(`Array.from(document.querySelectorAll('#mcAssets > div')).length`);
    check('资产总览渲染网络行', assetRows >= 4, 'rows=' + assetRows);

    stageLog('流程21 WalletConnect v2 演示');
    // ---------- 流程 21：WC v2 演示（URI 解析 / 配对 / 模拟签名请求） ----------
    await evalJS(`(() => {
      document.getElementById('wcUri').value = 'not-a-wc-uri';
      connectWc();
    })(); 1`);
    const wcErr = await evalJS(`document.getElementById('wcErr').textContent`);
    check('无效 wc URI 被拒绝', wcErr.includes('无效'), wcErr);
    await evalJS(`(() => {
      const topic = 'a'.repeat(64), sym = 'b'.repeat(128);
      document.getElementById('wcUri').value = 'wc:' + topic + '@2?relay-protocol=irn&symKey=' + sym;
      connectWc();
    })(); 1`);
    const wcStatus = await evalJS(`document.getElementById('wcStatus').textContent`);
    check('有效 wc URI 配对成功', wcStatus.includes('已配对'), wcStatus);
    // 模拟 USDT 转账请求 → 解码 + 风险提示
    await evalJS(`wcSimulateRequest('usdt'); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-wc').style.display === 'flex'`));
    const wcDecode = await evalJS(`document.getElementById('wcDecode').textContent`);
    check('WC 请求 calldata 解析为 transfer(address,uint256)', wcDecode.includes('transfer(address,uint256)'), wcDecode);
    check('WC 请求金额解码为 100', wcDecode.includes('100'), wcDecode);
    const wcWarnShown = await evalJS(`document.getElementById('wcWarn').style.display !== 'none'`);
    check('WC 合约调用显示风险提示', wcWarnShown);
    // 拒绝
    await evalJS(`wcReject(); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-wc').style.display === 'none'`));
    // 确认 → 解锁 → 签名并广播（模拟 RPC）
    await evalJS(`window.__origEvmRpc = evmRpc; evmRpc = async (net, method, params) => {
      if (method === 'eth_getTransactionCount') return '0x1';
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      if (method === 'eth_estimateGas') return '0x5208';
      if (method === 'eth_sendRawTransaction') return '0x' + 'dead'.repeat(16);
      return '0x0';
    }; 1`);
    await evalJS(`wcSimulateRequest('native'); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-wc').style.display === 'flex'`));
    await evalJS(`wcConfirmOk(); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-auth').style.display === 'flex'`));
    await evalJS(`(() => { document.getElementById('authPw').value = 'tx-pass-789'; authSubmit(); })()`);
    await waitFor(() => evalJS(`document.getElementById('mcEvmResult').textContent.includes('已签名并广播')`));
    const wcResult = await evalJS(`document.getElementById('mcEvmResult').textContent`);
    check('WC 演示请求签名并广播成功', wcResult.includes('0xdeaddeaddeaddeaddeaddeaddeaddead'), wcResult);
    // EVM 转账预览（模拟 RPC）：先切到 EVM 网络，再填写表单 → 预览解析
    await evalJS(`selectNetwork('eth'); 1`);
    await evalJS(`(() => {
      document.getElementById('mcEvmTo').value = '0x' + 'cd'.repeat(20);
      document.getElementById('mcEvmAmount').value = '0.01';
      document.getElementById('mcEvmData').value = 'a9059cbb' + '000000000000000000000000' + '11'.repeat(20) + '00000000000000000000000000000000000000000000000000000000000001f4';
      startEvmSend();
    })(); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-evmpreview').style.display === 'flex'`));
    const evmDecode = await evalJS(`document.getElementById('evmDecode').textContent`);
    check('EVM 转账 calldata 解析', evmDecode.includes('transfer(address,uint256)'), evmDecode);
    check('EVM 转账金额显示 0.01', (await evalJS(`document.getElementById('evmAmount').textContent`)).includes('0.01'));
    await evalJS(`closeModal('modal-evmpreview'); 1`);
    await evalJS(`evmRpc = window.__origEvmRpc; 1`);

    stageLog('流程22 资产与收益');
    // ---------- 流程 22：资产分类 / NFT 可视化 / 收益统计 / 早期激励 ----------
    await evalJS(`(() => {
      const a = currentAccount(); if (!a) return;
      const addr = a.addr;
      // 种子 NFT 收藏（本地生态应用存储格式）
      localStorage.setItem('nova_nft_owned', JSON.stringify({ [addr]: ['nft-a', 'nft-b'] }));
      localStorage.setItem('nova_nft_store', JSON.stringify({
        'nft-a': { id: 'nft-a', name: '超新星原石 #001', desc: '创世收藏品', art: '💎', price: 3, creator: addr, owner: addr },
        'nft-b': { id: 'nft-b', name: '星轨冲刺冠军', desc: '游戏成就 NFT', art: '🏆', price: 1.5, creator: addr, owner: addr }
      }));
    })(); 1`);
    // 模拟节点接口：收益 / 激励 / 社交数据
    await evalJS(`(() => {
      const addr = currentAccount().addr;
      window.__origApi2 = api;
      api = async (path, method, body) => {
        if (path.startsWith('/api/early/info')) return {
          miner_registered: true, miner_uptime_days: 12.5, light_checkin_days: 12,
          locked_balance: 100, lock_start_time: Math.floor(Date.now() / 1000) - 90 * 86400,
          lock_unlocked: 0, referral_count: 3, miner_qualified: true, light_qualified: false
        };
        if (path === '/api/stakes') return { stakes: { [addr]: 500 }, total: 25000 };
        if (path === '/api/stats') return {
          block_reward: 0.5, deploy_reward: 5, referral_reward: 1,
          storage_reward_per_gb_day: 0.001, storage_proof_reward: 0.05, light_verify_reward: 0.5
        };
        if (path === '/api/socialfi/text') return { assets: {
          t1: { id: 't1', author: addr, title: '我的加密日记', visibility: 'sealed', price: 2, buyers: ['0xbuyer'] },
          t2: { id: 't2', author: '0xother', title: '付费小说', visibility: 'sealed', price: 5, buyers: [addr] }
        } };
        if (path === '/api/socialfi/fraction') return {
          f1: { id: 'f1', owner: addr, name: '超新星碎片', supply: 1000, owner_hold: 800, price_per: 0.05 }
        };
        if (path === '/api/balance/' + addr) return { balance: 123.456 };
        if (path === '/api/checkin') return { total_days: 13 };
        return window.__origApi2(path, method, body);
      };
    })(); 1`);
    await evalJS(`document.querySelector('.nav-tab[data-panel="assets"]').click(); 1`);
    await waitFor(() => evalJS(`document.getElementById('panel-assets').classList.contains('active')`));
    await evalJS(`refreshAssetPanel(); 1`);
    // 代币分类（29）
    await waitFor(() => evalJS(`document.getElementById('ast-nova').textContent.includes('123.456 NOVA')`));
    const tokText = await evalJS(`document.getElementById('assetTokens').textContent`);
    check('代币分类：NOVA + EVM 网络行', tokText.includes('NOVA（本地链）') && tokText.includes('以太坊'), tokText.slice(0, 80));
    // NFT 可视化（28）
    await waitFor(() => evalJS(`document.getElementById('assetNfts').textContent.includes('超新星原石')`));
    const nftText = await evalJS(`document.getElementById('assetNfts').textContent`);
    check('NFT 卡片：本地收藏', nftText.includes('超新星原石 #001') && nftText.includes('星轨冲刺冠军'), nftText.slice(0, 80));
    check('NFT 卡片：链上碎片 NFT', nftText.includes('超新星碎片'), nftText.slice(0, 80));
    // 密文资产（29）
    await waitFor(() => evalJS(`document.getElementById('assetTexts').textContent.includes('我发布')`));
    const textText = await evalJS(`document.getElementById('assetTexts').textContent`);
    check('密文资产：我发布 + 我购买', textText.includes('我的加密日记') && textText.includes('付费小说'), textText.slice(0, 80));
    // 收益统计（30）
    await waitFor(() => evalJS(`document.getElementById('earningsBox').textContent.includes('500 NOVA')`));
    const earnText = await evalJS(`document.getElementById('earningsBox').textContent`);
    check('收益统计：质押/推荐/创作挖矿', earnText.includes('质押中') && earnText.includes('我的邀请') && earnText.includes('创作挖矿') && earnText.includes('预计质押年化收益'), earnText.slice(0, 120));
    // 早期激励进度（31）
    await waitFor(() => evalJS(`document.getElementById('earlyBox').textContent.includes('12 / 270')`));
    const earlyText = await evalJS(`document.getElementById('earlyBox').textContent`);
    check('早期激励：签到天数与进度条', earlyText.includes('签到天数') && earlyText.includes('12 / 270'), earlyText.slice(0, 100));
    check('早期激励：锁仓剩余时间', earlyText.includes('锁仓 100 NOVA') && earlyText.includes('剩余约'), earlyText.slice(0, 100));
    // 今日签到
    await evalJS(`doCheckin(); 1`);
    await waitFor(() => evalJS(`document.getElementById('checkinRow').textContent.includes('今日已签到')`));
    const checkinState = await evalJS(`document.getElementById('checkinRow').textContent`);
    check('今日签到流程完成', checkinState.includes('今日已签到'), checkinState);
    await evalJS(`api = window.__origApi2; 1`);

    stageLog('流程24 主题切换');
    // ---------- 流程 24：暗黑/亮色主题（35） ----------
    await evalJS(`localStorage.removeItem('nova_theme'); applyTheme(); 1`);
    const thAuto = await evalJS(`document.documentElement.getAttribute('data-theme')`);
    check('自动主题跟随系统', thAuto === 'light' || thAuto === 'dark', thAuto);
    await evalJS(`cycleTheme(); 1`);
    check('切换到亮色主题', await evalJS(`document.documentElement.getAttribute('data-theme') === 'light'`));
    check('主题选择已保存', await evalJS(`localStorage.getItem('nova_theme') === 'light'`));
    await evalJS(`cycleTheme(); 1`);
    check('切换到暗色主题', await evalJS(`document.documentElement.getAttribute('data-theme') === 'dark'`));
    await evalJS(`cycleTheme(); 1`);
    check('回到自动模式', await evalJS(`localStorage.getItem('nova_theme') === 'auto'`));
    check('theme-color 已同步', await evalJS(`['#030309','#eef2fb'].includes(document.querySelector('meta[name="theme-color"]').content)`));

    stageLog('流程25 中英文切换');
    // ---------- 流程 25：国际化（36） ----------
    await evalJS(`setLang('en'); 1`);
    check('切换到英文', await evalJS(`document.documentElement.lang === 'en' && document.querySelector('.nav-tab[data-panel="wallet"]').textContent.includes('Wallet')`));
    check('语言选择已保存', await evalJS(`localStorage.getItem('nova_lang') === 'en'`));
    await evalJS(`setLang('zh'); 1`);
    check('切回中文', await evalJS(`document.documentElement.lang === 'zh' && document.querySelector('.nav-tab[data-panel="wallet"]').textContent.includes('钱包')`));

    stageLog('流程26 离线余额缓存');
    // ---------- 流程 26：离线模式（34） ----------
    await evalJS(`(() => { window.__origApiB = api; api = async (p, m, b) => { if (String(p).startsWith('/api/balance/')) return { balance: 8888.5 }; return window.__origApiB(p, m, b); }; })(); 1`);
    await evalJS(`fetchBalance(); 1`);
    await waitFor(() => evalJS(`document.getElementById('myBalance').textContent.includes('8888.5')`));
    const cacheOK = await evalJS(`(() => { const c = JSON.parse(localStorage.getItem('nova_balance_cache') || '{}'); const a = currentAccount(); return a && c[a.addr] && c[a.addr].balance === 8888.5; })()`);
    check('在线余额写入本地缓存', cacheOK);
    await evalJS(`window.__forceOffline = true; window.dispatchEvent(new Event('offline')); 1`);
    check('离线徽标显示', await evalJS(`document.getElementById('netBadge').hidden === false`));
    await evalJS(`fetchBalance(); 1`);
    await waitFor(() => evalJS(`document.getElementById('myBalance').textContent.includes('8888.5')`));
    check('离线时展示缓存余额', await evalJS(`document.getElementById('myBalance').textContent.includes('8888.5')`));
    check('缓存来源标记可见', await evalJS(`document.getElementById('balCacheTag').style.display !== 'none'`));
    await evalJS(`window.__forceOffline = false; window.dispatchEvent(new Event('online')); api = window.__origApiB; 1`);
    check('恢复在线后徽标隐藏', await evalJS(`document.getElementById('netBadge').hidden === true`));

    stageLog('流程27 隐私与合规');
    // ---------- 流程 27：隐私政策（39）/ 交易免责声明（40）/ 防截图（41）/ 不收集（42） ----------
    await evalJS(`document.getElementById('privacyBtn').click(); 1`);
    await waitFor(() => evalJS(`document.getElementById('modal-privacy').style.display === 'flex'`));
    const privText = await evalJS(`document.getElementById('modal-privacy').textContent`);
    check('隐私政策模态框内容完整', privText.includes('隐私政策') && privText.includes('不收集') && privText.includes('本地存储') && privText.includes('链上公开'), privText.slice(0, 60));
    await evalJS(`closeModal('modal-privacy'); 1`);
    check('交易预览免责声明', await evalJS(`document.getElementById('modal-txpreview').textContent.includes('不可撤销')`));
    check('EVM 预览免责声明', await evalJS(`document.getElementById('modal-evmpreview').textContent.includes('不可撤销')`));
    check('助记词防截图警示', await evalJS(`document.getElementById('modal-mnemonic').textContent.includes('防截图') && document.getElementById('mnemonicGrid').classList.contains('mn-guard')`));
    await evalJS(`setScreenshotGuard(true); 1`);
    check('防截图守卫已开启', await evalJS(`screenshotGuardOn === true`));
    await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PrintScreen' })); 1`);
    await waitFor(() => evalJS(`document.getElementById('toast').textContent.includes('截图') && document.getElementById('toast').classList.contains('show')`));
    check('截图操作被提示', await evalJS(`document.getElementById('toast').textContent.includes('截图')`));
    await evalJS(`setScreenshotGuard(false); 1`);
    check('防截图守卫已关闭', await evalJS(`screenshotGuardOn === false`));
    check('无遥测/数据上报代码', await evalJS(`!document.querySelector('script[src*="beacon"], script[src*="analytics"], script[src*="sentry"]')`));

    check('全程无未捕获 JS 错误', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    server.close();
    try { hangServer.close(); } catch (e) {}
  }

  console.log('\n' + (failed ? '❌ 失败 ' + failed + ' / 通过 ' + passed : '✅ 端到端全部通过 (' + passed + ')'));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('测试框架错误 @' + stage + ':', e.message); process.exit(2); });


