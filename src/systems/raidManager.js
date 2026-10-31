// @ts-check
/**
 * Legendary raids: the rules (engine-free, unit-tested). RaidWorld.ts is the world side (the
 * legendary in the street, its stomps, the trainers who join you); BattleController runs the fight.
 *
 *   idle --(rare roll | quest trigger)--> omen --(omenSeconds)--> rampage
 *   rampage --(you press B near it)--> engaged --(you win)--> subdued --(caught)--> caught (for good)
 *                                         |  (lose / run)          |  (window over)
 *                                         v                        v
 *                                      rampage                  escaped --(cooldown)--> idle
 *   rampage --(rampageSeconds without being beaten)--> escaped
 *
 * One raid at a time. A legendary's HP (a fraction of its max) persists across fights inside a raid
 * and heals partly when it escapes. Its level follows your team (strongest + levelOverParty,
 * clamped to levelRange), so it's always a fight. Quest raids ignore the rare roll and the normal
 * cooldown (they use questCooldownSeconds, so a lost quest fight can be retried soon).
 */

/** @typedef {import('./raidManager').RaidConfig} RaidConfig */
/** @typedef {import('./raidManager').LegendaryDef} LegendaryDef */
/** @typedef {import('./raidManager').RaidState} RaidState */
/** @typedef {import('./raidManager').RaidContext} RaidContext */
/** @typedef {import('./raidManager').RaidEvent} RaidEvent */
/** @typedef {import('./raidManager').RaidSave} RaidSave */

export const RAID_STATUS = /** @type {const} */ (['idle', 'omen', 'rampage', 'engaged', 'subdued', 'escaped', 'caught']);

/**
 * @param {RaidConfig} c
 * @param {{ species?: (id: string) => boolean; quests?: (id: string) => boolean }} [known]
 * @returns {true}
 */
export function validateRaids(c, known = {}) {
  const err = (/** @type {string} */ m) => {
    throw new Error(`legendaries: ${m}`);
  };
  const S = c?.settings;
  if (!S) err('settings missing');
  for (const k of ['rareCheckSeconds', 'omenSeconds', 'rampageSeconds', 'subduedSeconds', 'cooldownSeconds', 'questCooldownSeconds', 'hpScale', 'actionsPerTurn', 'foeDamage', 'catchMultiplier'])
    if (!(/** @type {Record<string, any>} */ (S)[k] > 0)) err(`settings.${k} must be > 0`);
  if (!(S.levelRange[0] >= 1 && S.levelRange[1] >= S.levelRange[0] && S.levelRange[1] <= 100)) err('settings.levelRange');
  if (!(S.escapeHeal >= 0 && S.escapeHeal <= 1)) err('settings.escapeHeal must be 0-1');
  if (!(S.stomp.every[0] > 0 && S.stomp.every[1] >= S.stomp.every[0] && S.stomp.radius > 0)) err('settings.stomp');
  if (!(S.allies.count[0] >= 0 && S.allies.count[1] >= S.allies.count[0] && S.allies.hpFloor >= 0 && S.allies.hpFloor < 1)) err('settings.allies');
  if (!c.legendaries?.length) err('no legendaries');
  const ids = new Set();
  for (const l of c.legendaries) {
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(l.id) || ids.has(l.id)) err(`bad or duplicate id "${l.id}"`);
    ids.add(l.id);
    if (known.species && !known.species(l.species)) err(`${l.id}: unknown species "${l.species}"`);
    const t = l.trigger;
    if (!t || (!t.rare && !t.quest)) err(`${l.id}: needs a rare or quest trigger`);
    if (t.rare && !(t.rare.chance > 0 && t.rare.chance <= 1 && t.rare.districts?.length && t.rare.times?.length)) err(`${l.id}: rare trigger needs chance, districts and times`);
    if (t.quest && known.quests && !known.quests(t.quest)) err(`${l.id}: unknown quest "${t.quest}"`);
    for (const k of ['omen', 'arrive', 'escaped', 'subdued', 'caught']) if (!(/** @type {Record<string, any>} */ (l)[k])) err(`${l.id}: missing text "${k}"`);
    if (!/^#[0-9a-f]{6}$/i.test(l.color)) err(`${l.id}: color must be #rrggbb`);
  }
  return true;
}

