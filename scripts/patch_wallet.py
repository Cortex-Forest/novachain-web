# -*- coding: utf-8 -*-
"""wallet.html 阶段一改造（1-8 项）。锚点唯一校验，失败即中止不写入。"""
import sys
PATH = r"C:\Users\Administrator\novachain-web\wallet.html"
with open(PATH, "r", encoding="utf-8", newline="") as f:
    content = f.read()
steps = []
def rep(name, old, new):
    steps.append((name, old, new))

# ---------- E1 引入加密内核 ----------
rep("E1 引入加密内核", '    <script src="./apps-common.js"></script>',
'''    <script src="./apps-common.js"></script>
    <script src="./wallet-crypto.js"></script>''')

# ---------- E2 模态框样式 ----------
rep("E2 模态框样式", "    </style>",
'''        .modal-mask { position: fixed; inset: 0; z-index: 70; background: rgba(2,3,10,.8); backdrop-filter: blur(6px); display: none; align-items: center; justify-content: center; padding: 1rem; }
        .modal-mask[hidden] { display: none; }
        .modal { width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto; background: rgba(10,14,32,.98); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 1.4rem 1.5rem; box-shadow: 0 24px 80px rgba(0,0,0,.6); }
        .modal h3 { font-family: var(--font-display); font-size: 1.02rem; margin-bottom: .6rem; }
        .modal .footnote { margin-bottom: .8rem; line-height: 1.7; }
        .modal input { width: 100%; }
        .m-actions { display: flex; gap: .6rem; margin-top: 1rem; flex-wrap: wrap; }
        .m-actions .btn-sm { margin-bottom: 0; }
        .mnemonic-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .45rem; margin: .9rem 0; }
        .mn-word { font-family: var(--font-mono); font-size: .8rem; background: rgba(255,255,255,.05); border: 1px solid var(--border); border-radius: 10px; padding: .5rem .6rem; word-break: break-all; }
        .lock-badge { display: inline-block; font-family: var(--font-mono); font-size: .72rem; padding: .4rem .75rem; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,.04); margin-right: .5rem; }
    </style>''')
# ---------- E3 钱包面板 ----------
rep("E3 钱包面板",
'''            <div class="warning reveal in" style="--d:.05s">⚠️ 私钥与聊天密钥只存在于你的浏览器本地存储，请务必离线备份私钥</div>
            <div class="row reveal in" style="--d:.1s">
                <input type="text" id="rpcUrl" placeholder="节点RPC地址" value="http://127.0.0.1:8080">
                <button class="btn-sm magnetic" onclick="checkNode()">连接</button>
            </div>
            <div id="nodeStatus" class="response reveal in" style="--d:.15s; max-height:30px; margin-bottom:1rem;"></div>

            <div class="kv reveal in" style="--d:.2s">
                <div class="label">账户（多账户：新账户互不影响，便于演示双人加密聊天）</div>
                <div class="row">
                    <select id="accountSelect"></select>
                    <button class="btn-sm" onclick="createWallet()">➕ 新建账户</button>
                </div>
                <div class="row">
                    <input type="text" id="importKey" placeholder="粘贴私钥 (64位hex) 导入为账户">
                    <button class="btn-sm" onclick="importWallet()">📥 导入</button>
                </div>
                <button class="btn-ghost btn-sm" onclick="exportKey()">📤 导出当前私钥</button>
            </div>''',
'''            <div class="warning reveal in" style="--d:.05s">🔒 私钥已用 AES-256 加密保存在浏览器本地，签名前需输入密码；请务必离线抄写并妥善保存助记词</div>
            <div class="row reveal in" style="--d:.1s">
                <input type="text" id="rpcUrl" placeholder="节点RPC地址" value="http://127.0.0.1:8080">
                <button class="btn-sm magnetic" onclick="checkNode()">连接</button>
            </div>
            <div id="nodeStatus" class="response reveal in" style="--d:.15s; max-height:30px; margin-bottom:1rem;"></div>

            <div class="kv reveal in" style="--d:.2s">
                <div class="label">钱包状态</div>
                <div class="row">
                    <span class="lock-badge" id="lockStatus">🔒 已锁定</span>
                    <button class="btn-sm" onclick="startCreateWallet()">➕ 新建账户</button>
                    <button class="btn-ghost btn-sm" onclick="lockWallet()">🔒 锁定</button>
                </div>
                <div class="label" style="margin-top:.7rem;">账户（多账户：一键切换多个地址）</div>
                <div class="row">
                    <select id="accountSelect"></select>
                </div>
                <div class="row">
                    <input type="text" id="importKey" placeholder="粘贴 12 个助记词 或 64 位私钥 导入">
                    <button class="btn-sm" onclick="importWallet()">📥 导入</button>
                </div>
                <div class="row">
                    <button class="btn-ghost btn-sm" onclick="exportSecret()">📤 导出助记词</button>
                    <button class="btn-ghost btn-sm" id="bioBtn" onclick="toggleBiometric()" style="display:none;">🔓 启用生物识别</button>
                </div>
            </div>''')
