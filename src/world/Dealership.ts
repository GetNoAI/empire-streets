import * as THREE from 'three';
import type { CityLayout } from './CityLayout';
import { planKerbSpot, type ChopShopSpot } from './ChopShop';
import { withSurface } from '../render/Surfaces';

/**
 * Empire Motors: the car dealership. A showroom front on a Downtown street with a lit sign, a
 * kerb-side display of cars for sale (parked in its bays) and a delivery bay the car you buy rolls
 * into. Walk up to the sign on foot and press E to browse; bought cars are yours (saved with
 * their parts and colour) and can be sold back here.
 */

export interface DealershipSpot extends ChopShopSpot {
  /** Where the car you buy appears. */
  delivery: { x: number; z: number; heading: number };
}

export const DEALERSHIP = {
  /** How close (m) on foot to browse. */
  useRadius: 7,
  /** Sell-back share of what you paid (car and parts). */
  sellShare: 0.6,
} as const;

export function planDealership(layout: CityLayout, avoid: Array<{ x: number; z: number }>): DealershipSpot {
  const s = planKerbSpot(layout, 'downtown', avoid, 4);
  // The first bay is the delivery bay, the rest show cars for sale.
  const [delivery, ...display] = s.bays;
  return { ...s, bays: display, delivery };
}

export function buildDealership(s: DealershipSpot): { root: THREE.Group; update(t: number): void } {
  const root = new THREE.Group();
  root.name = 'dealership';
  const out = s.side > 0 ? -1 : 1;
  // Showroom front: a glass wall with a chrome frame, and the sign above it.
  const frame = withSurface(new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.25 }), 'chrome');
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2a36, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.7 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 4.2, 0.08), glass);
  wall.position.set(s.x, 0.15 + 2.1, s.doorZ + out * 0.32);
  root.add(wall);
  for (const dx of [-9, -4.5, 0, 4.5, 9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.3, 0.2), frame);
    post.position.set(s.x + dx, 0.15 + 2.15, s.doorZ + out * 0.34);
    root.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.3, 0.3), frame);
  lintel.position.set(s.x, 0.15 + 4.4, s.doorZ + out * 0.36);
  root.add(lintel);
  // A dark backdrop just inside the glass, with a lit strip, so the window reads as a showroom.
  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 4.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x0c1118, roughness: 0.9 }));
  back.position.set(s.x, 0.15 + 2.1, s.doorZ + out * 0.2);
  root.add(back);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0x21e6ff }));
  strip.position.set(s.x, 0.15 + 3.9, s.doorZ + out * 0.26);
  root.add(strip);
  const signMat = new THREE.MeshBasicMaterial({ map: makeSign(), transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), signMat);
  sign.position.set(s.x, 5.6, s.doorZ + out * 0.5);
  sign.rotation.y = out > 0 ? 0 : Math.PI;
  root.add(sign);
  // Flags on the kerb and bay markings.
  const bayMat = new THREE.MeshBasicMaterial({ color: 0x21e6ff });
  for (const b of [...s.bays, s.delivery]) {
    for (const dx of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 3.2), bayMat);
      line.position.set(b.x + (dx * 6.6) / 2, 0.012, b.z);
      root.add(line);
    }
  }
  const pennant = new THREE.MeshBasicMaterial({ color: 0xff3fa4, side: THREE.DoubleSide });
  const pennant2 = new THREE.MeshBasicMaterial({ color: 0x21e6ff, side: THREE.DoubleSide });
  const flags: THREE.Mesh[] = [];
  const x0 = s.x - 14;
  const x1 = s.x + 14;
  const zf = s.doorZ + out * 1.2;
  const line = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, 0.02), frame);
  line.position.set(s.x, 4.9, zf);
  root.add(line);
  for (let i = 0; i < 16; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), i % 2 ? pennant : pennant2);
    f.position.set(x0 + ((i + 0.5) * (x1 - x0)) / 16, 4.55, zf);
    root.add(f);
    flags.push(f);
  }
  return {
    root,
    update(t: number): void {
      signMat.opacity = 0.9 + 0.1 * Math.sin(t * 7);
      flags.forEach((f, i) => (f.rotation.y = 0.35 * Math.sin(t * 3 + i * 0.7)));
    },
  };
}

function makeSign(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 136;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,20,0.9)';
  g.fillRect(0, 0, 768, 136);
  g.strokeStyle = '#21e6ff';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 756, 124);
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#21e6ff';
  g.shadowColor = '#21e6ff';
  g.shadowBlur = 24;
  g.fillText('EMPIRE MOTORS', 384, 78);
  g.shadowBlur = 0;
  g.font = '26px sans-serif';
  g.fillStyle = '#ff3fa4';
  g.fillText('NEW · USED · WE BUY ANYTHING', 384, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
