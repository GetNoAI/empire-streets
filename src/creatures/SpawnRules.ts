import { CITY, rectContains, type CityLayout } from '../world/CityLayout';
import { ALL_SPECIES, speciesBiomes, type Biome, type District, type Rarity, type SpeciesSpec, type TimeOfDay } from './Data';
import { SHINY_CHANCE } from './Creature';

/**
 * Wild Streetmon spawn rules (engine-free, unit-tested): which district a point is in, which
 * species can appear there at this time of day, how rare each is, density caps, and how far a
 * creature notices you (its Loud stat) and how far away you can spot it.
 */

export const SPAWN = {
  /** Max wild creatures around the player at once. */
  maxTotal: 24,
  /** Max wild creatures per district in range (so one district doesn't fill the cap). */
  maxPerDistrict: 16,
  /** Spawn ring around the player (metres). Spawns happen out of the camera's view. */
  minDist: 40,
  maxDist: 105,
  /** Removed when this far away, or out of view and farther than `hiddenDespawnDist` for `hiddenDespawnTime` s. */
  despawnDist: 170,
  hiddenDespawnDist: 115,
  hiddenDespawnTime: 6,
  /** Seconds between spawn attempts. */
  interval: 0.55,
  /** Rarity weights. */
  rarityWeight: { common: 60, uncommon: 25, rare: 7, legendary: 0 } as Record<Rarity, number>,
  /** Night spawns slightly more (and more aggressive creatures come out). */
  nightCapBonus: 6,
  /** Rooftops and sewers have their own caps (only that layer spawns while you're in it). */
  layerCaps: { roof: { max: 8, nightBonus: 0 }, sewer: { max: 14, nightBonus: 4 }, pond: { max: 5, nightBonus: 1 } },
  shinyChance: SHINY_CHANCE,
  /**
   * Home turf: a species' first listed district is its home; elsewhere on its list it only turns
   * up as the odd stray (this share of its home weight). So each part of the city has its own
   * Streetmon, with a few visitors from next door.
   */
  strayWeight: 0.2,
  /** Districts where aggressive street Streetmon will actually come for you (roofs and sewers always). */
  hostileDistricts: ['park'] as District[],
};

/** Will an aggressive Streetmon at this spot come for you? (Elsewhere it keeps to itself unless provoked.) */
/**
 * Streetmon that fly (birds, moths, drifting smoke and fog). `cruise`: the height they wander at
 * (metres above the ground), `high`: how high they climb to get away, `soar`: some ride the
 * thermals well above the street (the sky population), up there out of reach until you come close.
 */
export const FLIGHT: Readonly<Record<string, { cruise: number; high: number; soar: boolean }>> = {
  longshot: { cruise: 2.5, high: 14, soar: true },
  overwatch: { cruise: 3.5, high: 18, soar: true },
  gullgrifter: { cruise: 3, high: 16, soar: true },
  antennaroc: { cruise: 3.5, high: 18, soar: true },
  neonmoth: { cruise: 1.8, high: 9, soar: false },
  marqueen: { cruise: 2.4, high: 11, soar: false },
  exhaustfume: { cruise: 1.2, high: 7, soar: false },
  hazeling: { cruise: 1.2, high: 6, soar: false },
  fogbank: { cruise: 1.5, high: 8, soar: false },
  backfire: { cruise: 1.4, high: 8, soar: false },
};

export const SKY = {
  /** Soaring Streetmon at once, their height band, and how close you get before they come down. */
  max: 4,
  alt: [18, 30] as [number, number],
  descendAt: 22,
  /** Climb and descent speeds (m/s); a frightened one climbs faster. */
  climb: 2.2,
  climbFlee: 4.5,
  /** Above this a flyer is out of reach: no battles, throws or car hits. */
  reach: 3.5,
};

/**
 * Height a flyer wants to be at for what it's doing: hovering low when it's watching you or in a
 * fight, bobbing about its cruise height wandering, climbing high to get away, and on the ground
 * when it's down. `t`: seconds (for the bob), `soar`: its soaring height (0 = not soaring).
 */
