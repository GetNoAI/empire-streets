import * as THREE from 'three';

/**
 * Rain and snow round the camera: streaks (rain, slanted by the wind) and flakes (snow, drifting),
 * in a box that follows you, recycled as they fall out of it. One draw call each; how many are
 * drawn follows the weather's intensity (and the phone budget).
 */
export class Precipitation {
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rp: Float32Array;
  private readonly sp: Float32Array;
  private readonly n: number;
  private readonly box = { w: 36, h: 22 };
  private seeded = false;

  constructor(scene: THREE.Scene, count = 2400) {
    this.n = count;
    this.rp = new Float32Array(count * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc8d4e2, transparent: true, opacity: 0.62, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.sp = new Float32Array(count * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.rain, this.snow);
  }

  update(dt: number, cam: THREE.Vector3, rain: number, snow: number, wind: number, underground: boolean): void {
    const W = this.box.w;
    const H = this.box.h;
    if (!this.seeded) {
      this.seeded = true;
      for (let i = 0; i < this.n; i++) {
        const x = cam.x + (Math.random() - 0.5) * W;
        const y = cam.y + (Math.random() - 0.3) * H;
        const z = cam.z + (Math.random() - 0.5) * W;
        this.rp.set([x, y, z, x, y - 0.6, z], i * 6);
        this.sp.set([x, y, z], i * 3);
      }
    }
    // Rain.
    const rn = underground ? 0 : Math.floor(this.n * Math.min(1, rain));
    this.rain.visible = rn > 0;
    if (rn > 0) {
      const vy = -22;
      const vx = wind * 4;
      const len = 0.8 + rain * 0.5;
      for (let i = 0; i < rn; i++) {
        const k = i * 6;
        let x = this.rp[k] + vx * dt;
        let y = this.rp[k + 1] + vy * dt;
        let z = this.rp[k + 2];
        if (y < cam.y - H * 0.35 || Math.abs(x - cam.x) > W / 2 || Math.abs(z - cam.z) > W / 2) {
          x = cam.x + (Math.random() - 0.5) * W;
          z = cam.z + (Math.random() - 0.5) * W;
          y = cam.y + H * 0.65 * Math.random() + 2;
        }
        this.rp[k] = x;
        this.rp[k + 1] = y;
        this.rp[k + 2] = z;
        this.rp[k + 3] = x - (vx / -vy) * len;
        this.rp[k + 4] = y + len;
        this.rp[k + 5] = z;
      }
      this.rain.geometry.setDrawRange(0, rn * 2);
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // Snow.
    const sn = underground ? 0 : Math.floor(this.n * Math.min(1, snow) * 0.8);
    this.snow.visible = sn > 0;
    if (sn > 0) {
      const t = performance.now() / 1000;
      for (let i = 0; i < sn; i++) {
        const k = i * 3;
        let x = this.sp[k] + (Math.sin(t * 0.7 + i) * 0.4 + wind * 1.5) * dt;
        let y = this.sp[k + 1] - (1.1 + (i % 5) * 0.12) * dt;
        let z = this.sp[k + 2] + Math.cos(t * 0.5 + i * 1.3) * 0.4 * dt;
        if (y < cam.y - H * 0.35 || Math.abs(x - cam.x) > W / 2 || Math.abs(z - cam.z) > W / 2) {
          x = cam.x + (Math.random() - 0.5) * W;
          z = cam.z + (Math.random() - 0.5) * W;
          y = cam.y + H * 0.65 * Math.random() + 2;
        }
        this.sp[k] = x;
        this.sp[k + 1] = y;
        this.sp[k + 2] = z;
      }
      this.snow.geometry.setDrawRange(0, sn);
      (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
