import type { CityLayout } from '../world/CityLayout';
import { TANK_SPEC as T } from '../vehicles/specs';

/**
 * Police tank logic without the engine (unit-tested): angles, aiming, shell arcs, armour, and
 * driving along an avenue. `Tank.ts` puts it in the world.
 */

const DEG = Math.PI / 180;
const VMAX = T.maxSpeedKmh / 3.6;

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Turns `cur` toward `target` by at most `maxStep` radians. */
export function turnToward(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? target : wrapAngle(cur + Math.sign(d) * maxStep);
}

/** Heading (forward = (cos h, -sin h)) that faces from one point to another. */
export function headingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toZ - fromZ), toX - fromX);
}

/** Where to aim so a shell at `speed` meets a target moving at (vx, vz). */
export function leadTarget(fromX: number, fromZ: number, x: number, z: number, vx: number, vz: number, speed: number): { x: number; z: number; t: number } {
  let t = Math.hypot(x - fromX, z - fromZ) / speed;
  for (let i = 0; i < 3; i++) t = Math.hypot(x + vx * t - fromX, z + vz * t - fromZ) / speed;
  return { x: x + vx * t, z: z + vz * t, t };
}

/** Low launch angle (radians) to hit a point `dist` away and `dy` higher, with gravity `g`. */
export function shellPitch(dist: number, dy: number, speed: number, g: number): number {
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dist * dist + 2 * dy * v2);
  if (disc < 0 || dist < 0.01) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * dist));
}

/** Damage a tank actually takes. */
export function armourDamage(amount: number, kind: 'bullet' | 'explosive'): number {
  return amount * (kind === 'bullet' ? T.armour.bulletMult : T.armour.explosiveMult);
}

export interface AveSpan {
  x: number;
  z0: number;
  z1: number;
}

/** Drivable stretches of every avenue (avenues broken by the park give two spans). */
export function avenueSpans(layout: CityLayout): AveSpan[] {
  return layout.roads.filter((r) => r.kind === 'ave').map((r) => ({ x: r.center, z0: Math.min(r.from, r.to), z1: Math.max(r.from, r.to) }));
}

/** Avenue spans sorted by how far a point is from them. */
export function spansByDistance(spans: readonly AveSpan[], x: number, z: number): AveSpan[] {
  const d = (s: AveSpan): number => Math.hypot(s.x - x, z < s.z0 ? s.z0 - z : z > s.z1 ? z - s.z1 : 0);
  return [...spans].sort((a, b) => d(a) - d(b));
}

/**
 * Where on a span a tank enters: `dist` ahead of or behind you along the avenue, at least 120 m
 * away, not where `avoid` says no (in view). `prefer` = +1/-1 tries that side first.
 */
export function spawnZ(span: AveSpan, pz: number, dist: number, prefer: 1 | -1, avoid: (z: number) => boolean): number | null {
  const lo = span.z0 + 12;
  const hi = span.z1 - 12;
  if (hi <= lo) return null;
  const cands = [pz + prefer * dist, pz - prefer * dist, prefer > 0 ? hi : lo, prefer > 0 ? lo : hi];
  for (const c of cands) {
    const z = Math.max(lo, Math.min(hi, c));
    if (Math.abs(z - pz) < 120) continue;
    if (avoid(z)) continue;
    return z;
  }
  return null;
}

export interface DriveState {
  z: number;
  /** Hull heading: π/2 faces -Z, -π/2 faces +Z. */
  h: number;
  v: number;
}

/**
 * One step along an avenue toward `targetZ`: stops `standoff` short, turns on the spot (slowly)
 * when it has to reverse, never leaves the span.
 */
export function driveStep(s: DriveState, span: AveSpan, targetZ: number, standoff: number, dt: number): DriveState {
  let { z, h, v } = s;
  const dz = targetZ - z;
  let vWant = 0;
  if (Math.abs(dz) > standoff) {
    const wantH = dz > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (Math.abs(wrapAngle(wantH - h)) > 2 * DEG) {
      // Slow to a stop, then pivot.
      if (Math.abs(v) < 0.3) h = turnToward(h, wantH, T.turnRateDeg * DEG * dt);
    } else {
      h = wantH;
      vWant = Math.min(VMAX, Math.sqrt(2 * T.accel * (Math.abs(dz) - standoff)));
    }
  }
  v = v < vWant ? Math.min(vWant, v + T.accel * dt) : Math.max(vWant, v - T.accel * 1.5 * dt);
  z += -Math.sin(h) * v * dt;
  const lo = span.z0 + 5;
  const hi = span.z1 - 5;
  if (z < lo || z > hi) {
    z = Math.max(lo, Math.min(hi, z));
    v = 0;
  }
  return { z, h, v };
}

