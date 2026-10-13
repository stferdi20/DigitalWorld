import Phaser from 'phaser';
import type { Facing, Zone } from '../data/types';

/**
 * Placeholder world built in code until the Dusk tilesets are sliced into Tiled maps.
 * Layer names and the spot/zone model match what the Tiled map will provide, so the
 * swap only replaces this file.
 */
export const TILE = 16;
export const W = 80, H = 56;

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Spot { id: string; x: number; y: number; facing: Facing; zone: Zone; kind: 'desk' | 'meeting' | 'evolve'; storey: number; }

export const OFFICE: Rect = { x: 30, y: 19, w: 21, h: 16 };
export const ZONES: Record<Exclude<Zone, 'office'>, Rect> = {
  machine: { x: 28, y: 2, w: 25, h: 12 },
  dark: { x: 3, y: 18, w: 20, h: 18 },
  nursery: { x: 58, y: 18, w: 19, h: 18 },
  training: { x: 28, y: 41, w: 25, h: 13 },
};
const FARM_STYLE: Record<keyof typeof ZONES, { base: number; dot: number; label: string }> = {
  machine: { base: 0x3a4652, dot: 0x6fd3ff, label: 'SERVER FARM' },
  dark: { base: 0x2a1b36, dot: 0x9b4dff, label: 'DARK FARM' },
  nursery: { base: 0x5f9c4a, dot: 0xffe680, label: 'DIGI-EGG NURSERY' },
  training: { base: 0x8a6a3a, dot: 0xffb04a, label: 'TRAINING FARM' },
};

export interface WorldLayers {
  ground: Phaser.GameObjects.Graphics;
  floor: Phaser.GameObjects.Graphics;
  wallsBack: Phaser.GameObjects.Graphics;
  furniture: Phaser.GameObjects.Graphics;
  wallsFront: Phaser.GameObjects.Graphics;
  wallsFrontCut: Phaser.GameObjects.Graphics;
  roof: Phaser.GameObjects.Container;
}

/** Interior layers of one office storey (storey 1 also owns the outdoor world). */
export interface Storey {
  level: number;
  layers: Phaser.GameObjects.Graphics[];   // shown only while this storey is viewed
  walkable: boolean[][];                   // [y][x]
}

export interface World {
  layers: WorldLayers;
  walkable: boolean[][];   // storey 1 grid (= storeys[0].walkable)
  storeys: Storey[];
  stairs: { x: number; y: number };
  spots: Spot[];
  doors: { x: number; y: number }[];
}

