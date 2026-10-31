/**
 * The police response per wanted level, as data (engine-free, unit-tested). Rows 1-4 restate the
 * behaviour the police already had; row 5 adds tanks and faster roadblocks.
 */

export interface TankRule {
  /** Most tanks on the street at once. */
  max: number;
  /** Seconds at 5 stars before the first tank rolls in. */
  firstDelay: number;
  /** Seconds between further tanks. */
  every: number;
  /** How far from you a tank enters (m, along its avenue). */
  spawnDistance: number;
  /** Seconds a tank lingers on the wrong avenue before it pulls out to be replaced. */
  relocateAfter: number;
}

export interface StarRule {
  stars: number;
  /** Heat needed to reach this level. */
  heat: number;
  /** Police units on the street (roadblocks come on top). */
  units: number;
  /** What officers on foot carry. */
  footWeapons: string[];
  /** Units ram your car. */
  ram: boolean;
  /** Seconds between roadblocks (0 = none). */
  roadblockEvery: number;
  tanks: TankRule | null;
}

export const ESCALATION: { stars: StarRule[]; undergroundSearchMult: number } = {
  stars: [
    { stars: 1, heat: 1, units: 2, footWeapons: [], ram: false, roadblockEvery: 0, tanks: null },
    { stars: 2, heat: 3.5, units: 3, footWeapons: ['pistol'], ram: false, roadblockEvery: 0, tanks: null },
    { stars: 3, heat: 8, units: 5, footWeapons: ['pistol', 'tranq'], ram: true, roadblockEvery: 0, tanks: null },
    { stars: 4, heat: 15, units: 6, footWeapons: ['rifle'], ram: true, roadblockEvery: 22, tanks: null },
    {
      stars: 5,
      heat: 25,
      units: 8,
      footWeapons: ['rifle'],
      ram: true,
      roadblockEvery: 15,
      tanks: { max: 2, firstDelay: 10, every: 60, spawnDistance: 250, relocateAfter: 15 },
    },
  ],
  undergroundSearchMult: 2,
};

/** The rule for a wanted level (null at 0 stars). */
export function rule(stars: number): StarRule | null {
  if (stars <= 0) return null;
  return ESCALATION.stars[Math.min(ESCALATION.stars.length, Math.round(stars)) - 1];
}

/** Units the police want on the street at this level. */
export function unitsFor(stars: number): number {
  return rule(stars)?.units ?? 0;
}

/**
 * Tank dispatch: given how long you've been at 5 stars, seconds since the last tank was sent this
 * chase (Infinity if none yet) and how many are out, should another roll in now?
 */
export function tankDue(stars: number, atFiveFor: number, sinceLast: number, active: number): boolean {
  const t = rule(stars)?.tanks;
  if (!t || active >= t.max) return false;
  if (atFiveFor < t.firstDelay) return false;
  return sinceLast >= t.every;
}
