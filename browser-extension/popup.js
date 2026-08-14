/* Nova 钱包扩展 popup：内嵌完整钱包页面 + 待确认请求处理 */
'use strict';
const frame = document.getElementById('walletFrame');
const addrEl = document.getElementById('addr');
const pendingBox = document.getElementById('pendingBox');
const pendingText = document.getElementById('pendingText');

function fmt(addr) { return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : ''; }
function renderPending(q) {
  if (!q.length) { pendingBox.classList.remove('show'); return; }
  const p = q[0];
  const label = p.method === 'send_transaction' ? '待确认转账' : '待确认请求';
  let detail = '';
  try { detail = JSON.stringify(p.params || {}); } catch (e) { detail = ''; }
  pendingText.textContent = label + '：' + detail;
  pendingBox.classList.add('show');
}
function refresh() {
  chrome.storage.local.get(['nova_accounts', 'nova_pending'], (r) => {
    const accounts = Array.isArray(r.nova_accounts) ? r.nova_accounts : [];
    addrEl.textContent = accounts.length ? fmt(accounts[0]) : '未连接';
    renderPending(Array.isArray(r.nova_pending) ? r.nova_pending : []);
  });
}
// 将 iframe 内钱包的账户同步到 chrome.storage（content script 据此应答 DApp）
function syncAccountsFromFrame() {
  try {
    const doc = frame.contentDocument;
    if (!doc || !doc.defaultView) return;
    const vault = doc.defaultView.localStorage.getItem('nova_vault_v2');
    let accounts = [];
    if (vault) {
      try { accounts = (JSON.parse(vault).accounts || []).map(a => a.addr); } catch (e) {}
    }
    chrome.storage.local.set({ nova_accounts: accounts }, () => refresh());
  } catch (e) { /* 加载中 */ }
}
frame.addEventListener('load', () => { syncAccountsFromFrame(); refresh(); });
setInterval(syncAccountsFromFrame, 3000);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.nova_pending) refresh();
});
document.getElementById('pendingOk').addEventListener('click', () => {
  chrome.storage.local.get(['nova_pending'], (r) => {
    const q = Array.isArray(r.nova_pending) ? r.nova_pending : [];
    const p = q.shift();
    chrome.storage.local.set({ nova_pending: q }, () => refresh());
    if (!p) return;
    const w = frame.contentWindow;
    if (p.method === 'send_transaction' && w && w.sendTx && w.document) {
      const d = w.document;
      const to = d.getElementById('toAddr');
      const amt = d.getElementById('amount');
      const memo = d.getElementById('memo');
      if (to && amt) {
        to.value = (p.params && p.params.to) || '';
        amt.value = String((p.params && p.params.amount) || '');
        if (memo) memo.value = (p.params && p.params.memo) || '';
        w.sendTx(); // 走钱包完整预览/密码/广播流程
        return;
      }
    }
    alert('请在弹出的钱包页面内完成该请求（消息签名能力规划中）');
  });
});
document.getElementById('pendingReject').addEventListener('click', () => {
  chrome.storage.local.get(['nova_pending'], (r) => {
    const q = Array.isArray(r.nova_pending) ? r.nova_pending : [];
    q.shift();
    chrome.storage.local.set({ nova_pending: q }, () => refresh());
  });
});
refresh();
