#!/usr/bin/env node
/**
 * Import Digimon World Dusk overworld sprites (as extracted by the ROM runbook:
 * sprites/overworld/NNNN/_sheet.png) into a local sprite pack.
 *
 *   npm run import-dusk -- <path/to/out/sprites/overworld>
 *
 * Output goes to public/assets/packs/dusk/ — it is gitignored on purpose: the art is
 * (c) Bandai Namco and must stay on your machine.
 *
 * Dusk overworld sheet layout (frames left to right):
 *   9-frame sets: 0 back idle, 1-2 back walk, 3 side idle, 4-5 side walk (facing left),
 *                 6 front, 7 crouch, 8 cheer
 *   6-frame sets (big 64x64 bosses): frames 0-5 as above, no front poses.
 * Right-facing anims are the left ones mirrored.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('usage: npm run import-dusk -- <out/sprites/overworld>'); process.exit(1); }
const root = 'public/assets/packs';
const outDir = path.join(root, 'dusk');
fs.mkdirSync(outDir, { recursive: true });

const seen = new Set();
const sprites = [];
for (const id of fs.readdirSync(src).sort()) {
  const dir = path.join(src, id);
  const sheetPath = path.join(dir, '_sheet.png');
  if (!fs.existsSync(sheetPath)) continue;
  const frames = fs.readdirSync(dir).filter((f) => /^frame_\d+\.png$/.test(f)).length;
  const buf = fs.readFileSync(sheetPath);
  const { width, height } = PNG.sync.read(buf);
  const fw = width / frames, fh = height;
  const nine = frames === 9 && fw >= 32;        // Digimon (16x32 9-frame sets are human NPCs)
  const six = frames === 6 && fw === 64;        // big bosses
  if (!nine && !six) continue;
  const hash = crypto.createHash('md5').update(buf).digest('hex');
  if (seen.has(hash)) continue;                 // the ROM repeats some sets
  seen.add(hash);
  fs.writeFileSync(path.join(outDir, `${id}.png`), buf);
  const side = { idle_left: [3], walk_left: [4, 3, 5, 3] };
  sprites.push({
    id: `dusk_${id}`, sheet: `${id}.png`, frame: [fw, fh], anchor: [0.5, 1], scale: 1, fps: 6,
    anims: nine
      ? { idle_down: [6], walk_down: [4, 3, 5, 3], idle_up: [0], walk_up: [1, 0, 2, 0], ...side,
          work: [6, 7], happy: [8, 6], hurt: [7] }
      : { idle_down: [3], walk_down: [4, 3, 5, 3], idle_up: [0], walk_up: [1, 0, 2, 0], ...side,
          work: [3, 4], happy: [3, 5], hurt: [3] },
    mirror: { idle_right: 'idle_left', walk_right: 'walk_left' },
    thumb: nine ? 6 : 3,
  });
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ pack: 'dusk', sprites }) + '\n');
const indexPath = path.join(root, 'index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { packs: [] };
if (!index.packs.includes('dusk')) index.packs.push('dusk');
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(`dusk: imported ${sprites.length} sprite sets → ${outDir}`);
