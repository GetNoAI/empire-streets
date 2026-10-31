import typesJson from '../data/types.json';
import movesJson from '../data/moves.json';
import creaturesJson from '../data/creatures.json';
import itemsJson from '../data/items.json';
import humansJson from '../data/humans.json';

/**
 * Streetmon data: types and the type chart, moves, species and items, loaded from the JSON config
 * and validated at startup (a bad config throws with a message saying which entry is wrong).
 * Engine-free and unit-tested.
 */

/** The original five, plus Wire (rooftops) and Sludge (sewers). */
export type TypeId = 'gun' | 'concrete' | 'grind' | 'smoke' | 'bass' | 'wire' | 'sludge';
export const TYPE_IDS: readonly TypeId[] = ['gun', 'concrete', 'grind', 'smoke', 'bass', 'wire', 'sludge'];

export interface TypeInfo {
  id: TypeId;
  name: string;
  color: string;
  blurb: string;
}

export type StatId = 'hp' | 'attack' | 'defense' | 'speed' | 'loud';
export type StageStat = 'attack' | 'defense' | 'speed' | 'accuracy' | 'evasion';

export type MoveEffect =
  | { type: 'flinch'; chance: number }
  | { type: 'choke'; chance: number }
  | { type: 'stat'; who: 'self' | 'foe'; stat: StageStat; stages: number; chance: number }
  | { type: 'cloud' }
  | { type: 'glass' }
  | { type: 'reload' }
  | { type: 'multiHit'; min: number; max: number }
  | { type: 'ricochet' }
  | { type: 'emptyClip' }
  | { type: 'recoil'; fraction: number }
  | { type: 'heal'; fraction: number }
  | { type: 'critUp' }
  | { type: 'grindScaling'; perStage: number };

export interface MoveSpec {
  id: string;
  name: string;
  type: TypeId;
  /** 0 = status move. */
  power: number;
  /** 0-100, or null = never misses. */
  accuracy: number | null;
  target: 'foe' | 'allFoes' | 'self';
  priority?: number;
  /** Rounds used (Gun-type users only). */
  ammo?: number;
  projectile?: boolean;
  loud?: boolean;
  signature?: boolean;
  description?: string;
  effects?: MoveEffect[];
}

export type Growth = 'fast' | 'medium' | 'slow';
export type District = 'uptown' | 'midtown' | 'downtown' | 'park' | 'waterfront';
export type TimeOfDay = 'day' | 'dusk' | 'night';
/** `legendary`: never spawns on its own (legendaries.json raids bring them in). */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Temperament = 'wander' | 'flee' | 'aggro';

export const DISTRICTS: readonly District[] = ['uptown', 'midtown', 'downtown', 'park', 'waterfront'];
/** World layers a species can live in. Street is the default for every species. */
export type Biome = 'street' | 'roof' | 'sewer';
export const BIOMES: readonly Biome[] = ['street', 'roof', 'sewer'];
export const TIMES: readonly TimeOfDay[] = ['day', 'dusk', 'night'];

export type Evolution =
  | { to: string; method: 'level'; level: number }
  | { to: string; method: 'item'; item: string }
  | { to: string; method: 'condition'; minLevel: number; timeOfDay?: TimeOfDay; district?: District };

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  eye: string;
}

export interface SpeciesSpec {
  id: string;
  dex: number;
  name: string;
  types: TypeId[];
  stage: number;
  line: string;
  base: Record<StatId, number>;
  ammo?: number;
  growth: Growth;
  tier: number;
  /** A legendary (raids only, see legendaries.json). */
  legendary?: boolean;
  catchRate: number;
  learnset: Array<[number, string]>;
  evolution: Evolution[];
  spawn: {
    districts: District[];
    times: TimeOfDay[];
    rarity: Rarity;
    levels: [number, number];
    temperament: Temperament;
    /** Layers it spawns in (default ["street"]). */
    biomes?: Biome[];
    /** Spawn weight multiplier per layer (default 1). */
    biomeWeight?: Partial<Record<Biome, number>>;
    /** Rooftop placement rules. */
    roofs?: { minHeight?: number; maxHeight?: number; near?: string[] };
    /** Sewer placement rules. */
    sewer?: { zones?: Array<'tunnel' | 'chamber' | 'hub' | 'deadEnd'>; nearHazard?: 'sludge' | 'steam' | 'channel' };
  };
  /** weightKg: used when cars hit it (and shown in the dex). */
  model: { height: number; weightKg?: number; palette: Palette };
  description: string;
  /** People (passers-by, police) who can be fought but not caught; not in the dex. */
  human?: boolean;
}

