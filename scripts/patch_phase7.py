# -*- coding: utf-8 -*-
"""wallet.html 阶段七改造（39-42 项）。锚点唯一校验，失败即中止不写入。"""
import sys
PATH = r"C:\Users\Administrator\novachain-web\wallet.html"
with open(PATH, "r", encoding="utf-8", newline="") as f:
    content = f.read()
steps = []
def rep(name, old, new):
    steps.append((name, old, new))

# ============ A1. CSS：防截图水印 / 免责声明 / 隐私滚动区 ============
rep("A1 CSS 阶段七样式", '    </style>',
'''        /* ===== 阶段七 · 39-41：隐私 / 免责声明 / 防截图 ===== */
        .mn-guard {
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='90'><text x='6' y='26' font-size='15' fill='rgba(255,77,106,.28)' transform='rotate(-16 75 45)'>%E8%AF%B7%E5%8B%BF%E6%88%AA%E5%9B%BE</text><text x='6' y='62' font-size='15' fill='rgba(255,77,106,.28)' transform='rotate(-16 75 45)'>%E8%AF%B7%E5%8B%BF%E6%88%AA%E5%9B%BE</text></svg>");
            background-repeat: repeat;
        }
        .disclaimer { font-size: .74rem; color: var(--dim); border: 1px dashed var(--border-strong); border-radius: 10px; padding: .55rem .7rem; margin: .6rem 0 .2rem; line-height: 1.6; }
        .privacy-scroll { max-height: 46vh; overflow-y: auto; border: 1px solid var(--border); border-radius: 12px; padding: .6rem .9rem; margin: .4rem 0 .6rem; }
        .privacy-scroll .footnote { margin-top: .5rem; }
    </style>''')

# ============ A2. 顶栏隐私按钮 ============
rep("A2 隐私按钮", '''                <button class="icon-btn" id="langBtn" onclick="toggleLang()" type="button" title="切换语言">🌐 EN</button>
                <span class="net-chip" id="netBadge" hidden>📡 <span id="netBadgeText">离线</span></span>''',
'''                <button class="icon-btn" id="langBtn" onclick="toggleLang()" type="button" title="切换语言">🌐 EN</button>
                <button class="icon-btn" id="privacyBtn" onclick="openPrivacy()" type="button" data-i18n="privacyBtn" title="隐私政策">🛡 隐私</button>
                <span class="net-chip" id="netBadge" hidden>📡 <span id="netBadgeText">离线</span></span>''')

# ============ A3. 助记词模态框：防截图警示 + 水印 ============
rep("A3 助记词警示+水印", '''            <p class="footnote">这是恢复钱包的<strong>唯一凭证</strong>。请离线抄写，不要截图、不要发到网上、不要告诉任何人。</p>
            <div class="mnemonic-grid" id="mnemonicGrid"></div>''',
'''            <p class="footnote">这是恢复钱包的<strong>唯一凭证</strong>。请离线抄写，不要截图、不要发到网上、不要告诉任何人。</p>
            <div class="warning" style="margin-top:.7rem;" data-i18n="mneWarn">🔴 防截图警示：这是恢复钱包的唯一凭证。请离线抄写纸质备份，勿截图、勿发聊天/网盘。</div>
            <div class="mnemonic-grid mn-guard" id="mnemonicGrid"></div>''')

# ============ A4. 导出模态框水印 ============
rep("A4 导出网格水印", '            <div class="mnemonic-grid" id="exportGrid" style="display:none;"></div>',
    '            <div class="mnemonic-grid mn-guard" id="exportGrid" style="display:none;"></div>')

# ============ A5/A6. 交易免责声明（Nova + EVM 预览） ============
rep("A5 Nova 预览免责声明", '            <div class="warning" id="txpWarn" style="display:none;"></div>',
'''            <div class="warning" id="txpWarn" style="display:none;"></div>
            <div class="disclaimer" data-i18n="disclaimerTx">⚠️ 交易一旦广播不可撤销，请再次核对接收方与金额；因用户操作失误造成的损失，本钱包不承担。</div>''')
