import * as THREE from 'three';
import { playCry } from '../creatures/CreatureCry';
import { audio } from '../audio/Audio';
import legendariesJson from '../config/legendaries.json';
import { nearestClear } from '../creatures/Arena';
import { createCreature, displayName, maxHp, type Creature } from '../creatures/Creature';
import type { CreatureInstance, CreatureModels } from '../creatures/CreatureModels';
import { DATA, species, typeInfo, type Biome, type District, type TimeOfDay } from '../creatures/Data';
import { pickSpecies, spawnTable } from '../creatures/SpawnRules';
import type { SpawnSystem, WildCreature } from '../creatures/SpawnSystem';
import type { DamageNumbers } from '../fx/DamageNumbers';
import type { Decals } from '../fx/Decals';
import type { Effects } from '../fx/Effects';
import type { MoveFx } from '../fx/MoveFx';
import type { PedestrianSystem } from '../peds/PedestrianSystem';
import { randomLook } from '../peds/CrowdRenderer';
import { Humanoid } from '../player/Humanoid';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { DestructionWorld } from './DestructionWorld';
import { RaidManager, validateRaids, type LegendaryDef, type RaidConfig, type RaidEvent, type RaidState } from './raidManager.js';

/**
 * Legendary raids in the world (rules in raidManager.js).
 *
 * The legendary is a wild Streetmon held by the raid (heldBy 'raid:<id>', never despawned, can't be
 * scared, knocked flying or knocked out outside a battle), scaled up in HP. While it rampages it
 * roams around where it turned up and stomps on a timer: a shock ring, a roar or quake, cracked
 * ground, street props flattened (destruction), every wild Streetmon in reach knocked out, people
 * thrown, cars shoved and dented, and you knocked back and hurt if you're close on foot.
 *
 * Trainers come running (two or three, from out of sight), send out their Streetmon and attack it
 * from range with the same move effects as battles. Their hits chip its HP (never below a floor:
 * the finish is yours), and it swats back at their Streetmon. Press B next to it to fight: your
 * team and the trainers' Streetmon that are still standing against the legendary, which acts twice
 * a turn. HP carries over between fights.
 *
 * Win and it slumps, subdued, for a short window: throw a capture item (the catch rate gets a
 * bonus). Lose, run or wait too long and it escapes. A boss bar at the top of the screen shows its
 * HP and what's happening; the minimap marks it.
 */

export const RAIDS = legendariesJson as unknown as RaidConfig;
validateRaids(RAIDS, { species: (id) => !!DATA.species.get(id)?.legendary });

const ALLY_NAMES = ['Rosa', 'Dee', 'Marcus', 'Tiny', 'Kenji', 'Bea', 'Omar', 'Lupe', 'Theo', 'Nia', 'Big Sal', 'Ivy'];

/** How many times its species' size a raid legendary is drawn, by layer. */
export const LEGEND_SIZE: Record<string, number> = { street: 2.1, roof: 1.6, sewer: 1 };

export interface RaidDeps {
  scene: THREE.Scene;
  container: HTMLElement;
  spawns: SpawnSystem;
  models: CreatureModels;
  peds: PedestrianSystem;
  vehicles: VehicleManager;
  effects: Effects;
  moveFx: MoveFx;
  dmgNums: DamageNumbers;
  decals: Decals;
  destruction?: DestructionWorld;
  /** Ground in the player's layer, and can something stand at (x, z) there (walls, cars, props). */
  groundAt(x: number, z: number): number;
  clear(x: number, z: number): boolean;
  player(): { pos: THREE.Vector3; onFoot: boolean; layer: Biome; district: District; time: TimeOfDay; inCar: boolean };
  /** The strongest level on your team (raids scale to it). */
  partyLevel(): number;
  /** Is the player busy with something a raid shouldn't interrupt (a race, a heist, a battle, a menu)? */
  busy(): boolean;
  /** A stomp caught you on foot. */
  hurtPlayer(amount: number, dirX: number, dirZ: number, cause: string): void;
  toast(text: string, ms: number): void;
  big(text: string, color: string, ms: number): void;
  /** A raid quest step finished (beaten or caught). */
  questDone(questId: string): void;
  listener(): THREE.Vector3;
  shake(amount: number): void;
}

