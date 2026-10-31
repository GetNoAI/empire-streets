/**
 * Wanted level rules (engine-free, unit-tested).
 * Crimes add heat; heat maps to 0-5 stars. While police can't see you, a search timer runs and,
 * when it expires, you lose one star and the search starts again for the next one down.
 */

export type Crime =
  | 'carjack'
  | 'steal'
  | 'stealPolice'
  | 'hitPed'
  | 'killPed'
  | 'hitCop'
  | 'killCop'
  | 'ramPolice'
  | 'speeding'
  | 'explosion'
  | 'gunfire'
  | 'arson'
  /** Throwing capture gear around in front of the police while wanted. */
  | 'throwing'
  /** Setting a Streetmon on a person. */
  | 'creatureAttack';

/** Heat per crime. */
export const CRIME_HEAT: Record<Crime, number> = {
  carjack: 1.2,
  steal: 0.6,
  stealPolice: 4,
  hitPed: 1.2,
  killPed: 3.2,
  hitCop: 4,
  killCop: 8,
  ramPolice: 2.2,
  speeding: 1,
  explosion: 2.5,
  gunfire: 1.4,
  arson: 1.5,
  throwing: 0.6,
  creatureAttack: 1.6,
};

/** Heat needed for 1..5 stars. */
export const STAR_HEAT = [1, 3.5, 8, 15, 25] as const;
export const MAX_STARS = 5;

/** Seconds out of sight before a star is dropped. */
export function searchTime(stars: number): number {
  return 14 + 4 * stars;
}

export function starsFor(heat: number): number {
  let s = 0;
  for (let i = 0; i < STAR_HEAT.length; i++) if (heat >= STAR_HEAT[i]) s = i + 1;
  return s;
}

export class Wanted {
  heat = 0;
  stars = 0;
  /** Seconds since police last had eyes on the player. */
  unseenFor = 0;
  /** Where police last saw the player (or where a crime was reported). */
  lastKnown = { x: 0, z: 0 };
  /** Set for one update when the star count goes up (for sounds/UI). */
  rose = false;

  /**
   * A crime. `witness` is 'cop' when police saw it, 'civ' when only bystanders did (reported, 75%),
   * or 'none' (no heat, unless you're already wanted and being watched).
   */
  report(crime: Crime, x: number, z: number, witness: 'cop' | 'civ' | 'none'): number {
    const factor = witness === 'cop' ? 1 : witness === 'civ' ? 0.75 : this.stars > 0 && this.unseenFor < 1 ? 1 : 0;
    if (factor === 0) return 0;
    const add = CRIME_HEAT[crime] * factor;
    this.heat = Math.min(STAR_HEAT[MAX_STARS - 1] + 5, this.heat + add);
    this.lastKnown = { x, z };
    if (witness === 'cop') this.unseenFor = 0;
    const s = starsFor(this.heat);
    if (s > this.stars) {
      this.stars = s;
      this.rose = true;
      // A new star means a fresh search.
      this.unseenFor = 0;
    }
    return add;
  }

  /** `seen`: some officer can see the player this tick. */
  update(dt: number, seen: boolean, px: number, pz: number): void {
    this.rose = false;
    if (this.stars === 0) {
      // Minor offences are forgotten over time.
      this.heat = Math.max(0, this.heat - 0.05 * dt);
      this.unseenFor = 0;
      return;
    }
    if (seen) {
      this.unseenFor = 0;
      this.lastKnown = { x: px, z: pz };
      return;
    }
    this.unseenFor += dt;
    if (this.unseenFor >= searchTime(this.stars)) {
      this.stars -= 1;
      this.heat = this.stars > 0 ? STAR_HEAT[this.stars - 1] : 0;
      this.unseenFor = 0;
    }
  }

  /** Stars blink while the police are searching rather than watching. */
  get searching(): boolean {
    return this.stars > 0 && this.unseenFor > 1;
  }

  /** Fraction of the current search completed (0..1). */
  get searchProgress(): number {
    return this.stars > 0 ? Math.min(1, this.unseenFor / searchTime(this.stars)) : 0;
  }

  clear(): void {
    this.heat = 0;
    this.stars = 0;
    this.unseenFor = 0;
    this.rose = false;
  }
}
