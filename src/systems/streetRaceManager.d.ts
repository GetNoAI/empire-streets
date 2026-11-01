/** Types for streetRaceManager.js (the module is plain JavaScript; these let TypeScript use it). */

export type RaceState = 'IDLE' | 'PROMPT' | 'COUNTDOWN' | 'RACING' | 'CLEANUP' | 'RESOLVED';
export declare const RACE_STATES: { readonly [K in RaceState]: K };

export type PropType = 'barricade' | 'cones' | 'tireStack' | 'boostPad' | 'ramp';
export type MarkerType = 'checkpointMarker' | 'finishMarker';

export interface ObstacleDef {
  type: PropType;
  x: number;
  z: number;
  rotationY: number;
  count?: number;
  spacing?: number;
}

/** What `spawnProp` receives: a track obstacle, or a checkpoint/finish marker. */
export type PropDef = ObstacleDef | { type: MarkerType; x: number; z: number; rotationY: number; radius: number };

export interface Placement {
  first: number;
  second: number;
  third: number;
}

export type RaceMode = 'sprint' | 'circuit' | 'knockout' | 'timeTrial' | 'drift';
export declare const RACE_MODES: readonly RaceMode[];
export declare const MODE_NAMES: Record<RaceMode, string>;
export declare const CLASS_ORDER: readonly string[];
export declare function modeOf(t: RaceTrack): RaceMode;
export declare function isSolo(mode: RaceMode): boolean;
export declare function classOk(cls: string | null | undefined, track: RaceTrack): boolean;
export declare function medalPlace(track: RaceTrack, value: number): number;
export declare function driftPoints(dt: number, angleDeg: number, speed: number, chain: number): { points: number; chain: number };

export interface RaceTrack {
  id: string;
  name: string;
  district?: string;
  description?: string;
  /** Default: circuit with laps > 1, else sprint. */
  mode?: RaceMode;
  /** Cars of this class and below only (D..S). */
  maxClass?: string | null;
  /** Time trial: seconds for gold/silver/bronze; drift: scores. */
  medals?: { gold: number; silver: number; bronze: number };
  entryFee: number;
  minStreetCred?: number;
  laps: number;
  timeLimit: number;
  payouts: Placement;
  streetCred?: Placement & { finish: number };
  start: { x: number; z: number; heading: number };
  organizer?: { x: number; z: number };
  checkpointRadius?: number;
  checkpointPositions: Array<{ x: number; z: number }>;
  temporaryObstacles?: ObstacleDef[];
}

export interface RacerDriver {
  name: string;
  vehicle: string;
  color: string;
  skill: number;
  /** Favourite Streetmon types (rivals' loadouts lean to them). */
  streetmon?: string[];
}

export interface RaceConfig {
  popUp?: {
    rollEverySeconds?: [number, number];
    chance?: number;
    offerSeconds?: number;
    minStartDistance?: number;
    maxStartDistance?: number;
    requireNoStars?: boolean;
    cooldownAfterRace?: number;
    reachGridSeconds?: number;
  };
  organizer?: { joinRadius?: number; maxSpeedKmh?: number };
  rules?: {
    countdownSeconds?: number;
    gridRadius?: number;
    gridMaxSpeedKmh?: number;
    gridRowSpacing?: number;
    gridColumnOffset?: number;
    playerGridSlot?: 'first' | 'last';
    outOfCarSeconds?: number;
    maxOffRouteMeters?: number;
    resultSeconds?: number;
    respawnOnFail?: 'grid' | 'safehouse';
    restoreWanted?: 'preRace' | 'zero';
  };
  racers?: { count: number; pool: RacerDriver[]; catchUp?: { behindGap?: number; behindBoost?: number; aheadGap?: number; aheadSlow?: number } };
  props?: Record<string, any>;
  tracks: RaceTrack[];
}

export interface CoursePoint {
  x: number;
  z: number;
  index: number;
  lap: number;
  finish: boolean;
}

export interface GridSlot {
  x: number;
  z: number;
  heading: number;
}

export interface PropHandle {
  dispose(): void;
  setState?(s: 'current' | 'next' | 'hidden'): void;
}

export interface WantedSnapshot {
  stars: number;
  heat: number;
}

export interface RaceAdapter {
  spawnProp(def: PropDef, track: RaceTrack): PropHandle;
  /** Spawns NPC racers on their grid slots; returns their ids. */
  spawnRacers(track: RaceTrack, slots: GridSlot[], drivers: RacerDriver[], course: CoursePoint[]): string[];
  updateRacers?(dt: number, info: { state: RaceState; course: CoursePoint[]; progress: Map<string, number>; standings: string[] }): void;
  racerPosition(id: string): { x: number; z: number } | null;
  removeRacers(): void;
  /** One racer knocked out of a knockout race. */
  removeRacer?(id: string): void;
  /** The player's car's class (D..S), for class-limited races. */
  carClass?(): string | null;
  placePlayer(slot: GridSlot): boolean;
  holdPlayer(hold: boolean): void;
  getMoney(): number;
  spend(n: number): boolean;
  earn(n: number): void;
  getWanted(): WantedSnapshot;
  /** Clears the chasers the race brought and sets the Wanted Level back. */
  restoreWanted(snapshot: WantedSnapshot): void;
  respawnAt?(where: GridSlot, reason: string): void;
  notify?(text: string, ms?: number): void;
  showBig?(text: string, color: string, ms: number): void;
}

