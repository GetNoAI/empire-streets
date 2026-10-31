// @ts-check
import defaultConfig from '../config/heists.json';

/**
 * Heists: plan a job, put a crew of up to three Streetmon in specialist roles, break in, grab
 * the loot and get it to a lock-up with the police on your tail.
 *
 *   IDLE -> PLANNING -> SETUP -> INFILTRATION -> BREACH <-> LOOT -> ESCAPE -> RESOLVED -> IDLE
 *
 * Roles (from heists.json):
 *   breacher  breaks the vault door / truck doors / display cases (E at a breach point)
 *   hacker    jams cameras and the alarm line for a while (quieter breach, cameras dark)
 *   smoke     smokes the scene: guards nearby are out cold, bystanders can't report
 *   hauler    carries loot bags so the player isn't slowed down
 *
 * Security: guards and cameras that can see the player fill a suspicion meter; noise (breaching,
 * smashing, gunfire) fills a noise meter. Either one full sets off the alarm: the police are
 * called (stars after the alarm delay), the escape gets one star hotter, and dye packs spoil part
 * of the cash. Loot bags weigh something: whatever the player carries slows them down on foot.
 * The getaway starts when you leave with the loot (or have it all): a high Wanted Level. Lose the
 * police and stop at a lock-up to get paid. Each job leaves heat that makes the next ones harder.
 *
 * The module has no engine code. The game gives it an adapter (money, wanted level, the world's
 * guards/cameras/loot) and calls `update(dt, ctx)` each frame with what the world sees.
 */

export const HEIST_STATES = /** @type {const} */ ({
  IDLE: 'IDLE',
  PLANNING: 'PLANNING',
  SETUP: 'SETUP',
  INFILTRATION: 'INFILTRATION',
  BREACH: 'BREACH',
  LOOT: 'LOOT',
  ESCAPE: 'ESCAPE',
  RESOLVED: 'RESOLVED',
});

export const ROLES = /** @type {const} */ (['breacher', 'hacker', 'smoke', 'hauler']);
const STATS = ['hp', 'attack', 'defense', 'speed', 'loud'];
const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));

/**
 * Checks a heist config; throws on the first problem.
 * @param {any} cfg
 */
export function validateHeistConfig(cfg) {
  const fail = (/** @type {string} */ m) => {
    throw new Error(`heists config: ${m}`);
  };
  if (!cfg || typeof cfg !== 'object') fail('not an object');
  for (const r of ROLES) {
    const role = cfg.roles?.[r];
    if (!role) fail(`role "${r}" missing`);
    if (!role.accepts || !Array.isArray(role.accepts.types)) fail(`role "${r}": accepts.types missing`);
    if (!STATS.includes(role.stat)) fail(`role "${r}": stat must be one of ${STATS.join(', ')}`);
  }
  if (!(cfg.maxCrew >= 1 && cfg.maxCrew <= 4)) fail('maxCrew must be 1-4');
  const drops = new Set((cfg.dropOffs ?? []).map((/** @type {any} */ d) => d.id));
  if (!drops.size) fail('no dropOffs');
  for (const d of cfg.dropOffs) if (!isNum(d.x) || !isNum(d.z) || !(d.radius > 0)) fail(`drop-off "${d.id}" needs x, z, radius`);
  const ids = new Set();
  if (!Array.isArray(cfg.targets) || !cfg.targets.length) fail('no targets');
  for (const t of cfg.targets) {
    const w = `target "${t.id}"`;
    if (typeof t.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(t.id) || ids.has(t.id)) fail(`${w}: id missing, invalid or repeated`);
    ids.add(t.id);
    const req = t.roles?.required ?? [];
    const opt = t.roles?.optional ?? [];
    for (const r of [...req, ...opt]) if (!ROLES.includes(r)) fail(`${w}: unknown role "${r}"`);
    if (req.some((/** @type {string} */ r) => opt.includes(r))) fail(`${w}: a role can't be both required and optional`);
    if (req.length > cfg.maxCrew) fail(`${w}: needs more roles than a crew can have`);
    if (!(t.payoutPool?.min > 0 && t.payoutPool.max >= t.payoutPool.min)) fail(`${w}: payoutPool needs min > 0 and max >= min`);
    if (!(t.loot?.bags >= 1 && t.loot.kgPerBag > 0)) fail(`${w}: loot needs bags >= 1 and kgPerBag > 0`);
    if (!(t.security?.level >= 1 && t.security.level <= 5)) fail(`${w}: security.level must be 1-5`);
    if (!(t.breach?.seconds > 0) || !['vault', 'smash', 'truck'].includes(t.breach.mode)) fail(`${w}: breach needs mode (vault, smash, truck) and seconds`);
    if (!(t.escape?.stars >= 1 && t.escape.stars <= 5)) fail(`${w}: escape.stars must be 1-5`);
    for (const d of t.escape.dropOffs ?? []) if (!drops.has(d)) fail(`${w}: unknown drop-off "${d}"`);
    const loc = t.location ?? {};
    if (!loc.breachPoints?.length) fail(`${w}: location.breachPoints missing`);
    if ((loc.loot ?? []).length < t.loot.bags) fail(`${w}: fewer loot spots than bags`);
    if (t.breach.mode === 'smash' && loc.breachPoints.length !== t.loot.bags) fail(`${w}: a smash job has one bag per case`);
    if (!isNum(loc.plan?.x) || !isNum(loc.plan?.z)) fail(`${w}: location.plan (where you plan the job) missing`);
  }
  return cfg;
}

