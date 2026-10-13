/**
 * Music and sound effects from the local sound pack (tools/rom-extract/dusk_sound.py renders the
 * game's sequences to OGG). Plain HTMLAudio: songs stream, effects are fire-and-forget clones.
 * Browsers only allow audio after a user gesture, so nothing plays until the first click.
 */
import type { AreaId } from './map';

export type SfxEvent = 'assign' | 'done' | 'fail' | 'evolve' | 'warp' | 'hire' | 'select' | 'attention';
export const SFX_EVENTS: SfxEvent[] = ['assign', 'done', 'fail', 'evolve', 'warp', 'hire', 'select', 'attention'];

interface SoundIndex { bgm: { id: string; seconds: number }[]; se: { id: string; seconds: number }[]; }
interface Settings {
  on: boolean; music: number; sfx: number;
  bgm: Partial<Record<AreaId, string>>;
  events: Partial<Record<SfxEvent, string>>;
}

const BASE = 'assets/packs/sound/dusk/';
const STORE = 'dw.sound';

class AudioManager {
  index: SoundIndex = { bgm: [], se: [] };
  settings: Settings = { on: true, music: 0.5, sfx: 0.6, bgm: {}, events: {} };
  private song: HTMLAudioElement | null = null;
  private songId = '';
  private unlocked = false;
  private wantedArea: AreaId = 'office';
  private lastPlayed = new Map<string, number>();

  async init() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { /* defaults */ }
    try {
      const r = await fetch(BASE + 'sound.json');
      if (r.ok) this.index = await r.json();
    } catch { /* no sound pack: stay silent */ }
    const unlock = () => { this.unlocked = true; this.setArea(this.wantedArea, true); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  get available() { return this.index.bgm.length > 0 || this.index.se.length > 0; }

  save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (this.song) this.song.volume = this.settings.music;
    if (!this.settings.on) this.stopSong();
    else this.setArea(this.wantedArea, true);
  }

  /** Default song per area: spread over the soundtrack so each place sounds different. */
  bgmFor(area: AreaId): string | undefined {
    const pick = this.settings.bgm[area];
    if (pick !== undefined) return pick || undefined;   // '' = silence
    const order: AreaId[] = ['office', 'exec', 'nursery', 'machine', 'dark', 'training', 'pokemon', 'net'];
    const list = this.index.bgm;
    return list.length ? list[(order.indexOf(area) * 5) % list.length].id : undefined;
  }

  /** Default effect per event, chosen by length (short blips for UI, longer jingles for milestones). */
  sfxFor(ev: SfxEvent): string | undefined {
    const pick = this.settings.events[ev];
    if (pick !== undefined) return pick || undefined;
    const se = [...this.index.se].sort((a, b) => a.seconds - b.seconds);
    if (!se.length) return undefined;
    const at = (f: number) => se[Math.min(se.length - 1, Math.floor(se.length * f))].id;
    return { select: at(0.05), assign: at(0.15), hire: at(0.35), warp: at(0.5), attention: at(0.45), fail: at(0.6), done: at(0.8), evolve: at(0.97) }[ev];
  }

  /** Called as the camera moves: crossfade to the area's song. */
  setArea(area: AreaId, force = false) {
    this.wantedArea = area;
    if (!this.unlocked || !this.settings.on) return;
    const id = this.bgmFor(area);
    if (!id) { this.stopSong(); return; }
    if (id === this.songId && !force && this.song) return;
    if (id === this.songId && this.song && !this.song.paused) return;
    this.stopSong();
    const a = new Audio(BASE + id + '.ogg');
    a.loop = true; a.volume = this.settings.music;
    a.play().catch(() => { /* blocked until a gesture */ });
    this.song = a; this.songId = id;
  }

  private stopSong() {
    if (this.song) { this.song.pause(); this.song = null; }
    this.songId = '';
  }

  play(ev: SfxEvent) {
    if (!this.unlocked || !this.settings.on) return;
    const id = this.sfxFor(ev);
    if (!id) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(ev) ?? 0) < 350) return;   // a busy office shouldn't be a wall of noise
    this.lastPlayed.set(ev, now);
    this.preview(id);
  }

  preview(id: string, music = false) {
    if (!id) return;
    const a = new Audio(BASE + id + '.ogg');
    a.volume = music ? this.settings.music : this.settings.sfx;
    a.play().catch(() => {});
    if (music) setTimeout(() => a.pause(), 8000);
  }
}

export const audio = new AudioManager();
