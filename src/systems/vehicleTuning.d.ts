/** Types for vehicleTuning.js (the module is plain JavaScript; these let TypeScript use it). */

export type SlotName = 'engineBay' | 'trunk' | 'roofRack';
export declare const SLOT_NAMES: readonly SlotName[];

export interface StreetmonInfo {
  id: string;
  speciesId: string;
  name?: string;
  types: string[];
  level: number;
  stats: { hp: number; attack: number; defense: number; speed: number; loud: number };
}

export interface VehicleStats {
  /** m/s */
  topSpeed: number;
  /** Engine pull, m/s² (engine force / mass). */
  acceleration: number;
  durability: number;
  /** kg */
  mass: number;
  grip: number;
  /** Steering lock multiplier (1 = stock). */
  steering: number;
  /** Minimap radar range, metres. */
  radarRange: number;
}

export interface ComputedStats {
  base: VehicleStats;
  final: VehicleStats;
  /** Multipliers (radarRange: metres added). */
  multipliers: Record<keyof VehicleStats, number>;
  mods: Array<{ slot: SlotName; key: string; ability: string | null }>;
}

export interface AbilityConfig {
  name: string;
  description: string;
  trigger: 'active' | 'collision' | 'passive';
  input?: { keys: string[]; gamepadButton?: number; label: string };
  duration?: number;
  cooldown?: number;
  minImpact?: number;
  replacesHorn?: boolean;
  whileActive?: Partial<Record<keyof VehicleStats, number>>;
  params: Record<string, number | string>;
  fx?: Record<string, string>;
  sfx?: string;
}

/** What `triggerAbility` receives: the ability's config plus who powers it and how strongly. */
export interface AbilityPayload extends AbilityConfig {
  id: string;
  slot: SlotName;
  /** Strength multiplier from the Streetmon's level (about 0.85-1.15). */
  power: number;
  streetmon: StreetmonInfo;
}

export interface AbilityState {
  vehicleId?: string;
  key: string;
  slot: SlotName;
  abilityId: string;
  name: string;
  trigger: AbilityConfig['trigger'];
  input: AbilityConfig['input'] | null;
  streetmon: StreetmonInfo;
  /** 1 = just used, 0 = ready. */
  cooldown01: number;
  /** Time left of a running timed ability (0..1). */
  active01: number;
  ready: boolean;
}

export interface SlotView {
  slot: SlotName;
  label: string;
  accepts: { types?: string[]; species?: string[] };
  streetmonId: string | null;
  streetmon: StreetmonInfo | null;
  mod: string | null;
  modifiers: Partial<Record<keyof VehicleStats, number>>;
  ability: (AbilityConfig & { id: string; cooldown: number; power: number }) | null;
}

export interface TuningAdapter {
  getStreetmon(id: string): StreetmonInfo | null;
  takeStreetmon?(id: string): true | string;
  returnStreetmon?(id: string): void;
  getBaseStats(vehicleId: string): VehicleStats;
  applyStats?(vehicleId: string, stats: ComputedStats): void;
  triggerAbility?(vehicleId: string, ability: AbilityPayload, ctx: unknown): boolean;
  endAbility?(vehicleId: string, ability: AbilityConfig & { id: string }): void;
}

export interface TuningConfig {
  version: number;
  slots: Record<SlotName, { label: string; accepts: { types?: string[]; species?: string[] }; speciesTag?: string; mods: Record<string, { modifiers: Partial<Record<keyof VehicleStats, number>>; ability?: string; statBonus?: { stat: string; modifier: keyof VehicleStats } }> }>;
  abilities: Record<string, AbilityConfig>;
  scaling?: unknown;
  hazards?: Record<string, { effect: string; [k: string]: unknown }>;
}

export declare function validateConfig(cfg: unknown): TuningConfig;
export declare function modFor(cfg: TuningConfig, slot: SlotName, mon: StreetmonInfo): { key: string; mod: TuningConfig['slots'][SlotName]['mods'][string] } | null;
export declare function computeStats(cfg: TuningConfig, base: VehicleStats, slotted: Partial<Record<SlotName, StreetmonInfo | null>>, boosts?: Array<Partial<Record<keyof VehicleStats, number>>>): ComputedStats;
export declare function abilityTuning(cfg: TuningConfig, ability: AbilityConfig, mon: StreetmonInfo): { cooldown: number; power: number };

type TuningEvent = 'slotted' | 'unslotted' | 'statsChanged' | 'abilityStarted' | 'abilityEnded' | 'abilityReady' | 'vehicleRemoved';

export declare class VehicleTuningManager {
  constructor(opts: { adapter: TuningAdapter; config?: unknown });
  readonly config: TuningConfig;
  on(type: TuningEvent, fn: (e: any) => void): () => void;
  registerVehicle(vehicleId: string): unknown;
  hasVehicle(vehicleId: string): boolean;
  isTuned(vehicleId: string): boolean;
  slottedIds(): string[];
  removeVehicle(vehicleId: string): string[];
  canSlot(slot: SlotName, streetmonId: string): { ok: boolean; reason?: string; mod?: string; ability?: AbilityConfig | null };
  slotStreetmon(vehicleId: string, slot: SlotName, streetmonId: string): { ok: boolean; reason?: string; replaced?: string | null; stats?: ComputedStats };
  unslotStreetmon(vehicleId: string, slot: SlotName): { ok: boolean; reason?: string; streetmonId?: string; stats?: ComputedStats };
  getVehicleStats(vehicleId: string): ComputedStats;
  getSlots(vehicleId: string): SlotView[];
  recalculate(vehicleId: string): ComputedStats | null;
  abilities(vehicleId: string): AbilityState[];
  hasAbility(vehicleId: string, abilityId: string): boolean;
  isActive(vehicleId: string, abilityId: string): boolean;
  trigger(vehicleId: string, which: string, ctx?: unknown): { ok: boolean; reason?: string; abilityId?: string; cooldown?: number; cooldown01?: number };
  handleInput(vehicleId: string, input: { isDown(code: string): boolean; gamepad?: { buttons: ReadonlyArray<{ pressed: boolean }> } | null }): string[];
  notifyCollision(vehicleId: string, hit: { strength: number; x?: number; z?: number; nx?: number; nz?: number }): string[];
  update(deltaTime: number): Array<AbilityState & { vehicleId: string }>;
  serialize(): { version: number; vehicles: Record<string, Record<SlotName, string | null>> };
  load(data: unknown): void;
}

export default VehicleTuningManager;
