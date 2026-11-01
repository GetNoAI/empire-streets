// @ts-check
import defaultConfig from '../config/races.json';

/**
 * Pop-up street races.
 *
 * Every few minutes of free-roam driving there's a chance a race is offered nearby; racing
 * organisers waiting at each track's start line offer one when you pull up. Accept, drive to the
 * grid, and after a 3-2-1 you race NPC drivers through checkpoints to the finish for cash and
 * Street Cred. Track props (barricades, cones, tyre stacks, boost pads, ramps) exist only for the
 * race. Stars picked up during the race don't stick: when it ends (win, loss, busted, wasted, or
 * giving up) the Wanted Level goes back to what it was before.
 *
 *   IDLE -> PROMPT -> COUNTDOWN -> RACING -> CLEANUP -> RESOLVED -> IDLE
 *
 * The module has no engine code. The game gives it an adapter (spawning props and racers, money,
 * the wanted level, respawning) and calls `update(dt, ctx)` every frame with where the player is.
 */

export const RACE_STATES = /** @type {const} */ ({
  IDLE: 'IDLE',
  PROMPT: 'PROMPT',
  COUNTDOWN: 'COUNTDOWN',
  RACING: 'RACING',
  CLEANUP: 'CLEANUP',
  RESOLVED: 'RESOLVED',
});

const PROP_TYPES = ['barricade', 'cones', 'tireStack', 'boostPad', 'ramp'];

/**
 * Race modes:
 *  - sprint: point to point against rivals (one lap);
 *  - circuit: laps against rivals;
 *  - knockout: laps against rivals; at the end of every lap but the last, whoever is last is out;
 *  - timeTrial: you alone against the clock; medal times decide the prize (gold = 1st);
 *  - drift: you alone, score points sliding round the course (angle x speed); medal scores decide.
 */
export const RACE_MODES = /** @type {const} */ (['sprint', 'circuit', 'knockout', 'timeTrial', 'drift']);
/** Car classes, slowest first (Performance.ts). */
export const CLASS_ORDER = ['D', 'C', 'B', 'A', 'S'];

export const MODE_NAMES = { sprint: 'Sprint', circuit: 'Circuit', knockout: 'Knockout', timeTrial: 'Time Trial', drift: 'Drift' };

/** A track's mode (older tracks: by lap count). @param {any} t */
export function modeOf(t) {
  if (t.mode) return t.mode;
  return t.laps > 1 ? 'circuit' : 'sprint';
}

/** Solo modes have no rival racers. @param {string} mode */
export const isSolo = (mode) => mode === 'timeTrial' || mode === 'drift';

/**
 * Can a car of class `cls` enter a track (none given: any car)? @param {string | null | undefined} cls @param {any} track
 */
export function classOk(cls, track) {
  if (!track.maxClass) return true;
  if (!cls) return true;
  return CLASS_ORDER.indexOf(cls) <= CLASS_ORDER.indexOf(track.maxClass);
}

/**
 * The placing a solo result earns: a time trial by medal time, a drift event by medal score
 * (1 gold, 2 silver, 3 bronze, 4 none). @param {any} track @param {number} value
 */
export function medalPlace(track, value) {
  const m = track.medals ?? {};
  if (modeOf(track) === 'timeTrial') return value <= m.gold ? 1 : value <= m.silver ? 2 : value <= m.bronze ? 3 : 4;
  return value >= m.gold ? 1 : value >= m.silver ? 2 : value >= m.bronze ? 3 : 4;
}

/**
 * Drift points for one frame: the slide angle (degrees) times speed (m/s), above 8 degrees and
 * 5 m/s, with a chain multiplier that grows the longer a slide lasts (up to x4) and resets when
 * the slide ends. Returns the points to add and the new chain.
 * @param {number} dt @param {number} angleDeg @param {number} speed @param {number} chain  seconds of continuous sliding so far
 */
export function driftPoints(dt, angleDeg, speed, chain) {
  const a = Math.abs(angleDeg);
  if (a < 8 || speed < 5) return { points: 0, chain: 0 };
  const mult = 1 + Math.min(3, chain / 2);
  return { points: a * speed * 0.12 * mult * dt, chain: chain + dt };
}
const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Checks a race config; throws with a clear message on the first problem.
 * @param {any} cfg
 */
