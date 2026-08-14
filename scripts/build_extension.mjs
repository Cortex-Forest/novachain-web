/* 构建 Chrome 扩展包：wallet.html 内联 JS 外置为 wallet-app.js（MV3 禁内联脚本），并复制依赖 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
const ROOT = 'C:/Users/Administrator/novachain-web';
const EXT = ROOT + '/browser-extension';
const html = readFileSync(ROOT + '/wallet.html', 'utf8');
const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const blocks = [];
let m;
while ((m = inlineRe.exec(html)) !== null) blocks.push({ full: m[0], code: m[1] });
if (!blocks.length) throw new Error('未找到内联脚本块');
writeFileSync(EXT + '/wallet-app.js', blocks.map(b => b.code).join('\n'), 'utf8');
let out = html;
blocks.forEach((b, i) => {
  const last = i === blocks.length - 1;
  out = out.replace(b.full, last ? '\n    <script src="./wallet-app.js"></script>' : '');
});
out = out.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'");
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.test(out)) throw new Error('副本仍含内联脚本');
writeFileSync(EXT + '/wallet.html', out, 'utf8');
for (const f of ['apps-common.js', 'wallet-crypto.js', 'wallet-evm.js']) {
  copyFileSync(ROOT + '/' + f, EXT + '/' + f);
}
for (const f of ['wallet.html', 'wallet-app.js', 'apps-common.js', 'wallet-crypto.js', 'wallet-evm.js', 'manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png']) {
  if (!existsSync(EXT + '/' + f)) throw new Error('缺少 ' + f);
}
console.log('✅ 扩展构建完成，内联脚本块数=' + blocks.length);
