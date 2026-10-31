// Types for moveFxPlan.js.

export type FxStyle =
  | 'shot' | 'spray' | 'ricochet' | 'beam' | 'bolt' | 'orb' | 'lob' | 'drop' | 'slam' | 'dash' | 'wave' | 'cloud' | 'splash' | 'blast'
  | 'buff' | 'debuff' | 'heal' | 'veil' | 'glass' | 'reload';
export type FxImpact = 'sparks' | 'dust' | 'shards' | 'zap' | 'puff' | 'splash' | 'wave' | 'flash';
export type FxSound =
  | 'gun_pistol' | 'gun_shotgun' | 'gun_sniper' | 'gun_burst' | 'dart' | 'thump_shot' | 'whoosh' | 'slam' | 'slam_heavy' | 'crunch' | 'rubble' | 'coin'
  | 'zap' | 'zap_big' | 'beam' | 'bass' | 'bass_big' | 'bass_drop' | 'screech' | 'hiss' | 'puff' | 'boom' | 'splash' | 'squelch' | 'gurgle'
  | 'chime_up' | 'chime_down' | 'heal' | 'glass' | 'reload' | 'impact' | 'impact_heavy' | 'crit' | 'super' | 'resist' | 'faint' | 'flash'
  | 'roar' | 'stomp' | 'quake';

export const FX_STYLES: readonly FxStyle[];
export const FX_IMPACTS: readonly FxImpact[];
export const FX_SOUNDS: readonly FxSound[];
export const MELEE: readonly FxStyle[];
export const SELF: readonly FxStyle[];

export interface FxEntry {
  style?: FxStyle;
  color?: string;
  impact?: FxImpact;
  sound?: FxSound;
  hitSound?: FxSound;
  count?: number;
  scale?: number;
  shake?: number;
  lunge?: number;
  trail?: boolean;
  fire?: boolean;
  spin?: boolean;
  flash?: boolean;
  wreck?: boolean;
}

export interface MoveFxConfig {
  version: number;
  types: Record<string, FxEntry & { style: FxStyle; color: string }>;
  status: Partial<Record<'buff' | 'debuff' | 'heal' | 'veil' | 'glass' | 'reload' | 'choke', FxEntry>>;
  moves: Record<string, FxEntry>;
}

/** The parts of a move the planner reads (MoveSpec fits). */
export interface FxMove {
  id: string;
  type: string;
  power: number;
  target?: string;
  projectile?: boolean;
  signature?: boolean;
  effects?: ReadonlyArray<{ type: string; who?: string; min?: number; max?: number }>;
}

export interface MoveFxPlan {
  id: string;
  type: string;
  style: FxStyle;
  color: string;
  count: number;
  scale: number;
  /** Seconds from the move starting to it landing. */
  travel: number;
  impact: FxImpact;
  melee: boolean;
  self: boolean;
  aoe: boolean;
  lunge: number;
  trail: boolean;
  fire: boolean;
  spin: boolean;
  flash: boolean;
  /** Smashes the street around the target (legendary moves). */
  wreck: boolean;
  shake: number;
  sound: FxSound;
  hitSound: FxSound;
  signature: boolean;
  power: number;
}

export function validateMoveFx(c: MoveFxConfig, known?: { moveIds?: readonly string[]; types?: readonly string[] }): true;
export function statusKind(m: FxMove): 'buff' | 'debuff' | 'heal' | 'veil' | 'glass' | 'reload' | 'choke' | null;
export function planMoveFx(m: FxMove, c: MoveFxConfig): MoveFxPlan;
export function impactFor(p: MoveFxPlan, hit: { crit: boolean; mult: number }): { impact: FxImpact; sound: FxSound; size: number; shake: number; flash: boolean };