export function validateRaceConfig(cfg) {
  const fail = (/** @type {string} */ m) => {
    throw new Error(`races config: ${m}`);
  };
  if (!cfg || !Array.isArray(cfg.tracks) || !cfg.tracks.length) fail('no tracks');
  const ids = new Set();
  for (const t of cfg.tracks) {
    const w = `track "${t.id}"`;
    if (typeof t.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(t.id) || ids.has(t.id)) fail(`${w}: id missing, invalid or repeated`);
    ids.add(t.id);
    if (typeof t.name !== 'string' || !t.name) fail(`${w}: needs a name`);
    if (!(t.entryFee >= 0)) fail(`${w}: entryFee must be 0 or more`);
    const p = t.payouts ?? {};
    if (!(p.first >= p.second && p.second >= p.third && p.third >= 0)) fail(`${w}: payouts must go first >= second >= third >= 0`);
    if (!(t.laps >= 1 && Number.isInteger(t.laps))) fail(`${w}: laps must be a whole number >= 1`);
    const mode = modeOf(t);
    if (!RACE_MODES.includes(mode)) fail(`${w}: unknown mode "${t.mode}" (use ${RACE_MODES.join(', ')})`);
    if (mode === 'knockout' && t.laps < 2) fail(`${w}: a knockout needs at least 2 laps`);
    if (mode === 'circuit' && t.laps < 2) fail(`${w}: a circuit needs at least 2 laps`);
    if (t.maxClass !== undefined && t.maxClass !== null && !CLASS_ORDER.includes(t.maxClass)) fail(`${w}: maxClass must be one of ${CLASS_ORDER.join(', ')}`);
    if (mode === 'timeTrial') {
      const m = t.medals ?? {};
      if (!(m.gold > 0 && m.silver >= m.gold && m.bronze >= m.silver)) fail(`${w}: a time trial needs medals { gold, silver, bronze } in seconds, gold the fastest`);
    }
    if (mode === 'drift') {
      const m = t.medals ?? {};
      if (!(m.bronze > 0 && m.silver >= m.bronze && m.gold >= m.silver)) fail(`${w}: a drift event needs medals { bronze, silver, gold } scores, gold the highest`);
    }
    if (!(t.timeLimit > 10)) fail(`${w}: timeLimit (seconds) too short`);
    if (!t.start || !isNum(t.start.x) || !isNum(t.start.z) || !isNum(t.start.heading)) fail(`${w}: start needs x, z, heading`);
    if (!Array.isArray(t.checkpointPositions) || t.checkpointPositions.length < 2) fail(`${w}: needs at least 2 checkpoints`);
    for (const c of t.checkpointPositions) if (!isNum(c.x) || !isNum(c.z)) fail(`${w}: checkpoint without x/z`);
    for (const o of t.temporaryObstacles ?? []) {
      if (!PROP_TYPES.includes(o.type)) fail(`${w}: unknown obstacle type "${o.type}" (use ${PROP_TYPES.join(', ')})`);
      if (!isNum(o.x) || !isNum(o.z) || !isNum(o.rotationY ?? 0)) fail(`${w}: obstacle without x/z/rotationY`);
    }
  }
  const pool = cfg.racers?.pool ?? [];
  if (pool.length < (cfg.racers?.count ?? 0)) fail('not enough racers in the pool for racers.count');
  return cfg;
}

/**
 * Every checkpoint of a race in order, laps expanded. The last one is the finish.
 * @param {any} track
 * @returns {Array<{ x: number, z: number, index: number, lap: number, finish: boolean }>}
 */
export function buildCourse(track) {
  const out = [];
  const n = track.checkpointPositions.length;
  for (let lap = 0; lap < track.laps; lap++)
    for (let i = 0; i < n; i++) {
      const c = track.checkpointPositions[i];
      out.push({ x: c.x, z: c.z, index: out.length, lap: lap + 1, finish: lap === track.laps - 1 && i === n - 1 });
    }
  return out;
}

/**
 * Grid slots behind the start line, two abreast.
 * @param {any} track @param {number} count @param {any} rules
 */
export function gridSlots(track, count, rules = {}) {
  const fx = Math.cos(track.start.heading);
  const fz = -Math.sin(track.start.heading);
  const rx = -fz;
  const rz = fx;
  const row = rules.gridRowSpacing ?? 8;
  const col = rules.gridColumnOffset ?? 2.2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    out.push({ x: track.start.x - fx * r * row + rx * side * col, z: track.start.z - fz * r * row + rz * side * col, heading: track.start.heading });
  }
  return out;
}

/**
 * How far along the course a racer is: checkpoints passed plus the fraction of the way to the
 * next one (for live standings).
 * @param {number} passed @param {{ x: number, z: number }} pos @param {Array<{ x: number, z: number }>} course @param {{ x: number, z: number }} start
 */
