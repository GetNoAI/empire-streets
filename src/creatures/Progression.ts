import { LEVEL_CAP, MAX_MOVES, calcStats, levelForXp, maxHp, magazine, xpForLevel, displayName, type Creature } from './Creature';
import { move, species, type District, type Evolution, type TimeOfDay } from './Data';

/**
 * Levelling and evolution (engine-free, unit-tested).
 *
 * XP for beating (or catching) a foe:
 *   base(tier) x foeLevel / 7 x ((2 x foeLevel + 10) / (foeLevel + yourLevel + 10))^2.5 + 1
 * so beating something above your level pays a lot more and farming weaklings pays little;
 * all of it times XP_MULTIPLIER; x1.5 against a trainer's creature; split between the creatures
 * that fought it, and the rest of the team (still standing) gets BENCH_SHARE of the full amount.
 * Moves are learned at their learnset level (automatically while fewer than 4 are known,
 * otherwise the player chooses one to forget or skips). Evolutions: by level, by item (used from
 * the team screen) or by condition (levelling up at a time of day or in a district).
 */

export const XP_TIER_BASE: Record<number, number> = { 1: 55, 2: 95, 3: 160 };
/** Everything pays this much more XP than the original curve (levelling was a grind). */
export const XP_MULTIPLIER = 2;
/** Party members who sat the fight out still learn something: this share of the foe's XP. */
export const BENCH_SHARE = 0.3;

export function xpYield(foe: Creature, winnerLevel: number, trainer = false): number {
  const sp = species(foe.speciesId);
  const base = XP_TIER_BASE[sp.tier] ?? 60;
  const L = foe.level;
  const scale = ((2 * L + 10) / (L + winnerLevel + 10)) ** 2.5;
  return Math.max(1, Math.floor(((base * L) / 7) * scale * (trainer ? 1.5 : 1) * XP_MULTIPLIER) + 1);
}

export type ProgressEvent =
  | { kind: 'xp'; creature: Creature; amount: number }
  /** The bench's share, as one line (`creature` is the first of them). */
  | { kind: 'teamXp'; creature: Creature; count: number; amount: number }
  | { kind: 'level'; creature: Creature; level: number; hpGain: number }
  | { kind: 'learned'; creature: Creature; moveId: string }
  /** Knows 4 moves already: the player picks one to forget (or skips). */
  | { kind: 'learnPrompt'; creature: Creature; moveId: string }
  | { kind: 'evolve'; creature: Creature; to: string };

export interface EvoContext {
  timeOfDay: TimeOfDay;
  district: District;
}

/**
 * Adds XP; returns the level-ups, moves learned and prompts, and any evolution now possible
 * (checked once, after the last level-up).
 */
export function gainXp(c: Creature, amount: number, ctx: EvoContext): ProgressEvent[] {
  const out: ProgressEvent[] = [];
  if (c.level >= LEVEL_CAP || amount <= 0) return out;
  const sp = species(c.speciesId);
  const cap = xpForLevel(sp.growth, LEVEL_CAP);
  c.xp = Math.min(cap, c.xp + amount);
  out.push({ kind: 'xp', creature: c, amount });
  const target = levelForXp(sp.growth, c.xp);
  let levelled = false;
  while (c.level < target) {
    const before = maxHp(c);
    c.level++;
    const gain = maxHp(c) - before;
    c.hp = c.hp > 0 ? c.hp + gain : 0; // fainted creatures stay down until healed
    levelled = true;
    out.push({ kind: 'level', creature: c, level: c.level, hpGain: gain });
    for (const [lvl, mid] of sp.learnset) if (lvl === c.level) out.push(...learn(c, mid));
  }
  if (levelled) {
    const evo = evolutionFor(c, ctx);
    if (evo) out.push({ kind: 'evolve', creature: c, to: evo.to });
  }
  return out;
}

/** Learns a move if there's room; otherwise asks. */
export function learn(c: Creature, moveId: string): ProgressEvent[] {
  if (c.moves.includes(moveId)) return [];
  if (c.moves.length < MAX_MOVES) {
    c.moves.push(moveId);
    return [{ kind: 'learned', creature: c, moveId }];
  }
  return [{ kind: 'learnPrompt', creature: c, moveId }];
}

/** Replaces move `slot` with `moveId` (the player's answer to a learn prompt). */
export function replaceMove(c: Creature, slot: number, moveId: string): string | null {
  if (slot < 0 || slot >= c.moves.length || c.moves.includes(moveId)) return null;
  // Gun types must keep a way to reload.
  if (c.moves[slot] === 'reload' && species(c.speciesId).types.includes('gun') && moveId !== 'reload') return null;
  const old = c.moves[slot];
  c.moves[slot] = moveId;
  return old;
}

/** A level or condition evolution this creature qualifies for right now (item evolutions excluded). */
export function evolutionFor(c: Creature, ctx: EvoContext): Evolution | null {
  for (const e of species(c.speciesId).evolution) {
    if (e.method === 'level' && c.level >= e.level) return e;
    if (e.method === 'condition' && c.level >= e.minLevel && (!e.timeOfDay || e.timeOfDay === ctx.timeOfDay) && (!e.district || e.district === ctx.district)) return e;
  }
  return null;
}

/** The evolution an item would trigger on this creature, if any. */
export function itemEvolution(c: Creature, itemId: string): Evolution | null {
  return species(c.speciesId).evolution.find((e) => e.method === 'item' && e.item === itemId) ?? null;
}

/**
 * Turns the creature into its evolved form. Keeps level, XP, IVs, nickname and damage taken;
 * refills ammo for the new magazine. Returns moves the new form learns at its current level
 * (level-1 moves of the new species it doesn't know), to be offered like level-up moves.
 */
export function evolve(c: Creature, to: string): ProgressEvent[] {
  const oldMax = maxHp(c);
  const damage = oldMax - c.hp;
  const oldName = displayName(c);
  c.speciesId = to;
  const sp = species(to);
  const newMax = calcStats(sp, c.level, c.ivs).hp;
  c.hp = c.hp > 0 ? Math.max(1, newMax - damage) : 0;
  c.ammo = magazine(c);
  const out: ProgressEvent[] = [];
  // Moves the new form starts with.
  for (const [lvl, mid] of sp.learnset) if (lvl === 1 || lvl === c.level) out.push(...learn(c, mid));
  // Gun forms must be able to reload.
  if (sp.types.includes('gun') && !c.moves.includes('reload')) {
    if (c.moves.length < MAX_MOVES) c.moves.push('reload');
    else c.moves[c.moves.length - 1] = 'reload';
  }
  void oldName;
  return out;
}

export function moveName(id: string): string {
  return move(id).name;
}
