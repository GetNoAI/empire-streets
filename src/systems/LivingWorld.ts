import * as THREE from 'three';
import { audio } from '../audio/Audio';
import { nearestClear } from '../creatures/Arena';
import { rollCatch } from '../creatures/Catching';
import { createCreature, maxHp, stats, type Creature } from '../creatures/Creature';
import type { CreatureInstance, CreatureModels } from '../creatures/CreatureModels';
import { DATA, item, move, species, typeInfo, type CaptureItem, type District, type TimeOfDay, type TypeId } from '../creatures/Data';
import { districtAt, pickSpecies, spawnTable } from '../creatures/SpawnRules';
import type { SpawnSystem, WildCreature } from '../creatures/SpawnSystem';
import type { DamageNumbers } from '../fx/DamageNumbers';
import type { Effects } from '../fx/Effects';
import type { MoveFx } from '../fx/MoveFx';
import type { Ped, PedestrianSystem } from '../peds/PedestrianSystem';
import { markBloom } from '../render/SelectiveBloom';
import { HealthBars, SpeechBubbles } from '../ui/Overhead';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { CityLayout } from '../world/CityLayout';
import { clamp, pick, rangeInt, type AmbientHit, type Fighter } from './livingCore.js';
import { NpcLifeManager, type HunterMon, type NpcLifeConfig, type Person, type Topic, type WildView } from './npcLife.js';
import { WildInteractionManager, type WildConfig, type WildMon } from './wildInteractions.js';
import { FollowerSkirmish, SKIRMISH_DEFAULTS, SKIRMISH_TAG, type SkirmishConfig, type SkirmishOutcome } from './FollowerSkirmish';
import type { Follower } from '../creatures/Follower';

/**
 * The living world in the game: binds the NPC hunters / chatter (npcLife.js) and the wild
 * Streetmon interactions (wildInteractions.js) to the real crowd and creatures, and draws what
 * they do: speech bubbles, HP bars, attacks (tracers, glowing shots, shockwaves, smoke), capture
 * pods thrown, shaking and popping, the hunters' own Streetmon.
 *
 * It also sets the AI radius: within `lod.activeRadius` of the player people and Streetmon get
 * their full behaviour; beyond it the crowd and the wild ones run a cheap position-only tick
 * every few frames, and hunts / fights out there are settled without FX.
 */

export interface LivingWorldConfig extends NpcLifeConfig, WildConfig {
  lod: { activeRadius: number; cellSize: number; wildLiteEvery: number; pedLiteEvery: number; fxRadius: number };
  bubbles: { height: number; fadeNear: number; fadeFar: number; maxVisible: number; fadeSeconds: number; maxChars: number };
  aggro: {
    autoBattle: boolean;
    attackRange: number;
    attackEvery: [number, number];
    damageBase: number;
    damagePerLevel: number;
    typeBonus: Record<string, number>;
    giveUpDistance: number;
    hideSeconds: number;
    calmAfterSeconds: number;
    knockBack: number;
  };
  /** Your Streetmon fighting wild ones on its own (FollowerSkirmish). */
  followerFights?: Partial<SkirmishConfig>;
}

export interface LivingWorldDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  effects: Effects;
  dmgNums: DamageNumbers;
  /** Move effects and sounds (the same as battles'); without it, the simpler built-in look. */
  moveFx?: MoveFx;
  peds: PedestrianSystem;
  spawns: SpawnSystem;
  vehicles: VehicleManager;
  models: CreatureModels;
  layout: CityLayout;
  /** A capture item's mesh (CatchVisuals.makeItem). */
  makePod(id: string): THREE.Object3D;
  /** Street address for a point ("5th Ave & 34th St"). */
  placeName(x: number, z: number): string;
  /** Extra test for standing room (street props); walls and buildings are checked already. */
  clear?(x: number, z: number): boolean;
  /** Where the player is, and whether new ambient life should start. */
  player(): { x: number; y: number; z: number; inCar: boolean; layer: string };
  enabled(): boolean;
  /** Game time (s) and time of day. */
  now(): number;
  time(): TimeOfDay;
  /** Chatter extras: race tracks, racers, crews. */
  lore: { tracks: string[]; racers: string[]; crews: string[] };
  /** A street conversation fitting the moment (weather, night, the neighbourhood, you): lines A, B, A... */
  contextTalk?(): string[] | null;
  /** Your Streetmon out walking with you (it fights nearby wild ones on its own). */
  follower?: Follower;
  /** A fight of yours ended: `ours` is your Streetmon, `wild` the one it fought. */
  onSkirmish?(outcome: SkirmishOutcome, wild: WildCreature, ours: Creature, why: string): void;
}

interface MonView {
  personId: number;
  creature: Creature;
  inst: CreatureInstance | null;
  x: number;
  z: number;
  heading: number;
  removeAt: number;
}

interface PodView {
  personId: number;
  wildId: number;
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  landed: boolean;
  wobble: number;
  back: number;
}

interface Shot {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  onHit: () => void;
}

interface Wave {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
}

const DISTRICT_NAMES: Record<District, string> = { uptown: 'Uptown', midtown: 'Midtown', downtown: 'Downtown', park: 'Central Green', waterfront: 'the Waterfront' };

