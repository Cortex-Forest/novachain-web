/* 一次性补丁：js-sha3 CDN 依赖 → 本地 lib/sha3.js 自托管，并从 CSP 移除 cdn.jsdelivr.net。
 * 用法：node scripts/patch_sha3_local.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = 'C:/Users/Administrator/novachain-web';
const JS_DELIVR_RE = /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/js-sha3[^"]*"[^>]*><\/script>/;
const CSP_RE = /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'unsafe-inline'/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'browser-extension') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}
function relPath(file) {
  // file 为 Windows 绝对路径（反斜杠分隔），转换为正斜杠后取目录
  const norm = file.replace(/\\/g, '/');
  const fileDir = norm.slice(0, norm.lastIndexOf('/')) || ROOT;
  let r = relative(fileDir, join(ROOT, 'lib')).replace(/\\/g, '/');
  if (r && !r.startsWith('.')) r = './' + r;
  return r || './lib';
}

const files = walk(ROOT, []);
let changed = 0;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  let out = txt;
  if (JS_DELIVR_RE.test(out)) {
    const rel = relPath(f);
    out = out.replace(JS_DELIVR_RE, '<script src="' + rel + '/sha3.js"></script>');
  }
  // 纠正 pass：上一版脚本在 Windows 下路径计算错误，根目录页面误生成了 ../lib/sha3.js
  const inSdk = f.replace(/\\/g, '/').indexOf('/sdk/') >= 0;
  if (!inSdk) out = out.replace(/<script src="\.\.\/lib\/sha3\.js"><\/script>/g, '<script src="./lib/sha3.js"></script>');
  if (CSP_RE.test(out)) {
    out = out.replace(CSP_RE, "script-src 'self' 'unsafe-inline'");
  }
  if (out !== txt) {
    writeFileSync(f, out, 'utf8');
    console.log('patched ' + f.replace(ROOT, ''));
    changed++;
  }
}
console.log('✅ done, changed files=' + changed);
