import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import type { Effects } from '../fx/Effects';
import type { CityLayout } from '../world/CityLayout';
import { TANK_SPEC as T } from '../vehicles/specs';
import { rule, tankDue } from './Escalation';
import { armourDamage, avenueSpans, driveStep, headingTo, leadTarget, shellPitch, spansByDistance, spawnZ, turnToward, wrapAngle, type AveSpan } from './TankLogic';
import { withSurface } from '../render/Surfaces';

export { type AveSpan } from './TankLogic';

/**
 * Police tanks (5 stars). A tank is a kinematic hull that drives along the middle of an avenue
 * (no physics flipping; the tracks only animate), turns its turret toward you, leads its aim by
 * your velocity and, with a clear line of sight within range, glows for a second and fires a
 * shell. Shells fly with a little drop and explode on whatever they hit. Armour shrugs off bullets
 * (5%) but explosions and fire do full damage; a destroyed tank burns and drops weapons.
 *
 * The pure helpers at the top are unit-tested; TankSystem wires them to the world.
 */

const DEG = Math.PI / 180;
const [WIDTH, HEIGHT, LENGTH] = T.size;
/** How close a tank tries to get to you along the avenue (it stops there and shoots). */
const STANDOFF = 30;
const SIGHT_GROUPS = groups(0xffff, GROUP.WORLD);
const SHELL_GROUPS = groups(0xffff, GROUP.WORLD | GROUP.CAR);
const MUZZLE_Y = 2.25;

// ------------------------------------------------------------------ the tank

type Mode = 'hunt' | 'leave' | 'dead';

export interface TankTarget {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  /** Don't shoot (in a doorway on foot, underground, during a police Streetmon battle). */
  hold: boolean;
}

export interface TankHooks {
  /** Where you are (always), and whether the tank may shoot at you (null target = ignore you). */
  focus(): { x: number; z: number };
  target(): TankTarget | null;
  /** Is a point on screen? (tanks enter and leave out of view) */
  inView(x: number, y: number, z: number): boolean;
  /** A shell went off. */
  shellExploded(x: number, y: number, z: number, source: Tank | null): void;
  /** A tank fired (sound, flash). */
  fired(x: number, y: number, z: number): void;
  /** Contact with everything in the hull's way (cars, Streetmon, people, you). */
  crush(tank: Tank, dt: number): void;
  destroyed(tank: Tank): void;
}

interface TankView {
  root: THREE.Group;
  turret: THREE.Group;
  barrel: THREE.Group;
  glow: THREE.MeshStandardMaterial;
  hull: THREE.MeshStandardMaterial;
  sirens: THREE.MeshStandardMaterial[];
  cleats: THREE.Mesh[];
}

const CLEATS_PER_SIDE = 12;

