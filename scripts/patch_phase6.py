# -*- coding: utf-8 -*-
"""wallet.html 阶段六改造（32-38 项）。锚点唯一校验，失败即中止不写入。"""
import sys
PATH = r"C:\Users\Administrator\novachain-web\wallet.html"
with open(PATH, "r", encoding="utf-8", newline="") as f:
    content = f.read()
steps = []
def rep(name, old, new):
    steps.append((name, old, new))

# ================= A. head：主题 / 去 CDN / 本地 SHA3-256 =================
rep("A1 html lang+theme", '<html lang="zh">',
    '<html lang="zh" data-theme="auto">')

rep("A2 color-scheme meta", '    <meta name="theme-color" content="#030309">',
'''    <meta name="theme-color" content="#030309">
    <meta name="color-scheme" content="dark light">''')

rep("A3 CSP 去 jsdelivr", "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'")

rep("A4 移除 js-sha3 CDN", '''
    <script src="https://cdn.jsdelivr.net/npm/js-sha3@0.8.0/build/sha3.min.js" integrity="sha384-NKbaJKqJPrFeb86qfU2iNy4KO3oyIe6F5xm1PBYMpAkiVTxHjjafUKlebp0mAeNC" crossorigin="anonymous"></script>''',
    '')

rep("A5 本地 SHA3-256 兜底", '    <script src="./apps-common.js"></script>',
'''    <script>
        /* 本地 SHA3-256（37 加载优化：替代 js-sha3 CDN，离线可用；输出与 js-sha3 一致） */
        (function () {
            if (typeof window.sha3_256 === 'function') return;
            var RC = [1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
            var MASK = 0xffffffffffffffffn;
            function rotl(x, n) { return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK; }
            function keccakF(state) {
                var C = [], D = [], B = [], x, y, r;
                for (r = 0; r < 24; r++) {
                    for (x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
                    for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
                    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
                    var R = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
                    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], R[x][y]);
                    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) state[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y]);
                    state[0] ^= RC[r];
                }
            }
            function toBytes(str) {
                var out = [];
                for (var i = 0; i < str.length; i++) {
                    var c = str.charCodeAt(i);
                    if (c < 0x80) out.push(c);
                    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
                    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
                    else { var cc = c - 0x10000; out.push(0xf0 | (cc >> 18), 0x80 | ((cc >> 12) & 63), 0x80 | ((cc >> 6) & 63), 0x80 | (cc & 63)); }
                }
                return out;
            }
            function sha3_256(msg) {
                var input = typeof msg === 'string' ? toBytes(msg) : Array.prototype.slice.call(msg || []);
                var rate = 136, outLen = 32, st = new Array(25).fill(0n), i, j, lane, b, k;
                var full = Math.floor(input.length / rate) * rate;
                for (i = 0; i < full; i += rate) {
                    for (j = 0; j < rate; j++) st[Math.floor(j / 8)] ^= BigInt(input[i + j]) << BigInt(8 * (j % 8));
                    keccakF(st);
                }
                var rem = input.slice(full);
                rem.push(0x06);
                while (rem.length % rate !== 0) rem.push(0);
                rem[rem.length - 1] |= 0x80;
                for (j = 0; j < rate; j++) st[Math.floor(j / 8)] ^= BigInt(rem[j]) << BigInt(8 * (j % 8));
                keccakF(st);
                var out = [], written = 0;
                for (lane = 0; lane < 25 && written < outLen; lane++) {
                    for (b = 0; b < 8 && written < outLen; b++) { out.push(Number((st[lane] >> BigInt(8 * b)) & 0xffn)); written++; }
                }
                var hex = '';
                for (k = 0; k < out.length; k++) hex += ('0' + out[k].toString(16)).slice(-2);
                return hex;
            }
            window.sha3_256 = sha3_256;
        })();
    </script>
    <script src="./apps-common.js"></script>''')

