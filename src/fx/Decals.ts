import * as THREE from 'three';

/**
 * Surface damage without new geometry (the usual way games mark walls and streets): bullet holes on
 * walls, scorch marks where things blew up, and cracks where a legendary stomped. Each kind is one
 * instanced quad mesh used as a ring buffer, so the newest marks replace the oldest and the cost
 * never grows. Textures are drawn in code like everything else.
 */

export type DecalKind = 'bullet' | 'scorch' | 'crack';

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DRAW: Record<DecalKind, (g: CanvasRenderingContext2D, s: number) => void> = {
  bullet: (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c * 0.9);
    grd.addColorStop(0, 'rgba(10,10,10,1)');
    grd.addColorStop(0.18, 'rgba(25,22,20,0.95)');
    grd.addColorStop(0.32, 'rgba(90,84,76,0.55)');
    grd.addColorStop(1, 'rgba(90,84,76,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    // Chips radiating from the hole.
    g.strokeStyle = 'rgba(40,36,32,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * s * 0.1, c + Math.sin(a) * s * 0.1);
      g.lineTo(c + Math.cos(a) * s * (0.25 + Math.random() * 0.15), c + Math.sin(a) * s * (0.25 + Math.random() * 0.15));
      g.stroke();
    }
  },
  scorch: (g, s) => {
    const c = s / 2;
    for (let i = 0; i < 26; i++) {
      const r = s * (0.12 + Math.random() * 0.3);
      const x = c + (Math.random() - 0.5) * s * 0.35;
      const y = c + (Math.random() - 0.5) * s * 0.35;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(12,10,9,0.35)');
      grd.addColorStop(1, 'rgba(12,10,9,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
  },
  crack: (g, s) => {
    const c = s / 2;
    g.strokeStyle = 'rgba(18,16,14,0.9)';
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
      if (depth <= 0 || len < 3) return;
      let px = x;
      let py = y;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(px, py);
      for (let i = 0; i < 4; i++) {
        a += (Math.random() - 0.5) * 0.8;
        px += Math.cos(a) * (len / 4);
        py += Math.sin(a) * (len / 4);
        g.lineTo(px, py);
      }
      g.stroke();
      branch(px, py, a + 0.5, len * 0.6, w * 0.65, depth - 1);
      branch(px, py, a - 0.5, len * 0.55, w * 0.65, depth - 1);
    };
    for (let i = 0; i < 6; i++) branch(c, c, (i / 6) * Math.PI * 2 + Math.random() * 0.5, s * 0.36, 4, 3);
    const grd = g.createRadialGradient(c, c, 0, c, c, s * 0.18);
    grd.addColorStop(0, 'rgba(20,18,16,0.7)');
    grd.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  },
};

export class Decals {
  private readonly meshes = new Map<DecalKind, { mesh: THREE.InstancedMesh; head: number; max: number }>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private static readonly Z = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, caps: Record<DecalKind, number>) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const kind of ['bullet', 'scorch', 'crack'] as DecalKind[]) {
      const max = Math.max(1, caps[kind]);
      const mat = new THREE.MeshStandardMaterial({ map: canvasTex(DRAW[kind], kind === 'bullet' ? 64 : 256), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, roughness: 1 });
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      for (let i = 0; i < max; i++) mesh.setMatrixAt(i, hidden);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.name = `decals-${kind}`;
      scene.add(mesh);
      this.meshes.set(kind, { mesh, head: 0, max });
    }
  }

  /** A mark at `pos` on a surface facing `normal`, `size` metres across. */
  add(kind: DecalKind, pos: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }, size: number): void {
    const e = this.meshes.get(kind);
    if (!e) return;
    const n = this.v.set(normal.x, normal.y, normal.z);
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    this.q.setFromUnitVectors(Decals.Z, n);
    this.q2.setFromAxisAngle(Decals.Z, Math.random() * Math.PI * 2);
    this.q.multiply(this.q2);
    this.s.set(size, size, 1);
    const p = new THREE.Vector3(pos.x + n.x * 0.02, pos.y + n.y * 0.02, pos.z + n.z * 0.02);
    this.m.compose(p, this.q, this.s);
    e.mesh.setMatrixAt(e.head, this.m);
    e.mesh.instanceMatrix.needsUpdate = true;
    e.head = (e.head + 1) % e.max;
  }

  /** A mark flat on the ground. */
  ground(kind: DecalKind, x: number, y: number, z: number, size: number): void {
    this.add(kind, { x, y: y + 0.01, z }, { x: 0, y: 1, z: 0 }, size);
  }
}
