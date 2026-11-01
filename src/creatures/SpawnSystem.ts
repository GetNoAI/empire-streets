import * as THREE from 'three';
import { playCry } from './CreatureCry';
import type { PedestrianSystem } from '../peds/PedestrianSystem';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { CityLayout } from '../world/CityLayout';
import type { CreatureInstance, CreatureModels } from './CreatureModels';
import { createCreature, type Creature } from './Creature';
import { layerOfBiome, species, typeInfo, type Biome, type District, type SpeciesSpec, type Temperament, type TimeOfDay } from './Data';
import { SmartFleeBehavior, newFleeMemory, steerWithRepulsion, type FleeMemory } from './SmartFlee';
import { ObstacleField, WallGrid, moveWithCollision, wallRepulsion } from './WallProbe';
import {
  FLIGHT,
  SKY,
  SPAWN,
  capFor,
  deepLevelBonus,
  deepTable,
  skyTable,
  flightTarget,
  detectionRadius,
  districtAt,
  hostileAt,
  moveSpeed,
  pickSpecies,
  revealRadius,
  rollLevel,
  storyAllows,
  storyLevel,
  spawnTable,
  type Stealth,
} from './SpawnRules';

/**
 * Wild Streetmon in the city. Spawns them out of sight around the player according to district,
 * time of day and rarity (with density caps), runs their behaviour (wander, flee, aggro) and
 * despawns them when they're far away or long out of view.
 */

export type WildState = 'wander' | 'idle' | 'watch' | 'flee' | 'approach' | 'attack' | 'engaged' | 'fainted' | 'knocked';

/**
 * Ground for a non-street layer (rooftops, sewers): registered by those world modules so wild
 * Streetmon can stand, walk and spawn there.
 */
export interface LayerGround {
  /** Height a creature stands at, or null where it can't stand (a gap between roofs, a wall). */
  ground(x: number, z: number, yNear: number): number | null;
  /** A spawn point in this layer near the player, or null if there's nowhere right now. */
  spawnPoint(player: THREE.Vector3, rand: () => number): { x: number; y: number; z: number; district: District; level?: number } | null;
  /** The nearest point it can be at (a pond Streetmon that ended up on the bank heads back here). */
  nearest?(x: number, z: number): { x: number; z: number };
}

export interface WildCreature {
  id: number;
  creature: Creature;
  spec: SpeciesSpec;
  /** Drawn this many times its species' size (raid legendaries tower over the street). */
  sizeScale?: number;
  temperament: Temperament;
  district: District;
  /** World layer it lives in. */
  biome: Biome;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  state: WildState;
  stateTime: number;
  tx: number;
  tz: number;
  homeX: number;
  homeZ: number;
  /** Seconds out of view while far away (for despawning). */
  hidden: number;
  /** Swallowed by a capture pod (hidden, can't be targeted). */
  inPod?: boolean;
  /** Ignores the player until this time (after a fight, or after being released). */
  calmUntil: number;
  /** Has noticed the player at least once. */
  noticed: boolean;
  inst: CreatureInstance | null;
  removed: boolean;
  /** Held in place by a battle (the battle controller positions and animates it). */
  pinned: boolean;
  /** A one-shot clip (hurt) is playing until this time. */
  animLock?: number;
  /** Flyers (SpawnRules FLIGHT): height above the ground, and the soaring height (0 = not soaring). */
  alt?: number;
  soar?: number;
  /** Knocked into the air by a car: velocity, and what it does on landing. */
  knock?: { vx: number; vy: number; vz: number; then: 'fainted' | 'approach' | 'flee'; fromX: number; fromZ: number };
  /** performance.now() until which cars can't hit it again. */
  hitCooldownUntil?: number;
  /** Actual ground velocity last frame (m/s, after collisions). */
  vx: number;
  vz: number;
  /** Smart flee planner state. */
  flee: FleeMemory;
  /** Fleeing from the player (the threat point follows them) rather than a fixed spot (a car, a bang). */
  fleeFromPlayer?: boolean;
  /** Last wall push (for the debug view). */
  push: { x: number; z: number; nearest: number };
  /** Part of a street event (a turf outbreak swarm): not despawned while the event runs. */
  eventTag?: number;
  /** Held by an ambient fight ('duel:<id>') or an NPC hunt ('hunt:<id>'): moved by `script`. */
  heldBy?: string | null;
  /** Scripted goal while held (or a pack follower regrouping): walk / run there, then stand. */
  script?: { x: number; z: number; run: boolean } | null;
  /** Face this point while held and standing. */
  faceAt?: { x: number; z: number } | null;
  /** Wander radius around home (pack followers stay close). */
  wanderRadius?: number;
  /** Simulated in the lightweight tier this frame (beyond the AI radius). */
  lite?: boolean;
  /** Hurt by you recently (performance.now() until which it fights back anywhere). */
  provokedUntil?: number;
  /** A raid legendary (RaidWorld drives it; nothing else can scare, knock or faint it). */
  boss?: boolean;
  /** Chasing / biting the player: seconds without seeing them, last place seen, next bite. */
  chase?: { unseen: number; lastX: number; lastZ: number; biteIn: number };
}

/** Movement tuning shared by all wild Streetmon. */
export const WILD_MOVE = {
  /** Body radius from model height (m). */
  radiusPerHeight: 0.28,
  minRadius: 0.18,
  maxRadius: 0.6,
  /** Soft buffer kept from walls (m from the body's surface). */
  wallBufferRadius: 0.8,
  /** How hard the buffer pushes, relative to the creature's own steering. */
  repulsion: 1.2,
  /** Wander targets need this much clearance from walls (m from the body). */
  wanderClearance: 0.9,
} as const;

/** A creature's body radius on the ground. */
export function bodyRadius(height: number): number {
  return Math.max(WILD_MOVE.minRadius, Math.min(WILD_MOVE.maxRadius, height * WILD_MOVE.radiusPerHeight));
}

export interface SpawnEvents {
  /** An aggressive creature reached the player and wants to fight. */
  onEngage?(w: WildCreature): void;
  /** A new creature is in the world (packs hook in here). */
  onSpawned?(w: WildCreature): void;
  /** An aggressive creature bit / hit the player. */
  onAttackPlayer?(w: WildCreature, damage: number): void;
  /** An aggressive creature gave up on the player ('far', 'hidden'). */
  onGiveUp?(w: WildCreature, why: 'far' | 'hidden'): void;
  /** A shiny creature came within view range for the first time. */
  onShinyNearby?(w: WildCreature): void;
}

export interface SpawnContext {
  player: THREE.Vector3;
  stealth: Stealth;
  inCar: boolean;
  camera: THREE.Camera;
  time: TimeOfDay;
  /** In-game seconds (for cooldowns). */
  now: number;
  /** Player is busy (dead, arrested, in a menu): creatures don't engage. */
  busy: boolean;
  /** The player's height (rooftops, sewers): for line of sight. */
  playerY?: number;
  /** The player's world layer: only that layer spawns, and creatures from other layers go away. */
  biome?: Biome;
}

