// Types for wildInteractions.js.
import type { AmbientHit, Fighter } from './livingCore.js';

export type DuelPhase = 'CLOSING' | 'FIGHTING';
export const DUEL_PHASES: { readonly [K in DuelPhase]: K };

/** A wild Streetmon as the world sees it this tick. */
export interface WildMon {
  id: number;
  x: number;
  z: number;
  layer: string;
  speciesId: string;
  temperament: string;
  rarity: string;
  /** Its behaviour state (wander, idle, watch, flee, approach, attack, engaged...). */
  state: string;
  hp: number;
  maxHp: number;
  fighter: Fighter;
  /** Not in a battle, an event, or chasing the player. */
  free: boolean;
  /** Recently fought / released: won't start another fight. */
  calm: boolean;
  /** 'duel:<id>', 'hunt:<id>', 'player', 'event' or null. */
  heldBy: string | null;
  /** What it's running from (when fleeing). */
  fleeFromX?: number;
  fleeFromZ?: number;
}

export interface Duel {
  id: number;
  a: number;
  b: number;
  phase: DuelPhase;
  time: number;
  turnIn: number;
  aTurn: boolean;
  winner: number | null;
  lastHit: AmbientHit | null;
}

export interface CarView {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kmh: number;
}

export interface WildAdapter {
  /** Hold a creature for a fight (tag) or let it go (null). False if it can't be held. */
  hold(id: number, tag: string | null): boolean;
  /** Head for a point (scripted move). */
  goTo(id: number, x: number, z: number, run: boolean): void;
  face(id: number, x: number, z: number): void;
  /** Show an attack and apply its damage; returns the defender's HP. */
  strike(e: { duel: number; attacker: number; defender: number; hit: AmbientHit }): number;
  /** Run from a point for a while. */
  flee(id: number, fromX: number, fromZ: number, seconds: number): void;
  /** The winner takes the spot: home moves here and it calms down. */
  claim(id: number, x: number, z: number, calmSeconds: number): void;
  /** Wander around this point (pack followers). */
  setHome(id: number, x: number, z: number, radius: number): void;
  /** A follower joins the leader going after the player. */
  joinChase(id: number): void;
  /** Can a creature at a see one at b (no building in between)? */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
  /** Spawn n followers of the leader's species next to it; returns their ids. */
  spawnFollowers(leaderId: number, n: number): number[];
  duelStarted?(d: Duel): void;
  duelEnded?(d: Duel, how: 'resolved' | 'broken'): void;
}

export interface WildConfig {
  territory: {
    sightRange: number;
    engageDistance: number;
    maxFights: number;
    checkEverySeconds: number;
    turnEvery: [number, number];
    damageScale?: number;
    loserFleesBelowHp: number;
    calmSeconds: number;
    playerBreaksUpWithin: number;
    rivalries: Array<[string, string]> | string[][];
  };
  packs: {
    chance: number;
    followers: [number, number];
    temperaments: string[];
    rarities: string[];
    spacing: number;
    wanderRadius: number;
    regroupDistance: number;
  };
  threats: {
    carMinKmh: number;
    carRadiusPerKmh: number;
    carMaxRadius: number;
    explosionRadius: number;
    fleeSeconds: [number, number];
  };
}

export interface WildContext {
  wild: WildMon[];
  cars: CarView[];
  player: { x: number; z: number };
  playerInCar: boolean;
  activeRadius: number;
  /** False: no new fights (running ones carry on). */
  enabled?: boolean;
}

export class WildInteractionManager {
  constructor(o: { config: WildConfig; adapter: WildAdapter; chart: Record<string, Record<string, number>>; rng?: () => number });
  readonly cfg: WildConfig;
  duels: Duel[];
  leaderOf: Map<number, number>;
  followers: Map<number, number[]>;
  time: number;
  stats: { duels: number; resolved: number; broken: number; packs: number; carScares: number; blastScares: number };
  /** Why fights were broken up ('player', 'car', 'blast', 'released', 'far', ...). */
  breaks: Record<string, number>;
  inDuel(id: number): Duel | null;
  samePack(a: number, b: number): boolean;
  packOf(id: number): number[];
  explosion(x: number, z: number, radius: number): void;
  onSpawn(w: WildMon): number[];
  formPack(leader: number, ids: number[]): void;
  forget(id: number): void;
  update(dt: number, ctx: WildContext): { duels: number; packs: number };
  startDuel(a: number, b: number): Duel | null;
  clear(): void;
}
