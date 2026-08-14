/* 阶段六（32-38）静态校验：i18n 键一致性 / 主题 / 引导 / 无障碍 / 去 CDN / 离线缓存 */
import { readFileSync } from 'node:fs';
const html = readFileSync('wallet.html', 'utf8');
let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.error('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}
// ---------- 37 加载优化 ----------
check('已移除 jsdelivr CDN 脚本', !html.includes('jsdelivr'), 'jsdelivr 仍存在');
check('CSP 不再允许 jsdelivr', !html.includes("script-src 'self' https://cdn.jsdelivr.net"));
check('本地 SHA3-256 兜底存在', html.includes('window.sha3_256 = sha3_256;'));
check('保留 apps-common 本地脚本', html.includes('<script src="./apps-common.js"></script>'));
// ---------- 35 主题 ----------
check('html 默认 data-theme=auto', html.includes('<html lang="zh" data-theme="auto">'));
check('亮色主题 CSS 块存在', html.includes('html[data-theme="light"] {'));
check('theme-color meta 可切换', html.includes("meta.setAttribute('content', th === 'light' ? '#eef2fb' : '#030309')"));
check('color-scheme meta', html.includes('<meta name="color-scheme" content="dark light">'));
// ---------- 32 首次引导 ----------
check('引导层 onboardMask 存在', html.includes('id="onboardMask"'));
check('引导 3 个步骤', html.includes('data-step="1"') && html.includes('data-step="2"') && html.includes('data-step="3"'));
check('引导关闭写入标记', html.includes("localStorage.setItem('nova_onboarded', '1')"));
// ---------- 36 国际化 ----------
const zhBlock = html.match(/const I18N = \{\s*zh: \{(.*?)\n        \},\s*en: \{/s);
const enBlock = html.match(/\n        en: \{(.*?)\n        \}\s*};/s);
function keysOf(body) {
  return body.split(',').map(seg => /^\s*([A-Za-z0-9_]+): '/.exec(seg)).filter(Boolean).map(m => m[1]);
}
const zhKeys = zhBlock ? keysOf(zhBlock[1]) : [];
const enKeys = enBlock ? keysOf(enBlock[1]) : [];
const dataKeys = [...html.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)].map(m => m[1]);
const dataPhKeys = [...html.matchAll(/data-i18n-ph="([A-Za-z0-9_]+)"/g)].map(m => m[1]);
const dataHtmlKeys = [...html.matchAll(/data-i18n-html="([A-Za-z0-9_]+)"/g)].map(m => m[1]);
check('i18n 字典提取成功', zhKeys.length > 40 && enKeys.length === zhKeys.length, `zh=${zhKeys.length} en=${enKeys.length}`);
check('zh/en 键集合一致', [...zhKeys].sort().join(',') === [...enKeys].sort().join(','));
check('data-i18n 键都在字典中', dataKeys.every(k => zhKeys.includes(k)), dataKeys.filter(k => !zhKeys.includes(k)).join(','));
check('data-i18n-ph 键都在字典中', dataPhKeys.every(k => zhKeys.includes(k)), dataPhKeys.filter(k => !zhKeys.includes(k)).join(','));
check('data-i18n-html 键都在字典中', dataHtmlKeys.every(k => zhKeys.includes(k)), dataHtmlKeys.filter(k => !zhKeys.includes(k)).join(','));
check('语言切换函数存在', html.includes('function setLang(') && html.includes('function toggleLang()') && html.includes('function applyLang()'));
check('语言按钮 langBtn', html.includes('id="langBtn"'));
// ---------- 34 离线 ----------
check('离线缓存键 nova_balance_cache', html.includes("localStorage.getItem('nova_balance_cache')"));
check('isOffline 支持强制离线', html.includes('window.__forceOffline === true'));
check('netBadge 离线徽标', html.includes('id="netBadge"'));
check('balCacheTag 缓存标记', html.includes('id="balCacheTag"'));
check('offline/online 事件监听', html.includes("addEventListener('offline'") && html.includes("addEventListener('online'"));
// ---------- 33 错误友好化 ----------
check('friendlyTxError 网络/超时映射', html.includes("t('errNetwork')") && html.includes("t('errTimeout')"));
// ---------- 38 无障碍 ----------
check('背景元素 aria-hidden', html.includes('<div id="bg-aurora" aria-hidden="true">'));
check('toast role=status', html.includes('class="toast" id="toast" role="status" aria-live="polite"'));
check('nav role=tablist', html.includes('role="tablist"'));
check('focus-visible 样式', html.includes(':focus-visible { outline: 3px solid'));
check('prefers-reduced-motion', html.includes('prefers-reduced-motion: reduce'));
check('prefers-contrast', html.includes('prefers-contrast: more'));
check('sr-only', html.includes('.sr-only'));
check('模态框 aria-modal', html.includes("el.setAttribute('aria-modal', 'true')"));
check('地址框键盘可操作', html.includes('onkeydown="if(event.key==='));
check('锁状态文本走 i18n', html.includes("t('lockUnlocked')") && html.includes("t('lockLocked')"));
// ---------- 阶段七（39-42） ----------
check('隐私政策入口按钮', html.includes('id="privacyBtn"') && html.includes('function openPrivacy()'));
check('隐私政策模态框', html.includes('id="modal-privacy"') && html.includes('data-i18n="privacyP1"'));
check('交易免责声明（Nova 预览）', html.includes('class="disclaimer" data-i18n="disclaimerTx"') && html.includes('id="txpWarn"'));
check('交易免责声明（EVM 预览）', html.includes('id="evmWarn"'));
check('助记词防截图警示', html.includes('data-i18n="mneWarn"'));
check('助记词网格水印', (html.match(/mn-guard/g) || []).length >= 2, 'mn-guard 数量');
check('防截图守卫函数', html.includes('function setScreenshotGuard(') && html.includes('screenshotGuardOn'));
check('防截图键检测', html.includes("e.key === 'PrintScreen'"));
check('无遥测/分析/上报代码', !html.includes('sendBeacon') && !html.includes('sentry') && !html.includes('google-analytics'));

console.log('\n' + (failed ? '❌ UI 静态校验失败 ' + failed + ' / 通过 ' + passed : '✅ UI 静态校验通过 (' + passed + ')'));
process.exit(failed ? 1 : 0);
