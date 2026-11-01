import * as THREE from 'three';

/**
 * Floating damage numbers over Streetmon: pooled DOM labels placed at a world point each frame,
 * rising and fading over a second. Red for normal hits, orange for critical ones (knockouts).
 */

export type DamageKind = 'hit' | 'crit' | 'weak';

interface Num {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  drift: number;
  active: boolean;
}

const POOL = 24;

export class DamageNumbers {
  private readonly root: HTMLDivElement;
  private readonly nums: Num[] = [];
  private readonly v = new THREE.Vector3();
  private next = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dmgnums';
    parent.appendChild(this.root);
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'dmgnum';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.nums.push({ el, x: 0, y: 0, z: 0, age: 0, life: 1, drift: 0, active: false });
    }
  }

  /** Shows `amount` at a world point. */
  spawn(x: number, y: number, z: number, amount: number, kind: DamageKind = 'hit'): void {
    const n = this.nums[this.next];
    this.next = (this.next + 1) % POOL;
    n.x = x;
    n.y = y;
    n.z = z;
    n.age = 0;
    n.life = kind === 'crit' ? 1.3 : 1;
    n.drift = (Math.random() - 0.5) * 0.6;
    n.active = true;
    n.el.textContent = kind === 'crit' ? `${amount}!` : String(amount);
    n.el.className = `dmgnum ${kind}`;
    n.el.style.display = 'block';
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const n of this.nums) {
      if (!n.active) continue;
      n.age += dt;
      if (n.age >= n.life) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      const t = n.age / n.life;
      this.v.set(n.x + n.drift * t, n.y + 1.1 * t, n.z).project(camera);
      if (this.v.z > 1) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.5 : 1.2 - Math.min(0.2, (t - 0.12) * 0.4);
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      n.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }
}
