import * as THREE from 'three';
import { CinematicPlayer, type Anchor, type CinematicConfig, type CinematicDef, type ShotActor } from '../systems/cinematics.js';
import type { CreatureInstance, CreatureModels } from '../creatures/CreatureModels';
import { buildCarVisual, chassisRestHeight, type CarVisual } from '../vehicles/CarModel';
import { getSpec } from '../vehicles/specs';

/**
 * The world side of a cinematic (the rules are in systems/cinematics.js): it drives the camera,
 * draws the letterbox, captions and fades, and puts the shot's actors (Streetmon and cars) in the
 * street. Traffic that would drive through the actors is hidden for the shot.
 */
export interface CinematicHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  models: CreatureModels;
  groundAt(x: number, z: number): number;
  /** The game's own anchors (player, mama, boss...). Null: unknown, use the player. */
  anchor(name: string): Anchor | null;
  /** Cars that are part of the world (hidden near car actors for the shot). */
  worldCars(): Array<{ visual: CarVisual; position: THREE.Vector3 }>;
  shake(amount: number): void;
}

interface LiveActor {
  def: ShotActor;
  root: THREE.Object3D | null;
  inst?: CreatureInstance;
  car?: CarVisual;
  wheelR?: number;
  lastX?: number;
  lastZ?: number;
  sirenT?: number;
}

