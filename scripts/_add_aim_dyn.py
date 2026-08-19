# -*- coding: utf-8 -*-
"""在 ai_musician.i18n.js 的 zh/en 块末尾追加 aim.dyn.* 动态词条"""
import io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

D = {
 'zh': {
  'aim.dyn.stats.today': '今日生成', 'aim.dyn.stats.total': '累计生成', 'aim.dyn.stats.sales': '累计销量',
  'aim.dyn.stats.revenue': '累计营收', 'aim.dyn.stats.works': '在售作品', 'aim.dyn.stats.services': '接入服务',
  'aim.dyn.stats.pending': '待处理触发', 'aim.dyn.stats.fund': '基金余额',
  'aim.dyn.split': '创作者 <b class="price">{c}%</b> · 算力节点 <b class="price">{k}%</b> · AI 成长基金 <b class="price">{f}%</b>',
  'aim.dyn.rev': '今日生成 {t} 首 · 累计 {g} 首 · 销量 {s} · 营收 {r} NOVA<br>循环状态：{status} · 日预算 {b} NOVA · 触发费 {tf} NOVA',
  'aim.dyn.loop.on': '已启用', 'aim.dyn.loop.off': '已停用', 'aim.dyn.loop.daily': '每日 {h}:00', 'aim.dyn.loop.weekly': '每周 {h}:00',
  'aim.dyn.works.empty': '还没有 AI 作品。点击「一键触发创作」或「模拟离线圈子」生成第一首。',
  'aim.dyn.preview': '▶ 试听', 'aim.dyn.buy': '🛒 购买 {p} NOVA',
  'aim.dyn.work.info': 'AI 音乐人 {artist} · 售价 <span class="price">{p}</span> NOVA（自动定价） · 销量 {s} · 累计营收 {r}<br>IPFS {cid}{meta}<br>上架 {t}',
  'aim.dyn.bought': '购买成功，70/20/10 自动分账', 'aim.dyn.previewing': '▶ 试听中：{id}…（16 音符合成预览）', 'aim.dyn.preview.fail': '试听失败：{msg}',
  'aim.dyn.svc.empty': '还没有接入的 AI 服务。', 'aim.dyn.svc.pause': '⏸ 暂停', 'aim.dyn.svc.resume': '▶ 恢复',
  'aim.dyn.svc.active': '运行中', 'aim.dyn.svc.paused': '已暂停',
  'aim.dyn.svc.info': '模型 {m} · 端点指纹 {h}<br>所有者 {o}',
  'aim.dyn.svc.registered': 'AI 服务已登记', 'aim.dyn.svc.toggled.pause': '服务已暂停', 'aim.dyn.svc.toggled.resume': '服务已恢复',
  'aim.dyn.triggered': '已触发 AI 创作（基金 +2 NOVA）', 'aim.dyn.mo.saved': '音乐人循环配置已保存',
  'aim.dyn.sim.nopriv': '仅演示模式可模拟离线圈子；节点模式请运行 scripts/ai_musician_loop.py',
  'aim.dyn.sim.done': '🤖 离线圈子完成：Suno 生成 → IPFS 上链 → 内容合约上架（{title}，售价 {p} NOVA）',
  'aim.dyn.fund.stats.balance': '基金余额', 'aim.dyn.fund.stats.income': '累计收入', 'aim.dyn.fund.stats.expense': '累计支出', 'aim.dyn.fund.stats.guardians': '监护人',
  'aim.dyn.fund.empty': '暂无收支记录。', 'aim.dyn.fund.guard.empty': '暂无监护人。AI 创作者或现有监护人可授权新监护人。',
  'aim.dyn.fund.pending': '⏳ 待审批支出 <span class="price">{a}</span> NOVA → {r}',
  'aim.dyn.fund.pending.info': '{p} · 审批 {n}/{req} · ',
  'aim.dyn.fund.approve': '✅ 审批',
  'aim.dyn.fund.pending.empty': '暂无待审批支出。单笔超过 20 NOVA 的支出需 2 名监护人审批。',
  'aim.dyn.fund.guarded': '监护人已授权', 'aim.dyn.fund.spent': '基金支出已提交', 'aim.dyn.fund.approved': '已审批，支出执行',
 },
 'en': {
  'aim.dyn.stats.today': 'Generated Today', 'aim.dyn.stats.total': 'Total Generated', 'aim.dyn.stats.sales': 'Total Sales',
  'aim.dyn.stats.revenue': 'Total Revenue', 'aim.dyn.stats.works': 'Works On Sale', 'aim.dyn.stats.services': 'Connected Services',
  'aim.dyn.stats.pending': 'Pending Triggers', 'aim.dyn.stats.fund': 'Fund Balance',
  'aim.dyn.split': 'Creator <b class="price">{c}%</b> · compute <b class="price">{k}%</b> · AI fund <b class="price">{f}%</b>',
  'aim.dyn.rev': 'Generated {t} today · {g} total · {s} sales · revenue {r} NOVA<br>Loop: {status} · daily budget {b} NOVA · trigger fee {tf} NOVA',
  'aim.dyn.loop.on': 'Enabled', 'aim.dyn.loop.off': 'Disabled', 'aim.dyn.loop.daily': 'daily {h}:00', 'aim.dyn.loop.weekly': 'weekly {h}:00',
  'aim.dyn.works.empty': 'No AI works yet. Tap "Trigger" or "Simulate offline loop" to create the first one.',
  'aim.dyn.preview': '▶ Preview', 'aim.dyn.buy': '🛒 Buy {p} NOVA',
  'aim.dyn.work.info': 'AI musician {artist} · price <span class="price">{p}</span> NOVA (auto-priced) · sales {s} · revenue {r}<br>IPFS {cid}{meta}<br>Listed {t}',
  'aim.dyn.bought': 'Purchased, 70/20/10 auto-split', 'aim.dyn.previewing': '▶ Previewing: {id}… (16-note synth preview)', 'aim.dyn.preview.fail': 'Preview failed: {msg}',
  'aim.dyn.svc.empty': 'No connected AI services yet.', 'aim.dyn.svc.pause': '⏸ Pause', 'aim.dyn.svc.resume': '▶ Resume',
  'aim.dyn.svc.active': 'Active', 'aim.dyn.svc.paused': 'Paused',
  'aim.dyn.svc.info': 'Model {m} · endpoint hash {h}<br>Owner {o}',
  'aim.dyn.svc.registered': 'AI service registered', 'aim.dyn.svc.toggled.pause': 'Service paused', 'aim.dyn.svc.toggled.resume': 'Service resumed',
  'aim.dyn.triggered': 'AI creation triggered (+2 NOVA to fund)', 'aim.dyn.mo.saved': 'Musician loop config saved',
  'aim.dyn.sim.nopriv': 'Only demo mode can simulate the offline loop; in node mode run scripts/ai_musician_loop.py',
  'aim.dyn.sim.done': '🤖 Offline loop done: Suno → IPFS → listed ({title}, price {p} NOVA)',
  'aim.dyn.fund.stats.balance': 'Fund Balance', 'aim.dyn.fund.stats.income': 'Total Income', 'aim.dyn.fund.stats.expense': 'Total Expense', 'aim.dyn.fund.stats.guardians': 'Guardians',
  'aim.dyn.fund.empty': 'No ledger entries.', 'aim.dyn.fund.guard.empty': 'No guardians yet. The AI creator or an existing guardian can authorize one.',
  'aim.dyn.fund.pending': '⏳ Pending spend <span class="price">{a}</span> NOVA → {r}',
  'aim.dyn.fund.pending.info': '{p} · approvals {n}/{req} · ',
  'aim.dyn.fund.approve': '✅ Approve',
  'aim.dyn.fund.pending.empty': 'No pending spends. Expenses over 20 NOVA need 2 guardian approvals.',
  'aim.dyn.fund.guarded': 'Guardian authorized', 'aim.dyn.fund.spent': 'Fund spend submitted', 'aim.dyn.fund.approved': 'Approved, spend executing',
 },
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ai_musician.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

zh_anchor = "'aim.k53': '💸 支出'"
zh_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in D['zh'].items())
assert zh_anchor in c, 'zh anchor not found'
c = c.replace(zh_anchor, zh_anchor + zh_extra, 1)

en_anchor = "'aim.k53': '💸 Spend'"
en_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in D['en'].items())
assert en_anchor in c, 'en anchor not found'
c = c.replace(en_anchor, en_anchor + en_extra, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 aim.dyn.* 词条 zh=%d / en=%d' % (len(D['zh']), len(D['en'])))
