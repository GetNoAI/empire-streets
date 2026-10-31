// @ts-check
import defaultConfig from '../config/street_events.json';

/**
 * Street events: timed, high-stakes open-world incidents that pop up during free roam.
 *
 *   armoredTruck  An armored cash truck with guards drives a route between bank depots. Ram it,
 *                 blow it up or set your Streetmon on it until it's disabled, then grab the cash
 *                 bundles that spill out before the guards (and the police) get you.
 *   turfOutbreak  A swarm of aggressive wild Streetmon takes over a block or an alley. Clear it
 *                 before the police lock the area down: rare items and regional Street Cred.
 *   airdrop       A supply crate parachutes onto a rooftop, an alley or a street, a smoke flare
 *                 marking it. Get there and open it before rival scavengers or the police do:
 *                 capture pods and upgrade chips inside.
 *
 * Lifecycle of each event instance:
 *
 *   SPAWNING -> ACTIVE -> COMPLETED | EXPIRED -> CLEANUP (removed)
 *
 * A new event is rolled every `schedule.intervalSeconds` (8-12 minutes) of free roam: events the
 * player's Street Cred unlocks, off cooldown, with a spawn zone at a sensible distance, picked by
 * `spawnWeight`. Engaging an event (hitting the truck, fighting at a drop) raises the Wanted Level
 * to `policeStarsOnTrigger`. When an event ends, everything it put in the world goes (after a few
 * seconds' grace), collected or not.
 *
 * No engine code here: the game passes an adapter that builds and runs the event in the world
 * (`spawn`, `tick`, `cleanup`) and hands out rewards, and calls `update(dt, ctx)` every frame.
 */

export const EVENT_STATES = /** @type {const} */ ({
  SPAWNING: 'SPAWNING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CLEANUP: 'CLEANUP',
});

export const EVENT_TYPES = /** @type {const} */ (['armoredTruck', 'turfOutbreak', 'airdrop']);
export const ZONE_LAYERS = /** @type {const} */ (['street', 'roof', 'alley']);
const DISTRICTS = ['uptown', 'midtown', 'downtown', 'park'];

const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
const isRange = (/** @type {unknown} */ r) => Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]) && r[0] <= r[1];

/**
 * Checks a street-event config; throws on the first problem.
 * @param {any} cfg
 */
