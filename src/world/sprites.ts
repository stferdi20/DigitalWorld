import Phaser from 'phaser';
import { ANIM_NAMES, type AnimName, type PackManifest, type SpriteManifest } from '../data/types';
import { allForms } from '../data/roster';
import duskMap from '../data/dusk-map.json';

/** A loaded sprite from any pack, keyed by its manifest id (e.g. `dusk_0147`). */
export interface SpriteInfo {
  id: string; key: string; url: string; frame: [number, number];
  anchor: [number, number]; scale: number; thumb: number;
  mirror: Partial<Record<AnimName, AnimName>>;
}
const loaded = new Map<string, SpriteInfo>();

// ---- form → sprite mapping: user picks (localStorage) override the shipped defaults ----
const STORE = 'dw.spriteMap';
const defaults: Record<string, string> = Object.fromEntries(Object.entries(duskMap).filter(([k]) => !k.startsWith('_')));
let picks: Record<string, string> = {};
try { picks = JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { /* storage unavailable */ }

export function spriteFor(formId: string): SpriteInfo {
  const id = picks[formId] ?? defaults[formId] ?? formId;
  return loaded.get(id) ?? placeholderInfo(formId);
}
export function setSpriteFor(formId: string, spriteId: string | null) {
  if (spriteId) picks[formId] = spriteId; else delete picks[formId];
  try { localStorage.setItem(STORE, JSON.stringify(picks)); } catch { /* ignore */ }
}
export function currentMapping(): Record<string, string> { return { ...defaults, ...picks }; }
export function allSprites(): SpriteInfo[] { return [...loaded.values()].sort((a, b) => a.id.localeCompare(b.id)); }

/** Animation key for a form, plus whether to flip it horizontally. */
export function animFor(formId: string, anim: AnimName): { key: string; flip: boolean } {
  const s = spriteFor(formId);
  const src = s.mirror[anim];
  return { key: `${s.key}:${src ?? anim}`, flip: !!src };
}

function placeholderInfo(formId: string): SpriteInfo {
  return { id: formId, key: `ph_${formId}`, url: '', frame: [32, 32], anchor: [0.5, 1], scale: 1, thumb: 0, mirror: {} };
}

/**
 * Queue loading of every pack listed in public/assets/packs/index.json (missing index = no packs).
 * Call from preload(); call registerAnims() in create().
 */
export function preloadPacks(scene: Phaser.Scene) {
  scene.load.json('packs-index', 'assets/packs/index.json');
  scene.load.once('filecomplete-json-packs-index', (_k: string, _t: string, index: { packs: string[] }) => {
    for (const p of index?.packs ?? []) scene.load.json(`pack:${p}`, `assets/packs/${p}/manifest.json`);
    scene.load.on('filecomplete', (key: string) => {
      if (!key.startsWith('pack:')) return;
      const pack = scene.cache.json.get(key) as PackManifest;
      const dir = key.slice(5);
      for (const s of pack.sprites) {
        scene.load.spritesheet(`sp_${s.id}`, `assets/packs/${dir}/${s.sheet}`, {
          frameWidth: s.frame[0], frameHeight: s.frame[1],
        });
      }
    });
  });
}

export function registerAnims(scene: Phaser.Scene) {
  const index = scene.cache.json.get('packs-index') as { packs: string[] } | undefined;
  for (const p of index?.packs ?? []) {
    const pack = scene.cache.json.get(`pack:${p}`) as PackManifest | undefined;
    for (const s of pack?.sprites ?? []) {
      const key = `sp_${s.id}`;
      if (!scene.textures.exists(key)) continue;
      loaded.set(s.id, {
        id: s.id, key, url: `assets/packs/${p}/${s.sheet}`, frame: s.frame,
        anchor: s.anchor ?? [0.5, 1], scale: s.scale ?? 1, thumb: s.thumb ?? 0, mirror: s.mirror ?? {},
      });
      makeAnims(scene, key, s);
    }
  }
  // Every roster form gets a placeholder too, used until a sprite is mapped to it.
  for (const { form, line } of allForms()) makePlaceholder(scene, form.id, form.name, line.color, form.stage);
}

function makeAnims(scene: Phaser.Scene, key: string, s: SpriteManifest) {
  const fallback = s.anims.idle_down ?? [0];
  for (const name of ANIM_NAMES) {
    if (s.mirror?.[name]) continue;
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
const PH_FRAMES: Record<AnimName, number[]> = {
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
  for (const name of ANIM_NAMES) {
    scene.anims.create({
      key: `${key}:${name}`,
      frames: PH_FRAMES[name].map((frame) => ({ key, frame })),
      frameRate: name.startsWith('walk') ? 8 : 3,
      repeat: name === 'hurt' ? 0 : -1,
    });
  }
}