export interface ItemSpec {
  id: string;
  name: string;
  kind: 'evolution' | 'capture' | 'heal' | 'field';
  price: number;
  description: string;
  [extra: string]: unknown;
}

/** Capture item (Cuffs, Crate, Net). */
export interface CaptureItem extends ItemSpec {
  kind: 'capture';
  catchMult: number;
  /** Extra multiplier against matching targets (by type and/or base Speed). */
  bonus?: { types?: TypeId[]; minSpeed?: number; maxSpeed?: number; mult: number };
  model?: string;
}

export interface TypeMechanics {
  gun: { firstShotMultiplier: number; reloadTakesTurn: boolean; loudRevealBonus: number };
  concrete: { projectileBlock: number; brokenGlassDamage: number };
  grind: { attackStagePerSurvivedTurn: number; maxStages: number };
  smoke: { cloudAccuracy: number; cloudTurns: number; chokeDamage: number };
  bass: { spreadMultiplier: number };
}

export interface GameData {
  types: TypeInfo[];
  chart: Record<TypeId, Record<TypeId, number>>;
  mechanics: TypeMechanics;
  moves: Map<string, MoveSpec>;
  species: Map<string, SpeciesSpec>;
  items: Map<string, ItemSpec>;
}

const fail = (msg: string): never => {
  throw new Error(`Streetmon config: ${msg}`);
};

