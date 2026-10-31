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
  layerCaps: { roof: { max: 8, nightBonus: 0 }, sewer: { max: 14, nightBonus: 4 } },
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
