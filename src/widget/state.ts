/**
 * The farm's game state: an idle loop in the spirit of Taskbar Hero. Agents pick up
 * (simulated) jobs on their own, earn bits and XP, get tired, level up and digivolve.
 * Saved to this browser; progress made while the widget was closed is paid out on return.
 */
import { lineById } from '../data/roster';
import type { DigimonForm } from '../data/types';

export interface Approval { command: string; askedAt: number; }
export interface Job { title: string; startedAt: number; seconds: number; progress: number; approval?: Approval; askAt?: number; }
export interface Critter {
  id: string; name: string; lineId: string; formId: string;
  level: number; xp: number; energy: number; mood: number;
  earnedToday: number; jobsToday: number; costToday: number;
  job: Job | null; resting: boolean;
  log: { at: number; text: string }[];
  chat: { who: 'me' | 'them'; text: string }[];
}
export interface FarmState {
  v: 1; bits: number; savedAt: number; day: string;
  critters: Critter[];
  settings: { w: number; h: number; sound: boolean; bubble: boolean; chime: boolean; bounce: boolean; speed: number };
}

export type FarmEvent =
  | { type: 'job.start'; c: Critter }
  | { type: 'job.done'; c: Critter; bits: number; xp: number }
  | { type: 'approval'; c: Critter }
  | { type: 'level'; c: Critter }
  | { type: 'evolve'; c: Critter; from: DigimonForm; to: DigimonForm }
  | { type: 'changed' };

const KEY = 'dw.widget.v1';
const today = () => new Date().toISOString().slice(0, 10);

const JOBS = ['Write unit tests', 'Review PR', 'Fix flaky CI', 'Update API docs', 'Refactor auth', 'Triage issues',
  'Profile render loop', 'Draft release notes', 'Migrate schema', 'Clean up warnings'];
const COMMANDS = ['npm publish', 'git push --force', 'rm -rf dist', 'npm install left-pad', 'docker compose down', 'curl https://api.example.com'];

const START: [string, string, string][] = [['veemon', 'veemon', 'Veemon'], ['impmon', 'impmon', 'Impmon'],
  ['pichu', 'pikachu', 'Pikachu'], ['megaman', 'megaman_exe', 'MegaMan.EXE']];

function fresh(): FarmState {
  return {
    v: 1, bits: 120, savedAt: Date.now(), day: today(),
    critters: START.map(([lineId, formId, name], i) => newCritter(`c${i + 1}`, lineId, formId, name)),
    settings: { w: 340, h: 150, sound: true, bubble: true, chime: true, bounce: true, speed: 1 },
  };
}

export function newCritter(id: string, lineId: string, formId: string, name: string): Critter {
  return { id, name, lineId, formId, level: 1, xp: 0, energy: 80, mood: 75, earnedToday: 0, jobsToday: 0, costToday: 0,
    job: null, resting: false, log: [], chat: [] };
}

export const xpForNext = (lvl: number) => 20 + lvl * 10;
/** Digivolution milestones: every 5 levels the next form in the line (if there is one). */
const EVOLVE_EVERY = 5;

export function formOf(c: Critter): DigimonForm {
  const l = lineById(c.lineId);
  return l.forms.find((f) => f.id === c.formId) ?? l.forms[0];
}

export class Farm {
  state: FarmState;
  private listeners: ((e: FarmEvent) => void)[] = [];
  /** What happened while the widget was closed, shown once on load. */
  away: { seconds: number; bits: number; jobs: number; levels: number } | null = null;

  constructor() {
    let s: FarmState | null = null;
    try { s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* storage off */ }
    this.state = s && s.v === 1 ? s : fresh();
    this.state.settings = { ...fresh().settings, ...this.state.settings };
    if (this.state.day !== today()) this.newDay();
    this.payOffline();
  }