/**
 * Can this Streetmon fill this role? Returns how good it would be at it (skill 0.8-1.5).
 * @param {any} cfg @param {string} role
 * @param {{ id: string, speciesId: string, name?: string, types: string[], level: number, stats: Record<string, number>, weightKg?: number, hp?: number }} mon
 */
export function roleFit(cfg, role, mon) {
  const r = cfg.roles[role];
  if (!r) return { ok: false, reason: `No such role: ${role}`, skill: 0 };
  if (mon.hp !== undefined && mon.hp <= 0) return { ok: false, reason: `${mon.name ?? mon.speciesId} is out cold`, skill: 0 };
  const a = r.accepts;
  const typeOk = mon.types.some((t) => a.types.includes(t)) || (a.species ?? []).includes(mon.speciesId);
  if (!typeOk) return { ok: false, reason: `${r.name} takes ${a.types.join(', ')} types`, skill: 0 };
  if (a.minWeightKg && (mon.weightKg ?? 0) < a.minWeightKg) return { ok: false, reason: `Too light to haul (needs ${a.minWeightKg} kg+)`, skill: 0 };
  if (a.minLevel && mon.level < a.minLevel) return { ok: false, reason: `Needs level ${a.minLevel}+`, skill: 0 };
  const S = cfg.skill;
  const skill = clamp(S.base + (mon.stats[r.stat] ?? 0) * S.perStat + mon.level * S.perLevel, S.min, S.max);
  return { ok: true, reason: '', skill };
}

/**
 * Kilograms a hauler can carry.
 * @param {any} cfg @param {{ stats: Record<string, number>, weightKg?: number }} mon
 */
export function haulerCapacity(cfg, mon) {
  const c = cfg.roles.hauler.capacity;
  return Math.round(clamp(c.baseKg + (mon.stats.defense ?? 0) * c.perDefense + (mon.weightKg ?? 0) * c.perWeightKg, 0, c.maxKg));
}

/**
 * How much the player's load slows them on foot.
 * @param {any} cfg @param {number} kg
 */
export function encumbrance(cfg, kg) {
  const e = cfg.encumbrance;
  const speedMult = clamp(1 - Math.max(0, kg - e.freeKg) * e.speedLossPerKg, e.minSpeedMult, 1);
  return { kg, speedMult, canSprint: kg <= e.noSprintAboveKg };
}

/**
 * Security level after heat (each `securityPerHeat` adds one, up to 5).
 * @param {any} cfg @param {any} target @param {number} heat
 */
export function securityLevel(cfg, target, heat) {
  return clamp(target.security.level + Math.floor(heat / cfg.heatRules.securityPerHeat), 1, 5);
}

/**
 * Stars for the getaway: the target's, +1 if the alarm went off, + heat.
 * @param {any} cfg @param {any} target @param {{ alarm: boolean, heat: number }} s
 */
export function escapeStars(cfg, target, s) {
  return clamp(target.escape.stars + (s.alarm ? 1 : 0) + Math.floor(s.heat / cfg.heatRules.starsPerHeat), 1, 5);
}

/**
 * Splits a payout pool across the bags (a little uneven, as real bags are).
 * @param {any} target @param {() => number} rng
 */
export function splitLoot(target, rng) {
  const total = Math.round(target.payoutPool.min + rng() * (target.payoutPool.max - target.payoutPool.min));
  const n = target.loot.bags;
  const w = Array.from({ length: n }, () => 0.8 + rng() * 0.4);
  const sum = w.reduce((a, b) => a + b, 0);
  const bags = w.map((x, i) => ({ index: i, value: Math.round((total * x) / sum / 10) * 10, kg: target.loot.kgPerBag, taken: false, carrier: /** @type {'player' | 'hauler' | null} */ (null), spot: i }));
  // Smash jobs: each case holds one bag and appears when that case is broken.
  return bags;
}