export class LivingWorld {
  readonly npc: NpcLifeManager;
  readonly wildAi: WildInteractionManager;
  readonly bubbles: SpeechBubbles;
  readonly bars: HealthBars;
  readonly skirmish: FollowerSkirmish;
  /** What's simulated where (last frame) and what it cost. */
  readonly stats = { pedsActive: 0, pedsLite: 0, wildActive: 0, wildLite: 0, hunters: 0, duels: 0, conversations: 0, packs: 0, ms: 0 };
  private readonly pedIds = new WeakMap<Ped, number>();
  private readonly pedById = new Map<number, Ped>();
  private nextPed = 1;
  private readonly wildById = new Map<number, WildCreature>();
  private readonly fighters = new WeakMap<Creature, Fighter>();
  private readonly mons = new Map<number, MonView>();
  private readonly pods = new Map<number, PodView>();
  private readonly shots: Shot[] = [];
  private readonly waves: Wave[] = [];
  private spawningFollowers = false;
  private readonly tmp = new THREE.Vector3();
  private readonly orbGeo = new THREE.SphereGeometry(0.16, 10, 8);
  private readonly ringGeo = new THREE.RingGeometry(0.5, 0.75, 32);
  private readonly orbMats = new Map<string, THREE.MeshBasicMaterial>();
  /** Duel health bars waiting (game seconds) before they go. */
  private readonly barLinger: Array<{ key: string; id: number; t: number }> = [];
  private readonly chart: Record<string, Record<string, number>>;

  constructor(
    private readonly d: LivingWorldDeps,
    readonly cfg: LivingWorldConfig,
  ) {
    this.chart = DATA.chart as Record<string, Record<string, number>>;
    this.bubbles = new SpeechBubbles(d.scene, cfg.bubbles);
    this.bars = new HealthBars(d.scene, { near: cfg.bubbles.fadeNear, far: cfg.bubbles.fadeFar });
    // The AI radius applies to the crowd and the wild ones too.
    d.spawns.lod.activeRadius = cfg.lod.activeRadius;
    d.spawns.lod.liteEvery = cfg.lod.wildLiteEvery;
    d.peds.lod.activeRadius = cfg.lod.activeRadius;
    d.peds.lod.liteEvery = cfg.lod.pedLiteEvery;
    Object.assign(d.spawns.aggro, {
      autoBattle: cfg.aggro.autoBattle,
      attackRange: cfg.aggro.attackRange,
      attackEvery: cfg.aggro.attackEvery,
      damageBase: cfg.aggro.damageBase,
      damagePerLevel: cfg.aggro.damagePerLevel,
      typeBonus: cfg.aggro.typeBonus,
      giveUpDistance: cfg.aggro.giveUpDistance,
      hideSeconds: cfg.aggro.hideSeconds,
      calmAfterSeconds: cfg.aggro.calmAfterSeconds,
    });
    this.npc = new NpcLifeManager({ config: cfg, chart: this.chart, adapter: this.npcAdapter() });
    this.wildAi = new WildInteractionManager({ config: cfg, chart: this.chart, adapter: this.wildAdapter() });
    this.skirmish = new FollowerSkirmish({ ...SKIRMISH_DEFAULTS, ...(cfg.followerFights ?? {}) }, this.skirmishAdapter(), this.chart);
  }

  // ------------------------------------------------------------------ hooks from the game

  /** A wild Streetmon appeared (packs). */
  onSpawned(w: WildCreature): void {
    if (this.spawningFollowers) return;
    this.wildById.set(w.id, w);
    this.wildAi.onSpawn(this.wildMon(w));
  }

  /** The player started a battle with this one: whoever had it lets go. */
  onPlayerBattle(w: WildCreature): void {
    w.heldBy = null;
    w.script = null;
    w.faceAt = null;
    w.inPod = false;
    if (w.inst) w.inst.root.visible = true;
    this.bars.remove(`w${w.id}`);
  }

  /** A heavy explosion (cars, tank shells). */
  explosion(x: number, z: number, radius: number): void {
    this.wildAi.explosion(x, z, radius);
  }

  /** Ends everything (leaving the street, loading a save). */
  clear(): void {
    this.skirmish.end('broken', 'cleared');
    this.npc.clear();
    this.wildAi.clear();
    for (const id of [...this.mons.keys()]) this.dropMon(id, false);
    for (const id of [...this.pods.keys()]) this.dropPod(id);
    for (const s of this.shots) s.mesh.removeFromParent();
    this.shots.length = 0;
    for (const w of this.waves) w.mesh.removeFromParent();
    this.waves.length = 0;
    this.bubbles.clear();
    this.bars.clear();
  }

  // ------------------------------------------------------------------ per frame

  /** A hunt or a turf fight going on within `r` metres of (x, z), if any (for tips). */
  sceneNear(x: number, z: number, r: number): 'hunter' | 'duel' | null {
    for (const h of this.npc.hunters) {
      const w = h.target !== null && h.mon ? this.wildById.get(h.target) : undefined;
      if (w && Math.hypot(w.x - x, w.z - z) < r) return 'hunter';
    }
    for (const d of this.wildAi.duels) {
      const w = this.wildById.get(d.a);
      if (w && Math.hypot(w.x - x, w.z - z) < r) return 'duel';
    }
    return null;
  }

