// @ts-check
import defaultConfig from '../config/vehicle_streetmon_tuning.json';

/**
 * Streetmon vehicle tuning: the Underground Chop Shop's brain.
 *
 * Each vehicle has three mod slots (engineBay, trunk, roofRack). Slotting a Streetmon turns its
 * type into a mod (stat multipliers plus, usually, an ability) and its stats into a little extra
 * (a stat bonus, shorter cooldowns, stronger abilities at higher levels).
 *
 * This module knows nothing about rendering or physics. The game hands it an adapter:
 *
 *   getStreetmon(id)          -> { id, speciesId, name, types, level, stats } | null
 *   takeStreetmon(id)         -> true, or a string saying why not (optional; called on slotting)
 *   returnStreetmon(id)       -> void (optional; called on unslotting or when a vehicle is gone)
 *   getBaseStats(vehicleId)   -> { topSpeed, acceleration, durability, mass, grip, steering, radarRange }
 *   applyStats(vehicleId, s)  -> void: push the recalculated stats/multipliers into physics
 *   triggerAbility(vehicleId, ability, ctx) -> boolean: run the world effect (false = didn't fire)
 *   endAbility(vehicleId, ability) -> void (optional; a timed ability ran out)
 *
 * Everything else (cooldowns, timers, input edges, stat maths, saving) happens here, so it can be
 * unit-tested in Node and reused by any front end.
 */

export const SLOT_NAMES = /** @type {const} */ (['engineBay', 'trunk', 'roofRack']);

/** @typedef {'engineBay' | 'trunk' | 'roofRack'} SlotName */
/**
 * @typedef {Object} StreetmonInfo
 * @property {string} id
 * @property {string} speciesId
 * @property {string} [name]
 * @property {string[]} types
 * @property {number} level
 * @property {{ hp: number, attack: number, defense: number, speed: number, loud: number }} stats
 */
/**
 * @typedef {Object} VehicleStats
 * @property {number} topSpeed      m/s
 * @property {number} acceleration  m/s² of engine pull (engine force / mass)
 * @property {number} durability    hit points
 * @property {number} mass          kg
 * @property {number} grip          tyre friction
 * @property {number} steering      steering lock multiplier (1 = stock)
 * @property {number} radarRange    metres of minimap radar
 */

const STAT_KEYS = /** @type {const} */ (['topSpeed', 'acceleration', 'durability', 'mass', 'grip', 'steering', 'radarRange']);
/** Multiplied stats; radarRange is additive. */
const ADDITIVE = new Set(['radarRange']);

const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));

/**
 * Validates a tuning config. Throws with a clear message on the first problem.
 * @param {any} cfg
 */
export function validateConfig(cfg) {
  const fail = (/** @type {string} */ m) => {
    throw new Error(`vehicle tuning config: ${m}`);
  };
  if (!cfg || typeof cfg !== 'object') fail('missing');
  for (const slot of SLOT_NAMES) {
    const s = cfg.slots?.[slot];
    if (!s) fail(`slot "${slot}" missing`);
    const accepts = s.accepts ?? {};
    if (!(accepts.types?.length || accepts.species?.length)) fail(`slot ${slot} accepts nothing`);
    for (const t of accepts.types ?? []) if (!s.mods?.[t]) fail(`slot ${slot}: no mod for type "${t}"`);
    if (accepts.species?.length && !s.mods?.[s.speciesTag ?? '']) fail(`slot ${slot}: species list needs a mod under speciesTag`);
    for (const [key, mod] of Object.entries(s.mods ?? {})) {
      const m = /** @type {any} */ (mod);
      for (const [stat, v] of Object.entries(m.modifiers ?? {})) {
        if (!STAT_KEYS.includes(/** @type {any} */ (stat))) fail(`slot ${slot}/${key}: unknown stat "${stat}"`);
        if (typeof v !== 'number' || !isFinite(v) || (!ADDITIVE.has(stat) && v <= 0)) fail(`slot ${slot}/${key}: bad value for ${stat}`);
      }
      if (m.ability && !cfg.abilities?.[m.ability]) fail(`slot ${slot}/${key}: unknown ability "${m.ability}"`);
      if (m.statBonus && !STAT_KEYS.includes(m.statBonus.modifier)) fail(`slot ${slot}/${key}: statBonus modifier unknown`);
    }
  }
  for (const [id, a] of Object.entries(cfg.abilities ?? {})) {
    const ab = /** @type {any} */ (a);
    if (!['active', 'collision', 'passive'].includes(ab.trigger)) fail(`ability ${id}: trigger must be active, collision or passive`);
    if (ab.trigger !== 'passive' && !(ab.cooldown > 0)) fail(`ability ${id}: needs a cooldown`);
    if (ab.trigger === 'active' && !ab.input?.keys?.length) fail(`ability ${id}: active abilities need input keys`);
    if (ab.duration !== undefined && !(ab.duration > 0 && ab.duration < ab.cooldown)) fail(`ability ${id}: duration must be shorter than the cooldown`);
  }
  return cfg;
}

