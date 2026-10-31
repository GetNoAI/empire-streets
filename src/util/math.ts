export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Frame-rate independent smoothing factor for exponential decay toward a target. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
/** Shortest signed angular difference b - a. */
export const angleDelta = (a: number, b: number): number => wrapAngle(b - a);
