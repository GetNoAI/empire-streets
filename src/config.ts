/** Global tunables. Distances in metres, speeds in m/s, masses in kg. */

export const PHYSICS = {
  step: 1 / 60,
  maxSubSteps: 5,
  gravity: -9.81,
} as const;

/** Collision group bits (Rapier interaction groups use 16-bit memberships/filters). */
export const GROUP = {
  WORLD: 0x0001,
  CAR: 0x0002,
  PLAYER: 0x0004,
  PED: 0x0008,
} as const;

/** Packs Rapier interaction groups: memberships in the high 16 bits, filter in the low 16. */
export const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

export const PLAYER = {
  radius: 0.32,
  halfHeight: 0.55,
  walkSpeed: 2.4,
  jogSpeed: 4.6,
  sprintSpeed: 7.2,
  jumpSpeed: 4.0,
  turnRate: 12,
  maxHealth: 100,
  enterRange: 3.2,
} as const;

export const CAMERA = {
  footDistance: 4.2,
  footHeight: 1.55,
  carDistance: 7.0,
  carHeight: 2.3,
  baseFov: 62,
  maxFovBoost: 16,
  mouseSensitivity: 0.0024,
  near: 0.1,
  far: 2600,
} as const;

export const WORLD = {
  /** Radius around the player where parked cars are kept spawned. */
  carStreamRadius: 170,
  maxParkedCars: 46,
  fallDeathY: -3,
} as const;

export const GRAPHICS = {
  shadowMapSize: 2048,
  shadowExtent: 120,
  maxPixelRatio: 2,
  /** Selective bloom on glowing creature parts (eyes, cores, neon trims; emissive strength 3.0+). */
  bloom: { enabled: true, strength: 0.9, radius: 0.45, threshold: 0.25 },
} as const;

/** Streetmon battles. */
/**
 * How much punishment cars take. Every hit on a car is multiplied by its kind's factor (and divided
 * by the car's armour mod), so the specs' health numbers stay as they were. Crashes under
 * `crashThreshold` (the sudden change in speed, m/s) do nothing: kerbs, scrapes and nudges in
 * traffic are free. At zero health a car burns for `burnSeconds` before it explodes.
 */
export const CAR_DURABILITY = {
  crashThreshold: 3.4,
  impact: 0.45,
  bullet: 0.5,
  fire: 0.55,
  explosive: 0.7,
  /** Scripted (a quest wreck, a tank flattening it): as given. */
  raw: 1,
  burnSeconds: 9,
} as const;

export type CarDamageKind = 'impact' | 'bullet' | 'fire' | 'explosive' | 'raw';

/** Damage a car actually takes from a hit (engine-free; unit-tested). */
export function carDamageTaken(amount: number, kind: CarDamageKind, armor = 1): number {
  if (!(amount > 0)) return 0;
  return (amount * CAR_DURABILITY[kind]) / Math.max(0.1, armor);
}

export const BATTLE = {
  /** 'turn': classic turn-based menu battles. 'realtime': skirmishes in the street with move hotkeys. */
  mode: 'realtime' as 'turn' | 'realtime',
  /** Real-time: seconds per "round" (Grind stacking, choking, clouds tick once per round). */
  realtimeRound: 4.5,
  /** Real-time: action cooldown range (seconds); faster creatures act more often. */
  realtimeCooldown: [2.4, 4] as const,
  /** Real-time: how long the event playback pauses compared with turn-based (1 = the same). */
  realtimePlayback: 0.6,
  /** Real-time: seconds your Streetmon waits for an order before acting on its own. */
  realtimeIdle: 3,
  /** Starter creatures offered on a new game (level). */
  starters: ['cinderblock', 'strapback', 'subsonic'] as const,
  starterLevel: 5,
  /** Clinic fee: base + per fainted creature. */
  clinicFee: { base: 20, perFainted: 15 },
  /** Blacking out (all creatures fainted, not wanted): clinic respawn fee. */
  blackoutFee: 60,
  /** Capture items in the bag on a new game: none. Mama Rust hands out cuffs (Act 1, "Mama's Welcome"). */
  starterItems: [] as Array<[string, number]>,
  /** Cash for beating a wild Streetmon: this times its level. */
  wildWinPerLevel: 8,
};
