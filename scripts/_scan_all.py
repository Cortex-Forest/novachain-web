# -*- coding: utf-8 -*-
"""全站盲区扫描：含中文但无 data-i18n / data-i18n-ph 的元素（排除 wallet/nova/404/sdk）"""
import io, sys, re, glob, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SKIP = {'wallet.html', 'nova.html', '404.html'}
out = []
for p in sorted(glob.glob('*.html')):
    if p in SKIP:
        continue
    c = open(p, encoding='utf-8').read()
    c2 = re.sub(r'<script.*?</script>', '', c, flags=re.S)
    c2 = re.sub(r'<style.*?</style>', '', c2, flags=re.S)
    # 1) 含中文且无 data-i18n 的元素（含内容文本）
    pat = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>([^<>]*[\u4e00-\u9fff][^<>]*)</\1>')
    for m in pat.finditer(c2):
        attrs = m.group(2) or ''
        txt = m.group(3).strip()
        if 'data-i18n' in attrs or not txt:
            continue
        if re.search('[\u4e00-\u9fff]', txt) and len(txt) < 80:
            out.append(p + ' [TXT] <' + m.group(1) + '> ' + re.sub(r'\s+', ' ', txt))
    # 2) placeholder 含中文且无 data-i18n-ph
    ph = re.compile(r'placeholder="([^"]*[\u4e00-\u9fff][^"]*)"')
    for m in ph.finditer(c2):
        line = c2[max(0, m.start() - 60):m.end()]
        if 'data-i18n-ph' not in line:
            out.append(p + ' [PH] ' + m.group(1)[:60])
    # 3) title / aria-label 中文无 data-i18n
    for attr in ['title', 'aria-label']:
        ap = re.compile(attr + r'="([^"]*[\u4e00-\u9fff][^"]*)"')
        for m in ap.finditer(c2):
            line = c2[max(0, m.start() - 60):m.end()]
            if 'data-i18n' not in line:
                out.append(p + ' [' + attr.upper() + '] ' + m.group(1)[:60])

with open('scan_all_out.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('written', len(out))
