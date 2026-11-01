import * as THREE from 'three';
import { playCry } from './CreatureCry';
import { audio } from '../audio/Audio';
import { BATTLE } from '../config';
import type { Effects } from '../fx/Effects';
import type { Input } from '../core/Input';
import type { BattleUi, MenuChoice } from '../ui/BattleUi';
import { Battle, type Action, type BattleEvent, type Combatant } from './BattleEngine';
import { move as moveSpec } from './Data';
import type { CreatureInstance, CreatureModels } from './CreatureModels';
import { displayName } from './Creature';
import { species } from './Data';
import type { Party } from './Party';
import type { WildCreature } from './SpawnSystem';
import type { Ped } from '../peds/PedestrianSystem';
import type { Trainer } from './Trainers';
import type { CatchRoll } from './Catching';
import type { CatchVisuals } from './CatchVisuals';
import { item as itemSpec } from './Data';
import { replaceMove, type ProgressEvent } from './Progression';
import type { Creature } from './Creature';
import { cameraOf, chooseArena, spotOf, type Arena } from './Arena';
import type { MoveFx } from '../fx/MoveFx';
import type { MoveFxPlan } from '../fx/moveFxPlan.js';
import type { DamageNumbers } from '../fx/DamageNumbers';
import { typeInfo } from './Data';
import { attackStyleFor } from './models/Motion';

/**
 * Runs a Streetmon battle in the street: places the player's creature opposite the foe, frames
 * the camera, plays the battle events as animations, effects, sounds and messages, and drives
 * either the turn-based menus or the real-time skirmish (move hotkeys, cooldowns, rounds).
 */

export type Outcome = 'win' | 'lose' | 'ran' | 'aborted' | 'caught';

export interface BattleResult {
  outcome: Outcome;
  battle: Battle;
  wild: WildCreature | null;
  trainer: Trainer | null;
  /** A person (passer-by or officer) you set your creature on. */
  ped: Ped | null;
  kind: 'wild' | 'person' | 'trainer' | 'npc' | 'police' | 'raid';
  /** Evolutions earned in this battle (played after it ends). */
  evolutions: Array<{ creature: Creature; to: string }>;
}

export interface BattleDeps {
  scene: THREE.Scene;
  models: CreatureModels;
  effects: Effects;
  ui: BattleUi;
  input: Input;
  groundY(x: number, z: number): number;
  walkable(x: number, z: number): boolean;
  /**
   * Can a creature stand here: the right floor for the layer, not in a building, on a car or a
   * prop (the arena is laid out so every mark, the line between and the camera are clear).
   */
  clear?(x: number, z: number): boolean;
  /**
   * A fight on water (the pond, a sewer pool, off the docks): how high each creature rides above
   * the surface the ground function returns (swimmers low in it, flyers hovering, everyone else
   * on a life raft), and whether it gets a raft.
   */
  water?: { active(): boolean; lift(c: Creature, t: number): number; raft(c: Creature): boolean };
  /** A loud move went off (Gun shots): the world hears it. */
  onNoise(x: number, z: number, radius: number, side: 0 | 1, user: Creature): void;
  onEnd(r: BattleResult): void;
  catcher: CatchVisuals;
  /** Capture items the player has, with the chance against this target. */
  bagItems(target: Combatant): Array<{ id: string; name: string; count: number; chance: number }>;
  /** Uses one capture item on the target and rolls the catch (null if you have none). */
  useCapture(itemId: string, target: Combatant): CatchRoll | null;
  /** Where throws come from (the player's hand). */
  throwOrigin(): THREE.Vector3;
  /** Real-time: the capture item thrown with C. */
  quickCapture(): string | null;
  /** The chance (0..1) that item has against a foe right now, for the hint; null without one. */
  quickCaptureOdds?(c: Combatant): number | null;
  /** A person you fought was knocked down. */
  onPersonDown?(ped: Ped): void;
  /** XP, level-ups and new moves after a win or a catch. */
  award(battle: Battle, outcome: Outcome): ProgressEvent[];
  /** Move effects and sounds (MoveFx); without it, battles fall back to plain sparks. */
  moveFx?: MoveFx;
  /** Floating damage numbers. */
  dmgNums?: DamageNumbers;
}

interface View {
  inst: CreatureInstance | null;
  x: number;
  z: number;
  heading: number;
  /** For wild creatures the instance belongs to the spawn system. */
  wild: WildCreature | null;
  /** A person fighting: their body is the pedestrian in the street. */
  ped: Ped | null;
  idleAt: number;
  removeAt: number;
  /** A melee lunge in progress: out towards the target and back. */
  lunge?: { t: number; dur: number; dist: number; dx: number; dz: number; spin: boolean } | null;
  /** Water fights: the creature it shows, and its life raft (if it can't swim or fly). */
  creature?: Creature;
  raft?: THREE.Object3D | null;
}

const DUR = { text: 1.05, move: 0.45, damage: 0.4, faint: 1.1, switch: 0.7 };

export class BattleController {
  battle: Battle | null = null;
  mode: 'turn' | 'realtime' = BATTLE.mode;
  private wild: WildCreature | null = null;
  private trainer: Trainer | null = null;
  private ped: Ped | null = null;
  private readonly views = new Map<Combatant, View>();
  private queue: BattleEvent[] = [];
  private wait = 0;
  private time = 0;
  private result: Outcome | null = null;
  /** Arena geometry: where the player stands and which way the fight faces. */
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  /** The chosen layout (see Arena.ts). */
  arena: Arena | null = null;
  // Real-time state.
  private readonly cd = new Map<Combatant, number>();
  private roundTimer = 0;
  private queued: string | null = null;
  private idleMine = 0;
  /** Real-time: the number keys command your Streetmon (true) or pick weapons (false); T toggles (Game). */
  commandKeys = true;
  private catching = false;
  /** After the fight: XP, level-ups, move prompts. */
  private post: ProgressEvent[] | null = null;
  private evolutions: Array<{ creature: Creature; to: string }> = [];
  private prompting = false;
  /** The move being played (its impacts land with the damage that follows). */
  private playing: { user: Combatant; plan: MoveFxPlan } | null = null;

