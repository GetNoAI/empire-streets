import { DX, DZ, type Dir } from '../traffic/RoadGraph';

/** A road segment as the police see it: a straight run from a node in one direction. */
export interface RingSeg {
  from: { x: number; z: number };
  d: Dir;
  length: number;
}

/**
 * The segments that pass through the ring between `near` and `far` metres of a point: where a
 * responding unit can be placed. Picking from these (not from every road in the city) means a
 * dispatch almost always finds a spot on the first try.
 */
export function segmentsInRing<T extends RingSeg>(segs: readonly T[], at: { x: number; z: number }, near: number, far: number): T[] {
  const out: T[] = [];
  for (const s of segs) {
    const x0 = s.from.x;
    const z0 = s.from.z;
    const x1 = x0 + DX[s.d] * s.length;
    const z1 = z0 + DZ[s.d] * s.length;
    // Closest point on the (axis-aligned) segment, and the furthest end.
    const cx = Math.min(Math.max(at.x, Math.min(x0, x1)), Math.max(x0, x1));
    const cz = Math.min(Math.max(at.z, Math.min(z0, z1)), Math.max(z0, z1));
    if (Math.hypot(cx - at.x, cz - at.z) > far) continue;
    if (Math.max(Math.hypot(x0 - at.x, z0 - at.z), Math.hypot(x1 - at.x, z1 - at.z)) < near) continue;
    out.push(s);
  }
  return out;
}
