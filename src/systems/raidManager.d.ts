// Types for raidManager.js.

export type RaidStatus = 'idle' | 'omen' | 'rampage' | 'engaged' | 'subdued' | 'escaped' | 'caught';
export const RAID_STATUS: readonly RaidStatus[];

export interface RaidSettings {
  rareCheckSeconds: number;
  minPartyLevel: number;
  omenSeconds: number;
  rampageSeconds: number;
  subduedSeconds: number;
  cooldownSeconds: number;
  questCooldownSeconds: number;
  levelOverParty: number;
  levelRange: [number, number];
  hpScale: number;
  actionsPerTurn: number;
  /** Damage multiplier for its moves in the raid battle. */
  foeDamage: number;
  escapeHeal: number;
  stomp: { every: [number, number]; radius: number; playerDamage: number; carDamage: number; carPush: number; pedKnock: number; shake: number };
  roam: { radius: number; pause: [number, number] };
  allies: { count: [number, number]; joinRadius: number; levelUnderParty: number; minLevel: number; attackEvery: [number, number]; range: number; hpFloor: number; cheerLines: string[] };
  catchMultiplier: number;
}

export interface LegendaryDef {
  id: string;
  species: string;
  trigger: { rare?: { chance: number; districts: string[]; times: string[]; biome?: string; afterBeaten?: boolean }; quest?: string };
  omen: string;
  arrive: string;
  escaped: string;
  subdued: string;
  caught: string;
  color: string;
}

export interface RaidConfig {
  version: number;
  settings: RaidSettings;
  legendaries: LegendaryDef[];
}

export interface RaidState {
  id: string;
  status: RaidStatus;
  /** HP left, fraction of max (persists between fights in a raid). */
  hp: number;
  timer: number;
  cooldownUntil: number;
  caught: boolean;
  beaten: number;
  escapes: number;
  level: number;
  /** The quest that started it (null for a rare event). */
  quest: string | null;
  /** Where a quest raid happens (rare raids turn up near you). */
  at: { x: number; y: number; z: number; biome: string } | null;
}

export interface RaidContext {
  district: string;
  time: string;
  biome: string;
  partyLevel: number;
  /** Something else is going on (a race, a heist, a cutscene): no rare rolls. */
  blocked?: boolean;
}

export type RaidEvent =
  | { type: 'omen'; id: string }
  | { type: 'arrive'; id: string }
  | { type: 'resume'; id: string }
  | { type: 'subdued'; id: string; quest: string | null }
  | { type: 'caught'; id: string; quest: string | null }
  | { type: 'escaped'; id: string; quest: string | null };

export interface RaidSave {
  time: number;
  legendaries: Array<{ id: string; caught: boolean; cooldownLeft: number; beaten: number; escapes: number; hp: number }>;
}

export function validateRaids(c: RaidConfig, known?: { species?: (id: string) => boolean; quests?: (id: string) => boolean }): true;

export class RaidManager {
  constructor(o: { config: RaidConfig; rand?: () => number });
  readonly config: RaidConfig;
  readonly S: RaidSettings;
  time: number;
  active: RaidState | null;
  def(id: string): LegendaryDef;
  state(id: string): RaidState;
  levelFor(partyLevel: number): number;
  rareEligible(d: LegendaryDef, ctx: RaidContext): boolean;
  trigger(id: string, o: { partyLevel: number; at?: { x: number; y: number; z: number; biome: string } | null; quest?: string | null }): boolean;
  update(dt: number, ctx: RaidContext): RaidEvent[];
  engage(id: string): boolean;
  disengage(id: string, outcome: 'win' | 'lose' | 'ran' | 'aborted', hp: number): RaidEvent[];
  chip(id: string, frac: number): number;
  caught(id: string): RaidEvent[];
  escape(s: RaidState): RaidEvent[];
  abandon(): RaidEvent[];
  readonly catchMultiplier: number;
  save(): RaidSave;
  load(raw: unknown): void;
}