export class CinematicView {
  private readonly el: HTMLDivElement;
  private readonly cap: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly black: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private player: CinematicPlayer | null = null;
  private host: CinematicHost | null = null;
  private vars: Record<string, string> = {};
  private actors: LiveActor[] = [];
  private hidden = new Set<CarVisual>();
  /** After it ends: the black fades back out over the game. */
  private outFade = 0;
  private shotSerial = 0;
  private readonly look = new THREE.Vector3();
  private bars = 0;
  private letterbox = 0.11;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cine';
    this.el.innerHTML = `<div class="cine-bar top"></div><div class="cine-bar bottom"></div>
      <div class="cine-caption"><div class="cine-title"></div><div class="cine-sub"></div></div>
      <div class="cine-skip">Space / Enter / Esc to skip</div><div class="cine-black"></div>`;
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.cap = this.el.querySelector('.cine-title') as HTMLDivElement;
    this.sub = this.el.querySelector('.cine-sub') as HTMLDivElement;
    this.black = this.el.querySelector('.cine-black') as HTMLDivElement;
    this.hint = this.el.querySelector('.cine-skip') as HTMLDivElement;
  }

  get active(): boolean {
    return !!this.player;
  }

  get id(): string | null {
    return this.player?.def.id ?? null;
  }

  /** The music the playing cinematic asks for (null: none of its own). */
  get music(): 'intro' | 'action' | null {
    return this.player?.def.music ?? null;
  }

  /** Point the world should stream around (traffic, people): what the camera is looking at. */
  get focus(): THREE.Vector3 {
    return this.look;
  }

  play(def: CinematicDef, config: CinematicConfig, host: CinematicHost, vars: Record<string, string> = {}): void {
    if (this.player) this.finish();
    this.player = new CinematicPlayer(def, config.settings);
    this.host = host;
    this.vars = vars;
    this.letterbox = config.settings.letterbox;
    this.outFade = 0;
    this.bars = 0;
    // Start loading the shot's Streetmon now so they're ready when their shot comes up.
    for (const s of def.shots) for (const a of s.actors ?? []) if (a.kind === 'creature' && a.species) host.models.preload(a.species, !!a.shiny);
    this.hint.style.display = this.player.skippable ? '' : 'none';
    this.el.style.display = 'block';
    this.el.classList.add('on');
  }

  skip(): void {
    if (!this.player) return;
    const ev = this.player.skip();
    if (ev.length) this.end(true);
  }

  /** Per frame. Returns 'end' on the frame it finishes (the game then hands the camera back). */
  update(dt: number): 'end' | null {
    const P = this.player;
    if (!P) {
      this.fadeBack(dt);
      return null;
    }
    const H = this.host!;
    for (const e of P.update(dt)) {
      if (e.type === 'shot') this.startShot();
      else if (e.type === 'shotEnd') this.clearActors();
      else if (e.type === 'end') {
        this.end(false);
        return 'end';
      }
    }
    const a = this.anchorNow();
    const pose = P.pose(a);
    H.camera.position.set(pose.cam[0], pose.cam[1], pose.cam[2]);
    this.look.set(pose.look[0], pose.look[1], pose.look[2]);
    H.camera.lookAt(this.look);
    this.updateActors(dt, a);
    // Letterbox slides in over the first half second.
    this.bars = Math.min(1, this.bars + dt * 2);
    const bh = `${(this.letterbox * 100 * this.bars).toFixed(2)}vh`;
    (this.el.children[0] as HTMLElement).style.height = bh;
    (this.el.children[1] as HTMLElement).style.height = bh;
    const c = P.caption();
    this.cap.textContent = this.fill(c.text);
    this.sub.textContent = this.fill(c.sub);
    (this.cap.parentElement as HTMLElement).style.opacity = c.alpha.toFixed(3);
    this.black.style.opacity = P.black().toFixed(3);
    return null;
  }

  private fill(s: string): string {
    return s.replace(/\{(\w+)\}/g, (_, k: string) => this.vars[k] ?? '');
  }

  private anchorNow(): Anchor {
    const P = this.player!;
    const H = this.host!;
    const a = H.anchor(P.anchor);
    if (a) return { ...a, y: a.y ?? H.groundAt(a.x, a.z) };
    return { x: 0, z: 0, y: 0 };
  }

  private startShot(): void {
    const P = this.player!;
    const H = this.host!;
    const s = P.shot;
    this.clearActors();
    const serial = ++this.shotSerial;
    if (s.shake) H.shake(s.shake);
    for (const d of s.actors ?? []) {
      const live: LiveActor = { def: d, root: null };
      this.actors.push(live);
      if (d.kind === 'car') {
        const spec = getSpec(d.spec!);
        const v = buildCarVisual(spec, d.color ?? spec.colors[0]);
        v.head.emissiveIntensity = 1.2;
        v.tail.emissiveIntensity = 0.5;
        live.car = v;
        live.root = v.root;
        live.wheelR = spec.wheelRadius;
        live.sirenT = 0;
        const lift = chassisRestHeight(spec);
        v.root.userData['cineLift'] = lift;
        // No physics here: put the wheels where the suspension would (front pair first, as Car does).
        v.wheels.forEach((w, i) => w.pivot.position.set(i < 2 ? spec.wheelBase / 2 : -spec.wheelBase / 2, spec.wheelRadius - lift, i % 2 ? spec.track / 2 : -spec.track / 2));
        H.scene.add(v.root);
      } else {
        void H.models.instance(d.species!, !!d.shiny).then((inst) => {
          // The shot may be over (or skipped) by the time it loads.
          if (serial !== this.shotSerial || !this.player) {
            inst.dispose();
            return;
          }
          live.inst = inst;
          live.root = inst.root;
          if (d.scale) inst.root.scale.multiplyScalar(d.scale);
          inst.play(d.clip ?? 'idle', 0);
          H.scene.add(inst.root);
        });
      }
    }
    this.updateActors(0, this.anchorNow());
  }

  private updateActors(dt: number, a: Anchor): void {
    const P = this.player!;
    const H = this.host!;
    for (const live of this.actors) {
      if (!live.root) continue;
      const p = P.actorPose(live.def, a);
      const g = H.groundAt(p.x, p.z);
      if (live.car) {
        live.root.position.set(p.x, g + (live.root.userData['cineLift'] as number), p.z);
        live.root.rotation.set(0, p.heading, 0);
        const moved = live.lastX === undefined ? 0 : Math.hypot(p.x - live.lastX, p.z - (live.lastZ ?? p.z));
        for (const w of live.car.wheels) w.spinner.rotation.z -= moved / (live.wheelR ?? 0.35);
        if (live.car.lightbar && live.def.siren) {
          live.sirenT = (live.sirenT ?? 0) + dt;
          const flash = Math.floor(live.sirenT * 6) % 2 === 0;
          live.car.lightbar.red.emissiveIntensity = flash ? 6 : 0.2;
          live.car.lightbar.blue.emissiveIntensity = flash ? 0.2 : 6;
        }
      } else if (live.inst) {
        live.root.position.set(p.x, g, p.z);
        live.root.rotation.y = p.heading;
        live.inst.play(p.moving ? 'walk' : (live.def.clip ?? 'idle'));
        if (dt > 0) live.inst.mixer.update(dt);
      }
      live.lastX = p.x;
      live.lastZ = p.z;
    }
    this.hideTraffic();
  }

  /** World cars near a car actor's path vanish for the shot (they'd drive through each other). */
  private hideTraffic(): void {
    const H = this.host!;
    const P = this.player!;
    const paths = this.actors.filter((l) => l.car);
    if (!paths.length) return;
    const a = this.anchorNow();
    const segs = paths.map((l) => {
      const from = { ...l.def, to: l.def.from, delay: 0 };
      const to = { ...l.def, from: l.def.to ?? l.def.from, delay: 0 };
      return [P.actorPose(from, a), P.actorPose(to, a)];
    });
    for (const c of H.worldCars()) {
      if (this.hidden.has(c.visual)) continue;
      for (const [p0, p1] of segs) {
        if (distToSeg(c.position.x, c.position.z, p0.x, p0.z, p1.x, p1.z) < 14) {
          c.visual.root.visible = false;
          this.hidden.add(c.visual);
          break;
        }
      }
    }
  }

  /** Is this world car hidden by the shot (its driver shouldn't be drawn either)? */
  hides(v: CarVisual): boolean {
    return this.hidden.has(v);
  }

  private clearActors(): void {
    const H = this.host;
    for (const live of this.actors) {
      if (live.root) H?.scene.remove(live.root);
      if (live.car) {
        live.car.paint.dispose();
        live.car.tail.dispose();
        live.car.head.dispose();
      }
      live.inst?.dispose();
    }
    this.actors = [];
    for (const v of this.hidden) v.root.visible = true;
    this.hidden.clear();
    this.shotSerial++;
  }

  private end(skipped: boolean): void {
    this.clearActors();
    // A finished one ends on black and fades back into the game; a skipped one cuts straight back.
    this.outFade = skipped ? 0.35 : 1;
    this.black.style.opacity = this.outFade.toFixed(3);
    this.finish();
  }

  private finish(): void {
    this.player = null;
    this.host = null;
    (this.cap.parentElement as HTMLElement).style.opacity = '0';
    (this.el.children[0] as HTMLElement).style.height = '0';
    (this.el.children[1] as HTMLElement).style.height = '0';
    this.hint.style.display = 'none';
  }

  private fadeBack(dt: number): void {
    if (this.outFade <= 0) {
      if (this.el.style.display !== 'none') {
        this.el.style.display = 'none';
        this.el.classList.remove('on');
      }
      return;
    }
    this.outFade = Math.max(0, this.outFade - dt * 1.6);
    this.black.style.opacity = this.outFade.toFixed(3);
  }
}

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