/**
 * @typedef {Object} HeistAdapter
 * @property {(id: string) => any} getStreetmon      current info for a crew member (or null if gone)
 * @property {() => number} getMoney
 * @property {(n: number) => boolean} spend
 * @property {(n: number) => void} earn
 * @property {() => number} getStars
 * @property {(stars: number) => void} raiseWanted   at least this many stars (never lowers)
 * @property {(target: any, crew: Record<string, any>) => void} [deploy]   the crew comes out, the security goes up
 * @property {(target: any) => void} [soundAlarm]
 * @property {(target: any, on: boolean) => void} [setCameras]
 * @property {(target: any, x: number, z: number, radius: number, seconds: number) => number} [smokeScene]  returns guards knocked out
 * @property {(target: any, point: number, role: string | null) => void} [breachStarted]
 * @property {(target: any, point: number, bags: any[]) => void} [breachDone]   open the door / case, show the loot
 * @property {(target: any, bag: any) => void} [lootTaken]
 * @property {(target: any, stars: number, dropOffs: any[]) => void} [escapeStarted]
 * @property {(target: any, result: any) => void} [cleanup]   remove guards, cameras, loot, crew
 * @property {(text: string, ms?: number) => void} [notify]
 * @property {(text: string, color: string, ms: number) => void} [showBig]
 */

/**
 * @typedef {Object} HeistContext
 * @property {number} x
 * @property {number} z
 * @property {boolean} inVehicle
 * @property {number} stars
 * @property {number} [seenBy]   how many guards/cameras see the player right now (weighted)
 * @property {number} [nearBreach]   breach point index the player is at (-1 if none)
 * @property {number} [nearLoot]   loot bag index the player is next to (-1 if none)
 * @property {string | null} [atDropOff]   drop-off id the player is stopped at
 * @property {number} [guardsAwake]   guards still on watch
 * @property {boolean} [dead]
 */

export class HeistManager {
  /**
   * @param {{ adapter: HeistAdapter, config?: any, rng?: () => number }} opts
   */
  constructor({ adapter, config = defaultConfig, rng = Math.random }) {
    this.config = validateHeistConfig(config);
    this.adapter = adapter;
    this.rng = rng;
    /** @type {keyof typeof HEIST_STATES} */
    this.state = 'IDLE';
    this.stateTime = 0;
    /** Notoriety from past jobs (0-100): raises security and getaway stars; fades over time. */
    this.heat = 0;
    /** Seconds until each target can be hit again. @type {Record<string, number>} */
    this.cooldowns = {};
    this.stats = { done: 0, failed: 0, earned: 0, best: 0 };
    /** @type {any} */
    this.job = null;
    /** @type {any} */
    this.result = null;
    /** @type {Map<string, Set<(e: any) => void>>} */
    this.listeners = new Map();
  }

  // ------------------------------------------------------------------ events

  /** @param {'state' | 'alarm' | 'breached' | 'loot' | 'escape' | 'resolved' | 'ability' | 'planned'} type @param {(e: any) => void} fn */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  /** @param {keyof typeof HEIST_STATES} s */
  setState(s) {
    if (s === this.state) return;
    const from = this.state;
    this.state = s;
    this.stateTime = 0;
    this.emit('state', { from, to: s });
  }

  /** In the middle of a job (crew out, from setup to the getaway). */
  get active() {
    return ['SETUP', 'INFILTRATION', 'BREACH', 'LOOT', 'ESCAPE'].includes(this.state);
  }

  // ------------------------------------------------------------------ targets

  get targets() {
    return this.config.targets;
  }

  /** @param {string} id */
  target(id) {
    return this.config.targets.find((/** @type {any} */ t) => t.id === id) ?? null;
  }

  /** @param {string} id */
  dropOff(id) {
    return this.config.dropOffs.find((/** @type {any} */ d) => d.id === id) ?? null;
  }

  /**
   * Can this target be planned right now?
   * @param {string} id
   */
  availability(id) {
    const t = this.target(id);
    if (!t) return { ok: false, reason: 'No such job.' };
    if (this.active || this.state === 'PLANNING') return { ok: false, reason: 'Finish the job you are on first.' };
    const cd = this.cooldowns[id] ?? 0;
    if (cd > 0) return { ok: false, reason: `They're still on edge from last time. Come back in ${Math.ceil(cd / 60)} min.`, cooldown: cd };
    return { ok: true, reason: '' };
  }

  // ------------------------------------------------------------------ planning