export function flightTarget(id: string, state: string, t: number, soar = 0): number {
  const f = FLIGHT[id];
  if (!f) return 0;
  switch (state) {
    case 'fainted':
    case 'knocked':
      return 0;
    case 'engaged':
      return Math.min(0.9, f.cruise * 0.4);
    case 'flee':
      return f.high;
    case 'approach':
    case 'attack':
      return Math.min(1.4, f.cruise);
    case 'idle':
    case 'watch':
      return soar || Math.max(0.5, f.cruise * 0.5 + 0.3 * Math.sin(t * 0.9));
    default:
      return soar || f.cruise * (0.8 + 0.35 * Math.sin(t * 0.45));
  }
}

/**
 * The deep sewer levels (2 and 3): every species of the layer from any district, with the odds
 * turned toward the rare ones the deeper you go (commons thin out, rares multiply).
 */
export function deepTable(time: TimeOfDay, level: number, biome: Biome = 'sewer', species: SpeciesSpec[] = ALL_SPECIES()): SpawnOption[] {
  const tilt: Record<string, number> = { common: 1 / level, uncommon: 1 + (level - 1) * 0.8, rare: 1 + (level - 1) * 2.5, legendary: 0 };
  const out: SpawnOption[] = [];
  for (const s of species) {
    if (!speciesBiomes(s).includes(biome) || !s.spawn.districts.length) continue;
    if (s.spawn.times.length && !s.spawn.times.includes(time) && level < 3) continue;
    const w = SPAWN.rarityWeight[s.spawn.rarity] * (tilt[s.spawn.rarity] ?? 1) * (s.spawn.biomeWeight?.[biome] ?? 1);
    if (w > 0) out.push({ spec: s, weight: w });
  }
  return out;
}

/** Levels added to wild Streetmon on a deep sewer level. */
export function deepLevelBonus(level: number): number {
  return Math.max(0, level - 1) * 9;
}

export function hostileAt(biome: Biome, district: District): boolean {
  return biome !== 'street' || SPAWN.hostileDistricts.includes(district);
}

/** District at a point. Uptown is the north (small z), downtown the far south (large z). */
export function districtAt(layout: CityLayout, x: number, z: number): District {
  if (rectContains(layout.park, x, z)) return 'park';
  const L = layout.land;
  // Waterfront: the promenade strip and the outer edge blocks along the rivers.
  const edge = Math.min(x - L.x0, L.x1 - x, z - L.z0, L.z1 - z);
  if (edge < CITY.promenade + 12) return 'waterfront';
  const f = (z - L.z0) / (L.z1 - L.z0);
  if (f < 0.42) return 'uptown';
  if (f < 0.78) return 'midtown';
  return 'downtown';
}

export interface SpawnOption {
  spec: SpeciesSpec;
  weight: number;
}

/**
 * Species that can appear in a layer (street, roof or sewer) of a district at a time of day, with
 * their spawn weights. Roofs and sewer cells count as the district above them. Species with no
 * `spawn.biomes` live on the street only, so street tables are exactly what they were before biomes.
 */
export function spawnTable(district: District, time: TimeOfDay, biome: Biome = 'street', species: SpeciesSpec[] = ALL_SPECIES()): SpawnOption[] {
  const out: SpawnOption[] = [];
  for (const s of species) {
    if (!speciesBiomes(s).includes(biome)) continue;
    if (!s.spawn.districts.includes(district) || !s.spawn.times.includes(time)) continue;
    // (Roofs and sewers are their own areas already: the home rule is for the street districts.)
    const home = biome !== 'street' || s.spawn.districts[0] === district ? 1 : SPAWN.strayWeight;
    const w = SPAWN.rarityWeight[s.spawn.rarity] * (s.spawn.biomeWeight?.[biome] ?? 1) * home;
    if (w > 0) out.push({ spec: s, weight: w });
  }
  return out;
}

