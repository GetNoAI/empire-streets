// @ts-check
/**
 * Cinematics: the rules (engine-free, unit-tested). CinematicView.ts is the world side (camera,
 * letterbox, captions, the actors); Game.ts decides when one plays (a new game's intro, an act
 * starting, a District Boss stepping up, a legendary turning up).
 *
 * A cinematic is a list of shots. Each shot is relative to an anchor: a fixed spot from the config
 * ("park", "harbor") or one the game supplies when it plays (the player, Mama Rust, a boss, the
 * legendary). The camera either moves between two offsets (`cam` and `look`, eased) or orbits the
 * anchor (`orbit`). Captions fade in and out over the shot; a shot can fade up from black, and
 * the last one fades out. Actors (Streetmon, cars) are props placed for the shot and moved in a
 * straight line from `from` to `to`.
 */

/** @typedef {import('./cinematics').CinematicConfig} CinematicConfig */
/** @typedef {import('./cinematics').CinematicDef} CinematicDef */
/** @typedef {import('./cinematics').Shot} Shot */
/** @typedef {import('./cinematics').ShotActor} ShotActor */
/** @typedef {import('./cinematics').Anchor} Anchor */
/** @typedef {import('./cinematics').CinematicEvent} CinematicEvent */

export const EASES = /** @type {const} */ (['linear', 'in', 'out', 'inOut']);
/** Background music a cinematic can ask for: the opening's theme, or the high-octane one (without: the game's music carries on). */
export const MUSIC_CUES = /** @type {const} */ (['intro', 'action']);
/** What can start a cinematic (see Game.playCinematicFor). */
export const TRIGGERS = /** @type {const} */ (['newGame', 'actStarted', 'questStarted', 'questCompleted', 'bossIntro', 'bossDefeat', 'raidArrive']);

/**
 * The cinematic for a game event, if any (and not already seen, when it plays once).
 * @param {CinematicConfig} c @param {Record<string, string | true>} ev @param {Set<string>} seen
 * @returns {CinematicDef | null}
 */
export function cinematicFor(c, ev, seen) {
  const [k, v] = /** @type {[string, unknown]} */ (Object.entries(ev)[0] ?? ['', null]);
  for (const d of c.cinematics) {
    const t = /** @type {Record<string, unknown> | undefined} */ (d.trigger);
    if (!t || t[k] === undefined || (t[k] !== true && t[k] !== v)) continue;
    if (d.once !== false && seen.has(d.id)) continue;
    return d;
  }
  return null;
}

/** @param {string} kind @param {number} u */
export function ease(kind, u) {
  const x = Math.max(0, Math.min(1, u));
  switch (kind) {
    case 'linear':
      return x;
    case 'in':
      return x * x;
    case 'out':
      return 1 - (1 - x) * (1 - x);
    default:
      return x * x * (3 - 2 * x);
  }
}

/**
 * @param {CinematicConfig} c
 * @param {{ anchors?: string[]; species?: (id: string) => boolean; specs?: (id: string) => boolean; quests?: (id: string) => boolean; acts?: (id: string) => boolean }} [known]
 *   anchors: the names the game resolves itself (besides the config's own).
 * @returns {true}
 */
