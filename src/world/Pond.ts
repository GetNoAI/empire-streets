import type { Rect } from './CityLayout';

/**
 * The Central Green pond as real water (engine-free, unit-tested): its depth, the surface and
 * waves, who's floating, wading or swimming, and how cars float, drift and flood.
 *
 * The basin is a bowl: a shallow wading shelf a few metres wide all round the stone rim, then the
 * bed drops to about 2.4 m in the middle. The depth is a function of where you are as a share of
 * the way across (the same both ways), so the physics heightfield and the bed mesh agree however
 * the rows and columns are laid out.
 */

export const POND = {
  /** Height of the still water surface (the grass is at 0.15, the road at 0). */
  surface: -0.1,
  /** Depth at the rim and in the middle (m). */
  edgeDepth: 0.6,
  maxDepth: 2.4,
  /** Where the shelf ends and the deep starts, as a share of the way across (0 = rim, 0.5 = middle). */
  shelf: [0.02, 0.16] as [number, number],
  /** The stone rim: height above the road and width, and how far its wall runs down under water. */
  rimHeight: 0.35,
  rimWidth: 0.5,
  rimBottom: -0.8,
  /** Water deeper than this at your feet and you swim (m). */
  swimDepth: 1.25,
  /** Swimming: your feet hang this far under the surface; speeds (m/s). */
  floatDepth: 1.22,
  swimSpeed: 2.1,
  swimSprint: 3.3,
  /** Wading slows you down this much per metre of water at your feet (up to `wadeMax`). */
  wadeDrag: 0.5,
  wadeMax: 0.55,
  /** From the water: within this of the edge, heading out (or jumping), you climb onto the bank. */
  climbReach: 1.3,
  /** Waves (vertex shader and the floating things that ride them). */
  waves: [
    { amp: 0.035, len: 9, speed: 1.1, dirX: 0.8, dirZ: 0.6 },
    { amp: 0.025, len: 5.3, speed: 1.6, dirX: -0.4, dirZ: 0.92 },
    { amp: 0.012, len: 2.7, speed: 2.3, dirX: 0.95, dirZ: -0.3 },
  ],
  /** Cars: buoyancy share of their weight when dry (floats a moment), then it floods in this many seconds of being under. */
  carBuoyancy: 1.3,
  floodSeconds: 9,
  /** Engine under water (share of the body submerged) and the engine dies. */
  stallAt: 0.45,
  /** Water drag on cars: horizontal and vertical (1/s), and spin. */
  dragH: 1.4,
  dragV: 2.6,
  dragSpin: 2.2,
  /** Seconds out of the water before a drowned engine starts again. */
  dryOut: 12,
} as const;

export function inLake(lake: Rect, x: number, z: number, margin = 0): boolean {
  return x > lake.x0 + margin && x < lake.x1 - margin && z > lake.z0 + margin && z < lake.z1 - margin;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Depth of water over the bed at a point, from its share of the way across (u, v in 0..1). */
export function depthUV(u: number, v: number): number {
  const e = Math.max(0, Math.min(u, 1 - u, v, 1 - v));
  // A slight hollow off-centre so the deep isn't a flat plate.
  const wob = 0.12 * Math.sin(u * 7.1) * Math.sin(v * 5.3);
  return POND.edgeDepth + (POND.maxDepth - POND.edgeDepth) * smooth(POND.shelf[0], POND.shelf[1], e) + wob * smooth(0.1, 0.25, e);
}

export function depthAt(lake: Rect, x: number, z: number): number {
  return depthUV((x - lake.x0) / (lake.x1 - lake.x0), (z - lake.z0) / (lake.z1 - lake.z0));
}

/** The wave height at a point (the same sum the water shader draws). */
export function waveY(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of POND.waves) {
    const k = (Math.PI * 2) / w.len;
    h += w.amp * Math.sin((x * w.dirX + z * w.dirZ) * k + t * w.speed);
  }
  return POND.surface + h;
}

export type WaterState = 'dry' | 'wading' | 'swimming';

/** Whether someone whose feet are at `feetY` over this spot is dry, wading or swimming. */
export function waterState(lake: Rect, x: number, z: number, feetY: number): WaterState {
  if (!inLake(lake, x, z)) return 'dry';
  if (feetY > POND.surface - 0.05) return 'dry';
  return depthAt(lake, x, z) >= POND.swimDepth ? 'swimming' : 'wading';
}

/** How fast you can move wading with this much water at your feet (a share of your normal speed). */
export function wadeFactor(waterAtFeet: number): number {
  return 1 - Math.min(POND.wadeMax, Math.max(0, waterAtFeet) * POND.wadeDrag);
}

