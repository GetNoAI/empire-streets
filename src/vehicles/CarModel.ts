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
  if (spec.style !== 'van' && spec.style !== 'sports') body.add(bPillar);

  // ---- van cargo box
  if (spec.style === 'van') {
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
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, W - 0.06), spec.style === 'sports' ? paint : trim);
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
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.9), [trim, trim, trim, trim, signMat, signMat]);
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
    withSurface(new THREE.MeshStandardMaterial({ color: spec.style === 'sports' ? 0x222222 : 0xb9bec2, roughness: 0.25, metalness: 0.95 }), 'bareMetal'),
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
