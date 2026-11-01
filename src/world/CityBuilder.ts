import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { Rng } from '../util/rng';
import { CITY, FACADES, type CityLayout, type Facade, type Rect } from './CityLayout';
import { buildParkFlora } from './ParkFlora';
import { platform } from '../mobile/Platform';
import { FACADE_TILE_H, FACADE_TILE_W, makeAsphalt, makeFacade, makeGrass, makeMarkingWear, makeRoof, makeSidewalk, type SurfaceSet } from './Textures';
import { withSurface, type SurfaceKind } from '../render/Surfaces';
import { buildStreetClutter, canopyGeometry } from './StreetClutter';
import { buildPond, type PondView } from './PondView';
import { buildDocks, dockRects, planDocks, type DocksView } from './Docks';

/** A material for a full PBR set (colour, normal, packed roughness/metalness). */
const pbr = (s: SurfaceSet): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, roughness: 1, metalness: 1 });

/** Close-up micro detail on each facade type (breaks up the 16 m tile up close). */
const FACADE_SURFACE: Record<Facade, SurfaceKind> = {
  glass: 'bareMetal',
  darkglass: 'bareMetal',
  brick: 'stone',
  brownstone: 'stone',
  limestone: 'stone',
  concrete: 'concrete',
};

const CURB = 0.15;
const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