  update(dt: number): void {
    for (let i = this.barLinger.length - 1; i >= 0; i--) {
      const b = this.barLinger[i];
      if ((b.t -= dt) > 0) continue;
      this.barLinger.splice(i, 1);
      const w = this.wildById.get(b.id);
      if (!w || !w.heldBy) this.bars.remove(b.key);
    }
    const t0 = performance.now();
    const P = this.d.player();
    const R = this.cfg.lod.activeRadius;
    const cam = this.d.camera.getWorldPosition(this.tmp);
    const enabled = this.d.enabled() && P.layer === 'street';
    // Up on the roofs or down in the sewers: whatever was going on in the street is over.
    if (P.layer !== 'street' && (this.npc.hunters.length || this.npc.conversations.length || this.wildAi.duels.length)) this.clear();
    // Snapshots.
    this.pedById.clear();
    const people: Person[] = [];
    for (const p of this.d.peds.peds) {
      if (p.role !== 'civ') continue;
      let id = this.pedIds.get(p);
      if (id === undefined) this.pedIds.set(p, (id = this.nextPed++));
      this.pedById.set(id, p);
      const ok = p.state === 'walk' || p.state === 'cross' || p.state === 'return' || p.state === 'wait';
      people.push({ id, x: p.x, z: p.z, layer: 'street', free: ok && !p.pinned, walking: ok && p.state !== 'wait', ctrl: p.state === 'script' ? p.ctrl ?? null : null });
    }
    this.wildById.clear();
    const wildViews: WildView[] = [];
    const wildMons: WildMon[] = [];
    for (const w of this.d.spawns.wild) {
      if (w.removed) continue;
      this.wildById.set(w.id, w);
      const v = this.wildMon(w);
      wildMons.push(v);
      wildViews.push({ id: v.id, x: v.x, z: v.z, layer: v.layer, name: w.spec.name, speciesId: w.spec.id, level: w.creature.level, hp: v.hp, maxHp: v.maxHp, fighter: v.fighter, free: v.free && w.state !== 'flee', heldBy: v.heldBy });
    }
    const cars = this.d.vehicles.cars
      .filter((c) => !c.destroyed && Math.hypot(c.position.x - P.x, c.position.z - P.z) < R + 20)
      .map((c) => {
        const v = c.body.linvel();
        return { x: c.position.x, z: c.position.z, vx: v.x, vz: v.z, kmh: Math.hypot(v.x, v.z) * 3.6 };
      });
    // People's district / street only for the ones near the camera (bragging details).
    for (const p of people) if (Math.hypot(p.x - cam.x, p.z - cam.z) < 50) {
      p.district = DISTRICT_NAMES[districtAt(this.d.layout, p.x, p.z)];
      p.street = this.d.placeName(p.x, p.z);
    }
    const n = this.npc.update(dt, { people, wild: wildViews, player: P, camera: { x: cam.x, z: cam.z }, activeRadius: R, enabled });
    const w = this.wildAi.update(dt, { wild: wildMons, cars, player: P, playerInCar: P.inCar, activeRadius: R, enabled });
    this.skirmish.update(dt, { follower: this.followerView(), player: { x: P.x, z: P.z, onFoot: !P.inCar }, wild: wildMons, enabled });
    this.animate(dt);
    this.bubbles.update(dt, this.d.camera);
    this.bars.update(this.d.camera);
    const S = this.stats;
    S.pedsActive = this.d.peds.tiers.active;
    S.pedsLite = this.d.peds.tiers.lite;
    S.wildActive = this.d.spawns.tiers.active;
    S.wildLite = this.d.spawns.tiers.lite;
    S.hunters = n.hunters;
    S.conversations = n.conversations;
    S.duels = w.duels;
    S.packs = w.packs;
    S.ms += (performance.now() - t0 - S.ms) * 0.1;
  }

  // ------------------------------------------------------------------ views

  private fighter(c: Creature): Fighter {
    let f = this.fighters.get(c);
    if (!f || f.level !== c.level) {
      const st = stats(c);
      const sp = species(c.speciesId);
      f = { level: c.level, attack: st.attack, defense: st.defense, speed: st.speed, types: sp.types, moves: c.moves.map((m) => move(m)).map((m) => ({ name: m.name, type: m.type, power: m.power })) };
      this.fighters.set(c, f);
    }
    return f;
  }

  private wildMon(w: WildCreature): WildMon {
    const held = w.heldBy ?? (w.pinned || w.state === 'engaged' ? 'player' : w.eventTag !== undefined ? 'event' : null);
    const free = !w.removed && !w.inPod && !w.pinned && !w.heldBy && w.eventTag === undefined && w.creature.hp > 0 && (w.state === 'idle' || w.state === 'wander' || w.state === 'watch' || w.state === 'flee');
    return {
      id: w.id,
      x: w.x,
      z: w.z,
      layer: w.biome,
      speciesId: w.spec.id,
      temperament: w.temperament,
      rarity: w.spec.spawn.rarity,
      state: w.state,
      hp: w.creature.hp,
      maxHp: maxHp(w.creature),
      fighter: this.fighter(w.creature),
      free,
      calm: this.d.now() < w.calmUntil,
      heldBy: held,
      fleeFromX: w.tx,
      fleeFromZ: w.tz,
    };
  }

  private head(id: number): () => { x: number; y: number; z: number } | null {
    return () => {
      const p = this.pedById.get(id);
      if (!p || p.state === 'dead') return null;
      return { x: p.x, y: p.y + this.cfg.bubbles.height, z: p.z };
    };
  }

  private wildTop(id: number): () => { x: number; y: number; z: number } | null {
    return () => {
      const w = this.wildById.get(id);
      if (!w || w.removed || w.inPod) return null;
      return { x: w.x, y: w.y + w.spec.model.height + 0.35, z: w.z };
    };
  }

