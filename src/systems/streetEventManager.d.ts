// Types for streetEventManager.js.

export type EventType = 'armoredTruck' | 'turfOutbreak' | 'airdrop';
export type ZoneLayer = 'street' | 'roof' | 'alley';
export type EventState = 'SPAWNING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CLEANUP';

export const EVENT_STATES: { readonly [K in EventState]: K };
export const EVENT_TYPES: readonly EventType[];
export const ZONE_LAYERS: readonly ZoneLayer[];

export interface Zone {
  id: string;
  x: number;
  /** Roof height (rooftop zones). */
  y?: number;
  z: number;
  district: 'uptown' | 'midtown' | 'downtown' | 'park';
  label?: string;
  /** Alleys: half the lane's length (m). */
  halfLength?: number;
  /** Filled in when picked: which zone list it came from. */
  layer?: ZoneLayer;
}

export interface RewardDef {
  cash: [number, number];
  streetCred: number;
  regionalCred: number;
  items?: Array<{ id: string; chance: number; count: number }>;
  upgradeChips?: { chance: number; count: number };
}

export interface EventDef {
  id: string;
  eventType: EventType;
  name: string;
  announce?: string;
  spawnWeight: number;
  durationSeconds: number;
  cooldownSeconds: number;
  requiredStreetCred: number;
  policeStarsOnTrigger: number;
  /** Where it can spawn (trucks always start at a depot). */
  zoneLayers?: ZoneLayer[];
  rewards: RewardDef;
  truck?: {
    vehicle: string;
    color: string;
    armor: number;
    massMult?: number;
    disableAt: number;
    cruisePace: number;
    fleePace: number;
    guards: number;
    guardHealth?: number;
    guardDamage?: number;
    guardRange?: number;
    guardFireEvery?: number;
    bundles: [number, number];
    bundleValue: [number, number];
    collectSeconds?: number;
    streetmonDps?: number;
  };
  lockdownSeconds?: number;
  swarm?: { count: [number, number]; levelOffset: [number, number]; radius: number; types?: string[] };
  drop?: {
    fallSeconds: number;
    openSeconds: number;
    scavengers: number;
    rivalEtaSeconds: number;
    scavengerSpawnDistance: [number, number];
    scavengerPrySeconds: number;
    policeConfiscateSeconds: number;
    engageRadius: number;
    flareColor: string;
  };
}

export interface StreetEventConfig {
  version: number;
  schedule: {
    intervalSeconds: [number, number];
    firstEventSeconds: [number, number];
    retrySeconds: number;
    maxActive: number;
    spawnDistance: [number, number];
    roofMaxDistance?: number;
    lingerSeconds: number;
    layers?: string[];
  };
  upgradeChips?: { max: number; perChip: { topSpeed: number; acceleration: number; durability: number } };
  events: EventDef[];
  zones: { street: Zone[]; roof: Zone[]; alley: Zone[]; depots: Zone[] };
}

export interface Reward {
  cash: number;
  items: Array<{ id: string; count: number }>;
  chips: number;
  streetCred: number;
  regionalCred: number;
  district: string;
}

export interface EventInstance {
  uid: number;
  id: string;
  def: EventDef;
  type: EventType;
  zone: Zone;
  destination: Zone | null;
  state: EventState;
  stateTime: number;
  timeLeft: number;
  engaged: boolean;
  progress: number;
  objective: string;
  pos: { x: number; z: number };
  seed: number;
  outcome: 'completed' | 'expired' | null;
  reason: string;
  reward: Reward | null;
  earned: number;
  cleaned: boolean;
}

export interface EventContext {
  x: number;
  z: number;
  layer: string;
  district?: string;
  streetCred: number;
  /** In a heist, race, battle, menu... : no new events. */
  busy?: boolean;
  partyLevel?: number;
}

export interface TickResult {
  phase?: 'spawning' | 'active';
  pos?: { x: number; z: number };
  progress?: number;
  objective?: string;
  /** The player has got involved (police hook). */
  engaged?: boolean;
  outcome?: 'completed' | 'failed' | null;
  reason?: string;
  earned?: number;
}

export interface StreetEventAdapter {
  /** Build the event in the world; false = can't right now. */
  spawn(inst: EventInstance): boolean;
  /** Run it for a frame (also called during the grace period after it ends). */
  tick(inst: EventInstance, dt: number, ctx: EventContext): TickResult | void;
  /** Remove everything it put in the world. */
  cleanup(inst: EventInstance): void;
  /** Optional: veto a zone (busy, in view...). */
  zoneFree?(zone: Zone, layer: ZoneLayer, def: EventDef): boolean;
  raiseWanted?(stars: number, inst: EventInstance): void;
  earn?(cash: number): void;
  addItem?(id: string, count: number): void;
  addStreetCred?(n: number): void;
  chipsChanged?(chips: number): void;
  notify?(text: string, ms?: number): void;
}

export interface EventHud {
  uid: number;
  id: string;
  type: EventType;
  name: string;
  state: EventState;
  objective: string;
  timeLeft: number;
  progress: number;
  engaged: boolean;
  stars: number;
  x: number;
  z: number;
  layer: string;
  district: string;
}

export interface EventMarker {
  type: EventType;
  x: number;
  z: number;
  label: string;
  layer: string;
}

export interface StreetEventSave {
  regionalCred: Record<string, number>;
  chips: number;
  timer: number;
  stats: { spawned: number; completed: number; expired: number; byType: Record<string, number> };
}

export function validateEventConfig(cfg: unknown): true;

export class StreetEventManager {
  constructor(opts: { adapter: StreetEventAdapter; config?: StreetEventConfig; rng?: () => number });
  readonly config: StreetEventConfig;
  active: EventInstance[];
  timer: number;
  cooldownUntil: Record<string, number>;
  regionalCred: Record<string, number>;
  chips: number;
  stats: StreetEventSave['stats'];
  time: number;
  readonly timeToNext: number | null;
  on(type: 'state', fn: (e: { inst: EventInstance; from: EventState | null; to: EventState }) => void): () => void;
  on(type: 'spawned' | 'engaged', fn: (inst: EventInstance) => void): () => void;
  on(type: 'resolved', fn: (e: { inst: EventInstance; ok: boolean; reward?: Reward; reason?: string }) => void): () => void;
  def(id: string): EventDef | null;
  zonesFor(def: EventDef, ctx: EventContext): Zone[];
  eligible(ctx: EventContext): Array<{ def: EventDef; zones: Zone[] }>;
  pick(ctx: EventContext): { def: EventDef; zones: Zone[] } | null;
  start(id: string, ctx: EventContext, zoneId?: string): EventInstance | null;
  abort(inst: EventInstance, reason: string): void;
  clear(reason?: string): void;
  update(dt: number, ctx: EventContext): EventHud[];
  hud(): EventHud[];
  markers(): EventMarker[];
  serialize(): StreetEventSave;
  load(d: unknown): void;
}