  /**
   * Opens the plan for a target (at its planning spot).
   * @param {string} id
   */
  plan(id) {
    const a = this.availability(id);
    if (!a.ok) return a;
    const t = this.target(id);
    this.job = {
      target: t,
      /** @type {Record<string, any>} role -> Streetmon info */
      crew: {},
      security: securityLevel(this.config, t, this.heat),
      suspicion: 0,
      noise: 0,
      alarm: false,
      alarmIn: -1,
      jammedFor: 0,
      smokedFor: 0,
      cooldown: { hacker: 0, smoke: 0 },
      breach: t.location.breachPoints.map(() => ({ progress: 0, done: false })),
      breaching: -1,
      bags: [],
      time: 0,
      left: false,
      escapeStars: 0,
    };
    this.setState('PLANNING');
    this.emit('planned', { target: t });
    return { ok: true, reason: '' };
  }

  /**
   * Puts a Streetmon in a role (replacing whoever was there).
   * @param {string} role @param {any} mon
   */
  assign(role, mon) {
    if (this.state !== 'PLANNING' || !this.job) return { ok: false, reason: 'Not planning a job.' };
    const t = this.job.target;
    if (![...t.roles.required, ...t.roles.optional].includes(role)) return { ok: false, reason: `This job has no ${this.config.roles[role]?.name ?? role}.` };
    const fit = roleFit(this.config, role, mon);
    if (!fit.ok) return { ok: false, reason: fit.reason };
    for (const [r, m] of Object.entries(this.job.crew)) if (m.id === mon.id && r !== role) return { ok: false, reason: `${mon.name ?? mon.speciesId} is already the ${this.config.roles[r].name}.` };
    const filled = Object.keys(this.job.crew).filter((r) => r !== role).length;
    if (filled >= this.config.maxCrew) return { ok: false, reason: `A crew is ${this.config.maxCrew} at most.` };
    this.job.crew[role] = { ...mon, skill: fit.skill, capacity: role === 'hauler' ? haulerCapacity(this.config, mon) : 0 };
    return { ok: true, reason: '', skill: fit.skill };
  }

  /** @param {string} role */
  unassign(role) {
    if (this.state !== 'PLANNING' || !this.job?.crew[role]) return false;
    delete this.job.crew[role];
    return true;
  }

  /**
   * Is the crew good to go? Lists what's missing and what the optional roles would add.
   * @param {Record<string, any>} [crew]
   */
  validateCrew(crew = this.job?.crew ?? {}) {
    const t = this.job?.target;
    if (!t) return { ok: false, missing: [], problems: ['No job planned.'], bonus: 0 };
    const missing = t.roles.required.filter((/** @type {string} */ r) => !crew[r]);
    const problems = [];
    for (const [role, m] of Object.entries(crew)) {
      const now = this.adapter.getStreetmon(m.id);
      if (!now) problems.push(`${m.name ?? m.speciesId} isn't with you any more.`);
      else {
        const fit = roleFit(this.config, role, now);
        if (!fit.ok) problems.push(fit.reason);
      }
    }
    if (Object.keys(crew).length > this.config.maxCrew) problems.push(`A crew is ${this.config.maxCrew} at most.`);
    const optional = t.roles.optional.filter((/** @type {string} */ r) => crew[r]).length;
    return { ok: missing.length === 0 && problems.length === 0, missing, problems, bonus: optional * this.config.payout.optionalRoleBonus };
  }

  /** Starts the job: pays the setup cost, deploys the crew. */
  launch() {
    if (this.state !== 'PLANNING' || !this.job) return { ok: false, reason: 'Not planning a job.' };
    const v = this.validateCrew();
    if (!v.ok) return { ok: false, reason: v.missing.length ? `Missing: ${v.missing.map((/** @type {string} */ r) => this.config.roles[r].name).join(', ')}` : v.problems[0] };
    const t = this.job.target;
    if (t.setupCost > 0 && !this.adapter.spend(t.setupCost)) return { ok: false, reason: `Setup costs $${t.setupCost}.` };
    this.job.bags = splitLoot(t, this.rng);
    this.job.time = 0;
    this.adapter.deploy?.(t, this.job.crew);
    this.setState('SETUP');
    return { ok: true, reason: '' };
  }

  /** Walks away from the plan (no cost). */
  cancel() {
    if (this.state !== 'PLANNING') return false;
    this.job = null;
    this.setState('IDLE');
    return true;
  }

  // ------------------------------------------------------------------ in the field

  /** @param {string} role */
  member(role) {
    const m = this.job?.crew?.[role];
    if (!m) return null;
    const now = this.adapter.getStreetmon(m.id);
    return now && (now.hp === undefined || now.hp > 0) ? { ...m, ...now, skill: m.skill, capacity: m.capacity } : null;
  }

