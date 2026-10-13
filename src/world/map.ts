import Phaser from 'phaser';
import type { Facing, Zone } from '../data/types';

/**
 * The world is a set of real Digimon World Dusk maps (exported locally from your ROM by
 * tools/dusk/export_maps.py) laid out around the office: the DigiLab in the middle, a
 * Digi-Farm island on each side. Each map comes with an 8px walk grid decoded from the
 * game's floor mask. Digimon walk inside a map and warp between maps, like in the game.
 */
export const CELL = 8;

export type AreaId = 'office' | 'exec' | 'machine' | 'dark' | 'nursery' | 'training' | 'pokemon' | 'net';

interface AreaDef {
  /** `map` is a file in assets/packs/<pack>/ (default pack: dusk-maps). */
  id: AreaId; map: string; pack?: string; label: string; zone: Zone;
  /** Office storey shown by the floor selector; farms are outdoors (always visible). */
  storey?: number;
  x: number; y: number; w: number; h: number;
  /** Where Digimon warp in/out, as a fraction of the map size (snapped to the nearest floor). */
  portal: [number, number];
  /** Hand-placed workstations, in 8px cells (on the map's floor pads / consoles). */
  desks?: [number, number][];
}

// DigiLab (maps 006/028 share a layout): the hex floor pads are workstations, the big
// arrow pads are the roomier seats used upstairs for Megas.
const HEX_PADS: [number, number][] = [[28, 13], [48, 13], [54, 17], [68, 18], [14, 21], [31, 30], [72, 25], [78, 29], [46, 37], [62, 37]];
const BIG_PADS: [number, number][] = [[28, 20], [44, 18], [38, 33], [68, 30]];

const GAP = 96;
const OFF = { x: 512 + GAP, y: 384 + GAP };
const ROW3 = OFF.y + 384 + GAP + 384 + GAP * 2;
export const AREAS: AreaDef[] = [
  { id: 'office', map: '006', label: 'DIGILAB · MAIN FLOOR', zone: 'office', storey: 1, x: OFF.x, y: OFF.y, w: 768, h: 384, portal: [0.12, 0.92], desks: [...HEX_PADS, BIG_PADS[0], BIG_PADS[3]] },
  { id: 'exec', map: '028', label: 'DIGILAB · EXECUTIVE FLOOR', zone: 'office', storey: 2, x: OFF.x, y: OFF.y, w: 768, h: 384, portal: [0.12, 0.92], desks: [...BIG_PADS, HEX_PADS[0], HEX_PADS[1]] },
  { id: 'machine', map: '054', label: 'SERVER FARM', zone: 'machine', x: OFF.x + 128, y: 0, w: 512, h: 384, portal: [0.5, 0.5] },
  { id: 'training', map: '055', label: 'TRAINING FARM', zone: 'training', x: OFF.x + 128, y: OFF.y + 384 + GAP, w: 512, h: 384, portal: [0.5, 0.5] },
  { id: 'dark', map: '061', label: 'DARK FARM', zone: 'dark', x: 0, y: OFF.y, w: 512, h: 384, portal: [0.5, 0.5] },
  { id: 'nursery', map: '057', label: 'DIGI-EGG NURSERY', zone: 'nursery', x: OFF.x + 768 + GAP, y: OFF.y, w: 512, h: 384, portal: [0.5, 0.5] },
  // Other games' home areas, below the Digital World (images from places_*.zip, walk grids from place_walk.py)
  { id: 'pokemon', map: 'pmd_town', pack: 'places', label: 'TREASURE TOWN (POKÉMON)', zone: 'pokemon', x: 0, y: ROW3, w: 960, h: 720, portal: [0.54, 0.44] },
  { id: 'net', map: 'bn5_net', pack: 'places', label: 'NET AREA (MEGA MAN)', zone: 'net', x: 960 + GAP, y: ROW3, w: 1280, h: 752, portal: [0.76, 0.84] },
];
export const WORLD_W = Math.max(...AREAS.map((a) => a.x + a.w));
export const WORLD_H = Math.max(...AREAS.map((a) => a.y + a.h));

export interface Cell { x: number; y: number; }
export interface Area extends AreaDef {
  cols: number; rows: number;
  walk: boolean[][];          // [row][col]
  portalCell: Cell;
  image: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  labelText: Phaser.GameObjects.Text;
}

export interface Spot { id: string; area: AreaId; x: number; y: number; facing: Facing; kind: 'desk' | 'evolve'; }

export interface World {
  areas: Map<AreaId, Area>;
  spots: Spot[];
}

export const areaForZone = (z: Zone): AreaId => (z === 'office' ? 'nursery' : z);
export const cellCenter = (a: Area, c: Cell) => ({ x: a.x + c.x * CELL + CELL / 2, y: a.y + c.y * CELL + CELL - 1 });

/** Queue the map images and walk grids. Missing files fall back to a plain placeholder floor. */
export function preloadMaps(scene: Phaser.Scene) {
  for (const a of AREAS) {
    const pack = a.pack ?? 'dusk-maps';
    scene.load.image(`map_${a.map}`, `assets/packs/${pack}/${a.map}.png`);
    scene.load.json(`walk_${a.map}`, `assets/packs/${pack}/${a.map}.json`);
  }
}

