import * as THREE from 'three';
import { makePoliceDecal, makeTaxiSign } from '../world/Textures';
import type { BodyStyle, VehicleSpec } from './specs';
import { withSurface } from '../render/Surfaces';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural car meshes in the body frame used by physics: +X forward, +Y up, +Z right,
 * origin at the chassis collider centre. `groundY` is where the ground is in that frame at rest.
 */

export interface CarVisual {
  root: THREE.Group;
  /** Everything except wheels; replaced when a GLTF model is supplied. */
  body: THREE.Group;
  /** Per wheel: pivot (steering, about Y) containing a spinner (rolling, about Z). */
  wheels: Array<{ pivot: THREE.Group; spinner: THREE.Group }>;
  paint: THREE.MeshPhysicalMaterial;
  /** Brake/tail light material, brightened when braking. */
  tail: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  /** Police light bar halves (null for other cars). */
  lightbar: { red: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial } | null;
  /** Where a seated driver goes. */
  seat: THREE.Vector3;
}

type P = [number, number];

/** Side profiles as fractions: x of length (-0.5 rear .. 0.5 front), y of height. */
const PROFILES: Record<BodyStyle, { body: P[]; cabin: P[]; cabinWidth: number }> = {
  sedan: {
    body: [[-0.5, 0.46], [-0.49, 0.6], [-0.43, 0.64], [0.28, 0.63], [0.44, 0.57], [0.5, 0.47]],
    cabin: [[-0.36, 0.63], [-0.2, 0.97], [0.07, 0.98], [0.27, 0.63]],
    cabinWidth: 0.84,
  },
  taxi: {
    body: [[-0.5, 0.46], [-0.49, 0.6], [-0.43, 0.64], [0.28, 0.63], [0.44, 0.57], [0.5, 0.47]],
    cabin: [[-0.36, 0.63], [-0.2, 0.96], [0.07, 0.97], [0.27, 0.63]],
    cabinWidth: 0.84,
  },
  police: {
    body: [[-0.5, 0.46], [-0.49, 0.6], [-0.43, 0.64], [0.28, 0.63], [0.44, 0.57], [0.5, 0.47]],
    cabin: [[-0.36, 0.63], [-0.2, 0.95], [0.07, 0.96], [0.27, 0.63]],
    cabinWidth: 0.84,
  },
  suv: {
    body: [[-0.5, 0.5], [-0.49, 0.57], [0.3, 0.58], [0.46, 0.54], [0.5, 0.46]],
    cabin: [[-0.47, 0.57], [-0.45, 0.97], [0.12, 0.98], [0.3, 0.57]],
    cabinWidth: 0.88,
  },
  sports: {
    body: [[-0.5, 0.5], [-0.47, 0.7], [0.08, 0.68], [0.4, 0.66], [0.5, 0.45]],
    cabin: [[-0.3, 0.66], [-0.12, 0.97], [0.08, 0.97], [0.32, 0.66]],
    cabinWidth: 0.8,
  },
  van: {
    body: [[-0.5, 0.38], [0.25, 0.38], [0.47, 0.36], [0.5, 0.3]],
    cabin: [[0.24, 0.37], [0.24, 0.82], [0.33, 0.83], [0.46, 0.42]],
    cabinWidth: 0.9,
  },
  ambulance: {
    body: [[-0.5, 0.38], [0.25, 0.38], [0.47, 0.36], [0.5, 0.3]],
    cabin: [[0.24, 0.37], [0.24, 0.82], [0.33, 0.83], [0.46, 0.42]],
    cabinWidth: 0.9,
  },
  // A short, tall hatchback: the cabin runs almost to the back.
  hatch: {
    body: [[-0.5, 0.5], [-0.48, 0.6], [-0.4, 0.62], [0.3, 0.6], [0.45, 0.52], [0.5, 0.44]],
    cabin: [[-0.46, 0.6], [-0.4, 0.98], [0.1, 0.98], [0.28, 0.6]],
    cabinWidth: 0.86,
  },
  rally: {
    body: [[-0.5, 0.5], [-0.48, 0.6], [-0.4, 0.62], [0.3, 0.6], [0.45, 0.52], [0.5, 0.44]],
    cabin: [[-0.46, 0.6], [-0.4, 0.97], [0.1, 0.97], [0.28, 0.6]],
    cabinWidth: 0.86,
  },
  // Long bonnet, cabin set back.
  muscle: {
    body: [[-0.5, 0.48], [-0.48, 0.63], [-0.4, 0.65], [0.3, 0.63], [0.46, 0.58], [0.5, 0.46]],
    cabin: [[-0.34, 0.63], [-0.2, 0.97], [0.0, 0.98], [0.18, 0.63]],
    cabinWidth: 0.82,
  },
  // Low, wide, mid-cabin wedge.
  supercar: {
    body: [[-0.5, 0.5], [-0.46, 0.74], [0.08, 0.7], [0.4, 0.6], [0.5, 0.38]],
    cabin: [[-0.3, 0.72], [-0.16, 0.98], [0.04, 0.98], [0.3, 0.66]],
    cabinWidth: 0.8,
  },
  // Cab up front, open bed behind.
  pickup: {
    body: [[-0.5, 0.4], [-0.49, 0.46], [0.08, 0.46], [0.3, 0.56], [0.46, 0.54], [0.5, 0.44]],
    cabin: [[0.0, 0.56], [0.04, 0.97], [0.28, 0.98], [0.38, 0.56]],
    cabinWidth: 0.88,
  },
  limo: {
    body: [[-0.5, 0.46], [-0.49, 0.6], [-0.45, 0.63], [0.3, 0.63], [0.45, 0.57], [0.5, 0.47]],
    cabin: [[-0.44, 0.63], [-0.4, 0.97], [0.22, 0.98], [0.33, 0.63]],
    cabinWidth: 0.84,
  },
  // A box: paint below the window line, glass above.
  bus: {
    body: [[-0.5, 0.28], [-0.5, 0.6], [0.49, 0.6], [0.5, 0.28]],
    cabin: [[-0.49, 0.6], [-0.49, 0.97], [0.49, 0.97], [0.49, 0.6]],
    cabinWidth: 0.98,
  },
};

