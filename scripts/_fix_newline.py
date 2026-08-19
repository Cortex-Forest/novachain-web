# -*- coding: utf-8 -*-
"""把 i18n 文件中 ag.demo.*.c 词条值内的真实换行替换为 \\n 字面量"""
import io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for f in ['agent.i18n.js', 'stage.i18n.js']:
    c = open(f, encoding='utf-8').read()
    def fix(m):
        return m.group(1) + m.group(2).replace('\n', '\\n') + m.group(3)
    c2 = re.sub(r"('ag\.demo\.t\d\.c': ')(.*?)(',\s*$)", fix, c, flags=re.S | re.M)
    open(f, 'w', encoding='utf-8').write(c2)
    print(f, 'fixed')
