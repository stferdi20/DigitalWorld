/** Standard animation names every sprite pack maps onto. Missing ones fall back to `idle_down`. */
export const ANIM_NAMES = [
  'idle_down', 'idle_left', 'idle_right', 'idle_up',
  'walk_down', 'walk_left', 'walk_right', 'walk_up',
  'work', 'happy', 'hurt',
] as const;
export type AnimName = (typeof ANIM_NAMES)[number];
export type Facing = 'down' | 'left' | 'right' | 'up';

/** One entry of a pack's manifest.json — game-agnostic sprite description. */
export interface SpriteManifest {
  id: string;
  /** Display name, e.g. "Charizard" (Digimon sets are only numbered). */
  name?: string;
  sheet: string;              // path relative to the pack folder
  frame: [number, number];    // frame width/height in px (multiple of 16 recommended)
  anchor?: [number, number];  // default [0.5, 1] = feet
  scale?: number;             // default 1
  fps?: number;               // default 6
  anims: Partial<Record<AnimName, number[]>>;
  /** Anims drawn by horizontally flipping another, e.g. walk_right → walk_left. */
  mirror?: Partial<Record<AnimName, AnimName>>;
  /** Frame index to use as the picker thumbnail. */
  thumb?: number;
}

export interface PackManifest {
  pack: string;
  sprites: SpriteManifest[];
}

export type Stage = 'in-training' | 'rookie' | 'champion' | 'ultimate' | 'mega';
export const STAGES: Stage[] = ['in-training', 'rookie', 'champion', 'ultimate', 'mega'];
export const SENIORITY: Record<Stage, string> = {
  'in-training': 'Intern', rookie: 'Junior', champion: 'Mid', ultimate: 'Senior', mega: 'Lead',
};

export type Zone = 'office' | 'dark' | 'machine' | 'nursery' | 'training';

export interface DigimonForm { id: string; name: string; stage: Stage; }
export interface EvolutionLine {
  id: string;
  name: string;
  home: Zone;                 // farm the line idles in
  color: string;              // placeholder tint
  forms: DigimonForm[];       // ordered by stage
  dark?: { from: string; to: DigimonForm }; // dark-evolution branch
}

export type Role = 'coder' | 'reviewer' | 'researcher' | 'planner';
export const ROLES: Role[] = ['coder', 'reviewer', 'researcher', 'planner'];
