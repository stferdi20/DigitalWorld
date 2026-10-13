import Phaser from 'phaser';
import { Agent } from '../agents/Agent';
import { lineById } from '../data/roster';
import { STAGES, type Role, type Stage } from '../data/types';
import { WORLD_H, WORLD_W, buildWorld, preloadMaps, type Spot, type World } from '../world/map';
import { preloadPacks, registerAnims } from '../world/sprites';
import { MockSource } from '../sources/MockSource';
import type { OfficeEvent } from '../sources/events';

export class OfficeScene extends Phaser.Scene {
  world!: World;
  agents = new Map<string, Agent>();
  source!: MockSource;
  speed = 1;
  darkEvolution = true;
  selected: Agent | null = null;
  /** Storey currently shown (Sims-style floor selector). */
  viewStorey = 1;
  /** UI hooks */
  onAgentsChanged: () => void = () => {};
  onSelect: (a: Agent | null) => void = () => {};
  onReady: () => void = () => {};
  private n = 0;

  constructor() { super('office'); }

  preload() { preloadPacks(this); preloadMaps(this); }

  create() {
    registerAnims(this);
    this.world = buildWorld(this);
    this.source = new MockSource((e) => this.handle(e), () => [...this.agents.keys()], (id) => !!this.agents.get(id)?.atDesk);

    const cam = this.cameras.main;
    const office = this.world.areas.get('office')!;
    cam.setBounds(-200, -200, WORLD_W + 400, WORLD_H + 400).setRoundPixels(true);
    cam.setZoom(Math.max(1, Math.round(this.scale.width / office.w * 10) / 10));
    cam.centerOn(office.x + office.w / 2, office.y + office.h / 2);

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.4, 5));
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
    kb.on('keydown-PAGE_UP', () => this.setStorey(this.viewStorey + 1));
    kb.on('keydown-PAGE_DOWN', () => this.setStorey(this.viewStorey - 1));

    for (const [line, role] of [['veemon', 'coder'], ['lucemon', 'reviewer'], ['impmon', 'coder'],
      ['hagurumon', 'researcher'], ['blackagumon', 'planner'], ['candlemon', 'coder']] as [string, Role][]) {
      this.hire(line, undefined, role);
    }
    this.hire('candlemon', 'piedmon', 'planner', 'lead-7'); // a Mega, to staff the executive floor
    this.applyStorey();
    this.onReady();
  }

  // ---- agent management (also used by the UI) ----
  /** Seniors (Ultimate/Mega) prefer the executive floor; everyone else the main floor. */
  private freeDesk(stage: Stage, except?: Agent): Spot | undefined {
    const taken = new Set([...this.agents.values()].filter((a) => a !== except).map((a) => a.desk));
    const free = this.world.spots.filter((s) => s.kind === 'desk' && !taken.has(s));
    const senior = STAGES.indexOf(stage) >= STAGES.indexOf('ultimate');
    const want = senior ? 'exec' : 'office';
    return free.find((s) => s.area === want) ?? free[0];
  }

  hire(lineId: string, formId: string | undefined, role: Role, name?: string) {
    if (!this.world.spots.some((s) => s.kind === 'desk' && ![...this.agents.values()].some((a) => a.desk === s))) return null;
    const id = `agent-${++this.n}`;
    this.handle({ type: 'agent.spawn', agentId: id, lineId, formId, role, name });
    return this.agents.get(id) ?? null;
  }

  fire(id: string) { this.handle({ type: 'agent.remove', agentId: id }); }

  select(a: Agent | null) { this.selected = a; this.onSelect(a); }

  handle(e: OfficeEvent) {
    if (e.type === 'agent.spawn') {
      const line = lineById(e.lineId);
      const form = line.forms.find((f) => f.id === e.formId) ?? line.forms.find((f) => f.stage === 'rookie') ?? line.forms[0];
      const desk = this.freeDesk(form.stage);
      if (!desk) return;
      const a = new Agent(this, e.agentId, e.name ?? `${e.role}-${this.n}`, line, e.formId, e.role, desk,
        this.world, () => this.speed, () => this.darkEvolution);
      a.onChange = () => { if (this.selected === a) this.onSelect(a); this.onAgentsChanged(); };
      a.onEvolved = () => {
        // promotion/demotion between floors follows seniority
        const better = this.freeDesk(a.form.stage, a);
        if (better && better.area !== a.desk.area) {
          a.moveDesk(better);
          a.log.push(better.area === 'exec' ? 'Promoted to the executive floor!' : 'Moved to the main floor');
        }
      };
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

  // ---- floor selector: the DigiLab main floor and executive floor share one spot ----
  setStorey(n: number) {
    this.viewStorey = Phaser.Math.Clamp(n, 1, 2);
    this.applyStorey();
    this.onAgentsChanged();
  }

  private applyStorey() {
    for (const a of this.world.areas.values()) {
      if (a.storey === undefined) continue;
      const on = a.storey === this.viewStorey;
      a.image.setVisible(on); a.labelText.setVisible(on);
    }
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    this.source.speed = this.speed;
    this.source.update(dtMs);
    for (const a of this.agents.values()) a.update(dt);

    for (const a of this.agents.values()) {
      const st = this.world.areas.get(a.area)!.storey;
      a.shown = st === undefined || st === this.viewStorey;
    }
  }
}
