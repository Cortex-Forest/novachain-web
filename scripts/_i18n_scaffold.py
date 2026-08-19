# -*- coding: utf-8 -*-
"""i18n 脚手架：自动为 HTML 页面中的"叶子中文文本"注入 data-i18n，并生成 addI18n 字典骨架。

用法:
    python scripts/_i18n_scaffold.py <页面.html> <key前缀> [--write]
  - 默认只预览（打印修改与骨架）；加 --write 才写回文件。
  - 生成 <页面>.i18n.js 骨架文件（zh 填原文，en 留空待人工补英文）。
"""
import re, sys, os, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
CJK = re.compile(r'[\u4e00-\u9fff]')
# 这些标签内的中文不翻译（脚本/样式/元数据）
SKIP_TAGS = {'script', 'style', 'svg', 'head', 'meta', 'title', 'noscript', 'template', 'textarea'}
# 叶子文本匹配：<tag attrs>纯文本(含中文)</tag>
LEAF = re.compile(r'<([a-zA-Z][\w-]*)([^>]*)>([^<]*[\u4e00-\u9fff][^<]*)</\1>', re.S)
# 已有 i18n 属性
HAS_I18N = re.compile(r'data-i18n(?:-ph)?=')

def convert(html, prefix):
    out = []
    n = 0
    # 1) 先取出 script/style 块，避免把 JS/CSS 内的 HTML 字符串误当叶子文本
    stash = []
    def stash_blocks(m):
        stash.append(m.group(0))
        return '\u0000S%d\u0000' % (len(stash) - 1)
    html = re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1\s*>', stash_blocks, html, flags=re.I)

    def rep(m):
        nonlocal n
        tag, attrs, text = m.group(1), m.group(2), m.group(3)
        if tag.lower() in SKIP_TAGS:
            return m.group(0)
        if HAS_I18N.search(attrs):
            return m.group(0)
        n += 1
        key = '%s.k%d' % (prefix, n)
        new_attrs = (attrs + ' data-i18n="%s"' % key) if attrs.strip() else (' data-i18n="%s"' % key)
        out.append((key, text.strip()))
        return '<%s%s>%s</%s>' % (tag, new_attrs, text, tag)
    new_html = LEAF.sub(rep, html)

    # 2) 恢复 script/style 块
    def restore(m):
        return stash[int(m.group(1))]
    new_html = re.sub(r'\u0000S(\d+)\u0000', restore, new_html)
    return new_html, out

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    path, prefix = sys.argv[1], sys.argv[2]
    write = '--write' in sys.argv
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    new_html, keys = convert(html, prefix)
    base = os.path.splitext(os.path.basename(path))[0]
    print('== 命中 %d 处（前缀 %s） ==' % (len(keys), prefix))
    for k, zh in keys:
        print('  %-16s %s' % (k, zh[:38]))
    if write:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_html)
        skel = (
            '/* 由 _i18n_scaffold.py 生成 —— 请补全 en 翻译 */\n'
            'NovaApps.addI18n({\n  zh: {\n%s\n  },\n  en: {\n%s\n  }\n});\n'
        ) % (
            ',\n'.join("    '%s': '%s'" % (k, zh.replace("'", "\\'")) for k, zh in keys),
            ',\n'.join("    '%s': ''" % k for k, _ in keys),
        )
        skel_path = os.path.join(os.path.dirname(path), base + '.i18n.js')
        with open(skel_path, 'w', encoding='utf-8') as f:
            f.write(skel)
        print('已写回: %s' % path)
        print('骨架: %s' % skel_path)

if __name__ == '__main__':
    main()