  private monTop(personId: number): () => { x: number; y: number; z: number } | null {
    return () => {
      const m = this.mons.get(personId);
      if (!m || m.removeAt) return null;
      return { x: m.x, y: this.d.peds.groundY(m.x, m.z) + species(m.creature.speciesId).model.height + 0.35, z: m.z };
    };
  }

  /** Close enough to the camera to bother drawing. */
  private visible(x: number, z: number): boolean {
    const c = this.d.camera.getWorldPosition(this.tmp);
    return Math.hypot(x - c.x, z - c.z) < this.cfg.lod.fxRadius;
  }

  /** (Wild Streetmon and yours have their labels all the time now: CreatureLabels in the HUD.) */
  showWildBars = false;

  private wildBar(w: WildCreature): void {
    if (!this.showWildBars) return;
    this.bars.set(`w${w.id}`, this.wildTop(w.id), w.creature.hp, maxHp(w.creature), w.creature.level, typeInfo(w.spec.types[0]).color);
  }

  // ------------------------------------------------------------------ your Streetmon's own fights

  private followerView(): { x: number; z: number; hp: number; maxHp: number; fighter: Fighter; ready: boolean } | null {
    const f = this.d.follower;
    const c = f?.creature;
    if (!f || !f.summoned || !c) return null;
    return { x: f.x, z: f.z, hp: c.hp, maxHp: maxHp(c), fighter: this.fighter(c), ready: f.visible && c.hp > 0 && !f.work };
  }

  private followerTop(): () => { x: number; y: number; z: number } | null {
    return () => {
      const f = this.d.follower;
      return f && f.visible ? { x: f.x, y: f.y + f.height + 0.35, z: f.z } : null;
    };
  }

  private followerBar(): void {
    const f = this.d.follower;
    const c = f?.creature;
    if (!c || !this.showWildBars) return;
    this.bars.set('yours', this.followerTop(), c.hp, maxHp(c), c.level, '#7dff9a');
  }