export function validateEventConfig(cfg) {
  const fail = (/** @type {string} */ m) => {
    throw new Error(`street events config: ${m}`);
  };
  if (!cfg || typeof cfg !== 'object') fail('not an object');
  const s = cfg.schedule;
  if (!s || !isRange(s.intervalSeconds) || s.intervalSeconds[0] <= 0) fail('schedule.intervalSeconds must be [min, max] seconds');
  if (!isRange(s.firstEventSeconds)) fail('schedule.firstEventSeconds must be [min, max]');
  if (!(s.maxActive >= 1)) fail('schedule.maxActive must be >= 1');
  if (!isRange(s.spawnDistance)) fail('schedule.spawnDistance must be [min, max] metres');
  if (!(s.lingerSeconds >= 0)) fail('schedule.lingerSeconds must be >= 0');
  if (!(s.retrySeconds > 0)) fail('schedule.retrySeconds must be > 0');
  // Zones.
  const z = cfg.zones;
  if (!z) fail('zones missing');
  const zoneIds = new Set();
  for (const layer of ZONE_LAYERS) {
    if (!Array.isArray(z[layer]) || !z[layer].length) fail(`zones.${layer} must be a non-empty list`);
    for (const n of z[layer]) {
      if (typeof n.id !== 'string' || zoneIds.has(n.id)) fail(`zone id missing or repeated: ${n.id}`);
      zoneIds.add(n.id);
      if (!isNum(n.x) || !isNum(n.z)) fail(`zone ${n.id}: x and z required`);
      if (layer === 'roof' && !isNum(n.y)) fail(`zone ${n.id}: rooftop zones need y (roof height)`);
      if (!DISTRICTS.includes(n.district)) fail(`zone ${n.id}: district must be one of ${DISTRICTS.join(', ')}`);
    }
  }
  if (!Array.isArray(z.depots) || z.depots.length < 2) fail('zones.depots needs at least two truck depots');
  for (const d of z.depots) if (typeof d.id !== 'string' || !isNum(d.x) || !isNum(d.z)) fail(`depot ${d.id}: id, x, z required`);
  // Events.
  if (!Array.isArray(cfg.events) || !cfg.events.length) fail('no events');
  const ids = new Set();
  for (const e of cfg.events) {
    const w = `event "${e.id}"`;
    if (typeof e.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(e.id) || ids.has(e.id)) fail(`${w}: id missing, invalid or repeated`);
    ids.add(e.id);
    if (!EVENT_TYPES.includes(e.eventType)) fail(`${w}: eventType must be one of ${EVENT_TYPES.join(', ')}`);
    if (typeof e.name !== 'string' || !e.name) fail(`${w}: name missing`);
    if (!(e.spawnWeight > 0)) fail(`${w}: spawnWeight must be > 0`);
    if (!(e.durationSeconds >= 30)) fail(`${w}: durationSeconds must be >= 30`);
    if (!(Number.isInteger(e.policeStarsOnTrigger) && e.policeStarsOnTrigger >= 0 && e.policeStarsOnTrigger <= 5)) fail(`${w}: policeStarsOnTrigger must be 0-5`);
    if (!(e.requiredStreetCred >= 0)) fail(`${w}: requiredStreetCred must be >= 0`);
    if (!(e.cooldownSeconds >= 0)) fail(`${w}: cooldownSeconds must be >= 0`);
    const layers = e.eventType === 'armoredTruck' ? ['street'] : e.zoneLayers;
    if (!Array.isArray(layers) || !layers.length || layers.some((/** @type {string} */ l) => !ZONE_LAYERS.includes(/** @type {any} */ (l)))) fail(`${w}: zoneLayers must list street, roof and/or alley`);
    const r = e.rewards;
    if (!r || !isRange(r.cash) || r.cash[0] < 0) fail(`${w}: rewards.cash must be [min, max]`);
    if (!(r.streetCred >= 0) || !(r.regionalCred >= 0)) fail(`${w}: rewards.streetCred and regionalCred must be >= 0`);
    for (const it of r.items ?? []) if (typeof it.id !== 'string' || !(it.chance > 0 && it.chance <= 1) || !(it.count >= 1)) fail(`${w}: reward item needs id, chance (0-1], count >= 1`);
    if (r.upgradeChips && (!(r.upgradeChips.chance > 0 && r.upgradeChips.chance <= 1) || !(r.upgradeChips.count >= 1))) fail(`${w}: rewards.upgradeChips needs chance and count`);
    if (e.eventType === 'armoredTruck') {
      const t = e.truck;
      if (!t || !(t.armor >= 1) || !(t.disableAt > 0 && t.disableAt < 1) || !(t.guards >= 0) || !isRange(t.bundles) || !isRange(t.bundleValue)) fail(`${w}: truck needs armor >= 1, disableAt (0-1), guards, bundles and bundleValue ranges`);
      if (!(t.cruisePace > 0 && t.cruisePace <= 1) || !(t.fleePace > 0 && t.fleePace <= 1)) fail(`${w}: truck paces must be (0, 1]`);
    }
    if (e.eventType === 'turfOutbreak') {
      const o = e.swarm;
      if (!o || !isRange(o.count) || o.count[0] < 1 || !isRange(o.levelOffset) || !(o.radius > 0)) fail(`${w}: swarm needs count, levelOffset and radius`);
      if (!(e.lockdownSeconds > 0 && e.lockdownSeconds <= e.durationSeconds)) fail(`${w}: lockdownSeconds must be > 0 and within durationSeconds`);
    }
    if (e.eventType === 'airdrop') {
      const a = e.drop;
      if (!a || !(a.fallSeconds > 0) || !(a.openSeconds > 0) || !(a.scavengers >= 0) || !(a.rivalEtaSeconds > 0)) fail(`${w}: drop needs fallSeconds, openSeconds, scavengers and rivalEtaSeconds`);
    }
  }
  return true;
}

