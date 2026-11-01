import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../config';
import { SEWER, blockCentre, key, wallRuns, type Maze, type SewerProp } from './Sewers';
import { withSurface } from '../render/Surfaces';

/**
 * Builds the sewers: floor, ceiling and merged wall boxes per maze (with colliders), a water
 * channel along each tunnel, hazards (sludge pools, steam grates, fast channels), ladders and light
 * shafts under manholes, and the manhole covers on the street. The underground part is hidden
 * while you're above ground.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface SewerView {
  /** Everything underground (toggle with the layer). */
  under: THREE.Group;
  /** Manhole covers on the street (always visible). */
  covers: THREE.Group;
  update(t: number, ventOn: (m: Maze, k: string) => boolean, focus?: { x: number; y: number; z: number }): void;
  /** A cache's lid opened (or shut again on a new game). */
  setCacheOpen(id: string, open: boolean): void;
}

/** A shaft between levels: a grated drop with a ladder (down) or the ladder's foot (up). */
export interface ShaftMark {
  x: number;
  z: number;
  floor: number;
  down: boolean;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

/**
 * Looking down an open manhole: a thin concrete lip, the shaft wall falling away into the dark
 * (concentric bands, darker as they go), the near ladder's rungs fading out, and black at the bottom.
 * Mapped onto a disc (UVs: the disc's own, centre at 0.5, 0.5).
 */
function holeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // Off-centre: the far wall shows more than the near one (we look in at an angle).
  const grad = g.createRadialGradient(64, 70, 4, 64, 64, 64);
  grad.addColorStop(0, '#000000');
  grad.addColorStop(0.55, '#050505');
  grad.addColorStop(0.78, '#1b1916');
  grad.addColorStop(0.9, '#3a3631');
  grad.addColorStop(0.95, '#6a655d');
  grad.addColorStop(1, '#4a4640');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Rungs on the near wall (towards -z, which is the top of the texture after rotateX), fading down.
  for (let k = 0; k < 4; k++) {
    const y = 14 + k * 9;
    g.fillStyle = `rgba(150, 115, 55, ${0.75 - k * 0.18})`;
    g.fillRect(48 + k * 2, y, 32 - k * 4, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mesh(parts: THREE.BufferGeometry[], mat: THREE.Material, receive = true): THREE.Mesh | null {
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = receive;
  return m;
}

/** `groundY(x, z)`: street surface height there (sidewalks and the park sit on a 0.15 m curb). */
export function buildSewers(mazes: Maze[], world: RAPIER.World, groundY: (x: number, z: number) => number = () => 0, shafts: readonly ShaftMark[] = []): SewerView {
  const under = new THREE.Group();
  under.name = 'sewers';
  under.visible = false;
  const covers = new THREE.Group();
  covers.name = 'manholes';
  const B = SEWER.block;
  let F: number = SEWER.floor;
  const H = SEWER.height;
  const collider = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9).setCollisionGroups(WORLD_GROUPS));
  };