# ================= B. CSS：亮色主题 / 引导 / 无障碍 / 顶栏 =================
rep("B1 CSS 阶段六样式", '    </style>',
'''        /* ===== 阶段六 · 35 亮色主题 ===== */
        html[data-theme="light"] {
            --bg-deep: #eef2fb;
            --bg-panel: rgba(255, 255, 255, .74);
            --border: rgba(23, 45, 92, .18);
            --border-strong: rgba(0, 120, 255, .6);
            --accent: #0077ff;
            --accent2: #8a2be2;
            --accent3: #d63384;
            --text: #101426;
            --dim: #5a6486;
            --danger: #d92d4e;
        }
        .header { position: relative; }
        html[data-theme="light"] body {
            background-color: #eef2fb;
            background-image: radial-gradient(1400px 900px at 50% -12%, #d9e5ff, var(--bg-deep) 62%);
        }
        html[data-theme="light"] ::-webkit-scrollbar-track { background: #dfe6f4; }
        html[data-theme="light"] ::-webkit-scrollbar-thumb { border-color: #dfe6f4; }
        html[data-theme="light"] #bg-grid { opacity: .3; }
        html[data-theme="light"] .orb { opacity: .16; }
        html[data-theme="light"] #bg-aurora::after { background: radial-gradient(ellipse 120% 90% at 50% 40%, transparent 55%, rgba(238,242,251,.88)); }
        html[data-theme="light"] .nav-tabs { background: rgba(255,255,255,.82); box-shadow: 0 12px 44px rgba(30,60,120,.16); }
        html[data-theme="light"] .panel {
            background-color: rgba(255,255,255,.8);
            background-image: repeating-linear-gradient(0deg, rgba(20,40,90,.03) 0 1px, transparent 1px 3px);
            box-shadow: 0 18px 60px rgba(30,60,120,.14);
        }
        html[data-theme="light"] .panel::after { background: radial-gradient(circle, rgba(0,119,255,.1), transparent 65%); }
        html[data-theme="light"] .mode-banner, html[data-theme="light"] .lock-badge, html[data-theme="light"] .chip,
        html[data-theme="light"] .tag, html[data-theme="light"] .mn-word, html[data-theme="light"] .contact-item,
        html[data-theme="light"] .response, html[data-theme="light"] .warning { background: rgba(255,255,255,.72); }
        html[data-theme="light"] input, html[data-theme="light"] textarea, html[data-theme="light"] select {
            background: rgba(255,255,255,.92); color: var(--text);
        }
        html[data-theme="light"] input:focus, html[data-theme="light"] textarea:focus, html[data-theme="light"] select:focus { background: #fff; }
        html[data-theme="light"] input::placeholder, html[data-theme="light"] textarea::placeholder { color: #8a93b3; }
        html[data-theme="light"] .modal { background: rgba(255,255,255,.98); box-shadow: 0 24px 80px rgba(30,60,120,.3); }
        html[data-theme="light"] .address-box { background: rgba(255,255,255,.8); }
        html[data-theme="light"] .onboard-card { background: #fff; box-shadow: 0 30px 90px rgba(30,60,120,.3); }
        html[data-theme="light"] .onboard-feat { background: rgba(0,60,160,.05); }
        html[data-theme="light"] .icon-btn { background: rgba(255,255,255,.8); }
        html[data-theme="light"] .net-chip { color: #8a5a00; background: rgba(255,177,66,.18); }
        /* ===== 阶段六 · 32 首次使用引导 ===== */
        .onboard-mask { position: fixed; inset: 0; z-index: 90; background: rgba(2,3,10,.84); backdrop-filter: blur(10px); display: none; align-items: center; justify-content: center; padding: 1.2rem; }
        .onboard-mask.show { display: flex; }
        .onboard-card { width: 100%; max-width: 580px; background: rgba(10,14,32,.98); border: 1px solid var(--border-strong); border-radius: 22px; padding: 1.8rem 1.6rem 1.4rem; box-shadow: 0 30px 90px rgba(0,0,0,.65); position: relative; }
        .onboard-close { position: absolute; top: .8rem; right: .9rem; width: auto; margin: 0; padding: .35rem .7rem; font-size: .72rem; background: transparent; color: var(--dim); box-shadow: none; border: 1px solid var(--border); }
        .onboard-step { display: none; }
        .onboard-step h3 { font-family: var(--font-display); font-size: 1.15rem; margin-bottom: .8rem; }
        .onboard-feat { display: flex; gap: .7rem; align-items: flex-start; margin: .8rem 0; padding: .7rem .9rem; border: 1px solid var(--border); border-radius: 14px; background: rgba(255,255,255,.04); }
        .onboard-feat .em { font-size: 1.2rem; }
        .onboard-dots { display: flex; gap: .45rem; justify-content: center; margin: 1.1rem 0 .9rem; }
        .ob-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--border); transition: width .3s, background .3s; }
        .ob-dot.on { width: 24px; background: var(--accent); box-shadow: 0 0 10px rgba(0,240,255,.6); }
        .onboard-btns { display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap; }
        .onboard-btns .btn-sm, .onboard-btns .btn-ghost { margin-bottom: 0; width: auto; }
        /* ===== 阶段六 · 38 无障碍 ===== */
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--border-strong); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
        }
        @media (prefers-contrast: more) {
            .panel, .nav-tabs, .mode-banner, .modal, .onboard-card { border: 2px solid var(--border-strong); }
            :root { --border: rgba(140,210,255,.5); --dim: #c3cbf0; }
            html[data-theme="light"] { --border: rgba(23,45,92,.55); --dim: #3a4466; }
        }
        /* ===== 阶段六 · 顶栏工具 ===== */
        .hud-actions { position: absolute; top: 1rem; right: 1.2rem; display: flex; gap: .5rem; align-items: center; z-index: 5; }
        .icon-btn { width: auto; margin: 0; padding: .45rem .8rem; font-size: .82rem; background: rgba(13,16,36,.6); border: 1px solid var(--border); color: var(--text); box-shadow: none; border-radius: 999px; }
        .net-chip { display: inline-flex; align-items: center; gap: .3rem; font-size: .74rem; padding: .42rem .75rem; border-radius: 999px; border: 1px solid rgba(255,177,66,.5); color: #ffd166; background: rgba(255,177,66,.1); }
    </style>''')

# ================= C. body 标记 =================
rep("C1 bg-aurora aria", '    <div id="bg-aurora">', '    <div id="bg-aurora" aria-hidden="true">')
rep("C2 bg-grid aria", '    <div id="bg-grid"></div>', '    <div id="bg-grid" aria-hidden="true"></div>')
rep("C3 spotlight aria", '    <div id="spotlight"></div>', '    <div id="spotlight" aria-hidden="true"></div>')
rep("C4 hud-tl/tr aria", '    <div class="hud-corner hud-tl"></div><div class="hud-corner hud-tr"></div>',
    '    <div class="hud-corner hud-tl" aria-hidden="true"></div><div class="hud-corner hud-tr" aria-hidden="true"></div>')
rep("C5 hud-bl/br aria", '    <div class="hud-corner hud-bl"></div><div class="hud-corner hud-br"></div>',
    '    <div class="hud-corner hud-bl" aria-hidden="true"></div><div class="hud-corner hud-br" aria-hidden="true"></div>')

rep("C6 header 国际化 + 顶栏工具", '''        <header class="header">
            <div class="kicker">NOVA CHAIN · WEB3 WALLET</div>
            <h1 class="logo">NOVA 钱包</h1>
            <p class="tagline">量子安全签名钱包 · 端到端加密聊天</p>
            <div class="hero-badges">
                <span class="chip">🔐 私钥本地生成</span>
                <span class="chip">🗝 X25519 ECDH</span>
                <span class="chip">🔒 AES-256-GCM</span>
                <span class="chip">💬 节点只见密文</span>
            </div>
        </header>''',
'''        <header class="header">
            <div class="hud-actions" role="group" aria-label="界面设置">
                <button class="icon-btn" id="themeBtn" onclick="cycleTheme()" type="button" title="主题">🌓</button>
                <button class="icon-btn" id="langBtn" onclick="toggleLang()" type="button" title="切换语言">🌐 EN</button>
                <span class="net-chip" id="netBadge" hidden>📡 <span id="netBadgeText">离线</span></span>
            </div>
            <div class="kicker">NOVA CHAIN · WEB3 WALLET</div>
            <h1 class="logo" data-i18n="logo">NOVA 钱包</h1>
            <p class="tagline" data-i18n="tagline">量子安全签名钱包 · 端到端加密聊天</p>
            <div class="hero-badges">
                <span class="chip" data-i18n="chipLocal">🔐 私钥本地生成</span>
                <span class="chip" data-i18n="chipEcdh">🗝 X25519 ECDH</span>
                <span class="chip" data-i18n="chipAes">🔒 AES-256-GCM</span>
                <span class="chip" data-i18n="chipNodeOnly">💬 节点只见密文</span>
            </div>
        </header>''')

