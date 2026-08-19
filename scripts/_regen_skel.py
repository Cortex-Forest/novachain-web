# -*- coding: utf-8 -*-
"""从已注入 data-i18n 的 HTML 重建/生成骨架文件（不修改 HTML）。
用法: python scripts/_regen_skel.py <page.html> <前缀>
从 <tag data-i18n="key">文本</tag> 与 data-i18n-ph 提取 key->文本，生成 <page>.i18n.js
"""
import re, sys, os, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def extract(html):
    keys = []  # (key, text)
    seen = set()
    # 叶子 data-i18n
    for m in re.finditer(r'data-i18n="([^"]+)"[^>]*>([^<]*)<', html):
        k, txt = m.group(1), m.group(2).strip()
        if k in seen:
            continue
        seen.add(k)
        keys.append((k, txt))
    # data-i18n-ph（placeholder 属性）
    for m in re.finditer(r'data-i18n-ph="([^"]+)"', html):
        k = m.group(1)
        if k not in seen:
            seen.add(k)
            keys.append((k, ''))
    return keys

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    path, prefix = sys.argv[1], sys.argv[2]
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    keys = extract(html)
    base = os.path.splitext(os.path.basename(path))[0]
    print('提取 %d 个 key' % len(keys))
    for k, zh in keys:
        print('  %-16s %s' % (k, zh[:36]))
    skel = (
        '/* 由 _regen_skel.py 生成 —— 请补全 en 翻译 */\n'
        'NovaApps.addI18n({\n  zh: {\n%s\n  },\n  en: {\n%s\n  }\n});\n'
    ) % (
        ',\n'.join("    '%s': '%s'" % (k, zh.replace("'", "\\'")) for k, zh in keys),
        ',\n'.join("    '%s': ''" % k for k, _ in keys),
    )
    out_path = os.path.join(os.path.dirname(path), base + '.i18n.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(skel)
    print('骨架: %s' % out_path)

if __name__ == '__main__':
    main()
