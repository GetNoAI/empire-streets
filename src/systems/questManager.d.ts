// Types for questManager.js.

export type ObjectiveType = 'REACH_MARKER' | 'WIN_RACE' | 'COMPLETE_HEIST' | 'CATCH_STREETMON' | 'DEFEAT_BOSS' | 'REACH_STREET_CRED' | 'TALK_TO' | 'ESCAPE_WANTED' | 'TUNE_VEHICLE';
export const OBJECTIVE_TYPES: readonly ObjectiveType[];

export interface ObjectiveDef {
  id: string;
  type: ObjectiveType;
  /** What the HUD says. */
  text: string;
  /** How many times (catches, wins...). Default 1. */
  count?: number;
  /** Fail the quest if not done in time. */
  timeLimitSeconds?: number;
  // REACH_MARKER
  marker?: { x: number; z: number; radius?: number; layer?: string };
  inVehicle?: boolean;
  // WIN_RACE
  track?: string;
  /** Finish this place or better (1 = win). */
  place?: number;
  night?: boolean;
  /** Put the police on you (stars) when the race starts. */
  police?: number;
  // COMPLETE_HEIST
  target?: string;
  // CATCH_STREETMON
  species?: string;
  types?: string[];
  district?: string;
  minLevel?: number;
  // DEFEAT_BOSS
  boss?: string;
  // REACH_STREET_CRED
  value?: number;
  // TALK_TO
  npc?: string;
  /** What they say when you arrive. */
  line?: string;
  // ESCAPE_WANTED
  stars?: number;
  /** Raise the Wanted Level to `stars` when the objective starts (default true). */
  raise?: boolean;
  // TUNE_VEHICLE
  slots?: number;
  /** A tutorial tip (tutorials.json id) shown when this objective starts. */
  tutorial?: string;
}

export interface DialogueNode {
  speaker?: string;
  text: string;
  /** [label, next]: another node id, or 'accept', 'complete', 'end'. */
  choices: Array<[string, string]>;
}

export interface QuestDef {
  id: string;
  act: string;
  title: string;
  giver: string;
  summary: string;
  prerequisites: { quests?: string[]; flags?: string[]; streetCred?: number; division?: string };
  objectives: ObjectiveDef[];
  rewards: { cash?: number; streetCred?: number; items?: Array<[string, number]>; blueprints?: string[]; streetmon?: string; flags?: string[] };
  /** Go back to the giver to finish. */
  turnIn?: boolean;
  /** Paid when accepting (a buy-in). */
  cost?: number;
  /** Handed over when you accept: items, and (via the adapter) whatever else the game hooks up, e.g. the starter choice. */
  onAccept?: { items?: Array<[string, number]>; chooseStarter?: boolean };
  dialogue: { offer: string; active?: string; turnIn?: string; nodes: Record<string, DialogueNode> };
}

export interface Look {
  skin: string;
  hair: string;
  top: string;
  legs: string;
  shoes: string;
  /** Figure options (see HumanoidLook): feminine build, hair style, skirt, apron. */
  build?: 'm' | 'f';
  hairStyle?: 'short' | 'long' | 'bun' | 'ponytail' | 'bald';
  skirt?: boolean;
  apron?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  look: Look;
  at: { x: number; z: number };
  heading?: number;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  crew: string;
  at: { x: number; z: number };
  heading?: number;
  look: Look;
  team: Array<[string, number]>;
  intro: string;
  win: string;
  lose: string;
}

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  modifiers: Partial<Record<'topSpeed' | 'acceleration' | 'durability' | 'grip' | 'steering', number>>;
}

export interface Legendary {
  id: string;
  species: string;
  level: number;
  shiny?: boolean;
  nickname: string;
  description: string;
}

export interface ActDef {
  id: string;
  number: number;
  title: string;
  region: string;
  districts: string[];
  summary: string;
  quests: string[];
}

export interface CampaignConfig {
  version: number;
  settings?: { markerColor?: string; bossColor?: string; talkRadius?: number; giverShowRadius?: number; markerRadius?: number; failRetrySeconds?: number };
  acts: ActDef[];
  npcs: NpcDef[];
  bosses: BossDef[];
  blueprints?: Blueprint[];
  legendaries?: Legendary[];
  quests: QuestDef[];
}

export interface Division {
  id: string;
  name: string;
  rank: number;
  requires: { streetCred?: number; flags?: string[]; bosses?: string[] };
  entryFee: number;
  payoutMult: number;
  tracks: string[];
}

export interface LeagueConfig {
  version: number;
  name: string;
  short: string;
  passFlag: string;
  crews?: Array<{ id: string; name: string; type: string; turf: string; boss?: string; color?: string }>;
  divisions: Division[];
  grandPrix?: { id: string; name: string; buyIn: number; division: string; stages: Array<{ name: string; track: string; police?: number }> };
}

export interface ActiveQuest {
  id: string;
  objective: number;
  count: number;
  timeLeft: number | null;
  /** Objectives done, waiting to be handed in. */
  ready: boolean;
  startedAt: number;
  escape: { seen: boolean } | null;
}

/** What the game reports. */
export type QuestEvent =
  | { type: 'race'; track: string; place: number | null; night?: boolean }
  | { type: 'heist'; target: string; ok: boolean }
  | { type: 'catch'; species: string; types: string[]; level: number; district: string }
  | { type: 'boss'; boss: string; won: boolean }
  | { type: 'talk'; npc: string }
  | { type: 'busted' }
  | { type: 'wasted' };

/** Where the player is and how they stand (each frame). */
export interface QuestContext {
  x: number;
  z: number;
  layer: string;
  inVehicle: boolean;
  streetCred: number;
  stars: number;
  night: boolean;
  /** Most Streetmon slotted in one of your cars. */
  tunedSlots?: number;
  time?: number;
}