const isType = (t: unknown): t is TypeId => TYPE_IDS.includes(t as TypeId);
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validates raw config and builds lookup tables. Exposed for tests (bad configs must be rejected). */
export function parseData(
  rawTypes: { types: unknown[]; chart: Record<string, Record<string, number>>; mechanics: unknown },
  rawMoves: { moves: unknown[] },
  rawSpecies: { species: unknown[] },
  rawItems: { items: unknown[] },
): GameData {
  // Types and chart: every attacker x defender pair must be present.
  const types = rawTypes.types as TypeInfo[];
  for (const id of TYPE_IDS) if (!types.some((t) => t.id === id)) fail(`type "${id}" is missing`);
  for (const t of types) if (!isType(t.id)) fail(`unknown type "${t.id}"`);
  const chart = {} as Record<TypeId, Record<TypeId, number>>;
  for (const a of TYPE_IDS) {
    const row = rawTypes.chart[a];
    if (!row) fail(`chart row "${a}" is missing`);
    chart[a] = {} as Record<TypeId, number>;
    for (const d of TYPE_IDS) {
      const v = row[d] ?? 1;
      if (!isNum(v) || v < 0 || v > 4) fail(`chart ${a} -> ${d} must be a number 0-4`);
      chart[a][d] = v;
    }
    for (const k of Object.keys(row)) if (!isType(k)) fail(`chart ${a} has unknown defender "${k}"`);
  }

  // Moves.
  const moves = new Map<string, MoveSpec>();
  for (const raw of rawMoves.moves) {
    const m = raw as MoveSpec;
    if (!m.id || moves.has(m.id)) fail(`move id "${m.id}" missing or duplicated`);
    if (!m.name) fail(`move ${m.id}: name missing`);
    if (!isType(m.type)) fail(`move ${m.id}: unknown type "${m.type}"`);
    if (!isNum(m.power) || m.power < 0) fail(`move ${m.id}: power must be >= 0`);
    if (m.accuracy !== null && (!isNum(m.accuracy) || m.accuracy <= 0 || m.accuracy > 100)) fail(`move ${m.id}: accuracy must be 1-100 or null`);
    if (!['foe', 'allFoes', 'self'].includes(m.target)) fail(`move ${m.id}: bad target "${m.target}"`);
    for (const e of m.effects ?? []) {
      if ('chance' in e && (!isNum(e.chance) || e.chance < 0 || e.chance > 1)) fail(`move ${m.id}: effect chance must be 0-1`);
      if (e.type === 'multiHit' && !(e.min >= 1 && e.max >= e.min)) fail(`move ${m.id}: multiHit needs 1 <= min <= max`);
    }
    moves.set(m.id, m);
  }

  // Items.
  const items = new Map<string, ItemSpec>();
  for (const raw of rawItems.items) {
    const it = raw as ItemSpec;
    if (!it.id || items.has(it.id)) fail(`item id "${it.id}" missing or duplicated`);
    if (!['evolution', 'capture', 'heal', 'field'].includes(it.kind)) fail(`item ${it.id}: kind must be evolution, capture, heal or field`);
    if (it.kind === 'capture') {
      const c = it as unknown as CaptureItem;
      if (!isNum(c.catchMult) || c.catchMult <= 0) fail(`item ${it.id}: capture items need catchMult > 0`);
      if (c.bonus && !(isNum(c.bonus.mult) && c.bonus.mult > 0)) fail(`item ${it.id}: bonus.mult must be > 0`);
      for (const t of c.bonus?.types ?? []) if (!isType(t)) fail(`item ${it.id}: bonus type "${t}" unknown`);
    }
    items.set(it.id, it);
  }

  // Species.
  const species = new Map<string, SpeciesSpec>();
  const dexSeen = new Set<number>();
  for (const raw of rawSpecies.species) {
    const s = raw as SpeciesSpec;
    const where = `species ${s.id ?? '?'}`;
    if (!s.id || species.has(s.id)) fail(`species id "${s.id}" missing or duplicated`);
    if (!/^[a-z0-9]+$/.test(s.id)) fail(`${where}: id must be lowercase letters/digits (it names the model file)`);
    if (!isNum(s.dex) || dexSeen.has(s.dex)) fail(`${where}: dex number missing or duplicated`);
    dexSeen.add(s.dex);
    if (!Array.isArray(s.types) || s.types.length < 1 || s.types.length > 2) fail(`${where}: needs 1 or 2 types`);
    for (const t of s.types) if (!isType(t)) fail(`${where}: unknown type "${t}"`);
    if (s.types.length === 2 && s.types[0] === s.types[1]) fail(`${where}: duplicate type`);
    for (const k of ['hp', 'attack', 'defense', 'speed', 'loud'] as StatId[]) {
      if (!isNum(s.base?.[k]) || s.base[k] < 1 || s.base[k] > 255) fail(`${where}: base.${k} must be 1-255`);
    }
    if (s.types.includes('gun') && !(isNum(s.ammo) && s.ammo >= 1)) fail(`${where}: Gun types need an ammo (magazine) size`);
    if (!['fast', 'medium', 'slow'].includes(s.growth)) fail(`${where}: growth must be fast, medium or slow`);
    if (!isNum(s.tier) || s.tier < 1 || s.tier > 3) fail(`${where}: tier must be 1-3`);
    if (!isNum(s.catchRate) || s.catchRate < 1 || s.catchRate > 255) fail(`${where}: catchRate must be 1-255`);
    if (!Array.isArray(s.learnset) || !s.learnset.some(([l]) => l === 1)) fail(`${where}: learnset needs at least one level-1 move`);
    for (const [lvl, mid] of s.learnset) {
      if (!isNum(lvl) || lvl < 1 || lvl > 100) fail(`${where}: learnset level ${lvl} out of range`);
      if (!moves.has(mid)) fail(`${where}: learnset move "${mid}" doesn't exist`);
    }
    if (s.types.includes('gun') && !s.learnset.some(([, m]) => m === 'reload')) fail(`${where}: Gun types must be able to Reload`);
    const sp = s.spawn;
    if (!sp) fail(`${where}: spawn missing`);
    for (const d of sp.districts) if (!DISTRICTS.includes(d)) fail(`${where}: unknown district "${d}"`);
    for (const t of sp.times) if (!TIMES.includes(t)) fail(`${where}: unknown time "${t}"`);
    if (!['common', 'uncommon', 'rare', 'legendary'].includes(sp.rarity)) fail(`${where}: bad rarity`);
    if ((sp.rarity === 'legendary') !== !!s.legendary) fail(`${where}: legendary species (and only they) have rarity "legendary"`);
    if (!(sp.levels[0] >= 1 && sp.levels[1] >= sp.levels[0] && sp.levels[1] <= 100)) fail(`${where}: spawn levels out of range`);
    if (!['wander', 'flee', 'aggro'].includes(sp.temperament)) fail(`${where}: bad temperament`);
    if (sp.biomes !== undefined && (!Array.isArray(sp.biomes) || !sp.biomes.length)) fail(`${where}: spawn.biomes must be a non-empty list`);
    for (const b of sp.biomes ?? []) if (!BIOMES.includes(b)) fail(`${where}: unknown biome "${b}"`);
    for (const [b, w] of Object.entries(sp.biomeWeight ?? {})) {
      if (!BIOMES.includes(b as Biome)) fail(`${where}: biomeWeight has unknown biome "${b}"`);
      if (!isNum(w) || w < 0 || w > 10) fail(`${where}: biomeWeight.${b} must be 0-10`);
    }
    const pal = s.model?.palette;
    if (!pal) fail(`${where}: model.palette missing`);
    for (const k of ['primary', 'secondary', 'accent', 'eye'] as const) if (!HEX.test(pal[k])) fail(`${where}: palette.${k} must be #rrggbb`);
    if (!isNum(s.model.height) || s.model.height < 0.2 || s.model.height > 4) fail(`${where}: model.height out of range`);
    if (s.model.weightKg !== undefined && (!isNum(s.model.weightKg) || s.model.weightKg < 0.5 || s.model.weightKg > 2000)) fail(`${where}: model.weightKg out of range (0.5-2000)`);
    species.set(s.id, s);
  }
  // Evolutions point at real species and items.
  for (const s of species.values()) {
    for (const e of s.evolution) {
      if (!species.has(e.to)) fail(`species ${s.id}: evolves into unknown "${e.to}"`);
      if (e.method === 'level' && !(e.level >= 2 && e.level <= 100)) fail(`species ${s.id}: evolution level out of range`);
      if (e.method === 'item' && !items.has(e.item)) fail(`species ${s.id}: evolution item "${e.item}" doesn't exist`);
      if (e.method === 'condition') {
        if (!(e.minLevel >= 1)) fail(`species ${s.id}: condition evolution needs minLevel`);
        if (e.timeOfDay && !TIMES.includes(e.timeOfDay)) fail(`species ${s.id}: bad evolution timeOfDay`);
        if (e.district && !DISTRICTS.includes(e.district)) fail(`species ${s.id}: bad evolution district`);
      }
    }
  }
  return { types, chart, mechanics: rawTypes.mechanics as TypeMechanics, moves, species, items };
}

