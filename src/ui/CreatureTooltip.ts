import * as THREE from 'three';
import { maxHp, displayName, type Creature } from '../creatures/Creature';
import { species, typeInfo } from '../creatures/Data';

/**
 * Health bar for the Streetmon under the mouse: the crosshair while the mouse is captured, or the
 * mouse pointer otherwise. Shows name, level, whose it is, types and HP above the creature.
 */

export interface Inspectable {
  creature: Creature;
  x: number;
  y: number;
  z: number;
  height: number;
  /** "Wild", "Yours", "Dre's", "Police" ... */
  owner: string;
}

export class CreatureTooltip {
  private readonly el: HTMLDivElement;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private shownKey = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'ctip';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  /** `mouse`: pixel position, or null to use the screen centre (crosshair). */
  update(camera: THREE.PerspectiveCamera, mouse: { x: number; y: number } | null, list: Inspectable[]): Inspectable | null {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (mouse) this.ndc.set((mouse.x / w) * 2 - 1, -(mouse.y / h) * 2 + 1);
    else this.ndc.set(0, 0);
    this.ray.setFromCamera(this.ndc, camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    let best: Inspectable | null = null;
    let bestT = 60;
    for (const it of list) {
      const r = Math.max(0.4, it.height * 0.55);
      const cx = it.x - o.x;
      const cy = it.y + it.height * 0.5 - o.y;
      const cz = it.z - o.z;
      const tc = cx * d.x + cy * d.y + cz * d.z;
      if (tc < 0) continue;
      const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      if (d2 > r * r || tc > bestT) continue;
      bestT = tc;
      best = it;
    }
    if (!best) {
      if (this.el.style.display !== 'none') this.el.style.display = 'none';
      this.shownKey = '';
      return null;
    }
    // Position above the creature's head.
    this.tmp.set(best.x, best.y + best.height + 0.25, best.z).project(camera);
    if (this.tmp.z > 1) {
      this.el.style.display = 'none';
      return null;
    }
    const sx = (this.tmp.x * 0.5 + 0.5) * w;
    const sy = (-this.tmp.y * 0.5 + 0.5) * h;
    this.el.style.display = 'block';
    this.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    const c = best.creature;
    const mx = maxHp(c);
    const key = `${c.uid}|${c.hp}|${c.level}|${best.owner}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      const f = c.hp / mx;
      const sp = species(c.speciesId);
      this.el.innerHTML = `<div class="ctip-name">${displayName(c)}${c.shiny ? ' <span class="shiny">★</span>' : ''} <span>Lv ${c.level}</span></div>
        <div class="ctip-sub"><em>${best.owner}</em> ${sp.types.map((t) => `<span class="tbadge" style="background:${typeInfo(t).color}">${typeInfo(t).name}</span>`).join('')}</div>
        <div class="ctip-hp"><i style="width:${(f * 100).toFixed(0)}%;background:${f > 0.5 ? '#4cd964' : f > 0.2 ? '#ffcc00' : '#ff3b30'}"></i></div>
        <div class="ctip-num">${c.hp} / ${mx} HP</div>`;
    }
    return best;
  }

  hide(): void {
    this.el.style.display = 'none';
    this.shownKey = '';
  }
}
