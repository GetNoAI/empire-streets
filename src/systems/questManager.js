// @ts-check
/**
 * The campaign: quest tracking, objective checks, dialogue, rewards and the racing league
 * (engine-free, unit-tested).
 *
 * The story (campaign_quests.json) is five acts of quests. A quest is offered by a person once
 * its prerequisites are met (quests done, story flags, Street Cred, league division); you accept
 * it in their dialogue tree, work through its objectives in order, and get its rewards, either
 * straight away or when you go back to them (`turnIn`).
 *
 *   locked -> available -> active -> (ready) -> done
 *                 ^           |
 *                 +-- failed -+   (a timer ran out, busted during a crackdown...)
 *
 * Objectives:
 *   REACH_MARKER       get to a point (optionally in a car, within a time limit)
 *   WIN_RACE           finish a race (a given track, or any) in the top N (optionally at night,
 *                      with the police put on you when it starts)
 *   COMPLETE_HEIST     pull off a heist (a given job, or any)
 *   CATCH_STREETMON    catch N Streetmon (species / types / district / minimum level)
 *   DEFEAT_BOSS        win the battle against a boss
 *   REACH_STREET_CRED  have this much Street Cred
 *   TALK_TO            talk to someone
 *   ESCAPE_WANTED      the Wanted Level goes to N stars; lose the police
 *   TUNE_VEHICLE       have a car with N Streetmon slotted
 *
 * The game reports what happens through `notify()` (races, heists, catches, battles, talks,
 * arrests) and `update()` (where the player is, Street Cred, stars, time of day); rewards and
 * world effects go out through the adapter. Listeners (`on`) hear about offers, starts,
 * objectives, progress, completions, failures, acts, flags, rewards and league promotions.
 *
 * The racing league (racing_league.json): your division is the highest one whose requirements
 * you meet (Street Cred, flags, bosses beaten); it sets league race entry fees, prize money
 * multipliers and which tracks are open.
 */

export const OBJECTIVE_TYPES = /** @type {const} */ ([
  'REACH_MARKER',
  'WIN_RACE',
  'COMPLETE_HEIST',
  'CATCH_STREETMON',
  'DEFEAT_BOSS',
  'REACH_STREET_CRED',
  'TALK_TO',
  'ESCAPE_WANTED',
  'TUNE_VEHICLE',
]);

/**
 * @typedef {import('./questManager').CampaignConfig} CampaignConfig
 * @typedef {import('./questManager').LeagueConfig} LeagueConfig
 * @typedef {import('./questManager').QuestDef} QuestDef
 * @typedef {import('./questManager').ObjectiveDef} ObjectiveDef
 * @typedef {import('./questManager').ActiveQuest} ActiveQuest
 * @typedef {import('./questManager').QuestContext} QuestContext
 * @typedef {import('./questManager').QuestEvent} QuestEvent
 * @typedef {import('./questManager').QuestAdapter} QuestAdapter
 * @typedef {import('./questManager').Dialogue} Dialogue
 * @typedef {import('./questManager').QuestMarker} QuestMarker
 * @typedef {import('./questManager').Division} Division
 */

const ID = /^[a-z0-9-]{1,40}$/;

/** @param {string} m @returns {never} */
const fail = (m) => {
  throw new Error(`Campaign config: ${m}`);
};

/**
 * Checks the campaign against itself and (optionally) the game's data. Throws on the first problem.
 * @param {CampaignConfig} c
 * @param {{ species?: (id: string) => boolean, items?: (id: string) => boolean, tracks?: string[], heists?: string[], types?: readonly string[] }} [known]
 */
