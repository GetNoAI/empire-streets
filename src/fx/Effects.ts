import * as THREE from 'three';
import { makeSoftParticle } from '../world/Textures';

const MAX_PARTICLES = 1500;
const MAX_SKIDS = 2400;

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  /** Additive (fire/sparks) or normal (smoke). */
  additive: boolean;
  drag: number;
  lift: number;
}

/**
 * Pooled effects: one Points cloud for smoke (normal blending) and one for fire/sparks (additive),
 * instanced skid-mark quads in a ring buffer, and a reusable flash light for explosions.
 */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly smoke: THREE.Points;
  private readonly glow: THREE.Points;
  private readonly skids: THREE.InstancedMesh;
  private skidHead = 0;
  private cursor = 0;
  private readonly flash: THREE.PointLight;
  private flashT = 0;
  // Bullet tracers: a ring buffer of line segments that fade quickly.
  private readonly tracers: THREE.LineSegments;
  private readonly tracerLife = new Float32Array(64);
  private tracerHead = 0;
  private readonly muzzleLight: THREE.PointLight;
  private muzzleT = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size0: 1, size1: 1, r: 1, g: 1, b: 1, alpha: 1, additive: false, drag: 0, lift: 0 });
    }
    const tex = makeSoftParticle();
    this.smoke = this.makeCloud(tex, THREE.NormalBlending);
    this.glow = this.makeCloud(tex, THREE.AdditiveBlending);
    scene.add(this.smoke, this.glow);

    const skidGeo = new THREE.PlaneGeometry(0.42, 0.7);
    skidGeo.rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(
      skidGeo,
      new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      MAX_SKIDS,
    );
    this.skids.frustumCulled = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SKIDS; i++) this.skids.setMatrixAt(i, hidden);
    this.skids.renderOrder = 1;
    scene.add(this.skids);

    this.flash = new THREE.PointLight(0xffa64d, 0, 60, 1.6);
    scene.add(this.flash);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(
      tg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.muzzleLight = new THREE.PointLight(0xffc870, 0, 9, 2);
    scene.add(this.muzzleLight);
  }

  private makeCloud(tex: THREE.Texture, blending: THREE.Blending): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 color;
        varying vec4 vColor;
        uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec4 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  /** Keeps point sizes consistent across window sizes. */
  setViewportHeight(h: number, fovDeg: number): void {
    const scale = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
    (this.smoke.material as THREE.ShaderMaterial).uniforms['scale'].value = scale;
    (this.glow.material as THREE.ShaderMaterial).uniforms['scale'].value = scale;
  }

  private spawn(init: Partial<Particle> & { x: number; y: number; z: number }): void {
    // Round-robin search from the last slot; if everything is alive, recycle the slot we land on.
    let p = this.particles[this.cursor];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const q = this.particles[(this.cursor + i) % MAX_PARTICLES];
      if (!q.alive) {
        p = q;
        this.cursor = (this.cursor + i + 1) % MAX_PARTICLES;
        break;
      }
    }
    Object.assign(p, {
      alive: true,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      life: 1,
      size0: 1,
      size1: 2,
      r: 0.5,
      g: 0.5,
      b: 0.5,
      alpha: 0.6,
      additive: false,
      drag: 1,
      lift: 0,
      ...init,
    });
  }

  tyreSmoke(x: number, y: number, z: number, amount: number): void {
    this.spawn({
      x: x + (Math.random() - 0.5) * 0.3,
      y: y + 0.15,
      z: z + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 0.4 + Math.random() * 0.6,
      vz: (Math.random() - 0.5) * 1.2,
      life: 1.4 + Math.random(),
      size0: 0.6,
      size1: 3.2,
      r: 0.82,
      g: 0.82,
      b: 0.8,
      alpha: 0.28 * amount,
      drag: 1.5,
      lift: 0.3,
    });
  }

  engineSmoke(x: number, y: number, z: number, dark: number): void {
    const c = 0.55 - dark * 0.45;
    this.spawn({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 1.2 + Math.random(),
      vz: (Math.random() - 0.5) * 0.6,
      life: 2 + Math.random() * 1.5,
      size0: 0.5,
      size1: 3.5,
      r: c,
      g: c,
      b: c,
      alpha: 0.45,
      drag: 0.6,
      lift: 0.8,
    });
  }

  fire(x: number, y: number, z: number): void {
    this.spawn({
      x: x + (Math.random() - 0.5) * 0.6,
      y,
      z: z + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 1.5 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 0.5,
      life: 0.5 + Math.random() * 0.4,
      size0: 1.2,
      size1: 0.3,
      r: 1,
      g: 0.45 + Math.random() * 0.3,
      b: 0.1,
      alpha: 0.9,
      additive: true,
      drag: 0.5,
      lift: 1.5,
    });
  }

  sparks(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * 5,
        vz: (Math.random() - 0.5) * 9,
        life: 0.25 + Math.random() * 0.35,
        size0: 0.16,
        size1: 0.04,
        r: 1,
        g: 0.85,
        b: 0.4,
        alpha: 1,
        additive: true,
        drag: 0.3,
        lift: -9,
      });
    }
  }

  explosion(x: number, y: number, z: number): void {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.5;
      const sp = 4 + Math.random() * 12;
      this.spawn({
        x,
        y: y + 0.5,
        z,
        vx: Math.cos(a) * Math.cos(e) * sp,
        vy: Math.sin(e) * sp,
        vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.6 + Math.random() * 0.6,
        size0: 2.5,
        size1: 0.5,
        r: 1,
        g: 0.5 + Math.random() * 0.35,
        b: 0.15,
        alpha: 1,
        additive: true,
        drag: 3,
        lift: 2,
      });
    }
    for (let i = 0; i < 40; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 2,
        y: y + Math.random() * 2,
        z: z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 6,
        life: 3 + Math.random() * 3,
        size0: 2,
        size1: 9,
        r: 0.12,
        g: 0.11,
        b: 0.1,
        alpha: 0.7,
        drag: 1.2,
        lift: 1,
      });
    }
    this.sparks(x, y + 0.8, z, 40);
    this.flash.position.set(x, y + 2, z);
    this.flash.intensity = 4000;
    this.flashT = 0.6;
  }

  /** A short dark tyre mark at a wheel contact point, aligned with the car's heading. */
  skid(x: number, y: number, z: number, heading: number): void {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading + Math.PI / 2);
    this.p.set(x, y + 0.02, z);
    this.m.compose(this.p, this.q, this.s);
    this.skids.setMatrixAt(this.skidHead, this.m);
    this.skidHead = (this.skidHead + 1) % MAX_SKIDS;
    this.skids.instanceMatrix.needsUpdate = true;
  }

  /** A bright streak from muzzle to impact that fades in about 80 ms. */
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const i = this.tracerHead;
    this.tracerHead = (i + 1) % 64;
    const pos = this.tracers.geometry.getAttribute('position') as THREE.BufferAttribute;
    // Start a little way out from the muzzle so it reads as a moving round, not a laser.
    const t0 = 0.15;
    pos.setXYZ(i * 2, ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0);
    pos.setXYZ(i * 2 + 1, bx, by, bz);
    pos.needsUpdate = true;
    this.tracerLife[i] = 0.08;
  }

  /** Muzzle flash: a short-lived light plus a hot additive puff. */
  muzzle(x: number, y: number, z: number, scale = 1): void {
    this.muzzleLight.position.set(x, y, z);
    this.muzzleLight.intensity = 30 * scale;
    this.muzzleT = 0.05;
    this.spawn({ x, y, z, life: 0.06, size0: 0.55 * scale, size1: 0.2, r: 1, g: 0.85, b: 0.45, alpha: 1, additive: true, drag: 0, lift: 0 });
  }

  /** Blood spray in the direction of the shot. */
  blood(x: number, y: number, z: number, dx: number, dz: number, amount = 8): void {
    for (let i = 0; i < amount; i++) {
      this.spawn({
        x,
        y,
        z,
        vx: dx * (1 + Math.random() * 3) + (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 2,
        vz: dz * (1 + Math.random() * 3) + (Math.random() - 0.5) * 1.5,
        life: 0.35 + Math.random() * 0.3,
        size0: 0.18,
        size1: 0.08,
        r: 0.45,
        g: 0.02,
        b: 0.02,
        alpha: 0.9,
        drag: 1,
        lift: -9,
      });
    }
  }

  /**
   * A burst of coloured particles: `speed` outward (in a sphere, or a ring when `flat`), plus `up`
   * of upward kick; additive for glow, normal for dust and smoke.
   */
  burst(o: {
    x: number;
    y: number;
    z: number;
    count: number;
    r: number;
    g: number;
    b: number;
    speed?: number;
    up?: number;
    life?: number;
    size0?: number;
    size1?: number;
    alpha?: number;
    additive?: boolean;
    drag?: number;
    lift?: number;
    flat?: boolean;
    /** Random start offset (m). */
    jitter?: number;
    /** A push in one direction (m/s). */
    vx?: number;
    vz?: number;
  }): void {
    const sp = o.speed ?? 3;
    const j = o.jitter ?? 0;
    for (let i = 0; i < o.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = o.flat ? 0 : (Math.random() - 0.3) * Math.PI * 0.5;
      const v = sp * (0.5 + Math.random() * 0.5);
      this.spawn({
        x: o.x + (Math.random() - 0.5) * j,
        y: o.y + (Math.random() - 0.5) * j * 0.5,
        z: o.z + (Math.random() - 0.5) * j,
        vx: Math.cos(a) * Math.cos(e) * v + (o.vx ?? 0),
        vy: Math.sin(e) * v + (o.up ?? 0) * (0.6 + Math.random() * 0.4),
        vz: Math.sin(a) * Math.cos(e) * v + (o.vz ?? 0),
        life: (o.life ?? 0.6) * (0.7 + Math.random() * 0.6),
        size0: o.size0 ?? 0.3,
        size1: o.size1 ?? 0.1,
        r: o.r,
        g: o.g,
        b: o.b,
        alpha: o.alpha ?? 0.9,
        additive: o.additive ?? true,
        drag: o.drag ?? 1.5,
        lift: o.lift ?? 0,
      });
    }
  }

  /** Dust/chips where a bullet hits a wall or the street. */
  impact(x: number, y: number, z: number, metal: boolean): void {
    if (metal) this.sparks(x, y, z, 5);
    for (let i = 0; i < 4; i++) {
      this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.5, size0: 0.15, size1: 0.6, r: 0.6, g: 0.58, b: 0.55, alpha: 0.5, drag: 2, lift: 0.3 });
    }
  }

  update(dt: number): void {
    // Tracers fade out.
    const col = this.tracers.geometry.getAttribute('color') as THREE.BufferAttribute;
    let anyTracer = false;
    for (let i = 0; i < 64; i++) {
      if (this.tracerLife[i] <= 0) continue;
      this.tracerLife[i] = Math.max(0, this.tracerLife[i] - dt);
      const k = this.tracerLife[i] / 0.08;
      col.setXYZ(i * 2, 0.3 * k, 0.25 * k, 0.1 * k);
      col.setXYZ(i * 2 + 1, 1.5 * k, 1.3 * k, 0.7 * k);
      anyTracer = true;
    }
    if (anyTracer) col.needsUpdate = true;
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      if (this.muzzleT <= 0) this.muzzleLight.intensity = 0;
    }

    const sPos = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sCol = this.smoke.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sSize = this.smoke.geometry.getAttribute('size') as THREE.BufferAttribute;
    const gPos = this.glow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gCol = this.glow.geometry.getAttribute('color') as THREE.BufferAttribute;
    const gSize = this.glow.geometry.getAttribute('size') as THREE.BufferAttribute;
    let ns = 0;
    let ng = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * t;
      const a = p.alpha * (1 - t) * Math.min(1, p.age * 10);
      if (p.additive) {
        gPos.setXYZ(ng, p.x, p.y, p.z);
        gCol.setXYZW(ng, p.r, p.g * (1 - t * 0.5), p.b, a);
        gSize.setX(ng, size);
        ng++;
      } else {
        sPos.setXYZ(ns, p.x, p.y, p.z);
        sCol.setXYZW(ns, p.r, p.g, p.b, a);
        sSize.setX(ns, size);
        ns++;
      }
    }
    for (const a of [sPos, sCol, sSize, gPos, gCol, gSize]) a.needsUpdate = true;
    this.smoke.geometry.setDrawRange(0, ns);
    this.glow.geometry.setDrawRange(0, ng);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity = Math.max(0, 4000 * (this.flashT / 0.6) ** 2);
    }
  }

  dispose(): void {
    this.scene.remove(this.smoke, this.glow, this.skids, this.flash);
  }
}
