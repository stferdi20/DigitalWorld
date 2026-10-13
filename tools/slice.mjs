#!/usr/bin/env node
/**
 * Normalize a ripped sprite sheet (e.g. from The Spriters Resource) into the universal format:
 * uniform frames, feet anchored at the bottom-centre, transparent background.
 *
 *   npm run slice -- <input.png> --id veemon [--pack digimon-dusk] [--frame 32] [--bg auto|#rrggbb] [--min 12]
 *
 * Detects every sprite on the sheet (connected non-background pixels), orders them
 * row by row, and writes:
 *   public/assets/packs/<pack>/<id>.png      the normalized sheet (one row of frames)
 *   public/assets/packs/<pack>/<id>.json     a manifest stub; fill in `anims` by frame index,
 *                                            then merge it into the pack's manifest.json
 * Frame indices are also printed so you can see which number is which pose.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const input = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const id = opt('id');
if (!input || !id) { console.error('usage: npm run slice -- <input.png> --id <spriteId> [--pack digimon-dusk] [--frame 32] [--bg auto]'); process.exit(1); }
const pack = opt('pack', 'digimon-dusk');
const minPixels = Number(opt('min', '12'));

const src = PNG.sync.read(fs.readFileSync(input));
const { width: w, height: h, data } = src;
const px = (x, y) => (y * w + x) * 4;

// Background: explicit colour, or the top-left pixel (rips usually use a flat key colour).
let bg = opt('bg', 'auto');
const bgRGB = bg === 'auto' ? [data[0], data[1], data[2]] : [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
const isBg = (i) => data[i + 3] < 16 || (data[i] === bgRGB[0] && data[i + 1] === bgRGB[1] && data[i + 2] === bgRGB[2]);

// Connected components (8-way) of foreground pixels.
const seen = new Uint8Array(w * h);
let boxes = [];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (seen[y * w + x] || isBg(px(x, y))) continue;
  const b = { x0: x, y0: y, x1: x, y1: y, n: 0 };
  const stack = [[x, y]]; seen[y * w + x] = 1;
  while (stack.length) {
    const [cx, cy] = stack.pop(); b.n++;
    b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx); b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || isBg(px(nx, ny))) continue;
      seen[ny * w + nx] = 1; stack.push([nx, ny]);
    }
  }
  boxes.push(b);
}
// Merge detached bits (e.g. a floating tail or effect) into nearby boxes, then drop specks.
const near = (a, b, pad = 2) => a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;
for (let merged = true; merged;) {
  merged = false;
  outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (!near(boxes[i], boxes[j])) continue;
    const a = boxes[i], b = boxes[j];
    boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
    boxes.splice(j, 1); merged = true; break outer;
  }
}
boxes = boxes.filter((b) => b.n >= minPixels);
if (!boxes.length) { console.error('No sprites found — try --bg #rrggbb'); process.exit(1); }

// Row-major order: group by overlapping vertical bands, then left to right.
boxes.sort((a, b) => a.y0 - b.y0);
const rows = [];
for (const b of boxes) {
  const row = rows.find((r) => b.y0 <= r.y1 && b.y1 >= r.y0);
  if (row) { row.items.push(b); row.y0 = Math.min(row.y0, b.y0); row.y1 = Math.max(row.y1, b.y1); }
  else rows.push({ y0: b.y0, y1: b.y1, items: [b] });
}
const ordered = rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));

// Frame size: given, or the largest sprite rounded up to the 16px grid.
const maxW = Math.max(...ordered.map((b) => b.x1 - b.x0 + 1));
const maxH = Math.max(...ordered.map((b) => b.y1 - b.y0 + 1));
const F = Number(opt('frame', String(Math.ceil(Math.max(maxW, maxH) / 16) * 16)));
if (maxW > F || maxH > F) console.warn(`warning: largest sprite ${maxW}x${maxH} exceeds frame ${F}; it will be cropped`);

const out = new PNG({ width: F * ordered.length, height: F });
ordered.forEach((b, i) => {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  const ox = i * F + Math.floor((F - bw) / 2), oy = F - bh; // bottom-centre = feet
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const s = px(b.x0 + x, b.y0 + y);
    if (isBg(s)) continue;
    const tx = ox + x, ty = oy + y;
    if (tx < i * F || tx >= (i + 1) * F || ty < 0) continue;
    const d = (ty * out.width + tx) * 4;
    out.data[d] = data[s]; out.data[d + 1] = data[s + 1]; out.data[d + 2] = data[s + 2]; out.data[d + 3] = 255;
  }
});

const dir = path.join('public/assets/packs', pack);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(out));
const stub = { id, sheet: `${id}.png`, frame: [F, F], anchor: [0.5, 1], scale: 1, fps: 6,
  anims: { idle_down: [0] } };
fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(stub, null, 2) + '\n');

console.log(`${ordered.length} frames of ${F}x${F} → ${dir}/${id}.png`);
ordered.forEach((b, i) => console.log(`  [${i}] from (${b.x0},${b.y0}) ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`));
console.log(`Edit ${dir}/${id}.json anims, then run: npm run pack -- ${pack}`);
