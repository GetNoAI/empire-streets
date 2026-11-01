import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../config';
import type { Access, Garage, JumpPad, RooftopPlan, Stash } from './Rooftops';
import { withSurface } from '../render/Surfaces';

/**
 * Builds what the rooftop plan needs in the world: fire-escape stairs on facades, elevator doors
 * and roof huts, parking garages with driveable ramps, jump pads and loot crates. Static parts are
 * merged into a few meshes; crates are kept separately so they can show opened.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface RooftopView {
  root: THREE.Group;
  /** Shows a stash as opened (lid off, dark). */
  setStashOpen(id: string, open: boolean): void;
  /** Pulses jump pads and elevator lights. */
  update(t: number): void;
  /** Skylights light up from the rooms below after dark (0 day .. 1 night). */
  setNight(k: number): void;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function merged(parts: THREE.BufferGeometry[], mat: THREE.Material, shadows = true): THREE.Mesh | null {
  if (!parts.length) return null;
  const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function buildRooftops(plan: RooftopPlan, world: RAPIER.World): RooftopView {
  const root = new THREE.Group();
  root.name = 'rooftops';
  const collider = (hx: number, hy: number, hz: number, x: number, y: number, z: number, rotZ = 0): void => {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9).setCollisionGroups(WORLD_GROUPS);
    if (rotZ) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotZ);
      d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    world.createCollider(d);
  };

  // ---- fire escapes: zig-zag stairs with landings every storey, on the outside of the facade.
  const metal: THREE.BufferGeometry[] = [];
  for (const a of plan.access.filter((x) => x.kind === 'fireEscape')) fireEscape(a, metal);

  // ---- fire escape extras: ladder stringers, a sign on the wall and hazard paint under the ladder.
  const feSign: THREE.BufferGeometry[] = [];
  const hazard: THREE.BufferGeometry[] = [];
  for (const a of plan.access.filter((x) => x.kind === 'fireEscape')) {
    const y0 = a.street.y;
    for (const u of [-0.27, 0.27]) metal.push(onFacade(a, box(0.05, 3.0, 0.05, u, 2.1, 1.05)));
    // Hung from the front of the first landing, over the ladder.
    feSign.push(onFacade(a, plane(1.3, 0.5, 0, 3.25, 1.17)));
    hazard.push(onFacade(a, flat(1.2, 0.9, 0, y0 + 0.012, 1.05)));
  }
  const metalMesh = merged(metal, withSurface(new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.7, metalness: 0.6 }), 'paintedMetal'));
  if (metalMesh) root.add(metalMesh);

  // ---- elevators: a proper lift lobby door at street level, a stairwell hut on the roof.
  //   steel surround, two brushed doors with a lit seam, a floor indicator, a call button, a
  //   canopy with an ELEVATOR / ROOF ACCESS sign, and a threshold plate.
  const doorParts: THREE.BufferGeometry[] = [];
  const hutParts: THREE.BufferGeometry[] = [];
  const frameParts: THREE.BufferGeometry[] = [];
  const steelParts: THREE.BufferGeometry[] = [];
  const indicatorParts: THREE.BufferGeometry[] = [];
  const buttonParts: THREE.BufferGeometry[] = [];
  const elevSignParts: THREE.BufferGeometry[] = [];
  for (const a of plan.access.filter((x) => x.kind === 'elevator')) {
    const [ox, oz] = faceOut(a);
    const y0 = a.street.y;
    frameParts.push(onFacade(a, box(2.8, 3.1, 0.16, 0, y0 + 1.55, 0.08)));
    frameParts.push(onFacade(a, box(3.4, 0.14, 1.4, 0, y0 + 3.3, 0.7)));
    frameParts.push(onFacade(a, box(2.06, 2.42, 0.02, 0, y0 + 1.21, 0.165)));
    for (const u of [-0.5, 0.5]) steelParts.push(onFacade(a, box(0.97, 2.36, 0.05, u, y0 + 1.18, 0.19)));
    steelParts.push(onFacade(a, box(0.2, 0.42, 0.04, 1.3, y0 + 1.2, 0.18)));
    steelParts.push(onFacade(a, box(2.3, 0.02, 0.55, 0, y0 + 0.01, 0.45)));
    doorParts.push(onFacade(a, box(0.035, 2.3, 0.02, 0, y0 + 1.18, 0.22)));
    buttonParts.push(onFacade(a, box(0.08, 0.08, 0.03, 1.3, y0 + 1.27, 0.21)));
    indicatorParts.push(onFacade(a, plane(0.9, 0.24, 0, y0 + 2.63, 0.17)));
    elevSignParts.push(onFacade(a, plane(3.0, 0.42, 0, y0 + 3.3, 1.41)));
    // Hut 3.5 m in from the arrival point, so you step out between the hut and the edge.
    const hx = a.roof.x - ox * 3.2;
    const hz = a.roof.z - oz * 3.2;
    hutParts.push(box(3, 2.6, 3, hx, a.roof.y + 1.3, hz));
    collider(1.5, 1.3, 1.5, hx, a.roof.y + 1.3, hz);
    // The hut's lift doors face the roof edge you arrive at: steel, framed, a lit strip over them.
    const along = ox === 0;
    frameParts.push(box(along ? 1.5 : 0.08, 2.2, along ? 0.08 : 1.5, hx + ox * 1.51, a.roof.y + 1.1, hz + oz * 1.51));
    steelParts.push(box(along ? 1.2 : 0.06, 1.9, along ? 0.06 : 1.2, hx + ox * 1.56, a.roof.y + 0.95, hz + oz * 1.56));
    doorParts.push(box(along ? 1.2 : 0.04, 0.1, along ? 0.04 : 1.2, hx + ox * 1.58, a.roof.y + 2.05, hz + oz * 1.58));
  }
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x5ab8ff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 });
  const doorMesh = merged(doorParts, doorMat, false);
  if (doorMesh) root.add(doorMesh);
  const add = (m: THREE.Mesh | null): void => {
    if (m) root.add(m);
  };
  add(merged(frameParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.45, metalness: 0.7 }), 'paintedMetal')));
  add(merged(steelParts, withSurface(new THREE.MeshStandardMaterial({ color: 0xc3c9cf, roughness: 0.28, metalness: 0.95 }), 'bareMetal')));
  add(merged(buttonParts, new THREE.MeshStandardMaterial({ color: 0x3dff8a, emissive: 0x22ff77, emissiveIntensity: 2 }), false));
  const ind = signTexture('▲ ROOF', '#1a0e02', '#ffb23e', 256, 64);
  add(merged(indicatorParts, new THREE.MeshStandardMaterial({ map: ind, emissive: 0xffffff, emissiveMap: ind, emissiveIntensity: 1.2 }), false));
  const es = signTexture('ELEVATOR  ·  ROOF ACCESS', '#0e2238', '#9fd8ff', 512, 72);
  add(merged(elevSignParts, new THREE.MeshStandardMaterial({ map: es, emissive: 0xffffff, emissiveMap: es, emissiveIntensity: 1.1 }), false));
  const fs = signTexture('FIRE ESCAPE ▲', '#a3200f', '#ffffff', 256, 96);
  add(merged(feSign, new THREE.MeshStandardMaterial({ map: fs, emissive: 0xffffff, emissiveMap: fs, emissiveIntensity: 0.55 }), false));
  const hz = hazardTexture();
  add(merged(hazard, new THREE.MeshStandardMaterial({ map: hz, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), false));
  const hutMesh = merged(hutParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.9 }), 'concrete'));
  if (hutMesh) root.add(hutMesh);

  // ---- parking garages: deck, landing, ramp slab, rails and parapets.
  const concrete: THREE.BufferGeometry[] = [];
  const rails: THREE.BufferGeometry[] = [];
  for (const g of plan.garages) garage(g, concrete, rails, collider);
  // A lit PARKING sign on a post at each ramp's foot, facing the street.
  const parkPost: THREE.BufferGeometry[] = [];
  const parkSign: THREE.BufferGeometry[] = [];
  for (const g of plan.garages) {
    const out = g.face === 'n' ? -1 : 1;
    const z = (g.face === 'n' ? g.lane.z0 : g.lane.z1) + out * 0.5;
    const x = g.footX - g.dir * 1.2;
    parkPost.push(box(0.12, 3.4, 0.12, x, 1.7, z));
    const sg = new THREE.PlaneGeometry(1.6, 0.9);
    if (out < 0) sg.rotateY(Math.PI);
    sg.translate(x, 3.0, z + out * 0.08);
    parkSign.push(sg);
    parkPost.push(box(1.7, 1.0, 0.12, x, 3.0, z));
  }
  const ps = signTexture('P  ▲ ROOF', '#123b8a', '#ffffff', 256, 144);
  const ppMesh = merged(parkPost, withSurface(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5, metalness: 0.6 }), 'paintedMetal'));
  if (ppMesh) root.add(ppMesh);
  const psMesh = merged(parkSign, new THREE.MeshStandardMaterial({ map: ps, emissive: 0xffffff, emissiveMap: ps, emissiveIntensity: 0.9 }), false);
  if (psMesh) root.add(psMesh);
  const concMesh = merged(concrete, withSurface(new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.95 }), 'concrete'));
  if (concMesh) root.add(concMesh);
  const railMesh = merged(rails, withSurface(new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.6, metalness: 0.2 }), 'paintedMetal'));
  if (railMesh) root.add(railMesh);

  // ---- jump pads: glowing discs; hidden spots are a faint crack in the roof.
  const padParts: THREE.BufferGeometry[] = [];
  const hiddenParts: THREE.BufferGeometry[] = [];
  for (const p of plan.pads) {
    const g = new THREE.CylinderGeometry(p.hidden ? 0.7 : 0.95, p.hidden ? 0.7 : 1.05, 0.08, 20);
    g.translate(p.x, p.y + 0.05, p.z);
    (p.hidden ? hiddenParts : padParts).push(g);
    if (!p.hidden) {
      // Arrow towards the landing.
      const ang = Math.atan2(p.land.x - p.x, p.land.z - p.z);
      const a = new THREE.ConeGeometry(0.35, 0.7, 3);
      a.rotateX(Math.PI / 2);
      a.rotateY(ang);
      a.translate(p.x + Math.sin(ang) * 1.5, p.y + 0.12, p.z + Math.cos(ang) * 1.5);
      padParts.push(a);
    }
  }
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3df0d0, emissive: 0x19d6b5, emissiveIntensity: 1.6, roughness: 0.4 });
  const padMesh = merged(padParts, padMat, false);
  if (padMesh) root.add(padMesh);
  const hidMesh = merged(hiddenParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 1 }), 'concrete'), false);
  if (hidMesh) root.add(hidMesh);

  // ---- rooftop stairs between neighbouring roofs of different heights (each step a solid block).
  const stepParts: THREE.BufferGeometry[] = [];
  const stripeParts: THREE.BufferGeometry[] = [];
  for (const st of plan.stairs) {
    const rise = (st.top - st.bottom) / st.steps;
    const alongX = st.dirX !== 0;
    for (let k = 1; k <= st.steps; k++) {
      const back = (st.steps - k + 0.5) * st.tread;
      const x = st.x - st.dirX * back;
      const z = st.z - st.dirZ * back;
      const h = k * rise;
      const sx = alongX ? st.tread : st.width;
      const sz = alongX ? st.width : st.tread;
      stepParts.push(box(sx, h, sz, x, st.bottom + h / 2, z));
      collider(sx / 2, h / 2, sz / 2, x, st.bottom + h / 2, z);
      // Yellow nosing so the steps read from a distance.
      stripeParts.push(box(alongX ? 0.06 : st.width, 0.02, alongX ? st.width : 0.06, x - st.dirX * (st.tread / 2 - 0.03), st.bottom + h + 0.01, z - st.dirZ * (st.tread / 2 - 0.03)));
    }
  }
  const stepMesh = merged(stepParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x7d7a73, roughness: 0.9 }), 'concrete'));
  if (stepMesh) root.add(stepMesh);
  const stripeMesh = merged(stripeParts, withSurface(new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.6 }), 'paintedMetal'), false);
  if (stripeMesh) root.add(stripeMesh);

  // ---- stashes: crates with a lid.
  const crateMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.85 }), 'wood');
  const secretMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x3d4a6b, roughness: 0.5, metalness: 0.4 }), 'paintedMetal');
  const openMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 }), 'wood');
  const crates = new Map<string, { body: THREE.Mesh; lid: THREE.Mesh; mat: THREE.Material }>();
  for (const s of plan.stashes) crates.set(s.id, crate(s, s.secret ? secretMat : crateMat, root));

  // ---- skylights: glazed hip frames over the stairwells of some roofs, glowing warm at night.
  const skyFrame: THREE.BufferGeometry[] = [];
  const skyGlass: THREE.BufferGeometry[] = [];
  const clear = (x: number, z: number, r: number): boolean =>
    plan.stashes.every((q) => Math.hypot(q.x - x, q.z - z) > r + 1.5) &&
    plan.access.every((q) => Math.hypot(q.roof.x - x, q.roof.z - z) > r + 3) &&
    plan.pads.every((q) => Math.hypot(q.x - x, q.z - z) > r + 2.5) &&
    plan.stairs.every((q) => Math.hypot(q.x - x, q.z - z) > r + 3);
  for (const r of plan.roofs) {
    if (r.kind !== 'roof' && r.kind !== 'tall') continue;
    const rw = r.rect.x1 - r.rect.x0;
    const rd = r.rect.z1 - r.rect.z0;
    if (rw < 12 || rd < 12 || (r.id * 2654435761) % 5 > 1) continue;
    const n = rw * rd > 500 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      // Toward a corner (water towers and spires stand in the middle).
      const fx = k === 0 ? 0.24 : 0.74;
      const fz = (r.id + k) % 2 ? 0.26 : 0.72;
      const x = r.rect.x0 + rw * fx;
      const z = r.rect.z0 + rd * fz;
      const sw = Math.min(5, rw * 0.22);
      const sd = Math.min(3.4, rd * 0.18);
      if (!clear(x, z, Math.max(sw, sd) / 2)) continue;
      const y = r.top;
      // Curb, a ridge, and four sloped glass panes over a steel frame.
      skyFrame.push(box(sw + 0.3, 0.45, sd + 0.3, x, y + 0.225, z));
      const ridgeH = 0.7;
      skyFrame.push(box(sw, 0.08, 0.08, x, y + 0.45 + ridgeH, z));
      const slope = Math.atan2(ridgeH, sd / 2);
      const pane = Math.hypot(ridgeH, sd / 2);
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(sw - 0.1, 0.04, pane);
        g.rotateX(side * slope);
        g.translate(x, y + 0.45 + ridgeH / 2, z + (side * sd) / 4);
        skyGlass.push(g.toNonIndexed());
        for (let i = 0; i <= 4; i++) {
          const m = new THREE.BoxGeometry(0.06, 0.06, pane);
          m.rotateX(side * slope);
          m.translate(x - sw / 2 + (sw * i) / 4, y + 0.47 + ridgeH / 2, z + (side * sd) / 4);
          skyFrame.push(m.toNonIndexed());
        }
      }
      for (const side of [-1, 1]) {
        const tri = new THREE.BufferGeometry();
        const ex = x + (side * sw) / 2;
        tri.setAttribute('position', new THREE.Float32BufferAttribute([ex, y + 0.45, z - sd / 2, ex, y + 0.45, z + sd / 2, ex, y + 0.45 + ridgeH, z], 3));
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        tri.computeVertexNormals();
        skyGlass.push(tri);
      }
      collider(sw / 2 + 0.15, 0.6, sd / 2 + 0.15, x, y + 0.6, z);
    }
  }
  const skyFrameMesh = skyFrame.length ? new THREE.Mesh(mergeGeometries(skyFrame.map((g) => (g.index ? g.toNonIndexed() : g)), false), withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.7, roughness: 0.45 }), 'paintedMetal')) : null;
  const skyGlassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, emissive: 0xffc27a, emissiveIntensity: 0.0, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const skyGlassMesh = skyGlass.length ? new THREE.Mesh(mergeGeometries(skyGlass.map((g) => (g.index ? g.toNonIndexed() : g)), false), skyGlassMat) : null;
  if (skyFrameMesh) {
    skyFrameMesh.castShadow = true;
    skyFrameMesh.receiveShadow = true;
    root.add(skyFrameMesh);
  }
  if (skyGlassMesh) root.add(skyGlassMesh);

  return {
    root,
    setNight(k: number): void {
      skyGlassMat.emissiveIntensity = 1.3 * k;
      skyGlassMat.opacity = 0.55 + 0.3 * k;
    },
    setStashOpen(id: string, open: boolean): void {
      const c = crates.get(id);
      if (!c) return;
      c.lid.visible = !open;
      c.body.material = open ? openMat : c.mat;
    },
    update(t: number): void {

      padMat.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.5;
      doorMat.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.25;
    },
  };
}

