import * as THREE from 'three';
import { displayName, maxHp, type Creature } from '../creatures/Creature';

/** A Streetmon that can be labelled: where it is, how tall, and whose it is. */
export interface Inspectable {
  creature: Creature;
  x: number;
  y: number;
  z: number;
  height: number;
  /** "Wild", "Yours", "Dre's", "Police" ... */
  owner: string;
}

/**
 * Name, level and health over every Streetmon you can actually see: within `range` metres of the
 * camera and with a clear line of sight (no wall or building in between). They fade in and out at
 * the edge of the range, shrink a little with distance, and a label lingers a moment when the
 * line of sight breaks, so a lamp post going past doesn't make it flicker.
 */

export const LABELS = {
  /** Shown within this many metres of the camera, fading over the last `fade` metres. */
  range: 26,
  fade: 5,
  /** Seconds between line-of-sight checks for one creature, and how long a label lingers after it breaks. */
  recheck: 0.2,
  linger: 0.4,
  /** At most this many at once (the nearest). */
  max: 12,
};

interface Label {
  el: HTMLDivElement;
  name: HTMLSpanElement;
  bar: HTMLElement;
  key: string;
  losAt: number;
  seenUntil: number;
  used: boolean;
}

export class CreatureLabels {
  private readonly root: HTMLDivElement;
  private readonly labels = new Map<string, Label>();
  private readonly tmp = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private time = 0;
  visible = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'clabels';
    parent.appendChild(this.root);
  }

  /** `clear(from, to)`: true when nothing solid is between the two points. */
  update(dt: number, camera: THREE.PerspectiveCamera, list: Inspectable[], clear: (from: THREE.Vector3, to: THREE.Vector3) => boolean): void {
    this.time += dt;
    for (const l of this.labels.values()) l.used = false;
    if (this.visible) {
      const cam = camera.getWorldPosition(this.from);
      const near = list
        .map((it) => ({ it, d: Math.hypot(it.x - cam.x, it.y + it.height * 0.6 - cam.y, it.z - cam.z) }))
        .filter((e) => e.d < LABELS.range)
        .sort((a, b) => a.d - b.d)
        .slice(0, LABELS.max);
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const { it, d } of near) {
        const id = `${it.creature.uid}`;
        let l = this.labels.get(id);
        if (!l) {
          const el = document.createElement('div');
          el.className = 'clabel';
          el.innerHTML = '<span class="cl-name"></span><div class="cl-hp"><i></i></div>';
          this.root.appendChild(el);
          l = { el, name: el.querySelector('.cl-name') as HTMLSpanElement, bar: el.querySelector('.cl-hp i') as HTMLElement, key: '', losAt: -1, seenUntil: -1, used: false };
          this.labels.set(id, l);
        }
        l.used = true;
        // Line of sight from the camera to the creature's middle (checked a few times a second).
        if (this.time >= l.losAt) {
          l.losAt = this.time + LABELS.recheck * (0.75 + Math.random() * 0.5);
          this.to.set(it.x, it.y + it.height * 0.6, it.z);
          if (clear(cam, this.to)) l.seenUntil = this.time + LABELS.linger;
        }
        const top = this.tmp.set(it.x, it.y + it.height + 0.3, it.z).project(camera);
        const onScreen = top.z < 1 && Math.abs(top.x) < 1.1 && Math.abs(top.y) < 1.1;
        if (!onScreen || this.time > l.seenUntil) {
          l.el.style.opacity = '0';
          continue;
        }
        const c = it.creature;
        const mx = maxHp(c);
        const key = `${c.hp}|${c.level}|${c.speciesId}|${it.owner}`;
        if (key !== l.key) {
          l.key = key;
          const f = Math.max(0, c.hp / mx);
          const owner = it.owner === 'Wild' ? '' : ` <em>${it.owner}</em>`;
          l.name.innerHTML = `${displayName(c)}${c.shiny ? ' <b>★</b>' : ''} <small>Lv ${c.level}</small>${owner}`;
          l.bar.style.width = `${(f * 100).toFixed(0)}%`;
          l.bar.style.background = f > 0.5 ? '#4cd964' : f > 0.2 ? '#ffcc00' : '#ff3b30';
          l.el.classList.toggle('mine', it.owner === 'Yours');
        }
        const fade = Math.min(1, (LABELS.range - d) / LABELS.fade);
        const scale = Math.max(0.7, 1.1 - d / 60);
        l.el.style.opacity = fade.toFixed(2);
        l.el.style.transform = `translate(${Math.round((top.x * 0.5 + 0.5) * w)}px, ${Math.round((-top.y * 0.5 + 0.5) * h)}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
        l.el.style.zIndex = String(1000 - Math.round(d * 10));
      }
    }
    for (const [id, l] of this.labels) {
      if (l.used) continue;
      l.el.remove();
      this.labels.delete(id);
    }
  }
}
