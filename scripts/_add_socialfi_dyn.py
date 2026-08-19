# -*- coding: utf-8 -*-
"""在 socialfi.i18n.js 的 zh/en 块末尾追加 sfx.dyn.* 操作反馈词条"""
import re, io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DYN_ZH = {
 'sfx.dyn.issued.fan': '已发行粉丝代币', 'sfx.dyn.bought.fan': '已买入 {qty} 份',
 'sfx.dyn.fan.qty': '买入数量（当前价自动计算）：', 'sfx.dyn.proposed': '已发起提案',
 'sfx.dyn.prop.title': '提案标题：', 'sfx.dyn.prop.hours': '投票时长（小时）：', 'sfx.dyn.voted': '投票完成',
 'sfx.dyn.rev.opened': '已开设收益共享', 'sfx.dyn.rev.invest.amt': '投资金额（NOVA）：', 'sfx.dyn.rev.invested': '投资成功',
 'sfx.dyn.rev.royalty.amt': '注入版税金额（NOVA）：', 'sfx.dyn.rev.royalty': '版税已注入', 'sfx.dyn.rev.claimed': '已领取分成',
 'sfx.dyn.ach.created': '已创建成就', 'sfx.dyn.ach.award.target': '颁发给地址（0x + 40 位 hex）：',
 'sfx.dyn.ach.awarded': '已颁发（灵魂绑定）', 'sfx.dyn.ach.need': '请填写成就 ID 与目标地址',
 'sfx.dyn.mkt.opened': '已开设预测市场', 'sfx.dyn.mkt.opts': '至少两个选项', 'sfx.dyn.mkt.bet.amt': '押注金额（NOVA）：',
 'sfx.dyn.mkt.bet': '已押注', 'sfx.dyn.mkt.settled': '已结算',
 'sfx.dyn.blind.listed': '已上架盲盒（种子保存在浏览器）', 'sfx.dyn.blind.tiers.bad': '档位 JSON 格式错误',
 'sfx.dyn.blind.reveal.seed': '请输入你创建盲盒时保存的种子（64 位 hex）：', 'sfx.dyn.blind.noseed': '未找到种子，请手动输入',
 'sfx.dyn.blind.revealed': '种子已揭示', 'sfx.dyn.blind.draws': '开盒次数：', 'sfx.dyn.blind.opened': '开盒完成',
 'sfx.dyn.blind.info.node': '节点模式下请查看 /api/socialfi/blindbox', 'sfx.dyn.blind.info.title': '盲盒可验证信息',
 'sfx.dyn.blind.info.commit': 'Commit（种子哈希）：', 'sfx.dyn.blind.info.seed': '种子：',
 'sfx.dyn.blind.info.dim': '任何人可用 sha3_256(seed) 校验 commit；开盒结果由 sha3_256(seed+地址+次数) 决定，可在链上重现。',
 'sfx.dyn.cur.created': '已创建策展', 'sfx.dyn.cur.items': '请填写收录条目', 'sfx.dyn.cur.bought': '收藏成功',
}
DYN_EN = {
 'sfx.dyn.issued.fan': 'Fan token issued', 'sfx.dyn.bought.fan': 'Bought {qty} units',
 'sfx.dyn.fan.qty': 'Buy quantity (auto-priced):', 'sfx.dyn.proposed': 'Proposal submitted',
 'sfx.dyn.prop.title': 'Proposal title:', 'sfx.dyn.prop.hours': 'Voting duration (hours):', 'sfx.dyn.voted': 'Vote submitted',
 'sfx.dyn.rev.opened': 'Revenue share opened', 'sfx.dyn.rev.invest.amt': 'Invest amount (NOVA):', 'sfx.dyn.rev.invested': 'Invested',
 'sfx.dyn.rev.royalty.amt': 'Inject royalty amount (NOVA):', 'sfx.dyn.rev.royalty': 'Royalty injected', 'sfx.dyn.rev.claimed': 'Revenue claimed',
 'sfx.dyn.ach.created': 'Achievement created', 'sfx.dyn.ach.award.target': 'Award to address (0x + 40-char hex):',
 'sfx.dyn.ach.awarded': 'Awarded (soulbound)', 'sfx.dyn.ach.need': 'Enter achievement ID and target address',
 'sfx.dyn.mkt.opened': 'Market opened', 'sfx.dyn.mkt.opts': 'At least two options', 'sfx.dyn.mkt.bet.amt': 'Bet amount (NOVA):',
 'sfx.dyn.mkt.bet': 'Bet placed', 'sfx.dyn.mkt.settled': 'Settled',
 'sfx.dyn.blind.listed': 'Blind box listed (seed saved in browser)', 'sfx.dyn.blind.tiers.bad': 'Invalid tier JSON',
 'sfx.dyn.blind.reveal.seed': 'Enter the seed you saved when creating the box (64-char hex):', 'sfx.dyn.blind.noseed': 'Seed not found, enter it manually',
 'sfx.dyn.blind.revealed': 'Seed revealed', 'sfx.dyn.blind.draws': 'Number of draws:', 'sfx.dyn.blind.opened': 'Draws done',
 'sfx.dyn.blind.info.node': 'In node mode see /api/socialfi/blindbox', 'sfx.dyn.blind.info.title': 'Verifiable Box Info',
 'sfx.dyn.blind.info.commit': 'Commit (seed hash):', 'sfx.dyn.blind.info.seed': 'Seed:',
 'sfx.dyn.blind.info.dim': 'Anyone can verify the commit with sha3_256(seed); the draw result is sha3_256(seed+address+count) and reproducible on-chain.',
 'sfx.dyn.cur.created': 'Curation created', 'sfx.dyn.cur.items': 'Enter curated items', 'sfx.dyn.cur.bought': 'Collected',
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'socialfi.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# zh 块：在 "sfx.k99': '加载中…'" 后插入
zh_anchor = "'sfx.k99': '加载中…'"
zh_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in DYN_ZH.items())
assert zh_anchor in c, 'zh anchor not found'
c = c.replace(zh_anchor, zh_anchor + zh_extra, 1)

# en 块：在 "sfx.k99': 'Loading…'" 后插入
en_anchor = "'sfx.k99': 'Loading…'"
en_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in DYN_EN.items())
assert en_anchor in c, 'en anchor not found'
c = c.replace(en_anchor, en_anchor + en_extra, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 sfx.dyn.* 词条 zh=%d / en=%d' % (len(DYN_ZH), len(DYN_EN)))