rep("A6 EVM 预览免责声明", '            <div class="warning" id="evmWarn" style="display:none;"></div>',
'''            <div class="warning" id="evmWarn" style="display:none;"></div>
            <div class="disclaimer" data-i18n="disclaimerTx">⚠️ 交易一旦广播不可撤销，请再次核对接收方与金额；因用户操作失误造成的损失，本钱包不承担。</div>''')

# ============ A7. 隐私政策模态框（39） ============
rep("A7 隐私政策模态框", '        <div class="toast" id="toast" role="status" aria-live="polite"></div>',
'''    <!-- ====== 模态框：隐私政策（39） ====== -->
    <div class="modal-mask" id="modal-privacy" hidden>
        <div class="modal">
            <h3 data-i18n="privacyTitle">🔒 隐私政策</h3>
            <div class="privacy-scroll">
                <p class="footnote" data-i18n="privacyP1">1 · 不收集：本钱包不收集、不上传任何个人身份信息、浏览记录或遥测数据。</p>
                <p class="footnote" data-i18n="privacyP2">2 · 本地存储：私钥与助记词经 AES-256 加密后仅保存在你的浏览器 localStorage，不会离开你的设备。</p>
                <p class="footnote" data-i18n="privacyP3">3 · 链上公开：签名后的交易会广播到你连接的节点，链上记录对所有人公开，这是区块链固有特性。</p>
                <p class="footnote" data-i18n="privacyP4">4 · 第三方资源：页面加载 Google Fonts 等公共资源时会发起网络请求，其中不含你的任何数据。</p>
                <p class="footnote" data-i18n="privacyP5">5 · 清除数据：清除浏览器中本站点数据即可永久删除本钱包的全部本地记录。</p>
            </div>
            <div class="m-actions">
                <button class="btn-sm" onclick="closeModal('modal-privacy')" data-i18n="privacyClose">知道了</button>
            </div>
        </div>
    </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>''')
# ============ B1. 助记词模态框启用防截图 ============
rep("B1 助记词模态框启用守卫", '''        openModal('modal-mnemonic');
    }''',
'''        openModal('modal-mnemonic');
        setScreenshotGuard(true); // 41 · 助记词防截图
    }''')

# ============ B2. 导出模态框启用防截图 ============
rep("B2 导出模态框启用守卫", '''        openModal('modal-export');
    }''',
'''        openModal('modal-export');
        setScreenshotGuard(true); // 41 · 助记词防截图
    }''')

# ============ B3. closeModal 关闭守卫 ============
rep("B3 closeModal 关闭守卫", '''    function closeModal(id) {
        if (id === 'modal-export') {''',
'''    function closeModal(id) {
        if (id === 'modal-mnemonic' || id === 'modal-export') setScreenshotGuard(false);
        if (id === 'modal-export') {''')

# ============ B4. 防截图守卫 + 隐私入口 ============
rep("B4 防截图守卫+openPrivacy", '''    function bindNetEvents() {
        window.addEventListener('offline', () => { netOnline = false; updateNetBadge(); toast(t('offlineNotice')); fetchBalance(); });
        window.addEventListener('online', () => { netOnline = true; updateNetBadge(); toast(t('onlineNotice')); checkNode(); fetchBalance(); });
        updateNetBadge();
    }
    document.addEventListener('DOMContentLoaded', init);''',
'''    function bindNetEvents() {
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
    document.addEventListener('DOMContentLoaded', init);''')

# ============ B5/B6. i18n 新键（zh/en 同步） ============
rep("B5 i18n zh 键", '''            netAria: '主导航'
        },''',
'''            privacyBtn: '🛡 隐私', privacyTitle: '🔒 隐私政策',
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
        },''')
rep("B6 i18n en 键", '''            netAria: 'Main navigation'
        }''',
'''            privacyBtn: '🛡 Privacy', privacyTitle: '🔒 Privacy Policy',
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
        }''')

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
print("✅ 已写入 wallet.html（阶段七）")
