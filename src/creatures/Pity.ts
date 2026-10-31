/**
 * Pity system (engine-free, unit-tested): keeps bad luck with capture items from snowballing.
 *
 * - A counter of consecutive failed throws, across all targets, resets on any catch.
 * - After `compensateAfter` fails in a row: the item you just threw comes back, plus one bonus
 *   capture item of the same tier.
 * - After `cashAfter` fails: the same, plus cash ($150 + $10 x target level), and the counter
 *   starts again.
 * - Soft pity: each failed throw at the same creature adds +8% to its catch chance, up to +40%.
 */

export const PITY = {
  compensateAfter: 4,
  cashAfter: 8,
  cash: { base: 150, perLevel: 10 },
  softPerFail: 0.08,
  softMax: 0.4,
};

export interface PityState {
  fails: number;
  sameTarget: { uid: string; fails: number } | null;
}

export interface PityOutcome {
  state: PityState;
  /** Item to give back (the one just thrown). */
  refund: string | null;
  /** Bonus capture item of the same tier. */
  bonus: string | null;
  cash: number;
}

export function newPity(): PityState {
  return { fails: 0, sameTarget: null };
}

/** Extra catch chance (0..softMax) for throwing at this creature again. */
export function softBonus(state: PityState, uid: string): number {
  const st = state.sameTarget;
  if (!st || st.uid !== uid) return 0;
  return Math.min(PITY.softMax, st.fails * PITY.softPerFail);
}

/** Catch chance with soft pity added (capped at 1). */
export function withPity(chance: number, state: PityState, uid: string): number {
  return Math.min(1, chance + softBonus(state, uid));
}

/**
 * Records a throw. `tierOf` maps a capture item to the bonus item of the same tier (by default
 * the same item).
 */
export function recordThrow(state: PityState, uid: string, itemId: string, targetLevel: number, caught: boolean, tierOf: (id: string) => string = (id) => id): PityOutcome {
  if (caught) return { state: newPity(), refund: null, bonus: null, cash: 0 };
  const fails = state.fails + 1;
  const same = state.sameTarget && state.sameTarget.uid === uid ? state.sameTarget.fails + 1 : 1;
  const sameTarget = { uid, fails: same };
  if (fails >= PITY.cashAfter) {
    return { state: { fails: 0, sameTarget }, refund: itemId, bonus: tierOf(itemId), cash: PITY.cash.base + PITY.cash.perLevel * Math.max(1, Math.round(targetLevel)) };
  }
  if (fails === PITY.compensateAfter) return { state: { fails, sameTarget }, refund: itemId, bonus: tierOf(itemId), cash: 0 };
  return { state: { fails, sameTarget }, refund: null, bonus: null, cash: 0 };
}

/** One-line message for a pity payout (empty if there wasn't one). */
export function pityMessage(o: PityOutcome, itemName: (id: string) => string): string {
  if (!o.refund) return '';
  const parts = [`your ${itemName(o.refund)} back`];
  if (o.bonus) parts.push(`a free ${itemName(o.bonus)}`);
  if (o.cash) parts.push(`$${o.cash}`);
  const last = parts.pop()!;
  return `Rough luck! You get ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}
