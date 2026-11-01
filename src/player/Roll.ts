/**
 * Dodge rolls and gun dives (engine-free, unit-tested), the Dark Souls way: a quick roll with a
 * short window of invulnerability in the middle of it, paid for with stamina.
 *
 *  - **Roll** (Z, or Y on a pad): 6 m in about 0.7 s, the direction you're pushing (or forward).
 *    Invulnerable for the middle part (the i-frames, about 0.3 s); the start and the getting-up
 *    are not, so timing matters.
 *  - **Dive** (the same button while aiming a gun): a longer, lower dive with the gun up. You can
 *    keep shooting all the way down (time slows a little while you're in the air), but you land on
 *    your front and take a moment to get up, open to anything.
 *
 * Sprinting draws on the same stamina (12.5 a second, about 8 s from full): run it dry and
 * you're winded, so a long sprint leaves nothing for a roll.
 *
 * What stops it being spammed:
 *  - **Stamina**: a roll costs 28, a dive 38, out of 100, refilling at 24/s after a short pause.
 *  - **Chaining**: each roll within 2.2 s of the last costs half as much again and has shorter
 *    i-frames (a fourth in a row has hardly any).
 *  - **Winded**: run the stamina dry and you're winded for a moment: slow, no sprint, no rolls.
 *  - **What it can't dodge**: i-frames only stop hits (gunfire, fists and bats, Streetmon attacks,
 *    a car). Falls, fire, sludge, steam, shocks and drowning still hurt; explosions do half.
 *  - **The police**: an officer's grab isn't a hit. Rolling doesn't break an arrest in progress (it
 *    holds while you roll), and being winded makes it go faster.
 */

export type DodgeKind = 'roll' | 'dive';

export const ROLL = {
  roll: { dur: 0.68, dist: 6.2, iframes: [0.07, 0.4] as [number, number], cost: 28, recover: 0.14 },
  dive: { dur: 0.9, dist: 7.2, iframes: [0.08, 0.34] as [number, number], cost: 38, recover: 0.4 },
  stamina: { max: 100, regen: 24, delay: 0.9 },
  /** Sprinting costs stamina per second (about 8 s from full); it stops when you run dry. */
  sprint: { drain: 12.5, minToStart: 12 },
  /** Rolls within this many seconds of the last count as a chain. */
  chain: { window: 2.2, costStep: 0.5, iframeShrink: 0.32 },
  winded: { secs: 1.8, speed: 0.6 },
  /** Gap after one finishes before the next can start. */
  cooldown: 0.25,
  /** Time scale while diving with a gun up (airborne part only). */
  diveSlowmo: 0.7,
  /** Arrest progress runs this much faster while winded. */
  windedArrest: 1.35,
} as const;

/** Damage kinds: hits can be dodged, the rest can't (blasts are halved). */
export type DamageKind = 'hit' | 'blast' | 'env';

export interface ActiveDodge {
  kind: DodgeKind;
  t: number;
  dur: number;
  dirX: number;
  dirZ: number;
  /** The i-frame window for this one (shrunk if it was chained). */
  iStart: number;
  iEnd: number;
  dist: number;
}

export class Dodge {
  stamina: number = ROLL.stamina.max;
  active: ActiveDodge | null = null;
  /** Seconds left winded (no rolls, slow). */
  winded = 0;
  private sinceSpend = 99;
  private cd = 0;
  private lastStart = -99;
  private chainN = 0;
  private time = 0;

  /** The cost of the next roll of this kind right now (chains cost more). */
  cost(kind: DodgeKind): number {
    const chained = this.time - this.lastStart < ROLL.chain.window ? this.chainN : 0;
    return Math.round(ROLL[kind].cost * (1 + ROLL.chain.costStep * chained));
  }

  canStart(kind: DodgeKind): boolean {
    return !this.active && this.cd <= 0 && this.winded <= 0 && this.stamina >= Math.min(ROLL.stamina.max, this.cost(kind) * 0.6);
  }

  /** Starts a roll or dive toward (dirX, dirZ) (normalised by the caller). Returns false if it can't. */
  start(kind: DodgeKind, dirX: number, dirZ: number): boolean {
    if (!this.canStart(kind)) return false;
    const chained = this.time - this.lastStart < ROLL.chain.window;
    this.chainN = chained ? this.chainN + 1 : 0;
    const cost = this.cost(kind);
    this.stamina -= cost;
    this.sinceSpend = 0;
    // Started on fumes: you get the roll, then you're winded.
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.winded = ROLL.winded.secs;
    }
    const spec = ROLL[kind];
    const shrink = Math.min(0.85, ROLL.chain.iframeShrink * this.chainN);
    const [a, b] = spec.iframes;
    const len = (b - a) * (1 - shrink);
    this.active = { kind, t: 0, dur: spec.dur, dirX, dirZ, iStart: a, iEnd: a + len, dist: spec.dist };
    this.lastStart = this.time;
    return true;
  }

  private sprinting = false;

  /**
   * Wants to sprint this frame: true if it can (drains stamina while it does). A sprint needs a
   * little stamina to start, and running dry ends it and leaves you winded.
   */
  sprint(want: boolean, dt: number): boolean {
    const can = want && this.winded <= 0 && (this.sprinting ? this.stamina > 0 : this.stamina >= ROLL.sprint.minToStart);
    this.sprinting = can;
    if (!can) return false;
    this.stamina -= ROLL.sprint.drain * dt;
    this.sinceSpend = 0;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.winded = ROLL.winded.secs;
      this.sprinting = false;
    }
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.winded = Math.max(0, this.winded - dt);
    this.sinceSpend += dt;
    if (this.sinceSpend > ROLL.stamina.delay && !this.active) this.stamina = Math.min(ROLL.stamina.max, this.stamina + ROLL.stamina.regen * dt * (this.winded > 0 ? 0.5 : 1));
    const a = this.active;
    if (!a) return;
    a.t += dt;
    if (a.t >= a.dur + ROLL[a.kind].recover) {
      this.active = null;
      this.cd = ROLL.cooldown;
    }
  }

  /** Invulnerable right now (inside the i-frame window). */
  get invulnerable(): boolean {
    const a = this.active;
    return !!a && a.t >= a.iStart && a.t <= a.iEnd;
  }

  /** Getting up after the move (no movement, no i-frames). */
  get recovering(): boolean {
    const a = this.active;
    return !!a && a.t >= a.dur;
  }

  /** Ground speed along the dodge direction now (m/s): a quick start, easing off at the end. */
  speed(): number {
    const a = this.active;
    if (!a || a.t >= a.dur) return 0;
    const k = a.t / a.dur;
    // Shape integrates to 1 over the move: 2(1 - k) gives a fast start and a gentle stop.
    return (a.dist / a.dur) * 2 * (1 - k);
  }

  /** How much damage of this kind gets through right now (0 when dodged). */
  damageFactor(kind: DamageKind): number {
    if (!this.invulnerable) return 1;
    return kind === 'hit' ? 0 : kind === 'blast' ? 0.5 : 1;
  }

  /** Time scale for the slow-motion dive (only while diving and still in the air). */
  timeScale(aiming: boolean): number {
    const a = this.active;
    return a && a.kind === 'dive' && aiming && a.t < a.dur * 0.85 ? ROLL.diveSlowmo : 1;
  }

  reset(): void {
    this.active = null;
    this.stamina = ROLL.stamina.max;
    this.winded = 0;
    this.cd = 0;
    this.chainN = 0;
  }
}