# ---------- E4 安全面板 ----------
rep("E4 安全面板-密钥条目",
'''                <div class="label">1 · 密钥只属于你</div>
                <div class="footnote">钱包私钥（Ed25519/Dilithium5 种子）在浏览器内生成，仅保存在 <code>localStorage</code>。聊天密钥由同一种子经 HKDF 派生 X25519 密钥对，任何一端私钥泄露都会影响该账户。</div>
            </div>''',
'''                <div class="label">1 · 密钥只属于你</div>
                <div class="footnote">钱包由 12 个英文助记词（BIP39）生成，私钥经 BIP44 路径（<code>m/44&apos;/223&apos;/0&apos;/0&apos;/0&apos;</code>）派生，并用 AES-256-GCM 加密后保存在 <code>localStorage</code>。密码在本地经 PBKDF2-SHA256（21 万次迭代）处理，浏览器不会上传任何密钥。聊天密钥由同一种子经 HKDF 派生 X25519 密钥对。</div>
            </div>
            <div class="kv">
                <div class="label">1a · 密码与生物识别</div>
                <div class="footnote"><span id="bioStatus">未启用生物识别</span>。启用后可用指纹/面部解锁（WebAuthn PRF，需 HTTPS 环境），密钥始终不离开本机。</div>
            </div>''')

# ---------- E5 模态框 HTML ----------
rep("E5 模态框 HTML", '    <div class="toast" id="toast"></div>',
'''    <!-- ====== 模态框：解锁 ====== -->
    <div class="modal-mask" id="modal-auth" hidden>
        <div class="modal">
            <h3 id="authTitle">解锁钱包</h3>
            <p class="footnote" id="authHint"></p>
            <input type="password" id="authPw" placeholder="输入钱包密码" autocomplete="current-password">
            <div class="response" id="authErr" style="color:var(--danger); min-height:1.2rem;"></div>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="closeModal('modal-auth')">取消</button>
                <button class="btn-sm" id="authOk" onclick="authSubmit()">确认</button>
            </div>
            <div id="authBioRow" style="margin-top:.6rem; display:none;">
                <button class="btn-ghost btn-sm" onclick="authBio()">🔓 生物识别解锁</button>
            </div>
        </div>
    </div>
    <!-- ====== 模态框：设置密码 ====== -->
    <div class="modal-mask" id="modal-password" hidden>
        <div class="modal">
            <h3>🔐 设置钱包密码</h3>
            <p class="footnote">密码用于加密保护私钥（AES-256-GCM）。请牢记；忘记密码只能通过助记词恢复。</p>
            <input type="password" id="pwNew" placeholder="设置密码（至少 8 位）" autocomplete="new-password">
            <input type="password" id="pwNew2" placeholder="再次输入密码" autocomplete="new-password" style="margin-top:.6rem;">
            <div class="response" id="pwErr" style="color:var(--danger); min-height:1.2rem;"></div>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="cancelPassword()">取消</button>
                <button class="btn-sm" onclick="confirmSetPassword()">创建加密钱包</button>
            </div>
        </div>
    </div>
    <!-- ====== 模态框：抄写助记词 ====== -->
    <div class="modal-mask" id="modal-mnemonic" hidden>
        <div class="modal">
            <h3>✍️ 抄写你的助记词</h3>
            <p class="footnote">这是恢复钱包的<strong>唯一凭证</strong>。请离线抄写，不要截图、不要发到网上、不要告诉任何人。</p>
            <div class="mnemonic-grid" id="mnemonicGrid"></div>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="copyMnemonic()">📋 复制</button>
                <button class="btn-sm" onclick="mnemonicNext()">我已抄写完毕 → 去验证</button>
            </div>
        </div>
    </div>
    <!-- ====== 模态框：验证助记词 ====== -->
    <div class="modal-mask" id="modal-verify" hidden>
        <div class="modal">
            <h3>🔎 验证助记词</h3>
            <p class="footnote">请按提示填入 3 个单词，确认抄写无误。</p>
            <div id="verifyFields"></div>
            <div class="response" id="verifyErr" style="color:var(--danger); min-height:1.2rem;"></div>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="verifyReset()">重新抽取</button>
                <button class="btn-sm" onclick="verifySubmit()">确认无误</button>
            </div>
        </div>
    </div>
    <!-- ====== 模态框：导出 ====== -->
    <div class="modal-mask" id="modal-export" hidden>
        <div class="modal">
            <h3 id="exportTitle">✍️ 助记词</h3>
            <p class="footnote" id="exportWarn"></p>
            <div class="mnemonic-grid" id="exportGrid" style="display:none;"></div>
            <div class="address-box" id="exportHex" style="display:none; word-break:break-all;"></div>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="copyExport()">📋 复制</button>
                <button class="btn-sm" onclick="closeModal('modal-export')">我已安全保存</button>
            </div>
        </div>
    </div>
    <!-- ====== 模态框：旧版迁移 ====== -->
    <div class="modal-mask" id="modal-migrate" hidden>
        <div class="modal">
            <h3>🔐 检测到旧版钱包</h3>
            <p class="footnote">检测到 <strong id="migrateCount">0</strong> 个旧版明文私钥。建议立即设置密码迁移到加密保险库，旧明文将同时清除。</p>
            <div class="m-actions">
                <button class="btn-ghost btn-sm" onclick="skipMigrate()">暂不迁移</button>
                <button class="btn-sm" onclick="startMigrate()">立即加密迁移</button>
            </div>
        </div>
    </div>
    <div class="toast" id="toast"></div>''')
