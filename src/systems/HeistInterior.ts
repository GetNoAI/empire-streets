import { mergeStaticChildren } from '../render/StaticMerge';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { markBloom } from '../render/SelectiveBloom';
import { withSurface } from '../render/Surfaces';
import type { HeistTarget, Pt } from './heistManager.js';

/**
 * Heists happen inside now: the check-casher, the jeweller and the bank each have an interior you
 * walk into through the front door once the job is on. It's built far under the building (like the
 * shops) and laid out per kind:
 *
 *   - a lobby with pillars and a teller counter (or display cases) to duck behind: cover is solid
 *     (guards and cameras can't see through it), so hugging a counter hides you;
 *   - a back area with desks and, at the bank, partition walls round a corridor to the vault;
 *   - **laser grids** across the way in: three beams that switch on and off on a cycle (staggered
 *     gate to gate), so you time your run. Touching a live beam sets the alarm off. A Hacker's jam
 *     kills them along with the cameras;
 *   - **cameras** in the corners, sweeping the room, and guards on patrol routes;
 *   - the vault in the back wall (a steel door that swings open when breached, with the bags in the
 *     strong room behind), or the jeweller's display cases.
 *
 * `planHeistInterior` is pure (unit-tested): it works out every position from the facade and the
 * job. `buildHeistInterior` makes the 3D room and its colliders.
 */

export const HEIST_INTERIOR = {
  /** Built this far down (below the shops at -120). */
  floorY: -150,
  height: 4.4,
  /** Room size per kind: width along the frontage, depth into the building. */
  size: { checkCashing: [20, 22], jewelryStore: [26, 24], bankVault: [34, 34] } as Record<string, [number, number]>,
  /** Guards and cameras per kind (at least as many as the job lists). */
  staff: { checkCashing: [2, 3], jewelryStore: [3, 4], bankVault: [5, 6] } as Record<string, [number, number]>,
  /** Laser gates: beam heights over the floor, and the on/off cycle (s). */
  laser: { heights: [0.35, 0.9, 1.5], period: 3.4, on: 2.1, reach: 0.28 },
  useRadius: 2.2,
};

export interface Box {
  x: number;
  z: number;
  /** Half extents along world x and z, and the height. */
  hx: number;
  hz: number;
  h: number;
  /** What it is (for the look). */
  kind: 'counter' | 'pillar' | 'desk' | 'case' | 'wall' | 'planter' | 'vaultWall';
}

export interface Laser {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Phase offset (s) in the on/off cycle. */
  phase: number;
}

export interface HeistInteriorPlan {
  id: string;
  kind: string;
  floorY: number;
  W: number;
  D: number;
  /** Middle of the room. */
  centre: Pt;
  /** Where you appear inside, and the door you leave by (inside), and the street door outside. */
  spawn: Pt & { facing: number };
  exit: Pt;
  street: Pt;
  breachPoints: Pt[];
  loot: Pt[];
  guards: Array<Pt & { patrolTo?: Pt; heading: number }>;
  cameras: Array<Pt & { y: number; yaw: number }>;
  cover: Box[];
  walls: Box[];
  lasers: Laser[];
  /** The vault door (it opens on the breach), as a box in the back wall. */
  vaultDoor: Box | null;
}

/**
 * hear: how far a guard hears footsteps (metres) at a jog; sprinting carries further, walking a
 * little less, crouching is nearly silent. Walls muffle it (half the range through one).
 */
export const HEARING = { radius: 7, sprint: 1.6, walk: 0.8, crouch: 0.22, muffled: 0.5, listen: 2.6 };

/** Does this job happen inside a building? (Not the armored truck.) */
export function hasInterior(t: HeistTarget): boolean {
  return !!t.location.facade && !!HEIST_INTERIOR.size[t.kind];
}