const materialCache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materialCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    materialCache.set(key, m);
  }
  return m;
}

let taxiSign: THREE.CanvasTexture | null = null;
let policeDecal: THREE.CanvasTexture | null = null;

/** Height above the ground of the chassis collider centre when the car rests on its wheels. */
export function chassisRestHeight(spec: VehicleSpec): number {
  const top = spec.height * 0.62;
  return (spec.clearance + top) / 2;
}

export function chassisHalfExtents(spec: VehicleSpec): [number, number, number] {
  const top = spec.height * 0.62;
  return [spec.length / 2 - 0.05, (top - spec.clearance) / 2, spec.width / 2 - 0.04];
}

export function buildCarVisual(spec: VehicleSpec, color: string): CarVisual {
  const L = spec.length;
  const H = spec.height;
  const W = spec.width;
  const groundY = -chassisRestHeight(spec);
  const prof = PROFILES[spec.style];

  const root = new THREE.Group();
  root.name = `car-${spec.id}`;
  const body = new THREE.Group();
  body.position.y = groundY;
  root.add(body);

  const paint = withSurface(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.45,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  }), 'carPaint');
  const glass = cached(
    'glass',
    () => new THREE.MeshPhysicalMaterial({ color: 0x0d1418, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.78, envMapIntensity: 1.6 }),
  );
  const trim = cached('trim', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x161718, roughness: 0.6, metalness: 0.3 }), 'plastic'));
  const chrome = cached('chrome', () => withSurface(new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 1 }), 'chrome'));
  const head = new THREE.MeshStandardMaterial({ color: 0xfafaf4, emissive: 0xfff6dc, emissiveIntensity: 0.6, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x7a0b0b, emissive: 0xff1a10, emissiveIntensity: 0.35, roughness: 0.3 });

  // ---- lower body with wheel arches cut out of the side profile
  const r = spec.wheelRadius;
  const archR = r + 0.07;
  const yb = spec.clearance + 0.04;
  const axleF = spec.wheelBase / 2;
  const axleR = -spec.wheelBase / 2;
  const top = prof.body.map(([fx, fy]) => [fx * L, fy * H] as P);
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, yb);
  for (const ax of [axleR, axleF]) {
    shape.lineTo(ax - archR, yb);
    shape.absarc(ax, r, archR, Math.PI, 0, true);
    shape.lineTo(ax + archR, yb);
  }
  shape.lineTo(L / 2, yb);
  for (let i = top.length - 1; i >= 0; i--) shape.lineTo(top[i][0], top[i][1]);
  shape.lineTo(-L / 2, yb);
  const bevel = 0.05;
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: W - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 10,
  });
  bodyGeo.translate(0, 0, -(W - bevel * 2) / 2);
  bodyGeo.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  body.add(bodyMesh);

  // ---- greenhouse (glass) + roof panel
  const cabin = prof.cabin.map(([fx, fy]) => [fx * L, fy * H] as P);
  const cShape = new THREE.Shape();
  cShape.moveTo(cabin[0][0], cabin[0][1]);
  for (let i = 1; i < cabin.length; i++) cShape.lineTo(cabin[i][0], cabin[i][1]);
  cShape.lineTo(cabin[0][0], cabin[0][1]);
  const cw = W * prof.cabinWidth;
  const cabinGeo = new THREE.ExtrudeGeometry(cShape, { depth: cw, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  cabinGeo.translate(0, 0, -cw / 2);
  body.add(new THREE.Mesh(cabinGeo, glass));
  const roofA = cabin[1];
  const roofB = cabin[2];
  const roofLen = roofB[0] - roofA[0];
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofLen + 0.08, 0.05, cw + 0.05), paint);
  roof.position.set((roofA[0] + roofB[0]) / 2, Math.max(roofA[1], roofB[1]) + 0.02, 0);
  body.add(roof);
  // Pillars between doors.
  const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, roofA[1] - cabin[0][1], cw + 0.07), trim);
  bPillar.position.set(roofA[0] + roofLen * 0.45, (roofA[1] + cabin[0][1]) / 2, 0);
  if (spec.style !== 'van' && spec.style !== 'ambulance' && spec.style !== 'sports' && spec.style !== 'supercar' && spec.style !== 'bus') body.add(bPillar);
  if (spec.style === 'bus' || spec.style === 'limo') {
    // Window pillars along the glass band.
    const n = spec.style === 'bus' ? 7 : 2;
    for (let k = 1; k <= n; k++) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, roofA[1] - cabin[0][1], cw + 0.07), trim);
      pl.position.set(roofA[0] + (roofLen * k) / (n + 1), (roofA[1] + cabin[0][1]) / 2, 0);
      body.add(pl);
    }
  }

  // ---- van cargo box
  if (spec.style === 'van' || spec.style === 'ambulance') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(L * 0.74, H * 0.62, W), cached('vanbox', () => withSurface(new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.7 }), 'paintedMetal')));
    box.position.set(-L / 2 + (L * 0.74) / 2, H * 0.38 + (H * 0.62) / 2, 0);
    body.add(box);
  }

  // ---- lights, grille, bumpers, mirrors
  const frontX = L / 2 - 0.02;
  const fy = (prof.body[prof.body.length - 1][1] * H + prof.body[prof.body.length - 2][1] * H) / 2 - 0.05;
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.36), head);
    hl.position.set(frontX, fy, side * (W / 2 - 0.3));
    body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.4), tail);
    tl.position.set(-L / 2 - 0.02, prof.body[0][1] * H + 0.02, side * (W / 2 - 0.3));
    body.add(tl);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), paint);
    mirror.position.set(cabin[3][0] - 0.25, cabin[3][1] + 0.08, side * (W / 2 + 0.06));
    body.add(mirror);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, W * 0.42), trim);
  grille.position.set(frontX + 0.01, fy - 0.02, 0);
  body.add(grille);
  for (const x of [L / 2 - 0.02, -L / 2 + 0.02]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, W - 0.06), spec.style === 'sports' || spec.style === 'supercar' ? paint : trim);
    bumper.position.set(x, yb + 0.12, 0);
    body.add(bumper);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.32), chrome);
  plate.position.set(-L / 2 - 0.08, yb + 0.25, 0);
  body.add(plate);

  // ---- style extras
  let lightbar: CarVisual['lightbar'] = null;
  const roofTopY = Math.max(roofA[1], roofB[1]) + 0.05;
  if (spec.style === 'taxi') {
    taxiSign ??= makeTaxiSign();
    const signMat = cached('taxiSign', () => new THREE.MeshStandardMaterial({ map: taxiSign, emissive: 0xffffff, emissiveMap: taxiSign, emissiveIntensity: 0.5 }));
    // Two draws, not six: a box's faces come as one group each (+x, -x, +y, -y, +z, -z), so the
    // four plain sides become one group and the two lit faces the other.
    const signGeo = new THREE.BoxGeometry(0.28, 0.3, 0.9);
    signGeo.clearGroups();
    signGeo.addGroup(0, 24, 0);
    signGeo.addGroup(24, 12, 1);
    const sign = new THREE.Mesh(signGeo, [trim, signMat]);
    sign.position.set((roofA[0] + roofB[0]) / 2, roofTopY + 0.15, 0);
    body.add(sign);
    // Checker stripe down each side.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.08, W + 0.02), trim);
    stripe.position.set(-0.05, prof.body[2][1] * H - 0.12, 0);
    body.add(stripe);
  }
  if (spec.style === 'police') {
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0a0a, emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x1a40ff, emissiveIntensity: 0.2 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.25), trim);
    base.position.set((roofA[0] + roofB[0]) / 2, roofTopY + 0.03, 0);
    body.add(base);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.58), red);
    rl.position.set(base.position.x, roofTopY + 0.11, -0.31);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.58), blue);
    bl.position.set(base.position.x, roofTopY + 0.11, 0.31);
    body.add(rl, bl);
    lightbar = { red, blue };
    policeDecal ??= makePoliceDecal();
    const decalMat = cached('policeDecal', () => new THREE.MeshStandardMaterial({ map: policeDecal, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), decalMat);
      d.position.set(-0.1, prof.body[2][1] * H - 0.27, side * (W / 2 + 0.051));
      d.rotation.y = side > 0 ? 0 : Math.PI;
      body.add(d);
    }
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, W * 0.6), trim);
    pushBar.position.set(L / 2 + 0.06, yb + 0.25, 0);
    body.add(pushBar);
  }
  if (spec.style === 'ambulance') {
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0a0a, emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x1a40ff, emissiveIntensity: 0.2 });
    const boxTop = H * 0.38 + H * 0.62 + 0.02;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.4), trim);
    base.position.set(-L / 2 + L * 0.74 - 0.3, boxTop + 0.03, 0);
    body.add(base);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.6), red);
    rl.position.set(base.position.x, boxTop + 0.11, -0.35);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.6), blue);
    bl.position.set(base.position.x, boxTop + 0.11, 0.35);
    body.add(rl, bl);
    lightbar = { red, blue };
    // Red stripe and crosses on the box.
    const stripeMat = cached('ambStripe', () => withSurface(new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.6 }), 'paintedMetal'));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.74 + 0.02, 0.18, W + 0.02), stripeMat);
    stripe.position.set(-L / 2 + (L * 0.74) / 2, H * 0.5, 0);
    body.add(stripe);
    for (const side of [-1, 1]) {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.02), stripeMat);
      c1.position.set(-L * 0.2, H * 0.78, side * (W / 2 + 0.005));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), stripeMat);
      c2.position.copy(c1.position);
      body.add(c1, c2);
    }
  }
  if (spec.style === 'muscle') {
    // Bonnet scoop and a pair of racing stripes.
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.38), trim);
    scoop.position.set(L * 0.28, prof.body[3][1] * H + 0.04, 0);
    body.add(scoop);
    const stripeMat = cached('muscleStripe', () => withSurface(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }), 'paintedMetal'));
    for (const side of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(L * 0.34, 0.012, 0.14), stripeMat);
      st.position.set(L * 0.3, prof.body[3][1] * H + 0.01, side * 0.14);
      body.add(st);
    }
    // Side exhausts.
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8).rotateZ(Math.PI / 2), chrome);
      ex.position.set(-L * 0.1, yb + 0.06, side * (W / 2 - 0.05));
      body.add(ex);
    }
  }
  if (spec.style === 'supercar') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, W * 0.95), trim);
    wing.position.set(-L / 2 + 0.16, prof.body[1][1] * H + 0.3, 0);
    body.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.05), trim);
      strut.position.set(-L / 2 + 0.16, prof.body[1][1] * H + 0.15, side * W * 0.34);
      body.add(strut);
      // Side intakes.
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.08), trim);
      intake.position.set(-L * 0.1, H * 0.45, side * (W / 2 - 0.02));
      body.add(intake);
    }
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, W * 0.7), trim);
    diffuser.position.set(-L / 2 + 0.08, yb + 0.04, 0);
    body.add(diffuser);
  }
  if (spec.style === 'pickup') {
    // The bed: floor, two walls and a tailgate, behind the cab.
    const bedX0 = -L / 2 + 0.06;
    const bedX1 = cabin[0][0] * L - 0.08;
    const bedL = bedX1 - bedX0;
    const bedTop = prof.body[1][1] * H;
    const wallH = 0.42;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(bedL, 0.04, W - 0.2), trim);
    floor.position.set((bedX0 + bedX1) / 2, bedTop + 0.02, 0);
    body.add(floor);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(bedL, wallH, 0.08), paint);
      wall.position.set((bedX0 + bedX1) / 2, bedTop + wallH / 2, side * (W / 2 - 0.05));
      body.add(wall);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, W - 0.1), paint);
    gate.position.set(bedX0 + 0.04, bedTop + wallH / 2, 0);
    body.add(gate);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, W - 0.1), paint);
    back.position.set(bedX1 - 0.04, bedTop + wallH / 2, 0);
    body.add(back);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, W * 0.7), chrome);
    bar.position.set(bedX1 - 0.04, bedTop + wallH + 0.3, 0);
    body.add(bar);
  }
  if (spec.style === 'bus') {
    // Destination sign, a door on the kerb side and rear engine grille.
    const signMat = cached('busSign', () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb340, emissiveIntensity: 0.6 }));
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, W * 0.7), signMat);
    sign.position.set(L / 2 + 0.02, H * 0.9, 0);
    body.add(sign);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, H * 0.6, 0.03), glass);
    door.position.set(L * 0.36, H * 0.42, W / 2 + 0.01);
    body.add(door);
    const door2 = door.clone();
    door2.position.x = -L * 0.1;
    body.add(door2);
    const grilleB = new THREE.Mesh(new THREE.BoxGeometry(0.05, H * 0.3, W * 0.6), trim);
    grilleB.position.set(-L / 2 - 0.01, H * 0.45, 0);
    body.add(grilleB);
    const roofLine = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.1, W * 0.9), paint);
    roofLine.position.set(0, roofTopY + 0.03, 0);
    body.add(roofLine);
  }
  if (spec.style === 'rally') {
    // Roof light pod, a rear spoiler and mud flaps.
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, W * 0.55), trim);
    pod.position.set(cabin[2][0] + 0.25, roofTopY + 0.08, 0);
    body.add(pod);
    for (let k = 0; k < 4; k++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.1), head);
      lamp.position.set(cabin[2][0] + 0.35, roofTopY + 0.08, (k - 1.5) * 0.14 * (W / 1.8));
      body.add(lamp);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, W * 0.9), trim);
    wing.position.set(-L / 2 + 0.18, roofTopY + 0.02, 0);
    body.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.04), trim);
      strut.position.set(-L / 2 + 0.18, roofTopY - 0.1, side * W * 0.3);
      body.add(strut);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.28), trim);
      flap.position.set(axleR - archR - 0.02, yb + 0.1, side * (W / 2 - 0.2));
      body.add(flap);
    }
  }
  if (spec.style === 'limo') {
    const chromeLine = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.03, W + 0.02), chrome);
    chromeLine.position.set(0, prof.body[2][1] * H - 0.02, 0);
    body.add(chromeLine);
  }
  if (spec.style === 'sports') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, W * 0.9), trim);
    wing.position.set(-L / 2 + 0.2, prof.body[1][1] * H + 0.22, 0);
    body.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), trim);
      strut.position.set(-L / 2 + 0.2, prof.body[1][1] * H + 0.11, side * W * 0.3);
      body.add(strut);
    }
  }

  // One mesh per material instead of ~25 small ones (a car was 31 draw calls, most of them twice
  // over with the shadow pass). The merged shapes depend only on the model, so they're built once
  // per model and shared; only the paint and lights are the car's own.
  const roles = new Map<THREE.Material, string>([
    [paint, 'paint'],
    [head, 'head'],
    [tail, 'tail'],
  ]);
  if (lightbar) {
    roles.set(lightbar.red, 'red');
    roles.set(lightbar.blue, 'blue');
  }
  mergeBody(body, roles, spec.id);

  // ---- wheels
  const wheels: CarVisual['wheels'] = [];
  const tyreW = 0.25;
  const tyreGeo = cachedGeo(`tyre-${r}`, () => {
    const g = new THREE.CylinderGeometry(r, r, tyreW, 24);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const wheelGeo = cachedGeo(`rimspokes-${r}`, () => {
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(r * 0.64, r * 0.64, tyreW + 0.02, 16).rotateX(Math.PI / 2)];
    for (let k = 0; k < 3; k++) parts.push(new THREE.BoxGeometry(r * 1.2, r * 0.12, tyreW + 0.04).rotateZ((k * Math.PI) / 3));
    return mergeGeometries(parts.map((g) => stripTo(g)), false)!;
  });
  const rubber = cached('rubber', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }), 'rubber'));
  const rimMat = cached(`rim-${spec.style}`, () =>
    withSurface(new THREE.MeshStandardMaterial({ color: spec.style === 'sports' || spec.style === 'supercar' || spec.style === 'rally' ? 0x222222 : spec.style === 'muscle' ? 0xd9c47a : 0xb9bec2, roughness: 0.25, metalness: 0.95 }), 'bareMetal'),
  );
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const spinner = new THREE.Group();
    pivot.add(spinner);
    // Tyre, and the rim with its spokes as one mesh. Wheels don't cast shadows: under the car's
    // own shadow they'd never show, and they were 20 shadow draw calls a car.
    spinner.add(new THREE.Mesh(tyreGeo, rubber), new THREE.Mesh(wheelGeo, rimMat));
    root.add(pivot);
    wheels.push({ pivot, spinner });
  }

  // Seat cushion: a seated 1.8 m driver is ~1.05 m from cushion to crown, so keep that under the roof.
  const cushion = Math.min(0.34, H * 0.96 - 1.08);
  const seat = new THREE.Vector3(-0.15, groundY + cushion, -W * 0.22);
  return { root, body, wheels, paint, tail, head, lightbar, seat };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/** Non-indexed, position / normal / uv only (so any of the car's parts can be merged together). */
