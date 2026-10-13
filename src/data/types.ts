/** Standard animation names every sprite pack maps onto. Missing ones fall back to `idle_down`. */
export const BASE_ANIMS = [
  'idle_down', 'idle_left', 'idle_right', 'idle_up',
  'walk_down', 'walk_left', 'walk_right', 'walk_up',
  'work', 'happy', 'hurt',
] as const;
/** Optional diagonal anims (8-direction packs such as PMD and BN5). */
export const DIAGONAL_ANIMS = [
  'idle_down_left', 'idle_down_right', 'idle_up_left', 'idle_up_right',
  'walk_down_left', 'walk_down_right', 'walk_up_left', 'walk_up_right',
] as const;
export const ANIM_NAMES = [...BASE_ANIMS, ...DIAGONAL_ANIMS] as const;
export type AnimName = (typeof ANIM_NAMES)[number];
export type Facing = 'down' | 'left' | 'right' | 'up' | 'down_left' | 'down_right' | 'up_left' | 'up_right';
/** 4-direction pose used when a sprite has no diagonal anim. */
export const DIAGONAL_FALLBACK: Record<string, string> = {
  down_left: 'left', down_right: 'right', up_left: 'up', up_right: 'up',
};

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
  /** Frames per row in the sheet (default: min(16, frame count)). */
  cols?: number;
}

export interface PackManifest {
  pack: string;
  sprites: SpriteManifest[];
  /** Extra manifest files in the same folder whose sprites belong to this pack (large packs split up). */
  parts?: string[];
}

export type Stage = 'in-training' | 'rookie' | 'champion' | 'ultimate' | 'mega';
export const STAGES: Stage[] = ['in-training', 'rookie', 'champion', 'ultimate', 'mega'];
export const SENIORITY: Record<Stage, string> = {
  'in-training': 'Intern', rookie: 'Junior', champion: 'Mid', ultimate: 'Senior', mega: 'Lead',
};

export type Zone = 'office' | 'dark' | 'machine' | 'nursery' | 'training' | 'pokemon' | 'net';

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