export function validateCinematics(c, known = {}) {
  const err = (/** @type {string} */ m) => {
    throw new Error(`cinematics: ${m}`);
  };
  const S = c?.settings;
  if (!S) err('settings missing');
  if (!(S.letterbox >= 0 && S.letterbox < 0.3)) err('settings.letterbox must be 0-0.3');
  if (!(S.captionFade > 0 && S.fadeSeconds > 0)) err('settings.captionFade and fadeSeconds must be > 0');
  const v3 = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
  const v2 = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
  const anchors = new Set([...Object.keys(c.anchors ?? {}), ...(known.anchors ?? [])]);
  for (const [k, a] of Object.entries(c.anchors ?? {})) if (!v2(a)) err(`anchor ${k} must be [x, z]`);
  if (!c.cinematics?.length) err('no cinematics');
  const ids = new Set();
  for (const d of c.cinematics) {
    if (!/^[a-z][a-z0-9-]*$/.test(d.id) || ids.has(d.id)) err(`bad or duplicate id "${d.id}"`);
    ids.add(d.id);
    if (!d.shots?.length) err(`${d.id}: no shots`);
    if (d.music !== undefined && !MUSIC_CUES.includes(/** @type {any} */ (d.music))) err(`${d.id}: music must be one of ${MUSIC_CUES.join(', ')}`);
    const tr = d.trigger;
    if (tr) {
      const keys = Object.keys(tr);
      if (keys.length !== 1 || !TRIGGERS.includes(/** @type {any} */ (keys[0]))) err(`${d.id}: trigger must be one of ${TRIGGERS.join(', ')}`);
      if (tr.actStarted && known.acts && !known.acts(tr.actStarted)) err(`${d.id}: unknown act "${tr.actStarted}"`);
      for (const q of [tr.questStarted, tr.questCompleted]) if (q && known.quests && !known.quests(q)) err(`${d.id}: unknown quest "${q}"`);
    }
    d.shots.forEach((s, i) => {
      const at = `${d.id} shot ${i + 1}`;
      const an = s.anchor ?? d.anchor;
      if (!an || !anchors.has(an)) err(`${at}: unknown anchor "${an}"`);
      if (!(s.seconds > 0 && s.seconds <= 30)) err(`${at}: seconds must be 0-30`);
      if (s.orbit) {
        const o = s.orbit;
        if (!(o.radius > 0 && Number.isFinite(o.height) && Number.isFinite(o.fromDeg) && Number.isFinite(o.toDeg))) err(`${at}: orbit needs radius, height, fromDeg, toDeg`);
      } else if (!(Array.isArray(s.cam) && s.cam.length === 2 && s.cam.every(v3))) err(`${at}: cam must be two [x, y, z] offsets`);
      if (!(Array.isArray(s.look) && s.look.length === 2 && s.look.every(v3))) err(`${at}: look must be two [x, y, z] offsets`);
      if (s.ease && !EASES.includes(/** @type {any} */ (s.ease))) err(`${at}: unknown ease "${s.ease}"`);
      if (s.fade !== undefined && !(s.fade >= 0 && s.fade < s.seconds)) err(`${at}: fade must be shorter than the shot`);
      if (s.sub && !s.caption) err(`${at}: a sub-caption needs a caption`);
      for (const a of s.actors ?? []) {
        if (a.kind === 'creature') {
          if (!a.species || (known.species && !known.species(a.species))) err(`${at}: unknown species "${a.species}"`);
        } else if (a.kind === 'car') {
          if (!a.spec || (known.specs && !known.specs(a.spec))) err(`${at}: unknown car "${a.spec}"`);
          if (a.color && !/^#[0-9a-f]{6}$/i.test(a.color)) err(`${at}: car color must be #rrggbb`);
        } else err(`${at}: actor kind must be creature or car`);
        if (!v2(a.from) || (a.to !== undefined && !v2(a.to))) err(`${at}: actor from/to must be [x, z]`);
      }
    });
  }
  return true;
}

/** Turns an offset by the anchor's heading (only for shots with `orient`). @param {number} x @param {number} z @param {number} h */
function turn(x, z, h) {
  const c = Math.cos(h);
  const s = Math.sin(h);
  // Heading 0 faces +X; offsets are written as if the anchor faced +X.
  return [x * c + z * s, -x * s + z * c];
}

export class CinematicPlayer {
  /**
   * @param {CinematicDef} def
   * @param {CinematicConfig['settings']} settings
   */
  constructor(def, settings) {
    this.def = def;
    this.S = settings;
    this.index = 0;
    /** Seconds into the current shot. */
    this.t = 0;
    this.started = false;
    this.done = false;
    this.skipped = false;
  }

  /** @returns {Shot} */
  get shot() {
    return this.def.shots[Math.min(this.index, this.def.shots.length - 1)];
  }

  /** Anchor name for the current shot. */
  get anchor() {
    return /** @type {string} */ (this.shot.anchor ?? this.def.anchor);
  }

  get skippable() {
    return this.def.skippable !== false;
  }

  /** Total running time (s). */
  get duration() {
    return this.def.shots.reduce((a, s) => a + s.seconds, 0);
  }

  /** @returns {number} 0..1 through the whole thing */
  get progress() {
    let t = this.t;
    for (let i = 0; i < this.index && i < this.def.shots.length; i++) t += this.def.shots[i].seconds;
    return Math.min(1, t / this.duration);
  }

  /** @param {number} dt @returns {CinematicEvent[]} */
  update(dt) {
    /** @type {CinematicEvent[]} */
    const ev = [];
    if (this.done) return ev;
    if (!this.started) {
      this.started = true;
      ev.push({ type: 'shot', index: 0 });
      return ev;
    }
    this.t += Math.max(0, dt);
    while (!this.done && this.t >= this.shot.seconds) {
      this.t -= this.shot.seconds;
      ev.push({ type: 'shotEnd', index: this.index });
      this.index++;
      if (this.index >= this.def.shots.length) {
        this.done = true;
        this.index = this.def.shots.length - 1;
        this.t = this.shot.seconds;
        ev.push({ type: 'end', skipped: false });
      } else ev.push({ type: 'shot', index: this.index });
    }
    return ev;
  }

  /** Stops now (Space / Enter / Esc). @returns {CinematicEvent[]} */
  skip() {
    if (this.done || !this.skippable) return [];
    this.done = true;
    this.skipped = true;
    return [{ type: 'shotEnd', index: this.index }, { type: 'end', skipped: true }];
  }

  /** Eased 0..1 through the current shot. */
  get u() {
    const s = this.shot;
    return ease(s.ease ?? 'inOut', this.t / s.seconds);
  }

  /**
   * Camera position and look-at point for the current moment.
   * @param {Anchor} a
   * @returns {{ cam: [number, number, number]; look: [number, number, number] }}
   */
  pose(a) {
    const s = this.shot;
    const u = this.u;
    const h = s.orient ? (a.heading ?? 0) : 0;
    const ay = a.y ?? 0;
    const at = (/** @type {[number, number, number][]} */ k) => {
      const x = k[0][0] + (k[1][0] - k[0][0]) * u;
      const y = k[0][1] + (k[1][1] - k[0][1]) * u;
      const z = k[0][2] + (k[1][2] - k[0][2]) * u;
      const [rx, rz] = turn(x, z, h);
      return /** @type {[number, number, number]} */ ([a.x + rx, ay + y, a.z + rz]);
    };
    const look = at(s.look);
    if (s.orbit) {
      const o = s.orbit;
      const deg = o.fromDeg + (o.toDeg - o.fromDeg) * u;
      const r = (deg * Math.PI) / 180 - h;
      return { cam: [a.x + Math.cos(r) * o.radius, ay + o.height, a.z + Math.sin(r) * o.radius], look };
    }
    return { cam: at(/** @type {any} */ (s.cam)), look };
  }

  /** The caption and how visible it is (fades in and out with the shot). */
  caption() {
    const s = this.shot;
    if (!s.caption) return { text: '', sub: '', alpha: 0 };
    const f = this.S.captionFade;
    const t = this.t;
    const inA = Math.min(1, Math.max(0, (t - (s.captionAt ?? 0.4)) / f));
    const outA = Math.min(1, Math.max(0, (s.seconds - t) / f));
    return { text: s.caption, sub: s.sub ?? '', alpha: this.done && !this.skipped ? 0 : Math.min(inA, outA) };
  }

  /** How black the screen is: fading up into a shot that asks for it, and out of the last one. */
  black() {
    if (this.done) return this.skipped ? 0 : 1;
    const s = this.shot;
    let a = 0;
    if (s.fade) a = Math.max(a, 1 - this.t / s.fade);
    const next = this.def.shots[this.index + 1];
    const out = this.S.fadeSeconds;
    // Fade out before a shot that fades in, and at the very end.
    if (!next || next.fade) {
      const len = next ? Math.min(out, next.fade ?? out) * 0.5 : out;
      a = Math.max(a, 1 - (s.seconds - this.t) / len);
    }
    return Math.max(0, Math.min(1, a));
  }

  /**
   * Where an actor is now (offsets turned by the anchor when the shot is oriented).
   * @param {ShotActor} actor @param {Anchor} a
   * @returns {{ x: number; z: number; heading: number; moving: boolean }}
   */
  actorPose(actor, a) {
    const s = this.shot;
    const h = s.orient ? (a.heading ?? 0) : 0;
    const to = actor.to ?? actor.from;
    const d = actor.delay ?? 0;
    const span = Math.max(0.01, s.seconds - d - (actor.stopEarly ?? 0));
    const k = Math.max(0, Math.min(1, (this.t - d) / span));
    const lx = actor.from[0] + (to[0] - actor.from[0]) * k;
    const lz = actor.from[1] + (to[1] - actor.from[1]) * k;
    const [rx, rz] = turn(lx, lz, h);
    const dx = to[0] - actor.from[0];
    const dz = to[1] - actor.from[1];
    const moving = Math.hypot(dx, dz) > 0.01 && k > 0 && k < 1;
    // Facing: along its path, or its own heading (degrees) when it stands still.
    const [wx, wz] = turn(dx, dz, h);
    const heading = Math.hypot(dx, dz) > 0.01 ? Math.atan2(-wz, wx) : ((actor.headingDeg ?? 0) * Math.PI) / 180 - h;
    return { x: a.x + rx, z: a.z + rz, heading, moving };
  }
}

