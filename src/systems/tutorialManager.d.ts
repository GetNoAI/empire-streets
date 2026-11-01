// Types for tutorialManager.js.

export type TutorialWhere = 'play' | 'battle' | 'menu' | 'any';
export const TUTORIAL_WHERE: readonly TutorialWhere[];

export interface TutorialTrigger {
  /** The event the game fires ("nearCar", "battleStart", "wanted"...). */
  on: string;
  /** Conditions on the event's data: a value, one of a list, or a range. */
  if?: Record<string, string | number | boolean | Array<string | number | boolean> | { gte?: number; lte?: number }>;
}

export interface TutorialStep {
  /** Text; {Key} renders as a key cap. */
  text: string;
  /** Practice: ticks off when the game reports this action. */
  do?: string;
}

export interface TutorialDef {
  id: string;
  category: string;
  title: string;
  intro?: string;
  steps: TutorialStep[];
  /** When it comes up; none = only when asked for (the campaign's objectives). */
  trigger?: TutorialTrigger | TutorialTrigger[];
  /** Shown only after these. */
  after?: string[];
  where?: TutorialWhere;
  /** Higher shows first. */
  priority?: number;
  /** Reading time override (seconds). */
  seconds?: number;
  /** Stays queued however long it waits (situational tips expire otherwise). */
  keep?: boolean;
  /** Events that mean you've already done this: the tip is dropped (marked seen) unseen. */
  skipOn?: string[];
  /** Urgent: cuts in front of the card on screen (which comes back after). */
  interrupt?: boolean;
}

export interface TutorialConfig {
  version: number;
  settings?: Partial<{ gapSeconds: number; readSecondsBase: number; readSecondsPerWord: number; readSecondsMax: number; practiceTimeout: number; doneDelay: number; queueExpiry: number; cutInPriority: number; freshSeconds: number }>;
  categories?: Array<{ id: string; name: string }>;
  /** Every event the game fires (validation). */
  events?: string[];
  /** Events the game re-checks continuously (a car within reach, wanted): their tips show only while still true. */
  situations?: string[];
  /** Every practice action the game reports (validation). */
  actions?: string[];
  tutorials: TutorialDef[];
}

export interface TutorialView {
  id: string;
  title: string;
  category: string;
  intro: string;
  steps: Array<{ text: string; parts: Array<string | { key: string }>; /** The same step worded for a touch screen (a step's optional `touch` text). */ touchParts: Array<string | { key: string }> | null; practice: boolean; done: boolean }>;
  practice: number;
  practiced: number;
  replay: boolean;
  where: TutorialWhere;
}

export interface TutorialSave {
  enabled: boolean;
  seen: string[];
  performed: string[];
}

export function validateTutorials(c: TutorialConfig, known?: { events?: readonly string[]; actions?: readonly string[] }): true;
export function triggerMatches(tr: TutorialTrigger, data: Record<string, unknown>): boolean;
export function parseKeys(text: string): Array<string | { key: string }>;

export class TutorialManager {
  constructor(o: { config: TutorialConfig });
  readonly config: TutorialConfig;
  settings: Required<NonNullable<TutorialConfig['settings']>>;
  enabled: boolean;
  seen: Set<string>;
  performed: Set<string>;
  queue: Array<{ id: string; at: number; forced: boolean; expires: boolean; situational?: boolean; done?: boolean[]; shownFor?: number }>;
  situations: Set<string>;
  live: Map<string, number>;
  stale(q: { id: string; situational?: boolean; forced: boolean; done?: boolean[] }): boolean;
  pending: Set<string>;
  current: { id: string; def: TutorialDef; done: boolean[]; shownFor: number; closing: number; forced: boolean } | null;
  stats: { shown: number; practiced: number; skipped: number; dismissed: number };
  on(type: 'show' | 'step', fn: (v: TutorialView) => void): () => void;
  on(type: 'hide', fn: (e: { id: string }) => void): () => void;
  on(type: 'close', fn: (e: { id: string; why: 'done' | 'dismissed' | 'timeout' | 'skipped' }) => void): () => void;
  def(id: string): TutorialDef | null;
  isSeen(id: string): boolean;
  isQueued(id: string): boolean;
  fire(event: string, data?: Record<string, unknown>): string[];
  request(id: string): boolean;
  replay(id: string): boolean;
  action(name: string): boolean;
  dismiss(): boolean;
  update(dt: number, ctx: { where: 'play' | 'battle' | 'menu' | 'none' }): void;
  view(): TutorialView | null;
  list(): Array<{ id: string; name: string; tutorials: Array<{ id: string; title: string; seen: boolean }> }>;
  markSeen(ids: string[]): void;
  serialize(): TutorialSave;
  load(d: unknown): void;
  setEnabled(on: boolean): boolean;
}
