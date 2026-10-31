import * as THREE from 'three';
import { WILD_MOVE, bodyRadius, type WildCreature } from './SpawnSystem';

/**
 * Debug view for creature steering: each fleeing Streetmon's probe rays (green = open, orange = a
 * wall ahead, red = inside the wall buffer), the chosen direction (yellow), its actual velocity
 * (cyan) and the wall push (magenta, on any moving creature), plus a ring for the body and
 * buffer. One LineSegments, rewritten each frame while it's on.
 */

const MAX_SEGMENTS = 6000;

export class FleeDebug {
  private readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  private readonly tmpColor = new THREE.Color();
  private on = false;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_SEGMENTS * 6);
    this.col = new Float32Array(MAX_SEGMENTS * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(on: boolean): void {
    this.on = on;
    this.lines.visible = on;
  }

  private seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: number): void {
    if (this.n >= MAX_SEGMENTS) return;
    const i = this.n * 6;
    this.pos.set([ax, ay, az, bx, by, bz], i);
    // setHex converts from sRGB to the renderer's working (linear) colour space.
    const k = this.tmpColor.setHex(c);
    this.col.set([k.r, k.g, k.b, k.r, k.g, k.b], i);
    this.n++;
  }

  private ring(x: number, y: number, z: number, r: number, c: number, steps = 16): void {
    for (let k = 0; k < steps; k++) {
      const a0 = (k / steps) * Math.PI * 2;
      const a1 = ((k + 1) / steps) * Math.PI * 2;
      this.seg(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, c);
    }
  }

  /** Redraws for the creatures given (only near the player, to keep it readable). */
  update(wild: readonly WildCreature[], near: { x: number; z: number }, range = 60, bufferRadius: number = WILD_MOVE.wallBufferRadius): void {
    if (!this.on) return;
    this.n = 0;
    for (const w of wild) {
      if (w.removed || w.pinned || Math.hypot(w.x - near.x, w.z - near.z) > range) continue;
      const y = w.y + 0.25;
      const r = bodyRadius(w.spec.model.height);
      this.ring(w.x, y, w.z, r, 0xffffff, 12);
      if (w.state === 'flee') {
        this.ring(w.x, y, w.z, r + bufferRadius, w.flee.cornered ? 0xff2a2a : 0x3a6bff, 20);
        w.flee.probes.forEach((p, k) => {
          const len = r + p.open;
          const c = !p.hit ? 0x3cff6e : p.open < bufferRadius ? 0xff2a2a : 0xffa020;
          this.seg(w.x, y, w.z, w.x + p.dx * len, y, w.z + p.dz * len, k === w.flee.chosen ? 0xffffff : c);
        });
        this.seg(w.x, y + 0.05, w.z, w.x + w.flee.dirX * 2.5, y + 0.05, w.z + w.flee.dirZ * 2.5, 0xffe23f);
        // Threat line.
        this.seg(w.x, y + 0.1, w.z, w.tx, y + 0.1, w.tz, 0x6b2a2a);
      }
      if (Math.hypot(w.vx, w.vz) > 0.05) this.seg(w.x, y + 0.08, w.z, w.x + w.vx * 0.5, y + 0.08, w.z + w.vz * 0.5, 0x2af2ff);
      if (Math.hypot(w.push.x, w.push.z) > 0.01) this.seg(w.x, y + 0.12, w.z, w.x + w.push.x * 1.5, y + 0.12, w.z + w.push.z * 1.5, 0xff3fd2);
    }
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * 2);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
