import * as THREE from 'three';
import { markBloom } from '../render/SelectiveBloom';

/**
 * In-world guidance to the map waypoint (or a quest target):
 *
 *  - glowing chevrons painted along the road ahead of you, following the route and drifting
 *    forwards, spaced out further while you're driving;
 *  - a tall beam of light over the destination, visible over the rooftops;
 *  - a compass pointer at the top of the screen: which way to turn, the name and the distance.
 *
 * `routeAhead` (pure, unit-tested) walks the route from the point nearest you.
 */

const MAX_CHEVRONS = 48;

export interface GuidePoint {
  x: number;
  z: number;
  /** Direction along the route (radians, atan2(dz, dx)). */
  dir: number;
  /** Distance along the route from you (m). */
  d: number;
}

/**
 * Points every `step` metres along `path` (from the point on it nearest `at`), up to `reach`
 * metres ahead, starting `phase` metres in (0..step: animates the drift).
 */
type P = { x: number; z: number };

/** Where `p` falls along a→b (0 at a, 1 at b) and how far it is from that line. */
function along(p: P, a: P, b: P): { t: number; d: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L2 = dx * dx + dz * dz || 1;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
  return { t, d: Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / Math.sqrt(L2) };
}

/**
 * Tidies a road route (from -> junctions -> to) so it never doubles back:
 *  - if you're already part-way along the first road (beside it, past its first junction), that
 *    junction is dropped: you head straight on to the next one instead of back to it;
 *  - likewise at the end: a destination part-way along the last road doesn't send you to the far
 *    junction and back;
 *  - a lone junction you'd have to walk past and come back from is dropped too.
 * `side`: how far off the road's centre line still counts as beside it (pavement included).
 */
export function trimRoute(from: P, nodes: readonly P[], to: P, side = 10): P[] {
  const n = [...nodes];
  while (n.length >= 2) {
    const a = along(from, n[0], n[1]);
    if (a.t > 0.02 && a.t < 1 && a.d < side) n.shift();
    else break;
  }
  while (n.length >= 2) {
    const a = along(to, n[n.length - 2], n[n.length - 1]);
    if (a.t > 0 && a.t < 0.98 && a.d < side) n.pop();
    else break;
  }
  if (n.length === 1) {
    // You and the destination on the same road through a lone junction: if it isn't between
    // you (you'd walk past and come back), skip it. A real corner is always kept.
    const j = n[0];
    const sameAve = Math.abs(from.x - j.x) < side && Math.abs(to.x - j.x) < side;
    const sameStreet = Math.abs(from.z - j.z) < side && Math.abs(to.z - j.z) < side;
    if ((sameAve || sameStreet) && (j.x - from.x) * (to.x - j.x) + (j.z - from.z) * (to.z - j.z) < 0) n.pop();
  }
  return [from, ...n, to];
}

export function routeAhead(path: ReadonlyArray<{ x: number; z: number }>, at: { x: number; z: number }, step: number, reach: number, phase = 0): GuidePoint[] {
  if (path.length < 2) return [];
  // Nearest segment.
  let best = 0;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / L2));
    const d = Math.hypot(a.x + dx * t - at.x, a.z + dz * t - at.z);
    if (d < bestD) {
      bestD = d;
      best = i;
      bestT = t;
    }
  }
  const out: GuidePoint[] = [];
  let i = best;
  let t = bestT;
  let travelled = 0;
  let next = Math.max(0.01, phase);
  while (i < path.length - 1 && out.length < 200) {
    const a = path[i];
    const b = path[i + 1];
    const segL = Math.hypot(b.x - a.x, b.z - a.z);
    const left = segL * (1 - t);
    if (travelled + left >= next) {
      const into = next - travelled;
      t += segL > 0 ? into / segL : 1;
      travelled = next;
      if (travelled > reach) break;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dir: Math.atan2(b.z - a.z, b.x - a.x), d: travelled });
      next += step;
    } else {
      travelled += left;
      i++;
      t = 0;
    }
  }
  return out;
}

export class WaypointGuide {
  private readonly chevrons: THREE.InstancedMesh;
  private readonly chevMat: THREE.MeshBasicMaterial;
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly el: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private t = 0;

