/**
 * Cars hitting Streetmon (engine-free maths, unit-tested). Streetmon have no rigid bodies, so each
 * physics step the car's footprint (an oriented box) is tested against each nearby creature's
 * circle; a hit deals damage scaled by closing speed, the car's weight class and the creature's
 * weight, knocks it into a short ballistic hop, and slows the car a little.
 */

export type WeightClass = 'light' | 'medium' | 'heavy' | 'armoured';

export const IMPACT = {
  /** No damage below this closing speed (m/s, 12 km/h): just a nudge. */
  minSpeed: 3.3,
  /** Speed scale of the damage curve (m/s). */
  speedScale: 22,
  /** Curve exponent. */
  exponent: 1.5,
  /** Weight (kg) at which a creature takes half the damage of a weightless one. */
  weightHalf: 400,
  /** Most a single hit can deal, as a share of max HP. */
  maxShare: 1.2,
  /** A heavy or armoured car this fast knocks any Streetmon out (km/h). */
  instantFaintKmh: 80,
  /** Share of the car's velocity the creature flies off with, and the hop's vertical speed range (m/s). */
  knockShare: 0.6,
  hopMin: 2,
  hopMax: 5,
  /** Cars only test creatures within this distance of the player (m), above this speed (m/s, 10 km/h). */
  range: 30,
  activeSpeed: 2.8,
  /** The same creature can't be hit again for this long (s). */
  cooldown: 0.6,
  /** Streetmon this heavy (kg), or Concrete types, damage the car: this share of the hit's damage. */
  heavyKg: 80,
  carDamageShare: 0.3,
  /** Car damage per point of creature damage (car health is about 10x a creature's HP). */
  carDamageScale: 10,
} as const;

const CLASS_MULT: Record<WeightClass, number> = { light: 0.8, medium: 1.0, heavy: 1.35, armoured: 2.5 };

export function weightClassOf(massKg: number, armoured = false): WeightClass {
  if (armoured) return 'armoured';
  if (massKg < 1500) return 'light';
  if (massKg <= 2000) return 'medium';
  return 'heavy';
}

export function classMultiplier(c: WeightClass): number {
  return CLASS_MULT[c];
}

/** Fallback weight when a species has none: grows with the cube of height; Concrete is dense. */
export function defaultWeightKg(height: number, types: readonly string[]): number {
  const base = 30 * height ** 3;
  return Math.max(1, Math.round(base * (types.includes('concrete') ? 3 : 1)));
}

/** Share of max HP a hit takes off (0 under 12 km/h). `v` = closing speed along the contact normal, m/s. */
export function impactShare(v: number, cls: WeightClass, weightKg: number): number {
  if (v <= IMPACT.minSpeed) return 0;
  const s = ((v - IMPACT.minSpeed) / IMPACT.speedScale) ** IMPACT.exponent * CLASS_MULT[cls] * (1 / (1 + weightKg / IMPACT.weightHalf));
  return Math.min(IMPACT.maxShare, s);
}

export function instantFaint(vKmh: number, cls: WeightClass): boolean {
  return vKmh > IMPACT.instantFaintKmh && (cls === 'heavy' || cls === 'armoured');
}

export interface ImpactResult {
  damage: number;
  /** Critical (instant knockout). */
  crit: boolean;
  /** Knockback velocity, m/s. */
  vx: number;
  vy: number;
  vz: number;
  /** Fraction of the car's speed lost (momentum shared with the creature). */
  carSlow: number;
  /** Damage dealt back to the car (heavy Streetmon only). */
  carDamage: number;
}

/**
 * Everything one hit does. `carVx/carVz`: car velocity; `nx/nz`: unit normal from car to creature;
 * `hp/maxHp`: the creature's current and max HP.
 */
export function resolveImpact(o: {
  carVx: number;
  carVz: number;
  nx: number;
  nz: number;
  carMass: number;
  cls: WeightClass;
  weightKg: number;
  heavyType: boolean;
  hp: number;
  maxHp: number;
}): ImpactResult | null {
  const vClose = o.carVx * o.nx + o.carVz * o.nz;
  if (vClose <= 0.5) return null;
  const kmh = Math.hypot(o.carVx, o.carVz) * 3.6;
  const share = impactShare(vClose, o.cls, o.weightKg);
  const crit = share > 0 && instantFaint(kmh, o.cls);
  const damage = crit ? Math.max(o.hp, 1) : share > 0 ? Math.max(1, Math.round(share * o.maxHp)) : 0;
  // Light creatures fly; heavy ones barely move.
  const light = 1 / (1 + o.weightKg / 150);
  const sp = Math.hypot(o.carVx, o.carVz);
  const kv = IMPACT.knockShare * light;
  const t = Math.min(1, vClose / 20);
  const vy = (IMPACT.hopMin + (IMPACT.hopMax - IMPACT.hopMin) * t) * Math.sqrt(light);
  // Fly along the car's motion, pushed out a little to the side it was struck from.
  const side = 0.35 * sp;
  const vx = o.carVx * kv + o.nx * side * kv;
  const vz = o.carVz * kv + o.nz * side * kv;
  const carSlow = Math.min(0.6, o.weightKg / (o.weightKg + o.carMass));
  const heavy = o.heavyType || o.weightKg >= IMPACT.heavyKg;
  const carDamage = heavy ? damage * IMPACT.carDamageShare * IMPACT.carDamageScale : 0;
  return { damage, crit, vx, vy: share > 0 ? vy : vy * 0.3, vz, carSlow, carDamage };
}

/**
 * 2D contact between a car footprint (centre, heading h with forward (cos h, -sin h), half length
 * and half width) and a circle. Returns the unit normal from car to circle, or null.
 */
export function carCircleContact(cx: number, cz: number, h: number, halfL: number, halfW: number, px: number, pz: number, r: number): { nx: number; nz: number; depth: number } | null {
  const fx = Math.cos(h);
  const fz = -Math.sin(h);
  // Right of the car: forward rotated -90° about +Y.
  const rx = -fz;
  const rz = fx;
  const dx = px - cx;
  const dz = pz - cz;
  const lf = dx * fx + dz * fz;
  const lr = dx * rx + dz * rz;
  // Closest point on the box to the circle centre (in car space).
  const qf = Math.max(-halfL, Math.min(halfL, lf));
  const qr = Math.max(-halfW, Math.min(halfW, lr));
  const ex = lf - qf;
  const ez = lr - qr;
  const d2 = ex * ex + ez * ez;
  if (d2 > r * r) return null;
  let nf: number;
  let nr: number;
  let depth: number;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nf = ex / d;
    nr = ez / d;
    depth = r - d;
  } else {
    // Centre inside the box: push out through the nearest face.
    const pf = halfL - Math.abs(lf);
    const pr = halfW - Math.abs(lr);
    if (pf < pr) {
      nf = Math.sign(lf) || 1;
      nr = 0;
      depth = pf + r;
    } else {
      nf = 0;
      nr = Math.sign(lr) || 1;
      depth = pr + r;
    }
  }
  return { nx: nf * fx + nr * rx, nz: nf * fz + nr * rz, depth };
}
