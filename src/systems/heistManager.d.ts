/** Types for heistManager.js (the module is plain JavaScript; these let TypeScript use it). */

export type HeistState = 'IDLE' | 'PLANNING' | 'SETUP' | 'INFILTRATION' | 'BREACH' | 'LOOT' | 'ESCAPE' | 'RESOLVED';
export declare const HEIST_STATES: { readonly [K in HeistState]: K };
export type HeistRole = 'breacher' | 'hacker' | 'smoke' | 'hauler';
export declare const ROLES: readonly HeistRole[];

export interface Pt {
  x: number;
  z: number;
}

export interface RoleSpec {
  name: string;
  description: string;
  accepts: { types: string[]; species?: string[]; minWeightKg?: number; minLevel?: number };
  stat: 'hp' | 'attack' | 'defense' | 'speed' | 'loud';
  ability?: { id: string; label: string; keys?: string[]; gamepadButton?: number; seconds?: number; cooldown?: number; range?: number; radius?: number; noiseMult?: number };
  capacity?: { baseKg: number; perDefense: number; perWeightKg: number; maxKg: number };
}

export interface DropOff extends Pt {
  id: string;
  name: string;
  door: { x: number; z: number; nx: number; nz: number };
  radius: number;
}

export interface HeistTarget {
  id: string;
  name: string;
  kind: 'checkCashing' | 'jewelryStore' | 'armoredTruck' | 'bankVault' | string;
  district: string;
  description: string;
  difficulty: number;
  setupCost: number;
  cooldownMinutes: number;
  timeLimitSeconds?: number;
  roles: { required: HeistRole[]; optional: HeistRole[] };
  payoutPool: { min: number; max: number };
  loot: { bags: number; kgPerBag: number };
  security: { level: number; suspicionRate: number; alarmDelay: number; noiseLimit: number; witnessesUntilPacified?: boolean };
  noise: { breachPerSecond: number; smash: number; gunfire: number; explosion: number; alarmLootLoss: number };
  breach: { mode: 'vault' | 'smash' | 'truck'; seconds: number };
  escape: { stars: number; dropOffs: string[] };
  heat: number;
  location: {
    facade?: { x: number; z: number; nx: number; nz: number; length: number };
    truck?: { x: number; z: number; heading: number };
    radius: number;
    plan: Pt;
    breachPoints: Pt[];
    loot: Pt[];
    guards: Array<Pt & { patrolTo?: Pt }>;
    cameras: Array<Pt & { y: number }>;
    sign?: string;
  };
}

export interface HeistConfig {
  maxCrew: number;
  roles: Record<HeistRole, RoleSpec>;
  skill: { base: number; perStat: number; perLevel: number; min: number; max: number; withoutBreacher: number };
  encumbrance: { freeKg: number; speedLossPerKg: number; minSpeedMult: number; noSprintAboveKg: number };
  payout: { optionalRoleBonus: number };
  heatRules: { decayPerMinute: number; securityPerHeat: number; starsPerHeat: number; max: number };
  phases: { leaveRadiusExtra: number; resultSeconds: number; deliverRequiresNoStars: boolean; suspicionDecay: number; noiseDecay: number; exposure: { passing: number; atTarget: number; breaching: number } };
  dropOffs: DropOff[];
  targets: HeistTarget[];
}

export interface CrewCandidate {
  id: string;
  speciesId: string;
  name?: string;
  types: string[];
  level: number;
  stats: Record<string, number>;
  weightKg?: number;
  hp?: number;
}

export interface CrewMember extends CrewCandidate {
  skill: number;
  capacity: number;
}

export interface LootBag {
  index: number;
  value: number;
  kg: number;
  taken: boolean;
  available?: boolean;
  carrier: 'player' | 'hauler' | null;
}

export interface Carried {
  bags: number;
  value: number;
  playerKg: number;
  haulerKg: number;
}

export interface Encumbrance {
  kg: number;
  speedMult: number;
  canSprint: boolean;
}

export interface HeistResult {
  ok: boolean;
  reason: 'delivered' | 'busted' | 'wasted' | 'abandoned' | 'time' | string;
  cash: number;
  spoiled?: number;
  bonus?: number;
  target: HeistTarget;
  time: number;
  alarm: boolean;
  heat: number;
  bags: number;
  crew: Record<string, string>;
}

export interface HeistHud {
  state: HeistState;
  result?: HeistResult | null;
  target?: HeistTarget;
  objective?: string;
  security?: number;
  suspicion?: number;
  noise?: number;
  alarm?: boolean;
  jammed?: number;
  smoked?: number;
  breach?: number[];
  breaching?: number;
  bags?: Array<{ index: number; value: number; kg: number; taken: boolean; available: boolean; carrier: 'player' | 'hauler' | null }>;
  carried?: Carried;
  encumbrance?: Encumbrance;
  crew?: Array<{ role: HeistRole; roleName: string; name: string; speciesId: string; ok: boolean; key: string; cooldown: number; active: number; capacity: number }>;
  timeLeft?: number | null;
  escapeStars?: number;
  dropOffs?: DropOff[];
  time?: number;
}

