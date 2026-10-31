/** Data-driven vehicle definitions. Real-world-ish figures; forward is local +X, up +Y, right +Z. */

export type BodyStyle = 'sedan' | 'taxi' | 'suv' | 'sports' | 'police' | 'van';

export interface VehicleSpec {
  id: string;
  name: string;
  style: BodyStyle;
  /** Body dimensions, metres. */
  length: number;
  width: number;
  height: number;
  mass: number;
  wheelBase: number;
  track: number;
  wheelRadius: number;
  /** Ground clearance under the chassis box. */
  clearance: number;
  suspensionRest: number;
  suspensionTravel: number;
  suspensionStiffness: number;
  dampingCompression: number;
  dampingRelaxation: number;
  /** Tyre grip (Rapier friction slip). */
  grip: number;
  /** Rear grip while the handbrake is held. */
  handbrakeGrip: number;
  /** Rear grip on the plateau of a drift (default: grip x 0.62). */
  driftGrip?: number;
  /** Share of the needed counter-steer added for the player in a drift (default 0.55). */
  counterSteerAssist?: number;
  /** Yaw damping strength right after a drift ends (default 2.4). */
  yawDamping?: number;
  /** Peak tractive force at the driven wheels, newtons (total). */
  engineForce: number;
  /** Braking impulse per wheel per step (Rapier units scale with the step size). */
  brakeForce: number;
  maxSpeed: number;
  reverseSpeed: number;
  /** Max steering angle at low speed, radians. */
  maxSteer: number;
  /** Fraction of steering left at top speed. */
  highSpeedSteer: number;
  drive: 'rwd' | 'fwd' | 'awd';
  health: number;
  colors: string[];
  spawnWeight: number;
  /** Number of gears for the engine sound. */
  gears: number;
}

const base = {
  clearance: 0.2,
  suspensionRest: 0.32,
  suspensionTravel: 0.22,
  suspensionStiffness: 32,
  dampingCompression: 2.6,
  dampingRelaxation: 3.2,
  grip: 1.45,
  handbrakeGrip: 0.3,
  reverseSpeed: 9,
  maxSteer: 0.6,
  highSpeedSteer: 0.25,
  gears: 5,
};