function stripTo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.clearGroups();
  return n;
}

/**
 * Merges a car body's meshes by material: shared materials by identity, the car's own (paint,
 * lights) by role. Multi-material parts (the taxi sign) stay as they are. Cast shadows only from
 * the big opaque shapes (paint, trim, the van box); glass, chrome, lights and decals don't.
 */
function mergeBody(body: THREE.Group, roles: Map<THREE.Material, string>, modelId: string): void {
  body.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  for (const o of [...body.children]) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || m.children.length) {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true;
      });
      continue;
    }
    const mat = m.material as THREE.Material;
    const key = roles.get(mat) ?? mat.uuid;
    let gr = groups.get(key);
    if (!gr) groups.set(key, (gr = { mat, meshes: [] }));
    gr.meshes.push(m);
  }
  for (const [key, gr] of groups) {
    const geo = cachedGeo(`body-${modelId}-${key}`, () =>
      mergeGeometries(
        gr.meshes.map((m) => stripTo(m.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))),
        false,
      )!,
    );
    for (const m of gr.meshes) {
      body.remove(m);
      // Each car's own one-off shapes; the merged copy is shared.
      if (!m.geometry.userData['shared']) m.geometry.dispose();
    }
    const merged = new THREE.Mesh(geo, gr.mat);
    const std = gr.mat as THREE.MeshStandardMaterial;
    const opaque = key === 'paint' || (!std.transparent && (std.emissive?.getHex() ?? 0) === 0 && std.metalness !== 1);
    merged.castShadow = opaque;
    merged.receiveShadow = true;
    merged.name = `car-${modelId}-${key.length > 12 ? 'part' : key}`;
    body.add(merged);
  }
}

