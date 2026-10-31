// @ts-check
/**
 * Destructible street props: the rules (engine-free, unit-tested). DestructionWorld.ts is the world
 * side (meshes, colliders, debris, the hydrant geyser).
 *
 * The approach is the one open-world games use for street furniture, rather than real-time
 * fracture: every prop is intact or broken (damage states), takes damage from cars, explosions,
 * gunfire, Streetmon moves and legendary stomps (scaled by its material), and when it breaks it's
 * swapped for a few pre-made debris pieces that get a physics push, settle, and fade out under a
 * fixed budget. Fast cars snap light props off and lose a little speed instead of stopping dead
 * ("breakaway" posts); slow ones bump into them as before. Broken props are repaired out of sight
 * once you've moved away (world repair), so the street never stays wrecked.
 *
 *   intact --(hp <= 0: car above breakSpeedKmh, explosion, bullets, moves, stomps)--> broken
 *   broken --(repairSeconds passed, player > repairMinDistance away, out of view)--> intact
 *
 * Props are found through a uniform grid, so a car's sweep, a blast or a battle's room check only
 * looks at the few props nearby.
 */

/** @typedef {import('./destruction').DestructibleConfig} DestructibleConfig */
/** @typedef {import('./destruction').Prop} Prop */
/** @typedef {import('./destruction').DamageSource} DamageSource */

export const DAMAGE_SOURCES = /** @type {const} */ (['car', 'explosion', 'bullet', 'melee', 'streetmon', 'legendary']);

/**
 * @param {DestructibleConfig} c
 * @returns {true}
 */
export function validateDestructibles(c) {
  const err = (/** @type {string} */ m) => {
    throw new Error(`destructibles: ${m}`);
  };
  if (!c?.kinds || !Object.keys(c.kinds).length) err('no kinds');
  for (const [id, k] of Object.entries(c.kinds)) {
    if (!(k.hp > 0)) err(`${id}: hp must be > 0`);
    if (!c.materials[k.material]) err(`${id}: unknown material ${k.material}`);
    if (!(k.radius > 0 && k.radius < 3)) err(`${id}: radius out of range`);
    if (!(k.breakSpeedKmh >= 0)) err(`${id}: breakSpeedKmh`);
    if (!(k.carSlow > 0 && k.carSlow <= 1)) err(`${id}: carSlow must be in (0, 1]`);
  }
  for (const [id, m] of Object.entries(c.materials)) for (const s of ['bullet', 'melee', 'explosion', 'streetmon', 'legendary']) if (!(/** @type {Record<string, number>} */ (m)[s] >= 0)) err(`material ${id}: ${s}`);
  const S = c.settings;
  if (!(S.maxDebris > 0) || !(S.repairSeconds > 0) || !(S.cellSize > 0)) err('settings');
  return true;
}

export class DestructionManager {
  /**
   * @param {{ config: DestructibleConfig; props: Array<{ kind: string; x: number; z: number; rot?: number; s?: number; layer?: string }> }} o
   */
  constructor(o) {
    validateDestructibles(o.config);
    this.config = o.config;
    this.S = o.config.settings;
    /** @type {Prop[]} */
    this.props = [];
    /** @type {Map<string, number[]>} */
    this.grid = new Map();
    this.time = 0;
    this.cursor = 0;
    this.stats = { broken: 0, repaired: 0, damaged: 0 };
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    for (const p of o.props) this.add(p);
  }

  /** @param {{ kind: string; x: number; z: number; rot?: number; s?: number; layer?: string }} p */
  add(p) {
    const def = this.config.kinds[p.kind];
    if (!def) throw new Error(`destructibles: unknown kind ${p.kind}`);
    const s = p.s ?? 1;
    /** @type {Prop} */
    const prop = { id: this.props.length, kind: p.kind, x: p.x, z: p.z, rot: p.rot ?? 0, s, layer: p.layer ?? 'street', hp: def.hp * s, maxHp: def.hp * s, radius: def.radius * Math.max(0.7, s), broken: false, brokenAt: 0 };
    this.props.push(prop);
    const key = this.cell(p.x, p.z);
    let list = this.grid.get(key);
    if (!list) this.grid.set(key, (list = []));
    list.push(prop.id);
    return prop;
  }

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

  /** @param {number} x @param {number} z */
  cell(x, z) {
    const c = this.S.cellSize;
    return `${Math.floor(x / c)},${Math.floor(z / c)}`;
  }

  /**
   * Props (intact unless `all`) whose footprint comes within `r` of (x, z).
   * @param {number} x @param {number} z @param {number} r @param {boolean} [all]
   * @returns {Prop[]}
   */
  near(x, z, r, all = false) {
    const c = this.S.cellSize;
    const reach = r + 1;
    const out = [];
    for (let cx = Math.floor((x - reach) / c); cx <= Math.floor((x + reach) / c); cx++)
      for (let cz = Math.floor((z - reach) / c); cz <= Math.floor((z + reach) / c); cz++) {
        for (const id of this.grid.get(`${cx},${cz}`) ?? []) {
          const p = this.props[id];
          if (!all && p.broken) continue;
          if (Math.hypot(p.x - x, p.z - z) <= r + p.radius) out.push(p);
        }
      }
    return out;
  }

  /** Is an intact prop in the way within `r` of (x, z)? @param {number} x @param {number} z @param {number} r */
  blocksAt(x, z, r) {
    return this.near(x, z, r).length > 0;
  }

