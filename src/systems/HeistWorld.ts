import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { audio } from '../audio/Audio';
import { GROUP, groups } from '../config';
import type { Creature } from '../creatures/Creature';
import type { CreatureModels } from '../creatures/CreatureModels';
import { Follower } from '../creatures/Follower';
import type { Effects } from '../fx/Effects';
import { Humanoid } from '../player/Humanoid';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { DropOff, HeistConfig, HeistRole, HeistState, HeistTarget, LootBag, Pt } from './heistManager.js';
import type { TuningWorld } from './TuningWorld';
import { withSurface } from '../render/Surfaces';

/**
 * The 3D side of heists (heistManager.js runs the rules): the storefronts, vault doors, display
 * cases and the armored truck; the planning spot at each job; guards that patrol and watch, and
 * cameras that sweep; the crew of Streetmon that follow you and go to work; loot bags; and the
 * lock-ups where you drop the loot. It also answers what the rules need each frame: who can see
 * you, which breach point or bag you're at, and whether you've pulled into a lock-up.
 */

export interface HeistWorldDeps {
  scene: THREE.Scene;
  world: RAPIER.World;
  effects: Effects;
  vehicles: VehicleManager;
  models: CreatureModels;
  tune: TuningWorld;
  config: HeistConfig;
  groundY(x: number, z: number): number;
  blocked(x: number, z: number): boolean;
  /** Camera position (for sound distance). */
  listener(): THREE.Vector3;
}

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

const GUARD = { range: 12, cosHalf: Math.cos((50 * Math.PI) / 180), closeRange: 4.5, walk: 1.3, pause: 2.5 };
const CAMERA = { range: 13, cosHalf: Math.cos((24 * Math.PI) / 180), sweep: 0.6, sweepSpeed: 0.55 };

interface Guard {
  model: Humanoid;
  cone: THREE.Mesh;
  home: Pt;
  to: Pt | null;
  x: number;
  z: number;
  heading: number;
  leg: 0 | 1;
  pause: number;
  out: number;
  speed: number;
}

interface Cam {
  pivot: THREE.Object3D;
  cone: THREE.Mesh;
  led: THREE.MeshBasicMaterial;
  x: number;
  y: number;
  z: number;
  /** Facing (yaw of the facade normal) and current sweep. */
  base: number;
  yaw: number;
  phase: number;
}

interface Site {
  target: HeistTarget;
  root: THREE.Group;
  /** Breach visuals: the thing that opens (door pivot, case glass, truck doors). */
  openers: Array<{ obj: THREE.Object3D; kind: 'door' | 'glass' | 'truck'; t: number; open: boolean }>;
  marker: THREE.Group;
  bodies: RAPIER.RigidBody[];
}

const mats = {
  steel: withSurface(new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.85, roughness: 0.35 }), 'bareMetal'),
  darkSteel: withSurface(new THREE.MeshStandardMaterial({ color: 0x3c4248, metalness: 0.8, roughness: 0.45 }), 'bareMetal'),
  gold: withSurface(new THREE.MeshStandardMaterial({ color: 0xd6a740, metalness: 0.9, roughness: 0.3 }), 'bareMetal'),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  window: new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0xffe9b0, emissiveIntensity: 0.45, roughness: 0.2 }),
  velvet: withSurface(new THREE.MeshStandardMaterial({ color: 0x4a1030, roughness: 0.9 }), 'fabric'),
  bag: withSurface(new THREE.MeshStandardMaterial({ color: 0x2b3a2a, roughness: 0.85 }), 'fabric'),
  strap: withSurface(new THREE.MeshStandardMaterial({ color: 0xd6c25a, roughness: 0.6 }), 'fabric'),
  truck: withSurface(new THREE.MeshStandardMaterial({ color: 0x5d6a58, metalness: 0.5, roughness: 0.55 }), 'paintedMetal'),
  tyre: withSurface(new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.95 }), 'rubber'),
  roll: withSurface(new THREE.MeshStandardMaterial({ color: 0x6f747a, metalness: 0.6, roughness: 0.5 }), 'bareMetal'),
  paint: new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  plan: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }),
  gem: new THREE.MeshStandardMaterial({ color: 0x7cf0ff, emissive: 0x2a8fb0, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.1 }),
};

