// @ts-check
/**
 * Tutorials: short cards that teach each mechanic the first time it matters (engine-free,
 * unit-tested).
 *
 * Every tutorial in tutorials.json says when it comes up:
 *   - `trigger`: a situation or event the game reports with `fire(event, data)` ("nearCar",
 *     "battleStart" with { mode: 'turn' }, "wanted" with { stars: 3 }...), optionally with
 *     conditions on the data (`if`: a value, a list of values, or { gte, lte });
 *   - or no trigger: the campaign asks for it by id (`request(id)`), from an objective's
 *     `tutorial` field in campaign_quests.json, so the story teaches what its next job needs.
 *   - `after`: tutorials that must have been shown first. A trigger that arrives too early waits
 *     (the onboarding is a chain: on foot -> cars -> driving -> map and jobs).
 *
 * Situations (`situations` in the config: things the game re-checks a few times a second, like
 * "a car within reach" or "wanted at 3 stars") only show their tip while they're still true: a
 * tip about the stars won't come up after you've lost them. One-off events (busted, a battle
 * starting) and campaign requests show whenever there's room.
 *
 * A card shows one at a time, highest priority first, a short gap apart, only where it makes
 * sense (`where`: 'play' on the street, 'battle' during a fight, 'menu' over a menu, or 'any').
 * A card that no longer fits where you are (a fight starts) is put back and comes back later.
 *
 * Steps can be practice: a step with `do` ticks off when the game reports that action
 * (`action('sprint')`); the card closes itself once they're all done. Actions you already did
 * before the card came up are ticked straight away, and a card whose steps are all practice you
 * have already done is skipped. Reading cards close after a reading time (or Enter / the button).
 *
 * `skipOn` drops a tip you've plainly outgrown: the manhole tip once you've been down the sewers,
 * the heist tip once you've planned one.
 *
 * Seen tutorials are saved; any of them can be replayed from the pause menu, and tips can be
 * turned off.
 *
 * Text: {Key} renders as a key cap ({W}, {Shift}, {LMB}).
 */

/**
 * @typedef {import('./tutorialManager').TutorialConfig} TutorialConfig
 * @typedef {import('./tutorialManager').TutorialDef} TutorialDef
 * @typedef {import('./tutorialManager').TutorialTrigger} TutorialTrigger
 * @typedef {import('./tutorialManager').TutorialView} TutorialView
 * @typedef {import('./tutorialManager').TutorialWhere} TutorialWhere
 * @typedef {import('./tutorialManager').TutorialSave} TutorialSave
 */

export const TUTORIAL_WHERE = /** @type {const} */ (['play', 'battle', 'menu', 'any']);

const DEFAULTS = {
  gapSeconds: 3,
  readSecondsBase: 7,
  readSecondsPerWord: 0.3,
  readSecondsMax: 28,
  practiceTimeout: 75,
  doneDelay: 1.4,
  queueExpiry: 40,
  cutInPriority: 40,
  freshSeconds: 1,
};

/**
 * Checks a tutorials config: unique ids, known categories, `after` references, triggers that name
 * a known event (when `events` is given), steps with text, balanced key caps.
 * @param {TutorialConfig} c
 * @param {{ events?: readonly string[]; actions?: readonly string[] }} [known]
 * @returns {true}
 */
