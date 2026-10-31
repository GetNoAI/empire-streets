import * as THREE from 'three';
import { ALL_SPECIES, species } from '../creatures/Data';
import { buildCreatureModel } from '../creatures/models/Builders';

/**
 * Portrait icons of creatures for the menus (party, stash, dex, battle cards). Each species is
 * rendered once (three-quarter view, idle pose) into a small offscreen canvas and cached as an
 * image URL.
 *
 * Making one takes ~70 ms (building the model, a render, a PNG encode), which used to land in the
 * middle of play the first time a species showed up on a battle card or the party bar. So icons
 * are kept between sessions (localStorage), and the ones still missing are made one per frame
 * while you're on the title and starter screens (`warmStep`), where a slow frame doesn't matter.
 */
/** Bump when the model builders change (the key also changes when a species' look data does). */
const ICON_VERSION = 1;
const storeKey = (): string => {
  let h = 0;
  for (const ch of JSON.stringify(ALL_SPECIES().map((s) => [s.id, s.model]))) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `empire-streets.icons.v${ICON_VERSION}.${(h >>> 0).toString(36)}`;
};
export class CreatureIcons {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private readonly cache = new Map<string, string>();
  private readonly size = 128;
  private saveTimer = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(storeKey());
      const saved = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      for (const [k, v] of Object.entries(saved)) if (typeof v === 'string' && v.startsWith('data:image/')) this.cache.set(k, v);
    } catch {
      /* private mode, blocked or corrupt storage: just make them again */
    }
  }

  /** Makes the next missing (non-shiny) icon, if any. Returns true while there's work left. */
  warmStep(): boolean {
    const next = ALL_SPECIES().find((s) => !this.cache.has(s.id));
    if (!next) return false;
    this.url(next.id, false);
    return true;
  }

  private persist(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      try {
        const out: Record<string, string> = {};
        for (const [k, v] of this.cache) if (v && !k.endsWith('_s')) out[k] = v;
        const key = storeKey();
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('empire-streets.icons.') && k !== key) localStorage.removeItem(k); // older model versions
        }
        localStorage.setItem(key, JSON.stringify(out));
      } catch {
        /* storage full or blocked: they'll be made again next time */
      }
    }, 1500);
  }

  private ensure(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(this.size, this.size, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setClearColor(0x000000, 0);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3530, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 3);
    this.scene.add(key);
    this.renderer = r;
    return r;
  }

  /** Image URL for a species (shiny variant optional). */
  url(id: string, shiny = false): string {
    const k = `${id}${shiny ? '_s' : ''}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    let url = '';
    try {
      const r = this.ensure();
      const m = buildCreatureModel(species(id), shiny);
      m.root.rotation.y = 0.55;
      this.scene.add(m.root);
      const h = m.height;
      const w = Math.max(m.bbox.max.x - m.bbox.min.x, m.bbox.max.z - m.bbox.min.z);
      const size = Math.max(h, w * 0.9);
      const dist = (size / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.25;
      this.camera.position.set(0, h * 0.62, dist);
      this.camera.lookAt(0, h * 0.48, 0);
      r.render(this.scene, this.camera);
      url = r.domElement.toDataURL('image/png');
      this.scene.remove(m.root);
      m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
    } catch {
      url = '';
    }
    this.cache.set(k, url);
    if (url) this.persist();
    return url;
  }

  /** `<img>` markup (empty string if rendering isn't available). */
  img(id: string, shiny = false, cls = 'cicon'): string {
    const u = this.url(id, shiny);
    return u ? `<img class="${cls}" src="${u}" alt="" />` : `<span class="${cls} none"></span>`;
  }
}
