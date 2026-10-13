import Phaser from 'phaser';
import { STAGES, type AnimName, type DigimonForm, type EvolutionLine, type Facing, type Role } from '../data/types';
import { animFor, spriteFor } from '../world/sprites';
import { TILE, ZONES, findPath, randomWalkableIn, type Spot } from '../world/map';

export type AgentState = 'idle' | 'assigned' | 'thinking' | 'working' | 'waiting_input' | 'blocked' | 'done' | 'evolving';

const BUBBLE: Record<AgentState, string> = {
  idle: '', assigned: '📋', thinking: '…', working: '⌨', waiting_input: '❓', blocked: '❗', done: '✅', evolving: '✨',
};

/** XP needed to evolve out of each stage. Low numbers so the prototype evolves quickly. */
const XP_TO_EVOLVE = [2, 3, 4, 5];

export class Agent {
  sprite: Phaser.GameObjects.Sprite;
  private bubble: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  state: AgentState = 'idle';
  form: DigimonForm;
  task: string | null = null;
  progress = 0;
  xp = 0;
  errors = 0;
  completed = 0;
  log: string[] = [];
  private path: { x: number; y: number }[] = [];
  private facing: Facing = 'down';
  private idleTimer = 0;
  private bubbleIdle = 0;
  onChange?: () => void;
  /** 0..1 — how much the office roof hides this agent (set by the scene). */
  hidden = 0;