export function validateTutorials(c, known = {}) {
  const err = (/** @type {string} */ m) => {
    throw new Error(`tutorials: ${m}`);
  };
  if (!c || !Array.isArray(c.tutorials) || !c.tutorials.length) err('no tutorials');
  const cats = new Set((c.categories ?? []).map((x) => x.id));
  const ids = new Set();
  for (const t of c.tutorials) {
    if (!t.id || !/^[a-z0-9-]{1,40}$/.test(t.id)) err(`bad id ${t.id}`);
    if (ids.has(t.id)) err(`duplicate id ${t.id}`);
    ids.add(t.id);
    if (!t.title) err(`${t.id}: no title`);
    if (cats.size && !cats.has(t.category)) err(`${t.id}: unknown category ${t.category}`);
    if (t.where && !TUTORIAL_WHERE.includes(t.where)) err(`${t.id}: bad where ${t.where}`);
    if (!Array.isArray(t.steps) || !t.steps.length) err(`${t.id}: no steps`);
    for (const s of t.steps) {
      if (!s.text) err(`${t.id}: a step has no text`);
      if ((s.text.match(/\{/g) ?? []).length !== (s.text.match(/\}/g) ?? []).length) err(`${t.id}: unbalanced key cap in "${s.text}"`);
      if (s.do && known.actions && !known.actions.includes(s.do)) err(`${t.id}: unknown action ${s.do}`);
    }
    for (const tr of triggersOf(t)) if (known.events && !known.events.includes(tr.on)) err(`${t.id}: unknown trigger event ${tr.on}`);
    for (const e of t.skipOn ?? []) if (known.events && !known.events.includes(e)) err(`${t.id}: unknown skipOn event ${e}`);
  }
  for (const sit of c.situations ?? []) if (c.events && !c.events.includes(sit)) err(`situation ${sit} is not one of the events`);
  for (const t of c.tutorials) for (const a of t.after ?? []) if (!ids.has(a)) err(`${t.id}: after unknown tutorial ${a}`);
  // No cycles in `after`.
  const byId = new Map(c.tutorials.map((t) => [t.id, t]));
  const visit = (/** @type {string} */ id, /** @type {Set<string>} */ path) => {
    if (path.has(id)) err(`after cycle through ${id}`);
    path.add(id);
    for (const a of byId.get(id)?.after ?? []) visit(a, new Set(path));
  };
  for (const t of c.tutorials) visit(t.id, new Set());
  return true;
}

/** @param {TutorialDef} t @returns {TutorialTrigger[]} */
function triggersOf(t) {
  if (!t.trigger) return [];
  return Array.isArray(t.trigger) ? t.trigger : [t.trigger];
}

/**
 * Does the event data meet a trigger's conditions?
 * @param {TutorialTrigger} tr @param {Record<string, unknown>} data
 */
export function triggerMatches(tr, data) {
  for (const [k, want] of Object.entries(tr.if ?? {})) {
    const v = data[k];
    if (Array.isArray(want)) {
      if (!want.includes(/** @type {never} */ (v))) return false;
    } else if (want && typeof want === 'object') {
      const w = /** @type {{ gte?: number; lte?: number }} */ (want);
      if (typeof v !== 'number') return false;
      if (w.gte !== undefined && v < w.gte) return false;
      if (w.lte !== undefined && v > w.lte) return false;
    } else if (v !== want) return false;
  }
  return true;
}

/** Words in a card (for its reading time). @param {TutorialDef} t */
function words(t) {
  const all = [t.title, t.intro ?? '', ...t.steps.map((s) => s.text)].join(' ');
  return all.split(/\s+/).filter(Boolean).length;
}

/**
 * Splits text into plain runs and key caps: "Press {E} to" -> ['Press ', {key:'E'}, ' to'].
 * @param {string} text
 * @returns {Array<string | { key: string }>}
 */
