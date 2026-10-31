import { LEVEL_CAP, MAX_MOVES, levelForXp, magazine, maxHp, movesAtLevel, xpForLevel, type Creature } from '../creatures/Creature';
import { VEHICLES } from '../vehicles/specs';
import { BIOMES, DATA, species, type Biome } from '../creatures/Data';
import { WEAPONS, isRanged, weapon } from '../weapons/WeaponTypes';
import type { OwnedWeapon } from '../weapons/Inventory';

/**
 * Save games (engine-free, unit-tested). Everything is plain JSON with a version number; loading
 * repairs or drops anything that doesn't fit the current config (a species or move that no longer
 * exists, out-of-range levels, HP or ammo) so an old or hand-edited save never breaks the game.
 * Stored in the browser's localStorage, and exportable/importable as a .json file.
 */

/** v2 adds the world layer, dex evolved set, pity, stashes, quests, reputation and sewer state. v1 saves upgrade on load. */
export const SAVE_VERSION = 2;
/** Default sewer maze seed (the same maze for every new game unless changed). */
export const DEFAULT_SEWER_SEED = 9137;
export const SAVE_KEY = 'empire-streets-save';

export interface SaveData {
  version: number;
  savedAt: string;
  money: number;
  /** In-game clock (hours). */
  hour: number;
  player: { x: number; z: number; y?: number } | null;
  /** Which world layer the player was in. */
  layer: Biome;
  weapons: { owned: OwnedWeapon[]; current: string };
  bag: { counts: Record<string, number>; selected: string };
  party: Creature[];
  stash: Creature[];
  impound: Creature[];
  dex: {
    seen: string[];
    caught: string[];
    /** Species the player has evolved *from* at least once. */
    evolved: string[];
    firstSeen: Record<string, { biome: Biome; district: string; at: number }>;
  };
  trainersBeaten: string[];
  battleMode: 'turn' | 'realtime';
  /** You picked the battle mode in the pause menu (older saves just kept the old default, turn-based). */
  battleModeChosen?: boolean;
  /** Playtime in seconds. */
  playTime: number;
  /** Consecutive failed capture throws (and the current target's own count). */
  pity: { fails: number; sameTarget: { uid: string; fails: number } | null };
  stashesOpened: string[];
  quests: Record<string, { step: number; done: boolean }>;
  reputation: number;
  manholesFound: string[];
  sewerSeed: number;
  /** Street races: earned by placing (unlocks the bigger races). */
  streetCred: number;
  /** Heists: notoriety, which jobs are still on edge, and your record. */
  heists: { heat: number; cooldowns: Record<string, number>; stats: { done: number; failed: number; earned: number; best: number } };
  /** City map: your waypoint and which layers are shown. */
  map: { waypoint: { x: number; z: number } | null; hidden: string[] };
  /** Street events: Street Cred earned per district, upgrade chips, time to the next event, record. */
  streetEvents: {
    regionalCred: Record<string, number>;
    chips: number;
    timer: number;
    stats: { spawned: number; completed: number; expired: number; byType: Record<string, number> };
  };
  /** The campaign: active and finished quests, story flags, bosses beaten, blueprints, legendaries. */
  campaign: {
    active: Array<{ id: string; objective: number; count: number; ready: boolean }>;
    completed: string[];
    flags: string[];
    bosses: string[];
    blueprints: string[];
    legendaries: string[];
    acts: string[];
    tracked: string | null;
    stats: { started: number; completed: number; failed: number };
  };
  /** Tutorial tips: on/off, the ones you've seen, the actions you've practised (missing in older saves). */
  tutorials?: { enabled: boolean; seen: string[]; performed: string[] };
  /** Legendary raids: caught, cooldowns, record (raidManager.js checks it on load). */
  raids?: unknown;
  /** Cinematics already played (the act and boss ones play once). Missing in older saves. */
  cinematics?: string[];
  /** The player's look (the wardrobe; playerLook.ts cleans it up). Missing in older saves. */
  look?: unknown;
  /** Underground Chop Shop: tuned rides and the Streetmon riding in them. */
  garage: {
    rides: Array<{ id: string; spec: string; color: string; slots: Record<'engineBay' | 'trunk' | 'roofRack', string | null> }>;
    streetmon: Creature[];
  };
}

export interface LoadResult {
  data: SaveData;
  /** What had to be fixed or dropped (shown to the player if non-empty). */
  warnings: string[];
}