export const VEHICLES: readonly VehicleSpec[] = [
  {
    ...base,
    id: 'taxi',
    name: 'Yellow Cab',
    style: 'taxi',
    length: 5.0,
    width: 1.95,
    height: 1.5,
    mass: 1750,
    wheelBase: 2.9,
    track: 1.64,
    wheelRadius: 0.36,
    engineForce: 7600,
    brakeForce: 55,
    maxSpeed: 48,
    drive: 'rwd',
    health: 1000,
    colors: ['#f3b712'],
    spawnWeight: 0.32,
  },
  {
    ...base,
    id: 'sedan',
    name: 'Meridian Sedan',
    style: 'sedan',
    length: 4.8,
    width: 1.85,
    height: 1.45,
    mass: 1500,
    wheelBase: 2.8,
    track: 1.58,
    wheelRadius: 0.34,
    engineForce: 7200,
    brakeForce: 50,
    maxSpeed: 50,
    drive: 'fwd',
    health: 900,
    colors: ['#1f2b3a', '#8b1c1c', '#c9ccce', '#2e4d33', '#101010', '#f2f2f0', '#40506a', '#6b5a48'],
    spawnWeight: 0.36,
  },
  {
    // Your first car (Mama Rust's, Act I): a primer-grey hatch held together with tape. Never in
    // traffic (spawnWeight 0); slot a Streetmon into it and it gets better.
    ...base,
    id: 'beater',
    name: 'Rustbucket Hatch',
    style: 'sedan',
    length: 4.25,
    width: 1.76,
    height: 1.45,
    mass: 1250,
    wheelBase: 2.5,
    track: 1.5,
    wheelRadius: 0.32,
    engineForce: 5400,
    brakeForce: 42,
    maxSpeed: 41,
    drive: 'fwd',
    health: 800,
    colors: ['#7d817a'],
    spawnWeight: 0,
  },
  {
    ...base,
    id: 'suv',
    name: 'Ranger SUV',
    style: 'suv',
    length: 5.0,
    width: 2.0,
    height: 1.85,
    mass: 2300,
    wheelBase: 2.95,
    track: 1.7,
    wheelRadius: 0.4,
    clearance: 0.28,
    suspensionRest: 0.36,
    engineForce: 10500,
    brakeForce: 70,
    maxSpeed: 46,
    drive: 'awd',
    health: 1300,
    colors: ['#0e0e10', '#3a3d40', '#e8e8e6', '#4a2d24', '#22344d'],
    spawnWeight: 0.2,
  },
  {
    ...base,
    id: 'sports',
    name: 'Vortex GT',
    style: 'sports',
    length: 4.5,
    width: 1.95,
    height: 1.2,
    mass: 1400,
    wheelBase: 2.65,
    track: 1.66,
    wheelRadius: 0.35,
    clearance: 0.12,
    suspensionRest: 0.26,
    suspensionTravel: 0.15,
    suspensionStiffness: 45,
    dampingCompression: 3.2,
    dampingRelaxation: 3.8,
    grip: 1.75,
    handbrakeGrip: 0.35,
    engineForce: 12500,
    brakeForce: 62,
    maxSpeed: 78,
    maxSteer: 0.55,
    highSpeedSteer: 0.18,
    drive: 'rwd',
    health: 800,
    colors: ['#c4161c', '#f2c200', '#1565c0', '#f5f5f5', '#121212', '#ff6a00'],
    spawnWeight: 0.06,
    gears: 6,
  },
  {
    ...base,
    id: 'police',
    name: 'Police Interceptor',
    style: 'police',
    length: 5.05,
    width: 1.95,
    height: 1.5,
    mass: 1850,
    wheelBase: 2.95,
    track: 1.66,
    wheelRadius: 0.36,
    engineForce: 10500,
    brakeForce: 62,
    maxSpeed: 62,
    grip: 1.6,
    drive: 'awd',
    health: 1400,
    colors: ['#f4f4f2'],
    spawnWeight: 0.03,
  },
  {
    ...base,
    id: 'van',
    name: 'Box Van',
    style: 'van',
    length: 6.0,
    width: 2.1,
    height: 2.6,
    mass: 3200,
    wheelBase: 3.6,
    track: 1.75,
    wheelRadius: 0.4,
    clearance: 0.28,
    suspensionRest: 0.36,
    suspensionStiffness: 38,
    engineForce: 11000,
    brakeForce: 85,
    maxSpeed: 36,
    maxSteer: 0.55,
    drive: 'rwd',
    health: 1600,
    colors: ['#eeeeea', '#cfd2d4', '#2d4f7c', '#8a1f1f'],
    spawnWeight: 0.1,
    gears: 4,
  },
];

const byId = new Map(VEHICLES.map((v) => [v.id, v]));

export function getSpec(id: string): VehicleSpec {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown vehicle "${id}"`);
  return s;
}

export function randomSpec(rand: () => number = Math.random): VehicleSpec {
  const total = VEHICLES.reduce((s, v) => s + v.spawnWeight, 0);
  let r = rand() * total;
  for (const v of VEHICLES) {
    r -= v.spawnWeight;
    if (r <= 0) return v;
  }
  return VEHICLES[0];
}

/**
 * The police tank (5 stars). Not a raycast car: it's a kinematic hull that follows the avenues
 * (`src/police/Tank.ts`). Speeds in km/h and degrees per second; distances in metres.
 */
export const TANK_SPEC = {
  id: 'tank',
  kind: 'tank',
  weightClass: 'armoured',
  mass: 40000,
  /** Width, height, length. */
  size: [3.6, 2.6, 7.8] as const,
  maxSpeedKmh: 25,
  accel: 2,
  turnRateDeg: 30,
  armour: { hp: 2500, bulletMult: 0.05, explosiveMult: 1.0 },
  turret: {
    turnRateDeg: 40,
    range: 120,
    reload: 4.5,
    warn: 1.0,
    shell: { speed: 90, gravity: 4, radius: 6, playerDamage: 120, carDamage: 400, creaturePct: 0.7 },
  },
  crush: { carDps: 60, creatureImpactKmh: 60, playerDamage: 25 },
  /** Damage a car explosion does to a tank at its centre (falls off with distance). */
  carExplosionDamage: 600,
} as const;
