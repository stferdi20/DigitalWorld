#!/usr/bin/env node
/**
 * Build a self-contained web copy in web/ (gitignored) for hosting as a private page:
 *   - the app, built with relative paths and without the raw public/ folder
 *   - each sprite pack's sheets embedded into its manifest as data URIs (keeps the file count low)
 *   - maps, places and sound copied as-is
 * The page HTML is written without <html>/<head> wrappers (the host adds them).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'web';
fs.rmSync(OUT, { recursive: true, force: true });
execSync(`npx vite build --outDir ${OUT} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env } });
// vite copies public/ by default; drop the raw packs and rebuild them compactly
fs.rmSync(path.join(OUT, 'assets', 'packs'), { recursive: true, force: true });
const SRC = 'public/assets/packs', DST = path.join(OUT, 'assets', 'packs');
fs.mkdirSync(DST, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8'));
fs.writeFileSync(path.join(DST, 'index.json'), JSON.stringify(index));
for (const pack of index.packs) {
  const man = JSON.parse(fs.readFileSync(path.join(SRC, pack, 'manifest.json'), 'utf8'));
  for (const s of man.sprites) {
    s.sheet = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, pack, s.sheet)).toString('base64');
  }
  fs.mkdirSync(path.join(DST, pack), { recursive: true });
  // keep every file well under the host's 16 MB per-file limit
  const chunks = [[]]; let size = 0;
  for (const s of man.sprites) {
    const n = s.sheet.length;
    if (size + n > 10e6 && chunks.at(-1).length) { chunks.push([]); size = 0; }
    chunks.at(-1).push(s); size += n;
  }
  const parts = chunks.slice(1).map((_, i) => `manifest.${i + 2}.json`);
  fs.writeFileSync(path.join(DST, pack, 'manifest.json'), JSON.stringify({ ...man, sprites: chunks[0], parts }));
  chunks.slice(1).forEach((c, i) => fs.writeFileSync(path.join(DST, pack, parts[i]), JSON.stringify({ pack, sprites: c })));
}
for (const dir of ['dusk-maps', 'places', 'sound/dusk']) {
  if (fs.existsSync(path.join(SRC, dir))) fs.cpSync(path.join(SRC, dir), path.join(DST, dir), { recursive: true });
}
// host-friendly page: strip the document wrapper, keep title, styles, mount point and script
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const pick = (re) => (html.match(re) || []).join('\n');
const page = [pick(/<title>[\s\S]*?<\/title>/g), pick(/<style>[\s\S]*?<\/style>/g),
  pick(/<script[^>]*src=[^>]*><\/script>/g), pick(/<link[^>]*rel="modulepreload"[^>]*>/g), '<div id="game"></div>'].join('\n');
fs.writeFileSync(path.join(OUT, 'page.html'), page);
// the corner widget is a second page served next to it (a full document of its own)
if (fs.existsSync(path.join(OUT, 'widget.html'))) console.log('widget page: widget.html');
const files = execSync(`find ${OUT} -type f`).toString().trim().split('\n');
console.log(`web/: ${files.length} files`);
