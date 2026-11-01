import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { Effects } from '../fx/Effects';
import type { CatchRoll } from './Catching';
import { withSurface } from '../render/Surfaces';

/**
 * The capture animation: the item is thrown in an arc, the creature is pulled into it in a flash,
 * the item drops and shakes (up to three times) and then either clicks shut or bursts open.
 */

export interface CatchTarget {
  /** Feet position of the creature. */
  pos: THREE.Vector3;
  height: number;
  /** The creature's model (scaled down while it's inside). */
  root: THREE.Object3D | null;
}

interface Run {
  item: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  ground: THREE.Vector3;
  target: CatchTarget;
  roll: CatchRoll;
  t: number;
  /** Timeline marks (seconds). */
  land: number;
  shakeStart: number;
  end: number;
  shakesDone: number;
  resolved: boolean;
  onShake?: (n: number) => void;
  onDone: (caught: boolean) => void;
  baseScale: number;
}

const FLIGHT = 0.6;
const ABSORB = 0.35;
const SETTLE = 0.45;
const SHAKE = 0.5;
const PAUSE = 0.35;
const OUTRO = 0.7;

export class CatchVisuals {
  private run: Run | null = null;
  private readonly mats = {
    steel: withSurface(new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 0.9 }), 'bareMetal'),
    wood: withSurface(new THREE.MeshStandardMaterial({ color: 0x9c6b3c, roughness: 0.8 }), 'wood'),
    darkWood: withSurface(new THREE.MeshStandardMaterial({ color: 0x5e3e22, roughness: 0.85 }), 'wood'),
    rope: withSurface(new THREE.MeshStandardMaterial({ color: 0xd8c79a, roughness: 0.95 }), 'fabric'),
    weight: withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 }), 'paintedMetal'),
    glow: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd34d, emissiveIntensity: 2 }),
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly effects: Effects,
  ) {}

  /** Item meshes (also used for icons). */
  makeItem(id: string): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats;
    if (id === 'crate') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), m.wood);
      g.add(box);
      for (const y of [-0.1, 0, 0.1]) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.36), m.darkWood);
        slat.position.y = y;
        g.add(slat);
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), m.darkWood);
        post.position.set(x * 0.16, 0, z * 0.16);
        g.add(post);
      }
    } else if (id === 'net') {
      const bundle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), m.rope);
      g.add(bundle);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 16), m.rope);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), m.weight);
        w.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
        g.add(w);
      }
    } else if (id === 'lure') {
      // A jar of glowing green bait with a lid.
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x9be22d, emissive: 0x4a8a10, emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.85 }));
      g.add(jar);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 10), m.steel);
      lid.position.y = 0.12;
      g.add(lid);
    } else if (id === 'cage') {
      // A small steel cage: frame and bars.
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), m.steel);
        post.position.set(x * 0.16, 0, z * 0.16);
        g.add(post);
      }
      for (const y of [-0.16, 0.16]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.36), m.steel);
        frame.position.y = y;
        g.add(frame);
      }
      for (let i = -2; i <= 2; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.32, 0.012), m.steel);
        bar.position.set(i * 0.06, 0, 0.16);
        g.add(bar);
      }
    } else {
      // Cuffs: two steel rings and a short chain.
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 18), m.steel);
        ring.position.x = s * 0.1;
        g.add(ring);
      }
      for (let i = 0; i < 3; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 4, 8), m.steel);
        link.position.x = -0.025 + i * 0.025;
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        g.add(link);
      }
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return g;
  }

  /**
   * Plays a capture. `ground` is the floor height under the target. `onShake(n)` fires on each
   * shake, `onDone(caught)` at the end.
   */
  play(itemId: string, from: THREE.Vector3, target: CatchTarget, groundY: number, roll: CatchRoll, onDone: (caught: boolean) => void, onShake?: (n: number) => void): void {
    this.cancel();
    const item = this.makeItem(itemId);
    item.position.copy(from);
    this.scene.add(item);
    const to = target.pos.clone().setY(target.pos.y + target.height * 0.55);
    const ground = target.pos.clone().setY(groundY + 0.15);
    const shakeStart = FLIGHT + ABSORB + SETTLE;
    const nShakes = roll.shakes;
    const end = shakeStart + nShakes * (SHAKE + PAUSE) + OUTRO;
    this.run = {
      item,
      from: from.clone(),
      to,
      ground,
      target,
      roll,
      t: 0,
      land: FLIGHT + ABSORB,
      shakeStart,
      end,
      shakesDone: 0,
      resolved: false,
      onShake,
      onDone,
      baseScale: target.root?.scale.x ?? 1,
    };
    audio.pod('throw', from);
  }

  cancel(): void {
    const r = this.run;
    if (!r) return;
    r.item.removeFromParent();
    if (r.target.root) r.target.root.scale.setScalar(r.baseScale);
    this.run = null;
  }

  update(dt: number): void {
    const r = this.run;
    if (!r) return;
    r.t += dt;
    const t = r.t;
    const it = r.item;
    const root = r.target.root;
    if (t < FLIGHT) {
      // Arc toward the creature, spinning.
      const u = t / FLIGHT;
      it.position.lerpVectors(r.from, r.to, u);
      it.position.y += Math.sin(Math.PI * u) * 1.4;
      it.rotation.set(u * 9, u * 6, 0);
    } else if (t < FLIGHT + ABSORB) {
      // Flash; the creature is pulled in.
      const u = (t - FLIGHT) / ABSORB;
      if (u < dt / ABSORB + 1e-3) {
        this.effects.sparks(r.to.x, r.to.y, r.to.z, 16);
        audio.pod('open', r.to);
      }
      it.position.copy(r.to);
      it.rotation.set(0, 0, 0);
      if (root) root.scale.setScalar(Math.max(0.02, r.baseScale * (1 - u)));
    } else if (t < r.shakeStart) {
      // Drop to the ground with a little bounce.
      const u = (t - r.land) / SETTLE;
      if (root) root.scale.setScalar(0.001);
      if (u >= 0.62 && u - dt / SETTLE < 0.62) audio.pod('land', r.ground);
      it.position.lerpVectors(r.to, r.ground, Math.min(1, u * 1.6));
      if (u > 0.62) it.position.y = r.ground.y + Math.abs(Math.sin((u - 0.62) * Math.PI * 2.6)) * 0.08 * (1 - u);
    } else if (t < r.end - OUTRO) {
      // Shakes.
      const k = t - r.shakeStart;
      const n = Math.floor(k / (SHAKE + PAUSE));
      const within = k - n * (SHAKE + PAUSE);
      if (n >= r.shakesDone && within < SHAKE) {
        r.shakesDone = n + 1;
        r.onShake?.(n + 1);
        audio.pod('shake', r.ground);
      }
      it.position.copy(r.ground);
      it.rotation.z = within < SHAKE ? Math.sin((within / SHAKE) * Math.PI * 3) * 0.45 * Math.sin((within / SHAKE) * Math.PI) : 0;
    } else if (!r.resolved) {
      r.resolved = true;
      it.rotation.z = 0;
      if (r.roll.caught) {
        // Click! Locked shut.
        this.effects.sparks(r.ground.x, r.ground.y + 0.2, r.ground.z, 22);
        audio.pod('click', r.ground);
        it.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = this.mats.glow;
        });
      } else {
        // Bursts open: the creature pops back out.
        this.effects.sparks(r.ground.x, r.ground.y + 0.3, r.ground.z, 14);
        audio.pod('burst', r.ground);
        it.visible = false;
      }
    } else {
      const u = (t - (r.end - OUTRO)) / OUTRO;
      if (r.roll.caught) it.scale.setScalar(Math.max(0.01, 1 - u * u));
      else if (root) root.scale.setScalar(r.baseScale * Math.min(1, u * 1.8));
      if (t >= r.end) {
        it.removeFromParent();
        if (root && !r.roll.caught) root.scale.setScalar(r.baseScale);
        this.run = null;
        r.onDone(r.roll.caught);
      }
    }
  }
}
