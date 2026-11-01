import { ambientHit, type AmbientHit, type Fighter } from './livingCore.js';
import type { WildMon } from './wildInteractions.js';

/**
 * Your Streetmon fights on its own (engine-free, unit-tested).
 *
 * While your lead Streetmon is out walking with you, it squares up to wild Streetmon that come
 * near: anything wandering within `notice` metres, and first of all anything going for you. It
 * runs over, the two trade blows (the ambient battle formula and type chart, the same as the wild
 * turf fights), and:
 *
 *   - the wild one worn below `wildFleesBelow` runs off (beaten up: an easier catch), and yours
 *     gets a share of XP;
 *   - yours worn below `retreatBelow` backs off to your side, and the wild one keeps its ground.
 *
 * Fights break up when you walk off (`leash`), get in a car, start a battle, or something else
 * takes the wild one. After a fight there's a short `cooldown` before it picks the next. Your
 * Streetmon keeps the damage it took (heal it at a clinic or with items).
 *
 *   IDLE -> CLOSING -> FIGHTING -> (won | retreat | broken) -> IDLE after cooldown
 *
 * The world gives a snapshot each tick and acts through the adapter (no three.js here).
 */

export interface SkirmishConfig {
  /** Turn it off (options). */
  enabled: boolean;
  /** Metres from your Streetmon (and you) that a wild one is noticed. */
  notice: number;
  /** Fights break up when you get this far from them. */
  leash: number;
  /** Gap at which they start trading blows. */
  engage: number;
  /** Seconds between blows. */
  turnEvery: [number, number];
  damageScale: number;
  /** The wild one runs below this share of its HP. */
  wildFleesBelow: number;
  /** Yours backs off below this share (and won't start a fight below `startAbove`). */
  retreatBelow: number;
  startAbove: number;
  /** Seconds before it looks for another fight. */
  cooldown: number;
  checkEvery: number;
  /** Seconds to close the gap before giving up. */
  closeTimeout: number;
  /** Won't take on wild ones more than this many levels above it. */
  maxLevelsOver: number;
  /** Share of a normal battle's XP for a win. */
  xpShare: number;
}

export const SKIRMISH_DEFAULTS: SkirmishConfig = {
  enabled: true,
  notice: 9,
  leash: 22,
  engage: 2.6,
  turnEvery: [0.9, 1.4],
  damageScale: 0.55,
  wildFleesBelow: 0.3,
  retreatBelow: 0.35,
  startAbove: 0.5,
  cooldown: 6,
  checkEvery: 0.5,
  closeTimeout: 8,
  maxLevelsOver: 8,
  xpShare: 0.5,
};

export interface SkirmishFollower {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  fighter: Fighter;
  /** Out, visible and free to act (not hidden for a car, battle, heist...). */
  ready: boolean;
}

export interface SkirmishContext {
  follower: SkirmishFollower | null;
  player: { x: number; z: number; onFoot: boolean };
  wild: WildMon[];
  /** False while anything else has the stage (battles, cutscenes, other layers). */
  enabled: boolean;
}

export type SkirmishOutcome = 'won' | 'retreat' | 'broken';

export interface SkirmishAdapter {
  /** Takes (tag) or lets go of (null) a wild one; false if it can't be taken. */
  hold(id: number, tag: string | null): boolean;
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
  /** Your Streetmon goes to (x, z), or back to following you (null). */
  followerGoTo(x: number, z: number): void;
  followerFollow(): void;
  /** Both face each other. */
  face(wildId: number, fx: number, fz: number): void;
  wildGoTo(id: number, x: number, z: number): void;
  /** A blow: returns the defender's HP afterwards. */
  hitWild(wildId: number, hit: AmbientHit): number;
  hitFollower(wildId: number, hit: AmbientHit): number;
  started?(wildId: number): void;
  /** After the wild one is let go: the world sends a beaten one running, or calms a winner. */
  ended?(wildId: number, outcome: SkirmishOutcome, why: string): void;
}

export interface Skirmish {
  wild: number;
  phase: 'CLOSING' | 'FIGHTING';
  time: number;
  turnIn: number;
  ours: boolean;
  lastHit: AmbientHit | null;
}

export const SKIRMISH_TAG = 'follower';

const FREE = new Set(['wander', 'idle', 'watch']);
const CHASING = new Set(['approach', 'attack']);

export class FollowerSkirmish {
  fight: Skirmish | null = null;
  cooldown = 0;
  private checkIn = 0;
  readonly stats = { started: 0, won: 0, retreat: 0, broken: 0 };
  readonly breaks: Record<string, number> = {};

  constructor(
    readonly cfg: SkirmishConfig,
    private readonly adapter: SkirmishAdapter,
    private readonly chart: Record<string, Record<string, number>>,
    private readonly rng: () => number = Math.random,
  ) {}

  /** Would it take this one on? */
  canTarget(w: WildMon, f: SkirmishFollower): boolean {
    if (w.layer !== 'street' || w.rarity === 'legendary' || w.hp <= 0) return false;
    if (w.hp / Math.max(1, w.maxHp) <= this.cfg.wildFleesBelow) return false;
    if (w.fighter.level > f.fighter.level + this.cfg.maxLevelsOver) return false;
    // Wandering about, or coming for you (it steps in front).
    if (w.heldBy !== null) return false;
    return FREE.has(w.state) ? !w.calm : CHASING.has(w.state);
  }

