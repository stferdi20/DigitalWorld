#!/usr/bin/env python3
"""
Import Mega Man Battle Network 5 DS overworld characters (from bnsprite.py) as pack `bn5`.

    python3 tools/rom-extract/import_bn5.py out/sprites/bn

Overworld archives (`man*`) are isometric like Dusk: anims 0-7 are idle and 8-15 walk, in the
order up-right, up-right, down-right, down-right, down-left, down-left, up-left, up-left.
Each anim_NN.png is a strip of equal-size frames; frames are cropped to the character's
union bounding box so feet sit at the bottom of the cell.
"""
import glob, os, sys
from PIL import Image
from packs import Atlas, ROOT, write_pack

# our direction -> BN anim index (idle; walk is +8). Up uses up-left, down uses down-left.
DIRS = {'down': 4, 'left': 4, 'right': 2, 'up': 6}


def frames_of(strip, fw):
    return [strip.crop((i * fw, 0, (i + 1) * fw, strip.height)) for i in range(strip.width // fw)]


def main():
    src = sys.argv[1]
    os.makedirs(os.path.join(ROOT, 'bn5'), exist_ok=True)
    sprites = []
    for d in sorted(glob.glob(os.path.join(src, '**', 'man*'), recursive=True)):
        name = os.path.basename(d)
        strips = sorted(glob.glob(os.path.join(d, 'anim_*.png')))
        if len(strips) < 16:
            continue
        try:
            imgs = [Image.open(p).convert('RGBA') for p in strips[:16]]
            fw = imgs[0].width            # idle anims are single frames: their width is the frame width
            fr = {i: frames_of(im, fw) for i, im in enumerate(imgs)}
            box = None
            for fs in fr.values():
                for f in fs:
                    b = f.getbbox()
                    if b:
                        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
            if not box:
                continue
            cw, ch = (box[2] - box[0] + 7) // 8 * 8, (box[3] - box[1] + 7) // 8 * 8
            atlas = Atlas(cw, ch)

            def add(i):
                out = []
                for f in fr[i]:
                    c = Image.new('RGBA', (cw, ch))
                    crop = f.crop(box)
                    c.paste(crop, ((cw - crop.width) // 2, ch - crop.height), crop)
                    out.append(atlas.add(c))
                return out

            anims = {}
            for dname, i in DIRS.items():
                anims[f'idle_{dname}'] = add(i)
                anims[f'walk_{dname}'] = add(i + 8)
            anims['work'] = anims['idle_down']
            anims['happy'] = anims['walk_down'][:2]
            anims['hurt'] = anims['idle_down']
            sid = f'bn5_{name}'
            atlas.save(os.path.join(ROOT, 'bn5', f'{sid}.png'))
            sprites.append(dict(id=sid, name=name, sheet=f'{sid}.png', frame=[cw, ch], anchor=[0.5, 1],
                                scale=1, fps=10, anims=anims, thumb=anims['idle_down'][0]))
        except Exception as ex:
            print(name, 'skipped:', ex)
    write_pack('bn5', sprites)


if __name__ == '__main__':
    main()