  constructor(scene: THREE.Scene, parent: HTMLElement) {
    // A flat chevron (pointing +x), 1.6 m wide.
    const shape = new THREE.Shape();
    shape.moveTo(0.55, 0);
    shape.lineTo(-0.25, 0.8);
    shape.lineTo(-0.6, 0.8);
    shape.lineTo(0.2, 0);
    shape.lineTo(-0.6, -0.8);
    shape.lineTo(-0.25, -0.8);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    // Solid (not additive) so they read on pale pavement too; they still glow through the bloom.
    this.chevMat = new THREE.MeshBasicMaterial({ color: 0xffc81a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    this.chevrons = new THREE.InstancedMesh(geo, this.chevMat, MAX_CHEVRONS);
    this.chevrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chevrons.frustumCulled = false;
    this.chevrons.renderOrder = 4;
    this.chevrons.count = 0;
    markBloom(this.chevrons);
    scene.add(this.chevrons);
    // The beam: an open cylinder fading upwards.
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    const tex = new THREE.CanvasTexture(c);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 120, 16, 1, true).translate(0, 60, 0), this.beamMat);
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    scene.add(this.beam);
    // Compass pointer.
    this.el = document.createElement('div');
    this.el.className = 'wp-guide';
    this.el.innerHTML = '<div class="wp-arrow"></div><div class="wp-label"></div>';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.arrow = this.el.querySelector('.wp-arrow') as HTMLDivElement;
    this.label = this.el.querySelector('.wp-label') as HTMLDivElement;
  }

  /** Hides everything (a cinematic, a menu). */
  hide(): void {
    this.chevrons.count = 0;
    this.beam.visible = false;
    if (this.el.style.display !== 'none') this.el.style.display = 'none';
  }

  /**
   * Per frame. `path`: the route (empty for none); `target`: the destination; `name`: what it is.
   * `show`: false hides everything (menus, battles, underground).
   */
  update(dt: number, o: { path: ReadonlyArray<{ x: number; z: number }>; target: { x: number; z: number } | null; name: string; at: THREE.Vector3; camera: THREE.Camera; driving: boolean; show: boolean; groundAt?: (x: number, z: number) => number }): void {
    this.t += dt;
    const on = o.show && !!o.target;
    if (!on) {
      this.chevrons.count = 0;
      this.beam.visible = false;
      if (this.el.style.display !== 'none') this.el.style.display = 'none';
      return;
    }
    const T = o.target!;
    // Chevrons: closer together on foot, further apart and further ahead in a car.
    // Far enough ahead to see where the route goes, and all the way in once it's that close.
    const step = o.driving ? 8 : 4;
    const reach = o.driving ? 220 : 120;
    const pts = routeAhead(o.path, o.at, step, reach, 2 + ((this.t * (o.driving ? 6 : 2.5)) % step));
    let n = 0;
    for (const pt of pts) {
      if (n >= MAX_CHEVRONS) break;
      // Fade in a little ahead of you, out towards the end of the reach.
      const k = Math.min(1, (pt.d - 1.5) / 4) * Math.min(1, (reach - pt.d) / (reach * 0.35));
      if (k <= 0.02) continue;
      const sc = (o.driving ? 1.8 : 1.15) * (0.6 + 0.4 * k);
      this.q.setFromAxisAngle(this.up, -pt.dir);
      this.s.set(sc, 1, sc);
      this.p.set(pt.x, o.groundAt ? o.groundAt(pt.x, pt.z) + 0.04 : 0.2, pt.z);
      this.m.compose(this.p, this.q, this.s);
      this.chevrons.setMatrixAt(n++, this.m);
    }
    this.chevrons.count = n;
    this.chevrons.instanceMatrix.needsUpdate = true;
    this.chevMat.opacity = 0.75 + 0.2 * Math.sin(this.t * 4);
    // Beam over the destination.
    this.beam.visible = true;
    this.beam.position.set(T.x, 0, T.z);
    this.beamMat.opacity = 0.4 + 0.15 * Math.sin(this.t * 2.5);
    // Compass: the direction to a point 15 m along the route (or straight at the target).
    const look = routeAhead(o.path, o.at, 15, 15, 15)[0] ?? T;
    o.camera.getWorldDirection(this.fwd);
    const camYaw = Math.atan2(this.fwd.x, -this.fwd.z);
    const toYaw = Math.atan2(look.x - o.at.x, -(look.z - o.at.z));
    let rel = toYaw - camYaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.arrow.style.transform = `rotate(${rel.toFixed(3)}rad)`;
    const dist = Math.hypot(T.x - o.at.x, T.z - o.at.z);
    const txt = `${o.name ? `${o.name} · ` : ''}${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`}`;
    if (this.label.textContent !== txt) this.label.textContent = txt;
    if (this.el.style.display !== 'flex') this.el.style.display = 'flex';
  }
}