const TAU = Math.PI * 2;

/** Animation step for far-off wild Streetmon (s): 15 fps. */
const FAR_ANIM_STEP = 1 / 15;

export class SpawnSystem {
  /** Time banked for creatures animated at the reduced far rate. */
  private readonly animAcc = new WeakMap<WildCreature, number>();
  readonly wild: WildCreature[] = [];
  /** The street cap right now (day or night), from the last update. */
  streetCap: number = capFor('day');
  /** Share of the usual numbers to keep around (phones keep fewer: see mobile/Platform). */
  capScale = 1;
  /** Items: Pheromone Bait (more spawns), the Rabbit's Foot (shinies), Pepper Musk (weaker ones stay away). */
  rateMult = 1;
  shinyMult = 1;
  repelBelow = 0;
  /** Campaign acts finished, and your strongest Streetmon's level (storyLevel in SpawnRules). */
  actsDone = 0;
  strongest = 0;

  /** A level for a new spawn; under Pepper Musk it's at least the lead's level where the species can be. */
  private rollLevelFor(spec: SpeciesSpec): number {
    const lv = storyLevel(rollLevel(spec, this.rand()), this.actsDone, this.strongest);
    return this.repelBelow > 0 && lv < this.repelBelow ? Math.min(spec.spawn.levels[1], this.repelBelow) : lv;
  }

  /** The weather's pull on each type (rain brings out Sludge, storms Wire, fog Smoke: Weather.ts). */
  typeBoost: Partial<Record<string, number>> = {};

  /** Weighted species pick; under Pepper Musk, species that can't reach your lead's level stay away. */
  private pick(table: Parameters<typeof pickSpecies>[0], r: number): SpeciesSpec | null {
    let t = this.repelBelow > 0 ? table.filter((o) => o.spec.spawn.levels[1] >= this.repelBelow) : table;
    const early = t.filter((o) => storyAllows(o.spec, this.actsDone, this.strongest));
    if (early.length) t = early;
    if (Object.keys(this.typeBoost).length) t = t.map((o) => ({ ...o, weight: o.weight * Math.max(0.2, ...o.spec.types.map((ty) => this.typeBoost[ty] ?? 1)) }));
    return pickSpecies(t, r);
  }
  /** Ground for rooftops and sewers (the street uses the pedestrian walk map). */
  readonly layers: Partial<Record<Biome, LayerGround>> = {};
  private nextId = 1;
  private spawnTimer = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly shinyAnnounced = new Set<number>();
  /** Turn spawning off (e.g. during a battle). */
  enabled = true;
  /** Counters for testing/tuning. */
  readonly stats: { spawned: number; despawned: number; shiny: number; skySpawned?: number } = { spawned: 0, despawned: 0, shiny: 0 };
  /** Obstacle-aware fleeing (context steering over the wall grid). */
  readonly smartFlee = new SmartFleeBehavior();
  /** Wall grids (the spatial partition the probes read), one per layer and height band. */
  private readonly fields = new Map<string, ObstacleField>();
  /**
   * Round obstacles on the street besides buildings (parked cars, roadblocks, race props), asked
   * once per frame. Set by the game.
   */
  obstacles: (() => Array<{ x: number; z: number; r: number }>) | null = null;
  /** Draw probe rays and steering vectors (see FleeDebug). */
  debugFlee = false;
  /** Rays cast in the last update (all layers). */
  raysLastFrame = 0;
  /**
   * Level of detail: full behaviour within `activeRadius` of the player; beyond it a lightweight
   * position sim every `liteEvery` frames (no wall probes, car dodging, noticing or animation).
   */
  readonly lod = { activeRadius: 80, liteEvery: 4 };
  /** Last update: creatures in each tier. */
  readonly tiers = { active: 0, lite: 0 };
  private frameNo = 0;
  /**
   * Aggressive Streetmon going for the player: they chase and bite (instead of starting a battle
   * on contact when `autoBattle` is off) until the player gets `giveUpDistance` away, stays out
   * of sight (or in a car) for `hideSeconds`, or battles them.
   */
  readonly aggro = {
    autoBattle: false,
    attackRange: 1.9,
    attackEvery: [1.1, 1.7] as [number, number],
    damageBase: 3,
    damagePerLevel: 0.16,
    typeBonus: { gun: 1.25, concrete: 1.15 } as Record<string, number>,
    giveUpDistance: 36,
    hideSeconds: 3,
    calmAfterSeconds: 50,
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly layout: CityLayout,
    private readonly peds: PedestrianSystem,
    private readonly vehicles: VehicleManager,
    private readonly models: CreatureModels,
    private readonly events: SpawnEvents = {},
    private readonly rand: () => number = Math.random,
  ) {}

