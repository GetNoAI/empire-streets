// @ts-check
/**
 * Wild Streetmon vs. wild Streetmon (engine-free, unit-tested).
 *
 * Territory fights. Two wild Streetmon of rival types (config `territory.rivalries`, e.g. Gun vs
 * Concrete, Smoke vs Bass) that see each other within range square up without the player: they
 * close in, trade attacks (the battle formula and type chart, with FX), and the one worn below
 * the threshold runs; the winner claims the spot (its home moves there) and calms down. Fighters
 * keep their damage, so a beaten-up survivor is easier to catch. Walking up, a fast car, an
 * explosion or someone else taking one of them breaks the fight up.
 *
 *   CLOSING -> FIGHTING -> RESOLVED (loser flees, winner claims) / BROKEN
 *
 * Packs. Some common and uncommon wanderers / aggressive species spawn with 1-2 followers of the
 * same species. Followers wander around the leader, regroup when left behind, flee when it flees
 * and join in when it goes for the player. If the leader goes, the next in line takes over.
 *
 * Threats. Beyond the old 7 m dodge, a car bearing down fast is seen from further off (the
 * radius grows with speed), and heavy explosions send everything nearby running. One scared pack
 * member scares the rest.
 *
 * The world gives a snapshot each tick and acts through the adapter (no three.js here).
 */

import { SpatialGrid, ambientHit, isRival, range, rangeInt } from './livingCore.js';

export const DUEL_PHASES = /** @type {const} */ ({ CLOSING: 'CLOSING', FIGHTING: 'FIGHTING' });

/**
 * @typedef {import('./wildInteractions').WildMon} WildMon
 * @typedef {import('./wildInteractions').Duel} Duel
 * @typedef {import('./wildInteractions').WildAdapter} WildAdapter
 * @typedef {import('./wildInteractions').WildConfig} WildConfig
 * @typedef {import('./wildInteractions').WildContext} WildContext
 */

const FREE_STATES = new Set(['wander', 'idle', 'watch']);

export class WildInteractionManager {
  /**
   * @param {{ config: WildConfig, adapter: WildAdapter, chart: Record<string, Record<string, number>>, rng?: () => number }} o
   */
  constructor({ config, adapter, chart, rng = Math.random }) {
    this.cfg = config;
    this.adapter = adapter;
    this.chart = chart;
    this.rng = rng;
    /** @type {Duel[]} */
    this.duels = [];
    /** follower id -> leader id @type {Map<number, number>} */
    this.leaderOf = new Map();
    /** leader id -> follower ids (in line order) @type {Map<number, number[]>} */
    this.followers = new Map();
    /** Formation offsets per follower. @type {Map<number, { x: number, z: number }>} */
    this.offsets = new Map();
    /** @type {Map<number, WildMon>} */
    this.mons = new Map();
    /** @type {SpatialGrid<WildMon>} */
    this.grid = new SpatialGrid(16);
    /** @type {Array<{ x: number, z: number, radius: number }>} */
    this.blasts = [];
    this.checkIn = 0;
    this.nextDuel = 1;
    this.time = 0;
    this.stats = { duels: 0, resolved: 0, broken: 0, packs: 0, carScares: 0, blastScares: 0 };
    /** Why fights were broken up (for tuning). @type {Record<string, number>} */
    this.breaks = {};
  }

  /** @param {number} id */
  inDuel(id) {
    return this.duels.find((d) => d.a === id || d.b === id) ?? null;
  }

  /** Same pack (leader and followers, or two followers of one leader). @param {number} a @param {number} b */
  samePack(a, b) {
    const la = this.leaderOf.get(a) ?? a;
    const lb = this.leaderOf.get(b) ?? b;
    return la === lb;
  }

  /** Pack-mates of a creature (not including itself). @param {number} id */
  packOf(id) {
    const leader = this.leaderOf.get(id) ?? id;
    const all = [leader, ...(this.followers.get(leader) ?? [])];
    return all.length > 1 ? all.filter((x) => x !== id) : [];
  }

  /** A heavy explosion: everything nearby runs. @param {number} x @param {number} z @param {number} radius */
  explosion(x, z, radius) {
    this.blasts.push({ x, z, radius: Math.max(radius, this.cfg.threats.explosionRadius) });
  }