export function progressOf(passed, pos, course, start) {
  if (passed >= course.length) return course.length;
  const prev = passed === 0 ? start : course[passed - 1];
  const next = course[passed];
  const seg = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
  const left = Math.hypot(next.x - pos.x, next.z - pos.z);
  // Can go below 0 behind the start line, so the grid order shows before the first checkpoint.
  return passed + Math.max(-1, Math.min(0.999, 1 - left / seg));
}

/**
 * What a placing pays: cash for 1st-3rd, Street Cred for the podium (or a little for finishing).
 * @param {any} track @param {number | null} place
 */
export function payoutFor(track, place) {
  if (place === null) return { cash: 0, cred: 0 };
  const keys = ['first', 'second', 'third'];
  const k = keys[place - 1];
  return { cash: k ? track.payouts[k] ?? 0 : 0, cred: k ? track.streetCred?.[k] ?? 0 : track.streetCred?.finish ?? 0 };
}

/**
 * The props of one race, spawned through a factory and kept in a registry so they can all be
 * removed again. `factory(def, track)` returns something with `dispose()` (and optionally
 * `setState(state)` for checkpoint markers).
 */
export class RaceTrackInstance {
  /**
   * @param {any} track
   * @param {(def: any, track: any) => { dispose(): void, setState?(s: string): void }} factory
   */
  constructor(track, factory) {
    this.track = track;
    this.factory = factory;
    /** @type {Array<{ def: any, handle: { dispose(): void, setState?(s: string): void } }>} */
    this.registry = [];
    /** @type {Array<{ dispose(): void, setState?(s: string): void }>} */
    this.markers = [];
    this.disposed = false;
  }

  /** Spawns every obstacle and a marker per checkpoint. */
  spawn() {
    for (const o of this.track.temporaryObstacles ?? []) this.add(o);
    const course = buildCourse(this.track);
    // One marker per position on the lap (markers are reused across laps).
    this.track.checkpointPositions.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
      const finishHere = i === this.track.checkpointPositions.length - 1;
      this.markers.push(this.add({ type: finishHere ? 'finishMarker' : 'checkpointMarker', x: c.x, z: c.z, rotationY: 0, radius: this.track.checkpointRadius ?? 14 }));
    });
    return course;
  }

  /** @param {any} def */
  add(def) {
    const handle = this.factory(def, this.track);
    this.registry.push({ def, handle });
    return handle;
  }

  /**
   * Highlights the markers: the one you're heading for, the one after, the rest hidden.
   * @param {number} nextIndex index into the expanded course
   */
  highlight(nextIndex) {
    const n = this.markers.length;
    const total = n * this.track.laps;
    this.markers.forEach((m, i) => m.setState?.('hidden'));
    if (nextIndex < total) this.markers[nextIndex % n]?.setState?.('current');
    if (nextIndex + 1 < total && (nextIndex + 1) % n !== nextIndex % n) this.markers[(nextIndex + 1) % n]?.setState?.('next');
  }

  get count() {
    return this.registry.length;
  }

  /** Removes everything this race spawned. Safe to call twice. */
  dispose() {
    for (const r of this.registry) r.handle.dispose();
    this.registry.length = 0;
    this.markers.length = 0;
    this.disposed = true;
  }
}

/**
 * @typedef {Object} RaceAdapter
 * @property {(def: any, track: any) => { dispose(): void, setState?(s: string): void }} spawnProp
 * @property {(track: any, slots: Array<{x:number,z:number,heading:number}>, drivers: any[], course: any[]) => string[]} spawnRacers  returns racer ids
 * @property {(dt: number, info: { state: string, course: any[], progress: Map<string, number>, standings: string[] }) => void} [updateRacers]
 * @property {(id: string) => ({ x: number, z: number } | null)} racerPosition
 * @property {() => void} removeRacers
 * @property {(id: string) => void} [removeRacer]  one racer knocked out
 * @property {() => (string | null)} [carClass]  the player's car's class letter (D..S), for class-limited races
 * @property {(slot: {x:number,z:number,heading:number}) => boolean} placePlayer
 * @property {(hold: boolean) => void} holdPlayer
 * @property {() => number} getMoney
 * @property {(n: number) => boolean} spend
 * @property {(n: number) => void} earn
 * @property {() => { stars: number, heat: number }} getWanted
 * @property {(snapshot: { stars: number, heat: number }) => void} restoreWanted  clears chasers, sets the level back
 * @property {(where: {x:number,z:number,heading:number}, reason: string) => void} [respawnAt]
 * @property {(text: string, ms?: number) => void} [notify]
 * @property {(text: string, color: string, ms: number) => void} [showBig]
 */

