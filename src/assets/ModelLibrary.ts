import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterModel } from '../player/Humanoid';

/**
 * Optional model slots. public/models/manifest.json maps vehicle ids and "player" to .glb files.
 * Anything missing (or failing to load) falls back to the procedural models, so the game always runs.
 */

export interface ModelEntry {
  url: string;
  /** Extra rotation about Y in degrees, if the model doesn't face +X. */
  rotationY?: number;
  /** Hide the procedural wheels when the model has its own (static) wheels. */
  hideProceduralWheels?: boolean;
}

interface Manifest {
  vehicles?: Record<string, ModelEntry | null>;
  player?: ModelEntry | null;
}

export class ModelLibrary {
  private readonly vehicles = new Map<string, { scene: THREE.Object3D; entry: ModelEntry }>();
  private player: { gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }; entry: ModelEntry } | null = null;

  async load(onProgress?: (msg: string) => void): Promise<void> {
    let manifest: Manifest;
    try {
      const res = await fetch('models/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      manifest = (await res.json()) as Manifest;
    } catch {
      return;
    }
    const loader = new GLTFLoader();
    const tasks: Promise<void>[] = [];
    for (const [id, entry] of Object.entries(manifest.vehicles ?? {})) {
      if (!entry?.url) continue;
      tasks.push(
        loader
          .loadAsync(entry.url)
          .then((g) => {
            this.vehicles.set(id, { scene: g.scene, entry });
            onProgress?.(`Loaded model for ${id}`);
          })
          .catch((e: unknown) => console.warn(`[models] ${entry.url} failed, using procedural ${id}:`, e)),
      );
    }
    const pe = manifest.player;
    if (pe?.url) {
      tasks.push(
        loader
          .loadAsync(pe.url)
          .then((g) => {
            this.player = { gltf: { scene: g.scene, animations: g.animations }, entry: pe };
          })
          .catch((e: unknown) => console.warn(`[models] ${pe.url} failed, using procedural player:`, e)),
      );
    }
    await Promise.all(tasks);
  }

  /** A copy of the vehicle model scaled to `length` (along +X), centred, wheels-on-ground at y = groundY. */
  vehicleModel(id: string, length: number, groundY: number): { object: THREE.Object3D; hideWheels: boolean } | null {
    const v = this.vehicles.get(id);
    if (!v) return null;
    const obj = v.scene.clone(true);
    const holder = new THREE.Group();
    obj.rotation.y = THREE.MathUtils.degToRad(v.entry.rotationY ?? 0);
    holder.add(obj);
    fitTo(holder, length, groundY);
    holder.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { object: holder, hideWheels: !!v.entry.hideProceduralWheels };
  }

  playerModel(): CharacterModel | null {
    if (!this.player) return null;
    return new GltfCharacter(this.player.gltf.scene, this.player.gltf.animations, this.player.entry);
  }
}

/** Uniformly scales an object so its X extent equals `length`, centres it in X/Z and sets its base at groundY. */
function fitTo(obj: THREE.Object3D, length: number, groundY: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = size.x > 0 ? length / size.x : 1;
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y += groundY - box.min.y;
}

/** A rigged glTF character, 1.8 m tall, with idle/walk/run clips picked by name if present. */
class GltfCharacter implements CharacterModel {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private readonly inner: THREE.Object3D;

  constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[], entry: ModelEntry) {
    this.inner = cloneSkinned(scene);
    this.inner.rotation.y = THREE.MathUtils.degToRad(entry.rotationY ?? 0);
    const holder = new THREE.Group();
    holder.add(this.inner);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const h = box.max.y - box.min.y;
    if (h > 0) holder.scale.setScalar(1.8 / h);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    holder.position.y -= box.min.y;
    holder.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.root.add(holder);
    this.mixer = new THREE.AnimationMixer(this.inner);
    for (const clip of clips) {
      const n = clip.name.toLowerCase();
      const key = n.includes('run') ? 'run' : n.includes('walk') ? 'walk' : n.includes('idle') ? 'idle' : null;
      if (key && !this.actions[key]) this.actions[key] = this.mixer.clipAction(clip);
    }
    this.play('idle');
  }

  private play(name: 'idle' | 'walk' | 'run'): void {
    const a = this.actions[name] ?? this.actions.idle ?? null;
    if (!a || a === this.current) return;
    a.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = a;
  }

  update(dt: number, speed: number, grounded: boolean): void {
    this.play(!grounded || speed < 0.3 ? 'idle' : speed < 3.2 ? 'walk' : 'run');
    this.mixer.update(dt);
  }

  sit(): void {
    this.play('idle');
  }

  lieDown(): void {
    this.root.rotation.z = Math.PI / 2;
  }

  standUp(): void {
    this.root.rotation.z = 0;
  }
}
