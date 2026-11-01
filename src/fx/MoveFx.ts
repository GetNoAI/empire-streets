import * as THREE from 'three';
import { audio } from '../audio/Audio';
import moveFxConfig from '../config/move_fx.json';
import { move as moveSpec, type MoveSpec } from '../creatures/Data';
import { markBloom } from '../render/SelectiveBloom';
import type { Effects } from './Effects';
import { impactFor, planMoveFx, type FxImpact, type MoveFxConfig, type MoveFxPlan } from './moveFxPlan.js';

/**
 * Draws Streetmon moves (plans from moveFxPlan.js): gunfire and pellets, ricochets, beams, jagged
 * lightning, glowing orbs with trails, lobbed and falling rubble, charges with dust and fire
 * trails, shockwave rings rolling across the ground, smoke plumes, sludge globs, blasts, auras for
 * buffs, debuffs and heals, smoke veils and broken glass; then the impact (sparks, dust, shards,
 * zaps, puffs, splashes, rings, flashes), its sound, and camera shake for the big ones.
 *
 * Meshes come from small pools and live for a fraction of a second; particles go through the
 * shared Effects pool. Used by battles (BattleController), the street's own fights (LivingWorld)
 * and the legendary raids (RaidWorld).
 */

export const MOVE_FX = moveFxConfig as unknown as MoveFxConfig;

export interface MoveFxDeps {
  scene: THREE.Scene;
  effects: Effects;
  groundY(x: number, z: number): number;
  /** Where the listener is (for sound distance). */
  listener(): THREE.Vector3;
  /** Camera shake, 0-1. */
  shake?(amount: number): void;
  /** A damaging move landed at `at` (street props nearby take the hit). */
  landed?(at: THREE.Vector3, plan: MoveFxPlan): void;
}

type Live = {
  mesh: THREE.Object3D;
  t: number;
  dur: number;
  step(k: number, dt: number): void;
  done?(): void;
};

const rgb = (hex: string): { r: number; g: number; b: number } => {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
};

export class MoveFx {
  private readonly live: Live[] = [];
  private readonly plans = new Map<string, MoveFxPlan>();
  private readonly orbGeo = new THREE.SphereGeometry(1, 12, 10);
  private readonly ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  private readonly chunkGeo = new THREE.DodecahedronGeometry(1, 0);
  private readonly mats = new Map<string, THREE.Material>();
  private readonly light: THREE.PointLight;
  private lightT = 0;
  private lightI = 0;
  private readonly tmp = new THREE.Vector3();
  /** Cap on live meshes (beyond this, the oldest are cut short). */
  static readonly MAX_LIVE = 80;

  constructor(private readonly d: MoveFxDeps) {
    this.light = new THREE.PointLight(0xffffff, 0, 14, 2);
    d.scene.add(this.light);
    this.beamGeo.translate(0, 0.5, 0);
    this.beamGeo.rotateX(Math.PI / 2); // along +Z
  }

  /** The plan for a move (cached). */
  plan(m: MoveSpec | string): MoveFxPlan {
    const spec = typeof m === 'string' ? moveSpec(m) : m;
    let p = this.plans.get(spec.id);
    if (!p) {
      p = planMoveFx(spec as never, MOVE_FX);
      this.plans.set(spec.id, p);
    }
    return p;
  }

  /** A type's everyday look (for fights where the move isn't known). */
  typePlan(type: string, power = 50): MoveFxPlan {
    const key = `type:${type}:${power}`;
    let p = this.plans.get(key);
    if (!p) {
      p = planMoveFx({ id: key, type, power, target: 'foe' }, MOVE_FX);
      this.plans.set(key, p);
    }
    return p;
  }

  private dist(at: THREE.Vector3): number {
    return this.d.listener().distanceTo(at);
  }