export function planHeistInterior(t: HeistTarget): HeistInteriorPlan | null {
  const f = t.location.facade;
  if (!f || !hasInterior(t)) return null;
  const [w0, D] = HEIST_INTERIOR.size[t.kind];
  const W = Math.min(w0, f.length - 2);
  // Local frame: u along the frontage, v into the building.
  const inx = -f.nx;
  const inz = -f.nz;
  const rx = f.nz;
  const rz = -f.nx;
  const P = (u: number, v: number): Pt => ({ x: +(f.x + rx * u + inx * v).toFixed(2), z: +(f.z + rz * u + inz * v).toFixed(2) });
  // A box given in local half extents (hu along u, hv along v).
  const B = (u: number, v: number, hu: number, hv: number, h: number, kind: Box['kind']): Box => {
    const p = P(u, v);
    const alongX = Math.abs(rx) > 0.5;
    return { x: p.x, z: p.z, hx: alongX ? hu : hv, hz: alongX ? hv : hu, h, kind };
  };
  const H = HEIST_INTERIOR.height;
  const T = 0.2;
  const big = t.kind === 'bankVault';
  const smash = t.breach.mode === 'smash';
  const vaultDepth = big ? 5.5 : 3.2;
  const vaultHalf = big ? 3.2 : 2.0;
  // ---- shell: the room's four walls (with the vault behind the back wall)
  const walls: Box[] = [
    B(0, -T / 2, W / 2 + T, T / 2, H, 'wall'),
    B(-W / 2 - T / 2, D / 2, T / 2, D / 2 + T, H, 'wall'),
    B(W / 2 + T / 2, D / 2, T / 2, D / 2 + T, H, 'wall'),
  ];
  const doorHalf = big ? 1.3 : 0.9;
  if (smash) walls.push(B(0, D + T / 2, W / 2 + T, T / 2, H, 'wall'));
  else {
    // Back wall in two pieces either side of the vault door, and the strong room behind it.
    const side = (W / 2 - doorHalf) / 2;
    walls.push(B(-(doorHalf + side), D + T / 2, side, T / 2, H, 'vaultWall'), B(doorHalf + side, D + T / 2, side, T / 2, H, 'vaultWall'));
    walls.push(B(0, D + vaultDepth + T / 2, vaultHalf + T, T / 2, H, 'vaultWall'));
    walls.push(B(-vaultHalf - T / 2, D + vaultDepth / 2, T / 2, vaultDepth / 2, H, 'vaultWall'), B(vaultHalf + T / 2, D + vaultDepth / 2, T / 2, vaultDepth / 2, H, 'vaultWall'));
  }
  const cover: Box[] = [];
  const lasers: Laser[] = [];
  const gate = (v: number, u0: number, u1: number, phase: number): void => {
    const a = P(u0, v);
    const b = P(u1, v);
    lasers.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, phase });
  };
  // ---- the lobby: two rows of pillars, benches and planters by the door
  const cols = big ? [-0.36, -0.12, 0.12, 0.36] : [-0.3, 0.3];
  for (const v of [0.13, 0.27]) for (const c of cols) cover.push(B(c * W, D * v, 0.45, 0.45, H, 'pillar'));
  for (const s of [-1, 1]) cover.push(B(s * (W / 2 - 1.3), D * 0.06 + 1.2, 0.5, 1.0, 1.2, 'planter'));
  let breachPoints: Pt[] = [];
  let loot: Pt[] = [];
  if (smash) {
    // Display cases in rows through the showroom, laser lines between the rows.
    const n = Math.max(1, t.location.breachPoints.length);
    const rows = n > 4 ? 3 : 2;
    const perRow = Math.ceil(n / rows);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const k = i % perRow;
      const u = (k - (perRow - 1) / 2) * (W / (perRow + 0.6));
      const v = D * (0.52 + row * (0.36 / Math.max(1, rows - 1)));
      cover.push(B(u, v, 0.8, 0.45, 1.0, 'case'));
      breachPoints.push(P(u, v - 1.0));
      loot.push(P(u + 0.55, v - 0.9));
    }
    gate(D * 0.4, -W / 2, W / 2, 0);
    for (let r = 1; r < rows; r++) gate(D * (0.52 + (r - 0.5) * (0.36 / Math.max(1, rows - 1))) - 0.2, -W / 2, W / 2, r * 1.2);
    // Tall cabinets along the side walls (cover in the showroom).
    for (const s of [-1, 1]) for (const v of [0.55, 0.75]) cover.push(B(s * (W / 2 - 0.6), D * v, 0.4, 1.0, 2.0, 'pillar'));
  } else {
    // Teller counter across the lobby with a gap to slip through at one end.
    cover.push(B(-1.0, D * 0.4, (W - 2.8) / 2 - 0.5, 0.35, 1.25, 'counter'));
    // Back area: offices either side of a corridor to the vault (doorways in the partitions).
    const cw = big ? 2.2 : 1.8;
    const v0 = D * 0.5;
    const door = D * 0.72;
    for (const s of [-1, 1]) {
      const u = s * (cw + T / 2);
      walls.push(B(u, (v0 + door - 0.8) / 2, T / 2, (door - 0.8 - v0) / 2, H, 'wall'), B(u, (door + 0.8 + D) / 2, T / 2, (D - door - 0.8) / 2, H, 'wall'));
      // Desks in rows in the offices.
      const mid = s * (cw + (W / 2 - cw) / 2);
      for (const v of big ? [0.58, 0.68, 0.8, 0.92] : [0.6, 0.78, 0.92]) cover.push(B(mid + s * ((v * 10) % 2 > 1 ? 1.2 : -1.2), D * v, 1.1, 0.45, 1.15, 'desk'));
      // Filing cabinets against the side walls.
      cover.push(B(s * (W / 2 - 0.5), D * 0.65, 0.35, 0.9, 1.9, 'pillar'));
    }
    // Laser gates down the corridor (staggered), and across the office ends at the bank.
    const gates = big ? [0.56, 0.66, 0.78, 0.9] : [0.6, 0.8];
    gates.forEach((v, i) => gate(D * v, -cw, cw, i * 0.9));
    if (big) {
      gate(D * 0.5, -W / 2, -cw - T, 2.0);
      gate(D * 0.5, cw + T, W / 2, 2.0);
    }
    breachPoints = [P(0, D - 0.9)];
    const n = Math.max(1, t.loot.bags);
    for (let i = 0; i < n; i++) {
      const c = big ? 4 : 3;
      const row = Math.floor(i / c);
      const k = i % c;
      loot.push(P((k - (c - 1) / 2) * (vaultHalf * 0.55), D + 1.2 + row * 1.6));
    }
  }
  // ---- guards: one walking the lobby, one by the door, the rest further in.
  const [gWant, cWant] = HEIST_INTERIOR.staff[t.kind] ?? [2, 3];
  const g = Math.max(gWant, t.location.guards.length);
  const routes: Array<[number, number, number, number]> = [
    [-W * 0.38, D * 0.2, W * 0.38, D * 0.2],
    smash ? [-W * 0.35, D * 0.62, W * 0.35, D * 0.62] : [0, D * 0.52, 0, D * 0.92],
    smash ? [W * 0.38, D * 0.45, W * 0.38, D * 0.9] : [W * 0.3, D * 0.55, W * 0.3, D * 0.95],
    smash ? [-W * 0.38, D * 0.9, -W * 0.38, D * 0.45] : [-W * 0.3, D * 0.95, -W * 0.3, D * 0.55],
    [-W * 0.15, D * 0.34, -W * 0.15, D * 0.08],
  ];
  const guards: HeistInteriorPlan['guards'] = [];
  for (let i = 0; i < g; i++) {
    const [u0, v0, u1, v1] = routes[i % routes.length];
    const a = P(u0, v0);
    const b = P(u1, v1);
    guards.push({ ...a, patrolTo: b, heading: Math.atan2(-(b.z - a.z), b.x - a.x) });
  }
  // ---- cameras: the corners, halfway down the side walls, and one looking down the corridor.
  const centre = P(0, D / 2);
  const camSpots: Array<[number, number, number, number]> = [
    [-W / 2 + 0.4, 0.4, 0, D * 0.4],
    [W / 2 - 0.4, D - 0.4, 0, D * 0.6],
    [W / 2 - 0.4, 0.4, 0, D * 0.4],
    [-W / 2 + 0.4, D - 0.4, 0, D * 0.6],
    [0, D - 0.4, 0, D * 0.4],
    [-W / 2 + 0.4, D * 0.5, W * 0.3, D * 0.5],
  ];
  const cameras: HeistInteriorPlan['cameras'] = [];
  const nc = Math.max(cWant, t.location.cameras.length);
  for (let i = 0; i < nc; i++) {
    const [u, v, lu, lv] = camSpots[i % camSpots.length];
    const p = P(u, v);
    const look = P(lu, lv);
    cameras.push({ ...p, y: HEIST_INTERIOR.floorY + H - 0.6, yaw: Math.atan2(look.x - p.x, look.z - p.z) });
  }
  const spawn = P(0, 1.2);
  return {
    id: t.id,
    kind: t.kind,
    floorY: HEIST_INTERIOR.floorY,
    W,
    D,
    centre,
    spawn: { ...spawn, facing: Math.atan2(-inz, inx) },
    exit: P(0, 0.5),
    street: { x: +(f.x + f.nx * 1.2).toFixed(2), z: +(f.z + f.nz * 1.2).toFixed(2) },
    breachPoints,
    loot,
    guards,
    cameras,
    cover,
    walls,
    lasers,
    vaultDoor: smash ? null : B(0, D + T / 2, doorHalf, T / 2 + 0.1, H * 0.75, 'vaultWall'),
  };
}