export interface HeistAdapter {
  getStreetmon(id: string): CrewCandidate | null;
  getMoney(): number;
  spend(n: number): boolean;
  earn(n: number): void;
  getStars(): number;
  raiseWanted(stars: number): void;
  deploy?(target: HeistTarget, crew: Record<string, CrewMember>): void;
  soundAlarm?(target: HeistTarget): void;
  setCameras?(target: HeistTarget, on: boolean): void;
  smokeScene?(target: HeistTarget, x: number, z: number, radius: number, seconds: number): number;
  breachStarted?(target: HeistTarget, point: number, role: string | null): void;
  breachDone?(target: HeistTarget, point: number, bags: LootBag[]): void;
  lootTaken?(target: HeistTarget, bag: LootBag): void;
  escapeStarted?(target: HeistTarget, stars: number, dropOffs: DropOff[]): void;
  cleanup?(target: HeistTarget, result: HeistResult): void;
  notify?(text: string, ms?: number): void;
  showBig?(text: string, color: string, ms: number): void;
}

export interface HeistContext {
  x: number;
  z: number;
  inVehicle: boolean;
  stars: number;
  seenBy?: number;
  nearBreach?: number;
  nearLoot?: number;
  atDropOff?: string | null;
  guardsAwake?: number;
  dead?: boolean;
}

type Res = { ok: boolean; reason: string };

export declare function validateHeistConfig<T extends HeistConfig>(cfg: T): T;
export declare function roleFit(cfg: HeistConfig, role: HeistRole, mon: CrewCandidate): { ok: boolean; reason: string; skill: number };
export declare function haulerCapacity(cfg: HeistConfig, mon: { stats: Record<string, number>; weightKg?: number }): number;
export declare function encumbrance(cfg: HeistConfig, kg: number): Encumbrance;
export declare function securityLevel(cfg: HeistConfig, target: HeistTarget, heat: number): number;
export declare function escapeStars(cfg: HeistConfig, target: HeistTarget, s: { alarm: boolean; heat: number }): number;
export declare function splitLoot(target: HeistTarget, rng: () => number): LootBag[];

export declare class HeistManager {
  constructor(opts: { adapter: HeistAdapter; config?: HeistConfig; rng?: () => number });
  readonly config: HeistConfig;
  state: HeistState;
  stateTime: number;
  heat: number;
  cooldowns: Record<string, number>;
  stats: { done: number; failed: number; earned: number; best: number };
  job: {
    target: HeistTarget;
    crew: Partial<Record<HeistRole, CrewMember>>;
    security: number;
    suspicion: number;
    noise: number;
    alarm: boolean;
    jammedFor: number;
    smokedFor: number;
    breach: Array<{ progress: number; done: boolean }>;
    breaching: number;
    bags: LootBag[];
    time: number;
    escapeStars: number;
  } | null;
  result: HeistResult | null;
  readonly active: boolean;
  readonly targets: HeistTarget[];
  on(type: 'state' | 'alarm' | 'breached' | 'loot' | 'escape' | 'resolved' | 'ability' | 'planned', fn: (e: any) => void): () => void;
  target(id: string): HeistTarget | null;
  dropOff(id: string): DropOff | null;
  availability(id: string): Res & { cooldown?: number };
  plan(id: string): Res;
  assign(role: HeistRole, mon: CrewCandidate): Res & { skill?: number };
  unassign(role: HeistRole): boolean;
  validateCrew(crew?: Partial<Record<HeistRole, CrewMember>>): { ok: boolean; missing: HeistRole[]; problems: string[]; bonus: number };
  launch(): Res;
  cancel(): boolean;
  member(role: HeistRole): CrewMember | null;
  useAbility(role: 'hacker' | 'smoke', ctx: HeistContext): Res & { seconds?: number; knocked?: number };
  startBreach(index: number, ctx: HeistContext): Res;
  takeLoot(index: number): Res & { carrier?: 'player' | 'hauler' };
  carried(): Carried;
  encumbrance(): Encumbrance;
  reportNoise(kind: 'gunfire' | 'explosion' | 'smash'): void;
  raiseAlarm(why: string): void;
  startEscape(why: string): void;
  notifyBusted(): boolean;
  notifyWasted(): boolean;
  abandon(): boolean;
  fail(reason: string): void;
  centre(t: HeistTarget): Pt;
  update(dt: number, ctx: HeistContext): HeistHud;
  hud(ctx?: HeistContext): HeistHud;
  serialize(): { heat: number; cooldowns: Record<string, number>; stats: { done: number; failed: number; earned: number; best: number } };
  load(d: unknown): void;
}

export default HeistManager;