/**
 * Which mod a Streetmon would be in a slot: the first of its own types the slot accepts, else its
 * species tag (e.g. aerial). Null if the slot won't take it.
 * @param {any} cfg @param {SlotName} slotName @param {StreetmonInfo} mon
 * @returns {{ key: string, mod: any } | null}
 */
export function modFor(cfg, slotName, mon) {
  const slot = cfg.slots[slotName];
  if (!slot || !mon) return null;
  for (const t of mon.types) if ((slot.accepts.types ?? []).includes(t) && slot.mods[t]) return { key: t, mod: slot.mods[t] };
  if ((slot.accepts.species ?? []).includes(mon.speciesId) && slot.speciesTag && slot.mods[slot.speciesTag]) return { key: slot.speciesTag, mod: slot.mods[slot.speciesTag] };
  return null;
}

/**
 * Pure stat maths: base stats + slotted mods (+ timed boosts) -> final stats.
 * @param {any} cfg
 * @param {VehicleStats} base
 * @param {Partial<Record<SlotName, StreetmonInfo | null>>} slotted
 * @param {Array<Record<string, number>>} [boosts] extra multipliers (e.g. nitrous while active)
 */
export function computeStats(cfg, base, slotted, boosts = []) {
  /** @type {Record<string, number>} */
  const mult = { topSpeed: 1, acceleration: 1, durability: 1, mass: 1, grip: 1, steering: 1, radarRange: 0 };
  /** @type {Array<{ slot: SlotName, key: string, ability: string | null }>} */
  const mods = [];
  const sb = cfg.scaling?.statBonus ?? { statFor100: 0, max: 0 };
  for (const slot of SLOT_NAMES) {
    const mon = slotted[slot];
    if (!mon) continue;
    const m = modFor(cfg, slot, mon);
    if (!m) continue;
    for (const [stat, v] of Object.entries(m.mod.modifiers ?? {})) {
      if (ADDITIVE.has(stat)) mult[stat] += v;
      else mult[stat] *= v;
    }
    if (m.mod.statBonus) {
      const s = mon.stats?.[/** @type {keyof StreetmonInfo['stats']} */ (m.mod.statBonus.stat)] ?? 0;
      const k = m.mod.statBonus.modifier;
      const extra = clamp((s / 100) * sb.statFor100, 0, sb.max);
      if (ADDITIVE.has(k)) mult[k] += extra * 100;
      else mult[k] *= 1 + extra;
    }
    mods.push({ slot, key: m.key, ability: m.mod.ability ?? null });
  }
  for (const b of boosts) for (const [stat, v] of Object.entries(b)) if (stat in mult) mult[stat] = ADDITIVE.has(stat) ? mult[stat] + v : mult[stat] * v;
  /** @type {any} */
  const fin = {};
  for (const k of STAT_KEYS) fin[k] = ADDITIVE.has(k) ? base[k] + mult[k] : base[k] * mult[k];
  // Extra mass slows the pull a little (same engine, heavier car), shown in acceleration.
  fin.acceleration = (base.acceleration * mult.acceleration) / mult.mass;
  return { base: { ...base }, final: /** @type {VehicleStats} */ (fin), multipliers: mult, mods };
}

/**
 * Ability strength and cooldown for a particular Streetmon.
 * @param {any} cfg @param {any} ability @param {StreetmonInfo} mon
 */
