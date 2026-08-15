/* Nova 上传模块：前端压缩（ffmpeg.wasm）+ 分片上传 + 断点续传 + 实时进度 + 移动端适配 + 失败重试
 *
 * 用法：
 *   var up = new NovaUpload({ pinataJwt: '...', gateway: '/api/upload' });
 *   up.upload(file, {
 *     onProgress: function(p) { console.log(p.text, p.percent, p.loaded, p.total); },
 *     onHash: function(cid) { console.log('IPFS 哈希:', cid); }
 *   }).then(function(cid) { ... });
 *
 * 特性：
 * - 音乐：自动转码 128kbps MP3（ffmpeg.wasm）；图片：压缩到宽 2000px、质量 80%；
 *   视频：压缩到 720p（ffmpeg.wasm）
 * - 文件按 1MB 切片、并行上传 3 片、断点续传（localStorage 记录已上传切片序号）
 * - 进度条文案："已上传 45% (4.5MB/10MB)"
 * - 移动端自动启用更激进压缩；3G/4G 提示切换到 WiFi
 * - 分片失败自动重试 3 次，仍失败提示检查网络
 */
(function (global) {
  'use strict';

  var CHUNK_SIZE = 1024 * 1024;      // 1MB
  var PARALLEL = 3;                  // 并行分片数
  var MAX_RETRY = 3;                 // 失败重试次数
  var LS_PREFIX = 'nova_upload_';    // 断点续传记录前缀

  var FFMPEG_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
  var FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js';

  function fmtBytes(n) {
    if (n < 1024) return n + 'B';
    if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + 'MB';
    return (n / 1073741824).toFixed(2) + 'GB';
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  }

  function networkType() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return c ? c.effectiveType || c.type || 'unknown' : 'unknown';
  }

  function storageKey(file) {
    return LS_PREFIX + encodeURIComponent(file.name + '|' + file.size + '|' + (file.lastModified || 0));
  }

  function readSlices(key, total) {
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      return arr.filter(function (i) { return i >= 0 && i < total; });
    } catch (e) { return []; }
  }

  function saveSlices(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }

  function clearSlices(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function fileIdentity(file) {
    return file.name + '|' + file.size + '|' + (file.lastModified || 0);
  }

  /* ---------------- 压缩 ---------------- */
  function compressImage(file, opts) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var maxW = opts && opts.maxWidth ? opts.maxWidth : 2000;   // 桌面 2000px
        var quality = opts && opts.quality != null ? opts.quality : 0.8;  // 80%
        var scale = Math.min(1, maxW / img.width);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('图片压缩失败'));
          var out = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          out._originSize = file.size;
          resolve(out);
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }

  var _ffmpegPromise = null;
  function loadFFmpeg() {
    if (_ffmpegPromise) return _ffmpegPromise;
    _ffmpegPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = FFMPEG_URL;
      s.onload = function () {
        try {
          var FFmpegWASM = global.FFmpegWASM || global.FFmpeg;
          var ffmpeg = new FFmpegWASM.FFmpeg();
          ffmpeg.load({ coreURL: FFMPEG_CORE_URL }).then(function () { resolve(ffmpeg); })
            .catch(reject);
        } catch (e) { reject(e); }
      };
      s.onerror = function () { reject(new Error('ffmpeg.wasm 加载失败')); };
      document.head.appendChild(s);
    });
    return _ffmpegPromise;
  }

  async function transcode(file, args, outName, mime) {
    var ffmpeg = await loadFFmpeg();
    var inName = 'input_' + (file.name || 'in.bin');
    await ffmpeg.writeFile(inName, await file.arrayBuffer());
    await ffmpeg.exec(['-i', inName].concat(args, [outName]));
    var data = await ffmpeg.readFile(outName);
    var bytes = typeof data === 'string'
      ? Uint8Array.from(atob(data), function (c) { return c.charCodeAt(0); })
      : data;
    var out = new File([bytes], file.name.replace(/\.[^.]+$/, '.mp3'), { type: mime || 'audio/mpeg' });
    out._originSize = file.size;
    return out;
  }

  async function compressFile(file, opts) {
    opts = opts || {};
    var mobile = isMobile();
    var kind = opts.kind || (file.type.indexOf('image/') === 0 ? 'image' :
      (file.type.indexOf('audio/') === 0 ? 'audio' :
       (file.type.indexOf('video/') === 0 ? 'video' : 'file')));
    if (kind === 'image') {
      // 移动端更激进：宽 1400px、质量 70%
      return compressImage(file, mobile ? { maxWidth: 1400, quality: 0.7 } : { maxWidth: 2000, quality: 0.8 });
    }
    if (kind === 'audio') {
      // 桌面 128kbps；移动端 96kbps
      var abr = mobile ? '96k' : '128k';
      return transcode(file, ['-codec:a', 'libmp3lame', '-b:a', abr], 'out.mp3', 'audio/mpeg');
    }
    if (kind === 'video') {
      // 桌面 720p；移动端 480p
      var scale = mobile ? '480:-2' : '720:-2';
      return transcode(file, ['-vf', 'scale=' + scale, '-c:v', 'libx264', '-preset', 'veryfast',
                              '-crf', '28', '-c:a', 'aac', '-b:a', '96k'], 'out.mp4', 'video/mp4');
    }
    return file;
  }

  /* ---------------- 传输层 ---------------- */
  function buildProgress(loaded, total) {
    var percent = total > 0 ? Math.min(100, Math.round(loaded * 100 / total)) : 0;
    return { percent: percent, loaded: loaded, total: total,
             text: '已上传 ' + percent + '% (' + fmtBytes(loaded) + '/' + fmtBytes(total) + ')' };
  }

  /* Pinata 直传（整文件 multipart） */
  async function uploadPinata(file, jwt, onProgress) {
    var form = new FormData();
    form.append('file', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.pinata.cloud/pinning/pinFileToIPFS');
    xhr.setRequestHeader('Authorization', 'Bearer ' + jwt);
    var p = new Promise(function (resolve, reject) {
      xhr.onload = function () {
        try {
          var j = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && j.IpfsHash) resolve(j.IpfsHash);
          else reject(new Error((j.error && j.error.message) || 'Pinata 上传失败'));
        } catch (e) { reject(new Error('Pinata 响应无效')); }
      };
      xhr.onerror = function () { reject(new Error('网络错误')); };
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(buildProgress(e.loaded, e.total));
      };
    });
    xhr.send(form);
    return p;
  }

  /* 分片上传（自建网关）：POST /api/upload/chunk {name,index,total,hash,cid?} multipart 文件 */
  async function uploadChunk(gateway, file, slices, onProgress, onSliceDone) {
    var total = slices.length;
    var uploaded = readSlices(storageKey(file), total);
    var doneSet = {};
    uploaded.forEach(function (i) { doneSet[i] = true; });
    var next = 0, active = 0, finished = 0;
    var loadedBytes = uploaded.length * CHUNK_SIZE;
    var failed = false;

    function enqueue() {
      while (active < PARALLEL && next < total && !failed) {
        (function (index) {
          active++;
          next++;
          if (doneSet[index]) {
            finished++;
            maybeEnd();
            return;
          }
          var slice = slices[index];
          var form = new FormData();
          form.append('file', slice);
          form.append('index', String(index));
          form.append('total', String(total));
          form.append('name', file.name);
          form.append('size', String(file.size));
          var tries = 0;
          (function attempt() {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', gateway + '/chunk');
            var settled = false;
            xhr.onload = function () {
              if (settled) return; settled = true;
              if (xhr.status >= 200 && xhr.status < 300) {
                uploaded = uploaded.concat([index]).sort(function (a, b) { return a - b; });
                saveSlices(storageKey(file), uploaded);
                doneSet[index] = true;
                finished++;
                loadedBytes = Math.min(loadedBytes + slice.size, file.size);
                if (onSliceDone) onSliceDone(index, uploaded.length, total);
                active--;
                if (onProgress) onProgress(buildProgress(loadedBytes, file.size));
                maybeEnd();
                enqueue();
              } else {
                retry(xhr.status);
              }
            };
            xhr.onerror = function () { if (!settled) { settled = true; retry(0); } };
            xhr.upload.onprogress = function (e) {
              if (e.lengthComputable && onProgress) {
                loadedBytes = Math.min(loadedBytes + e.loaded, file.size);
                onProgress(buildProgress(loadedBytes, file.size));
              }
            };
            xhr.send(form);
            function retry(code) {
              tries++;
              if (tries <= MAX_RETRY) { setTimeout(attempt, 500 * tries); }
              else { failed = true; onProgress && onProgress(buildProgress(loadedBytes, file.size)); maybeEnd(new Error('网络异常，请检查网络后重试')); }
            }
          })();
        })(next);
      }
    }

    var ended = false, endErr = null, endCb = null;
    function maybeEnd(err) {
      if (err) { endErr = err; ended = true; }
      if (ended || (finished === total && active === 0)) {
        if (ended) { if (endCb) endCb(endErr); return; }
        finished = total;
        loadedBytes = file.size;
        if (onProgress) onProgress(buildProgress(file.size, file.size));
        if (endCb) endCb(null);
      }
    }

    // 组装完成回调
    var complete = new Promise(function (resolve, reject) {
      endCb = function (err) { err ? reject(err) : resolve(); };
    });
    enqueue();
    if (uploaded.length === total) maybeEnd();
    await complete;
    // 全部切片上传完成 → 通知网关合并，返回 IPFS 哈希
    var res = await fetch(gateway + '/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size, total: total, identity: fileIdentity(file) })
    });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.cid) throw new Error((j.error || '合并失败'));
    clearSlices(storageKey(file));
    return j.cid;
  }

  /* ---------------- 对外 API ---------------- */
  function NovaUpload(opts) {
    opts = opts || {};
    this.pinataJwt = opts.pinataJwt || '';
    this.gateway = opts.gateway || '';
    this.kind = opts.kind || '';
    this.autoCompress = opts.autoCompress !== false;
    this.aggressiveMobile = opts.aggressiveMobile !== false;
  }

  NovaUpload.prototype.upload = async function (file, callbacks) {
    callbacks = callbacks || {};
    var mobile = this.aggressiveMobile && isMobile();
    if (mobile && /^3g|^4g|slow-2g|2g/.test(networkType()) && callbacks.onNetworkWarn) {
      callbacks.onNetworkWarn('当前为 ' + networkType() + ' 网络，建议切换到 WiFi 后上传大文件');
    }
    var out = file;
    if (this.autoCompress) {
      out = await compressFile(file, { kind: this.kind });
      if (out !== file && callbacks.onCompressed) {
        callbacks.onCompressed(out, fmtBytes(out.size) + (file._originSize ? '（原 ' + fmtBytes(file._originSize) + '）' : ''));
      }
    }
    if (this.pinataJwt) {
      var cid = await uploadPinata(out, this.pinataJwt, callbacks.onProgress);
      if (callbacks.onHash) callbacks.onHash(cid);
      return cid;
    }
    if (this.gateway) {
      var total = Math.max(1, Math.ceil(out.size / CHUNK_SIZE));
      var slices = [];
      for (var i = 0; i < total; i++) {
        slices.push(out.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, out.size)));
      }
      var cid2 = await uploadChunk(this.gateway, out, slices, callbacks.onProgress, callbacks.onSlice);
      if (callbacks.onHash) callbacks.onHash(cid2);
      return cid2;
    }
    throw new Error('未配置上传通道（pinataJwt 或 gateway）');
  };

  NovaUpload.prototype.resumeInfo = function (file) {
    var total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    var done = readSlices(storageKey(file), total).length;
    return { done: done, total: total, percent: Math.round(done * 100 / total) };
  };

  global.NovaUpload = NovaUpload;
  NovaUpload._internals = {
    CHUNK_SIZE: CHUNK_SIZE, PARALLEL: PARALLEL, MAX_RETRY: MAX_RETRY,
    isMobile: isMobile, networkType: networkType, fmtBytes: fmtBytes,
    compressFile: compressFile, fileIdentity: fileIdentity, buildProgress: buildProgress
  };
})(typeof window !== 'undefined' ? window : this);
