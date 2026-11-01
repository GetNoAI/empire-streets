/**
 * Car performance classes and bolt-on upgrades (engine-free, unit-tested).
 *
 * Every car has a performance index from its top speed, power-to-weight and grip, and a class
 * letter from that: D (buses, vans, the Rustbucket), C (everyday cars), B (muscle, police), A
 * (sports cars), S (supercars). Upgrades raise the index, and can lift a car a class. Races can
 * be limited to a class and below (`maxClass`), so a tuned hatchback has somewhere to run and a
 * supercar can't farm the rookie sprints.
 *
 * Upgrades are bought per car at the Chop Shop (`src/ui/GarageMenu.ts`): seven parts with three
 * levels each. Prices scale with the car's base price, so a cheap car is cheap to build.
 */

export type UpgradePart = 'engine' | 'tyres' | 'brakes' | 'suspension' | 'nitrous' | 'weight' | 'armor';
export const UPGRADE_PARTS: readonly UpgradePart[] = ['engine', 'tyres', 'brakes', 'suspension', 'nitrous', 'weight', 'armor'];
export const MAX_LEVEL = 3;

export type UpgradeLevels = Record<UpgradePart, number>;

export const UPGRADE_INFO: Record<UpgradePart, { name: string; levels: [string, string, string]; blurb: string; /** Share of the car's base price per level. */ cost: [number, number, number] }> = {
  engine: { name: 'Engine', levels: ['Street tune', 'Sport cams', 'Race build'], blurb: 'More pull and a higher top speed.', cost: [0.12, 0.22, 0.4] },
  tyres: { name: 'Tyres', levels: ['Touring', 'Sport', 'Slicks'], blurb: 'Grip in the corners and off the line.', cost: [0.06, 0.12, 0.22] },
  brakes: { name: 'Brakes', levels: ['Pads', 'Big discs', 'Carbon'], blurb: 'Stops shorter.', cost: [0.05, 0.1, 0.18] },
  suspension: { name: 'Suspension', levels: ['Lowered', 'Coilovers', 'Race setup'], blurb: 'Sharper steering, less roll.', cost: [0.06, 0.12, 0.2] },
  nitrous: { name: 'Nitrous', levels: ['Small bottle', 'Twin bottles', 'Big tank'], blurb: 'Hold Shift for a burst of speed. Refills on its own.', cost: [0.1, 0.18, 0.3] },
  weight: { name: 'Weight', levels: ['Strip interior', 'Carbon panels', 'Full strip'], blurb: 'Lighter: quicker and nimbler.', cost: [0.05, 0.12, 0.22] },
  armor: { name: 'Armour', levels: ['Door plates', 'Roll cage', 'Full plating'], blurb: 'Takes more punishment (a little heavier).', cost: [0.08, 0.15, 0.25] },
};

export const NO_UPGRADES: Readonly<UpgradeLevels> = { engine: 0, tyres: 0, brakes: 0, suspension: 0, nitrous: 0, weight: 0, armor: 0 };

/** Multipliers an upgrade set gives (1 = stock). `nitrous` is the boost capacity in seconds. */
export interface UpgradeEffect {
  topSpeed: number;
  acceleration: number;
  grip: number;
  brakes: number;
  steering: number;
  mass: number;
  durability: number;
  /** Seconds of nitrous in a full bottle (0 = none). */
  nitrous: number;
}

export function upgradeEffect(u: Partial<UpgradeLevels> | null | undefined): UpgradeEffect {
  const L = (p: UpgradePart): number => Math.max(0, Math.min(MAX_LEVEL, Math.round(u?.[p] ?? 0)));
  return {
    topSpeed: 1 + 0.04 * L('engine'),
    acceleration: (1 + 0.09 * L('engine')) * (1 + 0.03 * L('weight')),
    grip: 1 + 0.06 * L('tyres'),
    brakes: 1 + 0.14 * L('brakes'),
    steering: 1 + 0.05 * L('suspension'),
    mass: (1 - 0.04 * L('weight')) * (1 + 0.03 * L('armor')),
    durability: 1 + 0.18 * L('armor'),
    nitrous: [0, 3, 5, 8][L('nitrous')],
  };
}

