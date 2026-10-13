import Phaser from 'phaser';
import { Agent } from '../agents/Agent';
import { lineById } from '../data/roster';
import type { Role } from '../data/types';
import { H, OFFICE, TILE, W, buildWorld, inRect, type World } from '../world/map';
import { preloadPacks, registerAnims } from '../world/sprites';
import { MockSource } from '../sources/MockSource';
import type { OfficeEvent } from '../sources/events';

export type RoofMode = 'on' | 'off' | 'auto';
export type WallMode = 'full' | 'cut' | 'hidden';

export class OfficeScene extends Phaser.Scene {
  world!: World;
  agents = new Map<string, Agent>();
  source!: MockSource;
  speed = 1;
  roofMode: RoofMode = 'auto';
  wallMode: WallMode = 'cut';
  darkEvolution = true;
  selected: Agent | null = null;
  /** UI hooks */
  onAgentsChanged: () => void = () => {};
  onSelect: (a: Agent | null) => void = () => {};
  onReady: () => void = () => {};
  private n = 0;

  constructor() { super('office'); }

  preload() { preloadPacks(this); }

  create() {
    registerAnims(this);
    this.world = buildWorld(this);
    this.source = new MockSource((e) => this.handle(e), () => [...this.agents.keys()]);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W * TILE, H * TILE).setRoundPixels(true);
    cam.setZoom(Math.max(1, Math.min(this.scale.width / (W * TILE), this.scale.height / (H * TILE)) * 1.6));
    cam.centerOn((OFFICE.x + OFFICE.w / 2) * TILE, (OFFICE.y + OFFICE.h / 2) * TILE);

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.75, 5));
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('gameobjectdown', (_p: unknown, obj: Phaser.GameObjects.GameObject) => {
      const a = [...this.agents.values()].find((x) => x.sprite === obj);
      if (a) this.select(a);
    });
    const kb = this.input.keyboard!;
    kb.on('keydown-R', () => this.cycleRoof());
    kb.on('keydown-W', () => this.cycleWalls());

    for (const [line, role] of [['veemon', 'coder'], ['lucemon', 'reviewer'], ['impmon', 'coder'],
      ['hagurumon', 'researcher'], ['blackagumon', 'planner'], ['candlemon', 'coder']] as [string, Role][]) {
      this.hire(line, undefined, role);
    }
    this.applyWalls();
    this.onReady();
  }

  // ---- agent management (also used by the UI) ----
  hire(lineId: string, formId: string | undefined, role: Role, name?: string) {
    const free = this.world.spots.filter((s) => s.kind === 'desk' && ![...this.agents.values()].some((a) => a.desk === s));
    if (!free.length) return null;
    const id = `agent-${++this.n}`;
    this.handle({ type: 'agent.spawn', agentId: id, lineId, formId, role, name });
    return this.agents.get(id) ?? null;
  }

  fire(id: string) { this.handle({ type: 'agent.remove', agentId: id }); }

  select(a: Agent | null) { this.selected = a; this.onSelect(a); }

  handle(e: OfficeEvent) {
    if (e.type === 'agent.spawn') {
      const line = lineById(e.lineId);
      const desk = this.world.spots.find((s) => s.kind === 'desk' && ![...this.agents.values()].some((a) => a.desk === s));
      if (!desk) return;
      const a = new Agent(this, e.agentId, e.name ?? `${e.role}-${this.n}`, line, e.formId, e.role, desk,
        this.world.walkable, () => this.speed, () => this.darkEvolution);
      a.onChange = () => { if (this.selected === a) this.onSelect(a); this.onAgentsChanged(); };
      this.agents.set(e.agentId, a);
      this.onAgentsChanged();
      return;
    }
    const a = this.agents.get(e.agentId);
    if (!a) return;
    switch (e.type) {
      case 'agent.remove':
        a.destroy(); this.agents.delete(a.id);
        if (this.selected === a) this.select(null);
        this.onAgentsChanged();
        break;
      case 'task.assigned': a.assign(e.title); break;
      case 'task.progress': a.progress = e.progress; if (this.selected === a) this.onSelect(a); break;
      case 'agent.state': a.setState(e.state); break;
      case 'task.done': a.finish(e.ok); break;
    }
  }

  // ---- Sims-style view toggles ----
  cycleRoof() { this.roofMode = ({ on: 'off', off: 'auto', auto: 'on' } as const)[this.roofMode]; this.onAgentsChanged(); }
  cycleWalls() { this.wallMode = ({ full: 'cut', cut: 'hidden', hidden: 'full' } as const)[this.wallMode]; this.applyWalls(); this.onAgentsChanged(); }

  applyWalls() {
    const L = this.world.layers;
    L.wallsFront.setVisible(this.wallMode === 'full').setDepth(9000);
    L.wallsFrontCut.setVisible(this.wallMode === 'cut').setDepth(4);
    L.wallsBack.setVisible(this.wallMode !== 'hidden');
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    this.source.speed = this.speed;
    this.source.update(dtMs);
    for (const a of this.agents.values()) a.update(dt);

    const cam = this.cameras.main;
    const p = this.input.activePointer;
    const wp = cam.getWorldPoint(p.x, p.y);
    const hover = inRect(OFFICE, Math.floor(wp.x / TILE), Math.floor(wp.y / TILE) + 1);
    const showRoof = this.roofMode === 'on' || (this.roofMode === 'auto' && !hover && cam.zoom < 2.5);
    const roof = this.world.layers.roof;
    roof.setAlpha(Phaser.Math.Linear(roof.alpha, showRoof ? 1 : 0, Math.min(1, dt * 10)));
    roof.setVisible(roof.alpha > 0.02);
    for (const a of this.agents.values()) {
      const t = a.tile;
      a.hidden = inRect(OFFICE, t.x, t.y) ? roof.alpha : 0;
    }
  }
}
