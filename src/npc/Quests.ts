import npcsJson from '../data/npcs.json';
import questsJson from '../data/quests.json';
import { DATA, DISTRICTS, type District } from '../creatures/Data';

/**
 * Sewer community data and logic (engine-free, unit-tested): who lives where, what they say, and
 * the quests they give. Quest progress is plain data ({step, done} per quest id) kept in the save.
 */

/** `raid`: wakes a legendary at the place (legendaries.json); done once it's beaten or caught. */
export type StepType = 'reach' | 'collect' | 'battle' | 'escort' | 'catch' | 'talk' | 'raid';

export interface QuestStep {
  type: StepType;
  text: string;
  place?: string;
  item?: string;
  name?: string;
  team?: Array<[string, number]>;
  species?: string;
  to?: string;
  npc?: string;
  /** Raid steps: the legendary's id in legendaries.json. */
  legendary?: string;
}

export interface QuestSpec {
  id: string;
  name: string;
  giver: string;
  district: District;
  requiresReputation?: number;
  /** Given to you when you accept. */
  start?: { items?: Array<[string, number]> };
  steps: QuestStep[];
  rewards: { cash?: number; items?: Array<[string, number]>; reputation?: number };
}

export interface DialogueNode {
  text: string;
  choices: Array<[string, string]>;
  /** startQuest:<id> | turnIn:<id> | shop | rest */
  do?: string;
}

export interface NpcSpec {
  id: string;
  name: string;
  home: District;
  spot: number;
  role: 'quest' | 'rest' | 'market' | 'talk';
  look: { top: string; legs: string; hair: string; skin?: string; build?: 'm' | 'f'; hairStyle?: 'short' | 'long' | 'bun' | 'ponytail' | 'bald'; skirt?: boolean; apron?: string };
  dialogue: { start: string; when?: Array<{ quest: string; is: QuestStatus; node: string }>; nodes: Record<string, DialogueNode> };
}

export type QuestStatus = 'none' | 'active' | 'ready' | 'done';
export type QuestState = Record<string, { step: number; done: boolean }>;

const fail = (m: string): never => {
  throw new Error(`Sewer community data: ${m}`);
};

/** Validates people and quests against each other and the game data. Exposed for tests. */
export function parseCommunity(rawNpcs: { npcs: unknown[] }, rawQuests: { quests: unknown[] }): { npcs: NpcSpec[]; quests: QuestSpec[] } {
  const npcs = rawNpcs.npcs as NpcSpec[];
  const quests = rawQuests.quests as QuestSpec[];
  const npcIds = new Set<string>();
  for (const n of npcs) {
    if (!/^[a-z0-9-]{1,40}$/.test(n.id) || npcIds.has(n.id)) fail(`npc id "${n.id}" bad or duplicated`);
    npcIds.add(n.id);
    if (!DISTRICTS.includes(n.home)) fail(`npc ${n.id}: unknown home "${n.home}"`);
    if (!(n.spot >= 0 && n.spot < 8)) fail(`npc ${n.id}: spot must be 0-7`);
    const nodes = n.dialogue?.nodes ?? {};
    if (!nodes[n.dialogue.start]) fail(`npc ${n.id}: start node "${n.dialogue.start}" missing`);
    for (const w of n.dialogue.when ?? []) if (!nodes[w.node]) fail(`npc ${n.id}: 'when' points at missing node "${w.node}"`);
    for (const [id, node] of Object.entries(nodes)) {
      for (const [, next] of node.choices) if (next !== 'end' && !nodes[next]) fail(`npc ${n.id}: node ${id} leads to missing "${next}"`);
      if (node.do && !/^(startQuest:[a-z0-9-]+|turnIn:[a-z0-9-]+|shop|rest)$/.test(node.do)) fail(`npc ${n.id}: node ${id} has unknown action "${node.do}"`);
    }
  }
  const spots = new Set(npcs.map((n) => `${n.home}:${n.spot}`));
  if (spots.size !== npcs.length) fail('two people share a spot');
  const qIds = new Set<string>();
  const place = /^(hub|chamber:\d+|deadEnd:\d+)$/;
  for (const q of quests) {
    if (!/^[a-z0-9-]{1,40}$/.test(q.id) || qIds.has(q.id)) fail(`quest id "${q.id}" bad or duplicated`);
    qIds.add(q.id);
    if (!npcIds.has(q.giver)) fail(`quest ${q.id}: giver "${q.giver}" isn't a person`);
    if (!DISTRICTS.includes(q.district)) fail(`quest ${q.id}: unknown district`);
    if (!q.steps.length) fail(`quest ${q.id}: no steps`);
    for (const s of q.steps) {
      if (!s.text) fail(`quest ${q.id}: a step has no text`);
      if (['reach', 'collect', 'battle', 'escort', 'raid'].includes(s.type) && !place.test(s.place ?? '')) fail(`quest ${q.id}: ${s.type} step needs a place (hub, chamber:N, deadEnd:N)`);
      if (s.type === 'collect' && !s.item) fail(`quest ${q.id}: collect step needs an item name`);
      if (s.type === 'battle' && !(s.team?.length && s.team.every(([sp, l]) => DATA.species.has(sp) && l >= 1 && l <= 100))) fail(`quest ${q.id}: battle team invalid`);
      if ((s.type === 'escort' || s.type === 'catch') && !DATA.species.has(s.species ?? '')) fail(`quest ${q.id}: unknown species "${s.species}"`);
      if (s.type === 'escort' && !place.test(s.to ?? '')) fail(`quest ${q.id}: escort needs a 'to' place`);
      if (s.type === 'talk' && !npcIds.has(s.npc ?? '')) fail(`quest ${q.id}: talk step to unknown "${s.npc}"`);
      if (s.type === 'raid' && !(s.legendary && DATA.species.get(s.legendary)?.legendary)) fail(`quest ${q.id}: raid step needs a legendary (got "${s.legendary}")`);
      if (!['reach', 'collect', 'battle', 'escort', 'catch', 'talk', 'raid'].includes(s.type)) fail(`quest ${q.id}: unknown step type "${s.type}"`);
    }
    for (const [it] of [...(q.rewards.items ?? []), ...(q.start?.items ?? [])]) if (!DATA.items.has(it)) fail(`quest ${q.id}: unknown item "${it}"`);
  }
  // Every quest action in dialogue refers to a real quest.
  for (const n of npcs)
    for (const node of Object.values(n.dialogue.nodes)) {
      const m = node.do?.match(/^(?:startQuest|turnIn):(.+)$/);
      if (m && !qIds.has(m[1])) fail(`npc ${n.id}: action refers to unknown quest "${m[1]}"`);
    }
  for (const n of npcs) for (const w of n.dialogue.when ?? []) if (!qIds.has(w.quest)) fail(`npc ${n.id}: 'when' refers to unknown quest "${w.quest}"`);
  return { npcs, quests };
}