  constructor(private readonly d: BattleDeps) {}

  get active(): boolean {
    return this.battle !== null;
  }

  /** Locks the player in place (turn-based) or leaves them free (real-time). */
  get locksPlayer(): boolean {
    return this.active && (this.mode === 'turn' || this.post !== null);
  }

  // ------------------------------------------------------------------ start / end

  /** A gang trainer's battle: their whole team, no running, no catching. */
  startTrainer(party: Party, t: Trainer, team: Creature[], playerPos: THREE.Vector3): void {
    this.setPlayer(playerPos);
    this.startTeam(party, { kind: 'trainer', name: t.spec.name, intro: `${t.spec.name} of ${t.spec.gang}: "${t.spec.intro}"`, team, foePos: new THREE.Vector3(t.x, 0, t.z), canRun: false, trainer: t });
  }

  /**
   * A battle against someone's team (gang trainer, a random person who challenges you, or the
   * police during an arrest). Their creatures can't be caught.
   */
  startTeam(
    party: Party,
    o: { kind: 'trainer' | 'npc' | 'police'; name: string; intro: string; team: Creature[]; foePos: THREE.Vector3; canRun: boolean; trainer?: Trainer; ped?: Ped },
  ): void {
    this.wild = null;
    this.ped = o.ped ?? null;
    this.trainer = o.trainer ?? null;
    this.kind = o.kind;
    this.battle = new Battle({ name: 'your', members: party.members, ai: false }, { name: o.name, members: o.team, ai: true }, Math.random, { wild: false, canRun: o.canRun });
    this.layout(this.playerAt, o.foePos);
    const foe = this.battle.sides[1].active[0];
    const mine = this.battle.sides[0].active[0];
    this.queue = [
      { kind: 'text', text: o.intro },
      { kind: 'switch', side: 1, out: null, in: foe },
      { kind: 'text', text: `${o.name} sent out ${displayName(foe.creature)}!` },
      { kind: 'switch', side: 0, out: null, in: mine },
      { kind: 'text', text: `Go, ${displayName(mine.creature)}!` },
    ];
    this.begin();
  }

  /** Where the player stands when a battle starts (set by the game before starting). */
  setPlayer(p: THREE.Vector3): void {
    this.playerAt.copy(p);
  }

  /** Who the battle is against (wild, a person, a gang trainer, a random challenger, the police). */
  kind: 'wild' | 'person' | 'trainer' | 'npc' | 'police' | 'raid' = 'wild';
  private playerAt = new THREE.Vector3();


  /** Your creature against a person in the street (a passer-by who fights back, or a police officer). */
  startVsPerson(party: Party, ped: Ped, person: Creature, playerPos: THREE.Vector3): void {
    this.kind = 'person';
    this.wild = null;
    this.trainer = null;
    this.ped = ped;
    this.battle = new Battle({ name: 'your', members: party.members, ai: false }, { name: species(person.speciesId).name, members: [person], ai: true }, Math.random, { wild: false, canRun: true });
    this.layout(playerPos, new THREE.Vector3(ped.x, 0, ped.z));
    const foe = this.battle.sides[1].active[0];
    const fp = this.spot(1, 0);
    ped.x = fp.x;
    ped.z = fp.z;
    ped.heading = Math.atan2(-(-this.dir.z), -this.dir.x);
    this.views.set(foe, { inst: null, x: fp.x, z: fp.z, heading: ped.heading, wild: null, ped, idleAt: 0, removeAt: 0 });
    const mine = this.battle.sides[0].active[0];
    this.queue = [
      { kind: 'text', text: person.speciesId === 'civilian' || person.speciesId === 'tough' ? 'They square up to fight back!' : `"Call off your animal, NOW!"` },
      { kind: 'switch', side: 0, out: null, in: mine },
      { kind: 'text', text: `Go, ${displayName(mine.creature)}!` },
    ];
    this.begin();
  }

  startWild(party: Party, wild: WildCreature, playerPos: THREE.Vector3): void {
    this.kind = 'wild';
    this.wild = wild;
    this.trainer = null;
    this.ped = null;
    this.battle = new Battle(
      { name: 'your', members: party.members, ai: this.mode === 'realtime' ? false : false },
      { name: 'the wild', members: [wild.creature], ai: true },
      Math.random,
      { wild: true, canRun: true },
    );
    this.layout(playerPos, new THREE.Vector3(wild.x, wild.y, wild.z));
    // Bring the wild creature to its mark facing us.
    const foe = this.battle.sides[1].active[0];
    if (!foe) {
      // Nothing able to fight (a creature at 0 HP): no battle.
      this.battle = null;
      this.wild = null;
      return;
    }
    const fp = this.spot(1, 0);
    wild.x = fp.x;
    wild.z = fp.z;
    wild.heading = Math.atan2(-this.dir.x, -this.dir.z);
    this.views.set(foe, { inst: wild.inst, x: fp.x, z: fp.z, heading: wild.heading, wild, ped: null, idleAt: 0, removeAt: 0 });
    playCry(wild.spec.id, 4);
    this.queue = [{ kind: 'text', text: `A wild ${displayName(wild.creature)} (Lv ${wild.creature.level}) wants to fight!` }];
    const mine = this.battle.sides[0].active[0];
    this.queue.push({ kind: 'switch', side: 0, out: null, in: mine }, { kind: 'text', text: `Go, ${displayName(mine.creature)}!` });
    this.begin();
  }