  const wallParts: THREE.BufferGeometry[] = [];
  /** Walls by level: deeper is older brick, darker and greener (moss and damp). */
  const wallByLevel = new Map<number, THREE.BufferGeometry[]>();
  // Sewer detail (see sewerDetail): vaulted haunches, pipes, damp streaks, moss, caged lamps.
  const haunchParts: THREE.BufferGeometry[] = [];
  const pipeParts: THREE.BufferGeometry[] = [];
  const bracketParts: THREE.BufferGeometry[] = [];
  const streakParts: THREE.BufferGeometry[] = [];
  const mossParts: THREE.BufferGeometry[] = [];
  const lampParts: THREE.BufferGeometry[] = [];
  const lampGlowParts: THREE.BufferGeometry[] = [];
  const curbParts: THREE.BufferGeometry[] = [];
  const dripPoints: Array<{ x: number; z: number; top: number; floor: number }> = [];
  const floorParts: THREE.BufferGeometry[] = [];
  const ceilParts: THREE.BufferGeometry[] = [];
  const waterParts: THREE.BufferGeometry[] = [];
  const sludgeParts: THREE.BufferGeometry[] = [];
  const slimePuddles: THREE.BufferGeometry[] = [];
  const grateParts: THREE.BufferGeometry[] = [];
  const channelParts: THREE.BufferGeometry[] = [];
  const ladderParts: THREE.BufferGeometry[] = [];
  const shaftParts: THREE.BufferGeometry[] = [];
  const shaftHoles: THREE.BufferGeometry[] = [];
  const coverParts: THREE.BufferGeometry[] = [];
  const rimParts: THREE.BufferGeometry[] = [];
  const holeParts: THREE.BufferGeometry[] = [];
  const ladderTopParts: THREE.BufferGeometry[] = [];
  const paintParts: THREE.BufferGeometry[] = [];
  const vents: Array<{ m: Maze; k: string; mesh: THREE.Mesh }> = [];
  // Props, merged per material.
  const P: Record<string, THREE.BufferGeometry[]> = { drumBlue: [], drumRust: [], drumRim: [], fire: [], wood: [], woodDark: [], pipe: [], tyre: [], cloth: [] };
  const fires: Array<{ x: number; z: number; y: number }> = [];
  const poolWater: THREE.BufferGeometry[] = [];
  const poolSludge: THREE.BufferGeometry[] = [];
  const poolBed: THREE.BufferGeometry[] = [];
  const cacheBoxes: Array<{ id: string; lid: THREE.Mesh; glow: THREE.Mesh }> = [];
  const place = (g: THREE.BufferGeometry, p: SewerProp, dx = 0, dy = 0, dz = 0): THREE.BufferGeometry => {
    g.translate(dx, dy, dz);
    g.rotateY(p.rot);
    g.translate(p.x, F, p.z);
    return g.toNonIndexed();
  };
  const addProp = (p: SewerProp, idx: number): void => {
    switch (p.kind) {
      case 'barrel': {
        const mat = idx % 3 === 0 ? P.drumRust : P.drumBlue;
        mat.push(place(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 12), p, 0, 0.475, 0));
        for (const y of [0.25, 0.7]) P.drumRim.push(place(new THREE.TorusGeometry(0.335, 0.025, 4, 14).rotateX(Math.PI / 2), p, 0, y, 0));
        collider(0.33, 0.48, 0.33, p.x, F + 0.48, p.z);
        break;
      }
      case 'drumFire': {
        P.drumRust.push(place(new THREE.CylinderGeometry(0.36, 0.36, 0.9, 12, 1, true), p, 0, 0.45, 0));
        P.fire.push(place(new THREE.ConeGeometry(0.3, 0.55, 8), p, 0, 1.15, 0));
        P.fire.push(place(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), p, 0, 0.86, 0));
        fires.push({ x: p.x, z: p.z, y: F });
        collider(0.36, 0.45, 0.36, p.x, F + 0.45, p.z);
        break;
      }
      case 'crate':
        P.wood.push(place(new THREE.BoxGeometry(0.9, 0.8, 0.9), p, 0, 0.4, 0));
        P.woodDark.push(place(new THREE.BoxGeometry(0.92, 0.08, 0.92), p, 0, 0.42, 0));
        collider(0.45, 0.4, 0.45, p.x, F + 0.4, p.z);
        break;
      case 'crateStack':
        P.wood.push(place(new THREE.BoxGeometry(0.9, 0.8, 0.9), p, -0.25, 0.4, 0));
        P.wood.push(place(new THREE.BoxGeometry(0.8, 0.7, 0.8), p, 0.35, 0.35, 0.2));
        P.wood.push(place(new THREE.BoxGeometry(0.7, 0.6, 0.7), p, -0.15, 1.1, 0.05));
        collider(0.6, 0.7, 0.6, p.x, F + 0.7, p.z);
        break;
      case 'pallet':
        for (const o of [-0.4, 0, 0.4]) P.woodDark.push(place(new THREE.BoxGeometry(1.2, 0.05, 0.25), p, 0, 0.12, o));
        for (const o of [-0.5, 0, 0.5]) P.woodDark.push(place(new THREE.BoxGeometry(0.1, 0.1, 1.0), p, o, 0.05, 0));
        break;
      case 'pipes':
        for (const [y, zz, r] of [
          [0.25, -0.15, 0.2],
          [0.25, 0.25, 0.16],
          [0.62, 0.05, 0.18],
        ] as Array<[number, number, number]>)
          P.pipe.push(place(new THREE.CylinderGeometry(r, r, 2.6, 10).rotateZ(Math.PI / 2), p, 0, y, zz));
        {
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          // Long axis along local x, rotated by rot (three.js Y rotation: x' = x cos + z sin, z' = -x sin + z cos).
          const hx = Math.abs(1.3 * c) + Math.abs(0.4 * sn);
          const hz = Math.abs(1.3 * sn) + Math.abs(0.4 * c);
          collider(hx, 0.4, hz, p.x, F + 0.4, p.z);
        }
        break;
      case 'tires':
        for (let k = 0; k < 3; k++) P.tyre.push(place(new THREE.TorusGeometry(0.33, 0.14, 8, 14).rotateX(Math.PI / 2), p, k === 2 ? 0.05 : 0, 0.14 + k * 0.27, 0));
        collider(0.47, 0.42, 0.47, p.x, F + 0.42, p.z);
        break;
      case 'bedroll':
        P.cloth.push(place(new THREE.BoxGeometry(0.75, 0.12, 1.9), p, 0, 0.06, 0));
        P.cloth.push(place(new THREE.CylinderGeometry(0.16, 0.16, 0.75, 8).rotateZ(Math.PI / 2), p, 0, 0.16, -0.8));
        break;
    }
  };

  for (const m of mazes) {
    F = m.floor ?? SEWER.floor;
    const W = m.size * B;
    const cx = m.x0 + W / 2;
    const cz = m.z0 + W / 2;
    // Floor: a thick slab in runs along x, broken where a pool sinks into it (the slab's sides are
    // the pool's walls); each pool block gets its own bed, deeper, and a surface.
    const DEEP = 3.6;
    for (let j = 0; j < m.size; j++) {
      let i = 0;
      while (i < m.size) {
        if (m.pools.has(key(i, j))) {
          i++;
          continue;
        }
        const s0 = i;
        while (i < m.size && !m.pools.has(key(i, j))) i++;
        const len = (i - s0) * B;
        const x = m.x0 + s0 * B + len / 2;
        const z = m.z0 + (j + 0.5) * B;
        floorParts.push(box(len, DEEP, B, x, F - DEEP / 2, z));
        collider(len / 2, DEEP / 2, B / 2, x, F - DEEP / 2, z);
      }
    }
    for (const [k, pool] of m.pools) {
      const [i, j] = k.split(',').map(Number);
      const c = blockCentre(m, i, j);
      const bedTop = F - SEWER.poolDrop - pool.depth;
      poolBed.push(box(B, 1, B, c.x, bedTop - 0.5, c.z));
      collider(B / 2, 0.5, B / 2, c.x, bedTop - 0.5, c.z);
      (pool.toxic ? poolSludge : poolWater).push(box(B, 0.02, B, c.x, F - SEWER.poolDrop, c.z));
    }
    // Caches: steel lockboxes with a lit stripe until they're opened.
    for (const cc of m.caches) {
      const g = new THREE.Group();
      g.position.set(cc.x, F, cc.z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), withSurface(new THREE.MeshStandardMaterial({ color: cc.tier >= 3 ? 0x6a4f9a : cc.tier === 2 ? 0x2f6f8a : 0x5a5f4a, metalness: 0.6, roughness: 0.45 }), 'paintedMetal'));
      body.position.y = 0.3;
      g.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.12, 0.74), withSurface(new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.7, roughness: 0.4 }), 'bareMetal'));
      lid.position.set(0, 0.66, 0);
      g.add(lid);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.72), new THREE.MeshBasicMaterial({ color: cc.tier >= 3 ? 0xd27aff : cc.tier === 2 ? 0x5ad1ff : 0xffd23f }));
      glow.position.y = 0.48;
      g.add(glow);
      under.add(g);
      collider(0.5, 0.35, 0.35, cc.x, F + 0.35, cc.z);
      cacheBoxes.push({ id: cc.id, lid, glow });
    }
    ceilParts.push(box(W, 1, W, cx, F + H + 0.5, cz));
    collider(W / 2, 0.5, W / 2, cx, F + H + 0.5, cz);
    // Walls: merged runs of solid blocks along x.
    for (const [i0, i1, j] of wallRuns(m.open)) {
      const len = (i1 - i0 + 1) * B;
      const x = m.x0 + i0 * B + len / 2;
      const z = m.z0 + (j + 0.5) * B;
      const lv = m.level ?? 1;
      if (!wallByLevel.has(lv)) wallByLevel.set(lv, []);
      wallByLevel.get(lv)!.push(box(len, H, B, x, F + H / 2, z));
      collider(len / 2, H / 2, B / 2, x, F + H / 2, z);
    }
    // A shallow water channel down one side of every tunnel block (visual only).
    for (let i = 0; i < m.size; i++)
      for (let j = 0; j < m.size; j++) {
        if (!m.open[i][j]) continue;
        const c = blockCentre(m, i, j);
        const h = m.hazards.get(key(i, j));
        if (m.pools.has(key(i, j))) {
          // Water (or sludge): drawn with the pools.
        } else if (h?.kind === 'sludge') {
          sludgeParts.push(box(B * 0.9, 0.06, B * 0.9, c.x, F + 0.03, c.z));
        } else if (h?.kind === 'vent') {
          grateParts.push(box(B * 0.6, 0.05, B * 0.6, c.x, F + 0.03, c.z));
          const g = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.25, B * 0.4, H, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xdfe8e4, transparent: true, opacity: 0.0, depthWrite: false }));
          g.position.set(c.x, F + H / 2, c.z);
          under.add(g);
          vents.push({ m, k: key(i, j), mesh: g });
        } else if (h?.kind === 'channel') {
          channelParts.push(box(B * 0.95, 0.04, B * 0.95, c.x, F + 0.02, c.z));
        } else {
          waterParts.push(box(B * 0.28, 0.02, B, c.x + B * 0.33, F + 0.01, c.z));
          // Here and there a puddle of slime on the floor (one block in seven or so): a blob of
          // a few overlapping discs. Just the look; the hazard pools are the sludge blocks.
          const hsh = Math.abs(Math.sin(c.x * 12.9898 + c.z * 78.233 + (m.level ?? 1) * 3.1) * 43758.5453) % 1;
          if (hsh < 0.15) {
            const n = 2 + Math.floor(hsh * 20) % 3;
            for (let k = 0; k < n; k++) {
              const a = hsh * 40 + k * 2.1;
              const r = B * (0.14 + 0.1 * ((hsh * 7 + k * 0.37) % 1));
              const g = new THREE.CircleGeometry(r, 14);
              g.rotateX(-Math.PI / 2);
              g.translate(c.x - B * 0.12 + Math.cos(a) * B * 0.13, F + 0.012 + k * 0.002, c.z + Math.sin(a) * B * 0.18);
              slimePuddles.push(g);
            }
          }
        }
      }
    sewerDetail(m, F, H, { haunchParts, pipeParts, bracketParts, streakParts, mossParts, lampParts, lampGlowParts, curbParts, dripPoints });
    m.props.forEach((p, k) => addProp(p, k));
    // Manholes: ladder and light shaft below, cover on the street.
    for (const mh of m.manholes) {
      const c = blockCentre(m, mh.i, mh.j);
      for (let y = F + 0.4; y < F + H; y += 0.4) ladderParts.push(box(0.6, 0.05, 0.05, c.x, y, c.z - B * 0.45));
      ladderParts.push(box(0.05, H, 0.05, c.x - 0.3, F + H / 2, c.z - B * 0.45), box(0.05, H, 0.05, c.x + 0.3, F + H / 2, c.z - B * 0.45));
      const shaft = new THREE.CylinderGeometry(0.45, 1.1, H, 10, 1, true);
      shaft.translate(c.x, F + H / 2, c.z);
      shaftParts.push(shaft.toNonIndexed());
      // On the street: a semi-open manhole. The steel rim round a dark hole you can see down into
      // (a short well and the top of the ladder poking up), the cover slid half off to one side and
      // tipped up on the rim, and a painted yellow ring so it reads from down the block.
      const gy = groundY(mh.x, mh.z);
      const rim = new THREE.TorusGeometry(0.6, 0.06, 4, 20);
      rim.rotateX(Math.PI / 2);
      rim.translate(mh.x, gy + 0.04, mh.z);
      rimParts.push(rim.toNonIndexed());
      // The road is solid, so the depth is painted: a disc whose texture falls from the lit
      // concrete lip into black, with the ladder's rungs fading down it.
      const hole = new THREE.CircleGeometry(0.56, 24);
      hole.rotateX(-Math.PI / 2);
      hole.translate(mh.x, gy + 0.008, mh.z);
      holeParts.push(hole);
      // Ladder rails curling up over the lip on the far side from the cover (to grab on the way down).
      for (const sx of [-0.2, 0.2]) {
        const rail = new THREE.BoxGeometry(0.05, 0.42, 0.05);
        rail.translate(mh.x + sx, gy + 0.21, mh.z - 0.5);
        ladderTopParts.push(rail.toNonIndexed());
        const hook = new THREE.BoxGeometry(0.05, 0.05, 0.16);
        hook.translate(mh.x + sx, gy + 0.42, mh.z - 0.44);
        ladderTopParts.push(hook.toNonIndexed());
      }
      // The cover: slid 0.75 m aside (+x), one edge resting on the rim, tipped up a little.
      const cov = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18);
      cov.rotateZ(0.09);
      cov.translate(mh.x + 0.78, gy + 0.08, mh.z + 0.1);
      coverParts.push(cov.toNonIndexed());
      for (const rot of [0, Math.PI / 2]) {
        const bar = new THREE.BoxGeometry(0.8, 0.015, 0.04);
        bar.rotateY(rot + Math.PI / 4);
        bar.rotateZ(0.09);
        bar.translate(mh.x + 0.78, gy + 0.125, mh.z + 0.1);
        rimParts.push(bar.toNonIndexed());
      }
      const paint = new THREE.RingGeometry(0.8, 0.92, 24);
      paint.rotateX(-Math.PI / 2);
      paint.translate(mh.x, gy + 0.012, mh.z);
      paintParts.push(paint.toNonIndexed());
    }
  }

  const add = (m: THREE.Mesh | null, g: THREE.Group = under): void => {
    if (m) g.add(m);
  };
  // Shafts between levels: a grated hole with a ladder going down, or the ladder's foot below.
  for (const sh of shafts) {
    if (sh.down) {
      grateParts.push(box(1.6, 0.05, 0.12, sh.x, sh.floor + 0.04, sh.z - 0.75), box(1.6, 0.05, 0.12, sh.x, sh.floor + 0.04, sh.z + 0.75));
      grateParts.push(box(0.12, 0.05, 1.6, sh.x - 0.75, sh.floor + 0.04, sh.z), box(0.12, 0.05, 1.6, sh.x + 0.75, sh.floor + 0.04, sh.z));
      const hole = new THREE.CircleGeometry(0.7, 20);
      hole.rotateX(-Math.PI / 2);
      hole.translate(sh.x, sh.floor + 0.02, sh.z);
      shaftHoles.push(hole);
      for (const sx of [-0.25, 0.25]) ladderParts.push(box(0.05, 0.6, 0.05, sh.x + sx, sh.floor + 0.3, sh.z - 0.55));
    } else {
      for (let y = sh.floor + 0.4; y < sh.floor + SEWER.height; y += 0.4) ladderParts.push(box(0.6, 0.05, 0.05, sh.x, y, sh.z - 0.9));
      ladderParts.push(box(0.05, SEWER.height, 0.05, sh.x - 0.3, sh.floor + SEWER.height / 2, sh.z - 0.9), box(0.05, SEWER.height, 0.05, sh.x + 0.3, sh.floor + SEWER.height / 2, sh.z - 0.9));
    }
  }
  add(mesh(shaftHoles, new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }), false));
  add(mesh(poolBed, withSurface(new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.9 }), 'concrete')));
  const poolWaterMat = new THREE.MeshStandardMaterial({ color: 0x16313a, emissive: 0x0a2a33, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.78 });
  const poolSludgeMat = new THREE.MeshStandardMaterial({ color: 0x2b4410, emissive: 0x16300a, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.94 });
  add(mesh(poolWater, poolWaterMat));
  add(mesh(poolSludge, poolSludgeMat));
  add(mesh(wallParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x4b4136, roughness: 0.95 }), 'brick')));
  const levelTint: Record<number, number> = { 1: 0x5a4a3a, 2: 0x47443a, 3: 0x3a4236 };
  for (const [lv, parts] of wallByLevel) add(mesh(parts, withSurface(new THREE.MeshStandardMaterial({ color: levelTint[lv] ?? 0x4b4136, roughness: 0.92 }), 'brick')));
  add(mesh(haunchParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x4a4034, roughness: 0.95, side: THREE.DoubleSide }), 'brick')));
  add(mesh(pipeParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x5b5146, roughness: 0.6, metalness: 0.55 }), 'rust')));
  add(mesh(bracketParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: 0.7, metalness: 0.6 }), 'rust')));
  add(mesh(streakParts, new THREE.MeshBasicMaterial({ color: 0x0b0d08, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), false));
  add(mesh(mossParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x2f3f1c, roughness: 1 }), 'concrete')));
  add(mesh(curbParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.9 }), 'concrete')));
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc870, emissiveIntensity: 1.6 });
  add(mesh(lampParts, lampMat, false));
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  add(mesh(lampGlowParts, lampGlowMat, false));
  // Drips: water falling from the vault in the halls round you.
  const DRIPS = 24;
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: 0x9fc8d0, transparent: true, opacity: 0.7 }), DRIPS);
  drips.frustumCulled = false;
  under.add(drips);
  const dripState = Array.from({ length: DRIPS }, (_, i) => ({ p: dripPoints[(i * 7919) % Math.max(1, dripPoints.length)], y: 0, v: 0, wait: i * 0.13 }));
  const dm = new THREE.Matrix4();
  add(mesh(floorParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x2c2f2a, roughness: 0.6, metalness: 0.1 }), 'concrete')));
  add(mesh(ceilParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 1, side: THREE.DoubleSide }), 'concrete')));
  add(mesh(waterParts, new THREE.MeshStandardMaterial({ color: 0x1d3a35, roughness: 0.1, metalness: 0.3 })));
  // Sludge: a deep, murky green (it used to glow lime).
  add(mesh(sludgeParts, new THREE.MeshStandardMaterial({ color: 0x2b4410, emissive: 0x16300a, emissiveIntensity: 0.5, roughness: 0.22, metalness: 0.1 })));
  add(mesh(slimePuddles, new THREE.MeshStandardMaterial({ color: 0x24390e, emissive: 0x112606, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false));
  add(mesh(grateParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x5a5d60, metalness: 0.7, roughness: 0.5 }), 'rust')));
  const chanMat = new THREE.MeshStandardMaterial({ color: 0x2a6f7a, emissive: 0x0f3f48, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.4 });
  add(mesh(channelParts, chanMat));
  add(mesh(ladderParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.6, roughness: 0.5 }), 'rust')));
  add(mesh(shaftParts, new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }), false));
  add(mesh(P.drumBlue, withSurface(new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.55, metalness: 0.4 }), 'paintedMetal')));
  add(mesh(P.drumRust, withSurface(new THREE.MeshStandardMaterial({ color: 0x7a3d1e, roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide }), 'rust')));
  add(mesh(P.drumRim, withSurface(new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.7 }), 'bareMetal')));
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff6a10, emissiveIntensity: 2.2, roughness: 1 });
  add(mesh(P.fire, fireMat, false));
  add(mesh(P.wood, withSurface(new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), 'wood')));
  add(mesh(P.woodDark, withSurface(new THREE.MeshStandardMaterial({ color: 0x5e4528, roughness: 0.95 }), 'wood')));
  add(mesh(P.pipe, withSurface(new THREE.MeshStandardMaterial({ color: 0x6b7378, roughness: 0.45, metalness: 0.75 }), 'bareMetal')));
  add(mesh(P.tyre, withSurface(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.95 }), 'rubber')));
  add(mesh(P.cloth, withSurface(new THREE.MeshStandardMaterial({ color: 0x5a4f7a, roughness: 1 }), 'fabric')));
  // Camp fires: a warm glow on the floor and walls round each one (no real lights: cheap).
  const glowParts: THREE.BufferGeometry[] = [];
  for (const f of fires) {
    const g = new THREE.CircleGeometry(4.2, 24);
    g.rotateX(-Math.PI / 2);
    g.translate(f.x, f.y + 0.03, f.z);
    glowParts.push(g.toNonIndexed());
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  add(mesh(glowParts, glowMat, false));
  const coverMesh = mesh(coverParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x35383b, metalness: 0.6, roughness: 0.6 }), 'paintedMetal'));
  if (coverMesh) covers.add(coverMesh);
  const rimMesh = mesh(rimParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.8, roughness: 0.35 }), 'bareMetal'));
  if (rimMesh) covers.add(rimMesh);
  // The dark hole (unlit, with the painted depth).
  const holeMesh = mesh(holeParts, new THREE.MeshBasicMaterial({ map: holeTexture(), polygonOffset: true, polygonOffsetFactor: -2 }), false);
  if (holeMesh) covers.add(holeMesh);
  const ladderTop = mesh(ladderTopParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.6, roughness: 0.5 }), 'rust'), false);
  if (ladderTop) covers.add(ladderTop);
  const paintMesh = mesh(paintParts, new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), true);
  if (paintMesh) covers.add(paintMesh);

  let lastT = 0;
  return {
    under,
    covers,
    update(t: number, ventOn: (m: Maze, k: string) => boolean, focus?: { x: number; y: number; z: number }): void {
      if (!under.visible) return;
      chanMat.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 5);
      poolWaterMat.emissiveIntensity = 0.5 + 0.15 * Math.sin(t * 1.7);
      poolSludgeMat.emissiveIntensity = 0.42 + 0.12 * Math.sin(t * 2.3);
      fireMat.emissiveIntensity = 2 + 0.5 * Math.sin(t * 13) + 0.3 * Math.sin(t * 7.3);
      lampMat.emissiveIntensity = 1.5 + (Math.sin(t * 37) > 0.97 ? -0.9 : 0) + 0.1 * Math.sin(t * 3);
      lampGlowMat.opacity = 0.1 + 0.02 * Math.sin(t * 2.1);
      // Drips near you: each falls from the vault to the floor, waits, then picks a new spot nearby.
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      for (let i = 0; i < dripState.length; i++) {
        const d = dripState[i];
        if (!d.p) continue;
        if (d.wait > 0) {
          d.wait -= dt;
          if (d.wait <= 0) {
            const near = focus ? dripPoints.filter((q) => Math.abs(q.x - focus.x) < 18 && Math.abs(q.z - focus.z) < 18 && Math.abs(q.floor - focus.y) < 6) : dripPoints;
            d.p = near.length ? near[(i * 131 + Math.floor(t * 17)) % near.length] : d.p;
            d.y = d.p.top;
            d.v = 0;
          }
          dm.makeScale(0, 0, 0);
        } else {
          d.v -= 9.8 * dt;
          d.y += d.v * dt;
          if (d.y <= d.p.floor) d.wait = 0.4 + ((i * 37) % 10) * 0.15;
          dm.makeTranslation(d.p.x, d.y, d.p.z);
        }
        drips.setMatrixAt(i, dm);
      }
      drips.instanceMatrix.needsUpdate = true;
      glowMat.opacity = 0.14 + 0.03 * Math.sin(t * 11);
      for (const v of vents) {
        const mat = v.mesh.material as THREE.MeshBasicMaterial;
        const target = ventOn(v.m, v.k) ? 0.35 : 0;
        mat.opacity += (target - mat.opacity) * 0.2;
      }
    },
    setCacheOpen(id, open) {
      const c = cacheBoxes.find((b) => b.id === id);
      if (!c) return;
      c.lid.position.set(open ? -0.35 : 0, open ? 0.85 : 0.66, 0);
      c.lid.rotation.z = open ? 1.1 : 0;
      c.glow.visible = !open;
    },
  };
}