export function abilityTuning(cfg, ability, mon) {
  const cd = cfg.scaling?.cooldown;
  const pw = cfg.scaling?.power;
  const stat = cd ? mon.stats?.[/** @type {keyof StreetmonInfo['stats']} */ (cd.stat)] ?? 0 : 0;
  const cooldown = (ability.cooldown ?? 0) * (1 - (cd ? clamp(stat / cd.statForMax, 0, 1) * cd.maxReduction : 0));
  const power = pw ? clamp(pw.base + pw.perLevel * mon.level, pw.base, pw.max) : 1;
  return { cooldown, power };
}

/** Edge detector for keys and gamepad buttons, per vehicle. */
class InputEdges {
  constructor() {
    /** @type {Set<string>} */
    this.held = new Set();
  }
  /** @param {string} id @param {boolean} down */
  pressed(id, down) {
    const was = this.held.has(id);
    if (down) this.held.add(id);
    else this.held.delete(id);
    return down && !was;
  }
}

/**
 * @typedef {Object} TuningAdapter
 * @property {(id: string) => StreetmonInfo | null} getStreetmon
 * @property {(id: string) => (true | string)} [takeStreetmon]
 * @property {(id: string) => void} [returnStreetmon]
 * @property {(vehicleId: string) => VehicleStats} getBaseStats
 * @property {(vehicleId: string, stats: ReturnType<typeof computeStats>) => void} [applyStats]
 * @property {(vehicleId: string, ability: any, ctx: any) => boolean} [triggerAbility]
 * @property {(vehicleId: string, ability: any) => void} [endAbility]
 */

export class VehicleTuningManager {
  /**
   * @param {{ adapter: TuningAdapter, config?: any }} opts
   */
  constructor({ adapter, config = defaultConfig }) {
    this.config = validateConfig(config);
    this.adapter = adapter;
    /** @type {Map<string, { slots: Record<SlotName, string | null>, cooldowns: Map<string, { left: number, total: number }>, active: Map<string, { left: number, total: number }>, edges: InputEdges, stats: any }>} */
    this.vehicles = new Map();
    /** @type {Map<string, Set<(e: any) => void>>} */
    this.listeners = new Map();
  }

  // ------------------------------------------------------------------ events

  /** @param {'slotted' | 'unslotted' | 'statsChanged' | 'abilityStarted' | 'abilityEnded' | 'abilityReady' | 'vehicleRemoved'} type @param {(e: any) => void} fn */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  // ------------------------------------------------------------------ vehicles

  /** Starts tracking a vehicle (no-op if it already is). @param {string} vehicleId */
  registerVehicle(vehicleId) {
    let v = this.vehicles.get(vehicleId);
    if (!v) {
      v = { slots: { engineBay: null, trunk: null, roofRack: null }, cooldowns: new Map(), active: new Map(), edges: new InputEdges(), stats: null };
      this.vehicles.set(vehicleId, v);
      this.recalculate(vehicleId);
    }
    return v;
  }

  /** @param {string} vehicleId */
  hasVehicle(vehicleId) {
    return this.vehicles.has(vehicleId);
  }

  /** Is anything slotted in this vehicle? @param {string} vehicleId */
  isTuned(vehicleId) {
    const v = this.vehicles.get(vehicleId);
    return !!v && SLOT_NAMES.some((s) => v.slots[s]);
  }

  /** Every Streetmon id slotted anywhere. */
  slottedIds() {
    const out = [];
    for (const v of this.vehicles.values()) for (const s of SLOT_NAMES) if (v.slots[s]) out.push(/** @type {string} */ (v.slots[s]));
    return out;
  }