  /**
   * A legendary raid: your team (one out at a time, as usual) plus the trainers' Streetmon who came
   * to help, out alongside yours and run by the AI, against the legendary, which acts `foeActions`
   * times a turn. Laid out with room for everyone on your side. The legendary can't be caught in
   * the fight: beat it and it's left subdued in the street for a moment (RaidWorld).
   */
  startRaid(party: Party, boss: WildCreature, allies: Creature[], playerPos: THREE.Vector3, o: { foeActions: number; foeDamage?: number; intro: string; camZoom?: number; camMaxHeight?: number }): void {
    this.kind = 'raid';
    this.camZoom = o.camZoom ?? 1.8;
    this.camMaxH = o.camMaxHeight ?? Infinity;
    this.wild = boss;
    this.trainer = null;
    this.ped = null;
    this.battle = new Battle({ name: 'your', members: party.members, ai: false }, { name: boss.spec.name, members: [boss.creature], ai: true }, Math.random, {
      wild: false,
      canRun: true,
      allies,
      foeActions: o.foeActions,
      foeDamage: o.foeDamage,
    });
    const mineOut = this.battle.sides[0].active.length;
    this.layout(playerPos, new THREE.Vector3(boss.x, boss.y, boss.z), [mineOut, 1]);
    const foe = this.battle.sides[1].active[0];
    const fp = this.spot(1, 0);
    boss.x = fp.x;
    boss.z = fp.z;
    boss.heading = Math.atan2(-this.dir.x, -this.dir.z);
    this.views.set(foe, { inst: boss.inst, x: fp.x, z: fp.z, heading: boss.heading, wild: boss, ped: null, idleAt: 0, removeAt: 0 });
    playCry(boss.spec.id, 4);
    this.queue = [{ kind: 'text', text: o.intro }];
    const mine = this.battle.sides[0].active.find((a) => !a.ally)!;
    this.queue.push({ kind: 'switch', side: 0, out: null, in: mine }, { kind: 'text', text: `Go, ${displayName(mine.creature)}!` });
    for (const a of this.battle.sides[0].active) if (a.ally) this.queue.push({ kind: 'switch', side: 0, out: null, in: a });
    if (allies.length) this.queue.push({ kind: 'text', text: allies.length === 1 ? `${displayName(allies[0])} fights alongside you!` : `${allies.length} trainers' Streetmon fight alongside you!` });
    this.begin();
  }

  private begin(): void {
    const b = this.battle!;
    this.result = null;
    this.post = null;
    this.prompting = false;
    this.evolutions = [];
    this.wait = 0;
    this.time = 0;
    this.cd.clear();
    this.roundTimer = BATTLE.realtimeRound;
    this.queued = null;
    this.idleMine = 0;
    for (const s of b.sides) for (const c of s.active) this.cd.set(c, 0.6 + Math.random() * 0.8);
    this.d.ui.show(b, this.mode === 'realtime');
    // Shown HP for my creature starts at its real value.
    for (const c of b.sides[0].active) this.d.ui.shownHp.set(c, c.creature.hp);
  }

  /** Police, death, arrest: the battle stops where it is. */
  abort(): void {
    if (!this.battle) return;
    this.result = 'aborted';
    this.battle.stop(null);
    this.finish();
  }

  private outcome(): Outcome {
    const b = this.battle!;
    return this.result ?? (b.ran ? 'ran' : b.winner === 0 ? 'win' : b.winner === 1 ? 'lose' : 'aborted');
  }

  /** Plays the after-battle XP/level/move sequence. Returns true while it's still running. */
  private runPost(): boolean {
    const b = this.battle!;
    const outcome = this.outcome();
    if (this.post === null) {
      if (outcome !== 'win' && outcome !== 'caught') return false;
      this.post = this.d.award(b, outcome);
      if (this.mode === 'realtime') this.d.ui.setRealtime(false);
    }
    if (this.prompting) return true;
    const e = this.post.shift();
    if (!e) return false;
    const name = displayName(e.creature);
    switch (e.kind) {
      case 'xp':
        this.queue.push({ kind: 'text', text: `${name} gained ${e.amount} XP!` });
        break;
      case 'teamXp':
        this.queue.push({ kind: 'text', text: e.count === 1 ? `${name} picked up ${e.amount} XP from the sidelines.` : `The rest of the team picked up ${e.amount} XP between them.` });
        break;
      case 'level':
        this.queue.push({ kind: 'text', text: `${name} grew to Lv ${e.level}!` });
        this.d.ui.render();
        break;
      case 'learned':
        this.queue.push({ kind: 'text', text: `${name} learned ${moveSpecName(e.moveId)}!` });
        break;
      case 'learnPrompt':
        this.prompting = true;
        if (document.pointerLockElement) document.exitPointerLock();
        this.d.ui.askLearn(e.creature, e.moveId, (slot) => {
          this.prompting = false;
          if (slot < 0) this.queue.push({ kind: 'text', text: `${name} did not learn ${moveSpecName(e.moveId)}.` });
          else {
            const old = replaceMove(e.creature, slot, e.moveId);
            this.queue.push({ kind: 'text', text: old ? `1, 2, and... Poof! ${name} forgot ${moveSpecName(old)} and learned ${moveSpecName(e.moveId)}!` : `${name} did not learn ${moveSpecName(e.moveId)}.` });
          }
        });
        break;
      case 'evolve':
        if (!this.evolutions.some((x) => x.creature === e.creature)) this.evolutions.push({ creature: e.creature, to: e.to });
        break;
    }
    return true;
  }