export function validateCampaign(c, known = {}) {
  if (!c || !Array.isArray(c.quests) || !Array.isArray(c.acts) || !Array.isArray(c.npcs) || !Array.isArray(c.bosses)) fail('needs acts, npcs, bosses and quests');
  const npcIds = new Set();
  for (const n of c.npcs) {
    if (!ID.test(n.id) || npcIds.has(n.id)) fail(`npc id "${n.id}" bad or repeated`);
    if (!n.name || !Number.isFinite(n.at?.x) || !Number.isFinite(n.at?.z)) fail(`npc ${n.id}: needs a name and a position`);
    npcIds.add(n.id);
  }
  const bossIds = new Set();
  for (const b of c.bosses) {
    if (!ID.test(b.id) || bossIds.has(b.id)) fail(`boss id "${b.id}" bad or repeated`);
    if (!Number.isFinite(b.at?.x) || !Number.isFinite(b.at?.z)) fail(`boss ${b.id}: needs a position`);
    if (!Array.isArray(b.team) || !b.team.length || b.team.length > 6) fail(`boss ${b.id}: team of 1-6`);
    for (const [sp, lv] of b.team) {
      if (known.species && !known.species(sp)) fail(`boss ${b.id}: unknown species "${sp}"`);
      if (!(lv >= 1 && lv <= 100)) fail(`boss ${b.id}: level ${lv} out of range`);
    }
    bossIds.add(b.id);
  }
  const bpIds = new Set((c.blueprints ?? []).map((b) => b.id));
  for (const b of c.blueprints ?? []) for (const [k, v] of Object.entries(b.modifiers ?? {})) if (!['topSpeed', 'acceleration', 'durability', 'grip', 'steering'].includes(k) || !(v > 0.5 && v < 2)) fail(`blueprint ${b.id}: bad modifier ${k}`);
  const legIds = new Set((c.legendaries ?? []).map((l) => l.id));
  for (const l of c.legendaries ?? []) if (known.species && !known.species(l.species)) fail(`legendary ${l.id}: unknown species "${l.species}"`);
  const qIds = new Set(c.quests.map((q) => q.id));
  if (qIds.size !== c.quests.length) fail('repeated quest id');
  const actIds = new Set(c.acts.map((a) => a.id));
  for (const a of c.acts) for (const qid of a.quests) if (!qIds.has(qid)) fail(`act ${a.id}: unknown quest "${qid}"`);
  for (const q of c.quests) {
    if (!ID.test(q.id)) fail(`quest id "${q.id}" bad`);
    if (!actIds.has(q.act)) fail(`quest ${q.id}: unknown act "${q.act}"`);
    if (!npcIds.has(q.giver)) fail(`quest ${q.id}: giver "${q.giver}" isn't a person`);
    if (!q.objectives?.length) fail(`quest ${q.id}: no objectives`);
    for (const p of q.prerequisites?.quests ?? []) if (!qIds.has(p)) fail(`quest ${q.id}: prerequisite "${p}" unknown`);
    const objIds = new Set();
    for (const o of q.objectives) {
      if (!OBJECTIVE_TYPES.includes(/** @type {any} */ (o.type))) fail(`quest ${q.id}: unknown objective type "${o.type}"`);
      if (!o.id || objIds.has(o.id)) fail(`quest ${q.id}: objective ids must be unique`);
      objIds.add(o.id);
      if (!o.text) fail(`quest ${q.id}/${o.id}: no text`);
      switch (o.type) {
        case 'REACH_MARKER':
          if (!Number.isFinite(o.marker?.x) || !Number.isFinite(o.marker?.z)) fail(`quest ${q.id}/${o.id}: marker needs x and z`);
          break;
        case 'WIN_RACE':
          if (o.track && known.tracks && !known.tracks.includes(o.track)) fail(`quest ${q.id}/${o.id}: unknown track "${o.track}"`);
          if (o.police !== undefined && !(o.police >= 1 && o.police <= 5)) fail(`quest ${q.id}/${o.id}: police stars 1-5`);
          break;
        case 'COMPLETE_HEIST':
          if (o.target && known.heists && !known.heists.includes(o.target)) fail(`quest ${q.id}/${o.id}: unknown heist "${o.target}"`);
          break;
        case 'CATCH_STREETMON':
          if (o.species && known.species && !known.species(o.species)) fail(`quest ${q.id}/${o.id}: unknown species "${o.species}"`);
          for (const t of o.types ?? []) if (known.types && !known.types.includes(t)) fail(`quest ${q.id}/${o.id}: unknown type "${t}"`);
          break;
        case 'DEFEAT_BOSS':
          if (!bossIds.has(o.boss)) fail(`quest ${q.id}/${o.id}: unknown boss "${o.boss}"`);
          break;
        case 'REACH_STREET_CRED':
          if (!(o.value > 0)) fail(`quest ${q.id}/${o.id}: needs a Street Cred value`);
          break;
        case 'TALK_TO':
          if (!npcIds.has(o.npc)) fail(`quest ${q.id}/${o.id}: unknown person "${o.npc}"`);
          break;
        case 'ESCAPE_WANTED':
          if (!(o.stars >= 1 && o.stars <= 5)) fail(`quest ${q.id}/${o.id}: stars 1-5`);
          break;
        case 'TUNE_VEHICLE':
          if (!(o.slots >= 1 && o.slots <= 3)) fail(`quest ${q.id}/${o.id}: slots 1-3`);
          break;
      }
    }
    const r = q.rewards ?? {};
    for (const b of r.blueprints ?? []) if (!bpIds.has(b)) fail(`quest ${q.id}: unknown blueprint "${b}"`);
    if (r.streetmon && !legIds.has(r.streetmon)) fail(`quest ${q.id}: unknown legendary "${r.streetmon}"`);
    for (const [it] of r.items ?? []) if (known.items && !known.items(it)) fail(`quest ${q.id}: unknown item "${it}"`);
    for (const [it, n] of q.onAccept?.items ?? []) if ((known.items && !known.items(it)) || !(n > 0)) fail(`quest ${q.id}: bad onAccept item "${it}"`);
    // Dialogue tree: every link goes somewhere.
    const d = q.dialogue;
    if (!d?.nodes?.[d.offer]) fail(`quest ${q.id}: dialogue needs an offer node`);
    for (const k of ['active', 'turnIn']) if (d[k] && !d.nodes[d[k]]) fail(`quest ${q.id}: dialogue "${k}" node missing`);
    if (q.turnIn && !d.turnIn) fail(`quest ${q.id}: turn-in quest needs a turnIn node`);
    for (const [nid, n] of Object.entries(d.nodes)) {
      if (!n.text || !Array.isArray(n.choices) || !n.choices.length) fail(`quest ${q.id}: node ${nid} needs text and choices`);
      for (const [label, next] of n.choices) {
        if (!label) fail(`quest ${q.id}: node ${nid} has an empty choice`);
        if (!['end', 'accept', 'complete'].includes(next) && !d.nodes[next]) fail(`quest ${q.id}: node ${nid} leads to missing "${next}"`);
      }
    }
    if (!Object.values(d.nodes).some((n) => n.choices.some(([, nx]) => nx === 'accept'))) fail(`quest ${q.id}: nothing in the dialogue accepts the quest`);
  }
  // No prerequisite loops.
  /** @type {Map<string, string[]>} */
  const deps = new Map(c.quests.map((q) => [q.id, q.prerequisites?.quests ?? []]));
  /** @type {Set<string>} */
  const done = new Set();
  /** @param {string} id @param {Set<string>} path */
  const visit = (id, path) => {
    if (done.has(id)) return;
    if (path.has(id)) fail(`prerequisite loop through "${id}"`);
    path.add(id);
    for (const p of deps.get(id) ?? []) visit(p, path);
    path.delete(id);
    done.add(id);
  };
  for (const id of qIds) visit(id, new Set());
  return true;
}