  /**
   * The vehicle is gone (wrecked, sold): its Streetmon go back to the player.
   * @param {string} vehicleId @returns {string[]} the Streetmon ids returned
   */
  removeVehicle(vehicleId) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return [];
    const ids = /** @type {string[]} */ (SLOT_NAMES.map((s) => v.slots[s]).filter(Boolean));
    for (const id of ids) this.adapter.returnStreetmon?.(id);
    this.vehicles.delete(vehicleId);
    this.emit('vehicleRemoved', { vehicleId, returned: ids });
    return ids;
  }

  // ------------------------------------------------------------------ Chop Shop API

  /**
   * Can this Streetmon go in this slot? Explains why not.
   * @param {SlotName} slotName @param {string} streetmonId
   */
  canSlot(slotName, streetmonId) {
    if (!SLOT_NAMES.includes(slotName)) return { ok: false, reason: `No such slot "${slotName}".` };
    const mon = this.adapter.getStreetmon(streetmonId);
    if (!mon) return { ok: false, reason: 'That Streetmon is not with you.' };
    if (this.slottedIds().includes(streetmonId)) return { ok: false, reason: `${mon.name ?? 'It'} is already installed in a car.` };
    const m = modFor(this.config, slotName, mon);
    if (!m) {
      const acc = this.config.slots[slotName].accepts;
      const what = [...(acc.types ?? []).map((/** @type {string} */ t) => t.charAt(0).toUpperCase() + t.slice(1)), ...(acc.species?.length ? ['flying Streetmon'] : [])];
      return { ok: false, reason: `The ${this.config.slots[slotName].label} takes ${what.join(', ').replace(/, ([^,]*)$/, ' or $1')}.` };
    }
    return { ok: true, mod: m.key, ability: m.mod.ability ? this.config.abilities[m.mod.ability] : null };
  }

  /**
   * Installs a Streetmon. Anything already in the slot is returned to the player first.
   * @param {string} vehicleId @param {SlotName} slotName @param {string} streetmonId
   * @returns {{ ok: boolean, reason?: string, replaced?: string | null, stats?: any }}
   */
  slotStreetmon(vehicleId, slotName, streetmonId) {
    const check = this.canSlot(slotName, streetmonId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const v = this.registerVehicle(vehicleId);
    const taken = this.adapter.takeStreetmon ? this.adapter.takeStreetmon(streetmonId) : true;
    if (taken !== true) return { ok: false, reason: typeof taken === 'string' ? taken : 'Could not take that Streetmon.' };
    const replaced = v.slots[slotName];
    if (replaced) this.adapter.returnStreetmon?.(replaced);
    v.slots[slotName] = streetmonId;
    // A fresh install starts ready.
    for (const k of [...v.cooldowns.keys()]) if (k.startsWith(`${slotName}:`)) v.cooldowns.delete(k);
    for (const k of [...v.active.keys()]) if (k.startsWith(`${slotName}:`)) v.active.delete(k);
    const stats = this.recalculate(vehicleId);
    this.emit('slotted', { vehicleId, slot: slotName, streetmonId, replaced });
    return { ok: true, replaced, stats };
  }

  /**
   * Takes a Streetmon out and gives it back to the player.
   * @param {string} vehicleId @param {SlotName} slotName
   */
  unslotStreetmon(vehicleId, slotName) {
    const v = this.vehicles.get(vehicleId);
    const id = v?.slots[slotName];
    if (!v || !id) return { ok: false, reason: 'That slot is empty.' };
    for (const [k, a] of [...v.active]) if (k.startsWith(`${slotName}:`)) this.finishActive(vehicleId, k, a);
    v.slots[slotName] = null;
    this.adapter.returnStreetmon?.(id);
    const stats = this.recalculate(vehicleId);
    this.emit('unslotted', { vehicleId, slot: slotName, streetmonId: id });
    return { ok: true, streetmonId: id, stats };
  }

  /**
   * Base, final and multiplier stats, plus what's in each slot and its ability.
   * @param {string} vehicleId
   */
  getVehicleStats(vehicleId) {
    const v = this.registerVehicle(vehicleId);
    return v.stats;
  }

  /** What's slotted, with mod and ability details (for the Chop Shop screen). @param {string} vehicleId */
  getSlots(vehicleId) {
    const v = this.registerVehicle(vehicleId);
    return SLOT_NAMES.map((slot) => {
      const id = v.slots[slot];
      const mon = id ? this.adapter.getStreetmon(id) : null;
      const m = mon ? modFor(this.config, slot, mon) : null;
      const ab = m?.mod.ability ? this.config.abilities[m.mod.ability] : null;
      return {
        slot,
        label: this.config.slots[slot].label,
        accepts: this.config.slots[slot].accepts,
        streetmonId: id,
        streetmon: mon,
        mod: m?.key ?? null,
        modifiers: m?.mod.modifiers ?? {},
        ability: ab && mon ? { id: m?.mod.ability, ...ab, ...abilityTuning(this.config, ab, mon) } : null,
      };
    });
  }

  // ------------------------------------------------------------------ stats

  /**
   * Recomputes a vehicle's stats from its base stats, slots and running boosts, and pushes them
   * to the game. Called whenever a slot changes or a timed boost starts/ends.
   * @param {string} vehicleId
   */
  recalculate(vehicleId) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return null;
    /** @type {Partial<Record<SlotName, StreetmonInfo | null>>} */
    const slotted = {};
    for (const s of SLOT_NAMES) slotted[s] = v.slots[s] ? this.adapter.getStreetmon(/** @type {string} */ (v.slots[s])) : null;
    const boosts = [];
    for (const [k] of v.active) {
      const ab = this.config.abilities[k.split(':')[1]];
      if (ab?.whileActive) boosts.push(ab.whileActive);
    }
    const stats = computeStats(this.config, this.adapter.getBaseStats(vehicleId), slotted, boosts);
    v.stats = stats;
    this.adapter.applyStats?.(vehicleId, stats);
    this.emit('statsChanged', { vehicleId, stats });
    return stats;
  }

  // ------------------------------------------------------------------ abilities

  /**
   * Abilities this vehicle has, with their keys and state.
   * @param {string} vehicleId
   */
  abilities(vehicleId) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return [];
    const out = [];
    for (const slot of SLOT_NAMES) {
      const id = v.slots[slot];
      if (!id) continue;
      const mon = this.adapter.getStreetmon(id);
      const m = mon ? modFor(this.config, slot, mon) : null;
      const abilityId = m?.mod.ability;
      if (!mon || !abilityId) continue;
      const ab = this.config.abilities[abilityId];
      const key = `${slot}:${abilityId}`;
      const cd = v.cooldowns.get(key);
      const act = v.active.get(key);
      out.push({
        key,
        slot,
        abilityId,
        name: ab.name,
        trigger: ab.trigger,
        input: ab.input ?? null,
        streetmon: mon,
        cooldown01: cd ? clamp(cd.left / cd.total, 0, 1) : 0,
        active01: act ? clamp(act.left / act.total, 0, 1) : 0,
        ready: !cd && ab.trigger !== 'passive',
      });
    }
    return out;
  }

  /** Does this vehicle have an ability (passives included)? @param {string} vehicleId @param {string} abilityId */
  hasAbility(vehicleId, abilityId) {
    return this.abilities(vehicleId).some((a) => a.abilityId === abilityId);
  }

  /** Is a timed ability running right now? @param {string} vehicleId @param {string} abilityId */
  isActive(vehicleId, abilityId) {
    const v = this.vehicles.get(vehicleId);
    return !!v && [...v.active.keys()].some((k) => k.endsWith(`:${abilityId}`));
  }

  /**
   * Fires an ability by id or slot. Returns what happened.
   * @param {string} vehicleId @param {string} which ability id or slot name @param {any} [ctx]
   */
  trigger(vehicleId, which, ctx = {}) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return { ok: false, reason: 'not tuned' };
    const a = this.abilities(vehicleId).find((x) => x.abilityId === which || x.slot === which);
    if (!a) return { ok: false, reason: 'no such ability' };
    if (a.trigger === 'passive') return { ok: false, reason: 'passive' };
    if (v.cooldowns.has(a.key)) return { ok: false, reason: 'cooldown', cooldown01: a.cooldown01 };
    const ab = this.config.abilities[a.abilityId];
    const tune = abilityTuning(this.config, ab, a.streetmon);
    const payload = { id: a.abilityId, slot: a.slot, ...ab, power: tune.power, streetmon: a.streetmon };
    const fired = this.adapter.triggerAbility ? this.adapter.triggerAbility(vehicleId, payload, ctx) : true;
    if (fired === false) return { ok: false, reason: 'refused' };
    v.cooldowns.set(a.key, { left: tune.cooldown, total: tune.cooldown });
    if (ab.duration) {
      v.active.set(a.key, { left: ab.duration, total: ab.duration });
      if (ab.whileActive) this.recalculate(vehicleId);
    }
    this.emit('abilityStarted', { vehicleId, abilityId: a.abilityId, slot: a.slot });
    return { ok: true, abilityId: a.abilityId, cooldown: tune.cooldown };
  }

  /**
   * Reads controls for a vehicle and fires the matching active abilities on a fresh press.
   * `isDown(code)` tells whether a key is held; `gamepad` is a browser Gamepad (or null).
   * Returns the ids of abilities fired this call.
   * @param {string} vehicleId
   * @param {{ isDown: (code: string) => boolean, gamepad?: { buttons: ReadonlyArray<{ pressed: boolean }> } | null }} input
   */
  handleInput(vehicleId, input) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return [];
    const fired = [];
    for (const a of this.abilities(vehicleId)) {
      if (a.trigger !== 'active' || !a.input) continue;
      const down = a.input.keys.some((/** @type {string} */ k) => input.isDown(k)) || (a.input.gamepadButton !== undefined && !!input.gamepad?.buttons[a.input.gamepadButton]?.pressed);
      if (v.edges.pressed(a.key, down) && this.trigger(vehicleId, a.abilityId).ok) fired.push(a.abilityId);
    }
    return fired;
  }

  /**
   * The vehicle crashed. Fires collision abilities (e.g. Exhaust Backfire) if hard enough.
   * @param {string} vehicleId @param {{ strength: number, x?: number, z?: number, nx?: number, nz?: number }} hit
   */
  notifyCollision(vehicleId, hit) {
    const fired = [];
    for (const a of this.abilities(vehicleId)) {
      if (a.trigger !== 'collision') continue;
      const ab = this.config.abilities[a.abilityId];
      if (hit.strength < (ab.minImpact ?? 0)) continue;
      if (this.trigger(vehicleId, a.abilityId, hit).ok) fired.push(a.abilityId);
    }
    return fired;
  }

  /**
   * Ticks cooldowns and timed abilities. Returns HUD rows for every vehicle with abilities:
   * cooldown01 (1 = just used, 0 = ready) and active01 (time left of a running ability).
   * @param {number} deltaTime seconds
   */
  update(deltaTime) {
    for (const [vehicleId, v] of this.vehicles) {
      for (const [k, cd] of [...v.cooldowns]) {
        cd.left -= deltaTime;
        if (cd.left <= 0) {
          v.cooldowns.delete(k);
          this.emit('abilityReady', { vehicleId, abilityId: k.split(':')[1] });
        }
      }
      for (const [k, a] of [...v.active]) {
        a.left -= deltaTime;
        if (a.left <= 0) this.finishActive(vehicleId, k, a);
      }
    }
    const hud = [];
    for (const vehicleId of this.vehicles.keys()) for (const a of this.abilities(vehicleId)) hud.push({ vehicleId, ...a });
    return hud;
  }

  /** @param {string} vehicleId @param {string} key @param {any} _a */
  finishActive(vehicleId, key, _a) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    v.active.delete(key);
    const abilityId = key.split(':')[1];
    const ab = this.config.abilities[abilityId];
    this.adapter.endAbility?.(vehicleId, { id: abilityId, ...ab });
    if (ab?.whileActive) this.recalculate(vehicleId);
    this.emit('abilityEnded', { vehicleId, abilityId });
  }

  // ------------------------------------------------------------------ saving

  /** Plain data for a save file (slots only; cooldowns start fresh). */
  serialize() {
    /** @type {Record<string, Record<SlotName, string | null>>} */
    const vehicles = {};
    for (const [id, v] of this.vehicles) if (SLOT_NAMES.some((s) => v.slots[s])) vehicles[id] = { ...v.slots };
    return { version: this.config.version ?? 1, vehicles };
  }

  /**
   * Restores slots from `serialize()` output. Streetmon must already be resolvable through the
   * adapter (the game puts them back where it keeps slotted Streetmon). Unknown ones are skipped.
   * @param {any} data
   */
  load(data) {
    this.vehicles.clear();
    for (const [vehicleId, slots] of Object.entries(data?.vehicles ?? {})) {
      const v = this.registerVehicle(vehicleId);
      for (const s of SLOT_NAMES) {
        const id = /** @type {any} */ (slots)?.[s];
        const mon = typeof id === 'string' ? this.adapter.getStreetmon(id) : null;
        if (mon && modFor(this.config, s, mon)) v.slots[s] = id;
      }
      this.recalculate(vehicleId);
    }
  }
}

export default VehicleTuningManager;