rep("C7 引导层", '        <div id="runtimeModeBanner" class="mode-banner demo">正在检测运行模式…</div>',
'''        <!-- ===== 阶段六 · 32 首次使用引导 ===== -->
        <div class="onboard-mask" id="onboardMask" role="dialog" aria-modal="true" aria-label="新手指引">
            <div class="onboard-card">
                <button class="btn-ghost btn-sm onboard-close" onclick="closeOnboarding()" type="button" data-i18n="obSkip">跳过</button>
                <div class="onboard-step" data-step="1">
                    <h3 data-i18n="ob1Title">👋 欢迎使用 Nova 钱包</h3>
                    <div class="onboard-feat"><span class="em">🔐</span><span data-i18n="ob1a">私钥完全由你掌控：助记词在本地生成，加密后只保存在这台设备</span></div>
                    <div class="onboard-feat"><span class="em">🌐</span><span data-i18n="ob1b">支持 Nova 主链与 ETH/BSC/Polygon 多链资产，一个钱包管理多账户</span></div>
                    <div class="onboard-feat"><span class="em">💬</span><span data-i18n="ob1c">端到端加密聊天：节点只能转发密文，无法读取内容</span></div>
                </div>
                <div class="onboard-step" data-step="2">
                    <h3 data-i18n="ob2Title">🛡 安全须知（请务必阅读）</h3>
                    <div class="onboard-feat"><span class="em">📝</span><span data-i18n="ob2a">助记词请离线抄写，不要截图、不要发给任何人；谁拿到助记词，谁就拥有你的资产</span></div>
                    <div class="onboard-feat"><span class="em">🔑</span><span data-i18n="ob2b">设置一个强密码，每次签名前都会要求验证</span></div>
                    <div class="onboard-feat"><span class="em">🚫</span><span data-i18n="ob2c">警惕钓鱼网站：请始终通过官方域名访问本钱包</span></div>
                </div>
                <div class="onboard-step" data-step="3">
                    <h3 data-i18n="ob3Title">🚀 准备就绪</h3>
                    <p class="footnote" data-i18n="ob3a">现在创建你的第一个账户：生成助记词 → 抄写验证 → 设置密码。</p>
                </div>
                <div class="onboard-dots">
                    <span class="ob-dot on" data-step="1"></span>
                    <span class="ob-dot" data-step="2"></span>
                    <span class="ob-dot" data-step="3"></span>
                </div>
                <div class="onboard-btns">
                    <button class="btn-ghost btn-sm" id="obPrev" onclick="onboardPrev()" type="button" data-i18n="obPrev" style="display:none;">上一步</button>
                    <button class="btn-sm" id="obNext" onclick="onboardNext()" type="button" data-i18n="obNext">下一步</button>
                    <button class="btn-sm" id="obStart" onclick="closeOnboarding()" type="button" style="display:none;" data-i18n="obStart">开始使用</button>
                </div>
            </div>
        </div>
        <div id="runtimeModeBanner" class="mode-banner demo">正在检测运行模式…</div>''')

rep("C8 nav 角色 + 国际化", '''        <nav class="nav-tabs" id="navTabs">
            <span class="nav-indicator"></span>
            <button class="nav-tab active" data-panel="wallet">🔐 钱包</button>
            <button class="nav-tab" data-panel="chat">💬 加密聊天</button>
            <button class="nav-tab" data-panel="security">🛡 安全</button>
            <button class="nav-tab" data-panel="multichain">🌐 多链</button>
            <button class="nav-tab" data-panel="assets">📦 资产</button>
        </nav>''',
'''        <nav class="nav-tabs" id="navTabs" role="tablist" aria-label="主导航">
            <span class="nav-indicator" aria-hidden="true"></span>
            <button class="nav-tab active" data-panel="wallet" role="tab" aria-selected="true" data-i18n="navWallet">🔐 钱包</button>
            <button class="nav-tab" data-panel="chat" role="tab" aria-selected="false" data-i18n="navChat">💬 加密聊天</button>
            <button class="nav-tab" data-panel="security" role="tab" aria-selected="false" data-i18n="navSecurity">🛡 安全</button>
            <button class="nav-tab" data-panel="multichain" role="tab" aria-selected="false" data-i18n="navMulti">🌐 多链</button>
            <button class="nav-tab" data-panel="assets" role="tab" aria-selected="false" data-i18n="navAssets">📦 资产</button>
        </nav>''')

rep("C9 toast role", '        <div class="toast" id="toast"></div>',
    '        <div class="toast" id="toast" role="status" aria-live="polite"></div>')

# ================= D. 钱包面板 data-i18n =================
rep("D1 钱包标题", '            <h2 class="reveal in" style="--d:0s">🔐 Web3 钱包</h2>',
    '            <h2 class="reveal in" style="--d:0s" data-i18n="walletTitle">🔐 Web3 钱包</h2>')
rep("D2 安全提示", '            <div class="warning reveal in" style="--d:.05s">🔒 私钥已用 AES-256 加密保存在浏览器本地，签名前需输入密码；请务必离线抄写并妥善保存助记词</div>',
    '            <div class="warning reveal in" style="--d:.05s" data-i18n="secWarning">🔒 私钥已用 AES-256 加密保存在浏览器本地，签名前需输入密码；请务必离线抄写并妥善保存助记词</div>')
rep("D3 rpcUrl 占位", '                <input type="text" id="rpcUrl" placeholder="节点RPC地址" value="http://127.0.0.1:8080">',
    '                <input type="text" id="rpcUrl" placeholder="节点RPC地址" data-i18n-ph="rpcPh" value="http://127.0.0.1:8080">')
rep("D4 连接按钮", '                <button class="btn-sm magnetic" onclick="checkNode()">连接</button>',
    '                <button class="btn-sm magnetic" onclick="checkNode()" data-i18n="connect">连接</button>')
rep("D5 钱包状态", '                <div class="label">钱包状态</div>',
    '                <div class="label" data-i18n="walletStatus">钱包状态</div>')
rep("D6 新建账户", '                    <button class="btn-sm" onclick="startCreateWallet()">➕ 新建账户</button>',
    '                    <button class="btn-sm" onclick="startCreateWallet()" data-i18n="newAccount">➕ 新建账户</button>')
rep("D7 锁定按钮", '                    <button class="btn-ghost btn-sm" onclick="lockWallet()">🔒 锁定</button>',
    '                    <button class="btn-ghost btn-sm" onclick="lockWallet()" data-i18n="lockBtn">🔒 锁定</button>')
rep("D8 账户标签", '                <div class="label" style="margin-top:.7rem;">账户（多账户：一键切换多个地址）</div>',
    '                <div class="label" style="margin-top:.7rem;" data-i18n="accountsLabel">账户（多账户：一键切换多个地址）</div>')
rep("D9 导入占位", '                    <input type="text" id="importKey" placeholder="粘贴 12 个助记词 或 64 位私钥 导入">',
    '                    <input type="text" id="importKey" placeholder="粘贴 12 个助记词 或 64 位私钥 导入" data-i18n-ph="importPh">')
rep("D10 导入按钮", '                    <button class="btn-sm" onclick="importWallet()">📥 导入</button>',
    '                    <button class="btn-sm" onclick="importWallet()" data-i18n="importBtn">📥 导入</button>')