/** Accumulates indexed quads with explicit normals and UVs, then becomes one BufferGeometry. */
class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];

  /** Quad from four corners in counter-clockwise order as seen from the side the normal points to. */
  quad(
    p: [number, number, number][],
    n: [number, number, number],
    uvs: [number, number][],
    color?: [number, number, number],
  ): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      if (color) this.col.push(color[0], color[1], color[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Vertical wall from a to b (left to right seen from outside), world-scaled UVs. */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, tileW: number, tileH: number, uOffset = 0): void {
    const len = Math.hypot(bx - ax, bz - az);
    // Outward normal: a->b rotated a quarter turn so that (a, b, b+up) winds counter-clockwise.
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const u0 = uOffset / tileW;
    const u1 = (uOffset + len) / tileW;
    this.quad(
      [
        [ax, y0, az],
        [bx, y0, bz],
        [bx, y1, bz],
        [ax, y1, az],
      ],
      [nx, 0, nz],
      [
        [u0, y0 / tileH],
        [u1, y0 / tileH],
        [u1, y1 / tileH],
        [u0, y1 / tileH],
      ],
    );
  }

  /** The four outward-facing walls of an axis-aligned box. */
  boxWalls(r: Rect, y0: number, y1: number, tileW: number, tileH: number, uOffset = 0): void {
    this.wall(r.x0, r.z1, r.x1, r.z1, y0, y1, tileW, tileH, uOffset); // south (+Z)
    this.wall(r.x1, r.z1, r.x1, r.z0, y0, y1, tileW, tileH, uOffset); // east (+X)
    this.wall(r.x1, r.z0, r.x0, r.z0, y0, y1, tileW, tileH, uOffset); // north (-Z)
    this.wall(r.x0, r.z0, r.x0, r.z1, y0, y1, tileW, tileH, uOffset); // west (-X)
  }

  /** Horizontal upward-facing rectangle, UVs in world units divided by `tile`. */
  top(r: Rect, y: number, tile: number, color?: [number, number, number]): void {
    this.quad(
      [
        [r.x0, y, r.z1],
        [r.x1, y, r.z1],
        [r.x1, y, r.z0],
        [r.x0, y, r.z0],
      ],
      [0, 1, 0],
      [
        [r.x0 / tile, -r.z1 / tile],
        [r.x1 / tile, -r.z1 / tile],
        [r.x1 / tile, -r.z0 / tile],
        [r.x0 / tile, -r.z0 / tile],
      ],
      color,
    );
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** One signal head: the junction it belongs to and which road's traffic it shows. */
export interface SignalHead {
  nodeX: number;
  nodeZ: number;
  axis: 'ave' | 'street';
}

export interface SignalLenses {
  heads: SignalHead[];
  red: THREE.InstancedMesh;
  amber: THREE.InstancedMesh;
  green: THREE.InstancedMesh;
}

/**
 * A breakable piece of street furniture (lamps, hydrants, trees): where it is, the instanced mesh
 * slots that draw it (hidden when it breaks) and its fixed collider (disabled while broken).
 * DestructionWorld takes these over.
 */
export interface StaticProp {
  kind: 'lamp' | 'hydrant' | 'tree' | 'parkTree';
  x: number;
  z: number;
  rot: number;
  s: number;
  parts: Array<{ mesh: THREE.InstancedMesh; index: number }>;
  collider: RAPIER.Collider;
}

export interface BuiltCity {
  root: THREE.Group;
  signals: SignalLenses;
  /** Breakable street furniture. */
  props: StaticProp[];
  /** The Central Green pond (waves, ripples). */
  pond: PondView;
  /** The docks on both rivers (moored boats bob). */
  docks: DocksView;
}

/** Turns a CityLayout into meshes (a handful of merged draw calls) and fixed Rapier colliders. */
export function buildCity(layout: CityLayout, world: RAPIER.World): BuiltCity {
  const root = new THREE.Group();
  root.name = 'city';
  const rng = new Rng(layout.seed + 77);
  const land = layout.land;

  const cuboid = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, friction = 0.9): void => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setFriction(friction).setCollisionGroups(WORLD_GROUPS),
    );
  };
  const rectCollider = (r: Rect, y0: number, y1: number): void =>
    cuboid((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, (y1 - y0) / 2, (r.z1 - r.z0) / 2);

  // ---------------------------------------------------------------- ground and roads
  const asphalt = makeAsphalt();
  const groundGeo = new GeoBuilder();
  // The pond is a hole in the ground (its own basin, PondView.ts).
  const lk = layout.parkLake;
  const groundPieces: Rect[] = [
    { x0: land.x0, x1: land.x1, z0: land.z0, z1: lk.z0 },
    { x0: land.x0, x1: land.x1, z0: lk.z1, z1: land.z1 },
    { x0: land.x0, x1: lk.x0, z0: lk.z0, z1: lk.z1 },
    { x0: lk.x1, x1: land.x1, z0: lk.z0, z1: lk.z1 },
  ];
  for (const r of groundPieces) groundGeo.top(r, 0, 10);
  const ground = new THREE.Mesh(
    groundGeo.build(),
    withSurface(pbr(asphalt), 'asphalt', { tone: 0.4, bump: 0.3, fade: [18, 55] }), // close-up grain on top of the 10 m tile
  );
  ground.receiveShadow = true;
  ground.name = 'ground';
  root.add(ground);
  // One thick slab: the road surface is its top face at y = 0.
  for (const r of groundPieces) rectCollider(r, -2, 0);

  // ---------------------------------------------------------------- sidewalks (blocks, promenades)
  const walk = new GeoBuilder();
  const curbs: Rect[] = [...layout.blocks];
  const outerW = layout.aveX[0] - CITY.aveWidth / 2;
  const outerE = layout.aveX[layout.aveX.length - 1] + CITY.aveWidth / 2;
  const outerN = layout.streetZ[0] - CITY.streetWidth / 2;
  const outerS = layout.streetZ[layout.streetZ.length - 1] + CITY.streetWidth / 2;
  curbs.push(
    { x0: land.x0, x1: outerW, z0: land.z0, z1: land.z1 },
    { x0: outerE, x1: land.x1, z0: land.z0, z1: land.z1 },
    { x0: outerW, x1: outerE, z0: land.z0, z1: outerN },
    { x0: outerW, x1: outerE, z0: outerS, z1: land.z1 },
  );
  for (const r of curbs) {
    walk.top(r, CURB, 3);
    walk.boxWalls(r, 0, CURB, 3, 3);
    rectCollider(r, 0, CURB);
  }
  const sidewalk = new THREE.Mesh(walk.build(), withSurface(pbr(makeSidewalk()), 'concrete', { tone: 0.5, bump: 0.6, fade: [15, 45] }));
  sidewalk.receiveShadow = true;
  sidewalk.castShadow = false;
  sidewalk.name = 'sidewalk';
  root.add(sidewalk);

  // ---------------------------------------------------------------- park
  const props: StaticProp[] = [];
  const pond = buildPark(layout, root, world, rng, props);

  // ---------------------------------------------------------------- markings
  root.add(buildMarkings(layout));

  // ---------------------------------------------------------------- buildings
  // Three variants of each facade (different window layouts, colour and weathering), so a street
  // of brick isn't the same brick over and over.
  const VARIANTS = 3;
  const walls = new Map<string, GeoBuilder>(FACADES.flatMap((f) => Array.from({ length: VARIANTS }, (_, v) => [`${f}:${v}`, new GeoBuilder()] as [string, GeoBuilder])));
  const roofs = new GeoBuilder();
  const spires: Array<{ x: number; y: number; z: number; h: number; r: number }> = [];
  const tanks: Array<{ x: number; y: number; z: number }> = [];
  for (const b of layout.buildings) {
    const vi = Math.abs(Math.floor(Math.sin(b.rect.x0 * 12.9898 + b.rect.z0 * 78.233) * 43758.5453)) % VARIANTS;
    const wb = walls.get(`${b.facade}:${vi}`)!;
    const off = rng.range(0, FACADE_TILE_W);
    wb.boxWalls(b.rect, CURB, b.height, FACADE_TILE_W, FACADE_TILE_H, off);
    roofs.top(b.rect, b.height, 6);
    // Parapet lip so roofs read as roofs from street level.
    rectCollider(b.rect, CURB, b.height);
    let topY = b.height;
    let topRect = b.rect;
    if (b.setback) {
      wb.boxWalls(b.setback.rect, b.height, b.height + b.setback.height, FACADE_TILE_W, FACADE_TILE_H, off);
      roofs.top(b.setback.rect, b.height + b.setback.height, 6);
      rectCollider(b.setback.rect, b.height, b.height + b.setback.height);
      topY = b.height + b.setback.height;
      topRect = b.setback.rect;
    }
    if (b.spire > 0) {
      const w = Math.min(topRect.x1 - topRect.x0, topRect.z1 - topRect.z0);
      spires.push({ x: (topRect.x0 + topRect.x1) / 2, y: topY, z: (topRect.z0 + topRect.z1) / 2, h: b.spire, r: w * 0.12 });
    }
    if (b.waterTower) {
      const w = topRect.x1 - topRect.x0;
      const d = topRect.z1 - topRect.z0;
      if (w > 7 && d > 7) tanks.push({ x: topRect.x0 + w * rng.range(0.3, 0.7), y: topY, z: topRect.z0 + d * rng.range(0.3, 0.7) });
    }
  }
  const TINTS = [0xffffff, 0xf2e6dc, 0xdfe6ec];
  FACADES.forEach((f, i) => for_variants(f, i));
  function for_variants(f: Facade, i: number): void {
   for (let v = 0; v < VARIANTS; v++) {
    const gb = walls.get(`${f}:${v}`)!;
    if (gb.empty) continue;
    const set = makeFacade(f, 100 + i + v * 37);
    const mesh = new THREE.Mesh(
      gb.build(),
      withSurface(
        new THREE.MeshStandardMaterial({
          map: set.map,
          normalMap: set.normalMap,
          roughnessMap: set.ormMap,
          metalnessMap: set.ormMap,
          roughness: 1,
          metalness: 1,
          envMapIntensity: f === 'glass' || f === 'darkglass' ? 1.4 : 0.9,
          color: TINTS[v],
        }),
        FACADE_SURFACE[f],
        { tone: 0.35, bump: 0.5, fade: [20, 60] },
      ),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `facade-${f}-${v}`;
    root.add(mesh);
   }
  }
  const roofMesh = new THREE.Mesh(roofs.build(), withSurface(pbr(makeRoof()), 'gravel', { tone: 0.4, bump: 0.6 }));
  roofMesh.receiveShadow = true;
  roofMesh.castShadow = true;
  root.add(roofMesh);

  root.add(buildSpires(spires));
  root.add(buildWaterTowers(tanks));

  // ---------------------------------------------------------------- street furniture
  const furniture = buildStreetFurniture(layout, world, rng, props);
  root.add(furniture.group);
  // Bin bags, litter, drains and manhole covers.
  root.add(buildStreetClutter(layout, CURB, props.map((p) => ({ x: p.x, z: p.z })), platform.touch ? 0.5 : 1).group);

  // ---------------------------------------------------------------- waterfront railing
  // ---------------------------------------------------------------- docks (gaps in the railing for the piers)
  const dockPlans = planDocks(layout);
  layout.docks = dockPlans.flatMap(dockRects);
  const docks = buildDocks(dockPlans, world);
  root.add(docks.root);
  root.add(buildRailing(land, world, dockPlans.map((d) => d.opening)));

  return { root, signals: furniture.signals, props, pond, docks };
}

function buildPark(layout: CityLayout, root: THREE.Group, world: RAPIER.World, rng: Rng, props: StaticProp[]): PondView {
  const park = layout.park;
  const lake = layout.parkLake;
  const grassTex = makeGrass();
  const g = new GeoBuilder();
  // Grass around the lake (four strips) so the lake reads as a hollow.
  const strips: Rect[] = [
    { x0: park.x0, x1: park.x1, z0: park.z0, z1: lake.z0 },
    { x0: park.x0, x1: park.x1, z0: lake.z1, z1: park.z1 },
    { x0: park.x0, x1: lake.x0, z0: lake.z0, z1: lake.z1 },
    { x0: lake.x1, x1: park.x1, z0: lake.z0, z1: lake.z1 },
  ];
  for (const s of strips) {
    g.top(s, CURB, 6);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((s.x1 - s.x0) / 2, CURB / 2, (s.z1 - s.z0) / 2)
        .setTranslation((s.x0 + s.x1) / 2, CURB / 2, (s.z0 + s.z1) / 2)
        .setFriction(0.7)
        .setCollisionGroups(WORLD_GROUPS),
    );
  }
  g.boxWalls(park, 0, CURB, 6, 6);
  const grass = new THREE.Mesh(g.build(), withSurface(pbr(grassTex), 'foliage', { tone: 0.4, bump: 0.5, tile: 0.5 }));
  grass.receiveShadow = true;
  root.add(grass);

  // The pond: real water in a bowl, with a low stone rim (PondView.ts).
  const pond = buildPond(lake, world);
  root.add(pond.root);

  // Paths: a loop and two cross paths.
  const paths = new GeoBuilder();
  const pw = 4;
  const loop: Rect[] = [
    { x0: park.x0 + 18, x1: park.x1 - 18, z0: park.z0 + 18, z1: park.z0 + 18 + pw },
    { x0: park.x0 + 18, x1: park.x1 - 18, z0: park.z1 - 18 - pw, z1: park.z1 - 18 },
    { x0: park.x0 + 18, x1: park.x0 + 18 + pw, z0: park.z0 + 18, z1: park.z1 - 18 },
    { x0: park.x1 - 18 - pw, x1: park.x1 - 18, z0: park.z0 + 18, z1: park.z1 - 18 },
  ];
  const midZ = (park.z0 + lake.z0) / 2;
  loop.push({ x0: park.x0, x1: park.x1, z0: midZ - pw / 2, z1: midZ + pw / 2 });
  for (const r of loop) paths.top(r, CURB + 0.01, 3);
  const pathMesh = new THREE.Mesh(paths.build(), withSurface(new THREE.MeshStandardMaterial({ color: 0xb9ab8f, roughness: 1 }), 'gravel'));
  pathMesh.receiveShadow = true;
  root.add(pathMesh);

  // Trees, kept off the paths and the lake.
  const onPath = (x: number, z: number): boolean => loop.some((r) => x > r.x0 - 3 && x < r.x1 + 3 && z > r.z0 - 3 && z < r.z1 + 3);
  const inLake = (x: number, z: number): boolean => x > lake.x0 - 4 && x < lake.x1 + 4 && z > lake.z0 - 4 && z < lake.z1 + 4;
  const trees: Array<{ x: number; z: number; s: number }> = [];
  for (let i = 0; i < 1400 && trees.length < 420; i++) {
    const x = rng.range(park.x0 + 4, park.x1 - 4);
    const z = rng.range(park.z0 + 4, park.z1 - 4);
    if (onPath(x, z) || inLake(x, z)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 49)) continue;
    trees.push({ x, z, s: rng.range(0.8, 1.35) });
  }
  root.add(buildTrees(trees, CURB, world, rng, props, 'parkTree'));
  // Tall grass, flower beds, shrubs, pines and benches (ParkFlora.ts); phones get a thinner meadow.
  root.add(buildParkFlora({ park, lake, paths: loop, baseY: CURB, trees, density: platform.touch ? 0.45 : 1 }, world));
  return pond;
}

