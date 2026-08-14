# -*- coding: utf-8 -*-
"""生成 Nova 钱包扩展图标（纯标准库 PNG：圆角方块 + 渐变圆环 + 中心光点）"""
import os, struct, zlib

def make_icon(size):
    px = bytearray()
    r = size * 0.22
    cx = cy = size / 2.0
    def in_round(xx, yy):
        mx = min(max(xx, r), size - r)
        my = min(max(yy, r), size - r)
        return (xx - mx) ** 2 + (yy - my) ** 2 <= r * r
    for y in range(size):
        for x in range(size):
            X, Y = x + 0.5, y + 0.5
            if not in_round(X, Y):
                px += bytes((0, 0, 0, 0)); continue
            t = Y / size
            bg = (int(10 + 6 * t), int(12 + 14 * t), int(34 + 46 * t))
            dist = ((X - cx) ** 2 + (Y - cy) ** 2) ** 0.5
            ring = 0.0
            R1, R2 = size * 0.30, size * 0.44
            if R1 <= dist <= R2:
                ring = max(0.0, 1 - abs(dist - (R1 + R2) / 2) / ((R2 - R1) / 2))
            col = (
                int(bg[0] * (1 - ring)),
                int(bg[1] * (1 - ring) + 235 * ring),
                int(bg[2] * (1 - ring) + 255 * ring),
            )
            if dist <= size * 0.12:
                col = (int(180 * (1 - ring) + 0 * ring), int(77 * (1 - ring) + 240 * ring), int(255 * (1 - ring) + 255 * ring))
            px += bytes((max(0, min(255, col[0])), max(0, min(255, col[1])), max(0, min(255, col[2])), 255))
    return bytes(px)

def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, size):
    raw = make_icon(size)
    rows = b''.join(b'\x00' + raw[y * size * 4:(y + 1) * size * 4] for y in range(size))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

os.makedirs('browser-extension/icons', exist_ok=True)
for s in (128, 48, 16):
    write_png(os.path.join('browser-extension', 'icons', 'icon%d.png' % s), s)
print('icons generated:', os.listdir('browser-extension/icons'))