# ---------- E6 加密保险库 ----------
rep("E6 加密保险库",
'''    // 账户（多账户；兼容 nova.html 的 nova_priv）
    // ============================================================
    const LS_KEYS = 'nova_keys';
    const LS_ACTIVE = 'nova_active';
    function getKeys() {
        try { const k = JSON.parse(localStorage.getItem(LS_KEYS) || '[]'); return Array.isArray(k) ? k : []; }
        catch (e) { return []; }
    }
    function setKeys(keys) { localStorage.setItem(LS_KEYS, JSON.stringify(keys)); }
    function activeIdx() {
        const keys = getKeys();
        const i = parseInt(localStorage.getItem(LS_ACTIVE) || '0', 10);
        return keys.length ? Math.min(Math.max(i, 0), keys.length - 1) : 0;
    }
    function setActiveIdx(i) { localStorage.setItem(LS_ACTIVE, String(i)); }
    function currentPriv() {
        const keys = getKeys();
        if (keys.length) return keys[activeIdx()] || '';
        return localStorage.getItem('nova_priv') || '';
    }
    function initKeys() {
        const keys = getKeys();
        if (keys.length === 0) {
            const legacy = localStorage.getItem('nova_priv');
            if (legacy && /^[0-9a-fA-F]{64}$/.test(legacy)) setKeys([legacy]);
        }
    }
    function addAccount(privHex) {
        const keys = getKeys();
        keys.push(privHex);
        setKeys(keys);
        setActiveIdx(keys.length - 1);
        localStorage.setItem('nova_priv', privHex);
    }
    function switchAccount(i) {
        const keys = getKeys();
        if (!keys[i]) return;
        setActiveIdx(i);
        localStorage.setItem('nova_priv', keys[i]);
        chatKeyCache = null;
        myAddrCache = '';
        updateUI();
        refreshChat();
    }''',
'''    // 加密保险库（AES-256-GCM + PBKDF2 密码；多账户）
    // ============================================================
    const LS_VAULT = 'nova_vault_v2';
    const LS_ACTIVE = 'nova_active';
    let session = { unlocked: false, masterKey: null, keys: {}, mnemonics: {} };
    let pendingOp = null; // 待处理账户：{ type:'create'|'import'|'migrate', mnemonic, privHex, legacyKeys }

    function getVault() {
        try {
            const v = JSON.parse(localStorage.getItem(LS_VAULT) || 'null');
            return v && v.v === NovaCrypto.VAULT_VERSION ? v : null;
        } catch (e) { return null; }
    }
    function saveVault(vault) { localStorage.setItem(LS_VAULT, JSON.stringify(vault)); }
    function vaultAccounts() { const v = getVault(); return v ? v.accounts : []; }
    function activeIdx() {
        const accounts = vaultAccounts();
        const i = parseInt(localStorage.getItem(LS_ACTIVE) || '0', 10);
        return accounts.length ? Math.min(Math.max(i, 0), accounts.length - 1) : 0;
    }
    function setActiveIdx(i) { localStorage.setItem(LS_ACTIVE, String(i)); }
    function currentAccount() {
        const accounts = vaultAccounts();
        return accounts.length ? accounts[activeIdx()] : null;
    }
    function currentPriv() {
        const a = currentAccount();
        return (a && session.unlocked && session.keys[a.id]) ? session.keys[a.id] : '';
    }
    function currentMnemonic() {
        const a = currentAccount();
        return (a && session.mnemonics[a.id]) ? session.mnemonics[a.id] : '';
    }
    function isUnlocked() { return session.unlocked && !!session.masterKey; }
    function legacyPlainKeys() {
        let list = [];
        try { const k = JSON.parse(localStorage.getItem('nova_keys') || '[]'); if (Array.isArray(k)) list = list.concat(k); } catch (e) {}
        const single = localStorage.getItem('nova_priv');
        if (single && /^[0-9a-fA-F]{64}$/.test(single)) list.push(single);
        return list.filter((v, i, a) => a.indexOf(v) === i);
    }
    function clearLegacyStorage() {
        localStorage.removeItem('nova_keys');
        localStorage.removeItem('nova_priv');
    }

    async function unlockVault(password) {
        const v = getVault();
        if (!v) return { ok: false, error: '还没有加密钱包' };
        try {
            const mk = await NovaCrypto.unwrapWithPassword(v.wrap, password);
            session.masterKey = mk; session.unlocked = true;
            session.keys = {}; session.mnemonics = {};
            for (const a of v.accounts) {
                session.keys[a.id] = await NovaCrypto.decryptWithMaster(mk, a.key);
                if (a.mnemonic) session.mnemonics[a.id] = await NovaCrypto.decryptWithMaster(mk, a.mnemonic);
            }
            chatKeyCache = null; myAddrCache = '';
            return { ok: true };
        } catch (e) { return { ok: false, error: '密码错误，请重试' }; }
    }
    async function unlockWithBiometric() {
        const v = getVault();
        if (!v || !v.webauthn) return { ok: false, error: '尚未启用生物识别' };
        try {
            const devKey = await NovaCrypto.webauthnUnlock(v.webauthn.credId, v.webauthn.prfSalt);
            const box = v.webauthn.wrap;
            const mk = await NovaCrypto.aesGcmDecrypt(devKey, NovaCrypto.base64ToBytes(box.iv), NovaCrypto.base64ToBytes(box.ct));
            session.masterKey = mk; session.unlocked = true;
            session.keys = {}; session.mnemonics = {};
            for (const a of v.accounts) {
                session.keys[a.id] = await NovaCrypto.decryptWithMaster(mk, a.key);
                if (a.mnemonic) session.mnemonics[a.id] = await NovaCrypto.decryptWithMaster(mk, a.mnemonic);
            }
            chatKeyCache = null; myAddrCache = '';
            return { ok: true };
        } catch (e) { return { ok: false, error: '生物识别失败：' + (e.message || '未通过验证') }; }
    }
    function lockWallet() {
        session = { unlocked: false, masterKey: null, keys: {}, mnemonics: {} };
        chatKeyCache = null; myAddrCache = '';
        updateUI();
        toast('🔒 钱包已锁定');
    }

    async function createVaultWithPassword(password, accounts) {
        const masterKey = NovaCrypto.randomBytes(32);
        const wrap = await NovaCrypto.wrapWithPassword(masterKey, password);
        const encAccounts = [];
        for (const a of accounts) {
            encAccounts.push({
                id: a.id, name: a.name, addr: a.addr, pub: a.pub,
                path: a.path || null, legacy: !!a.legacy,
                key: await NovaCrypto.encryptWithMaster(masterKey, a.priv),
                mnemonic: a.mnemonic ? await NovaCrypto.encryptWithMaster(masterKey, a.mnemonic) : null
            });
        }
        const vault = { v: NovaCrypto.VAULT_VERSION, kdf: { iterations: wrap.iterations }, wrap, webauthn: null, accounts: encAccounts };
        saveVault(vault);
        session.masterKey = masterKey; session.unlocked = true;
        session.keys = {}; session.mnemonics = {};
        for (const a of accounts) {
            session.keys[a.id] = a.priv;
            if (a.mnemonic) session.mnemonics[a.id] = a.mnemonic;
        }
        clearLegacyStorage();
        return vault;
    }
    async function addAccountToVault(account) {
        const v = getVault();
        if (!v || !session.masterKey) throw new Error('需要先解锁钱包');
        const entry = {
            id: account.id, name: account.name, addr: account.addr, pub: account.pub,
            path: account.path || null, legacy: !!account.legacy,
            key: await NovaCrypto.encryptWithMaster(session.masterKey, account.priv),
            mnemonic: account.mnemonic ? await NovaCrypto.encryptWithMaster(session.masterKey, account.mnemonic) : null
        };
        v.accounts.push(entry);
        saveVault(v);
        session.keys[account.id] = account.priv;
        if (account.mnemonic) session.mnemonics[account.id] = account.mnemonic;
        setActiveIdx(v.accounts.length - 1);
    }
    function genAccountId() { return 'acct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function switchAccount(i) {
        const accounts = vaultAccounts();
        if (!accounts[i]) return;
        setActiveIdx(i);
        chatKeyCache = null;
        myAddrCache = '';
        updateUI();
        refreshChat();
    }''')