export function buildWorld(scene: Phaser.Scene): World {
  // Background: the Digital World's data sea, with links from the lab to each farm.
  const bg = scene.add.graphics().setDepth(0);
  bg.fillStyle(0x061428).fillRect(0, 0, WORLD_W, WORLD_H);
  bg.lineStyle(1, 0x0f3a5a, 0.6);
  for (let x = 0; x <= WORLD_W; x += 32) bg.lineBetween(x, 0, x, WORLD_H);
  for (let y = 0; y <= WORLD_H; y += 32) bg.lineBetween(0, y, WORLD_W, y);

  const areas = new Map<AreaId, Area>();
  for (const def of AREAS) {
    const tex = `map_${def.map}`;
    const grid = scene.cache.json.get(`walk_${def.map}`) as { walk: string[] } | undefined;
    const cols = def.w / CELL, rows = def.h / CELL;
    let walk: boolean[][];
    let image: Area['image'];
    if (scene.textures.exists(tex) && grid) {
      image = scene.add.image(def.x, def.y, tex).setOrigin(0).setDepth(1);
      walk = grid.walk.map((r) => [...r].map((c) => c === '1'));
    } else {
      // No exported maps yet: a plain floor so the office still runs.
      image = scene.add.rectangle(def.x + 16, def.y + 16, def.w - 32, def.h - 32, 0x1f3a5a).setOrigin(0).setDepth(1)
        .setStrokeStyle(2, 0x35e0ff);
      walk = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => x > 3 && y > 3 && x < cols - 4 && y < rows - 4));
    }
    const portalCell = nearestWalkable(walk, Math.floor(cols * def.portal[0]), Math.floor(rows * def.portal[1]));
    const labelText = scene.add.text(def.x + def.w / 2, def.y + 6, def.label,
      { fontFamily: 'monospace', fontSize: '10px', color: '#ffe680', backgroundColor: '#061428cc' })
      .setOrigin(0.5, 0).setPadding(4, 2, 4, 2).setDepth(2);
    areas.set(def.id, { ...def, cols, rows, walk, portalCell, image, labelText });
  }

  // data links between the lab entrance and each farm's warp pad
  const office = areas.get('office')!;
  const from = cellCenter(office, office.portalCell);
  bg.lineStyle(2, 0x35e0ff, 0.35);
  for (const id of ['machine', 'dark', 'nursery', 'training', 'pokemon', 'net'] as AreaId[]) {
    const a = areas.get(id)!;
    const to = cellCenter(a, a.portalCell);
    bg.lineBetween(from.x, from.y, to.x, to.y);
  }

  const spots: Spot[] = [...desksFor(areas.get('office')!, 12), ...desksFor(areas.get('exec')!, 6)];
  const tr = areas.get('training')!;
  spots.push({ id: 'evolve-pad', area: 'training', ...tr.portalCell, facing: 'down', kind: 'evolve' });
  return { areas, spots };
}

/** The map's hand-placed workstations (snapped onto floor), or spread ones on the placeholder floor. */
function desksFor(a: Area, max: number): Spot[] {
  if (!a.desks || a.image instanceof Phaser.GameObjects.Rectangle) return pickDesks(a, max);
  return a.desks.map(([x, y], i) => ({
    id: `${a.id}-desk-${i + 1}`, area: a.id, ...nearestWalkable(a.walk, x, y), facing: 'down' as Facing, kind: 'desk' as const,
  }));
}

/** Spread desks over open floor: cells with clear space around, far from each other and the entrance. */
function pickDesks(a: Area, max: number): Spot[] {
  const open = (x: number, y: number) => {
    for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (!a.walk[y + dy]?.[x + dx]) return false;
    return true;
  };
  const chosen: Cell[] = [];
  for (const spacing of [7, 6, 5, 4]) {
    for (let y = 0; y < a.rows && chosen.length < max; y++) {
      for (let x = 0; x < a.cols && chosen.length < max; x++) {
        if (!open(x, y)) continue;
        const far = (c: Cell, d: number) => Math.abs(c.x - x) >= d || Math.abs(c.y - y) >= d * 0.6;
        if (!far(a.portalCell, 6)) continue;
        if (chosen.every((c) => far(c, spacing))) chosen.push({ x, y });
      }
    }
    if (chosen.length >= max) break;
  }
  return chosen.map((c, i) => ({ id: `${a.id}-desk-${i + 1}`, area: a.id, x: c.x, y: c.y, facing: 'down', kind: 'desk' }));
}

export function nearestWalkable(walk: boolean[][], x: number, y: number): Cell {
  let best: Cell = { x, y }, bd = Infinity;
  walk.forEach((row, ry) => row.forEach((w, rx) => {
    const d = (rx - x) ** 2 + (ry - y) ** 2;
    if (w && d < bd) { bd = d; best = { x: rx, y: ry }; }
  }));
  return best;
}

export function randomWalkable(a: Area): Cell {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * a.cols), y = Math.floor(Math.random() * a.rows);
    if (a.walk[y][x]) return { x, y };
  }
  return a.portalCell;
}

/** 8-directional BFS on an area's walk grid. Returns the cell path excluding the start. */
export function findPath(walk: boolean[][], s: Cell, t: Cell): Cell[] {
  const rows = walk.length, cols = walk[0]?.length ?? 0;
  if (s.x === t.x && s.y === t.y) return [];
  const prev = new Int32Array(cols * rows).fill(-1);
  const start = s.y * cols + s.x, goal = t.y * cols + t.x;
  prev[start] = start;
  const q = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === goal) break;
    const cx = c % cols, cy = (c / cols) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      // no corner cutting
      if (dx && dy && (!walk[cy][nx] || !walk[ny][cx])) continue;
      const ni = ny * cols + nx;
      if (prev[ni] !== -1 || !walk[ny][nx]) continue;
      prev[ni] = c;
      q.push(ni);
    }
  }
  if (prev[goal] === -1) return [];
  const path: Cell[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push({ x: c % cols, y: (c / cols) | 0 });
  path.reverse();
  // keep every other cell so walking isn't jittery on the fine 8px grid
  return path.filter((_, i) => i % 2 === 1 || i === path.length - 1);
}
