import Phaser from 'phaser';
import type { AnimName, Facing } from '../data/types';
import { animFor, onSpriteLoaded, preloadPacks, registerAnims, spriteFor, spriteIdFor } from '../world/sprites';
import { findPath, nearestWalkable, type Cell } from '../world/map';
import type { Critter, Farm } from './state';

const MAP = '057';          // the Digi-Egg Nursery island
const CELL = 8;

interface Walker {
  c: Critter; sprite: Phaser.GameObjects.Sprite; bubble: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics;
  path: Cell[]; facing: Facing; idleFor: number;
}

/**
 * The widget's farm: one Dusk farm map that always covers the frame (any size), with the
 * agents wandering inside the visible part. Click an agent to open its popup.
 */
export class FarmScene extends Phaser.Scene {
  walk: boolean[][] = [];
  cols = 0; rows = 0;
  walkers = new Map<string, Walker>();
  onPick: (id: string) => void = () => {};
  onReady: () => void = () => {};

  constructor(private farm: Farm) { super('farm'); }

  preload() {
    preloadPacks(this);
    this.load.image('farm-map', `assets/packs/dusk-maps/${MAP}.png`);
    this.load.json('farm-walk', `assets/packs/dusk-maps/${MAP}.json`);
  }

  create() {
    registerAnims(this);
    const grid = this.cache.json.get('farm-walk') as { walk: string[] } | undefined;
    if (this.textures.exists('farm-map') && grid) {
      this.add.image(0, 0, 'farm-map').setOrigin(0);
      this.walk = grid.walk.map((r) => [...r].map((ch) => ch === '1'));
    } else {
      // no local Dusk maps yet: a plain grassy field
      this.add.rectangle(0, 0, 512, 384, 0x3f7f3a).setOrigin(0);
      this.walk = Array.from({ length: 48 }, (_, y) => Array.from({ length: 64 }, (_, x) => x > 2 && y > 2 && x < 61 && y < 45));
    }
    this.rows = this.walk.length; this.cols = this.walk[0].length;
    this.cameras.main.setRoundPixels(true);
    this.fit();
    this.scale.on('resize', () => this.fit());
    onSpriteLoaded((id) => { for (const w of this.walkers.values()) if (spriteIdFor(w.c.formId) === id) this.skin(w); });
    this.input.on('gameobjectdown', (_p: unknown, obj: Phaser.GameObjects.GameObject) => {
      for (const w of this.walkers.values()) if (w.sprite === obj) this.onPick(w.c.id);
    });
    this.sync();
    this.onReady();
  }

  /** Cover the frame with the map: zoom so characters stay readable, centred on the farm's middle. */
  fit() {
    const cam = this.cameras.main, W = this.scale.width, H = this.scale.height;
    const mapW = this.cols * CELL, mapH = this.rows * CELL;
    const cover = Math.max(W / mapW, H / mapH);
    cam.setZoom(Math.max(cover, Math.min(3, H / 150)));
    cam.setBounds(0, 0, mapW, mapH);
    cam.centerOn(mapW / 2, mapH / 2);
  }

  /** Add sprites for new agents, remove gone ones. */
  sync() {
    for (const c of this.farm.state.critters) {
      if (this.walkers.has(c.id)) { this.walkers.get(c.id)!.c = c; continue; }
      const start = this.visibleCell();
      const p = this.cellPos(start);
      const sprite = this.add.sprite(p.x, p.y, spriteFor(c.formId).key).setInteractive({ useHandCursor: true });
      const bubble = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#111', backgroundColor: '#fff' })
        .setOrigin(0.5, 1).setPadding(2, 1, 2, 1).setDepth(10000);
      const bar = this.add.graphics().setDepth(10000);
      const w: Walker = { c, sprite, bubble, bar, path: [], facing: 'down', idleFor: Math.random() * 2 };
      this.walkers.set(c.id, w);
      this.skin(w);
    }
    for (const [id, w] of this.walkers) {
      if (!this.farm.get(id)) { w.sprite.destroy(); w.bubble.destroy(); w.bar.destroy(); this.walkers.delete(id); }
    }
  }