const num = (v: unknown, def: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

/** Repairs one creature; null if it can't be kept (unknown species). */
export function sanitizeCreature(raw: unknown, warnings: string[]): Creature | null {
  if (!raw || typeof raw !== 'object') {
    warnings.push('dropped an unreadable creature');
    return null;
  }
  const r = raw as Partial<Creature>;
  const sp = typeof r.speciesId === 'string' ? DATA.species.get(r.speciesId) : undefined;
  if (!sp || sp.human) {
    warnings.push(`dropped a creature of unknown species "${String(r.speciesId)}"`);
    return null;
  }
  const level = Math.round(num(r.level, 1, 1, LEVEL_CAP));
  const lo = xpForLevel(sp.growth, level);
  const hi = level >= LEVEL_CAP ? lo : xpForLevel(sp.growth, level + 1) - 1;
  let xp = Math.round(num(r.xp, lo, 0));
  if (xp < lo || xp > hi) xp = Math.max(lo, Math.min(hi, xp));
  const iv = (k: 'hp' | 'attack' | 'defense' | 'speed' | 'loud'): number => Math.round(num(r.ivs?.[k], 15, 0, 31));
  let moves = Array.isArray(r.moves) ? r.moves.filter((m): m is string => typeof m === 'string' && DATA.moves.has(m)) : [];
  moves = [...new Set(moves)].slice(0, MAX_MOVES);
  if (!moves.length) {
    moves = movesAtLevel(sp, level);
    warnings.push(`${sp.name}: moves were missing and have been reset`);
  }
  if (sp.types.includes('gun') && !moves.includes('reload')) {
    if (moves.length >= MAX_MOVES) moves[moves.length - 1] = 'reload';
    else moves.push('reload');
  }
  const c: Creature = {
    uid: typeof r.uid === 'string' && r.uid ? r.uid : `r-${Math.random().toString(36).slice(2)}`,
    speciesId: sp.id,
    nickname: typeof r.nickname === 'string' && r.nickname.trim() ? r.nickname.trim().slice(0, 16) : undefined,
    level,
    xp,
    hp: 0,
    ivs: { hp: iv('hp'), attack: iv('attack'), defense: iv('defense'), speed: iv('speed'), loud: iv('loud') },
    moves,
    ammo: 0,
    shiny: r.shiny === true,
    status: r.status === 'choking' ? 'choking' : 'none',
  };
  c.hp = Math.round(num(r.hp, maxHp(c), 0, maxHp(c)));
  c.ammo = Math.round(num(r.ammo, magazine(c), 0, magazine(c)));
  if (r.origin && typeof r.origin === 'object') {
    const o = r.origin as Creature['origin'];
    c.origin = { district: String(o!.district ?? '').slice(0, 24), level: Math.round(num(o!.level, level, 1, LEVEL_CAP)), at: num(o!.at, 0) };
  }
  // Keep level consistent with XP for the species' curve.
  if (levelForXp(sp.growth, c.xp) !== c.level) c.xp = xpForLevel(sp.growth, c.level);
  return c;
}

/** Parses and repairs a save (object or JSON text). Throws only if it isn't a save at all. */
export function loadSave(input: unknown): LoadResult {
  const warnings: string[] = [];
  let raw: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as Record<string, unknown>;
    } catch {
      throw new Error('That file is not a valid save (not JSON).');
    }
  } else raw = input as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || typeof raw['version'] !== 'number') throw new Error('That file is not an Empire Streets save.');
  if ((raw['version'] as number) > SAVE_VERSION) warnings.push('this save is from a newer version; some things may be missing');
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const creatures = (v: unknown): Creature[] => list(v).map((c) => sanitizeCreature(c, warnings)).filter((c): c is Creature => c !== null);
  let party = creatures(raw['party']);
  const stash = creatures(raw['stash']);
  if (party.length > 6) {
    stash.unshift(...party.slice(6));
    party = party.slice(0, 6);
    warnings.push('more than 6 in the party: the rest went to the stash');
  }
  // Weapons: only known ones, ammo within limits; fists always.
  const w = (raw['weapons'] ?? {}) as { owned?: unknown; current?: unknown };
  const owned: OwnedWeapon[] = [];
  for (const o of list(w.owned)) {
    const ow = o as Partial<OwnedWeapon>;
    if (typeof ow.id !== 'string' || !WEAPONS.some((x) => x.id === ow.id) || owned.some((x) => x.id === ow.id)) continue;
    const spec = weapon(ow.id);
    owned.push({
      id: ow.id,
      mag: isRanged(spec) ? Math.round(num(ow.mag, 0, 0, spec.magSize!)) : 0,
      reserve: isRanged(spec) ? Math.round(num(ow.reserve, 0, 0, spec.reserveMax!)) : 0,
    });
  }
  if (!owned.some((o) => o.id === 'fists')) owned.unshift({ id: 'fists', mag: 0, reserve: 0 });
  const current = typeof w.current === 'string' && owned.some((o) => o.id === w.current) ? w.current : 'fists';
  // Bag.
  const b = (raw['bag'] ?? {}) as { counts?: Record<string, unknown>; selected?: unknown };
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.counts ?? {})) {
    if (!DATA.items.has(k)) {
      warnings.push(`dropped unknown item "${k}"`);
      continue;
    }
    const n = Math.floor(num(v, 0, 0, 999));
    if (n > 0) counts[k] = n;
  }
  const strs = (v: unknown, ok: (s: string) => boolean): string[] => [...new Set(list(v).filter((s): s is string => typeof s === 'string' && ok(s)))];
  const isSpecies = (s: string): boolean => DATA.species.has(s) && !species(s).human;
  const dex = (raw['dex'] ?? {}) as { seen?: unknown; caught?: unknown };
  const caught = strs(dex.caught, isSpecies);
  const seen = [...new Set([...strs(dex.seen, isSpecies), ...caught])];
  const pl = raw['player'] as { x?: unknown; z?: unknown; y?: unknown } | null | undefined;
  const dexRaw = dex as { evolved?: unknown; firstSeen?: unknown };
  const firstSeen: SaveData['dex']['firstSeen'] = {};
  if (dexRaw.firstSeen && typeof dexRaw.firstSeen === 'object') {
    for (const [k, v] of Object.entries(dexRaw.firstSeen as Record<string, unknown>)) {
      const o = v as { biome?: unknown; district?: unknown; at?: unknown };
      if (!isSpecies(k) || !o || typeof o !== 'object') continue;
      firstSeen[k] = { biome: BIOMES.includes(o.biome as Biome) ? (o.biome as Biome) : 'street', district: String(o.district ?? '').slice(0, 24), at: num(o.at, 0, 0) };
    }
  }
  const pityRaw = (raw['pity'] ?? {}) as { fails?: unknown; sameTarget?: { uid?: unknown; fails?: unknown } | null };
  const st = pityRaw.sameTarget;
  const questsRaw = (raw['quests'] ?? {}) as Record<string, unknown>;
  const quests: SaveData['quests'] = {};
  for (const [k, v] of Object.entries(typeof questsRaw === 'object' && questsRaw ? questsRaw : {})) {
    const q = v as { step?: unknown; done?: unknown };
    if (!q || typeof q !== 'object' || !/^[a-z0-9-]{1,40}$/.test(k)) continue;
    quests[k] = { step: Math.round(num(q.step, 0, 0, 99)), done: q.done === true };
  }
  let layer: Biome = BIOMES.includes(raw['layer'] as Biome) ? (raw['layer'] as Biome) : 'street';
  // A save made underground or on a roof that the current build can't place goes back to the street.
  if (layer !== 'street' && !(pl && typeof pl.y === 'number')) layer = 'street';
  const data: SaveData = {
    version: SAVE_VERSION,
    savedAt: typeof raw['savedAt'] === 'string' ? (raw['savedAt'] as string) : new Date(0).toISOString(),
    money: Math.round(num(raw['money'], 500, 0, 1e9)),
    hour: num(raw['hour'], 16.5, 0, 23.999),
    player: pl && typeof pl.x === 'number' && typeof pl.z === 'number' ? { x: pl.x, z: pl.z, ...(typeof pl.y === 'number' && Number.isFinite(pl.y) ? { y: pl.y } : {}) } : null,
    layer,
    weapons: { owned, current },
    bag: { counts, selected: typeof b.selected === 'string' ? b.selected : 'cuffs' },
    party,
    stash,
    impound: creatures(raw['impound']),
    dex: { seen, caught, evolved: strs(dexRaw.evolved, isSpecies), firstSeen },
    trainersBeaten: strs(raw['trainersBeaten'], () => true),
    battleMode: raw['battleMode'] === 'turn' ? 'turn' : 'realtime',
    battleModeChosen: raw['battleModeChosen'] === true,
    playTime: num(raw['playTime'], 0, 0),
    pity: {
      fails: Math.round(num(pityRaw.fails, 0, 0, 999)),
      sameTarget: st && typeof st === 'object' && typeof st.uid === 'string' ? { uid: st.uid.slice(0, 64), fails: Math.round(num(st.fails, 0, 0, 999)) } : null,
    },
    stashesOpened: strs(raw['stashesOpened'], (x) => /^[a-z0-9-]{1,40}$/.test(x)),
    quests,
    reputation: Math.round(num(raw['reputation'], 0, -1000, 1000)),
    manholesFound: strs(raw['manholesFound'], (x) => /^[a-z0-9-]{1,40}$/.test(x)),
    sewerSeed: Math.round(num(raw['sewerSeed'], DEFAULT_SEWER_SEED, 1, 2 ** 31 - 1)),
    streetCred: Math.round(num(raw['streetCred'], 0, 0, 1e6)),
    heists: parseHeists(raw['heists']),
    map: parseMap(raw['map']),
    streetEvents: parseStreetEvents(raw['streetEvents']),
    campaign: parseCampaign(raw['campaign']),
    tutorials: raw['tutorials'] === undefined ? undefined : parseTutorials(raw['tutorials']),
    raids: raw['raids'] && typeof raw['raids'] === 'object' ? raw['raids'] : undefined,
    look: raw['look'] && typeof raw['look'] === 'object' ? raw['look'] : undefined,
    cinematics: raw['cinematics'] === undefined ? undefined : strs(raw['cinematics'], (x) => /^[a-z0-9:-]{1,60}$/.test(x)),
    garage: parseGarage(raw['garage'], creatures, warnings),
  };
  return { data, warnings };
}

