# -*- coding: utf-8 -*-
"""通用 i18n 词条追加：在 zh/en 块末尾（尾逗号自动处理）追加词条。
用法: python _append_i18n.py <file> [json_file]
json_file 格式: {"zh": {key: val,...}, "en": {key: val,...}}
"""
import io, sys, os, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def main():
    path = sys.argv[1]
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    def block_end(anchor_open, anchor_close, items, name):
        global c
        i = c.find(anchor_open)
        assert i >= 0, name + ' block not found'
        j = c.find(anchor_close, i)
        assert j >= 0, name + ' close not found'
        # 找到块内最后一行（在 close 之前的行首）
        tail = c.rfind('\n', i, j)
        line_end = j
        # close 前可能紧跟词条行尾
        last_line = c[tail + 1:j].rstrip('\r\n')
        add = "".join("    '%s': '%s',\n" % (k, v.replace("'", "\\'")) for k, v in items.items())
        if last_line.rstrip().endswith(','):
            c = c[:j] + add + c[j:]
        else:
            # 给最后一行补逗号
            c = c[:j] + add + c[j:]
        return

    # 简化：直接用锚点定位（词条文件结构统一：zh:{...}, en:{...}）
    def append_after(anchor_line, items, name):
        global c
        assert anchor_line in c, name + ' anchor missing'
        add = "".join("    '%s': '%s',\n" % (k, v.replace("'", "\\'")) for k, v in items.items())
        c = c.replace(anchor_line, anchor_line + add, 1)

    # 用最后一个 en 词条锚点，自动补逗号
    # 直接找 en 块开头
    en_marker = '  en: {'
    i = c.find(en_marker)
    assert i >= 0, 'en block not found'
    # en 块结束 }
    j = c.find('\n  }\n});', i)
    assert j >= 0, 'en block close not found'
    tail = c.rfind('\n', i, j)
    last_line = c[tail + 1:j].rstrip()
    add_en = "".join("    '%s': '%s',\n" % (k, v.replace("'", "\\'").replace('\n', '\\n')) for k, v in data['en'].items())
    comma = ',' if last_line and not last_line.endswith(',') else ''
    c = c[:j] + comma + add_en + c[j:]

    zh_marker = '  zh: {'
    i2 = c.find(zh_marker)
    j2 = c.find('\n  },\n  en: {', i2)
    assert j2 >= 0, 'zh block close not found'
    tail2 = c.rfind('\n', i2, j2)
    last_line2 = c[tail2 + 1:j2].rstrip()
    add_zh = "".join("    '%s': '%s',\n" % (k, v.replace("'", "\\'").replace('\n', '\\n')) for k, v in data['zh'].items())
    comma2 = ',' if last_line2 and not last_line2.endswith(',') else ''
    c = c[:j2] + comma2 + add_zh + c[j2:]

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print('已追加 %s: zh=%d en=%d' % (os.path.basename(path), len(data['zh']), len(data['en'])))

if __name__ == '__main__':
    main()