  /**
   * Damage to one prop, scaled by its material for the source. Breaks it at 0 HP.
   * @param {Prop} p @param {number} amount @param {DamageSource} source
   * @param {{ dirX?: number; dirZ?: number; speed?: number }} [push] where the hit came from (for the debris)
   * @returns {boolean} broke
   */
  hit(p, amount, source, push = {}) {
    if (p.broken || amount <= 0) return false;
    const def = this.config.kinds[p.kind];
    const mat = /** @type {Record<string, number>} */ (this.config.materials[def.material]);
    const dmg = source === 'car' ? amount : amount * (mat[source] ?? 1);
    if (dmg <= 0) return false;
    p.hp = Math.max(0, p.hp - dmg);
    this.stats.damaged++;
    this.emit('damage', { prop: p, amount: dmg, source });
    if (p.hp > 0) return false;
    p.broken = true;
    p.brokenAt = this.time;
    this.stats.broken++;
    this.emit('break', { prop: p, source, dirX: push.dirX ?? 0, dirZ: push.dirZ ?? 0, speed: push.speed ?? 0 });
    return true;
  }

  /**
   * A car about to drive through props: anything within its half-width along the next `ahead`
   * metres. Fast enough, a prop snaps off (and the car is slowed); slower, it stays a solid post.
   * @param {{ x: number; z: number; vx: number; vz: number; halfWidth: number; ahead: number }} car
   * @returns {{ broken: Prop[]; slow: number; carDamage: number }}
   */
  carSweep(car) {
    const speed = Math.hypot(car.vx, car.vz);
    /** @type {Prop[]} */
    const broken = [];
    let slow = 1;
    let carDamage = 0;
    if (speed < 1) return { broken, slow, carDamage };
    const dx = car.vx / speed;
    const dz = car.vz / speed;
    const kmh = speed * 3.6;
    const span = car.ahead;
    for (const p of this.near(car.x + dx * span * 0.5, car.z + dz * span * 0.5, span * 0.5 + car.halfWidth)) {
      // In the car's path: ahead of it, within its half-width of the line.
      const rx = p.x - car.x;
      const rz = p.z - car.z;
      const along = rx * dx + rz * dz;
      const side = Math.abs(rx * dz - rz * dx);
      // The footprint radius is for standing room; what a bumper actually meets is the post or the
      // narrow side of a bench, so the sweep uses at most 0.4 m (kerbside traffic shouldn't clip
      // a bench set back on the pavement).
      if (along < -0.5 || along > span || side > car.halfWidth + Math.min(p.radius, 0.4)) continue;
      const def = this.config.kinds[p.kind];
      if (kmh < def.breakSpeedKmh) continue;
      if (this.hit(p, p.hp, 'car', { dirX: dx, dirZ: dz, speed })) {
        broken.push(p);
        slow *= def.carSlow;
        carDamage += def.carDamage ?? 0;
      }
    }
    return { broken, slow, carDamage };
  }

  /**
   * Damage in a radius, falling off to a third at the edge (explosions, stomps, area moves).
   * @param {number} x @param {number} z @param {number} radius @param {number} damage @param {DamageSource} source
   * @returns {Prop[]} broken
   */
  area(x, z, radius, damage, source) {
    /** @type {Prop[]} */
    const broken = [];
    for (const p of this.near(x, z, radius)) {
      const d = Math.hypot(p.x - x, p.z - z);
      const k = 1 - (Math.min(d, radius) / radius) * (2 / 3);
      const dirX = d > 0.01 ? (p.x - x) / d : 0;
      const dirZ = d > 0.01 ? (p.z - z) / d : 0;
      if (this.hit(p, damage * k, source, { dirX, dirZ, speed: 6 + 10 * k })) broken.push(p);
    }
    return broken;
  }

  /** An explosion of `radius` (a car blast, a tank shell): the config scales reach and damage. */
  explosion(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ radius) {
    const D = this.config.damage;
    return this.area(x, z, radius * D.explosionRadius, D.explosionDamage, 'explosion');
  }

  /** A Streetmon move landing at (x, z) with `power` (area moves reach further). */
  move(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ power, aoe = false, legendary = false) {
    const D = this.config.damage;
    return this.area(x, z, D.streetmonRadius * (aoe ? 1.6 : 1) * (legendary ? 2 : 1), power * D.streetmonPerPower, legendary ? 'legendary' : 'streetmon');
  }

  /** A legendary's stomp. */
  stomp(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ radius) {
    return this.area(x, z, radius, this.config.damage.stompDamage, 'legendary');
  }

  /**
   * Each frame: puts broken props back once they've been down long enough, you're far away and
   * the spot's out of view. Returns the props repaired.
   * @param {number} dt @param {{ x: number; z: number; visible(x: number, z: number): boolean }} ctx
   */
  update(dt, ctx) {
    this.time += dt;
    /** @type {Prop[]} */
    const out = [];
    // A slice of the props each frame (it's not urgent).
    const n = this.props.length;
    if (!n) return out;
    const per = Math.max(1, Math.ceil(n / 30));
    this.cursor = (this.cursor + per) % n;
    for (let i = 0; i < per; i++) {
      const p = this.props[(this.cursor + i) % n];
      if (!p.broken || this.time - p.brokenAt < this.S.repairSeconds) continue;
      if (Math.hypot(p.x - ctx.x, p.z - ctx.z) < this.S.repairMinDistance || ctx.visible(p.x, p.z)) continue;
      this.repair(p);
      out.push(p);
    }
    return out;
  }

  /** @param {Prop} p */
  repair(p) {
    if (!p.broken) return;
    p.broken = false;
    p.hp = p.maxHp;
    this.stats.repaired++;
    this.emit('repair', { prop: p });
  }

  /** Everything back as it was (a new game, a load). */
  repairAll() {
    for (const p of this.props) this.repair(p);
  }

  get brokenCount() {
    return this.props.filter((p) => p.broken).length;
  }
}
