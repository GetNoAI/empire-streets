import { maxHp, type Creature } from './Creature';
import { species, type CaptureItem } from './Data';

/**
 * Catch rules (engine-free, unit-tested).
 *
 *   a = ((3 x maxHP - 2 x HP) x catchRate x itemMult x statusMult x situationMult) / (3 x maxHP)
 *
 * a >= 255 is a sure catch; otherwise the chance is a / 255. The capture item then shakes up to
 * three times; each shake holds with probability (a / 255)^(1/3), so three good shakes = caught.
 * Weaker targets (low HP), easy species (high catch rate), better items and a choking target all
 * help. Catching outside a battle (a full-health creature that hasn't been worn down) is harder.
 */

export const CATCH = {
  /** Choking targets are easier to catch. */
  chokingMult: 1.5,
  /** Throwing at a creature you're not fighting. */
  overworldMult: 0.6,
  /** Shakes before a catch holds. */
  shakes: 3,
};

/** The item's multiplier against a particular creature (its bonus applies if the target matches). */
export function itemMultiplier(it: CaptureItem, target: Creature): number {
  const sp = species(target.speciesId);
  let m = it.catchMult;
  const b = it.bonus;
  if (b) {
    const typeOk = !b.types || b.types.some((t) => sp.types.includes(t));
    const speedOk = (b.minSpeed === undefined || sp.base.speed >= b.minSpeed) && (b.maxSpeed === undefined || sp.base.speed <= b.maxSpeed);
    if (typeOk && speedOk) m *= b.mult;
  }
  return m;
}

/** The "a" value (0..255+). */
export function catchValue(target: Creature, it: CaptureItem, inBattle: boolean): number {
  const mx = maxHp(target);
  const hp = Math.max(1, Math.min(mx, target.hp));
  const rate = species(target.speciesId).catchRate;
  const status = target.status === 'choking' ? CATCH.chokingMult : 1;
  const situation = inBattle ? 1 : CATCH.overworldMult;
  return (((3 * mx - 2 * hp) * rate * itemMultiplier(it, target)) / (3 * mx)) * status * situation;
}

/** Overall chance to catch (0..1). */
export function catchChance(target: Creature, it: CaptureItem, inBattle: boolean): number {
  return Math.min(1, catchValue(target, it, inBattle) / 255);
}

export interface CatchRoll {
  /** Shakes before it broke free (0-3); 3 with `caught`. */
  shakes: number;
  caught: boolean;
  chance: number;
  /** Shown after a failed throw (pity payouts). */
  note?: string;
}

/** `bonus` is added to the chance (soft pity for repeated throws at one creature). */
export function rollCatch(target: Creature, it: CaptureItem, inBattle: boolean, rand: () => number = Math.random, bonus = 0): CatchRoll {
  const chance = Math.min(1, catchChance(target, it, inBattle) + bonus);
  if (chance >= 1) return { shakes: CATCH.shakes, caught: true, chance };
  const perShake = Math.cbrt(chance);
  let shakes = 0;
  while (shakes < CATCH.shakes && rand() < perShake) shakes++;
  return { shakes, caught: shakes === CATCH.shakes, chance };
}