function parseHeists(v: unknown): SaveData['heists'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const cd: Record<string, number> = {};
  const rawCd = (o['cooldowns'] && typeof o['cooldowns'] === 'object' ? o['cooldowns'] : {}) as Record<string, unknown>;
  for (const [k, x] of Object.entries(rawCd)) if (/^[a-z0-9-]{1,40}$/.test(k) && typeof x === 'number' && x > 0 && x < 1e5) cd[k] = x;
  const st = (o['stats'] && typeof o['stats'] === 'object' ? o['stats'] : {}) as Record<string, unknown>;
  return {
    heat: num(o['heat'], 0, 0, 100),
    cooldowns: cd,
    stats: { done: Math.round(num(st['done'], 0, 0, 1e6)), failed: Math.round(num(st['failed'], 0, 0, 1e6)), earned: Math.round(num(st['earned'], 0, 0, 1e9)), best: Math.round(num(st['best'], 0, 0, 1e9)) },
  };
}

function parseStreetEvents(v: unknown): SaveData['streetEvents'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const rc = (o['regionalCred'] && typeof o['regionalCred'] === 'object' ? o['regionalCred'] : {}) as Record<string, unknown>;
  const regionalCred: Record<string, number> = {};
  for (const d of ['uptown', 'midtown', 'downtown', 'park', 'waterfront']) regionalCred[d] = Math.round(num(rc[d], 0, 0, 1e6));
  const st = (o['stats'] && typeof o['stats'] === 'object' ? o['stats'] : {}) as Record<string, unknown>;
  const bt = (st['byType'] && typeof st['byType'] === 'object' ? st['byType'] : {}) as Record<string, unknown>;
  const byType: Record<string, number> = {};
  for (const k of ['armoredTruck', 'turfOutbreak', 'airdrop']) if (typeof bt[k] === 'number') byType[k] = Math.round(num(bt[k], 0, 0, 1e6));
  return {
    regionalCred,
    chips: Math.round(num(o['chips'], 0, 0, 5)),
    timer: Math.round(num(o['timer'], 0, 0, 3600)),
    stats: { spawned: Math.round(num(st['spawned'], 0, 0, 1e6)), completed: Math.round(num(st['completed'], 0, 0, 1e6)), expired: Math.round(num(st['expired'], 0, 0, 1e6)), byType },
  };
}