export const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function buildWorld(scene: Phaser.Scene): World {
  const walkable = Array.from({ length: H }, () => Array<boolean>(W).fill(true));
  const block = (x: number, y: number) => { if (y >= 0 && y < H && x >= 0 && x < W) walkable[y][x] = false; };
  const px = (t: number) => t * TILE;

  // --- ground: digital grass with grid glow + paths
  const ground = scene.add.graphics().setDepth(0);
  ground.fillStyle(0x1f5f4a).fillRect(0, 0, px(W), px(H));
  ground.lineStyle(1, 0x2f8f6f, 0.35);
  for (let x = 0; x <= W; x++) ground.lineBetween(px(x), 0, px(x), px(H));
  for (let y = 0; y <= H; y++) ground.lineBetween(0, px(y), px(W), px(y));
  // water border, like the DS maps' data-sea
  ground.fillStyle(0x0b2a5a).fillRect(0, 0, px(W), px(1)).fillRect(0, px(H - 1), px(W), px(1))
    .fillRect(0, 0, px(1), px(H)).fillRect(px(W - 1), 0, px(1), px(H));
  for (let x = 0; x < W; x++) { block(x, 0); block(x, H - 1); }
  for (let y = 0; y < H; y++) { block(0, y); block(W - 1, y); }

  const doors = [
    { x: OFFICE.x + 10, y: OFFICE.y },                 // north → server farm
    { x: OFFICE.x + 10, y: OFFICE.y + OFFICE.h - 1 },  // south → training
    { x: OFFICE.x, y: OFFICE.y + 8 },                  // west → dark
    { x: OFFICE.x + OFFICE.w - 1, y: OFFICE.y + 8 },   // east → nursery
  ];
  ground.fillStyle(0xc8b07a);
  ground.fillRect(px(doors[0].x), px(ZONES.machine.y + ZONES.machine.h), px(1), px(OFFICE.y - ZONES.machine.y - ZONES.machine.h));
  ground.fillRect(px(doors[1].x), px(OFFICE.y + OFFICE.h), px(1), px(ZONES.training.y - OFFICE.y - OFFICE.h));
  ground.fillRect(px(ZONES.dark.x + ZONES.dark.w), px(doors[2].y), px(OFFICE.x - ZONES.dark.x - ZONES.dark.w), px(1));
  ground.fillRect(px(OFFICE.x + OFFICE.w), px(doors[3].y), px(ZONES.nursery.x - OFFICE.x - OFFICE.w), px(1));

  // --- farms
  for (const [zone, r] of Object.entries(ZONES) as [keyof typeof ZONES, Rect][]) {
    const st = FARM_STYLE[zone];
    ground.fillStyle(st.base).fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
    ground.fillStyle(st.dot, 0.5);
    for (let y = r.y + 1; y < r.y + r.h - 1; y += 2)
      for (let x = r.x + 1 + (y % 4 === 0 ? 1 : 0); x < r.x + r.w - 1; x += 3) ground.fillRect(px(x) + 6, px(y) + 6, 3, 3);
    ground.lineStyle(2, 0xe8e0c8).strokeRect(px(r.x) + 1, px(r.y) + 1, px(r.w) - 2, px(r.h) - 2);
    scene.add.text(px(r.x) + 4, px(r.y) + 3, st.label, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' })
      .setDepth(1).setAlpha(0.8);
  }

  // --- office floor
  const floor = scene.add.graphics().setDepth(1);
  floor.fillStyle(0x24324a).fillRect(px(OFFICE.x), px(OFFICE.y), px(OFFICE.w), px(OFFICE.h));
  floor.lineStyle(1, 0x35e0ff, 0.15);
  for (let x = OFFICE.x; x <= OFFICE.x + OFFICE.w; x++) floor.lineBetween(px(x), px(OFFICE.y), px(x), px(OFFICE.y + OFFICE.h));
  for (let y = OFFICE.y; y <= OFFICE.y + OFFICE.h; y++) floor.lineBetween(px(OFFICE.x), px(y), px(OFFICE.x + OFFICE.w), px(y));
  const MEET_X = OFFICE.x + 14; // inner wall column between workspace and meeting room
  floor.fillStyle(0x3a2a4a).fillRect(px(MEET_X + 1), px(OFFICE.y + 1), px(OFFICE.x + OFFICE.w - MEET_X - 2), px(OFFICE.h - 2));

  // --- walls. Back wall is never cut; side/front/inner walls get the Sims cutaway.
  const isDoor = (x: number, y: number) => doors.some((d) => d.x === x && d.y === y);
  const wallsBack = scene.add.graphics().setDepth(2);
  const wallsFront = scene.add.graphics();
  const wallsFrontCut = scene.add.graphics();
  const WALL_TOP = 0x8fb4d8, WALL_FACE = 0x5a7ca8, CUT = 0x3f5878;
  for (let x = OFFICE.x; x < OFFICE.x + OFFICE.w; x++) {
    block(x, OFFICE.y); block(x, OFFICE.y + OFFICE.h - 1);
    if (!isDoor(x, OFFICE.y)) {
      wallsBack.fillStyle(WALL_FACE).fillRect(px(x), px(OFFICE.y) - 16, TILE, 32);
      wallsBack.fillStyle(WALL_TOP).fillRect(px(x), px(OFFICE.y) - 16, TILE, 4);
    }
  }
  const frontTiles: { x: number; y: number }[] = [];
  for (let x = OFFICE.x; x < OFFICE.x + OFFICE.w; x++) frontTiles.push({ x, y: OFFICE.y + OFFICE.h - 1 });
  for (let y = OFFICE.y + 1; y < OFFICE.y + OFFICE.h - 1; y++) {
    frontTiles.push({ x: OFFICE.x, y }, { x: OFFICE.x + OFFICE.w - 1, y });
    if (y !== OFFICE.y + 4 && y !== OFFICE.y + 10) frontTiles.push({ x: MEET_X, y });
  }
  for (const t of frontTiles) {
    block(t.x, t.y);
    if (isDoor(t.x, t.y)) continue;
    // full height wall extends one tile upwards, occluding what's behind it
    wallsFront.fillStyle(WALL_FACE).fillRect(px(t.x), px(t.y) - 16, TILE, 32);
    wallsFront.fillStyle(WALL_TOP).fillRect(px(t.x), px(t.y) - 16, TILE, 4);
    wallsFrontCut.fillStyle(CUT).fillRect(px(t.x), px(t.y) + 8, TILE, 8);
    wallsFrontCut.fillStyle(WALL_TOP).fillRect(px(t.x), px(t.y) + 8, TILE, 2);
  }
  for (const d of doors) walkable[d.y][d.x] = true;
  walkable[OFFICE.y + 4][MEET_X] = walkable[OFFICE.y + 10][MEET_X] = true;

  // --- furniture + spots
  const furniture = scene.add.graphics().setDepth(3);
  const spots: Spot[] = [];
  let n = 0;
  for (const row of [OFFICE.y + 3, OFFICE.y + 7, OFFICE.y + 11]) {
    for (const col of [OFFICE.x + 1, OFFICE.x + 4, OFFICE.x + 7, OFFICE.x + 10]) {
      furniture.fillStyle(0x7a5a3a).fillRect(px(col), px(row) + 4, px(2), 12);
      furniture.fillStyle(0x111822).fillRect(px(col) + 4, px(row) - 4, 12, 10);
      furniture.fillStyle(0x35e0ff).fillRect(px(col) + 5, px(row) - 3, 10, 7);
      furniture.fillStyle(0x111822).fillRect(px(col) + 20, px(row) - 2, 10, 8);
      furniture.fillStyle(0x7dff9a).fillRect(px(col) + 21, px(row) - 1, 8, 5);
      block(col, row); block(col + 1, row);
      // One seat per desk: Dusk sprites are 2 tiles wide, so neighbours would overlap.
      spots.push({ id: `desk-${++n}`, x: col, y: row + 1, facing: 'up', zone: 'office', kind: 'desk', storey: 1 });
    }
  }
  // meeting table
  const tx = MEET_X + 2, ty = OFFICE.y + 5;
  furniture.fillStyle(0x5a3a6a).fillRect(px(tx), px(ty), px(2), px(4));
  for (let y = ty; y < ty + 4; y++) { block(tx, y); block(tx + 1, y); }
  for (let y = ty; y < ty + 4; y++) {
    spots.push({ id: `meet-${y}-l`, x: tx - 1, y, facing: 'right', zone: 'office', kind: 'meeting', storey: 1 });
    spots.push({ id: `meet-${y}-r`, x: tx + 2, y, facing: 'left', zone: 'office', kind: 'meeting', storey: 1 });
  }
  // evolution pad in the training farm
  const ev = { x: ZONES.training.x + 12, y: ZONES.training.y + 6 };
  ground.fillStyle(0xffffff, 0.25).fillCircle(px(ev.x) + 8, px(ev.y) + 8, 14);
  ground.lineStyle(2, 0xffd84a).strokeCircle(px(ev.x) + 8, px(ev.y) + 8, 14);
  spots.push({ id: 'evolve-pad', x: ev.x, y: ev.y, facing: 'down', zone: 'training', kind: 'evolve', storey: 1 });

  // --- roof (container so it can fade as a whole)
  const roofG = scene.add.graphics();
  roofG.fillStyle(0x2b4f7a).fillRect(px(OFFICE.x) - 4, px(OFFICE.y) - 20, px(OFFICE.w) + 8, px(OFFICE.h) + 20);
  roofG.lineStyle(1, 0x4f86c0, 0.8);
  for (let y = px(OFFICE.y) - 16; y < px(OFFICE.y + OFFICE.h); y += 6) roofG.lineBetween(px(OFFICE.x) - 4, y, px(OFFICE.x + OFFICE.w) + 4, y);
  const sign = scene.add.text(px(OFFICE.x + OFFICE.w / 2), px(OFFICE.y + OFFICE.h / 2) - 8, 'DIGITAL WORLD OFFICE',
    { fontFamily: 'monospace', fontSize: '10px', color: '#ffe680', backgroundColor: '#14233a' }).setOrigin(0.5).setPadding(4, 2, 4, 2);
  const roof = scene.add.container(0, 0, [roofG, sign]).setDepth(20000);

  // stairs (bottom-right of the workspace) connect storey 1 and 2 on the same tile
  const stairs = { x: OFFICE.x + 12, y: OFFICE.y + OFFICE.h - 3 };
  drawStairs(furniture, stairs, 'up');

  const upper = buildUpperStorey(scene, stairs, spots);
  return {
    layers: { ground, floor, wallsBack, furniture, wallsFront, wallsFrontCut, roof },
    walkable,
    storeys: [{ level: 1, layers: [floor, wallsBack, furniture, wallsFront, wallsFrontCut], walkable }, upper],
    stairs, spots, doors,
  };
}

function drawStairs(g: Phaser.GameObjects.Graphics, at: { x: number; y: number }, dir: 'up' | 'down') {
  const x = at.x * TILE, y = at.y * TILE;
  g.fillStyle(0x1a1a24).fillRect(x - 2, y - 2, TILE + 4, TILE + 4);
  for (let i = 0; i < 4; i++) {
    const shade = dir === 'up' ? 0x9ab0c8 - i * 0x101010 : 0x5a6878 + i * 0x101010;
    g.fillStyle(shade).fillRect(x, y + i * 4, TILE, 3);
  }
  g.fillStyle(0xffe680).fillTriangle(x + 8, y + (dir === 'up' ? 1 : 15), x + 4, y + 8, x + 12, y + 8);
}

/**
 * Storey 2: the executive floor for Ultimate/Mega Digimon. Same footprint as the office,
 * no outside doors; reached by the stairs.
 */
function buildUpperStorey(scene: Phaser.Scene, stairs: { x: number; y: number }, spots: Spot[]): Storey {
  const px = (t: number) => t * TILE;
  const walk = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
  for (let y = OFFICE.y + 1; y < OFFICE.y + OFFICE.h - 1; y++)
    for (let x = OFFICE.x + 1; x < OFFICE.x + OFFICE.w - 1; x++) walk[y][x] = true;

  const floor = scene.add.graphics().setDepth(1);
  floor.fillStyle(0x2a1f3a).fillRect(px(OFFICE.x), px(OFFICE.y), px(OFFICE.w), px(OFFICE.h));
  floor.fillStyle(0x6a2a4a).fillRect(px(OFFICE.x + 3), px(OFFICE.y + 2), px(OFFICE.w - 6), px(OFFICE.h - 4)); // carpet
  floor.lineStyle(1, 0xffd84a, 0.25).strokeRect(px(OFFICE.x + 3) + 2, px(OFFICE.y + 2) + 2, px(OFFICE.w - 6) - 4, px(OFFICE.h - 4) - 4);

  const WALL_TOP = 0xc8a8e8, WALL_FACE = 0x6a4a8a, CUT = 0x4a3468;
  const wallsBack = scene.add.graphics().setDepth(2);
  const wallsFront = scene.add.graphics();
  const wallsFrontCut = scene.add.graphics();
  for (let x = OFFICE.x; x < OFFICE.x + OFFICE.w; x++) {
    wallsBack.fillStyle(WALL_FACE).fillRect(px(x), px(OFFICE.y) - 16, TILE, 32);
    wallsBack.fillStyle(WALL_TOP).fillRect(px(x), px(OFFICE.y) - 16, TILE, 4);
    // windows looking out over the Digital World
    if (x % 3 === 0) wallsBack.fillStyle(0x6fd3ff, 0.8).fillRect(px(x) + 3, px(OFFICE.y) - 8, 10, 12);
  }
  const front: { x: number; y: number }[] = [];
  for (let x = OFFICE.x; x < OFFICE.x + OFFICE.w; x++) front.push({ x, y: OFFICE.y + OFFICE.h - 1 });
  for (let y = OFFICE.y + 1; y < OFFICE.y + OFFICE.h - 1; y++) front.push({ x: OFFICE.x, y }, { x: OFFICE.x + OFFICE.w - 1, y });
  for (const t of front) {
    wallsFront.fillStyle(WALL_FACE).fillRect(px(t.x), px(t.y) - 16, TILE, 32);
    wallsFront.fillStyle(WALL_TOP).fillRect(px(t.x), px(t.y) - 16, TILE, 4);
    wallsFrontCut.fillStyle(CUT).fillRect(px(t.x), px(t.y) + 8, TILE, 8);
    wallsFrontCut.fillStyle(WALL_TOP).fillRect(px(t.x), px(t.y) + 8, TILE, 2);
  }

  const furniture = scene.add.graphics().setDepth(3);
  let n = 0;
  // big executive desks: 3 wide, wider gaps so Mega sprites (64px) fit
  for (const row of [OFFICE.y + 4, OFFICE.y + 9]) {
    for (const col of [OFFICE.x + 3, OFFICE.x + 9]) {
      furniture.fillStyle(0x4a2a1a).fillRect(px(col), px(row) + 2, px(3), 14);
      furniture.fillStyle(0xffd84a).fillRect(px(col), px(row) + 2, px(3), 2);
      furniture.fillStyle(0x111822).fillRect(px(col) + 14, px(row) - 6, 20, 12);
      furniture.fillStyle(0xff7ad8).fillRect(px(col) + 15, px(row) - 5, 18, 9);
      for (let i = 0; i < 3; i++) walk[row][col + i] = false;
      spots.push({ id: `exec-${++n}`, x: col + 1, y: row + 1, facing: 'up', zone: 'office', kind: 'desk', storey: 2 });
    }
  }
  // lounge sofa
  const sx = OFFICE.x + 15, sy = OFFICE.y + 3;
  furniture.fillStyle(0x8a3a5a).fillRect(px(sx), px(sy), px(4), px(1)).fillRect(px(sx), px(sy), px(1), px(4));
  for (let i = 0; i < 4; i++) { walk[sy][sx + i] = false; walk[sy + i][sx] = false; }
  for (let i = 1; i < 4; i++)
    spots.push({ id: `lounge-${i}`, x: sx + i, y: sy + 2, facing: 'up', zone: 'office', kind: 'meeting', storey: 2 });
  drawStairs(furniture, stairs, 'down');
  walk[stairs.y][stairs.x] = true;

  const layers = [floor, wallsBack, furniture, wallsFront, wallsFrontCut];
  for (const l of layers) l.setVisible(false);
  return { level: 2, layers, walkable: walk };
}

/** 4-directional BFS on the walkable grid. Returns tile path excluding start. */
export function findPath(walk: boolean[][], sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const start = sy * W + sx, goal = ty * W + tx;
  prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === goal) break;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (prev[ni] !== -1 || (!walk[ny][nx] && ni !== goal)) continue;
      prev[ni] = c;
      q.push(ni);
    }
  }
  if (prev[goal] === -1) return [];
  const path: { x: number; y: number }[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push({ x: c % W, y: (c / W) | 0 });
  return path.reverse();
}

export function randomWalkableIn(walk: boolean[][], r: Rect): { x: number; y: number } {
  for (let i = 0; i < 50; i++) {
    const x = r.x + 1 + Math.floor(Math.random() * (r.w - 2));
    const y = r.y + 2 + Math.floor(Math.random() * (r.h - 3));
    if (walk[y][x]) return { x, y };
  }
  return { x: r.x + 1, y: r.y + 2 };
}