rep("D11 导出助记词", '                    <button class="btn-ghost btn-sm" onclick="exportSecret()">📤 导出助记词</button>',
    '                    <button class="btn-ghost btn-sm" onclick="exportSecret()" data-i18n="exportMnemonic">📤 导出助记词</button>')
rep("D12 生物识别", '                    <button class="btn-ghost btn-sm" id="bioBtn" onclick="toggleBiometric()" style="display:none;">🔓 启用生物识别</button>',
    '                    <button class="btn-ghost btn-sm" id="bioBtn" onclick="toggleBiometric()" style="display:none;" data-i18n="bioEnable">🔓 启用生物识别</button>')
rep("D13 我的地址", '                <div class="label">我的地址 <span class="tag">签名算法 Ed25519 / Dilithium5</span></div>',
    '                <div class="label"><span data-i18n="myAddressLbl">我的地址</span> <span class="tag" data-i18n="sigTag">签名算法 Ed25519 / Dilithium5</span></div>')
rep("D14 地址框无障碍", '                <div class="address-box" id="myAddress" title="点击复制" onclick="copyText(this.textContent)">—</div>',
    '                <div class="address-box" id="myAddress" title="点击复制" aria-label="复制地址" role="button" tabindex="0" onclick="copyText(this.textContent)" onkeydown="if(event.key===\'Enter\'||event.key===\' \')copyText(this.textContent)">—</div>')
rep("D15 余额标签", '                <div class="label">余额</div>',
    '                <div class="label" data-i18n="balanceLbl">余额</div>')
rep("D16 余额行+缓存标记", '                <div class="bal" id="myBalance">0</div> <span style="color:var(--dim)">NOVA</span>',
    '                <div class="bal" id="myBalance">0</div> <span style="color:var(--dim)">NOVA</span> <span id="balCacheTag" style="display:none; font-size:.72rem; color:var(--dim);" aria-hidden="true"></span>')
rep("D17 转账标题", '            <h2 class="reveal in" style="--d:.3s">💸 转账</h2>',
    '            <h2 class="reveal in" style="--d:.3s" data-i18n="transferTitle">💸 转账</h2>')
rep("D18 接收方", '            <input type="text" id="toAddr" placeholder="接收方地址" class="reveal in" style="--d:.35s">',
    '            <input type="text" id="toAddr" placeholder="接收方地址" data-i18n-ph="toPh" class="reveal in" style="--d:.35s">')
rep("D19 金额", '            <input type="number" id="amount" placeholder="金额 (NOVA)" step="any" class="reveal in" style="--d:.4s">',
    '            <input type="number" id="amount" placeholder="金额 (NOVA)" data-i18n-ph="amountPh" step="any" class="reveal in" style="--d:.4s">')
rep("D20 备注", '            <input type="text" id="memo" placeholder="备注（可选）" class="reveal in" style="--d:.45s">',
    '            <input type="text" id="memo" placeholder="备注（可选）" data-i18n-ph="memoPh" class="reveal in" style="--d:.45s">')
rep("D21 签名发送", '            <button class="reveal in" style="--d:.5s" onclick="sendTx()">✍️ 签名并发送</button>',
    '            <button class="reveal in" style="--d:.5s" onclick="sendTx()" data-i18n="signSend">✍️ 签名并发送</button>')
rep("D22 交易历史标题", '            <h2 class="reveal in" style="--d:.6s">📜 交易历史</h2>',
    '            <h2 class="reveal in" style="--d:.6s" data-i18n="txHistoryTitle">📜 交易历史</h2>')
rep("D23 历史说明", '            <p class="footnote reveal in" style="--d:.65s">本地记录 + 链上查询：连接节点后自动同步确认状态（待确认 / 已确认 / 失败）。</p>',
    '            <p class="footnote reveal in" style="--d:.65s" data-i18n="txHistoryNote">本地记录 + 链上查询：连接节点后自动同步确认状态（待确认 / 已确认 / 失败）。</p>')
rep("D24 刷新", '                <button class="btn-ghost btn-sm" onclick="refreshTxHistory()">🔄 刷新</button>',
    '                <button class="btn-ghost btn-sm" onclick="refreshTxHistory()" data-i18n="refresh">🔄 刷新</button>')
rep("D25 清空本地", '                <button class="btn-ghost btn-sm" onclick="clearTxHistory()">🗑 清空本地记录</button>',
    '                <button class="btn-ghost btn-sm" onclick="clearTxHistory()" data-i18n="clearLocal">🗑 清空本地记录</button>')

# ================= E. 其他面板标题 =================
rep("E1 聊天标题", '            <h2>💬 端到端加密聊天</h2>',
    '            <h2 data-i18n="chatTitle">💬 端到端加密聊天</h2>')
rep("E2 聊天提示", '                <span>🔒 每条消息使用 <strong>X25519 ECDH + HKDF-SHA256 + AES-256-GCM</strong> 加密，节点只转发密文。</span>',
    '                <span data-i18n-html="chatHint">🔒 每条消息使用 <strong>X25519 ECDH + HKDF-SHA256 + AES-256-GCM</strong> 加密，节点只转发密文。</span>')
rep("E3 联系人占位", '                <input type="text" id="contactAddr" placeholder="添加联系人地址 (0x...)">',
    '                <input type="text" id="contactAddr" placeholder="添加联系人地址 (0x...)" data-i18n-ph="contactPh">')
rep("E4 添加按钮", '                <button class="btn-sm" onclick="addContact()">➕ 添加</button>',
    '                <button class="btn-sm" onclick="addContact()" data-i18n="addContact">➕ 添加</button>')
rep("E5 联系人标题", '                    <h3>联系人</h3>',
    '                    <h3 data-i18n="contacts">联系人</h3>')
rep("E6 安全标题", '            <h2>🛡 安全模型</h2>',
    '            <h2 data-i18n="secTitle">🛡 安全模型</h2>')
rep("E7 多链标题", '            <h2>🌐 多链钱包</h2>',
    '            <h2 data-i18n="multiTitle">🌐 多链钱包</h2>')
rep("E8 EVM 标题", '            <h3>✍️ EVM 转账 / 合约调用</h3>',
    '            <h3 data-i18n="evmTitle">✍️ EVM 转账 / 合约调用</h3>')
rep("E9 WC 标题", '            <h3>📱 WalletConnect v2（演示）</h3>',
    '            <h3 data-i18n="wcTitle">📱 WalletConnect v2（演示）</h3>')
rep("E10 资产标题", '            <h2>📦 资产与收益</h2>',
    '            <h2 data-i18n="assetsTitle">📦 资产与收益</h2>')