/** A sign as a texture (white text on a coloured panel). */
function signTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 84);
  g.fillStyle = fg;
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A loot bag (a stuffed duffel with a gold strap). */
function bagMesh(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * scale, 0.5 * scale, 4, 10), mats.bag);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.24 * scale;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2 * scale, 0.025 * scale, 4, 12, Math.PI), mats.strap);
  strap.position.y = 0.42 * scale;
  g.add(body, strap);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

export class HeistWorld {
  private readonly sites = new Map<string, Site>();
  private readonly lockups: Array<{ d: DropOff; beam: THREE.Mesh; bay: THREE.Group }> = [];
  private guards: Guard[] = [];
  private cams: Cam[] = [];
  private crew: Array<{ role: HeistRole; f: Follower; creature: Creature }> = [];
  private bags: Array<{ bag: LootBag; mesh: THREE.Group; at: Pt; available: boolean; taken: boolean }> = [];
  private playerBag: THREE.Group | null = null;
  private haulerBag: THREE.Group | null = null;
  private target: HeistTarget | null = null;
  private camerasOn = true;
  private alarmOn = false;
  /** Kept in the scene, dark until an alarm (adding a light recompiles every lit material). */
  private readonly alarmLight = new THREE.PointLight(0xff2020, 0, 26, 1.6);
  private alarmLit = false;
  private breaching = -1;
  private sparkT = 0;
  private workT = 0;
  private time = 0;
  private escaping: string[] = [];

  constructor(private readonly d: HeistWorldDeps) {
    d.scene.add(this.alarmLight);
    for (const t of d.config.targets) this.buildSite(t);
    for (const dr of d.config.dropOffs) this.buildLockup(dr);
  }

  // ------------------------------------------------------------------ static dressing

  private facadeFrame(t: HeistTarget): { x: number; z: number; nx: number; nz: number; yaw: number } | null {
    const f = t.location.facade;
    if (!f) return null;
    return { x: f.x, z: f.z, nx: f.nx, nz: f.nz, yaw: Math.atan2(f.nx, f.nz) };
  }

