import * as THREE from 'three';
import { districtAt } from '../creatures/SpawnRules';
import type { CityLayout, Rect } from './CityLayout';
import { withSurface } from '../render/Surfaces';

/**
 * The Underground Chop Shop's street entrance: a freight lift in the kerb lane of a Midtown street,
 * in front of a roll-up door with a neon sign. Stop a car on the lift and press E to be lowered
 * into the shop. Two bays along the kerb behind it are where your tuned rides wait.
 */

export interface ChopShopSpot {
  /** Lift centre (on the road, in the kerb lane). */
  x: number;
  z: number;
  /** Heading along the street a car parks in (three.js convention, 0 = +X). */
  heading: number;
  /** +1: the shop's building is on the +Z side of the street; -1: on the -Z side. */
  side: 1 | -1;
  /** Facade the door is on (z of the building face) and the door's x. */
  doorZ: number;
  /** Bays for stored rides (kerb lane, behind the lift). */
  bays: Array<{ x: number; z: number; heading: number }>;
}

export const CHOP_SHOP = {
  /** Lift size: along the street, across. */
  liftLength: 7,
  liftWidth: 3.2,
  /** How close (m) and how slow (m/s) a car must be to use the lift. */
  useRadius: 3.2,
  maxSpeed: 1.6,
  /** Parked cars are kept out of this distance of the lift and bays. */
  clearRadius: 26,
} as const;

/**
 * Picks the spot (deterministic): the kerb lane of a Midtown cross street, mid-block, next to a
 * building, nearest the park, and away from garages. Removes parking spots around it. Call after
 * planGarages and before the city is built.
 */
export function planChopShop(layout: CityLayout): ChopShopSpot {
  const park = layout.park;
  const pcx = (park.x0 + park.x1) / 2;
  const pcz = (park.z0 + park.z1) / 2;
  const garages: Rect[] = (layout.garages ?? []).map((g) => g.rect);
  let best: { spot: ChopShopSpot; d: number } | null = null;
  for (const r of layout.roads) {
    if (r.kind !== 'street') continue;
    for (const side of [1, -1] as const) {
      const laneZ = r.center + side * (r.width / 2 - 1.6);
      const faceZ = r.center + side * (r.width / 2 + 4.5);
      for (const b of layout.blocks) {
        // The block on this side of the street.
        if (side > 0 ? Math.abs(b.z0 - (r.center + r.width / 2)) > 0.5 : Math.abs(b.z1 - (r.center - r.width / 2)) > 0.5) continue;
        if (b.x1 - b.x0 < 80) continue;
        const x = (b.x0 + b.x1) / 2;
        if (districtAt(layout, x, laneZ) !== 'midtown') continue;
        if (x > park.x0 - 30 && x < park.x1 + 30 && laneZ > park.z0 - 30 && laneZ < park.z1 + 30) continue;
        if (garages.some((g) => x > g.x0 - 50 && x < g.x1 + 50 && Math.abs((side > 0 ? g.z0 : g.z1) - faceZ) < 25)) continue;
        // A building right behind the sidewalk for the door.
        const bld = layout.buildings.some((o) => x > o.rect.x0 + 2 && x < o.rect.x1 - 2 && Math.abs((side > 0 ? o.rect.z0 : o.rect.z1) - faceZ) < 0.6);
        if (!bld) continue;
        const d = Math.hypot(x - pcx, laneZ - pcz);
        if (best && d >= best.d) continue;
        const heading = side > 0 ? 0 : Math.PI;
        const dir = side > 0 ? 1 : -1;
        best = {
          d,
          spot: {
            x,
            z: laneZ,
            heading,
            side,
            doorZ: faceZ,
            bays: [1, 2].map((k) => ({ x: x - dir * k * 7.5, z: laneZ, heading })),
          },
        };
      }
    }
  }
  if (!best) throw new Error('Chop Shop: no place for it in Midtown');
  const s = best.spot;
  layout.parking = layout.parking.filter((p) => Math.hypot(p.x - s.x, p.z - s.z) > CHOP_SHOP.clearRadius);
  return s;
}

