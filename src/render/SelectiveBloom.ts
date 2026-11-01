import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Selective bloom: only objects on BLOOM_LAYER glow.
 *
 * A plain bloom threshold can't tell a sunlit wall from a glowing eye (both come out around the
 * same HDR brightness at noon), so the glowing meshes are drawn a second time on their own (layer
 * BLOOM_LAYER, no lights, no environment) into a buffer that shares the scene's depth - anything
 * in front of them still hides them - and only that buffer is blurred and added over the frame.
 * The extra cost is one draw of a handful of small meshes plus the blur mips.
 *
 * Pipeline: RenderPass (HDR, half float, MSAA) -> GlowBloomPass -> OutputPass (tone mapping + sRGB).
 */

export const BLOOM_LAYER = 3;

export interface BloomSettings {
  strength: number;
  radius: number;
  /** Luminance threshold inside the glow buffer (0 = everything on the layer blooms). */
  threshold: number;
}

/** Marks an object (and its children) as glowing: drawn into the bloom buffer as well. */
export function markBloom(obj: THREE.Object3D, on = true): void {
  obj.traverse((o) => {
    if (on) o.layers.enable(BLOOM_LAYER);
    else o.layers.disable(BLOOM_LAYER);
  });
}

class GlowBloomPass extends UnrealBloomPass {
  /** One glow buffer per scene buffer (the composer ping-pongs; each has its own depth). */
  private readonly glowTargets = new Map<THREE.WebGLRenderTarget, THREE.WebGLRenderTarget>();
  private readonly mask = new THREE.Layers();
  private readonly clearTmp = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    size: THREE.Vector2,
    s: BloomSettings,
  ) {
    super(size, s.strength, s.radius, s.threshold);
    this.mask.set(BLOOM_LAYER);
  }

  private glowFor(rb: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
    let t = this.glowTargets.get(rb);
    if (!t || t.width !== rb.width || t.height !== rb.height) {
      t?.dispose();
      t = new THREE.WebGLRenderTarget(rb.width, rb.height, { type: THREE.HalfFloatType, depthBuffer: true });
      t.depthTexture = rb.depthTexture; // the scene's depth: hidden glows stay hidden
      this.glowTargets.set(rb, t);
    }
    return t;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const glow = this.glowFor(readBuffer);
    // 1. Glowing meshes only, emissive only (no lights, no environment), depth-tested against the scene.
    const cam = this.camera;
    const oldMask = cam.layers.mask;
    const oldBg = this.scene.background;
    const oldEnv = this.scene.environment;
    const oldAuto = renderer.autoClear;
    const oldShadow = renderer.shadowMap.autoUpdate;
    const oldClear = renderer.getClearColor(this.clearTmp);
    const oldAlpha = renderer.getClearAlpha();
    const oldMatrices = this.scene.matrixWorldAutoUpdate;
    cam.layers.mask = this.mask.mask;
    // The scene pass just brought every matrix up to date: don't walk the whole graph again.
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.background = null;
    this.scene.environment = null;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(glow);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false); // keep the shared depth
    renderer.render(this.scene, cam);
    cam.layers.mask = oldMask;
    this.scene.matrixWorldAutoUpdate = oldMatrices;
    this.scene.background = oldBg;
    this.scene.environment = oldEnv;
    renderer.shadowMap.autoUpdate = oldShadow;
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.autoClear = oldAuto;
    // 2. Bloom the glow buffer (UnrealBloomPass blends its result back into `glow`, unused).
    super.render(renderer, writeBuffer, glow, deltaTime, maskActive);
    // 3. Add the bloom (left in renderTargetsHorizontal[0] by the composite step) over the scene.
    const r = this as unknown as {
      fsQuad: { material: THREE.Material; render(r: THREE.WebGLRenderer): void };
      blendMaterial: THREE.Material;
      copyUniforms: Record<string, { value: unknown }>;
      renderTargetsHorizontal: THREE.WebGLRenderTarget[];
    };
    r.fsQuad.material = r.blendMaterial;
    r.copyUniforms.tDiffuse.value = r.renderTargetsHorizontal[0].texture;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    r.fsQuad.render(renderer);
    renderer.autoClear = oldAuto;
  }

  override dispose(): void {
    for (const t of this.glowTargets.values()) t.dispose();
    this.glowTargets.clear();
    super.dispose();
  }
}

export class SelectiveBloom {
  readonly composer: EffectComposer;
  readonly bloom: GlowBloomPass;
  enabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    settings: BloomSettings,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, // HDR: emissive 3.0+ survives until the bloom
      samples: 4, // keep MSAA (the default framebuffer's antialias doesn't apply to render targets)
    });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, rt);
    // (EffectComposer clones `rt` for its ping-pong buffer, depth texture included.)
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new GlowBloomPass(scene, camera, new THREE.Vector2(size.x, size.y), settings);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled) this.composer.render();
    else this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