/**
 * @typedef {'SPAWNING'|'ACTIVE'|'COMPLETED'|'EXPIRED'|'CLEANUP'} EventState
 * @typedef {{ id: string, x: number, y?: number, z: number, district: string, label?: string }} Zone
 * @typedef {{ x: number, z: number, layer: string, district?: string, streetCred: number, busy?: boolean, partyLevel?: number }} EventContext
 * @typedef {{ cash: number, items: Array<{ id: string, count: number }>, chips: number, streetCred: number, regionalCred: number, district: string }} Reward
 */

let uid = 1;

export class StreetEventManager {
  /**
   * @param {{ adapter: any, config?: any, rng?: () => number }} opts
   */
  constructor({ adapter, config = defaultConfig, rng = Math.random }) {
    validateEventConfig(config);
    this.config = config;
    this.adapter = adapter;
    this.rng = rng;
    /** @type {any[]} */
    this.active = [];
    /** Seconds of free roam until the next roll. */
    this.timer = this.range(config.schedule.firstEventSeconds);
    /** @type {Record<string, number>} event id -> game time it can come back */
    this.cooldownUntil = {};
    /** Street Cred earned per district from events. */
    /** @type {Record<string, number>} */
    this.regionalCred = { uptown: 0, midtown: 0, downtown: 0, park: 0 };
    /** Upgrade chips owned (each boosts every car the player drives). */
    this.chips = 0;
    this.stats = { spawned: 0, completed: 0, expired: 0, byType: /** @type {Record<string, number>} */ ({}) };
    this.time = 0;
    /** @type {string | null} */
    this.lastZone = null;
    /** @type {Record<string, Array<(e: any) => void>>} */
    this.handlers = {};
  }