# ---------- E7 renderAccountSelect + updateUI ----------
rep("E7 账户渲染与UI刷新",
'''    async function renderAccountSelect() {
        const sel = document.getElementById('accountSelect');
        const keys = getKeys();
        sel.innerHTML = '';
        for (let i = 0; i < keys.length; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            let label = '账户 ' + (i + 1);
            try {
                label += ' · ' + (await getAddrFromPriv(keys[i])).slice(0, 12) + '…';
            } catch (e) { /* 忽略 */ }
            opt.textContent = label;
            sel.appendChild(opt);
        }
        sel.value = String(activeIdx());
        sel.onchange = () => switchAccount(parseInt(sel.value, 10));
    }

    async function updateUI() {
        const priv = currentPriv();
        const addrEl = document.getElementById('myAddress');
        if (!priv) {
            addrEl.textContent = '—';
            document.getElementById('myBalance').textContent = '0';
            myAddrCache = '';
            return;
        }
        const addr = await getAddrFromPriv(priv);
        myAddrCache = addr;
        addrEl.textContent = addr;
        await renderAccountSelect();
        fetchBalance();
    }''',
'''    async function renderAccountSelect() {
        const sel = document.getElementById('accountSelect');
        const accounts = vaultAccounts();
        sel.innerHTML = '';
        for (let i = 0; i < accounts.length; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = (accounts[i].name || ('账户 ' + (i + 1))) + ' · ' + accounts[i].addr.slice(0, 12) + '…';
            sel.appendChild(opt);
        }
        sel.value = String(activeIdx());
        sel.onchange = () => switchAccount(parseInt(sel.value, 10));
    }

    async function updateUI() {
        const a = currentAccount();
        const addrEl = document.getElementById('myAddress');
        const lockEl = document.getElementById('lockStatus');
        if (!a) {
            addrEl.textContent = '—';
            document.getElementById('myBalance').textContent = '0';
            myAddrCache = '';
            if (lockEl) lockEl.textContent = '🔒 已锁定';
            updateBioButton();
            return;
        }
        myAddrCache = a.addr;
        addrEl.textContent = a.addr;
        if (lockEl) lockEl.textContent = session.unlocked ? '🔓 已解锁（密钥仅在内存中）' : '🔒 已锁定（签名需密码）';
        await renderAccountSelect();
        fetchBalance();
        updateBioButton();
        updateChatStatus();
    }''')