rep("E11 收益标题", '            <h3>📈 收益统计</h3>',
    '            <h3 data-i18n="earningsTitle">📈 收益统计</h3>')
rep("E12 激励标题", '            <h3>🌱 早期激励进度</h3>',
    '            <h3 data-i18n="earlyTitle">🌱 早期激励进度</h3>')
# ================= F. JS 改造 =================
rep("F1 fetchBalance 离线缓存", '''    async function fetchBalance() {
        const a = currentAccount();
        if (!a) return;
        const d = await api('/api/balance/' + a.addr);
        document.getElementById('myBalance').textContent = d.balance ?? '?';
    }''',
'''    async function fetchBalance() {
        const a = currentAccount();
        if (!a) return;
        // 34 · 离线模式：无网络时展示本地缓存余额与地址
        if (isOffline()) { showCachedBalance(a.addr); updateNetBadge(); return; }
        let d = null;
        try { d = await api('/api/balance/' + a.addr); } catch (e) { d = null; }
        const el = document.getElementById('myBalance');
        const tag = document.getElementById('balCacheTag');
        if (d && !d.error && typeof d.balance === 'number' && !d.demoMode) {
            el.textContent = d.balance;
            if (tag) tag.style.display = 'none';
            writeBalanceCache(a.addr, d.balance);
        } else {
            const cached = showCachedBalance(a.addr);
            if (cached == null && d) el.textContent = (d.balance != null) ? d.balance : '?';
        }
        updateNetBadge();
    }''')

rep("F2 friendlyTxError 扩充", '''    function friendlyTxError(err) {
        const map = {
            '交易校验失败': '交易校验失败：请检查金额、时间戳与余额，节点拒绝接收',
            '请求过于频繁': '请求过于频繁，请稍后再试',
            '请求体不是合法 JSON': '请求格式错误，请重试',
            '交易不存在或尚未上链': '该交易尚未上链'
        };
        if (map[err]) return map[err];
        if (err && err !== 'demo') return String(err);
        return '未知错误';
    }''',
'''    function friendlyTxError(err) {
        // 33 · 错误信息友好化
        if (!err || err === 'demo') return t('errUnknown');
        const msg = String((err && err.message) || err || '');
        if (err && err.name === 'AbortError') return t('errTimeout');
        if (/failed to fetch|networkerror|fetch failed|load failed|err_connection/i.test(msg)) return t('errNetwork');
        const map = {
            '交易校验失败': t('errTxInvalid'),
            '请求过于频繁': t('errRateLimit'),
            '请求体不是合法 JSON': t('errBadJson'),
            '交易不存在或尚未上链': t('errNotOnChain'),
            'HTTP 500': t('errServer'),
            'HTTP 404': t('errNotFound')
        };
        if (map[err]) return map[err];
        if (msg && msg !== 'demo') return msg;
        return t('errUnknown');
    }''')

rep("F3 openModal 无障碍", '''    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = false;
        el.style.display = 'flex';
    }''',
'''    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        // 38 · 无障碍：模态框语义
        if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.hidden = false;
        el.style.display = 'flex';
    }''')

rep("F4 setRuntimeMode 国际化", '''    function setRuntimeMode(mode, message) {
        const banner = document.getElementById('runtimeModeBanner');
        if (banner) {
            banner.className = 'mode-banner ' + mode;
            banner.innerHTML = '<strong>' + (mode === 'node' ? '节点模式' : '演示模式') + '</strong> · ' + message;
        }
    }''',
'''    function setRuntimeMode(mode, message) {
        const banner = document.getElementById('runtimeModeBanner');
        if (banner) {
            banner.className = 'mode-banner ' + mode;
            banner.innerHTML = '<strong>' + t(mode === 'node' ? 'modeNode' : 'modeDemo') + '</strong> · ' + message;
        }
    }''')

rep("F5 checkNode 离线+国际化", '''    async function checkNode() {
        const d = await api('/api/status');
        nodeMode = !d.error && !d.demoMode;
        const statusEl = document.getElementById('nodeStatus');
        if (d.error) {
            statusEl.textContent = '连接失败：请先启动节点，例如 python nova_node.py --p2p 9000 --rpc 8080';
            setRuntimeMode('demo', '连接失败，当前以演示模式展示。');
            return;
        }
        if (d.demoMode) {
            statusEl.textContent = '演示模式：未连接真实节点，聊天走浏览器本地模拟中继。';
            setRuntimeMode('demo', '未检测到节点，已自动切换为演示体验。');
            return;
        }
        statusEl.textContent = '✅ 在线: ' + (d.node || '') + ' | 节点数: ' + (d.peers || 0) + ' | 签名: ' + (d.algorithm || 'Ed25519');
        setRuntimeMode('node', '已检测到可用节点，正在使用真实 RPC。');
    }''',
'''    async function checkNode() {
        // 34 · 离线模式：断网时直接展示本地缓存
        if (isOffline()) {
            nodeMode = false;
            const statusEl = document.getElementById('nodeStatus');
            if (statusEl) statusEl.textContent = t('offlineNodeMsg');
            setRuntimeMode('demo', t('offlineDemoMsg'));
            updateNetBadge();
            return;
        }
        const d = await api('/api/status');
        nodeMode = !d.error && !d.demoMode;
        const statusEl = document.getElementById('nodeStatus');
        if (d.error) {
            statusEl.textContent = t('errNodeConnect');
            setRuntimeMode('demo', t('demoMsg1'));
            return;
        }
        if (d.demoMode) {
            statusEl.textContent = t('demoMsg2');
            setRuntimeMode('demo', t('demoMsg3'));
            return;
        }
        statusEl.textContent = '✅ ' + t('online') + ': ' + (d.node || '') + ' | ' + t('nodesLabel') + ': ' + (d.peers || 0) + ' | ' + t('sigLabel') + ': ' + (d.algorithm || 'Ed25519');
        setRuntimeMode('node', t('nodeMsg'));
    }''')

rep("F6 updateUI 锁状态1", "            if (lockEl) lockEl.textContent = '🔒 已锁定';",
    "            if (lockEl) lockEl.textContent = t('lockStatusLocked');")
rep("F7 updateUI 锁状态2", "        if (lockEl) lockEl.textContent = session.unlocked ? '🔓 已解锁（密钥仅在内存中）' : '🔒 已锁定（签名需密码）';",
    "        if (lockEl) lockEl.textContent = session.unlocked ? t('lockUnlocked') : t('lockLocked');")
rep("F8 自动锁定提示", "                toast('⏱ 5 分钟无操作，钱包已自动锁定');",
    "                toast(t('autoLockMsg'));")

