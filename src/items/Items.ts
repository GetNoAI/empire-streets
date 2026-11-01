import { maxHp, type Creature } from '../creatures/Creature';
import type { ItemSpec } from '../creatures/Data';

/**
 * Heal and field items (engine-free, unit-tested): what a Bodega Sandwich, a Medkit or Smelling
 * Salts do to a Streetmon, and the timed street effects (Pepper Musk, Pheromone Bait, the Rabbit's
 * Foot) as plain state the game hands to the spawn system each frame.
 */

export interface HealResult {
  ok: boolean;
  /** What happened, or why not. */
  note: string;
  /** HP restored in total. */
  healed: number;
}

const nameOf = (c: Creature): string => c.nickname || c.speciesId;

/** One heal item on one Streetmon (or, for a party item, on each of `party`). */
export function applyHeal(it: ItemSpec, target: Creature | null, party: readonly Creature[], name: (c: Creature) => string = nameOf): HealResult {
  const heal = typeof it['heal'] === 'number' ? (it['heal'] as number) : 0;
  const revive = typeof it['revive'] === 'number' ? (it['revive'] as number) : 0;
  if (it['party']) {
    let healed = 0;
    for (const c of party) {
      if (c.hp <= 0) continue;
      const add = Math.min(heal, maxHp(c) - c.hp);
      c.hp += add;
      healed += add;
    }
    return healed > 0 ? { ok: true, note: `The team tucks in: ${healed} HP back across the party.`, healed } : { ok: false, note: 'Everyone conscious is already at full health.', healed: 0 };
  }
  if (!target) return { ok: false, note: 'Pick a Streetmon first.', healed: 0 };
  const mx = maxHp(target);
  if (revive > 0) {
    if (target.hp > 0) return { ok: false, note: `${name(target)} hasn't fainted.`, healed: 0 };
    target.hp = Math.max(1, Math.round(mx * revive));
    target.status = 'none';
    return { ok: true, note: `${name(target)} comes round with ${target.hp} HP.`, healed: target.hp };
  }
  if (target.hp <= 0) return { ok: false, note: `${name(target)} has fainted: it needs Smelling Salts or a clinic.`, healed: 0 };
  const cure = !!it['cure'] && target.status === 'choking';
  if (target.hp >= mx && !cure) return { ok: false, note: `${name(target)} is already at full health.`, healed: 0 };
  const add = Math.min(heal, mx - target.hp);
  target.hp += add;
  if (it['cure']) target.status = 'none';
  return { ok: true, note: `${name(target)} recovers ${add} HP${cure ? ' and breathes easy again' : ''}.`, healed: add };
}

/** Timed effects from field items, in game seconds left. */
export interface StreetEffects {
  repel: number;
  attract: number;
  lucky: number;
}

export function newEffects(): StreetEffects {
  return { repel: 0, attract: 0, lucky: 0 };
}

export function tickEffects(e: StreetEffects, dt: number): void {
  e.repel = Math.max(0, e.repel - dt);
  e.attract = Math.max(0, e.attract - dt);
  e.lucky = Math.max(0, e.lucky - dt);
}

/** What the spawn system should do with these effects running (lead level for Pepper Musk). */
export function spawnModifiers(e: StreetEffects, leadLevel: number): { rateMult: number; shinyMult: number; repelBelow: number } {
  return { rateMult: e.attract > 0 ? 2 : 1, shinyMult: e.lucky > 0 ? 3 : 1, repelBelow: e.repel > 0 ? leadLevel : 0 };
}

/** A short HUD line for the running effects ('' when none). */
export function effectsLine(e: StreetEffects): string {
  const m = (s: number): string => `${Math.ceil(s / 60)}m`;
  const parts: string[] = [];
  if (e.repel > 0) parts.push(`Musk ${m(e.repel)}`);
  if (e.attract > 0) parts.push(`Bait ${m(e.attract)}`);
  if (e.lucky > 0) parts.push(`Lucky ${m(e.lucky)}`);
  return parts.join(' · ');
}
