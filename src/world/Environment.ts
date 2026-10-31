import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { GRAPHICS } from '../config';
import { Rng } from '../util/rng';
import type { CityLayout } from './CityLayout';
import { lightingAt, sunAzimuthDeg, sunElevationDeg } from './DayCycle';

/** Sky, sun, ambient light, fog, image-based lighting, water and the far shorelines. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private shadowSize: number = GRAPHICS.shadowMapSize;
  readonly hemi: THREE.HemisphereLight;
  private readonly sky: Sky;
  private readonly sunDir = new THREE.Vector3();
  private readonly water: THREE.Mesh;
  private readonly waterNormal: THREE.CanvasTexture;
  private time = 0;
  /** Street-lamp heads glow brighter at night. */
  lampMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly fog: THREE.Fog;
  private lastHour = -99;
  /** World layer the camera is in: the sewers swap the sky for darkness and close fog. */
  private layer: 'street' | 'roof' | 'sewer' = 'street';
  private readonly sewerFog = new THREE.Color(0x0e120d);
  private readonly sunCol = { day: new THREE.Color(0xfff0dc), gold: new THREE.Color(0xffb36b), moon: new THREE.Color(0x9fb6ff) };
  private readonly fogCol = { day: new THREE.Color(0xb9c4cc), dusk: new THREE.Color(0xc9a58e), night: new THREE.Color(0x1d2534) };
  private readonly hemiSky = { day: new THREE.Color(0xcfe3ff), night: new THREE.Color(0x4a5d8a) };
  private readonly hemiGround = { day: new THREE.Color(0x5a5145), night: new THREE.Color(0x1d1b22) };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    layout: CityLayout,
  ) {
    // Late-afternoon sun from the south-west, casting long shadows down the streets.
    const elevation = THREE.MathUtils.degToRad(32);
    const azimuth = THREE.MathUtils.degToRad(300);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);

    this.sky = new Sky();
    this.sky.scale.setScalar(1600);
    const u = this.sky.material.uniforms;
    u['turbidity'].value = 6;
    u['rayleigh'].value = 1.6;
    u['mieCoefficient'].value = 0.006;
    u['mieDirectionalG'].value = 0.85;
    u['sunPosition'].value.copy(this.sunDir);
    scene.add(this.sky);

    // Image-based lighting from the same sky so car paint and glass reflect it.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(1000);
    const u2 = skyCopy.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u2[k].value = u[k].value;
    u2['sunPosition'].value.copy(this.sunDir);
    skyScene.add(skyCopy);
    scene.environment = pmrem.fromScene(skyScene).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    skyCopy.geometry.dispose();
    skyCopy.material.dispose();

    this.fog = new THREE.Fog(0xb9c4cc, 260, 1900);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5145, 0.9);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(GRAPHICS.shadowMapSize, GRAPHICS.shadowMapSize);
    const e = GRAPHICS.shadowExtent;
    sh.camera.left = -e;
    sh.camera.right = e;
    sh.camera.top = e;
    sh.camera.bottom = -e;
    sh.camera.near = 1;
    sh.camera.far = 900;
    sh.bias = -0.0003;
    sh.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.waterNormal = makeWaterNormal();
    this.waterNormal.repeat.set(60, 60);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({
        color: 0x2c4654,
        roughness: 0.12,
        metalness: 0.1,
        normalMap: this.waterNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -1.4;
    this.water.receiveShadow = true;
    scene.add(this.water);

    this.addShores(layout);
  }

  /** Low skylines across both rivers; scenery only. */
  private addShores(layout: CityLayout): void {
    const rng = new Rng(layout.seed + 5);
    const land = layout.land;
    const mat = new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.9 });
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5d6158, roughness: 1 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const count = 340;
    const towers = new THREE.InstancedMesh(box, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const len = land.z1 - land.z0 + 1400;
    let n = 0;
    for (const side of [-1, 1]) {
      const shoreX = side < 0 ? land.x0 - 420 : land.x1 + 380;
      const ground = new THREE.Mesh(new THREE.BoxGeometry(900, 2, len), groundMat);
      ground.position.set(shoreX + side * 450, -0.6, (land.z0 + land.z1) / 2);
      ground.receiveShadow = true;
      this.scene.add(ground);
      for (let i = 0; i < count / 2; i++) {
        const w = rng.range(18, 50);
        const h = rng.range(12, side > 0 ? 70 : 140);
        p.set(shoreX + side * rng.range(10, 600), h / 2, land.z0 - 700 + rng.range(0, len));
        s.set(w, h, rng.range(18, 50));
        m.compose(p, q, s);
        towers.setMatrixAt(n++, m);
      }
    }
    towers.count = n;
    towers.instanceMatrix.needsUpdate = true;
    this.scene.add(towers);
  }

  /**
   * Time of day: moves the sun (or the moon at night), recolours the sky, light, fog and street lamps.
   * Cheap; called every frame, but only does work when the clock has moved a little.
   */
  setTime(hour: number): void {
    if (Math.abs(hour - this.lastHour) < 0.02) return;
    this.lastHour = hour;
    const L = lightingAt(hour);
    const el = THREE.MathUtils.degToRad(sunElevationDeg(hour));
    const az = THREE.MathUtils.degToRad(sunAzimuthDeg(hour));
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - el, az);
    (this.sky.material.uniforms['sunPosition'].value as THREE.Vector3).copy(sunDir);
    // The directional light follows the sun by day and a high moon by night (so it never lights
    // the city from below the horizon).
    if (L.daylight > 0.02) this.sunDir.copy(sunDir).setY(Math.max(0.12, sunDir.y)).normalize();
    else this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - THREE.MathUtils.degToRad(48), az + Math.PI);
    this.sun.intensity = L.sunIntensity;
    this.sun.color.copy(this.sunCol.moon).lerp(this.sunCol.day, L.daylight).lerp(this.sunCol.gold, L.golden * 0.75);
    this.hemi.intensity = L.hemiIntensity;
    this.hemi.color.copy(this.hemiSky.night).lerp(this.hemiSky.day, L.daylight);
    this.hemi.groundColor.copy(this.hemiGround.night).lerp(this.hemiGround.day, L.daylight);
    this.scene.environmentIntensity = L.envIntensity;
    this.fog.color.copy(this.fogCol.night).lerp(this.fogCol.day, L.daylight).lerp(this.fogCol.dusk, L.golden * 0.5);
    this.renderer.toneMappingExposure = L.exposure;
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = L.lampIntensity;
    if (this.layer === 'sewer') {
      // Underground: no sun or sky, a dim cold fill, close murky fog (the flashlight does the rest).
      this.sun.intensity = 0;
      this.hemi.intensity = 0.22;
      this.hemi.color.set(0x8fa39a);
      this.hemi.groundColor.set(0x1a1f17);
      this.scene.environmentIntensity = 0.12;
      this.fog.color.copy(this.sewerFog);
      this.renderer.toneMappingExposure = 1.05;
    }
  }

  /** Switches lighting for a world layer (applied on the next setTime). */
  setLayer(layer: 'street' | 'roof' | 'sewer'): void {
    if (layer === this.layer) return;
    this.layer = layer;
    this.lastHour = -99;
    const under = layer === 'sewer';
    this.sky.visible = !under;
    this.water.visible = !under;
    this.fog.near = under ? 2 : 260;
    this.fog.far = under ? 45 : 1900;
  }

  get currentLayer(): 'street' | 'roof' | 'sewer' {
    return this.layer;
  }

  /** Shadow map size (the quality governor halves it before it lowers the resolution). */
  setShadowSize(n: number): void {
    const sh = this.sun.shadow;
    if (sh.mapSize.x === n) return;
    sh.mapSize.set(n, n);
    sh.map?.dispose();
    (sh as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
    this.shadowSize = n;
  }

  /** Keeps the shadow frustum centred on the action, snapped to texels to avoid shimmering. */
  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    const texel = (GRAPHICS.shadowExtent * 2) / this.shadowSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 400, this.sunDir.y * 400, fz + this.sunDir.z * 400);
    this.sky.position.copy(camera.position);
    this.waterNormal.offset.set(this.time * 0.004, this.time * 0.0025);
  }
}

function makeWaterNormal(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  // Sum of a few periodic waves so the texture tiles seamlessly.
  const height = (x: number, y: number): number => {
    const a = (x / S) * Math.PI * 2;
    const b = (y / S) * Math.PI * 2;
    return Math.sin(a * 3 + b * 2) + 0.6 * Math.sin(a * 7 - b * 5) + 0.35 * Math.sin(a * 13 + b * 11) + 0.25 * Math.sin(-a * 17 + b * 19);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const nx = -dx * 0.5;
      const ny = -dy * 0.5;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