export const COMMUNITY = parseCommunity(npcsJson as { npcs: unknown[] }, questsJson as { quests: unknown[] });

export function quest(id: string): QuestSpec {
  const q = COMMUNITY.quests.find((x) => x.id === id);
  if (!q) throw new Error(`no quest "${id}"`);
  return q;
}

/** Where a quest stands for a given person (ready = waiting for you to talk to them). */
export function questStatus(state: QuestState, q: QuestSpec, npcId?: string): QuestStatus {
  const s = state[q.id];
  if (!s) return 'none';
  if (s.done) return 'done';
  const step = q.steps[s.step];
  if (step?.type === 'talk' && (!npcId || step.npc === npcId)) return 'ready';
  return 'active';
}

/** The node a conversation opens on, given quest progress. */
export function openingNode(npc: NpcSpec, state: QuestState): string {
  for (const w of npc.dialogue.when ?? []) if (questStatus(state, quest(w.quest), npc.id) === w.is) return w.node;
  return npc.dialogue.start;
}

/** Can this quest be started now? */
export function canStart(state: QuestState, q: QuestSpec, reputation: number): { ok: boolean; why?: string } {
  if (state[q.id]) return { ok: false, why: 'already taken' };
  if ((q.requiresReputation ?? 0) > reputation) return { ok: false, why: `needs ${q.requiresReputation} reputation` };
  return { ok: true };
}

/** Starts a quest (returns the new state). */
export function startQuest(state: QuestState, id: string): QuestState {
  return { ...state, [id]: { step: 0, done: false } };
}

/** Moves a quest to its next step; marks it done after the last. */
export function advanceQuest(state: QuestState, id: string): { state: QuestState; finished: boolean } {
  const q = quest(id);
  const s = state[id];
  if (!s || s.done) return { state, finished: false };
  const step = s.step + 1;
  const finished = step >= q.steps.length;
  return { state: { ...state, [id]: { step: finished ? q.steps.length : step, done: finished } }, finished };
}

/** The step you're on for a quest (null if not started or done). */
export function currentStep(state: QuestState, id: string): QuestStep | null {
  const s = state[id];
  if (!s || s.done) return null;
  return quest(id).steps[s.step] ?? null;
}

/** Black market: today's stock and prices, from the day number and your reputation. */
export const MARKET = {
  pool: [
    { id: 'lure', price: 450 },
    { id: 'net', price: 300 },
    { id: 'crate', price: 400 },
    { id: 'cuffs', price: 150 },
    { id: 'cage', price: 1600, rep: 20 },
    { id: 'sparkPlug', price: 1800, rep: 20 },
    { id: 'steelCase', price: 3000, rep: 20 },
  ],
  slots: 4,
  /** Reputation for a 20% discount. */
  discountRep: 40,
  discount: 0.8,
} as const;

export function marketStock(day: number, reputation: number): Array<{ id: string; price: number }> {
  const pool = MARKET.pool.filter((p) => !('rep' in p) || reputation >= (p as { rep: number }).rep);
  // Deterministic shuffle by day.
  let s = (day * 2654435761) >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = pool.map((p) => ({ p, k: rnd() })).sort((a, b) => a.k - b.k);
  // Lures are always in (it's the sewer's speciality).
  const picked = [pool.find((p) => p.id === 'lure')!, ...order.map((o) => o.p).filter((p) => p.id !== 'lure')].slice(0, MARKET.slots);
  const mult = reputation >= MARKET.discountRep ? MARKET.discount : 1;
  return picked.map((p) => ({ id: p.id, price: Math.round((p.price * mult) / 10) * 10 }));
}