/** Trunk + low-poly canopy, instanced, with trunk colliders. */
function buildTrees(trees: Array<{ x: number; z: number; s: number }>, baseY: number, world: RAPIER.World, rng: Rng, props?: StaticProp[], kind: 'tree' | 'parkTree' = 'tree'): THREE.Group {
  const group = new THREE.Group();
  if (trees.length === 0) return group;
  // A trunk that flares at the root and forks into two short limbs under the crown; a faceted,
  // lumpy olive canopy (StreetClutter.canopyGeometry) shaded facet by facet.
  const trunkGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.3, 3.4, 7).translate(0, 1.7, 0),
    new THREE.CylinderGeometry(0.09, 0.14, 1.4, 5).rotateZ(0.5).translate(0.35, 3.8, 0.1),
    new THREE.CylinderGeometry(0.08, 0.13, 1.3, 5).rotateZ(-0.45).rotateY(1.2).translate(-0.3, 3.7, -0.2),
  ]);
  const canopyGeo = canopyGeometry(kind === 'parkTree' ? 11 : 3);
  const trunks = new THREE.InstancedMesh(trunkGeo, withSurface(new THREE.MeshStandardMaterial({ color: 0x3a2b1f, roughness: 1 }), 'bark'), trees.length);
  const canopies = new THREE.InstancedMesh(
    canopyGeo,
    // Facets do the work here: only a whisper of surface detail, so the crown reads as clean
    // flat planes of olive rather than a textured ball.
    withSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, vertexColors: true }), 'foliage', { tone: 0.25, bump: 0.2, cavity: 0.35, tile: 0.5 }),
    trees.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  trees.forEach((t, i) => {
    const rot = rng.range(0, Math.PI * 2);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(new THREE.Vector3(t.x, baseY, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m);
    canopies.setMatrixAt(i, m);
    // Olive to khaki greens, the way street trees look under a grey sky.
    c.setHSL(rng.range(0.16, 0.23), rng.range(0.3, 0.42), rng.range(0.2, 0.3));
    canopies.setColorAt(i, c);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cylinder(1.6 * t.s, 0.25 * t.s)
        .setTranslation(t.x, baseY + 1.6 * t.s, t.z)
        .setCollisionGroups(WORLD_GROUPS),
    );
    props?.push({ kind, x: t.x, z: t.z, rot, s: t.s, parts: [{ mesh: trunks, index: i }, { mesh: canopies, index: i }], collider });
  });
  for (const mesh of [trunks, canopies]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  return group;
}

