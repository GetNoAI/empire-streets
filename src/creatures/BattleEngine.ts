import { maxHp, stats as creatureStats, type Creature, displayName } from './Creature';
import { DATA, move as moveSpec, species, typeMultiplier, effectivenessText, type MoveSpec, type StageStat, type TypeId } from './Data';

/**
 * Streetmon battle rules (engine-free, deterministic given the random source, unit-tested).
 *
 * Used two ways:
 *  - turn-based: `runTurn(actions)` resolves everyone's actions in priority/speed order, then the
 *    end-of-turn effects;
 *  - real-time skirmish: `act(action)` performs one action the moment a combatant is ready, and
 *    `endRound()` is called on a timer.
 *
 * Damage: ((2*L/5+2) * Power * Atk/Def) / 50 + 2, x type multiplier (dual types multiply), x1.5
 * same-type bonus, x1.5 critical, x0.85-1.0 random; plus the type mechanics:
 *  - Gun: moves spend Ammo; Reload takes the whole turn; the first shot of the battle and the first
 *    after each Reload hit x2; loud moves give the user away (lose evasion boosts) and make noise.
 *  - Concrete: projectiles do 25% less to Concrete defenders; Broken Glass cuts anything switching in.
 *  - Grind: +1 Attack stage for every turn survived (max 4).
 *  - Smoke: clouds cut the other side's accuracy, evasion moves, choking chip damage.
 *  - Bass: spread moves hit every foe (x0.75 when more than one), flinches, high speed.
 */

export type Rand = () => number;

