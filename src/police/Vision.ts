/**
 * Police vision (engine-free, unit-tested). Officers and patrol cars see best where they're
 * looking: a cone ahead out to their full sight range, and only a short way behind and to the
 * sides. The minimap draws the cones (src/ui/Hud.ts), so you can slip past a cruiser from behind.
 * Line of sight (buildings in the way) is checked separately by PoliceSystem.
 */

export interface VisionSpec {
  /** Sight range ahead (m), half the cone's angle (radians), and how far they notice you outside it. */
  range: number;
  half: number;
  near: number;
}

export const VISION = {
  car: { range: 110, half: (70 * Math.PI) / 180, near: 40 } as VisionSpec,
  foot: { range: 60, half: (75 * Math.PI) / 180, near: 22 } as VisionSpec,
  /** Patrols cruising in traffic aren't looking for anyone in particular. */
  patrol: { range: 77, half: (60 * Math.PI) / 180, near: 25 } as VisionSpec,
} as const;

/**
 * Is (x, z) within the vision of something at (ox, oz) facing `heading` (0 = +X, PI/2 = -Z)?
 * Ignores walls.
 */
export function inVision(v: VisionSpec, ox: number, oz: number, heading: number, x: number, z: number): boolean {
  const dx = x - ox;
  const dz = z - oz;
  const d = Math.hypot(dx, dz);
  if (d <= v.near) return true;
  if (d > v.range) return false;
  const a = Math.atan2(-dz, dx);
  let diff = a - heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= v.half;
}

/** What the minimap draws for a police blip. */
export interface PoliceBlip {
  x: number;
  z: number;
  heading?: number;
  /** The cone (missing: just a dot). */
  vision?: VisionSpec;
  /** This one can see you right now. */
  sees?: boolean;
}