/**
 * The sky over a district: every soaring flyer can pass over anywhere (birds don't keep to the
 * blocks), most often over its home district and at its usual hours, never a legendary.
 */
export function skyTable(district: District, time: TimeOfDay, species: SpeciesSpec[] = ALL_SPECIES()): SpawnOption[] {
  const out: SpawnOption[] = [];
  for (const s of species) {
    if (!FLIGHT[s.id]?.soar || s.spawn.rarity === 'legendary' || !s.spawn.districts.length) continue;
    const home = s.spawn.districts.includes(district) ? 1 : 0.35;
    const hours = !s.spawn.times.length || s.spawn.times.includes(time) ? 1 : 0.25;
    const w = SPAWN.rarityWeight[s.spawn.rarity] * home * hours;
    if (w > 0) out.push({ spec: s, weight: w });
  }
  return out;
}

/** Weighted pick; `r` in [0, 1). */
export function pickSpecies(table: SpawnOption[], r: number): SpeciesSpec | null {
  const total = table.reduce((s, o) => s + o.weight, 0);
  if (total <= 0) return null;
  let x = r * total;
  for (const o of table) {
    x -= o.weight;
    if (x < 0) return o.spec;
  }
  return table[table.length - 1].spec;
}

/**
 * The city gets tougher as your name grows: wild Streetmon gain this many levels for each act of the
 * campaign you've finished (index = acts completed), so there's always something worth fighting
 * at your level. Before the first act is done, wild ones on the street never outlevel your
 * strongest Streetmon (the first fights are fair ones).
 */
export const STORY_LEVEL_BONUS: readonly number[] = [0, 3, 6, 10, 14, 16];

export function storyLevel(level: number, actsDone: number, strongest: number, maxLevel = 70): number {
  const lv = level + (STORY_LEVEL_BONUS[Math.max(0, Math.min(STORY_LEVEL_BONUS.length - 1, actsDone))] ?? 0);
  const capped = actsDone <= 0 && strongest > 0 ? Math.min(lv, strongest) : lv;
  return Math.max(1, Math.min(maxLevel, capped));
}

/**
 * Before Act 1 is done, species that only live at levels well above your team (a level-28
 * Overwatch, say) stay away, rather than turning up shrunk to your level.
 */
export function storyAllows(spec: SpeciesSpec, actsDone: number, strongest: number): boolean {
  return actsDone > 0 || strongest <= 0 || spec.spawn.levels[0] <= strongest + 3;
}

export function rollLevel(spec: SpeciesSpec, r: number): number {
  const [a, b] = spec.spawn.levels;
  return a + Math.floor(r * (b - a + 1));
}

export function capFor(time: TimeOfDay, biome: Biome = 'street'): number {
  if (biome !== 'street') {
    const c = SPAWN.layerCaps[biome];
    return c.max + (time === 'night' ? c.nightBonus : 0);
  }
  return SPAWN.maxTotal + (time === 'night' ? SPAWN.nightCapBonus : 0);
}

export type Stealth = 'walk' | 'normal' | 'sprint' | 'car';

/**
 * How close the player has to get before a wild creature notices them. Loud creatures are
 * jumpy and alert (they notice you from farther); walking slowly halves it, sprinting or driving
 * makes it larger.
 */
export function detectionRadius(loud: number, how: Stealth): number {
  const base = 6 + loud * 0.16;
  const k = how === 'walk' ? 0.55 : how === 'sprint' ? 1.5 : how === 'car' ? 1.8 : 1;
  return base * k;
}

/** How far away the player can spot a creature (minimap marker): loud ones give themselves away. */
export function revealRadius(loud: number): number {
  return 22 + loud * 0.55;
}

/** Movement speed (m/s) from the Speed base stat. */
export function moveSpeed(speedStat: number, running: boolean): number {
  const v = 1.1 + speedStat * 0.035;
  return running ? v * 2.3 : v;
}
