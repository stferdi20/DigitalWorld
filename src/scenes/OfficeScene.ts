import Phaser from 'phaser';
import { Agent } from '../agents/Agent';
import { lineById } from '../data/roster';
import { STAGES, type Role, type Stage } from '../data/types';
import { buildWorld, preloadMaps, type AreaId, type Spot, type World } from '../world/map';
import { onSpriteLoaded, preloadPacks, registerAnims, spriteIdFor } from '../world/sprites';
import { MockSource } from '../sources/MockSource';
import { audio, type SfxEvent } from '../world/audio';
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
  /** The location on screen. The DigiLab's two floors are one location (see viewStorey). */
  place: AreaId = 'office';
  onPlaceChanged: (label: string) => void = () => {};
  /** UI hook: dim the screen (true) / reveal it (false) around a location switch. */
  onFade: (dark: boolean) => void = () => {};
  private switchingTo: AreaId | null = null;
  /** Agent the camera is following (cleared when you drag the map). */
  following: Agent | null = null;
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
    // sheets stream in on demand: swap placeholders for the real sprite as soon as it lands
    onSpriteLoaded((id) => {
      for (const a of this.agents.values()) if (spriteIdFor(a.form.id) === id) a.applyForm();
    });
    this.source = new MockSource((e) => this.handle(e), () => [...this.agents.keys()], (id) => !!this.agents.get(id)?.atDesk);

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    for (const a of this.world.areas.values()) a.labelText.setVisible(false);   // the location banner names the place
    this.goToPlace('office', true);
    this.scale.on('resize', () => this.fitCamera());

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), this.minZoom(), 4));
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (Math.abs(p.x - p.prevPosition.x) + Math.abs(p.y - p.prevPosition.y) > 0) { cam.stopFollow(); this.following = null; }   // dragging takes over
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

  select(a: Agent | null) {
    this.selected = a;
    if (a) { audio.play('select'); this.focus(a); } else { this.cameras.main.stopFollow(); this.following = null; }
    this.onSelect(a);
  }

  // ---- one location at a time, like the DS games: the camera never leaves the current map ----
  /** Smallest zoom at which the map still covers the whole screen (so no edge or void shows). */
  private minZoom() {
    const a = this.world.areas.get(this.place)!;
    return Math.max(this.scale.width / a.w, this.scale.height / a.h);
  }

  private fitCamera() {
    const a = this.world.areas.get(this.place)!;
    const cam = this.cameras.main;
    cam.setBounds(a.x, a.y, a.w, a.h);
    if (cam.zoom < this.minZoom()) cam.setZoom(this.minZoom());
  }

  /** Switch location with a short fade; the floor buttons pick the DigiLab storey. */
  goToPlace(id: AreaId, instant = false) {
    const place = id === 'exec' ? 'office' : id;
    if (id === 'exec') this.viewStorey = 2;
    if (id === 'office' && place !== this.place) this.viewStorey = this.viewStorey || 1;
    const cam = this.cameras.main;
    const go = () => {
      this.place = place;
      const a = this.world.areas.get(place)!;
      cam.setBounds(a.x, a.y, a.w, a.h);
      cam.setZoom(Math.max(this.minZoom(), Math.min(2, this.minZoom() * 1.25)));
      if (!this.following) cam.centerOn(a.x + a.w / 2, a.y + a.h / 2);
      this.applyStorey();
      this.onPlaceChanged(this.placeLabel());
      this.onAgentsChanged();
    };
    if (instant || place === this.place) { go(); return; }
    if (this.switchingTo === place) return;          // already on the way
    this.switchingTo = place;
    this.onFade(true);
    this.time.delayedCall(150, () => {
      if (this.switchingTo !== place) return;        // superseded by a newer switch
      go(); this.switchingTo = null; this.onFade(false);
    });
  }

  placeLabel() {
    const id = this.place === 'office' && this.viewStorey === 2 ? 'exec' : this.place;
    return this.world.areas.get(id)!.label;
  }

  /** Bring the camera to an agent and keep it there: go to their location and floor, follow as they walk. */
  focus(a: Agent) {
    const st = this.world.areas.get(a.area)!.storey;
    if (st !== undefined && st !== this.viewStorey) this.setStorey(st);
    const place = a.area === 'exec' ? 'office' : a.area;
    if (place !== this.place) this.goToPlace(place);
    this.cameras.main.startFollow(a.sprite, true, 0.12, 0.12);
    this.following = a;
  }

  /** Effects only for what's on screen, so a big office stays listenable. */
  private sfx(a: Agent, ev: SfxEvent) {
    if (a.shown && this.cameras.main.worldView.contains(a.sprite.x, a.sprite.y)) audio.play(ev);
  }


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
      a.onWarp = () => this.sfx(a, 'warp');
      a.onEvolveStart = () => this.sfx(a, 'evolve');
      this.agents.set(e.agentId, a);
      this.sfx(a, 'hire');
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
      case 'task.assigned': a.assign(e.title); this.sfx(a, 'assign'); break;
      case 'task.progress': a.progress = e.progress; if (this.selected === a) this.onSelect(a); break;
      case 'agent.state': a.setState(e.state); break;
      case 'task.done': this.sfx(a, e.ok ? 'done' : 'fail'); a.finish(e.ok); break;
    }
  }

  // ---- floor selector: the DigiLab main floor and executive floor share one spot ----
  setStorey(n: number) {
    this.viewStorey = Phaser.Math.Clamp(n, 1, 2);
    if (this.place !== 'office') { this.goToPlace('office'); return; }
    this.applyStorey();
    if (this.place === 'office') this.onPlaceChanged(this.placeLabel());
    this.onAgentsChanged();
  }

  private applyStorey() {
    for (const a of this.world.areas.values()) {
      if (a.storey === undefined) continue;
      const on = a.storey === this.viewStorey;
      a.image.setVisible(on);
    }
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    this.source.speed = this.speed;
    this.source.update(dtMs);
    for (const a of this.agents.values()) a.update(dt);

    // a followed agent who takes the stairs pulls the floor view along
    const sel = this.selected;
    if (sel && this.following === sel) {
      const st = this.world.areas.get(sel.area)!.storey;
      if (st !== undefined && st !== this.viewStorey) this.setStorey(st);
      const place = sel.area === 'exec' ? 'office' : sel.area;
      if (place !== this.place) this.goToPlace(place);     // followed them through a warp
    }
    audio.setArea(this.place === 'office' && this.viewStorey === 2 ? 'exec' : this.place);
    for (const a of this.agents.values()) {
      const st = this.world.areas.get(a.area)!.storey;
      a.shown = st === undefined || st === this.viewStorey;
    }
  }
}
