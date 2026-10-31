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
  update(t: number, ventOn: (m: Maze, k: string) => boolean): void;
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
export function buildSewers(mazes: Maze[], world: RAPIER.World, groundY: (x: number, z: number) => number = () => 0): SewerView {
  const under = new THREE.Group();
  under.name = 'sewers';
  under.visible = false;
  const covers = new THREE.Group();
  covers.name = 'manholes';
  const B = SEWER.block;
  const F = SEWER.floor;
  const H = SEWER.height;
  const collider = (hx: number, hy: number, hz: number, x: number, y: number, z: number): void => {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9).setCollisionGroups(WORLD_GROUPS));
  };

  const wallParts: THREE.BufferGeometry[] = [];
  const floorParts: THREE.BufferGeometry[] = [];
  const ceilParts: THREE.BufferGeometry[] = [];
  const waterParts: THREE.BufferGeometry[] = [];
  const sludgeParts: THREE.BufferGeometry[] = [];
  const grateParts: THREE.BufferGeometry[] = [];
  const channelParts: THREE.BufferGeometry[] = [];
  const ladderParts: THREE.BufferGeometry[] = [];
  const shaftParts: THREE.BufferGeometry[] = [];
  const coverParts: THREE.BufferGeometry[] = [];
  const rimParts: THREE.BufferGeometry[] = [];
  const holeParts: THREE.BufferGeometry[] = [];
  const ladderTopParts: THREE.BufferGeometry[] = [];
  const paintParts: THREE.BufferGeometry[] = [];
  const vents: Array<{ m: Maze; k: string; mesh: THREE.Mesh }> = [];
  // Props, merged per material.
  const P: Record<string, THREE.BufferGeometry[]> = { drumBlue: [], drumRust: [], drumRim: [], fire: [], wood: [], woodDark: [], pipe: [], tyre: [], cloth: [] };
  const fires: Array<{ x: number; z: number }> = [];
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
        fires.push({ x: p.x, z: p.z });
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
    const W = m.size * B;
    const cx = m.x0 + W / 2;
    const cz = m.z0 + W / 2;
    // Floor and ceiling slabs over the whole maze.
    floorParts.push(box(W, 1, W, cx, F - 0.5, cz));
    collider(W / 2, 0.5, W / 2, cx, F - 0.5, cz);
    ceilParts.push(box(W, 1, W, cx, F + H + 0.5, cz));
    collider(W / 2, 0.5, W / 2, cx, F + H + 0.5, cz);
    // Walls: merged runs of solid blocks along x.
    for (const [i0, i1, j] of wallRuns(m.open)) {
      const len = (i1 - i0 + 1) * B;
      const x = m.x0 + i0 * B + len / 2;
      const z = m.z0 + (j + 0.5) * B;
      wallParts.push(box(len, H, B, x, F + H / 2, z));
      collider(len / 2, H / 2, B / 2, x, F + H / 2, z);
    }
    // A shallow water channel down one side of every tunnel block (visual only).
    for (let i = 0; i < m.size; i++)
      for (let j = 0; j < m.size; j++) {
        if (!m.open[i][j]) continue;
        const c = blockCentre(m, i, j);
        const h = m.hazards.get(key(i, j));
        if (h?.kind === 'sludge') {
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
        }
      }
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
  add(mesh(wallParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x4b4136, roughness: 0.95 }), 'brick')));
  add(mesh(floorParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x2c2f2a, roughness: 0.6, metalness: 0.1 }), 'concrete')));
  add(mesh(ceilParts, withSurface(new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 1, side: THREE.DoubleSide }), 'concrete')));
  add(mesh(waterParts, new THREE.MeshStandardMaterial({ color: 0x1d3a35, roughness: 0.1, metalness: 0.3 })));
  add(mesh(sludgeParts, new THREE.MeshStandardMaterial({ color: 0x6f9a2a, emissive: 0x4a7a10, emissiveIntensity: 0.9, roughness: 0.3 })));
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
    g.translate(f.x, F + 0.03, f.z);
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

  return {
    under,
    covers,
    update(t: number, ventOn: (m: Maze, k: string) => boolean): void {
      if (!under.visible) return;
      chanMat.emissiveIntensity = 0.6 + 0.3 * Math.sin(t * 5);
      fireMat.emissiveIntensity = 2 + 0.5 * Math.sin(t * 13) + 0.3 * Math.sin(t * 7.3);
      glowMat.opacity = 0.14 + 0.03 * Math.sin(t * 11);
      for (const v of vents) {
        const mat = v.mesh.material as THREE.MeshBasicMaterial;
        const target = ventOn(v.m, v.k) ? 0.35 : 0;
        mat.opacity += (target - mat.opacity) * 0.2;
      }
    },
  };
}