/**
 * Facade-local geometry onto the world: x along the wall, y up (absolute), z out from the wall
 * (0 = the wall's face, 1.3 m in from the access's street spot).
 */
function onFacade(a: Access, g: THREE.BufferGeometry): THREE.BufferGeometry {
  const [ox, oz] = faceOut(a);
  g.rotateY(Math.atan2(ox, oz));
  g.translate(a.street.x - ox * 1.3, 0, a.street.z - oz * 1.3);
  return g;
}

/** A sign face (facing +z). */
function plane(w: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(x, y, z);
  return g;
}

/** A flat patch on the ground (facing up; texture's top towards -z). */
function flat(w: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** A lit sign: text centred on a coloured plate with a thin border. */
export function signTexture(text: string, bg: string, fg: string, w: number, h: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.globalAlpha = 0.6;
  g.lineWidth = Math.max(2, h * 0.05);
  g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  g.globalAlpha = 1;
  g.fillStyle = fg;
  const size = Math.round(h * 0.5);
  g.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  g.textBaseline = 'middle';
  // '▲' is drawn as a triangle (fonts render it too small or not at all).
  const parts = text.split('▲');
  const tri = size * 0.8;
  const gap = size * 0.3;
  const widths = parts.map((p) => g.measureText(p).width);
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * (tri + gap * 2);
  const scale = Math.min(1, (w * 0.92) / total);
  g.save();
  g.translate(w / 2 - (total * scale) / 2, h / 2 + 1);
  g.scale(scale, scale);
  let x = 0;
  parts.forEach((p, i) => {
    g.fillText(p, x, 0);
    x += widths[i];
    if (i < parts.length - 1) {
      x += gap;
      g.beginPath();
      g.moveTo(x, tri * 0.45);
      g.lineTo(x + tri, tri * 0.45);
      g.lineTo(x + tri / 2, -tri * 0.5);
      g.closePath();
      g.fill();
      x += tri + gap;
    }
  });
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Yellow and black hazard stripes (under fire-escape ladders). */
function hazardTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8b923';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#151515';
  for (let i = -64; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 8, 0);
    g.lineTo(i + 8 - 64, 64);
    g.lineTo(i - 64, 64);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function faceOut(a: Access): [number, number] {
  return [a.face === 'e' ? 1 : a.face === 'w' ? -1 : 0, a.face === 's' ? 1 : a.face === 'n' ? -1 : 0];
}

function fireEscape(a: Access, out: THREE.BufferGeometry[]): void {
  const [ox, oz] = faceOut(a);
  const along = ox === 0; // facade runs along x
  const wallX = a.street.x - ox * 1.3;
  const wallZ = a.street.z - oz * 1.3;
  const depth = 1.1;
  const cxp = wallX + ox * (depth / 2 + 0.05);
  const czp = wallZ + oz * (depth / 2 + 0.05);
  const span = 3.2;
  const top = a.roof.y;
  // Landings every 3.6 m from 3.6 m up (the bottom flight is a drop ladder).
  for (let y = 3.6; y < top - 0.5; y += 3.6) {
    out.push(box(along ? span : depth, 0.08, along ? depth : span, cxp, y, czp));
    // Outer rail.
    out.push(box(along ? span : 0.05, 0.05, along ? 0.05 : span, cxp + ox * depth * 0.5, y + 1, czp + oz * depth * 0.5));
  }
  // Rails up the outside corners and a ladder down to the street.
  for (const s of [-1, 1]) {
    const px = along ? cxp + (s * span) / 2 : cxp + ox * depth * 0.5;
    const pz = along ? czp + oz * depth * 0.5 : czp + (s * span) / 2;
    out.push(box(0.06, top, 0.06, px, top / 2, pz));
  }
  // Diagonal flights (one per storey), alternating direction.
  let i = 0;
  for (let y = 3.6; y < top - 3.6; y += 3.6, i++) {
    const len = Math.hypot(span * 0.8, 3.6);
    const ang = Math.atan2(3.6, span * 0.8) * (i % 2 ? -1 : 1);
    if (along) out.push(box(len, 0.06, depth * 0.6, cxp, y + 1.8, czp, ang));
    else {
      const g = box(len, 0.06, depth * 0.6, 0, 0, 0, ang);
      g.rotateY(Math.PI / 2);
      g.translate(cxp, y + 1.8, czp);
      out.push(g);
    }
  }
  // Ladder rungs to the first landing.
  for (let y = 0.6; y < 3.6; y += 0.35) out.push(box(along ? 0.5 : 0.04, 0.04, along ? 0.04 : 0.5, a.street.x - ox * 0.25, y, a.street.z - oz * 0.25));
}

function garage(g: Garage, concrete: THREE.BufferGeometry[], rails: THREE.BufferGeometry[], collider: (hx: number, hy: number, hz: number, x: number, y: number, z: number, rotZ?: number) => void): void {
  const H = g.deck;
  const base = 0.15;
  // Deck: solid block (the rest of the footprint) up to deck height.
  const dr = g.deckRect;
  const dw = dr.x1 - dr.x0;
  const dd = dr.z1 - dr.z0;
  concrete.push(box(dw, H - base, dd, (dr.x0 + dr.x1) / 2, (H + base) / 2, (dr.z0 + dr.z1) / 2));
  collider(dw / 2, (H - base) / 2, dd / 2, (dr.x0 + dr.x1) / 2, (H + base) / 2, (dr.z0 + dr.z1) / 2);
  // Landing at the top of the lane.
  const lr = g.landing;
  const lw = lr.x1 - lr.x0;
  const ld = lr.z1 - lr.z0;
  concrete.push(box(lw, H - base, ld, (lr.x0 + lr.x1) / 2, (H + base) / 2, (lr.z0 + lr.z1) / 2));
  collider(lw / 2, (H - base) / 2, ld / 2, (lr.x0 + lr.x1) / 2, (H + base) / 2, (lr.z0 + lr.z1) / 2);
  // Ramp slab from the foot to the landing.
  const run = g.topX - g.footX;
  const rise = H - base;
  const len = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  const t = 0.5;
  const laneZ = (g.lane.z0 + g.lane.z1) / 2;
  const laneW = g.lane.z1 - g.lane.z0 - 0.6;
  const mx = (g.footX + g.topX) / 2;
  const my = (base + H) / 2 - (t / 2) * Math.cos(ang);
  concrete.push(box(len, t, laneW, mx, my, laneZ, ang));
  collider(len / 2, t / 2, laneW / 2, mx, my, laneZ, ang);
  // Side wall under the ramp (street side) so it reads as a structure, and a rail along the top edge.
  const outerZ = g.face === 'n' ? g.lane.z0 + 0.15 : g.lane.z1 - 0.15;
  rails.push(box(len, 0.12, 0.12, mx, my + 1.05, outerZ, ang));
  // Solid rail along the street side, starting 8 m up the ramp (the apron and foot stay open to swing in).
  const rs = g.footX + 8;
  const rRun = g.topX - rs;
  const rLen = Math.hypot(rRun, (rise * rRun) / run);
  const rMx = (rs + g.topX) / 2;
  const rMy = base + (rise * (rMx - g.footX)) / run;
  collider(rLen / 2, 0.55, 0.12, rMx, rMy + 0.55, outerZ, ang);
  for (let k = 1; k <= 6; k++) {
    const px = g.footX + (run * k) / 7;
    const py = base + (rise * k) / 7;
    rails.push(box(0.1, 1.05, 0.1, px, py + 0.52, outerZ));
    concrete.push(box(0.5, py, 0.5, px, py / 2, outerZ));
  }
  // Parapets around the deck and landing (open where the landing meets the deck).
  const par = (x0: number, z0: number, x1: number, z1: number): void => {
    const w = Math.max(0.25, x1 - x0);
    const d = Math.max(0.25, z1 - z0);
    concrete.push(box(w, 1, d, (x0 + x1) / 2, H + 0.5, (z0 + z1) / 2));
    collider(w / 2, 0.5, d / 2, (x0 + x1) / 2, H + 0.5, (z0 + z1) / 2);
  };
  const r = g.rect;
  const backZ = g.face === 'n' ? r.z1 - 0.125 : r.z0 + 0.125;
  par(r.x0, backZ - 0.125, r.x1, backZ + 0.125);
  par(r.x1 - 0.25, r.z0, r.x1, r.z1);
  par(dr.x0, dr.z0, dr.x0 + 0.25, dr.z1);
  // Street-side edge of the landing.
  par(lr.x0, outerZ - 0.125, lr.x1, outerZ + 0.125);
  // Between the lane and the deck along the ramp, the deck's own wall stands; cap it.
  const innerZ = g.face === 'n' ? g.lane.z1 : g.lane.z0;
  par(dr.x0, innerZ - 0.125, lr.x0, innerZ + 0.125);
  // Parking lines on the deck.
  for (let x = dr.x0 + 3; x < dr.x1 - 2; x += 2.8) rails.push(box(0.12, 0.02, 4.8, x, H + 0.01, g.face === 'n' ? dr.z1 - 3 : dr.z0 + 3));
}

function crate(s: Stash, mat: THREE.Material, root: THREE.Group): { body: THREE.Mesh; lid: THREE.Mesh; mat: THREE.Material } {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.65), mat);
  body.position.set(s.x, s.y + 0.28, s.z);
  body.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.7), mat);
  lid.position.set(s.x, s.y + 0.6, s.z);
  lid.castShadow = true;
  root.add(body, lid);
  return { body, lid, mat };
}

export type { JumpPad };
