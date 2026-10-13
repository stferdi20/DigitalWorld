"""Shared helpers for writing sprite packs in the engine's universal format (see src/data/types.ts)."""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'packs')


def write_pack(pack, sprites):
    """Write <pack>/manifest.json and register the pack in index.json."""
    d = os.path.join(ROOT, pack)
    os.makedirs(d, exist_ok=True)
    json.dump({'pack': pack, 'sprites': sprites}, open(os.path.join(d, 'manifest.json'), 'w'))
    idx_path = os.path.join(ROOT, 'index.json')
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {'packs': []}
    if pack not in idx['packs']:
        idx['packs'].append(pack)
    json.dump(idx, open(idx_path, 'w'), indent=2)
    print(f'{pack}: {len(sprites)} sprites -> {d}')


class Atlas:
    """Uniform-cell sprite sheet: frames are appended left to right, COLS per row."""
    COLS = 16

    def __init__(self, cw, ch):
        from PIL import Image
        self.cw, self.ch, self.frames = cw, ch, []
        self.Image = Image

    def add(self, img):
        self.frames.append(img)
        return len(self.frames) - 1

    def save(self, path):
        rows = (len(self.frames) + self.COLS - 1) // self.COLS
        sheet = self.Image.new('RGBA', (self.cw * min(self.COLS, len(self.frames)), self.ch * rows))
        for i, f in enumerate(self.frames):
            sheet.paste(f, ((i % self.COLS) * self.cw, (i // self.COLS) * self.ch))
        sheet.save(path)
