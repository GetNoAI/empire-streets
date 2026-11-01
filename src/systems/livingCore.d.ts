// Types for livingCore.js.

export class SpatialGrid<T> {
  constructor(cell?: number);
  readonly cell: number;
  size: number;
  clear(): void;
  key(x: number, z: number): string;
  insert(item: T, x: number, z: number): void;
  near(x: number, z: number, r: number, filter?: (item: T) => boolean): Array<{ item: T; d: number }>;
  pairs(r: number): Array<[T, T, number]>;
}

export function clamp(v: number, lo: number, hi: number): number;
export function range(r: readonly [number, number] | number[], rand?: () => number): number;
export function rangeInt(r: readonly [number, number] | number[], rand?: () => number): number;
export function pickWeighted<T extends { weight: number }>(list: T[], rand?: () => number): T | null;
export function pick<T>(list: readonly T[], rand?: () => number): T;
export function typeMult(chart: Record<string, Record<string, number>>, attack: string, defender: readonly string[]): number;

export interface Fighter {
  level: number;
  attack: number;
  defense: number;
  speed: number;
  types: readonly string[];
  moves: ReadonlyArray<{ name: string; type: string; power: number }>;
}

export interface AmbientHit {
  damage: number;
  move: string;
  type: string;
  mult: number;
  crit: boolean;
}

export function ambientHit(a: Fighter, b: Fighter, chart: Record<string, Record<string, number>>, rand?: () => number, scale?: number): AmbientHit;
export function isRival(a: readonly string[], b: readonly string[], rivalries: ReadonlyArray<readonly [string, string]> | string[][]): boolean;
export function fillLine(line: string, vars: Record<string, string | number | undefined>): string;
export function hasHoles(line: string): boolean;