rep("F9 bindNav 无障碍键盘", '''    function bindNav() {
        const tabs = document.querySelectorAll('.nav-tab');
        const ind = document.querySelector('.nav-indicator');
        function move(tab) {
            ind.style.width = tab.offsetWidth + 'px';
            ind.style.left = tab.offsetLeft + 'px';
        }
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
                move(tab);
            });
        });
        const active = document.querySelector('.nav-tab.active');
        if (active) setTimeout(() => move(active), 60);
    }''',
'''    function bindNav() {
        const tabs = document.querySelectorAll('.nav-tab');
        const ind = document.querySelector('.nav-indicator');
        const nav = document.getElementById('navTabs');
        function activate(tab, focus) {
            tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
            move(tab);
            if (focus) tab.focus();
        }
        function move(tab) {
            ind.style.width = tab.offsetWidth + 'px';
            ind.style.left = tab.offsetLeft + 'px';
        }
        tabs.forEach(tab => {
            tab.addEventListener('click', () => activate(tab, false));
            tab.addEventListener('keydown', (e) => {
                const idx = Array.prototype.indexOf.call(tabs, tab);
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); activate(tabs[(idx + 1) % tabs.length], true); }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); activate(tabs[(idx - 1 + tabs.length) % tabs.length], true); }
            });
        });
        const active = document.querySelector('.nav-tab.active');
        if (active) { active.setAttribute('aria-selected', 'true'); setTimeout(() => move(active), 60); }
        if (nav) nav.setAttribute('aria-label', t('netAria'));
    }''')

rep("F10 init 挂载阶段六", '''    async function init() {
        bindNav();
        bindReveal();
        checkDomainTrust();
        bindDevice();
        await checkNode();
        maybeOfferMigration();
        await updateUI();
        if (getVault() && vaultAccounts().length) {
            setInterval(pollInbox, 5000);
            setInterval(renderTxHistory, 20000);
            if (currentPriv()) { await refreshChat(); pollInbox(); }
        }
        document.getElementById('rpcUrl').addEventListener('change', () => { checkNode(); refreshChat(); });
        bindAutoLock();
    }''',
'''    async function init() {
        applyTheme();
        applyLang();
        bindNav();
        bindReveal();
        bindNetEvents();
        checkDomainTrust();
        bindDevice();
        await checkNode();
        maybeOfferMigration();
        await updateUI();
        maybeOnboarding();
        applyLang();
        if (getVault() && vaultAccounts().length) {
            setInterval(pollInbox, 5000);
            setInterval(renderTxHistory, 20000);
            if (currentPriv()) { await refreshChat(); pollInbox(); }
        }
        document.getElementById('rpcUrl').addEventListener('change', () => { checkNode(); refreshChat(); });
        bindAutoLock();
    }''')