function buildSpires(spires: Array<{ x: number; y: number; z: number; h: number; r: number }>): THREE.Object3D {
  if (spires.length === 0) return new THREE.Group();
  const geo = new THREE.ConeGeometry(1, 1, 8);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, withSurface(new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 }), 'bareMetal'), spires.length);
  const m = new THREE.Matrix4();
  spires.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.r, s.h, s.r));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** The classic NYC rooftop wooden water tank on a steel stand. */
function buildWaterTowers(tanks: Array<{ x: number; y: number; z: number }>): THREE.Object3D {
  const group = new THREE.Group();
  if (tanks.length === 0) return group;
  const tank = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 14);
  tank.translate(0, 4.4, 0);
  const roof = new THREE.ConeGeometry(1.85, 1.1, 14);
  roof.translate(0, 6.55, 0);
  const stand = new THREE.CylinderGeometry(1.3, 1.5, 2.8, 4, 1, true);
  stand.translate(0, 1.4, 0);
  const wood = withSurface(new THREE.MeshStandardMaterial({ color: 0x6e5038, roughness: 0.95 }), 'wood');
  const steel = withSurface(new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }), 'paintedMetal');
  const parts: Array<[THREE.BufferGeometry, THREE.Material]> = [
    [tank, wood],
    [roof, wood],
    [stand, steel],
  ];
  const m = new THREE.Matrix4();
  for (const [geo, mat] of parts) {
    const mesh = new THREE.InstancedMesh(geo, mat, tanks.length);
    tanks.forEach((t, i) => {
      m.makeTranslation(t.x, t.y, t.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/** Lane lines, double yellow centre lines, stop lines and zebra crossings. */
function buildMarkings(layout: CityLayout): THREE.Mesh {
  const g = new GeoBuilder();
  const Y = 0.012;
  const white: [number, number, number] = [0.84, 0.84, 0.8];
  const yellow: [number, number, number] = [0.86, 0.66, 0.18];
  // Strip along X or Z: `along` from a to b, `across` centred at c with width w.
  const strip = (alongX: boolean, a: number, b: number, c: number, w: number, color: [number, number, number]): void => {
    const r: Rect = alongX ? { x0: a, x1: b, z0: c - w / 2, z1: c + w / 2 } : { x0: c - w / 2, x1: c + w / 2, z0: a, z1: b };
    g.top(r, Y, 1, color);
  };
  const dashed = (alongX: boolean, a: number, b: number, c: number, color: [number, number, number]): void => {
    for (let s = a; s < b - 3; s += 9) strip(alongX, s, s + 3, c, 0.13, color);
  };

  for (const road of layout.roads) {
    const alongX = road.kind === 'street';
    const crossings = road.kind === 'ave' ? layout.streetZ : layout.aveX;
    const crossHalf = road.kind === 'ave' ? CITY.streetWidth / 2 : CITY.aveWidth / 2;
    const cuts = crossings
      .map((c) => [c - crossHalf, c + crossHalf] as const)
      .filter(([a, b]) => b > road.from && a < road.to)
      .sort((p, q) => p[0] - q[0]);
    // Walk the road between junctions.
    const segments: Array<[number, number]> = [];
    let cursor = road.from;
    for (const [a, b] of cuts) {
      if (a > cursor) segments.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < road.to) segments.push([cursor, road.to]);

    const laneW = 3.3;
    for (const [a0, b0] of segments) {
      const atJunctionStart = cuts.some(([, b]) => Math.abs(b - a0) < 0.01);
      const atJunctionEnd = cuts.some(([a]) => Math.abs(a - b0) < 0.01);
      const a = a0 + (atJunctionStart ? 4.5 : 0);
      const b = b0 - (atJunctionEnd ? 4.5 : 0);
      if (b - a < 4) continue;
      strip(alongX, a, b, road.center - 0.18, 0.12, yellow);
      strip(alongX, a, b, road.center + 0.18, 0.12, yellow);
      for (let lane = 1; lane < road.lanes; lane++) {
        dashed(alongX, a, b, road.center - lane * laneW, white);
        dashed(alongX, a, b, road.center + lane * laneW, white);
      }
      const edge = road.lanes * laneW;
      strip(alongX, a, b, road.center - edge, 0.12, white);
      strip(alongX, a, b, road.center + edge, 0.12, white);

      // Zebra crossings and stop lines at the junction ends.
      const zebra = (s0: number): void => {
        for (let k = -road.width / 2 + 0.6; k < road.width / 2 - 0.6; k += 1.1) strip(alongX, s0, s0 + 3, road.center + k + 0.3, 0.55, white);
      };
      if (atJunctionStart) {
        zebra(a0 + 0.8);
        // Stop line for traffic arriving from the far end on the right-hand lanes.
        strip(!alongX, road.center - edge, road.center, a0 + 4.2, 0.4, white);
      }
      if (atJunctionEnd) {
        zebra(b0 - 3.8);
        strip(!alongX, road.center, road.center + edge, b0 - 4.2, 0.4, white);
      }
    }
  }
  // Worn paint: flaked along the cracks and the wheel tracks, so the asphalt shows through.
  const wear = makeMarkingWear();
  const mesh = new THREE.Mesh(
    g.build(),
    withSurface(new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: wear.map,
      alphaMap: wear.alphaMap,
      alphaTest: 0.4,
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }), 'concrete'),
  );
  mesh.receiveShadow = true;
  mesh.name = 'markings';
  return mesh;
}

/**
 * Street lamps, traffic signals at each junction corner, fire hydrants and street trees.
 * Everything a car can hit gets a fixed collider.
 */
function buildStreetFurniture(layout: CityLayout, world: RAPIER.World, rng: Rng, props: StaticProp[]): { group: THREE.Group; signals: SignalLenses } {
  const group = new THREE.Group();
  const lamps: Array<{ x: number; z: number; rot: number }> = [];
  const signals: Array<{ x: number; z: number; rot: number } & SignalHead> = [];
  const aw = CITY.aveWidth / 2;
  const sw = CITY.streetWidth / 2;
  const hydrants: Array<{ x: number; z: number }> = [];
  const trees: Array<{ x: number; z: number; s: number }> = [];

  for (const b of layout.blocks) {
    const inset = 0.7;
    // Corners: traffic signals.
    // Each corner faces its junction; two corners show the avenue's light, two the street's.
    signals.push(
      { x: b.x0 + inset, z: b.z0 + inset, rot: Math.PI * 0.75, nodeX: b.x0 - aw, nodeZ: b.z0 - sw, axis: 'ave' },
      { x: b.x1 - inset, z: b.z0 + inset, rot: Math.PI * 0.25, nodeX: b.x1 + aw, nodeZ: b.z0 - sw, axis: 'street' },
      { x: b.x0 + inset, z: b.z1 - inset, rot: -Math.PI * 0.75, nodeX: b.x0 - aw, nodeZ: b.z1 + sw, axis: 'street' },
      { x: b.x1 - inset, z: b.z1 - inset, rot: -Math.PI * 0.25, nodeX: b.x1 + aw, nodeZ: b.z1 + sw, axis: 'ave' },
    );
    // Long (east-west) edges: lamps every ~28 m, a few trees and a hydrant.
    for (const [z, rot] of [
      [b.z0 + inset, Math.PI / 2],
      [b.z1 - inset, -Math.PI / 2],
    ] as const) {
      for (let x = b.x0 + 14; x < b.x1 - 10; x += 28) lamps.push({ x, z, rot });
      for (let x = b.x0 + 24; x < b.x1 - 20; x += 19) {
        if (rng.chance(0.45)) trees.push({ x, z: z + (z < (b.z0 + b.z1) / 2 ? 0.6 : -0.6), s: rng.range(0.6, 0.8) });
      }
      hydrants.push({ x: b.x0 + rng.range(8, b.x1 - b.x0 - 8), z });
    }
    // Short (avenue-facing) edges: one lamp in the middle.
    lamps.push({ x: b.x0 + inset, z: (b.z0 + b.z1) / 2, rot: Math.PI }, { x: b.x1 - inset, z: (b.z0 + b.z1) / 2, rot: 0 });
  }
  // Keep the sidewalk clear in front of parking-garage ramps (cars swing across it onto the ramp).
  const garageEntry = (x: number, z: number): boolean =>
    (layout.garages ?? []).some((g) => {
      const r = g.rect;
      const faceZ = Math.abs(z - r.z0) < Math.abs(z - r.z1) ? r.z0 : r.z1;
      return x > r.x0 - 34 && x < r.x0 + 14 && Math.abs(z - faceZ) < 8 && (z < r.z0 || z > r.z1);
    });
  // ... and in front of shop fronts that need the pavement (the showroom).
  const clear = layout.clearFronts ?? [];
  for (const list of [lamps, trees, hydrants] as Array<Array<{ x: number; z: number }>>) {
    for (let i = list.length - 1; i >= 0; i--) if (garageEntry(list[i].x, list[i].z) || clear.some((c) => Math.hypot(c.x - list[i].x, c.z - list[i].z) < c.r)) list.splice(i, 1);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const place = (mesh: THREE.InstancedMesh, items: Array<{ x: number; z: number; rot?: number }>): void => {
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot ?? 0);
      m.compose(new THREE.Vector3(it.x, CURB, it.z), q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  const poleMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.55, metalness: 0.6 }), 'paintedMetal');

  // Lamp: pole + arm reaching over the road (+X in local space) + glowing head.
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 7.5, 8);
  pole.translate(0, 3.75, 0);
  const arm = new THREE.BoxGeometry(2.2, 0.1, 0.1);
  arm.translate(1.1, 7.4, 0);
  const head = new THREE.BoxGeometry(0.7, 0.18, 0.35);
  head.translate(2.1, 7.3, 0);
  const lampPole = new THREE.InstancedMesh(pole, poleMat, lamps.length);
  const lampArm = new THREE.InstancedMesh(arm, poleMat, lamps.length);
  const lampHead = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ name: 'lampHead', color: 0xfff2cc, emissive: 0xffd9a0, emissiveIntensity: 0.4 }), lamps.length);
  place(lampPole, lamps);
  place(lampArm, lamps);
  place(lampHead, lamps);

  // Signals: pole + yellow housing facing the junction, with red/amber/green lenses.
  const sPole = new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8);
  sPole.translate(0, 2.1, 0);
  const sBox = new THREE.BoxGeometry(0.35, 1.0, 0.35);
  sBox.translate(0, 4.4, 0);
  place(new THREE.InstancedMesh(sPole, poleMat, signals.length), signals);
  place(new THREE.InstancedMesh(sBox, withSurface(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 }), 'paintedMetal'), signals.length), signals);
  // Unlit lenses with per-instance colour so each head can show its own state.
  const lens = (y: number): THREE.InstancedMesh => {
    const g = new THREE.SphereGeometry(0.09, 10, 8);
    g.translate(0.19, y, 0);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), signals.length);
    const dark = new THREE.Color(0x1a1a1a);
    for (let i = 0; i < signals.length; i++) mesh.setColorAt(i, dark);
    place(mesh, signals);
    mesh.castShadow = false;
    return mesh;
  };
  const red = lens(4.72);
  const amber = lens(4.4);
  const green = lens(4.08);

  // Hydrants.
  const hydrant = new THREE.CylinderGeometry(0.17, 0.2, 0.75, 10);
  hydrant.translate(0, 0.375, 0);
  const hydrantMesh = new THREE.InstancedMesh(hydrant, withSurface(new THREE.MeshStandardMaterial({ color: 0xb8231c, roughness: 0.5 }), 'paintedMetal'), hydrants.length);
  place(hydrantMesh, hydrants);

  lamps.forEach((l, i) =>
    props.push({ kind: 'lamp', x: l.x, z: l.z, rot: l.rot, s: 1, parts: [{ mesh: lampPole, index: i }, { mesh: lampArm, index: i }, { mesh: lampHead, index: i }], collider: cylinderCollider(world, l.x, l.z, 3.75, 0.12) }),
  );
  for (const s of signals) cylinderCollider(world, s.x, s.z, 2.1, 0.12);
  hydrants.forEach((h, i) => props.push({ kind: 'hydrant', x: h.x, z: h.z, rot: 0, s: 1, parts: [{ mesh: hydrantMesh, index: i }], collider: cylinderCollider(world, h.x, h.z, 0.4, 0.2) }));

  group.add(buildTrees(trees, CURB, world, rng, props, 'tree'));
  return { group, signals: { heads: signals.map(({ nodeX, nodeZ, axis }) => ({ nodeX, nodeZ, axis })), red, amber, green } };
}