export interface Stages {
  attack: number;
  defense: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

export interface Combatant {
  uid: number;
  side: 0 | 1;
  creature: Creature;
  stages: Stages;
  /** Turns survived as a Grind type (drives Grind Down and the attack stacking). */
  grind: number;
  /** Next Gun shot gets the First Shot bonus. */
  firstShot: boolean;
  /** Turns of choking left (lose HP each turn). */
  choke: number;
  /** Flinched this turn (skips its action). */
  flinched: boolean;
  /** Has acted this turn (flinch only works if the attacker moved first). */
  acted: boolean;
  /** Raised critical-hit chance (Steady Aim / Long Shot). */
  critUp: boolean;
  /** Participated (for XP sharing later). */
  foughtWith: Set<number>;
  /** Fights on your side but isn't yours (a trainer's Streetmon in a raid): AI-controlled, no XP. */
  ally?: boolean;
}

export interface SideInit {
  name: string;
  members: Creature[];
  /** Index of the creature sent out first (default: first able to fight). */
  lead?: number;
  /** Number of creatures out at once (1 = singles). */
  activeCount?: number;
  ai: boolean;
}

export interface Side {
  index: 0 | 1;
  name: string;
  members: Creature[];
  active: Combatant[];
  ai: boolean;
  /** Turns of Smoke cloud left over this side. */
  cloud: number;
  /** Broken Glass scattered on this side. */
  glass: boolean;
}

export type Action =
  | { type: 'move'; user: Combatant; moveId: string; target?: Combatant }
  | { type: 'switch'; user: Combatant; to: number }
  | { type: 'run'; user: Combatant }
  /** Used by the catching step (item handled outside; this just spends the turn). */
  | { type: 'pass'; user: Combatant; text?: string };

export type BattleEvent =
  | { kind: 'text'; text: string }
  | { kind: 'move'; user: Combatant; move: MoveSpec }
  | { kind: 'damage'; target: Combatant; amount: number; crit: boolean; mult: number; hp: number; maxHp: number }
  | { kind: 'miss'; user: Combatant; target: Combatant }
  | { kind: 'heal'; target: Combatant; amount: number; hp: number }
  | { kind: 'faint'; target: Combatant }
  | { kind: 'stat'; target: Combatant; stat: StageStat; stages: number }
  | { kind: 'switch'; side: 0 | 1; out: Combatant | null; in: Combatant }
  | { kind: 'ammo'; target: Combatant; ammo: number }
  | { kind: 'cloud'; side: 0 | 1; turns: number }
  | { kind: 'glass'; side: 0 | 1; on: boolean }
  | { kind: 'noise'; user: Combatant }
  | { kind: 'ran' }
  | { kind: 'end'; winner: 0 | 1 | null };

export interface MoveOption {
  move: MoveSpec;
  usable: boolean;
  /** Why it's not usable (e.g. not enough ammo). */
  reason?: string;
}

/** Stat stage multiplier for attack/defense/speed (-6..+6). */
export function stageMult(s: number): number {
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

/** Accuracy/evasion stage multiplier. */
export function accStageMult(s: number): number {
  const c = Math.max(-6, Math.min(6, s));
  return c >= 0 ? (3 + c) / 3 : 3 / (3 - c);
}

/** The base formula from the spec: ((2*L/5+2) * Power * Atk/Def) / 50 + 2. */
export function baseDamage(level: number, power: number, atk: number, def: number): number {
  return (((2 * level) / 5 + 2) * power * (atk / def)) / 50 + 2;
}

/** Final damage: base x type x STAB 1.5 x crit 1.5 x random (0.85-1.0) x other modifiers, at least 1 unless immune. */
export function finalDamage(base: number, type: number, stab: boolean, crit: boolean, random: number, other = 1): number {
  if (type === 0) return 0;
  return Math.max(1, Math.floor(base * type * (stab ? 1.5 : 1) * (crit ? 1.5 : 1) * random * other));
}

const STAT_NAMES: Record<StageStat, string> = { attack: 'Attack', defense: 'Defense', speed: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };

export class Battle {
  readonly sides: [Side, Side];
  readonly log: BattleEvent[] = [];
  turn = 0;
  over = false;
  winner: 0 | 1 | null = null;
  ran = false;
  private runAttempts = 0;
  private nextUid = 1;
  /** Foes knocked out, with the player's creatures that fought them (for XP). */
  readonly defeated: Array<{ creature: Creature; by: Creature[] }> = [];

  constructor(
    player: SideInit,
    foe: SideInit,
    private readonly rand: Rand = Math.random,
    readonly opts: {
      wild: boolean;
      canRun: boolean;
      /** Other trainers' Streetmon fighting with you (raids). Out alongside yours, run by the AI. */
      allies?: Creature[];
      /** Actions the foe side takes per turn (a raid legendary acts twice). */
      foeActions?: number;
      /** Damage multiplier for the foe side's moves (raids: tames the extra actions). */
      foeDamage?: number;
    } = { wild: true, canRun: true },
  ) {
    this.sides = [this.makeSide(0, player), this.makeSide(1, foe)];
    for (const a of opts.allies ?? []) {
      if (a.hp <= 0) continue;
      const c = this.makeCombatant(0, a);
      c.ally = true;
      this.sides[0].active.push(c);
    }
    for (const s of this.sides) for (const c of s.active) this.introduce(c);
  }

  private makeSide(index: 0 | 1, init: SideInit): Side {
    const side: Side = { index, name: init.name, members: init.members, active: [], ai: init.ai, cloud: 0, glass: false };
    const n = Math.max(1, init.activeCount ?? 1);
    const order = [...init.members.keys()];
    if (init.lead !== undefined && init.lead >= 0) order.unshift(...order.splice(order.indexOf(init.lead), 1));
    for (const i of order) {
      if (side.active.length >= n) break;
      if (init.members[i].hp > 0) side.active.push(this.makeCombatant(index, init.members[i]));
    }
    return side;
  }

  private makeCombatant(side: 0 | 1, creature: Creature): Combatant {
    return {
      uid: this.nextUid++,
      side,
      creature,
      stages: { attack: 0, defense: 0, speed: 0, accuracy: 0, evasion: 0 },
      grind: 0,
      firstShot: true,
      choke: creature.status === 'choking' ? 3 : 0,
      flinched: false,
      acted: false,
      critUp: false,
      foughtWith: new Set(),
    };
  }

  private introduce(c: Combatant): void {
    for (const f of this.sides[1 - c.side].active) {
      c.foughtWith.add(f.uid);
      f.foughtWith.add(c.uid);
    }
  }

  // ------------------------------------------------------------------ queries

  name(c: Combatant): string {
    return c.side === 1 && this.opts.wild ? `the wild ${displayName(c.creature)}` : displayName(c.creature);
  }

  types(c: Combatant): TypeId[] {
    return species(c.creature.speciesId).types;
  }

  isGun(c: Combatant): boolean {
    return this.types(c).includes('gun');
  }

  stat(c: Combatant, k: 'attack' | 'defense' | 'speed'): number {
    return creatureStats(c.creature)[k] * stageMult(c.stages[k]);
  }

  maxHp(c: Combatant): number {
    return maxHp(c.creature);
  }

  foes(c: Combatant): Combatant[] {
    return this.sides[1 - c.side].active.filter((f) => f.creature.hp > 0);
  }

  /** Moves a combatant can pick, with ammo checks for Gun types. */
  options(c: Combatant): MoveOption[] {
    return c.creature.moves.map((id) => {
      const m = moveSpec(id);
      let usable = true;
      let reason: string | undefined;
      if (this.isGun(c)) {
        if (m.effects?.some((e) => e.type === 'reload') && c.creature.ammo >= (species(c.creature.speciesId).ammo ?? 0)) {
          usable = false;
          reason = 'Already loaded';
        } else if (m.effects?.some((e) => e.type === 'emptyClip') && c.creature.ammo < 2) {
          usable = false;
          reason = 'Needs 2+ rounds';
        } else if ((m.ammo ?? 0) > c.creature.ammo) {
          usable = false;
          reason = 'Out of ammo';
        }
      }
      return { move: m, usable, reason };
    });
  }

  /** Can this side still fight? */
  canFight(side: 0 | 1): boolean {
    return this.sides[side].members.some((m) => m.hp > 0);
  }

  /** Active slots whose creature fainted and has someone to switch in. */
  needsSwitch(side: 0 | 1): Combatant[] {
    const s = this.sides[side];
    const benchAble = s.members.some((m) => m.hp > 0 && !s.active.some((a) => a.creature === m));
    return benchAble ? s.active.filter((a) => a.creature.hp <= 0 && !a.ally) : [];
  }

  // ------------------------------------------------------------------ AI

  chooseAI(c: Combatant): Action {
    const opts = this.options(c).filter((o) => o.usable);
    const foes = this.foes(c);
    if (!opts.length || !foes.length) return { type: 'pass', user: c, text: `${this.name(c)} hesitates.` };
    const hpFrac = c.creature.hp / this.maxHp(c);
    let best: { o: MoveOption; score: number; target: Combatant } | null = null;
    for (const o of opts) {
      const m = o.move;
      for (const t of m.target === 'foe' ? foes : [foes[0]]) {
        let score = 0;
        if (m.power > 0) {
          const targets = m.target === 'allFoes' ? foes : [t];
          for (const tt of targets) score += this.expectedDamage(c, tt, m, targets.length) / Math.max(1, tt.creature.hp);
          score = Math.min(score, 1.2 * targets.length);
          // Chip damage still beats a pointless buff: a hit always counts for something, so two
          // walled-up creatures keep trading blows instead of bracing at each other forever.
          if (score > 0) score = Math.max(score, 0.05);
          if (m.effects?.some((e) => e.type === 'recoil')) score *= 0.85;
        } else {
          const eff = m.effects ?? [];
          if (eff.some((e) => e.type === 'reload')) score = c.creature.ammo === 0 ? 2 : 0.1;
          else if (eff.some((e) => e.type === 'heal')) score = hpFrac < 0.4 ? 1.1 : 0.05;
          else if (eff.some((e) => e.type === 'cloud')) score = this.sides[1 - c.side].cloud > 0 ? 0 : 0.35;
          else if (eff.some((e) => e.type === 'glass')) score = this.sides[1 - c.side].glass ? 0 : 0.3;
          else if (eff.some((e) => e.type === 'choke')) score = t.choke > 0 || this.types(t).includes('smoke') ? 0 : 0.4;
          else {
            // Stat moves: worth it early, not when already boosted.
            const st = eff.find((e) => e.type === 'stat');
            const already = st && st.type === 'stat' ? (st.who === 'self' ? c.stages[st.stat] : -t.stages[st.stat]) : 0;
            // Already at the limit (+6 / -6): the move does nothing, so never pick it.
            const who = st && st.type === 'stat' ? (st.who === 'self' ? c : t) : null;
            const capped = !!(st && st.type === 'stat' && who && (st.stages > 0 ? who.stages[st.stat] >= 6 : who.stages[st.stat] <= -6));
            score = capped ? 0 : this.turn < 2 && already < 2 && hpFrac > 0.6 ? 0.45 : 0.03;
          }
        }
        score *= 0.85 + this.rand() * 0.3;
        if (!best || score > best.score) best = { o, score, target: t };
      }
    }
    return { type: 'move', user: c, moveId: best!.o.move.id, target: best!.target };
  }

  private expectedDamage(user: Combatant, target: Combatant, m: MoveSpec, nTargets: number): number {
    const hits = m.effects?.find((e) => e.type === 'multiHit');
    const n = hits && hits.type === 'multiHit' ? (hits.min + hits.max) / 2 : m.effects?.some((e) => e.type === 'emptyClip') ? Math.max(2, user.creature.ammo) : 1;
    const acc = m.accuracy === null ? 1 : (m.accuracy / 100) * (this.sides[user.side].cloud > 0 ? DATA.mechanics.smoke.cloudAccuracy : 1);
    return this.damageFor(user, target, m, { crit: false, roll: 0.925, spread: nTargets > 1 }) * n * acc;
  }

  // ------------------------------------------------------------------ damage

  /** Damage of one hit (no side effects). */
  damageFor(user: Combatant, target: Combatant, m: MoveSpec, o: { crit: boolean; roll: number; spread: boolean; ricochetBounce?: boolean }): number {
    const userTypes = this.types(user);
    const defTypes = this.types(target);
    let power = m.power;
    const gs = m.effects?.find((e) => e.type === 'grindScaling');
    if (gs && gs.type === 'grindScaling') power += gs.perStage * Math.min(user.grind, DATA.mechanics.grind.maxStages);
    const atkStage = o.crit ? Math.max(0, user.stages.attack) : user.stages.attack;
    const defStage = o.crit ? Math.min(0, target.stages.defense) : target.stages.defense;
    const atk = creatureStats(user.creature).attack * stageMult(atkStage);
    const def = creatureStats(target.creature).defense * stageMult(defStage);
    const base = baseDamage(user.creature.level, power, atk, def);
    const type = typeMultiplier(m.type, defTypes);
    let other = 1;
    const gunShot = userTypes.includes('gun') && m.type === 'gun' && (m.ammo ?? 0) + (m.effects?.some((e) => e.type === 'emptyClip') ? 1 : 0) > 0;
    if (gunShot && user.firstShot) other *= DATA.mechanics.gun.firstShotMultiplier;
    if (m.projectile && defTypes.includes('concrete') && !m.effects?.some((e) => e.type === 'ricochet')) other *= 1 - DATA.mechanics.concrete.projectileBlock;
    if (o.spread) other *= DATA.mechanics.bass.spreadMultiplier;
    if (o.ricochetBounce) other *= 0.5;
    // A raid legendary hits often (it acts more than once a turn) rather than hitting impossibly hard.
    if (user.side === 1 && this.opts.foeDamage) other *= this.opts.foeDamage;
    return finalDamage(base, type, userTypes.includes(m.type), o.crit, o.roll, other);
  }

  // ------------------------------------------------------------------ turns

  /**
   * Turn-based: resolves one full turn. `actions` holds the player's choices; AI sides choose
   * automatically. Switches go first, then moves by priority and speed.
   */
  runTurn(actions: Action[]): BattleEvent[] {
    const out: BattleEvent[] = [];
    if (this.over) return out;
    this.turn++;
    const all = [...actions];
    for (const s of this.sides) {
      for (const c of s.active) {
        if (c.creature.hp <= 0 || (!s.ai && !c.ally) || all.some((a) => a.user === c)) continue;
        all.push(this.chooseAI(c));
        // A raid boss gets more than one go (each picked fresh, so it spreads its attacks).
        if (s.index === 1) for (let k = 1; k < (this.opts.foeActions ?? 1); k++) all.push(this.chooseAI(c));
      }
    }
    for (const s of this.sides) for (const c of s.active) {
      c.flinched = false;
      c.acted = false;
    }
    const prio = (a: Action): number => (a.type === 'switch' || a.type === 'run' || a.type === 'pass' ? 10 : moveSpec(a.moveId).priority ?? 0);
    all.sort((a, b) => prio(b) - prio(a) || this.stat(b.user, 'speed') - this.stat(a.user, 'speed') || this.rand() - 0.5);
    for (const a of all) {
      if (this.over) break;
      if (a.user.creature.hp <= 0 || !this.sides[a.user.side].active.includes(a.user)) continue;
      out.push(...this.perform(a));
    }
    if (!this.over) out.push(...this.endRound());
    this.log.push(...out);
    return out;
  }

  /** Real-time: one combatant acts right now. */
  act(a: Action): BattleEvent[] {
    if (this.over || a.user.creature.hp <= 0) return [];
    a.user.flinched = false;
    const out = this.perform(a);
    this.log.push(...out);
    return out;
  }

  private perform(a: Action): BattleEvent[] {
    const out: BattleEvent[] = [];
    const c = a.user;
    if (c.flinched) {
      out.push({ kind: 'text', text: `${cap(this.name(c))} flinched!` });
      c.acted = true;
      return out;
    }
    c.acted = true;
    switch (a.type) {
      case 'pass':
        if (a.text) out.push({ kind: 'text', text: a.text });
        break;
      case 'run': {
        if (!this.opts.canRun) {
          out.push({ kind: 'text', text: "You can't run from this fight!" });
          break;
        }
        this.runAttempts++;
        const mine = this.stat(c, 'speed');
        const theirs = Math.max(1, ...this.foes(c).map((f) => this.stat(f, 'speed')));
        const chance = Math.min(1, Math.max(0.25, 0.55 + 0.35 * (mine / theirs - 1) + 0.15 * (this.runAttempts - 1)));
        if (this.rand() < chance) {
          this.over = true;
          this.ran = true;
          this.winner = null;
          out.push({ kind: 'text', text: 'Got away safely!' }, { kind: 'ran' }, { kind: 'end', winner: null });
        } else out.push({ kind: 'text', text: "Couldn't get away!" });
        break;
      }
      case 'switch':
        out.push(...this.switchIn(c.side, a.to, c));
        break;
      case 'move':
        out.push(...this.useMove(c, moveSpec(a.moveId), a.target));
        break;
    }
    out.push(...this.checkEnd());
    return out;
  }

  /** Sends a bench creature into a slot (replacing `out`, or the first fainted slot). */
  switchIn(side: 0 | 1, memberIndex: number, out?: Combatant): BattleEvent[] {
    const s = this.sides[side];
    const cr = s.members[memberIndex];
    const ev: BattleEvent[] = [];
    if (!cr || cr.hp <= 0 || s.active.some((a) => a.creature === cr)) return ev;
    const slot = out ? s.active.indexOf(out) : s.active.findIndex((a) => a.creature.hp <= 0 && !a.ally);
    const old = slot >= 0 ? s.active[slot] : null;
    const nc = this.makeCombatant(side, cr);
    if (slot >= 0) s.active[slot] = nc;
    else s.active.push(nc);
    // Carry nothing over; the old creature's ammo stays on the creature itself.
    if (old && old.creature.hp > 0) ev.push({ kind: 'text', text: side === 0 ? `Come back, ${displayName(old.creature)}!` : `${s.name} withdrew ${displayName(old.creature)}.` });
    ev.push({ kind: 'switch', side, out: old, in: nc });
    ev.push({ kind: 'text', text: side === 0 ? `Go, ${displayName(cr)}!` : `${s.name} sent out ${displayName(cr)}!` });
    this.introduce(nc);
    // Broken Glass cuts whoever steps in (Concrete types walk over it).
    if (s.glass && !this.types(nc).includes('concrete')) {
      const dmg = Math.max(1, Math.floor(this.maxHp(nc) * DATA.mechanics.concrete.brokenGlassDamage));
      ev.push(...this.hurt(nc, dmg, 'Broken glass cuts'));
    }
    return ev;
  }

  private hurt(t: Combatant, amount: number, cause?: string): BattleEvent[] {
    const ev: BattleEvent[] = [];
    t.creature.hp = Math.max(0, t.creature.hp - amount);
    if (cause) ev.push({ kind: 'text', text: `${cause} ${this.name(t)}!` });
    ev.push({ kind: 'damage', target: t, amount, crit: false, mult: 1, hp: t.creature.hp, maxHp: this.maxHp(t) });
    if (t.creature.hp <= 0) ev.push(...this.faint(t));
    return ev;
  }

  private faint(t: Combatant): BattleEvent[] {
    const ev: BattleEvent[] = [{ kind: 'faint', target: t }, { kind: 'text', text: `${cap(this.name(t))} fainted!` }];
    t.creature.status = 'none';
    t.choke = 0;
    if (t.side === 1) {
      const by = this.sides[0].active.concat().filter((p) => !p.ally && t.foughtWith.has(p.uid)).map((p) => p.creature);
      this.defeated.push({ creature: t.creature, by });
    }
    return ev;
  }

  private useMove(c: Combatant, m: MoveSpec, chosen?: Combatant): BattleEvent[] {
    const ev: BattleEvent[] = [];
    const gun = this.isGun(c);
    const isReload = m.effects?.some((e) => e.type === 'reload');
    const isEmpty = m.effects?.some((e) => e.type === 'emptyClip');
    // Ammo check (Gun users).
    if (gun && !isReload) {
      const need = isEmpty ? 2 : m.ammo ?? 0;
      if (need > c.creature.ammo) {
        ev.push({ kind: 'text', text: `${cap(this.name(c))} pulls the trigger... click! Out of ammo.` });
        return ev;
      }
    }
    ev.push({ kind: 'text', text: `${cap(this.name(c))} used ${m.name}!` });
    ev.push({ kind: 'move', user: c, move: m });
    // Reload: the whole turn.
    if (isReload) {
      const mag = species(c.creature.speciesId).ammo ?? 0;
      c.creature.ammo = mag;
      c.firstShot = true;
      ev.push({ kind: 'ammo', target: c, ammo: mag }, { kind: 'text', text: `${cap(this.name(c))} reloaded. The next shot will hit twice as hard.` });
      return ev;
    }
    // Spend ammo.
    let rounds = 0;
    if (gun && m.type === 'gun') {
      rounds = isEmpty ? c.creature.ammo : m.ammo ?? 0;
      if (rounds > 0) {
        c.creature.ammo -= rounds;
        ev.push({ kind: 'ammo', target: c, ammo: c.creature.ammo });
      }
    }
    if (m.loud) {
      ev.push({ kind: 'noise', user: c });
      if (c.stages.evasion > 0) {
        c.stages.evasion = 0;
        ev.push({ kind: 'text', text: `The noise gave ${this.name(c)}'s position away!` });
      }
    }
    // Targets.
    const foes = this.foes(c);
    let targets: Combatant[];
    if (m.target === 'self') targets = [c];
    else if (m.target === 'allFoes') targets = foes;
    else targets = chosen && chosen.creature.hp > 0 && foes.includes(chosen) ? [chosen] : foes.slice(0, 1);
    if (!targets.length) {
      ev.push({ kind: 'text', text: 'But there was no target...' });
      return ev;
    }
    const spread = m.target === 'allFoes' && targets.length > 1;
    const ignoresCloud = m.effects?.some((e) => e.type === 'ricochet');
    let anyHit = false;
    for (const t of targets) {
      if (t.creature.hp <= 0) continue;
      // Accuracy.
      if (m.accuracy !== null && t !== c) {
        let acc = (m.accuracy / 100) * accStageMult(c.stages.accuracy - t.stages.evasion);
        if (this.sides[c.side].cloud > 0 && !ignoresCloud) acc *= DATA.mechanics.smoke.cloudAccuracy;
        if (this.rand() >= acc) {
          ev.push({ kind: 'miss', user: c, target: t }, { kind: 'text', text: `${cap(this.name(c))}'s attack missed ${this.name(t)}!` });
          continue;
        }
      }
      anyHit = true;
      if (m.power > 0) ev.push(...this.strike(c, t, m, spread, isEmpty ? Math.max(2, rounds) : undefined));
      ev.push(...this.secondary(c, t, m));
      if (this.over) break;
    }
    if (m.power > 0 && gun && m.type === 'gun' && rounds > 0) c.firstShot = false;
    // Ricochet: bounce into another foe (or the same one) for half damage.
    if (anyHit && m.effects?.some((e) => e.type === 'ricochet')) {
      const others = this.foes(c);
      if (others.length) {
        const t2 = others.length > 1 ? others.find((o) => o !== targets[0]) ?? others[0] : others[0];
        ev.push({ kind: 'text', text: 'The shot ricochets!' });
        ev.push(...this.strike(c, t2, m, false, undefined, true));
      }
    }
    // Bass spread moves blow away a Smoke cloud over the user's side.
    if (m.type === 'bass' && m.target === 'allFoes' && this.sides[c.side].cloud > 0) {
      this.sides[c.side].cloud = 0;
      ev.push({ kind: 'cloud', side: c.side, turns: 0 }, { kind: 'text', text: 'The bass blew the smoke away!' });
    }
    // Recoil.
    const rec = m.effects?.find((e) => e.type === 'recoil');
    if (anyHit && rec && rec.type === 'recoil' && c.creature.hp > 0) {
      ev.push(...this.hurt(c, Math.max(1, Math.floor(this.lastDamage * rec.fraction)), `The recoil hurt`));
    }
    return ev;
  }

  private lastDamage = 0;

  private strike(c: Combatant, t: Combatant, m: MoveSpec, spread: boolean, forcedHits?: number, ricochetBounce = false): BattleEvent[] {
    const ev: BattleEvent[] = [];
    const multi = m.effects?.find((e) => e.type === 'multiHit');
    let hits = 1;
    if (forcedHits) hits = forcedHits;
    else if (multi && multi.type === 'multiHit') hits = multi.min + Math.floor(this.rand() * (multi.max - multi.min + 1));
    let total = 0;
    let n = 0;
    for (let i = 0; i < hits && t.creature.hp > 0; i++) {
      const critChance = c.critUp || m.effects?.some((e) => e.type === 'critUp') ? 0.25 : 1 / 16;
      const crit = this.rand() < critChance;
      const roll = 0.85 + this.rand() * 0.15;
      const dmg = this.damageFor(c, t, m, { crit, roll, spread, ricochetBounce });
      const mult = typeMultiplier(m.type, this.types(t));
      t.creature.hp = Math.max(0, t.creature.hp - dmg);
      total += dmg;
      n++;
      ev.push({ kind: 'damage', target: t, amount: dmg, crit, mult, hp: t.creature.hp, maxHp: this.maxHp(t) });
      if (crit) ev.push({ kind: 'text', text: 'A critical hit!' });
    }
    this.lastDamage = total;
    if (n > 1) ev.push({ kind: 'text', text: `Hit ${n} times!` });
    const eff = effectivenessText(typeMultiplier(m.type, this.types(t)));
    if (eff) ev.push({ kind: 'text', text: eff });
    if (m.projectile && this.types(t).includes('concrete') && !m.effects?.some((e) => e.type === 'ricochet'))
      ev.push({ kind: 'text', text: `${cap(this.name(t))}'s concrete soaked up part of it.` });
    if (t.creature.hp <= 0) ev.push(...this.faint(t));
    else {
      // Flinch: only if the attacker moved first this turn.
      const fl = m.effects?.find((e) => e.type === 'flinch');
      if (fl && fl.type === 'flinch' && !t.acted && this.rand() < fl.chance) t.flinched = true;
    }
    return ev;
  }

  private secondary(c: Combatant, t: Combatant, m: MoveSpec): BattleEvent[] {
    const ev: BattleEvent[] = [];
    for (const e of m.effects ?? []) {
      switch (e.type) {
        case 'stat': {
          const who = e.who === 'self' ? c : t;
          if (who.creature.hp <= 0 || this.rand() >= e.chance) break;
          const before = who.stages[e.stat];
          who.stages[e.stat] = Math.max(-6, Math.min(6, before + e.stages));
          const d = who.stages[e.stat] - before;
          if (d === 0) ev.push({ kind: 'text', text: `${cap(this.name(who))}'s ${STAT_NAMES[e.stat]} won't go any ${e.stages > 0 ? 'higher' : 'lower'}!` });
          else {
            ev.push({ kind: 'stat', target: who, stat: e.stat, stages: d });
            ev.push({ kind: 'text', text: `${cap(this.name(who))}'s ${STAT_NAMES[e.stat]} ${d > 0 ? (d > 1 ? 'rose sharply' : 'rose') : d < -1 ? 'fell harshly' : 'fell'}!` });
          }
          break;
        }
        case 'choke':
          if (t.creature.hp > 0 && t.choke === 0 && !this.types(t).includes('smoke') && this.rand() < e.chance) {
            t.choke = 4;
            t.creature.status = 'choking';
            ev.push({ kind: 'text', text: `${cap(this.name(t))} is choking on the fumes!` });
          } else if (m.power === 0) ev.push({ kind: 'text', text: 'It had no effect.' });
          break;
        case 'cloud': {
          const s = 1 - c.side;
          this.sides[s].cloud = DATA.mechanics.smoke.cloudTurns;
          ev.push({ kind: 'cloud', side: s as 0 | 1, turns: this.sides[s].cloud }, { kind: 'text', text: `Smoke hangs over ${this.sides[s].name}'s side!` });
          break;
        }
        case 'glass': {
          const s = (1 - c.side) as 0 | 1;
          if (this.sides[s].glass) ev.push({ kind: 'text', text: 'There is already glass everywhere.' });
          else {
            this.sides[s].glass = true;
            ev.push({ kind: 'glass', side: s, on: true }, { kind: 'text', text: `Broken glass is scattered around ${this.sides[s].name}'s side!` });
          }
          break;
        }
        case 'heal': {
          const mx = this.maxHp(c);
          const amt = Math.min(mx - c.creature.hp, Math.floor(mx * e.fraction));
          if (amt <= 0) ev.push({ kind: 'text', text: `${cap(this.name(c))} is already at full health.` });
          else {
            c.creature.hp += amt;
            ev.push({ kind: 'heal', target: c, amount: amt, hp: c.creature.hp }, { kind: 'text', text: `${cap(this.name(c))} recovered.` });
          }
          break;
        }
        case 'critUp':
          if (m.power === 0) {
            c.critUp = true;
            ev.push({ kind: 'text', text: `${cap(this.name(c))} is lining up the shot.` });
          }
          break;
        default:
          break;
      }
    }
    return ev;
  }

  /** End of a turn / real-time round: choking, Grind stacking, clouds thinning. */
  endRound(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.over) return ev;
    const G = DATA.mechanics.grind;
    for (const s of this.sides) {
      for (const c of s.active) {
        if (c.creature.hp <= 0) continue;
        if (c.choke > 0) {
          c.choke--;
          const dmg = Math.max(1, Math.floor(this.maxHp(c) * DATA.mechanics.smoke.chokeDamage));
          ev.push(...this.hurt(c, dmg, 'Choking fumes hurt'));
          if (c.choke === 0 && c.creature.hp > 0) {
            c.creature.status = 'none';
            ev.push({ kind: 'text', text: `${cap(this.name(c))} caught its breath.` });
          }
        }
        if (c.creature.hp > 0 && this.types(c).includes('grind') && c.grind < G.maxStages) {
          c.grind++;
          const before = c.stages.attack;
          c.stages.attack = Math.min(6, before + G.attackStagePerSurvivedTurn);
          if (c.stages.attack > before) {
            ev.push({ kind: 'stat', target: c, stat: 'attack', stages: c.stages.attack - before });
            ev.push({ kind: 'text', text: `${cap(this.name(c))} keeps grinding. Attack rose!` });
          }
        }
      }
      if (s.cloud > 0) {
        s.cloud--;
        if (s.cloud === 0) ev.push({ kind: 'cloud', side: s.index, turns: 0 }, { kind: 'text', text: `The smoke over ${s.name}'s side cleared.` });
      }
    }
    ev.push(...this.checkEnd());
    if (ev.length) this.log.push(...ev);
    return ev;
  }

  private checkEnd(): BattleEvent[] {
    if (this.over) return [];
    const a = this.canFight(0);
    const b = this.canFight(1);
    if (a && b) return [];
    this.over = true;
    this.winner = a ? 0 : b ? 1 : null;
    return [{ kind: 'end', winner: this.winner }];
  }

  /** Damage from outside the battle rules (the player shooting a foe in a real-time skirmish). */
  inflict(t: Combatant, amount: number, cause?: string): BattleEvent[] {
    if (this.over || t.creature.hp <= 0) return [];
    const ev = this.hurt(t, Math.max(1, Math.round(amount)), cause);
    ev.push(...this.checkEnd());
    this.log.push(...ev);
    return ev;
  }

  /** AI sides: replace fainted actives with the first creature that can fight. */
  autoSwitch(side: 0 | 1): BattleEvent[] {
    const ev: BattleEvent[] = [];
    const s = this.sides[side];
    for (const dead of this.needsSwitch(side)) {
      const i = s.members.findIndex((m) => m.hp > 0 && !s.active.some((a) => a.creature === m));
      if (i >= 0) ev.push(...this.switchIn(side, i, dead));
    }
    this.log.push(...ev);
    return ev;
  }

  /** Ends the battle from outside (caught, interrupted by police, ...). */
  stop(winner: 0 | 1 | null): void {
    this.over = true;
    this.winner = winner;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