/** Integer hash for stable per-wall choices. */
function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a * 374761393 + b * 668265263 + c * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let filletProto: THREE.BufferGeometry | null = null;
/** A solid quarter-round fillet (the vault's haunch): corner at the origin, curving down and in (-x, -y), length 1 along z. */
function fillet(r: number): THREE.BufferGeometry {
  if (!filletProto) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(-1, 0);
    // The arc from the ceiling (-1, 0) to the wall (0, -1), centre (-1, -1): concave, like a vault.
    sh.absarc(-1, -1, 1, Math.PI / 2, 0, true);
    sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    filletProto = g.toNonIndexed();
    filletProto.deleteAttribute('uv');
    const n = filletProto.getAttribute('position').count;
    const uv = new Float32Array(n * 2);
    const pos = filletProto.getAttribute('position');
    for (let i = 0; i < n; i++) {
      uv[i * 2] = pos.getZ(i);
      uv[i * 2 + 1] = pos.getX(i) + pos.getY(i);
    }
    filletProto.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return filletProto.clone().scale(r, r, 1);
}

/**
 * What makes a box tunnel read as a sewer: the vault's curved haunches where walls meet the ceiling,
 * pipe runs on brackets along some walls (continuous down a corridor), dark damp streaks under the
 * vault, a band of moss at the floor (more of it the deeper you go), a kerb along the water channel,
 * caged lamps here and there, and the spots water drips from.
 */
