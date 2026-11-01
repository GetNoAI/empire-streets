import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { species } from './Data';
import { buildCreatureModel } from './models/Builders';
import { ATLAS } from './models/Atlas';
import { platform } from '../mobile/Platform';
import { atlasRole, type AtlasTextures } from './models/AtlasTextures';
import { markBloom } from '../render/SelectiveBloom';
import { ATTACK_CLIPS, type AttackStyle } from './models/Motion';

/**
 * Creature model instances for the game. Loads the exported .glb (public/creatures, so artists can
 * replace a file with a better model of the same name and rig) and falls back to building the
 * procedural model in code if the file is missing or fails to load. Models are loaded on first use
 * and cached; each instance gets its own skeleton and animation mixer.
 *
 * Every model references the same three atlas images (colour, normal, ORM); the first copy loaded
 * is shared by all later models so the GPU holds one of each. Glowing parts go on the bloom layer.
 */

const MAP_SLOTS = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const;

/** Atlas textures seen so far, by role: later models reuse these instances. */
const sharedAtlas: Partial<AtlasTextures> = {};

/** Points a loaded model's atlas textures at the shared instances. Returns how many slots were swapped. */
export function shareAtlasTextures(root: THREE.Object3D, cache: Partial<AtlasTextures> = sharedAtlas): number {
  let swapped = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    for (const slot of MAP_SLOTS) {
      const tex = mat[slot];
      const role = atlasRole(tex);
      if (!tex || !role) continue;
      const shared = cache[role];
      if (!shared) {
        tex.anisotropy = Math.max(tex.anisotropy, 4);
        cache[role] = tex;
      } else if (shared !== tex) {
        mat[slot] = shared;
        tex.dispose();
        swapped++;
      }
    }
  });
  return swapped;
}

/** True for a creature's glowing parts (eyes, cores, neon trims): emissive 3.0+ or pulsing. */
export function isGlowMesh(mesh: THREE.Mesh): boolean {
  const m = mesh.material as THREE.MeshStandardMaterial;
  return !Array.isArray(m) && !!m && !m.name?.endsWith('_aura') && (!!m.userData?.pulse || (m.emissiveIntensity ?? 0) >= 3);
}

export interface CreatureInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  /** Plays a clip; loops for idle/walk/evolve_glow, holds the last frame for faint. */
  play(name: string, fade?: number, speed?: number): void;
  /**
   * Plays the attack clip for a move style (attack_strike, _shoot ...; the all-purpose `attack`
   * on older models). `speed` > 1 plays it faster. Returns how long it runs and when the move
   * leaves the Streetmon (seconds, at that speed).
   */
  attack(style: AttackStyle, speed?: number): { duration: number; release: number };
  current: string;
  dispose(): void;
}

interface Source {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

const LOOPING = new Set(['idle', 'walk', 'evolve_glow', 'idle_curled']);

/** Emissive pulse a model's glow material carries in its glTF extras (see models/Polish GLOW). */
interface Pulse {
  hz: number;
  amount: number;
  base: number;
}

/**
 * Gives each glowing material of an instance its own copy that pulses (eyes slow and subtle,
 * cores and power lines faster and deeper), with a random phase so a group doesn't throb in step.
 */
export function attachEmissivePulse(root: THREE.Object3D, now: () => number = () => performance.now() / 1000): number {
  let n = 0;
  const phase = Math.random() * Math.PI * 2;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const pulse = (mesh.material as THREE.Material).userData?.pulse as Pulse | undefined;
    if (!pulse || !(pulse.hz > 0)) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = mat;
    const w = Math.PI * 2 * pulse.hz;
    mesh.onBeforeRender = () => {
      mat.emissiveIntensity = pulse.base * (1 + pulse.amount * Math.sin(now() * w + phase));
    };
    n++;
  });
  return n;
}

/** Phones load the 1024 px atlas copies (a quarter of the texture memory) in place of the 2048 ones. */
function atlasManager(): THREE.LoadingManager {
  const m = new THREE.LoadingManager();
  if (platform.touch) m.setURLModifier((url) => (/streetmon_(color|normal|orm)\.png$/.test(url) ? url.replace(/\.png$/, `${ATLAS.phoneSuffix}.png`) : url));
  return m;
}

export class CreatureModels {
  private readonly loader = new GLTFLoader(atlasManager());
  private readonly sources = new Map<string, Promise<Source>>();
  private manifest: Promise<Set<string>> | null = null;

  private files(): Promise<Set<string>> {
    this.manifest ??= fetch('creatures/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<{ creatures: Array<{ file: string; shiny: { file: string } }> }>) : { creatures: [] }))
      .then((m) => new Set(m.creatures.flatMap((c) => [c.file, c.shiny.file])))
      .catch(() => new Set<string>());
    return this.manifest;
  }

  private source(id: string, shiny: boolean): Promise<Source> {
    const key = `${id}${shiny ? '_shiny' : ''}`;
    let p = this.sources.get(key);
    if (!p) {
      p = this.files().then(async (files) => {
        const file = `creatures/${key}.glb`;
        if (files.has(file)) {
          try {
            const g = await this.loader.loadAsync(file);
            shareAtlasTextures(g.scene);
            return { scene: g.scene, clips: g.animations };
          } catch (e) {
            console.warn(`Streetmon model ${file} failed to load, using the built-in one`, e);
          }
        }
        const m = buildCreatureModel(species(id), shiny);
        return { scene: m.root, clips: m.clips };
      });
      this.sources.set(key, p);
    }
    return p;
  }

  /** Starts loading a species ahead of time. */
  preload(id: string, shiny = false): void {
    void this.source(id, shiny);
  }

  async instance(id: string, shiny = false): Promise<CreatureInstance> {
    const src = await this.source(id, shiny);
    const root = cloneSkinned(src.scene);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow the animation
        if (isGlowMesh(o as THREE.Mesh)) markBloom(o);
      }
    });
    attachEmissivePulse(root);
    const mixer = new THREE.AnimationMixer(root);
    const clips = new Map(src.clips.map((c) => [c.name, c]));
    let action: THREE.AnimationAction | null = null;
    const inst: CreatureInstance = {
      root,
      mixer,
      clips,
      current: '',
      play(name: string, fade = 0.15, speed = 1): void {
        const clip = clips.get(name);
        if (!clip || (name === inst.current && !name.startsWith('attack'))) return;
        const next = mixer.clipAction(clip);
        next.reset();
        next.timeScale = speed;
        if (LOOPING.has(name)) next.setLoop(THREE.LoopRepeat, Infinity);
        else {
          next.setLoop(THREE.LoopOnce, 1);
          next.clampWhenFinished = true;
        }
        next.play();
        if (action && action !== next && fade > 0) action.crossFadeTo(next, fade, false);
        else if (action !== next) action?.stop();
        action = next;
        inst.current = name;
      },
      attack(style: AttackStyle, speed = 1): { duration: number; release: number } {
        const name = clips.has(`attack_${style}`) ? `attack_${style}` : 'attack';
        inst.play(name, 0.06, speed);
        const T = ATTACK_CLIPS[style];
        if (name === 'attack') return { duration: 0.6 / speed, release: 0.12 / speed };
        return { duration: T.duration / speed, release: T.release / speed };
      },
      dispose(): void {
        mixer.stopAllAction();
        root.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m?.userData?.pulse) m.dispose(); // the per-instance pulse copies
        });
        root.removeFromParent();
      },
    };
    inst.play('idle', 0);
    return inst;
  }
}