function cylinderCollider(world: RAPIER.World, x: number, z: number, halfH: number, r: number): RAPIER.Collider {
  return world.createCollider(
    RAPIER.ColliderDesc.cylinder(halfH, r)
      .setTranslation(x, CURB + halfH, z)
      .setCollisionGroups(WORLD_GROUPS),
  );
}

/** Waterfront railing around the whole island (visual rails + a continuous collider). */
function buildRailing(land: Rect, world: RAPIER.World, openings: ReadonlyArray<{ x: number; z0: number; z1: number }> = []): THREE.Group {
  const group = new THREE.Group();
  const h = 1.05;
  const edges: Array<[number, number, number, number]> = [
    [land.x0, land.z0, land.x1, land.z0],
    [land.x1, land.z0, land.x1, land.z1],
    [land.x1, land.z1, land.x0, land.z1],
    [land.x0, land.z1, land.x0, land.z0],
  ];
  // Split the east and west edges where a pier leaves the promenade.
  for (const o of openings) {
    const i = edges.findIndex(([ax, az, bx, bz]) => ax === o.x && bx === o.x && o.z0 > Math.min(az, bz) && o.z1 < Math.max(az, bz));
    if (i < 0) continue;
    const [ax, az, , bz] = edges[i];
    const up = bz > az;
    edges.splice(i, 1, [ax, az, ax, up ? o.z0 : o.z1], [ax, up ? o.z1 : o.z0, ax, bz]);
  }
  const mat = withSurface(new THREE.MeshStandardMaterial({ color: 0x2f3436, roughness: 0.5, metalness: 0.7 }), 'paintedMetal');
  const postGeo = new THREE.BoxGeometry(0.1, h, 0.1);
  postGeo.translate(0, h / 2, 0);
  const posts: THREE.Vector3[] = [];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len / 2.5);
    for (let i = 0; i <= n; i++) posts.push(new THREE.Vector3(ax + ((bx - ax) * i) / n, CURB, az + ((bz - az) * i) / n));
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    for (const y of [h * 0.5, h]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.06, 0.06, alongX ? 0.06 : len), mat);
      rail.position.set((ax + bx) / 2, CURB + y, (az + bz) / 2);
      rail.castShadow = true;
      group.add(rail);
    }
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(alongX ? len / 2 : 0.15, 0.75, alongX ? 0.15 : len / 2)
        .setTranslation((ax + bx) / 2, CURB + 0.75, (az + bz) / 2)
        .setCollisionGroups(WORLD_GROUPS),
    );
  }
  const inst = new THREE.InstancedMesh(postGeo, mat, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  inst.computeBoundingSphere();
  group.add(inst);
  return group;
}

/** Merges non-indexed copies of a few geometries into one. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    uv.push(...(g.getAttribute('uv').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
