// @ts-check
/**
 * Autonomous NPC behaviour (engine-free, unit-tested): Streetmon hunters and street chatter.
 *
 * Hunters. Every so often a passer-by near the player becomes a hunter:
 *
 *   SEARCHING   keeps walking their normal route, scanning for a free wild Streetmon in range;
 *               once one is spotted they head for it ("Ooh, a Cinderblock!")
 *   BATTLING    sends out their own Streetmon; the two trade attacks (the battle formula, type
 *               chart included) with FX and health bars
 *   CATCHING    the wild one is worn down below the threshold: a capture pod is thrown, shakes up
 *               to three times (the game's catch roll), caught or broken free (back to battling;
 *               after the last pod the wild one runs)
 *   FLEEING     their Streetmon fainted (or they were scared off): they run
 *   DONE        celebrate / sulk for a moment, then back to walking (with a cooldown)
 *
 * The player battling the same creature, an explosion, a car... anything that takes the person
 * away from us ends the hunt. Hunts beyond the AI radius are resolved without FX.
 *
 * Chatter. Two people walking past each other within 3 m sometimes stop and talk: tips (from the
 * real type chart), the racing league, bragging about catches (the hunters' real catches), local
 * news. Lines are shown as speech bubbles (the adapter's `say`).
 *
 * The world gives a snapshot each tick (people, wild Streetmon, player, camera) and carries out
 * actions through the adapter, so this module never touches three.js.
 */

import { SpatialGrid, ambientHit, clamp, fillLine, hasHoles, pick, pickWeighted, range } from './livingCore.js';

export const HUNTER_STATES = /** @type {const} */ ({
  SEARCHING: 'SEARCHING',
  BATTLING: 'BATTLING',
  CATCHING: 'CATCHING',
  FLEEING: 'FLEEING',
  DONE: 'DONE',
});

export const TOPICS = /** @type {const} */ (['tips', 'league', 'brag', 'news', 'life', 'rumor']);

/**
 * @typedef {import('./npcLife').Person} Person
 * @typedef {import('./npcLife').WildView} WildView
 * @typedef {import('./npcLife').Hunter} Hunter
 * @typedef {import('./npcLife').Conversation} Conversation
 * @typedef {import('./npcLife').NpcLifeAdapter} NpcLifeAdapter
 * @typedef {import('./npcLife').NpcLifeConfig} NpcLifeConfig
 * @typedef {import('./npcLife').LifeContext} LifeContext
 */

export class NpcLifeManager {
  /**
   * @param {{ config: NpcLifeConfig, adapter: NpcLifeAdapter, chart: Record<string, Record<string, number>>, rng?: () => number }} o
   */
  constructor({ config, adapter, chart, rng = Math.random }) {
    this.cfg = config;
    this.adapter = adapter;
    this.chart = chart;
    this.rng = rng;
    /** @type {Hunter[]} */
    this.hunters = [];
    /** @type {Conversation[]} */
    this.conversations = [];
    /** Person id -> time they're free for another hunt / chat. @type {Map<number, number>} */
    this.cooldown = new Map();
    /** Latest NPC catches (for bragging). @type {Array<{ species: string, level: number, street: string, district: string }>} */
    this.catches = [];
    this.time = 0;
    this.recruitIn = range(config.hunters.recruitEverySeconds, rng) * 0.5;
    this.chatIn = 0;
    this.stats = { hunts: 0, caught: 0, escaped: 0, lost: 0, conversations: 0, lines: 0 };
    /** @type {SpatialGrid<Person>} */
    this.peopleGrid = new SpatialGrid(16);
    /** @type {SpatialGrid<WildView>} */
    this.wildGrid = new SpatialGrid(16);
    /** @type {Map<number, Person>} */
    this.people = new Map();
    /** @type {Map<number, WildView>} */
    this.wild = new Map();
  }

  /** Busy people (hunting or talking) are left alone by everyone else. @param {number} id */
  busy(id) {
    return this.hunters.some((h) => h.personId === id) || this.conversations.some((c) => c.a === id || c.b === id);
  }

  /** @param {number} id */
  onCooldown(id) {
    return (this.cooldown.get(id) ?? 0) > this.time;
  }