  update(dt: number, ctx: SpawnContext): void {
    this.streetCap = Math.max(4, Math.round(capFor(ctx.time) * this.capScale));
    this.pv.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.spawnTimer -= dt * this.rateMult;
    if (this.enabled && this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN.interval * (0.6 + this.rand() * 0.8);
      this.trySpawn(ctx);
    }
    // Street obstacles that aren't buildings: rebuilt each frame into the street field's buckets.
    const street = this.fieldFor('street', 0);
    street.circles.clear();
    if (this.obstacles) for (const o of this.obstacles()) street.circles.add(o.x, o.z, o.r);
    for (const f of this.fields.values()) f.rays = 0;
    this.frameNo++;
    this.tiers.active = 0;
    this.tiers.lite = 0;
    const every = Math.max(1, this.lod.liteEvery);
    for (const w of this.wild) {
      const far = Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z) > this.lod.activeRadius;
      w.lite = far && !w.pinned && !w.heldBy && w.state !== 'engaged' && w.state !== 'knocked';
      if (w.lite) {
        this.tiers.lite++;
        if ((this.frameNo + w.id) % every === 0) this.stepLite(w, dt * every);
      } else {
        this.tiers.active++;
        this.step(w, dt, ctx);
      }
    }
    this.raysLastFrame = 0;
    for (const f of this.fields.values()) this.raysLastFrame += f.rays;
    // Despawn.
    for (let i = this.wild.length - 1; i >= 0; i--) {
      const w = this.wild[i];
      const d = Math.hypot(w.x - ctx.player.x, w.z - ctx.player.z);
      const visible = this.inView(w.x, w.y + 0.5, w.z);
      // Out of its hours (a day creature at night): it slips away as soon as nobody's looking.
      const offShift = w.spec.spawn.times.length > 0 && !w.spec.spawn.times.includes(ctx.time) && d > 25;
      w.hidden = !visible && (d > SPAWN.hiddenDespawnDist || offShift) ? w.hidden + dt : 0;
      const otherLayer = layerOfBiome(w.biome) !== layerOfBiome(ctx.biome ?? 'street');
      // Another sewer level (above or below you) counts as another layer.
      const otherLevel = w.biome === 'sewer' && ctx.playerY !== undefined && Math.abs(w.y - ctx.playerY) > 8;
      // Event swarms stay put (out of sight or not) until their event ends, unless you leave the layer.
      const held = w.eventTag !== undefined && !w.removed && !otherLayer;
      if (!held && (w.removed || otherLayer || otherLevel || d > SPAWN.despawnDist || w.hidden > SPAWN.hiddenDespawnTime)) {
        if (w.state === 'engaged' && !w.removed) continue;
        this.dispose(w);
        this.wild.splice(i, 1);
        this.stats.despawned++;
      }
    }
  }

  // ------------------------------------------------------------------ spawning

  private inView(x: number, y: number, z: number): boolean {
    return this.frustum.containsPoint(this.tmp.set(x, y, z));
  }

  private walkable(x: number, z: number): boolean {
    // Sidewalks, the park and promenades (raised ground), not inside buildings or water.
    return !this.peds.blocked(x, z) && this.peds.groundY(x, z) > 0.1;
  }

  /** Ground height for a creature in its layer (null = can't stand there). */
  private groundFor(b: Biome, x: number, z: number, y: number): number | null {
    if (b === 'street') return this.peds.blocked(x, z) ? null : this.peds.groundY(x, z);
    // Pond Streetmon float on the water; hauled out on the bank (a fight) they stand on the grass.
    if (b === 'pond') return this.layers.pond?.ground(x, z, y) ?? (this.peds.blocked(x, z) ? null : this.peds.groundY(x, z));
    const L = this.layers[b];
    return L ? L.ground(x, z, y) : null;
  }

  /** Can a creature step here? Wandering ones keep to sidewalks on the street. */
  private canStep(w: WildCreature, x: number, z: number, roam: boolean): boolean {
    if (w.biome === 'street') return roam ? !this.peds.blocked(x, z) : this.walkable(x, z);
    // Pond Streetmon keep to the water.
    if (w.biome === 'pond') return (this.layers.pond?.ground(x, z, w.y) ?? null) !== null;
    return this.groundFor(w.biome, x, z, w.y) !== null;
  }

  /**
   * The obstacle field for a layer. Rooftops and sewers sample the layer's ground per 2 m height
   * band: no ground, or ground more than a step away from the band, is a wall.
   */
  fieldFor(b: Biome, y: number): ObstacleField {
    const band = b === 'street' ? 0 : Math.round(y / 2);
    const key = `${b}:${band}`;
    let f = this.fields.get(key);
    if (!f) {
      const yc = band * 2;
      const sample =
        b === 'street'
          ? (x: number, z: number): boolean => this.peds.blocked(x, z)
          : (x: number, z: number): boolean => {
              const g = this.layers[b]?.ground(x, z, yc);
              return g === null || g === undefined || Math.abs(g - yc) > 1.6;
            };
      f = new ObstacleField(new WallGrid(sample));
      this.fields.set(key, f);
    }
    return f;
  }

  /** Forget cached walls (a layer's ground changed). */
  resetWalls(biome?: Biome): void {
    for (const k of [...this.fields.keys()]) if (!biome || k.startsWith(`${biome}:`)) this.fields.delete(k);
  }

  private trySpawn(ctx: SpawnContext): void {
    const biome = ctx.biome ?? 'street';
    if (biome !== 'street') {
      this.trySpawnLayer(ctx, biome);
      return;
    }
    // The sky: a few flyers soaring high over the streets.
    if (this.rand() < 0.4 && this.trySpawnSky(ctx)) return;
    // The pond (on the street layer): its own few Streetmon, while you're anywhere near it.
    if (this.layers.pond && this.rand() < 0.5 && this.trySpawnPond(ctx)) return;
    if (this.wild.length >= this.streetCap) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = this.rand() * TAU;
      const d = SPAWN.minDist + this.rand() * (SPAWN.maxDist - SPAWN.minDist);
      const x = ctx.player.x + Math.cos(a) * d;
      const z = ctx.player.z + Math.sin(a) * d;
      if (!this.walkable(x, z)) continue;
      const y = this.peds.groundY(x, z);
      if (this.inView(x, y + 0.6, z) && d < 80) continue; // never pop in on screen nearby
      const district = districtAt(this.layout, x, z);
      const inDistrict = this.wild.filter((w) => w.district === district).length;
      if (inDistrict >= SPAWN.maxPerDistrict) continue;
      const spec = this.pick(spawnTable(district, ctx.time), this.rand());
      if (!spec) continue;
      // Don't stack the same species right next to each other.
      if (this.wild.some((w) => w.spec.id === spec.id && Math.hypot(w.x - x, w.z - z) < 25)) continue;
      this.spawn(spec, this.rollLevelFor(spec), x, z, district, this.rand() < SPAWN.shinyChance * this.shinyMult);
      return;
    }
  }

  /** A flyer from the local spawn table, already soaring well above the street. */
  private trySpawnSky(ctx: SpawnContext): boolean {
    if (this.wild.filter((w) => (w.soar ?? 0) > 0 && !w.removed).length >= Math.max(2, Math.round(SKY.max * this.capScale))) return false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = this.rand() * TAU;
      const d = 45 + this.rand() * 80;
      const x = ctx.player.x + Math.cos(a) * d;
      const z = ctx.player.z + Math.sin(a) * d;
      if (!this.walkable(x, z) && this.peds.blocked(x, z)) continue;
      const district = districtAt(this.layout, x, z);
      const table = skyTable(district, ctx.time);
      const spec = this.pick(table, this.rand());
      if (!spec) return false;
      const w = this.spawn(spec, this.rollLevelFor(spec), x, z, district, this.rand() < SPAWN.shinyChance * this.shinyMult);
      w.soar = SKY.alt[0] + this.rand() * (SKY.alt[1] - SKY.alt[0]);
      w.alt = w.soar;
      this.stats.skySpawned = (this.stats.skySpawned ?? 0) + 1;
      return true;
    }
    return false;
  }

  /** The Central Green pond: up to its own cap, on open water. */
  private trySpawnPond(ctx: SpawnContext): boolean {
    const L = this.layers.pond;
    if (!L || this.wild.filter((w) => w.biome === 'pond' && !w.removed).length >= capFor(ctx.time, 'pond')) return false;
    const p = L.spawnPoint(ctx.player, this.rand);
    if (!p) return false;
    const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
    if (this.inView(p.x, p.y + 0.4, p.z) && d < 25) return false;
    const spec = this.pick(spawnTable(p.district, ctx.time, 'pond'), this.rand());
    if (!spec) return false;
    if (this.wild.some((w) => w.spec.id === spec.id && Math.hypot(w.x - p.x, w.z - p.z) < 12)) return false;
    this.spawn(spec, this.rollLevelFor(spec), p.x, p.z, p.district, this.rand() < SPAWN.shinyChance * this.shinyMult, 'pond', p.y);
    return true;
  }

  /** Rooftops and sewers: their own caps and spawn points, from the layer's ground. */
  private trySpawnLayer(ctx: SpawnContext, biome: Biome): void {
    const L = this.layers[biome];
    if (!L || this.wild.length >= capFor(ctx.time, biome)) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      const p = L.spawnPoint(ctx.player, this.rand);
      if (!p) return;
      const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
      if (this.inView(p.x, p.y + 0.6, p.z) && d < 30) continue;
      // The deep drains: rarer Streetmon from anywhere under the city, and stronger.
      const lvl = p.level ?? 1;
      const table = lvl > 1 ? deepTable(ctx.time, lvl, biome) : spawnTable(p.district, ctx.time, biome);
      const spec = this.pick(table, this.rand());
      if (!spec) return;
      if (this.wild.some((w) => w.spec.id === spec.id && Math.hypot(w.x - p.x, w.z - p.z) < 15)) continue;
      this.spawn(spec, Math.min(70, this.rollLevelFor(spec) + deepLevelBonus(lvl)), p.x, p.z, p.district, this.rand() < SPAWN.shinyChance * this.shinyMult * lvl, biome, p.y);
      return;
    }
  }

  /** Creates a wild creature at a point (also used by tests and debugging). */
  spawn(spec: SpeciesSpec, level: number, x: number, z: number, district = districtAt(this.layout, x, z), shiny = false, biome: Biome = 'street', y?: number): WildCreature {
    const creature = createCreature(spec.id, level, this.rand, { shiny });
    const w: WildCreature = {
      id: this.nextId++,
      creature,
      spec,
      temperament: spec.spawn.temperament,
      district,
      biome,
      x,
      y: y ?? this.peds.groundY(x, z),
      z,
      heading: this.rand() * TAU,
      speed: 0,
      state: 'idle',
      stateTime: 1 + this.rand() * 2,
      tx: x,
      tz: z,
      homeX: x,
      homeZ: z,
      hidden: 0,
      calmUntil: 0,
      noticed: false,
      inst: null,
      removed: false,
      pinned: false,
      vx: 0,
      vz: 0,
      // Staggered so creatures don't all re-plan on the same frame.
      flee: newFleeMemory(this.rand() / this.smartFlee.cfg.replanHz),
      push: { x: 0, z: 0, nearest: WILD_MOVE.wanderClearance },
    };
    this.wild.push(w);
    this.stats.spawned++;
    if (shiny) this.stats.shiny++;
    this.events.onSpawned?.(w);
    void this.models.instance(spec.id, shiny).then((inst) => {
      if (w.removed || !this.wild.includes(w)) {
        inst.dispose();
        return;
      }
      w.inst = inst;
      this.scene.add(inst.root);
      this.place(w);
    });
    return w;
  }

  private dispose(w: WildCreature): void {
    w.removed = true;
    w.inst?.dispose();
    w.inst = null;
    this.shinyAnnounced.delete(w.id);
  }

  /** Removes a creature (caught, knocked out, scared off for good). */
  remove(w: WildCreature): void {
    w.removed = true;
    if (w.state === 'engaged') w.state = 'idle';
  }

  /**
   * The player hurt a wild creature with a weapon. Aggressive ones (and Gun types) come for you;
   * the rest run. At 0 HP it's knocked out and limps off (despawns). Returns true if knocked out.
   */
  hurt(w: WildCreature, amount: number, fromX: number, fromZ: number): boolean {
    if (w.removed || w.inPod || w.state === 'fainted' || w.boss) return false;
    w.heldBy = null;
    w.script = null;
    w.faceAt = null;
    w.creature.hp = Math.max(0, w.creature.hp - Math.max(1, Math.round(amount)));
    if (w.creature.hp <= 0) {
      w.state = 'fainted';
      w.stateTime = 1.8;
      w.speed = 0;
      w.inst?.play('faint', 0.05);
      return true;
    }
    w.inst?.play('hurt', 0.05);
    w.animLock = performance.now() + 420;
    w.calmUntil = 0;
    w.provokedUntil = performance.now() + 20000;
    if (w.temperament === 'aggro' || w.spec.types.includes('gun')) this.setState(w, 'approach', 15);
    else this.startle(w, fromX, fromZ);
    return false;
  }

  /**
   * Knocked flying by a car (damage already applied to its HP): a ballistic hop, then it faints if
   * out of HP, comes after you if it's aggressive (or a Gun or Concrete type), or runs off.
   */
  knockBack(w: WildCreature, vx: number, vy: number, vz: number, fromX: number, fromZ: number): void {
    if (w.removed || w.pinned || w.inPod || w.state === 'fainted' || w.boss) return;
    w.heldBy = null;
    w.script = null;
    w.faceAt = null;
    const then = w.creature.hp <= 0 ? 'fainted' : w.temperament === 'aggro' || w.spec.types.includes('gun') || w.spec.types.includes('concrete') ? 'approach' : 'flee';
    w.knock = { vx, vy, vz, then, fromX, fromZ };
    w.state = 'knocked';
    w.stateTime = 3;
    w.speed = 0;
    w.calmUntil = 0;
    w.inst?.play('hurt', 0.05);
    w.animLock = performance.now() + 600;
  }

  /** Makes one creature bolt away from a point (a failed capture throw). */
  startle(w: WildCreature, fromX: number, fromZ: number, fromPlayer = true): void {
    if (w.boss) return;
    this.setState(w, 'flee', 6);
    w.fleeFromPlayer = fromPlayer;
    w.tx = fromX;
    w.tz = fromZ;
  }

  /** Ends an engagement: the creature calms down for a while. */
  release(w: WildCreature, calmSeconds: number, now: number): void {
    if (w.boss) return;
    w.chase = undefined;
    w.heldBy = null;
    w.script = null;
    w.state = 'wander';
    w.stateTime = 0;
    w.calmUntil = now + calmSeconds;
  }

  clear(): void {
    for (const w of this.wild) this.dispose(w);
    this.wild.length = 0;
  }

  /**
   * Gunfire, explosions: everything within `radius` bolts — except Gun types, who aren't bothered
   * by gunshots (aggressive ones come looking).
   */
  scare(x: number, z: number, radius: number, gunfire: boolean): void {
    for (const w of this.wild) {
      if (w.state === 'engaged' || w.inPod || w.pinned || w.boss) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d > radius) continue;
      // Gunfire breaks up ambient fights and hunts.
      w.heldBy = null;
      w.script = null;
      w.faceAt = null;
      if (gunfire && w.spec.types.includes('gun')) {
        if (this.hostile(w)) this.setState(w, 'approach', 12);
        continue;
      }
      this.setState(w, 'flee', 6 + this.rand() * 3);
      w.fleeFromPlayer = false;
      w.tx = x;
      w.tz = z;
    }
  }

  // ------------------------------------------------------------------ behaviour

  private setState(w: WildCreature, s: WildState, time: number): void {
    // A fresh scare plans its escape right away.
    if (s === 'flee' && w.state !== 'flee') {
      w.flee.replanIn = 0;
      w.flee.cornerFor = 0;
    }
    w.state = s;
    w.stateTime = time;
  }

  private step(w: WildCreature, dt: number, ctx: SpawnContext): void {
    if (w.removed) return;
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const dx = px - w.x;
    const dz = pz - w.z;
    const dist = Math.hypot(dx, dz);
    // Out of HP but not fainting (hit by a car while in a pod, say): it faints now rather than
    // standing about at 0 HP where it could be battled (and crash the battle).
    if (w.creature.hp <= 0 && w.state !== 'fainted' && w.state !== 'knocked' && w.state !== 'engaged' && !w.inPod && !w.boss) this.faint(w);
    if (w.state === 'fainted') {
      w.stateTime -= dt;
      if (w.stateTime <= 0) w.removed = true;
      this.place(w, dt, dist);
      return;
    }
    if (w.pinned) {
      w.y = this.groundFor(w.biome, w.x, w.z, w.y) ?? w.y;
      this.place(w, dt, dist);
      return;
    }
    if (w.heldBy) {
      // In an ambient fight or an NPC hunt: only scripted moves (the living world drives it).
      let mx = 0;
      let mz = 0;
      const sc = w.script;
      if (sc && !w.inPod) {
        const sdx = sc.x - w.x;
        const sdz = sc.z - w.z;
        const sd = Math.hypot(sdx, sdz);
        if (sd < 0.35) w.script = null;
        else {
          mx = sdx / sd;
          mz = sdz / sd;
        }
      }
      if (!mx && !mz && w.faceAt) w.heading = turnToward(w.heading, Math.atan2(w.faceAt.x - w.x, w.faceAt.z - w.z), dt * 6);
      this.move(w, dt, mx, mz, !!sc?.run);
      w.y += ((this.groundFor(w.biome, w.x, w.z, w.y) ?? w.y) - w.y) * Math.min(1, dt * 10);
      this.place(w, dt, dist);
      return;
    }
    // A pond Streetmon out on the bank (after a fight there) waddles straight back into the water.
    if (w.biome === 'pond' && w.state !== 'knocked' && !w.inPod) {
      const P = this.layers.pond;
      if (P?.nearest && P.ground(w.x, w.z, w.y) === null) {
        const t = P.nearest(w.x, w.z);
        const ddx = t.x - w.x;
        const ddz = t.z - w.z;
        const dd = Math.hypot(ddx, ddz);
        const step = Math.min(dd, 2.6 * dt);
        if (dd > 1e-3) {
          w.x += (ddx / dd) * step;
          w.z += (ddz / dd) * step;
          w.heading = turnToward(w.heading, Math.atan2(ddx, ddz), dt * 8);
        }
        w.speed = 2.6;
        w.state = 'wander';
        w.y += ((P.ground(w.x, w.z, w.y) ?? Math.max(w.y, this.peds.groundY(w.x, w.z))) - w.y) * Math.min(1, dt * 8);
        this.place(w, dt, dist);
        return;
      }
    }
    if (w.state === 'knocked' && w.knock) {
      const k = w.knock;
      const nx = w.x + k.vx * dt;
      const nz = w.z + k.vz * dt;
      if (this.canStep(w, nx, nz, true)) {
        w.x = nx;
        w.z = nz;
      } else {
        k.vx *= -0.3;
        k.vz *= -0.3;
      }
      k.vy -= 9.81 * dt;
      w.y += k.vy * dt;
      w.heading += dt * 9 * Math.sign(k.vx + k.vz || 1);
      const ground = this.groundFor(w.biome, w.x, w.z, w.y) ?? w.y;
      w.stateTime -= dt;
      if ((w.y <= ground && k.vy < 0) || w.stateTime <= 0) {
        w.y = ground;
        w.knock = undefined;
        if (k.then === 'fainted') {
          w.state = 'fainted';
          w.stateTime = 1.8;
          w.inst?.play('faint', 0.05);
        } else if (k.then === 'approach') this.setState(w, 'approach', 15);
        else this.startle(w, k.fromX, k.fromZ, false);
      }
      this.place(w, dt, dist);
      return;
    }
    const loud = w.spec.base.loud + Math.floor(w.creature.ivs.loud / 4);
    const calm = ctx.now < w.calmUntil;
    const detect = detectionRadius(loud, ctx.stealth);
    w.stateTime -= dt;

    // Shiny announcement (once, when it comes into spotting range).
    if (w.creature.shiny && !this.shinyAnnounced.has(w.id) && dist < revealRadius(loud)) {
      this.shinyAnnounced.add(w.id);
      this.events.onShinyNearby?.(w);
    }

    // Dodge cars like pedestrians do.
    for (const c of this.vehicles.cars) {
      if (c.disposed) continue;
      const cdx = w.x - c.position.x;
      const cdz = w.z - c.position.z;
      const cd = Math.hypot(cdx, cdz);
      if (cd > 7) continue;
      const v = c.body.linvel();
      if (Math.hypot(v.x, v.z) < 3) continue;
      if (w.state !== 'engaged' && !w.inPod) {
        this.setState(w, 'flee', 2.5);
        w.fleeFromPlayer = false;
        w.tx = c.position.x;
        w.tz = c.position.z;
      }
    }

    // Noticing the player.
    // (A creature already chasing the player is past noticing: the chase rules decide.)
    if (!calm && !ctx.busy && !w.chase && w.state !== 'engaged' && w.state !== 'flee' && w.state !== 'attack' && dist < detect) {
      if (!w.noticed) {
        w.noticed = true;
        // It calls out when it first spots you (from close enough to hear).
        if (dist < 30) playCry(w.spec.id, dist, { gain: 0.8 });
      }
      const hostile = this.hostile(w);
      if (w.temperament === 'flee' || (ctx.inCar && !hostile)) {
        this.setState(w, 'flee', 5 + this.rand() * 3);
        w.fleeFromPlayer = true;
        w.tx = px;
        w.tz = pz;
      } else if (hostile && !ctx.inCar) {
        if (w.state !== 'approach') this.setState(w, 'approach', 15);
      } else if (w.state !== 'watch') {
        // Curious: stops and watches; bolts if you rush it.
        this.setState(w, 'watch', 2 + this.rand() * 2);
        if (ctx.stealth === 'sprint' && dist < detect * 0.6) {
          this.setState(w, 'flee', 4);
          w.fleeFromPlayer = true;
          w.tx = px;
          w.tz = pz;
        }
      }
    }

    let moveX = 0;
    let moveZ = 0;
    let running = false;
    let fleeing = false;
    switch (w.state) {
      case 'idle':
        if (w.stateTime <= 0) this.pickWander(w);
        break;
      case 'wander': {
        const tdx = w.tx - w.x;
        const tdz = w.tz - w.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 0.4 || w.stateTime <= 0) {
          this.setState(w, 'idle', 1.5 + this.rand() * 4);
          w.script = null;
        } else {
          moveX = tdx / td;
          moveZ = tdz / td;
          // Catching up with its pack.
          running = !!w.script?.run;
        }
        break;
      }
      case 'watch':
        w.heading = turnToward(w.heading, Math.atan2(dx, dz), dt * 4);
        if (w.stateTime <= 0 && dist > detect) this.pickWander(w);
        else if (w.stateTime <= 0) w.stateTime = 1.5;
        break;
      case 'flee': {
        // Running from you: the threat moves with you. (Direction comes from SmartFlee below.)
        if (w.fleeFromPlayer && !ctx.busy) {
          w.tx = px;
          w.tz = pz;
        }
        fleeing = true;
        running = true;
        if (w.stateTime <= 0 && Math.hypot(w.x - w.tx, w.z - w.tz) > detect * 1.6) this.pickWander(w);
        else if (w.stateTime <= 0) w.stateTime = 1;
        break;
      }
      case 'approach':
        // An aggressive one that's left the park (or wherever it's allowed to be hostile) and wasn't
        // provoked gives up the chase.
        if (w.temperament === 'aggro' && w.chase && !this.hostile(w)) {
          this.endChase(w);
          break;
        }
        if (w.temperament === 'aggro' && !this.aggro.autoBattle) {
          // Going for the player: only getting away, hiding or a battle stops it.
          if (ctx.busy || calm) {
            this.endChase(w);
            break;
          }
          if (this.chaseLost(w, dt, ctx, dist)) break;
          if (dist < this.aggro.attackRange + 0.4 && !ctx.inCar) {
            this.setState(w, 'attack', 0);
            w.chase!.biteIn = Math.min(w.chase!.biteIn, 0.35);
            break;
          }
          const ch = w.chase!;
          const gx = ch.unseen > 0 ? ch.lastX : px;
          const gz = ch.unseen > 0 ? ch.lastZ : pz;
          const gd = Math.hypot(gx - w.x, gz - w.z);
          if (gd > 0.6) {
            moveX = (gx - w.x) / gd;
            moveZ = (gz - w.z) / gd;
            running = true;
          }
          break;
        }
        if (calm || ctx.busy || ctx.inCar || dist > detect * 2.5 || w.stateTime <= 0) {
          this.pickWander(w);
          break;
        }
        if (dist < 2.4) {
          this.setState(w, 'engaged', 0);
          this.events.onEngage?.(w);
          break;
        }
        moveX = dx / dist;
        moveZ = dz / dist;
        running = true;
        break;
      case 'attack': {
        if (ctx.busy || calm || !this.hostile(w)) {
          this.endChase(w);
          break;
        }
        if (this.chaseLost(w, dt, ctx, dist)) break;
        const ch = w.chase!;
        if (dist > this.aggro.attackRange + 1.4 || ctx.inCar) {
          this.setState(w, 'approach', 0);
          break;
        }
        w.heading = turnToward(w.heading, Math.atan2(dx, dz), dt * 8);
        if (dist > this.aggro.attackRange) {
          moveX = dx / dist;
          moveZ = dz / dist;
          running = true;
        }
        ch.biteIn -= dt;
        if (ch.biteIn <= 0 && ch.unseen === 0) {
          const [a, b] = this.aggro.attackEvery;
          ch.biteIn = a + this.rand() * (b - a);
          if (w.inst) w.animLock = performance.now() + w.inst.attack('strike').duration * 1000;
          this.events.onAttackPlayer?.(w, this.biteDamage(w));
        }
        break;
      }
      case 'engaged':
        w.heading = turnToward(w.heading, Math.atan2(dx, dz), dt * 6);
        break;
    }

    // Fleeing: context steering over the probes instead of "straight away from the threat".
    if (fleeing && w.state === 'flee') {
      const plan = this.smartFlee.steer({ x: w.x, z: w.z, vx: w.vx, vz: w.vz, radius: bodyRadius(w.spec.model.height) }, w.tx, w.tz, this.fieldFor(w.biome, w.y), w.flee, dt);
      moveX = plan.dirX;
      moveZ = plan.dirZ;
    }
    this.move(w, dt, moveX, moveZ, running);
    w.y += ((this.groundFor(w.biome, w.x, w.z, w.y) ?? w.y) - w.y) * Math.min(1, dt * 10);
    this.place(w, dt, dist);
  }

  /**
   * Moves a creature toward (moveX, moveZ) at its walking or running speed. The wall buffer pushes
   * it off walls; the move itself is swept against the walls (never crossing into one, sliding
   * along it instead); and the layer's own rules (sidewalks for wanderers, roof edges) have the
   * last word.
   */
  private move(w: WildCreature, dt: number, moveX: number, moveZ: number, running: boolean): void {
    const wants = moveX !== 0 || moveZ !== 0;
    const target = wants ? moveSpeed(w.spec.base.speed, running) : 0;
    w.speed += (target - w.speed) * Math.min(1, dt * 6);
    if (!(w.speed > 0.05 && wants)) {
      if (!wants) w.speed *= Math.max(0, 1 - dt * 8);
      w.vx = 0;
      w.vz = 0;
      return;
    }
    const field = this.fieldFor(w.biome, w.y);
    const r = bodyRadius(w.spec.model.height);
    // Steering plus the wall buffer's push, then turn the body toward it (turn-rate limited).
    const push = wallRepulsion(field, w.x, w.z, r, WILD_MOVE.wallBufferRadius);
    w.push = push;
    const v = steerWithRepulsion(moveX, moveZ, 1, push.x, push.z, WILD_MOVE.repulsion);
    w.heading = turnToward(w.heading, Math.atan2(v.vx, v.vz), dt * (running ? 9 : 5));
    const vx = Math.sin(w.heading) * w.speed;
    const vz = Math.cos(w.heading) * w.speed;
    const m = moveWithCollision(field, w.x, w.z, vx, vz, dt, r);
    const roam = w.state === 'flee' || w.state === 'approach' || w.state === 'attack' || !!w.script;
    const ok = (x: number, z: number): boolean => this.canStep(w, x, z, roam);
    const ox = w.x;
    const oz = w.z;
    if (ok(m.x, m.z)) {
      w.x = m.x;
      w.z = m.z;
    } else if (ok(m.x, w.z)) w.x = m.x;
    else if (ok(w.x, m.z)) w.z = m.z;
    else {
      // Stuck against the layer's edge (kerb for wanderers, a roof edge): turn away.
      w.heading += Math.PI * (0.5 + this.rand());
      if (w.state === 'wander') this.setState(w, 'idle', 0.5);
      w.flee.replanIn = 0;
    }
    w.vx = (w.x - ox) / Math.max(dt, 1e-4);
    w.vz = (w.z - oz) / Math.max(dt, 1e-4);
    // Ran into something: face along the slide, and plan again soon.
    if (m.hit) {
      w.flee.replanIn = Math.min(w.flee.replanIn, 0.05);
      const sp = Math.hypot(w.vx, w.vz);
      if (sp > 0.2) w.heading = turnToward(w.heading, Math.atan2(w.vx, w.vz), dt * 6);
    }
  }

  /**
   * Chasing the player: tracks whether it can see them (out of sight or in a car counts as
   * hiding). Gives up (and returns true) when they're far enough away or hidden long enough.
   */
  private chaseLost(w: WildCreature, dt: number, ctx: SpawnContext, dist: number): boolean {
    const ch = (w.chase ??= { unseen: 0, lastX: ctx.player.x, lastZ: ctx.player.z, biteIn: 0.5 });
    if (!ctx.inCar && this.canSee(w, ctx)) {
      ch.unseen = 0;
      ch.lastX = ctx.player.x;
      ch.lastZ = ctx.player.z;
    } else ch.unseen += dt;
    const why = dist > this.aggro.giveUpDistance ? 'far' : ch.unseen >= this.aggro.hideSeconds ? 'hidden' : null;
    if (!why) return false;
    this.endChase(w);
    w.calmUntil = ctx.now + this.aggro.calmAfterSeconds;
    this.events.onGiveUp?.(w, why);
    return true;
  }

  private endChase(w: WildCreature): void {
    w.chase = undefined;
    this.pickWander(w);
  }

  /** No wall (or gap in a roof) between the creature and the player, and on about the same level. */
  canSee(w: WildCreature, ctx: SpawnContext): boolean {
    const px = ctx.player.x;
    const pz = ctx.player.z;
    if (ctx.playerY !== undefined && Math.abs(ctx.playerY - w.y) > 2.6) return false;
    const d = Math.hypot(px - w.x, pz - w.z);
    const n = Math.floor(d / 0.5);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = w.x + (px - w.x) * t;
      const z = w.z + (pz - w.z) * t;
      if (w.biome === 'street' ? this.peds.blocked(x, z) : w.biome === 'pond' ? !this.canStep(w, x, z, true) : this.groundFor(w.biome, x, z, w.y) === null) return false;
    }
    return true;
  }

  /** A bite / hit on the player: level-scaled, Gun and Concrete types hit harder. */
  biteDamage(w: WildCreature): number {
    const A = this.aggro;
    const bonus = Math.max(1, ...w.spec.types.map((t) => A.typeBonus[t] ?? 1));
    return Math.max(1, Math.round((A.damageBase + w.creature.level * A.damagePerLevel) * bonus * (0.85 + this.rand() * 0.3)));
  }

  /** Knocked out by an ambient fight (no reaction, it just drops). */
  /**
   * Is this aggressive Streetmon out for you here? Only in the park, on the roofs and in the
   * sewers (SPAWN.hostileDistricts), or anywhere for a while after you've hurt it.
   */
  hostile(w: WildCreature): boolean {
    if (w.temperament !== 'aggro') return false;
    if ((w.provokedUntil ?? 0) > performance.now()) return true;
    return hostileAt(w.biome, districtAt(this.layout, w.x, w.z));
  }

  faint(w: WildCreature): void {
    if (w.removed || w.state === 'fainted' || w.boss) return;
    w.creature.hp = 0;
    w.heldBy = null;
    w.script = null;
    w.state = 'fainted';
    w.stateTime = 1.8;
    w.speed = 0;
    w.inst?.play('faint', 0.05);
  }

  /** Runs from a point for a while (a car, a blast, a lost fight). */
  flee(w: WildCreature, fromX: number, fromZ: number, seconds: number): void {
    if (w.removed || w.pinned || w.state === 'engaged' || w.state === 'fainted' || w.inPod || w.boss) return;
    w.heldBy = null;
    w.script = null;
    w.faceAt = null;
    w.chase = undefined;
    this.setState(w, 'flee', seconds);
    w.fleeFromPlayer = false;
    w.tx = fromX;
    w.tz = fromZ;
  }

  /**
   * The lightweight tier (beyond the AI radius): straight-line wandering and fleeing on the
   * layer's walkable ground, no wall probes, car checks, noticing or animation.
   */
  private stepLite(w: WildCreature, dt: number): void {
    if (w.removed) return;
    if (w.creature.hp <= 0 && w.state !== 'fainted' && w.state !== 'knocked' && w.state !== 'engaged' && !w.inPod && !w.boss) this.faint(w);
    if (w.state === 'fainted') {
      w.stateTime -= dt;
      if (w.stateTime <= 0) w.removed = true;
      return;
    }
    w.stateTime -= dt;
    let mx = 0;
    let mz = 0;
    let run = false;
    switch (w.state) {
      case 'wander': {
        const d = Math.hypot(w.tx - w.x, w.tz - w.z);
        if (d < 0.5 || w.stateTime <= 0) this.setState(w, 'idle', 2 + this.rand() * 4);
        else {
          mx = (w.tx - w.x) / d;
          mz = (w.tz - w.z) / d;
          run = !!w.script?.run;
        }
        break;
      }
      case 'flee': {
        const d = Math.hypot(w.x - w.tx, w.z - w.tz) || 1;
        mx = (w.x - w.tx) / d;
        mz = (w.z - w.tz) / d;
        run = true;
        if (w.stateTime <= 0) this.pickWander(w);
        break;
      }
      case 'approach':
      case 'attack':
        // Far beyond any chase distance: it forgets the player.
        w.chase = undefined;
        this.pickWander(w);
        break;
      default:
        if (w.stateTime <= 0) this.pickWander(w);
    }
    if (mx || mz) {
      const sp = moveSpeed(w.spec.base.speed, run);
      const nx = w.x + mx * sp * dt;
      const nz = w.z + mz * sp * dt;
      if (this.canStep(w, nx, nz, run || !!w.script)) {
        w.x = nx;
        w.z = nz;
        w.heading = Math.atan2(mx, mz);
        w.speed = sp;
      } else {
        w.speed = 0;
        if (w.state === 'wander') this.setState(w, 'idle', 1);
      }
    } else w.speed = 0;
    w.vx = mx * w.speed;
    w.vz = mz * w.speed;
    w.y = this.groundFor(w.biome, w.x, w.z, w.y) ?? w.y;
    this.place(w, dt, 999);
  }

  private pickWander(w: WildCreature): void {
    for (let i = 0; i < 6; i++) {
      const a = this.rand() * TAU;
      const r = w.wanderRadius ? 1 + this.rand() * w.wanderRadius : 3 + this.rand() * 9;
      const x = w.homeX + Math.cos(a) * r;
      const z = w.homeZ + Math.sin(a) * r;
      if (this.canStep(w, x, z, false) && this.fieldFor(w.biome, w.y).clear(x, z, bodyRadius(w.spec.model.height) + WILD_MOVE.wanderClearance)) {
        w.tx = x;
        w.tz = z;
        this.setState(w, 'wander', 12);
        return;
      }
    }
    // Home is unreachable (it fled across a road): make here home.
    w.homeX = w.x;
    w.homeZ = w.z;
    this.setState(w, 'idle', 2);
  }

  /** Flyers rise and sink toward the height their behaviour wants (and soarers come down when you're near). */
  private fly(w: WildCreature, dt: number, dist: number): void {
    if (!FLIGHT[w.spec.id] || dt <= 0) return;
    if (w.soar && dist < SKY.descendAt && w.state !== 'flee') w.soar = 0;
    if (w.soar && w.state === 'flee') w.soar = Math.max(w.soar, FLIGHT[w.spec.id].high);
    const target = flightTarget(w.spec.id, w.state, w.id * 3.1 + performance.now() / 1000, w.soar ?? 0);
    const a = w.alt ?? 0;
    const rate = (w.state === 'flee' ? SKY.climbFlee : SKY.climb) * dt;
    w.alt = a + Math.max(-rate * 1.5, Math.min(rate, target - a));
  }

  private place(w: WildCreature, dt = 0, dist = 0): void {
    this.fly(w, dt, dist);
    const inst = w.inst;
    if (!inst) return;
    // On the pond a water Streetmon floats with part of itself under the surface.
    const sink = w.biome === 'pond' && this.layers.pond?.ground(w.x, w.z, w.y) != null ? (w.spec.model.sink ?? 0) * w.spec.model.height * (w.sizeScale ?? 1) : 0;
    inst.root.position.set(w.x, w.y - sink + (w.alt ?? 0), w.z);
    inst.root.rotation.y = w.heading;
    const moving = w.speed > 0.25;
    const airborne = !!FLIGHT[w.spec.id] && (w.alt ?? 0) > 0.3;
    // In the air: no walking on nothing (the flap is laid over the idle below).
    if (w.state !== 'engaged' && w.state !== 'fainted' && w.state !== 'knocked' && performance.now() > (w.animLock ?? 0)) inst.play(moving && !airborne ? 'walk' : 'idle');
    const action = inst.mixer.existingAction(inst.clips.get('walk')!);
    if (action) action.timeScale = moving ? Math.max(0.6, w.speed / Math.max(0.6, w.spec.model.height * 1.4)) : 1;
    // Animation rate by distance: every frame up close, 15 fps beyond 35 m (a few pixels tall,
    // the difference doesn't show), nothing past 90 m (saves time with a full cap).
    if (dt > 0 && dist < 90) {
      if (dist < 35) {
        inst.mixer.update(dt + (this.animAcc.get(w) ?? 0));
        if (airborne) flightPose(inst, w, performance.now() / 1000);
      } else {
        const acc = (this.animAcc.get(w) ?? 0) + dt;
        if (acc >= FAR_ANIM_STEP) {
          inst.mixer.update(acc);
          this.animAcc.set(w, 0);
        } else this.animAcc.set(w, acc);
        return;
      }
      this.animAcc.delete(w);
    }
  }

  // ------------------------------------------------------------------ queries

  /** Minimap markers for creatures the player can spot (loud ones from farther). */
  markers(player: THREE.Vector3): Array<{ x: number; z: number; color: string; size: number }> {
    const out: Array<{ x: number; z: number; color: string; size: number }> = [];
    for (const w of this.wild) {
      if (w.removed) continue;
      const d = Math.hypot(w.x - player.x, w.z - player.z);
      if (d > revealRadius(w.spec.base.loud)) continue;
      out.push({ x: w.x, z: w.z, color: w.creature.shiny ? '#fff27a' : typeInfo(w.spec.types[0]).color, size: w.creature.shiny ? 6 : 5 });
    }
    return out;
  }

  nearest(p: THREE.Vector3, maxDist: number): WildCreature | null {
    let best: WildCreature | null = null;
    let bd = maxDist;
    for (const w of this.wild) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (!w.removed && !w.inPod && w.creature.hp > 0 && w.state !== 'fainted' && w.state !== 'knocked' && (w.alt ?? 0) < SKY.reach && d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  /** Debug: spawn a specific species near a point. */
  debugSpawn(id: string, level: number, x: number, z: number, shiny = false, biome: Biome = 'street', y?: number): WildCreature {
    return this.spawn(species(id), level, x, z, undefined, shiny, biome, y);
  }
}

function turnToward(from: number, to: number, maxStep: number): number {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}

// ---------------------------------------------------------------- flight

interface FlightBone {
  b: THREE.Object3D;
  /** The bone's rest pose, for bones the idle clip doesn't drive (so the offsets don't pile up). */
  rest: { rx: number; ry: number; rz: number; py: number } | null;
}
const flightRigs = new WeakMap<object, { wings: Array<FlightBone & { s: number; tip: boolean }>; legs: FlightBone[]; body: FlightBone | null }>();

function base(fb: FlightBone): void {
  if (!fb.rest) return;
  fb.b.rotation.set(fb.rest.rx, fb.rest.ry, fb.rest.rz);
  fb.b.position.y = fb.rest.py;
}

/**
 * Laid over the idle clip while a flyer is in the air: wings beat (fast for birds, slow for
 * moths, a glide high up), legs tuck back, the body leans into the way it's going and bobs with
 * each beat. Things without wings (smoke, fog) just drift and sway.
 */
export function flightPose(inst: { root: THREE.Object3D; clips?: Map<string, THREE.AnimationClip> }, w: { spec: { id: string }; speed: number; alt?: number; id: number }, time: number): void {
  let rig = flightRigs.get(inst);
  if (!rig) {
    const driven = new Set((inst.clips?.get('idle')?.tracks ?? []).map((t) => t.name.split('.')[0]));
    const fb = (o: THREE.Object3D): FlightBone => ({ b: o, rest: driven.has(o.name) ? null : { rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, py: o.position.y } });
    const r = { wings: [] as Array<FlightBone & { s: number; tip: boolean }>, legs: [] as FlightBone[], body: null as FlightBone | null };
    inst.root.traverse((o) => {
      const n = o.name;
      if (/^wing_[LR]/.test(n)) r.wings.push({ ...fb(o), s: n.includes('_L') ? 1 : -1, tip: /_(lo|tip)$/.test(n) });
      else if (/^leg_/.test(n) && !n.endsWith('_lo')) r.legs.push(fb(o));
      else if (n === 'body') r.body = fb(o);
    });
    rig = r;
    flightRigs.set(inst, rig);
  }
  const f = FLIGHT[w.spec.id];
  const high = (w.alt ?? 0) > (f?.cruise ?? 2) * 2.5;
  const big = (f?.high ?? 0) >= 14;
  // Birds beat quickly, moths and drifters slowly; gliding high up, only now and then.
  const hz = big ? 4.2 : 2.6;
  const ph = time * hz * Math.PI * 2 + w.id;
  const glide = high ? 0.25 + 0.75 * Math.max(0, Math.sin(time * 0.6 + w.id)) ** 6 : 1;
  const beat = Math.sin(ph);
  for (const wg of rig.wings) {
    base(wg);
    // Down-stroke fast, up-stroke slower; the tip lags the root.
    const a = (wg.tip ? 0.5 * Math.sin(ph - 0.9) : 0.95 * beat + 0.15) * glide + (1 - glide) * 0.15;
    wg.b.rotation.z += wg.s * a;
    wg.b.rotation.x += 0.15 * Math.cos(ph) * glide;
  }
  for (const l of rig.legs) {
    base(l);
    l.b.rotation.x -= 0.7;
  }
  const b = rig.body;
  if (b) {
    base(b);
    const lean = Math.min(0.35, w.speed * 0.08);
    b.b.rotation.x += lean;
    b.b.position.y += (rig.wings.length ? 0.05 : 0.08) * Math.sin(ph + (rig.wings.length ? Math.PI / 2 : 0)) * (rig.wings.length ? glide : 1);
    if (!rig.wings.length) b.b.rotation.z += 0.08 * Math.sin(time * 1.3 + w.id);
  }
}