export type MountSlot = 'engineBay' | 'trunk' | 'roofRack';

/**
 * Where a slotted Streetmon rides on a car (car frame: +X forward, Y up, origin at the chassis
 * centre): the deck it pokes out of (x, y of the surface, its length along the car), which way it
 * faces (+1 forward, -1 back), how tall it may be and how deep it sits in (a fraction of its
 * height hidden inside the body):
 *  - engine bay: up through the hood, facing forward, half of it out;
 *  - trunk: out of the boot lid (the tailgate on an SUV, the top of a van's box), looking back;
 *  - roof rack: sitting up in a rack on the roof, facing forward.
 */
export function slotMount(spec: VehicleSpec, slot: MountSlot): { x: number; y: number; len: number; width: number; face: 1 | -1; height: number; sink: number } {
  const L = spec.length;
  const H = spec.height;
  const W = spec.width;
  const groundY = -chassisRestHeight(spec);
  const prof = PROFILES[spec.style];
  const topAt = (fx: number): number => {
    const b = prof.body;
    if (fx <= b[0][0]) return b[0][1];
    for (let i = 1; i < b.length; i++) {
      if (fx <= b[i][0]) {
        const k = (fx - b[i - 1][0]) / Math.max(1e-6, b[i][0] - b[i - 1][0]);
        return b[i - 1][1] + (b[i][1] - b[i - 1][1]) * k;
      }
    }
    return b[b.length - 1][1];
  };
  const cab = prof.cabin;
  const roofY = Math.max(cab[1][1], cab[2][1]) * H + 0.05;
  const small = H < 1.3 ? 0.85 : 1;
  if (spec.style === 'bus') {
    if (slot === 'engineBay') return { x: -L * 0.42, y: groundY + H, len: 1.4, width: W * 0.7, face: -1, height: 1.0, sink: 0.35 };
    if (slot === 'trunk') return { x: -L * 0.2, y: groundY + H, len: 1.6, width: W * 0.8, face: -1, height: 1.0, sink: 0.3 };
    return { x: L * 0.15, y: groundY + H, len: 1.8, width: W * 0.8, face: 1, height: 1.0, sink: 0.1 };
  }
  if (spec.style === 'pickup' && slot === 'trunk') {
    // Standing in the bed.
    return { x: -L * 0.22, y: groundY + prof.body[1][1] * H + 0.04, len: 1.6, width: W * 0.8, face: -1, height: 1.2, sink: 0.25 };
  }
  if (spec.style === 'van' || spec.style === 'ambulance') {
    if (slot === 'engineBay') return { x: L * 0.42, y: groundY + 0.42 * H, len: 0.6, width: W * 0.7, face: 1, height: 0.95, sink: 0.4 };
    if (slot === 'trunk') return { x: -L * 0.36, y: groundY + H, len: 1.4, width: W * 0.8, face: -1, height: 0.95, sink: 0.35 };
    return { x: -L * 0.02, y: groundY + H, len: 1.4, width: W * 0.8, face: 1, height: 0.9, sink: 0.1 };
  }
  if (slot === 'engineBay') {
    const a = cab[3][0];
    const fx = (a + 0.46) / 2;
    return { x: fx * L, y: groundY + topAt(fx) * H, len: (0.46 - a) * L, width: W * 0.75, face: 1, height: 1.15 * small, sink: 0.4 };
  }
  if (slot === 'trunk') {
    const b = cab[0][0];
    const deck = (b + 0.49) * L;
    if (deck < 0.55) {
      // No boot lid (an SUV): out of the tailgate, against the back window.
      return { x: -L / 2 + 0.38, y: groundY + topAt(-0.47) * H, len: 0.7, width: W * 0.8, face: -1, height: 1.1 * small, sink: 0.45 };
    }
    const fx = (b - 0.47) / 2;
    return { x: fx * L, y: groundY + topAt(fx) * H, len: deck, width: W * 0.8, face: -1, height: 1.1 * small, sink: 0.45 };
  }
  return { x: ((cab[1][0] + cab[2][0]) / 2) * L, y: groundY + roofY, len: (cab[2][0] - cab[1][0]) * L, width: W * prof.cabinWidth, face: 1, height: 1.0 * small, sink: 0.12 };
}