/** Campaign progress: well-formed ids only (the quest manager drops ones the story doesn't have). */
function parseCampaign(v: unknown): SaveData['campaign'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const ID = /^[a-z0-9-]{1,40}$/;
  const ids = (x: unknown, max = 200): string[] => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string' && ID.test(i)).slice(0, max) : []);
  const flags = Array.isArray(o['flags']) ? (o['flags'] as unknown[]).filter((f): f is string => typeof f === 'string' && /^[a-z0-9:-]{1,60}$/.test(f)).slice(0, 300) : [];
  const active = Array.isArray(o['active'])
    ? (o['active'] as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as Record<string, unknown>)['id'] === 'string' && ID.test((a as Record<string, unknown>)['id'] as string))
        .slice(0, 50)
        .map((a) => ({ id: a['id'] as string, objective: Math.round(num(a['objective'], 0, 0, 50)), count: Math.round(num(a['count'], 0, 0, 1000)), ready: a['ready'] === true }))
    : [];
  const st = (o['stats'] && typeof o['stats'] === 'object' ? o['stats'] : {}) as Record<string, unknown>;
  return {
    active,
    completed: ids(o['completed']),
    flags,
    bosses: ids(o['bosses']),
    blueprints: ids(o['blueprints']),
    legendaries: ids(o['legendaries']),
    acts: ids(o['acts']),
    tracked: typeof o['tracked'] === 'string' && ID.test(o['tracked']) ? o['tracked'] : null,
    stats: { started: Math.round(num(st['started'], 0, 0, 1e6)), completed: Math.round(num(st['completed'], 0, 0, 1e6)), failed: Math.round(num(st['failed'], 0, 0, 1e6)) },
  };
}

