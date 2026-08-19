# -*- coding: utf-8 -*-
"""扫描页面内联 script 块中的残留中文动态文案（引号字符串字面量）"""
import io, sys, re, glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

pages = sys.argv[1:] if len(sys.argv) > 1 else sorted(glob.glob('*.html'))
skip_keys = re.compile(r'^(dyn|N\.t|wrd|lve|cmp|sto|sfx|aim|ag|did|gov|sub|fct|stg|vid|mut|nf|mus|soc|gme|brg|dex|oracle|app|arb|settings)\b')
for p in pages:
    try:
        c = open(p, encoding='utf-8').read()
    except FileNotFoundError:
        continue
    scripts = re.findall(r'<script>(.*?)</script>', c, re.S)
    hits = []
    for s in scripts:
        for sm in re.finditer(r"'([^']*[\u4e00-\u9fff][^']*)'", s):
            txt = sm.group(1)
            if len(txt) < 80 and not skip_keys.match(txt):
                hits.append(txt)
    if hits:
        print('==', p, '残留动态中文数:', len(hits))
        for h in hits[:8]:
            print('   ', h)

