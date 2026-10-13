import Phaser from 'phaser';
import { BASE_ANIMS, DIAGONAL_FALLBACK, type AnimName, type PackManifest, type SpriteManifest } from '../data/types';
import { allForms } from '../data/roster';
import duskMap from '../data/dusk-map.json';

/** A sprite from any pack's catalog, keyed by its manifest id (e.g. `dusk_0147`). */
export interface SpriteInfo {
  id: string; name: string; pack: string; key: string; url: string; frame: [number, number];
  anchor: [number, number]; scale: number; thumb: number;
  /** Frames per row in the sheet (for thumbnails). */
  cols: number;
  mirror: Partial<Record<AnimName, AnimName>>;
  /** Anims this sprite really has (diagonals are optional). */
  has: Set<string>;
}

/**
 * Sheets load on demand: at startup only the pack manifests are read (the catalog). The first
 * time a sprite is needed its sheet is queued; until it arrives the form's placeholder shows,
 * then onSpriteLoaded listeners re-skin whoever uses it.
 */
const catalog = new Map<string, { info: SpriteInfo; manifest: SpriteManifest }>();
const loaded = new Set<string>();
const loading = new Set<string>();
const listeners: ((id: string) => void)[] = [];
let sceneRef: Phaser.Scene | null = null;

export function onSpriteLoaded(fn: (id: string) => void) { listeners.push(fn); }