/** Lift platform, roll-up door, neon sign and bay markings. Visual only (it's flat on the road). */
export function buildChopShop(s: ChopShopSpot): { root: THREE.Group; update(t: number, liftDown: number): void } {
  const root = new THREE.Group();
  root.name = 'chop-shop';
  const L = CHOP_SHOP.liftLength;
  const W = CHOP_SHOP.liftWidth;
  // Lift platform: steel plate with hazard-striped edges.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, W), withSurface(new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.7, roughness: 0.45 }), 'paintedMetal'));
  plate.position.set(s.x, 0.02, s.z);
  root.add(plate);
  const stripes = makeHazardTexture();
  const edge = withSurface(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }), 'paintedMetal');
  for (const dz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(L + 0.4, 0.05, 0.3), edge);
    e.position.set(s.x, 0.025, s.z + (dz * (W + 0.3)) / 2);
    root.add(e);
  }
  for (const dx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, W), edge);
    e.position.set(s.x + (dx * (L + 0.1)) / 2, 0.025, s.z);
    root.add(e);
  }
  // Bay outlines for stored rides.
  const bayMat = new THREE.MeshBasicMaterial({ color: 0xd8b13a });
  for (const b of s.bays) {
    for (const dx of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, W), bayMat);
      line.position.set(b.x + (dx * 6.6) / 2, 0.012, b.z);
      root.add(line);
    }
  }
  // Roll-up door and neon sign on the facade.
  const out = s.side > 0 ? -1 : 1; // facade faces back toward the street
  const door = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 0.12), withSurface(new THREE.MeshStandardMaterial({ map: makeShutterTexture(), roughness: 0.7, metalness: 0.4 }), 'paintedMetal'));
  door.position.set(s.x, 0.15 + 1.7, s.doorZ + out * 0.07);
  root.add(door);
  const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(), transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), signMat);
  sign.position.set(s.x, 4.6, s.doorZ + out * 0.1);
  if (out > 0) sign.rotation.y = 0;
  else sign.rotation.y = Math.PI;
  door.rotation.y = sign.rotation.y;
  root.add(sign);
  // Warning beacon on a post by the lift.
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff7a00, emissiveIntensity: 0.5 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), beaconMat);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), withSurface(new THREE.MeshStandardMaterial({ color: 0x2a2c30 }), 'paintedMetal'));
  const px = s.x + (L / 2 + 0.8);
  const pz = s.z + s.side * (W / 2 + 0.9);
  post.position.set(px, 0.15 + 0.7, pz);
  beacon.position.set(px, 0.15 + 1.5, pz);
  root.add(post, beacon);
  return {
    root,
    update(t: number, liftDown: number): void {
      beaconMat.emissiveIntensity = 0.4 + (Math.sin(t * 6) > 0 ? 2 : 0);
      signMat.opacity = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 2.3);
      plate.position.y = 0.02 - liftDown * 0.6;
    },
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function makeHazardTexture(): THREE.Texture {
  const [c, g] = canvas(64, 16);
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#1a1a1a';
  for (let x = -16; x < 64; x += 16) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 8, 0);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 8, 16);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeShutterTexture(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#6b6f74';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    g.fillStyle = y % 8 ? '#585c61' : '#7c8086';
    g.fillRect(0, y, 64, 2);
  }
  g.fillStyle = 'rgba(30,30,30,0.5)';
  g.fillRect(8, 20, 48, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSignTexture(): THREE.Texture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(10,8,16,0.85)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ff3fa4';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff3fa4';
  g.shadowBlur = 18;
  g.fillStyle = '#ffd6f0';
  g.fillText('CHOP SHOP', 256, 56);
  g.font = 'bold 22px sans-serif';
  g.shadowColor = '#3fd8ff';
  g.fillStyle = '#c9f4ff';
  g.fillText('▼ UNDERGROUND ▼  STREETMON TUNING', 256, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