  on(fn: (e: FarmEvent) => void) { this.listeners.push(fn); }
  private emit(e: FarmEvent) { for (const fn of this.listeners) fn(e); }
  save() {
    this.state.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage off */ }
  }
  get(id: string) { return this.state.critters.find((c) => c.id === id); }

  private newDay() {
    this.state.day = today();
    for (const c of this.state.critters) { c.earnedToday = 0; c.jobsToday = 0; c.costToday = 0; }
  }

  /** Idle-game catch-up: roughly one finished job per agent every 2 minutes away (up to 8 hours). */
  private payOffline() {
    const secs = Math.min(8 * 3600, (Date.now() - this.state.savedAt) / 1000);
    if (secs < 120) return;
    let bits = 0, jobs = 0, levels = 0;
    for (const c of this.state.critters) {
      const n = Math.floor(secs / 120);
      for (let i = 0; i < n; i++) {
        const b = 10 + Math.floor(Math.random() * 20); bits += b; jobs++;
        c.earnedToday += b; c.jobsToday++;
        if (this.addXp(c, 8, true)) levels++;
      }
      c.energy = Math.min(100, c.energy + secs / 60);
      c.job = null;
    }
    this.state.bits += bits;
    this.away = { seconds: secs, bits, jobs, levels };
  }

  /** Returns true if the critter levelled up. */
  private addXp(c: Critter, xp: number, quiet = false): boolean {
    c.xp += xp;
    let up = false;
    while (c.xp >= xpForNext(c.level)) {
      c.xp -= xpForNext(c.level); c.level++; up = true;
      if (!quiet) this.emit({ type: 'level', c });
      if (c.level % EVOLVE_EVERY === 0) this.evolve(c, quiet);
    }
    return up;
  }

  private evolve(c: Critter, quiet: boolean) {
    const l = lineById(c.lineId);
    const i = l.forms.findIndex((f) => f.id === c.formId);
    if (i < 0 || i >= l.forms.length - 1) return;
    const from = l.forms[i], to = l.forms[i + 1];
    c.formId = to.id;
    if (c.name === from.name) c.name = to.name;
    this.note(c, `Digivolved: ${from.name} → ${to.name}`);
    if (!quiet) this.emit({ type: 'evolve', c, from, to });
  }

  note(c: Critter, text: string) {
    c.log.unshift({ at: Date.now(), text });
    c.log.length = Math.min(c.log.length, 40);
  }

  /** One simulation step (dt seconds of game time). */
  tick(dt: number) {
    if (this.state.day !== today()) this.newDay();
    for (const c of this.state.critters) {
      c.mood = Math.max(0, c.mood - dt * 0.02);
      const j = c.job;
      if (!j) {
        c.energy = Math.min(100, c.energy + dt * (c.resting ? 1.5 : 0.4));
        if (c.resting && c.energy >= 95) c.resting = false;
        // idle agents pick up work by themselves when rested enough
        if (!c.resting && c.energy > 35 && Math.random() < dt * 0.03) this.startJob(c);
        continue;
      }
      if (j.approval) continue;                                    // waiting on you
      if (j.askAt !== undefined && j.progress >= j.askAt) {
        j.approval = { command: COMMANDS[Math.floor(Math.random() * COMMANDS.length)], askedAt: Date.now() };
        j.askAt = undefined;
        this.note(c, `Asked to run ${j.approval.command}`);
        this.emit({ type: 'approval', c });
        continue;
      }
      // tired or unhappy agents work slower
      const pace = 0.5 + (c.energy / 100) * 0.35 + (c.mood / 100) * 0.15;
      j.progress = Math.min(1, j.progress + (dt / j.seconds) * pace);
      c.energy = Math.max(0, c.energy - dt * 0.35);
      if (j.progress >= 1) this.finishJob(c);
    }
  }

  startJob(c: Critter, title?: string) {
    if (c.job) return;
    const seconds = 25 + Math.random() * 35;
    c.job = { title: title ?? JOBS[Math.floor(Math.random() * JOBS.length)], startedAt: Date.now(), seconds, progress: 0,
      askAt: Math.random() < 0.25 ? 0.3 + Math.random() * 0.4 : undefined };
    c.resting = false;
    this.note(c, `Started: ${c.job.title}`);
    this.emit({ type: 'job.start', c });
  }

  private finishJob(c: Critter) {
    const j = c.job!;
    const bits = 15 + Math.floor(Math.random() * 25) + c.level * 2;
    const xp = 8 + Math.floor(Math.random() * 6);
    this.state.bits += bits;
    c.earnedToday += bits; c.jobsToday++;
    c.costToday += 0.02 + Math.random() * 0.06;                     // simulated spend; real token cost later
    c.job = null;
    this.note(c, `Done: ${j.title} (+${bits} bits)`);
    this.emit({ type: 'job.done', c, bits, xp });
    this.addXp(c, xp);
  }

  answer(c: Critter, choice: 'allow' | 'deny' | 'later') {
    const j = c.job;
    if (!j?.approval) return;
    const cmd = j.approval.command;
    if (choice === 'allow') { j.approval = undefined; c.mood = Math.min(100, c.mood + 5); this.note(c, `You allowed ${cmd}`); }
    else if (choice === 'deny') { c.job = null; c.mood = Math.max(0, c.mood - 8); this.note(c, `You denied ${cmd}; job dropped`); }
    else { j.approval = undefined; j.askAt = Math.min(0.95, j.progress + 0.15); this.note(c, `Asked to wait on ${cmd}`); }
    this.emit({ type: 'changed' });
  }

  feed(c: Critter): boolean {
    if (this.state.bits < 20) return false;
    this.state.bits -= 20; c.energy = Math.min(100, c.energy + 25); c.mood = Math.min(100, c.mood + 10);
    this.note(c, 'Ate a meat snack (−20 bits)');
    this.emit({ type: 'changed' }); return true;
  }
  train(c: Critter) {
    if (c.energy < 15) return false;
    c.energy -= 15; this.note(c, 'Trained on the farm'); this.addXp(c, 6);
    this.emit({ type: 'changed' }); return true;
  }
  rest(c: Critter) { if (!c.job) { c.resting = true; this.note(c, 'Resting'); this.emit({ type: 'changed' }); } }

  /** Totals for the daily recap. */
  recap() {
    const cs = this.state.critters;
    return {
      jobs: cs.reduce((n, c) => n + c.jobsToday, 0),
      bits: cs.reduce((n, c) => n + c.earnedToday, 0),
      cost: cs.reduce((n, c) => n + c.costToday, 0),
      top: [...cs].sort((a, b) => b.jobsToday - a.jobsToday)[0],
      tired: cs.filter((c) => c.energy < 35),
    };
  }
}