interface Ally {
  name: string;
  model: Humanoid;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Where they're heading (their spot near the legendary, or away when leaving). */
  tx: number;
  tz: number;
  state: 'run' | 'fight' | 'leave';
  creature: Creature;
  mon: { inst: CreatureInstance | null; x: number; z: number; heading: number } | null;
  attackIn: number;
  leaveT: number;
  said: boolean;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class RaidWorld {
  readonly raids = new RaidManager({ config: RAIDS });
  boss: WildCreature | null = null;
  private def: LegendaryDef | null = null;
  private allies: Ally[] = [];
  private stompIn = 0;
  private swatIn = 0;
  private roamIn = 0;
  private alliesIn = 0;
  private centre = new THREE.Vector3();
  private readonly bar: HTMLDivElement;
  private readonly tmp = new THREE.Vector3();
  private knocked = 0;
  private omenFx = 0;

  constructor(private readonly d: RaidDeps) {
    this.bar = document.createElement('div');
    this.bar.className = 'raid-bar';
    this.bar.style.display = 'none';
    d.container.appendChild(this.bar);
  }

  /** The raid in progress, if any. */
  get active(): RaidState | null {
    return this.raids.active;
  }

  /** Is the legendary rampaging near enough to set the music? */
  get loud(): boolean {
    const a = this.raids.active;
    if (!a || !this.boss || (a.status !== 'rampage' && a.status !== 'engaged')) return false;
    return Math.hypot(this.boss.x - this.d.player().pos.x, this.boss.z - this.d.player().pos.z) < 120;
  }

  isBoss(w: WildCreature): boolean {
    return w === this.boss;
  }

  // ------------------------------------------------------------------ per frame

  /**
   * A legendary towers over the street (less on a roof, and it has to fit under the sewer roof).
   * Also called while a cinematic plays (its arrival is filmed). Not in the catch window: the
   * catch animation shrinks it from whatever size it is.
   */
  applySize(): void {
    const b = this.boss;
    const a = this.raids.active;
    if (!b?.inst || !a) return;
    const want = LEGEND_SIZE[b.biome] ?? 1;
    b.sizeScale = want;
    if (a.status !== 'subdued' && Math.abs(b.inst.root.scale.x - want) > 0.001) b.inst.root.scale.setScalar(want);
  }

  update(dt: number): void {
    const P = this.d.player();
    const ev = this.raids.update(dt, { district: P.district, time: P.time, biome: P.layer, partyLevel: this.d.partyLevel(), blocked: this.d.busy() });
    this.handle(ev);
    const a = this.raids.active;
    if (!a) {
      this.bar.style.display = 'none';
      return;
    }
    this.applySize();
    const def = this.raids.def(a.id);
    // Left the layer (or wandered far off) during a raid: it slips away.
    const where = a.at ?? this.boss ?? null;
    const layer = a.at?.biome ?? this.boss?.biome ?? P.layer;
    if (a.status !== 'engaged' && (layer !== P.layer || (where && Math.hypot(where.x - P.pos.x, where.z - P.pos.z) > 260))) {
      this.handle(this.raids.abandon());
      return;
    }
    if (a.status === 'omen') this.updateOmen(dt, def);
    if (this.boss && (a.status === 'rampage' || a.status === 'subdued')) this.updateRampage(dt, a, def);
    this.updateAllies(dt);
    this.updateBar(a, def);
  }

  private handle(ev: RaidEvent[]): void {
    for (const e of ev) {
      const def = this.raids.def(e.id);
      switch (e.type) {
        case 'omen':
          this.d.toast(def.omen, 5000);
          this.omenFx = 0;
          break;
        case 'arrive':
          this.arrive(this.raids.state(e.id), def);
          break;
        case 'resume':
          this.d.toast(`${species(def.species).name} is still rampaging. Catch your breath and go again!`, 3500);
          break;
        case 'subdued':
          this.subdue(def);
          if (e.quest) this.d.questDone(e.quest);
          break;
        case 'caught':
          this.d.big(`${species(def.species).name.toUpperCase()} CAUGHT`, def.color, 3500);
          this.d.toast(def.caught, 5000);
          this.cleanup(false);
          break;
        case 'escaped':
          if (this.boss) this.d.toast(def.escaped, 4500);
          this.cleanup(true);
          break;
      }
    }
  }

  // ------------------------------------------------------------------ omen and arrival

  /** Before it turns up: alarms, flickers or a hum, building up. */
  private updateOmen(dt: number, def: LegendaryDef): void {
    this.omenFx -= dt;
    if (this.omenFx > 0) return;
    this.omenFx = 2.2;
    const p = this.d.player().pos;
    if (def.id === 'gridlock') audio.sfx('sfx_alarm_bell', 30 + Math.random() * 40);
    else if (def.id === 'blackout') {
      audio.moveSfx('zap', 30 + Math.random() * 30, 0.8);
      this.d.effects.sparks(p.x + rand(-20, 20), p.y + 6, p.z + rand(-20, 20), 8);
    } else audio.moveSfx('bass_drop', 25 + Math.random() * 20, 1.4);
  }

  /** Where a rare legendary turns up: open ground 30-45 m from you, out of the way of walls. */
  private arrivalSpot(): { x: number; y: number; z: number } {
    const p = this.d.player().pos;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(30, 45);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const s = nearestClear(x, z, (cx, cz) => this.roomy(cx, cz, 1.6), 4);
      if (s) return { x: s.x, y: this.d.groundAt(s.x, s.z), z: s.z };
    }
    const s = nearestClear(p.x + 12, p.z, (cx, cz) => this.d.clear(cx, cz), 6) ?? { x: p.x, z: p.z };
    return { x: s.x, y: this.d.groundAt(s.x, s.z), z: s.z };
  }