# ---------- E8 新建/导入/导出/余额 ----------
rep("E8 新建导入导出",
'''    async function createWallet() {
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto（需要 HTTPS 或 localhost）');
        const priv = bytesToHex(randomBytes(32));
        addAccount(priv);
        await updateUI();
        await registerPubkey();
        toast('✨ 新账户已创建，请导出私钥离线备份');
        refreshChat();
    }

    async function importWallet() {
        const raw = document.getElementById('importKey').value.trim().replace(/^0x/, '');
        if (!raw) return alert('请输入私钥');
        if (!/^[0-9a-fA-F]{64}$/.test(raw)) return alert('无效私钥（应为 64 位十六进制）');
        const keys = getKeys();
        if (keys.some(k => k.toLowerCase() === raw.toLowerCase())) {
            const i = keys.findIndex(k => k.toLowerCase() === raw.toLowerCase());
            switchAccount(i);
            return toast('该私钥已在账户 ' + (i + 1) + ' 中，已切换');
        }
        addAccount(raw.toLowerCase());
        await updateUI();
        await registerPubkey();
        toast('📥 导入成功');
        refreshChat();
    }

    function exportKey() {
        const priv = currentPriv();
        if (!priv) return alert('没有钱包账户');
        prompt('复制私钥（绝不要分享！）', priv);
    }

    async function fetchBalance() {
        const priv = currentPriv();
        if (!priv) return;
        const d = await api('/api/balance/' + await getAddrFromPriv(priv));
        document.getElementById('myBalance').textContent = d.balance ?? '?';
    }''',
'''    async function startCreateWallet() {
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto（需要 HTTPS 或 localhost）');
        if (getVault()) {
            const ok = await requireSessionUnlock('创建新账户');
            if (!ok) return;
        }
        const mnemonic = await NovaCrypto.generateMnemonic(128);
        pendingOp = { type: 'create', mnemonic: mnemonic };
        showMnemonicModal(mnemonic);
    }

    async function importWallet() {
        const raw = document.getElementById('importKey').value.trim();
        if (!raw) return alert('请输入助记词或私钥');
        const mneWords = raw.trim().toLowerCase().split(/\s+/);
        const isMne = /^[a-z ]+$/.test(raw) && [12, 15, 18, 21, 24].indexOf(mneWords.length) >= 0;
        const hexClean = raw.replace(/^0x/, '');
        let op = null;
        if (isMne) {
            const words = mneWords.join(' ');
            if (!(await NovaCrypto.validateMnemonic(words))) return alert('助记词无效（校验和错误）');
            op = { type: 'import', mnemonic: words };
        } else if (/^[0-9a-fA-F]{64}$/.test(hexClean)) {
            op = { type: 'import', privHex: hexClean.toLowerCase(), legacy: true };
        } else {
            return alert('请输入 12 个英文助记词，或 64 位十六进制私钥');
        }
        if (!getVault()) { pendingOp = op; openPasswordModal(); return; }
        const ok = await requireSessionUnlock('导入账户');
        if (!ok) return;
        await commitAccount(op);
        document.getElementById('importKey').value = '';
    }

    async function commitAccount(op) {
        const accounts = vaultAccounts();
        const priv = op.privHex || await NovaCrypto.deriveNovaKey(op.mnemonic);
        const addr = await getAddrFromPriv(priv);
        const dup = accounts.find(a => a.addr === addr);
        if (dup) { switchAccount(accounts.indexOf(dup)); toast('该账户已存在，已切换'); return; }
        const account = (await buildAccountFromOp(op))[0];
        account.name = '账户 ' + (accounts.length + 1);
        await addAccountToVault(account);
        await updateUI();
        await registerPubkey();
        refreshChat();
        toast(account.mnemonic ? '✨ 新账户已创建，请导出助记词离线备份' : '📥 导入成功');
    }

    async function buildAccountFromOp(op) {
        if (op.type === 'migrate') {
            const out = [];
            for (let i = 0; i < op.legacyKeys.length; i++) {
                const priv = op.legacyKeys[i].toLowerCase();
                const pub = await getPubFromPriv(priv);
                const addr = await getAddrFromPriv(priv);
                out.push({ id: genAccountId(), name: '账户 ' + (i + 1) + '（旧版）', addr, pub, priv, mnemonic: null, path: null, legacy: true });
            }
            return out;
        }
        const priv = op.privHex || await NovaCrypto.deriveNovaKey(op.mnemonic);
        const pub = await getPubFromPriv(priv);
        const addr = await getAddrFromPriv(priv);
        return [{
            id: genAccountId(), name: '账户 1',
            addr, pub, priv,
            mnemonic: op.mnemonic || null,
            path: op.mnemonic ? NovaCrypto.NOVA_DERIVATION_PATH : null,
            legacy: !!op.legacy
        }];
    }

    async function confirmSetPassword() {
        const p1 = document.getElementById('pwNew').value;
        const p2 = document.getElementById('pwNew2').value;
        const errEl = document.getElementById('pwErr');
        if (p1.length < 8) { errEl.textContent = '密码至少 8 位'; return; }
        if (p1 !== p2) { errEl.textContent = '两次输入的密码不一致'; return; }
        if (!pendingOp) { closeModal('modal-password'); return; }
        try {
            const accounts = await buildAccountFromOp(pendingOp);
            await createVaultWithPassword(p1, accounts);
            pendingOp = null;
            closeModal('modal-password');
            document.getElementById('pwNew').value = '';
            document.getElementById('pwNew2').value = '';
            await updateUI();
            await registerPubkey();
            refreshChat();
            toast('🔐 加密钱包已创建，私钥已加密保存');
        } catch (e) {
            errEl.textContent = '创建失败：' + (e.message || '未知错误');
        }
    }
    function cancelPassword() {
        pendingOp = null;
        closeModal('modal-password');
    }

    async function exportSecret() {
        const a = currentAccount();
        if (!a) return alert('没有钱包账户');
        const r = await requestUnlock('导出助记词', '导出敏感信息前需输入密码确认');
        if (!r.ok) return;
        const mne = currentMnemonic();
        const priv = currentPriv();
        if (mne) showExportModal(mne);
        else if (priv) showExportModal(null, priv);
        else alert('无法获取密钥，请重试');
    }

    async function fetchBalance() {
        const a = currentAccount();
        if (!a) return;
        const d = await api('/api/balance/' + a.addr);
        document.getElementById('myBalance').textContent = d.balance ?? '?';
    }''')
