import * as THREE from 'three';
import { withSurface } from '../render/Surfaces';

/**
 * Low-poly weapon meshes built from primitives. Each points along +X (barrel / blade forward) with the
 * grip at the origin, so the same model works in the hand and as a pickup.
 */

const mats = {
  steel: withSurface(new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.35, metalness: 0.85 }), 'bareMetal'),
  blued: withSurface(new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.4, metalness: 0.7 }), 'bareMetal'),
  polymer: withSurface(new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.75 }), 'plastic'),
  wood: withSurface(new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.7 }), 'wood'),
  lightWood: withSurface(new THREE.MeshStandardMaterial({ color: 0xb7884e, roughness: 0.65 }), 'wood'),
  chrome: withSurface(new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.18, metalness: 1 }), 'chrome'),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x5f7d3a, roughness: 0.1, transparent: true, opacity: 0.75 }),
  rag: withSurface(new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 1 }), 'fabric'),
  tape: withSurface(new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 }), 'plastic'),
};

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rz;
  return mesh;
}

/** Cylinder lying along X. */
function rod(r: number, len: number, m: THREE.Material, x: number, y: number, z = 0, segs = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), m);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

const builders: Record<string, () => THREE.Group> = {
  fists: () => new THREE.Group(),
  pistol: () => {
    const g = new THREE.Group();
    g.add(box(0.19, 0.035, 0.03, mats.blued, 0.07, 0.07)); // slide
    g.add(box(0.15, 0.03, 0.028, mats.polymer, 0.06, 0.045)); // frame
    g.add(box(0.035, 0.11, 0.03, mats.polymer, 0.0, 0.0, 0, 0.25)); // grip
    return g;
  },
  revolver: () => {
    const g = new THREE.Group();
    g.add(rod(0.012, 0.2, mats.chrome, 0.15, 0.07));
    g.add(rod(0.028, 0.05, mats.chrome, 0.04, 0.06, 0, 6)); // cylinder
    g.add(box(0.07, 0.035, 0.026, mats.chrome, 0.03, 0.08));
    g.add(box(0.035, 0.1, 0.032, mats.wood, -0.005, 0.0, 0, 0.35));
    return g;
  },
  shotgun: () => {
    const g = new THREE.Group();
    g.add(rod(0.016, 0.62, mats.blued, 0.42, 0.07));
    g.add(rod(0.013, 0.5, mats.blued, 0.38, 0.045)); // tube magazine
    g.add(box(0.14, 0.045, 0.04, mats.wood, 0.36, 0.045)); // pump
    g.add(box(0.2, 0.06, 0.04, mats.blued, 0.06, 0.06)); // receiver
    g.add(box(0.32, 0.06, 0.035, mats.wood, -0.17, 0.03, 0, -0.12)); // stock
    return g;
  },
  smg: () => {
    const g = new THREE.Group();
    g.add(box(0.24, 0.06, 0.04, mats.polymer, 0.08, 0.06));
    g.add(rod(0.012, 0.08, mats.blued, 0.24, 0.07));
    g.add(box(0.035, 0.16, 0.03, mats.blued, 0.07, -0.04)); // long magazine
    g.add(box(0.035, 0.08, 0.03, mats.polymer, -0.01, 0.0, 0, 0.2));
    return g;
  },
  rifle: () => {
    const g = new THREE.Group();
    g.add(box(0.3, 0.07, 0.045, mats.steel, 0.1, 0.06)); // receiver
    g.add(rod(0.013, 0.36, mats.blued, 0.42, 0.075));
    g.add(box(0.2, 0.05, 0.05, mats.wood, 0.33, 0.06)); // handguard
    g.add(box(0.045, 0.15, 0.035, mats.blued, 0.16, -0.03, 0, -0.35)); // curved mag
    g.add(box(0.04, 0.08, 0.035, mats.wood, 0.0, 0.0, 0, 0.2)); // grip
    g.add(box(0.24, 0.07, 0.04, mats.wood, -0.17, 0.04, 0, -0.08)); // stock
    return g;
  },
  sniper: () => {
    const g = new THREE.Group();
    g.add(rod(0.012, 0.6, mats.blued, 0.55, 0.07));
    g.add(box(0.5, 0.06, 0.05, mats.wood, 0.12, 0.05));
    g.add(rod(0.025, 0.28, mats.blued, 0.12, 0.13)); // scope
    g.add(rod(0.032, 0.04, mats.blued, 0.27, 0.13));
    g.add(rod(0.03, 0.04, mats.blued, -0.02, 0.13));
    g.add(box(0.3, 0.08, 0.045, mats.wood, -0.24, 0.03, 0, -0.1));
    g.add(rod(0.01, 0.05, mats.chrome, 0.07, 0.1, 0.035)); // bolt handle
    return g;
  },
  bat: () => {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.036, 0.016, 0.82, 12);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(0.36, 0, 0);
    g.add(new THREE.Mesh(geo, mats.lightWood));
    g.add(rod(0.02, 0.06, mats.tape, -0.02, 0));
    return g;
  },
  knife: () => {
    const g = new THREE.Group();
    g.add(box(0.11, 0.03, 0.02, mats.polymer, 0.0, 0));
    const blade = new THREE.Shape();
    blade.moveTo(0, -0.012);
    blade.lineTo(0.17, -0.004);
    blade.lineTo(0.2, 0.012);
    blade.lineTo(0, 0.016);
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.004, bevelEnabled: false });
    bg.translate(0.055, 0, -0.002);
    g.add(new THREE.Mesh(bg, mats.chrome));
    return g;
  },
  molotov: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.16, 12), mats.glass);
    body.rotation.z = -Math.PI / 2;
    body.position.x = 0.06;
    g.add(body);
    g.add(rod(0.015, 0.08, mats.glass, 0.18, 0));
    g.add(rod(0.012, 0.06, mats.rag, 0.24, 0));
    return g;
  },
};

export function makeWeaponModel(id: string): THREE.Group {
  const g = (builders[id] ?? builders.pistol)();
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** Banknote bundle for cash pickups. */
export function makeCashModel(): THREE.Group {
  const g = new THREE.Group();
  const note = withSurface(new THREE.MeshStandardMaterial({ color: 0x5d8a4a, roughness: 0.8 }), 'paper');
  const band = withSurface(new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7 }), 'paper');
  g.add(box(0.16, 0.05, 0.08, note, 0, 0));
  g.add(box(0.03, 0.055, 0.085, band, 0, 0));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