/** The nearest point of the edge, the outward direction there, and how far in you are (m). */
export function nearestEdge(lake: Rect, x: number, z: number): { x: number; z: number; nx: number; nz: number; d: number } {
  const opts = [
    { d: x - lake.x0, x: lake.x0, z, nx: -1, nz: 0 },
    { d: lake.x1 - x, x: lake.x1, z, nx: 1, nz: 0 },
    { d: z - lake.z0, x, z: lake.z0, nx: 0, nz: -1 },
    { d: lake.z1 - z, x, z: lake.z1, nx: 0, nz: 1 },
  ];
  opts.sort((a, b) => a.d - b.d);
  const o = opts[0];
  return { x: Math.min(lake.x1, Math.max(lake.x0, o.x)), z: Math.min(lake.z1, Math.max(lake.z0, o.z)), nx: o.nx, nz: o.nz, d: o.d };
}

/** Where you stand after climbing out: on the grass just past the rim. */
export function bankPoint(lake: Rect, x: number, z: number): { x: number; z: number } {
  const e = nearestEdge(lake, x, z);
  const out = POND.rimWidth + 0.8;
  return { x: e.x + e.nx * out, z: e.z + e.nz * out };
}

/** Climb out now? Close to the edge and heading out (or pressing jump). */
export function shouldClimbOut(lake: Rect, x: number, z: number, moveX: number, moveZ: number, jump: boolean): boolean {
  const e = nearestEdge(lake, x, z);
  if (e.d > POND.climbReach) return false;
  const m = Math.hypot(moveX, moveZ);
  return jump || (m > 0.2 && (moveX * e.nx + moveZ * e.nz) / m > 0.45);
}

/** A point on open water for a wild Streetmon: at least `margin` in from the rim. */
export function waterPoint(lake: Rect, rand: () => number, margin = 6): { x: number; z: number } {
  return { x: lake.x0 + margin + rand() * (lake.x1 - lake.x0 - margin * 2), z: lake.z0 + margin + rand() * (lake.z1 - lake.z0 - margin * 2) };
}

/** The nearest point of open water (for a Streetmon that ended up on the bank). */
export function nearestWater(lake: Rect, x: number, z: number, margin = 3): { x: number; z: number } {
  return { x: Math.min(lake.x1 - margin, Math.max(lake.x0 + margin, x)), z: Math.min(lake.z1 - margin, Math.max(lake.z0 + margin, z)) };
}

// ------------------------------------------------------------------ cars

/** A car's state in the water, kept between steps. */
export interface CarWater {
  /** 0 dry .. 1 full of water (no more buoyancy). */
  flood: number;
  /** Share of the body under water last step. */
  submerged: number;
  /** The engine's drowned: no throttle until it's out and dried (a tow, in practice). */
  stalled: boolean;
  /** Seconds since it hit the water (for the splash), and since it came out. */
  wetFor: number;
  dryFor: number;
}

export function newCarWater(): CarWater {
  return { flood: 0, submerged: 0, stalled: false, wetFor: 0, dryFor: 0 };
}

/**
 * How much of a car is under water: sample heights of its underside (corners and middle) against
 * the surface, as a share of `height`. Returns per-sample shares and the average.
 */
export function submersion(samplesY: readonly number[], height: number, surface: number = POND.surface): { each: number[]; avg: number } {
  const each = samplesY.map((y) => Math.min(1, Math.max(0, (surface - y) / Math.max(0.3, height * 0.85))));
  return { each, avg: each.reduce((s, v) => s + v, 0) / Math.max(1, each.length) };
}

/** Steps a car's flooding: it fills while it's under, and the engine dies once enough is under. */
export function stepCarWater(w: CarWater, submerged: number, dt: number): void {
  w.submerged = submerged;
  if (submerged > 0.02) {
    w.wetFor += dt;
    w.dryFor = 0;
  } else {
    w.wetFor = 0;
    w.dryFor += dt;
    // Pulled out (or it drove out of the shallows): it drains and the engine catches again.
    w.flood = Math.max(0, w.flood - dt / 20);
    if (w.dryFor > POND.dryOut) w.stalled = false;
  }
  if (submerged > 0.15) w.flood = Math.min(1, w.flood + (dt / POND.floodSeconds) * (0.4 + submerged));
  if (submerged > POND.stallAt) w.stalled = true;
}

/** Upward force share of the car's weight (per unit of its average submersion), fading as it floods. */
export function carLift(w: CarWater): number {
  return POND.carBuoyancy * (1 - w.flood);
}
