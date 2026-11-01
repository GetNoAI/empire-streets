/** Data-driven vehicle definitions. Real-world-ish figures; forward is local +X, up +Y, right +Z. */

export type BodyStyle = 'sedan' | 'taxi' | 'suv' | 'sports' | 'police' | 'van' | 'hatch' | 'muscle' | 'supercar' | 'pickup' | 'limo' | 'bus' | 'ambulance' | 'rally';

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
  /** Showroom price (0: not for sale). */
  price: number;
  /** Grip off the road (grass, dirt) as a share of road grip (default 0.7; rally cars keep more). */
  offroad?: number;
  /** A line about it for the showroom. */
  blurb?: string;
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
  price: 0,
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
    price: 12000,
    blurb: 'Tough, cheap and everywhere. Nobody looks twice at a cab.',
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
    price: 15000,
    blurb: 'The everyday car. Front-wheel drive, forgiving, dull.',
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
    price: 1500,
    blurb: "Mama's old hatch. Held together with tape and spite.",
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
    price: 30000,
    blurb: 'Heavy and tall, with all-wheel drive. Shoves traffic out of the way.',
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
    price: 55000,
    blurb: "Rear-wheel drive and a short wheelbase: it drifts if you ask, and sometimes when you don't.",
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
    price: 20000,
    blurb: 'Slow, huge and nearly indestructible. Carries a lot of Streetmon.',
    gears: 4,
  },
  {
    ...base,
    id: 'hatch',
    name: 'Pigeon Hatch',
    style: 'hatch',
    length: 3.9,
    width: 1.72,
    height: 1.5,
    mass: 1100,
    wheelBase: 2.45,
    track: 1.5,
    wheelRadius: 0.31,
    engineForce: 6200,
    brakeForce: 44,
    maxSpeed: 44,
    maxSteer: 0.66,
    highSpeedSteer: 0.3,
    grip: 1.5,
    drive: 'fwd',
    health: 750,
    colors: ['#e8c531', '#2f8f7a', '#d9d9d6', '#b6342c', '#3b4f87', '#f08aa8'],
    spawnWeight: 0.22,
    price: 9000,
    blurb: 'Tiny, light and turns on a dime. The best cheap car to build up.',
  },
  {
    ...base,
    id: 'muscle',
    name: 'Brawler 440',
    style: 'muscle',
    length: 5.1,
    width: 1.95,
    height: 1.35,
    mass: 1750,
    wheelBase: 2.95,
    track: 1.62,
    wheelRadius: 0.36,
    clearance: 0.16,
    suspensionRest: 0.3,
    suspensionStiffness: 36,
    engineForce: 13500,
    brakeForce: 58,
    maxSpeed: 66,
    maxSteer: 0.55,
    highSpeedSteer: 0.2,
    grip: 1.45,
    driftGrip: 0.78,
    counterSteerAssist: 0.45,
    drive: 'rwd',
    health: 1100,
    colors: ['#1c1c1e', '#8a1f1f', '#2a6b3a', '#e7e1cf', '#d98a1a', '#3a3f7a'],
    spawnWeight: 0.05,
    gears: 4,
    price: 32000,
    blurb: 'Big block up front, tail out at the back. Fast in a straight line, lively everywhere else.',
  },
  {
    ...base,
    id: 'supercar',
    name: 'Hyperion S',
    style: 'supercar',
    length: 4.6,
    width: 2.05,
    height: 1.1,
    mass: 1450,
    wheelBase: 2.7,
    track: 1.72,
    wheelRadius: 0.35,
    clearance: 0.1,
    suspensionRest: 0.22,
    suspensionTravel: 0.12,
    suspensionStiffness: 55,
    dampingCompression: 3.8,
    dampingRelaxation: 4.4,
    grip: 1.95,
    handbrakeGrip: 0.38,
    engineForce: 17500,
    brakeForce: 70,
    maxSpeed: 95,
    maxSteer: 0.5,
    highSpeedSteer: 0.16,
    drive: 'awd',
    health: 750,
    colors: ['#ff6a00', '#101014', '#1ec8ff', '#f2f2f2', '#b7ff1a', '#8b2cff'],
    spawnWeight: 0.01,
    gears: 7,
    price: 180000,
    blurb: 'All-wheel drive and more power than the road can take. Class S.',
  },
  {
    ...base,
    id: 'pickup',
    name: 'Mule Pickup',
    style: 'pickup',
    length: 5.5,
    width: 2.0,
    height: 1.85,
    mass: 2400,
    wheelBase: 3.3,
    track: 1.7,
    wheelRadius: 0.4,
    clearance: 0.3,
    suspensionRest: 0.38,
    suspensionTravel: 0.26,
    engineForce: 11500,
    brakeForce: 70,
    maxSpeed: 44,
    drive: 'awd',
    health: 1300,
    colors: ['#8a1f1f', '#1f1f22', '#e8e8e6', '#2d4f7c', '#8d6b3f'],
    spawnWeight: 0.12,
    price: 24000,
    offroad: 0.85,
    blurb: 'A work truck. Rides high, shrugs off kerbs and keeps its grip on the grass.',
  },
  {
    ...base,
    id: 'limo',
    name: 'Monarch Limo',
    style: 'limo',
    length: 7.2,
    width: 1.95,
    height: 1.5,
    mass: 2600,
    wheelBase: 4.6,
    track: 1.64,
    wheelRadius: 0.36,
    engineForce: 9000,
    brakeForce: 62,
    maxSpeed: 46,
    maxSteer: 0.5,
    highSpeedSteer: 0.22,
    drive: 'rwd',
    health: 1200,
    colors: ['#0b0b0d', '#f2f2f0', '#2a1a3a'],
    spawnWeight: 0.02,
    price: 65000,
    blurb: 'Seven metres of black glass. Turns like a barge, looks like money.',
  },
  {
    ...base,
    id: 'bus',
    name: 'City Bus',
    style: 'bus',
    length: 11,
    width: 2.5,
    height: 3.1,
    mass: 11000,
    wheelBase: 6.4,
    track: 2.05,
    wheelRadius: 0.5,
    clearance: 0.3,
    suspensionRest: 0.4,
    suspensionTravel: 0.22,
    suspensionStiffness: 40,
    dampingCompression: 3.2,
    dampingRelaxation: 3.6,
    engineForce: 30000,
    brakeForce: 160,
    maxSpeed: 28,
    maxSteer: 0.5,
    highSpeedSteer: 0.3,
    grip: 1.4,
    drive: 'rwd',
    health: 3000,
    colors: ['#2b63b8', '#e8e8e6'],
    spawnWeight: 0.04,
    gears: 4,
    price: 120000,
    blurb: 'Eleven metres of bus. Nothing on the road moves it, and it can carry a whole team.',
  },
  {
    ...base,
    id: 'ambulance',
    name: 'Medic Van',
    style: 'ambulance',
    length: 6.0,
    width: 2.1,
    height: 2.6,
    mass: 3100,
    wheelBase: 3.6,
    track: 1.75,
    wheelRadius: 0.4,
    clearance: 0.28,
    suspensionRest: 0.36,
    suspensionStiffness: 38,
    engineForce: 13500,
    brakeForce: 85,
    maxSpeed: 44,
    maxSteer: 0.55,
    drive: 'awd',
    health: 1700,
    colors: ['#f4f4f2'],
    spawnWeight: 0.02,
    gears: 4,
    price: 40000,
    blurb: 'A van with a bigger engine and a siren. Traffic gets out of its way.',
  },
  {
    ...base,
    id: 'rally',
    name: 'Dune Rally',
    style: 'rally',
    length: 4.2,
    width: 1.8,
    height: 1.5,
    mass: 1350,
    wheelBase: 2.6,
    track: 1.56,
    wheelRadius: 0.34,
    clearance: 0.26,
    suspensionRest: 0.36,
    suspensionTravel: 0.28,
    suspensionStiffness: 34,
    dampingCompression: 3,
    dampingRelaxation: 3.4,
    grip: 1.7,
    handbrakeGrip: 0.3,
    driftGrip: 1.0,
    engineForce: 11000,
    brakeForce: 56,
    maxSpeed: 60,
    maxSteer: 0.62,
    highSpeedSteer: 0.26,
    drive: 'awd',
    health: 950,
    colors: ['#1565c0', '#f2c200', '#e8e8e6', '#2f8f7a'],
    spawnWeight: 0.02,
    gears: 6,
    price: 48000,
    offroad: 0.95,
    blurb: 'Long travel, all-wheel drive and a light pod. The park is a race track to this one.',
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
