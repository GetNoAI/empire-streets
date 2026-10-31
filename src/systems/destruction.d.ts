// Types for destruction.js.

export type DamageSource = 'car' | 'explosion' | 'bullet' | 'melee' | 'streetmon' | 'legendary';
export const DAMAGE_SOURCES: readonly DamageSource[];

export interface DestructibleKind {
  name: string;
  hp: number;
  material: string;
  radius: number;
  breakSpeedKmh: number;
  carSlow: number;
  carDamage?: number;
  debris: 'pole' | 'hydrant' | 'tree' | 'can' | 'box' | 'bench';
  geyserSeconds?: number;
}

export interface DestructibleConfig {
  version: number;
  settings: { maxDebris: number; debrisLife: [number, number]; debrisFade: number; repairSeconds: number; repairMinDistance: number; cellSize: number; decals: { bullet: number; scorch: number; crack: number } };
  materials: Record<string, { bullet: number; melee: number; explosion: number; streetmon: number; legendary: number; sound: string }>;
  kinds: Record<string, DestructibleKind>;
  damage: { explosionRadius: number; explosionDamage: number; streetmonPerPower: number; streetmonRadius: number; stompDamage: number };
}

export interface Prop {
  id: number;
  kind: string;
  x: number;
  z: number;
  rot: number;
  s: number;
  layer: string;
  hp: number;
  maxHp: number;
  radius: number;
  broken: boolean;
  brokenAt: number;
}

export function validateDestructibles(c: DestructibleConfig): true;

export class DestructionManager {
  constructor(o: { config: DestructibleConfig; props: Array<{ kind: string; x: number; z: number; rot?: number; s?: number; layer?: string }> });
  readonly config: DestructibleConfig;
  props: Prop[];
  time: number;
  stats: { broken: number; repaired: number; damaged: number };
  add(p: { kind: string; x: number; z: number; rot?: number; s?: number; layer?: string }): Prop;
  on(type: 'break', fn: (e: { prop: Prop; source: DamageSource; dirX: number; dirZ: number; speed: number }) => void): () => void;
  on(type: 'damage', fn: (e: { prop: Prop; amount: number; source: DamageSource }) => void): () => void;
  on(type: 'repair', fn: (e: { prop: Prop }) => void): () => void;
  near(x: number, z: number, r: number, all?: boolean): Prop[];
  blocksAt(x: number, z: number, r: number): boolean;
  hit(p: Prop, amount: number, source: DamageSource, push?: { dirX?: number; dirZ?: number; speed?: number }): boolean;
  carSweep(car: { x: number; z: number; vx: number; vz: number; halfWidth: number; ahead: number }): { broken: Prop[]; slow: number; carDamage: number };
  area(x: number, z: number, radius: number, damage: number, source: DamageSource): Prop[];
  explosion(x: number, z: number, radius: number): Prop[];
  move(x: number, z: number, power: number, aoe?: boolean, legendary?: boolean): Prop[];
  stomp(x: number, z: number, radius: number): Prop[];
  update(dt: number, ctx: { x: number; z: number; visible(x: number, z: number): boolean }): Prop[];
  repair(p: Prop): void;
  repairAll(): void;
  readonly brokenCount: number;
}