function buildView(): TankView {
  const root = new THREE.Group();
  root.name = 'tank';
  const hull = withSurface(new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.7, metalness: 0.35 }), 'paintedMetal');
  const dark = withSurface(new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.9 }), 'rubber');
  const white = withSurface(new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.6 }), 'paintedMetal');
  const glow = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0xff4a1a, emissiveIntensity: 0 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Local +X is forward, +Z is right (same as the cars).
  const tw = 0.8;
  for (const s of [-1, 1]) {
    box(LENGTH, 1.0, tw, dark, 0, 0.55, s * (WIDTH / 2 - tw / 2));
    // Sloped track ends.
    const end = box(0.9, 0.7, tw, dark, LENGTH / 2 - 0.1, 0.55, s * (WIDTH / 2 - tw / 2));
    end.rotation.z = -0.5;
    const back = box(0.9, 0.7, tw, dark, -LENGTH / 2 + 0.1, 0.55, s * (WIDTH / 2 - tw / 2));
    back.rotation.z = 0.5;
  }
  box(LENGTH - 0.6, 0.75, WIDTH - 0.3, hull, 0, 1.35, 0);
  const glacis = box(1.2, 0.5, WIDTH - 0.4, hull, LENGTH / 2 - 0.55, 1.2, 0);
  glacis.rotation.z = -0.45;
  // POLICE stripe along both sides.
  for (const s of [-1, 1]) box(LENGTH - 1.2, 0.18, 0.04, white, 0, 1.45, s * (WIDTH / 2 - 0.13));
  // Track cleats (animated).
  const cleatGeo = new THREE.BoxGeometry(0.16, 0.08, tw + 0.04);
  const cleats: THREE.Mesh[] = [];
  for (const s of [-1, 1])
    for (let i = 0; i < CLEATS_PER_SIDE; i++) {
      const c = new THREE.Mesh(cleatGeo, hull);
      c.position.set(0, 1.08, s * (WIDTH / 2 - tw / 2));
      root.add(c);
      cleats.push(c);
    }
  // Turret.
  const turret = new THREE.Group();
  turret.position.set(-0.4, 1.72, 0);
  root.add(turret);
  box(2.9, 0.75, 2.5, hull, 0, 0.35, 0, turret);
  box(0.9, 0.18, 0.9, hull, -0.6, 0.82, 0.5, turret);
  const sirens: THREE.MeshStandardMaterial[] = [];
  for (const [i, col] of [0xff2a2a, 0x2a6bff].entries()) {
    const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2 });
    sirens.push(m);
    box(0.32, 0.16, 0.32, m, -0.9, 0.82, (i ? 1 : -1) * 0.7, turret);
  }
  const barrel = new THREE.Group();
  barrel.position.set(1.35, 0.4, 0);
  turret.add(barrel);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 3.6, 10), hull);
  tube.rotation.z = -Math.PI / 2;
  tube.position.x = 1.8;
  tube.castShadow = true;
  barrel.add(tube);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), glow);
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 3.5;
  barrel.add(tip);
  const band = box(0.3, 0.2, 2.55, glow, 0.9, 0.35, 0, turret);
  band.castShadow = false;
  return { root, turret, barrel, glow, hull, sirens, cleats };
}

let nextId = 1;

export class Tank {
  readonly id = nextId++;
  hp: number = T.armour.hp;
  mode: Mode = 'hunt';
  x: number;
  z: number;
  h: number;
  v = 0;
  span: AveSpan;
  turretYaw: number;
  pitch = 0;
  reload: number = T.turret.reload * 0.5;
  /** Seconds left of the pre-shot glow (0 = not warning). */
  warn = 0;
  sees = false;
  losIn = 0;
  wrongAveFor = 0;
  deadFor = 0;
  odometer = 0;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly view: TankView;
  private readonly q = new THREE.Quaternion();

  constructor(
    private readonly world: RAPIER.World,
    scene: THREE.Scene,
    span: AveSpan,
    z: number,
    h: number,
  ) {
    this.span = span;
    this.x = span.x;
    this.z = z;
    this.h = h;
    this.turretYaw = h;
    this.view = buildView();
    scene.add(this.view.root);
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, 0, z));
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(LENGTH / 2, HEIGHT / 2, WIDTH / 2).setTranslation(0, HEIGHT / 2, 0).setCollisionGroups(groups(GROUP.CAR, 0xffff)).setFriction(0.8),
      this.body,
    );
    this.place(true);
  }

  get forwardX(): number {
    return Math.cos(this.h);
  }

  get forwardZ(): number {
    return -Math.sin(this.h);
  }

  get alive(): boolean {
    return this.mode !== 'dead';
  }

  /** Muzzle position and direction (world). */
  muzzle(out: THREE.Vector3, dir: THREE.Vector3): void {
    const cp = Math.cos(this.pitch);
    dir.set(Math.cos(this.turretYaw) * cp, Math.sin(this.pitch), -Math.sin(this.turretYaw) * cp);
    // Turret pivot is 0.4 m behind the hull centre.
    const px = this.x - 0.4 * this.forwardX;
    const pz = this.z - 0.4 * this.forwardZ;
    out.set(px, MUZZLE_Y, pz).addScaledVector(dir, 4.9);
  }

  place(snap = false): void {
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.h);
    if (snap) {
      this.body.setTranslation({ x: this.x, y: 0, z: this.z }, true);
      this.body.setRotation(this.q, true);
    } else {
      this.body.setNextKinematicTranslation({ x: this.x, y: 0, z: this.z });
      this.body.setNextKinematicRotation(this.q);
    }
    const v = this.view;
    v.root.position.set(this.x, 0, this.z);
    v.root.rotation.y = this.h;
    v.turret.rotation.y = wrapAngle(this.turretYaw - this.h);
    v.barrel.rotation.z = this.pitch;
    // Tracks roll with the distance driven.
    const step = (LENGTH - 0.8) / CLEATS_PER_SIDE;
    const off = ((this.odometer % step) + step) % step;
    for (let i = 0; i < v.cleats.length; i++) {
      const k = i % CLEATS_PER_SIDE;
      v.cleats[i].position.x = -(LENGTH - 0.8) / 2 + ((k * step + off) % (LENGTH - 0.8));
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.view.root);
    this.view.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.world.removeRigidBody(this.body);
  }
}

