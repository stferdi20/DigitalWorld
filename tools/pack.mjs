#!/usr/bin/env node
/** Merge every <id>.json stub in a pack folder into manifest.json and register the pack in index.json. */
import fs from 'node:fs';
import path from 'node:path';

const pack = process.argv[2] ?? 'digimon-dusk';
const root = 'public/assets/packs';
const dir = path.join(root, pack);
const sprites = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ pack, sprites }, null, 2) + '\n');
const indexPath = path.join(root, 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
if (!index.packs.includes(pack)) index.packs.push(pack);
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(`${pack}: ${sprites.length} sprites → manifest.json; index has [${index.packs.join(', ')}]`);