  private buildSite(t: HeistTarget): void {
    const root = new THREE.Group();
    root.name = `heist-${t.id}`;
    const openers: Site['openers'] = [];
    const bodies: RAPIER.RigidBody[] = [];
    const F = this.facadeFrame(t);
    const gy = (p: Pt): number => this.d.groundY(p.x, p.z);
    if (F) {
      // Sign over the frontage.
      if (t.location.sign) {
        const colors: Record<string, string> = { bankVault: '#1d3557', jewelryStore: '#4a1030', checkCashing: '#c9a400' };
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: signTexture(t.location.sign, colors[t.kind] ?? '#333', t.kind === 'checkCashing' ? '#1a1a1a' : '#ffffff') }));
        sign.position.set(F.x + F.nx * 0.08, 5.2, F.z + F.nz * 0.08);
        sign.rotation.y = F.yaw;
        root.add(sign);
      }
      if (t.breach.mode === 'vault') {
        // A round vault door set in the wall (a pivot so it can swing open).
        const bp = t.location.breachPoints[0];
        const cx = F.x + F.nx * 0.02;
        const cz = F.z + F.nz * 0.02;
        const big = t.kind === 'bankVault';
        const R = big ? 1.35 : 0.85;
        const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.08, 0.14, 8, 32), mats.darkSteel);
        frame.position.set(cx, R + 0.2, cz);
        frame.rotation.y = F.yaw;
        root.add(frame);
        const hinge = new THREE.Group();
        // Hinge on one edge: the group's local +X is (nz, -nx) in the world.
        hinge.position.set(cx + F.nz * R, R + 0.2, cz - F.nx * R);
        hinge.rotation.y = F.yaw;
        const door = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.3, 32), mats.steel);
        door.rotation.x = Math.PI / 2;
        door.position.set(-R, 0, 0.16);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(R * 0.35, 0.05, 6, 20), mats.gold);
        wheel.position.set(-R, 0, 0.34);
        hinge.add(door, wheel);
        for (let k = 0; k < 3; k++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(R * 0.7, 0.06, 0.06), mats.gold);
          spoke.position.set(-R, 0, 0.34);
          spoke.rotation.z = (k * Math.PI) / 3;
          hinge.add(spoke);
        }
        root.add(hinge);
        openers.push({ obj: hinge, kind: 'door', t: 0, open: false });
        void bp;
      } else if (t.breach.mode === 'smash') {
        // A lit shop window and a display case at each breach point.
        const win = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(16, t.location.facade!.length - 4), 2.6), mats.window);
        win.position.set(F.x + F.nx * 0.04, 1.8, F.z + F.nz * 0.04);
        win.rotation.y = F.yaw;
        root.add(win);
        for (const bp of t.location.breachPoints) {
          const y = gy(bp);
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), mats.velvet);
          base.position.set(bp.x - F.nx * 0.5, y + 0.45, bp.z - F.nz * 0.5);
          base.rotation.y = F.yaw;
          const gems = new THREE.Group();
          for (let k = 0; k < 4; k++) {
            const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mats.gem);
            gem.position.set(-0.4 + k * 0.27, 0.98, 0);
            gems.add(gem);
          }
          gems.position.copy(base.position).setY(y);
          gems.rotation.y = F.yaw;
          const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.7), mats.glass);
          glass.position.set(base.position.x, y + 1.15, base.position.z);
          glass.rotation.y = F.yaw;
          root.add(base, gems, glass);
          openers.push({ obj: glass, kind: 'glass', t: 0, open: false });
          const body = this.d.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(base.position.x, y + 0.7, base.position.z));
          this.d.world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.7, 0.35).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), F.yaw)).setCollisionGroups(WORLD_GROUPS), body);
          bodies.push(body);
        }
      }
    } else if (t.location.truck) {
      // The armored truck (a static prop; length along its heading).
      const tr = t.location.truck;
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.5, 2.4), mats.truck);
      box.position.set(-0.6, 1.55, 0);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.9, 2.3), mats.truck);
      cab.position.set(2.5, 1.25, 0);
      const wind = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 2.0), mats.window);
      wind.position.set(3.41, 1.6, 0);
      g.add(box, cab, wind);
      for (const [x, z] of [
        [2.3, 1.15],
        [2.3, -1.15],
        [-1.9, 1.15],
        [-1.9, -1.15],
      ]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 14), mats.tyre);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.48, z);
        g.add(w);
      }
      const side = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('ARMORED', '#2a3324', '#e8e2c0') }));
      side.position.set(-0.6, 2.0, 1.21);
      const side2 = side.clone();
      side2.position.z = -1.21;
      side2.rotation.y = Math.PI;
      g.add(side, side2);
      // Rear doors on a pivot at the back.
      const doors = new THREE.Group();
      doors.position.set(-2.92, 1.55, -1.15);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 2.3), mats.darkSteel);
      leaf.position.set(0, 0, 1.15);
      doors.add(leaf);
      g.add(doors);
      openers.push({ obj: doors, kind: 'truck', t: 0, open: false });
      g.position.set(tr.x, 0, tr.z);
      g.rotation.y = tr.heading;
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      root.add(g);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr.heading);
      const body = this.d.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(tr.x, 1.4, tr.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      this.d.world.createCollider(RAPIER.ColliderDesc.cuboid(3.4, 1.4, 1.2).setCollisionGroups(WORLD_GROUPS), body);
      bodies.push(body);
    }
    // The planning spot: a gold ring and a floating briefcase.
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), mats.plan);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const brief = new THREE.Group();
    const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.16), withSurface(new THREE.MeshStandardMaterial({ color: 0x3a2618, emissive: 0x2a1508, emissiveIntensity: 0.4, roughness: 0.6 }), 'wood'));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 10, Math.PI), mats.gold);
    handle.position.y = 0.22;
    brief.add(case_, handle);
    brief.position.y = 1.4;
    marker.add(ring, brief);
    const pl = t.location.plan;
    marker.position.set(pl.x, this.d.groundY(pl.x, pl.z), pl.z);
    marker.userData['brief'] = brief;
    root.add(marker);
    this.d.scene.add(root);
    this.sites.set(t.id, { target: t, root, openers, marker, bodies });
  }

  private buildLockup(dr: DropOff): void {
    const g = new THREE.Group();
    const yaw = Math.atan2(dr.door.nx, dr.door.nz);
    // Corrugated roll-up door: stripes of slightly different greys.
    for (let k = 0; k < 9; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.36, 0.08), k % 2 ? mats.roll : mats.darkSteel);
      s.position.set(dr.door.x + dr.door.nx * 0.04, 0.35 + k * 0.37, dr.door.z + dr.door.nz * 0.04);
      s.rotation.y = yaw;
      g.add(s);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('LOCK-UP', '#202428', '#ffd23f') }));
    sign.position.set(dr.door.x + dr.door.nx * 0.06, 3.9, dr.door.z + dr.door.nz * 0.06);
    sign.rotation.y = yaw;
    g.add(sign);
    // Bay markings at the kerb.
    const bay = new THREE.Group();
    const lines: Array<[number, number, number, number]> = [
      [0, -3, 5.8, 0.15],
      [0, 3, 5.8, 0.15],
    ];
    for (const [ox, oz, w, h] of lines) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.paint);
      m.rotation.x = -Math.PI / 2;
      m.position.set(ox, 0.03, oz);
      m.rotation.z = 0;
      bay.add(m);
    }
    bay.position.set(dr.x, 0, dr.z);
    // Bays run along the kerb: rotate so the lines lie across the lane.
    bay.rotation.y = Math.abs(dr.door.nx) > 0.5 ? Math.PI / 2 : 0;
    g.add(bay);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.4, 70, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4be37a, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    beam.position.set(dr.x, 35, dr.z);
    beam.visible = false;
    g.add(beam);
    this.d.scene.add(g);
    this.lockups.push({ d: dr, beam, bay });
  }

  // ------------------------------------------------------------------ the job

  /** The crew comes out and security takes up position. */
  deploy(t: HeistTarget, crew: Partial<Record<HeistRole, Creature>>): void {
    this.cleanupJob();
    this.target = t;
    this.camerasOn = true;
    this.alarmOn = false;
    const F = this.facadeFrame(t);
    for (const gp of t.location.guards) {
      const m = new Humanoid({ skin: ['#c99a6e', '#8d5a3b', '#e0b48c'][this.guards.length % 3], hair: '#1a1a1a', top: '#1f2a44', legs: '#1a1f2b', shoes: '#111111', scale: 1 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 10), withSurface(new THREE.MeshStandardMaterial({ color: 0x141a2a }), 'plastic'));
      cap.position.set(0, 1.78, 0.02);
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), mats.gold);
      badge.position.set(0.1, 1.35, 0.17);
      m.root.add(cap, badge);
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      // Vision cone on the ground (a red fan).
      const fan = new THREE.Mesh(
        new THREE.CircleGeometry(GUARD.range, 20, -Math.acos(GUARD.cosHalf), 2 * Math.acos(GUARD.cosHalf)),
        new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.1, depthWrite: false }),
      );
      fan.rotation.x = -Math.PI / 2;
      this.d.scene.add(m.root, fan);
      // Face out to the street (facade normal) or across the truck. Humanoids use the car/player
      // convention: heading h faces (cos h, -sin h).
      const heading = F ? Math.atan2(-F.nz, F.nx) : (t.location.truck?.heading ?? 0) + Math.PI / 2;
      this.guards.push({ model: m, cone: fan, home: { x: gp.x, z: gp.z }, to: gp.patrolTo ?? null, x: gp.x, z: gp.z, heading, leg: 0, pause: Math.random() * 2, out: 0, speed: 0 });
    }
    for (const cp of t.location.cameras) {
      const pivot = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), mats.darkSteel);
      body.position.z = 0.25;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.48;
      const led = new THREE.MeshBasicMaterial({ color: 0xff2020 });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), led);
      dot.position.set(0.08, 0.08, 0.4);
      pivot.add(body, lens, dot);
      const yaw = F ? Math.atan2(F.nx, F.nz) : 0;
      pivot.position.set(cp.x, cp.y, cp.z);
      pivot.rotation.order = 'YXZ';
      pivot.rotation.y = yaw;
      pivot.rotation.x = 0.35;
      const cone = new THREE.Mesh(
        new THREE.CircleGeometry(CAMERA.range, 16, -Math.acos(CAMERA.cosHalf), 2 * Math.acos(CAMERA.cosHalf)),
        new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.12, depthWrite: false }),
      );
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(cp.x, this.d.groundY(cp.x, cp.z) + 0.05, cp.z);
      this.d.scene.add(pivot, cone);
      this.cams.push({ pivot, cone, led, x: cp.x, y: cp.y, z: cp.z, base: yaw, yaw, phase: Math.random() * 6 });
    }
    // The crew: followers in a loose formation behind you.
    const spots = [
      { back: 1.5, side: 1.0 },
      { back: 1.6, side: -1.0 },
      { back: 2.8, side: 0 },
    ];
    let k = 0;
    for (const [role, c] of Object.entries(crew) as Array<[HeistRole, Creature]>) {
      const f = new Follower(this.d.scene, this.d.models, (x, z) => this.d.groundY(x, z), (x, z) => this.d.blocked(x, z));
      f.offset = spots[k++ % spots.length];
      this.crew.push({ role, f, creature: c });
    }
    this.site(t)?.marker && (this.site(t)!.marker.visible = false);
  }

  private site(t: HeistTarget | null): Site | null {
    return t ? (this.sites.get(t.id) ?? null) : null;
  }

  /** Summons the crew next to the player (call once after deploy, with the player position). */
  summonCrew(at: THREE.Vector3): void {
    for (const c of this.crew) c.f.summon(c.creature, at);
  }

  setCameras(on: boolean): void {
    this.camerasOn = on;
    for (const c of this.cams) {
      c.led.color.setHex(on ? 0xff2020 : 0x202020);
      c.cone.visible = on;
    }
    if (!on) audio.sfx('sfx_jam', 0);
  }

  /** Smoke at a point: guards in range are out cold for `seconds`. Returns how many. */
  smoke(x: number, z: number, radius: number, seconds: number): number {
    this.d.tune.smokeCloud(x, 0, z, Math.min(radius, 10), seconds, 26);
    let n = 0;
    for (const g of this.guards) {
      if (g.out > 0 || Math.hypot(g.x - x, g.z - z) > radius) continue;
      g.out = seconds;
      g.model.lieDown();
      g.cone.visible = false;
      n++;
    }
    audio.sfx('sfx_nitrous_hiss', 0);
    return n;
  }

  alarm(): void {
    this.alarmOn = true;
    const t = this.target;
    if (!t) return;
    const c = t.location.facade ?? t.location.truck!;
    this.alarmLight.position.set(c.x, 4.5, c.z);
    this.alarmLit = true;
    for (const g of this.guards) g.cone.visible = false;
  }

  breachStarted(i: number): void {
    this.breaching = i;
    const t = this.target;
    const br = this.crew.find((c) => c.role === 'breacher');
    if (t && br) {
      const p = t.location.breachPoints[i];
      const F = this.facadeFrame(t);
      // Stand just off the point, toward the street.
      br.f.goal = F ? { x: p.x + F.nx * 0.4 + -F.nz * 0.8, z: p.z + F.nz * 0.4 + F.nx * 0.8 } : { x: p.x + 0.9, z: p.z };
    }
  }

  breachStopped(): void {
    this.breaching = -1;
    for (const c of this.crew) {
      c.f.goal = null;
      c.f.work = false;
    }
  }

  /** The door (or case, or truck) opens and the loot is there to take. */
  breachDone(i: number, bags: LootBag[]): void {
    const t = this.target;
    if (!t) return;
    this.breachStopped();
    const site = this.site(t);
    const op = site?.openers[t.breach.mode === 'smash' ? i : 0];
    if (op) op.open = true;
    const at = t.location;
    for (const b of bags) {
      if (this.bags.some((x) => x.bag.index === b.index)) continue;
      const p = at.loot[b.index] ?? at.loot[0];
      const mesh = bagMesh();
      mesh.position.set(p.x, this.d.groundY(p.x, p.z), p.z);
      mesh.rotation.y = Math.random() * Math.PI;
      this.d.scene.add(mesh);
      this.bags.push({ bag: b, mesh, at: p, available: true, taken: false });
    }
    audio.sfx(t.breach.mode === 'smash' ? 'sfx_glass' : 'sfx_vault_open', 0);
    if (t.breach.mode === 'smash') {
      const p = at.breachPoints[i];
      this.d.effects.sparks(p.x, 1.2, p.z, 14);
    }
  }

  lootTaken(bag: LootBag): void {
    const b = this.bags.find((x) => x.bag.index === bag.index);
    if (!b) return;
    b.taken = true;
    b.mesh.visible = false;
    audio.sfx('sfx_bag', 0);
  }

  escapeStarted(drops: DropOff[]): void {
    this.escaping = drops.map((d) => d.id);
    for (const l of this.lockups) l.beam.visible = this.escaping.includes(l.d.id);
  }

  /** Everything from the job goes away (the site's dressing stays; doors close again later). */
  cleanupJob(): void {
    for (const g of this.guards) {
      g.model.root.removeFromParent();
      g.cone.removeFromParent();
      g.cone.geometry.dispose();
    }
    this.guards = [];
    for (const c of this.cams) {
      c.pivot.removeFromParent();
      c.cone.removeFromParent();
      c.cone.geometry.dispose();
    }
    this.cams = [];
    for (const c of this.crew) c.f.recall();
    this.crew = [];
    for (const b of this.bags) b.mesh.removeFromParent();
    this.bags = [];
    this.playerBag?.removeFromParent();
    this.playerBag = null;
    this.haulerBag?.removeFromParent();
    this.haulerBag = null;
    this.alarmLight.intensity = 0;
    this.alarmLit = false;
    for (const l of this.lockups) l.beam.visible = false;
    this.escaping = [];
    this.breaching = -1;
    if (this.target) {
      const s = this.site(this.target);
      if (s) s.marker.visible = true;
    }
    this.target = null;
  }

  /** The site resets (door shut, cases whole) once its cooldown is over. */
  resetSite(id: string): void {
    const s = this.sites.get(id);
    if (!s) return;
    for (const o of s.openers) {
      o.open = false;
      o.t = 0;
      this.applyOpener(o);
    }
  }

  // ------------------------------------------------------------------ queries

  /** How many watchers see the player right now (guards awake, cameras on), weighted by distance. */
  seenBy(px: number, py: number, pz: number, inCar: boolean): number {
    if (!this.target || this.alarmOn) return 0;
    let n = 0;
    for (const g of this.guards) {
      if (g.out > 0) continue;
      const dx = px - g.x;
      const dz = pz - g.z;
      const d = Math.hypot(dx, dz);
      if (d > GUARD.range) continue;
      const fx = Math.cos(g.heading);
      const fz = -Math.sin(g.heading);
      if ((dx * fx + dz * fz) / (d || 1) < GUARD.cosHalf && d > 1.5) continue;
      if (this.d.tune.sightBlocked(g.x, 1.6, g.z, px, py + 1, pz)) continue;
      n += (d < GUARD.closeRange ? 1.5 : 1) * (inCar ? 0.6 : 1);
    }
    if (this.camerasOn)
      for (const c of this.cams) {
        const dx = px - c.x;
        const dz = pz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > CAMERA.range || d < 0.5) continue;
        const fx = Math.sin(c.yaw);
        const fz = Math.cos(c.yaw);
        if ((dx * fx + dz * fz) / d < CAMERA.cosHalf) continue;
        if (this.d.tune.sightBlocked(c.x, c.y, c.z, px, py + 1, pz)) continue;
        n += 1;
      }
    return n;
  }

  guardsAwake(): number {
    return this.guards.filter((g) => g.out <= 0).length;
  }

  nearBreach(px: number, pz: number): number {
    const t = this.target;
    if (!t) return -1;
    let best = -1;
    let bd = 2.0;
    t.location.breachPoints.forEach((p, i) => {
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  nearLoot(px: number, pz: number): number {
    let best = -1;
    let bd = 1.8;
    for (const b of this.bags) {
      if (b.taken || !b.available) continue;
      const d = Math.hypot(b.mesh.position.x - px, b.mesh.position.z - pz);
      if (d < bd) {
        bd = d;
        best = b.bag.index;
      }
    }
    return best;
  }

  /** A lock-up you've stopped at during the getaway. */
  atDropOff(px: number, pz: number, speed: number): string | null {
    if (speed > 4) return null;
    for (const l of this.lockups) if (this.escaping.includes(l.d.id) && Math.hypot(l.d.x - px, l.d.z - pz) < l.d.radius) return l.d.id;
    return null;
  }

  /** A job's planning spot under the player. */
  planSpotAt(px: number, pz: number): HeistTarget | null {
    for (const s of this.sites.values()) {
      const p = s.target.location.plan;
      if (s.marker.visible && Math.hypot(p.x - px, p.z - pz) < 1.6) return s.target;
    }
    return null;
  }

  // ------------------------------------------------------------------ per frame

  /**
   * @param player the player's position; `facing` their heading (car/player convention);
   * `carried` bags on the player and on the hauler; `hide` the crew (driving, battles).
   */
  update(dt: number, s: { state: HeistState; player: THREE.Vector3; facing: number; hide: boolean; playerBags: number; haulerBags: number; playerModel: THREE.Object3D; cooldowns: Record<string, number> }): void {
    this.time += dt;
    // Planning spots bob; a site on cooldown has no marker.
    for (const site of this.sites.values()) {
      const onCd = (s.cooldowns[site.target.id] ?? 0) > 0;
      const busy = this.target?.id === site.target.id;
      site.marker.visible = !onCd && !busy && s.state !== 'PLANNING';
      const brief = site.marker.userData['brief'] as THREE.Object3D;
      brief.rotation.y = this.time * 1.2;
      brief.position.y = 1.4 + Math.sin(this.time * 2) * 0.1;
      // Doors swing / cases empty.
      for (const o of site.openers) {
        const want = o.open ? 1 : 0;
        if (o.t !== want) {
          o.t = want > o.t ? Math.min(1, o.t + dt * 0.6) : Math.max(0, o.t - dt);
          this.applyOpener(o);
        }
      }
      if (!busy && !onCd && site.openers.some((o) => o.open)) this.resetSite(site.target.id);
    }
    for (const l of this.lockups) if (l.beam.visible) (l.beam.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.1 * Math.sin(this.time * 4);
    // Keep the armored truck's parking spot and the lock-up bays clear of parked cars.
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      const spots: Pt[] = [...this.d.config.dropOffs, ...this.d.config.targets.flatMap((t) => (t.location.truck ? [t.location.truck] : []))];
      for (const car of [...this.d.vehicles.cars]) {
        if (car.driver !== null || car.disposed || this.d.vehicles.owned.has(car)) continue;
        if (spots.some((sp) => Math.hypot(car.position.x - sp.x, car.position.z - sp.z) < 6)) this.d.vehicles.remove(car);
      }
    }
    if (!this.target) return;
    // Guards patrol, look around, wake up.
    for (const g of this.guards) {
      if (g.out > 0) {
        g.out -= dt;
        if (g.out <= 0) {
          g.model.standUp();
          g.cone.visible = !this.alarmOn;
        }
      } else if (this.alarmOn) {
        // On the radio: back to the door, watching you.
        const want = Math.atan2(-(s.player.z - g.z), s.player.x - g.x);
        g.heading = turn(g.heading, want, dt * 4);
        g.speed = 0;
      } else if (g.to) {
        const goal = g.leg === 0 ? g.to : g.home;
        const dx = goal.x - g.x;
        const dz = goal.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) {
          g.pause -= dt;
          g.speed = 0;
          // Glance out at the street while paused.
          g.heading = turn(g.heading, g.heading + Math.sin(this.time * 0.7) * 0.6, dt);
          if (g.pause <= 0) {
            g.leg = g.leg === 0 ? 1 : 0;
            g.pause = GUARD.pause + Math.random() * 1.5;
          }
        } else {
          g.speed = GUARD.walk;
          g.heading = turn(g.heading, Math.atan2(-dz, dx), dt * 4);
          const st = Math.min(d, GUARD.walk * dt);
          g.x += (dx / d) * st;
          g.z += (dz / d) * st;
        }
      } else {
        g.speed = 0;
        g.heading += Math.sin(this.time * 0.5 + g.home.x) * dt * 0.4;
      }
      const y = this.d.groundY(g.x, g.z);
      g.model.root.position.set(g.x, y, g.z);
      g.model.root.rotation.y = g.heading;
      g.model.update(dt, g.speed, true);
      g.cone.position.set(g.x, y + 0.04, g.z);
      // The fan lies flat (rotation.x -90°): its angle θ points along (cos θ, -sin θ), the same
      // convention as the heading.
      g.cone.rotation.z = g.heading;
    }
    // Cameras sweep.
    for (const c of this.cams) {
      if (this.camerasOn && !this.alarmOn) c.yaw = c.base + Math.sin(this.time * CAMERA.sweepSpeed + c.phase) * CAMERA.sweep;
      c.pivot.rotation.y = c.yaw;
      c.cone.rotation.z = c.yaw - Math.PI / 2;
      c.cone.visible = this.camerasOn && !this.alarmOn;
    }
    if (this.alarmLit) this.alarmLight.intensity = Math.sin(this.time * 9) > 0 ? 18 : 0;
    // The crew follows; the breacher works.
    this.workT += dt;
    for (const c of this.crew) {
      if (c.f.goal) {
        const at = Math.hypot(c.f.x - c.f.goal.x, c.f.z - c.f.goal.z) < 0.6;
        // Retrigger the (one-shot) attack clip every 0.7 s while at it.
        c.f.work = at && this.workT % 0.7 > 0.05;
      }
      c.f.update(dt, s.player, s.facing, c.creature, s.hide);
    }
    if (this.breaching >= 0 && this.target) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.15;
        const p = this.target.location.breachPoints[this.breaching];
        const F = this.facadeFrame(this.target);
        const x = F ? p.x - F.nx * 1.2 : p.x;
        const z = F ? p.z - F.nz * 1.2 : p.z;
        this.d.effects.sparks(x, 1.2, z, 5);
        if (Math.random() < 0.3) audio.sfx('sfx_drill', { x, y: 1, z });
      }
    }
    // Bags on backs.
    this.attachBags(s.playerModel, s.playerBags, s.haulerBags);
  }

  private applyOpener(o: Site['openers'][number]): void {
    const k = o.t * o.t * (3 - 2 * o.t);
    if (o.kind === 'door') o.obj.rotation.y = (o.obj.userData['yaw0'] ??= o.obj.rotation.y) - k * 1.7;
    else if (o.kind === 'truck') o.obj.rotation.y = -k * 1.9;
    else o.obj.visible = o.t < 0.5;
  }

  private attachBags(playerModel: THREE.Object3D, playerBags: number, haulerBags: number): void {
    if (playerBags > 0 && !this.playerBag) {
      this.playerBag = bagMesh(0.85);
      this.playerBag.position.set(0, 1.0, -0.28);
      this.playerBag.rotation.y = Math.PI / 2;
      playerModel.add(this.playerBag);
    } else if (playerBags === 0 && this.playerBag) {
      this.playerBag.removeFromParent();
      this.playerBag = null;
    }
    if (this.playerBag) this.playerBag.scale.setScalar(Math.min(1.6, 0.85 + playerBags * 0.12));
    const hauler = this.crew.find((c) => c.role === 'hauler');
    const inst = hauler?.f.inst;
    if (haulerBags > 0 && inst && !this.haulerBag) {
      this.haulerBag = bagMesh(0.9);
      this.haulerBag.position.set(0, Math.max(0.5, hauler!.f.height * 0.85), -0.1);
      inst.root.add(this.haulerBag);
    } else if (haulerBags === 0 && this.haulerBag) {
      this.haulerBag.removeFromParent();
      this.haulerBag = null;
    }
    if (this.haulerBag) this.haulerBag.scale.setScalar(Math.min(1.8, 0.9 + haulerBags * 0.15));
  }

  /** For the map: every job's planning spot and every lock-up. */
  mapPoints(): { jobs: Array<{ t: HeistTarget; x: number; z: number }>; lockups: DropOff[] } {
    return { jobs: [...this.sites.values()].map((s) => ({ t: s.target, x: s.target.location.plan.x, z: s.target.location.plan.z })), lockups: this.lockups.map((l) => l.d) };
  }

  /** Which lock-ups are active for the getaway. */
  get activeDropOffs(): string[] {
    return this.escaping;
  }
}

function turn(from: number, to: number, max: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}