  /**
   * Hacker (jam) or Smoke (smokescreen). Returns what happened.
   * @param {'hacker' | 'smoke'} role @param {HeistContext} ctx
   */
  useAbility(role, ctx) {
    const j = this.job;
    if (!this.active || !j) return { ok: false, reason: 'No job on.' };
    const m = this.member(role);
    const R = this.config.roles[role];
    if (!m) return { ok: false, reason: `No ${R.name} in the crew${j.crew[role] ? ' able to work' : ''}.` };
    if (j.cooldown[role] > 0) return { ok: false, reason: `${R.name}: ready in ${Math.ceil(j.cooldown[role])} s.` };
    const ab = R.ability;
    const t = j.target;
    if (role === 'hacker') {
      const c = this.centre(t);
      if (Math.hypot(c.x - ctx.x, c.z - ctx.z) > (ab.range ?? 40)) return { ok: false, reason: 'Get closer to the job to jam it.' };
      j.jammedFor = ab.seconds * m.skill;
      j.cooldown.hacker = ab.cooldown / m.skill;
      this.adapter.setCameras?.(t, false);
      this.emit('ability', { role, seconds: j.jammedFor });
      this.adapter.notify?.(`${m.name ?? m.speciesId} jams the cameras and the alarm line (${Math.round(j.jammedFor)} s).`, 2500);
      return { ok: true, reason: '', seconds: j.jammedFor };
    }
    const seconds = ab.seconds * m.skill;
    const knocked = this.adapter.smokeScene?.(t, ctx.x, ctx.z, ab.radius * m.skill, seconds) ?? 0;
    j.smokedFor = seconds;
    j.cooldown.smoke = ab.cooldown / m.skill;
    this.emit('ability', { role, seconds, knocked });
    this.adapter.notify?.(`${m.name ?? m.speciesId} smokes the scene${knocked ? `: ${knocked} guard${knocked > 1 ? 's' : ''} out cold` : ''}.`, 2500);
    return { ok: true, reason: '', seconds, knocked };
  }

  /**
   * Starts breaching a point (E at the vault door, truck doors or a case).
   * @param {number} index @param {HeistContext} ctx
   */
  startBreach(index, ctx) {
    const j = this.job;
    if (!j || !['INFILTRATION', 'BREACH', 'LOOT'].includes(this.state)) return { ok: false, reason: 'Not now.' };
    const b = j.breach[index];
    if (!b || b.done) return { ok: false, reason: 'Already open.' };
    if (ctx.inVehicle) return { ok: false, reason: 'Get out of the car.' };
    const t = j.target;
    const req = t.roles.required;
    if (req.includes('breacher') && !this.member('breacher')) return { ok: false, reason: 'Your Breacher is out of action.' };
    // A live alarm on the door: jam it first (unless it's already gone off).
    if (req.includes('hacker') && !j.alarm && j.jammedFor <= 0) return { ok: false, reason: 'The vault alarm is live: jam it first (Z).' };
    // Witnesses: smoke the guards first (unless the alarm is already going).
    if (req.includes('smoke') && !j.alarm && (ctx.guardsAwake ?? 0) > 0 && j.smokedFor <= 0) return { ok: false, reason: "The guards are watching: smoke them first (X)." };
    j.breaching = index;
    if (this.state === 'INFILTRATION') this.setState('BREACH');
    this.adapter.breachStarted?.(t, index, this.member('breacher') ? 'breacher' : null);
    if (t.breach.mode === 'smash') this.addNoise(t.noise.smash);
    return { ok: true, reason: '' };
  }

