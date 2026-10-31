import { species, type Growth, type SpeciesSpec, type StatId } from './Data';

/**
 * One individual creature (wild or owned): level, XP, current HP, known moves, ammo, shininess.
 * Stats are derived from species base stats, level and per-individual IVs (0-31). Engine-free.
 */

export const LEVEL_CAP = 100;
export const MAX_MOVES = 4;
/** Chance a newly generated creature is shiny. */
export const SHINY_CHANCE = 1 / 512;

export type Stats = Record<StatId, number>;

export interface Creature {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number;
  /** Total XP. */
  xp: number;
  hp: number;
  ivs: Stats;
  moves: string[];
  /** Rounds left in the magazine (Gun types). */
  ammo: number;
  shiny: boolean;
  status: 'none' | 'choking';
  /** Raid bosses: max HP multiplier (dropped when caught). */
  hpScale?: number;
  /** Where/when it was caught (for the summary screen). */
  origin?: { district: string; level: number; at: number };
}

/** Small seeded/unseeded random source so generation is testable. */
export type Rand = () => number;

let uidCounter = 0;
export function newUid(rand: Rand = Math.random): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${Date.now().toString(36)}-${uidCounter.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

/** Total XP needed to reach `level`. Fast curves level 20% quicker, slow 25% slower. */
export function xpForLevel(growth: Growth, level: number): number {
  if (level <= 1) return 0;
  const k = growth === 'fast' ? 0.8 : growth === 'slow' ? 1.25 : 1;
  return Math.floor(k * level ** 3);
}

/** Level for a total XP amount (capped). */
export function levelForXp(growth: Growth, xp: number): number {
  let l = 1;
  while (l < LEVEL_CAP && xpForLevel(growth, l + 1) <= xp) l++;
  return l;
}

export function calcStats(spec: SpeciesSpec, level: number, ivs: Stats): Stats {
  const s = (k: StatId): number => Math.floor(((2 * spec.base[k] + ivs[k]) * level) / 100);
  return {
    hp: s('hp') + level + 10,
    attack: s('attack') + 5,
    defense: s('defense') + 5,
    speed: s('speed') + 5,
    // Loud isn't a battle stat: it's kept on the species' 1-255 scale (plus a little individual variation).
    loud: spec.base.loud + Math.floor(ivs.loud / 4),
  };
}

export function stats(c: Creature): Stats {
  const s = calcStats(species(c.speciesId), c.level, c.ivs);
  if (c.hpScale && c.hpScale !== 1) s.hp = Math.round(s.hp * c.hpScale);
  return s;
}

export function maxHp(c: Creature): number {
  return stats(c).hp;
}

/** The (up to) four most recent moves a species knows at a level: what a wild one would use. */
export function movesAtLevel(spec: SpeciesSpec, level: number): string[] {
  const learned: string[] = [];
  for (const [l, id] of [...spec.learnset].sort((a, b) => a[0] - b[0])) {
    if (l > level) break;
    const i = learned.indexOf(id);
    if (i >= 0) learned.splice(i, 1);
    learned.push(id);
  }
  // Gun types always keep Reload, or they could end up unable to fire.
  let out = learned.slice(-MAX_MOVES);
  if (spec.types.includes('gun') && learned.includes('reload') && !out.includes('reload')) {
    out = [...learned.filter((m) => m !== 'reload').slice(-(MAX_MOVES - 1)), 'reload'];
  }
  return out;
}

export function magazine(c: Creature): number {
  return species(c.speciesId).ammo ?? 0;
}

export function createCreature(speciesId: string, level: number, rand: Rand = Math.random, opts: { shiny?: boolean } = {}): Creature {
  const spec = species(speciesId);
  const lvl = Math.max(1, Math.min(LEVEL_CAP, Math.round(level)));
  const iv = (): number => Math.floor(rand() * 32);
  const ivs: Stats = { hp: iv(), attack: iv(), defense: iv(), speed: iv(), loud: iv() };
  const c: Creature = {
    uid: newUid(rand),
    speciesId,
    level: lvl,
    xp: xpForLevel(spec.growth, lvl),
    hp: 0,
    ivs,
    moves: movesAtLevel(spec, lvl),
    ammo: spec.ammo ?? 0,
    shiny: opts.shiny ?? rand() < SHINY_CHANCE,
    status: 'none',
  };
  c.hp = calcStats(spec, lvl, ivs).hp;
  return c;
}

export function displayName(c: Creature): string {
  return c.nickname || species(c.speciesId).name;
}