# ---------- E9 sendTx 密码门槛 ----------
rep("E9 签名密码门槛",
'''    async function sendTx() {
        const priv = currentPriv();
        if (!priv) return alert('请先创建或选择账户');
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto，无法签名');
        const sender = await getAddrFromPriv(priv);''',
'''    async function sendTx() {
        if (!getVault() || !currentAccount()) return alert('请先创建或选择账户');
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto，无法签名');
        // 每次签名前必须输入密码（或生物识别）确认
        const auth = await requestUnlock('确认签名', '签名前需输入密码确认，将使用当前账户发起交易');
        if (!auth.ok) return;
        const priv = currentPriv();
        if (!priv) return alert('解锁失败，请重试');
        const sender = await getAddrFromPriv(priv);''')

# ---------- E10 聊天状态 ----------
rep("E10 聊天锁定状态",
'''        const priv = currentPriv();
        if (!priv) {
            el.textContent = '无账户';
            el.classList.add('off');
            return;
        }''',
'''        const priv = currentPriv();
        if (!priv) {
            el.textContent = getVault() && vaultAccounts().length ? '🔒 已锁定，解锁后发布聊天密钥' : '无账户';
            el.classList.add('off');
            return;
        }''')

# ---------- E11 sendChat 会话解锁 ----------
rep("E11 聊天发送解锁",
'''    async function sendChat() {
        const priv = currentPriv();
        if (!priv) return toast('请先在钱包面板创建/选择账户');''',
'''    async function sendChat() {
        const priv = await requireSessionUnlock('发送加密消息');
        if (!priv) return toast('请先解锁钱包并选择账户');''')

# ---------- E12 init ----------
rep("E12 初始化",
'''    async function init() {
        initKeys();
        bindNav();
        bindReveal();
        await checkNode();
        await updateUI();
        if (currentPriv()) {
            await refreshChat();
            setInterval(pollInbox, 5000);
            pollInbox();
        }
        document.getElementById('rpcUrl').addEventListener('change', () => { checkNode(); refreshChat(); });
    }''',
'''    async function init() {
        bindNav();
        bindReveal();
        await checkNode();
        maybeOfferMigration();
        await updateUI();
        if (getVault() && vaultAccounts().length) {
            setInterval(pollInbox, 5000);
            if (currentPriv()) { await refreshChat(); pollInbox(); }
        }
        document.getElementById('rpcUrl').addEventListener('change', () => { checkNode(); refreshChat(); });
        bindAutoLock();
    }''')