export class RaidManager {
  /**
   * @param {{ config: RaidConfig; rand?: () => number }} o
   */
  constructor(o) {
    validateRaids(o.config);
    this.config = o.config;
    this.S = o.config.settings;
    this.rand = o.rand ?? Math.random;
    /** Seconds of play (the manager's own clock). */
    this.time = 0;
    this.checkIn = this.S.rareCheckSeconds;
    /** @type {Map<string, RaidState>} */
    this.states = new Map();
    for (const l of o.config.legendaries) this.states.set(l.id, { id: l.id, status: 'idle', hp: 1, timer: 0, cooldownUntil: 0, caught: false, beaten: 0, escapes: 0, level: 0, quest: null, at: null });
    /** The raid in progress (one at a time). @type {RaidState | null} */
    this.active = null;
  }

  /** @param {string} id */
  def(id) {
    const d = this.config.legendaries.find((l) => l.id === id);
    if (!d) throw new Error(`no legendary "${id}"`);
    return d;
  }

  /** @param {string} id */
  state(id) {
    const s = this.states.get(id);
    if (!s) throw new Error(`no legendary "${id}"`);
    return s;
  }

  /** The level it turns up at for a team whose strongest is `partyLevel`. @param {number} partyLevel */
  levelFor(partyLevel) {
    const [lo, hi] = this.S.levelRange;
    return Math.max(lo, Math.min(hi, Math.round(partyLevel) + this.S.levelOverParty));
  }

  /**
   * Can this legendary turn up as a rare event here and now?
   * @param {LegendaryDef} d @param {RaidContext} ctx
   */
  rareEligible(d, ctx) {
    const r = d.trigger.rare;
    if (!r) return false;
    const s = this.state(d.id);
    if (s.caught || s.status !== 'idle' || this.time < s.cooldownUntil) return false;
    if (ctx.partyLevel < this.S.minPartyLevel) return false;
    if ((r.biome ?? 'street') !== ctx.biome) return false;
    // Quest legendaries: once you've beaten it in its quest, it can turn up again (if it got away).
    if (r.afterBeaten && s.beaten === 0) return false;
    return r.districts.includes(ctx.district) && r.times.includes(ctx.time);
  }

  /**
   * Starts a raid now (a quest step, or a debug key). Returns false if one is already running, the
   * legendary has been caught, or it's on cooldown.
   * @param {string} id @param {{ partyLevel: number; at?: { x: number; y: number; z: number; biome: string } | null; quest?: string | null }} o
   */
  trigger(id, o) {
    const s = this.state(id);
    if (this.active || s.caught || this.time < s.cooldownUntil) return false;
    s.status = 'omen';
    s.timer = this.S.omenSeconds;
    s.level = this.levelFor(o.partyLevel);
    s.quest = o.quest ?? null;
    s.at = o.at ?? null;
    this.active = s;
    return true;
  }

  /**
   * Advances timers; rolls for a rare legendary every rareCheckSeconds when nothing's running.
   * @param {number} dt @param {RaidContext} ctx
   * @returns {RaidEvent[]}
   */
  update(dt, ctx) {
    /** @type {RaidEvent[]} */
    const ev = [];
    this.time += dt;
    const a = this.active;
    if (!a) {
      if (ctx.blocked) return ev;
      this.checkIn -= dt;
      if (this.checkIn > 0) return ev;
      this.checkIn = this.S.rareCheckSeconds;
      for (const d of this.config.legendaries) {
        if (!this.rareEligible(d, ctx)) continue;
        if (this.rand() < /** @type {NonNullable<LegendaryDef['trigger']['rare']>} */ (d.trigger.rare).chance) {
          this.trigger(d.id, { partyLevel: ctx.partyLevel });
          ev.push({ type: 'omen', id: d.id });
          break;
        }
      }
      return ev;
    }
    if (a.status === 'engaged') return ev;
    a.timer -= dt;
    if (a.timer > 0) return ev;
    if (a.status === 'omen') {
      a.status = 'rampage';
      a.timer = this.S.rampageSeconds;
      ev.push({ type: 'arrive', id: a.id });
    } else if (a.status === 'rampage' || a.status === 'subdued') {
      ev.push(...this.escape(a));
    }
    return ev;
  }