  /**
   * One tick. Returns what's going on (for debugging / HUD).
   * @param {number} dt @param {LifeContext} ctx
   */
  update(dt, ctx) {
    this.time += dt;
    const R = ctx.activeRadius;
    this.people.clear();
    this.wild.clear();
    this.peopleGrid.clear();
    this.wildGrid.clear();
    for (const p of ctx.people) {
      this.people.set(p.id, p);
      if (Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) <= R) this.peopleGrid.insert(p, p.x, p.z);
    }
    for (const w of ctx.wild) {
      this.wild.set(w.id, w);
      if (Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z) <= R) this.wildGrid.insert(w, w.x, w.z);
    }
    if (ctx.enabled !== false) {
      this.recruit(dt, ctx);
      this.chat(dt, ctx);
    }
    for (const h of [...this.hunters]) this.stepHunter(h, dt, ctx);
    for (const c of [...this.conversations]) this.stepTalk(c, dt);
    for (const [id, until] of this.cooldown) if (until <= this.time) this.cooldown.delete(id);
    return { hunters: this.hunters.length, conversations: this.conversations.length };
  }

  // ------------------------------------------------------------------ hunters

  /** @param {number} dt @param {LifeContext} ctx */
  recruit(dt, ctx) {
    const H = this.cfg.hunters;
    this.recruitIn -= dt;
    if (this.recruitIn > 0) return;
    this.recruitIn = range(H.recruitEverySeconds, this.rng);
    if (this.hunters.length >= H.max) return;
    const [r0, r1] = H.recruitRadius;
    const cands = this.peopleGrid
      .near(ctx.player.x, ctx.player.z, r1, (p) => p.free && p.walking && !this.busy(p.id) && !this.onCooldown(p.id))
      .filter((e) => e.d >= r0);
    if (!cands.length) return;
    const p = pick(cands, this.rng).item;
    this.startHunt(p.id);
  }

  /** Makes someone a hunter (also for tests / debugging). @param {number} personId */
  startHunt(personId) {
    if (this.busy(personId)) return null;
    /** @type {Hunter} */
    const h = {
      personId,
      state: HUNTER_STATES.SEARCHING,
      stateTime: 0,
      searchLeft: this.cfg.hunters.searchSeconds,
      scanIn: 0,
      target: null,
      closing: false,
      mon: null,
      turnIn: 0,
      monTurn: true,
      throws: 0,
      pod: null,
      catchPhase: 'throw',
      phaseIn: 0,
      roll: null,
      shakes: 0,
      result: '',
      lastHit: null,
    };
    this.hunters.push(h);
    this.stats.hunts++;
    return h;
  }

  /** @param {Hunter} h @param {Hunter['state']} s */
  setHunter(h, s) {
    h.state = s;
    h.stateTime = 0;
  }

  /** Free wild Streetmon this hunter may go for. @param {WildView} w @param {Hunter} h */
  canHunt(w, h) {
    if (w.heldBy && w.heldBy !== `hunt:${h.personId}`) return false;
    if (!w.free && !(w.heldBy === `hunt:${h.personId}`)) return false;
    return !this.hunters.some((o) => o !== h && o.target === w.id) && w.hp > 0;
  }

  /** @param {Hunter} h @param {Record<string, string | number | undefined>} vars @param {keyof NpcLifeConfig['lines']['hunter']} key */
  hunterSay(h, key, vars = {}) {
    const lines = this.cfg.lines.hunter[key];
    if (!lines?.length) return;
    const text = fillLine(pick(lines, this.rng), vars);
    this.adapter.say(h.personId, text, 2.4);
  }

  /** @param {Hunter} h */
  varsFor(h) {
    const w = h.target !== null ? this.wild.get(h.target) : null;
    return { species: w?.name, level: w?.level, name: h.mon?.name };
  }

  /** @param {Hunter} h @param {number} dt @param {LifeContext} ctx */
  stepHunter(h, dt, ctx) {
    const H = this.cfg.hunters;
    h.stateTime += dt;
    const p = this.people.get(h.personId);
    const tag = `hunt:${h.personId}`;
    // The person is gone (streamed out, killed).
    if (!p) {
      this.endHunt(h, 'gone');
      return;
    }
    const controlled = p.ctrl === tag;
    // Taken away from us (scared, hit by a car...): their Streetmon runs back, they're gone.
    const ours = h.state === HUNTER_STATES.BATTLING || h.state === HUNTER_STATES.CATCHING || (h.state === HUNTER_STATES.SEARCHING && h.closing);
    if (ours && !controlled) {
      this.stats.lost++;
      this.endHunt(h, 'interrupted');
      return;
    }
    // Far from the player: settle it without the show.
    const far = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) > ctx.activeRadius;
    if (far && h.state !== HUNTER_STATES.FLEEING) {
      this.resolveLite(h);
      return;
    }
    const target = h.target !== null ? this.wild.get(h.target) ?? null : null;
    switch (h.state) {
      case HUNTER_STATES.SEARCHING: {
        h.searchLeft -= dt;
        if (!h.closing) {
          if (h.searchLeft <= 0) {
            this.endHunt(h, 'nothing');
            return;
          }
          h.scanIn -= dt;
          if (h.scanIn > 0) return;
          h.scanIn = 0.5;
          if (!p.free && !controlled) return;
          const found = this.wildGrid.near(p.x, p.z, H.searchRadius, (w) => this.canHunt(w, h) && w.layer === p.layer)[0];
          if (!found) return;
          if (!this.adapter.take(h.personId, tag)) {
            this.endHunt(h, 'nothing');
            return;
          }
          p.ctrl = tag;
          p.free = false;
          h.target = found.item.id;
          h.closing = true;
          this.hunterSay(h, 'spot', { species: found.item.name });
          return;
        }
        if (!target || !this.canHunt(target, h)) {
          if (target?.heldBy === 'player') this.hunterSay(h, 'robbed');
          this.endHunt(h, 'lost-target');
          return;
        }
        const d = this.adapter.walkTo(h.personId, target.x, target.z, H.walkSpeed, dt);
        if (d <= H.engageDistance) {
          h.mon = this.adapter.sendOut(h.personId, target.id, tag);
          if (!h.mon) {
            this.endHunt(h, 'nothing');
            return;
          }
          this.adapter.face(h.personId, target.x, target.z);
          this.setHunter(h, HUNTER_STATES.BATTLING);
          this.hunterSay(h, 'send', this.varsFor(h));
          h.monTurn = h.mon.fighter.speed >= target.fighter.speed;
          h.turnIn = 0.9;
        } else if (h.searchLeft <= -20) this.endHunt(h, 'lost-target');
        return;
      }
      case HUNTER_STATES.BATTLING: {
        if (!target || target.hp <= 0 || target.heldBy !== tag) {
          if (target?.heldBy === 'player') this.hunterSay(h, 'robbed');
          this.finish(h, target && target.hp <= 0 ? 'won' : 'lost-target');
          return;
        }
        const mon = /** @type {NonNullable<Hunter['mon']>} */ (h.mon);
        h.turnIn -= dt;
        if (h.turnIn > 0) return;
        h.turnIn = range(H.turnEvery, this.rng);
        if (h.monTurn) {
          const hit = ambientHit(mon.fighter, target.fighter, this.chart, this.rng, H.damageScale ?? 1);
          // A hunter wants it caught, not knocked out: their Streetmon holds back on the last hit.
          hit.damage = Math.min(hit.damage, Math.max(1, target.hp - Math.max(1, Math.floor(target.maxHp * 0.08))));
          h.lastHit = hit;
          const hp = this.adapter.strike({ hunter: h.personId, from: 'mon', wildId: target.id, hit });
          if (hp <= 0) {
            this.hunterSay(h, 'won', this.varsFor(h));
            this.finish(h, 'won');
            return;
          }
          if (hp / Math.max(1, target.maxHp) <= H.catchBelowHp) {
            this.setHunter(h, HUNTER_STATES.CATCHING);
            this.startThrow(h, target);
            return;
          }
        } else {
          const hit = ambientHit(target.fighter, mon.fighter, this.chart, this.rng, H.damageScale ?? 1);
          h.lastHit = hit;
          mon.hp = Math.max(0, mon.hp - hit.damage);
          this.adapter.strike({ hunter: h.personId, from: 'wild', wildId: target.id, hit, monHp: mon.hp });
          if (mon.hp <= 0) {
            this.setHunter(h, HUNTER_STATES.FLEEING);
            this.hunterSay(h, 'lost', this.varsFor(h));
            this.adapter.recall(h.personId, true);
            this.adapter.release(h.personId, 'flee', target.x, target.z);
            this.adapter.freeWild(target.id, 'won');
            this.stats.lost++;
            return;
          }
        }
        h.monTurn = !h.monTurn;
        return;
      }
      case HUNTER_STATES.CATCHING: {
        if (!target) {
          this.finish(h, 'lost-target');
          return;
        }
        h.phaseIn -= dt;
        if (h.phaseIn > 0) return;
        if (h.catchPhase === 'throw') {
          h.roll = this.adapter.rollCatch(target.id, /** @type {string} */ (h.pod));
          h.catchPhase = 'shake';
          h.shakes = 0;
          h.phaseIn = H.shakeSeconds;
          return;
        }
        const roll = /** @type {NonNullable<Hunter['roll']>} */ (h.roll);
        if (h.shakes < roll.shakes && h.shakes < 3) {
          h.shakes++;
          this.adapter.shake(h.personId, h.shakes);
          h.phaseIn = H.shakeSeconds;
          return;
        }
        if (roll.caught) {
          const vars = { species: target.name, level: target.level };
          this.adapter.captured(h.personId, target.id);
          this.hunterSay(h, 'caught', vars);
          const p2 = this.people.get(h.personId);
          this.catches.unshift({ species: target.name, level: target.level, street: p2?.street ?? '', district: p2?.district ?? '' });
          this.catches.length = Math.min(this.catches.length, H.maxCatchesRemembered);
          this.stats.caught++;
          this.finish(h, 'caught');
          return;
        }
        h.throws++;
        this.adapter.breakFree(h.personId, target.id);
        if (h.throws >= H.throwsMax) {
          this.hunterSay(h, 'gotAway', { species: target.name });
          this.adapter.freeWild(target.id, 'escape');
          this.stats.escaped++;
          this.finish(h, 'escaped');
          return;
        }
        this.hunterSay(h, 'brokeFree');
        this.setHunter(h, HUNTER_STATES.BATTLING);
        h.monTurn = true;
        h.turnIn = range(H.turnEvery, this.rng);
        return;
      }
      case HUNTER_STATES.FLEEING:
        if (h.stateTime >= H.fleeSeconds) this.endHunt(h, 'fled');
        return;
      case HUNTER_STATES.DONE:
        if (h.stateTime >= H.celebrateSeconds) this.endHunt(h, h.result || 'done');
        return;
    }
  }

  /** @param {Hunter} h @param {WildView} target */
  startThrow(h, target) {
    const pod = pickWeighted(this.cfg.hunters.pods, this.rng);
    h.pod = pod?.id ?? 'net';
    h.catchPhase = 'throw';
    h.phaseIn = this.cfg.hunters.throwSeconds;
    this.adapter.throwPod(h.personId, target.id, h.pod);
    this.hunterSay(h, 'throw');
  }

  /** Battle over: stand around for a moment (celebrating or sulking). @param {Hunter} h @param {string} result */
  finish(h, result) {
    h.result = result;
    this.setHunter(h, HUNTER_STATES.DONE);
    if (h.target !== null) {
      const w = this.wild.get(h.target);
      if (w && w.heldBy === `hunt:${h.personId}` && result !== 'caught') this.adapter.freeWild(w.id, result === 'won' ? 'fainted' : 'calm');
    }
  }

  /** Beyond the AI radius: decide it on the spot, no FX. @param {Hunter} h */
  resolveLite(h) {
    const target = h.target !== null ? this.wild.get(h.target) : null;
    if ((h.state === HUNTER_STATES.BATTLING || h.state === HUNTER_STATES.CATCHING) && target && h.mon) {
      const odds = clamp(0.5 + (h.mon.level - target.level) * 0.05, 0.15, 0.85);
      if (this.rng() < odds) {
        this.adapter.captured(h.personId, target.id, true);
        this.stats.caught++;
        const p = this.people.get(h.personId);
        this.catches.unshift({ species: target.name, level: target.level, street: p?.street ?? '', district: p?.district ?? '' });
        this.catches.length = Math.min(this.catches.length, this.cfg.hunters.maxCatchesRemembered);
      } else {
        this.adapter.freeWild(target.id, 'escape');
        this.stats.escaped++;
      }
    }
    this.endHunt(h, 'far');
  }

  /** Removes the hunter and hands the person back to the crowd. @param {Hunter} h @param {string} why */
  endHunt(h, why) {
    const i = this.hunters.indexOf(h);
    if (i < 0) return;
    this.hunters.splice(i, 1);
    if (h.target !== null) {
      const w = this.wild.get(h.target);
      if (w && w.heldBy === `hunt:${h.personId}`) this.adapter.freeWild(w.id, 'calm');
    }
    this.adapter.recall(h.personId, false);
    const p = this.people.get(h.personId);
    if (p && p.ctrl === `hunt:${h.personId}`) this.adapter.release(h.personId, 'walk');
    this.cooldown.set(h.personId, this.time + this.cfg.hunters.cooldownSeconds);
    this.adapter.hunterEnded?.(h.personId, why);
  }

  // ------------------------------------------------------------------ chatter

  /** @param {number} dt @param {LifeContext} ctx */
  chat(dt, ctx) {
    const C = this.cfg.chatter;
    this.chatIn -= dt;
    if (this.chatIn > 0) return;
    this.chatIn = C.checkEverySeconds;
    if (this.conversations.length >= C.maxConversations) return;
    const near = this.peopleGrid
      .near(ctx.camera.x, ctx.camera.z, C.maxDistanceFromCamera, (p) => p.free && p.walking && !this.busy(p.id) && !this.onCooldown(p.id))
      .map((e) => e.item);
    if (near.length < 2) return;
    /** @type {SpatialGrid<Person>} */
    const g = new SpatialGrid(Math.max(4, C.radius * 2));
    for (const p of near) g.insert(p, p.x, p.z);
    for (const [a, b] of g.pairs(C.radius)) {
      if (this.conversations.length >= C.maxConversations) break;
      if (this.busy(a.id) || this.busy(b.id)) continue;
      if (this.rng() > C.chancePerPair) {
        // Didn't stop this time: don't ask again for a bit.
        this.cooldown.set(a.id, this.time + 6);
        this.cooldown.set(b.id, this.time + 6);
        continue;
      }
      this.startTalk(a.id, b.id);
    }
  }

  /**
   * Starts a conversation between two people (also for tests / debugging).
   * @param {number} a @param {number} b @param {typeof TOPICS[number]} [topic]
   */
  startTalk(a, b, topic) {
    if (a === b || this.busy(a) || this.busy(b)) return null;
    const lines = this.writeConversation(topic);
    if (!lines) return null;
    if (!this.adapter.startTalk(a, b, 'talk')) return null;
    // This tick's snapshot was taken before they stopped: mark them as ours now.
    for (const id of [a, b]) {
      const p = this.people.get(id);
      if (p) {
        p.ctrl = 'talk';
        p.free = false;
      }
    }
    /** @type {Conversation} */
    const c = { a, b, topic: lines.topic, lines: lines.lines, index: -1, lineLeft: 0.3 };
    this.conversations.push(c);
    this.stats.conversations++;
    return c;
  }

  /**
   * Picks a topic and fills one of its exchanges. Null if nothing could be filled.
   * @param {typeof TOPICS[number]} [want]
   */
  writeConversation(want) {
    const L = this.cfg.lines.chatter;
    for (let tries = 0; tries < 8; tries++) {
      const topic = want ?? pick(this.catches.length ? TOPICS : TOPICS.filter((t) => t !== 'brag'), this.rng);
      const templates = L[topic];
      if (!templates?.length) continue;
      const tpl = pick(templates, this.rng);
      const vars = { ...this.adapter.chatVars(topic) };
      if (topic === 'brag' && this.catches.length) {
        const c = pick(this.catches, this.rng);
        Object.assign(vars, { species: c.species, level: c.level, street: c.street || vars.street, district: c.district || vars.district });
      }
      const lines = tpl.map((t) => fillLine(t, vars));
      if (lines.some(hasHoles)) continue;
      return { topic, lines };
    }
    return null;
  }

  /** @param {Conversation} c @param {number} dt */
  stepTalk(c, dt) {
    const a = this.people.get(c.a);
    const b = this.people.get(c.b);
    if (!a || !b || a.ctrl !== 'talk' || b.ctrl !== 'talk') {
      this.endTalk(c, false);
      return;
    }
    c.lineLeft -= dt;
    if (c.lineLeft > 0) return;
    c.index++;
    if (c.index >= c.lines.length) {
      this.endTalk(c, true);
      return;
    }
    const seconds = range(this.cfg.chatter.lineSeconds, this.rng);
    c.lineLeft = seconds;
    this.adapter.say(c.index % 2 === 0 ? c.a : c.b, c.lines[c.index], seconds);
    this.stats.lines++;
  }

  /** @param {Conversation} c @param {boolean} finished */
  endTalk(c, finished) {
    const i = this.conversations.indexOf(c);
    if (i < 0) return;
    this.conversations.splice(i, 1);
    this.adapter.endTalk(c.a, c.b, finished);
    const cd = this.time + this.cfg.chatter.cooldownSeconds;
    this.cooldown.set(c.a, cd);
    this.cooldown.set(c.b, cd);
  }

  /** Ends everything (leaving the street, a cutscene...). */
  clear() {
    for (const h of [...this.hunters]) this.endHunt(h, 'cleared');
    for (const c of [...this.conversations]) this.endTalk(c, false);
  }
}
