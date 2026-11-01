/**
 * Touch aim assist (engine-free, unit-tested). Thumbs can't flick onto a target like a mouse, so
 * while you aim or fire a gun on a phone the camera eases toward the best target near the middle of
 * the screen: the closest to the crosshair inside a narrow cone, threats (police) first.
 * It only ever turns the view a little each frame, so a thumb on the look area always wins.
 */

export const ASSIST = {
  /** Half-angle of the cone it looks for targets in (radians, ~14 degrees). */
  cone: 0.25,
  /** Furthest target it helps with (m). */
  range: 38,
  /** How fast it turns the view toward the target (radians per second at full strength). */
  rate: 1.6,
  /** Aiming down the sights holds tighter than hip fire. */
  aimStrength: 1,
  hipStrength: 0.55,
  /** Threats count as this much closer to the crosshair when choosing. */
  threatBias: 0.45,
} as const;

export interface AssistTarget {
  x: number;
  z: number;
  /** A cop or something else shooting at you. */
  threat?: boolean;
}

const wrap = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
};

/** Heading of a point from another (the game's convention: atan2(-dz, dx)). */
export function headingTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(-(tz - fz), tx - fx);
}

/** The target to ease toward and how far off the crosshair it is (radians, + = turn left), or null. */
export function pickAssist(from: { x: number; z: number; heading: number }, targets: readonly AssistTarget[]): { target: AssistTarget; delta: number } | null {
  let best: { target: AssistTarget; delta: number } | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - from.x, t.z - from.z);
    if (d < 1.5 || d > ASSIST.range) continue;
    const delta = wrap(headingTo(from.x, from.z, t.x, t.z) - from.heading);
    if (Math.abs(delta) > ASSIST.cone) continue;
    // Off-angle matters most; distance breaks ties; threats jump the queue.
    const score = (Math.abs(delta) + d / ASSIST.range * 0.08) * (t.threat ? ASSIST.threatBias : 1);
    if (score < bestScore) {
      bestScore = score;
      best = { target: t, delta };
    }
  }
  return best;
}

/** How much to turn the view this frame toward `delta` (never past it). */
export function assistTurn(delta: number, dt: number, aiming: boolean): number {
  const max = ASSIST.rate * (aiming ? ASSIST.aimStrength : ASSIST.hipStrength) * dt;
  // Ease: slower as it closes in, so it settles rather than snapping.
  const want = delta * Math.min(1, dt * 8);
  return Math.max(-max, Math.min(max, want));
}
