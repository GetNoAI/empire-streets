// Types for npcLife.js.
import type { AmbientHit, Fighter } from './livingCore.js';

export type HunterState = 'SEARCHING' | 'BATTLING' | 'CATCHING' | 'FLEEING' | 'DONE';
export const HUNTER_STATES: { readonly [K in HunterState]: K };
export type Topic = 'tips' | 'league' | 'brag' | 'news' | 'life' | 'rumor';
export const TOPICS: readonly Topic[];

/** A person in the crowd, as the world sees them this tick. */
export interface Person {
  id: number;
  x: number;
  z: number;
  /** World layer ('street'). */
  layer: string;
  /** An ordinary civilian going about their business (not police, not hurt, not taken by anyone). */
  free: boolean;
  /** Walking their route (not waiting at a crossing, not fleeing). */
  walking: boolean;
  /** Who is steering them right now ('hunt:<id>', 'talk', or null). */
  ctrl: string | null;
  district?: string;
  street?: string;
}

/** A wild Streetmon, as the world sees it this tick. */
export interface WildView {
  id: number;
  x: number;
  z: number;
  layer: string;
  name: string;
  speciesId: string;
  level: number;
  hp: number;
  maxHp: number;
  fighter: Fighter;
  /** Nobody's dealing with it (not chasing the player, not in a battle or event, not fainted). */
  free: boolean;
  /** 'hunt:<id>', 'duel:<id>', 'player', 'event' or null. */
  heldBy: string | null;
}

export interface HunterMon {
  name: string;
  speciesId: string;
  level: number;
  hp: number;
  maxHp: number;
  fighter: Fighter;
}

export interface Hunter {
  personId: number;
  state: HunterState;
  stateTime: number;
  searchLeft: number;
  scanIn: number;
  target: number | null;
  closing: boolean;
  mon: HunterMon | null;
  turnIn: number;
  monTurn: boolean;
  throws: number;
  pod: string | null;
  catchPhase: 'throw' | 'shake';
  phaseIn: number;
  roll: { shakes: number; caught: boolean } | null;
  shakes: number;
  result: string;
  lastHit: AmbientHit | null;
}

export interface Conversation {
  a: number;
  b: number;
  topic: Topic;
  lines: string[];
  index: number;
  lineLeft: number;
}

export interface StrikeEvent {
  hunter: number;
  /** Who attacked: the hunter's Streetmon or the wild one. */
  from: 'mon' | 'wild';
  wildId: number;
  hit: AmbientHit;
  /** The hunter's Streetmon's HP after a wild hit. */
  monHp?: number;
}

export interface NpcLifeAdapter {
  /** Take control of a person (stop their walk). False if they can't be taken. */
  take(personId: number, tag: string): boolean;
  /** Hand them back: walk on, or run from a point. */
  release(personId: number, how: 'walk' | 'flee', fromX?: number, fromZ?: number): void;
  /** Walk toward a point; returns the distance left. */
  walkTo(personId: number, x: number, z: number, speed: number, dt: number): number;
  face(personId: number, x: number, z: number): void;
  /** Send out the hunter's Streetmon against a wild one (holds the wild one). Null = can't. */
  sendOut(personId: number, wildId: number, tag: string): HunterMon | null;
  /** Show an attack; for the hunter's Streetmon hitting, apply the damage and return the wild one's HP. */
  strike(e: StrikeEvent): number;
  /** Put the hunter's Streetmon away (fainted: it collapses first). */
  recall(personId: number, fainted: boolean): void;
  throwPod(personId: number, wildId: number, itemId: string): void;
  /** The game's catch roll for this creature and item. */
  rollCatch(wildId: number, itemId: string): { shakes: number; caught: boolean };
  shake(personId: number, n: number): void;
  /** Caught: the wild one is gone. `quiet` = no FX (far away). */
  captured(personId: number, wildId: number, quiet?: boolean): void;
  breakFree(personId: number, wildId: number): void;
  /** Let a held wild one go: it fainted, it won (stays), it escapes (runs), or just calms down. */
  freeWild(wildId: number, how: 'fainted' | 'won' | 'escape' | 'calm'): void;
  startTalk(a: number, b: number, tag: string): boolean;
  endTalk(a: number, b: number, finished: boolean): void;
  /** Show a speech bubble over someone's head. */
  say(personId: number, text: string, seconds: number): void;
  /** Values for chatter placeholders (species, strong, weak, track, racer, crew, district, street...). */
  chatVars(topic: Topic): Record<string, string | number | undefined>;
  hunterEnded?(personId: number, why: string): void;
}

export interface NpcLifeConfig {
  hunters: {
    max: number;
    recruitEverySeconds: [number, number];
    recruitRadius: [number, number];
    searchRadius: number;
    searchSeconds: number;
    engageDistance: number;
    walkSpeed: number;
    levelOffset: [number, number];
    turnEvery: [number, number];
    /** Damage multiplier for ambient fights (they last a few exchanges). */
    damageScale?: number;
    catchBelowHp: number;
    throwsMax: number;
    throwSeconds: number;
    shakeSeconds: number;
    pods: Array<{ id: string; weight: number }>;
    celebrateSeconds: number;
    fleeSeconds: number;
    cooldownSeconds: number;
    maxCatchesRemembered: number;
  };
  chatter: {
    radius: number;
    maxDistanceFromCamera: number;
    chancePerPair: number;
    checkEverySeconds: number;
    cooldownSeconds: number;
    maxConversations: number;
    lineSeconds: [number, number];
  };
  lines: {
    hunter: Record<'spot' | 'send' | 'throw' | 'caught' | 'brokeFree' | 'gotAway' | 'won' | 'lost' | 'robbed', string[]>;
    chatter: Record<Topic, string[][]>;
  };
}

export interface LifeContext {
  people: Person[];
  wild: WildView[];
  player: { x: number; z: number };
  camera: { x: number; z: number };
  activeRadius: number;
  /** False: no new hunts or conversations (running ones carry on). */
  enabled?: boolean;
}

export class NpcLifeManager {
  constructor(o: { config: NpcLifeConfig; adapter: NpcLifeAdapter; chart: Record<string, Record<string, number>>; rng?: () => number });
  readonly cfg: NpcLifeConfig;
  hunters: Hunter[];
  conversations: Conversation[];
  catches: Array<{ species: string; level: number; street: string; district: string }>;
  time: number;
  stats: { hunts: number; caught: number; escaped: number; lost: number; conversations: number; lines: number };
  busy(id: number): boolean;
  onCooldown(id: number): boolean;
  update(dt: number, ctx: LifeContext): { hunters: number; conversations: number };
  startHunt(personId: number): Hunter | null;
  startTalk(a: number, b: number, topic?: Topic): Conversation | null;
  writeConversation(want?: Topic): { topic: Topic; lines: string[] } | null;
  clear(): void;
}
