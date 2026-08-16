# -*- coding: utf-8 -*-
import io
p = r"C:\Users\Administrator\novachain-web\music.html"
s = io.open(p, encoding="utf-8").read()

# 1) 引入 player-lazy.js
old = '  <script src="./apps-common.js"></script>'
new = '  <script src="./apps-common.js"></script>\n  <script src="./player-lazy.js"></script>'
assert old in s
s = s.replace(old, new)

# 2) 演示区：插入到“我发行的唱片”之前
old2 = '    <div class="section-title">💾 我发行的唱片</div>'
new2 = '''    <div class="section-title">🎵 分层加载播放器（30 秒试听 → 付费后 IPFS 全量）</div>
    <div class="card">
      <p class="dim">播放前先加载 30 秒试听片段（CDN，秒开）；试听结束后点击“解锁完整版”从 IPFS 加载完整文件，加载时显示进度条。</p>
      <div class="field"><label>试听片段 URL（CDN，30 秒）</label><input id="lpPreview" value="https://cdn.example.com/nova/preview/demo.mp3"></div>
      <div class="field"><label>完整文件 IPFS CID</label><input id="lpCid" value="bafybeidemo0000000000000000000000000000000000000000000"></div>
      <div class="sf-tools">
        <button class="btn primary" onclick="lpPlay()">▶ 播放试听（30 秒）</button>
        <button class="btn success" onclick="lpUnlock()">🔓 解锁完整版（付费后）</button>
        <button class="btn" onclick="lpPause()">⏸ 暂停</button>
      </div>
      <div class="sf-bar" style="margin-top:14px;">
        <span class="dim" id="lpState">未开始</span>
        <span class="dim" id="lpPct" style="font-family:var(--mono);"></span>
      </div>
      <div style="height:8px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px;">
        <div id="lpBar" style="height:100%;width:0%;background:linear-gradient(90deg,#00f0ff,#b44dff);transition:width .2s;"></div>
      </div>
    </div>

    <div class="section-title">💾 我发行的唱片</div>'''
assert old2 in s
s = s.replace(old2, new2)

# 3) 内联脚本（在 </body> 前追加）
old3 = '</body>'
new3 = '''  <script>
    var _lp = null;
    function lpMake() {
      var cid = document.getElementById('lpCid').value.trim();
      _lp = new NovaLazyPlayer({
        audio: document.getElementById('lpAudio') || (function () {
          var a = document.createElement('audio');
          a.id = 'lpAudio'; document.body.appendChild(a);
          return a;
        })(),
        progressEl: document.getElementById('lpBar'),
        previewUrl: document.getElementById('lpPreview').value.trim(),
        ipfsCid: cid,
        gateways: ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'],
        onState: function (st) {
          var map = { preview: '▶ 试听中（CDN 30 秒）', preview_ended: '⏸ 试听结束，解锁完整版',
                      loading: '⏳ 正在从 IPFS 加载完整文件…', ready: '✅ 完整版已就绪', error: '❌ 加载失败' };
          document.getElementById('lpState').textContent = map[st] || st;
        },
        onProgress: function (p) {
          document.getElementById('lpBar').style.width = p + '%';
          document.getElementById('lpPct').textContent = p + '%';
        }
      });
    }
    function lpPlay() { lpMake(); _lp.play(); }
    function lpUnlock() { if (!_lp) lpMake(); _lp.unlock(); }
    function lpPause() { if (_lp) _lp.pause(); }
  </script>
</body>'''
assert old3 in s
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8").write(s)
print("music.html patched")