/**
 * @typedef {Object} RaceContext
 * @property {boolean} inVehicle
 * @property {number} x
 * @property {number} z
 * @property {number} speed  m/s
 * @property {boolean} freeRoam  playing on the street, no menus or battles (offers can appear)
 * @property {boolean} [dead]
 * @property {number} [driftAngle]  the car's slide angle (degrees) for drift events
 */

export class StreetRaceManager {
  /**
   * @param {{ adapter: RaceAdapter, config?: any, rng?: () => number }} opts
   */
  constructor({ adapter, config = defaultConfig, rng = Math.random }) {
    this.config = validateRaceConfig(config);
    this.adapter = adapter;
    this.rng = rng;
    /** @type {keyof typeof RACE_STATES} */
    this.state = 'IDLE';
    this.streetCred = 0;
    /** Best times, laps and drift scores per track (saved). @type {Record<string, { best?: number, bestLap?: number, score?: number }>} */
    this.records = {};
    /** Seconds until the next pop-up roll. */
    this.rollIn = this.nextRoll();
    this.cooldown = 0;
    /** @type {{ track: any, source: 'popup' | 'organizer', expiresIn: number, accepted: boolean, reachIn: number } | null} */
    this.offer = null;
    /** @type {any} */
    this.race = null;
    /** @type {any} */
    this.result = null;
    this.stateTime = 0;
    /** @type {Map<string, Set<(e: any) => void>>} */
    this.listeners = new Map();
  }

  // ------------------------------------------------------------------ events

  /** @param {'offer' | 'accepted' | 'countdown' | 'go' | 'checkpoint' | 'lap' | 'knockout' | 'finished' | 'failed' | 'resolved' | 'cleanup' | 'state'} type @param {(e: any) => void} fn */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  /** @param {keyof typeof RACE_STATES} s */
  setState(s) {
    if (this.state === s) return;
    const from = this.state;
    this.state = s;
    this.stateTime = 0;
    this.emit('state', { from, to: s });
  }

  get active() {
    return this.state === 'COUNTDOWN' || this.state === 'RACING';
  }

  /** Tracks you can enter now (Street Cred). */
  eligibleTracks() {
    return this.config.tracks.filter((/** @type {any} */ t) => (t.minStreetCred ?? 0) <= this.streetCred);
  }

  /** @param {string} id */
  track(id) {
    return this.config.tracks.find((/** @type {any} */ t) => t.id === id) ?? null;
  }

  nextRoll() {
    const [a, b] = this.config.popUp?.rollEverySeconds ?? [300, 600];
    return a + this.rng() * (b - a);
  }

  // ------------------------------------------------------------------ offers

  /**
   * Offers a race (pop-up or at an organiser). Returns false if one can't be offered now.
   * @param {string} trackId @param {'popup' | 'organizer'} source
   */
  offerRace(trackId, source = 'popup') {
    if (this.state !== 'IDLE') return false;
    const track = this.track(trackId);
    if (!track || (track.minStreetCred ?? 0) > this.streetCred) return false;
    this.offer = { track, source, expiresIn: source === 'popup' ? this.config.popUp?.offerSeconds ?? 20 : Infinity, accepted: false, reachIn: this.config.popUp?.reachGridSeconds ?? 120 };
    this.setState('PROMPT');
    this.emit('offer', { track, source });
    return true;
  }

  /** Takes the offer: now drive to the grid. */
  accept() {
    if (this.state !== 'PROMPT' || !this.offer || this.offer.accepted) return false;
    const cls = this.adapter.carClass?.() ?? null;
    if (!classOk(cls, this.offer.track)) {
      this.adapter.notify?.(`${this.offer.track.name} is for class ${this.offer.track.maxClass} cars and below. Yours is class ${cls}.`, 4000);
      this.decline();
      return false;
    }
    this.offer.accepted = true;
    this.offer.expiresIn = Infinity;
    this.emit('accepted', { track: this.offer.track });
    return true;
  }

  /** Turns the offer down (or gives up driving to the grid). */
  decline() {
    if (this.state !== 'PROMPT') return false;
    this.offer = null;
    this.setState('IDLE');
    this.cooldown = Math.max(this.cooldown, 20);
    return true;
  }

  // ------------------------------------------------------------------ race lifecycle