  /** You started fighting it. @param {string} id */
  engage(id) {
    const s = this.state(id);
    if (s !== this.active || s.status !== 'rampage') return false;
    s.status = 'engaged';
    return true;
  }

  /**
   * The fight ended. `hp` is what's left of it (fraction). Win: subdued (catch window). Otherwise
   * it rampages on with what HP it has, the clock still running.
   * @param {string} id @param {'win' | 'lose' | 'ran' | 'aborted'} outcome @param {number} hp
   * @returns {RaidEvent[]}
   */
  disengage(id, outcome, hp) {
    const s = this.state(id);
    if (s !== this.active || s.status !== 'engaged') return [];
    s.hp = Math.max(0, Math.min(1, hp));
    if (outcome === 'win') {
      s.status = 'subdued';
      s.timer = this.S.subduedSeconds;
      s.beaten++;
      return [{ type: 'subdued', id, quest: s.quest }];
    }
    s.status = 'rampage';
    s.timer = Math.max(s.timer, 45);
    return [{ type: 'resume', id }];
  }

  /** Damage from outside the battle (the trainers' Streetmon): never below the allies' floor. @param {string} id @param {number} frac */
  chip(id, frac) {
    const s = this.state(id);
    if (s !== this.active || s.status !== 'rampage') return s.hp;
    s.hp = Math.max(Math.min(s.hp, this.S.allies.hpFloor), s.hp - Math.max(0, frac));
    return s.hp;
  }

  /** Caught while subdued: gone for good. @param {string} id @returns {RaidEvent[]} */
  caught(id) {
    const s = this.state(id);
    if (s !== this.active || s.status !== 'subdued') return [];
    s.status = 'caught';
    s.caught = true;
    this.active = null;
    return [{ type: 'caught', id, quest: s.quest }];
  }

  /** @param {RaidState} s @returns {RaidEvent[]} */
  escape(s) {
    const quest = s.quest;
    s.status = 'idle';
    s.escapes++;
    s.hp = Math.min(1, s.hp + this.S.escapeHeal);
    s.cooldownUntil = this.time + (quest ? this.S.questCooldownSeconds : this.S.cooldownSeconds);
    s.quest = null;
    s.at = null;
    this.active = null;
    return [{ type: 'escaped', id: s.id, quest }];
  }

  /** You left the layer, died, or the game reset it: it slips away (no message). */
  abandon() {
    return this.active ? this.escape(this.active) : [];
  }

  /** Catch chance multiplier while subdued. */
  get catchMultiplier() {
    return this.S.catchMultiplier;
  }

  /** @returns {RaidSave} */
  save() {
    return {
      time: Math.round(this.time),
      legendaries: [...this.states.values()].map((s) => ({ id: s.id, caught: s.caught, cooldownLeft: Math.max(0, Math.round(s.cooldownUntil - this.time)), beaten: s.beaten, escapes: s.escapes, hp: Math.round(s.hp * 1000) / 1000 })),
    };
  }

  /** Restores from a save (any raid in progress is dropped: it escaped while you were away). @param {unknown} raw */
  load(raw) {
    const d = /** @type {Partial<RaidSave> | null} */ (raw && typeof raw === 'object' ? raw : null);
    this.active = null;
    this.time = 0;
    this.checkIn = this.S.rareCheckSeconds;
    for (const s of this.states.values()) {
      const e = d?.legendaries?.find((x) => x && x.id === s.id);
      s.status = e?.caught ? 'caught' : 'idle';
      s.caught = !!e?.caught;
      s.cooldownUntil = Math.max(0, Math.min(this.S.cooldownSeconds, Number(e?.cooldownLeft) || 0));
      s.beaten = Math.max(0, Number(e?.beaten) || 0);
      s.escapes = Math.max(0, Number(e?.escapes) || 0);
      s.hp = Math.max(0.2, Math.min(1, Number(e?.hp) || 1));
      s.quest = null;
      s.at = null;
      s.timer = 0;
    }
  }
}
