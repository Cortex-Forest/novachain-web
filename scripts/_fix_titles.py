# -*- coding: utf-8 -*-
"""给每页 <title> 注入 data-i18n + 生成 zh/en 词条"""
import io, sys, re, glob, os, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

TR = {
 'agent.html': 'Nova AI · Autonomous Creators',
 'ai_musician.html': 'Nova AI Musicians · Auto-creation & Splits',
 'apps.html': 'Nova App Center · Creator Ecosystem',
 'arbitration.html': 'Nova Community Arbitration',
 'bridge.html': 'Nova Bridge · Asset Interoperability',
 'compute.html': 'Nova Compute Network · Nodes / Tasks / Verification',
 'dex.html': 'Nova DEX · Decentralized Exchange',
 'did.html': 'Nova Identity · DID & Reputation',
 'faucet.html': 'Nova Testnet Faucet · Free Test Tokens',
 'games.html': 'Nova Game Deck · Quantum Dice & Star Sprint',
 'governance.html': 'Nova Governance · Proposals & Voting',
 'live.html': 'Nova Live Union · Interstellar Streams',
 'music.html': 'Nova Music Hall · On-chain Release',
 'nft.html': 'Nova Collectibles · NFT Market',
 'oracle.html': 'Nova Oracle · Verifiable Data',
 'social.html': 'Nova Social · Creator Community',
 'socialfi.html': 'Nova On-chain Ecosystem · SocialFi',
 'stage.html': 'Nova Virtual Shows · Starship Echo',
 'storage.html': 'Nova Storage Network · Decentralized Storage',
 'subscription.html': 'Nova Subscriptions · Creator Membership',
 'video.html': 'Nova Video Guild · Creator Channels',
 'words.html': 'Nova Words · Public & Sealed Writing',
}
SKIP = {'wallet.html', 'nova.html', '404.html', 'index.html'}

for p, en in TR.items():
    if p in SKIP or not os.path.exists(p):
        continue
    c = open(p, encoding='utf-8').read()
    m = re.search(r'<title[^>]*>(.*?)</title>', c, re.S)
    if not m:
        print('no title', p); continue
    if 'data-i18n' in c[:m.end()]:
        print('skip (has data-i18n)', p); continue
    zh = m.group(1).strip()
    pref = p.split('.')[0]
    key = pref + '.title'
    newtitle = '<title data-i18n="%s">%s</title>' % (key, zh)
    c = c[:m.start()] + newtitle + c[m.end():]
    open(p, 'w', encoding='utf-8').write(c)
    js = p.replace('.html', '.i18n.js')
    jp = os.path.join('scripts', '_ti_' + pref + '.json')
    with open(jp, 'w', encoding='utf-8') as f:
        json.dump({'zh': {key: zh}, 'en': {key: en}}, f, ensure_ascii=False)
    r = os.system('python scripts\\_append_i18n.py "%s" "%s"' % (js, jp))
    print(p, '->', key, zh, '|', en, 'rc=', r)