  private skirmishAdapter(): ConstructorParameters<typeof FollowerSkirmish>[1] {
    const get = (id: number): WildCreature | null => {
      const w = this.wildById.get(id);
      return w && !w.removed ? w : null;
    };
    const mid = (x: number, y: number, z: number, h: number): THREE.Vector3 => new THREE.Vector3(x, y + Math.min(0.8, h * 0.5), z);
    return {
      hold: (id, tag) => {
        const w = get(id);
        if (!w) return tag === null;
        if (tag === null) {
          if (w.heldBy === SKIRMISH_TAG) {
            w.heldBy = null;
            w.script = null;
            w.faceAt = null;
          }
          return true;
        }
        if (w.pinned || w.state === 'engaged' || w.inPod || w.heldBy || w.eventTag !== undefined) return false;
        w.heldBy = tag;
        w.script = null;
        w.faceAt = null;
        return true;
      },
      lineOfSight: (ax, az, bx, bz) => {
        const n = Math.floor(Math.hypot(bx - ax, bz - az));
        for (let k = 1; k < n; k++) if (this.d.peds.blocked(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
        return true;
      },
      followerGoTo: (x, z) => {
        const f = this.d.follower;
        if (f) f.goal = { x, z };
      },
      followerFollow: () => {
        const f = this.d.follower;
        if (!f) return;
        f.goal = null;
        f.faceAt = null;
        this.barLinger.push({ key: 'yours', id: -1, t: 1.5 });
      },
      face: (id, fx, fz) => {
        const w = get(id);
        const f = this.d.follower;
        if (w) w.faceAt = { x: fx, z: fz };
        if (w && f) f.faceAt = { x: w.x, z: w.z };
      },
      wildGoTo: (id, x, z) => {
        const w = get(id);
        if (w) w.script = { x, z, run: false };
      },
      hitWild: (id, hit) => {
        const w = get(id);
        const f = this.d.follower;
        if (!w || !f) return 0;
        w.creature.hp = Math.max(0, w.creature.hp - hit.damage);
        f.playOnce('attack', 0.6);
        this.attackFx(hit, mid(f.x, f.y, f.z, f.height), mid(w.x, w.y, w.z, w.spec.model.height), () => {
          if (!w.removed) {
            w.inst?.play(w.creature.hp > 0 ? 'hurt' : 'faint', 0.05);
            w.animLock = performance.now() + 450;
          }
        });
        this.wildBar(w);
        this.followerBar();
        return w.creature.hp;
      },
      hitFollower: (id, hit) => {
        const w = get(id);
        const f = this.d.follower;
        const c = f?.creature;
        if (!w || !f || !c) return 0;
        c.hp = Math.max(0, c.hp - hit.damage);
        w.inst?.play('attack', 0.05);
        w.animLock = performance.now() + 600;
        this.attackFx(hit, mid(w.x, w.y, w.z, w.spec.model.height), mid(f.x, f.y, f.z, f.height), () => f.playOnce('hurt', 0.45));
        this.wildBar(w);
        this.followerBar();
        return c.hp;
      },
      started: (id) => {
        const w = get(id);
        if (w) this.wildBar(w);
        this.followerBar();
      },
      ended: (id, outcome, why) => {
        const w = get(id);
        const f = this.d.follower;
        if (w) this.barLinger.push({ key: `w${id}`, id, t: 1.5 });
        if (w && f) {
          if (outcome === 'won' && w.creature.hp > 0) this.d.spawns.flee(w, f.x, f.z, 8);
          if (outcome === 'retreat') w.calmUntil = this.d.now() + 30;
        }
        if (w && f?.creature) this.d.onSkirmish?.(outcome, w, f.creature, why);
      },
    };
  }

  // ------------------------------------------------------------------ NPC adapter

  private npcAdapter(): ConstructorParameters<typeof NpcLifeManager>[0]['adapter'] {
    const ped = (id: number): Ped | null => this.pedById.get(id) ?? null;
    return {
      take: (id, tag) => {
        const p = ped(id);
        if (!p || p.role !== 'civ' || p.state === 'dead' || p.state === 'fly' || p.state === 'down' || p.state === 'flee' || p.state === 'cop') return false;
        p.state = 'script';
        p.ctrl = tag;
        p.speed = 0;
        return true;
      },
      release: (id, how, fx, fz) => {
        const p = ped(id);
        if (!p) return;
        p.ctrl = null;
        if (how === 'flee') this.d.peds.flee(p, fx ?? p.x, fz ?? p.z);
        else if (p.state === 'script') this.d.peds.resume(p);
      },
      walkTo: (id, x, z, speed, dt) => {
        const p = ped(id);
        return p ? this.d.peds.moveToward(p, dt, x, z, speed) : 0;
      },
      face: (id, x, z) => {
        const p = ped(id);
        if (!p) return;
        p.heading = Math.atan2(-(z - p.z), x - p.x);
        p.speed = 0;
      },
      sendOut: (id, wildId, tag) => {
        const p = ped(id);
        const w = this.wildById.get(wildId);
        if (!p || !w) return null;
        const table = spawnTable(districtAt(this.d.layout, p.x, p.z), this.d.time(), 'street');
        const spec = pickSpecies(table.length ? table : spawnTable('midtown', 'day', 'street'), Math.random());
        if (!spec) return null;
        const level = clamp(w.creature.level + rangeInt(this.cfg.hunters.levelOffset), 2, 100);
        const c = createCreature(spec.id, level);
        // Between the hunter and the wild one, a bit toward the wild one.
        const dx = w.x - p.x;
        const dz = w.z - p.z;
        const dd = Math.hypot(dx, dz) || 1;
        // (Never inside a wall, a car or a prop: the nearest clear spot to that.)
        const spot = nearestClear(p.x + (dx / dd) * 1.7, p.z + (dz / dd) * 1.7, (x, z) => !this.d.peds.blocked(x, z) && (this.d.clear?.(x, z) ?? true), 3);
        const mx = spot?.x ?? p.x;
        const mz = spot?.z ?? p.z;
        const view: MonView = { personId: id, creature: c, inst: null, x: mx, z: mz, heading: Math.atan2(w.x - mx, w.z - mz), removeAt: 0 };
        this.mons.set(id, view);
        void this.d.models.instance(spec.id, false).then((inst) => {
          if (this.mons.get(id) !== view || view.removeAt) {
            inst.dispose();
            return;
          }
          view.inst = inst;
          this.d.scene.add(inst.root);
          inst.play('idle');
        });
        if (this.visible(mx, mz)) this.d.effects.sparks(mx, this.d.peds.groundY(mx, mz) + 0.4, mz, 10);
        w.heldBy = tag;
        w.script = null;
        w.faceAt = { x: mx, z: mz };
        this.wildBar(w);
        this.bars.set(`m${id}`, this.monTop(id), c.hp, maxHp(c), level, '#ffd23f');
        return { name: spec.name, speciesId: spec.id, level, hp: c.hp, maxHp: maxHp(c), fighter: this.fighter(c) } satisfies HunterMon;
      },
      strike: (e) => {
        const w = this.wildById.get(e.wildId);
        const m = this.mons.get(e.hunter);
        if (!w || !m) return 0;
        const gy = this.d.peds.groundY(m.x, m.z);
        const mFrom = new THREE.Vector3(m.x, gy + 0.6, m.z);
        const wAt = new THREE.Vector3(w.x, w.y + Math.min(0.8, w.spec.model.height * 0.5), w.z);
        if (e.from === 'mon') {
          w.creature.hp = Math.max(0, w.creature.hp - e.hit.damage);
          m.inst?.play('attack', 0.05);
          this.attackFx(e.hit, mFrom, wAt, () => {
            if (!w.removed) w.inst?.play(w.creature.hp > 0 ? 'hurt' : 'faint', 0.05);
          });
          if (w.creature.hp <= 0) this.d.spawns.faint(w);
          this.wildBar(w);
          return w.creature.hp;
        }
        w.inst?.play('attack', 0.05);
        w.animLock = performance.now() + 600;
        m.creature.hp = Math.max(0, e.monHp ?? m.creature.hp - e.hit.damage);
        this.attackFx(e.hit, wAt, mFrom, () => m.inst?.play(m.creature.hp > 0 ? 'hurt' : 'faint', 0.05));
        this.bars.set(`m${e.hunter}`, this.monTop(e.hunter), m.creature.hp, maxHp(m.creature), m.creature.level, '#ffd23f');
        return m.creature.hp;
      },
      recall: (id, fainted) => this.dropMon(id, fainted),
      throwPod: (id, wildId, itemId) => {
        const p = ped(id);
        const w = this.wildById.get(wildId);
        if (!p || !w) return;
        this.dropPod(id);
        const mesh = this.d.makePod(itemId);
        mesh.scale.setScalar(1.3);
        const from = new THREE.Vector3(p.x, p.y + 1.4, p.z);
        const to = new THREE.Vector3(w.x, w.y + 0.25, w.z);
        mesh.position.copy(from);
        this.d.scene.add(mesh);
        this.pods.set(id, { personId: id, wildId, mesh, from, to, t: 0, dur: this.cfg.hunters.throwSeconds, landed: false, wobble: 0, back: 0 });
        audio.swing(false);
      },
      rollCatch: (wildId, itemId) => {
        const w = this.wildById.get(wildId);
        if (!w) return { shakes: 0, caught: false };
        const r = rollCatch(w.creature, item(itemId) as CaptureItem, true);
        return { shakes: r.shakes, caught: r.caught };
      },
      shake: (id) => {
        const pod = this.pods.get(id);
        if (pod) pod.wobble = 0.45;
      },
      captured: (id, wildId, quiet) => {
        const w = this.wildById.get(wildId);
        const pod = this.pods.get(id);
        if (w) {
          if (!quiet && this.visible(w.x, w.z)) this.d.effects.sparks(w.x, w.y + 0.4, w.z, 18);
          w.inPod = true;
          if (w.inst) w.inst.root.visible = false;
          this.d.spawns.remove(w);
          this.bars.remove(`w${w.id}`);
        }
        if (pod) {
          // The pod flies back to the hunter.
          pod.back = 0.001;
          pod.from.copy(pod.mesh.position);
        }
      },
      breakFree: (id, wildId) => {
        const w = this.wildById.get(wildId);
        if (w) {
          w.inPod = false;
          if (w.inst) w.inst.root.visible = true;
          if (this.visible(w.x, w.z)) this.d.effects.sparks(w.x, w.y + 0.3, w.z, 14);
          w.inst?.play('attack', 0.05);
          this.wildBar(w);
        }
        this.dropPod(id);
      },
      freeWild: (wildId, how) => {
        const w = this.wildById.get(wildId);
        if (!w || w.removed) return;
        w.heldBy = null;
        w.script = null;
        w.faceAt = null;
        w.inPod = false;
        if (w.inst) w.inst.root.visible = true;
        this.bars.remove(`w${w.id}`);
        if (how === 'fainted' || w.creature.hp <= 0) this.d.spawns.faint(w);
        else if (how === 'escape') this.d.spawns.flee(w, w.x - Math.sin(w.heading) * 3, w.z - Math.cos(w.heading) * 3, 8);
        else {
          w.calmUntil = this.d.now() + (how === 'won' ? 25 : 12);
          w.state = 'idle';
          w.stateTime = 1;
        }
      },
      startTalk: (a, b, tag) => {
        const A = ped(a);
        const B = ped(b);
        if (!A || !B) return false;
        for (const p of [A, B]) if (p.role !== 'civ' || p.state === 'script' || p.state === 'flee' || p.state === 'dead' || p.state === 'fly' || p.state === 'down') return false;
        for (const [p, o] of [
          [A, B],
          [B, A],
        ] as const) {
          p.state = 'script';
          p.ctrl = tag;
          p.speed = 0;
          p.heading = Math.atan2(-(o.z - p.z), o.x - p.x);
        }
        return true;
      },
      endTalk: (a, b) => {
        for (const id of [a, b]) {
          const p = ped(id);
          if (p && p.state === 'script' && p.ctrl === 'talk') {
            p.ctrl = null;
            this.d.peds.resume(p);
          }
          this.bubbles.remove(`p${id}`);
        }
      },
      say: (id, text, seconds) => {
        const p = ped(id);
        if (!p) return;
        this.bubbles.say(`p${id}`, this.head(id), text, seconds, /!$/.test(text) && text.length < 26 ? 'shout' : 'talk');
      },
      chatVars: (topic) => this.chatVars(topic),
      contextConversation: () => this.d.contextTalk?.() ?? null,
    };
  }

  /** Values for chatter lines, from the real game data around the camera. */
  private chatVars(topic: Topic): Record<string, string | number | undefined> {
    const cam = this.d.camera.getWorldPosition(this.tmp);
    const district = districtAt(this.d.layout, cam.x, cam.z);
    const table = spawnTable(district, this.d.time(), 'street');
    const sp = table.length ? pickSpecies(table, Math.random()) : null;
    // A real "X beats Y" pair from the type chart.
    const pairs: Array<[TypeId, TypeId]> = [];
    for (const [a, row] of Object.entries(DATA.chart)) for (const [b, m] of Object.entries(row)) if (m >= 2) pairs.push([a as TypeId, b as TypeId]);
    const [strong, weak] = pick(pairs);
    const L = this.d.lore;
    void topic;
    return {
      species: sp?.name,
      level: rangeInt([4, 18]),
      district: DISTRICT_NAMES[district],
      street: this.d.placeName(cam.x, cam.z),
      strong: typeInfo(strong).name,
      weak: typeInfo(weak).name,
      track: L.tracks.length ? pick(L.tracks) : undefined,
      racer: L.racers.length ? pick(L.racers) : undefined,
      crew: L.crews.length ? pick(L.crews) : undefined,
      item: pick(['net', 'crate', 'cage']),
    };
  }

  // ------------------------------------------------------------------ wild adapter

  private wildAdapter(): ConstructorParameters<typeof WildInteractionManager>[0]['adapter'] {
    const get = (id: number): WildCreature | null => {
      const w = this.wildById.get(id);
      return w && !w.removed ? w : null;
    };
    return {
      hold: (id, tag) => {
        const w = get(id);
        if (!w) return tag === null;
        if (tag === null) {
          if (w.heldBy?.startsWith('duel:')) {
            w.heldBy = null;
            w.script = null;
            w.faceAt = null;
          }
          return true;
        }
        if (w.pinned || w.state === 'engaged' || w.inPod || w.heldBy) return false;
        w.heldBy = tag;
        w.script = null;
        w.faceAt = null;
        return true;
      },
      goTo: (id, x, z, run) => {
        const w = get(id);
        if (!w) return;
        w.script = { x, z, run };
        if (!w.heldBy) {
          // A pack follower catching up: wander there.
          w.tx = x;
          w.tz = z;
          w.homeX = x;
          w.homeZ = z;
          w.state = 'wander';
          w.stateTime = 12;
        }
      },
      face: (id, x, z) => {
        const w = get(id);
        if (w) w.faceAt = { x, z };
      },
      strike: (e) => {
        const a = get(e.attacker);
        const b = get(e.defender);
        if (!a || !b) return 0;
        b.creature.hp = Math.max(0, b.creature.hp - e.hit.damage);
        a.inst?.play('attack', 0.05);
        a.animLock = performance.now() + 600;
        this.attackFx(e.hit, new THREE.Vector3(a.x, a.y + Math.min(0.8, a.spec.model.height * 0.5), a.z), new THREE.Vector3(b.x, b.y + Math.min(0.8, b.spec.model.height * 0.5), b.z), () => {
          if (!b.removed) {
            b.inst?.play(b.creature.hp > 0 ? 'hurt' : 'faint', 0.05);
            b.animLock = performance.now() + 450;
          }
        });
        this.wildBar(a);
        this.wildBar(b);
        return b.creature.hp;
      },
      flee: (id, fx, fz, seconds) => {
        const w = get(id);
        if (w) this.d.spawns.flee(w, fx, fz, seconds);
      },
      claim: (id, x, z, calm) => {
        const w = get(id);
        if (!w) return;
        w.homeX = x;
        w.homeZ = z;
        w.calmUntil = this.d.now() + calm;
        if (this.visible(x, z)) this.d.effects.sparks(w.x, w.y + w.spec.model.height + 0.2, w.z, 8);
      },
      setHome: (id, x, z, r) => {
        const w = get(id);
        if (!w) return;
        w.homeX = x;
        w.homeZ = z;
        w.wanderRadius = r;
      },
      joinChase: (id) => {
        const w = get(id);
        if (!w || w.temperament !== 'aggro') return;
        w.state = 'approach';
        w.stateTime = 15;
      },
      lineOfSight: (ax, az, bx, bz) => {
        const n = Math.floor(Math.hypot(bx - ax, bz - az));
        for (let k = 1; k < n; k++) if (this.d.peds.blocked(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
        return true;
      },
      spawnFollowers: (leaderId, n) => {
        const L = get(leaderId);
        if (!L) return [];
        const ids: number[] = [];
        this.spawningFollowers = true;
        try {
          for (let i = 0; i < n; i++) {
            // Packs fill the street cap, never go over it.
            if (this.d.spawns.wild.length >= this.d.spawns.streetCap) break;
            for (let tries = 0; tries < 8; tries++) {
              const a = Math.random() * Math.PI * 2;
              const r = 1.6 + Math.random() * 2.2;
              const x = L.x + Math.cos(a) * r;
              const z = L.z + Math.sin(a) * r;
              if (this.d.peds.blocked(x, z) || this.d.peds.groundY(x, z) < 0.1) continue;
              const level = clamp(L.creature.level + rangeInt([-2, 0]), 2, 100);
              const f = this.d.spawns.spawn(L.spec, level, x, z, L.district, false, 'street');
              this.wildById.set(f.id, f);
              ids.push(f.id);
              break;
            }
          }
        } finally {
          this.spawningFollowers = false;
        }
        return ids;
      },
      duelEnded: (d) => {
        for (const id of [d.a, d.b]) {
          const key = `w${id}`;
          // Let the bars linger a moment (game time) so you see who won.
          this.barLinger.push({ key, id, t: 1.5 });
        }
      },
    };
  }

  // ------------------------------------------------------------------ FX

  private orbMat(color: string): THREE.MeshBasicMaterial {
    let m = this.orbMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false });
      this.orbMats.set(color, m);
    }
    return m;
  }

  /** The attack, by type: gunfire (muzzle and tracer), shockwaves, smoke, glowing shots. */
  private attackFx(hit: AmbientHit, from: THREE.Vector3, to: THREE.Vector3, onHit: () => void): void {
    const near = this.visible(to.x, to.z);
    const cam = this.d.camera.getWorldPosition(this.tmp);
    const dist = cam.distanceTo(to);
    const landed = (): void => {
      onHit();
      if (!near) return;
      this.d.effects.impact(to.x, to.y, to.z, hit.type === 'gun' || hit.type === 'concrete');
      this.d.effects.sparks(to.x, to.y, to.z, hit.crit || hit.mult >= 2 ? 10 : 5);
      if (hit.type === 'smoke') this.d.effects.tyreSmoke(to.x, to.y - 0.2, to.z, 1);
      if (hit.type === 'bass' || hit.type === 'wire') this.wave(to, typeInfo(hit.type as TypeId).color);
      this.d.dmgNums.spawn(to.x, to.y + 0.6, to.z, hit.damage, hit.crit ? 'crit' : hit.mult >= 2 ? 'weak' : 'hit');
    };
    if (!near) {
      landed();
      return;
    }
    // The battles' own move effects, with this fight's damage numbers on top.
    if (this.d.moveFx) {
      this.d.moveFx.typeAttack(hit.type, from, to, { crit: hit.crit, mult: hit.mult }, () => {
        onHit();
        this.d.dmgNums.spawn(to.x, to.y + 0.6, to.z, hit.damage, hit.crit ? 'crit' : hit.mult >= 2 ? 'weak' : 'hit');
      }, dist < 90);
      return;
    }
    if (hit.type === 'gun') {
      this.d.effects.muzzle(from.x, from.y, from.z, 0.6);
      this.d.effects.tracer(from.x, from.y, from.z, to.x, to.y, to.z);
      audio.gunshot('npc', from);
      landed();
      return;
    }
    if (hit.type === 'concrete') audio.thud();
    const mesh = new THREE.Mesh(this.orbGeo, this.orbMat(typeInfo(hit.type as TypeId).color));
    markBloom(mesh);
    mesh.position.copy(from);
    this.d.scene.add(mesh);
    this.shots.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: 0.32, arc: hit.type === 'concrete' ? 1.2 : 0.4, onHit: landed });
  }

  private wave(at: THREE.Vector3, color: string): void {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, this.d.peds.groundY(at.x, at.z) + 0.08, at.z);
    markBloom(mesh);
    this.d.scene.add(mesh);
    this.waves.push({ mesh, t: 0, dur: 0.45 });
  }

  private dropMon(personId: number, fainted: boolean): void {
    const m = this.mons.get(personId);
    if (!m) return;
    this.bars.remove(`m${personId}`);
    if (fainted && m.inst) {
      m.inst.play('faint', 0.05);
      m.removeAt = performance.now() + 1200;
      return;
    }
    if (this.visible(m.x, m.z)) this.d.effects.sparks(m.x, this.d.peds.groundY(m.x, m.z) + 0.4, m.z, 8);
    m.inst?.dispose();
    m.removeAt = 1;
    this.mons.delete(personId);
  }

  private dropPod(personId: number): void {
    const pod = this.pods.get(personId);
    if (!pod) return;
    pod.mesh.removeFromParent();
    this.pods.delete(personId);
  }

  private animate(dt: number): void {
    const now = performance.now();
    // Hunters' Streetmon.
    for (const [id, m] of this.mons) {
      if (m.removeAt && now >= m.removeAt) {
        m.inst?.dispose();
        this.mons.delete(id);
        continue;
      }
      const inst = m.inst;
      if (!inst) continue;
      const pod = this.pods.get(id);
      const target = pod ? this.wildById.get(pod.wildId) : null;
      const h = [...this.npc.hunters].find((x) => x.personId === id);
      const w = h?.target !== null && h?.target !== undefined ? this.wildById.get(h.target) : target;
      if (w) m.heading = Math.atan2(w.x - m.x, w.z - m.z);
      inst.root.position.set(m.x, this.d.peds.groundY(m.x, m.z), m.z);
      inst.root.rotation.y = m.heading;
      inst.mixer.update(dt);
    }
    // Pods: flight, shakes, return.
    for (const pod of this.pods.values()) {
      const m = pod.mesh;
      if (pod.back > 0) {
        pod.back += dt / 0.5;
        const p = this.pedById.get(pod.personId);
        const to = p ? this.tmp.set(p.x, p.y + 1.3, p.z) : pod.from;
        m.position.lerpVectors(pod.from, to, Math.min(1, pod.back));
        m.position.y += Math.sin(Math.min(1, pod.back) * Math.PI) * 0.8;
        m.scale.setScalar(1.3 * (1 - Math.min(1, pod.back) * 0.7));
        if (pod.back >= 1) this.dropPod(pod.personId);
        continue;
      }
      if (!pod.landed) {
        pod.t += dt / pod.dur;
        const t = Math.min(1, pod.t);
        m.position.lerpVectors(pod.from, pod.to, t);
        m.position.y += Math.sin(t * Math.PI) * 1.6;
        m.rotation.x += dt * 9;
        if (t >= 1) {
          pod.landed = true;
          m.rotation.set(0, m.rotation.y, 0);
          const w = this.wildById.get(pod.wildId);
          if (w) {
            w.inPod = true;
            if (w.inst) w.inst.root.visible = false;
            if (this.visible(w.x, w.z)) this.d.effects.sparks(w.x, w.y + 0.4, w.z, 12);
            this.bars.remove(`w${w.id}`);
          }
          m.position.y = this.d.peds.groundY(pod.to.x, pod.to.z) + 0.2;
        }
        continue;
      }
      if (pod.wobble > 0) {
        pod.wobble -= dt;
        m.rotation.z = Math.sin(pod.wobble * 26) * 0.35 * (pod.wobble / 0.45);
      } else m.rotation.z = 0;
    }
    // Keep swallowed creatures hidden (their model may load late).
    for (const w of this.wildById.values()) if (w.inPod && w.inst) w.inst.root.visible = false;
    // Shots in flight.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt / s.dur;
      const t = Math.min(1, s.t);
      s.mesh.position.lerpVectors(s.from, s.to, t);
      s.mesh.position.y += Math.sin(t * Math.PI) * s.arc;
      if (t >= 1) {
        s.mesh.removeFromParent();
        this.shots.splice(i, 1);
        s.onHit();
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt / w.dur;
      w.mesh.scale.setScalar(1 + w.t * 3.5);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - w.t));
      if (w.t >= 1) {
        w.mesh.removeFromParent();
        (w.mesh.material as THREE.Material).dispose();
        this.waves.splice(i, 1);
      }
    }
  }
}