  /** Room for something big: clear in a small ring around the point too. */
  private roomy(x: number, z: number, r: number): boolean {
    if (!this.d.clear(x, z)) return false;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (!this.d.clear(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    }
    return true;
  }

  private arrive(s: RaidState, def: LegendaryDef): void {
    const P = this.d.player();
    const at = s.at ? nearestClear(s.at.x, s.at.z, (x, z) => this.d.clear(x, z), 6) : null;
    const spot = at ? { x: at.x, y: s.at!.y, z: at.z } : this.arrivalSpot();
    const w = this.d.spawns.debugSpawn(def.species, s.level, spot.x, spot.z, false, P.layer, P.layer === 'street' ? undefined : spot.y);
    this.boss = w;
    this.def = def;
    w.creature.hpScale = RAIDS.settings.hpScale;
    w.creature.hp = Math.max(1, Math.round(maxHp(w.creature) * s.hp));
    w.heldBy = `raid:${def.id}`;
    w.eventTag = -1;
    w.boss = true;
    w.temperament = 'aggro';
    w.script = null;
    w.faceAt = { x: P.pos.x, z: P.pos.z };
    this.centre.set(spot.x, spot.y, spot.z);
    this.stompIn = 2.5;
    this.swatIn = 6;
    this.roamIn = 3;
    this.alliesIn = 3.5;
    this.knocked = 0;
    this.d.big(def.arrive, def.color, 3500);
    // Entrance: a stomp that announces it (no damage to you this first time: it's showing off).
    this.stomp(def, false);
  }

  // ------------------------------------------------------------------ rampage

  private updateRampage(dt: number, a: RaidState, def: LegendaryDef): void {
    const w = this.boss!;
    const S = RAIDS.settings;
    const P = this.d.player();
    if (a.status === 'subdued') {
      w.script = null;
      w.faceAt = null;
      return;
    }
    if (w.pinned) return;
    // Wander around where it turned up (drifting towards you), pausing to roar.
    this.roamIn -= dt;
    if (this.roamIn <= 0 && !w.script) {
      this.roamIn = rand(S.roam.pause[0], S.roam.pause[1]) + 3;
      const toward = Math.hypot(P.pos.x - this.centre.x, P.pos.z - this.centre.z) < 70 ? 0.35 : 0;
      this.centre.x += (P.pos.x - this.centre.x) * toward;
      this.centre.z += (P.pos.z - this.centre.z) * toward;
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * S.roam.radius;
        const x = this.centre.x + Math.cos(ang) * r;
        const z = this.centre.z + Math.sin(ang) * r;
        if (this.d.clear(x, z)) {
          w.script = { x, z, run: Math.random() < 0.3 };
          w.faceAt = null;
          break;
        }
      }
    }
    if (!w.script) w.faceAt = { x: P.pos.x, z: P.pos.z };
    // Stomps on a timer.
    this.stompIn -= dt;
    if (this.stompIn <= 0) {
      this.stompIn = rand(S.stomp.every[0], S.stomp.every[1]);
      this.stomp(def, true);
    }
    // Swats at the trainers' Streetmon between stomps.
    this.swatIn -= dt;
    if (this.swatIn <= 0) {
      this.swatIn = rand(3.5, 6);
      this.swat();
    }
  }

