# -*- coding: utf-8 -*-
"""在 socialfi.i18n.js 的 zh/en 块末尾追加 sfx.r.* 渲染标签词条"""
import re, io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

R_ZH = {
 'sfx.r.rep.title': '👤 我的链上声誉',
 'sfx.r.rep.conn': '连接钱包后展示实时信誉分（0-100）、权益与个性化推荐。',
 'sfx.r.rep.connect': '连接钱包',
 'sfx.r.rep.level': '{tier} 级（{grade}）· 手续费 {fee}',
 'sfx.r.rep.fee.disc': '5 折', 'sfx.r.rep.fee.std': '标准',
 'sfx.r.rep.recs': '🌟 推荐给你的创作者',
 'sfx.r.rep.rec.item': '→ {name}（信誉 {rep}）· {reason}',
 'sfx.r.rep.rec.empty': '多关注、点赞、创作，推荐将自动生成。',
 'sfx.r.events.empty': '暂无链上动态',
 'sfx.r.fan.vote': '支持', 'sfx.r.fan.against': '反对', 'sfx.r.fan.voted': '（已投票）', 'sfx.r.fan.closed': '（已结束）',
 'sfx.r.fan.info': '发行价 {price} · 当前价 <span class="price">{cur}</span> · 已售 {sold} / {supply}<br>创作者 {creator} · 我持有 {hold} 份',
 'sfx.r.fan.buy': '买入', 'sfx.r.fan.propose': '发起提案',
 'sfx.r.fan.empty': '还没有粉丝代币，发行第一个吧',
 'sfx.r.rev.info': '{desc}<br>创作者 {creator} · 已募 {total} NOVA · 分成池 <span class="price">{pool}</span> NOVA · 我投资 {invested}{claim}',
 'sfx.r.rev.claimable': '（可领 {amt}）',
 'sfx.r.rev.invest': '投资', 'sfx.r.rev.royalty': '注入版税', 'sfx.r.rev.claim': '领取分成',
 'sfx.r.rev.empty': '还没有收益共享项目',
 'sfx.r.ach.mine': '我拥有', 'sfx.r.ach.issue': '颁发',
 'sfx.r.ach.info': '{desc}<br>颁发方 {issuer} · 已颁发 {holders} 人 · ID <span class="mono">{id}</span>',
 'sfx.r.ach.empty': '还没有成就徽章',
 'sfx.r.mkt.oracle': '预言机 {oracle} · ',
 'sfx.r.mkt.settled': '已结算：{option}', 'sfx.r.mkt.closed': '已关闭，待结算', 'sfx.r.mkt.closes': '{time}后关闭',
 'sfx.r.mkt.bet': '押注', 'sfx.r.mkt.settle': '结算：{option}', 'sfx.r.mkt.empty': '还没有预测市场',
 'sfx.r.blind.info': '价格 {price} NOVA · 档位：{tiers}<br>创作者 {creator} · 我开了 {draws} 次 · {status}',
 'sfx.r.blind.revealed': '随机种子已揭示', 'sfx.r.blind.pending': 'commit 已提交，等待揭示',
 'sfx.r.blind.open': '开盒', 'sfx.r.blind.reveal': '揭示种子', 'sfx.r.blind.verify': '验证信息',
 'sfx.r.blind.badge': '🎁徽章', 'sfx.r.blind.empty': '还没有盲盒',
 'sfx.r.cur.owned': '已收藏',
 'sfx.r.cur.info': '策展人 {curator} · 售价 <span class="price">{price}</span> NOVA（策展人得 90%）· 收藏 {owners} 人',
 'sfx.r.cur.items': '收录：{items}', 'sfx.r.cur.collect': '收藏', 'sfx.r.cur.empty': '还没有策展',
 'sfx.r.graph.empty': '还没有动态', 'sfx.r.graph.rec': '→ {name}（{reason}，信誉 {rep}）', 'sfx.r.graph.rec.empty': '暂无推荐',
 'sfx.r.graph.posted': '已发布', 'sfx.r.graph.follow.need': '请输入关注地址', 'sfx.r.graph.followed': '关注成功', 'sfx.r.graph.liked': '点赞成功',
 'sfx.r.rec.task': '已发布推荐算力任务，赏金 {bounty} NOVA',
 'sfx.r.rep.conn2': '请先连接钱包。',
 'sfx.r.rep.fee': '{tier} 级（{grade}）· 当前手续费倍率 {mult}（≥80 分享 5 折）',
 'sfx.r.bond.settled': '已结算', 'sfx.r.bond.matured': '已到期', 'sfx.r.bond.raising': '募集中',
 'sfx.r.bond.info': '发行人 {issuer} · 目标 {principal} · 年化 {rate}% · {term} 天<br>偿债池 <span class="price">{pool}</span> · 已募 {raised} · 我持有 {hold}',
 'sfx.r.bond.buy': '认购', 'sfx.r.bond.fund': '注入偿债池', 'sfx.r.bond.redeem': '赎回本息', 'sfx.r.bond.empty': '还没有债券',
 'sfx.r.bond.issued': '已发行债券', 'sfx.r.bond.buy.amt': '认购金额（NOVA）：', 'sfx.r.bond.bought': '认购成功',
 'sfx.r.bond.fund.amt': '注入偿债池金额（NOVA）：', 'sfx.r.bond.funded': '偿债池已注资', 'sfx.r.bond.redeemed': '已赎回',
 'sfx.r.frac.info': '来源 {ref} · 总量 {supply} · 每份 <span class="price">{price}</span> NOVA<br>持有人 {owner}（剩 {left} 份）· 我持有 {hold} 份',
 'sfx.r.frac.buy': '购买碎片', 'sfx.r.frac.empty': '还没有碎片化 NFT',
 'sfx.r.frac.split': '已拆分', 'sfx.r.frac.buy.qty': '购买碎片数：', 'sfx.r.frac.bought': '购买成功',
}
R_EN = {
 'sfx.r.rep.title': '👤 My On-chain Reputation',
 'sfx.r.rep.conn': 'Shows real-time reputation (0-100), entitlements and personalized recommendations after connecting a wallet.',
 'sfx.r.rep.connect': 'Connect Wallet',
 'sfx.r.rep.level': '{tier} ({grade}) · fees {fee}',
 'sfx.r.rep.fee.disc': '50% off', 'sfx.r.rep.fee.std': 'standard',
 'sfx.r.rep.recs': '🌟 Recommended creators for you',
 'sfx.r.rep.rec.item': '→ {name} (reputation {rep}) · {reason}',
 'sfx.r.rep.rec.empty': 'Follow, like and create more — recommendations will appear automatically.',
 'sfx.r.events.empty': 'No on-chain activity yet',
 'sfx.r.fan.vote': 'For', 'sfx.r.fan.against': 'Against', 'sfx.r.fan.voted': ' (voted)', 'sfx.r.fan.closed': ' (closed)',
 'sfx.r.fan.info': 'Issue {price} · now <span class="price">{cur}</span> · sold {sold} / {supply}<br>Creator {creator} · I hold {hold}',
 'sfx.r.fan.buy': 'Buy', 'sfx.r.fan.propose': 'Propose',
 'sfx.r.fan.empty': 'No fan tokens yet — issue the first one',
 'sfx.r.rev.info': '{desc}<br>Creator {creator} · raised {total} NOVA · pool <span class="price">{pool}</span> NOVA · I invested {invested}{claim}',
 'sfx.r.rev.claimable': ' (claim {amt})',
 'sfx.r.rev.invest': 'Invest', 'sfx.r.rev.royalty': 'Inject royalty', 'sfx.r.rev.claim': 'Claim',
 'sfx.r.rev.empty': 'No revenue shares yet',
 'sfx.r.ach.mine': 'Mine', 'sfx.r.ach.issue': 'Award',
 'sfx.r.ach.info': '{desc}<br>Issuer {issuer} · awarded {holders} people · ID <span class="mono">{id}</span>',
 'sfx.r.ach.empty': 'No achievement badges yet',
 'sfx.r.mkt.oracle': 'Oracle {oracle} · ',
 'sfx.r.mkt.settled': 'Settled: {option}', 'sfx.r.mkt.closed': 'Closed, awaiting settlement', 'sfx.r.mkt.closes': 'closes in {time}',
 'sfx.r.mkt.bet': 'Bet', 'sfx.r.mkt.settle': 'Settle: {option}', 'sfx.r.mkt.empty': 'No prediction markets yet',
 'sfx.r.blind.info': 'Price {price} NOVA · tiers: {tiers}<br>Creator {creator} · I drew {draws} times · {status}',
 'sfx.r.blind.revealed': 'Seed revealed', 'sfx.r.blind.pending': 'Commit submitted, awaiting reveal',
 'sfx.r.blind.open': 'Open', 'sfx.r.blind.reveal': 'Reveal seed', 'sfx.r.blind.verify': 'Verify',
 'sfx.r.blind.badge': '🎁 badge', 'sfx.r.blind.empty': 'No blind boxes yet',
 'sfx.r.cur.owned': 'Collected',
 'sfx.r.cur.info': 'Curator {curator} · price <span class="price">{price}</span> NOVA (curator gets 90%) · {owners} collected',
 'sfx.r.cur.items': 'Items: {items}', 'sfx.r.cur.collect': 'Collect', 'sfx.r.cur.empty': 'No curations yet',
 'sfx.r.graph.empty': 'No posts yet', 'sfx.r.graph.rec': '→ {name} ({reason}, reputation {rep})', 'sfx.r.graph.rec.empty': 'No recommendations',
 'sfx.r.graph.posted': 'Posted', 'sfx.r.graph.follow.need': 'Enter an address to follow', 'sfx.r.graph.followed': 'Followed', 'sfx.r.graph.liked': 'Liked',
 'sfx.r.rec.task': 'Recommendation compute task published, bounty {bounty} NOVA',
 'sfx.r.rep.conn2': 'Connect a wallet first.',
 'sfx.r.rep.fee': '{tier} ({grade}) · current fee multiplier {mult} (50% off at ≥80)',
 'sfx.r.bond.settled': 'Settled', 'sfx.r.bond.matured': 'Matured', 'sfx.r.bond.raising': 'Raising',
 'sfx.r.bond.info': 'Issuer {issuer} · target {principal} · {rate}% APY · {term} days<br>Pool <span class="price">{pool}</span> · raised {raised} · I hold {hold}',
 'sfx.r.bond.buy': 'Subscribe', 'sfx.r.bond.fund': 'Fund pool', 'sfx.r.bond.redeem': 'Redeem', 'sfx.r.bond.empty': 'No bonds yet',
 'sfx.r.bond.issued': 'Bond issued', 'sfx.r.bond.buy.amt': 'Subscribe amount (NOVA):', 'sfx.r.bond.bought': 'Subscribed',
 'sfx.r.bond.fund.amt': 'Fund pool amount (NOVA):', 'sfx.r.bond.funded': 'Pool funded', 'sfx.r.bond.redeemed': 'Redeemed',
 'sfx.r.frac.info': 'Source {ref} · total {supply} · per share <span class="price">{price}</span> NOVA<br>Holder {owner} ({left} left) · I hold {hold}',
 'sfx.r.frac.buy': 'Buy shares', 'sfx.r.frac.empty': 'No fractional NFTs yet',
 'sfx.r.frac.split': 'Fractionalized', 'sfx.r.frac.buy.qty': 'Number of shares:', 'sfx.r.frac.bought': 'Purchased',
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'socialfi.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# 定位 sfx.dyn.cur.bought（zh/en 各自最后追加的词条）作为锚点
zh_anchor = "'sfx.dyn.cur.bought': '收藏成功'"
zh_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in R_ZH.items())
assert zh_anchor in c, 'zh anchor not found'
c = c.replace(zh_anchor, zh_anchor + zh_extra, 1)

en_anchor = "'sfx.dyn.cur.bought': 'Collected'"
en_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in R_EN.items())
assert en_anchor in c, 'en anchor not found'
c = c.replace(en_anchor, en_anchor + en_extra, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 sfx.r.* 词条 zh=%d / en=%d' % (len(R_ZH), len(R_EN)))