  private glowMat(color: string, opacity = 1, mul = 2): THREE.MeshBasicMaterial {
    const key = `g${color}${opacity}${mul}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mul), transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      this.mats.set(key, m);
    }
    return m;
  }

  private solidMat(color: string): THREE.MeshStandardMaterial {
    const key = `s${color}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      this.mats.set(key, m);
    }
    return m;
  }

  private add(l: Live): void {
    if (this.live.length >= MoveFx.MAX_LIVE) {
      const old = this.live.shift()!;
      old.mesh.removeFromParent();
      // (Cut short, but whatever it was waiting to do still happens.)
      old.done?.();
    }
    this.d.scene.add(l.mesh);
    this.live.push(l);
  }

  private later(delay: number, fn: () => void): void {
    const holder = new THREE.Object3D();
    this.add({ mesh: holder, t: 0, dur: Math.max(0.001, delay), step: () => {}, done: fn });
  }

  private flashLight(at: THREE.Vector3, color: string, intensity: number): void {
    this.light.color.set(color);
    this.light.position.copy(at).setY(at.y + 0.8);
    this.lightI = intensity;
    this.light.intensity = intensity;
    this.lightT = 0.25;
  }

  // ------------------------------------------------------------------ casting

  /**
   * Starts a move: the cast at `from` and whatever flies, rolls or falls onto `targets`. The impacts
   * themselves are played by `impact()` (battles time them with the damage); `onLand` fires when
   * the visuals reach the first target (for fights that don't have their own timing).
   */
  cast(p: MoveFxPlan, from: THREE.Vector3, targets: THREE.Vector3[], onLand?: () => void): void {
    const to = targets[0] ?? from;
    audio.moveSfx(p.sound, from, p.scale);
    const c = rgb(p.color);
    const E = this.d.effects;
    switch (p.style) {
      case 'shot':
      case 'spray': {
        const spray = p.style === 'spray';
        for (let i = 0; i < p.count; i++) {
          const delay = spray ? 0 : i * 0.075;
          this.later(delay, () => {
            const j = spray ? 0.55 : 0.15;
            const tx = to.x + (Math.random() - 0.5) * j;
            const ty = to.y + (Math.random() - 0.5) * j * 0.6;
            const tz = to.z + (Math.random() - 0.5) * j;
            if (i === 0 || !spray) E.muzzle(from.x, from.y, from.z, 0.7 * p.scale);
            E.tracer(from.x, from.y, from.z, tx, ty, tz);
            if (p.trail) this.streak(from, new THREE.Vector3(tx, ty, tz), p.color, 10);
          });
        }
        break;
      }
      case 'ricochet': {
        E.muzzle(from.x, from.y, from.z, 0.8);
        E.tracer(from.x, from.y, from.z, to.x, to.y, to.z);
        const side = new THREE.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(2.5 * (Math.random() < 0.5 ? -1 : 1));
        this.later(0.12, () => {
          E.sparks(to.x, to.y, to.z, 8);
          E.tracer(to.x, to.y, to.z, to.x + side.x, to.y + 1.2, to.z + side.z);
          audio.bulletHit(true, to);
        });
        break;
      }
      case 'beam': {
        const mesh = new THREE.Mesh(this.beamGeo, this.glowMat(p.color, 0.85, 2.4));
        markBloom(mesh);
        const len = from.distanceTo(to);
        mesh.position.copy(from);
        mesh.lookAt(to);
        const r = 0.07 * p.scale;
        this.add({
          mesh,
          t: 0,
          dur: 0.5,
          step: (k) => {
            const grow = Math.min(1, k * 5);
            const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
            const w = r * (0.75 + 0.35 * Math.sin(k * 60)) * fade;
            mesh.scale.set(w, w, len * grow);
          },
        });
        this.flashLight(from, p.color, 30 * p.scale);
        this.streak(from, to, p.color, 14);
        break;
      }
      case 'bolt': {
        for (let i = 0; i < p.count; i++) this.later(i * 0.07, () => this.bolt(from, targets[i % Math.max(1, targets.length)] ?? to, p.color, p.scale));
        this.flashLight(to, p.color, 20 * p.scale);
        break;
      }
      case 'orb':
      case 'splash': {
        for (let i = 0; i < p.count; i++) {
          const tgt = targets[i % Math.max(1, targets.length)] ?? to;
          this.later(i * 0.08, () => this.orb(from, tgt, p, p.style === 'splash' ? 1.4 : 0.6, i === 0 ? onLand : undefined));
        }
        return;
      }
      case 'lob': {
        for (let i = 0; i < p.count; i++) {
          const tgt = targets[i % Math.max(1, targets.length)] ?? to;
          this.later(i * 0.06, () => this.chunk(from, tgt, p, 2.2, i === 0 ? onLand : undefined));
        }
        return;
      }
      case 'drop': {
        for (let i = 0; i < p.count; i++) {
          const tgt = targets[i % Math.max(1, targets.length)] ?? to;
          const above = tgt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 7 + Math.random() * 3, (Math.random() - 0.5) * 2.4));
          const land = tgt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6));
          this.later(i * 0.07, () => this.chunk(above, land, p, 0, i === 0 ? onLand : undefined, 0.42));
        }
        return;
      }
      case 'slam':
      case 'dash': {
        // The lunge itself is the battle's (it moves the creature); here the trail behind it.
        const n = p.style === 'dash' ? 14 : 6;
        for (let i = 0; i < n; i++) {
          const k = i / n;
          this.later(k * p.travel, () => {
            const x = from.x + (to.x - from.x) * k * 0.8;
            const z = from.z + (to.z - from.z) * k * 0.8;
            const gy = this.d.groundY(x, z);
            E.burst({ x, y: gy + 0.1, z, count: 3, r: 0.55, g: 0.53, b: 0.5, speed: 0.8, up: 0.6, life: 0.7, size0: 0.3, size1: 1.0, alpha: 0.4, additive: false, drag: 2 });
            if (p.fire) E.fire(x, gy + 0.2, z);
            if (p.trail) E.burst({ x, y: gy + 0.5, z, count: 2, ...c, speed: 0.5, life: 0.4, size0: 0.35, size1: 0.1 });
          });
        }
        break;
      }
      case 'wave': {
        // Rings roll out from the user across the ground to the farthest target.
        const reach = Math.max(2, ...targets.map((t) => Math.hypot(t.x - from.x, t.z - from.z))) + 1;
        const n = Math.max(1, Math.min(4, p.count + (p.scale > 1.3 ? 1 : 0)));
        for (let i = 0; i < n; i++) this.later(i * 0.09, () => this.ring(from, reach, p.color, p.travel + 0.15, 0.9));
        if (p.scale > 1.3) this.flashLight(from, p.color, 25 * p.scale);
        break;
      }
      case 'cloud': {
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          this.later((i / steps) * p.travel, () => {
            const k = i / steps;
            for (const tgt of targets.length ? targets : [to]) {
              const x = from.x + (tgt.x - from.x) * k;
              const z = from.z + (tgt.z - from.z) * k;
              E.burst({ x, y: from.y + (tgt.y - from.y) * k, z, count: 2, ...c, speed: 0.6, up: 0.4, life: 1.4, size0: 0.6 * p.scale, size1: 2.4 * p.scale, alpha: 0.35, additive: false, drag: 1.2, lift: 0.2, jitter: 0.4 });
            }
          });
        }
        break;
      }
      case 'blast': {
        this.later(p.travel, () => {
          for (const tgt of targets.length ? targets : [to]) {
            E.burst({ x: tgt.x, y: tgt.y, z: tgt.z, count: Math.round(26 * p.scale), ...c, speed: 6 * p.scale, up: 2, life: 0.55, size0: 0.9 * p.scale, size1: 0.2, drag: 3 });
            E.burst({ x: tgt.x, y: tgt.y, z: tgt.z, count: 10, r: 0.15, g: 0.14, b: 0.15, speed: 2, up: 1.5, life: 1.6, size0: 0.8, size1: 3, alpha: 0.5, additive: false, drag: 1.4, lift: 0.4 });
            if (p.fire) for (let i = 0; i < 8; i++) E.fire(tgt.x, tgt.y - 0.3, tgt.z);
            this.flashLight(tgt, p.color, 45 * p.scale);
          }
        });
        break;
      }
      case 'buff':
      case 'heal': {
        const heal = p.style === 'heal';
        for (let i = 0; i < 2; i++) this.later(i * 0.15, () => this.aura(from, heal ? '#4be37a' : p.color, true));
        E.burst({ x: from.x, y: from.y - 0.2, z: from.z, count: heal ? 18 : 10, ...(heal ? rgb('#7dff9a') : c), speed: 0.6, up: 2.2, life: 0.9, size0: 0.18, size1: 0.05, jitter: 0.8, drag: 1, lift: -0.5 });
        break;
      }
      case 'debuff': {
        for (const tgt of targets.length ? targets : [to]) {
          this.later(p.travel, () => {
            this.aura(tgt, p.color, false);
            E.burst({ x: tgt.x, y: tgt.y + 1.4, z: tgt.z, count: 10, ...c, speed: 0.4, up: -1.5, life: 0.8, size0: 0.16, size1: 0.05, jitter: 0.9, drag: 0.5, lift: -2 });
          });
        }
        if (p.flash) this.flashLight(to, p.color, 50);
        break;
      }
      case 'veil': {
        for (const tgt of targets.length ? targets : [to]) {
          for (let i = 0; i < 8; i++)
            this.later(p.travel + i * 0.05, () =>
              E.burst({ x: tgt.x, y: tgt.y, z: tgt.z, count: 2, ...c, speed: 1.2, up: 0.3, life: 2.4, size0: 1.2, size1: 3.5, alpha: 0.3, additive: false, drag: 1.5, lift: 0.1, jitter: 2.2 }),
            );
        }
        break;
      }
      case 'glass': {
        for (const tgt of targets.length ? targets : [to]) {
          this.later(p.travel, () => {
            const gy = this.d.groundY(tgt.x, tgt.z);
            E.burst({ x: tgt.x, y: gy + 0.6, z: tgt.z, count: 24, ...c, speed: 3, up: 2, life: 0.9, size0: 0.1, size1: 0.06, jitter: 1.4, drag: 1, lift: -9 });
            audio.moveSfx('glass', tgt);
          });
        }
        break;
      }
      case 'reload':
        E.burst({ x: from.x, y: from.y, z: from.z, count: 4, r: 0.9, g: 0.75, b: 0.35, speed: 1.5, up: 2, life: 0.6, size0: 0.08, size1: 0.05, lift: -9 });
        break;
    }
    if (onLand) this.later(p.travel, onLand);
  }

  // ------------------------------------------------------------------ impacts

  /** The hit landing: its impact look, sound and shake (heavier for crits and super-effective hits). */
  impact(p: MoveFxPlan, at: THREE.Vector3, hit: { crit: boolean; mult: number } = { crit: false, mult: 1 }): void {
    const f = impactFor(p, hit);
    audio.moveSfx(f.sound, at, f.size);
    this.burstImpact(f.impact, at, p.color, f.size);
    if (f.flash) {
      this.flashLight(at, hit.crit ? '#ffffff' : p.color, 25 * f.size);
      this.ring(at, 1.6 * f.size, hit.crit ? '#ffffff' : p.color, 0.3, 0.9);
    }
    if (f.shake > 0) this.d.shake?.(f.shake);
    if (p.power > 0) this.d.landed?.(at, p);
  }

  private burstImpact(kind: FxImpact, at: THREE.Vector3, color: string, size: number): void {
    const E = this.d.effects;
    const c = rgb(color);
    const n = (k: number): number => Math.max(2, Math.round(k * size));
    switch (kind) {
      case 'sparks':
        E.sparks(at.x, at.y, at.z, n(8));
        break;
      case 'dust': {
        const gy = this.d.groundY(at.x, at.z);
        E.burst({ x: at.x, y: gy + 0.15, z: at.z, count: n(14), r: 0.6, g: 0.57, b: 0.52, speed: 2.5 * size, up: 0.8, life: 1.1, size0: 0.4, size1: 1.6 * size, alpha: 0.45, additive: false, drag: 2.4, flat: true });
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(6), r: 0.5, g: 0.48, b: 0.45, speed: 3, up: 3, life: 0.7, size0: 0.12, size1: 0.08, alpha: 1, additive: false, drag: 0.5, lift: -9 });
        break;
      }
      case 'shards':
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(12), r: 0.82, g: 0.8, b: 0.76, speed: 4, up: 2, life: 0.6, size0: 0.12, size1: 0.06, alpha: 1, additive: false, drag: 0.6, lift: -9 });
        break;
      case 'zap':
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(14), ...c, speed: 5, up: 1, life: 0.3, size0: 0.22, size1: 0.04, drag: 2 });
        for (let i = 0; i < 2; i++) this.bolt(at.clone().add(new THREE.Vector3(0, 1.1 * size, 0)), at, color, 0.5 * size, 0.18);
        break;
      case 'puff':
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(10), ...c, speed: 1.4, up: 0.6, life: 1.3, size0: 0.6 * size, size1: 2.2 * size, alpha: 0.35, additive: false, drag: 1.6, lift: 0.2 });
        break;
      case 'splash':
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(18), ...c, speed: 3.5, up: 3, life: 0.8, size0: 0.22, size1: 0.12, alpha: 0.95, additive: false, drag: 0.6, lift: -9 });
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(4), ...c, speed: 0.4, life: 1, size0: 0.4, size1: 1.2, alpha: 0.4, drag: 1 });
        break;
      case 'wave':
        this.ring(at, 2 * size, color, 0.35, 0.9);
        E.sparks(at.x, at.y, at.z, n(4));
        break;
      case 'flash':
        this.flashLight(at, color, 30 * size);
        E.burst({ x: at.x, y: at.y, z: at.z, count: n(10), ...c, speed: 3, life: 0.35, size0: 0.4, size1: 0.05, drag: 2 });
        break;
    }
  }

  // ------------------------------------------------------------------ pieces

  /** Glowing specks along a line (a tracer's trail, a beam's sparkle). */
  private streak(a: THREE.Vector3, b: THREE.Vector3, color: string, n: number): void {
    const c = rgb(color);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      this.d.effects.burst({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, count: 1, ...c, speed: 0.3, life: 0.35, size0: 0.22, size1: 0.04, drag: 2 });
    }
  }

  /** A jagged lightning bolt that re-forks a few times before it fades. */
  private bolt(a: THREE.Vector3, b: THREE.Vector3, color: string, scale: number, dur = 0.28): void {
    const segs = 9;
    const pos = new Float32Array((segs + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, toneMapped: false, depthWrite: false }));
    markBloom(line);
    const jag = (): void => {
      for (let i = 0; i <= segs; i++) {
        const k = i / segs;
        const off = i === 0 || i === segs ? 0 : 0.35 * scale;
        pos[i * 3] = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * off;
        pos[i * 3 + 1] = a.y + (b.y - a.y) * k + (Math.random() - 0.5) * off;
        pos[i * 3 + 2] = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * off;
      }
      geo.attributes['position'].needsUpdate = true;
    };
    jag();
    let last = 0;
    this.add({
      mesh: line,
      t: 0,
      dur,
      step: (k) => {
        if (k - last > 0.18) {
          jag();
          last = k;
        }
        (line.material as THREE.LineBasicMaterial).opacity = 1 - k;
      },
      done: () => {
        geo.dispose();
        (line.material as THREE.Material).dispose();
      },
    });
  }

  /** A glowing shot (or sludge glob) on an arc, with a trail; bursts on landing. */
  private orb(a: THREE.Vector3, b: THREE.Vector3, p: MoveFxPlan, arc: number, onLand?: () => void): void {
    const mesh = new THREE.Mesh(this.orbGeo, p.style === 'splash' ? this.solidMat(p.color) : this.glowMat(p.color));
    if (p.style !== 'splash') markBloom(mesh);
    const r = 0.14 * p.scale * (p.style === 'splash' ? 1.4 : 1);
    mesh.scale.setScalar(r);
    const c = rgb(p.color);
    this.add({
      mesh,
      t: 0,
      dur: p.travel,
      step: (k) => {
        mesh.position.lerpVectors(a, b, k);
        mesh.position.y += Math.sin(Math.PI * k) * arc;
        this.d.effects.burst({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, count: 1, ...c, speed: 0.2, life: 0.3, size0: r * 1.6, size1: 0.02, additive: p.style !== 'splash', alpha: 0.7, drag: 1 });
      },
      done: () => {
        if (p.style === 'splash') this.burstImpact('splash', b, p.color, p.scale);
        onLand?.();
      },
    });
  }

  /** A chunk of rubble (or a coin) arcing (or falling) onto a spot. */
  private chunk(a: THREE.Vector3, b: THREE.Vector3, p: MoveFxPlan, arc: number, onLand?: () => void, dur = p.travel): void {
    const coin = p.id === 'coinToss';
    const mesh = new THREE.Mesh(this.chunkGeo, coin ? this.glowMat(p.color, 1, 1.4) : this.solidMat(p.color === '#b8b3a8' ? '#8f8b84' : p.color));
    const r = (coin ? 0.09 : 0.18 + Math.random() * 0.14) * p.scale;
    mesh.scale.set(r, coin ? r * 0.25 : r * (0.7 + Math.random() * 0.5), r);
    const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    this.add({
      mesh,
      t: 0,
      dur,
      step: (k, dt) => {
        mesh.position.lerpVectors(a, b, arc > 0 ? k : k * k);
        if (arc > 0) mesh.position.y += Math.sin(Math.PI * k) * arc;
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
      },
      done: () => {
        const gy = this.d.groundY(b.x, b.z);
        this.d.effects.burst({ x: b.x, y: gy + 0.1, z: b.z, count: 6, r: 0.6, g: 0.57, b: 0.52, speed: 1.6, up: 0.5, life: 0.9, size0: 0.3, size1: 1.1, alpha: 0.4, additive: false, drag: 2.4, flat: true });
        onLand?.();
      },
    });
  }

  /** A flat ring on the ground growing to `radius`. */
  ring(at: THREE.Vector3, radius: number, color: string, dur: number, opacity = 0.9): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.glowMat(color, opacity, 1.8).clone());
    markBloom(mesh);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, this.d.groundY(at.x, at.z) + 0.07, at.z);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    this.add({
      mesh,
      t: 0,
      dur,
      step: (k) => {
        mesh.scale.setScalar(0.2 + radius * k);
        mat.opacity = opacity * (1 - k);
      },
      done: () => mat.dispose(),
    });
  }

  /** Rings rising (buff) or sinking (debuff) round a creature. */
  private aura(at: THREE.Vector3, color: string, rising: boolean): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.glowMat(color, 0.8, 1.8).clone());
    markBloom(mesh);
    mesh.rotation.x = -Math.PI / 2;
    const gy = this.d.groundY(at.x, at.z);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    this.add({
      mesh,
      t: 0,
      dur: 0.7,
      step: (k) => {
        const h = rising ? k * 1.6 : 1.6 - k * 1.6;
        mesh.position.set(at.x, gy + 0.1 + h, at.z);
        mesh.scale.setScalar(0.7 + 0.25 * Math.sin(k * Math.PI));
        mat.opacity = 0.8 * (1 - k * 0.8);
      },
      done: () => mat.dispose(),
    });
  }

  /**
   * A legendary's stomp: a shockwave ring out to `radius`, dust, a flash and a quake; returns
   * nothing (the game applies the damage).
   */
  stomp(at: THREE.Vector3, radius: number, color: string): void {
    const gy = this.d.groundY(at.x, at.z);
    this.ring(new THREE.Vector3(at.x, gy, at.z), radius, color, 0.55, 1);
    this.ring(new THREE.Vector3(at.x, gy, at.z), radius * 0.6, '#ffffff', 0.4, 0.7);
    this.d.effects.burst({ x: at.x, y: gy + 0.2, z: at.z, count: 40, r: 0.58, g: 0.55, b: 0.5, speed: radius * 0.9, up: 1, life: 1.4, size0: 0.6, size1: 2.6, alpha: 0.45, additive: false, drag: 2, flat: true });
    this.flashLight(at, color, 60);
    const d = this.dist(at);
    audio.moveSfx('stomp', at, 1.6);
    if (d < radius * 3) this.d.shake?.(Math.max(0.2, 1 - d / (radius * 3)));
  }

  /**
   * An everyday attack between two creatures on the street (NPC hunts, turf fights): the type's
   * look, flying from one to the other; `onHit` when it lands. Far away: no visuals, just the hit.
   */
  typeAttack(type: string, from: THREE.Vector3, to: THREE.Vector3, hit: { crit: boolean; mult: number; power?: number }, onHit: () => void, near = true): void {
    if (!near) {
      onHit();
      return;
    }
    const p = this.typePlan(type, hit.power ?? 50);
    let landed = false;
    this.cast(p, from, [to], () => {
      if (landed) return;
      landed = true;
      this.impact(p, to, hit);
      onHit();
    });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      l.step(k, dt);
      if (l.t >= l.dur) {
        this.live.splice(i, 1);
        l.mesh.removeFromParent();
        l.done?.();
      }
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightI * (this.lightT / 0.25) ** 2);
    }
    void this.tmp;
  }

  /** Live meshes (tests, profiling). */
  get liveCount(): number {
    return this.live.length;
  }
}