/** Tutorials: well-formed ids and action names only (the manager drops tips it doesn't have). */
export function parseTutorials(v: unknown): NonNullable<SaveData['tutorials']> {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const list = (x: unknown, re: RegExp, max: number): string[] => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string' && re.test(i)).slice(0, max) : []);
  return { enabled: o['enabled'] !== false, seen: list(o['seen'], /^[a-z0-9-]{1,40}$/, 200), performed: list(o['performed'], /^[a-zA-Z]{1,30}$/, 200) };
}

function parseMap(v: unknown): SaveData['map'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const w = o['waypoint'] as { x?: unknown; z?: unknown } | null | undefined;
  const ok = w && typeof w === 'object' && typeof w.x === 'number' && typeof w.z === 'number' && Math.abs(w.x) < 5000 && Math.abs(w.z) < 5000;
  const hidden = Array.isArray(o['hidden']) ? (o['hidden'] as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-zA-Z]{1,24}$/.test(x)).slice(0, 32) : [];
  return { waypoint: ok ? { x: w!.x as number, z: w!.z as number } : null, hidden };
}

/** Tuned rides: known car models only; each slotted Streetmon must be among the garage's. */
function parseGarage(v: unknown, creatures: (v: unknown) => Creature[], warnings: string[]): SaveData['garage'] {
  const g = (v ?? {}) as { rides?: unknown; streetmon?: unknown };
  const streetmon = creatures(g.streetmon);
  const ids = new Set(streetmon.map((c) => c.uid));
  const used = new Set<string>();
  const rides: SaveData['garage']['rides'] = [];
  for (const r of Array.isArray(g.rides) ? g.rides : []) {
    const ride = r as { id?: unknown; spec?: unknown; color?: unknown; slots?: Record<string, unknown> };
    if (typeof ride.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(ride.id) || typeof ride.spec !== 'string' || !VEHICLES.some((s) => s.id === ride.spec)) {
      warnings.push('dropped a tuned car the game does not know');
      continue;
    }
    const slots = { engineBay: null, trunk: null, roofRack: null } as SaveData['garage']['rides'][number]['slots'];
    for (const k of ['engineBay', 'trunk', 'roofRack'] as const) {
      const id = ride.slots?.[k];
      if (typeof id === 'string' && ids.has(id) && !used.has(id)) {
        slots[k] = id;
        used.add(id);
      }
    }
    rides.push({ id: ride.id, spec: ride.spec, color: typeof ride.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(ride.color) ? ride.color : '#888888', slots });
  }
  // Streetmon not in any car are kept (the game puts them back with the team).
  return { rides, streetmon };
}

/** Plain-JSON copy of a creature for saving. */
export function creatureToJson(c: Creature): Creature {
  return { ...c, ivs: { ...c.ivs }, moves: [...c.moves], origin: c.origin ? { ...c.origin } : undefined };
}

// ------------------------------------------------------------------ storage

export interface SaveStore {
  read(): string | null;
  write(text: string): boolean;
  clear(): void;
}

/** localStorage, failing quietly (private windows, blocked storage). */
export const browserStore: SaveStore = {
  read(): string | null {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  },
  write(text: string): boolean {
    try {
      localStorage.setItem(SAVE_KEY, text);
      return true;
    } catch {
      return false;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** One-line description of a save for the title screen. */
export function describeSave(d: SaveData): string {
  const lead = d.party[0];
  const h = Math.floor(d.playTime / 3600);
  const m = Math.floor((d.playTime % 3600) / 60);
  return `${lead ? `${species(lead.speciesId).name} Lv ${lead.level} · ` : ''}${d.party.length + d.stash.length} Streetmon · dex ${d.dex.caught.length} · $${d.money.toLocaleString('en-US')} · ${h}h ${String(m).padStart(2, '0')}m`;
}