  /**
   * Picks up a loot bag: the hauler takes it if it has room, otherwise the player.
   * @param {number} index
   */
  takeLoot(index) {
    const j = this.job;
    if (!j || !['BREACH', 'LOOT'].includes(this.state)) return { ok: false, reason: 'Nothing to take yet.' };
    const bag = j.bags[index];
    if (!bag || bag.taken || !bag.available) return { ok: false, reason: 'Not available.' };
    const h = this.member('hauler');
    const haulerKg = j.bags.filter((/** @type {any} */ b) => b.carrier === 'hauler').reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b.kg, 0);
    bag.taken = true;
    bag.carrier = h && haulerKg + bag.kg <= h.capacity ? 'hauler' : 'player';
    this.adapter.lootTaken?.(j.target, bag);
    this.emit('loot', { bag, carried: this.carried() });
    if (j.bags.every((/** @type {any} */ b) => b.taken)) this.startEscape('all the loot');
    return { ok: true, reason: '', carrier: bag.carrier };
  }

  /** What the player and hauler are carrying. */
  carried() {
    const j = this.job;
    if (!j) return { bags: 0, value: 0, playerKg: 0, haulerKg: 0 };
    const taken = j.bags.filter((/** @type {any} */ b) => b.taken);
    return {
      bags: taken.length,
      value: taken.reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b.value, 0),
      playerKg: taken.filter((/** @type {any} */ b) => b.carrier === 'player').reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b.kg, 0),
      haulerKg: taken.filter((/** @type {any} */ b) => b.carrier === 'hauler').reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b.kg, 0),
    };
  }

  /** The player's speed on foot with what they carry (1 = unencumbered). */
  encumbrance() {
    return encumbrance(this.config, this.carried().playerKg);
  }

  /**
   * Noise near the job (a shot, an explosion), by kind from the target's noise table.
   * @param {'gunfire' | 'explosion' | 'smash'} kind
   */
  reportNoise(kind) {
    if (!this.job || !['SETUP', 'INFILTRATION', 'BREACH', 'LOOT'].includes(this.state)) return;
    this.addNoise(this.job.target.noise[kind] ?? 0);
  }

  /** @param {number} n */
  addNoise(n) {
    const j = this.job;
    if (!j || j.alarm) return;
    j.noise += n * (j.jammedFor > 0 ? this.config.roles.hacker.ability.noiseMult : 1);
    if (j.noise >= j.target.security.noiseLimit) this.raiseAlarm('noise');
  }

  /** @param {string} why */
  raiseAlarm(why) {
    const j = this.job;
    if (!j || j.alarm) return;
    j.alarm = true;
    j.alarmIn = j.target.security.alarmDelay;
    this.adapter.soundAlarm?.(j.target);
    this.adapter.showBig?.('ALARM!', '#ff3b3b', 1800);
    this.adapter.notify?.(why === 'seen' ? "You've been spotted: the police are on their way." : 'Too loud: the alarm is going off.', 3000);
    this.emit('alarm', { why });
  }

  /** @param {string} why */
  startEscape(why) {
    const j = this.job;
    if (!j || this.state === 'ESCAPE') return;
    j.escapeStars = escapeStars(this.config, j.target, { alarm: j.alarm, heat: this.heat });
    this.adapter.raiseWanted(j.escapeStars);
    const drops = j.target.escape.dropOffs.map((/** @type {string} */ id) => this.dropOff(id));
    this.adapter.escapeStarted?.(j.target, j.escapeStars, drops);
    this.adapter.showBig?.('GETAWAY', '#ffd23f', 2200);
    this.adapter.notify?.(`Get the loot to ${drops.map((/** @type {any} */ d) => d.name).join(' or ')}. Lose the cops before you pull in.`, 4500);
    this.setState('ESCAPE');
    this.emit('escape', { why, stars: j.escapeStars });
  }

  /** The player was busted: the loot's gone. */
  notifyBusted() {
    if (!this.active) return false;
    this.fail('busted');
    return true;
  }

  notifyWasted() {
    if (!this.active) return false;
    this.fail('wasted');
    return true;
  }

  /** Walks away from the job (no loot). */
  abandon() {
    if (this.state === 'PLANNING') return this.cancel();
    if (!this.active) return false;
    this.fail('abandoned');
    return true;
  }

  /** @param {string} reason */
  fail(reason) {
    const j = this.job;
    if (!j) return;
    this.finish({ ok: false, reason, cash: 0 });
  }

  /** @param {{ ok: boolean, reason: string, cash: number, spoiled?: number, bonus?: number }} r */
  finish(r) {
    const j = this.job;
    const t = j.target;
    this.cooldowns[t.id] = (t.cooldownMinutes ?? 10) * 60;
    const heatGain = r.ok ? t.heat * (j.alarm ? 1.5 : 1) : t.heat * 0.5;
    this.heat = clamp(this.heat + heatGain, 0, this.config.heatRules.max);
    if (r.ok) {
      this.stats.done++;
      this.stats.earned += r.cash;
      this.stats.best = Math.max(this.stats.best, r.cash);
    } else this.stats.failed++;
    this.result = { ...r, target: t, time: j.time, alarm: j.alarm, heat: Math.round(this.heat), bags: this.carried().bags, crew: Object.fromEntries(Object.entries(j.crew).map(([k, m]) => [k, m.name ?? m.speciesId])) };
    this.adapter.cleanup?.(t, this.result);
    this.job = null;
    this.setState('RESOLVED');
    this.emit('resolved', this.result);
  }

  /** @param {any} t */
  centre(t) {
    const l = t.location;
    if (l.facade) return { x: l.facade.x, z: l.facade.z };
    if (l.truck) return { x: l.truck.x, z: l.truck.z };
    return l.breachPoints[0];
  }

  // ------------------------------------------------------------------ per frame

  /**
   * @param {number} dt @param {HeistContext} ctx
   */
  update(dt, ctx) {
    this.stateTime += dt;
    // Heat fades and targets cool down between jobs.
    if (!this.active) this.heat = Math.max(0, this.heat - (this.config.heatRules.decayPerMinute / 60) * dt);
    for (const k of Object.keys(this.cooldowns)) if ((this.cooldowns[k] -= dt) <= 0) delete this.cooldowns[k];
    const j = this.job;
    if (this.state === 'RESOLVED') {
      if (this.stateTime > this.config.phases.resultSeconds) {
        this.result = null;
        this.setState('IDLE');
      }
      return this.hud(ctx);
    }
    if (!j || !this.active) return this.hud(ctx);
    const t = j.target;
    const P = this.config.phases;
    j.time += dt;
    for (const k of ['hacker', 'smoke']) j.cooldown[k] = Math.max(0, j.cooldown[k] - dt);
    if (j.jammedFor > 0 && (j.jammedFor -= dt) <= 0) {
      j.jammedFor = 0;
      if (!j.alarm) this.adapter.setCameras?.(t, true);
      this.adapter.notify?.('The jam wore off: cameras are back.', 2000);
    }
    if (j.smokedFor > 0) j.smokedFor = Math.max(0, j.smokedFor - dt);
    if (ctx.dead) return this.hud(ctx);
    const c = this.centre(t);
    const dist = Math.hypot(c.x - ctx.x, c.z - ctx.z);

    // Setup: the job starts properly when you're at the place.
    if (this.state === 'SETUP' && dist < t.location.radius) this.setState('INFILTRATION');

    // The truck leaves.
    if (t.timeLimitSeconds && this.state !== 'ESCAPE' && j.time > t.timeLimitSeconds && !j.breach.some((/** @type {any} */ b) => b.done)) {
      this.adapter.notify?.('The truck pulled out. Too slow.', 3000);
      this.fail('time');
      return this.hud(ctx);
    }

    // Being seen fills suspicion (faster at higher security); out of sight it drains.
    if (!j.alarm && this.state !== 'ESCAPE') {
      // What they see matters: a passer-by is nothing, someone hanging round the door is odd,
      // someone breaking in or carrying bags is a crime.
      const E = P.exposure;
      const exposure = j.breaching >= 0 || this.carried().bags > 0 ? E.breaching : (ctx.nearBreach ?? -1) >= 0 ? E.atTarget : E.passing;
      const seen = (ctx.seenBy ?? 0) * exposure;
      if (seen > 0) j.suspicion += seen * t.security.suspicionRate * (0.7 + 0.15 * j.security) * dt;
      else j.suspicion = Math.max(0, j.suspicion - P.suspicionDecay * dt);
      if (j.suspicion >= 1) this.raiseAlarm('seen');
      // Noise fades, except while a breach is going (that's one long racket).
      if (j.breaching < 0) j.noise = Math.max(0, j.noise - P.noiseDecay * dt);
    }
    // Police called after the alarm delay.
    if (j.alarm && j.alarmIn > 0 && (j.alarmIn -= dt) <= 0) this.adapter.raiseWanted(Math.min(5, 1 + Math.ceil(j.security / 2)));

    // Breaching: only while you're at the point, on foot.
    if (j.breaching >= 0) {
      const b = j.breach[j.breaching];
      if (ctx.nearBreach !== j.breaching || ctx.inVehicle) {
        j.breaching = -1;
        if (this.state === 'BREACH' && !j.breach.some((/** @type {any} */ x) => x.done)) this.setState('INFILTRATION');
      } else {
        const br = this.member('breacher');
        const speed = (br ? br.skill : this.config.skill.withoutBreacher) / t.breach.seconds;
        b.progress = Math.min(1, b.progress + speed * dt);
        this.addNoise(t.noise.breachPerSecond * dt);
        if (b.progress >= 1) {
          b.done = true;
          const idx = j.breaching;
          j.breaching = -1;
          // A smash case gives its own bag; a vault or truck all of them.
          const bags = t.breach.mode === 'smash' ? [j.bags[idx]] : j.bags;
          for (const bag of bags) bag.available = true;
          this.adapter.breachDone?.(t, idx, bags);
          this.emit('breached', { point: idx, bags });
          this.setState('LOOT');
        }
      }
    }

    // The getaway starts when you leave with loot.
    if (this.state === 'LOOT' && this.carried().bags > 0 && dist > t.location.radius + P.leaveRadiusExtra) this.startEscape('left');
    // Leaving with nothing: the job's off.
    if (['INFILTRATION', 'BREACH'].includes(this.state) && dist > t.location.radius * 4) {
      this.adapter.notify?.('You walked away from the job.', 2500);
      this.fail('abandoned');
      return this.hud(ctx);
    }

    // Delivery.
    if (this.state === 'ESCAPE' && ctx.atDropOff) {
      const stars = ctx.stars;
      if (stars > 0 && P.deliverRequiresNoStars) {
        if (Math.floor(this.stateTime * 2) % 8 === 0 && Math.floor((this.stateTime - dt) * 2) % 8 !== 0) this.adapter.notify?.("They won't open the lock-up with cops on you. Lose them.", 2500);
      } else {
        const got = this.carried();
        const spoiled = j.alarm ? Math.round(got.value * t.noise.alarmLootLoss) : 0;
        const bonus = Math.round((got.value - spoiled) * this.validateCrew(j.crew).bonus);
        const cash = got.value - spoiled + bonus;
        this.adapter.earn(cash);
        this.finish({ ok: true, reason: 'delivered', cash, spoiled, bonus });
      }
    }
    return this.hud(ctx);
  }

  // ------------------------------------------------------------------ HUD and saving

  /** @param {HeistContext} [ctx] */
  hud(ctx) {
    const j = this.job;
    if (this.state === 'RESOLVED') return { state: this.state, result: this.result };
    if (!j) return { state: this.state };
    const t = j.target;
    const carried = this.carried();
    const enc = encumbrance(this.config, carried.playerKg);
    const crew = Object.entries(j.crew).map(([role, m]) => {
      const live = this.member(role);
      const ab = this.config.roles[role].ability;
      return {
        role,
        roleName: this.config.roles[role].name,
        name: m.name ?? m.speciesId,
        speciesId: m.speciesId,
        ok: !!live,
        key: ab?.label ?? '',
        cooldown: role === 'hacker' || role === 'smoke' ? j.cooldown[role] : 0,
        active: role === 'hacker' ? j.jammedFor : role === 'smoke' ? j.smokedFor : 0,
        capacity: m.capacity,
      };
    });
    const objective = {
      PLANNING: 'Plan the job: assign your crew.',
      SETUP: `Get to ${t.name}.`,
      INFILTRATION: t.breach.mode === 'smash' ? 'Smash the display cases (E).' : t.breach.mode === 'truck' ? 'Breach the truck doors (E at the back).' : 'Breach the vault door (E at the door).',
      BREACH: 'Stay at it: breaching…',
      LOOT: 'Grab the loot (E) and get out.',
      ESCAPE: ctx && ctx.stars > 0 ? 'Lose the cops, then get to a lock-up.' : 'Get to a lock-up.',
    }[this.state];
    return {
      state: this.state,
      target: t,
      objective,
      security: j.security,
      suspicion: j.suspicion,
      noise: j.noise / t.security.noiseLimit,
      alarm: j.alarm,
      jammed: j.jammedFor,
      smoked: j.smokedFor,
      breach: j.breach.map((/** @type {any} */ b) => b.progress),
      breaching: j.breaching,
      bags: j.bags.map((/** @type {any} */ b) => ({ index: b.index, value: b.value, kg: b.kg, taken: b.taken, available: !!b.available, carrier: b.carrier })),
      carried,
      encumbrance: enc,
      crew,
      timeLeft: t.timeLimitSeconds ? Math.max(0, t.timeLimitSeconds - j.time) : null,
      escapeStars: j.escapeStars,
      dropOffs: t.escape.dropOffs.map((/** @type {string} */ id) => this.dropOff(id)),
      time: j.time,
    };
  }

  serialize() {
    return { heat: Math.round(this.heat * 10) / 10, cooldowns: { ...this.cooldowns }, stats: { ...this.stats } };
  }

  /** @param {any} d */
  load(d) {
    this.heat = clamp(Number(d?.heat) || 0, 0, this.config.heatRules.max);
    this.cooldowns = {};
    for (const [k, v] of Object.entries(d?.cooldowns ?? {})) if (this.target(k) && Number(v) > 0) this.cooldowns[k] = Number(v);
    const s = d?.stats ?? {};
    this.stats = { done: Math.max(0, s.done | 0), failed: Math.max(0, s.failed | 0), earned: Math.max(0, Number(s.earned) || 0), best: Math.max(0, Number(s.best) || 0) };
  }
}

export default HeistManager;
