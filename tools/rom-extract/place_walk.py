#!/usr/bin/env python3
"""
Turn a place image (PMD ground map / BN5 area render, which carry no collision data)
into a world area: copies the PNG into public/assets/packs/places/ and writes an 8px
walk grid guessed from colour, in the same format as the Dusk maps.

    python3 tools/rom-extract/place_walk.py <image.png> <id> <mode>

Modes:
  net    BN net areas: walkways are the bright top faces on black; side faces are darker.
  town   PMD towns: sand paths and light grass are floor; trees, water, roofs, fences aren't.
Only the largest connected floor region is kept, so nobody gets stranded.
"""
import json, os, shutil, sys
from collections import deque
from PIL import Image
from packs import ROOT

CELL = 8


def floor_pixel(mode, r, g, b, a, lum_cut):
    if a < 128:
        return False
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    if mode == 'net':
        return lum >= lum_cut
    # town: sand path (warm, bright) or light grass (bright yellow-green)
    sand = r > 200 and g > 190 and 110 < b < 215 and r >= b + 20
    grass = g > 190 and r > 130 and b < 160 and g - b > 70
    return sand or grass


def main():
    src, pid, mode = sys.argv[1], sys.argv[2], sys.argv[3]
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    w8, h8 = w // CELL * CELL, h // CELL * CELL
    px = im.load()
    lum_cut = 0
    if mode == 'net':
        lums = sorted(0.3 * px[x, y][0] + 0.59 * px[x, y][1] + 0.11 * px[x, y][2]
                      for y in range(0, h, 2) for x in range(0, w, 2) if sum(px[x, y][:3]) > 60 and px[x, y][3] > 128)
        lum_cut = lums[len(lums) * 45 // 100] if lums else 128   # brighter ~55% of the visible pixels
    cols, rows = w8 // CELL, h8 // CELL
    grid = [[False] * cols for _ in range(rows)]
    for cy in range(rows):
        for cx in range(cols):
            n = sum(floor_pixel(mode, *px[x, y], lum_cut) for y in range(cy * CELL, cy * CELL + CELL, 2) for x in range(cx * CELL, cx * CELL + CELL, 2))
            grid[cy][cx] = n >= 8           # of 16 samples
    # close small holes (dots, edge lines, grass texture): dilate then erode
    def morph(g, grow):
        out = [[False] * cols for _ in range(rows)]
        for y in range(rows):
            for x in range(cols):
                nb = [g[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if 0 <= y + dy < rows and 0 <= x + dx < cols]
                out[y][x] = any(nb) if grow else all(nb)
        return out
    k = 2 if mode == 'net' else 1   # net walkways have dark seams at junctions
    for _ in range(k): grid = morph(grid, True)
    for _ in range(k): grid = morph(grid, False)
    # never stand on the void: drop cells that are mostly black / transparent
    for cy in range(rows):
        for cx in range(cols):
            void = sum(1 for y in range(cy * CELL, cy * CELL + CELL, 2) for x in range(cx * CELL, cx * CELL + CELL, 2)
                       if px[x, y][3] < 128 or sum(px[x, y][:3]) < 40)
            if void > 6:
                grid[cy][cx] = False
    # keep the largest 4-connected region
    seen, best = set(), []
    for y in range(rows):
        for x in range(cols):
            if grid[y][x] and (x, y) not in seen:
                comp, q = [], deque([(x, y)]); seen.add((x, y))
                while q:
                    cx, cy = q.popleft(); comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < cols and 0 <= ny < rows and grid[ny][nx] and (nx, ny) not in seen:
                            seen.add((nx, ny)); q.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    keep = set(best)
    walk = [''.join('1' if (x, y) in keep else '0' for x in range(cols)) for y in range(rows)]
    out = os.path.join(ROOT, 'places')
    os.makedirs(out, exist_ok=True)
    im.crop((0, 0, w8, h8)).save(os.path.join(out, f'{pid}.png'))
    json.dump({'width': w8, 'height': h8, 'cell': CELL, 'walk': walk}, open(os.path.join(out, f'{pid}.json'), 'w'))
    print(f'{pid}: {w8}x{h8}, {len(best)} floor cells of {cols * rows}')


if __name__ == '__main__':
    main()