export function parseKeys(text) {
  /** @type {Array<string | { key: string }>} */
  const out = [];
  const re = /\{([^{}]+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export class TutorialManager {
  /** @param {{ config: TutorialConfig }} o */
  constructor(o) {
    this.config = o.config;
    this.settings = { ...DEFAULTS, ...(o.config.settings ?? {}) };
    /** @type {Map<string, TutorialDef>} */
    this.defs = new Map(o.config.tutorials.map((t) => [t.id, t]));
    this.order = o.config.tutorials.map((t) => t.id);
    /** Tips on or off (off: nothing new shows; replays still do). */
    this.enabled = true;
    /** Shown at least once. @type {Set<string>} */
    this.seen = new Set();
    /** Every action the player has done (practice steps tick from these). @type {Set<string>} */
    this.performed = new Set();
    /** Waiting to show: id, when queued, forced (a replay or a request ignores `seen`). */
    /** @type {Array<{ id: string; at: number; forced: boolean; expires: boolean; situational?: boolean; done?: boolean[]; shownFor?: number }>} */
    this.queue = [];
    /** Events re-checked continuously (their tips need them to still be true). */
    this.situations = new Set(o.config.situations ?? []);
    /** When each tip's situation was last true. @type {Map<string, number>} */
    this.live = new Map();
    /** Triggered before their `after` tutorials were shown: they queue once those have been. @type {Set<string>} */
    this.pending = new Set();
    /** @type {{ id: string; def: TutorialDef; done: boolean[]; shownFor: number; closing: number; forced: boolean } | null} */
    this.current = null;
    this.time = 0;
    this.gap = 0;
    this.stats = { shown: 0, practiced: 0, skipped: 0, dismissed: 0 };
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** @param {'show' | 'step' | 'hide' | 'close'} type @param {(e: any) => void} fn */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  /** @param {string} id */
  def(id) {
    return this.defs.get(id) ?? null;
  }

  /** Has it been shown (or will it be skipped)? @param {string} id */
  isSeen(id) {
    return this.seen.has(id);
  }

  /** @param {TutorialDef} t */
  afterMet(t) {
    return (t.after ?? []).every((a) => this.seen.has(a));
  }

  /** In the queue or on screen? @param {string} id */
  isQueued(id) {
    return this.current?.id === id || this.queue.some((q) => q.id === id);
  }

  /**
   * The game reports a situation or event. Tutorials it triggers (not seen yet) queue up.
   * @param {string} event @param {Record<string, unknown>} [data]
   * @returns {string[]} ids newly queued
   */
  fire(event, data = {}) {
    this.performed.add(`@${event}`);
    if (!this.enabled) return [];
    const out = [];
    const situation = this.situations.has(event);
    for (const id of this.order) {
      const t = /** @type {TutorialDef} */ (this.defs.get(id));
      if (this.seen.has(id)) continue;
      // You've plainly done it already (been down the sewers before the manhole tip came up).
      if (t.skipOn?.includes(event) && this.current?.id !== id) {
        this.markSeen([id]);
        continue;
      }
      if (!triggersOf(t).some((tr) => tr.on === event && triggerMatches(tr, data))) continue;
      if (situation) this.live.set(id, this.time);
      if (this.isQueued(id)) continue;
      if (!this.afterMet(t)) {
        this.pending.add(id);
        continue;
      }
      this.enqueue(id, false, !t.keep, situation);
      out.push(id);
    }
    return out;
  }

  /**
   * Ask for a tutorial by id (the campaign, a script). Shown if not seen yet; no expiry.
   * @param {string} id
   */
  request(id) {
    const t = this.defs.get(id);
    if (!t || !this.enabled || this.seen.has(id) || this.isQueued(id)) return false;
    if (!this.afterMet(t)) {
      this.pending.add(id);
      return false;
    }
    this.enqueue(id, false, false);
    return true;
  }

  /** Show it again (pause menu). @param {string} id */
  replay(id) {
    if (!this.defs.has(id)) return false;
    if (this.current?.id === id) return true;
    this.queue = this.queue.filter((q) => q.id !== id);
    this.queue.unshift({ id, at: this.time, forced: true, expires: false });
    this.gap = 0;
    return true;
  }

  /** @param {string} id @param {boolean} forced @param {boolean} expires @param {boolean} [situational] */
  enqueue(id, forced, expires, situational = false) {
    this.queue.push({ id, at: this.time, forced, expires, situational });
  }

  /** A situational tip whose situation isn't true right now waits. @param {{ id: string; situational?: boolean; forced: boolean; done?: boolean[] }} q */
  stale(q) {
    return !!q.situational && !q.forced && !q.done && this.time - (this.live.get(q.id) ?? -Infinity) > this.settings.freshSeconds;
  }

  /**
   * The player did something (moved, sprinted, opened the map...). Ticks practice steps.
   * @param {string} name
   */
  action(name) {
    const fresh = !this.performed.has(name);
    this.performed.add(name);
    const c = this.current;
    if (!c) return fresh;
    let ticked = false;
    c.def.steps.forEach((s, i) => {
      if (s.do === name && !c.done[i]) {
        c.done[i] = true;
        ticked = true;
        this.stats.practiced++;
      }
    });
    if (ticked) {
      this.emit('step', this.view());
      // All practised: close soon (a few seconds more when there's reading left on the card).
      if (this.practiceDone(c) && c.closing <= 0) c.closing = this.settings.doneDelay + (c.def.steps.some((s) => !s.do) ? 2 : 0);
    }
    return fresh;
  }

  /** @param {{ def: TutorialDef; done: boolean[] }} c */
  practiceDone(c) {
    const practice = c.def.steps.map((s, i) => (s.do ? i : -1)).filter((i) => i >= 0);
    return practice.length > 0 && practice.every((i) => c.done[i]);
  }

  /** Close the card on screen (Enter, the button). */
  dismiss() {
    if (!this.current) return false;
    this.stats.dismissed++;
    this.close('dismissed');
    return true;
  }

  /** @param {'done' | 'dismissed' | 'timeout'} why */
  close(why) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    // You're in the flow after practising: the next tip follows quickly.
    this.gap = why === 'done' ? Math.min(0.6, this.settings.gapSeconds) : this.settings.gapSeconds;
    this.emit('close', { id: c.id, why });
    this.releasePending();
  }

  /** Tutorials waiting on `after` that can go now. */
  releasePending() {
    for (const id of [...this.pending]) {
      const t = this.defs.get(id);
      if (!t || this.seen.has(id)) {
        this.pending.delete(id);
        continue;
      }
      if (this.afterMet(t)) {
        this.pending.delete(id);
        if (!this.isQueued(id)) this.enqueue(id, false, false, this.live.has(id));
      }
    }
  }

  /** Where a card can show in this context. @param {TutorialWhere | undefined} where @param {string} ctx */
  fits(where, ctx) {
    if (ctx === 'none') return false;
    const w = where ?? 'play';
    return w === 'any' || w === ctx;
  }

  /**
   * Each frame. `where` is what the player is doing: 'play', 'battle', 'menu', or 'none' (dead,
   * loading, a cut-scene: nothing shows, and timers wait).
   * @param {number} dt @param {{ where: 'play' | 'battle' | 'menu' | 'none' }} ctx
   */
  update(dt, ctx) {
    this.time += dt;
    const S = this.settings;
    // Stale situational tips drop out of the queue (the car you were next to is long gone).
    this.queue = this.queue.filter((q) => q.forced || !q.expires || this.time - q.at < S.queueExpiry || !!q.done);
    const c = this.current;
    if (c) {
      const forced = c.forced;
      // A moment with nothing going on (a fade into the sewers, respawning): the card holds, timers wait.
      if (ctx.where === 'none') return;
      if (!forced && !this.fits(c.def.where, ctx.where)) {
        // Not the place for it any more (a fight started): back to the front of the queue.
        this.current = null;
        this.queue.unshift({ id: c.id, at: this.time, forced: false, expires: false, done: c.done, shownFor: c.shownFor });
        this.emit('hide', { id: c.id });
        return;
      }
      // An urgent tip (it's weak: catch it! you're bitten!), or one far more important than this
      // (wanted, busted, over a tip about night time), cuts in; this one waits its turn.
      if (!c.def.interrupt && !forced) {
        const mine = c.def.priority ?? 0;
        const cut = this.queue.findIndex((q) => {
          const t = this.defs.get(q.id);
          if (!t || this.seen.has(q.id) || !this.fits(t.where, ctx.where) || this.stale(q)) return false;
          return !!t.interrupt || (t.priority ?? 0) - mine >= S.cutInPriority;
        });
        if (cut >= 0) {
          this.current = null;
          this.emit('hide', { id: c.id });
          const q = this.queue.splice(cut, 1)[0];
          this.queue.unshift({ id: c.id, at: this.time, forced: false, expires: false, done: c.done, shownFor: c.shownFor });
          this.show(q);
          return;
        }
      }
      c.shownFor += dt;
      if (c.closing > 0) {
        c.closing -= dt;
        if (c.closing <= 0) this.close('done');
        return;
      }
      const practice = c.def.steps.some((s) => s.do);
      const limit = practice ? S.practiceTimeout : c.def.seconds ?? Math.min(S.readSecondsMax, S.readSecondsBase + words(c.def) * S.readSecondsPerWord);
      if (c.shownFor >= limit) this.close('timeout');
      return;
    }
    if (ctx.where === 'none') return;
    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    // Drop what can never show now (seen meanwhile, tips turned off); replays always stay.
    this.queue = this.queue.filter((q) => q.forced || (this.enabled && (!this.seen.has(q.id) || !!q.done)));
    // The highest priority that fits here; replays first, then the order they came in.
    let at = -1;
    let best = -Infinity;
    this.queue.forEach((q, i) => {
      const t = this.defs.get(q.id);
      if (!t || (!q.forced && (!this.fits(t.where, ctx.where) || this.stale(q)))) return;
      const score = (q.forced ? 1e6 : 0) + (t.priority ?? 0) * 100 - i;
      if (score > best) {
        best = score;
        at = i;
      }
    });
    if (at < 0) return;
    const q = this.queue.splice(at, 1)[0];
    this.show(q);
  }

  /** @param {{ id: string; forced: boolean; done?: boolean[]; shownFor?: number }} q */
  show(q) {
    const def = /** @type {TutorialDef} */ (this.defs.get(q.id));
    // Practice already done ticks straight away (also for a card coming back after stepping aside).
    const done = def.steps.map((s, i) => !!q.done?.[i] || (!q.forced && !!s.do && this.performed.has(s.do)));
    // All practice, all done already: you know this one.
    if (!q.forced && !q.done && def.steps.every((s) => !!s.do) && done.every(Boolean)) {
      this.seen.add(q.id);
      this.stats.skipped++;
      this.emit('close', { id: q.id, why: 'skipped' });
      this.releasePending();
      return;
    }
    this.seen.add(q.id);
    this.pending.delete(q.id);
    if (!q.done) this.stats.shown++;
    this.current = { id: q.id, def, done, shownFor: q.shownFor ?? 0, closing: 0, forced: q.forced };
    // Coming back with its practice all done meanwhile: a moment to read the rest, then it goes.
    if (q.done && this.practiceDone(this.current)) this.current.closing = this.settings.doneDelay + (def.steps.some((s) => !s.do) ? 2 : 0);
    this.emit('show', this.view());
    // Tips waiting on this one can queue up behind it now.
    this.releasePending();
  }

  /** What the card shows. @returns {TutorialView | null} */
  view() {
    const c = this.current;
    if (!c) return null;
    const cat = this.config.categories?.find((x) => x.id === c.def.category);
    const practice = c.def.steps.filter((s) => s.do).length;
    return {
      id: c.id,
      title: c.def.title,
      category: cat?.name ?? c.def.category,
      intro: c.def.intro ?? '',
      steps: c.def.steps.map((s, i) => ({ text: s.text, parts: parseKeys(s.text), touchParts: s.touch ? parseKeys(s.touch) : null, practice: !!s.do, done: c.done[i] })),
      practice,
      practiced: c.def.steps.filter((s, i) => s.do && c.done[i]).length,
      replay: c.forced,
      where: c.def.where ?? 'play',
    };
  }

  /** For the pause menu: every tutorial by category, and whether you've seen it. */
  list() {
    return (this.config.categories ?? [{ id: '', name: '' }]).map((cat) => ({
      id: cat.id,
      name: cat.name,
      tutorials: this.config.tutorials.filter((t) => !cat.id || t.category === cat.id).map((t) => ({ id: t.id, title: t.title, seen: this.seen.has(t.id) })),
    }));
  }

  /** Mark tutorials as seen without showing them (an old save that knows the basics). @param {string[]} ids */
  markSeen(ids) {
    for (const id of ids) if (this.defs.has(id)) this.seen.add(id);
    this.queue = this.queue.filter((q) => q.forced || !this.seen.has(q.id));
    this.releasePending();
  }

  /** @returns {TutorialSave} */
  serialize() {
    return { enabled: this.enabled, seen: [...this.seen], performed: [...this.performed].filter((a) => !a.startsWith('@')).slice(0, 200) };
  }

  /** @param {unknown} d */
  load(d) {
    const o = /** @type {Partial<TutorialSave>} */ (d && typeof d === 'object' ? d : {});
    this.enabled = o.enabled !== false;
    this.seen = new Set((Array.isArray(o.seen) ? o.seen : []).filter((id) => typeof id === 'string' && this.defs.has(id)));
    this.performed = new Set((Array.isArray(o.performed) ? o.performed : []).filter((a) => typeof a === 'string' && a.length < 40));
    this.queue = [];
    this.pending.clear();
    if (this.current) {
      const id = this.current.id;
      this.current = null;
      this.emit('close', { id, why: 'dismissed' });
    }
    this.gap = 0;
  }

  /** Tips on/off. Off clears what's waiting (and the card on screen, unless it's a replay). @param {boolean} on */
  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.queue = this.queue.filter((q) => q.forced);
      this.pending.clear();
      if (this.current && !this.current.forced) this.close('dismissed');
    }
    return this.enabled;
  }
}
