/* Nova 钱包 JS SDK（44 · 开发者生态）
 * 统一接入层：浏览器扩展注入（window.novaWallet）或 postMessage 桥协议。
 * UMD 风格：浏览器 <script> 与 Node/打包器均可使用。
 * 协议（页面 <-> 扩展 content script）：
 *   页面 -> 扩展: { source: 'nova-wallet-dapp', id, method, params }
 *   页面 -> 扩展: { source: 'nova-wallet-dapp', event: 'hello' }（握手，扩展回 ready）
 *   扩展 -> 页面: { source: 'nova-wallet-ext', id, ok, result, error }
 *   扩展 -> 页面: { source: 'nova-wallet-ext', event: 'ready', version }
 *   扩展 -> 页面: { source: 'nova-wallet-ext', event: 'accountsChanged', accounts: [] }
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(global);
  else global.NovaWalletSDK = factory(global);
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  var MSG_DAPP = 'nova-wallet-dapp';
  var MSG_EXT = 'nova-wallet-ext';
  var PROTOCOL_VERSION = 1;

  // 错误码（与 EIP-1193 风格对齐）
  var ERR = {
    NO_PROVIDER: 4001,     // 未检测到钱包扩展
    USER_REJECTED: 4001,   // 用户拒绝
    NOT_CONNECTED: 4100,   // 未连接
    UNKNOWN: -1
  };

  function makeError(code, message) {
    var e = new Error(message || 'Nova wallet error');
    e.code = code;
    return e;
  }

  function isExtMessage(ev) {
    if (!ev || !ev.data || typeof ev.data !== 'object' || ev.data.source !== MSG_EXT) return false;
    // 安全（M-09）：仅信任同窗口、同源发来的扩展应答/事件（content script 与页面共享 window），
    // 阻止跨域 iframe 伪造 nova-wallet-ext 消息（ready / accountsChanged / 请求应答）。
    if (typeof global !== 'undefined' && global.location && global.location.origin) {
      if (ev.source !== global) return false;
      if (ev.origin && ev.origin !== global.location.origin) return false;
    }
    return true;
  }

  /* ---------- postMessage 桥 Provider（页面 main world 使用） ---------- */
  function PostMessageProvider() {
    this._pending = new Map();
    this._seq = 0;
    this._handlers = {};
    this._listeners = [];
    this._ready = false;
    this._readyWaiters = [];
    this._bound = this._onMessage.bind(this);
    global.addEventListener('message', this._bound);
  }
  PostMessageProvider.prototype._onMessage = function (ev) {
    if (!isExtMessage(ev)) return;
    var msg = ev.data;
    if (msg.id != null && this._pending.has(msg.id)) {
      var p = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(makeError(msg.error && msg.error.code || ERR.UNKNOWN, msg.error && msg.error.message || 'request failed'));
      return;
    }
    if (msg.event === 'ready') {
      this._ready = true;
      var ws = this._readyWaiters.splice(0);
      ws.forEach(function (f) { try { f(); } catch (e) {} });
      return;
    }
    if (msg.event === 'accountsChanged') {
      this._listeners.slice().forEach(function (fn) { try { fn(msg.accounts || []); } catch (e) {} });
    }
  };

  /* 主世界无 chrome.runtime 时，等待扩展 ready 握手（最长 800ms） */
  PostMessageProvider.prototype._handshake = function () {
    var self = this;
    if (this._ready) return Promise.resolve();
    return new Promise(function (resolve) {
      self._readyWaiters.push(resolve);
      setTimeout(function () { resolve(); }, 800);
    });
  };
  PostMessageProvider.prototype.request = function (method, params) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var proceed = function () {
        var id = 'sdk' + (++self._seq) + '_' + Date.now().toString(36);
        self._pending.set(id, { resolve: resolve, reject: reject });
        global.postMessage({ source: MSG_DAPP, id: id, method: method, params: params || {}, version: PROTOCOL_VERSION }, '*');
        setTimeout(function () {
          if (self._pending.has(id)) {
            self._pending.delete(id);
            reject(makeError(ERR.UNKNOWN, '请求超时：请确认 Nova 钱包扩展已启用'));
          }
        }, 8000);
      };
      // 扩展上下文（popup/background）有 chrome.runtime.id，直接请求
      if (global.chrome && global.chrome.runtime && global.chrome.runtime.id) { proceed(); return; }
      // 页面主世界：已握手则直接请求，否则先发 hello 等扩展回 ready
      if (self._ready) { proceed(); return; }
      global.postMessage({ source: MSG_DAPP, event: 'hello', version: PROTOCOL_VERSION }, '*');
      self._handshake().then(function () {
        if (self._ready) proceed();
        else reject(makeError(ERR.NO_PROVIDER, '未检测到 Nova 钱包扩展，请安装并启用扩展后重试'));
      });
    });
  };
  PostMessageProvider.prototype.onAccountsChanged = function (fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
    return this;
  };
  PostMessageProvider.prototype.destroy = function () {
    global.removeEventListener('message', this._bound);
  };

  /* ---------- SDK 主对象 ---------- */
  var sdk = {
    VERSION: '1.0.0',
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    ERR: ERR,
    _provider: null,

    /** 检测并（可选）创建 provider。优先 window.novaWallet（DApp 或页面已初始化），否则 postMessage 桥。 */
    detectProvider: function () {
      if (this._provider) return this._provider;
      if (global.novaWallet && global.novaWallet.request) {
        this._provider = global.novaWallet;
        return this._provider;
      }
      var bridge = new PostMessageProvider();
      // 暴露统一接口到 window.novaWallet，便于 DApp 直接调用
      var exposed = {
        request: function (method, params) { return bridge.request(method, params); },
        onAccountsChanged: function (fn) { return bridge.onAccountsChanged(fn); },
        destroy: function () { bridge.destroy(); },
        isNovaWallet: true,
        _bridge: bridge
      };
      global.novaWallet = exposed;
      this._provider = exposed;
      return exposed;
    },

    /** 连接钱包。返回 { connected, accounts }（未装扩展时抛 ERR.NO_PROVIDER）。 */
    connect: function () {
      var provider = this.detectProvider();
      return provider.request('connect', {}).then(function (res) {
        return { connected: !!(res && res.accounts && res.accounts.length), accounts: (res && res.accounts) || [] };
      });
    },

    isConnected: function () {
      return this.detectProvider().request('isConnected', {});
    },

    getAddress: function () {
      return this.detectProvider().request('getAddress', {}).then(function (res) {
        return { address: (res && res.address) || null };
      });
    },

    getBalance: function (address) {
      return this.detectProvider().request('getBalance', { address: address || undefined }).then(function (res) {
        return { balance: (res && res.balance) != null ? res.balance : null, node: (res && res.node) || null };
      });
    },

    sendTransaction: function (params) {
      if (!params || typeof params !== 'object') return Promise.reject(makeError(ERR.UNKNOWN, 'sendTransaction 需要参数对象 { to, amount, memo }'));
      return this.detectProvider().request('send_transaction', {
        to: params.to, amount: params.amount, memo: params.memo || ''
      });
    },

    /** 签名消息（扩展版规划中；网页钱包内可使用 wallet.html 自身签名能力）。 */
    signMessage: function (message) {
      return this.detectProvider().request('sign_message', { message: String(message == null ? '' : message) });
    },

    /** 通用请求（method: connect/isConnected/getAddress/getBalance/send_transaction/sign_message）。 */
    request: function (method, params) {
      return this.detectProvider().request(method, params);
    },

    onAccountsChanged: function (fn) {
      return this.detectProvider().onAccountsChanged(fn);
    }
  };
  return sdk;
});