// ---- form → sprite mapping: user picks (localStorage) override the shipped defaults ----
const STORE = 'dw.spriteMap';
const defaults: Record<string, string> = Object.fromEntries(Object.entries(duskMap).filter(([k]) => !k.startsWith('_')));
let picks: Record<string, string> = {};
try { picks = JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { /* storage unavailable */ }

/** The sprite id a form is mapped to (whether or not its sheet has loaded yet). */
export function spriteIdFor(formId: string): string { return picks[formId] ?? defaults[formId] ?? formId; }

export function spriteFor(formId: string): SpriteInfo {
  const id = spriteIdFor(formId);
  const c = catalog.get(id);
  if (c && loaded.has(id)) return c.info;
  if (c) requestSprite(id);
  return placeholderInfo(formId);
}
export function setSpriteFor(formId: string, spriteId: string | null) {
  if (spriteId) picks[formId] = spriteId; else delete picks[formId];
  try { localStorage.setItem(STORE, JSON.stringify(picks)); } catch { /* ignore */ }
}
export function currentMapping(): Record<string, string> { return { ...defaults, ...picks }; }
export function allSprites(): SpriteInfo[] { return [...catalog.values()].map((c) => c.info).sort((a, b) => a.id.localeCompare(b.id)); }

/** Animation key for a form, plus whether to flip it horizontally. Diagonals fall back to 4 directions. */
export function animFor(formId: string, anim: AnimName): { key: string; flip: boolean } {
  const s = spriteFor(formId);
  let name: string = anim;
  if (!s.has.has(name)) {
    const m = name.match(/^(idle|walk)_(.+)$/);
    name = m && DIAGONAL_FALLBACK[m[2]] ? `${m[1]}_${DIAGONAL_FALLBACK[m[2]]}` : name;
  }
  const src = s.mirror[name as AnimName];
  return { key: `${s.key}:${src ?? name}`, flip: !!src };
}

function placeholderInfo(formId: string): SpriteInfo {
  if (sceneRef && !sceneRef.textures.exists(`ph_${formId}`)) makePlaceholder(sceneRef, formId, formId, '#888888', 'rookie');
  return {
    id: formId, name: formId, pack: '', key: `ph_${formId}`, url: '', frame: [32, 32], anchor: [0.5, 1], scale: 1,
    thumb: 0, cols: 1, mirror: {}, has: new Set(BASE_ANIMS),
  };
}

/** Queue the pack index and manifests only. Call from preload(); call registerAnims() in create(). */
export function preloadPacks(scene: Phaser.Scene) {
  scene.load.json('packs-index', 'assets/packs/index.json');
  scene.load.once('filecomplete-json-packs-index', (_k: string, _t: string, index: { packs: string[] }) => {
    for (const p of index?.packs ?? []) scene.load.json(`pack:${p}`, `assets/packs/${p}/manifest.json`);
  });
}

export function registerAnims(scene: Phaser.Scene) {
  sceneRef = scene;
  const index = scene.cache.json.get('packs-index') as { packs: string[] } | undefined;
  for (const p of index?.packs ?? []) {
    const pack = scene.cache.json.get(`pack:${p}`) as PackManifest | undefined;
    for (const s of pack?.sprites ?? []) {
      const nFrames = Math.max(0, ...Object.values(s.anims).flat()) + 1;
      catalog.set(s.id, {
        manifest: s,
        info: {
          id: s.id, name: s.name ?? `#${s.id.replace(/^\D+_/, '')}`, pack: p, key: `sp_${s.id}`,
          url: `assets/packs/${p}/${s.sheet}`, frame: s.frame, anchor: s.anchor ?? [0.5, 1], scale: s.scale ?? 1,
          thumb: s.thumb ?? 0, mirror: s.mirror ?? {}, cols: s.cols ?? Math.min(16, nFrames),
          has: new Set([...BASE_ANIMS, ...Object.keys(s.anims), ...Object.keys(s.mirror ?? {})]),
        },
      });
    }
  }
  // Every roster form gets a placeholder too, used until its sprite loads (or if none is mapped).
  for (const { form, line } of allForms()) makePlaceholder(scene, form.id, form.name, line.color, form.stage);
}

/** Start loading a sprite sheet if it isn't loaded or on its way. */
export function requestSprite(id: string) {
  const scene = sceneRef, c = catalog.get(id);
  if (!scene || !c || loaded.has(id) || loading.has(id)) return;
  loading.add(id);
  const { info, manifest } = c;
  scene.load.spritesheet(info.key, info.url, { frameWidth: info.frame[0], frameHeight: info.frame[1] });
  scene.load.once(`filecomplete-spritesheet-${info.key}`, () => {
    makeAnims(scene, info.key, manifest);
    loading.delete(id); loaded.add(id);
    for (const fn of listeners) fn(id);
  });
  if (!scene.load.isLoading()) scene.load.start();
}

function makeAnims(scene: Phaser.Scene, key: string, s: SpriteManifest) {
  const fallback = s.anims.idle_down ?? [0];
  const names = [...BASE_ANIMS, ...Object.keys(s.anims)] as AnimName[];
  for (const name of new Set(names)) {
    if (s.mirror?.[name] || scene.anims.exists(`${key}:${name}`)) continue;
    let frames = s.anims[name];
    if (!frames) frames = name.startsWith('walk') ? s.anims.walk_down ?? fallback : fallback;
    scene.anims.create({
      key: `${key}:${name}`,
      frames: scene.anims.generateFrameNumbers(key, { frames }),
      frameRate: name === 'work' || name === 'happy' ? 3 : s.fps ?? 6,
      repeat: name === 'hurt' ? 0 : -1,
    });
  }
}

/** Placeholder layout: 32x32 frames, same anim names as real packs. */
const PH_FRAMES: Partial<Record<AnimName, number[]>> = {
  idle_down: [0, 1], idle_left: [2, 3], idle_right: [4, 5], idle_up: [6, 7],
  walk_down: [8, 9], walk_left: [10, 11], walk_right: [12, 13], walk_up: [14, 15],
  work: [16, 17], happy: [18, 19], hurt: [20],
};
const STAGE_SIZE: Record<string, number> = {
  'in-training': 7, rookie: 9, champion: 11, ultimate: 12, mega: 13,
};

function makePlaceholder(scene: Phaser.Scene, id: string, name: string, color: string, stage: string) {
  const key = `ph_${id}`;
  if (scene.textures.exists(key)) return;
  const F = 32, N = 21;
  const tex = scene.textures.createCanvas(key, F * N, F)!;
  const ctx = tex.getContext();
  const r = STAGE_SIZE[stage] ?? 9;
  const dirOf = (i: number) => (['down', 'left', 'right', 'up'] as const)[Math.floor(i / 2) % 4];
  for (let i = 0; i < N; i++) {
    const ox = i * F;
    const bob = i % 2;
    const dir = i < 16 ? dirOf(i) : 'down';
    const cx = ox + 16, cy = 31 - r - (i >= 8 && i < 16 ? bob * 2 : bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(ox + 16, 30, r * 0.8, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i === 20 ? '#ff4040' : color;
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    if (dir !== 'up') {
      const dx = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
      const ey = i >= 18 && i < 20 ? cy - 3 : cy - 2;
      ctx.fillRect(cx - 3 + dx, ey, 2, i >= 18 && i < 20 ? 1 : 2);
      ctx.fillRect(cx + 2 + dx, ey, 2, i >= 18 && i < 20 ? 1 : 2);
    }
    if (i === 16 || i === 17) { ctx.fillStyle = '#fff'; ctx.fillRect(cx - 5 + bob * 6, cy + r - 3, 4, 2); }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    if (dir !== 'up') ctx.fillText(name[0], cx, cy + 5);
  }
  tex.refresh();
  for (let i = 0; i < N; i++) tex.add(i, 0, i * F, 0, F, F);
  for (const name of BASE_ANIMS) {
    scene.anims.create({
      key: `${key}:${name}`,
      frames: PH_FRAMES[name]!.map((frame) => ({ key, frame })),
      frameRate: name.startsWith('walk') ? 8 : 3,
      repeat: name === 'hurt' ? 0 : -1,
    });
  }
}
