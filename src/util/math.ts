export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
/** Frame-rate independent smoothing factor for exponential decay toward a target. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
