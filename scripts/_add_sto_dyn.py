# -*- coding: utf-8 -*-
"""追加 storage 动态词条 sto.dyn.*（render/操作）"""
import io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

D = {
 'zh': {
  'sto.dyn.cap.need': '请输入有效容量', 'sto.dyn.registered.msg': '已注册为存储提供者',
  'sto.dyn.node.connect': '连接钱包后可注册存储节点。',
  'sto.dyn.node.registered': '✅ 已注册', 'sto.dyn.node.not': '未注册',
  'sto.dyn.node.info': '容量 <span class="price">{cap}</span> GB 路 注册于 {at}',
  'sto.dyn.node.hint': '请先在左侧填写容量并注册，注册后即可认领副本、提交证明赚取奖励。',
  'sto.dyn.pinned': '内容已固定', 'sto.dyn.pins.empty': '还没有固定任何内容。',
  'sto.dyn.expired': '已过期', 'sto.dyn.valid': '有效',
  'sto.dyn.owner': '拥有者 {a}',
  'sto.dyn.pin.info': '{owner} 路 {size} GB 路 {days} 天 路 副本 {n}/10<br>到期 {at}',
  'sto.dyn.claims.empty': '还没有可认领的内容。',
  'sto.dyn.btn.claim': '认领副本', 'sto.dyn.btn.proof': '提交证明',
  'sto.dyn.claimed': '已认领：', 'sto.dyn.none': '无', 'sto.dyn.content.empty': '还没有内容。',
  'sto.dyn.claim.need': '提交哈希链链顶作为密封（seal，64 位 hex）：', 'sto.dyn.claimed.ok': '已认领副本',
  'sto.dyn.proof.need': '提交哈希链证明（reveal，64 位 hex）：', 'sto.dyn.proof.ok': '已提交证明',
  'sto.dyn.order.created': '存储订单已创建', 'sto.dyn.orders.empty': '还没有存储订单。',
  'sto.dyn.hosting': '托管中', 'sto.dyn.expired.settled': '已到期/结算',
  'sto.dyn.order.info': '创建者 {a} 路 托管 <span class="price">{amt}</span> NOVA 路 {n} 副本 路 {days} 天<br>到期 {at}',
  'sto.dyn.providers.empty': '还没有存储提供者。',
  'sto.dyn.provider.info': '容量 <span class="price">{cap}</span> GB 路 注册于 {at}',
 },
 'en': {
  'sto.dyn.cap.need': 'Enter a valid capacity', 'sto.dyn.registered.msg': 'Registered as storage provider',
  'sto.dyn.node.connect': 'Connect a wallet to register a storage node.',
  'sto.dyn.node.registered': '✅ Registered', 'sto.dyn.node.not': 'Not registered',
  'sto.dyn.node.info': 'Capacity <span class="price">{cap}</span> GB · registered {at}',
  'sto.dyn.node.hint': 'Fill in capacity on the left and register; then you can claim replicas and submit proofs for rewards.',
  'sto.dyn.pinned': 'Content pinned', 'sto.dyn.pins.empty': 'Nothing pinned yet.',
  'sto.dyn.expired': 'Expired', 'sto.dyn.valid': 'Valid',
  'sto.dyn.owner': 'Owner {a}',
  'sto.dyn.pin.info': '{owner} · {size} GB · {days}d · replicas {n}/10<br>expires {at}',
  'sto.dyn.claims.empty': 'No claimable content yet.',
  'sto.dyn.btn.claim': 'Claim Replica', 'sto.dyn.btn.proof': 'Submit Proof',
  'sto.dyn.claimed': 'Claimed: ', 'sto.dyn.none': 'none', 'sto.dyn.content.empty': 'No content yet.',
  'sto.dyn.claim.need': 'Submit hash-chain head as seal (64-hex): ', 'sto.dyn.claimed.ok': 'Replica claimed',
  'sto.dyn.proof.need': 'Submit hash-chain proof (reveal, 64-hex): ', 'sto.dyn.proof.ok': 'Proof submitted',
  'sto.dyn.order.created': 'Storage order created', 'sto.dyn.orders.empty': 'No storage orders yet.',
  'sto.dyn.hosting': 'Hosting', 'sto.dyn.expired.settled': 'Expired/Settled',
  'sto.dyn.order.info': 'Creator {a} · escrowed <span class="price">{amt}</span> NOVA · {n} replicas · {days}d<br>expires {at}',
  'sto.dyn.providers.empty': 'No storage providers yet.',
  'sto.dyn.provider.info': 'Capacity <span class="price">{cap}</span> GB · registered {at}',
 },
}

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'storage.i18n.js')
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

def append(lang, anchor, items):
    global c
    assert anchor in c, lang + ' anchor missing'
    add = "\n" + "\n".join("    '%s': '%s'," % (k, v.replace("'", "\\'")) for k, v in items.items())
    c = c.replace(anchor, anchor + add, 1)

append('zh', "    'sto.k54': '加载中…'", D['zh'])
append('en', "    'sto.k54': 'Loading…'", D['en'])

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('已追加 sto.dyn.* 词条 zh=%d / en=%d' % (len(D['zh']), len(D['en'])))