/** Price of the next level of a part for a car (0 when maxed). */
export function upgradePrice(part: UpgradePart, current: number, basePrice: number): number {
  const lvl = Math.max(0, Math.min(MAX_LEVEL, Math.round(current)));
  if (lvl >= MAX_LEVEL) return 0;
  const share = UPGRADE_INFO[part].cost[lvl];
  return Math.max(100, Math.round((basePrice * share) / 50) * 50);
}

export function sanitizeUpgrades(raw: unknown): UpgradeLevels {
  const out: UpgradeLevels = { ...NO_UPGRADES };
  if (!raw || typeof raw !== 'object') return out;
  for (const p of UPGRADE_PARTS) {
    const v = (raw as Record<string, unknown>)[p];
    if (typeof v === 'number' && Number.isFinite(v)) out[p] = Math.max(0, Math.min(MAX_LEVEL, Math.round(v)));
  }
  return out;
}

// ------------------------------------------------------------------ classes

export type CarClass = 'D' | 'C' | 'B' | 'A' | 'S';
export const CLASSES: readonly CarClass[] = ['D', 'C', 'B', 'A', 'S'];
const CLASS_MAX: Record<CarClass, number> = { D: 50, C: 60, B: 75, A: 92, S: Infinity };
export const CLASS_COLORS: Record<CarClass, string> = { D: '#9aa0a6', C: '#4be37a', B: '#5ab8ff', A: '#ff7a1a', S: '#ff3fa4' };

/** What the index reads from a car (a VehicleSpec fits). */
export interface PerfSpec {
  maxSpeed: number;
  engineForce: number;
  mass: number;
  grip: number;
}

/** Performance index (about 35 for a bus, 110 for a supercar). `m`: multipliers on top of the spec. */
export function performanceIndex(s: PerfSpec, m: Partial<Pick<UpgradeEffect, 'topSpeed' | 'acceleration' | 'grip' | 'mass'>> = {}): number {
  const top = s.maxSpeed * (m.topSpeed ?? 1);
  const pw = (s.engineForce * (m.acceleration ?? 1)) / (s.mass * (m.mass ?? 1));
  const grip = s.grip * (m.grip ?? 1);
  return Math.round((top * 0.6 + pw * 3 + grip * 8) * 10) / 10;
}

export function classOf(index: number): CarClass {
  for (const c of CLASSES) if (index <= CLASS_MAX[c]) return c;
  return 'S';
}

export function classRank(c: CarClass): number {
  return CLASSES.indexOf(c);
}

/** Does a car of class `c` qualify for a race limited to `maxClass` (none: any car)? */
export function classAllowed(c: CarClass, maxClass: CarClass | null | undefined): boolean {
  return !maxClass || classRank(c) <= classRank(maxClass);
}

// ------------------------------------------------------------------ nitrous

export const NITRO = {
  /** Extra engine force while boosting, and how far past the top speed it pushes. */
  force: 0.75,
  overSpeed: 1.18,
  /** Seconds to refill a bottle from empty (not while boosting). */
  refill: 24,
  /** Smallest charge (s) that will fire, so a dribble doesn't waste the bottle. */
  minBurst: 0.6,
};

/**
 * Nitrous state (engine-free): a bottle of `capacity` seconds that drains while `held` and
 * refills slowly otherwise. `step` returns whether it's boosting this frame.
 */
export class Nitrous {
  charge: number;
  active = false;

  constructor(public capacity: number) {
    this.charge = capacity;
  }

  setCapacity(cap: number): void {
    this.capacity = cap;
    this.charge = Math.min(this.charge, cap);
    if (cap <= 0) this.active = false;
  }

  step(dt: number, held: boolean, canBoost = true): boolean {
    if (this.capacity <= 0) return false;
    if (held && canBoost && (this.active || this.charge >= NITRO.minBurst)) {
      this.charge = Math.max(0, this.charge - dt);
      this.active = this.charge > 0;
    } else {
      this.active = false;
      this.charge = Math.min(this.capacity, this.charge + (this.capacity / NITRO.refill) * dt);
    }
    return this.active;
  }

  get fraction(): number {
    return this.capacity > 0 ? this.charge / this.capacity : 0;
  }
}
