# -*- coding: utf-8 -*-
"""批量替换各页面内联脚本中的高频动态文案为 N.t('dyn.*')。
仅做精确字符串替换，跳过已处理的页面（模式不匹配）。
"""
import glob, os, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r"C:\Users\Administrator\novachain-web"

REPL = [
    ("N.toast('请先连接钱包')", "N.toast(N.t('dyn.needwallet'))"),
    ("N.toast('演示模式：' + op)", "N.toast(N.t('dyn.demoop', { op: op }))"),
    ("N.toast('操作失败: ' + res.error)", "N.toast(N.t('dyn.opfail', { msg: res.error }))"),
    ("N.toast('操作失败: ' + (e && e.message || e))", "N.toast(N.t('dyn.opfail', { msg: (e && e.message || e) }))"),
    ("N.toast('已上链 ✓ ' + String((res && res.txid) || '').slice(0, 16) + '…')",
     "N.toast(N.t('dyn.onchain', { tx: String((res && res.txid) || '').slice(0, 16) }))"),
    ("(okMsg || '操作成功')", "(okMsg || N.t('dyn.success'))"),
    # 独立页面用 NovaApps 命名空间的情形
    ("NovaApps.toast('请先连接钱包')", "NovaApps.toast(NovaApps.t('dyn.needwallet'))"),
]

files = glob.glob(os.path.join(ROOT, '*.html'))
total = 0
for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    orig = c
    cnt = 0
    for old, new in REPL:
        n = c.count(old)
        if n:
            c = c.replace(old, new)
            cnt += n
    if cnt:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        total += cnt
        print('%s: +%d' % (os.path.basename(path), cnt))
print('总计替换 %d 处' % total)