rep("F11 阶段六功能块", "    document.addEventListener('DOMContentLoaded', init);",
'''    // ============================================================
    // 阶段六 · 用户体验（32–38）：引导 / 错误友好化 / 离线 / 主题 / 国际化 / 无障碍
    // ============================================================
    const I18N = {
        zh: {
            logo: 'NOVA 钱包', tagline: '量子安全签名钱包 · 端到端加密聊天',
            chipLocal: '🔐 私钥本地生成', chipEcdh: '🗝 X25519 ECDH', chipAes: '🔒 AES-256-GCM', chipNodeOnly: '💬 节点只见密文',
            navWallet: '🔐 钱包', navChat: '💬 加密聊天', navSecurity: '🛡 安全', navMulti: '🌐 多链', navAssets: '📦 资产',
            walletTitle: '🔐 Web3 钱包',
            secWarning: '🔒 私钥已用 AES-256 加密保存在浏览器本地，签名前需输入密码；请务必离线抄写并妥善保存助记词',
            rpcPh: '节点RPC地址', connect: '连接',
            walletStatus: '钱包状态', newAccount: '➕ 新建账户', lockBtn: '🔒 锁定',
            accountsLabel: '账户（多账户：一键切换多个地址）', importPh: '粘贴 12 个助记词 或 64 位私钥 导入', importBtn: '📥 导入',
            exportMnemonic: '📤 导出助记词', bioEnable: '🔓 启用生物识别',
            myAddressLbl: '我的地址', sigTag: '签名算法 Ed25519 / Dilithium5', balanceLbl: '余额',
            transferTitle: '💸 转账', toPh: '接收方地址', amountPh: '金额 (NOVA)', memoPh: '备注（可选）', signSend: '✍️ 签名并发送',
            txHistoryTitle: '📜 交易历史', txHistoryNote: '本地记录 + 链上查询：连接节点后自动同步确认状态（待确认 / 已确认 / 失败）。',
            refresh: '🔄 刷新', clearLocal: '🗑 清空本地记录',
            chatTitle: '💬 端到端加密聊天', chatHint: '🔒 每条消息使用 <strong>X25519 ECDH + HKDF-SHA256 + AES-256-GCM</strong> 加密，节点只转发密文。',
            contactPh: '添加联系人地址 (0x...)', addContact: '➕ 添加', contacts: '联系人',
            secTitle: '🛡 安全模型', multiTitle: '🌐 多链钱包', evmTitle: '✍️ EVM 转账 / 合约调用', wcTitle: '📱 WalletConnect v2（演示）',
            assetsTitle: '📦 资产与收益', earningsTitle: '📈 收益统计', earlyTitle: '🌱 早期激励进度',
            lockUnlocked: '🔓 已解锁（密钥仅在内存中）', lockLocked: '🔒 已锁定（签名需密码）', lockStatusLocked: '🔒 已锁定',
            modeNode: '节点模式', modeDemo: '演示模式',
            errNodeConnect: '连接失败：请先启动节点，例如 python nova_node.py --p2p 9000 --rpc 8080',
            demoMsg1: '连接失败，当前以演示模式展示。', demoMsg2: '演示模式：未连接真实节点，聊天走浏览器本地模拟中继。',
            demoMsg3: '未检测到节点，已自动切换为演示体验。', online: '在线', nodeMsg: '已检测到可用节点，正在使用真实 RPC。',
            nodesLabel: '节点数', sigLabel: '签名',
            autoLockMsg: '⏱ 5 分钟无操作，钱包已自动锁定', copiedChecking: '已复制，校验剪贴板中…',
            offline: '离线', offlineNotice: '📡 网络已断开，可查看本地缓存余额与地址', onlineNotice: '📶 网络已恢复',
            cacheTag: '· 离线缓存 ', offlineNodeMsg: '📡 当前离线，展示本地缓存数据', offlineDemoMsg: '当前离线，可查看本地数据，联网后自动恢复。',
            account: '账户',
            obSkip: '跳过', obPrev: '上一步', obNext: '下一步', obStart: '开始使用',
            ob1Title: '👋 欢迎使用 Nova 钱包',
            ob1a: '私钥完全由你掌控：助记词在本地生成，加密后只保存在这台设备',
            ob1b: '支持 Nova 主链与 ETH/BSC/Polygon 多链资产，一个钱包管理多账户',
            ob1c: '端到端加密聊天：节点只能转发密文，无法读取内容',
            ob2Title: '🛡 安全须知（请务必阅读）',
            ob2a: '助记词请离线抄写，不要截图、不要发给任何人；谁拿到助记词，谁就拥有你的资产',
            ob2b: '设置一个强密码，每次签名前都会要求验证',
            ob2c: '警惕钓鱼网站：请始终通过官方域名访问本钱包',
            ob3Title: '🚀 准备就绪', ob3a: '现在创建你的第一个账户：生成助记词 → 抄写验证 → 设置密码。',
            langTitle: '切换语言 / 中英文', langToast: '语言已切换',
            themeTitle: '主题', themeAuto: '自动', themeLight: '亮色', themeDark: '暗色', themeToast: '主题已切换：',
            errUnknown: '未知错误，请重试', errNetwork: '网络连接失败，请检查网络后重试', errTimeout: '请求超时，请重试',
            errTxInvalid: '交易校验失败：请检查金额、时间戳与余额，节点拒绝接收',
            errRateLimit: '请求过于频繁，请稍后再试', errBadJson: '请求格式错误，请重试',
            errNotOnChain: '该交易尚未上链', errServer: '节点服务异常，请稍后重试', errNotFound: '资源不存在，请检查后重试',
            netAria: '主导航'
        },
        en: {
            logo: 'NOVA Wallet', tagline: 'Quantum-safe wallet · E2E encrypted chat',
            chipLocal: '🔐 Local keys', chipEcdh: '🗝 X25519 ECDH', chipAes: '🔒 AES-256-GCM', chipNodeOnly: '💬 Ciphertext only',
            navWallet: '🔐 Wallet', navChat: '💬 Chat', navSecurity: '🛡 Security', navMulti: '🌐 Multi-chain', navAssets: '📦 Assets',
            walletTitle: '🔐 Web3 Wallet',
            secWarning: '🔒 Your private key is encrypted with AES-256 and stored locally; enter your password to sign. Back up your mnemonic offline.',
            rpcPh: 'Node RPC URL', connect: 'Connect',
            walletStatus: 'Wallet status', newAccount: '➕ New account', lockBtn: '🔒 Lock',
            accountsLabel: 'Accounts (multi-account quick switch)', importPh: 'Paste 12 mnemonic words or 64-char key', importBtn: '📥 Import',
            exportMnemonic: '📤 Export mnemonic', bioEnable: '🔓 Enable biometrics',
            myAddressLbl: 'My address', sigTag: 'Sig: Ed25519 / Dilithium5', balanceLbl: 'Balance',
            transferTitle: '💸 Transfer', toPh: 'Recipient address', amountPh: 'Amount (NOVA)', memoPh: 'Memo (optional)', signSend: '✍️ Sign & send',
            txHistoryTitle: '📜 Transaction history', txHistoryNote: 'Local records + on-chain lookup: confirmation status syncs automatically when connected.',
            refresh: '🔄 Refresh', clearLocal: '🗑 Clear local records',
            chatTitle: '💬 E2E encrypted chat', chatHint: '🔒 Each message is encrypted with <strong>X25519 ECDH + HKDF-SHA256 + AES-256-GCM</strong>; the node only relays ciphertext.',
            contactPh: 'Add contact address (0x...)', addContact: '➕ Add', contacts: 'Contacts',
            secTitle: '🛡 Security model', multiTitle: '🌐 Multi-chain wallet', evmTitle: '✍️ EVM transfer / contract call', wcTitle: '📱 WalletConnect v2 (demo)',
            assetsTitle: '📦 Assets & earnings', earningsTitle: '📈 Earnings', earlyTitle: '🌱 Early incentive progress',
            lockUnlocked: '🔓 Unlocked (keys in memory only)', lockLocked: '🔒 Locked (password required to sign)', lockStatusLocked: '🔒 Locked',
            modeNode: 'Node mode', modeDemo: 'Demo mode',
            errNodeConnect: 'Connection failed: start the node first, e.g. python nova_node.py --p2p 9000 --rpc 8080',
            demoMsg1: 'Connection failed; running in demo mode.', demoMsg2: 'Demo mode: no real node, chat uses local simulated relay.',
            demoMsg3: 'No node detected; switched to demo experience automatically.', online: 'Online', nodeMsg: 'Node available; using real RPC.',
            nodesLabel: 'Nodes', sigLabel: 'Signature',
            autoLockMsg: '⏱ Locked after 5 minutes of inactivity', copiedChecking: 'Copied, verifying clipboard…',
            offline: 'Offline', offlineNotice: '📡 Network offline; cached balance & address available', onlineNotice: '📶 Network restored',
            cacheTag: '· cached ', offlineNodeMsg: '📡 Offline — showing locally cached data', offlineDemoMsg: 'Offline; local data available, auto-restores when online.',
            account: 'Account',
            obSkip: 'Skip', obPrev: 'Back', obNext: 'Next', obStart: 'Get started',
            ob1Title: '👋 Welcome to Nova Wallet',
            ob1a: 'Keys are yours alone: the mnemonic is generated locally and stored encrypted on this device',
            ob1b: 'Supports Nova mainnet plus ETH/BSC/Polygon assets; manage multiple accounts in one wallet',
            ob1c: 'End-to-end encrypted chat: the node only relays ciphertext',
            ob2Title: '🛡 Security notes (please read)',
            ob2a: 'Write down your mnemonic offline. Never screenshot or share it — whoever holds it owns your assets',
            ob2b: 'Set a strong password; it is required before every signature',
            ob2c: 'Beware of phishing: always access this wallet from the official domain',
            ob3Title: '🚀 Ready', ob3a: 'Create your first account: generate mnemonic → verify → set password.',
            langTitle: 'Switch language', langToast: 'Language switched',
            themeTitle: 'Theme', themeAuto: 'Auto', themeLight: 'Light', themeDark: 'Dark', themeToast: 'Theme: ',
            errUnknown: 'Unknown error, please retry', errNetwork: 'Network error, check your connection', errTimeout: 'Request timed out, please retry',
            errTxInvalid: 'Transaction validation failed: check amount, timestamp and balance',
            errRateLimit: 'Too many requests, try again later', errBadJson: 'Malformed request, please retry',
            errNotOnChain: 'Transaction not on chain yet', errServer: 'Node server error, try again later', errNotFound: 'Not found, please check and retry',
            netAria: 'Main navigation'
        }
    };
    let uiLang = 'zh';
    function t(key) {
        const d = I18N[uiLang] || I18N.zh;
        return d[key] != null ? d[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
    }
    function detectLang() {
        const saved = localStorage.getItem('nova_lang');
        if (saved === 'zh' || saved === 'en') return saved;
        return /^en/i.test(navigator.language || '') ? 'en' : 'zh';
    }
    function applyLang() {
        uiLang = detectLang();
        document.documentElement.lang = uiLang === 'en' ? 'en' : 'zh';
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
        const lb = document.getElementById('langBtn');
        if (lb) { lb.textContent = uiLang === 'en' ? '🌐 中文' : '🌐 EN'; lb.title = t('langTitle'); }
        const nav = document.getElementById('navTabs');
        if (nav) nav.setAttribute('aria-label', t('netAria'));
        updateThemeBtn();
    }
    function setLang(l) {
        if (l !== 'zh' && l !== 'en') return;
        localStorage.setItem('nova_lang', l);
        applyLang();
        updateUI();
        checkNode();
    }
    function toggleLang() { setLang(uiLang === 'zh' ? 'en' : 'zh'); toast(t('langToast')); }
    function detectTheme() {
        const s = localStorage.getItem('nova_theme') || 'auto';
        if (s === 'light' || s === 'dark') return s;
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    function applyTheme() {
        const th = detectTheme();
        document.documentElement.setAttribute('data-theme', th);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', th === 'light' ? '#eef2fb' : '#030309');
        updateThemeBtn();
    }
    function updateThemeBtn() {
        const btn = document.getElementById('themeBtn');
        if (!btn) return;
        const mode = localStorage.getItem('nova_theme') || 'auto';
        const th = detectTheme();
        btn.textContent = mode === 'auto' ? (th === 'light' ? '☀️' : '🌓') : (mode === 'light' ? '☀️' : '🌙');
        btn.title = t(mode === 'auto' ? 'themeAuto' : mode === 'light' ? 'themeLight' : 'themeDark') + ' · ' + t('themeTitle');
    }
    function cycleTheme() {
        const cur = localStorage.getItem('nova_theme') || 'auto';
        const next = cur === 'auto' ? 'light' : (cur === 'light' ? 'dark' : 'auto');
        localStorage.setItem('nova_theme', next);
        applyTheme();
        toast(t('themeToast') + t(next === 'auto' ? 'themeAuto' : next === 'light' ? 'themeLight' : 'themeDark'));
    }
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const onScheme = function () { if ((localStorage.getItem('nova_theme') || 'auto') === 'auto') applyTheme(); };
        if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
    }
    // 32 · 首次使用引导（3 步）
    let onboardStep = 1;
    function maybeOnboarding() {
        if (getVault()) { localStorage.setItem('nova_onboarded', '1'); return; }
        if (localStorage.getItem('nova_onboarded') === '1') return;
        showOnboarding();
    }
    function showOnboarding() {
        const mask = document.getElementById('onboardMask');
        if (mask) { mask.classList.add('show'); renderOnboardStep(1); }
    }
    function renderOnboardStep(n) {
        onboardStep = Math.max(1, Math.min(3, n));
        document.querySelectorAll('#onboardMask .onboard-step').forEach(el => {
            el.style.display = (parseInt(el.dataset.step, 10) === onboardStep) ? 'block' : 'none';
        });
        document.querySelectorAll('#onboardMask .ob-dot').forEach(el => {
            el.classList.toggle('on', parseInt(el.dataset.step, 10) === onboardStep);
        });
        const prev = document.getElementById('obPrev'), next = document.getElementById('obNext'), start = document.getElementById('obStart');
        if (prev) prev.style.display = onboardStep === 1 ? 'none' : 'inline-block';
        if (next) next.style.display = onboardStep === 3 ? 'none' : 'inline-block';
        if (start) start.style.display = onboardStep === 3 ? 'inline-block' : 'none';
    }
    function onboardNext() { renderOnboardStep(onboardStep + 1); }
    function onboardPrev() { renderOnboardStep(onboardStep - 1); }
    function closeOnboarding() {
        const mask = document.getElementById('onboardMask');
        if (mask) mask.classList.remove('show');
        localStorage.setItem('nova_onboarded', '1');
    }
    // 34 · 离线模式：余额本地缓存
    let netOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    function isOffline() { return window.__forceOffline === true || navigator.onLine === false; }
    function readBalanceCache(addr) {
        try { const c = JSON.parse(localStorage.getItem('nova_balance_cache') || '{}'); return c[addr] || null; } catch (e) { return null; }
    }
    function writeBalanceCache(addr, balance) {
        try {
            const c = JSON.parse(localStorage.getItem('nova_balance_cache') || '{}');
            c[addr] = { balance, ts: Date.now() };
            localStorage.setItem('nova_balance_cache', JSON.stringify(c));
        } catch (e) { /* 缓存失败不影响主流程 */ }
    }
    function showCachedBalance(addr) {
        const c = readBalanceCache(addr);
        const el = document.getElementById('myBalance');
        const tag = document.getElementById('balCacheTag');
        if (!el) return null;
        if (tag) tag.style.display = 'none';
        if (c) {
            el.textContent = c.balance;
            if (tag) { tag.style.display = 'inline'; tag.textContent = t('cacheTag') + new Date(c.ts).toLocaleTimeString(); }
            return c.balance;
        }
        return null;
    }
    function updateNetBadge() {
        const badge = document.getElementById('netBadge');
        if (!badge) return;
        if (isOffline()) { badge.hidden = false; const txt = document.getElementById('netBadgeText'); if (txt) txt.textContent = t('offline'); }
        else badge.hidden = true;
    }
    function bindNetEvents() {
        window.addEventListener('offline', () => { netOnline = false; updateNetBadge(); toast(t('offlineNotice')); fetchBalance(); });
        window.addEventListener('online', () => { netOnline = true; updateNetBadge(); toast(t('onlineNotice')); checkNode(); fetchBalance(); });
        updateNetBadge();
    }
    document.addEventListener('DOMContentLoaded', init);''')

# ---------- 执行 ----------
failed = False
for name, old, new in steps:
    n = content.count(old)
    if n != 1:
        print("✘ %s: 锚点出现 %d 次（应为 1）" % (name, n))
        failed = True
        continue
    content = content.replace(old, new)
    print("✔ %s" % name)

if failed:
    print("❌ 存在失败步骤，未写入文件")
    sys.exit(1)

with open(PATH, "w", encoding="utf-8", newline="") as f:
    f.write(content)
print("✅ 已写入 wallet.html（阶段六）")
