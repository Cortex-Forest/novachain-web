/* Nova 钱包扩展 content script：页面 <-> 扩展桥（isolated world）
 * 协议见 sdk/nova-wallet-sdk.js 头注释。
 */
(function () {
  'use strict';


  var DAPP = 'nova-wallet-dapp';
  var EXT = 'nova-wallet-ext';
  var PROTOCOL_VERSION = 1;

  function readAccounts() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(['nova_accounts'], function (r) {
          resolve(Array.isArray(r.nova_accounts) ? r.nova_accounts : []);
        });
      } catch (e) { resolve([]); }
    });
  }
  function reply(msg, payload) {
    try { window.postMessage(Object.assign({ source: EXT, id: msg.id }, payload), '*'); } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    var msg = ev && ev.data;
    // 安全（M-09）：仅接受顶层页面自身（同源、同窗口）发来的 DApp 请求，
    // 阻止跨域 iframe 伪装 source 驱动钱包签名/转账请求。
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    if (!msg || typeof msg !== 'object' || msg.source !== DAPP) return;
    // 握手：SDK 在主世界无 chrome.runtime，需 ready 事件确认扩展已注入
    if (msg.event === 'hello') {
      try { window.postMessage({ source: EXT, event: 'ready', version: PROTOCOL_VERSION }, '*'); } catch (e) {}
      return;
    }
    if (msg.version != null && msg.version < 1) {
      reply(msg, { ok: false, error: { code: -32600, message: 'Unsupported protocol version' } });
      return;
    }
    Promise.resolve().then(async function () {
      if (msg.method === 'connect' || msg.method === 'getAddress' || msg.method === 'isConnected') {
        var accounts = await readAccounts();
        if (msg.method === 'connect') reply(msg, { ok: true, result: { accounts: accounts } });
        else if (msg.method === 'getAddress') reply(msg, { ok: true, result: { address: accounts[0] || null } });
        else reply(msg, { ok: true, result: { connected: accounts.length > 0, accounts: accounts } });
        return;
      }
      if (msg.method === 'getBalance') {
        var acc = await readAccounts();
        var addr = (msg.params && msg.params.address) || acc[0];
        if (!addr) { reply(msg, { ok: false, error: { code: 4100, message: 'Not connected: open the extension wallet first' } }); return; }
        try {
          var r = await chrome.runtime.sendMessage({ type: 'nova:balance', addr: addr });
          reply(msg, { ok: true, result: { balance: r && r.balance != null ? r.balance : null, node: (r && r.node) || null } });
        } catch (e) {
          reply(msg, { ok: false, error: { code: 4002, message: 'Balance lookup failed' } });
        }
        return;
      }
      if (msg.method === 'send_transaction' || msg.method === 'sign_message') {
        var acct = await readAccounts();
        if (!acct.length) {
          reply(msg, { ok: false, error: { code: 4100, message: 'Not connected: open the extension wallet first' } });
          return;
        }
        try {
          var rr = await chrome.runtime.sendMessage({
            type: 'nova:request',
            method: msg.method,
            params: Object.assign({}, msg.params || {}, { from: acct[0] })
          });
          reply(msg, { ok: true, result: { pending: true, status: (rr && rr.status) || 'queued' } });
        } catch (e) {
          reply(msg, { ok: false, error: { code: 4001, message: 'Request not confirmed' } });
        }
        return;
      }
      reply(msg, { ok: false, error: { code: -32601, message: 'Unknown method: ' + msg.method } });
    }).catch(function () {
      reply(msg, { ok: false, error: { code: -1, message: 'Internal error' } });
    });
  });

  // 页面加载早期广播一次 ready，便于 SDK 立即感知扩展（正常握手走 hello->ready）
  try { window.postMessage({ source: EXT, event: 'ready', version: PROTOCOL_VERSION }, '*'); } catch (e) {}

  // 账户变化 -> 推送给页面
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.nova_accounts) {
        window.postMessage({ source: EXT, event: 'accountsChanged', accounts: changes.nova_accounts.newValue || [] }, '*');
      }
    });
  }
})();
