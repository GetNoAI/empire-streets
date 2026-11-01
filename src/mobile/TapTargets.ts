/**
 * Touch: what did that tap mean? (Engine-free: the game projects the things you could mean onto
 * the screen and hands them in; the tests do the same with plain numbers.)
 *
 * Each candidate is a point on the screen with a radius (its size there, at least a fingertip),
 * how far it is from the camera, and what kind of thing it is. The tap goes to the candidate it
 * lands on whose middle is nearest the finger, nearer things winning a close call (a person in
 * front of a car).
 */

export type TapKind = 'me' | 'follower' | 'wild' | 'person' | 'car' | 'mycar';

export interface TapCandidate<T = unknown> {
  kind: TapKind;
  /** Screen position (px) and size there (px). */
  sx: number;
  sy: number;
  r: number;
  /** Distance from the camera (m). */
  depth: number;
  ref: T;
}

export const TAP = {
  /** The smallest a target is on the screen (px): a fingertip. */
  minRadius: 30,
  /** How far away things can be tapped (m) by kind. */
  range: { me: 30, follower: 30, wild: 45, person: 35, car: 35, mycar: 40 } as Record<TapKind, number>,
  /** Tap-to-walk: how far a spot on the ground can be (m). */
  walkRange: 60,
  /** Give up on a walk that hasn't got this much closer (m) in `stuckSeconds`. */
  stuckGain: 0.3,
  stuckSeconds: 1.5,
} as const;

/** How big (px) something of world radius `r` (m) looks at `dist` m, with a vertical fov (degrees) on a screen `h` px tall. */
export function screenRadius(r: number, dist: number, fovDeg: number, h: number): number {
  const focal = h / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(TAP.minRadius, (r * focal) / Math.max(0.5, dist));
}

/** The candidate a tap at (x, y) lands on, or null. */
export function pickTapTarget<T>(x: number, y: number, cands: ReadonlyArray<TapCandidate<T>>): TapCandidate<T> | null {
  let best: TapCandidate<T> | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (c.depth > TAP.range[c.kind]) continue;
    const d = Math.hypot(x - c.sx, y - c.sy);
    if (d > c.r) continue;
    // The one whose middle is nearest the finger (a Streetmon by a car is the Streetmon, the car
    // only round it), nearer things winning a close call.
    const score = d + c.depth * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Where a walk is heading and how it's going (for giving up when you're stuck on something). */
export interface WalkProgress {
  best: number;
  since: number;
}

/** Steps the stuck check: returns true when the walk should be abandoned. */
export function walkStuck(w: WalkProgress, dist: number, dt: number): boolean {
  if (dist < w.best - TAP.stuckGain) {
    w.best = dist;
    w.since = 0;
    return false;
  }
  w.since += dt;
  return w.since > TAP.stuckSeconds;
}