export interface QuestAdapter {
  earn?(cash: number): void;
  money?(): number;
  spend?(cash: number): boolean;
  addStreetCred?(n: number): void;
  addItem?(id: string, n: number): void;
  /** Display name of an item (for reward lines). */
  itemName?(id: string): string;
  unlockBlueprint?(bp: Blueprint): void;
  giveStreetmon?(l: Legendary): void;
  setWanted?(stars: number): void;
  notify?(text: string, ms?: number): void;
  /** A quest with `onAccept` was accepted (items are already given). */
  onAccept?(q: QuestDef): void;
}

export interface Dialogue {
  npc: string;
  speaker: string;
  quest: string;
  node: string;
  text: string;
  choices: Array<[string, string]>;
}

export interface QuestMarker {
  kind: 'giver' | 'objective' | 'boss' | 'boundary';
  quest: string;
  x: number;
  z: number;
  radius?: number;
  label: string;
  color: string;
  tracked: boolean;
  /** The objective is a person (a boss, someone to talk to): no light column through them. */
  person?: boolean;
}

export interface QuestHud {
  quest: string;
  act: string;
  title: string;
  objective: string;
  count: string;
  timeLeft: number | null;
  step: number;
  steps: number;
  ready: boolean;
  boss: boolean;
}

export interface QuestSave {
  active: Array<{ id: string; objective: number; count: number; ready: boolean }>;
  completed: string[];
  flags: string[];
  bosses: string[];
  blueprints: string[];
  legendaries: string[];
  acts: string[];
  tracked: string | null;
  stats: { started: number; completed: number; failed: number };
}

export function validateCampaign(c: CampaignConfig, known?: { species?: (id: string) => boolean; items?: (id: string) => boolean; tracks?: string[]; heists?: string[]; types?: readonly string[] }): true;
export function validateLeague(l: LeagueConfig, known?: { tracks?: string[]; bosses?: string[] }): true;

export class QuestManager {
  constructor(o: { campaign: CampaignConfig; league: LeagueConfig; adapter: QuestAdapter });
  readonly campaign: CampaignConfig;
  readonly league: LeagueConfig;
  activeQuests: Map<string, ActiveQuest>;
  completedQuests: Set<string>;
  storyFlags: Set<string>;
  bossesBeaten: Set<string>;
  blueprints: Set<string>;
  legendaries: Set<string>;
  actsStarted: Set<string>;
  actsCompleted: Set<string>;
  tracked: string | null;
  rank: string;
  stats: { started: number; completed: number; failed: number };
  lastCtx: QuestContext | null;
  on(type: 'offer' | 'started' | 'ready' | 'failed', fn: (e: { quest: QuestDef; reason?: string }) => void): () => void;
  on(type: 'objective' | 'objectiveDone', fn: (e: { quest: QuestDef; objective: ObjectiveDef; index?: number }) => void): () => void;
  on(type: 'progress', fn: (e: { quest: QuestDef; objective: ObjectiveDef; count: number; need: number }) => void): () => void;
  on(type: 'completed', fn: (e: { quest: QuestDef; rewards: string[] }) => void): () => void;
  on(type: 'reward', fn: (e: { quest: QuestDef; lines: string[] }) => void): () => void;
  on(type: 'actStarted' | 'actCompleted', fn: (e: { act: ActDef }) => void): () => void;
  on(type: 'flag', fn: (e: { flag: string }) => void): () => void;
  on(type: 'rank', fn: (e: { division: Division; promoted: boolean }) => void): () => void;
  quest(id: string): QuestDef | null;
  npc(id: string): NpcDef | null;
  boss(id: string): BossDef | null;
  act(id: string): ActDef | null;
  blueprint(id: string): Blueprint | null;
  currentObjective(id: string): ObjectiveDef | null;
  questObjectives(id: string): Array<ObjectiveDef & { state: 'done' | 'active' | 'pending'; count: number }>;
  status(id: string, ctx?: QuestContext | null): 'locked' | 'available' | 'active' | 'ready' | 'done';
  prerequisitesMet(q: QuestDef, ctx: QuestContext | null): boolean;
  availableQuests(ctx?: QuestContext | null): string[];
  givers(ctx?: QuestContext | null): Array<{ npc: string; role: 'offer' | 'turnIn' | 'active'; quest: string }>;
  talk(npcId: string, ctx?: QuestContext | null): Dialogue | null;
  choose(d: Dialogue, index: number, ctx?: QuestContext | null): { next: Dialogue | null; result: string | null };
  accept(id: string, ctx?: QuestContext | null): { ok: boolean; why?: string };
  /** Marks a quest done without running it or paying its rewards (old-save migration). */
  markCompleted(id: string): boolean;
  abandon(id: string): boolean;
  failQuest(id: string, reason: string): void;
  complete(id: string): boolean;
  setFlag(f: string): void;
  notify(e: QuestEvent, ctx?: QuestContext | null): void;
  update(dt: number, ctx: QuestContext): void;
  divisionFor(ctx?: QuestContext | null): Division;
  nextDivision(ctx?: QuestContext | null): { division: Division; missing: string[] } | null;
  raceRules(trackId: string, ctx?: QuestContext | null): { open: boolean; division: Division; needs: Division | null; fee: number; payoutMult: number; police: number; nightOnly: boolean };
  markers(where: (ref: string) => { x: number; z: number } | null, ctx?: QuestContext | null): QuestMarker[];
  hud(): QuestHud | null;
  cycleTracked(): string | null;
  serialize(): QuestSave;
  load(d: unknown): void;
}