/**
 * @param {LeagueConfig} l @param {{ tracks?: string[], bosses?: string[] }} [known]
 */
export function validateLeague(l, known = {}) {
  if (!l || !Array.isArray(l.divisions) || !l.divisions.length) throw new Error('League config: needs divisions');
  let rank = 0;
  for (const d of l.divisions) {
    if (!ID.test(d.id)) throw new Error(`League config: division id "${d.id}"`);
    if (!(d.rank > rank)) throw new Error(`League config: division ${d.id} rank must increase`);
    rank = d.rank;
    if (!(d.entryFee >= 0) || !(d.payoutMult >= 1)) throw new Error(`League config: division ${d.id} fee / payout`);
    for (const t of d.tracks ?? []) if (known.tracks && !known.tracks.includes(t)) throw new Error(`League config: unknown track "${t}"`);
    for (const b of d.requires?.bosses ?? []) if (known.bosses && !known.bosses.includes(b)) throw new Error(`League config: unknown boss "${b}"`);
  }
  if ((l.divisions[0].requires?.streetCred ?? 0) !== 0) throw new Error('League config: the first division must be open to everyone');
  for (const s of l.grandPrix?.stages ?? []) if (known.tracks && !known.tracks.includes(s.track)) throw new Error(`League config: unknown Grand Prix track "${s.track}"`);
  for (const c of l.crews ?? []) if (known.bosses && c.boss && !known.bosses.includes(c.boss)) throw new Error(`League config: crew ${c.id} boss unknown`);
  return true;
}

export class QuestManager {
  /**
   * @param {{ campaign: CampaignConfig, league: LeagueConfig, adapter: QuestAdapter }} o
   */
  constructor({ campaign, league, adapter }) {
    this.campaign = campaign;
    this.league = league;
    this.adapter = adapter;
    /** @type {Map<string, QuestDef>} */
    this.quests = new Map(campaign.quests.map((q) => [q.id, q]));
    /** @type {Map<string, ActiveQuest>} */
    this.activeQuests = new Map();
    /** @type {Set<string>} */
    this.completedQuests = new Set();
    /** @type {Set<string>} */
    this.storyFlags = new Set();
    /** @type {Set<string>} */
    this.bossesBeaten = new Set();
    /** @type {Set<string>} */
    this.blueprints = new Set();
    /** @type {Set<string>} */
    this.legendaries = new Set();
    /** @type {Set<string>} */
    this.actsStarted = new Set();
    /** @type {Set<string>} */
    this.actsCompleted = new Set();
    /** The quest the HUD follows. @type {string | null} */
    this.tracked = null;
    /** @type {Set<string>} */
    this.offered = new Set();
    this.rank = league.divisions[0].id;
    this.stats = { started: 0, completed: 0, failed: 0 };
    /** @type {Map<string, Set<(e: any) => void>>} */
    this.listeners = new Map();
    /** Last context seen (for markers / HUD between updates). @type {QuestContext | null} */
    this.lastCtx = null;
  }

  // ------------------------------------------------------------------ events

