import weaponsJson from '../data/weapons.json';

export type WeaponKind = 'melee' | 'hitscan' | 'throw';

/** One weapon from data/weapons.json (see the comment there for units). */
export interface WeaponSpec {
  id: string;
  name: string;
  slot: number;
  kind: WeaponKind;
  damage: number;
  fireInterval: number;
  noiseRadius: number;
  price: number;
  // melee
  range?: number;
  arc?: number;
  knockback?: number;
  // ranged
  pellets?: number;
  magSize?: number;
  reserveMax?: number;
  startReserve?: number;
  automatic?: boolean;
  reloadTime?: number;
  reloadPerRound?: boolean;
  boltAction?: boolean;
  spread?: number;
  aimSpread?: number;
  bloomPerShot?: number;
  recoil?: number;
  falloffStart?: number;
  zoomFov?: number;
  ammoPrice?: number;
  ammoPack?: number;
  pickupCount?: number;
  copDrop?: boolean;
  // thrown
  throwSpeed?: number;
  fireRadius?: number;
  fireDuration?: number;
}

const REQUIRED: Record<WeaponKind, (keyof WeaponSpec)[]> = {
  melee: ['range', 'arc'],
  hitscan: ['magSize', 'reserveMax', 'reloadTime', 'spread', 'range'],
  throw: ['magSize', 'reserveMax', 'throwSpeed', 'fireRadius', 'fireDuration'],
};

/** Parses and sanity-checks the weapon table so a typo in the JSON fails loudly at startup. */
export function parseWeapons(raw: unknown): WeaponSpec[] {
  const list = (raw as { weapons?: unknown }).weapons;
  if (!Array.isArray(list)) throw new Error('weapons.json: "weapons" must be an array');
  const ids = new Set<string>();
  return list.map((w: WeaponSpec, i) => {
    const where = `weapons.json[${i}] (${w.id ?? '?'})`;
    if (typeof w.id !== 'string' || !w.id) throw new Error(`${where}: missing id`);
    if (ids.has(w.id)) throw new Error(`${where}: duplicate id`);
    ids.add(w.id);
    if (!['melee', 'hitscan', 'throw'].includes(w.kind)) throw new Error(`${where}: bad kind "${w.kind}"`);
    for (const k of ['damage', 'fireInterval', 'noiseRadius', 'price', 'slot'] as const) {
      if (typeof w[k] !== 'number' || !Number.isFinite(w[k])) throw new Error(`${where}: "${k}" must be a number`);
    }
    for (const k of REQUIRED[w.kind]) {
      if (typeof w[k] !== 'number') throw new Error(`${where}: "${k}" is required for ${w.kind} weapons`);
    }
    return { pellets: 1, ...w };
  });
}

export const WEAPONS: readonly WeaponSpec[] = parseWeapons(weaponsJson);
const byId = new Map(WEAPONS.map((w) => [w.id, w]));

export function weapon(id: string): WeaponSpec {
  const w = byId.get(id);
  if (!w) throw new Error(`Unknown weapon "${id}"`);
  return w;
}

export function isRanged(w: WeaponSpec): boolean {
  return w.kind !== 'melee';
}