  /**
   * A creature just spawned: maybe it's leading a pack. Followers are spawned through the adapter.
   * @param {WildMon} w
   */
  onSpawn(w) {
    const P = this.cfg.packs;
    if (this.leaderOf.has(w.id) || w.layer !== 'street') return [];
    if (!P.temperaments.includes(w.temperament) || !P.rarities.includes(w.rarity)) return [];
    if (this.rng() >= P.chance) return [];
    const n = rangeInt(P.followers, this.rng);
    const ids = this.adapter.spawnFollowers(w.id, n);
    if (!ids.length) return [];
    this.formPack(w.id, ids);
    return ids;
  }

  /** Ties followers to a leader. @param {number} leader @param {number[]} ids */
  formPack(leader, ids) {
    const list = this.followers.get(leader) ?? [];
    for (const id of ids) {
      if (id === leader || this.leaderOf.has(id)) continue;
      this.leaderOf.set(id, leader);
      list.push(id);
      const k = list.length;
      const a = (k * 2.4) + this.rng() * 0.6;
      const r = this.cfg.packs.spacing * (1 + (k > 2 ? 0.5 : 0));
      this.offsets.set(id, { x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    this.followers.set(leader, list);
    this.stats.packs++;
  }

  /** @param {number} id */
  forget(id) {
    const lead = this.leaderOf.get(id);
    if (lead !== undefined) {
      this.leaderOf.delete(id);
      this.offsets.delete(id);
      const list = this.followers.get(lead);
      if (list) {
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) this.followers.delete(lead);
      }
    }
    const fol = this.followers.get(id);
    if (fol) {
      this.followers.delete(id);
      // The next in line leads.
      const [next, ...rest] = fol;
      if (next !== undefined) {
        this.leaderOf.delete(next);
        this.offsets.delete(next);
        for (const f of rest) this.leaderOf.delete(f);
        if (rest.length) this.formPack(next, rest);
      }
    }
  }

  /** @param {number} dt @param {WildContext} ctx */
  update(dt, ctx) {
    this.time += dt;
    this.mons.clear();
    this.grid.clear();
    for (const w of ctx.wild) {
      this.mons.set(w.id, w);
      if (Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z) <= ctx.activeRadius) this.grid.insert(w, w.x, w.z);
    }
    // Packs whose members are gone.
    for (const id of [...this.leaderOf.keys(), ...this.followers.keys()]) if (!this.mons.has(id)) this.forget(id);

    this.threats(ctx);
    this.packs(ctx);
    if (ctx.enabled !== false) {
      this.checkIn -= dt;
      if (this.checkIn <= 0) {
        this.checkIn = this.cfg.territory.checkEverySeconds;
        this.findFights(ctx);
      }
    }
    for (const d of [...this.duels]) this.stepDuel(d, dt, ctx);
    return { duels: this.duels.length, packs: this.followers.size };
  }

  // ------------------------------------------------------------------ threats

  /** @param {WildContext} ctx */
  threats(ctx) {
    const T = this.cfg.threats;
    /** @type {Set<number>} */
    const scared = new Set();
    /** @param {WildMon} w @param {number} x @param {number} z @param {'car' | 'blast'} why */
    const scare = (w, x, z, why) => {
      // (A creature in an NPC hunt bolts too: the hunt ends when it's no longer held.)
      if (scared.has(w.id) || w.state === 'engaged' || w.heldBy === 'player' || w.heldBy === 'event') return;
      scared.add(w.id);
      const d = this.inDuel(w.id);
      if (d) this.endDuel(d, 'broken', why);
      this.adapter.flee(w.id, x, z, range(T.fleeSeconds, this.rng));
      if (why === 'car') this.stats.carScares++;
      else this.stats.blastScares++;
      // The rest of the pack goes too.
      for (const m of this.packOf(w.id)) {
        const o = this.mons.get(m);
        if (o && !scared.has(m)) scare(o, x, z, why);
      }
    };
    for (const b of this.blasts) for (const e of this.grid.near(b.x, b.z, b.radius)) scare(e.item, b.x, b.z, 'blast');
    this.blasts.length = 0;
    for (const c of ctx.cars) {
      if (c.kmh < T.carMinKmh) continue;
      const r = Math.min(T.carMaxRadius, c.kmh * T.carRadiusPerKmh);
      const sp = Math.hypot(c.vx, c.vz) || 1;
      const fx = c.vx / sp;
      const fz = c.vz / sp;
      for (const e of this.grid.near(c.x, c.z, r)) {
        const w = e.item;
        if (w.state === 'flee') continue;
        // Bearing down on it: ahead of the car and close to its path.
        const ax = w.x - c.x;
        const az = w.z - c.z;
        const along = ax * fx + az * fz;
        const side = Math.abs(ax * -fz + az * fx);
        if (along > 0 && side < 4 + along * 0.25) scare(w, c.x, c.z, 'car');
      }
    }
  }

  // ------------------------------------------------------------------ packs

  /** @param {WildContext} ctx */
  packs(ctx) {
    const P = this.cfg.packs;
    const chasing = (/** @type {WildMon | undefined} */ m) => !!m && (m.state === 'approach' || m.state === 'attack');
    for (const [leaderId, list] of this.followers) {
      const L = this.mons.get(leaderId);
      if (!L) continue;
      // Any member going for the player brings the whole pack (the leader included).
      const hunting = [leaderId, ...list].some((id) => chasing(this.mons.get(id)));
      if (hunting && !chasing(L) && L.state !== 'flee' && !L.heldBy && !this.inDuel(leaderId)) this.adapter.joinChase(leaderId);
      for (const id of list) {
        const f = this.mons.get(id);
        if (!f || f.heldBy || this.inDuel(id)) continue;
        if (L.state === 'flee' && f.state !== 'flee') {
          this.adapter.flee(id, L.fleeFromX ?? L.x, L.fleeFromZ ?? L.z, range(this.cfg.threats.fleeSeconds, this.rng));
          continue;
        }
        if (hunting && !chasing(f) && f.state !== 'flee') {
          this.adapter.joinChase(id);
          continue;
        }
        if (!FREE_STATES.has(f.state)) continue;
        const off = this.offsets.get(id) ?? { x: 0, z: 0 };
        const hx = L.x + off.x;
        const hz = L.z + off.z;
        const d = Math.hypot(f.x - hx, f.z - hz);
        if (d > P.regroupDistance) this.adapter.goTo(id, hx, hz, d > P.regroupDistance * 2);
        else this.adapter.setHome(id, hx, hz, P.wanderRadius);
      }
    }
    void ctx;
  }

  // ------------------------------------------------------------------ territory fights

  /** @param {WildMon} w */
  canFight(w) {
    return w.free && !w.heldBy && !w.calm && FREE_STATES.has(w.state) && w.hp / Math.max(1, w.maxHp) > this.cfg.territory.loserFleesBelowHp + 0.15 && !this.inDuel(w.id);
  }

  /** @param {WildContext} ctx */
  findFights(ctx) {
    const T = this.cfg.territory;
    if (this.duels.length >= T.maxFights) return;
    for (const [a, b] of this.grid.pairs(T.sightRange)) {
      if (this.duels.length >= T.maxFights) return;
      if (a.layer !== b.layer || this.samePack(a.id, b.id) || a.speciesId === b.speciesId) continue;
      if (!this.canFight(a) || !this.canFight(b)) continue;
      if (!isRival(a.fighter.types, b.fighter.types, T.rivalries)) continue;
      // Not right in front of the player: they'd be too busy watching you.
      if (Math.min(Math.hypot(a.x - ctx.player.x, a.z - ctx.player.z), Math.hypot(b.x - ctx.player.x, b.z - ctx.player.z)) < T.playerBreaksUpWithin * 1.5) continue;
      if (!this.adapter.lineOfSight(a.x, a.z, b.x, b.z)) continue;
      this.startDuel(a.id, b.id);
    }
  }

  /** Starts a fight between two creatures (also for tests / debugging). @param {number} a @param {number} b */
  startDuel(a, b) {
    if (a === b || this.inDuel(a) || this.inDuel(b)) return null;
    const id = this.nextDuel++;
    const tag = `duel:${id}`;
    if (!this.adapter.hold(a, tag)) return null;
    if (!this.adapter.hold(b, tag)) {
      this.adapter.hold(a, null);
      return null;
    }
    // This tick's snapshot was taken before the hold.
    for (const m of [this.mons.get(a), this.mons.get(b)]) if (m) {
      m.heldBy = tag;
      m.free = false;
    }
    /** @type {Duel} */
    const d = { id, a, b, phase: DUEL_PHASES.CLOSING, time: 0, turnIn: 0, aTurn: true, winner: null, lastHit: null };
    this.duels.push(d);
    this.stats.duels++;
    this.adapter.duelStarted?.(d);
    return d;
  }

  /** @param {Duel} d @param {number} dt @param {WildContext} ctx */
  stepDuel(d, dt, ctx) {
    const T = this.cfg.territory;
    d.time += dt;
    const A = this.mons.get(d.a);
    const B = this.mons.get(d.b);
    const tag = `duel:${d.id}`;
    if (!A || !B || A.heldBy !== tag || B.heldBy !== tag || A.hp <= 0 || B.hp <= 0) {
      this.endDuel(d, 'broken', !A || !B ? 'gone' : A.hp <= 0 || B.hp <= 0 ? 'fainted' : 'released');
      return;
    }
    const mx = (A.x + B.x) / 2;
    const mz = (A.z + B.z) / 2;
    const pd = Math.hypot(mx - ctx.player.x, mz - ctx.player.z);
    if (pd > ctx.activeRadius) {
      this.endDuel(d, 'broken', 'far');
      return;
    }
    // Walking right up to them breaks it up (on foot; a car scares them via threats()).
    if (pd < T.playerBreaksUpWithin && !ctx.playerInCar) {
      this.endDuel(d, 'broken', 'player');
      return;
    }
    const gap = Math.hypot(A.x - B.x, A.z - B.z);
    if (d.phase === DUEL_PHASES.CLOSING) {
      if (gap <= T.engageDistance) {
        d.phase = DUEL_PHASES.FIGHTING;
        this.adapter.face(d.a, B.x, B.z);
        this.adapter.face(d.b, A.x, A.z);
        d.aTurn = A.fighter.speed >= B.fighter.speed;
        d.turnIn = 0.5;
        return;
      }
      if (d.time > 12) {
        this.endDuel(d, 'broken', 'never met');
        return;
      }
      // Meet in the middle.
      this.adapter.goTo(d.a, mx + ((A.x - mx) / Math.max(gap, 0.01)) * (T.engageDistance / 2), mz + ((A.z - mz) / Math.max(gap, 0.01)) * (T.engageDistance / 2), true);
      this.adapter.goTo(d.b, mx + ((B.x - mx) / Math.max(gap, 0.01)) * (T.engageDistance / 2), mz + ((B.z - mz) / Math.max(gap, 0.01)) * (T.engageDistance / 2), true);
      return;
    }
    d.turnIn -= dt;
    if (d.turnIn > 0) return;
    d.turnIn = range(T.turnEvery, this.rng);
    const att = d.aTurn ? A : B;
    const def = d.aTurn ? B : A;
    const hit = ambientHit(att.fighter, def.fighter, this.chart, this.rng, T.damageScale ?? 1);
    d.lastHit = hit;
    const hp = this.adapter.strike({ duel: d.id, attacker: att.id, defender: def.id, hit });
    def.hp = hp;
    if (hp / Math.max(1, def.maxHp) <= T.loserFleesBelowHp) {
      d.winner = att.id;
      this.endDuel(d, 'resolved');
      return;
    }
    d.aTurn = !d.aTurn;
  }

  /** @param {Duel} d @param {'resolved' | 'broken'} how @param {string} [why] */
  endDuel(d, how, why = '') {
    const i = this.duels.indexOf(d);
    if (i < 0) return;
    this.duels.splice(i, 1);
    if (how === 'broken') this.breaks[why || 'other'] = (this.breaks[why || 'other'] ?? 0) + 1;
    const tag = `duel:${d.id}`;
    const T = this.cfg.territory;
    for (const id of [d.a, d.b]) {
      const w = this.mons.get(id);
      if (w && w.heldBy === tag) this.adapter.hold(id, null);
    }
    if (how === 'resolved' && d.winner !== null) {
      const loser = d.winner === d.a ? d.b : d.a;
      const W = this.mons.get(d.winner);
      const L = this.mons.get(loser);
      if (L) this.adapter.flee(loser, W?.x ?? L.x, W?.z ?? L.z, range(this.cfg.threats.fleeSeconds, this.rng) + 3);
      if (W) this.adapter.claim(d.winner, W.x, W.z, T.calmSeconds);
      this.stats.resolved++;
    } else this.stats.broken++;
    this.adapter.duelEnded?.(d, how);
  }

  clear() {
    for (const d of [...this.duels]) this.endDuel(d, 'broken', 'cleared');
    this.leaderOf.clear();
    this.followers.clear();
    this.offsets.clear();
  }
}