interface Shell {
  mesh: THREE.Mesh;
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  source: Tank | null;
}

export class TankSystem {
  readonly tanks: Tank[] = [];
  private readonly spans: AveSpan[];
  private readonly shells: Shell[] = [];
  private atFiveFor = 0;
  private sinceLast = Infinity;
  private time = 0;
  /** Any tank can see you right now (counts as police sight). */
  seesPlayer = false;
  /** Smoke and the like: tanks can't see (or lock on) through it. */
  sightBlocked: ((ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean) | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    layout: CityLayout,
    private readonly effects: Effects,
    private readonly hooks: TankHooks,
  ) {
    this.spans = avenueSpans(layout);
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.shells.push({ mesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, source: null });
    }
  }

  /** Tanks out hunting (not leaving or wrecked). */
  get hunting(): number {
    return this.tanks.filter((t) => t.mode === 'hunt').length;
  }

  byCollider(handle: number): Tank | null {
    return this.tanks.find((t) => t.collider.handle === handle) ?? null;
  }

  /** Damages a tank. Returns true if this destroyed it. */
  damage(t: Tank, amount: number, kind: 'bullet' | 'explosive'): boolean {
    if (!t.alive) return false;
    t.hp -= armourDamage(amount, kind);
    if (t.hp > 0) return false;
    t.hp = 0;
    t.mode = 'dead';
    t.v = 0;
    t.warn = 0;
    t.view.glow.emissiveIntensity = 0;
    t.view.hull.color.set(0x1a1b1e);
    for (const s of t.view.sirens) s.emissiveIntensity = 0;
    this.effects.explosion(t.x, 1.5, t.z);
    // Knocking one out buys you a full minute before the next.
    this.sinceLast = 0;
    this.hooks.destroyed(t);
    return true;
  }

  /** An explosion: every tank within `radius` (except `exclude`) takes up to `amount`. */
  blast(x: number, z: number, radius: number, amount: number, exclude: Tank | null = null): void {
    for (const t of this.tanks) {
      if (t === exclude || !t.alive) continue;
      // Distance to the hull, not its centre.
      const d = Math.max(0, Math.hypot(t.x - x, t.z - z) - WIDTH / 2);
      if (d > radius) continue;
      this.damage(t, amount * (1 - d / radius), 'explosive');
    }
  }

  /** Fire on the ground: tanks within `radius` take `amount` (already scaled by dt). */
  burn(x: number, z: number, radius: number, amount: number): void {
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (Math.abs(t.x - x) < radius + WIDTH / 2 && Math.abs(t.z - z) < radius + LENGTH / 2) this.damage(t, amount, 'explosive');
    }
  }

  /** Busted, dead or a new game: every tank vanishes at once. */
  clearAll(): void {
    for (const t of this.tanks) t.dispose(this.scene);
    this.tanks.length = 0;
    for (const s of this.shells) {
      s.active = false;
      s.mesh.visible = false;
    }
    this.atFiveFor = 0;
    this.sinceLast = Infinity;
    this.seesPlayer = false;
  }

  update(dt: number, stars: number): void {
    this.time += dt;
    const f = this.hooks.focus();
    // Dispatch.
    if (stars >= 5) this.atFiveFor += dt;
    else {
      this.atFiveFor = 0;
      this.sinceLast = Infinity;
    }
    this.sinceLast += dt;
    if (tankDue(stars, this.atFiveFor, this.sinceLast, this.hunting) && this.spawn(f.x, f.z)) this.sinceLast = 0;

    const target = this.hooks.target();
    let sees = false;
    for (const t of [...this.tanks]) {
      if (t.mode === 'hunt' && stars < 5) t.mode = 'leave';
      this.updateTank(t, dt, f, target);
      if (t.sees) sees = true;
      if (this.gone(t, f)) {
        t.dispose(this.scene);
        this.tanks.splice(this.tanks.indexOf(t), 1);
      }
    }
    this.seesPlayer = sees;
    this.updateShells(dt, target);
  }

  /** Sends a tank to the avenue nearest you, entering out of view. */
  private spawn(px: number, pz: number): boolean {
    const t = rule(5)!.tanks!;
    for (const span of spansByDistance(this.spans, px, pz).slice(0, 3)) {
      // A second tank on the same avenue comes from the other side.
      const other = this.tanks.find((x) => x.alive && x.span === span);
      const prefer: 1 | -1 = other ? (other.z > pz ? -1 : 1) : Math.random() < 0.5 ? 1 : -1;
      const z = spawnZ(span, pz, t.spawnDistance, prefer, (zz) => this.hooks.inView(span.x, 1.5, zz) || this.tanks.some((x) => x.span === span && Math.abs(x.z - zz) < 20));
      if (z === null) continue;
      const h = pz > z ? -Math.PI / 2 : Math.PI / 2;
      this.tanks.push(new Tank(this.world, this.scene, span, z, h));
      return true;
    }
    return false;
  }

  private gone(t: Tank, f: { x: number; z: number }): boolean {
    const d = Math.hypot(t.x - f.x, t.z - f.z);
    if (t.mode === 'hunt') return false;
    if (t.mode === 'dead') return (t.deadFor > 30 && d > 120 && !this.hooks.inView(t.x, 1, t.z)) || t.deadFor > 150;
    return (d > 180 && !this.hooks.inView(t.x, 1.5, t.z)) || d > 330;
  }

  private updateTank(t: Tank, dt: number, f: { x: number; z: number }, target: TankTarget | null): void {
    const v = t.view;
    if (t.mode === 'dead') {
      t.deadFor += dt;
      t.sees = false;
      if (t.deadFor < 40 && Math.random() < dt * 14) this.effects.fire(t.x + (Math.random() - 0.5) * 3, 1.6, t.z + (Math.random() - 0.5) * 6);
      if (t.deadFor < 60 && Math.random() < dt * 6) this.effects.engineSmoke(t.x, 2.6, t.z, 1);
      t.place();
      return;
    }
    // Driving.
    let targetZ = f.z;
    if (t.mode === 'leave') targetZ = t.z + (t.z >= f.z ? 1 : -1) * 1000;
    else {
      // On the wrong avenue for a while (you've gone across town): pull out and let a fresh one come.
      const best = spansByDistance(this.spans, f.x, f.z)[0];
      t.wrongAveFor = best !== t.span && Math.abs(f.x - t.x) > 60 ? t.wrongAveFor + dt : 0;
      if (t.wrongAveFor > (rule(5)!.tanks!.relocateAfter ?? 15)) {
        t.mode = 'leave';
        this.sinceLast = Math.max(this.sinceLast, rule(5)!.tanks!.every - 8);
      }
    }
    const before = t.z;
    const s = driveStep({ z: t.z, h: t.h, v: t.v }, t.span, targetZ, t.mode === 'leave' ? 0 : STANDOFF, dt);
    t.z = s.z;
    t.h = s.h;
    t.v = s.v;
    t.odometer += Math.abs(t.z - before) * Math.sign(t.v || 1);
    if (t.v > 0.3) this.hooks.crush(t, dt);

    // Turret.
    const sirenOn = Math.floor(this.time * 3) % 2 === 0;
    v.sirens[0].emissiveIntensity = sirenOn ? 2.2 : 0.15;
    v.sirens[1].emissiveIntensity = sirenOn ? 0.15 : 2.2;
    const muzzle = this.tmp;
    const dir = this.tmp2;
    if (t.mode !== 'hunt' || !target) {
      t.turretYaw = turnToward(t.turretYaw, t.h, T.turret.turnRateDeg * DEG * dt);
      t.pitch *= 0.95;
      t.warn = 0;
      t.sees = false;
      v.glow.emissiveIntensity = 0;
      t.place();
      return;
    }
    const lead = leadTarget(t.x, t.z, target.x, target.z, target.vx, target.vz, T.turret.shell.speed);
    const dist = Math.hypot(lead.x - t.x, lead.z - t.z);
    const wantYaw = headingTo(t.x, t.z, lead.x, lead.z);
    t.turretYaw = turnToward(t.turretYaw, wantYaw, T.turret.turnRateDeg * DEG * dt);
    t.pitch = shellPitch(dist, target.y + 0.9 - MUZZLE_Y, T.turret.shell.speed, T.turret.shell.gravity);
    t.losIn -= dt;
    if (t.losIn <= 0) {
      t.losIn = 0.25;
      const d = Math.hypot(target.x - t.x, target.z - t.z);
      t.sees = d < T.turret.range && this.clearShot(t.x, MUZZLE_Y + 0.3, t.z, target.x, target.y + 1, target.z);
    }
    t.reload -= dt;
    const aimed = Math.abs(wrapAngle(wantYaw - t.turretYaw)) < 4 * DEG;
    if (t.warn > 0) {
      if (!t.sees || target.hold) {
        // Lost the shot: stand down for a moment.
        t.warn = 0;
        t.reload = Math.max(t.reload, 1);
      } else {
        t.warn -= dt;
        if (t.warn <= 0) {
          t.warn = 0;
          t.reload = T.turret.reload;
          t.muzzle(muzzle, dir);
          this.fire(t, muzzle, dir);
        }
      }
    } else if (t.reload <= 0 && t.sees && aimed && !target.hold) {
      t.warn = T.turret.warn;
    }
    v.glow.emissiveIntensity = t.warn > 0 ? 0.6 + 3.4 * (1 - t.warn / T.turret.warn) * (0.75 + 0.25 * Math.sin(this.time * 40)) : 0;
    t.place();
  }

  private clearShot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return true;
    if (this.sightBlocked?.(ax, ay, az, bx, by, bz)) return false;
    const ray = new RAPIER.Ray({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len });
    return !this.world.castRay(ray, len - 0.5, true, undefined, SIGHT_GROUPS);
  }

  private fire(t: Tank, at: THREE.Vector3, dir: THREE.Vector3): void {
    const s = this.shells.find((x) => !x.active);
    this.effects.muzzle(at.x, at.y, at.z, 4);
    this.effects.engineSmoke(at.x, at.y, at.z, 0.6);
    this.hooks.fired(at.x, at.y, at.z);
    if (!s) return;
    s.active = true;
    s.pos.copy(at);
    s.vel.copy(dir).multiplyScalar(T.turret.shell.speed);
    s.life = 0;
    s.source = t;
    s.mesh.visible = true;
  }

  private updateShells(dt: number, target: TankTarget | null): void {
    for (const s of this.shells) {
      if (!s.active) continue;
      s.life += dt;
      const from = this.tmp.copy(s.pos);
      s.vel.y -= T.turret.shell.gravity * dt;
      const step = s.vel.length() * dt;
      const dir = this.tmp2.copy(s.vel).normalize();
      const ray = new RAPIER.Ray(from, dir);
      const src = s.source && this.tanks.includes(s.source) ? s.source.body : undefined;
      const hit = this.world.castRay(ray, step, true, undefined, SHELL_GROUPS, undefined, src);
      let boom: THREE.Vector3 | null = null;
      if (hit) boom = from.clone().addScaledVector(dir, hit.timeOfImpact);
      else {
        s.pos.addScaledVector(s.vel, dt);
        if (target && s.pos.distanceTo(this.tmp2.set(target.x, target.y + 0.9, target.z)) < 1.4) boom = s.pos.clone();
        else if (s.pos.y <= 0.05) boom = s.pos.clone().setY(0.05);
      }
      if (boom) {
        s.active = false;
        s.mesh.visible = false;
        this.hooks.shellExploded(boom.x, boom.y, boom.z, s.source);
        continue;
      }
      if (s.life > 3) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.set(0, Math.atan2(-s.vel.z, s.vel.x), Math.atan2(s.vel.y, Math.hypot(s.vel.x, s.vel.z)));
    }
  }
}
