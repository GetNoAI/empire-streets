import dexJson from '../data/streetmondex.json';
import { ALL_SPECIES, BIOMES, DISTRICTS, TIMES, TYPE_IDS, speciesBiomes, typeMultiplier, type Biome, type District, type SpeciesSpec, type TimeOfDay, type TypeId } from './Data';

/**
 * Streetmondex text (engine-free, validated at startup): a category, lore lines and habitat
 * hints per species. Game numbers (stats, height, weight) stay in creatures.json.
 */

export interface HabitatHint {
  biome: Biome;
  districts?: District[];
  times?: TimeOfDay[];
  text: string;
}

export interface DexEntry {
  category: string;
  lore: string[];
  habitatHints: HabitatHint[];
}

/** What the player has done with a species: seen it, captured one, evolved one. */
export type DexState = 'unseen' | 'seen' | 'captured' | 'evolved';

const fail = (msg: string): never => {
  throw new Error(`Streetmondex: ${msg}`);
};

/** Validates dex text against the species list. Exposed for tests. */
export function parseDex(raw: { entries: Record<string, unknown> }, species: readonly SpeciesSpec[]): Map<string, DexEntry> {
  const out = new Map<string, DexEntry>();
  const ids = new Set(species.map((s) => s.id));
  for (const id of Object.keys(raw.entries)) if (!ids.has(id)) fail(`entry "${id}" has no species`);
  for (const s of species) {
    const e = raw.entries[s.id] as DexEntry | undefined;
    if (!e) fail(`species "${s.id}" has no dex entry`);
    const where = `entry ${s.id}`;
    if (typeof e!.category !== 'string' || !e!.category.trim() || e!.category.length > 24) fail(`${where}: category must be 1-24 characters`);
    if (!Array.isArray(e!.lore) || e!.lore.length < 1 || e!.lore.length > 4 || e!.lore.some((l) => typeof l !== 'string' || !l.trim())) fail(`${where}: lore must be 1-4 lines`);
    if (!Array.isArray(e!.habitatHints) || !e!.habitatHints.length) fail(`${where}: needs at least one habitat hint`);
    for (const h of e!.habitatHints) {
      if (!BIOMES.includes(h.biome)) fail(`${where}: hint biome "${h.biome}" unknown`);
      for (const d of h.districts ?? []) if (!DISTRICTS.includes(d)) fail(`${where}: hint district "${d}" unknown`);
      for (const t of h.times ?? []) if (!TIMES.includes(t)) fail(`${where}: hint time "${t}" unknown`);
      if (typeof h.text !== 'string' || !h.text.trim()) fail(`${where}: hint text missing`);
    }
    out.set(s.id, e!);
  }
  return out;
}

let cache: Map<string, DexEntry> | null = null;

export function dexEntries(): Map<string, DexEntry> {
  if (!cache) cache = parseDex(dexJson as { entries: Record<string, unknown> }, ALL_SPECIES());
  return cache;
}

export function dexEntry(id: string): DexEntry {
  const e = dexEntries().get(id);
  if (!e) throw new Error(`Streetmondex: no entry for "${id}"`);
  return e;
}

// ------------------------------------------------------------------ Streetmondex screen logic

export interface DexProgress {
  seen: ReadonlySet<string>;
  caught: ReadonlySet<string>;
  /** Species you've evolved yourself (both the one before and the one after). */
  evolved: ReadonlySet<string>;
}

export function dexState(id: string, p: DexProgress): DexState {
  if (p.evolved.has(id) && p.caught.has(id)) return 'evolved';
  if (p.caught.has(id)) return 'captured';
  if (p.seen.has(id)) return 'seen';
  return 'unseen';
}

/** States at or above another (an evolved species also counts as captured and seen). */
export function reached(state: DexState, at: Exclude<DexState, 'unseen'>): boolean {
  const order: DexState[] = ['unseen', 'seen', 'captured', 'evolved'];
  return order.indexOf(state) >= order.indexOf(at);
}

/** The species' evolution line, split into stages (stage 1 is the base form). */
export function evolutionLine(id: string, list: readonly SpeciesSpec[] = ALL_SPECIES()): string[][] {
  const parent = (x: string): string | undefined => list.find((s) => s.evolution.some((e) => e.to === x))?.id;
  let root = id;
  for (let i = 0; i < 10; i++) {
    const p = parent(root);
    if (!p) break;
    root = p;
  }
  const stages: string[][] = [[root]];
  for (let i = 0; i < 10; i++) {
    const next = stages[stages.length - 1].flatMap((x) => list.find((s) => s.id === x)?.evolution.map((e) => e.to) ?? []);
    if (!next.length) break;
    stages.push([...new Set(next)]);
  }
  return stages;
}

/** "Stage 2 of 3" for a species. */
export function stageOf(id: string, list: readonly SpeciesSpec[] = ALL_SPECIES()): { stage: number; of: number } {
  const line = evolutionLine(id, list);
  return { stage: line.findIndex((st) => st.includes(id)) + 1, of: line.length };
}

/**
 * Type matrix: what its moves of each of its own types do to every type (best of its types), and
 * what every type does to it.
 */
export function typeMatrix(types: readonly TypeId[]): Array<{ type: TypeId; attack: number; defend: number }> {
  return TYPE_IDS.map((t) => ({
    type: t,
    attack: Math.max(...types.map((own) => typeMultiplier(own, [t]))),
    defend: typeMultiplier(t, types),
  }));
}

/** Biomes a species can be found in (evolution-only species: the biomes of its hints). */
export function dexBiomes(s: SpeciesSpec): Biome[] {
  const fromHints = dexEntry(s.id).habitatHints.map((h) => h.biome);
  const wild = s.spawn.districts.length ? [...speciesBiomes(s)] : [];
  return BIOMES.filter((b) => wild.includes(b) || fromHints.includes(b));
}

export interface DexFilter {
  biome?: Biome | 'all';
  type?: TypeId | 'all';
  /** 'missing' = not captured yet. */
  state?: Exclude<DexState, 'unseen'> | 'missing' | 'all';
}

export function filterDex(list: readonly SpeciesSpec[], f: DexFilter, p: DexProgress): SpeciesSpec[] {
  return list.filter((s) => {
    if (f.biome && f.biome !== 'all' && !dexBiomes(s).includes(f.biome)) return false;
    // Types are only known once you've seen one; an unseen species never matches a type filter.
    const st = dexState(s.id, p);
    if (f.type && f.type !== 'all' && (st === 'unseen' || !s.types.includes(f.type))) return false;
    if (f.state && f.state !== 'all') {
      if (f.state === 'missing') return !reached(st, 'captured');
      return reached(st, f.state);
    }
    return true;
  });
}

/** Completion counters per state, overall and per biome. */
export function completion(list: readonly SpeciesSpec[], p: DexProgress): Record<'all' | Biome, { total: number; seen: number; captured: number; evolved: number }> {
  const out = {} as Record<'all' | Biome, { total: number; seen: number; captured: number; evolved: number }>;
  for (const k of ['all', ...BIOMES] as const) {
    const sub = k === 'all' ? list : list.filter((s) => dexBiomes(s).includes(k));
    const states = sub.map((s) => dexState(s.id, p));
    out[k] = {
      total: sub.length,
      seen: states.filter((x) => reached(x, 'seen')).length,
      captured: states.filter((x) => reached(x, 'captured')).length,
      evolved: states.filter((x) => x === 'evolved').length,
    };
  }
  return out;
}
