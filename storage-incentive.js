/* Nova 存储激励前端模块：文件健康度（🟢/🟡/🔴）、创作者面板、节点监控、
 * 挑战证明、事件通知。依赖 apps-common.js 的 N.api / N.getState / N.toast 等。
 * 节点模式走链上 RPC；演示模式走 apps-common.js 内置 demo 数据。
 */
(function () {
  'use strict';

  function getN() { return (typeof NovaApps !== 'undefined') ? NovaApps : null; }
  function esc(x) { var N = getN(); return N ? N.esc(String(x == null ? '' : x)) : String(x); }
  function shortCid(c) { c = String(c || ''); return c.length > 18 ? c.slice(0, 10) + '…' + c.slice(-6) : c; }
  function fmtN(x) { return Number(x || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
  function healthEmoji(h) { return h === 'green' ? '🟢' : (h === 'yellow' ? '🟡' : '🔴'); }
  function healthText(h) { return h === 'green' ? '健康' : (h === 'yellow' ? '节点不足' : '无节点'); }
  function addrLink(a) { return '<span class="mono">' + esc(String(a || '').slice(0, 12)) + '</span>'; }

  function api(path, method, body) {
    var N = getN();
    return N ? N.api(path, method, body) : Promise.reject(new Error('NovaApps 未加载'));
  }

  function myAddr() {
    var N = getN();
    var s = N ? N.getState() : null;
    return (s && s.connected && s.addr) ? s.addr : null;
  }

  /* ============ 汇总 ============ */
  async function storageIncSummary() {
    try {
      var j = await api('/api/storage/inc/summary');
      if (!j || j.demoMode) return j || {};
      return j;
    } catch (e) { return {}; }
  }

  /* ============ 面板：文件健康度查询 ============ */
  async function renderStatusPanel() {
    var el = document.getElementById('stIncStatus');
    if (!el) return;
    var N = getN();
    try {
      var s = await storageIncSummary();
      el.innerHTML =
        '<div class="sf-grid2" style="margin-bottom:14px;">' +
        '<div class="sf-item"><h4>📦 已登记文件</h4><div class="sf-sub price">' + fmtN(s.files || 0) + ' 个</div></div>' +
        '<div class="sf-item"><h4>🖥️ 存储节点</h4><div class="sf-sub price">' + fmtN(s.nodes || 0) + ' 个</div></div>' +
        '<div class="sf-item"><h4>💸 已发放奖励</h4><div class="sf-sub price">' + fmtN(s.rewards_paid || 0) + ' NOVA</div></div>' +
        '<div class="sf-item"><h4>⚖️ 罚没</h4><div class="sf-sub price">' + fmtN(s.slashed || 0) + ' NOVA → 生态基金</div></div>' +
        '<div class="sf-item"><h4>🟢 健康</h4><div class="sf-sub price">' + fmtN(s.green || 0) + '</div></div>' +
        '<div class="sf-item"><h4>🟡 节点不足</h4><div class="sf-sub price">' + fmtN(s.yellow || 0) + '</div></div>' +
        '<div class="sf-item"><h4>🔴 无节点</h4><div class="sf-sub price">' + fmtN(s.red || 0) + '</div></div>' +
        '<div class="sf-item"><h4>🏦 生态基金</h4><div class="sf-sub price">' + fmtN(s.ecosystem_fund || 0) + ' NOVA</div></div></div>' +
        '<div class="sf-bar"><div class="field" style="flex:1;"><label>查询文件存储状态（IPFS 哈希 / CID）</label>' +
        '<input id="stIncQ" placeholder="0x… 或 bafy…"></div>' +
        '<button class="btn primary" style="align-self:flex-end;" onclick="storageIncQuery()">🔍 查询</button></div>' +
        '<div id="stIncQResult"><p class="dim">输入文件哈希后点击查询，将显示 🟢/🟡/🔴 健康度与在线节点列表。</p></div>';
    } catch (e) { el.innerHTML = N ? N.errHtml(String((e && e.message) || e)) : esc(e); }
  }

  async function storageIncQuery() {
    var el = document.getElementById('stIncQResult');
    var cid = document.getElementById('stIncQ').value.trim();
    if (!cid) return;
    try {
      var r = await api('/api/storage/status/' + encodeURIComponent(cid));
      if (r && r.error) { el.innerHTML = '<p class="dim">' + esc(r.error) + '</p>'; return; }
      var h = r.health || 'red';
      el.innerHTML =
        '<div class="sf-item"><h4>' + healthEmoji(h) + ' 《' + esc(r.title || '') + '》 <span class="tag">' + healthText(h) + '</span></h4>' +
        '<div class="sf-sub">CID ' + esc(shortCid(r.cid)) + ' 路 大小 ' + fmtN(r.size_gb) + ' GB 路 在线节点 ' + fmtN(r.online) + '/' + fmtN(r.replicas) + '<br>' +
        '存储节点：' + (r.nodes && r.nodes.length ? r.nodes.map(addrLink).join('、') : '<span class="dim">无（🔴 已通知创作者重新上传）</span>') + '</div></div>';
    } catch (e) {
      var N = getN();
      el.innerHTML = N ? N.errHtml(String((e && e.message) || e)) : esc(e);
    }
  }

  /* ============ 面板：创作者面板（状态 + 一键重新上传） ============ */
  async function renderCreatorPanel() {
    var el = document.getElementById('stIncCreator');
    var eventsEl = document.getElementById('stIncEvents');
    var addr = myAddr();
    if (!addr) {
      if (el) el.innerHTML = '<p class="dim">请先连接钱包。</p>';
      if (eventsEl) eventsEl.innerHTML = '';
      return;
    }
    var N = getN();
    try {
      var r = await api('/api/storage/creator/' + encodeURIComponent(addr));
      var files = (r && r.files) || [];
      if (el) {
        if (!files.length) {
          el.innerHTML = '<p class="dim">还没有已登记的文件。上传并登记后，这里会显示每个文件的存储健康度。</p>';
        } else {
          el.innerHTML = files.map(function (f) {
            var h = f.health || 'red';
            return '<div class="sf-item"><h4>' + healthEmoji(h) + ' 《' + esc(f.title || '') + '》 <span class="tag">' + healthText(h) + '</span></h4>' +
              '<div class="sf-sub">CID ' + esc(shortCid(f.cid)) + ' 路 ' + fmtN(f.size_gb) + ' GB 路 在线 ' + fmtN(f.online) + '/' + fmtN(f.replicas) + ' 节点<br>' +
              '存储节点：' + (f.nodes && f.nodes.length ? f.nodes.map(addrLink).join('、') : '无') + '</div>' +
              (h === 'red' ? '<div class="sf-tools"><button class="btn primary small" onclick="storageIncReupload(\'' + esc(f.cid) + '\')">🔄 一键重新上传</button></div>' : '') +
              '</div>';
          }).join('');
        }
      }
      if (eventsEl) {
        var evs = (r && r.events) || [];
        if (!evs.length) {
          eventsEl.innerHTML = '<p class="dim">暂无链上通知。</p>';
        } else {
          eventsEl.innerHTML = evs.map(function (e) {
            var red = e.type === 'file_red';
            return '<div class="sf-item"' + (red ? ' style="border-color:rgba(255,90,120,.45);"' : '') + '>' +
              '<h4>' + (red ? '🔴 ' : '📣 ') + esc(e.message || '') + '</h4>' +
              '<div class="sf-sub">' + new Date(e.at * 1000).toLocaleString('zh-CN') + '</div></div>';
          }).join('');
        }
      }
    } catch (e) {
      if (el) el.innerHTML = N ? N.errHtml(String((e && e.message) || e)) : esc(e);
    }
  }

  /* 重新上传：压缩 → 分片上传 → 计算片段承诺 → 链上替换哈希 */
  async function storageIncReupload(oldCid) {
    var N = getN();
    var addr = myAddr();
    if (!addr) { N && N.toast('请先连接钱包', 'error'); return; }
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.onchange = async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      N && N.toast('正在压缩并上传，请稍候…', 'info');
      try {
        var up = new NovaUpload({ gateway: '', pinataJwt: '' });  // 由页面级配置注入
        if (window.NOVA_UPLOAD_CONFIG) up = new NovaUpload(window.NOVA_UPLOAD_CONFIG);
        var compressed = file;
        if (up.autoCompress !== false) {
          var internals = NovaUpload._internals;
          compressed = await internals.compressFile(file, { kind: file.type.indexOf('image/') === 0 ? 'image' : 'audio' });
        }
        // 计算新文件前 1KB 的 sha256（fragment_commit）
        var head = await compressed.slice(0, 1024).arrayBuffer();
        var digest = await crypto.subtle.digest('SHA-256', head);
        var commit = Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        var cid2 = await up.upload(compressed, {
          onProgress: function (p) { N && N.toast(p.text, 'info'); }
        });
        var size_gb = Math.max(0.001, compressed.size / (1024 * 1024 * 1024));
        var r = await N.sfAction('nova:storage:inc:reupload', {
          old_cid: oldCid, new_cid: cid2, size_gb: size_gb,
          fragment_commit: commit, title: file.name.replace(/\.[^.]+$/, '')
        }, 0);
        if (!r.ok) throw new Error(r.error);
        N && N.toast('已重新上传并替换 IPFS 哈希：' + cid2.slice(0, 16) + '…', 'success');
        renderCreatorPanel();
      } catch (e) {
        N && N.toast('重新上传失败：' + ((e && e.message) || e), 'error');
      }
    };
    fileInput.click();
  }

  /* ============ 面板：节点监控与收益 ============ */
  async function renderMonitorPanel() {
    var el = document.getElementById('stIncMonitor');
    if (!el) return;
    var N = getN();
    var addr = myAddr();
    try {
      var r = await api('/api/storage/nodes');
      var nodes = (r && r.nodes) || {};
      var ids = Object.keys(nodes);
      var me = addr && nodes[addr] ? nodes[addr] : null;
      var html = '';
      if (me) {
        html += '<div class="sf-item" style="border-color:rgba(0,240,255,.35);"><h4>📈 我的存储收益</h4>' +
          '<div class="sf-sub price">本月存储收益 ' + fmtN(me.month_revenue || 0) + ' NOVA，存储 ' + fmtN(me.stored_gb || 0) +
          ' GB，健康度 ' + fmtN(me.health_pct || 0) + '%' + (me.online ? ' 🟢 在线' : ' ⚫ 离线') + '</div>' +
          '<div class="sf-sub">累计收益 ' + fmtN(me.revenue || 0) + ' NOVA 路 配额 ' + fmtN(me.quota_gb || 0) + ' GB 路 连续失败 ' + fmtN(me.fail_count || 0) + '</div>' +
          (me.exit_at ? '<div class="sf-sub">🚪 退出中，' + Math.max(0, Math.ceil((me.exit_at - Date.now() / 1000) / 86400)) + ' 天后迁移并释放质押</div>' : '') +
          '</div>';
      }
      if (!ids.length) {
        html += '<p class="dim">暂无存储节点。超级节点质押后自动注册，无需额外配置。</p>';
      } else {
        html += ids.map(function (a) {
          var n = nodes[a];
          return '<div class="sf-item"><h4>🖥️ ' + addrLink(a) + (n.online ? ' <span class="tag live">在线</span>' : ' <span class="tag">离线</span>') + (n.exit_at ? ' <span class="tag">退出中</span>' : '') + '</h4>' +
            '<div class="sf-sub">配额 ' + fmtN(n.quota_gb) + ' GB 路 存储 ' + fmtN(n.stored_gb) + ' GB 路 本月收益 ' + fmtN(n.month_revenue) +
            ' NOVA 路 健康度 ' + fmtN(n.health_pct) + '%<br>连续失败 ' + fmtN(n.fail_count) + '/3（达 3 次罚没 10% 质押）</div></div>';
        }).join('');
      }
      el.innerHTML = html;
    } catch (e) { el.innerHTML = N ? N.errHtml(String((e && e.message) || e)) : esc(e); }
  }

  /* ============ 面板：挑战证明（激励） ============ */
  async function renderIncProvePanel() {
    var el = document.getElementById('stIncProve');
    if (!el) return;
    var N = getN();
    var addr = myAddr();
    if (!addr) { el.innerHTML = '<p class="dim">请先连接钱包。</p>'; return; }
    try {
      var ch = await api('/api/storage/nodes/' + encodeURIComponent(addr) + '/challenge');
      if (!ch || !ch.found) {
        el.innerHTML = '<p class="dim">' + esc((ch && ch.reason) || '当前无挑战') + '</p>' +
          '<div class="sf-tools"><button class="btn small" onclick="storageIncHeartbeat()">💓 提交心跳</button>' +
          '<button class="btn small" onclick="storageIncUpgrade()">📈 质押升级配额</button>' +
          '<button class="btn small" onclick="storageIncExit()">🚪 声明退出（7 天）</button></div>';
        return;
      }
      var files = (ch.files || []).map(function (c) {
        return '<div class="sf-sub">📌 ' + esc(shortCid(c)) + '</div>';
      }).join('');
      el.innerHTML =
        '<div class="sf-item"><h4>⚡ 今日存储证明挑战（周期 #' + esc(ch.day) + '）</h4>' + files +
        '<p class="dim mt">请为每个文件返回其<b>前 1KB 片段</b>（hex，每个 2048 字符）。可用节点守护脚本自动完成：' +
        '<span class="mono">python scripts/storage_node_daemon.py --rpc http://127.0.0.1:8080 --priv-key &lt;hex&gt; --store ./node_store</span></p></div>' +
        '<div class="field"><label>挑战文件（JSON 数组，与上方一致）</label><input id="stIncFiles" value=\'' + esc(JSON.stringify(ch.files || [])) + '\'></div>' +
        '<div class="field"><label>片段列表（JSON 数组，按文件顺序，每项 2048 hex 字符）</label>' +
        '<textarea id="stIncFragments" rows="3" placeholder="[\"<1024字节片段hex>\", ...]"></textarea></div>' +
        '<div class="sf-tools">' +
        '<button class="btn primary" onclick="storageIncProve()">✅ 提交存储证明</button>' +
        '<button class="btn small" onclick="storageIncHeartbeat()">💓 心跳</button>' +
        '<button class="btn small" onclick="storageIncUpgrade()">📈 升级配额</button>' +
        '<button class="btn small" onclick="storageIncExit()">🚪 声明退出</button></div>' +
        '<div id="stIncProveRes"></div>';
    } catch (e) { el.innerHTML = N ? N.errHtml(String((e && e.message) || e)) : esc(e); }
  }

  async function storageIncProve() {
    var N = getN();
    var addr = myAddr();
    if (!addr) { N && N.toast('请先连接钱包', 'error'); return; }
    var filesEl = document.getElementById('stIncFiles');
    var fragEl = document.getElementById('stIncFragments');
    var resEl = document.getElementById('stIncProveRes');
    try {
      var files = JSON.parse(filesEl.value);
      var fragments = JSON.parse(fragEl.value);
      if (!Array.isArray(files) || !Array.isArray(fragments) || files.length !== fragments.length) {
        throw new Error('文件与片段数组长度不一致');
      }
      var day = await api('/api/storage/nodes/' + encodeURIComponent(addr) + '/challenge').then(function (c) { return c.day || 0; });
      var r = await N.sfAction('nova:storage:inc:prove', { day: day, files: files, fragments: fragments }, 0);
      if (!r.ok) throw new Error(r.error);
      N.toast('存储证明已提交', 'success');
      resEl.innerHTML = '<p class="dim">✅ 已提交（txid ' + esc(String(r.txid || r.id || '').slice(0, 14)) + '…）</p>';
      renderIncProvePanel();
    } catch (e) {
      resEl.innerHTML = '<p class="dim">' + esc(String((e && e.message) || e)) + '</p>';
    }
  }

  async function storageIncHeartbeat() {
    var N = getN();
    if (!N) return;
    var ok = await N.requireWallet();
    if (!ok) return;
    var r = await N.sfAction('nova:storage:inc:heartbeat', {}, 0);
    if (!r.ok) { N.toast(r.error, 'err'); return; }
    N.toast('心跳已提交，节点保持在线', 'success');
    renderIncProvePanel(); renderMonitorPanel();
  }

  async function storageIncUpgrade() {
    var N = getN();
    if (!N) return;
    var ok = await N.requireWallet();
    if (!ok) return;
    var amount = prompt('质押更多 NOVA 以升级存储配额（每 1 NOVA 质押 +0.1GB）：', '100');
    if (!amount || isNaN(Number(amount))) return;
    var r = await N.sfAction('nova:storage:inc:upgrade', {}, Number(amount));
    if (!r.ok) { N.toast(r.error, 'err'); return; }
    N.toast('配额升级质押已提交', 'success');
    renderMonitorPanel();
  }

  async function storageIncExit() {
    var N = getN();
    if (!N) return;
    var ok = await N.requireWallet();
    if (!ok) return;
    if (!window.confirm('声明退出后，文件将在 7 天后迁移到其他节点，届时释放你的质押。确认？')) return;
    var r = await N.sfAction('nova:storage:inc:exit', {}, 0);
    if (!r.ok) { N.toast(r.error, 'err'); return; }
    N.toast('已声明退出（7 天迁移期）', 'success');
    renderMonitorPanel();
  }

  /* ============ 刷新入口 ============ */
  function refresh() {
    renderStatusPanel();
    renderCreatorPanel();
    renderMonitorPanel();
    renderIncProvePanel();
  }

  window.storageIncRefresh = refresh;
  window.storageIncQuery = storageIncQuery;
  window.storageIncReupload = storageIncReupload;
  window.storageIncProve = storageIncProve;
  window.storageIncHeartbeat = storageIncHeartbeat;
  window.storageIncUpgrade = storageIncUpgrade;
  window.storageIncExit = storageIncExit;

  window.addEventListener('nova-wallet', function () { refresh(); });
  if (document.readyState !== 'loading') setTimeout(refresh, 400);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(refresh, 400); });
})();