# ---------- E13 解锁/模态框/生物识别/迁移/自动锁定 ----------
rep("E13 解锁与模态框逻辑",
'''    // ============================================================
    // API（节点不可用时自动进入演示模式）
    // ============================================================''',
'''    // ============================================================
    // 解锁 / 模态框（密码 + 生物识别）
    // ============================================================
    let authResolve = null;
    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = false;
        el.style.display = 'flex';
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) { el.hidden = true; el.style.display = 'none'; }
        if (id === 'modal-auth' && authResolve) {
            const r = authResolve; authResolve = null;
            r({ ok: false, cancelled: true });
        }
    }
    function requestUnlock(title, hint) {
        return new Promise(resolve => {
            authResolve = resolve;
            document.getElementById('authTitle').textContent = title;
            document.getElementById('authHint').textContent = hint || '';
            document.getElementById('authErr').textContent = '';
            document.getElementById('authPw').value = '';
            const bioRow = document.getElementById('authBioRow');
            bioRow.style.display = (getVault() && getVault().webauthn) ? '' : 'none';
            openModal('modal-auth');
            setTimeout(() => { const el = document.getElementById('authPw'); if (el) el.focus(); }, 60);
        });
    }
    async function authSubmit() {
        const pw = document.getElementById('authPw').value;
        const errEl = document.getElementById('authErr');
        if (!pw) { errEl.textContent = '请输入密码'; return; }
        const btn = document.getElementById('authOk');
        btn.disabled = true; btn.textContent = '验证中…';
        const r = await unlockVault(pw);
        btn.disabled = false; btn.textContent = '确认';
        if (!r.ok) { errEl.textContent = r.error; return; }
        const resolve = authResolve; authResolve = null;
        closeModal('modal-auth');
        resolve({ ok: true });
        updateUI();
    }
    async function authBio() {
        const errEl = document.getElementById('authErr');
        errEl.textContent = '';
        const r = await unlockWithBiometric();
        if (!r.ok) { errEl.textContent = r.error; return; }
        const resolve = authResolve; authResolve = null;
        closeModal('modal-auth');
        resolve({ ok: true });
        updateUI();
    }
    async function requireSessionUnlock(actionLabel) {
        if (isUnlocked() && currentPriv()) return currentPriv();
        const r = await requestUnlock('解锁钱包', (actionLabel || '该操作') + ' 需要先解锁钱包');
        return r.ok ? currentPriv() : '';
    }
    function openPasswordModal() {
        document.getElementById('pwErr').textContent = '';
        document.getElementById('pwNew').value = '';
        document.getElementById('pwNew2').value = '';
        openModal('modal-password');
    }

    // ---- 助记词创建流程（展示 → 抄写 → 随机 3 词验证） ----
    let verifyState = null;
    function showMnemonicModal(mnemonic) {
        const grid = document.getElementById('mnemonicGrid');
        const words = mnemonic.split(' ');
        grid.innerHTML = '';
        words.forEach((w, i) => {
            const div = document.createElement('div');
            div.className = 'mn-word';
            div.textContent = (i + 1) + '. ' + w;
            grid.appendChild(div);
        });
        openModal('modal-mnemonic');
    }
    function copyMnemonic() {
        if (!pendingOp || !pendingOp.mnemonic) return;
        copyText(pendingOp.mnemonic);
    }
    function mnemonicNext() {
        const mne = pendingOp && pendingOp.mnemonic;
        if (!mne) { closeModal('modal-mnemonic'); return; }
        closeModal('modal-mnemonic');
        startVerify(mne);
    }
    function startVerify(mnemonic) {
        const words = mnemonic.split(' ');
        const idxs = [];
        while (idxs.length < 3) {
            const r = Math.floor(Math.random() * words.length);
            if (idxs.indexOf(r) < 0) idxs.push(r);
        }
        verifyState = { words: words, idxs: idxs };
        const box = document.getElementById('verifyFields');
        box.innerHTML = '';
        idxs.forEach(k => {
            const label = document.createElement('div');
            label.className = 'footnote';
            label.style.marginTop = '.5rem';
            label.textContent = '第 ' + (k + 1) + ' 个单词';
            const input = document.createElement('input');
            input.type = 'text';
            input.autocomplete = 'off';
            input.dataset.idx = k;
            box.appendChild(label);
            box.appendChild(input);
        });
        document.getElementById('verifyErr').textContent = '';
        openModal('modal-verify');
    }
    function verifyReset() { if (verifyState) startVerify(verifyState.words.join(' ')); }
    async function verifySubmit() {
        const errEl = document.getElementById('verifyErr');
        const inputs = document.querySelectorAll('#verifyFields input');
        for (const inp of inputs) {
            const k = parseInt(inp.dataset.idx, 10);
            if (inp.value.trim().toLowerCase() !== verifyState.words[k]) {
                errEl.textContent = '第 ' + (k + 1) + ' 个单词不正确，请对照抄写记录重试';
                return;
            }
        }
        verifyState = null;
        closeModal('modal-verify');
        if (!getVault()) { openPasswordModal(); }
        else { await commitAccount(pendingOp); }
    }

    // ---- 导出 ----
    function showExportModal(mnemonic, hexPriv) {
        const grid = document.getElementById('exportGrid');
        const hexBox = document.getElementById('exportHex');
        if (mnemonic) {
            document.getElementById('exportTitle').textContent = '✍️ 助记词（恢复钱包的唯一凭证）';
            document.getElementById('exportWarn').textContent = '请离线抄写并分处保存。任何人获得助记词即可完全控制该账户资产。';
            grid.style.display = 'grid';
            hexBox.style.display = 'none';
            grid.innerHTML = '';
            mnemonic.split(' ').forEach((w, i) => {
                const div = document.createElement('div');
                div.className = 'mn-word';
                div.textContent = (i + 1) + '. ' + w;
                grid.appendChild(div);
            });
        } else {
            document.getElementById('exportTitle').textContent = '⚠️ 私钥（旧版账户，无助记词）';
            document.getElementById('exportWarn').textContent = '该账户由旧版导入，无助记词。私钥是唯一凭证，请勿泄露。建议新建助记词账户并转移资产。';
            grid.style.display = 'none';
            hexBox.style.display = 'block';
            hexBox.textContent = hexPriv;
        }
        openModal('modal-export');
    }
    function copyExport() {
        const mne = document.getElementById('exportGrid').textContent.replace(/\d+\.\s*/g, '').trim();
        const hex = document.getElementById('exportHex').textContent.trim();
        copyText(hex ? hex : mne);
    }
    // ---- 生物识别 ----
    function updateBioButton() {
        const btn = document.getElementById('bioBtn');
        const v = getVault();
        if (!btn) return;
        if (v && v.webauthn) {
            btn.textContent = '🔓 停用生物识别';
            btn.style.display = '';
        } else if (v && NovaCrypto.webauthnSupported()) {
            btn.textContent = '🔓 启用生物识别';
            btn.style.display = '';
        } else {
            btn.style.display = 'none';
        }
        const st = document.getElementById('bioStatus');
        if (st) st.textContent = v && v.webauthn ? '✅ 已启用（可用指纹/面部解锁）' : '未启用';
    }
    async function toggleBiometric() {
        const v = getVault();
        if (!v) return alert('请先创建钱包');
        if (v.webauthn) {
            if (!confirm('停用生物识别解锁？仍可使用密码解锁。')) return;
            v.webauthn = null;
            saveVault(v);
            updateUI();
            toast('🔓 已停用生物识别');
            return;
        }
        if (!session.unlocked) {
            const r = await requestUnlock('启用生物识别', '启用前需先输入密码');
            if (!r.ok) return;
        }
        if (!NovaCrypto.webauthnSupported()) return alert('当前浏览器/设备不支持 WebAuthn（需 HTTPS 或 localhost）');
        try {
            const reg = await NovaCrypto.webauthnRegister('Nova Wallet', 'nova-wallet', 'Nova Wallet');
            const box = await NovaCrypto.aesGcmEncrypt(reg.deviceKey, session.masterKey);
            v.webauthn = { credId: reg.credId, prfSalt: reg.prfSalt, wrap: { iv: NovaCrypto.bytesToBase64(box.iv), ct: NovaCrypto.bytesToBase64(box.ct) } };
            saveVault(v);
            updateUI();
            toast('✅ 生物识别已启用');
        } catch (e) {
            alert('启用失败：' + (e.message || '用户取消或设备不支持 PRF 扩展'));
        }
    }

    // ---- 旧版明文迁移 ----
    function maybeOfferMigration() {
        const keys = legacyPlainKeys();
        if (keys.length && !getVault()) {
            document.getElementById('migrateCount').textContent = String(keys.length);
            openModal('modal-migrate');
        }
    }
    function skipMigrate() { closeModal('modal-migrate'); }
    function startMigrate() {
        closeModal('modal-migrate');
        pendingOp = { type: 'migrate', legacyKeys: legacyPlainKeys() };
        openPasswordModal();
    }

    // ---- 自动锁定（5 分钟无操作） ----
    let lastActivity = Date.now();
    function bindAutoLock() {
        const touch = () => { lastActivity = Date.now(); };
        ['pointerdown', 'keydown', 'wheel'].forEach(ev => window.addEventListener(ev, touch, { passive: true }));
        setInterval(() => {
            if (session.unlocked && Date.now() - lastActivity > 5 * 60 * 1000) {
                lockWallet();
                toast('⏱ 5 分钟无操作，钱包已自动锁定');
            }
        }, 30000);
    }

    // ============================================================
    // API（节点不可用时自动进入演示模式）
    // ============================================================''')

# ---------- 执行 ----------
failed = False
for name, old, new in steps:
    n = content.count(old)
    if n != 1:
        print(f"✘ {name}: 锚点出现 {n} 次（应为 1）")
        failed = True
        continue
    content = content.replace(old, new)
    print(f"✔ {name}")

if failed:
    print("❌ 存在失败步骤，未写入文件")
    sys.exit(1)

with open(PATH, "w", encoding="utf-8", newline="") as f:
    f.write(content)
print("✅ 已写入 wallet.html")