  skin(w: Walker) {
    const info = spriteFor(w.c.formId);
    w.sprite.setTexture(info.key).setOrigin(...info.anchor).setScale(info.scale);
    w.sprite.anims.stop();
    this.play(w, `idle_${w.facing}` as AnimName);
  }

  private play(w: Walker, anim: AnimName) {
    const { key, flip } = animFor(w.c.formId, anim);
    w.sprite.setFlipX(flip);
    if (w.sprite.anims.currentAnim?.key !== key) w.sprite.play(key);
  }

  private cellPos(c: Cell) { return { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL - 1 }; }

  /** A random floor cell inside what the frame currently shows (with a small margin). */
  visibleCell(): Cell {
    const v = this.cameras.main.worldView;
    const x0 = Math.ceil((v.x + 16) / CELL), x1 = Math.floor((v.right - 16) / CELL);
    const y0 = Math.ceil((v.y + 30) / CELL), y1 = Math.floor((v.bottom - 4) / CELL);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(x0, Math.max(x0, x1)), y = Phaser.Math.Between(y0, Math.max(y0, y1));
      if (this.walk[y]?.[x]) return { x, y };
    }
    return nearestWalkable(this.walk, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2));
  }

  /** A quick wiggle so the agent reads as "look at me". */
  hop(id: string) {
    const w = this.walkers.get(id);
    if (w) this.tweens.add({ targets: w.sprite, y: w.sprite.y - 6, duration: 120, yoyo: true, repeat: 2 });
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    for (const w of this.walkers.values()) {
      const c = w.c, s = w.sprite;
      const busy = !!c.job;
      if (!busy && !c.resting) {
        if (w.path.length) {
          const p = this.cellPos(w.path[0]);
          const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy), step = 26 * dt;
          const ax = Math.abs(dx), ay = Math.abs(dy);
          w.facing = (ay < ax * 0.414 ? (dx > 0 ? 'right' : 'left') : ay > ax * 2.414 ? (dy > 0 ? 'down' : 'up')
            : `${dy > 0 ? 'down' : 'up'}_${dx > 0 ? 'right' : 'left'}`) as Facing;
          if (d <= step) { s.setPosition(p.x, p.y); w.path.shift(); } else s.setPosition(s.x + dx / d * step, s.y + dy / d * step);
          this.play(w, `walk_${w.facing}` as AnimName);
        } else {
          this.play(w, `idle_${w.facing}` as AnimName);
          w.idleFor -= dt;
          if (w.idleFor <= 0) {
            w.idleFor = 2 + Math.random() * 5;
            const from = { x: Math.floor(s.x / CELL), y: Math.floor((s.y - 1) / CELL) };
            w.path = findPath(this.walk, from, this.visibleCell()).slice(0, 40);
          }
        }
      } else {
        w.path = [];
        w.facing = 'down';
        this.play(w, c.job?.approval ? 'happy' : busy ? 'work' : 'idle_down');
      }
      s.setDepth(s.y);
      // bubble: what they're doing, at a glance
      let text = '';
      if (c.job?.approval) text = '❓';
      else if (c.job) text = '⌨';
      else if (c.resting) text = '💤';
      else if (c.energy < 25) text = '😩';
      const top = s.y - s.displayHeight * s.originY;
      w.bubble.setText(text).setVisible(!!text && this.farm.state.settings.bubble).setPosition(s.x, top - 2)
        .setBackgroundColor(c.job?.approval ? '#ffe680' : '#ffffff');
      if (c.job?.approval) w.bubble.y += Math.sin(this.time.now / 150) * 1.5;
      w.bar.clear();
      if (c.job && !c.job.approval) {
        w.bar.fillStyle(0x000000).fillRect(s.x - 9, s.y + 1, 18, 3);
        w.bar.fillStyle(0x7dff9a).fillRect(s.x - 9, s.y + 1, 18 * c.job.progress, 3);
      }
    }
  }
}