/** Is a laser gate live at this time (s)? */
export function laserOn(l: Laser, time: number): boolean {
  const L = HEIST_INTERIOR.laser;
  return ((time + l.phase) % L.period + L.period) % L.period < L.on;
}

/** Does someone standing at (px, pz) with feet at `feetY` touch this gate's beams? */
export function laserTouches(l: Laser, px: number, pz: number, feetY: number, floorY: number): boolean {
  const dx = l.bx - l.ax;
  const dz = l.bz - l.az;
  const len2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((px - l.ax) * dx + (pz - l.az) * dz) / len2));
  const d = Math.hypot(l.ax + dx * k - px, l.az + dz * k - pz);
  if (d > HEIST_INTERIOR.laser.reach) return false;
  const lo = feetY - floorY;
  return HEIST_INTERIOR.laser.heights.some((h) => h > lo - 0.05 && h < lo + 1.8);
}

// ---------------------------------------------------------------- the 3D room

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface HeistInteriorView {
  root: THREE.Group;
  /** Each gate's beams (shown while live). */
  beams: THREE.Object3D[];
  /** The vault door's pivot (swings open) or the display cases' glass. */
  openers: Array<{ obj: THREE.Object3D; kind: 'door' | 'glass'; t: number; open: boolean }>;
  /** The vault door's collider (moved away once it's open). */
  doorBody: RAPIER.RigidBody | null;
}