  private finish(): void {
    const b = this.battle!;
    const outcome = this.outcome();
    for (const [, v] of this.views) if (!v.wild) v.inst?.dispose();
    this.dropRafts();
    this.views.clear();
    this.d.ui.hide();
    const r: BattleResult = { outcome, battle: b, wild: this.wild, trainer: this.trainer, ped: this.ped, kind: this.kind, evolutions: this.evolutions };
    this.trainer = null;
    this.ped = null;
    this.evolutions = [];
    this.post = null;
    this.prompting = false;
    this.battle = null;
    this.wild = null;
    this.queue = [];
    this.camZoom = 1;
    this.camMaxH = Infinity;
    this.d.onEnd(r);
  }

  // ------------------------------------------------------------------ arena

  /**
   * Lays the fight out where nothing is in the way: the line towards the foe if it's clear,
   * otherwise turned, tightened or shifted until the marks, the gap between them and the camera are
   * (Arena.ts). `slots` = creatures out per side.
   */
  private layout(player: THREE.Vector3, foe: THREE.Vector3, slots: [number, number] = [1, 1]): void {
    const clear = this.d.clear ?? ((x: number, z: number) => this.d.walkable(x, z));
    const a = chooseArena({ player: { x: player.x, z: player.z }, foe: { x: foe.x, z: foe.z }, clear, slots });
    this.arena = a;
    this.origin.set(a.origin.x, player.y, a.origin.z);
    this.dir.set(a.dir.x, 0, a.dir.z);
    this.right.set(a.right.x, 0, a.right.z);
  }

  /** Arena spot for a side/slot. */
  private spot(side: 0 | 1, slot: number): THREE.Vector3 {
    const p = spotOf(this.arena!, side, slot);
    return new THREE.Vector3(p.x, 0, p.z);
  }

  /** Where the fight is (the middle of the field), for effects and the camera. */
  centre(out: THREE.Vector3): THREE.Vector3 {
    const c = this.arena ? cameraOf(this.arena).look : { x: this.origin.x, z: this.origin.z };
    return out.set(c.x, this.d.groundY(c.x, c.z), c.z);
  }

  /** Turn-based camera: side-on view of both creatures. */
  cameraPose(pos: THREE.Vector3, look: THREE.Vector3): void {
    const c = this.arena ? cameraOf(this.arena) : { pos: { x: this.origin.x, z: this.origin.z }, look: { x: this.origin.x, z: this.origin.z } };
    // A raid legendary is three or four times the size of a Streetmon: the camera pulls back and up
    // to get it all in, as far as the street allows (never into a wall).
    let zoom = this.camZoom;
    const clear = this.d.clear ?? ((x: number, z: number) => this.d.walkable(x, z));
    while (zoom > 1 && !clear(c.look.x + (c.pos.x - c.look.x) * zoom, c.look.z + (c.pos.z - c.look.z) * zoom)) zoom -= 0.1;
    zoom = Math.max(1, zoom);
    pos.set(c.look.x + (c.pos.x - c.look.x) * zoom, 0, c.look.z + (c.pos.z - c.look.z) * zoom);
    // High enough to see over parked cars.
    const gy = this.d.groundY(this.origin.x, this.origin.z);
    pos.y = gy + Math.min(3.1 * zoom, this.camMaxH);
    look.set(c.look.x, gy + 0.5 + (zoom - 1) * 1.4, c.look.z);
  }

  /** Camera distance multiplier (raids: big foe). */
  private camZoom = 1;
  /** Camera height cap above the floor (tunnels). */
  private camMaxH = Infinity;

  // ------------------------------------------------------------------ per frame

  /** Things to do a moment from now (a move's effects at its attack clip's release frame). */
  private readonly timers: Array<{ at: number; fn: () => void }> = [];