  /** @param {string} type @param {(e: any) => void} fn */
  on(type, fn) {
    (this.handlers[type] ??= []).push(fn);
    return () => {
      this.handlers[type] = this.handlers[type].filter((f) => f !== fn);
    };
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const f of this.handlers[type] ?? []) f(e);
  }

  /** @param {number[]} r */
  range(r) {
    return r[0] + (r[1] - r[0]) * this.rng();
  }

  /** @param {number[]} r */
  rangeInt(r) {
    return Math.floor(r[0] + (r[1] - r[0] + 1) * this.rng());
  }

  /** @param {string} id */
  def(id) {
    return this.config.events.find((/** @type {any} */ e) => e.id === id) ?? null;
  }

  /**
   * Zones an event could use from where the player is.
   * @param {any} def @param {EventContext} ctx @returns {Zone[]}
   */
  zonesFor(def, ctx) {
    const s = this.config.schedule;
    if (def.eventType === 'armoredTruck') {
      return this.config.zones.depots.filter((/** @type {Zone} */ d) => {
        const dist = Math.hypot(d.x - ctx.x, d.z - ctx.z);
        return dist >= s.spawnDistance[0] && dist <= s.spawnDistance[1] && d.id !== this.lastZone;
      });
    }
    /** @type {Zone[]} */
    const out = [];
    for (const layer of def.zoneLayers) {
      const max = layer === 'roof' ? Math.min(s.spawnDistance[1], s.roofMaxDistance ?? s.spawnDistance[1]) : s.spawnDistance[1];
      for (const z of this.config.zones[layer]) {
        const dist = Math.hypot(z.x - ctx.x, z.z - ctx.z);
        if (dist < s.spawnDistance[0] || dist > max || z.id === this.lastZone) continue;
        if (this.adapter.zoneFree && !this.adapter.zoneFree(z, layer, def)) continue;
        out.push({ ...z, layer });
      }
    }
    return out;
  }

  /**
   * Events that could start now, with their candidate zones.
   * @param {EventContext} ctx
   */
  eligible(ctx) {
    return this.config.events
      .filter((/** @type {any} */ e) => ctx.streetCred >= e.requiredStreetCred && (this.cooldownUntil[e.id] ?? 0) <= this.time)
      .filter((/** @type {any} */ e) => !this.active.some((a) => a.def.eventType === e.eventType))
      .map((/** @type {any} */ e) => ({ def: e, zones: this.zonesFor(e, ctx) }))
      .filter((/** @type {any} */ c) => c.zones.length > 0);
  }

  /**
   * Weighted pick among eligible events (null if none).
   * @param {EventContext} ctx
   */
  pick(ctx) {
    const list = this.eligible(ctx);
    if (!list.length) return null;
    const total = list.reduce((a, c) => a + c.def.spawnWeight, 0);
    let r = this.rng() * total;
    for (const c of list) {
      r -= c.def.spawnWeight;
      if (r <= 0) return c;
    }
    return list[list.length - 1];
  }

  /**
   * Starts an event now (a debug command, a mission script, or the scheduler).
   * @param {string} id @param {EventContext} ctx @param {string} [zoneId]
   * @returns {any | null} the instance, or null if it couldn't start
   */
  start(id, ctx, zoneId) {
    const def = this.def(id);
    if (!def) return null;
    /** @type {any[]} */
    let zones = this.zonesFor(def, { ...ctx });
    if (zoneId) {
      const all = def.eventType === 'armoredTruck' ? this.config.zones.depots.map((/** @type {Zone} */ d) => ({ ...d, layer: 'street' })) : def.zoneLayers.flatMap((/** @type {string} */ l) => this.config.zones[l].map((/** @type {Zone} */ z) => ({ ...z, layer: l })));
      zones = all.filter((/** @type {Zone} */ z) => z.id === zoneId);
    }
    if (!zones.length) return null;
    // Nearer zones a bit more likely (the action should be findable).
    const weights = zones.map((z) => 1 / Math.max(60, Math.hypot(z.x - ctx.x, z.z - ctx.z)));
    let r = this.rng() * weights.reduce((a, b) => a + b, 0);
    let zone = zones[0];
    for (let i = 0; i < zones.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        zone = zones[i];
        break;
      }
    }
    const inst = {
      uid: uid++,
      id: def.id,
      def,
      type: def.eventType,
      zone,
      /** Truck: where it's headed (the farthest depot from the start, give or take). */
      destination: def.eventType === 'armoredTruck' ? this.destinationFor(zone) : null,
      state: /** @type {EventState} */ ('SPAWNING'),
      stateTime: 0,
      timeLeft: def.durationSeconds,
      engaged: false,
      progress: 0,
      objective: '',
      /** Live position for markers (a moving truck). */
      pos: { x: zone.x, z: zone.z },
      seed: Math.floor(this.rng() * 2 ** 31),
      outcome: /** @type {string | null} */ (null),
      reason: '',
      reward: /** @type {Reward | null} */ (null),
      earned: 0,
      cleaned: false,
    };
    const ok = this.adapter.spawn(inst);
    if (ok === false) return null;
    this.active.push(inst);
    this.lastZone = zone.id;
    this.stats.spawned++;
    this.stats.byType[def.eventType] = (this.stats.byType[def.eventType] ?? 0) + 1;
    this.adapter.notify?.(`${def.name}: ${def.announce ?? 'something is going down nearby.'}`, 5000);
    this.emit('spawned', inst);
    this.emit('state', { inst, from: null, to: 'SPAWNING' });
    return inst;
  }

  /** @param {Zone} start */
  destinationFor(start) {
    const far = this.config.zones.depots
      .filter((/** @type {Zone} */ d) => d.id !== start.id)
      .map((/** @type {Zone} */ d) => ({ d, dist: Math.hypot(d.x - start.x, d.z - start.z) }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b.dist - a.dist);
    // One of the three farthest depots.
    return far[Math.floor(this.rng() * Math.min(3, far.length))].d;
  }

  /** @param {any} inst @param {EventState} to */
  setState(inst, to) {
    const from = inst.state;
    if (from === to) return;
    inst.state = to;
    inst.stateTime = 0;
    this.emit('state', { inst, from, to });
  }

  /**
   * Rolls the reward for a completed event.
   * @param {any} inst @returns {Reward}
   */
  rollReward(inst) {
    const r = inst.def.rewards;
    const items = [];
    for (const it of r.items ?? []) if (this.rng() < it.chance) items.push({ id: it.id, count: it.count });
    const chips = r.upgradeChips && this.rng() < r.upgradeChips.chance ? r.upgradeChips.count : 0;
    return {
      cash: Math.round(this.range(r.cash) / 10) * 10,
      items,
      chips,
      streetCred: r.streetCred,
      regionalCred: r.regionalCred,
      district: inst.zone.district,
    };
  }

  /** @param {any} inst */
  grant(inst) {
    if (inst.reward) return inst.reward;
    const rw = this.rollReward(inst);
    inst.reward = rw;
    if (rw.cash) this.adapter.earn?.(rw.cash);
    for (const it of rw.items) this.adapter.addItem?.(it.id, it.count);
    if (rw.chips) {
      const max = this.config.upgradeChips?.max ?? 5;
      const before = this.chips;
      this.chips = Math.min(max, this.chips + rw.chips);
      rw.chips = this.chips - before;
      if (rw.chips) this.adapter.chipsChanged?.(this.chips);
    }
    if (rw.streetCred) this.adapter.addStreetCred?.(rw.streetCred);
    if (rw.regionalCred) this.regionalCred[rw.district] = (this.regionalCred[rw.district] ?? 0) + rw.regionalCred;
    return rw;
  }

  /**
   * Ends an event early (game over, a new game, a mission taking over).
   * @param {any} inst @param {string} reason
   */
  abort(inst, reason) {
    if (inst.state === 'CLEANUP') return;
    inst.reason = reason;
    if (inst.state !== 'COMPLETED' && inst.state !== 'EXPIRED') this.setState(inst, 'EXPIRED');
    this.cleanup(inst);
  }

  /** Ends and removes every event now. @param {string} [reason] */
  clear(reason = 'cleared') {
    for (const inst of [...this.active]) this.abort(inst, reason);
  }

  /** @param {any} inst */
  cleanup(inst) {
    if (!inst.cleaned) {
      inst.cleaned = true;
      this.setState(inst, 'CLEANUP');
      this.adapter.cleanup(inst);
    }
    this.active = this.active.filter((a) => a !== inst);
    this.cooldownUntil[inst.id] = this.time + (inst.def.cooldownSeconds ?? 0);
    if (!this.active.length) this.timer = this.range(this.config.schedule.intervalSeconds);
  }

  /**
   * Per frame. Returns HUD lines for the active events.
   * @param {number} dt @param {EventContext} ctx
   */
  update(dt, ctx) {
    this.time += dt;
    const s = this.config.schedule;
    // Scheduler: only counts down in free roam with nothing else going on.
    if (this.active.length < s.maxActive && !ctx.busy && (s.layers ?? ['street', 'roof']).includes(ctx.layer)) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const choice = this.pick(ctx);
        const inst = choice ? this.start(choice.def.id, ctx) : null;
        // Nothing fits right now: try again shortly.
        if (!inst) this.timer = s.retrySeconds;
        else this.timer = this.range(s.intervalSeconds);
      }
    }
    for (const inst of [...this.active]) this.step(inst, dt, ctx);
    return this.hud();
  }

  /** @param {any} inst @param {number} dt @param {EventContext} ctx */
  step(inst, dt, ctx) {
    inst.stateTime += dt;
    const s = this.config.schedule;
    if (inst.state === 'COMPLETED' || inst.state === 'EXPIRED') {
      // Grace period (grab the last bundle, watch the wreck burn), then everything goes.
      this.adapter.tick?.(inst, dt, ctx);
      if (inst.stateTime >= s.lingerSeconds) this.cleanup(inst);
      return;
    }
    const r = this.adapter.tick(inst, dt, ctx) ?? {};
    if (r.pos) inst.pos = r.pos;
    if (typeof r.progress === 'number') inst.progress = r.progress;
    if (typeof r.objective === 'string') inst.objective = r.objective;
    if (typeof r.earned === 'number') inst.earned = r.earned;
    if (inst.state === 'SPAWNING') {
      if (r.phase === 'active' || (r.phase === undefined && inst.stateTime > 0)) this.setState(inst, 'ACTIVE');
    } else inst.timeLeft -= dt;
    // Police hook: the first time the player gets involved, the heat comes.
    if (r.engaged && !inst.engaged) {
      inst.engaged = true;
      if (inst.def.policeStarsOnTrigger > 0) this.adapter.raiseWanted?.(inst.def.policeStarsOnTrigger, inst);
      this.emit('engaged', inst); // after the heat, so listeners see the new Wanted Level
    }
    if (r.outcome === 'completed') {
      inst.outcome = 'completed';
      this.setState(inst, 'COMPLETED');
      this.stats.completed++;
      const rw = this.grant(inst);
      this.emit('resolved', { inst, ok: true, reward: rw });
    } else if (r.outcome === 'failed' || inst.timeLeft <= 0) {
      inst.outcome = 'expired';
      inst.reason = r.outcome === 'failed' ? r.reason ?? 'failed' : 'timeout';
      this.setState(inst, 'EXPIRED');
      this.stats.expired++;
      this.emit('resolved', { inst, ok: false, reason: inst.reason });
    }
  }

  /** HUD lines for the active events. */
  hud() {
    return this.active.map((inst) => ({
      uid: inst.uid,
      id: inst.id,
      type: inst.type,
      name: inst.def.name,
      state: inst.state,
      objective: inst.objective,
      timeLeft: Math.max(0, inst.timeLeft),
      progress: inst.progress,
      engaged: inst.engaged,
      stars: inst.def.policeStarsOnTrigger,
      x: inst.pos.x,
      z: inst.pos.z,
      layer: inst.zone.layer ?? 'street',
      district: inst.zone.district,
    }));
  }

  /** Map markers for live events. */
  markers() {
    return this.active
      .filter((i) => i.state === 'SPAWNING' || i.state === 'ACTIVE')
      .map((i) => ({ type: i.type, x: i.pos.x, z: i.pos.z, label: i.def.name, layer: i.zone.layer ?? 'street' }));
  }

  /** Seconds of free roam until the next event roll. */
  get timeToNext() {
    return this.active.length ? null : Math.max(0, this.timer);
  }

  serialize() {
    return { regionalCred: { ...this.regionalCred }, chips: this.chips, timer: Math.round(this.timer), stats: { ...this.stats, byType: { ...this.stats.byType } } };
  }

  /** @param {any} d */
  load(d) {
    if (!d || typeof d !== 'object') return;
    this.clear('loaded');
    for (const k of DISTRICTS) this.regionalCred[k] = Math.max(0, Math.round(Number(d.regionalCred?.[k]) || 0));
    this.chips = Math.max(0, Math.min(this.config.upgradeChips?.max ?? 5, Math.round(Number(d.chips) || 0)));
    if (isNum(d.timer) && d.timer > 0) this.timer = Math.min(d.timer, this.config.schedule.intervalSeconds[1]);
    if (d.stats) this.stats = { spawned: d.stats.spawned | 0, completed: d.stats.completed | 0, expired: d.stats.expired | 0, byType: { ...(d.stats.byType ?? {}) } };
  }
}