export interface RaceContext {
  inVehicle: boolean;
  x: number;
  z: number;
  /** m/s */
  speed: number;
  /** On the street with no menu or battle open (offers can appear). */
  freeRoam: boolean;
  dead?: boolean;
  /** The car's slide angle in degrees (drift events). */
  driftAngle?: number;
}

export interface RaceResult {
  place: number | null;
  reason: 'finished' | 'busted' | 'wasted' | 'abandoned' | 'lost' | 'time' | 'quit' | string;
  time: number;
  track: RaceTrack;
  cash: number;
  cred: number;
  standings: string[];
  mode: RaceMode;
  score: number;
  bestLap: number | null;
  newRecord: boolean;
  record: RaceRecord;
}

export interface RacerState {
  id: string;
  name: string;
  player: boolean;
  passed: number;
  finishedAt: number | null;
  progress: number;
  skill?: number;
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  /** Knocked out. */
  out: boolean;
  outAt?: number;
}

export interface RaceRecord {
  best?: number;
  bestLap?: number;
  score?: number;
}

export type RaceHud =
  | { state: 'IDLE' | 'CLEANUP' }
  | { state: 'PROMPT'; track: RaceTrack; prompt: string; accepted: boolean; target: { x: number; z: number }; expires01: number; mode: RaceMode; record: RaceRecord | null }
  | {
      state: 'COUNTDOWN' | 'RACING';
      track: RaceTrack;
      place: number;
      of: number;
      checkpoint: number;
      totalCheckpoints: number;
      lap: number;
      laps: number;
      time: number;
      timeLeft: number;
      countdown: number;
      next: CoursePoint | null;
      after: CoursePoint | null;
      finishNext: boolean;
      racers: Array<{ id: string; name: string; x: number; z: number }>;
      outOfCar: number;
      mode: RaceMode;
      lapTime: number;
      lastLap: number | null;
      bestLap: number | null;
      score: number;
      chain: number;
      medals: { gold: number; silver: number; bronze: number } | null;
      record: RaceRecord | null;
      out: string[];
      alive: number;
    }
  | { state: 'RESOLVED'; result: RaceResult };

export declare function validateRaceConfig<T extends RaceConfig>(cfg: T): T;
export declare function buildCourse(track: RaceTrack): CoursePoint[];
export declare function gridSlots(track: RaceTrack, count: number, rules?: RaceConfig['rules']): GridSlot[];
export declare function progressOf(passed: number, pos: { x: number; z: number }, course: Array<{ x: number; z: number }>, start: { x: number; z: number }): number;
export declare function payoutFor(track: RaceTrack, place: number | null): { cash: number; cred: number };

export declare class RaceTrackInstance {
  constructor(track: RaceTrack, factory: (def: PropDef, track: RaceTrack) => PropHandle);
  readonly track: RaceTrack;
  readonly registry: Array<{ def: PropDef; handle: PropHandle }>;
  readonly markers: PropHandle[];
  disposed: boolean;
  spawn(): CoursePoint[];
  add(def: PropDef): PropHandle;
  highlight(nextIndex: number): void;
  readonly count: number;
  dispose(): void;
}

export type RaceEvent = 'offer' | 'accepted' | 'countdown' | 'go' | 'checkpoint' | 'lap' | 'knockout' | 'finished' | 'failed' | 'resolved' | 'cleanup' | 'state';

export declare class StreetRaceManager {
  constructor(opts: { adapter: RaceAdapter; config?: RaceConfig; rng?: () => number });
  readonly config: RaceConfig;
  state: RaceState;
  streetCred: number;
  rollIn: number;
  cooldown: number;
  offer: { track: RaceTrack; source: 'popup' | 'organizer'; expiresIn: number; accepted: boolean; reachIn: number } | null;
  race: {
    track: RaceTrack;
    instance: RaceTrackInstance;
    course: CoursePoint[];
    preRace: WantedSnapshot;
    grid: GridSlot;
    time: number;
    countdown: number;
    outOfCar: number;
    racers: RacerState[];
    mode: RaceMode;
    score: number;
    chain: number;
  } | null;
  result: RaceResult | null;
  readonly active: boolean;
  on(type: RaceEvent, fn: (e: any) => void): () => void;
  eligibleTracks(): RaceTrack[];
  track(id: string): RaceTrack | null;
  offerRace(trackId: string, source?: 'popup' | 'organizer'): boolean;
  accept(): boolean;
  decline(): boolean;
  startRace(): boolean;
  notifyBusted(): boolean;
  notifyWasted(): boolean;
  abort(): boolean;
  fail(reason: string): void;
  standings(): RacerState[];
  update(dt: number, ctx: RaceContext): RaceHud;
  hud(ctx?: RaceContext): RaceHud;
  records: Record<string, RaceRecord>;
  serialize(): { streetCred: number; records: Record<string, RaceRecord> };
  load(data: unknown): void;
}

export default StreetRaceManager;