  private later(delay: number, fn: () => void): void {
    if (delay <= 0) fn();
    else this.timers.push({ at: this.time + delay, fn });
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const b = this.battle;
    if (!b) {
      this.timers.length = 0;
      return;
    }
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time < this.timers[i].at) continue;
      const tm = this.timers.splice(i, 1)[0];
      tm.fn();
    }
    this.animateViews(dt);
    if (this.catching) return;
    if (this.mode === 'realtime') this.updateRealtime(dt, playerPos);
    // Event playback.
    this.wait -= dt * (this.mode === 'turn' && this.d.input.isDown('Space') ? 3 : 1);
    while (this.wait <= 0 && this.queue.length) this.wait += this.play(this.queue.shift()!);
    this.tweenHp(dt);
    if (this.wait > 0 || this.queue.length) return;
    if (b.over) {
      if (this.runPost()) return;
      this.finish();
      return;
    }
    if (this.mode === 'turn') this.nextTurnStep();
  }

  private nextTurnStep(): void {
    const b = this.battle!;
    if (this.d.ui.awaiting) return;
    // Fainted creatures get replaced first.
    if (b.needsSwitch(1).length) {
      this.queue.push(...b.autoSwitch(1));
      return;
    }
    const mustSwitch = b.needsSwitch(0)[0];
    if (mustSwitch) {
      this.d.ui.ask(mustSwitch, true, (ch) => {
        if (ch.kind === 'switch') this.queue.push(...b.switchIn(0, ch.index, mustSwitch));
      });
      return;
    }
    const me = b.sides[0].active.find((a) => a.creature.hp > 0 && !a.ally);
    if (!me) return;
    this.d.ui.ask(me, false, (ch) => this.onChoice(me, ch));
  }

  private onChoice(me: Combatant, ch: MenuChoice): void {
    const b = this.battle!;
    let action: Action | null = null;
    if (ch.kind === 'move') action = { type: 'move', user: me, moveId: ch.moveId, target: b.foes(me)[0] };
    else if (ch.kind === 'switch') action = { type: 'switch', user: me, to: ch.index };
    else if (ch.kind === 'run') action = { type: 'run', user: me };
    else if (ch.kind === 'bag') {
      const target = b.foes(me)[0];
      this.d.ui.askBag(me, target ? this.d.bagItems(target) : [], (c2) => this.onChoice(me, c2));
      return;
    } else if (ch.kind === 'item') {
      this.throwCapture(me, ch.itemId);
      return;
    }
    if (!action) return;
    this.queue.push(...b.runTurn([action]));
  }

  /** Throws a capture item at the (first) foe; in turn mode a failed throw costs the turn. */
  private throwCapture(me: Combatant, itemId: string): void {
    const b = this.battle!;
    if (!b.opts.wild) {
      this.d.ui.message(this.kind === 'raid' ? "It's far too strong to catch like this. Beat it first!" : "You can't catch someone else's Streetmon!");
      return;
    }
    const target = b.foes(me)[0];
    if (!target || this.catching) return;
    const roll = this.d.useCapture(itemId, target);
    if (!roll) {
      this.d.ui.message('You don\'t have any of those.');
      this.wait = 1;
      return;
    }
    const v = this.views.get(target);
    if (!v) return;
    this.catching = true;
    const name = itemSpec(itemId).name;
    this.d.ui.message(`You threw ${name.endsWith('s') ? 'a pair of' : /^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}!`);
    const pos = new THREE.Vector3(v.x, this.d.groundY(v.x, v.z), v.z);
    const h = species(target.creature.speciesId).model.height;
    this.d.catcher.play(
      itemId,
      this.d.throwOrigin(),
      { pos, height: h, root: v.inst?.root ?? null },
      pos.y,
      roll,
      (caught) => {
        this.catching = false;
        if (caught) {
          this.queue.push({ kind: 'text', text: `Gotcha! ${displayName(target.creature)} was caught!` });
          this.result = 'caught';
          b.stop(0);
        } else {
          this.queue.push({ kind: 'text', text: roll.shakes === 0 ? 'Oh no! It broke free straight away!' : roll.shakes === 1 ? 'Argh! Almost had it!' : 'Aargh! So close!' });
          if (roll.note) this.queue.push({ kind: 'text', text: roll.note });
          if (this.mode === 'turn') this.queue.push(...b.runTurn([{ type: 'pass', user: me }]));
        }
      },
      (n) => this.d.ui.message(`${'Shake... '.repeat(n).trim()}`),
    );
  }

  /** Real-time skirmish: foe creatures the player can shoot or hit (positions in the world). */
  foeTargets(): Array<{ c: Combatant; x: number; y: number; z: number; height: number }> {
    const b = this.battle;
    if (!b || b.over || this.mode !== 'realtime' || this.post !== null) return [];
    const out: Array<{ c: Combatant; x: number; y: number; z: number; height: number }> = [];
    for (const c of b.sides[1].active) {
      const v = this.views.get(c);
      if (!v || c.creature.hp <= 0 || v.ped) continue;
      out.push({ c, x: v.x, y: this.d.groundY(v.x, v.z), z: v.z, height: species(c.creature.speciesId).model.height * (v.wild?.sizeScale ?? 1) });
    }
    return out;
  }

  /** Every creature on the battlefield (for the hover health bar). */
  allViews(): Array<{ c: Combatant; x: number; y: number; z: number; height: number }> {
    const b = this.battle;
    if (!b) return [];
    const out: Array<{ c: Combatant; x: number; y: number; z: number; height: number }> = [];
    for (const [c, v] of this.views) if (!v.ped && c.creature.hp > 0) out.push({ c, x: v.x, y: this.d.groundY(v.x, v.z), z: v.z, height: species(c.creature.speciesId).model.height * (v.wild?.sizeScale ?? 1) });
    return out;
  }

  /** The player hurt a foe creature with a weapon (real-time skirmish). */
  playerAttack(c: Combatant, damage: number): void {
    const b = this.battle;
    if (!b || b.over || c.side !== 1) return;
    const v = this.views.get(c);
    if (v?.inst && c.creature.hp > damage) {
      v.inst.play('hurt', 0.05);
      v.idleAt = this.time + 0.45;
    }
    this.queue.push(...b.inflict(c, damage));
  }

  /** Keyboard for the menus. Returns true if consumed. */
  key(code: string): boolean {
    if (!this.battle) return false;
    if (this.mode === 'turn' || this.post !== null) return this.d.ui.key(code);
    return false;
  }

  // ------------------------------------------------------------------ real-time

  private cooldownFor(c: Combatant): number {
    const sp = this.battle!.stat(c, 'speed');
    const [lo, hi] = BATTLE.realtimeCooldown;
    return Math.max(lo, Math.min(hi, hi - (sp / 140) * (hi - lo)));
  }

  private updateRealtime(dt: number, playerPos: THREE.Vector3): void {
    const b = this.battle!;
    if (b.over) return;
    const inp = this.d.input;
    const me = b.sides[0].active.find((a) => a.creature.hp > 0 && !a.ally) ?? null;
    // Hotkeys: 1-4 queue a move, 5 swaps to the next creature, X tries to flee. The number keys
    // only command your Streetmon while `commandKeys` is on (T switches them to your weapons).
    if (me) {
      const opts = b.options(me);
      if (this.commandKeys) for (let i = 0; i < 4; i++) if (inp.wasPressed(`Digit${i + 1}`) && opts[i]) this.queued = opts[i].usable ? opts[i].move.id : this.queued;
      if (this.commandKeys && inp.wasPressed('Digit5')) {
        const idx = b.sides[0].members.findIndex((m) => m.hp > 0 && !b.sides[0].active.some((a) => a.creature === m));
        if (idx >= 0) this.queue.push(...b.act({ type: 'switch', user: me, to: idx }));
      }
      if (inp.wasPressed('KeyX')) this.queue.push(...b.act({ type: 'run', user: me }));
      if (inp.wasPressed('KeyC') && !b.opts.wild) this.d.ui.message(this.kind === 'raid' ? "It's far too strong to catch like this. Beat it first!" : "You can't catch someone else's Streetmon!");
      else if (inp.wasPressed('KeyC')) {
        const it = this.d.quickCapture();
        if (it) {
          this.throwCapture(me, it);
          return;
        }
        this.d.ui.message('No capture items. Buy some at a Corner Clinic.');
      }
    }
    // Walking away ends it.
    const mid = this.origin.clone().addScaledVector(this.dir, 4);
    if (Math.hypot(playerPos.x - mid.x, playerPos.z - mid.z) > 28) {
      this.queue.push({ kind: 'text', text: 'You walked away from the fight.' });
      b.stop(null);
      this.result = 'ran';
      return;
    }
    // Replace fainted creatures automatically.
    if (b.needsSwitch(1).length) this.queue.push(...b.autoSwitch(1));
    const dead = b.needsSwitch(0)[0];
    if (dead) {
      const idx = b.sides[0].members.findIndex((m) => m.hp > 0 && !b.sides[0].active.some((a) => a.creature === m));
      if (idx >= 0) this.queue.push(...b.switchIn(0, idx, dead));
    }
    // Cooldowns. They wait while the last moves are still playing out, so the fight on screen never
    // falls behind the HP bars (and nobody acts twice before you've seen the first hit land).
    const backlog = this.queue.length > 4;
    for (const s of b.sides)
      for (const c of s.active) {
        if (c.creature.hp <= 0) continue;
        if (!this.cd.has(c)) this.cd.set(c, this.cooldownFor(c) * 0.6);
        const left = this.cd.get(c)! - (backlog ? 0 : dt);
        this.cd.set(c, left);
        if (left > 0) continue;
        let action: Action | null = null;
        // The foe and the trainers' Streetmon fighting with you (raids) choose for themselves.
        if (s.index === 1 || c.ally) action = b.chooseAI(c);
        else {
          const ok = this.queued && b.options(c).find((o) => o.move.id === this.queued)?.usable;
          if (ok) action = { type: 'move', user: c, moveId: this.queued!, target: b.foes(c)[0] };
          else {
            this.idleMine += dt;
            // Nothing picked for a while: it acts on its own instincts.
            if (this.idleMine > BATTLE.realtimeIdle) action = b.chooseAI(c);
          }
        }
        if (!action) continue;
        if (s.index === 0 && !c.ally) {
          this.idleMine = 0;
          if (action.type === 'move' && !b.options(c).find((o) => o.move.id === this.queued)?.usable) this.queued = null;
        }
        this.queue.push(...b.act(action));
        // A raid legendary acts `foeActions` times as often.
        const often = s.index === 1 ? Math.max(1, b.opts.foeActions ?? 1) : 1;
        this.cd.set(c, (this.cooldownFor(c) * (action.type === 'move' && species(c.creature.speciesId).types.includes('bass') ? 0.9 : 1)) / often);
      }
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.roundTimer = BATTLE.realtimeRound;
      this.queue.push(...b.endRound());
    }
    const total = me ? this.cooldownFor(me) : 1;
    const foe = b.opts.wild ? b.sides[1].active[0] : undefined;
    const odds = foe && foe.creature.hp > 0 ? (this.d.quickCaptureOdds?.(foe) ?? null) : null;
    this.d.ui.renderRealtime(me, me ? 1 - Math.max(0, this.cd.get(me) ?? 0) / total : 0, this.queued, this.commandKeys, odds);
  }

  // ------------------------------------------------------------------ playback

  /** Plays one event; returns how long to wait before the next. */
  private play(e: BattleEvent): number {
    const rt = this.mode === 'realtime';
    const k = rt ? BATTLE.realtimePlayback : 1;
    switch (e.kind) {
      case 'text':
        // A raid legendary isn't knocked out, it's subdued (and then it's catchable in the street).
        this.d.ui.message(this.kind === 'raid' && this.wild && e.text === `${this.wild.spec.name} fainted!` ? `${this.wild.spec.name} is subdued! Quick, get a capture item ready!` : e.text);
        return rt ? 0.22 : DUR.text;
      case 'switch': {
        if (e.out) this.removeView(e.out, 0);
        this.addView(e.in);
        const nv = this.views.get(e.in);
        if (nv && this.d.moveFx) this.d.moveFx.ring(new THREE.Vector3(nv.x, 0, nv.z), 1.8, typeInfo(species(e.in.creature.speciesId).types[0]).color, 0.45, 0.9);
        this.d.ui.shownHp.set(e.in, e.in.creature.hp);
        this.d.ui.render();
        playCry(e.in.creature.speciesId, 6);
        return DUR.switch * k;
      }
      case 'move': {
        const v = this.views.get(e.user);
        const fx = this.d.moveFx;
        const plan = fx ? fx.plan(e.move) : null;
        // The attack clip for the move's style (a swipe, a slam, a shot, a throw, a blast, a
        // power-up, a taunt); the move leaves the Streetmon at the clip's release frame.
        let release = 0;
        if (v?.inst) {
          const a = v.inst.attack(attackStyleFor(plan?.style ?? (e.move.power > 0 ? (e.move.projectile ? 'shot' : 'dash') : 'buff'), plan?.melee ?? false), 1 / k);
          release = a.release;
          v.idleAt = this.time + a.duration;
        }
        const foes = this.battle!.foes(e.user);
        const from = v ? this.chest(v, e.user, 0.6) : null;
        const targetsOf = (list: Combatant[]): THREE.Vector3[] => list.map((t) => this.views.get(t)).filter((tv): tv is View => !!tv).map((tv) => this.chest(tv, null, 0.5));
        if (fx && plan && from) {
          this.playing = { user: e.user, plan };
          const targets = plan.self ? [from] : targetsOf(plan.aoe ? foes : foes.slice(0, 1));
          const tv = foes[0] ? this.views.get(foes[0]) : null;
          this.later(release, () => {
            fx.cast(plan, from, targets.length ? targets : [from]);
            // Melee: the creature lunges at its target and springs back (along the clear line between them).
            if (plan.melee && v && tv) {
              const dx = tv.x - v.x;
              const dz = tv.z - v.z;
              const dd = Math.hypot(dx, dz) || 1;
              v.lunge = { t: 0, dur: Math.max(0.35, plan.travel * 2.2), dist: Math.min(plan.lunge, Math.max(0, dd - 1.4)), dx: dx / dd, dz: dz / dd, spin: plan.spin };
            }
          });
          return Math.max(DUR.move * k, release + (plan.travel + 0.12) * k);
        }
        // (No effects module: the old plain look.)
        const target = foes[0] ?? null;
        const tv = target ? this.views.get(target) : null;
        const to = tv ? new THREE.Vector3(tv.x, this.d.groundY(tv.x, tv.z) + 0.5, tv.z) : null;
        if (from && to && e.move.power > 0 && e.move.type === 'gun' && e.move.projectile) {
          this.d.effects.muzzle(from.x, from.y, from.z, 0.7);
          this.d.effects.tracer(from.x, from.y, from.z, to.x, to.y, to.z);
          audio.gunshot('pistol', 8);
        }
        if (e.move.effects?.some((x) => x.type === 'reload')) audio.reload();
        return DUR.move * k;
      }
      case 'damage': {
        const v = this.views.get(e.target);
        if (v?.inst && e.hp > 0) {
          v.inst.play('hurt', 0.05);
          v.idleAt = this.time + 0.45;
        }
        if (v) {
          const at = this.chest(v, e.target, 0.5);
          const pl = this.playing;
          // The move's own impact when this is its hit; recoil, choking and broken glass get a plain one.
          if (this.d.moveFx && pl && pl.user.side !== e.target.side) this.d.moveFx.impact(pl.plan, at, { crit: e.crit, mult: e.mult });
          else {
            this.d.effects.impact(at.x, at.y, at.z, false);
            if (this.d.moveFx) audio.moveSfx('impact', 8, 0.7);
          }
          if (e.crit && !this.d.moveFx) this.d.effects.sparks(at.x, at.y + 0.1, at.z, 6);
          this.d.dmgNums?.spawn(at.x, at.y + 0.7, at.z, e.amount, e.crit ? 'crit' : e.mult >= 2 ? 'weak' : 'hit');
        }
        this.d.ui.render();
        return DUR.damage * k;
      }
      case 'faint': {
        const v = this.views.get(e.target);
        if (!v?.ped) playCry(e.target.creature.speciesId, 6, { faint: true });
        if (v?.inst) {
          v.inst.play('faint', 0.05);
          v.idleAt = 0;
        }
        if (v && this.d.moveFx) {
          const at = this.chest(v, e.target, 0.2);
          audio.moveSfx('faint', 8);
          this.d.effects.burst({ x: at.x, y: at.y, z: at.z, count: 14, r: 0.6, g: 0.58, b: 0.55, speed: 1.6, up: 0.6, life: 1.1, size0: 0.4, size1: 1.5, alpha: 0.4, additive: false, drag: 2, flat: true });
        }
        if (v?.ped) this.d.onPersonDown?.(v.ped);
        else if (v && !v.wild) v.removeAt = this.time + 1.4;
        audio.thud();
        return DUR.faint * k;
      }
      case 'noise': {
        const v = this.views.get(e.user);
        if (v) this.d.onNoise(v.x, v.z, 60, e.user.side, e.user.creature);
        return 0;
      }
      case 'heal':
      case 'stat':
      case 'ammo':
      case 'cloud':
      case 'glass':
        if (e.kind === 'cloud' && e.turns > 0) {
          for (const c of this.battle!.sides[e.side].active) {
            const v = this.views.get(c);
            if (v) this.d.effects.tyreSmoke(v.x, this.d.groundY(v.x, v.z) + 0.4, v.z, 2);
          }
        }
        this.d.ui.render();
        return 0.15 * k;
      case 'miss':
      case 'ran':
      case 'end':
        this.d.ui.render();
        return 0.1;
    }
    return 0;
  }

  private tweenHp(dt: number): void {
    const b = this.battle;
    if (!b) return;
    let changed = false;
    for (const s of b.sides)
      for (const c of s.active) {
        const shown = this.d.ui.shownHp.get(c) ?? c.creature.hp;
        // The bar catches up with damage that has been played (events applied HP already).
        const target = this.playedHp(c);
        if (Math.abs(shown - target) > 0.01) {
          const step = Math.max(1, Math.abs(shown - target)) * dt * 6;
          this.d.ui.shownHp.set(c, shown + Math.sign(target - shown) * Math.min(step, Math.abs(target - shown)));
          changed = true;
        }
      }
    if (changed) this.d.ui.render();
  }

  /** HP as of the events played so far (later queued damage hasn't "happened" on screen yet). */
  private playedHp(c: Combatant): number {
    let hp = c.creature.hp;
    // Undo damage/heal events that are still queued.
    for (const e of this.queue) {
      if (e.kind === 'damage' && e.target === c) hp += e.amount;
      if (e.kind === 'heal' && e.target === c) hp -= e.amount;
    }
    return hp;
  }

  // ------------------------------------------------------------------ models

  private addView(c: Combatant): void {
    const slot = this.battle!.sides[c.side].active.indexOf(c);
    const p = this.spot(c.side, Math.max(0, slot));
    const heading = c.side === 0 ? Math.atan2(this.dir.x, this.dir.z) : Math.atan2(-this.dir.x, -this.dir.z);
    const view: View = { inst: null, x: p.x, z: p.z, heading, wild: null, ped: null, idleAt: 0, removeAt: 0, creature: c.creature };
    this.views.set(c, view);
    this.d.effects.sparks(p.x, this.d.groundY(p.x, p.z) + 0.4, p.z, 10);
    void this.d.models.instance(c.creature.speciesId, c.creature.shiny).then((inst) => {
      if (this.views.get(c) !== view) {
        inst.dispose();
        return;
      }
      view.inst = inst;
      this.d.scene.add(inst.root);
      this.placeView(view);
    });
  }

  private removeView(c: Combatant, delay: number): void {
    const v = this.views.get(c);
    if (!v) return;
    if (v.wild || v.ped) return;
    if (delay <= 0) {
      v.inst?.dispose();
      v.raft?.removeFromParent();
      this.views.delete(c);
    } else v.removeAt = this.time + delay;
  }

  /** A point on a creature at `frac` of its height (where moves leave from and land). */
  private chest(v: View, c: Combatant | null, frac: number): THREE.Vector3 {
    let h = 1;
    for (const [cc, vv] of this.views) if (vv === v) h = species(cc.creature.speciesId).model.height;
    if (c) h = species(c.creature.speciesId).model.height;
    const o = this.lungeOffset(v);
    return new THREE.Vector3(v.x + o.x, this.d.groundY(v.x, v.z) + Math.max(0.3, Math.min(2.2, h * frac + 0.15)), v.z + o.z);
  }

  /** Where a lunging creature is right now, relative to its mark. */
  private lungeOffset(v: View): { x: number; z: number } {
    const l = v.lunge;
    if (!l) return { x: 0, z: 0 };
    const k = Math.sin(Math.PI * Math.min(1, l.t / l.dur));
    return { x: l.dx * l.dist * k, z: l.dz * l.dist * k };
  }

  private placeView(v: View): void {
    if (!v.inst) return;
    const o = this.lungeOffset(v);
    v.inst.root.position.set(v.x + o.x, this.d.groundY(v.x + o.x, v.z + o.z) + this.waterLift(v), v.z + o.z);
    v.inst.root.rotation.y = v.heading + (v.lunge?.spin ? (v.lunge.t / v.lunge.dur) * Math.PI * 4 : 0);
  }

  /** Water fights: how high this creature rides, and its raft kept underneath it. */
  private waterLift(v: View): number {
    const w = this.d.water;
    if (!w || !v.creature || !w.active()) {
      if (v.raft) {
        v.raft.removeFromParent();
        v.raft = null;
      }
      return 0;
    }
    const lift = w.lift(v.creature, this.time);
    if (w.raft(v.creature) && v.inst) {
      if (!v.raft) {
        v.raft = makeRaft(species(v.creature.speciesId).model.height);
        this.d.scene.add(v.raft);
      }
      const r = v.inst.root.position;
      v.raft.position.set(r.x, this.d.groundY(r.x, r.z) + lift - 0.08, r.z);
      v.raft.rotation.set(Math.sin(this.time * 1.3 + r.x) * 0.05, v.heading, Math.cos(this.time * 1.1 + r.z) * 0.05);
    }
    return lift;
  }

  private dropRafts(): void {
    for (const [, v] of this.views) {
      v.raft?.removeFromParent();
      v.raft = null;
    }
  }

  private animateViews(dt: number): void {
    for (const [, v] of this.views) {
      if (!v.lunge) continue;
      v.lunge.t += dt;
      if (v.lunge.t >= v.lunge.dur) v.lunge = null;
    }
    for (const [c, v] of this.views) {
      if (v.ped) {
        // Keep the person on their mark facing the fight (until they're knocked down).
        if (v.ped.state !== 'down' && v.ped.state !== 'dead' && v.ped.state !== 'fly') {
          v.ped.x = v.x;
          v.ped.z = v.z;
          v.ped.heading = v.heading;
          v.ped.speed = 0;
          v.ped.state = 'cop';
        }
      } else if (v.wild) {
        // The spawn system keeps updating the wild creature's model; keep it on its mark (or lunging).
        const o = this.lungeOffset(v);
        v.wild.x = v.x + o.x;
        v.wild.z = v.z + o.z;
        v.wild.heading = v.heading;
        v.inst = v.wild.inst;
      } else {
        this.placeView(v);
        v.inst?.mixer.update(dt);
      }
      if (v.inst && v.idleAt > 0 && this.time >= v.idleAt) {
        v.inst.play('idle', 0.2);
        v.idleAt = 0;
      }
      if (v.removeAt > 0 && this.time >= v.removeAt) {
        v.inst?.dispose();
        v.raft?.removeFromParent();
        this.views.delete(c);
      }
    }
  }
}

function moveSpecName(id: string): string {
  return moveSpec(id).name;
}

/** An orange inflatable life raft sized to a Streetmon (a ring tube, a floor, a grab line). */
function makeRaft(height: number): THREE.Group {
  const g = new THREE.Group();
  const r = Math.max(0.55, Math.min(1.4, height * 0.55 + 0.35));
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.55 });
  const tube = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 10, 24).rotateX(Math.PI / 2), orange);
  tube.position.y = r * 0.18;
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 }));
  floor.position.y = 0.04;
  const line = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.018, 4, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
  line.position.y = r * 0.3;
  g.add(tube, floor, line);
  for (const m of [tube, floor]) m.castShadow = true;
  return g;
}
