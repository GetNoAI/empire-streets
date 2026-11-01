import * as THREE from 'three';

/**
 * Speech bubbles over people's heads: ambient chatter between passers-by, a gang member's taunt,
 * an officer's "Police! Drop it!", a shopkeeper's hello. Minor talk happens in the world instead of
 * stopping the game in a dialogue box. Each bubble follows a point (a person's head), fades in and
 * out, shrinks with distance and hides when it's behind the camera or too far away.
 */

export type BubbleStyle = 'say' | 'shout' | 'police' | 'gang' | 'think' | 'tag';

interface Bubble {
  el: HTMLDivElement;
  at: () => { x: number; y: number; z: number } | null;
  until: number;
  born: number;
  key: string;
}

export const BUBBLES = {
  /** Further than this (m) and bubbles aren't shown. */
  range: 38,
  /** At most this many at once (the oldest go first). */
  max: 7,
  fade: 0.25,
} as const;

/** How long a line stays up: reading time with a floor and a ceiling (s). */
export function bubbleSeconds(text: string): number {
  return Math.max(2.2, Math.min(6.5, 1.2 + text.length * 0.055));
}

export class Bubbles {
  private readonly root: HTMLDivElement;
  private readonly list: Bubble[] = [];
  private time = 0;
  private readonly v = new THREE.Vector3();
  enabled = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'bubbles';
    parent.appendChild(this.root);
  }

  /** Says `text` over whatever `at` returns (null when it's gone). `key` replaces an earlier bubble with the same key. */
  say(key: string, at: () => { x: number; y: number; z: number } | null, text: string, style: BubbleStyle = 'say', seconds = bubbleSeconds(text)): void {
    if (!this.enabled) return;
    const old = this.list.findIndex((b) => b.key === key);
    if (old >= 0) this.drop(old);
    while (this.list.length >= BUBBLES.max) this.drop(0);
    const el = document.createElement('div');
    el.className = `bubble b-${style}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.list.push({ el, at, until: this.time + seconds, born: this.time, key });
  }

  has(key: string): boolean {
    return this.list.some((b) => b.key === key);
  }

  private drop(i: number): void {
    this.list[i].el.remove();
    this.list.splice(i, 1);
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      const p = b.at();
      if (!p || this.time > b.until) {
        this.drop(i);
        continue;
      }
      this.v.set(p.x, p.y, p.z);
      const dist = this.v.distanceTo(camera.position);
      this.v.project(camera);
      const visible = this.v.z < 1 && dist < BUBBLES.range && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      if (!visible) {
        b.el.style.display = 'none';
        continue;
      }
      const age = this.time - b.born;
      const left = b.until - this.time;
      const alpha = Math.min(1, age / BUBBLES.fade, left / BUBBLES.fade);
      const scale = Math.max(0.6, Math.min(1.05, 14 / Math.max(6, dist)));
      b.el.style.display = '';
      b.el.style.opacity = alpha.toFixed(2);
      b.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  }
}