  /** Lines everyone up and starts the countdown (called when the player reaches the grid). */
  startRace() {
    const offer = this.offer;
    if (!offer) return false;
    const track = offer.track;
    const fee = track.entryFee ?? 0;
    if (fee > 0 && !this.adapter.spend(fee)) {
      this.adapter.notify?.(`You need $${fee} for the entry fee.`, 3000);
      this.decline();
      return false;
    }
    const rules = this.config.rules ?? {};
    const preRace = this.adapter.getWanted();
    const mode = modeOf(track);
    const solo = isSolo(mode);
    const n = solo ? 0 : this.config.racers?.count ?? 3;
    const slots = gridSlots(track, n + 1, rules);
    const playerSlot = rules.playerGridSlot === 'last' ? n : 0;
    const npcSlots = slots.filter((_, i) => i !== playerSlot);
    // Pick drivers from the pool (no repeats).
    const pool = [...(this.config.racers?.pool ?? [])];
    const drivers = [];
    for (let i = 0; i < n && pool.length; i++) drivers.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    const instance = new RaceTrackInstance(track, this.adapter.spawnProp);
    const course = instance.spawn();
    const ids = n ? this.adapter.spawnRacers(track, npcSlots, drivers, course) : [];
    this.adapter.placePlayer(slots[playerSlot]);
    this.adapter.holdPlayer(true);
    this.race = {
      track,
      instance,
      course,
      preRace,
      grid: slots[playerSlot],
      time: 0,
      countdown: rules.countdownSeconds ?? 3,
      outOfCar: 0,
      mode,
      racers: [
        { id: 'player', name: 'You', player: true, passed: 0, finishedAt: null, progress: 0, lapStart: 0, lastLap: null, bestLap: null, out: false },
        ...ids.map((id, i) => ({ id, name: drivers[i]?.name ?? `Racer ${i + 1}`, player: false, passed: 0, finishedAt: null, progress: 0, skill: drivers[i]?.skill ?? 0.9, lapStart: 0, lastLap: null, bestLap: null, out: false })),
      ],
      lastWhole: Math.ceil(rules.countdownSeconds ?? 3),
      /** Drift mode: score and the current chain (seconds of continuous sliding). */
      score: 0,
      chain: 0,
      /** Knockout: laps whose elimination has happened. */
      knockedLaps: 0,
    };
    this.offer = null;
    instance.highlight(0);
    this.setState('COUNTDOWN');
    this.emit('countdown', { track, n: this.race.lastWhole });
    this.adapter.showBig?.(String(this.race.lastWhole), '#ffd23f', 900);
    return true;
  }

  /** The player was busted. Ends the race (no prize); stars go back to before. */
  notifyBusted() {
    if (!this.active) return false;
    this.fail('busted');
    return true;
  }

  /** The player was wasted. */
  notifyWasted() {
    if (!this.active) return false;
    this.fail('wasted');
    return true;
  }

  /** Gives up: declines an offer, or quits a race in progress (no prize, stars cleared). */
  abort() {
    if (this.state === 'PROMPT') return this.decline();
    if (!this.active) return false;
    this.fail('quit');
    return true;
  }

  /** Ends the race without a placing. @param {string} reason */
  fail(reason) {
    if (!this.active) return;
    this.emit('failed', { track: this.race.track, reason });
    this.cleanup({ place: null, reason, time: this.race.time });
  }

  /**
   * Removes everything the race spawned, puts the Wanted Level back, pays out, and shows the
   * result. @param {{ place: number | null, reason: string, time: number }} result
   */
  cleanup(result) {
    const r = this.race;
    this.setState('CLEANUP');
    this.adapter.holdPlayer(false);
    r.instance.dispose();
    this.adapter.removeRacers();
    // Stars from the race don't stick.
    const restore = this.config.rules?.restoreWanted === 'zero' ? { stars: 0, heat: 0 } : r.preRace;
    this.adapter.restoreWanted(restore);
    const pay = payoutFor(r.track, result.place);
    if (pay.cash > 0) this.adapter.earn(pay.cash);
    this.streetCred += pay.cred;
    // Records: best time (finished only), best lap, best drift score.
    const me = r.racers[0];
    const rec = this.records[r.track.id] ?? (this.records[r.track.id] = {});
    let newRecord = false;
    if (result.reason === 'finished' && r.mode !== 'drift' && (rec.best === undefined || result.time < rec.best)) {
      rec.best = Math.round(result.time * 100) / 100;
      newRecord = true;
    }
    if (me.bestLap !== null && (rec.bestLap === undefined || me.bestLap < rec.bestLap)) rec.bestLap = Math.round(me.bestLap * 100) / 100;
    if (r.mode === 'drift' && (rec.score === undefined || r.score > rec.score)) {
      rec.score = Math.round(r.score);
      newRecord = true;
    }
    this.result = {
      ...result,
      track: r.track,
      mode: r.mode,
      cash: pay.cash,
      cred: pay.cred,
      score: Math.round(r.score),
      bestLap: me.bestLap,
      newRecord,
      record: { ...rec },
      standings: this.standings().map((x) => `${x.name}${x.out ? ' (out)' : ''}`),
    };
    this.emit('cleanup', { propsLeft: r.instance.count });
    if (result.place === null && (result.reason === 'busted' || result.reason === 'wasted')) this.adapter.respawnAt?.(r.grid, result.reason);
    this.race = null;
    this.cooldown = this.config.popUp?.cooldownAfterRace ?? 180;
    this.setState('RESOLVED');
    this.emit('resolved', this.result);
  }

