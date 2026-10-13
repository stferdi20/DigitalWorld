#!/usr/bin/env python3
"""
Import Pokémon Mystery Dungeon: Explorers of Sky sprites (PMDCollab format, from pmd.py) as pack `pmd`.

    python3 tools/rom-extract/import_pmd.py out/pokemon

Each Pokémon folder (NNNN_Name) has <Anim>-Anim.png sheets (8 direction rows: down, down-right,
right, up-right, up, up-left, left, down-left), <Anim>-Shadow.png and AnimData.xml with frame sizes.
Frames are re-cut into one uniform-cell atlas per Pokémon, aligned on the shadow so feet line up.
"""
import os, re, sys
import xml.etree.ElementTree as ET
from PIL import Image
from packs import Atlas, ROOT, write_pack

DIRS = {'down': 0, 'right': 2, 'up': 4, 'left': 6}
# our anim -> PMD anims to try, and which direction row
WANT = {'work': (['Shoot', 'Charge', 'Attack'], 0), 'happy': (['Pose', 'Hop', 'Double'], 0), 'hurt': (['Hurt'], 0)}
MAX_CELL = 64


def anims_of(folder):
    root = ET.parse(os.path.join(folder, 'AnimData.xml')).getroot()
    raw = {a.findtext('Name'): a for a in root.iter('Anim')}
    out = {}
    for name, a in raw.items():
        src = a.findtext('CopyOf') or name
        s = raw.get(src)
        if s is None or s.findtext('FrameWidth') is None:
            continue
        durs = [int(d.text) for d in s.iter('Duration')]
        out[name] = dict(file=src, w=int(s.findtext('FrameWidth')), h=int(s.findtext('FrameHeight')), durs=durs)
    return out


def shadow_center(folder, a):
    """Centre of the shadow in the first frame of the first row (= where the feet are)."""
    p = os.path.join(folder, f"{a['file']}-Shadow.png")
    if not os.path.exists(p):
        return a['w'] / 2, a['h'] * 0.75
    sh = Image.open(p).convert('RGBA').crop((0, 0, a['w'], a['h']))
    px = [(x, y) for y in range(a['h']) for x in range(a['w']) if sh.getpixel((x, y))[3]]
    if not px:
        return a['w'] / 2, a['h'] * 0.75
    return sum(x for x, _ in px) / len(px), sum(y for _, y in px) / len(px)


def main():
    src = sys.argv[1]
    os.makedirs(os.path.join(ROOT, 'pmd'), exist_ok=True)
    sprites = []
    for folder in sorted(os.listdir(src)):
        path = os.path.join(src, folder)
        m = re.match(r'(\d+)_(.*)', folder)
        if not m or not os.path.exists(os.path.join(path, 'AnimData.xml')):
            continue
        name = m.group(2)
        try:
            anims = anims_of(path)
            if 'Walk' not in anims:
                continue
            chosen = {'Walk': anims['Walk'], 'Idle': anims.get('Idle', anims['Walk'])}
            for ours, (names, _) in WANT.items():
                pick = next((n for n in names if n in anims), None)
                if pick:
                    chosen[pick] = anims[pick]
            cell = min(MAX_CELL, max(max(a['w'], a['h']) for a in chosen.values()))
            cell = (cell + 7) // 8 * 8
            ax, ay = cell / 2, cell * 0.8      # where the shadow centre goes in every cell
            atlas = Atlas(cell, cell)
            frames = {}

            def cut(anim_name, row):
                a = chosen[anim_name]
                sheet = Image.open(os.path.join(path, f"{a['file']}-Anim.png")).convert('RGBA')
                rows = sheet.height // a['h']
                row = min(row, rows - 1)
                sx, sy = shadow_center(path, a)
                idx = []
                for f in range(sheet.width // a['w']):
                    fr = sheet.crop((f * a['w'], row * a['h'], (f + 1) * a['w'], (row + 1) * a['h']))
                    c = Image.new('RGBA', (cell, cell))
                    c.paste(fr, (round(ax - sx), round(ay - sy)), fr)
                    idx.append(atlas.add(c))
                return idx

            out = {}
            for d, row in DIRS.items():
                out[f'walk_{d}'] = cut('Walk', row)
                out[f'idle_{d}'] = cut('Idle', row)
            for ours, (names, row) in WANT.items():
                pick = next((n for n in names if n in chosen), None)
                if pick:
                    out[ours] = cut(pick, row)
            walk = anims['Walk']['durs']
            fps = max(4, min(12, round(60 / (sum(walk) / len(walk)))))
            sid = 'pmd_' + name.lower()
            atlas.save(os.path.join(ROOT, 'pmd', f'{sid}.png'))
            sprites.append(dict(id=sid, name=name, sheet=f'{sid}.png', frame=[cell, cell], anchor=[0.5, 0.8],
                                scale=1, fps=fps, anims=out, thumb=out['idle_down'][0]))
        except Exception as ex:  # keep going: one odd sprite shouldn't stop the import
            print(folder, 'skipped:', ex)
    write_pack('pmd', sprites)


if __name__ == '__main__':
    main()
