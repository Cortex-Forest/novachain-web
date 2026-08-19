# -*- coding: utf-8 -*-
"""在 compute.i18n.js 的 zh/en 块末尾追加 cmp.dyn.* 动态词条"""
import io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

D = {
 'zh': {
  'cmp.dyn.task.ai_music': 'AI音乐生成', 'cmp.dyn.task.ai_image': 'AI图像生成', 'cmp.dyn.task.game_server': '游戏服务器托管',
  'cmp.dyn.task.video_transcode': '视频转码', 'cmp.dyn.task.data_clean': '数据清洗/标注',
  'cmp.dyn.task.generic': '算力任务', 'cmp.dyn.task.legacy': 'legacy 任务',
  'cmp.dyn.st.open': '招募中', 'cmp.dyn.st.bidding': '竞价中', 'cmp.dyn.st.assigned': '执行中', 'cmp.dyn.st.submitted': '已提交',
  'cmp.dyn.st.arbitrating': '仲裁中', 'cmp.dyn.st.settled': '已结算', 'cmp.dyn.st.completed': '已结算',
  'cmp.dyn.st.disputed': '争议冻结', 'cmp.dyn.st.failed': '失败退款', 'cmp.dyn.st.expired': '已过期',
  'cmp.dyn.tier.star': '恒星节点', 'cmp.dyn.tier.core': '星核节点', 'cmp.dyn.tier.nebula': '星云节点', 'cmp.dyn.tier.light': '轻量节点',
  'cmp.dyn.ov.nodes': '节点数', 'cmp.dyn.ov.tasks': '任务总数', 'cmp.dyn.ov.open': '进行中', 'cmp.dyn.ov.completed': '已结算',
  'cmp.dyn.ov.disputed': '争议冻结', 'cmp.dyn.ov.staked': '全网质押', 'cmp.dyn.ov.slashed': '罚没合计', 'cmp.dyn.ov.fees': '手续费入池',
  'cmp.dyn.ov.audits': '待抽查', 'cmp.dyn.ov.audits.fail': '抽查失败',
  'cmp.dyn.ref.type': '类型', 'cmp.dyn.ref.price': '参考价（NOVA）', 'cmp.dyn.ref.spec': '需求规格',
  'cmp.dyn.events.empty': '暂无算力网络事件。',
  'cmp.dyn.spec.ai_music': '4 核 + 高 GPU + 16GB 内存', 'cmp.dyn.spec.ai_image': '4 核 + 中 GPU + 8GB 内存',
  'cmp.dyn.spec.game_server': '4 核 + 32GB 内存', 'cmp.dyn.spec.video_transcode': '8 核 + 8GB 内存', 'cmp.dyn.spec.data_clean': '2 核 + 16GB 内存',
  'cmp.dyn.publish.need': '请输入任务描述', 'cmp.dyn.published': '算力任务已发布',
  'cmp.dyn.node.registered': '算力节点已注册', 'cmp.dyn.staked': '质押成功', 'cmp.dyn.unstaked': '已解押，7 天冷静期后领取', 'cmp.dyn.claimed': '已取回解押',
  'cmp.dyn.nodes.empty': '还没有算力节点。', 'cmp.dyn.market.empty': '还没有算力任务。',
  'cmp.dyn.my.stake': '已注册 · 信誉 <b class="price">{rep}</b> 分（{tier}）· 质押 <b class="price">{stake}</b> NOVA{unbonding}',
  'cmp.dyn.my.unbonding': ' · 解押中 {amt}（{time} 后领取）',
  'cmp.dyn.my.none': '尚未注册节点，也未质押。注册或质押 100+ NOVA 后即可接单（超级节点自动具备资格）。',
  'cmp.dyn.my.connect': '连接钱包查看我的质押状态。',
  'cmp.dyn.super.tag': '超级节点（自动资格）',
  'cmp.dyn.node.spec': '{cpu} 核 · GPU {gpu} · 内存 {ram}GB · 存储 {storage}GB · {region} · {lat}ms',
  'cmp.dyn.node.rep': '信誉 <b class="price">{rep}</b> 分（{tier}，加成 {bonus}%） · 质押 {stake} · 任务收益 {income} NOVA',
  'cmp.dyn.node.stats': '完成 {c} · 正确 {ok} · 错误 {w} · 投诉 {cp} · 作恶 {ch}',
 },
 'en': {
  'cmp.dyn.task.ai_music': 'AI Music Generation', 'cmp.dyn.task.ai_image': 'AI Image Generation', 'cmp.dyn.task.game_server': 'Game Server Hosting',
  'cmp.dyn.task.video_transcode': 'Video Transcoding', 'cmp.dyn.task.data_clean': 'Data Cleaning/Labeling',
  'cmp.dyn.task.generic': 'Compute task', 'cmp.dyn.task.legacy': 'legacy task',
  'cmp.dyn.st.open': 'Recruiting', 'cmp.dyn.st.bidding': 'Bidding', 'cmp.dyn.st.assigned': 'Executing', 'cmp.dyn.st.submitted': 'Submitted',
  'cmp.dyn.st.arbitrating': 'Arbitrating', 'cmp.dyn.st.settled': 'Settled', 'cmp.dyn.st.completed': 'Settled',
  'cmp.dyn.st.disputed': 'Dispute frozen', 'cmp.dyn.st.failed': 'Refunded', 'cmp.dyn.st.expired': 'Expired',
  'cmp.dyn.tier.star': 'Star Node', 'cmp.dyn.tier.core': 'Core Node', 'cmp.dyn.tier.nebula': 'Nebula Node', 'cmp.dyn.tier.light': 'Light Node',
  'cmp.dyn.ov.nodes': 'Nodes', 'cmp.dyn.ov.tasks': 'Total Tasks', 'cmp.dyn.ov.open': 'In Progress', 'cmp.dyn.ov.completed': 'Settled',
  'cmp.dyn.ov.disputed': 'Dispute Frozen', 'cmp.dyn.ov.staked': 'Total Staked', 'cmp.dyn.ov.slashed': 'Slashed', 'cmp.dyn.ov.fees': 'Fees to Pool',
  'cmp.dyn.ov.audits': 'Pending Audits', 'cmp.dyn.ov.audits.fail': 'Audit Failures',
  'cmp.dyn.ref.type': 'Type', 'cmp.dyn.ref.price': 'Reference (NOVA)', 'cmp.dyn.ref.spec': 'Spec',
  'cmp.dyn.events.empty': 'No compute network events.',
  'cmp.dyn.spec.ai_music': '4 cores + high GPU + 16GB RAM', 'cmp.dyn.spec.ai_image': '4 cores + mid GPU + 8GB RAM',
  'cmp.dyn.spec.game_server': '4 cores + 32GB RAM', 'cmp.dyn.spec.video_transcode': '8 cores + 8GB RAM', 'cmp.dyn.spec.data_clean': '2 cores + 16GB RAM',
  'cmp.dyn.publish.need': 'Enter a task description', 'cmp.dyn.published': 'Compute task published',
  'cmp.dyn.node.registered': 'Compute node registered', 'cmp.dyn.staked': 'Staked', 'cmp.dyn.unstaked': 'Unstaked, claim after 7-day cooldown', 'cmp.dyn.claimed': 'Unstake claimed',
  'cmp.dyn.nodes.empty': 'No compute nodes yet.', 'cmp.dyn.market.empty': 'No compute tasks yet.',
  'cmp.dyn.my.stake': 'Registered · reputation <b class="price">{rep}</b> ({tier}) · staked <b class="price">{stake}</b> NOVA{unbonding}',
  'cmp.dyn.my.unbonding': ' · unstaking {amt} (claim in {time})',
  'cmp.dyn.my.none': 'Not registered or staked yet. Register or stake 100+ NOVA to take orders (supernodes qualify automatically).',
  'cmp.dyn.my.connect': 'Connect a wallet to view your staking status.',
  'cmp.dyn.super.tag': 'Supernode (auto-qualified)',
  'cmp.dyn.node.spec': '{cpu} cores · GPU {gpu} · RAM {ram}GB · storage {storage}GB · {region} · {lat}ms',
  'cmp.dyn.node.rep': 'Reputation <b class="price">{rep}</b> ({tier}, bonus {bonus}%) · staked {stake} · task income {income} NOVA',
  'cmp.dyn.node.stats': 'done {c} · correct {ok} · wrong {w} · complaints {cp} · cheated {ch}',
 },
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'compute.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

zh_anchor = "'cmp.k57': '加载中…'"
zh_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in D['zh'].items())
assert zh_anchor in c, 'zh anchor not found'
c = c.replace(zh_anchor, zh_anchor + zh_extra, 1)

en_anchor = "'cmp.k57': 'Loading…'"
en_extra = ",\n" + ",\n".join("    '%s': '%s'" % (k, v.replace("'", "\\'")) for k, v in D['en'].items())
assert en_anchor in c, 'en anchor not found'
c = c.replace(en_anchor, en_anchor + en_extra, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 cmp.dyn.* 词条 zh=%d / en=%d' % (len(D['zh']), len(D['en'])))