  /** Racers sorted: finishers by time, then by progress. */
  standings() {
    const r = this.race;
    if (!r) return [];
    return [...r.racers].sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.out && b.out) return (b.outAt ?? 0) - (a.outAt ?? 0);
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return b.progress - a.progress;
    });
  }

  // ------------------------------------------------------------------ per frame

  /**
   * Call every frame. Rolls for pop-up races, follows the player to the grid, runs the countdown,
   * checkpoints and standings, and the result screen. Returns `hud()`.
   * @param {number} dt @param {RaceContext} ctx
   */
  update(dt, ctx) {
    this.stateTime += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    switch (this.state) {
      case 'IDLE':
        this.updateIdle(dt, ctx);
        break;
      case 'PROMPT':
        this.updatePrompt(dt, ctx);
        break;
      case 'COUNTDOWN':
        this.updateCountdown(dt);
        break;
      case 'RACING':
        this.updateRacing(dt, ctx);
        break;
      case 'RESOLVED':
        if (this.stateTime >= (this.config.rules?.resultSeconds ?? 5)) {
          this.result = null;
          this.setState('IDLE');
        }
        break;
      default:
        break;
    }
    return this.hud(ctx);
  }

  /** @param {number} dt @param {RaceContext} ctx */
  updateIdle(dt, ctx) {
    if (!ctx.freeRoam || ctx.dead) return;
    // Organisers: pull up next to one (slowly) and they offer their race.
    const org = this.config.organizer ?? {};
    for (const t of this.eligibleTracks()) {
      if (!t.organizer) continue;
      if (ctx.inVehicle && Math.hypot(t.organizer.x - ctx.x, t.organizer.z - ctx.z) < (org.joinRadius ?? 14) && ctx.speed < (org.maxSpeedKmh ?? 25) / 3.6) {
        this.offerRace(t.id, 'organizer');
        return;
      }
    }
    // Pop-ups: only while driving around, not wanted (if configured), and not right after a race.
    const pu = this.config.popUp ?? {};
    if (!ctx.inVehicle || this.cooldown > 0 || (pu.requireNoStars && this.adapter.getWanted().stars > 0)) return;
    this.rollIn -= dt;
    if (this.rollIn > 0) return;
    this.rollIn = this.nextRoll();
    if (this.rng() >= (pu.chance ?? 0.65)) return;
    const near = this.eligibleTracks()
      .map((/** @type {any} */ t) => ({ t, d: Math.hypot(t.start.x - ctx.x, t.start.z - ctx.z) }))
      .filter((/** @type {any} */ o) => o.d >= (pu.minStartDistance ?? 80) && o.d <= (pu.maxStartDistance ?? 700))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => a.d - b.d);
    if (near.length) this.offerRace(near[Math.floor(this.rng() * Math.min(2, near.length))].t.id, 'popup');
  }

  /** @param {number} dt @param {RaceContext} ctx */
  updatePrompt(dt, ctx) {
    const o = this.offer;
    if (!o) return this.setState('IDLE');
    if (!o.accepted) {
      o.expiresIn -= dt;
      // Organiser offers lapse when you drive off.
      const leftOrganizer = o.source === 'organizer' && o.track.organizer && Math.hypot(o.track.organizer.x - ctx.x, o.track.organizer.z - ctx.z) > (this.config.organizer?.joinRadius ?? 14) * 2.5;
      if (o.expiresIn <= 0 || leftOrganizer || ctx.dead) this.decline();
      return;
    }
    o.reachIn -= dt;
    if (o.reachIn <= 0 || ctx.dead) {
      this.adapter.notify?.('Too slow: the racers left without you.', 3000);
      this.decline();
      return;
    }
    const rules = this.config.rules ?? {};
    const atGrid = ctx.inVehicle && Math.hypot(o.track.start.x - ctx.x, o.track.start.z - ctx.z) < (rules.gridRadius ?? 22) && ctx.speed < (rules.gridMaxSpeedKmh ?? 30) / 3.6;
    if (atGrid) this.startRace();
  }

  /** @param {number} dt */
  updateCountdown(dt) {
    const r = this.race;
    r.countdown -= dt;
    const whole = Math.ceil(r.countdown);
    if (whole < r.lastWhole && whole > 0) {
      r.lastWhole = whole;
      this.adapter.showBig?.(String(whole), '#ffd23f', 900);
      this.emit('countdown', { track: r.track, n: whole });
    }
    this.adapter.updateRacers?.(dt, { state: 'COUNTDOWN', course: r.course, progress: new Map(), standings: [] });
    if (r.countdown <= 0) {
      this.adapter.holdPlayer(false);
      this.adapter.showBig?.('GO!', '#4be37a', 1000);
      this.setState('RACING');
      this.emit('go', { track: r.track });
    }
  }

  /** @param {number} dt @param {RaceContext} ctx */
  updateRacing(dt, ctx) {
    const r = this.race;
    const rules = this.config.rules ?? {};
    r.time += dt;
    const radius = r.track.checkpointRadius ?? 14;
    // Everyone's checkpoints.
    const perLap = r.track.checkpointPositions.length;
    for (const x of r.racers) {
      if (x.finishedAt !== null || x.out) continue;
      const pos = x.player ? { x: ctx.x, z: ctx.z } : this.adapter.racerPosition(x.id);
      if (!pos) continue;
      const cp = r.course[x.passed];
      if (cp && Math.hypot(cp.x - pos.x, cp.z - pos.z) < radius) {
        x.passed++;
        // A lap done (the last checkpoint of a lap): lap time, best lap.
        if (x.passed % perLap === 0) {
          const lapTime = r.time - x.lapStart;
          x.lastLap = lapTime;
          if (x.bestLap === null || lapTime < x.bestLap) x.bestLap = lapTime;
          x.lapStart = r.time;
          if (x.player) this.emit('lap', { lap: cp.lap, time: lapTime, best: x.bestLap });
        }
        if (x.player) {
          r.instance.highlight(x.passed);
          this.emit('checkpoint', { index: x.passed, total: r.course.length, lap: cp.lap });
        }
        if (x.passed >= r.course.length) x.finishedAt = r.time;
      }
      x.progress = progressOf(x.passed, pos, r.course, r.track.start);
    }
    // Drift mode: points from the player's slide this frame.
    if (r.mode === 'drift') {
      const d = driftPoints(dt, ctx.driftAngle ?? 0, ctx.speed, r.chain);
      r.score += d.points;
      r.chain = d.chain;
    }
    // Knockout: when the leader completes a lap (not the last), the racer in last place is out.
    if (r.mode === 'knockout') {
      const leaderLaps = Math.max(...r.racers.filter((x) => !x.out).map((x) => Math.floor(x.passed / perLap)));
      if (leaderLaps > r.knockedLaps && leaderLaps < r.track.laps) {
        r.knockedLaps = leaderLaps;
        const alive = this.standings().filter((x) => !x.out && x.finishedAt === null);
        const last = alive[alive.length - 1];
        if (last && alive.length > 1) {
          last.out = true;
          last.outAt = r.time;
          this.emit('knockout', { id: last.id, name: last.name, lap: leaderLaps, player: last.player });
          if (!last.player) this.adapter.removeRacer?.(last.id);
          if (last.player) return this.cleanup({ place: alive.length, reason: 'knockedOut', time: r.time });
        }
      }
    }
    const standings = this.standings();
    const progress = new Map(r.racers.map((x) => [x.id, x.progress]));
    this.adapter.updateRacers?.(dt, { state: 'RACING', course: r.course, progress, standings: standings.map((x) => x.id) });
    const me = r.racers[0];
    if (me.finishedAt !== null) {
      let place = standings.filter((x) => !x.out).findIndex((x) => x.player) + 1;
      if (r.mode === 'timeTrial') place = medalPlace(r.track, r.time);
      if (r.mode === 'drift') place = medalPlace(r.track, r.score);
      this.emit('finished', { track: r.track, place, time: r.time, score: r.score });
      this.cleanup({ place, reason: 'finished', time: r.time });
      return;
    }
    // Ways to fail: out of a car too long, off the course, out of time.
    r.outOfCar = ctx.inVehicle ? 0 : r.outOfCar + dt;
    if (r.outOfCar > (rules.outOfCarSeconds ?? 15)) return this.fail('abandoned');
    const next = r.course[me.passed];
    if (next && Math.hypot(next.x - ctx.x, next.z - ctx.z) > (rules.maxOffRouteMeters ?? 450)) return this.fail('lost');
    if (r.time > r.track.timeLimit) {
      if (r.mode === 'drift') {
        const place = medalPlace(r.track, r.score);
        this.emit('finished', { track: r.track, place, time: r.time, score: r.score });
        return this.cleanup({ place, reason: 'finished', time: r.time });
      }
      return this.fail('time');
    }
  }

  // ------------------------------------------------------------------ HUD and saving

  /**
   * What to show: state, prompt line, race panel numbers, next checkpoints and racer positions.
   * @param {RaceContext} [ctx]
   */
  hud(ctx) {
    const s = this.state;
    if (s === 'PROMPT' && this.offer) {
      const t = this.offer.track;
      const d = ctx ? Math.round(Math.hypot(t.start.x - ctx.x, t.start.z - ctx.z)) : 0;
      return {
        state: s,
        track: t,
        prompt: this.offer.accepted
          ? `${t.name}: get to the start line (${d} m, ${Math.ceil(this.offer.reachIn)} s)`
          : `${this.offer.source === 'organizer' ? 'Street race' : 'Street race nearby'}: ${t.name} (${MODE_NAMES[modeOf(t)]}), $${t.entryFee} to enter, $${t.payouts.first} to win (${d} m)`,
        mode: modeOf(t),
        record: this.records[t.id] ?? null,
        accepted: this.offer.accepted,
        target: { x: t.start.x, z: t.start.z },
        expires01: Number.isFinite(this.offer.expiresIn) ? Math.max(0, this.offer.expiresIn) / (this.config.popUp?.offerSeconds ?? 20) : 1,
      };
    }
    if ((s === 'COUNTDOWN' || s === 'RACING') && this.race) {
      const r = this.race;
      const me = r.racers[0];
      const st = this.standings();
      const next = r.course[me.passed] ?? null;
      const after = r.course[me.passed + 1] ?? null;
      return {
        state: s,
        track: r.track,
        place: st.findIndex((x) => x.player) + 1,
        of: r.racers.length,
        checkpoint: Math.min(me.passed + 1, r.course.length),
        totalCheckpoints: r.course.length,
        lap: next ? next.lap : r.track.laps,
        laps: r.track.laps,
        time: r.time,
        timeLeft: Math.max(0, r.track.timeLimit - r.time),
        countdown: s === 'COUNTDOWN' ? r.countdown : 0,
        next,
        after,
        finishNext: !!next?.finish,
        racers: r.racers.filter((x) => !x.player && !x.out).map((x) => ({ id: x.id, name: x.name, ...(this.adapter.racerPosition(x.id) ?? { x: 0, z: 0 }) })),
        outOfCar: r.outOfCar,
        mode: r.mode,
        lapTime: r.time - me.lapStart,
        lastLap: me.lastLap,
        bestLap: me.bestLap,
        score: Math.round(r.score),
        chain: r.chain,
        medals: r.track.medals ?? null,
        record: this.records[r.track.id] ?? null,
        out: r.racers.filter((x) => x.out).map((x) => x.name),
        alive: r.racers.filter((x) => !x.out).length,
      };
    }
    if (s === 'RESOLVED' && this.result) return { state: s, result: this.result };
    return { state: s };
  }

  /** Street Cred to save. */
  serialize() {
    return { streetCred: this.streetCred, records: { ...this.records } };
  }

  /** @param {any} data */
  load(data) {
    this.streetCred = Math.max(0, Math.round(Number(data?.streetCred) || 0));
    /** @type {Record<string, { best?: number, bestLap?: number, score?: number }>} */
    const rec = {};
    const raw = data?.records;
    if (raw && typeof raw === 'object')
      for (const [id, v] of Object.entries(raw)) {
        if (!this.track(id) || !v || typeof v !== 'object') continue;
        /** @type {any} */
        const o = {};
        for (const k of ['best', 'bestLap', 'score']) if (isNum(/** @type {any} */ (v)[k]) && /** @type {any} */ (v)[k] >= 0) o[k] = /** @type {any} */ (v)[k];
        if (Object.keys(o).length) rec[id] = o;
      }
    this.records = rec;
  }
}

export default StreetRaceManager;
