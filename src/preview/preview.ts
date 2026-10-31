import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ALL_SPECIES, species, typeInfo, type TypeId } from '../creatures/Data';
import { buildCreatureModel } from '../creatures/models/Builders';

/**
 * Turntable preview of the exported Streetmon .glb files (public/creatures, built by
 * `npm run creatures`). Pick a creature and a clip; toggle shiny; "Line-up" shows every model
 * side by side at true scale.
 */

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  triangles: number;
  drawCalls: number;
  clips: string[];
  bbox: { min: number[]; max: number[] };
  shiny: { file: string; triangles: number };
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1e25');
// Neutral studio reflections so metal reads as metal (the game uses its sky for this).
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
camera.position.set(2.2, 1.4, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight('#cfe3ff', '#3a3530', 1.4));
const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
sun.shadow.camera.right = sun.shadow.camera.top = 8;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(20, 20, '#555a66', '#2c3038');
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
grid.position.y = 0.002;
scene.add(grid);

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const load = (url: string): Promise<GLTF> => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url)!;
};

let entries: ManifestEntry[] = [];
const holder = new THREE.Group();
scene.add(holder);
const mixers: THREE.AnimationMixer[] = [];

async function show(): Promise<void> {
  const id = $<HTMLSelectElement>('creature').value;
  const clipName = $<HTMLSelectElement>('clip').value;
  const shiny = $<HTMLInputElement>('shiny').checked;
  const lineup = $<HTMLInputElement>('lineup').checked;
  holder.clear();
  mixers.length = 0;
  const list = lineup ? entries : entries.filter((e) => e.id === id);
  let x = 0;
  const placed: Array<{ obj: THREE.Object3D; w: number }> = [];
  const live = $<HTMLInputElement>('live').checked;
  for (const e of list) {
    // Live: build straight from the builder code (no export step), for working on models.
    const gltf = live ? liveModel(e.id, shiny) : await load(shiny ? e.shiny.file : e.file);
    const obj = live ? gltf.scene : (await import('three/addons/utils/SkeletonUtils.js')).clone(gltf.scene);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const mixer = new THREE.AnimationMixer(obj);
    const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations[0];
    if (clip) {
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      if (clip.name === 'faint') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.play();
    }
    mixers.push(mixer);
    const w = e.bbox.max[0] - e.bbox.min[0];
    placed.push({ obj, w: Math.max(0.6, w) });
    holder.add(obj);
  }
  // Lay out side by side.
  const total = placed.reduce((s, p) => s + p.w + 0.4, -0.4);
  x = -total / 2;
  for (const p of placed) {
    p.obj.position.x = x + p.w / 2;
    x += p.w + 0.4;
  }
  const e = entries.find((q) => q.id === id)!;
  const spec = species(id);
  $('types').innerHTML = spec.types
    .map((t: TypeId) => `<span class="badge" style="background:${typeInfo(t).color}">${typeInfo(t).name}</span>`)
    .join('') + `<span class="stats">#${String(spec.dex).padStart(3, '0')} · stage ${spec.stage} · ${spec.model.height} m</span>`;
  $('stats').textContent = lineup
    ? `${entries.length} creatures`
    : `${e.triangles} triangles · ${e.drawCalls} draw calls · clips: ${e.clips.join(', ')}`;
  $('desc').textContent = spec.description;
  const h = lineup ? 2.4 : spec.model.height;
  controls.target.set(0, h * 0.5, 0);
  const dist = lineup ? total * 0.75 + 2 : h * 2.6 + 0.8;
  camera.position.set(dist * 0.55, h * 0.8 + 0.3, dist);
}

function liveModel(id: string, shiny: boolean): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const m = buildCreatureModel(species(id), shiny);
  return { scene: m.root, animations: m.clips };
}

async function init(): Promise<void> {
  try {
    const res = await fetch('creatures/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status}`);
    entries = ((await res.json()) as { creatures: ManifestEntry[] }).creatures;
  } catch {
    // No exported files yet: fall back to building live.
    $<HTMLInputElement>('live').checked = true;
    entries = ALL_SPECIES().map((sp) => {
      const m = buildCreatureModel(sp);
      const b = { min: m.bbox.min.toArray(), max: m.bbox.max.toArray() };
      return { id: sp.id, name: sp.name, file: '', triangles: m.triangles, drawCalls: m.drawCalls, clips: m.clips.map((c) => c.name), bbox: b, shiny: { file: '', triangles: m.triangles } };
    });
    $('desc').innerHTML = '<span class="err">No exported files (run <code>npm run creatures</code>); showing live builds.</span>';
  }
  const sel = $<HTMLSelectElement>('creature');
  sel.innerHTML = entries.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  const clipSel = $<HTMLSelectElement>('clip');
  const fillClips = (): void => {
    const e = entries.find((q) => q.id === sel.value)!;
    const keep = clipSel.value || 'idle';
    clipSel.innerHTML = e.clips.map((c) => `<option ${c === keep ? 'selected' : ''}>${c}</option>`).join('');
  };
  const params = new URLSearchParams(location.search);
  if (params.get('id')) sel.value = params.get('id')!;
  fillClips();
  if (params.get('clip')) clipSel.value = params.get('clip')!;
  if (params.get('shiny')) $<HTMLInputElement>('shiny').checked = true;
  if (params.get('lineup')) $<HTMLInputElement>('lineup').checked = true;
  sel.addEventListener('change', () => {
    fillClips();
    void show();
  });
  if (params.get('live')) $<HTMLInputElement>('live').checked = true;
  for (const id of ['clip', 'shiny', 'lineup', 'live']) $(id).addEventListener('change', () => void show());
  await show();
  (window as unknown as { __preview: unknown }).__preview = { entries, holder, mixers, show };
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  for (const m of mixers) m.update(dt);
  if ($<HTMLInputElement>('spin').checked) for (const c of holder.children) c.rotation.y += dt * 0.5;
  controls.update();
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
void init();