  constructor(
    private scene: Phaser.Scene,
    public id: string,
    public name: string,
    public line: EvolutionLine,
    formId: string | undefined,
    public role: Role,
    public desk: Spot,
    private walk: boolean[][],
    public getSpeed: () => number,
    public darkEvolution: () => boolean,
  ) {
    this.form = line.forms.find((f) => f.id === formId) ?? line.forms.find((f) => f.stage === 'rookie') ?? line.forms[0];
    const start = randomWalkableIn(walk, ZONES.nursery);
    this.sprite = scene.add.sprite(start.x * TILE + 8, start.y * TILE + 16, spriteFor(this.form.id).key)
      .setInteractive({ useHandCursor: true });
    this.applyForm();
    this.label = scene.add.text(0, 0, name, { fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#0008' })
      .setOrigin(0.5, 0).setPadding(1, 0, 1, 0);
    this.bubble = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#111', backgroundColor: '#fff' })
      .setOrigin(0.5, 1).setPadding(2, 1, 2, 1);
    this.bar = scene.add.graphics();
    this.say(`Hatched as ${this.form.name}`);
  }

  get tile() { return { x: Math.floor(this.sprite.x / TILE), y: Math.floor((this.sprite.y - 1) / TILE) }; }
  get stageIndex() { return STAGES.indexOf(this.form.stage); }
  get xpNeeded() { return XP_TO_EVOLVE[this.stageIndex] ?? Infinity; }

  /** Re-read the sprite for the current form (after a Digidex pick). */
  applyForm() {
    const info = spriteFor(this.form.id);
    this.sprite.setTexture(info.key).setOrigin(...info.anchor).setScale(info.scale);
    this.play(`idle_${this.facing}`);
  }

  private play(anim: AnimName) {
    const { key, flip } = animFor(this.form.id, anim);
    this.sprite.setFlipX(flip);
    if (this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key);
  }

  private say(line: string) {
    this.log.push(line);
    if (this.log.length > 30) this.log.shift();
    this.onChange?.();
  }

  private goTo(x: number, y: number) {
    const t = this.tile;
    this.path = findPath(this.walk, t.x, t.y, x, y);
  }

  setState(s: AgentState) {
    this.state = s;
    this.bubbleIdle = 0;
    if (s === 'blocked') { this.errors++; this.play('hurt'); }
    this.onChange?.();
  }

  // ---- events from the source ----
  assign(title: string) {
    this.task = title; this.progress = 0;
    this.setState('assigned');
    this.goTo(this.desk.x, this.desk.y);
    this.say(`Assigned: ${title}`);
  }

  finish(ok: boolean) {
    if (ok) { this.xp++; this.completed++; this.say(`Done: ${this.task}`); }
    else this.say(`Failed: ${this.task}`);
    this.task = null;
    this.setState('done');
    this.play(ok ? 'happy' : 'hurt');
    this.scene.time.delayedCall(1500 / this.getSpeed(), () => {
      if (this.state !== 'done') return;
      if (this.canEvolve()) this.evolve();
      else this.wanderHome();
    });
  }

  private wanderHome() {
    this.setState('idle');
    const home = this.line.home === 'office' ? ZONES.nursery : ZONES[this.line.home];
    const p = randomWalkableIn(this.walk, home);
    this.goTo(p.x, p.y);
  }

  canEvolve() {
    return this.xp >= this.xpNeeded && this.nextForm() !== null;
  }

  nextForm(): DigimonForm | null {
    const d = this.line.dark;
    if (d && this.darkEvolution() && this.errors >= 2 && d.from === this.form.id) return d.to;
    if (this.form === d?.to) return null;
    const i = this.line.forms.indexOf(this.form);
    return i >= 0 && i < this.line.forms.length - 1 ? this.line.forms[i + 1] : null;
  }

  /** Change to a specific form (manual pick) or the natural next one, with the DS-style flash. */
  evolve(target?: DigimonForm) {
    const next = target ?? this.nextForm();
    if (!next || next === this.form) return;
    const prev = this.form;
    this.path = [];
    this.setState('evolving');
    const s = this.sprite;
    this.scene.tweens.add({
      targets: s, scaleX: 0.2, scaleY: 1.6, alpha: 0.6, duration: 120, yoyo: true, repeat: 4,
      onStart: () => s.setTintFill(0xffffff),
      onComplete: () => {
        this.form = next;
        if (STAGES.indexOf(next.stage) > STAGES.indexOf(prev.stage)) this.xp = 0;
        s.clearTint().setAlpha(1);
        this.applyForm();
        this.burst();
        this.say(`${prev.name} digivolved to ${next.name}!`);
        this.scene.time.delayedCall(1200, () => this.wanderHome());
      },
    });
  }

  private burst() {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const p = this.scene.add.rectangle(this.sprite.x, this.sprite.y - 12, 3, 3, i % 2 ? 0xffe680 : 0x6fd3ff).setDepth(15000);
      this.scene.tweens.add({ targets: p, x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 26, alpha: 0, duration: 600, onComplete: () => p.destroy() });
    }
  }

  destroy() { this.sprite.destroy(); this.bubble.destroy(); this.bar.destroy(); this.label.destroy(); }

  // ---- per-frame ----
  update(dt: number) {
    const speed = 48 * this.getSpeed();
    if (this.path.length && this.state !== 'evolving') {
      const n = this.path[0];
      const tx = n.x * TILE + 8, ty = n.y * TILE + 15;
      const dx = tx - this.sprite.x, dy = ty - this.sprite.y;
      const dist = Math.hypot(dx, dy), step = speed * dt;
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (dist <= step) { this.sprite.setPosition(tx, ty); this.path.shift(); }
      else this.sprite.setPosition(this.sprite.x + (dx / dist) * step, this.sprite.y + (dy / dist) * step);
      this.play(`walk_${this.facing}`);
      if (!this.path.length && this.state === 'assigned') this.facing = this.desk.facing;
    } else if (this.state === 'working') this.play('work');
    else if (this.state === 'waiting_input') this.play('happy');
    else if (this.state !== 'blocked' && this.state !== 'done' && this.state !== 'evolving') {
      this.play(`idle_${this.facing}`);
      if (this.state === 'idle') {
        this.idleTimer -= dt * this.getSpeed();
        if (this.idleTimer <= 0) { this.idleTimer = 3 + Math.random() * 5; this.wanderHome(); }
      }
    }
    if (this.state === 'idle') this.bubbleIdle += dt * this.getSpeed();

    this.sprite.setDepth(100 + this.sprite.y);
    const top = this.sprite.y - this.sprite.displayHeight * this.sprite.originY;
    let text = BUBBLE[this.state];
    if (this.state === 'idle' && this.bubbleIdle > 30) text = '💤';
    if ((this.state === 'assigned' || this.state === 'working') && this.task) text = `${text} ${this.task.length > 12 ? this.task.slice(0, 11) + '…' : this.task}`;
    this.bubble.setText(text).setVisible(!!text).setPosition(this.sprite.x, top - 4).setDepth(16000);
    this.bubble.setBackgroundColor(this.state === 'blocked' ? '#ff6b6b' : this.state === 'waiting_input' ? '#ffe680' : '#ffffff');
    this.label.setPosition(this.sprite.x, this.sprite.y + 1).setDepth(15999);
    for (const o of [this.bubble, this.label, this.bar]) o.setAlpha(1 - this.hidden);
    this.bar.clear().setDepth(16000);
    if (this.state === 'working') {
      this.bar.fillStyle(0x000000).fillRect(this.sprite.x - 12, top - 3, 24, 3);
      this.bar.fillStyle(0x7dff9a).fillRect(this.sprite.x - 12, top - 3, 24 * this.progress, 3);
    }
  }
}