  update(dt: number, ctx: SkirmishContext): Skirmish | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const f = ctx.follower;
    if (this.fight) {
      this.step(this.fight, dt, ctx);
      return this.fight;
    }
    if (!this.cfg.enabled || !ctx.enabled || !f || !f.ready || !ctx.player.onFoot || this.cooldown > 0) return null;
    if (f.hp / Math.max(1, f.maxHp) < this.cfg.startAbove) return null;
    this.checkIn -= dt;
    if (this.checkIn > 0) return null;
    this.checkIn = this.cfg.checkEvery;
    const R = this.cfg.notice;
    let best: WildMon | null = null;
    let bestScore = Infinity;
    for (const w of ctx.wild) {
      if (!this.canTarget(w, f)) continue;
      const df = Math.hypot(w.x - f.x, w.z - f.z);
      const dp = Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z);
      if (df > R || dp > R + 2) continue;
      // The ones coming for you first, then the nearest.
      const score = df - (CHASING.has(w.state) ? 100 : 0);
      if (score >= bestScore) continue;
      if (!this.adapter.lineOfSight(f.x, f.z, w.x, w.z)) continue;
      best = w;
      bestScore = score;
    }
    if (best) this.start(best.id);
    return this.fight;
  }

  /** Starts a fight with this wild one (also for tests). */
  start(wildId: number): Skirmish | null {
    if (this.fight || !this.adapter.hold(wildId, SKIRMISH_TAG)) return null;
    this.fight = { wild: wildId, phase: 'CLOSING', time: 0, turnIn: 0, ours: true, lastHit: null };
    this.stats.started++;
    this.adapter.started?.(wildId);
    return this.fight;
  }

  private step(s: Skirmish, dt: number, ctx: SkirmishContext): void {
    const C = this.cfg;
    s.time += dt;
    const f = ctx.follower;
    const w = ctx.wild.find((m) => m.id === s.wild);
    if (!w || w.heldBy !== SKIRMISH_TAG) return this.end('broken', !w ? 'gone' : 'taken');
    if (!f || !f.ready) return this.end('broken', 'put away');
    if (!ctx.enabled || !C.enabled) return this.end('broken', 'paused');
    if (!ctx.player.onFoot) return this.end('broken', 'car');
    if (Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z) > C.leash) return this.end('broken', 'far');
    if (w.hp <= 0) return this.end('won', 'fainted');
    const gap = Math.hypot(w.x - f.x, w.z - f.z);
    if (s.phase === 'CLOSING') {
      if (gap <= C.engage) {
        s.phase = 'FIGHTING';
        s.ours = f.fighter.speed >= w.fighter.speed;
        s.turnIn = 0.4;
        this.adapter.face(w.id, f.x, f.z);
        return;
      }
      if (s.time > C.closeTimeout) return this.end('broken', 'never met');
      // Yours runs in; the wild one turns to meet it and closes a little.
      const k = (C.engage * 0.8) / Math.max(gap, 0.01);
      this.adapter.followerGoTo(w.x + (f.x - w.x) * k, w.z + (f.z - w.z) * k);
      this.adapter.wildGoTo(w.id, w.x + (f.x - w.x) * 0.25, w.z + (f.z - w.z) * 0.25);
      return;
    }
    // Keep at arm's length if one drifts.
    if (gap > C.engage * 1.8) {
      s.phase = 'CLOSING';
      s.time = 0;
      return;
    }
    this.adapter.followerGoTo(f.x, f.z);
    this.adapter.face(w.id, f.x, f.z);
    s.turnIn -= dt;
    if (s.turnIn > 0) return;
    s.turnIn = C.turnEvery[0] + this.rng() * (C.turnEvery[1] - C.turnEvery[0]);
    if (s.ours) {
      const hit = ambientHit(f.fighter, w.fighter, this.chart, this.rng, C.damageScale);
      s.lastHit = hit;
      const hp = this.adapter.hitWild(w.id, hit);
      if (hp / Math.max(1, w.maxHp) <= C.wildFleesBelow) return this.end('won', hp <= 0 ? 'fainted' : 'fled');
    } else {
      const hit = ambientHit(w.fighter, f.fighter, this.chart, this.rng, C.damageScale);
      s.lastHit = hit;
      const hp = this.adapter.hitFollower(w.id, hit);
      if (hp / Math.max(1, f.maxHp) <= C.retreatBelow) return this.end('retreat', 'hurt');
    }
    s.ours = !s.ours;
  }

  /** Ends the current fight. */
  end(outcome: SkirmishOutcome, why = ''): void {
    const s = this.fight;
    if (!s) return;
    this.fight = null;
    this.cooldown = this.cfg.cooldown;
    this.adapter.hold(s.wild, null);
    this.adapter.followerFollow();
    this.stats[outcome]++;
    if (outcome === 'broken') this.breaks[why || 'other'] = (this.breaks[why || 'other'] ?? 0) + 1;
    this.adapter.ended?.(s.wild, outcome, why);
  }
}
