
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
    

    'use strict';
    // ============================================================
    // 基础工具
    // ============================================================
    function hexToBytes(hex) {
        const clean = (hex || '').replace(/^0x/, '');
        if (!clean) return new Uint8Array();
        return new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    }
    function bytesToHex(bytes) {
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    function utf8ToBytes(str) { return new TextEncoder().encode(str); }
    function concatBytes(a, b) {
        const out = new Uint8Array(a.length + b.length);
        out.set(a, 0); out.set(b, a.length);
        return out;
    }
    function randomBytes(n) {
        const out = new Uint8Array(n);
        if (window.crypto && window.crypto.getRandomValues) crypto.getRandomValues(out);
        else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
        return out;
    }
    function webcryptoAvailable() { return !!(window.crypto && window.crypto.subtle); }

    // ============================================================
    // 签名 / 地址：统一复用 apps-common.js（NovaApps）实现，与全站一致
    // 保留 modPow / leBytesToBigInt / bigIntToLeBytes 供下方 X25519 使用
    // ============================================================
    function modPow(base, exp, mod) {
        let b = base % mod;
        if (b < 0n) b += mod;
        let r = 1n;
        while (exp > 0n) {
            if (exp & 1n) r = (r * b) % mod;
            b = (b * b) % mod;
            exp >>= 1n;
        }
        return r;
    }
    function leBytesToBigInt(bytes) {
        let n = 0n;
        for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
        return n;
    }
    function bigIntToLeBytes(n, len) {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
        return out;
    }
    async function getPubFromPriv(priv) { return NovaApps.getPubFromPriv(priv); }
    async function getAddrFromPriv(priv) { return NovaApps.addressFromPriv(priv); }
    async function sign(privHex, msg) {
        const seed = hexToBytes(privHex);
        try { return await NovaApps.signMsg(privHex, msg); }
        finally { wipeBuffers(seed); } // 签名后立即清零临时私钥字节
    }

    // ============================================================
    // X25519 (RFC 7748) 纯 JS 实现
    // ============================================================
    const X_P = (1n << 255n) - 19n;
    function xDecodeScalar(k) {
        const a = k.slice();
        a[0] &= 248; a[31] &= 127; a[31] |= 64;
        return leBytesToBigInt(a);
    }
    function xDecodeU(u) {
        const val = leBytesToBigInt(u);
        return val < X_P ? val : 0n;
    }
    function x25519(k, u) {
        const x1 = xDecodeU(u);
        const scalar = xDecodeScalar(k);
        let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
        for (let t = 254; t >= 0; t--) {
            const kt = (scalar >> BigInt(t)) & 1n;
            swap ^= kt;
            if (swap) {
                let tmp = x2; x2 = x3; x3 = tmp;
                tmp = z2; z2 = z3; z3 = tmp;
            }
            swap = kt;
            const A = (x2 + z2) % X_P;
            const AA = (A * A) % X_P;
            const B = (x2 - z2 + X_P) % X_P;
            const BB = (B * B) % X_P;
            const E = (AA - BB + X_P) % X_P;
            const C = (x3 + z3) % X_P;
            const D = (x3 - z3 + X_P) % X_P;
            const DA = (D * A) % X_P;
            const CB = (C * B) % X_P;
            const daCB = (DA + CB) % X_P;
            const daCB2 = (DA - CB + X_P) % X_P;
            x3 = (daCB * daCB) % X_P;
            z3 = (x1 * ((daCB2 * daCB2) % X_P)) % X_P;
            z2 = (E * ((AA + 121665n * E) % X_P)) % X_P;
            x2 = (AA * BB) % X_P;
        }
        if (swap) {
            let tmp = x2; x2 = x3; x3 = tmp;
            tmp = z2; z2 = z3; z3 = tmp;
        }
        return bigIntToLeBytes((x2 * modPow(z2, X_P - 2n, X_P)) % X_P, 32);
    }
    function x25519BasePoint(k) {
        const u = new Uint8Array(32); u[0] = 9;
        return x25519(k, u);
    }

    // ============================================================
    // HKDF-SHA256 + AES-256-GCM（WebCrypto）
    // ============================================================
    async function hkdfSha256(ikm, salt, info, len) {
        const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
        return new Uint8Array(bits);
    }
    async function aesKeyFromShared(shared, nonce) {
        const raw = await hkdfSha256(shared, nonce, utf8ToBytes('nova-chat-aes'), 32);
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    async function chatEncrypt(shared, nonce, aad, text) {
        const key = await aesKeyFromShared(shared, nonce);
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, utf8ToBytes(text));
        return bytesToHex(new Uint8Array(ct));
    }
    async function chatDecrypt(shared, nonce, aad, ctHex) {
        const key = await aesKeyFromShared(shared, nonce);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, hexToBytes(ctHex));
        return new TextDecoder().decode(pt);
    }

    // ============================================================
    // 加密保险库（AES-256-GCM + PBKDF2 密码；多账户）
    // ============================================================
    const LS_VAULT = 'nova_vault_v2';
    const LS_ACTIVE = 'nova_active';
    // ---- 交易安全（阶段二） ----
    const LS_TX_HISTORY = 'nova_tx_history_v1';
    const TX_LARGE_AMOUNT = 1000;                  // 超过该金额需二次密码确认
    const TX_GAS_FIXED = 0.000001;                 // 与节点 economy.FIXED_GAS 一致
    const TX_BROADCAST_TIMEOUT_MS = 90000;         // 广播超时保护（E2E 可用 window 覆盖）
    const TX_CONFIRM_TIMEOUT_MS = 10 * 60 * 1000;  // 10 分钟未上链判定为失败
    let nodeMode = false;                          // 是否连接真实节点
    let txPending = null;                          // 待签名的交易预览数据
    // ---- 安全防护（阶段三） ----
    const OFFICIAL_DOMAINS = ['cortex-forest.github.io', 'novachain.org', 'www.novachain.org'];
    const LS_DEVICE_TAG = 'nova_device_tag';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function deviceFingerprint() {
        const parts = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height,
                       String(screen.colorDepth || ''), String(navigator.hardwareConcurrency || ''),
                       (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), String(navigator.platform || '')];
        const raw = parts.join('|');
        let h = 5381;
        for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
        return h.toString(16);
    }
    function checkDomainTrust() {
        const banner = document.getElementById('domainBanner');
        if (!banner) return 'unknown';
        const host = location.hostname;
        let level = 'ok', msg = '';
        if (location.protocol === 'file:') {
            msg = '本地文件模式（离线使用，密钥不出本机）';
        } else if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
            msg = '本地开发环境 · ' + host;
        } else if (OFFICIAL_DOMAINS.indexOf(host) >= 0 || host.endsWith('.novachain.org')) {
            msg = '✅ 官方域名 · ' + host;
        } else {
            level = 'warn';
            msg = '⚠️ 非官方域名：' + host + '。请仅通过官方链接访问钱包，谨防钓鱼网站';
        }
        if (window.top !== window.self) {
            level = 'warn';
            msg += ' ｜ ⚠️ 页面被嵌入第三方框架，请立即离开';
        }
        banner.className = 'mode-banner trust' + (level === 'warn' ? ' warn' : '');
        banner.textContent = msg;
        banner.hidden = false;
        return level;
    }
    function bindDevice() {
        const el = document.getElementById('deviceBindingStatus');
        const fp = deviceFingerprint();
        const prev = localStorage.getItem(LS_DEVICE_TAG);
        const db = document.getElementById('deviceBanner');
        if (prev && prev !== fp) {
            if (el) el.textContent = '⚠️ 指纹变化：当前浏览器/设备环境与创建钱包时不同，请确认是本人在使用；如异常请立即锁定并恢复助记词';
            if (db) { db.textContent = '⚠️ 设备指纹变化：浏览器/设备环境与创建钱包时不一致，请确认是本人操作'; db.hidden = false; }
            return 'changed';
        }
        if (!prev) localStorage.setItem(LS_DEVICE_TAG, fp);
        if (db) db.hidden = true;
        if (el) el.textContent = '✅ 已绑定 · 设备指纹 ' + fp.slice(0, 8) + '…（本机浏览器环境）';
        return 'ok';
    }
    function wipeBuffers() {
        for (let i = 0; i < arguments.length; i++) {
            const b = arguments[i];
            if (b && b.byteLength) { try { b.fill(0); } catch (e) {} }
        }
    }
    let session = { unlocked: false, masterKey: null, keys: {}, mnemonics: {}, evmKeys: {} };
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
        // nova_priv 与 apps-common.js（其他页面）共用，仅清理钱包自身的纯 hex 明文，保留其他格式数据
        const pv = localStorage.getItem('nova_priv');
        if (pv && /^[0-9a-fA-F]{64}$/.test(pv)) localStorage.removeItem('nova_priv');
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
            await ensureEvmKeys();
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
            await ensureEvmKeys();
            chatKeyCache = null; myAddrCache = '';
            return { ok: true };
        } catch (e) { return { ok: false, error: '生物识别失败：' + (e.message || '未通过验证') }; }
    }
    function lockWallet() {
        session = { unlocked: false, masterKey: null, keys: {}, mnemonics: {}, evmKeys: {} };
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
                mnemonic: a.mnemonic ? await NovaCrypto.encryptWithMaster(masterKey, a.mnemonic) : null,
                evmAddr: a.evmAddr || null,
                evmKey: a.evmKey ? await NovaCrypto.encryptWithMaster(masterKey, a.evmKey) : null
            });
        }
        const vault = { v: NovaCrypto.VAULT_VERSION, kdf: { iterations: wrap.iterations }, wrap, webauthn: null, accounts: encAccounts };
        saveVault(vault);
        session.masterKey = masterKey; session.unlocked = true;
        session.keys = {}; session.mnemonics = {};
        for (const a of accounts) {
            session.keys[a.id] = a.priv;
            if (a.mnemonic) session.mnemonics[a.id] = a.mnemonic;
            if (a.evmKey) session.evmKeys[a.id] = a.evmKey;
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
            mnemonic: account.mnemonic ? await NovaCrypto.encryptWithMaster(session.masterKey, account.mnemonic) : null,
            evmAddr: account.evmAddr || null,
            evmKey: account.evmKey ? await NovaCrypto.encryptWithMaster(session.masterKey, account.evmKey) : null
        };
        v.accounts.push(entry);
        saveVault(v);
        session.keys[account.id] = account.priv;
        if (account.mnemonic) session.mnemonics[account.id] = account.mnemonic;
        if (account.evmKey) session.evmKeys[account.id] = account.evmKey;
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
    }

    // ============================================================
    // 解锁 / 模态框（密码 + 生物识别）
    // ============================================================
    let authResolve = null;
    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        // 38 · 无障碍：模态框语义
        if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.hidden = false;
        el.style.display = 'flex';
    }
    function closeModal(id) {
        if (id === 'modal-mnemonic' || id === 'modal-export') setScreenshotGuard(false);
        if (id === 'modal-export') {
            const g = document.getElementById('exportGrid');
            const h = document.getElementById('exportHex');
            if (g) g.innerHTML = '';
            if (h) h.textContent = '';
        }
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
        setScreenshotGuard(true); // 41 · 助记词防截图
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
        setScreenshotGuard(true); // 41 · 助记词防截图
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
                toast(t('autoLockMsg'));
            }
        }, 30000);
    }

    // ============================================================
    // API（节点不可用时自动进入演示模式）
    // ============================================================
    function getRpc() { return document.getElementById('rpcUrl').value.trim().replace(/\/+$/, ''); }

    function demoApi(path, method, body) {
        const demoInbox = JSON.parse(localStorage.getItem('nova_demo_inbox') || '{}');
        const demoPubs = JSON.parse(localStorage.getItem('nova_demo_pubkeys') || '{}');
        if (method === 'GET' && path.startsWith('/api/chat/pubkey/')) {
            const addr = decodeURIComponent(path.split('/').pop());
            return { addr, chat_pub: demoPubs[addr] || null, demoMode: true };
        }
        if (method === 'POST' && path === '/api/chat/pubkey') {
            demoPubs[body.addr] = body.chat_pub;
            localStorage.setItem('nova_demo_pubkeys', JSON.stringify(demoPubs));
            return { status: '已发布（演示）', demoMode: true };
        }
        if (method === 'POST' && path === '/api/chat/send') {
            const id = body.id || ('demo-' + Date.now().toString(16) + Math.random().toString(16).slice(2, 8));
            const msg = { id, sender: body.sender, recipient: body.recipient, chat_pub: body.chat_pub,
                          nonce: body.nonce, ciphertext: body.ciphertext, ts: body.ts };
            demoInbox[body.recipient] = [...(demoInbox[body.recipient] || []).filter(m => m.id !== id), msg];
            localStorage.setItem('nova_demo_inbox', JSON.stringify(demoInbox));
            return { id, status: 'queued', demoMode: true };
        }
        if (method === 'GET' && path.startsWith('/api/chat/inbox/')) {
            const addr = decodeURIComponent(path.split('/').pop());
            return { addr, messages: demoInbox[addr] || [], demoMode: true };
        }
        if (method === 'POST' && path === '/api/chat/ack') {
            const list = (demoInbox[body.addr] || []).filter(m => !(body.ids || []).includes(m.id));
            const removed = (demoInbox[body.addr] || []).length - list.length;
            demoInbox[body.addr] = list;
            localStorage.setItem('nova_demo_inbox', JSON.stringify(demoInbox));
            return { removed, demoMode: true };
        }
        if (method === 'POST' && path === '/api/send') {
            const txid = 'demo' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
            return { txid, demoMode: true };
        }
        if (method === 'GET' && path.startsWith('/api/txs/')) {
            return { addr: path.split('/').pop(), txs: [], demoMode: true };
        }
        if (method === 'GET' && path.startsWith('/api/tx/')) {
            return { error: '交易不存在或尚未上链' };
        }
        if (method === 'GET' && path.startsWith('/api/balance/')) {
            return { balance: 0, demoMode: true };
        }
        if (method === 'GET' && path === '/api/status') {
            return { node: 'demo.novachain.local', peers: 3, dag: 128, quantum_safe: true,
                     algorithm: 'Ed25519', demoMode: true };
        }
        return { status: '演示模式', message: '当前为静态演示页面', demoMode: true, error: 'demo' };
    }

    async function api(path, method = 'GET', body = null, signal = null) {
        const opts = { method, headers: body ? { 'Content-Type': 'application/json' } : {} };
        if (body) opts.body = JSON.stringify(body);
        if (signal) opts.signal = signal;
        try {
            const r = await fetch(getRpc() + path, opts);
            if (!r.ok) {
                // 后端业务错误（400 校验失败 / 404 不存在等）：原样返回错误体，绝不落入演示回退
                const data = await r.json().catch(() => null);
                if (data && typeof data === 'object' && (data.error || data.status)) return data;
                throw new Error((data && data.error) || ('HTTP ' + r.status));
            }
            const text = await r.text();
            return text ? JSON.parse(text) : {};
        } catch (e) {
            // 广播/查询超时保护：AbortError 不落入演示回退
            if (e && e.name === 'AbortError') throw e;
            // 仅网络不可达等非业务错误才落入演示回退
            const demo = demoApi(path, method, body);
            demo.error = demo.error || e.message;
            return demo;
        }
    }

    // ============================================================
    // 钱包 UI
    // ============================================================
    let myAddrCache = '';
    let chatKeyCache = null;

    function toast(msg) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 3200);
    }
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => { toast('已复制，校验剪贴板中…'); verifyClipboard(text); })
                .catch(() => toast(text.length > 30 ? text.slice(0, 30) + '…' : text));
        } else {
            toast(text.length > 30 ? text.slice(0, 30) + '…' : text);
        }
    }
    // 18 · 剪贴板劫持防护：复制后回读校验，发现篡改立即警告
    async function verifyClipboard(expected) {
        try {
            await sleep(3000); // 等待潜在的劫持脚本覆盖
            const got = await navigator.clipboard.readText();
            if (got == null) return;
            const clean = String(got).trim();
            if (clean !== expected) {
                toast('🚨 剪贴板被篡改！复制内容与预期不一致，请勿直接粘贴');
                return;
            }
            if (/^0x[0-9a-fA-F]{40}$/.test(clean)) {
                toast('✅ 地址已复制并校验通过 ' + clean.slice(0, 4) + '…' + clean.slice(-4));
            } else {
                toast('✅ 已复制并校验一致');
            }
        } catch (e) { /* 无剪贴板读取权限时跳过自动校验 */ }
    }
    function setRuntimeMode(mode, message) {
        const banner = document.getElementById('runtimeModeBanner');
        if (banner) {
            banner.className = 'mode-banner ' + mode;
            banner.innerHTML = '<strong>' + t(mode === 'node' ? 'modeNode' : 'modeDemo') + '</strong> · ' + message;
        }
    }

    async function checkNode() {
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
    }

    async function renderAccountSelect() {
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
            if (lockEl) lockEl.textContent = t('lockStatusLocked');
            updateBioButton();
            return;
        }
        myAddrCache = a.addr;
        addrEl.textContent = a.addr;
        if (lockEl) lockEl.textContent = session.unlocked ? t('lockUnlocked') : t('lockLocked');
        await renderAccountSelect();
        fetchBalance();
        renderTxHistory();
        updateBioButton();
        updateChatStatus();
        renderMultichain();
        renderAssetPanel();
    }

    async function startCreateWallet() {
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
                const evmK = await NovaEVM.deriveEvmKey(hexToBytes(priv), "m/44'/60'/0'/0/0");
                const evmHex = NovaEVM.bytesToHex(evmK);
                out.push({
                    id: genAccountId(), name: '账户 ' + (i + 1) + '（旧版）', addr, pub, priv,
                    mnemonic: null, path: null, legacy: true,
                    evmAddr: NovaEVM.toChecksumAddress(NovaEVM.privateKeyToAddress(evmK)), evmKey: evmHex
                });
            }
            return out;
        }
        const priv = op.privHex || await NovaCrypto.deriveNovaKey(op.mnemonic);
        const pub = await getPubFromPriv(priv);
        const addr = await getAddrFromPriv(priv);
        // EVM 地址：助记词账户按 BIP44 m/44'/60'/0'/0/{账户序号} 派生；导入 hex 账户由 Nova 私钥确定性派生
        let evmKey = null;
        if (op.mnemonic) {
            const seed = await NovaCrypto.mnemonicToSeed(op.mnemonic, '');
            evmKey = await NovaEVM.deriveEvmKey(seed, "m/44'/60'/0'/0/" + vaultAccounts().length);
        } else {
            evmKey = await NovaEVM.deriveEvmKey(hexToBytes(priv), "m/44'/60'/0'/0/0");
        }
        const evmKeyHex = NovaEVM.bytesToHex(evmKey);
        return [{
            id: genAccountId(), name: '账户 1',
            addr, pub, priv,
            mnemonic: op.mnemonic || null,
            path: op.mnemonic ? NovaCrypto.NOVA_DERIVATION_PATH : null,
            legacy: !!op.legacy,
            evmAddr: NovaEVM.toChecksumAddress(NovaEVM.privateKeyToAddress(evmKey)),
            evmKey: evmKeyHex
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
    }

    async function sendTx() {
        if (!getVault() || !currentAccount()) return alert('请先创建或选择账户');
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto，无法签名');
        const sender = currentAccount().addr;
        const to = document.getElementById('toAddr').value.trim();
        const amt = parseFloat(document.getElementById('amount').value);
        const memo = (document.getElementById('memo').value || '').trim();
        if (!to || isNaN(amt) || amt <= 0) return alert('填写正确地址和金额');
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return alert('接收方地址格式无效');
        if (!Number.isFinite(amt) || amt > 1e12) return alert('金额超出允许范围');
        // 11 · 可疑地址警告（钓鱼库 + 相似地址检测，防剪贴板劫持）
        const warns = checkPhishing(to);
        // 20 · 恶意合约检测：转账目标为合约时签名前风险提示
        try {
            const ctl = new AbortController();
            const ct = setTimeout(() => ctl.abort(), (window.NOVA_GAS_TIMEOUT_MS || 3000));
            let ci = null;
            try { ci = await api('/api/contract/' + to, 'GET', null, ctl.signal); }
            finally { clearTimeout(ct); }
            if (ci && !ci.error && ci.is_contract) {
                warns.push('⚠️ 接收方是<strong>合约地址</strong>（创建者 ' + (ci.creator || '0x…').slice(0, 10) + '…），转账将触发合约逻辑，请确认你了解该合约行为');
            }
        } catch (e) { /* 合约查询失败不阻塞签名流程 */ }
        // 13 · Gas 费估算（节点在线时按信誉折扣展示）
        const gasInfo = await estimateGas(sender);
        // 9 · 签名前展示完整交易详情
        txPending = { sender, to, amt, memo, gasInfo };
        fillTxPreview(txPending, warns);
        openModal('modal-txpreview');
    }

    // ---- 交易预览（9） ----
    function fillTxPreview(p, warns) {
        document.getElementById('txpSender').textContent = p.sender;
        document.getElementById('txpReceiver').textContent = p.to;
        document.getElementById('txpAmount').textContent = p.amt + ' NOVA';
        const gasTxt = p.gasInfo.gas.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') + ' NOVA';
        document.getElementById('txpGas').textContent = gasTxt + (p.gasInfo.discounted ? '（已享信誉 5 折）' : '（固定费率）');
        document.getElementById('txpMemo').textContent = p.memo || '（无）';
        document.getElementById('txpTs').textContent = new Date().toLocaleString('zh-CN', { hour12: false });
        const warnEl = document.getElementById('txpWarn');
        warnEl.style.display = warns.length ? '' : 'none';
        warnEl.innerHTML = warns.map(w => '<div style="margin:.15rem 0;">' + w + '</div>').join('');
        document.getElementById('txPreviewWarn').textContent =
            '请核对以下交易内容，确认无误后再签名。签名后交易将广播到节点，无法撤销。';
    }

    // ---- 钓鱼地址与相似地址检测（11） ----
    const PHISHING_ADDRS = {
        '0x0000000000000000000000000000000000000000': '黑洞地址（转入后无法取回）'
        // 已知钓鱼地址库：可在此追加经过核实的地址
    };
    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = new Uint16Array(n + 1);
        for (let j = 0; j <= n; j++) dp[j] = j;
        for (let i = 1; i <= m; i++) {
            let prev = dp[0]; dp[0] = i;
            for (let j = 1; j <= n; j++) {
                const tmp = dp[j];
                dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
                prev = tmp;
            }
        }
        return dp[n];
    }
    function checkPhishing(to) {
        const warns = [];
        const toL = to.toLowerCase();
        const own = vaultAccounts().map(a => a.addr.toLowerCase());
        const refs = [...own, ...getContacts()];
        const known = PHISHING_ADDRS[toL];
        if (known) warns.push('⚠️ <strong>' + known + '</strong>，强烈建议取消这笔交易');
        if (own.includes(toL)) warns.push('⚠️ 接收方与您自己的地址相同');
        for (const ref of refs) {
            if (ref === toL || ref.length !== 42) continue;
            const d = levenshtein(ref, toL);
            if (d > 0 && d <= 3) {
                warns.push('⚠️ 该地址与 <code>' + ref.slice(0, 10) + '…</code> 高度相似（仅差 <strong>' + d +
                    '</strong> 个字符），请确认未被篡改（防剪贴板劫持）');
            }
        }
        return warns;
    }

    // ---- Gas 费估算（13） ----
    async function estimateGas(addr) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), (window.NOVA_GAS_TIMEOUT_MS || 3000));
        try {
            const d = await api('/api/reputation/' + addr, 'GET', null, ctl.signal);
            if (d && !d.error && d.fee_multiplier != null && d.fee_multiplier < 1) {
                return { gas: TX_GAS_FIXED * d.fee_multiplier, discounted: true };
            }
        } catch (e) { /* 超时或失败 → 回退固定费率 */ }
        finally { clearTimeout(t); }
        return { gas: TX_GAS_FIXED, discounted: false };
    }

    async function txPreviewConfirm() {
        const p = txPending;
        txPending = null;
        if (!p) return closeModal('modal-txpreview');
        closeModal('modal-txpreview');
        // 每次签名前必须输入密码（或生物识别）确认
        const auth = await requestUnlock('确认签名', '签名前需输入密码确认，将使用当前账户发起交易');
        if (!auth.ok) return;
        let priv = currentPriv();
        if (!priv) return alert('解锁失败，请重试');
        const sender = await getAddrFromPriv(priv);
        if (sender !== p.sender) return alert('账户已切换，请重新发起交易');
        const pub = await getPubFromPriv(priv);
        const ts = Math.floor(Date.now() / 1000);
        const amtStr = p.amt.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
        const sig = await sign(priv, sender + p.to + amtStr + ts + '[]' + p.memo + pub);
        priv = ''; // 签名完成，及时释放局部私钥引用（会话密钥仍在内存中直至锁定）
        // 10 · 大额转账二次密码确认（> 1000 NOVA）
        if (p.amt > TX_LARGE_AMOUNT) {
            const auth2 = await requestUnlock('大额转账二次确认',
                '金额超过 ' + TX_LARGE_AMOUNT + ' NOVA，为保护资产安全，请再次输入密码确认后才会广播');
            if (!auth2.ok) return;
        }
        await broadcastSignedTx({ sender, to: p.to, amt: p.amt, memo: p.memo, pub, ts, amtStr, sig });
    }

    // ---- 广播（12 超时保护）与交易历史（14/15） ----
    function getTxRecords() {
        try { const a = JSON.parse(localStorage.getItem(LS_TX_HISTORY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function setTxRecords(list) {
        const l = list.slice(0, 200);
        localStorage.setItem(LS_TX_HISTORY, JSON.stringify(l));
    }
    function addTxRecord(rec) {
        const l = getTxRecords();
        l.unshift(rec);
        setTxRecords(l);
    }
    function updateTxRecord(rec) {
        const l = getTxRecords();
        const i = l.findIndex(r => r.id === rec.id);
        if (i >= 0) { l[i] = rec; setTxRecords(l); }
    }
    function myTxRecords(addr) {
        return getTxRecords().filter(r => r.sender === addr || r.receiver === addr);
    }
    async function broadcastSignedTx(tx) {
        const rec = {
            id: 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            txid: '', sender: tx.sender, receiver: tx.to, amount: tx.amt,
            gas: 0, memo: tx.memo, ts: Date.now(),
            status: 'pending', broadcastAt: Date.now(), confirmedAt: null, error: ''
        };
        addTxRecord(rec);
        renderTxHistory();
        const controller = new AbortController();
        const timeout = (window.NOVA_TX_TIMEOUT_MS || TX_BROADCAST_TIMEOUT_MS);
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await api('/api/send', 'POST', {
                sender: tx.sender, receiver: tx.to, amount: tx.amt,
                timestamp: tx.ts, parents: [], data: tx.memo,
                sender_public_key: tx.pub, signature: tx.sig
            }, controller.signal);
            document.getElementById('txResult').textContent = JSON.stringify(res, null, 2);
            if (res.demoMode) {
                rec.status = 'demo'; rec.error = '演示模式';
                updateTxRecord(rec);
                toast('🧪 演示模式：交易未真实发送');
            } else if (res.error) {
                rec.status = 'rejected'; rec.error = res.error;
                updateTxRecord(rec);
                toast('🚫 交易被节点拒绝：' + friendlyTxError(res.error));
            } else {
                rec.txid = res.txid || ''; rec.status = 'pending';
                updateTxRecord(rec);
                fetchBalance();
                toast('✅ 交易已广播 ' + (res.txid || '').slice(0, 16) + '…');
            }
        } catch (e) {
            if (e && e.name === 'AbortError') {
                rec.status = 'timeout';
                rec.error = '广播超时（' + Math.round(timeout / 1000) + ' 秒），交易未确认上链';
            } else {
                rec.status = 'failed'; rec.error = e.message || '广播失败';
            }
            updateTxRecord(rec);
            toast('⚠️ 广播未完成：' + rec.error);
        } finally {
            clearTimeout(timer);
        }
        renderTxHistory();
    }
    function friendlyTxError(err) {
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
    }
    const TX_STATUS_TEXT = { pending: '⏳ 待确认', confirmed: '✅ 已确认', failed: '❌ 失败', timeout: '⚠️ 超时', demo: '🧪 演示', rejected: '🚫 被拒绝' };
    function escHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    async function renderTxHistory() {
        const el = document.getElementById('txHistoryList');
        const a = currentAccount();
        if (!el) return;
        const addr = a ? a.addr : '';
        let recs = addr ? myTxRecords(addr) : [];
        if (a && nodeMode) {
            // 15 · 链上确认状态追踪
            const d = await api('/api/txs/' + addr);
            if (!d.error && Array.isArray(d.txs)) {
                const local = new Set(recs.filter(r => r.txid).map(r => r.txid));
                const added = [];
                for (const t of d.txs) {
                    const mine = recs.find(r => r.txid === t.txid);
                    if (mine) {
                        if (mine.status === 'pending') { mine.status = 'confirmed'; mine.confirmedAt = Date.now(); }
                    } else if (!local.has(t.txid)) {
                        added.push({ id: 'chain-' + t.txid, txid: t.txid, sender: t.sender, receiver: t.receiver,
                                     amount: t.amount, gas: t.gas, memo: t.data, ts: (t.confirmed_at || t.ts || 0) * 1000,
                                     status: 'confirmed', confirmedAt: (t.confirmed_at || 0) * 1000, onchain: true });
                        local.add(t.txid);
                    }
                }
                recs = recs.concat(added);
                let changed = false;
                for (const r of recs) {
                    if (r.status === 'pending' && Date.now() - r.broadcastAt > TX_CONFIRM_TIMEOUT_MS) {
                        r.status = 'failed'; r.error = '长时间未上链，可能未通过节点校验'; changed = true;
                    }
                }
                setTxRecords(recs.filter(r => !r.onchain));
            }
        }
        recs.sort((x, y) => (y.ts || 0) - (x.ts || 0));
        if (!recs.length) {
            el.innerHTML = '<div class="contact-empty">暂无交易记录<br>发起转账后自动记录并追踪状态</div>';
            return;
        }
        el.innerHTML = recs.slice(0, 50).map(r => {
            const dir = r.receiver === addr ? 'in' : 'out';
            const who = (dir === 'in' ? r.sender : r.receiver) || '';
            const st = TX_STATUS_TEXT[r.status] || r.status || '';
            const time = new Date(r.ts || Date.now()).toLocaleString('zh-CN', { hour12: false });
            const gas = r.gas != null ? r.gas : TX_GAS_FIXED;
            const meta = [time, 'Gas ' + gas,
                          r.memo ? escHtml(r.memo.slice(0, 24)) : '',
                          r.txid ? r.txid.slice(0, 12) + '…' : ''].filter(Boolean).join(' · ');
            return '<div class="tx-item ' + dir + '">' +
                '<span class="tx-dir">' + (dir === 'in' ? '↓' : '↑') + '</span>' +
                '<span class="tx-amt">' + (dir === 'in' ? '+' : '−') + r.amount + ' NOVA</span>' +
                '<span class="tx-status ' + r.status + '">' + st + '</span>' +
                '<span class="tx-peer">' + who.slice(0, 12) + '…</span>' +
                '<span class="tx-meta">' + meta + '</span></div>';
        }).join('');
    }
    async function refreshTxHistory() {
        await renderTxHistory();
        toast('🔄 交易历史已刷新');
    }
    function clearTxHistory() {
        const addr = currentAccount().addr;
        if (!addr) return;
        if (!confirm('清除本地交易历史记录？（链上记录不受影响）')) return;
        setTxRecords(getTxRecords().filter(r => r.sender !== addr && r.receiver !== addr));
        renderTxHistory();
        toast('🗑 已清除本地交易记录');
    }

    // ============================================================
    // 加密聊天
    // ============================================================
    async function getMyChatKey() {
        const priv = currentPriv();
        if (!priv) return null;
        if (chatKeyCache && chatKeyCache.seed === priv) return chatKeyCache;
        const seedBytes = hexToBytes(priv);
        const privScalar = await hkdfSha256(seedBytes, utf8ToBytes('nova-chat'), utf8ToBytes('x25519'), 32);
        const pub = x25519BasePoint(privScalar);
        chatKeyCache = { seed: priv, priv: privScalar, pub };
        return chatKeyCache;
    }
    function chatSignatureData(sender, recipient, chatPub, nonce, ciphertext, ts) {
        return sender + recipient + chatPub + nonce + ciphertext + String(Math.floor(ts));
    }

    async function registerPubkey() {
        const priv = currentPriv();
        if (!priv) return false;
        try {
            const myKey = await getMyChatKey();
            const me = await getAddrFromPriv(priv);
            const chat_pub = bytesToHex(myKey.pub);
            const signature = await sign(priv, me + chat_pub);
            const res = await api('/api/chat/pubkey', 'POST', {
                addr: me, chat_pub,
                sender_public_key: await getPubFromPriv(priv),
                signature
            });
            return !res.error || res.demoMode;
        } catch (e) { return false; }
    }

    async function updateChatStatus() {
        const el = document.getElementById('chatKeyStatus');
        const priv = currentPriv();
        if (!priv) {
            el.textContent = getVault() && vaultAccounts().length ? '🔒 已锁定，解锁后发布聊天密钥' : '无账户';
            el.classList.add('off');
            return;
        }
        const myKey = await getMyChatKey();
        const ok = await registerPubkey();
        if (ok) {
            el.textContent = '🔑 聊天密钥已发布 ' + bytesToHex(myKey.pub).slice(0, 12) + '…';
            el.classList.remove('off');
        } else {
            el.textContent = '聊天密钥未发布（节点离线）';
            el.classList.add('off');
        }
    }

    // ---- 联系人 ----
    function contactsKey() { return 'nova_chat_contacts_' + (myAddrCache || ''); }
    function getContacts() {
        try { const c = JSON.parse(localStorage.getItem(contactsKey()) || '[]'); return Array.isArray(c) ? c : []; }
        catch (e) { return []; }
    }
    function setContacts(list) { localStorage.setItem(contactsKey(), JSON.stringify(list)); }
    function addContact() {
        const addr = document.getElementById('contactAddr').value.trim();
        if (!addr) return toast('请输入联系人地址');
        if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return toast('地址格式无效');
        if (addr.toLowerCase() === myAddrCache.toLowerCase()) return toast('不能添加自己');
        const list = getContacts();
        if (list.some(a => a.toLowerCase() === addr.toLowerCase())) return toast('联系人已存在');
        list.push(addr.toLowerCase());
        setContacts(list);
        document.getElementById('contactAddr').value = '';
        renderContacts();
        selectContact(addr.toLowerCase());
    }
    function removeContact(addr) {
        if (!confirm('删除联系人 ' + addr.slice(0, 16) + '… ？（会话记录保留）')) return;
        setContacts(getContacts().filter(a => a !== addr));
        if (selectedContact === addr) { selectedContact = null; renderThread(); }
        renderContacts();
    }
    function renderContacts() {
        const listEl = document.getElementById('contactList');
        const contacts = getContacts();
        if (!contacts.length) {
            listEl.innerHTML = '<div class="contact-empty">暂无联系人<br>上方输入对方地址添加</div>';
            return;
        }
        const unread = JSON.parse(localStorage.getItem('nova_chat_unread') || '{}');
        listEl.innerHTML = '';
        contacts.forEach(addr => {
            const div = document.createElement('div');
            div.className = 'contact-item' + (selectedContact === addr ? ' active' : '') +
                (unread[threadKey(addr)] ? ' has-new' : '');
            div.innerHTML = '<span class="badge"></span>' + escHtml(addr.slice(0, 14)) + '…' + '<span class="x" title="删除">✕</span>';
            div.onclick = (e) => {
                if (e.target.classList.contains('x')) { removeContact(addr); e.stopPropagation(); return; }
                selectContact(addr);
            };
            listEl.appendChild(div);
        });
    }

    // ---- 会话 ----
    let selectedContact = null;
    function threadKey(peer) { return (myAddrCache || '') + '|' + peer; }
    function getThreads() {
        try { return JSON.parse(localStorage.getItem('nova_chat_threads') || '{}'); }
        catch (e) { return {}; }
    }
    function setThreads(t) { localStorage.setItem('nova_chat_threads', JSON.stringify(t)); }
    function getThread(peer) { return getThreads()[threadKey(peer)] || []; }
    function appendThread(peer, msg) {
        const t = getThreads();
        const k = threadKey(peer);
        t[k] = [...(t[k] || []), msg];
        setThreads(t);
        if (msg.dir === 'in' && selectedContact !== peer) {
            const unread = JSON.parse(localStorage.getItem('nova_chat_unread') || '{}');
            unread[k] = (unread[k] || 0) + 1;
            localStorage.setItem('nova_chat_unread', JSON.stringify(unread));
        }
    }
    function threadHas(peer, mid) {
        return (getThread(peer) || []).some(m => m.id === mid);
    }

    function fmtTime(ts) {
        try { return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }); }
        catch (e) { return String(ts); }
    }

    function selectContact(addr) {
        selectedContact = addr;
        const unread = JSON.parse(localStorage.getItem('nova_chat_unread') || '{}');
        delete unread[threadKey(addr)];
        localStorage.setItem('nova_chat_unread', JSON.stringify(unread));
        renderContacts();
        renderThread();
    }

    function renderThread() {
        const who = document.getElementById('threadWho');
        const meta = document.getElementById('threadMeta');
        const body = document.getElementById('threadBody');
        if (!selectedContact) {
            who.textContent = '选择联系人开始加密会话';
            meta.textContent = '';
            body.innerHTML = '<div class="thread-empty"><span class="big">🔐</span>消息在浏览器内加密，节点无法读取内容<br>对方需打开钱包并连接节点后才能收到</div>';
            return;
        }
        const peerPubCache = JSON.parse(localStorage.getItem('nova_chat_peer_pubs') || '{}');
        who.innerHTML = escHtml(selectedContact.slice(0, 20)) + '… <span class="tag">E2E</span>';
        meta.textContent = peerPubCache[selectedContact]
            ? '对方密钥 ' + peerPubCache[selectedContact].slice(0, 12) + '…'
            : '等待对方密钥';
        const msgs = getThread(selectedContact);
        if (!msgs.length) {
            body.innerHTML = '<div class="thread-empty"><span class="big">💬</span>还没有消息<br>发一条加密消息开始对话</div>';
            return;
        }
        body.innerHTML = '';
        msgs.forEach(m => {
            const row = document.createElement('div');
            row.className = 'msg-row ' + m.dir;
            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble' + (m.err ? ' err' : '');
            bubble.textContent = m.text;
            const metaEl = document.createElement('div');
            metaEl.className = 'msg-meta';
            metaEl.textContent = (m.dir === 'out' ? '我 · ' : (m.senderShort || '对方') + ' · ') + fmtTime(m.ts);
            row.appendChild(bubble);
            row.appendChild(metaEl);
            body.appendChild(row);
        });
        body.scrollTop = body.scrollHeight;
    }

    async function fetchPeerPub(peer) {
        const cache = JSON.parse(localStorage.getItem('nova_chat_peer_pubs') || '{}');
        if (cache[peer]) return cache[peer];
        const d = await api('/api/chat/pubkey/' + peer);
        if (d.chat_pub && /^[0-9a-fA-F]{64}$/.test(d.chat_pub)) {
            cache[peer] = d.chat_pub;
            localStorage.setItem('nova_chat_peer_pubs', JSON.stringify(cache));
            return d.chat_pub;
        }
        return null;
    }

    async function sendChat() {
        const priv = await requireSessionUnlock('发送加密消息');
        if (!priv) return toast('请先解锁钱包并选择账户');
        const peer = selectedContact;
        if (!peer) return toast('请先添加并选择联系人');
        const text = document.getElementById('chatInput').value.trim();
        if (!text) return;
        if (!webcryptoAvailable()) return alert('当前环境不支持 WebCrypto，无法加密');
        const me = await getAddrFromPriv(priv);
        const myKey = await getMyChatKey();
        const peerPubHex = await fetchPeerPub(peer);
        if (!peerPubHex) {
            toast('🔒 对方尚未发布聊天密钥，请对方打开钱包（连接节点）后再试');
            return;
        }
        const shared = x25519(myKey.priv, hexToBytes(peerPubHex));
        const nonce = randomBytes(12);
        const aad = utf8ToBytes(me + '->' + peer);
        const ciphertext = await chatEncrypt(shared, nonce, aad, text);
        const ts = Math.floor(Date.now() / 1000);
        const payload = {
            sender: me, recipient: peer,
            chat_pub: bytesToHex(myKey.pub),
            nonce: bytesToHex(nonce), ciphertext, ts
        };
        payload.sender_public_key = await getPubFromPriv(priv);
        payload.signature = await sign(priv, chatSignatureData(me, peer, payload.chat_pub, payload.nonce, ciphertext, ts));

        const res = await api('/api/chat/send', 'POST', payload);
        if (res.error && !res.demoMode) {
            toast('发送失败: ' + res.error);
            return;
        }
        appendThread(peer, { dir: 'out', text, ts, id: res.id || ('local-' + Date.now()) });
        document.getElementById('chatInput').value = '';
        renderThread();
        if (res.demoMode) toast('📨 已发送（演示模式本地中继）');
        else toast('📨 已加密发送');
        registerPubkey();
    }

    async function pollInbox() {
        const priv = currentPriv();
        if (!priv) return;
        const me = await getAddrFromPriv(priv);
        if (myAddrCache !== me) myAddrCache = me;
        const myKey = await getMyChatKey();
        const d = await api('/api/chat/inbox/' + me);
        const msgs = d.messages || [];
        if (!msgs.length) return;
        const acked = [];
        const peerCache = JSON.parse(localStorage.getItem('nova_chat_peer_pubs') || '{}');
        for (const m of msgs) {
            const peer = m.sender;
            if (threadHas(peer, m.id)) { acked.push(m.id); continue; }
            try {
                const shared = x25519(myKey.priv, hexToBytes(m.chat_pub));
                const aad = utf8ToBytes(peer + '->' + me);
                const text = await chatDecrypt(shared, hexToBytes(m.nonce), aad, m.ciphertext);
                appendThread(peer, { dir: 'in', text, ts: m.ts, id: m.id });
                if (/^[0-9a-fA-F]{64}$/.test(m.chat_pub)) peerCache[peer] = m.chat_pub;
            } catch (e) {
                appendThread(peer, { dir: 'in', text: '🔒 [无法解密] 会话密钥不匹配或消息损坏', ts: m.ts, id: m.id, err: true });
            }
            acked.push(m.id);
        }
        localStorage.setItem('nova_chat_peer_pubs', JSON.stringify(peerCache));
        if (acked.length) await api('/api/chat/ack', 'POST', { addr: me, ids: acked });
        renderContacts();
        renderThread();
    }

    function clearHistory() {
        if (!confirm('清除全部联系人、会话与演示消息？（不影响钱包账户）')) return;
        const prefix = (myAddrCache || '') + '|';
        const threads = getThreads();
        Object.keys(threads).forEach(k => { if (k.startsWith(prefix)) delete threads[k]; });
        setThreads(threads);
        setContacts([]);
        localStorage.removeItem('nova_chat_peer_pubs');
        localStorage.removeItem('nova_demo_inbox');
        localStorage.removeItem('nova_demo_pubkeys');
        localStorage.removeItem('nova_chat_unread');
        selectedContact = null;
        renderContacts();
        renderThread();
        toast('🗑 已清除');
    }

    async function refreshChat() {
        await registerPubkey();
        updateChatStatus();
        renderContacts();
        if (!selectedContact && getContacts().length) selectContact(getContacts()[0]);
        renderThread();
    }

    // ============================================================
    // 多链支持（23/24/25/26/27）：网络管理 + EVM 账户 + 余额聚合
    // ============================================================
    const LS_NETWORKS = 'nova_networks_v1';
    const LS_NETWORK_ACTIVE = 'nova_network_active';
    const DEFAULT_NETWORKS = [
        { id: 'nova', name: 'Nova 主网', chainId: 0, symbol: 'NOVA', rpc: '', type: 'nova' },
        { id: 'eth', name: '以太坊 Ethereum', chainId: 1, symbol: 'ETH', rpc: 'https://ethereum-rpc.publicnode.com', type: 'evm' },
        { id: 'bsc', name: 'BNB Smart Chain', chainId: 56, symbol: 'BNB', rpc: 'https://bsc-rpc.publicnode.com', type: 'evm' },
        { id: 'polygon', name: 'Polygon', chainId: 137, symbol: 'POL', rpc: 'https://polygon-bor-rpc.publicnode.com', type: 'evm' }
    ];
    function getNetworks() {
        try {
            const list = JSON.parse(localStorage.getItem(LS_NETWORKS) || 'null');
            if (Array.isArray(list) && list.length) return list;
        } catch (e) { /* 损坏时回退预设 */ }
        return DEFAULT_NETWORKS.map(n => Object.assign({}, n));
    }
    function saveNetworks(list) { localStorage.setItem(LS_NETWORKS, JSON.stringify(list)); }
    function activeNetworkId() {
        const id = localStorage.getItem(LS_NETWORK_ACTIVE) || 'nova';
        return getNetworks().some(n => n.id === id) ? id : 'nova';
    }
    function currentNetwork() {
        const list = getNetworks();
        return list.find(n => n.id === activeNetworkId()) || list[0];
    }
    function selectNetwork(id) {
        localStorage.setItem(LS_NETWORK_ACTIVE, id);
        renderMultichain();
    }
    function addCustomNetworkFromForm() {
        const name = document.getElementById('mcNetName').value.trim();
        const chainId = parseInt(document.getElementById('mcNetChainId').value, 10);
        const rpc = document.getElementById('mcNetRpc').value.trim();
        const errEl = document.getElementById('mcNetErr');
        if (!name || !chainId || chainId <= 0 || !/^https?:\/\//.test(rpc)) {
            errEl.textContent = '请填写完整：名称、正整数 Chain ID、以 http(s):// 开头的 RPC 地址';
            return;
        }
        errEl.textContent = '';
        const list = getNetworks();
        if (list.some(n => n.chainId === chainId && n.type === 'evm')) {
            errEl.textContent = '该 Chain ID 已存在，无需重复添加';
            return;
        }
        const id = 'custom_' + Date.now().toString(36);
        list.push({ id: id, name: name, chainId: chainId, symbol: (name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4) || 'CUS').toUpperCase(), rpc: rpc, type: 'evm', custom: true });
        saveNetworks(list);
        localStorage.setItem(LS_NETWORK_ACTIVE, id);
        document.getElementById('mcNetName').value = '';
        document.getElementById('mcNetChainId').value = '';
        document.getElementById('mcNetRpc').value = '';
        toast('✅ 已添加网络 ' + name);
        renderMultichain();
    }
    function removeCustomNetwork(id) {
        let list = getNetworks().filter(n => n.id !== id);
        if (!list.length) list = DEFAULT_NETWORKS.map(n => Object.assign({}, n));
        saveNetworks(list);
        if (activeNetworkId() === id) localStorage.setItem(LS_NETWORK_ACTIVE, 'nova');
        toast('已删除自定义网络');
        renderMultichain();
    }
    function renderCustomList() {
        const box = document.getElementById('mcCustomList');
        const customs = getNetworks().filter(n => n.custom);
        box.innerHTML = customs.length
            ? customs.map(n => '<span style="margin-right:.6rem;">' + escHtml(n.name) +
                ' <code>Chain ' + n.chainId + '</code> <a href="javascript:void(0)" onclick="removeCustomNetwork(\'' + n.id + '\')" style="color:var(--danger);">✕</a></span>').join('')
            : '（无，可在上方添加）';
    }
    async function evmRpc(network, method, params, timeoutMs) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs || 10000);
        try {
            const resp = await fetch(network.rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params || [] }),
                signal: ctl.signal
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (data.error) throw new Error(data.error.message || 'RPC 错误');
            return data.result;
        } finally { clearTimeout(t); }
    }
    async function fetchEvmBalance(network, addr) {
        const wei = await evmRpc(network, 'eth_getBalance', [addr, 'latest'], 9000);
        return BigInt(wei || '0x0');
    }
    function formatEvmAmount(bigintWei, decimals) {
        const d = decimals || 18;
        const s = bigintWei.toString().padStart(d + 1, '0');
        const intPart = s.slice(0, -d) || '0';
        let frac = s.slice(-d).replace(/0+$/, '');
        return frac ? intPart + '.' + frac : intPart;
    }
    function currentEvmKey() {
        const a = currentAccount();
        return (a && session.unlocked && session.evmKeys[a.id]) ? session.evmKeys[a.id] : '';
    }
    async function ensureEvmKeys() {
        const v = getVault();
        if (!v || !session.masterKey) return;
        let changed = false;
        for (let i = 0; i < v.accounts.length; i++) {
            const a = v.accounts[i];
            if (a.evmAddr && a.evmKey) {
                if (!session.evmKeys[a.id]) session.evmKeys[a.id] = await NovaCrypto.decryptWithMaster(session.masterKey, a.evmKey);
                continue;
            }
            let evmKey = null;
            if (a.mnemonic) {
                const mne = session.mnemonics[a.id] || (await NovaCrypto.decryptWithMaster(session.masterKey, a.mnemonic));
                if (mne) {
                    const seed = await NovaCrypto.mnemonicToSeed(mne, '');
                    evmKey = await NovaEVM.deriveEvmKey(seed, "m/44'/60'/0'/0/" + i);
                }
            }
            if (!evmKey) {
                // 无助记词账户：从 Nova 私钥确定性派生 EVM 密钥
                const priv = await NovaCrypto.decryptWithMaster(session.masterKey, a.key);
                evmKey = await NovaEVM.deriveEvmKey(hexToBytes(priv), "m/44'/60'/0'/0/0");
            }
            const evmHex = NovaEVM.bytesToHex(evmKey);
            a.evmKey = await NovaCrypto.encryptWithMaster(session.masterKey, evmHex);
            a.evmAddr = NovaEVM.toChecksumAddress(NovaEVM.privateKeyToAddress(evmKey));
            session.evmKeys[a.id] = evmHex;
            changed = true;
        }
        if (changed) saveVault(v);
    }
    async function renderMultichain() {
        const nets = getNetworks();
        const chips = document.getElementById('networkChips');
        chips.innerHTML = '';
        const activeId = activeNetworkId();
        for (const n of nets) {
            const b = document.createElement('button');
            b.className = 'btn-ghost btn-sm';
            b.textContent = n.name + (n.type === 'evm' ? ' · ' + n.symbol : '');
            b.style.margin = '0';
            if (n.id === activeId) {
                b.style.background = 'linear-gradient(120deg, rgba(0,240,255,.25), rgba(180,77,255,.25))';
                b.style.borderColor = 'rgba(0,240,255,.6)';
                b.style.color = 'var(--text)';
            }
            b.onclick = () => selectNetwork(n.id);
            chips.appendChild(b);
        }
        const cur = currentNetwork();
        const sendBtn = document.getElementById('mcEvmSendBtn');
        if (sendBtn) sendBtn.textContent = '✍️ 签名并发送' + (cur.type === 'evm' ? '（' + cur.symbol + '）' : '');
        document.getElementById('networkInfo').innerHTML =
            '当前网络：<strong>' + escHtml(cur.name) + '</strong> · Chain ID ' + cur.chainId +
            ' · RPC：<code>' + escHtml(cur.rpc || '本地节点') + '</code>';
        renderCustomList();
        renderAssets();
        renderWc();
    }
    async function renderAssets() {
        const a = currentAccount();
        const addrEl = document.getElementById('mcEvmAddr');
        const noteEl = document.getElementById('mcEvmNote');
        const box = document.getElementById('mcAssets');
        const nets = getNetworks();
        if (!a) {
            addrEl.textContent = '—';
            noteEl.textContent = '';
            box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>';
            return;
        }
        const evmAddr = a.evmAddr || '';
        addrEl.textContent = evmAddr || '（尚未生成：解锁钱包后自动派生）';
        noteEl.textContent = evmAddr
            ? '由同一种子按 BIP44 标准路径派生，支持 ETH / BSC / Polygon / 自定义 EVM 网络'
            : '解锁钱包后将自动派生 EVM 地址';
        box.innerHTML = '';
        const cells = {};
        for (const n of nets) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:.6rem; padding:.55rem .2rem; border-bottom:1px dashed var(--border);';
            const cell = document.createElement('span');
            cell.style.color = 'var(--dim)';
            cell.textContent = '加载中…';
            const left = document.createElement('span');
            left.innerHTML = '<strong>' + escHtml(n.name) + '</strong> <span class="tag">' +
                (n.type === 'evm' ? escHtml(n.symbol) + ' · Chain ' + n.chainId : 'NOVA') + '</span>';
            row.appendChild(left);
            row.appendChild(cell);
            box.appendChild(row);
            cells[n.id] = cell;
        }
        // Nova 资产（本地节点 / 演示回退）
        (async () => {
            const cell = cells['nova'];
            if (!cell) return;
            try {
                const d = await api('/api/balance/' + a.addr);
                const bal = (d && d.balance != null) ? d.balance : 0;
                cell.textContent = bal + ' NOVA';
            } catch (e) { cell.textContent = '获取失败'; }
        })();
        // EVM 资产（并行，任一失败不影响其他）
        for (const n of nets.filter(x => x.type === 'evm' && x.rpc)) {
            (async () => {
                const cell = cells[n.id];
                if (!cell) return;
                if (!evmAddr) { cell.textContent = '需解锁派生地址'; return; }
                try {
                    const wei = await fetchEvmBalance(n, evmAddr);
                    cell.textContent = formatEvmAmount(wei, 18) + ' ' + n.symbol;
                } catch (e) { cell.textContent = '离线 / RPC 不可用'; }
            })();
        }
    }
    function refreshMultichain() { renderMultichain(); }

    // ---- EVM 转账 / 合约调用（23 / 27） ----
    let evmTxPending = null;
    function parseNativeAmount(str, decimals) {
        const s = String(str || '').trim();
        if (!/^\d+(\.\d+)?$/.test(s)) return null;
        const parts = s.split('.');
        const f = parts[1] || '';
        if (f.length > decimals) return null;
        const d = BigInt(decimals);
        return BigInt(parts[0]) * (10n ** d) + BigInt(f.padEnd(decimals, '0') || '0');
    }
    async function evmEstimateGas(net, from, to, value, data) {
        try {
            const params = [{ from: from, to: to, value: '0x' + value.toString(16), data: data.length ? '0x' + NovaEVM.bytesToHex(data) : '0x' }];
            const g = await evmRpc(net, 'eth_estimateGas', params, 12000);
            return g || '0x5208';
        } catch (e) { return '0x5208'; }
    }
    async function buildEvmTx() {
        const net = currentNetwork();
        const from = currentAccount() ? currentAccount().evmAddr : '';
        const to = document.getElementById('mcEvmTo').value.trim();
        const amt = document.getElementById('mcEvmAmount').value.trim();
        const dataRaw = document.getElementById('mcEvmData').value.trim();
        if (net.type !== 'evm' || !net.rpc) throw new Error('当前不是 EVM 网络，请先在“网络”中切换到 EVM 网络');
        if (!NovaEVM.isAddress(to)) throw new Error('接收方地址格式无效（需 0x + 40 位十六进制）');
        if (!from) throw new Error('请先解锁钱包生成 EVM 地址');
        const value = parseNativeAmount(amt, 18);
        if (value === null || value <= 0n) throw new Error('金额格式无效（最多 18 位小数）');
        let data = new Uint8Array();
        if (dataRaw) {
            const clean = String(dataRaw).replace(/^0x/, '');
            if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) throw new Error('Calldata 需为偶数位十六进制（0x 可省略）');
            data = NovaEVM.hexToBytes(clean);
        }
        const decode = NovaEVM.decodeCalldata(NovaEVM.bytesToHex(data));
        const [nonce, gasPrice, gasLimit] = await Promise.all([
            evmRpc(net, 'eth_getTransactionCount', [from, 'pending'], 12000),
            evmRpc(net, 'eth_gasPrice', [], 12000),
            evmEstimateGas(net, from, NovaEVM.toChecksumAddress(to), value, data)
        ]);
        return {
            net: net, from: from, to: NovaEVM.toChecksumAddress(to), value: value, data: data, decode: decode,
            nonce: BigInt(nonce || '0x0'), gasPrice: BigInt(gasPrice || '0x0'), gasLimit: BigInt(gasLimit || '0x5208')
        };
    }
    async function startEvmSend() {
        const resEl = document.getElementById('mcEvmResult');
        resEl.textContent = '';
        try {
            if (!getVault() || !currentAccount()) { resEl.textContent = '请先创建或选择账户'; return; }
            if (!isUnlocked()) {
                const ok = await requireSessionUnlock('EVM 转账签名');
                if (!ok) { resEl.textContent = '已取消'; return; }
            }
            evmTxPending = await buildEvmTx();
            fillEvmPreview(evmTxPending);
            openModal('modal-evmpreview');
        } catch (e) { resEl.textContent = '⚠️ ' + (e.message || '构建交易失败'); }
    }
    function fillEvmPreview(p) {
        document.getElementById('evmNet').textContent = p.net.name + '（Chain ID ' + p.net.chainId + '）';
        document.getElementById('evmFrom').textContent = p.from;
        document.getElementById('evmTo').textContent = p.to;
        document.getElementById('evmAmount').textContent = formatEvmAmount(p.value, 18) + ' ' + p.net.symbol;
        const gasEth = p.gasLimit * p.gasPrice;
        document.getElementById('evmGas').textContent = formatEvmAmount(gasEth, 18) + ' ' + p.net.symbol +
            '（Gas ' + p.gasLimit + ' · 单价 ' + (p.gasPrice / 1000000000n).toString() + ' gwei）';
        const dec = p.decode;
        let decTxt;
        if (dec.signature.indexOf('普通转账') >= 0) {
            decTxt = '（普通原生代币转账，无合约调用）';
        } else {
            decTxt = dec.signature;
            if (dec.args && dec.args.length) {
                decTxt += '\n参数：' + dec.args.map((a, i) => (i + 1) + ') ' + String(a)).join('\n');
            }
        }
        document.getElementById('evmDecode').textContent = decTxt;
        const warns = [];
        if (dec.signature.indexOf('普通转账') < 0) {
            warns.push('⚠️ 这是一笔<strong>合约调用</strong>，将触发链上合约逻辑，请确认解析内容与你的意图一致');
        }
        const wEl = document.getElementById('evmWarn');
        wEl.style.display = warns.length ? '' : 'none';
        wEl.innerHTML = warns.join('<br>');
    }
    async function buildEvmTxFromRequest(net, from, to, value, dataHex) {
        const clean = String(dataHex || '').replace(/^0x/, '');
        const data = clean ? NovaEVM.hexToBytes(clean) : new Uint8Array();
        const decode = NovaEVM.decodeCalldata(NovaEVM.bytesToHex(data));
        const [nonce, gasPrice, gasLimit] = await Promise.all([
            evmRpc(net, 'eth_getTransactionCount', [from, 'pending'], 12000),
            evmRpc(net, 'eth_gasPrice', [], 12000),
            evmEstimateGas(net, from, NovaEVM.toChecksumAddress(to), value, data)
        ]);
        return {
            net: net, from: from, to: NovaEVM.toChecksumAddress(to), value: value, data: data, decode: decode,
            nonce: BigInt(nonce || '0x0'), gasPrice: BigInt(gasPrice || '0x0'), gasLimit: BigInt(gasLimit || '0x5208')
        };
    }
    async function signAndBroadcastEvm(p) {
        const evmKeyHex = currentEvmKey();
        if (!evmKeyHex) throw new Error('EVM 私钥不可用，请重试');
        const tx = { nonce: p.nonce, gasPrice: p.gasPrice, gasLimit: p.gasLimit, to: p.to, value: p.value, data: p.data, chainId: p.net.chainId };
        const signed = await NovaEVM.signLegacyEvmTx(tx, NovaEVM.hexToBytes(evmKeyHex));
        const txid = await evmRpc(p.net, 'eth_sendRawTransaction', [signed.raw], 20000);
        return { txid: String(txid), symbol: p.net.symbol };
    }
    async function evmPreviewConfirm() {
        const p = evmTxPending;
        evmTxPending = null;
        if (!p) return closeModal('modal-evmpreview');
        closeModal('modal-evmpreview');
        const resEl = document.getElementById('mcEvmResult');
        const auth = await requestUnlock('确认 EVM 签名', '将使用 ' + p.net.name + ' 网络签名并广播交易，请再次核对');
        if (!auth.ok) { resEl.textContent = '已取消（未解锁）'; return; }
        try {
            resEl.textContent = '签名中…';
            const r = await signAndBroadcastEvm(p);
            resEl.innerHTML = '✅ 已广播！交易哈希：<code>' + escHtml(r.txid) + '</code>';
            toast('✅ EVM 交易已广播（' + r.symbol + '）');
        } catch (e) {
            resEl.textContent = '⚠️ 广播失败：' + (e.message || '未知错误') + '（交易已完成签名，可稍后重试）';
        }
    }

    // ---- WalletConnect v2 演示（24） ----
    const LS_WC = 'nova_wc_session';
    let wcPending = null;
    function parseWcUri(uri) {
        const u = String(uri || '').trim();
        const m = u.match(/^wc:([0-9a-f]{64})@2\?([0-9a-zA-Z&=_-]+)$/);
        if (!m) return null;
        const sym = m[2].match(/symKey=([0-9a-fA-F]{128})/);
        if (!sym) return null;
        return { topic: m[1], version: '2', symKey: sym[1], raw: u };
    }
    function getWcSession() {
        try { const w = JSON.parse(localStorage.getItem(LS_WC) || 'null'); return w && w.topic ? w : null; } catch (e) { return null; }
    }
    function connectWc() {
        const uri = document.getElementById('wcUri').value.trim();
        const parsed = parseWcUri(uri);
        const errEl = document.getElementById('wcErr');
        if (!parsed) { errEl.textContent = '无效的 WalletConnect v2 URI（需 wc:64位topic@2?…symKey=128位hex）'; return; }
        errEl.textContent = '';
        localStorage.setItem(LS_WC, JSON.stringify(parsed));
        document.getElementById('wcUri').value = '';
        renderWc();
        toast('✅ 已配对（演示模式）');
    }
    function disconnectWc() {
        localStorage.removeItem(LS_WC);
        renderWc();
        toast('已断开配对');
    }
    function renderWc() {
        const wc = getWcSession();
        const statusEl = document.getElementById('wcStatus');
        const reqArea = document.getElementById('wcReqArea');
        if (!wc) {
            statusEl.innerHTML = '未配对。请复制 DApp 二维码中的 <code>wc:</code> URI 粘贴到上方（演示模式不接入官方中继）。';
            reqArea.style.display = 'none';
            return;
        }
        statusEl.innerHTML = '✅ 已配对（演示）· topic <code>' + wc.topic.slice(0, 12) + '…</code> · v' + wc.version +
            ' · <a href="javascript:void(0)" onclick="disconnectWc()" style="color:var(--danger);">断开</a>';
        reqArea.style.display = '';
    }
    function wcSimulateRequest(kind) {
        const wc = getWcSession();
        if (!wc) return alert('请先在上方完成配对');
        const a = currentAccount();
        if (!a || !a.evmAddr) return alert('请先创建/解锁账户生成 EVM 地址');
        const from = a.evmAddr;
        const low = from.slice(2).toLowerCase();
        let to, value = 0n, dataHex = '';
        if (kind === 'usdt') {
            to = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT 合约（演示）
            dataHex = '0xa9059cbb' + '000000000000000000000000' + low + '0000000000000000000000000000000000000000000000000000000005f5e100';
        } else if (kind === 'approve') {
            to = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
            dataHex = '0x095ea7b3' + '0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d' + 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
        } else {
            to = '0x' + 'ab'.repeat(20);
            value = 1000000000000000n; // 0.001 原生币
            dataHex = '';
        }
        wcPending = { domain: 'demo-dapp.io', kind: kind, from: from, to: to, value: value, dataHex: dataHex, net: currentNetwork() };
        openWcConfirm();
    }
    async function openWcConfirm() {
        const w = wcPending;
        if (!w) return;
        document.getElementById('wcDomain').textContent = w.domain;
        document.getElementById('wcNet').textContent = w.net.name + '（Chain ID ' + w.net.chainId + '）';
        document.getElementById('wcFrom').textContent = w.from;
        document.getElementById('wcTo').textContent = NovaEVM.toChecksumAddress(w.to);
        document.getElementById('wcAmount').textContent = formatEvmAmount(w.value, 18) + ' ' + w.net.symbol;
        const dec = NovaEVM.decodeCalldata(w.dataHex);
        let decTxt = dec.signature;
        if (dec.args && dec.args.length) {
            decTxt += '\n参数：' + dec.args.map((a, i) => (i + 1) + ') ' + String(a)).join('\n');
        }
        document.getElementById('wcDecode').textContent = decTxt;
        const warns = [];
        if (dec.signature.indexOf('普通转账') < 0) warns.push('⚠️ 合约调用：将触发链上合约逻辑，请确认解析内容');
        warns.push('⚠️ 演示模式：此请求为本地模拟；真实 DApp 请求需官方中继与项目 ID');
        const wEl = document.getElementById('wcWarn');
        wEl.style.display = warns.length ? '' : 'none';
        wEl.innerHTML = warns.join('<br>');
        document.getElementById('wcGas').textContent = '计算中…';
        openModal('modal-wc');
        try {
            const p = await buildEvmTxFromRequest(w.net, w.from, w.to, w.value, w.dataHex);
            wcPending.gasInfo = p;
            const gasEth = p.gasLimit * p.gasPrice;
            document.getElementById('wcGas').textContent = formatEvmAmount(gasEth, 18) + ' ' + p.net.symbol +
                '（Gas ' + p.gasLimit + '）';
        } catch (e) {
            document.getElementById('wcGas').textContent = '获取失败（RPC 不可用，演示请求仍可签名）';
        }
    }
    function wcReject() {
        wcPending = null;
        closeModal('modal-wc');
        toast('已拒绝 DApp 请求');
    }
    async function wcConfirmOk() {
        const w = wcPending;
        wcPending = null;
        if (!w) return closeModal('modal-wc');
        closeModal('modal-wc');
        const resEl = document.getElementById('mcEvmResult');
        const auth = await requestUnlock('确认 DApp 签名请求', '来自 ' + w.domain + ' 的 eth_sendTransaction 请求，确认后签名并广播');
        if (!auth.ok) { resEl.textContent = '已取消（未解锁）'; return; }
        try {
            resEl.textContent = '签名中…';
            const p = w.gasInfo || await buildEvmTxFromRequest(w.net, w.from, w.to, w.value, w.dataHex);
            const r = await signAndBroadcastEvm(p);
            resEl.innerHTML = '✅ WalletConnect 请求已签名并广播！交易哈希：<code>' + escHtml(r.txid) + '</code>';
            toast('✅ DApp 请求已执行（' + r.symbol + '）');
        } catch (e) {
            resEl.textContent = '⚠️ WalletConnect 广播失败：' + (e.message || '未知错误') + '（已拒绝签名内容确认，请勿轻信陌生 DApp）';
        }
    }


    // ============================================================
    // 资产与收益（28/29/30/31）：资产分类 / NFT 可视化 / 收益统计 / 早期激励
    // ============================================================
    const LS_CHECKIN_DATE = 'nova_checkin_date';
    const LOCK_DURATION_MS = 3 * 365 * 86400 * 1000;
    const BLOCKS_PER_YEAR = Math.floor(365 * 86400 / 60); // 节点出块间隔 60s
    const CHECKIN_GOAL = 270;

    async function fetchEarlyInfo(addr) {
        try {
            const d = await api('/api/early/info?addr=' + encodeURIComponent(addr));
            return (d && !d.error) ? d : null;
        } catch (e) { return null; }
    }
    async function fetchStakeStats() {
        try {
            const d = await api('/api/stakes');
            return (d && !d.error) ? d : null;
        } catch (e) { return null; }
    }
    async function fetchNodeStats() {
        try {
            const d = await api('/api/stats');
            return (d && !d.error) ? d : null;
        } catch (e) { return null; }
    }
    function ownedNftIds(addr) {
        try {
            const o = JSON.parse(localStorage.getItem('nova_nft_owned') || '{}');
            return (o[addr] || []).filter(Boolean);
        } catch (e) { return []; }
    }
    function localNftStore() {
        try { return JSON.parse(localStorage.getItem('nova_nft_store') || '{}'); } catch (e) { return {}; }
    }
    function myNftTokens(addr) {
        const ids = ownedNftIds(addr);
        const store = localNftStore();
        const out = [], seen = {};
        const low = String(addr || '').toLowerCase();
        ids.forEach(id => { const t = store[id]; if (t && !seen[t.id]) { seen[t.id] = 1; out.push(t); } });
        Object.keys(store).forEach(id => {
            const t = store[id];
            if (t && !seen[t.id] && t.owner && String(t.owner).toLowerCase() === low) { seen[t.id] = 1; out.push(t); }
        });
        return out;
    }
    function nftCardHtml(t) {
        const art = String(t.art || '💠');
        const isImg = /^(https?:|data:)/.test(art);
        const artHtml = isImg
            ? '<div style="font-size:2.4rem; text-align:center; padding:.5rem 0;"><span style="font-size:.72rem; color:var(--dim);">🖼 图片</span></div>'
            : '<div style="font-size:2.4rem; text-align:center; padding:.5rem 0;">' + art + '</div>';
        return '<div style="background:rgba(13,16,36,.55); border:1px solid var(--border); border-radius:12px; padding:.6rem;">' +
            artHtml +
            '<div style="font-weight:700; font-size:.8rem; word-break:break-all;">' + escHtml(t.name || '未命名') + '</div>' +
            '<div style="font-size:.68rem; color:var(--dim); margin:.2rem 0 .4rem; word-break:break-all;">' + escHtml(String(t.desc || '').slice(0, 42)) + '</div>' +
            '<div style="font-size:.68rem;"><span class="tag">' + (t.price != null ? escHtml(String(t.price)) + ' NOVA' : '—') + '</span>' +
            (t.creator ? ' <span class="tag">' + escHtml(String(t.creator).slice(0, 8)) + '…</span>' : '') + '</div></div>';
    }
    async function renderAssetTokens(box, addr, evmAddr) {
        if (!addr) { box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>'; return; }
        const nets = getNetworks().filter(n => n.type === 'evm' && n.rpc);
        const rows = [['NOVA（本地链）', 'ast-nova']];
        nets.forEach(n => rows.push([n.name + '（' + n.symbol + '）', 'ast-evm-' + n.id]));
        box.innerHTML = rows.map(r =>
            '<div style="display:flex; justify-content:space-between; gap:.6rem; padding:.5rem .1rem; border-bottom:1px dashed var(--border);">' +
            '<span>' + escHtml(r[0]) + '</span><span id="' + r[1] + '" style="color:var(--dim);">加载中…</span></div>').join('');
        (async () => {
            const el = document.getElementById('ast-nova');
            if (!el) return;
            try {
                const d = await api('/api/balance/' + addr);
                el.textContent = ((d && d.balance != null) ? d.balance : 0) + ' NOVA';
            } catch (e) { el.textContent = '获取失败'; }
        })();
        if (!evmAddr) {
            nets.forEach(n => { const el = document.getElementById('ast-evm-' + n.id); if (el) el.textContent = '需解锁派生'; });
            return;
        }
        nets.forEach(n => {
            (async () => {
                const el = document.getElementById('ast-evm-' + n.id);
                if (!el) return;
                try {
                    const w = await fetchEvmBalance(n, evmAddr);
                    el.textContent = formatEvmAmount(w, 18) + ' ' + n.symbol;
                } catch (e) { el.textContent = '离线 / RPC 不可用'; }
            })();
        });
    }
    async function renderAssetNfts(box, addr) {
        if (!addr) { box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>'; return; }
        const items = [];
        myNftTokens(addr).forEach(t => items.push({
            name: t.name, desc: t.desc, art: t.art, price: t.price, creator: t.creator
        }));
        try {
            const d = await api('/api/socialfi/fraction');
            if (d && !d.error && typeof d === 'object') {
                Object.keys(d).forEach(k => {
                    const f = d[k];
                    if (f && f.owner && String(f.owner).toLowerCase() === String(addr).toLowerCase()) {
                        items.push({
                            name: f.name || '碎片 NFT', desc: '碎片化 NFT · 总量 ' + (f.supply != null ? f.supply : '—') + ' · 持有 ' + (f.owner_hold != null ? f.owner_hold : '—'),
                            art: '🧩', price: f.price_per, creator: f.owner
                        });
                    }
                });
            }
        } catch (e) { /* 节点不可用仅展示本地收藏 */ }
        if (!items.length) {
            box.innerHTML = '<div class="contact-empty">暂无 NFT 收藏<br>可在「NFT」应用铸造或购买</div>';
            return;
        }
        box.innerHTML = '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:.6rem;">' +
            items.map(nftCardHtml).join('') + '</div>';
    }
    async function renderAssetTexts(box, addr) {
        if (!addr) { box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>'; return; }
        try {
            const d = await api('/api/socialfi/text');
            if (!d || d.error || !d.assets) {
                box.innerHTML = '<div class="contact-empty">未连接节点，密文资产数据不可用</div>';
                return;
            }
            const all = Object.keys(d.assets).map(k => d.assets[k]).filter(Boolean);
            const low = String(addr).toLowerCase();
            const mine = all.filter(a => a.author && String(a.author).toLowerCase() === low);
            const bought = all.filter(a => Array.isArray(a.buyers) && a.buyers.some(b => String(b).toLowerCase() === low));
            if (!mine.length && !bought.length) {
                box.innerHTML = '<div class="contact-empty">暂无密文资产<br>可在「文字」应用发布付费 / 加密内容</div>';
                return;
            }
            const rows = [];
            mine.forEach(a => rows.push(
                '📝 我发布：<strong>' + escHtml(a.title || '未命名') + '</strong> · ' + escHtml(String(a.price != null ? a.price : 0)) + ' NOVA · ' +
                (a.visibility === 'sealed' ? '🔒 加密' : '公开') + ' · ' + (a.buyers ? a.buyers.length : 0) + ' 位购买者'));
            bought.forEach(a => rows.push(
                '🔑 我购买：<strong>' + escHtml(a.title || '未命名') + '</strong> · 作者 ' + escHtml(String(a.author || '').slice(0, 8)) + '…'));
            box.innerHTML = rows.map(r => '<div style="padding:.45rem .1rem; border-bottom:1px dashed var(--border); font-size:.8rem;">' + r + '</div>').join('');
        } catch (e) { box.innerHTML = '<div class="contact-empty">加载失败</div>'; }
    }
    async function renderEarnings(box, addr) {
        if (!addr) { box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>'; return; }
        const [stakes, stats, early] = await Promise.all([fetchStakeStats(), fetchNodeStats(), fetchEarlyInfo(addr)]);
        if (!stakes && !stats && !early) {
            box.innerHTML = '<div class="contact-empty">未连接节点，收益数据不可用（演示模式）</div>';
            return;
        }
        const myStake = (stakes && stakes.stakes) ? (stakes.stakes[addr] || 0) : 0;
        const total = (stakes && stakes.total) || 0;
        const blockReward = (stats && stats.block_reward) || 0;
        const share = total > 0 ? myStake / total : 0;
        const estAnnual = blockReward * BLOCKS_PER_YEAR * share;
        const apy = myStake > 0 ? (estAnnual / myStake * 100) : 0;
        const referralCount = (early && early.referral_count) || 0;
        const referralReward = (stats && stats.referral_reward) || 0;
        const rows = [
            ['质押中', myStake + ' NOVA'],
            ['全网质押', total + ' NOVA'],
            ['预计质押年化收益', estAnnual.toFixed(4) + ' NOVA（约 ' + apy.toFixed(1) + '%）'],
            ['推荐奖励（单笔）', referralReward + ' NOVA'],
            ['我的邀请', referralCount + ' 人 · 预计 ' + (referralCount * referralReward).toFixed(2) + ' NOVA'],
        ];
        if (stats) {
            rows.push(['区块奖励（当前）', blockReward + ' NOVA/块']);
            rows.push(['合约部署奖励', stats.deploy_reward + ' NOVA/次']);
            rows.push(['存储奖励', stats.storage_reward_per_gb_day + ' NOVA/GB/天（证明 ' + stats.storage_proof_reward + ' NOVA/份）']);
            rows.push(['创作挖矿', (early && early.miner_registered)
                ? '矿机在线约 ' + Number(early.miner_uptime_days || 0).toFixed(1) + ' 天'
                : '未注册矿机（可在生态应用内注册）']);
        }
        box.innerHTML = rows.map(r =>
            '<div style="display:flex; justify-content:space-between; gap:.6rem; padding:.45rem .1rem; border-bottom:1px dashed var(--border);">' +
            '<span>' + escHtml(r[0]) + '</span><span style="color:var(--dim);">' + escHtml(r[1]) + '</span></div>').join('');
    }
    function fmtDuration(ms) {
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        return d + ' 天 ' + h + ' 小时';
    }
    async function renderEarly(box, addr) {
        if (!addr) { box.innerHTML = '<div class="contact-empty">请先创建或选择账户</div>'; return; }
        const early = await fetchEarlyInfo(addr);
        if (!early) {
            box.innerHTML = '<div class="contact-empty">未连接节点，早期激励数据不可用（演示模式）</div>';
            return;
        }
        const days = early.light_checkin_days || 0;
        const today = new Date().toISOString().slice(0, 10);
        const checkedToday = localStorage.getItem(LS_CHECKIN_DATE) === today;
        const lockAmt = early.locked_balance || 0;
        const lockStart = early.lock_start_time || 0;
        let lockHtml;
        if (lockAmt > 0 && lockStart > 0) {
            const elapsed = Math.max(0, Date.now() - lockStart * 1000);
            const remaining = Math.max(0, LOCK_DURATION_MS - elapsed);
            const pct = Math.min(100, elapsed / LOCK_DURATION_MS * 100);
            lockHtml = '锁仓 <strong>' + lockAmt + ' NOVA</strong>（3 年期）· 已解锁 ' + (early.lock_unlocked || 0) +
                ' · 剩余约 ' + fmtDuration(remaining) +
                '<div style="height:8px; border-radius:99px; background:rgba(255,255,255,.08); margin-top:.4rem;"><div style="height:8px; border-radius:99px; width:' + pct.toFixed(1) + '%; background:linear-gradient(120deg, rgba(0,240,255,.9), rgba(180,77,255,.9));"></div></div>';
        } else if (lockAmt > 0) {
            lockHtml = '锁仓 ' + lockAmt + ' NOVA（已解锁 ' + (early.lock_unlocked || 0) + '）';
        } else {
            lockHtml = '无锁仓（完成签到 / 矿工激励后可获得 100 NOVA 锁仓空投）';
        }
        const badges = [];
        if (early.miner_qualified) badges.push('⛏ 矿工达标');
        if (early.light_qualified) badges.push('🌱 轻节点达标');
        const barPct = Math.min(100, days / CHECKIN_GOAL * 100).toFixed(1);
        box.innerHTML =
            '<div style="padding:.45rem .1rem; border-bottom:1px dashed var(--border);">签到天数：<strong>' + days + ' / ' + CHECKIN_GOAL + '</strong> 天' +
            (badges.length ? ' · ' + badges.join(' ') : '') +
            '<div style="height:8px; border-radius:99px; background:rgba(255,255,255,.08); margin-top:.4rem;"><div style="height:8px; border-radius:99px; width:' + barPct + '%; background:linear-gradient(120deg, rgba(0,240,255,.9), rgba(180,77,255,.9));"></div></div></div>' +
            '<div style="padding:.45rem .1rem; border-bottom:1px dashed var(--border);">锁仓进度：' + lockHtml + '</div>' +
            '<div style="padding:.45rem .1rem;" id="checkinRow">' +
            (checkedToday ? '✅ 今日已签到' : '<button class="btn-sm" onclick="doCheckin()">📅 今日签到</button>') + '</div>';
    }
    async function doCheckin() {
        const a = currentAccount();
        if (!a) return alert('请先创建或选择账户');
        const res = await api('/api/checkin', 'POST', { addr: a.addr });
        if (res && res.error) { alert(res.error); return; }
        localStorage.setItem(LS_CHECKIN_DATE, new Date().toISOString().slice(0, 10));
        toast('✅ 签到成功：累计 ' + (res && res.total_days != null ? res.total_days : '—') + ' 天');
        refreshAssetPanel();
    }
    function renderAssetPanel() {
        const a = currentAccount();
        const addr = a ? a.addr : '';
        const evmAddr = a ? (a.evmAddr || '') : '';
        renderAssetTokens(document.getElementById('assetTokens'), addr, evmAddr);
        renderAssetNfts(document.getElementById('assetNfts'), addr);
        renderAssetTexts(document.getElementById('assetTexts'), addr);
        renderEarnings(document.getElementById('earningsBox'), addr);
        renderEarly(document.getElementById('earlyBox'), addr);
    }
    function refreshAssetPanel() { renderAssetPanel(); }

    // ============================================================
    // 导航与初始化
    // ============================================================
    function bindNav() {
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
    }

    function bindReveal() {
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
        }, { threshold: .1 });
        document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    }

    async function init() {
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
    }
    // ============================================================
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
            privacyBtn: '🛡 隐私', privacyTitle: '🔒 隐私政策',
            privacyP1: '1 · 不收集：本钱包不收集、不上传任何个人身份信息、浏览记录或遥测数据。',
            privacyP2: '2 · 本地存储：私钥与助记词经 AES-256 加密后仅保存在你的浏览器 localStorage，不会离开你的设备。',
            privacyP3: '3 · 链上公开：签名后的交易会广播到你连接的节点，链上记录对所有人公开，这是区块链固有特性。',
            privacyP4: '4 · 第三方资源：页面加载 Google Fonts 等公共资源时会发起网络请求，其中不含你的任何数据。',
            privacyP5: '5 · 清除数据：清除浏览器中本站点数据即可永久删除本钱包的全部本地记录。',
            privacyClose: '知道了',
            disclaimerTx: '⚠️ 交易一旦广播不可撤销，请再次核对接收方与金额；因用户操作失误造成的损失，本钱包不承担。',
            mneWarn: '🔴 防截图警示：这是恢复钱包的唯一凭证。请离线抄写纸质备份，勿截图、勿发聊天/网盘。',
            ssGuardToast: '⚠️ 检测到截图/保存操作：助记词请勿截图，请离线抄写！',
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
            privacyBtn: '🛡 Privacy', privacyTitle: '🔒 Privacy Policy',
            privacyP1: '1 · No tracking: this wallet does not collect or upload personal information, browsing history, or telemetry.',
            privacyP2: '2 · Local storage: keys and mnemonics are AES-256 encrypted and kept only in your browser localStorage — they never leave your device.',
            privacyP3: '3 · Public on-chain: signed transactions are broadcast to the node you connect to; on-chain records are public by design.',
            privacyP4: '4 · Third-party assets: loading public resources like Google Fonts sends network requests that contain none of your data.',
            privacyP5: '5 · Erase data: clearing all wallet data for this site permanently deletes local records.',
            privacyClose: 'Got it',
            disclaimerTx: '⚠️ Transactions are irreversible once broadcast — re-check the recipient and amount; this wallet is not liable for losses caused by user mistakes.',
            mneWarn: '🔴 Anti-screenshot warning: this is your only recovery credential. Write it offline on paper — never screenshot or send it via chat/cloud.',
            ssGuardToast: '⚠️ Screenshot/save detected: never screenshot your mnemonic — write it offline!',
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
    // 41 · 助记词防截图：检测 PrintScreen / Ctrl+S 保存
    let screenshotGuardOn = false;
    function setScreenshotGuard(on) { screenshotGuardOn = !!on; }
    window.addEventListener('keydown', (e) => {
        if (!screenshotGuardOn) return;
        if (e.key === 'PrintScreen' || (e.ctrlKey && (e.key === 's' || e.key === 'S'))) {
            toast(t('ssGuardToast'));
            e.preventDefault();
        }
    });
    // 39 · 隐私政策入口
    function openPrivacy() { openModal('modal-privacy'); }
    document.addEventListener('DOMContentLoaded', init);