function marble(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#d9d2c4' : '#efe9de';
      g.fillRect(x * 128, y * 128, 128, 128);
    }
  g.strokeStyle = 'rgba(120,110,95,0.25)';
  for (let k = 0; k < 18; k++) {
    g.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(90,80,70,0.5)';
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildHeistInterior(plan: HeistInteriorPlan, world: RAPIER.World): HeistInteriorView {
  const root = new THREE.Group();
  root.name = `heist-interior-${plan.id}`;
  root.visible = false;
  const Y = plan.floorY;
  const H = HEIST_INTERIOR.height;
  const S = (m: THREE.MeshStandardMaterial, k: Parameters<typeof withSurface>[1]): THREE.MeshStandardMaterial => withSurface(m, k);
  const look = {
    bankVault: { wall: 0xe9e1cf, trim: 0x8a6a2a, wood: 0x5a3a24 },
    checkCashing: { wall: 0xe8e4d6, trim: 0xc9a400, wood: 0x6b5236 },
    jewelryStore: { wall: 0xf1e8ef, trim: 0x4a1030, wood: 0x3a2420 },
  }[plan.kind as 'bankVault'] ?? { wall: 0xe8e4d6, trim: 0x777777, wood: 0x5a4030 };
  const mats = {
    wall: S(new THREE.MeshStandardMaterial({ color: look.wall, roughness: 0.9 }), 'concrete'),
    vault: S(new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.5, metalness: 0.7 }), 'bareMetal'),
    wood: S(new THREE.MeshStandardMaterial({ color: look.wood, roughness: 0.55 }), 'wood'),
    top: S(new THREE.MeshStandardMaterial({ color: 0x2e2b28, roughness: 0.25, metalness: 0.1 }), 'stone'),
    brass: S(new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.3, metalness: 0.9 }), 'bareMetal'),
    stone: S(new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.6 }), 'stone'),
    steel: S(new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.3, metalness: 0.9 }), 'bareMetal'),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }),
    velvet: S(new THREE.MeshStandardMaterial({ color: 0x4a1030, roughness: 0.9 }), 'fabric'),
    green: S(new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.9 }), 'foliage'),
    laser: new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }),
    post: S(new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.7 }), 'paintedMetal'),
    light: new THREE.MeshBasicMaterial({ color: 0xfff4dc }),
  };
  const box = (b: Box, m: THREE.Material, solid = true, y0 = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2, b.h, b.hz * 2), m);
    mesh.position.set(b.x, Y + y0 + b.h / 2, b.z);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    root.add(mesh);
    if (solid) world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.h / 2, b.hz).setTranslation(b.x, Y + y0 + b.h / 2, b.z).setCollisionGroups(WORLD_GROUPS));
    return mesh;
  };
  // ---- floor (marble), ceiling with light panels, walls
  const minX = Math.min(...plan.walls.map((w) => w.x - w.hx));
  const maxX = Math.max(...plan.walls.map((w) => w.x + w.hx));
  const minZ = Math.min(...plan.walls.map((w) => w.z - w.hz));
  const maxZ = Math.max(...plan.walls.map((w) => w.z + w.hz));
  const fw = maxX - minX;
  const fd = maxZ - minZ;
  const fcx = (minX + maxX) / 2;
  const fcz = (minZ + maxZ) / 2;
  const tex = marble();
  tex.repeat.set(fw / 1.6, fd / 1.6);
  box({ x: fcx, z: fcz, hx: fw / 2, hz: fd / 2, h: 0.3, kind: 'wall' }, S(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0.05 }), 'stone'), true, -0.3);
  box({ x: fcx, z: fcz, hx: fw / 2, hz: fd / 2, h: 0.3, kind: 'wall' }, mats.wall, true, H);
  for (const w of plan.walls) box(w, w.kind === 'vaultWall' ? mats.vault : mats.wall);
  // A brass trim band round the room.
  for (const w of plan.walls) if (w.kind === 'wall') box({ ...w, hx: w.hx + 0.01, hz: w.hz + 0.01, h: 0.12 }, mats.brass, false, 1.1);
  for (let x = minX + 2; x < maxX - 1; x += 4)
    for (let z = minZ + 2; z < maxZ - 1; z += 4) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 1.4), mats.light);
      p.position.set(x, Y + H - 0.02, z);
      root.add(p);
    }
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x4a4238, 1.5);
  hemi.position.set(plan.centre.x, Y + H, plan.centre.z);
  root.add(hemi);
  for (const [dx, dz] of [
    [-0.25, -0.25],
    [0.25, 0.25],
  ]) {
    const l = new THREE.PointLight(0xffe6c0, 22, Math.max(fw, fd) * 1.1, 1.6);
    l.position.set(fcx + dx * fw, Y + H - 0.5, fcz + dz * fd);
    root.add(l);
  }
  // ---- cover and furniture
  for (const c of plan.cover) {
    if (c.kind === 'pillar') {
      box(c, mats.stone);
      box({ ...c, hx: c.hx + 0.08, hz: c.hz + 0.08, h: 0.3 }, mats.brass, false);
    } else if (c.kind === 'counter') {
      box(c, mats.wood);
      box({ ...c, hx: c.hx + 0.05, hz: c.hz + 0.05, h: 0.06 }, mats.top, false, c.h);
      // Glass screens along the top (see-through, so not cover above the counter).
      box({ ...c, hx: Math.abs(c.hx) > Math.abs(c.hz) ? c.hx : 0.02, hz: Math.abs(c.hz) > Math.abs(c.hx) ? c.hz : 0.02, h: 0.9 }, mats.glass, false, c.h + 0.06);
    } else if (c.kind === 'desk') {
      box(c, mats.wood);
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), mats.post);
      mon.position.set(c.x, Y + c.h + 0.2, c.z);
      root.add(mon);
    } else if (c.kind === 'planter') {
      box(c, mats.stone);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.min(c.hx, c.hz) * 1.3, 1), mats.green);
      bush.position.set(c.x, Y + c.h + 0.35, c.z);
      root.add(bush);
    } else if (c.kind === 'case') box(c, mats.velvet);
  }
  // ---- openers: the vault door, or the cases' glass
  const openers: HeistInteriorView['openers'] = [];
  let doorBody: RAPIER.RigidBody | null = null;
  if (plan.vaultDoor) {
    const d = plan.vaultDoor;
    const alongX = d.hx > d.hz;
    const R = Math.min(alongX ? d.hx : d.hz, d.h / 2);
    const hinge = new THREE.Group();
    // Hinge on the door's left edge, facing into the room.
    void alongX;
    const toRoom = Math.atan2(plan.centre.x - d.x, plan.centre.z - d.z);
    // Room side of the wall, hinge on the door's edge.
    const fx = Math.sin(toRoom);
    const fz = Math.cos(toRoom);
    hinge.position.set(d.x + fx * 0.12 - Math.cos(toRoom) * R, Y + R + 0.05, d.z + fz * 0.12 + Math.sin(toRoom) * R);
    // The door's face (local +z) looks into the room; it hangs off the hinge along local +x.
    hinge.rotation.y = toRoom;
    const door = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.35, 32), mats.steel);
    door.rotation.x = Math.PI / 2;
    door.position.set(R, 0, 0);
    hinge.add(door);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(R * 0.35, 0.05, 6, 20), mats.brass);
    wheel.position.set(R, 0, 0.22);
    hinge.add(wheel);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(R * 0.7, 0.06, 0.06), mats.brass);
      spoke.position.set(R, 0, 0.22);
      spoke.rotation.z = (k * Math.PI) / 3;
      hinge.add(spoke);
    }
    root.add(hinge);
    // Frame round it.
    const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.15, 8, 32), mats.vault);
    frame.position.set(d.x + fx * 0.1, Y + R + 0.05, d.z + fz * 0.1);
    frame.rotation.y = toRoom;
    root.add(frame);
    openers.push({ obj: hinge, kind: 'door', t: 0, open: false });
    doorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(d.x, Y + d.h / 2, d.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(d.hx, d.h / 2, d.hz).setCollisionGroups(WORLD_GROUPS), doorBody);
    // Gold in the strong room (shelves of it).
    const gold = S(new THREE.MeshStandardMaterial({ color: 0xd6a740, roughness: 0.3, metalness: 0.95 }), 'bareMetal');
    for (const l of plan.loot) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), gold);
      bar.position.set(l.x, Y + 1.1, l.z + 0.6);
      root.add(bar);
    }
  } else {
    for (const c of plan.cover.filter((x) => x.kind === 'case')) {
      const gems = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshStandardMaterial({ color: 0x7cf0ff, emissive: 0x2a8fb0, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.1 }));
        gem.position.set(c.x + (k - 1.5) * (c.hx > c.hz ? 0.3 : 0), Y + c.h + 0.08, c.z + (k - 1.5) * (c.hz > c.hx ? 0.3 : 0));
        gems.add(gem);
      }
      root.add(gems);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(c.hx * 2, 0.5, c.hz * 2), mats.glass);
      glass.position.set(c.x, Y + c.h + 0.25, c.z);
      root.add(glass);
      openers.push({ obj: glass, kind: 'glass', t: 0, open: false });
    }
  }
  // ---- laser gates: a post at each end and three beams
  const beams: THREE.Object3D[] = [];
  for (const l of plan.lasers) {
    const g = new THREE.Group();
    const len = Math.hypot(l.bx - l.ax, l.bz - l.az);
    for (const [x, z] of [
      [l.ax, l.az],
      [l.bx, l.bz],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.14), mats.post);
      post.position.set(x, Y + 0.9, z);
      root.add(post);
    }
    const dir = new THREE.Vector3(l.bx - l.ax, 0, l.bz - l.az).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (const h of HEIST_INTERIOR.laser.heights) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 6), mats.laser);
      beam.position.set((l.ax + l.bx) / 2, Y + h, (l.az + l.bz) / 2);
      beam.quaternion.copy(q);
      g.add(beam);
    }
    markBloom(g);
    root.add(g);
    beams.push(g);
  }
  // ---- the way out: a door in the front wall with a green EXIT sign
  const ex = plan.exit;
  const out = new THREE.Vector3(plan.street.x - ex.x, 0, plan.street.z - ex.z).normalize();
  const doorM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.08), mats.wood);
  doorM.position.set(ex.x + out.x * 0.42, Y + 1.2, ex.z + out.z * 0.42);
  doorM.rotation.y = Math.atan2(out.x, out.z);
  root.add(doorM);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.06), new THREE.MeshBasicMaterial({ color: 0x3bff6a }));
  sign.position.set(doorM.position.x - out.x * 0.05, Y + 2.7, doorM.position.z - out.z * 0.05);
  sign.rotation.y = doorM.rotation.y;
  root.add(sign);
  // Walls, cover, posts and fittings never move: one draw per material (the glass lids lift).
  mergeStaticChildren(root, new Set(openers.map((o) => o.obj)));
  return { root, beams, openers, doorBody };
}
