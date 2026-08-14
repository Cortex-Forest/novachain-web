/* 构建工具：把 BIP39 英文词表（2048 词）注入 wallet-crypto.js
 * 用法: node scripts/embed-bip39.mjs <english.txt>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const wordlistPath = resolve(process.argv[2] || 'bip39_english.txt');
const target = resolve('wallet-crypto.js');

const raw = readFileSync(wordlistPath, 'utf8');
const words = raw.trim().split(/\s+/).map(w => w.trim().toLowerCase()).filter(Boolean);
if (words.length !== 2048) {
    console.error(`词表单词数应为 2048，实际 ${words.length}`);
    process.exit(1);
}
const source = readFileSync(target, 'utf8');
const marker = '"__BIP39_WORDS__"';
if (!source.includes(marker)) {
    console.error('未找到词表占位符，wallet-crypto.js 可能已被注入');
    process.exit(1);
}
const joined = words.join(' ');
const out = source.replace(marker, `"${joined}"`);
writeFileSync(target, out);
console.log(`✅ 已注入 ${words.length} 词 -> ${target}`);
