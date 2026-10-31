import type { HumanoidLook } from './Humanoid';

/**
 * The player's look (the wardrobe): the choices on offer, presets, a random pick, and cleaning up
 * a saved look. Engine-free, unit-tested; the Humanoid builds the figure from it.
 */

export type PlayerLook = Required<Pick<HumanoidLook, 'skin' | 'hair' | 'top' | 'legs' | 'shoes' | 'scale' | 'build' | 'hairStyle' | 'skirt' | 'hat' | 'glasses' | 'facialHair'>> &
  Pick<HumanoidLook, 'hatColor' | 'jacket'>;

export const LOOK_OPTIONS = {
  build: [
    ['m', 'Masculine'],
    ['f', 'Feminine'],
  ],
  skin: ['#f3d2b3', '#e8b68c', '#d29a6a', '#b07a4f', '#8d5a3b', '#6b4229', '#4a2c1b'],
  hairStyle: [
    ['short', 'Short'],
    ['long', 'Long'],
    ['bun', 'Bun'],
    ['ponytail', 'Ponytail'],
    ['bald', 'Shaved'],
  ],
  hair: ['#120d0a', '#3a2618', '#6b4426', '#a77b48', '#e2c68c', '#b4492c', '#8a8a8a', '#e8e8e8', '#3b6fd8', '#e0559b'],
  facialHair: [
    ['none', 'None'],
    ['moustache', 'Moustache'],
    ['goatee', 'Goatee'],
    ['beard', 'Beard'],
  ],
  hat: [
    ['none', 'None'],
    ['cap', 'Cap'],
    ['beanie', 'Beanie'],
    ['fedora', 'Fedora'],
  ],
  /** Clothes: tops, jackets, legs, hats. */
  cloth: ['#f2f2f2', '#1c1c22', '#2b3e57', '#3b6fd8', '#2e7d4f', '#b5432c', '#d32f2f', '#ff7a00', '#ffd23f', '#7a2fd3', '#e0559b', '#6b5a45', '#8a8f98', '#4a3424'],
  shoes: ['#151515', '#f2f2f2', '#6b4426', '#b5432c', '#3b6fd8', '#ffd23f'],
  /** Height scale range (1 = 1.8 m). */
  scale: [0.92, 1.08],
} as const;

export const DEFAULT_LOOK: PlayerLook = {
  skin: '#c58c64',
  hair: '#1d140e',
  top: '#2b3e57',
  legs: '#2b2b30',
  shoes: '#151515',
  scale: 1,
  build: 'm',
  hairStyle: 'short',
  skirt: false,
  hat: 'none',
  hatColor: '#1c1c22',
  glasses: false,
  facialHair: 'none',
};

/** Ready-made outfits (keep your skin, build and hair). */
export const OUTFITS: Array<{ id: string; name: string; look: Partial<PlayerLook> }> = [
  { id: 'rookie', name: 'Rookie', look: { top: '#2b3e57', legs: '#2b2b30', shoes: '#151515', jacket: undefined, hat: 'none', glasses: false, skirt: false } },
  { id: 'racer', name: 'Racer', look: { top: '#f2f2f2', legs: '#1c1c22', shoes: '#d32f2f', jacket: '#d32f2f', hat: 'cap', hatColor: '#1c1c22', glasses: true, skirt: false } },
  { id: 'mechanic', name: 'Mechanic', look: { top: '#2b3e57', legs: '#2b3e57', shoes: '#6b4426', jacket: undefined, hat: 'beanie', hatColor: '#ff7a00', glasses: false, skirt: false } },
  { id: 'heister', name: 'Heister', look: { top: '#1c1c22', legs: '#1c1c22', shoes: '#151515', jacket: '#1c1c22', hat: 'beanie', hatColor: '#1c1c22', glasses: true, skirt: false } },
  { id: 'boss', name: 'Boss', look: { top: '#f2f2f2', legs: '#1c1c22', shoes: '#151515', jacket: '#4a3424', hat: 'fedora', hatColor: '#4a3424', glasses: false } },
  { id: 'downtown', name: 'Downtown', look: { top: '#e0559b', legs: '#1c1c22', shoes: '#f2f2f2', jacket: '#1c1c22', hat: 'none', glasses: true } },
];

const HEX = /^#[0-9a-f]{6}$/i;
const ids = (list: ReadonlyArray<readonly [string, string]>): string[] => list.map(([k]) => k);

/**
 * A saved (or imported) look, cleaned up: anything missing or malformed falls back to the default,
 * so a bad save can't break the player model. Returns null when there's nothing there at all.
 */
export function sanitizeLook(raw: unknown): PlayerLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const col = (k: string, d: string): string => (typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string) : d);
  const one = <T extends string>(k: string, list: string[], d: T): T => (typeof o[k] === 'string' && list.includes(o[k] as string) ? (o[k] as T) : d);
  const D = DEFAULT_LOOK;
  const sc = Number(o['scale']);
  const [lo, hi] = LOOK_OPTIONS.scale;
  const look: PlayerLook = {
    skin: col('skin', D.skin),
    hair: col('hair', D.hair),
    top: col('top', D.top),
    legs: col('legs', D.legs),
    shoes: col('shoes', D.shoes),
    scale: Number.isFinite(sc) ? Math.round(Math.min(hi, Math.max(lo, sc)) * 100) / 100 : D.scale,
    build: one('build', ids(LOOK_OPTIONS.build), D.build),
    hairStyle: one('hairStyle', ids(LOOK_OPTIONS.hairStyle), D.hairStyle),
    skirt: o['skirt'] === true,
    hat: one('hat', ids(LOOK_OPTIONS.hat), D.hat),
    hatColor: col('hatColor', D.hatColor!),
    glasses: o['glasses'] === true,
    facialHair: one('facialHair', ids(LOOK_OPTIONS.facialHair), D.facialHair),
  };
  if (typeof o['jacket'] === 'string' && HEX.test(o['jacket'])) look.jacket = o['jacket'];
  return look;
}

/** A random but sensible look. */
export function randomPlayerLook(rand: () => number = Math.random): PlayerLook {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length) % a.length];
  const fem = rand() < 0.5;
  const outfit = pick(OUTFITS);
  const look: PlayerLook = {
    ...DEFAULT_LOOK,
    build: fem ? 'f' : 'm',
    skin: pick(LOOK_OPTIONS.skin),
    hair: pick(LOOK_OPTIONS.hair.slice(0, 7)),
    hairStyle: fem ? pick(['long', 'bun', 'ponytail', 'short'] as const) : pick(['short', 'short', 'bald', 'ponytail'] as const),
    facialHair: fem ? 'none' : pick(['none', 'none', 'moustache', 'goatee', 'beard'] as const),
    scale: Math.round((LOOK_OPTIONS.scale[0] + rand() * (LOOK_OPTIONS.scale[1] - LOOK_OPTIONS.scale[0])) * 100) / 100,
    ...outfit.look,
  };
  if (fem && rand() < 0.35) look.skirt = true;
  return sanitizeLook(look)!;
}

/** The look as the Humanoid takes it. */
export function toHumanoidLook(l: PlayerLook): HumanoidLook {
  return { ...l, jacket: l.jacket, hatColor: l.hatColor };
}