function sewerDetail(
  m: Maze,
  F: number,
  H: number,
  o: {
    haunchParts: THREE.BufferGeometry[];
    pipeParts: THREE.BufferGeometry[];
    bracketParts: THREE.BufferGeometry[];
    streakParts: THREE.BufferGeometry[];
    mossParts: THREE.BufferGeometry[];
    lampParts: THREE.BufferGeometry[];
    lampGlowParts: THREE.BufferGeometry[];
    curbParts: THREE.BufferGeometry[];
    dripPoints: Array<{ x: number; z: number; top: number; floor: number }>;
  },
): void {
  const B = SEWER.block;
  const R = 0.85;
  const lv = m.level ?? 1;
  const open = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < m.size && j < m.size && !!m.open[i][j];
  // Directions: +x, -x, +z, -z, with the rotation that turns the fillet's +x corner to face that wall.
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0],
    [-1, 0, Math.PI],
    [0, 1, -Math.PI / 2],
    [0, -1, Math.PI / 2],
  ];
  for (let i = 0; i < m.size; i++)
    for (let j = 0; j < m.size; j++) {
      if (!open(i, j)) continue;
      const c = blockCentre(m, i, j);
      for (const [di, dj, rot] of dirs) {
        if (open(i + di, j + dj)) continue;
        // The wall face and the edge's middle.
        const wx = c.x + (di * B) / 2;
        const wz = c.z + (dj * B) / 2;
        const f = fillet(R);
        f.translate(0, 0, -0.5);
        f.rotateY(rot);
        f.translate(wx, F + H, wz);
        o.haunchParts.push(f);
        // Along-the-wall axis and inward normal.
        const ax = dj !== 0 ? 1 : 0;
        const az = di !== 0 ? 1 : 0;
        const inx = -di;
        const inz = -dj;
        // Pipes: decided per wall line, so a run carries on down the corridor.
        const line = di !== 0 ? hash(i * 2 + (di > 0 ? 1 : 0), 17, lv) : hash(j * 2 + (dj > 0 ? 1 : 0), 29, lv);
        if (line < 0.45) {
          const runs = line < 0.18 ? [1.95, 2.35] : [2.15];
          for (const [k, y] of runs.entries()) {
            const r = k === 0 && runs.length > 1 ? 0.14 : 0.09;
            const g = new THREE.CylinderGeometry(r, r, B, 10, 1, true);
            if (ax) g.rotateZ(Math.PI / 2);
            else g.rotateX(Math.PI / 2);
            g.translate(wx + inx * (r + 0.06), F + y, wz + inz * (r + 0.06));
            o.pipeParts.push(g.toNonIndexed());
          }
          o.bracketParts.push(box(ax ? 0.06 : 0.3, 0.08, az ? 0.06 : 0.3, wx + inx * 0.15, F + runs[0] - 0.18, wz + inz * 0.15));
        }
        const h = hash(i, j, (di + 2) * 3 + dj + lv * 11);
        // Damp streaks running down from the vault.
        if (h < 0.55) {
          const len = 1.2 + h * 2.2;
          const w = 0.25 + ((h * 97) % 1) * 0.5;
          const along = (((h * 53) % 1) - 0.5) * (B - w);
          const pl = new THREE.PlaneGeometry(w, len);
          pl.rotateY(Math.atan2(inx, inz));
          pl.translate(wx + inx * 0.012 + ax * along, F + H - R * 0.6 - len / 2, wz + inz * 0.012 + az * along);
          o.streakParts.push(pl.toNonIndexed());
          o.dripPoints.push({ x: wx + inx * 0.35 + ax * along, z: wz + inz * 0.35 + az * along, top: F + H - R * 0.3, floor: F + 0.02 });
        }
        // Moss and slime at the foot of the wall.
        if (h > 1 - (0.25 + lv * 0.15)) o.mossParts.push(box(ax ? B : 0.05, 0.12 + lv * 0.06, az ? B : 0.05, wx + inx * 0.03, F + 0.06 + lv * 0.03, wz + inz * 0.03));
      }
      // The water channel's kerb (the channel runs at +0.33 B along z).
      if (!m.pools.has(key(i, j))) o.curbParts.push(box(0.1, 0.1, B, c.x + B * 0.17, F + 0.05, c.z));
      // A caged lamp on the vault now and then.
      if (hash(i, j, 99 + lv) < 0.12) {
        o.lampParts.push(box(0.22, 0.12, 0.22, c.x, F + H - 0.08, c.z));
        const bulb = new THREE.SphereGeometry(0.1, 8, 6);
        bulb.translate(c.x, F + H - 0.24, c.z);
        o.lampParts.push(bulb.toNonIndexed());
        const glow = new THREE.CircleGeometry(2.4, 18);
        glow.rotateX(-Math.PI / 2);
        glow.translate(c.x, F + 0.04, c.z);
        o.lampGlowParts.push(glow.toNonIndexed());
      }
    }
}
