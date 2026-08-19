# -*- coding: utf-8 -*-
"""打印指定页脚本区残留中文引号字符串"""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for p in sys.argv[1:]:
    c = open(p + '.html', encoding='utf-8').read()
    scripts = re.findall(r'<script>(.*?)</script>', c, re.S)
    hits = []
    for s in scripts:
        for sm in re.finditer(r"'([^']*[\u4e00-\u9fff][^']*)'", s):
            txt = sm.group(1)
            if len(txt) < 80:
                hits.append(txt)
    print('==', p, len(hits))
    for h in hits:
        print('   ', repr(h))
