# -*- coding: utf-8 -*-
"""交叉校验：页面内联脚本中 N.t('key') 引用的 dyn 词条是否都在对应 .i18n.js 中。"""
import re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

pairs = [('did', 'did.dyn'), ('governance', 'gov.dyn'), ('subscription', 'sub.dyn'),
         ('faucet', 'fct.dyn'), ('agent', 'ag.dyn'), ('stage', 'stg.dyn'), ('video', 'vid.dyn')]
for page, pref in pairs:
    c = open(page + '.html', encoding='utf-8').read()
    blocks = re.findall(r'<script>(.*?)</script>', c, re.S)
    js = '\n'.join(b for b in blocks if 'NovaApps' in b and 'addI18n' not in b)
    refs = set(re.findall(r"N\.t\('([^']+)'", js))
    refs = {r for r in refs if r.startswith(pref)}
    d = open(page + '.i18n.js', encoding='utf-8').read()
    keys = set(re.findall(r"'([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)'\s*:", d))
    missing = refs - keys
    print(page, 'refs=', len(refs), 'missing=', sorted(missing) if missing else 'NONE')
