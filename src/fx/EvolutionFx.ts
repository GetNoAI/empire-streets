import * as THREE from 'three';
import { markBloom } from '../render/SelectiveBloom';

/**
 * The look of an evolution (EvolutionScene runs the sequence):
 *
 *  - a column of light that rises round the Streetmon and brightens,
 *  - motes of light spiralling in and up, faster and tighter as it builds,
 *  - a glowing disc on the ground that pulses with the flicker,
 *  - the Streetmon itself turned to a white silhouette while its shape flickers (`silhouette`),
 *  - the screen's edges darkening (a vignette), then a white flash and a ring of light rushing
 *    out across the ground when the new form appears.
 *
 * Everything is a handful of meshes made once per evolution (no lights, so no shader recompiles)
 * and the motes, disc and ring glow through the selective bloom (the column is kept faint and out
 * of the bloom, or it swallows the Streetmon).
 */

const MOTES = 56;

function gradientTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class EvolutionFx {
  private readonly root = new THREE.Group();
  private readonly pillar: THREE.Mesh;
  private readonly pillarMat: THREE.MeshBasicMaterial;
  private readonly disc: THREE.Mesh;
  private readonly discMat: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly motes: THREE.Points;
  private readonly moteMat: THREE.PointsMaterial;
  private readonly motePos: Float32Array;
  private readonly moteSeed: Float32Array;
  private readonly vignette: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly textures: THREE.Texture[];
  private size = 1;
  private t = 0;
  private burstT = -1;
  private flashA = 0;
  private build = 0;
  private on = false;

  constructor(
    private readonly scene: THREE.Scene,
    parent: HTMLElement,
    color = new THREE.Color('#bfe8ff'),
  ) {
    const grad = gradientTexture();
    const rad = radialTexture();
    this.textures = [grad, rad];
    const add = THREE.AdditiveBlending;
    this.pillarMat = new THREE.MeshBasicMaterial({ color, map: grad, transparent: true, opacity: 0, blending: add, depthWrite: false, side: THREE.DoubleSide });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), this.pillarMat);
    this.discMat = new THREE.MeshBasicMaterial({ color, map: rad, transparent: true, opacity: 0, blending: add, depthWrite: false });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.discMat);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: add, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.motePos = new Float32Array(MOTES * 3);
    this.moteSeed = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      this.moteSeed[i * 3] = Math.random() * Math.PI * 2; // angle
      this.moteSeed[i * 3 + 1] = Math.random(); // phase up the column
      this.moteSeed[i * 3 + 2] = 0.6 + Math.random() * 0.8; // speed
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.moteMat = new THREE.PointsMaterial({ color: 0xffffff, map: rad, size: 0.22, transparent: true, opacity: 0, blending: add, depthWrite: false, sizeAttenuation: true });
    this.motes = new THREE.Points(g, this.moteMat);
    this.motes.frustumCulled = false;
    this.root.add(this.pillar, this.disc, this.ring, this.motes);
    for (const o of [this.pillar, this.disc, this.ring, this.motes]) o.renderOrder = 5;
    markBloom(this.disc);
    markBloom(this.ring);
    markBloom(this.motes);
    this.root.visible = false;
    scene.add(this.root);

    this.vignette = document.createElement('div');
    this.vignette.className = 'evo-vignette';
    this.flash = document.createElement('div');
    this.flash.className = 'evo-flash';
    parent.append(this.vignette, this.flash);
  }

  /** Starts round a Streetmon `height` tall standing at `at`. */
  start(at: THREE.Vector3, height: number): void {
    this.size = Math.max(0.6, height);
    this.root.position.copy(at);
    this.root.visible = true;
    this.t = 0;
    this.burstT = -1;
    this.flashA = 0;
    this.build = 0;
    this.on = true;
    this.ringMat.opacity = 0;
  }

  /**
   * Per frame. `build` 0..1: how far the evolution has built up (the glow stage); `flicker`: the
   * shapes are flickering (the disc pulses with it).
   */
  update(dt: number, build: number, flicker: number): void {
    if (!this.on) return;
    this.t += dt;
    const s = this.size;
    // Before the burst, things build; after it, they fade over a second and a half.
    const after = this.burstT >= 0 ? this.t - this.burstT : -1;
    const fade = after >= 0 ? Math.max(0, 1 - after / 1.5) : 1;
    this.build += (build - this.build) * Math.min(1, dt * 4);
    const b = this.build;
    // Column.
    const r = s * (0.55 + 0.25 * (1 - b)) * (after >= 0 ? 1 + after * 1.5 : 1);
    this.pillar.scale.set(r, s * (1.2 + b * 4), r);
    this.pillar.rotation.y += dt * (0.6 + b * 2);
    this.pillarMat.opacity = (0.03 + b * 0.17) * fade;
    // Disc on the ground, pulsing with the flicker.
    const pulse = 0.75 + 0.25 * Math.sin(this.t * (6 + flicker * 20));
    this.disc.scale.setScalar(s * (2 + b * 1.2));
    this.disc.position.y = 0.03;
    this.discMat.opacity = (0.15 + b * 0.55) * pulse * fade;
    // Motes spiralling in and up.
    const spin = 1 + b * 5;
    for (let i = 0; i < MOTES; i++) {
      const a0 = this.moteSeed[i * 3];
      const sp = this.moteSeed[i * 3 + 2];
      const u = (this.moteSeed[i * 3 + 1] + this.t * 0.25 * sp * (1 + b * 2)) % 1;
      const rad = s * (1.6 - u * 1.1) * (1 - b * 0.35) * (after >= 0 ? 1 + after * 4 : 1);
      const a = a0 + this.t * spin * sp + u * 4;
      this.motePos[i * 3] = Math.cos(a) * rad;
      this.motePos[i * 3 + 1] = u * s * (1.4 + b * 1.5) + (after >= 0 ? after * 2 : 0);
      this.motePos[i * 3 + 2] = Math.sin(a) * rad;
    }
    (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.moteMat.opacity = Math.min(1, 0.2 + b) * fade;
    this.moteMat.size = 0.05 + s * 0.04;
    // Ring rushing outward after the burst.
    if (after >= 0) {
      const k = Math.min(1, after / 0.9);
      this.ring.scale.setScalar(s * (0.8 + k * 9));
      this.ring.position.y = 0.05;
      this.ringMat.opacity = (1 - k) * 0.9;
    }
    // Screen: vignette with the build, the flash decaying.
    this.vignette.style.opacity = (Math.min(1, b * 1.2) * fade).toFixed(3);
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.flash.style.opacity = this.flashA.toFixed(3);
    if (after > 1.6 && this.flashA <= 0) this.hide();
  }

  /** The new form appears: white flash, ring, the column flares and fades. */
  burst(): void {
    if (!this.on) return;
    this.burstT = this.t;
    this.flashA = 0.95;
  }

  /** Stopped (B): everything drains away quickly. */
  cancel(): void {
    if (!this.on) return;
    this.burstT = this.t;
    this.flashA = 0;
  }

  hide(): void {
    this.on = false;
    this.root.visible = false;
    this.vignette.style.opacity = '0';
    this.flash.style.opacity = '0';
  }

  dispose(): void {
    this.hide();
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const m of [this.pillarMat, this.discMat, this.ringMat, this.moteMat]) m.dispose();
    for (const t of this.textures) t.dispose();
    this.vignette.remove();
    this.flash.remove();
  }
}

/**
 * Turns a model into a glowing white silhouette (or back). The original materials are kept on the
 * meshes' userData so the shared ones are never touched.
 */
const SILHOUETTE = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f4ff') });

export function silhouette(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (on) {
      // See-through parts (an aura shell) stay as they are: solid white they'd swallow the shape.
      if ((m.material as THREE.Material).transparent && !m.userData['evoMat']) return;
      if (!m.userData['evoMat']) m.userData['evoMat'] = m.material;
      m.material = SILHOUETTE;
    } else if (m.userData['evoMat']) {
      m.material = m.userData['evoMat'] as THREE.Material;
      delete m.userData['evoMat'];
    }
  });
}
