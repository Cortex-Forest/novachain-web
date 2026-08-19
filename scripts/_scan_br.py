# -*- coding: utf-8 -*-
"""扫描含 <br> 且含中文、且无 data-i18n 的 HTML 文本元素（脚手架盲区）"""
import io, sys, re, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

pages = sys.argv[1:] if len(sys.argv) > 1 else sorted(glob.glob('*.html'))
out = []
for p in pages:
    try:
        c = open(p, encoding='utf-8').read()
    except FileNotFoundError:
        continue
    # 去掉 script/style 块
    c2 = re.sub(r'<script.*?</script>', '', c, flags=re.S)
    c2 = re.sub(r'<style.*?</style>', '', c2, flags=re.S)
    # 找含 <br> 且含中文、且无 data-i18n 的元素（<p>/<div>/<li>/<span>/<td> 等）
    pat = re.compile(r'<(p|div|li|span|td|th|h[1-6]|label|figcaption)(\s[^>]*)?>((?:(?!</\1>).)*?)(?:<br\s*/?>)((?:(?!</\1>).)*?)</\1>', re.S)
    seen = set()
    for m in pat.finditer(c2):
        attrs = m.group(2) or ''
        if 'data-i18n' in attrs:
            continue
        txt = m.group(0)
        if re.search('[\u4e00-\u9fff]', txt) and txt not in seen:
            seen.add(txt)
            disp = re.sub(r'\s+', ' ', txt).strip()
            if len(disp) < 220:
                out.append(p + ' :: ' + disp)
with open('scan_br_out.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('written', len(out))