  /** The big one: everything in reach gets it. */
  private stomp(def: LegendaryDef, hurts: boolean): void {
    const w = this.boss;
    if (!w) return;
    const S = RAIDS.settings.stomp;
    const R = S.radius;
    w.inst?.play('attack', 0.05);
    w.animLock = performance.now() + 800;
    const at = this.tmp.set(w.x, w.y, w.z);
    this.d.moveFx.stomp(at, R, def.color);
    const dist = this.d.listener().distanceTo(at);
    audio.moveSfx(def.id === 'gridlock' ? 'quake' : 'roar', dist, 2);
    if (this.boss) playCry(this.boss.spec.id, dist);
    if (Math.random() < 0.5) audio.moveSfx('roar', dist + 5, 2.2);
    this.d.decals.ground('crack', w.x, w.y, w.z, R * 0.55);
    const street = w.biome === 'street';
    if (street) this.d.destruction?.manager.stomp(w.x, w.z, R * 0.8);
    // Wild Streetmon in reach: knocked out.
    let ko = 0;
    for (const o of this.d.spawns.wild) {
      if (o === w || o.removed || o.pinned || o.inPod || o.state === 'fainted' || o.state === 'engaged' || o.biome !== w.biome) continue;
      if (Math.hypot(o.x - w.x, o.z - w.z) > R) continue;
      this.d.spawns.faint(o);
      this.d.effects.sparks(o.x, o.y + 0.4, o.z, 8);
      ko++;
    }
    if (ko) {
      this.knocked += ko;
      this.d.toast(`${species(def.species).name} knocked out ${ko === 1 ? 'a wild Streetmon' : `${ko} wild Streetmon`}!`, 2200);
    }
    // The trainers' Streetmon close by take a hit too.
    for (const al of this.allies) {
      if (!al.mon || al.creature.hp <= 0) continue;
      const dd = Math.hypot(al.mon.x - w.x, al.mon.z - w.z);
      if (dd > R) continue;
      this.hurtAlly(al, Math.round(maxHp(al.creature) * 0.25 * (1 - dd / R) + 4));
    }
    if (!hurts) return;
    if (street) {
      // People thrown off their feet (they get up and run), cars shoved and dented.
      for (const p of this.d.peds.peds) {
        if (p.state === 'dead' || p.state === 'script') continue;
        const dx = p.x - w.x;
        const dz = p.z - w.z;
        const dd = Math.hypot(dx, dz);
        if (dd > R || dd < 0.01) continue;
        this.d.peds.damage(p, 1, dx / dd, dz / dd, S.pedKnock * (1 - dd / R) + 3);
      }
      for (const car of this.d.vehicles.cars) {
        if (car.disposed || car.destroyed) continue;
        const cp = car.position;
        const dx = cp.x - w.x;
        const dz = cp.z - w.z;
        const dd = Math.hypot(dx, dz);
        if (dd > R * 1.2 || dd < 0.01) continue;
        const k = 1 - dd / (R * 1.2);
        const m = car.spec.mass;
        car.body.applyImpulse({ x: (dx / dd) * m * S.carPush * k, y: m * 4 * k, z: (dz / dd) * m * S.carPush * k }, true);
        car.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 2 * k, y: 0, z: (Math.random() - 0.5) * m * 2 * k }, true);
        car.damage(S.carDamage * k);
      }
    }
    const P = this.d.player();
    const pd = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
    if (P.onFoot && pd < R * 0.85 && Math.abs(P.pos.y - w.y) < 3) {
      const k = 1 - pd / (R * 0.85);
      this.d.hurtPlayer(Math.round(S.playerDamage * (0.4 + 0.6 * k)), (P.pos.x - w.x) / (pd || 1), (P.pos.z - w.z) / (pd || 1), `Flattened by ${species(def.species).name}`);
    }
  }

  /** A signature move at one of the trainers' Streetmon. */
  private swat(): void {
    const w = this.boss;
    const targets = this.allies.filter((a) => a.mon && a.creature.hp > 0 && a.state === 'fight');
    if (!w || !targets.length) return;
    const al = targets[Math.floor(Math.random() * targets.length)];
    const moves = w.creature.moves.filter((m) => (DATA.moves.get(m)?.power ?? 0) > 0);
    const mid = moves[Math.floor(Math.random() * moves.length)] ?? w.creature.moves[0];
    const plan = this.d.moveFx.plan(mid);
    const from = new THREE.Vector3(w.x, w.y + w.spec.model.height * 0.6, w.z);
    const to = new THREE.Vector3(al.mon!.x, this.d.groundAt(al.mon!.x, al.mon!.z) + 0.5, al.mon!.z);
    w.inst?.play('attack', 0.05);
    w.animLock = performance.now() + 700;
    w.faceAt = { x: to.x, z: to.z };
    this.d.moveFx.cast(plan, from, [to], () => {
      this.d.moveFx.impact(plan, to, { crit: false, mult: 1 });
      this.hurtAlly(al, Math.round(maxHp(al.creature) * rand(0.3, 0.5)));
    });
  }

  private hurtAlly(al: Ally, dmg: number): void {
    if (!al.mon || al.creature.hp <= 0) return;
    al.creature.hp = Math.max(0, al.creature.hp - dmg);
    const gy = this.d.groundAt(al.mon.x, al.mon.z);
    this.d.dmgNums.spawn(al.mon.x, gy + 1, al.mon.z, dmg, 'hit');
    if (al.creature.hp > 0) {
      al.mon.inst?.play('hurt', 0.05);
      return;
    }
    al.mon.inst?.play('faint', 0.05);
    al.state = 'leave';
    al.leaveT = 2.5;
    this.d.toast(`${al.name}: "${displayName(al.creature)}, no! I'm out, sorry!"`, 2500);
  }

  // ------------------------------------------------------------------ the trainers who help

  private spawnAllies(): void {
    const w = this.boss;
    if (!w) return;
    const S = RAIDS.settings.allies;
    const P = this.d.player();
    const n = Math.round(rand(S.count[0], S.count[1]));
    const names = [...ALLY_NAMES].sort(() => Math.random() - 0.5);
    const level = Math.max(S.minLevel, this.d.partyLevel() - S.levelUnderParty);
    // Fan out on the far side of the legendary from... anywhere; prefer the player's side.
    const base = Math.atan2(P.pos.z - w.z, P.pos.x - w.x);
    const taken: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < n; i++) {
      // Their spot: on your side of it if there's room, otherwise anywhere around it that's open
      // (streets are narrow: most directions run into buildings).
      let spot: { x: number; z: number } | null = null;
      let ang = base;
      const want = base + (i - (n - 1) / 2) * 0.9;
      for (let k = 0; k < 16 && !spot; k++) {
        const a = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        for (const r of [S.range, S.range * 0.75, S.range * 1.3]) {
          const c = nearestClear(w.x + Math.cos(a) * r, w.z + Math.sin(a) * r, (x, z) => this.d.clear(x, z), 1.5);
          if (c && !taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 3)) {
            spot = c;
            ang = a;
            break;
          }
        }
      }
      if (!spot) continue;
      taken.push(spot);
      // Run in from further out on the same line (if it's open), else just appear there.
      let sx = spot.x + Math.cos(ang) * 14;
      let sz = spot.z + Math.sin(ang) * 14;
      let open = true;
      for (let k = 1; k <= 7 && open; k++) open = this.d.clear(spot.x + Math.cos(ang) * k * 2, spot.z + Math.sin(ang) * k * 2);
      if (!open) {
        sx = spot.x;
        sz = spot.z;
      }
      const table = spawnTable(P.district, P.time, P.layer);
      const sp = pickSpecies(table.length ? table : spawnTable('midtown', 'day', 'street'), Math.random());
      if (!sp) continue;
      const c = createCreature(sp.id, level);
      const name = names[i % names.length];
      c.nickname = `${name}'s ${sp.name}`;
      const model = new Humanoid(randomLook());
      this.d.scene.add(model.root);
      const y = this.d.groundAt(sx, sz);
      this.allies.push({ name, model, x: sx, y, z: sz, heading: 0, tx: spot.x, tz: spot.z, state: 'run', creature: c, mon: null, attackIn: rand(1, 2.5), leaveT: 0, said: false });
    }
    if (this.allies.length) this.d.toast(`${this.allies.length === 1 ? 'A trainer comes' : `${this.allies.length} trainers come`} running to fight ${species(this.def!.species).name}!`, 3000);
  }

  private sendOut(al: Ally): void {
    const w = this.boss;
    if (!w) return;
    const dx = w.x - al.x;
    const dz = w.z - al.z;
    const dd = Math.hypot(dx, dz) || 1;
    const spot = nearestClear(al.x + (dx / dd) * 1.8, al.z + (dz / dd) * 1.8, (x, z) => this.d.clear(x, z), 3) ?? { x: al.x, z: al.z };
    const mon = { inst: null as CreatureInstance | null, x: spot.x, z: spot.z, heading: Math.atan2(dx, dz) };
    al.mon = mon;
    this.d.effects.sparks(spot.x, this.d.groundAt(spot.x, spot.z) + 0.4, spot.z, 10);
    void this.d.models.instance(al.creature.speciesId, false).then((inst) => {
      if (al.mon !== mon) {
        inst.dispose();
        return;
      }
      mon.inst = inst;
      this.d.scene.add(inst.root);
      inst.play('idle');
      this.placeMon(al);
    });
  }

  private placeMon(al: Ally): void {
    const m = al.mon;
    if (!m?.inst) return;
    m.inst.root.position.set(m.x, this.d.groundAt(m.x, m.z), m.z);
    m.inst.root.rotation.y = m.heading;
  }

  private updateAllies(dt: number): void {
    const a = this.raids.active;
    if (this.boss && a?.status === 'rampage' && this.alliesIn > 0) {
      this.alliesIn -= dt;
      if (this.alliesIn <= 0) this.spawnAllies();
    }
    const w = this.boss;
    const S = RAIDS.settings.allies;
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const al = this.allies[i];
      let speed = 0;
      if (al.state === 'run' || al.state === 'leave') {
        if (al.state === 'leave') {
          al.leaveT -= dt;
          if (al.leaveT > 0) {
            al.model.update(dt, 0, true);
            this.placeAlly(al);
            continue;
          }
          if (al.mon) this.dropMon(al);
        }
        const dx = al.tx - al.x;
        const dz = al.tz - al.z;
        const dd = Math.hypot(dx, dz);
        if (dd < 0.4) {
          if (al.state === 'leave') {
            this.removeAlly(i);
            continue;
          }
          al.state = 'fight';
          this.sendOut(al);
        } else {
          speed = 5.2;
          const step = Math.min(dd, speed * dt);
          al.x += (dx / dd) * step;
          al.z += (dz / dd) * step;
          al.heading = Math.atan2(-dz, dx);
          // Leaving: once well out of the way, just go.
          if (al.state === 'leave' && Math.hypot(al.x - this.d.player().pos.x, al.z - this.d.player().pos.z) > 45) {
            this.removeAlly(i);
            continue;
          }
        }
      } else if (al.state === 'fight' && w) {
        al.heading = Math.atan2(-(w.z - al.z), w.x - al.x);
        if (!al.said && Math.random() < dt * 0.3) {
          al.said = true;
          this.d.toast(`${al.name}: "${S.cheerLines[Math.floor(Math.random() * S.cheerLines.length)]}"`, 2200);
        }
        const status = this.raids.active?.status;
        if (al.mon && status === 'rampage' && !w.pinned) {
          al.mon.heading = Math.atan2(w.x - al.mon.x, w.z - al.mon.z);
          al.attackIn -= dt;
          if (al.attackIn <= 0 && al.creature.hp > 0) {
            al.attackIn = rand(S.attackEvery[0], S.attackEvery[1]);
            this.allyAttack(al);
          }
        }
      }
      al.model.update(dt, speed, true);
      this.placeAlly(al);
      if (al.mon) this.placeMon(al);
    }
  }

  private allyAttack(al: Ally): void {
    const w = this.boss;
    const m = al.mon;
    if (!w || !m) return;
    const sp = species(al.creature.speciesId);
    const from = new THREE.Vector3(m.x, this.d.groundAt(m.x, m.z) + sp.model.height * 0.55, m.z);
    const to = new THREE.Vector3(w.x, w.y + w.spec.model.height * 0.45, w.z);
    m.inst?.play('attack', 0.05);
    const mult = 1;
    this.d.moveFx.typeAttack(sp.types[0], from, to, { crit: Math.random() < 0.08, mult, power: 60 }, () => {
      const id = this.raids.active?.id;
      if (!id || !this.boss) return;
      const before = this.raids.active!.hp;
      const frac = 0.018 + 0.012 * Math.min(1.5, al.creature.level / Math.max(1, this.boss.creature.level));
      const hp = this.raids.chip(id, frac);
      const mx = maxHp(this.boss.creature);
      const dmg = Math.round((before - hp) * mx);
      this.boss.creature.hp = Math.max(1, Math.round(hp * mx));
      if (dmg > 0) this.d.dmgNums.spawn(this.boss.x, this.boss.y + this.boss.spec.model.height + 0.3, this.boss.z, dmg, 'hit');
      else this.d.dmgNums.spawn(this.boss.x, this.boss.y + this.boss.spec.model.height + 0.3, this.boss.z, 0, 'weak');
      this.boss.inst?.play('hurt', 0.05);
    });
  }

  private placeAlly(al: Ally): void {
    al.y = this.d.groundAt(al.x, al.z);
    al.model.root.position.set(al.x, al.y, al.z);
    al.model.root.rotation.y = al.heading;
  }

  private dropMon(al: Ally): void {
    const m = al.mon;
    if (!m) return;
    al.mon = null;
    if (m.inst) {
      this.d.effects.sparks(m.x, this.d.groundAt(m.x, m.z) + 0.4, m.z, 6);
      m.inst.dispose();
    }
  }

  private removeAlly(i: number): void {
    const al = this.allies[i];
    this.dropMon(al);
    al.model.root.removeFromParent();
    this.allies.splice(i, 1);
  }

  /** Everyone heads off (raid over). */
  private dismissAllies(): void {
    const P = this.d.player();
    for (const al of this.allies) {
      if (al.state === 'leave') continue;
      al.state = 'leave';
      al.leaveT = 1.2;
      const ang = Math.atan2(al.z - P.pos.z, al.x - P.pos.x);
      al.tx = al.x + Math.cos(ang) * 60;
      al.tz = al.z + Math.sin(ang) * 60;
    }
  }

  // ------------------------------------------------------------------ the fight and after

  /** Can you take it on right now (close, on foot, it's rampaging)? */
  canEngage(): boolean {
    const a = this.raids.active;
    const w = this.boss;
    if (!a || !w || a.status !== 'rampage') return false;
    const P = this.d.player();
    return P.onFoot && Math.hypot(w.x - P.pos.x, w.z - P.pos.z) < 9 && Math.abs(w.y - P.pos.y) < 3;
  }

  /** The battle is starting: who's helping (their Streetmon go into the battle; the street copies hide). */
  engage(): { boss: WildCreature; allies: Creature[]; foeActions: number; foeDamage: number; intro: string } | null {
    const a = this.raids.active;
    const w = this.boss;
    if (!a || !w || !this.raids.engage(a.id)) return null;
    w.script = null;
    const helpers = this.allies.filter((al) => al.state === 'fight' && al.mon && al.creature.hp > 0);
    for (const al of helpers) if (al.mon?.inst) al.mon.inst.root.visible = false;
    const def = this.raids.def(a.id);
    const name = species(def.species).name;
    const hpPct = Math.round(a.hp * 100);
    return {
      boss: w,
      allies: helpers.map((h) => h.creature),
      foeActions: RAIDS.settings.actionsPerTurn,
      foeDamage: RAIDS.settings.foeDamage,
      intro: `${name} (Lv ${w.creature.level}) towers over you!${hpPct < 100 ? ` It's already hurt (${hpPct}%).` : ''}`,
    };
  }

  /** The battle ended (BattleController result). */
  battleEnded(outcome: 'win' | 'lose' | 'ran' | 'aborted' | 'caught'): void {
    const a = this.raids.active;
    const w = this.boss;
    if (!a || !w) return;
    for (const al of this.allies) {
      if (al.mon?.inst) al.mon.inst.root.visible = true;
      if (al.creature.hp <= 0 && al.state === 'fight') {
        al.mon?.inst?.play('faint', 0.05);
        al.state = 'leave';
        al.leaveT = 2;
      }
    }
    const hp = w.creature.hp / maxHp(w.creature);
    this.handle(this.raids.disengage(a.id, outcome === 'caught' ? 'win' : outcome, hp));
    if (this.raids.active?.status === 'rampage') {
      // Back off a bit before it stomps again.
      this.stompIn = Math.max(this.stompIn, 4);
      w.calmUntil = 0;
    }
  }

  private subdue(def: LegendaryDef): void {
    const w = this.boss;
    if (!w) return;
    w.creature.hp = 1;
    w.script = null;
    w.faceAt = null;
    w.pinned = false;
    w.inst?.play('faint', 0.05);
    w.animLock = performance.now() + 60_000;
    this.d.big(`${species(def.species).name.toUpperCase()} SUBDUED`, def.color, 3000);
    this.d.toast(def.subdued, 5000);
    this.dismissAllies();
  }

  /** Catch chance multiplier for a throw at it (0 = it can't be caught right now). */
  catchMultiplier(w: WildCreature): number {
    if (w !== this.boss) return 1;
    return this.raids.active?.status === 'subdued' ? this.raids.catchMultiplier : 0;
  }

  /** Caught with a throw while subdued. Returns the creature, ready for your team. */
  caught(w: WildCreature): Creature | null {
    if (w !== this.boss) return null;
    const c = w.creature;
    delete c.hpScale;
    c.hp = Math.max(1, Math.round(maxHp(c) * 0.25));
    this.handle(this.raids.caught(this.raids.active!.id));
    return c;
  }

  private cleanup(fade: boolean): void {
    const w = this.boss;
    if (w) {
      if (fade && !w.removed) this.d.effects.burst({ x: w.x, y: w.y + 0.5, z: w.z, count: 40, r: 0.6, g: 0.6, b: 0.62, speed: 3, up: 2, life: 1.6, size0: 0.8, size1: 2.5, alpha: 0.5, additive: false, drag: 1.5 });
      w.heldBy = null;
      w.eventTag = undefined;
      w.boss = false;
      if (!w.removed) this.d.spawns.remove(w);
    }
    this.boss = null;
    this.def = null;
    this.dismissAllies();
    this.bar.style.display = 'none';
  }

  // ------------------------------------------------------------------ HUD

  private updateBar(a: RaidState, def: LegendaryDef): void {
    const w = this.boss;
    if (!w || a.status === 'engaged') {
      this.bar.style.display = a.status === 'omen' ? 'block' : 'none';
      if (a.status === 'omen') this.bar.innerHTML = `<div class="raid-omen" style="color:${def.color}">${def.omen}</div>`;
      return;
    }
    const P = this.d.player();
    const dist = Math.hypot(w.x - P.pos.x, w.z - P.pos.z);
    this.bar.style.display = dist < 140 ? 'block' : 'none';
    const frac = a.status === 'subdued' ? 0.01 : a.hp;
    const tl = Math.max(0, Math.ceil(a.timer));
    const status =
      a.status === 'subdued'
        ? `SUBDUED: throw a capture item (C)! ${tl}s`
        : this.canEngage()
          ? 'Press B to fight it'
          : `Rampaging · ${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')} before it leaves${this.allies.length ? ` · ${this.allies.filter((x) => x.state === 'fight').length} trainers fighting` : ''}`;
    this.bar.innerHTML = `<div class="raid-name" style="color:${def.color}">${species(def.species).name.toUpperCase()} <span>Lv ${w.creature.level} · ${typeInfo(w.spec.types[0]).name}${w.spec.types[1] ? ` / ${typeInfo(w.spec.types[1]).name}` : ''}</span></div>
      <div class="raid-hp"><div class="raid-hpfill" style="width:${(frac * 100).toFixed(1)}%;background:${def.color}"></div></div>
      <div class="raid-status">${status}</div>`;
  }

  /** Minimap marker. */
  markers(): Array<{ x: number; z: number; color: string; size: number }> {
    const w = this.boss;
    const a = this.raids.active;
    if (!w || !a) return [];
    return [{ x: w.x, z: w.z, color: this.raids.def(a.id).color, size: 16 }];
  }

  /** Full-map icon. */
  mapIcon(): { x: number; z: number; label: string } | null {
    const w = this.boss;
    return w ? { x: w.x, z: w.z, label: w.spec.name } : null;
  }

  /** A new game or a load: nothing in progress. */
  reset(save?: unknown): void {
    this.raids.abandon();
    this.cleanup(false);
    for (let i = this.allies.length - 1; i >= 0; i--) this.removeAlly(i);
    this.raids.load(save ?? null);
  }

  /** Debug/quests: start one now (at a place for quest raids). */
  trigger(id: string, at?: { x: number; y: number; z: number; biome: Biome } | null, quest?: string | null): boolean {
    if (!this.raids.trigger(id, { partyLevel: this.d.partyLevel(), at: at ?? null, quest: quest ?? null })) return false;
    this.handle([{ type: 'omen', id }]);
    return true;
  }
}
