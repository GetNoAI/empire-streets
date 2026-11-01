import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { withSurface } from '../render/Surfaces';
import type { Rect } from './CityLayout';
import { POND, depthUV, waveY } from './Pond';

/**
 * The pond you can see and fall into: a bowl-shaped bed (a Rapier heightfield and a mesh from the
 * same depth function, Pond.ts), a stone rim low enough to step over, and a moving water surface:
 * gentle waves in the vertex shader (the same sum `waveY` gives the things floating on it), a
 * scrolling ripple normal map, sky reflections from the scene environment, and see-through enough
 * to make out the shelf near the rim. Ripple rings spread from anything that splashes or swims;
 * lily pads ride the waves along the edges.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);
const GRID = 40;

export interface PondView {
  root: THREE.Group;
  /** Every frame: waves, ripples, the pads. `t` is seconds. */
  update(t: number, dt: number): void;
  /** A ring of ripples spreading from a point (`size` ~ 1 for a stroke, 3 for a belly flop, 6 for a car). */
  ripple(x: number, z: number, size?: number): void;
}

export function buildPond(lake: Rect, world: RAPIER.World): PondView {
  const root = new THREE.Group();
  root.name = 'pond';
  const w = lake.x1 - lake.x0;
  const d = lake.z1 - lake.z0;
  const cx = (lake.x0 + lake.x1) / 2;
  const cz = (lake.z0 + lake.z1) / 2;

  // ---- the bed: a heightfield (physics) and the same grid as a mesh
  const heights = new Float32Array((GRID + 1) * (GRID + 1));
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) heights[i + j * (GRID + 1)] = POND.surface - depthUV(i / GRID, j / GRID);
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(GRID, GRID, heights, { x: w, y: 1, z: d })
      .setTranslation(cx, 0, cz)
      .setFriction(0.8)
      .setCollisionGroups(WORLD_GROUPS),
  );
  // A safety floor under the bowl (nothing ever slips through a seam into the river kill zone).
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(w / 2, 0.3, d / 2)
      .setTranslation(cx, POND.surface - POND.maxDepth - 0.6, cz)
      .setCollisionGroups(WORLD_GROUPS),
  );
  const bedGeo = new THREE.PlaneGeometry(w, d, GRID, GRID);
  bedGeo.rotateX(-Math.PI / 2);
  const bp = bedGeo.attributes.position as THREE.BufferAttribute;
  const bedCol: number[] = [];
  const mud = new THREE.Color(0x3b3a2a);
  const silt = new THREE.Color(0x6b6a4e);
  const tmpC = new THREE.Color();
  for (let i = 0; i < bp.count; i++) {
    const u = (bp.getX(i) + w / 2) / w;
    const v = (bp.getZ(i) + d / 2) / d;
    const depth = depthUV(u, v);
    bp.setY(i, POND.surface - depth);
    tmpC.copy(silt).lerp(mud, Math.min(1, (depth - POND.edgeDepth) / (POND.maxDepth - POND.edgeDepth)));
    bedCol.push(tmpC.r, tmpC.g, tmpC.b);
  }
  bedGeo.setAttribute('color', new THREE.Float32BufferAttribute(bedCol, 3));
  bedGeo.computeVertexNormals();
  const bed = new THREE.Mesh(bedGeo, withSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 'gravel'));
  bed.position.set(cx, 0, cz);
  bed.receiveShadow = true;
  root.add(bed);

  // ---- the rim: low stone kerb all round, its wall running down under the water
  const rimMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x8c877c, roughness: 0.9 }), 'stone');
  const R = POND.rimWidth;
  const rims: Rect[] = [
    { x0: lake.x0 - R, x1: lake.x1 + R, z0: lake.z0 - R, z1: lake.z0 },
    { x0: lake.x0 - R, x1: lake.x1 + R, z0: lake.z1, z1: lake.z1 + R },
    { x0: lake.x0 - R, x1: lake.x0, z0: lake.z0, z1: lake.z1 },
    { x0: lake.x1, x1: lake.x1 + R, z0: lake.z0, z1: lake.z1 },
  ];
  const h = POND.rimHeight - POND.rimBottom;
  for (const r of rims) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, h, r.z1 - r.z0), rimMat);
    m.position.set((r.x0 + r.x1) / 2, POND.rimBottom + h / 2, (r.z0 + r.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((r.x1 - r.x0) / 2, h / 2, (r.z1 - r.z0) / 2)
        .setTranslation((r.x0 + r.x1) / 2, POND.rimBottom + h / 2, (r.z0 + r.z1) / 2)
        .setCollisionGroups(WORLD_GROUPS),
    );
  }

  // ---- the water
  const segX = Math.min(140, Math.round(w / 1.2));
  const segZ = Math.min(140, Math.round(d / 1.2));
  const waterGeo = new THREE.PlaneGeometry(w, d, segX, segZ);
  waterGeo.rotateX(-Math.PI / 2);
  const normals = makeRippleNormals();
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.repeat.set(w / 7, d / 7);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x24505a,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.84,
    normalMap: normals,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.2,
  });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    const terms = POND.waves
      .map((v) => {
        const k = (Math.PI * 2) / v.len;
        return `{ vec2 D = vec2(${v.dirX.toFixed(4)}, ${v.dirZ.toFixed(4)}); float ph = dot(p, D) * ${k.toFixed(5)} + uTime * ${v.speed.toFixed(4)}; h += ${v.amp.toFixed(5)} * sin(ph); grad += ${(v.amp * k).toFixed(6)} * cos(ph) * D; }`;
      })
      .join('\n  ');
    const header = `
uniform float uTime;
uniform vec2 uOrigin;
float waveSum(vec2 p, out vec2 grad) {
  float h = 0.0;
  grad = vec2(0.0);
  ${terms}
  return h;
}
`;
    sh.uniforms.uOrigin = { value: new THREE.Vector2(cx, cz) };
    sh.vertexShader = header + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec2 wg; waveSum(position.xz + uOrigin, wg); vec3 objectNormal = normalize(vec3(-wg.x, 1.0, -wg.y));')
      .replace('#include <begin_vertex>', 'vec2 wg2; vec3 transformed = vec3(position); transformed.y += waveSum(position.xz + uOrigin, wg2);');
  };
  const water = new THREE.Mesh(waterGeo, mat);
  water.position.set(cx, POND.surface, cz);
  water.receiveShadow = true;
  water.renderOrder = 2;
  root.add(water);

  // ---- lily pads along the edges
  const padGeo = new THREE.CircleGeometry(0.55, 14, 0.35, Math.PI * 2 - 0.7);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.6, side: THREE.DoubleSide });
  const pads: Array<{ x: number; z: number; s: number; r: number }> = [];
  let seed = 9137;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 400 && pads.length < 70; n++) {
    // Clumps near the rim on the shallow shelf.
    const side = Math.floor(rnd() * 4);
    const along = rnd();
    const inset = 1.5 + rnd() * 9;
    const x = side < 2 ? lake.x0 + along * w : side === 2 ? lake.x0 + inset : lake.x1 - inset;
    const z = side >= 2 ? lake.z0 + along * d : side === 0 ? lake.z0 + inset : lake.z1 - inset;
    if (!inside(lake, x, z, 1.2) || Math.sin(x * 0.11) * Math.cos(z * 0.13) < 0.15) continue;
    if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
    pads.push({ x, z, s: 0.7 + rnd() * 0.7, r: rnd() * Math.PI * 2 });
  }
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, Math.max(1, pads.length));
  padMesh.count = pads.length;
  padMesh.receiveShadow = true;
  root.add(padMesh);
  const flowers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xf2b6d2, roughness: 0.7, emissive: 0x2a0a18 }), Math.max(1, pads.length));
  const flowering = pads.filter((_, i) => i % 4 === 0);
  flowers.count = flowering.length;
  root.add(flowers);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const placePads = (t: number): void => {
    pads.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r + Math.sin(t * 0.2 + i) * 0.05);
      m4.compose(pos.set(p.x, waveY(p.x, p.z, t) + 0.02, p.z), q, sc.setScalar(p.s));
      padMesh.setMatrixAt(i, m4);
    });
    padMesh.instanceMatrix.needsUpdate = true;
    flowering.forEach((p, i) => {
      m4.compose(pos.set(p.x + 0.15 * p.s, waveY(p.x, p.z, t) + 0.1, p.z), q.identity(), sc.setScalar(p.s));
      flowers.setMatrixAt(i, m4);
    });
    flowers.instanceMatrix.needsUpdate = true;
  };
  placePads(0);

  // ---- ripple rings
  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; life: number; size: number; x: number; z: number }> = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false;
    mesh.renderOrder = 3;
    root.add(mesh);
    rings.push({ mesh, mat: m, age: 0, life: 1, size: 1, x: 0, z: 0 });
  }
  let nextRing = 0;
  let time = 0;
  let padClock = 0;

  return {
    root,
    update(t, dt) {
      time = t;
      uTime.value = t;
      normals.offset.set((t * 0.013) % 1, (t * 0.008) % 1);
      padClock += dt;
      if (padClock > 1 / 20) {
        padClock = 0;
        placePads(t);
      }
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) {
          r.mesh.visible = false;
          continue;
        }
        const s = r.size * (0.4 + k * 2.2);
        r.mesh.scale.set(s, 1, s);
        r.mesh.position.set(r.x, waveY(r.x, r.z, time) + 0.03, r.z);
        r.mat.opacity = 0.55 * (1 - k) * (1 - k);
      }
    },
    ripple(x, z, size = 1) {
      if (!inside(lake, x, z, 0.3)) return;
      const r = rings[nextRing];
      nextRing = (nextRing + 1) % rings.length;
      r.mesh.visible = true;
      r.age = 0;
      r.life = 1.1 + size * 0.35;
      r.size = size;
      r.x = x;
      r.z = z;
      r.mesh.position.set(x, waveY(x, z, time) + 0.03, z);
      r.mesh.scale.setScalar(size * 0.4);
    },
  };
}

function inside(lake: Rect, x: number, z: number, m: number): boolean {
  return x > lake.x0 + m && x < lake.x1 - m && z > lake.z0 + m && z < lake.z1 - m;
}

/** A tiling normal map of soft criss-crossing ripples (made once, 256 px). */
function makeRippleNormals(): THREE.Texture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const hgt = (x: number, y: number): number => {
    const a = (x / N) * Math.PI * 2;
    const b = (y / N) * Math.PI * 2;
    return Math.sin(a * 3 + Math.sin(b * 2) * 1.3) * 0.5 + Math.sin(b * 5 + Math.sin(a * 3) * 0.8) * 0.35 + Math.sin((a + b) * 7) * 0.15 + Math.sin((a * 2 - b) * 11) * 0.08;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = hgt(x + 1, y) - hgt(x - 1, y);
      const dy = hgt(x, y + 1) - hgt(x, y - 1);
      const nx = -dx * 2.2;
      const ny = -dy * 2.2;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      data[i] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}
