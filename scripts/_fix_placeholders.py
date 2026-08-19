# -*- coding: utf-8 -*-
"""批量修复静态 HTML 中的中文 placeholder：注入 data-i18n-ph + 生成每页 zh/en 词条 json"""
import io, sys, re, glob, os, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# zh 原文 -> en 翻译
TR = {
    '星语诗人': 'Star Poet',
    '例如：商品与描述不符…': 'e.g. Item not as described…',
    'ipfs://… 或 https://…': 'ipfs://… or https://…',
    '存入数量': 'Deposit amount',
    '源链地址（可选）': 'Source chain address (optional)',
    '销毁数量': 'Burn amount',
    '目标链地址（可选）': 'Target chain address (optional)',
    '如：生成一首 3 分钟流行风格歌曲，BPM 120 以内': 'e.g. generate a 3-min pop song under 120 BPM',
    '如：时长 3 分钟、采样率 44.1kHz': 'e.g. 3 min, 44.1kHz sample rate',
    '输入数量': 'Enter amount',
    'NOVA 数量': 'NOVA amount',
    'nUSDT / nETH 数量': 'nUSDT / nETH amount',
    'LP 份额': 'LP shares',
    'sha3-256 哈希（64 hex）': 'sha3-256 hash (64 hex)',
    '合约地址列表（逗号分隔）': 'Contract addresses (comma-separated)',
    'Nova 地址（0x + 40 位 hex），已连接钱包自动填入': 'Nova address (0x + 40 hex), auto-filled if wallet connected',
    '提案标题': 'Proposal title',
    '参数名（如 fee_rate / daily_limit_usd）': 'Param name (e.g. fee_rate / daily_limit_usd)',
    '参数值': 'Param value',
    '基金支出金额（可选）': 'Fund spend amount (optional)',
    '基金接收地址（可选）': 'Fund recipient address (optional)',
    '被委托人地址': 'Delegate address',
    '例如：量子极光 #001': 'e.g. Quantum Aurora #001',
    '讲讲这件藏品的来历…': 'Tell the story of this piece…',
    '价格': 'Price',
    '用途提示（如：盲盒抽奖 #12）': 'Usage hint (e.g. blind box #12)',
    '内容哈希（64 位 hex 或 bafy CID）': 'Content hash (64 hex or bafy CID)',
    'VRF 公钥（0x + 128 hex）': 'VRF public key (0x + 128 hex)',
    '分享你的创作、灵感或今日星象…': 'Share your creation, inspiration or today\'s horoscope…',
    '你的名字': 'Your name',
    '0x… 或 bafy…': '0x… or bafy…',
    '支付金额': 'Payment amount',
    '档位 id（如 basic）': 'Tier id (e.g. basic)',
    '档位名称（如 基础档）': 'Tier name (e.g. Basic)',
    '价格 (NOVA)': 'Price (NOVA)',
    '给视频起个名字': 'Name your video',
    '你的创作者频道': 'Your creator channel',
    '给你的文字一个名字': 'Name your text',
    '留空自动生成': 'Auto if empty',
    '写下你的故事、诗歌或连载章节…': 'Write your story, poem or serial chapter…',
    '搜索标题或标识符…': 'Search title or identifier…',
    '例如：深夜电台 · 量子钢琴': 'e.g. Late-night Radio · Quantum Piano',
    'Nova 音乐实验室粉丝币': 'Nova Music Lab fan coin',
    '0x…64位hex 或 bafy…': '0x…64-hex or bafy…',
    '音乐人未来三年版税': 'Musician\'s next-3-year royalties',
    '投资喜欢的创作者，合约自动按比例分配版税收入': 'Invest in creators you like; the contract auto-splits royalty income',
    '连续签到 365 天': 'Check in 365 days straight',
    '灵魂绑定徽章，不可转让': 'Soulbound badge, non-transferable',
    '这部电影票房能破 10 亿吗？': 'Will this movie gross over 1B?',
    '0x…（可留空）': '0x… (optional)',
    '星际盲盒': 'Interstellar Blind Box',
    '2026 最佳单曲歌单': '2026 Best Singles Playlist',
    '星轨回声&#10;量子夜航&#10;超新星原石': 'Star Track Echo&#10;Quantum Night Voyage&#10;Supernova Rough',
    '分享你的创作…': 'Share your creation…',
    '新专辑未来版税债券': 'New album future-royalty bond',
    '热门歌曲版权': 'Hit-song copyright',
    'nova-genesis-01 或 0x…': 'nova-genesis-01 or 0x…',
    '算力任务赏金（NOVA）': 'Compute task bounty (NOVA)',
}

SKIP = {'wallet.html', 'nova.html', '404.html'}

def prefix_of(p):
    # 页面前缀：取文件名第一段（不含 .html）
    return p.split('.')[0]

# 收集每页注入项
per_page = {}  # page -> {key: (zh, en)}
for p in sorted(glob.glob('*.html')):
    if p in SKIP:
        continue
    c = open(p, encoding='utf-8').read()
    c2 = re.sub(r'<script.*?</script>', '', c, flags=re.S)
    # 匹配 input/textarea 的 placeholder 属性（含中文，无 data-i18n-ph）
    pat = re.compile(r'<(\w+)\s([^>]*?placeholder="([^"]*[\u4e00-\u9fff][^"]*)"[^>]*)>')
    items = []
    for m in pat.finditer(c2):
        attrs = m.group(2)
        if 'data-i18n-ph' in attrs:
            continue
        zh = m.group(3)
        if zh not in TR:
            continue
        en = TR[zh]
        items.append((m.group(0), attrs, zh, en))
    if not items:
        continue
    pref = prefix_of(p)
    keymap = {}
    for i, (full, attrs, zh, en) in enumerate(items, 1):
        key = '%s.ph.%d' % (pref, i)
        keymap[key] = (zh, en)
        newattrs = 'data-i18n-ph="%s" %s' % (key, attrs)
        newfull = full.replace(attrs, newattrs, 1)
        c = c.replace(full, newfull, 1)
    open(p, 'w', encoding='utf-8').write(c)
    per_page[p] = keymap
    print(p, '->', len(keymap), 'placeholders')

# 生成每页 json 并追加
for p, keymap in per_page.items():
    js = p.replace('.html', '.i18n.js')
    data = {'zh': {}, 'en': {}}
    for k, (zh, en) in keymap.items():
        data['zh'][k] = zh
        data['en'][k] = en
    jp = os.path.join('scripts', '_ph_' + p.replace('.html', '') + '.json')
    with open(jp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    r = os.system('python scripts\\_append_i18n.py "%s" "%s"' % (js, jp))
    print('  appended', js, 'rc=', r)
