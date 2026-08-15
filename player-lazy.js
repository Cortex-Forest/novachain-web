/* Nova 分层加载播放器（提示词 2）：试听片段走 CDN，付费解锁后从 IPFS 加载完整文件。
 *
 * 加载策略：
 *   1. 用户点击播放 → 先加载 30 秒试听片段（CDN，秒开）
 *   2. 播放试听期间并行探测完整文件源（IPFS 网关）
 *   3. 用户付费/解锁后 → 从 IPFS 加载完整文件，显示进度条
 *   4. 加载失败自动回退（CDN 主源 → 备用源 → IPFS 网关列表）
 *
 * 用法：
 *   var player = new NovaLazyPlayer({
 *     audio: document.getElementById('myAudio'),
 *     progress: document.getElementById('myProgress'),
 *     previewUrl: 'https://cdn.example.com/previews/xxx.mp3',   // 30 秒试听
 *     ipfsCid: 'bafy...',                                       // 完整文件 CID
 *     gateways: ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'],
 *     onState: function(state) { console.log(state); },         // preview|loading|ready|unlocked|error
 *     onProgress: function(pct) {}
 *   });
 *   player.play();     // 开始试听
 *   player.unlock();   // 付费后调用：加载完整文件
 */
(function (global) {
  'use strict';

  var PREVIEW_SECONDS = 30;

  function NovaLazyPlayer(opts) {
    opts = opts || {};
    this.audio = opts.audio || (typeof document !== 'undefined' ? document.createElement('audio') : null);
    this.progressEl = opts.progress || null;
    this.previewUrl = opts.previewUrl || '';
    this.ipfsCid = opts.ipfsCid || '';
    this.gateways = opts.gateways || ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
    this.onState = opts.onState || function () {};
    this.onProgress = opts.onProgress || function () {};
    this.unlocked = false;
    this.state = 'idle';
    if (this.audio) {
      var self = this;
      this.audio.addEventListener('timeupdate', function () {
        if (!self.audio.duration) return;
        var pct = Math.round(self.audio.currentTime * 100 / self.audio.duration);
        if (self.onProgress) self.onProgress(pct);
      });
      this.audio.addEventListener('error', function () { self._fail('音频加载失败'); });
    }
  }

  NovaLazyPlayer.prototype._set = function (state) {
    this.state = state;
    if (this.onState) this.onState(state);
  };

  NovaLazyPlayer.prototype._fail = function (msg) {
    this._set('error');
    if (this.onError) this.onError(msg);
  };

  /* 播放试听（CDN） */
  NovaLazyPlayer.prototype.play = function () {
    if (!this.audio) return;
    var self = this;
    this._set('preview');
    this.audio.src = this.previewUrl;
    this.audio.play().catch(function () {
      // 试听不可用 → 直接尝试完整文件
      self._set('loading');
      self._loadFull(0);
    });
    if (this.audio.addEventListener && !this._boundEnd) {
      this._boundEnd = true;
      // 试听 30 秒结束后自动暂停，等待解锁
      this.audio.addEventListener('timeupdate', function () {
        if (self.audio.currentTime >= PREVIEW_SECONDS && !self.unlocked) {
          self.audio.pause();
          self._set('preview_ended');
        }
      });
    }
  };

  NovaLazyPlayer.prototype.pause = function () {
    if (this.audio) this.audio.pause();
  };

  /* 付费后解锁：从 IPFS 加载完整文件 */
  NovaLazyPlayer.prototype.unlock = function () {
    this.unlocked = true;
    this._set('loading');
    this._loadFull(0);
  };

  NovaLazyPlayer.prototype._loadFull = function (gatewayIndex) {
    var self = this;
    var candidates = [];
    if (this.ipfsCid) {
      this.gateways.forEach(function (g) {
        candidates.push(g.replace(/\/$/, '') + '/' + self.ipfsCid);
      });
    }
    // 允许额外传入完整文件直链（如创作者 CDN 兜底）
    if (this.fullUrl) candidates.unshift(this.fullUrl);
    if (!candidates.length) { this._fail('未配置完整文件源'); return; }
    if (gatewayIndex >= candidates.length) { this._fail('所有文件源均不可用'); return; }
    var url = candidates[gatewayIndex];
    if (this.progressEl) this.progressEl.classList.add('active');
    // 预加载以获取真实进度
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onprogress = function (e) {
      if (e.lengthComputable && self.onProgress) {
        self.onProgress(Math.round(e.loaded * 100 / e.total));
        if (self.progressEl) self.progressEl.style.width = Math.round(e.loaded * 100 / e.total) + '%';
      }
    };
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        var blobUrl = URL.createObjectURL(xhr.response);
        self.audio.src = blobUrl;
        self.audio.play().catch(function () {});
        if (self.progressEl) { self.progressEl.style.width = '100%'; setTimeout(function () { self.progressEl.classList.remove('active'); }, 600); }
        self._set('ready');
      } else {
        self._loadFull(gatewayIndex + 1);
      }
    };
    xhr.onerror = function () { self._loadFull(gatewayIndex + 1); };
    xhr.send();
  };

  NovaLazyPlayer.prototype.destroy = function () {
    if (this.audio) this.audio.pause();
  };

  global.NovaLazyPlayer = NovaLazyPlayer;
})(typeof window !== 'undefined' ? window : this);
