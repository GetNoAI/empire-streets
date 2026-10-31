import * as THREE from 'three';
import type { CityLayout, Rect } from '../world/CityLayout';
import { withSurface } from '../render/Surfaces';

export const CLINIC_NAME = 'Corner Clinic';

export interface Clinic {
  x: number;
  z: number;
}

/**
 * Streetmon clinics: storefronts with a green-cross sign where you can heal your creatures for a
 * fee, and where you come round after losing a fight.
 */
export class Clinics {
  readonly clinics: Clinic[] = [];
  private readonly markers: THREE.Mesh[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, layout: CityLayout) {
    const tex = makeSign();
    for (const { x, facadeZ, door } of clinicSpots(layout)) {
      const c: Clinic = door;
      this.clinics.push(c);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.1, 0.25), [
        dark(), dark(), dark(), dark(), dark(),
        new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }),
      ]);
      sign.position.set(x, 3.6, facadeZ - 0.2);
      scene.add(sign);
      const front = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0xdff3ea, roughness: 0.15, metalness: 0.2 }));
      front.position.set(x, 1.45, facadeZ - 0.06);
      scene.add(front);
      // A green awning and a lit doorway, so the entrance reads from down the street.
      const awning = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.14, 1.5), withSurface(new THREE.MeshStandardMaterial({ color: 0x2e9e5b, roughness: 0.8 }), 'fabric'));
      awning.position.set(x, 2.95, facadeZ - 0.78);
      awning.rotation.x = -0.12;
      awning.castShadow = true;
      scene.add(awning);
      const doorway = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.35, 0.08), new THREE.MeshStandardMaterial({ color: 0xf2fff8, emissive: 0x9dffc9, emissiveIntensity: 0.55, roughness: 0.2 }));
      doorway.position.set(x, 1.33, facadeZ - 0.12);
      scene.add(doorway);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.85, 32),
        new THREE.MeshBasicMaterial({ color: 0x4be37a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(c.x, 0.17, c.z);
      scene.add(marker);
      this.markers.push(marker);
    }
  }

  update(dt: number): void {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 3 + 1) * 0.08;
    for (const m of this.markers) m.scale.set(s, s, s);
  }

  clinicAt(x: number, z: number): Clinic | null {
    for (const c of this.clinics) if (Math.hypot(c.x - x, c.z - z) < 1.6) return c;
    return null;
  }

  nearest(x: number, z: number): Clinic {
    return this.clinics.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
  }
}

const dark = (): THREE.MeshStandardMaterial => withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'plastic');

/** Where the clinics go (pure: other planners keep their entrances clear of these doors). */
export function clinicSpots(L: CityLayout): Array<{ x: number; facadeZ: number; door: Clinic }> {
  const targets = [
    { x: L.playerSpawn.x - 40, z: L.playerSpawn.z - 30 },
    { x: L.aveX[2], z: L.streetZ[13] },
    { x: L.aveX[5], z: L.streetZ[16] },
    { x: L.aveX[4], z: L.streetZ[2] },
  ];
  const used = new Set<Rect>();
  return targets.map((t) => {
    const b = nearestBlock(L.blocks, t.x, t.z, used);
    used.add(b);
    // North face of the block, middle of the long side (gun shops use the south faces).
    const x = (b.x0 + b.x1) / 2;
    return { x, facadeZ: b.z0 + 4.5, door: { x, z: b.z0 + 2.2 } };
  });
}

function nearestBlock(blocks: Rect[], x: number, z: number, skip: Set<Rect>): Rect {
  let best = blocks[0];
  let bestD = Infinity;
  for (const b of blocks) {
    if (skip.has(b)) continue;
    const d = Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function makeSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4fbf7';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#1fa65a';
  // Green cross.
  ctx.fillRect(28, 38, 48, 20);
  ctx.fillRect(42, 24, 20, 48);
  ctx.font = 'bold 46px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(CLINIC_NAME.toUpperCase(), 100, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