export const DATA: GameData = parseData(
  typesJson as unknown as Parameters<typeof parseData>[0],
  movesJson as unknown as Parameters<typeof parseData>[1],
  { species: [...creaturesJson.species, ...humansJson.species] } as unknown as Parameters<typeof parseData>[2],
  itemsJson as unknown as Parameters<typeof parseData>[3],
);

export function species(id: string): SpeciesSpec {
  return DATA.species.get(id) ?? fail(`unknown species "${id}"`);
}

export function move(id: string): MoveSpec {
  return DATA.moves.get(id) ?? fail(`unknown move "${id}"`);
}

export function typeInfo(id: TypeId): TypeInfo {
  return DATA.types.find((t) => t.id === id)!;
}

/** Damage multiplier of an attack type against a (possibly dual-typed) defender: entries multiply. */
export function typeMultiplier(attack: TypeId, defender: readonly TypeId[], chart = DATA.chart): number {
  let m = 1;
  for (const d of defender) m *= chart[attack][d];
  return m;
}

/** Plain-language effectiveness for battle text. */
export function effectivenessText(mult: number): string {
  if (mult === 0) return 'It has no effect.';
  if (mult >= 4) return "It's devastating!";
  if (mult > 1) return "It's super effective!";
  if (mult <= 0.25) return 'It barely does anything...';
  if (mult < 1) return "It's not very effective...";
  return '';
}

export const ALL_SPECIES = (): SpeciesSpec[] => [...DATA.species.values()].filter((s) => !s.human).sort((a, b) => a.dex - b.dex);

export function item(id: string): ItemSpec {
  return DATA.items.get(id) ?? fail(`unknown item "${id}"`);
}

export function captureItems(): CaptureItem[] {
  return [...DATA.items.values()].filter((i): i is CaptureItem => i.kind === 'capture');
}

/** Layers a species lives in (street unless it says otherwise). */
export function speciesBiomes(s: SpeciesSpec): readonly Biome[] {
  return s.spawn.biomes ?? ['street'];
}
