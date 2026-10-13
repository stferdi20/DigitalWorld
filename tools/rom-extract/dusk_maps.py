#!/usr/bin/env python3
"""
Export Digimon World Dusk field maps straight from your own ROM into a local, gitignored pack.

    pip install ndspy pillow
    python3 tools/rom-extract/dusk_maps.py "Digimon World - Dusk (USA).nds" [map ids...]

Writes public/assets/packs/dusk-maps/<id>.png (layer a under layer b) and <id>.json with an
8px walk grid ('1' = walkable) decoded from the map's .0t floor mask. With no ids, exports
the maps the office uses (see AREAS in src/world/areas.ts).

Formats (dat/map/<n>{a,b}.{c,p,s} and <n>.0t, each Nintendo RLE 0x30 / LZ 0x10-compressed):
  .c  u32 byte size, then 4bpp 8x8 tiles
  .p  u32 byte size, then BGR555 colours (16 per sub-palette)
  .s  u16 width px, u16 height px, then DS screen entries (tile:10, hflip, vflip, palette:4)
  .0t u32 width px, u32 height px, then a 1bpp mask, LSB first; 0 = floor you can walk on
"""
import json, os, struct, sys
import ndspy.rom
from PIL import Image

DEFAULT = [6, 28, 54, 55, 57, 61]
OUT = 'public/assets/packs/dusk-maps'


def decompress(d):
    t, n, i, o = d[0], d[1] | d[2] << 8 | d[3] << 16, 4, bytearray()
    if t == 0x30:  # RLE
        while len(o) < n:
            f = d[i]; i += 1
            if f & 0x80: o += bytes([d[i]]) * ((f & 0x7f) + 3); i += 1
            else: o += d[i:i + (f & 0x7f) + 1]; i += (f & 0x7f) + 1
    elif t == 0x10:  # LZ77
        while len(o) < n:
            fl = d[i]; i += 1
            for b in range(8):
                if len(o) >= n: break
                if fl & (0x80 >> b):
                    x = d[i] << 8 | d[i + 1]; i += 2
                    for _ in range((x >> 12) + 3): o.append(o[-((x & 0xfff) + 1)])
                else: o.append(d[i]); i += 1
    else:
        return bytes(d)
    return bytes(o[:n])


def layer(rom, n, l):
    try: c, p, s = (decompress(rom.getFileByName(f'dat/map/{n}{l}.{e}')) for e in 'cps')
    except (ValueError, KeyError): return None
    if len(c) < 8: return None
    tiles = c[4:4 + struct.unpack_from('<I', c, 0)[0]]
    pal = []
    for i in range((len(p) - 4) // 2):
        v = struct.unpack_from('<H', p, 4 + i * 2)[0]
        pal.append(((v & 31) * 255 // 31, (v >> 5 & 31) * 255 // 31, (v >> 10 & 31) * 255 // 31, 255))
    w, h = struct.unpack_from('<HH', s, 0)
    tw = w // 8
    img = Image.new('RGBA', (w, h)); px = img.load()
    for ty in range(h // 8):
        for tx in range(tw):
            e = struct.unpack_from('<H', s, 4 + (ty * tw + tx) * 2)[0]
            t, hf, vf, pb = e & 0x3ff, e >> 10 & 1, e >> 11 & 1, e >> 12
            if (t + 1) * 32 > len(tiles): continue
            for y in range(8):
                for x in range(8):
                    b = tiles[t * 32 + y * 4 + x // 2]
                    ci = b >> 4 if x & 1 else b & 15
                    if ci and pb * 16 + ci < len(pal):
                        px[tx * 8 + (7 - x if hf else x), ty * 8 + (7 - y if vf else y)] = pal[pb * 16 + ci]
    return img


def walk_grid(rom, n, cell=8):
    m = decompress(rom.getFileByName(f'dat/map/{n}.0t'))
    w, h = struct.unpack_from('<II', m, 0)
    bits = m[8:]
    rows = []
    for cy in range(h // cell):
        row = ''
        for cx in range(w // cell):
            floor = sum(1 for y in range(cy * cell, cy * cell + cell) for x in range(cx * cell, cx * cell + cell)
                        if not (bits[y * (w // 8) + x // 8] >> (x % 8)) & 1)
            row += '1' if floor >= cell * cell * 3 // 4 else '0'
        rows.append(row)
    return {'width': w, 'height': h, 'cell': cell, 'walk': rows}


def main():
    rom = ndspy.rom.NintendoDSRom.fromFile(sys.argv[1])
    ids = [int(a) for a in sys.argv[2:]] or DEFAULT
    os.makedirs(OUT, exist_ok=True)
    for n in ids:
        a, b = layer(rom, n, 'a'), layer(rom, n, 'b')
        img = a or b
        if b is not None and a is not None and b.size == a.size: img = Image.alpha_composite(a, b)
        img.save(f'{OUT}/{n:03d}.png')
        json.dump(walk_grid(rom, n), open(f'{OUT}/{n:03d}.json', 'w'))
        print(f'map {n:03d}: {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