  /** @param {string} type @param {(e: any) => void} fn */
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} e */
  emit(type, e) {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  // ------------------------------------------------------------------ lookups

  /** @param {string} id */
  quest(id) {
    return this.quests.get(id) ?? null;
  }

  /** @param {string} id */
  npc(id) {
    return this.campaign.npcs.find((n) => n.id === id) ?? null;
  }

  /** @param {string} id */
  boss(id) {
    return this.campaign.bosses.find((b) => b.id === id) ?? null;
  }

  /** @param {string} id */
  act(id) {
    return this.campaign.acts.find((a) => a.id === id) ?? null;
  }

  /** @param {string} id */
  blueprint(id) {
    return (this.campaign.blueprints ?? []).find((b) => b.id === id) ?? null;
  }

  /** The current objective of an active quest. @param {string} id */
  currentObjective(id) {
    const a = this.activeQuests.get(id);
    const q = this.quests.get(id);
    if (!a || !q) return null;
    return q.objectives[a.objective] ?? null;
  }

  /** All objectives of a quest with their state. @param {string} id */
  questObjectives(id) {
    const q = this.quests.get(id);
    if (!q) return [];
    const a = this.activeQuests.get(id);
    const done = this.completedQuests.has(id);
    return q.objectives.map((o, i) => ({
      ...o,
      state: done || (a && i < a.objective) ? 'done' : a && i === a.objective && !a.ready ? 'active' : 'pending',
      count: a && i === a.objective ? a.count : done || (a && i < a.objective) ? o.count ?? 1 : 0,
    }));
  }

  /**
   * Where a quest stands.
   * @param {string} id @param {QuestContext | null} [ctx]
   * @returns {'locked' | 'available' | 'active' | 'ready' | 'done'}
   */
  status(id, ctx = this.lastCtx) {
    if (this.completedQuests.has(id)) return 'done';
    const a = this.activeQuests.get(id);
    if (a) return a.ready ? 'ready' : 'active';
    const q = this.quests.get(id);
    return q && this.prerequisitesMet(q, ctx) ? 'available' : 'locked';
  }

  /** @param {QuestDef} q @param {QuestContext | null} ctx */
  prerequisitesMet(q, ctx) {
    const p = q.prerequisites ?? {};
    if ((p.quests ?? []).some((id) => !this.completedQuests.has(id))) return false;
    if ((p.flags ?? []).some((f) => !this.storyFlags.has(f))) return false;
    if ((p.streetCred ?? 0) > (ctx?.streetCred ?? 0)) return false;
    if (p.division && this.divisionRank(this.rank) < this.divisionRank(p.division)) return false;
    return true;
  }

  /** @param {QuestContext | null} [ctx] */
  availableQuests(ctx = this.lastCtx) {
    return this.campaign.quests.filter((q) => this.status(q.id, ctx) === 'available').map((q) => q.id);
  }

  /**
   * Who should be standing in the world, and why: offering a quest, waiting for a turn-in, or
   * minding an active quest.
   * @param {QuestContext | null} [ctx]
   * @returns {Array<{ npc: string, role: 'offer' | 'turnIn' | 'active', quest: string }>}
   */
  givers(ctx = this.lastCtx) {
    /** @type {Map<string, { npc: string, role: 'offer' | 'turnIn' | 'active', quest: string }>} */
    const out = new Map();
    const rankOf = { turnIn: 3, offer: 2, active: 1 };
    /** @param {string} npc @param {'offer' | 'turnIn' | 'active'} role @param {string} quest */
    const put = (npc, role, quest) => {
      const cur = out.get(npc);
      if (!cur || rankOf[role] > rankOf[cur.role]) out.set(npc, { npc, role, quest });
    };
    for (const q of this.campaign.quests) {
      const s = this.status(q.id, ctx);
      if (s === 'available') put(q.giver, 'offer', q.id);
      else if (s === 'ready') put(q.giver, 'turnIn', q.id);
      else if (s === 'active') {
        put(q.giver, 'active', q.id);
        const o = this.currentObjective(q.id);
        if (o?.type === 'TALK_TO') put(o.npc, 'turnIn', q.id);
      }
    }
    return [...out.values()];
  }

  // ------------------------------------------------------------------ dialogue

  /**
   * Opens a conversation with someone: a turn-in first, then a quest on offer, then a reminder of
   * an active one. Talking counts for TALK_TO objectives. Null if they've nothing to say.
   * @param {string} npcId @param {QuestContext | null} [ctx]
   * @returns {Dialogue | null}
   */
  talk(npcId, ctx = this.lastCtx) {
    // Someone you were sent to (TALK_TO): their handover line, and the objective's done.
    /** @type {{ quest: string, line: string } | null} */
    let handover = null;
    for (const a of this.activeQuests.values()) {
      const o = this.currentObjective(a.id);
      if (!a.ready && o?.type === 'TALK_TO' && o.npc === npcId) handover = { quest: a.id, line: o.line ?? `${this.npc(npcId)?.name ?? 'They'} has been expecting you.` };
    }
    this.notify({ type: 'talk', npc: npcId }, ctx);
    if (handover) return { npc: npcId, speaker: this.npc(npcId)?.name ?? npcId, quest: handover.quest, node: '', text: handover.line, choices: [['Thanks.', 'end']] };
    const g = this.givers(ctx).find((x) => x.npc === npcId);
    if (!g) return null;
    const q = /** @type {QuestDef} */ (this.quests.get(g.quest));
    const d = q.dialogue;
    const start = g.role === 'turnIn' ? d.turnIn ?? d.active ?? d.offer : g.role === 'offer' ? d.offer : d.active ?? d.offer;
    return this.node(npcId, q, /** @type {string} */ (start));
  }

  /** @param {string} npcId @param {QuestDef} q @param {string} nodeId @returns {Dialogue} */
  node(npcId, q, nodeId) {
    const n = q.dialogue.nodes[nodeId];
    const who = this.npc(npcId);
    return { npc: npcId, speaker: n.speaker ?? who?.name ?? npcId, quest: q.id, node: nodeId, text: n.text, choices: n.choices };
  }

  /**
   * Picks a dialogue choice. Returns the next line (or null when the conversation is over) and
   * what happened ('accepted', 'completed', or a reason it couldn't be accepted).
   * @param {Dialogue} d @param {number} index @param {QuestContext | null} [ctx]
   * @returns {{ next: Dialogue | null, result: string | null }}
   */
  choose(d, index, ctx = this.lastCtx) {
    const ch = d.choices[index];
    if (!ch) return { next: d, result: null };
    const q = this.quests.get(d.quest);
    const to = ch[1];
    if (!q || to === 'end') return { next: null, result: null };
    if (to === 'accept') {
      const r = this.accept(q.id, ctx);
      if (r.ok) return { next: null, result: 'accepted' };
      return { next: { ...d, node: '', text: r.why ?? "You're not ready for this yet.", choices: [['All right.', 'end']] }, result: r.why ?? 'refused' };
    }
    if (to === 'complete') {
      const ok = this.complete(q.id);
      return { next: null, result: ok ? 'completed' : null };
    }
    return { next: this.node(d.npc, q, to), result: null };
  }

  // ------------------------------------------------------------------ quest lifecycle

  /**
   * Takes on a quest (pays its cost first, if it has one).
   * @param {string} id @param {QuestContext | null} [ctx]
   * @returns {{ ok: boolean, why?: string }}
   */
  accept(id, ctx = this.lastCtx) {
    const q = this.quests.get(id);
    if (!q) return { ok: false, why: 'No such job.' };
    const s = this.status(id, ctx);
    if (s !== 'available') return { ok: false, why: s === 'locked' ? "You're not ready for this yet." : 'Already on it.' };
    if (q.cost) {
      if ((this.adapter.money?.() ?? 0) < q.cost) return { ok: false, why: `Come back with $${q.cost.toLocaleString('en-US')}.` };
      if (!this.adapter.spend?.(q.cost)) return { ok: false, why: `Come back with $${q.cost.toLocaleString('en-US')}.` };
    }
    /** @type {ActiveQuest} */
    const a = { id, objective: -1, count: 0, timeLeft: null, ready: false, startedAt: ctx?.time ?? 0, escape: null };
    this.activeQuests.set(id, a);
    this.stats.started++;
    if (!this.tracked || !this.activeQuests.has(this.tracked)) this.tracked = id;
    if (!this.actsStarted.has(q.act)) {
      this.actsStarted.add(q.act);
      this.emit('actStarted', { act: this.act(q.act) });
    }
    for (const [it, n] of q.onAccept?.items ?? []) this.adapter.addItem?.(it, n);
    this.emit('started', { quest: q });
    this.adapter.notify?.(`New job: ${q.title}`, 2600);
    if (q.onAccept) this.adapter.onAccept?.(q);
    this.advance(a, ctx);
    return { ok: true };
  }

  /**
   * Marks a quest done without running it or paying its rewards (old saves that already did what it
   * teaches). Returns false if it's unknown or already done.
   * @param {string} id
   */
  markCompleted(id) {
    if (!this.quests.has(id) || this.completedQuests.has(id)) return false;
    this.activeQuests.delete(id);
    if (this.tracked === id) this.tracked = this.activeQuests.keys().next().value ?? null;
    this.completedQuests.add(id);
    this.actsStarted.add(/** @type {QuestDef} */ (this.quests.get(id)).act);
    return true;
  }

  /** Gives up an active quest (it can be picked up again). @param {string} id */
  abandon(id) {
    if (!this.activeQuests.delete(id)) return false;
    if (this.tracked === id) this.tracked = this.activeQuests.keys().next().value ?? null;
    this.emit('failed', { quest: this.quests.get(id), reason: 'abandoned' });
    return true;
  }

  /** @param {string} id @param {string} reason */
  failQuest(id, reason) {
    const q = this.quests.get(id);
    if (!q || !this.activeQuests.delete(id)) return;
    this.stats.failed++;
    if (this.tracked === id) this.tracked = this.activeQuests.keys().next().value ?? null;
    this.adapter.notify?.(`Job failed: ${q.title}. ${reason} Talk to ${this.npc(q.giver)?.name ?? 'them'} to try again.`, 4000);
    this.emit('failed', { quest: q, reason });
  }

  /** Moves to the next objective (or finishes). @param {ActiveQuest} a @param {QuestContext | null} ctx */
  advance(a, ctx) {
    const q = /** @type {QuestDef} */ (this.quests.get(a.id));
    a.objective++;
    a.count = 0;
    a.escape = null;
    const o = q.objectives[a.objective];
    if (!o) {
      if (q.turnIn) {
        a.ready = true;
        a.timeLeft = null;
        this.emit('ready', { quest: q });
        this.adapter.notify?.(`${q.title}: go back to ${this.npc(q.giver)?.name ?? 'them'}.`, 3000);
      } else this.complete(q.id);
      return;
    }
    a.timeLeft = o.timeLimitSeconds ?? null;
    if (o.type === 'ESCAPE_WANTED') {
      a.escape = { seen: false };
      if (o.raise !== false) this.adapter.setWanted?.(o.stars);
    }
    this.emit('objective', { quest: q, objective: o, index: a.objective });
    // Already true (Street Cred you had, a car you already tuned)?
    if (ctx) this.check(a, ctx);
  }

  /**
   * Finishes a quest and pays out. (Turn-in quests: when you talk to the giver.)
   * @param {string} id
   */
  complete(id) {
    const q = this.quests.get(id);
    const a = this.activeQuests.get(id);
    if (!q || !a || (q.turnIn && !a.ready) || (!q.turnIn && a.objective < q.objectives.length)) return false;
    this.activeQuests.delete(id);
    this.completedQuests.add(id);
    this.stats.completed++;
    if (this.tracked === id) this.tracked = this.activeQuests.keys().next().value ?? null;
    const granted = this.grant(q);
    this.emit('completed', { quest: q, rewards: granted });
    // Act finished?
    const act = this.act(q.act);
    if (act && !this.actsCompleted.has(act.id) && act.quests.every((x) => this.completedQuests.has(x))) {
      this.actsCompleted.add(act.id);
      this.emit('actCompleted', { act });
    }
    for (const nq of this.availableQuests()) if (!this.offered.has(nq)) {
      this.offered.add(nq);
      this.emit('offer', { quest: this.quests.get(nq) });
    }
    return true;
  }

  /** The reward engine. @param {QuestDef} q */
  grant(q) {
    const r = q.rewards ?? {};
    const A = this.adapter;
    /** @type {string[]} */
    const lines = [];
    if (r.cash) {
      A.earn?.(r.cash);
      lines.push(`$${r.cash.toLocaleString('en-US')}`);
    }
    if (r.streetCred) {
      A.addStreetCred?.(r.streetCred);
      lines.push(`${r.streetCred} Street Cred`);
    }
    for (const [it, n] of r.items ?? []) {
      A.addItem?.(it, n);
      lines.push(`${n} x ${A.itemName?.(it) ?? it}`);
    }
    for (const b of r.blueprints ?? []) {
      if (this.blueprints.has(b)) continue;
      this.blueprints.add(b);
      const bp = this.blueprint(b);
      A.unlockBlueprint?.(/** @type {any} */ (bp));
      lines.push(`blueprint: ${bp?.name ?? b}`);
    }
    if (r.streetmon && !this.legendaries.has(r.streetmon)) {
      const leg = (this.campaign.legendaries ?? []).find((l) => l.id === r.streetmon);
      if (leg) {
        this.legendaries.add(leg.id);
        A.giveStreetmon?.(leg);
        lines.push(`legendary Streetmon: ${leg.nickname}`);
      }
    }
    for (const f of r.flags ?? []) this.setFlag(f);
    this.emit('reward', { quest: q, lines });
    return lines;
  }

  /** @param {string} f */
  setFlag(f) {
    if (this.storyFlags.has(f)) return;
    this.storyFlags.add(f);
    this.emit('flag', { flag: f });
  }

  // ------------------------------------------------------------------ objectives

  /**
   * Something happened in the game.
   * @param {QuestEvent} e @param {QuestContext | null} [ctx]
   */
  notify(e, ctx = this.lastCtx) {
    if (e.type === 'boss' && e.won) {
      this.bossesBeaten.add(e.boss);
      this.setFlag(`boss:${e.boss}`);
    }
    for (const a of [...this.activeQuests.values()]) {
      if (a.ready) continue;
      const o = this.currentObjective(a.id);
      if (!o) continue;
      // Busted or wasted: a crackdown is lost, and so is anything against the clock (the cargo's gone).
      if ((e.type === 'busted' || e.type === 'wasted') && (o.type === 'ESCAPE_WANTED' || a.timeLeft !== null)) {
        this.failQuest(a.id, e.type === 'busted' ? 'You were busted.' : 'You were wasted.');
        continue;
      }
      if (this.matches(o, e)) this.progress(a, o, ctx);
    }
  }

  /** @param {ObjectiveDef} o @param {QuestEvent} e */
  matches(o, e) {
    switch (o.type) {
      case 'WIN_RACE':
        return e.type === 'race' && e.place !== null && e.place <= (o.place ?? 1) && (!o.track || o.track === e.track) && (!o.night || !!e.night);
      case 'COMPLETE_HEIST':
        return e.type === 'heist' && e.ok && (!o.target || o.target === e.target);
      case 'CATCH_STREETMON':
        return (
          e.type === 'catch' &&
          (!o.species || o.species === e.species) &&
          (!o.types?.length || o.types.some((t) => e.types.includes(t))) &&
          (!o.district || o.district === e.district) &&
          (o.minLevel ?? 0) <= e.level
        );
      case 'DEFEAT_BOSS':
        return e.type === 'boss' && e.won && e.boss === o.boss;
      case 'TALK_TO':
        return e.type === 'talk' && e.npc === o.npc;
      default:
        return false;
    }
  }

  /** @param {ActiveQuest} a @param {ObjectiveDef} o @param {QuestContext | null} ctx */
  progress(a, o, ctx) {
    a.count++;
    const need = o.count ?? 1;
    this.emit('progress', { quest: this.quests.get(a.id), objective: o, count: a.count, need });
    if (a.count >= need) {
      this.emit('objectiveDone', { quest: this.quests.get(a.id), objective: o });
      this.advance(a, ctx);
    }
  }

  /** State-based objectives (where you are, Street Cred, stars, tuning). @param {ActiveQuest} a @param {QuestContext} ctx */
  check(a, ctx) {
    if (a.ready) return;
    const o = this.currentObjective(a.id);
    if (!o) return;
    let done = false;
    switch (o.type) {
      case 'REACH_MARKER': {
        const m = /** @type {NonNullable<ObjectiveDef['marker']>} */ (o.marker);
        const r = m.radius ?? this.campaign.settings?.markerRadius ?? 6;
        done = Math.hypot(ctx.x - m.x, ctx.z - m.z) <= r && (!m.layer || m.layer === ctx.layer) && (!o.inVehicle || ctx.inVehicle);
        break;
      }
      case 'REACH_STREET_CRED':
        done = ctx.streetCred >= (o.value ?? 0);
        break;
      case 'TUNE_VEHICLE':
        done = (ctx.tunedSlots ?? 0) >= (o.slots ?? 1);
        break;
      case 'ESCAPE_WANTED': {
        const esc = a.escape ?? (a.escape = { seen: false });
        if (ctx.stars >= Math.min(o.stars ?? 1, 5)) esc.seen = true;
        done = esc.seen && ctx.stars === 0;
        break;
      }
    }
    if (done) this.progress(a, o, ctx);
  }

  /**
   * Per frame: positions, Street Cred, stars, timers, league rank.
   * @param {number} dt @param {QuestContext} ctx
   */
  update(dt, ctx) {
    this.lastCtx = ctx;
    for (const a of [...this.activeQuests.values()]) {
      if (a.timeLeft !== null && !a.ready) {
        a.timeLeft -= dt;
        if (a.timeLeft <= 0) {
          this.failQuest(a.id, 'Out of time.');
          continue;
        }
      }
      this.check(a, ctx);
    }
    // New offers (Street Cred and flags can unlock them).
    for (const id of this.availableQuests(ctx))
      if (!this.offered.has(id)) {
        this.offered.add(id);
        this.emit('offer', { quest: this.quests.get(id) });
      }
    // League promotion.
    const div = this.divisionFor(ctx);
    if (div.id !== this.rank) {
      const up = this.divisionRank(div.id) > this.divisionRank(this.rank);
      this.rank = div.id;
      this.emit('rank', { division: div, promoted: up });
    }
  }

  // ------------------------------------------------------------------ racing league

  /** @param {string} id */
  divisionRank(id) {
    return this.league.divisions.find((d) => d.id === id)?.rank ?? 0;
  }

  /** @param {Division} d @param {QuestContext | null} ctx */
  meets(d, ctx) {
    const r = d.requires ?? {};
    return (r.streetCred ?? 0) <= (ctx?.streetCred ?? 0) && (r.flags ?? []).every((f) => this.storyFlags.has(f)) && (r.bosses ?? []).every((b) => this.bossesBeaten.has(b));
  }

  /** Your division: the highest whose requirements you meet (each one needs the ones below). @param {QuestContext | null} [ctx] */
  divisionFor(ctx = this.lastCtx) {
    let best = this.league.divisions[0];
    for (const d of this.league.divisions) {
      if (!this.meets(d, ctx)) break;
      best = d;
    }
    return best;
  }

  /** What's missing for the next division (for the HUD / dialogue). @param {QuestContext | null} [ctx] */
  nextDivision(ctx = this.lastCtx) {
    const cur = this.divisionFor(ctx);
    const next = this.league.divisions.find((d) => d.rank > cur.rank);
    if (!next) return null;
    const r = next.requires ?? {};
    /** @type {string[]} */
    const missing = [];
    if ((r.streetCred ?? 0) > (ctx?.streetCred ?? 0)) missing.push(`${r.streetCred} Street Cred`);
    for (const f of r.flags ?? []) if (!this.storyFlags.has(f)) missing.push(f === this.league.passFlag ? 'a League Pass' : f);
    for (const b of r.bosses ?? []) if (!this.bossesBeaten.has(b)) missing.push(`beat ${this.boss(b)?.name ?? b}`);
    return { division: next, missing };
  }

  /**
   * League rules for a race: is the track open to your division, its entry fee and prize
   * multiplier, and any police the active quest puts on it.
   * @param {string} trackId @param {QuestContext | null} [ctx]
   */
  raceRules(trackId, ctx = this.lastCtx) {
    const div = this.divisionFor(ctx);
    const owner = this.league.divisions.find((d) => (d.tracks ?? []).includes(trackId));
    const open = !owner || owner.rank <= div.rank;
    let police = 0;
    let nightOnly = false;
    for (const a of this.activeQuests.values()) {
      const o = this.currentObjective(a.id);
      if (o?.type === 'WIN_RACE' && (!o.track || o.track === trackId)) {
        police = Math.max(police, o.police ?? 0);
        nightOnly = nightOnly || !!o.night;
      }
    }
    return { open, division: div, needs: owner && !open ? owner : null, fee: open ? div.entryFee : 0, payoutMult: div.payoutMult, police, nightOnly };
  }

  // ------------------------------------------------------------------ markers and HUD

  /**
   * Map / minimap / world markers: people with a job for you (M), the current objective
   * (yellow; red for a boss), and boundaries (a marker's radius).
   * @param {(ref: string) => { x: number, z: number } | null} where   'npc:<id>', 'boss:<id>', 'race:<track>', 'heist:<target>', 'chopshop'
   * @param {QuestContext | null} [ctx]
   * @returns {QuestMarker[]}
   */
  markers(where, ctx = this.lastCtx) {
    /** @type {QuestMarker[]} */
    const out = [];
    const S = this.campaign.settings ?? {};
    for (const g of this.givers(ctx)) {
      if (g.role === 'active') continue;
      // Someone you're sent to talk to (not a turn-in): the objective pin covers them.
      if (g.role === 'turnIn' && this.status(g.quest, ctx) !== 'ready') continue;
      const p = where(`npc:${g.npc}`);
      const q = /** @type {QuestDef} */ (this.quests.get(g.quest));
      if (p) out.push({ kind: 'giver', quest: g.quest, x: p.x, z: p.z, label: `${this.npc(g.npc)?.name ?? g.npc}: ${q.title}`, color: S.markerColor ?? '#ffd23f', tracked: g.quest === this.tracked });
    }
    for (const a of this.activeQuests.values()) {
      if (a.ready) continue;
      const o = this.currentObjective(a.id);
      if (!o) continue;
      const tracked = a.id === this.tracked;
      /** @type {{ x: number, z: number } | null} */
      let p = null;
      let color = S.markerColor ?? '#ffd23f';
      switch (o.type) {
        case 'REACH_MARKER':
          p = { x: /** @type {any} */ (o.marker).x, z: /** @type {any} */ (o.marker).z };
          out.push({ kind: 'boundary', quest: a.id, x: p.x, z: p.z, radius: o.marker?.radius ?? S.markerRadius ?? 6, label: o.text, color, tracked });
          break;
        case 'WIN_RACE':
          p = o.track ? where(`race:${o.track}`) : null;
          break;
        case 'COMPLETE_HEIST':
          p = o.target ? where(`heist:${o.target}`) : null;
          break;
        case 'DEFEAT_BOSS':
          p = where(`boss:${o.boss}`);
          color = S.bossColor ?? '#ff4b3a';
          break;
        case 'TALK_TO':
          p = where(`npc:${o.npc}`);
          break;
        case 'TUNE_VEHICLE':
          p = where('chopshop');
          break;
      }
      if (p) out.push({ kind: o.type === 'DEFEAT_BOSS' ? 'boss' : 'objective', quest: a.id, x: p.x, z: p.z, label: o.text, color, tracked, person: o.type === 'DEFEAT_BOSS' || o.type === 'TALK_TO' });
    }
    return out;
  }

  /** The tracked quest for the HUD. */
  hud() {
    const id = this.tracked;
    if (!id) return null;
    const q = this.quests.get(id);
    const a = this.activeQuests.get(id);
    if (!q || !a) return null;
    const act = this.act(q.act);
    const o = this.currentObjective(id);
    return {
      quest: id,
      act: act ? `Act ${act.number}: ${act.title}` : '',
      title: q.title,
      objective: a.ready ? `Go back to ${this.npc(q.giver)?.name ?? 'them'}` : o?.text ?? '',
      count: o && (o.count ?? 1) > 1 ? `${a.count}/${o.count}` : '',
      timeLeft: a.timeLeft,
      step: Math.min(q.objectives.length, a.objective + 1),
      steps: q.objectives.length,
      ready: a.ready,
      boss: o?.type === 'DEFEAT_BOSS',
    };
  }

  /** Follow another active quest on the HUD. */
  cycleTracked() {
    const ids = [...this.activeQuests.keys()];
    if (!ids.length) return null;
    const i = this.tracked ? ids.indexOf(this.tracked) : -1;
    this.tracked = ids[(i + 1) % ids.length];
    return this.tracked;
  }

  // ------------------------------------------------------------------ saving

  serialize() {
    return {
      active: [...this.activeQuests.values()].map((a) => ({ id: a.id, objective: a.objective, count: a.count, ready: a.ready })),
      completed: [...this.completedQuests],
      flags: [...this.storyFlags],
      bosses: [...this.bossesBeaten],
      blueprints: [...this.blueprints],
      legendaries: [...this.legendaries],
      acts: [...this.actsCompleted],
      tracked: this.tracked,
      stats: { ...this.stats },
    };
  }

  /** Restores a save (unknown ids are dropped; timed objectives restart their clock). @param {any} d */
  load(d) {
    const o = d && typeof d === 'object' ? d : {};
    const ids = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ID.test(x.replace(/^boss:/, ''))) : []);
    this.completedQuests = new Set(ids(o.completed).filter((id) => this.quests.has(id)));
    this.storyFlags = new Set(Array.isArray(o.flags) ? o.flags.filter((/** @type {unknown} */ f) => typeof f === 'string' && f.length < 60) : []);
    this.bossesBeaten = new Set(ids(o.bosses).filter((b) => !!this.boss(b)));
    this.blueprints = new Set(ids(o.blueprints).filter((b) => !!this.blueprint(b)));
    this.legendaries = new Set(ids(o.legendaries).filter((l) => (this.campaign.legendaries ?? []).some((x) => x.id === l)));
    this.actsCompleted = new Set(ids(o.acts).filter((a) => !!this.act(a)));
    this.activeQuests.clear();
    for (const a of Array.isArray(o.active) ? o.active : []) {
      const q = this.quests.get(a?.id);
      if (!q || this.completedQuests.has(q.id)) continue;
      const idx = Math.max(0, Math.min(q.objectives.length - 1, Math.floor(Number(a.objective) || 0)));
      const ob = q.objectives[idx];
      this.activeQuests.set(q.id, { id: q.id, objective: idx, count: Math.max(0, Math.floor(Number(a.count) || 0)), timeLeft: ob.timeLimitSeconds ?? null, ready: !!a.ready && !!q.turnIn, startedAt: 0, escape: ob.type === 'ESCAPE_WANTED' ? { seen: false } : null });
    }
    this.actsStarted = new Set([...this.completedQuests, ...this.activeQuests.keys()].map((id) => /** @type {QuestDef} */ (this.quests.get(id)).act));
    this.tracked = typeof o.tracked === 'string' && this.activeQuests.has(o.tracked) ? o.tracked : this.activeQuests.keys().next().value ?? null;
    this.offered = new Set([...this.completedQuests, ...this.activeQuests.keys()]);
    if (o.stats && typeof o.stats === 'object') for (const k of /** @type {const} */ (['started', 'completed', 'failed'])) this.stats[k] = Math.max(0, Math.floor(Number(o.stats[k]) || 0));
  }
}
