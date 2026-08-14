/* Nova 钱包扩展 background service worker（MV3）
 * 职责：节点余额代理查询、DApp 签名/转账请求入队、状态读取。
 */
'use strict';
const DEFAULT_RPC = 'http://127.0.0.1:8080';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['nova_rpc'], (r) => {
    if (!r.nova_rpc) chrome.storage.local.set({ nova_rpc: DEFAULT_RPC });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || !msg.type) return;
  if (msg.type === 'nova:balance') {
    chrome.storage.local.get(['nova_rpc'], (r) => {
      const rpc = (r.nova_rpc || DEFAULT_RPC).replace(/\/+$/, '');
      fetch(rpc + '/api/balance/' + encodeURIComponent(msg.addr), { signal: AbortSignal.timeout(4000) })
        .then((res) => res.json())
        .then((data) => sendResponse({ balance: data && data.balance != null ? data.balance : null, node: rpc }))
        .catch((e) => sendResponse({ balance: null, node: rpc, error: String((e && e.message) || e) }));
    });
    return true; // 异步响应
  }
  if (msg.type === 'nova:request') {
    chrome.storage.local.get(['nova_pending'], (r) => {
      const q = Array.isArray(r.nova_pending) ? r.nova_pending : [];
      q.push(Object.assign({
        id: 'req' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: Date.now()
      }, msg));
      chrome.storage.local.set({ nova_pending: q });
    });
    try { chrome.action.openPopup(); } catch (e) { /* 手势受限时用户手动打开 */ }
    sendResponse({ status: 'queued' });
    return;
  }
  if (msg.type === 'nova:getState') {
    chrome.storage.local.get(['nova_accounts', 'nova_rpc', 'nova_pending'], (r) => sendResponse(r));
    return true;
  }
  if (msg.type === 'nova:confirm') {
    // popup 确认/拒绝后清理队列（由 popup 直接写 storage，此处仅回执）
    sendResponse({ ok: true });
    return;
  }
});

// 扩展图标旁的数字角标：待确认请求数
function updateBadge() {
  chrome.storage.local.get(['nova_pending'], (r) => {
    const n = Array.isArray(r.nova_pending) ? r.nova_pending.length : 0;
    chrome.action.setBadgeText({ text: n ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff2ea6' });
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.nova_pending) updateBadge();
});
updateBadge();
