# -*- coding: utf-8 -*-
"""追加 compute 的 taskCard/操作函数动态词条 cmp.dyn.r.* / cmp.dyn.op.*"""
import io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

D = {
 'zh': {
  'cmp.dyn.btn.bid': '🔨 报价', 'cmp.dyn.btn.accept': '⚡ 接单', 'cmp.dyn.btn.award': '选标 {q} NOVA',
  'cmp.dyn.btn.submit': '📤 提交结果', 'cmp.dyn.btn.arbitrate': '⚖️ 第三方仲裁', 'cmp.dyn.btn.dispute': '⚠️ 24h 内异议',
  'cmp.dyn.btn.uphold': '🗳️ 支持异议', 'cmp.dyn.btn.dismiss': '🗳️ 驳回异议', 'cmp.dyn.btn.audit': '🔍 提交抽查结果',
  'cmp.dyn.bids': '出价：', 'cmp.dyn.audit.tag': '🔍 待抽查', 'cmp.dyn.acceptance': '验收：',
  'cmp.dyn.creator': '发布者 {a}', 'cmp.dyn.budget': '预算 <span class="price">{b}</span> NOVA（托管）',
  'cmp.dyn.participants': '参与 {n}/{m}', 'cmp.dyn.winner': '中标 {a}', 'cmp.dyn.auditor': '审计节点 {a}',
  'cmp.dyn.deadline': '截止 {d}', 'cmp.dyn.result.count': '结果 {n} 份', 'cmp.dyn.trace': '状态轨迹：',
  'cmp.dyn.mine.connect': '连接钱包后展示你发布或参与的任务。', 'cmp.dyn.mine.empty': '还没有你发布或参与的任务。',
  'cmp.dyn.op.accepted': '已接单', 'cmp.dyn.op.bid.need': '报价（NOVA）：', 'cmp.dyn.op.bidded': '已报价',
  'cmp.dyn.op.awarded': '已选标', 'cmp.dyn.op.submit.need': '提交结果哈希（64 位 hex）：', 'cmp.dyn.op.submitted': '已提交结果',
  'cmp.dyn.op.arbitrate.need': '仲裁判定结果哈希（64 位 hex）：', 'cmp.dyn.op.arbitrated': '仲裁完成',
  'cmp.dyn.op.dispute.need': '异议原因：', 'cmp.dyn.op.dispute.def': '结果质量不符合验收标准',
  'cmp.dyn.op.disputed': '已提出异议，预算冻结', 'cmp.dyn.op.voted': '投票成功',
  'cmp.dyn.op.audit.need': '提交抽查结果哈希（64 位 hex）：', 'cmp.dyn.op.audit.submitted': '抽查结果已提交',
 },
 'en': {
  'cmp.dyn.btn.bid': '🔨 Bid', 'cmp.dyn.btn.accept': '⚡ Accept', 'cmp.dyn.btn.award': 'Award {q} NOVA',
  'cmp.dyn.btn.submit': '📤 Submit Result', 'cmp.dyn.btn.arbitrate': '⚖️ Arbitrate', 'cmp.dyn.btn.dispute': '⚠️ Dispute within 24h',
  'cmp.dyn.btn.uphold': '🗳️ Uphold', 'cmp.dyn.btn.dismiss': '🗳️ Dismiss', 'cmp.dyn.btn.audit': '🔍 Submit Audit',
  'cmp.dyn.bids': 'Bids: ', 'cmp.dyn.audit.tag': '🔍 Pending Audit', 'cmp.dyn.acceptance': 'Acceptance: ',
  'cmp.dyn.creator': 'Creator {a}', 'cmp.dyn.budget': 'Budget <span class="price">{b}</span> NOVA (escrowed)',
  'cmp.dyn.participants': 'participants {n}/{m}', 'cmp.dyn.winner': 'winner {a}', 'cmp.dyn.auditor': 'audit node {a}',
  'cmp.dyn.deadline': 'deadline {d}', 'cmp.dyn.result.count': '{n} results', 'cmp.dyn.trace': 'History: ',
  'cmp.dyn.mine.connect': 'Connect a wallet to see tasks you created or joined.', 'cmp.dyn.mine.empty': 'No tasks you created or joined yet.',
  'cmp.dyn.op.accepted': 'Order accepted', 'cmp.dyn.op.bid.need': 'Bid (NOVA): ', 'cmp.dyn.op.bidded': 'Bid placed',
  'cmp.dyn.op.awarded': 'Awarded', 'cmp.dyn.op.submit.need': 'Submit result hash (64-hex): ', 'cmp.dyn.op.submitted': 'Result submitted',
  'cmp.dyn.op.arbitrate.need': 'Arbitration result hash (64-hex): ', 'cmp.dyn.op.arbitrated': 'Arbitration complete',
  'cmp.dyn.op.dispute.need': 'Dispute reason: ', 'cmp.dyn.op.dispute.def': 'Result quality does not meet acceptance criteria',
  'cmp.dyn.op.disputed': 'Dispute filed, budget frozen', 'cmp.dyn.op.voted': 'Vote cast',
  'cmp.dyn.op.audit.need': 'Submit audit result hash (64-hex): ', 'cmp.dyn.op.audit.submitted': 'Audit result submitted',
 },
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'compute.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

def append_after_anchor(lang, anchor_key, anchor_val, items):
    global c
    a = "    '%s': '%s'," % (anchor_key, anchor_val)
    assert a in c, '%s anchor missing' % lang
    add = "\n" + "\n".join("    '%s': '%s'," % (k, v.replace("'", "\\'")) for k, v in items.items())
    c = c.replace(a, a + add, 1)

append_after_anchor('zh', 'cmp.dyn.ov.super', '超级', D['zh'])
append_after_anchor('en', 'cmp.dyn.ov.super', 'super', D['en'])

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 compute 第二批词条 zh=%d / en=%d' % (len(D['zh']), len(D['en'])))
