# -*- coding: utf-8 -*-
"""分析 Nova Chain 网站 i18n 覆盖情况：
1) I18N.zh / I18N.en 字典 key 差异（en 缺失）
2) 每个 HTML 的 data-i18n 标记数量
3) 每个 HTML 中未被 data-i18n 覆盖的可见中文文本（硬编码）
4) 页面引用了但字典缺失的 key
"""
import re, glob, os, json

ROOT = r"C:\Users\Administrator\novachain-web"
CJK = re.compile(r'[\u4e00-\u9fff]')
SKIP_DIRS = {'node_modules', '.git', 'browser-extension'}

def read(p):
    with open(p, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()

# ---------- 1) 提取 I18N 字典 ----------
js = read(os.path.join(ROOT, 'apps-common.js'))
# 定位 I18N = { ... }（zh 与 en 两个子字典）
zh_start = js.find('zh: {', js.find('var I18N'))
en_start = js.find('en: {', zh_start)
end = js.find('};', en_start)
assert zh_start > 0 and en_start > zh_start and end > en_start, 'I18N block not found'
zh_src = js[zh_start + 5:en_start]      # 从 '{' 之后到 'en: {'
en_src = js[en_start + 5:end]           # 从 '{' 之后到 '};'
KEY = re.compile(r"'([^']+)':")
zh_keys = set(KEY.findall(zh_src))
en_keys = set(KEY.findall(en_src))

print('=' * 60)
print(f'I18N.zh keys: {len(zh_keys)}   I18N.en keys: {len(en_keys)}')
missing_en = sorted(zh_keys - en_keys)
print(f'EN 缺失的 key 数: {len(missing_en)}')
print('EN 缺失 key 列表:')
for k in missing_en:
    print(f'  - {k}  (zh: {zh_keys and next((v for v in []) , "")})')

# ---------- 2/3/4) 扫描 HTML ----------
print('=' * 60)
print('HTML 页面 i18n 覆盖统计:')
htmls = []
for p in glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True):
    rel = os.path.relpath(p, ROOT)
    if any(s in rel for s in SKIP_DIRS):
        continue
    htmls.append((rel, read(p)))

missing_keys_ref = {}
for rel, html in sorted(htmls, key=lambda x: x[0]):
    i18n_markers = re.findall(r'data-i18n(?:-ph)?="([^"]+)"', html)
    # 硬编码中文：标签间的可见中文文本（剔除 script/style）
    body = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    body = re.sub(r'<style.*?</style>', '', body, flags=re.S)
    hard_texts = re.findall(r'>([^<>]*[\u4e00-\u9fff][^<>]*)<', body)
    hard_texts = [t.strip() for t in hard_texts if t.strip() and len(t.strip()) < 40]
    # 排除纯 emoji/符号
    hard_visible = [t for t in hard_texts if CJK.search(t) and not t.startswith(('{{', '${'))]
    # 引用但字典缺失的 key
    ref_missing = [k for k in i18n_markers if k not in zh_keys]
    if ref_missing:
        missing_keys_ref[rel] = ref_missing
    print(f'  {rel:36s} data-i18n={len(i18n_markers):3d}  硬编码中文≈{len(hard_visible):3d}'
          + ('  [缺失key引用!]' if ref_missing else ''))

if missing_keys_ref:
    print('=' * 60)
    print('引用了但 zh 字典缺失的 key:')
    for rel, ks in missing_keys_ref.items():
        print(f'  {rel}: {ks}')

# ---------- 5) apps-common.js 中硬编码中文（未走 t()） ----------
print('=' * 60)
print('apps-common.js 中直接出现的中文字符串（抽样统计，可能走 t() 后仍含中文文案）:')
hard_js = re.findall(r"'([^']*[\u4e00-\u9fff][^']*)'", js)
hard_js = [s for s in hard_js if len(s) < 60]
print(f'  中文字符串字面量数量: {len(hard_js)}')
# 排除 I18N 字典内部
i18n_start = js.find('var I18N')
i18n_end = js.find('var lang =', i18n_start)
outside = js[:i18n_start] + js[i18n_end:]
hard_out = re.findall(r"'([^']*[\u4e00-\u9fff][^']*)'", outside)
hard_out = [s for s in hard_out if len(s) < 60]
print(f'  I18N 字典之外的硬编码中文: {len(hard_out)}')
for s in hard_out[:40]:
    print(f'    - {s}')
