import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { createCreature, type Creature } from '../creatures/Creature';
import { districtAt } from '../creatures/SpawnRules';
import type { Effects } from '../fx/Effects';
import { copLook } from '../peds/CrowdRenderer';
import type { Ped, PedestrianSystem } from '../peds/PedestrianSystem';
import { Humanoid } from '../player/Humanoid';
import { withSurface } from '../render/Surfaces';
import type { Bubbles } from '../ui/Bubbles';
import type { WeaponSystem } from '../weapons/WeaponSystem';
import type { CityLayout } from '../world/CityLayout';
import { BOSS, GANG, MEMBER_NAMES, QUEST, ROSTER, fightSpot, gangEvent, gangHitChance, hideoutLayout, hostileOnSight, lockerLoot, memberLevel, newGangState, questUnlocked, streetCrewsActive, type GangState, type HideoutLayout } from '../gangs/Gangs';

/**
 * The Gutter Kings in the world (rules: src/gangs/Gangs.ts): their crews on the street corners, the
 * courier, the hideout under Downtown with its guards, lockers and King Rook, Detective Alvarez who
 * starts the story, and the police who turn up to a gang fight on the street.
 *
 * Members are people in the crowd (role 'gang', moved from here), so the player's guns, cars and
 * the police all treat them as bodies. A fight is two things at once: the nearest member with a
 * Streetmon sets it on yours (a battle, run by the game) while the rest shoot from range.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface GangDeps {
  scene: THREE.Scene;
  world: RAPIER.World;
  peds: PedestrianSystem;
  weapons: WeaponSystem;
  effects: Effects;
  layout: CityLayout;
  bubbles: Bubbles;
  player(): { x: number; y: number; z: number; feetY: number; moving: boolean; inCar: boolean; dead: boolean; onFoot: boolean };
  layer(): string;
  hurtPlayer(amount: number, cause: string, fromX: number, fromZ: number): void;
  /** A squad officer shoots at the (wanted) player. */
  copFiresAtPlayer(cop: Ped): void;
  bestLevel(): number;
  streetCred(): number;
  wanted(): number;
  toast(text: string, ms?: number): void;
  big(text: string, color: string): void;
  /** Starts a battle against this member's team (the game decides if it can). */
  startBattle(m: GangMember, intro: string): boolean;
  battleActive(): boolean;
  battleTurnBased(): boolean;
  rep(ev: 'gangBeaten' | 'gangBossBeaten' | 'hideoutCleared' | 'gangArrestHelped'): void;
  reward(cash: number, items: Array<[string, number]>, weapon?: [string, number]): string;
  transition(to: { x: number; y: number; z: number }, label: string, layer: 'sewer'): boolean;
  /** Something changed that should be saved. */
  dirty(): void;
}

export interface GangMember {
  ped: Ped;
  name: string;
  crew: Crew;
  weapon: 'pistol' | 'smg' | 'bat' | 'none';
  cd: number;
  side: number;
  team: Creature[];
  mode: 'idle' | 'fight' | 'flee' | 'down' | 'cuffed' | 'gone';
  battled: boolean;
  courier?: boolean;
  boss?: boolean;
  homeX: number;
  homeZ: number;
  heading: number;
}

interface Cop {
  ped: Ped;
  cd: number;
  mode: 'arrive' | 'fight' | 'cuff' | 'leave';
  cuffing: GangMember | null;
  cuffT: number;
}

interface Crew {
  id: string;
  where: 'street' | 'hideout';
  x: number;
  z: number;
  members: GangMember[];
  fightSince: number | null;
  provoked: boolean;
  cops: Cop[];
  policeCalled: boolean;
  /** Gone (beaten) at this game time; turf crews come back later. */
  doneAt: number | null;
}

export class GangWorld {
  state: GangState = newGangState();
  private readonly crews: Crew[] = [];
  private time = 0;
  private turfSpots: Array<{ id: string; x: number; z: number; district: string }> = [];
  private alvarez: { x: number; z: number; model: Humanoid | null; heading: number } | null = null;
  /** The crowned door on the deepest level under Downtown (set by the game from the maze). */
  door: { x: number; y: number; z: number; nx: number; nz: number } | null = null;
  private hideout: { root: THREE.Group; L: HideoutLayout; x: number; z: number; y: number; lockers: Map<string, THREE.Object3D>; lights: THREE.PointLight[]; bulbs: THREE.MeshStandardMaterial } | null = null;
  inHideout = false;
  private enteredAt = 0;
  /** Between the door and the room (the fade): the game mustn't think you fell. */
  get entering(): boolean {
    return (this.inHideout && this.time - this.enteredAt < 4) || this.time - this.leftAt < 4;
  }
  private leftAt = -99;
  /** Set by the game: puts fuel drums in the hideout (Hazards.ts). */
  addHazards: ((spots: Array<{ kind: 'drum' | 'transformer'; x: number; y: number; z: number }>, parent?: THREE.Object3D) => void) | null = null;

  /** Where the crews hang out (for drums on the corners). */
  get turfs(): ReadonlyArray<{ x: number; z: number }> {
    return this.turfSpots;
  }

  /** The member whose Streetmon you're fighting right now. */
  engaged: GangMember | null = null;
  private lastNotice = 0;
  private calledAlvarez = false;

  constructor(private readonly d: GangDeps) {
    this.planTurf();
    this.planAlvarez();
  }

  // ------------------------------------------------------------------ setup

  /** Corners for crews: block corners in Downtown and Uptown, spread out. */
  private planTurf(): void {
    const L = this.d.layout;
    const picks: Array<{ id: string; x: number; z: number; district: string }> = [];
    for (const want of ['downtown', 'downtown', 'uptown', 'midtown']) {
      let best: { x: number; z: number; s: number } | null = null;
      for (const b of L.blocks) {
        for (const [cx, cz] of [
          [b.x0 + 2.2, b.z0 + 2.2],
          [b.x1 - 2.2, b.z1 - 2.2],
        ]) {
          if (districtAt(L, cx, cz) !== want) continue;
          if (this.d.peds.blocked(cx, cz)) continue;
          if (picks.some((p) => Math.hypot(p.x - cx, p.z - cz) < 160)) continue;
          const s = Math.abs(Math.sin(cx * 0.031 + cz * 0.017 + picks.length));
          if (!best || s > best.s) best = { x: cx, z: cz, s };
        }
      }
      if (best) picks.push({ id: `turf-${picks.length}`, x: best.x, z: best.z, district: want });
    }
    this.turfSpots = picks;
  }

  /** Alvarez waits on a Midtown sidewalk by his unmarked car. */
  private planAlvarez(): void {
    const L = this.d.layout;
    for (const b of L.blocks) {
      const x = (b.x0 + b.x1) / 2;
      const z = b.z0 + 2;
      if (districtAt(L, x, z) !== 'midtown' || this.d.peds.blocked(x, z)) continue;
      if (Math.abs(Math.sin(x * 0.07 + z * 0.05)) < 0.6) continue;
      this.alvarez = { x, z, model: null, heading: Math.PI / 2 };
      return;
    }
    const b = L.blocks[0];
    this.alvarez = { x: (b.x0 + b.x1) / 2, z: b.z0 + 2, model: null, heading: Math.PI / 2 };
  }

  /** Where Alvarez is (for the map and the waypoint), while he's part of the story. */
  get alvarezSpot(): { x: number; z: number } | null {
    return this.alvarez && this.state.stage === 1 ? { x: this.alvarez.x, z: this.alvarez.z } : null;
  }

  /** The quest marker: where to go next. */
  objective(): { x: number; z: number; label: string } | null {
    const s = this.state.stage;
    if (s === 1 && this.alvarez) return { x: this.alvarez.x, z: this.alvarez.z, label: 'Detective Alvarez' };
    if (s === 2) {
      const t = this.turfSpots.find((t) => t.district === 'downtown');
      return t ? { x: t.x, z: t.z, label: 'Gutter Kings corner' } : null;
    }
    if (s === 3) {
      const c = this.crews.find((c) => c.members.some((m) => m.courier && m.mode !== 'gone' && m.mode !== 'cuffed' && m.mode !== 'down'));
      const m = c?.members.find((m) => m.courier);
      if (m) return { x: m.ped.x, z: m.ped.z, label: 'The courier' };
      const t = this.turfSpots[1] ?? this.turfSpots[0];
      return t ? { x: t.x, z: t.z, label: 'The courier' } : null;
    }
    if (s === 4 && this.door) return { x: this.door.x, z: this.door.z, label: 'The crowned door (level 3)' };
    return null;
  }

  stepText(): string {
    return this.state.stage > 0 && this.state.stage < 6 ? `${QUEST.name}: ${QUEST.steps[this.state.stage]}` : '';
  }

  load(s: GangState): void {
    this.state = s;
    for (const c of [...this.crews]) this.removeCrew(c);
    this.calledAlvarez = s.stage >= 1;
    if (this.hideout) this.refreshLockers();
  }

  /** The crowned steel door, built where the game says (a dead end on Downtown's deepest level). */
  placeDoor(at: { x: number; y: number; z: number; nx: number; nz: number }): void {
    this.door = at;
    const g = new THREE.Group();
    g.position.set(at.x, at.y, at.z);
    g.rotation.y = Math.atan2(at.nx, at.nz);
    const steel = withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3c3f, metalness: 0.7, roughness: 0.5 }), 'rust');
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.15), steel);
    slab.position.y = 1.3;
    const crown = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: crownTexture(), transparent: true }));
    crown.position.set(0, 1.6, 0.085);
    const lampM = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 1.8 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampM);
    lamp.position.set(0.7, 2.85, 0.15);
    g.add(slab, crown, lamp);
    this.d.scene.add(g);
  }

  // ------------------------------------------------------------------ prompts (E)

  use(): { label: string; act: () => void } | null {
    const p = this.d.player();
    if (!p.onFoot || p.dead) return null;
    const near = (x: number, z: number, r: number): boolean => Math.hypot(x - p.x, z - p.z) < r;
    if (this.alvarez?.model && this.state.stage >= 1 && near(this.alvarez.x, this.alvarez.z, 2.2) && this.d.layer() === 'street') return { label: 'Talk to Detective Alvarez', act: () => this.talkAlvarez() };
    if (this.door && this.d.layer() === 'sewer' && !this.inHideout && Math.abs(p.feetY - this.door.y) < 2 && near(this.door.x, this.door.z, 2)) {
      return this.state.hasKey || this.state.stage >= 4
        ? { label: 'Unlock the crowned door', act: () => this.enterHideout() }
        : { label: 'A steel door with a red crown on it (locked)', act: () => this.d.toast("Locked tight. Whoever's behind it has the only key.", 2600) };
    }
    if (this.inHideout && this.hideout) {
      const h = this.hideout;
      if (near(h.x + h.L.entry.x, h.z + h.L.entry.z - 1.6, 1.8)) return { label: 'Leave the hideout', act: () => this.leaveHideout() };
      for (const l of h.L.lockers) {
        if (!near(h.x + l.x, h.z + l.z, 1.8) || this.state.lockers.includes(l.id)) continue;
        return this.state.bossBeaten
          ? { label: 'Open the locker', act: () => this.openLocker(l.id) }
          : { label: 'A padlocked locker (Rook has the keys)', act: () => this.d.toast('Padlocked. King Rook keeps the keys on him.', 2200) };
      }
    }
    return null;
  }

  private talkAlvarez(): void {
    if (this.state.stage === 1) {
      const msg = gangEvent(this.state, 'metAlvarez');
      this.d.bubbles.say('alvarez', () => this.alvarezHead(), "The Gutter Kings run guns and Streetmon out of the drains. I can't touch them. You can.", 'police', 5);
      this.d.toast(msg, 4500);
      this.d.dirty();
    } else if (this.state.stage < 6) {
      this.d.bubbles.say('alvarez', () => this.alvarezHead(), ['Keep at it. Downtown first.', 'The courier runs their cash. Find him.', 'The door is under Downtown, deep. Watch yourself.', "Rook's in there. Don't make me identify your body."][Math.min(3, this.state.stage - 2)] ?? 'Be careful.', 'police');
    } else this.d.bubbles.say('alvarez', () => this.alvarezHead(), "City owes you one. Don't spend it all in one place.", 'police');
  }

  private alvarezHead(): { x: number; y: number; z: number } | null {
    return this.alvarez ? { x: this.alvarez.x, y: (this.alvarez.model?.root.position.y ?? 0) + 2.1, z: this.alvarez.z } : null;
  }

  // ------------------------------------------------------------------ the hideout

  private buildHideout(): void {
    if (!this.door || this.hideout) return;
    const L = hideoutLayout();
    // Well below the deepest drains (-72) and above the rooms you walk into (-120).
    const y = -98;
    const x = this.door.x;
    const z = this.door.z;
    const root = new THREE.Group();
    root.name = 'gang-hideout';
    root.visible = false;
    const box = (w: number, h: number, dd: number, mat: THREE.Material, px: number, py: number, pz: number, ry = 0, solid = true): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat);
      m.position.set(px, py + h / 2, pz);
      m.rotation.y = ry;
      m.receiveShadow = true;
      root.add(m);
      if (solid) {
        const c = Math.abs(Math.cos(ry));
        const s = Math.abs(Math.sin(ry));
        this.d.world.createCollider(RAPIER.ColliderDesc.cuboid((w * c + dd * s) / 2, h / 2, (w * s + dd * c) / 2).setTranslation(px, py + h / 2, pz).setCollisionGroups(WORLD_GROUPS));
      }
      return m;
    };
    const brick = withSurface(new THREE.MeshStandardMaterial({ color: 0x3e3a33, roughness: 0.95 }), 'brick');
    const concrete = withSurface(new THREE.MeshStandardMaterial({ color: 0x2a2b28, roughness: 0.85 }), 'concrete');
    const wood = withSurface(new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.9 }), 'wood');
    const metal = withSurface(new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.6, roughness: 0.5 }), 'paintedMetal');
    const sand = withSurface(new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 }), 'fabric');
    const red = new THREE.MeshStandardMaterial({ color: 0x8a0f1b, roughness: 0.8 });
    const { w, d, h } = L;
    box(w, 0.4, d, concrete, x, y - 0.4, z);
    box(w, 0.4, d, concrete, x, y + h, z);
    box(w + 0.6, h, 0.3, brick, x, y, z - d / 2 - 0.15);
    box(w + 0.6, h, 0.3, brick, x, y, z + d / 2 + 0.15);
    box(0.3, h, d, brick, x - w / 2 - 0.15, y, z);
    box(0.3, h, d, brick, x + w / 2 + 0.15, y, z);
    // The door you came in by, and a lit EXIT over it.
    box(1.8, 2.6, 0.1, metal, x + L.entry.x, y, z - d / 2 + 0.05, 0, false);
    // Cover.
    for (const c of L.cover) {
      const cx = x + c.x;
      const cz = z + c.z;
      if (c.kind === 'crate') {
        box(1.4, 1.2, 1.4, wood, cx, y, cz, c.rot);
        box(1.0, 0.9, 1.0, wood, cx + 0.2, y + 1.2, cz - 0.1, c.rot + 0.4, false);
      } else if (c.kind === 'barricade') {
        box(3.2, 1.1, 0.5, wood, cx, y, cz, c.rot);
        box(3.0, 0.1, 0.6, metal, cx, y + 1.1, cz, c.rot, false);
      } else if (c.kind === 'sandbags') {
        for (let k = 0; k < 3; k++) box(2.8 - k * 0.5, 0.35, 0.8, sand, cx, y + k * 0.35, cz, c.rot, k === 0);
      } else {
        // A stripped car on blocks.
        box(4.2, 0.9, 1.8, metal, cx, y + 0.3, cz, c.rot);
        box(2.2, 0.6, 1.6, new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.6 }), cx, y + 1.2, cz, c.rot, false);
      }
    }
    // King Rook's throne of tyres, a crown on the wall behind it, a red rug.
    const tx = x + L.throne.x;
    const tz = z + L.throne.z;
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.18, 8, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }));
      t.position.set(tx, y + 0.18 + k * 0.3, tz);
      root.add(t);
    }
    box(1.6, 0.04, 6, red, tx, y, tz - 3, 0, false);
    const crown = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.6), new THREE.MeshBasicMaterial({ map: crownTexture(), transparent: true }));
    crown.position.set(tx, y + 3.4, z + d / 2 - 0.02);
    crown.rotation.y = Math.PI;
    root.add(crown);
    // Graffiti tags on the long walls.
    for (const [gx, side] of [
      [-10, -1],
      [8, -1],
      [-6, 1],
      [12, 1],
    ] as Array<[number, number]>) {
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: tagTexture(gx), transparent: true }));
      tag.position.set(x + gx, y + 1.7, z + side * (d / 2 - 0.02));
      tag.rotation.y = side > 0 ? Math.PI : 0;
      root.add(tag);
    }
    // Lockers.
    const lockers = new Map<string, THREE.Object3D>();
    for (const l of L.lockers) {
      const g = new THREE.Group();
      g.position.set(x + l.x, y, z + l.z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.6), metal);
      body.position.y = 0.95;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.8, 0.04), new THREE.MeshStandardMaterial({ color: 0x6a7480, metalness: 0.6, roughness: 0.4 }));
      door.position.set(0, 0.95, l.z < 0 ? 0.32 : -0.32);
      door.name = 'door';
      g.add(body, door);
      root.add(g);
      lockers.set(l.id, door);
    }
    // String lights (red and amber bulbs) and a few work lamps: a warm, mean light.
    const bulbs = new THREE.MeshStandardMaterial({ color: 0xffd6a0, emissive: 0xff8a30, emissiveIntensity: 1.6 });
    for (let k = 0; k < 28; k++) {
      const u = k / 27;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), bulbs);
      b.position.set(x - w / 2 + 1 + u * (w - 2), y + h - 0.6 - Math.sin(u * Math.PI * 4) * 0.35, z + Math.sin(u * 9) * 2);
      root.add(b);
    }
    const lights: THREE.PointLight[] = [];
    for (const [lx, lz, c] of [
      [-12, -6, 0xffb070],
      [12, -6, 0xffb070],
      [0, 4, 0xff6040],
      [-10, 10, 0xffb070],
      [10, 10, 0xff6040],
    ] as Array<[number, number, number]>) {
      const l = new THREE.PointLight(c, 30, 24, 1.5);
      l.position.set(x + lx, y + h - 1, z + lz);
      root.add(l);
      lights.push(l);
    }
    const fill = new THREE.HemisphereLight(0xffc89a, 0x2a1010, 0.85);
    fill.position.set(x, y + h, z);
    root.add(fill);
    this.d.scene.add(root);
    // Fuel drums by the barricades: shoot one and the guards behind it go flying.
    this.addHazards?.(
      [
        [-6, -9.2],
        [7.5, -9.2],
        [-3, 9.4],
        [13, 6],
        [-13, 8],
      ].map(([dx, dz]) => ({ kind: 'drum' as const, x: x + dx, y, z: z + dz })),
      root,
    );
    this.hideout = { root, L, x, z, y, lockers, lights, bulbs };
    this.refreshLockers();
  }

  private refreshLockers(): void {
    if (!this.hideout) return;
    for (const [id, door] of this.hideout.lockers) door.rotation.y = this.state.lockers.includes(id) ? 1.6 : 0;
  }

  private enterHideout(): void {
    this.buildHideout();
    const h = this.hideout;
    if (!h) return;
    const ok = this.d.transition({ x: h.x + h.L.entry.x, y: h.y + 0.05, z: h.z + h.L.entry.z }, 'The Gutter Kings hideout', 'sewer');
    if (!ok) return;
    this.state.hasKey = true;
    this.inHideout = true;
    this.enteredAt = this.time;
    h.root.visible = true;
    const msg = gangEvent(this.state, 'enteredHideout');
    if (msg) this.d.toast(msg, 4500);
    if (!this.state.bossBeaten) this.spawnHideoutCrew();
    this.d.dirty();
  }

  private leaveHideout(): void {
    const dr = this.door;
    if (!dr) return;
    const ok = this.d.transition({ x: dr.x + dr.nx * 1.4, y: dr.y + 0.05, z: dr.z + dr.nz * 1.4 }, 'Back in the drains', 'sewer');
    if (!ok) return;
    this.inHideout = false;
    this.leftAt = this.time;
    if (this.hideout) this.hideout.root.visible = false;
    for (const c of this.crews.filter((c) => c.where === 'hideout')) this.removeCrew(c);
  }

  private openLocker(id: string): void {
    const l = this.hideout?.L.lockers.find((x) => x.id === id);
    if (!l) return;
    this.state.lockers.push(id);
    this.refreshLockers();
    const loot = lockerLoot(l.loot, this.state.lockers.length);
    this.d.toast(this.d.reward(loot.cash, loot.items, loot.weapon), 4000);
    this.d.dirty();
  }

  // ------------------------------------------------------------------ crews

  private spawnMember(crew: Crew, x: number, z: number, i: number, weapon: GangMember['weapon'], floorY?: number, extra: Partial<GangMember> = {}): GangMember {
    const look = { skin: ['#c68e5f', '#7d4a2b', '#e0ac7d', '#a26b42', '#5a3420'][i % 5], hair: '#151210', top: GANG.top, legs: GANG.legs, shoes: '#111111', scale: 0.98 + (i % 3) * 0.02 };
    const ped = this.d.peds.spawnScripted(x, z, look, Math.random() * Math.PI * 2, 'gang', `gang:${crew.id}`, floorY);
    const stage = this.state.stage;
    const n = extra.boss ? 0 : i % 3 === 0 ? 1 : 0;
    const team: Creature[] = extra.boss ? BOSS.team.map(([id, lv]) => createCreature(id, lv)) : Array.from({ length: n }, (_, k) => createCreature(ROSTER[(i * 3 + k) % ROSTER.length], memberLevel(stage, this.d.bestLevel(), i)));
    const m: GangMember = { ped, name: extra.boss ? BOSS.name : MEMBER_NAMES[(i * 5 + crew.id.length) % MEMBER_NAMES.length], crew, weapon, cd: 1 + Math.random() * 2, side: i % 2 ? 1 : -1, team, mode: 'idle', battled: false, homeX: x, homeZ: z, heading: ped.heading, ...extra };
    if (extra.boss) ped.health = 400;
    crew.members.push(m);
    return m;
  }

  private spawnTurfCrew(spot: { id: string; x: number; z: number }, courier = false): Crew {
    const crew: Crew = { id: spot.id + (courier ? '-c' : ''), where: 'street', x: spot.x, z: spot.z, members: [], fightSince: null, provoked: false, cops: [], policeCalled: false, doneAt: null };
    const n = courier ? 2 : 3 + (spot.id.length % 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = spot.x + Math.cos(a) * 1.6;
      const pz = spot.z + Math.sin(a) * 1.6;
      const weapon: GangMember['weapon'] = courier && i === 0 ? 'none' : i % 3 === 2 ? 'bat' : i % 4 === 1 ? 'smg' : 'pistol';
      this.spawnMember(crew, this.d.peds.blocked(px, pz) ? spot.x : px, this.d.peds.blocked(px, pz) ? spot.z : pz, i, weapon, undefined, courier && i === 0 ? { courier: true, name: 'The courier' } : {});
    }
    this.crews.push(crew);
    return crew;
  }

  private spawnHideoutCrew(): void {
    const h = this.hideout;
    if (!h || this.crews.some((c) => c.where === 'hideout')) return;
    const crew: Crew = { id: 'hideout', where: 'hideout', x: h.x, z: h.z, members: [], fightSince: null, provoked: false, cops: [], policeCalled: true, doneAt: null };
    this.enteredAt = this.time;
    h.L.guards.forEach((g, i) => this.spawnMember(crew, h.x + g.x, h.z + g.z, i + 2, g.weapon, h.y));
    this.spawnMember(crew, h.x + h.L.boss.x, h.z + h.L.boss.z, 99, 'none', h.y, { boss: true });
    this.crews.push(crew);
  }

  private removeCrew(c: Crew): void {
    for (const m of c.members) this.d.peds.removePed(m.ped);
    for (const k of c.cops) this.d.peds.removePed(k.ped);
    this.crews.splice(this.crews.indexOf(c), 1);
    if (this.engaged && this.engaged.crew === c) this.engaged = null;
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    this.time += dt;
    const p = this.d.player();
    const best = this.d.bestLevel();
    // The story reaches you once you're strong enough: Alvarez calls.
    if (this.state.stage === 0 && questUnlocked(best) && !this.calledAlvarez && this.d.layer() === 'street' && !this.d.battleActive()) {
      this.calledAlvarez = true;
      this.state.stage = 1;
      this.d.toast(`Your phone buzzes. "Detective Alvarez, NYPD. Heard you can handle yourself. Midtown, I'll be by my car." New quest: ${QUEST.name}.`, 7000);
      this.d.dirty();
    }
    this.updateAlvarez(p);
    // Street crews come and go with you (and the story).
    if (this.d.layer() === 'street' && streetCrewsActive(this.state, best)) {
      for (const t of this.turfSpots) {
        const has = this.crews.find((c) => c.id === t.id);
        const dist = Math.hypot(t.x - p.x, t.z - p.z);
        if (!has && dist < 130 && dist > 45) {
          const done = this.respawnAt.get(t.id) ?? 0;
          if (this.time >= done) this.spawnTurfCrew(t);
        }
      }
      // The courier, for step 3: near the second turf.
      if (this.state.stage === 3 && !this.crews.some((c) => c.members.some((m) => m.courier))) {
        const t = this.turfSpots[1] ?? this.turfSpots[0];
        if (t && Math.hypot(t.x - p.x, t.z - p.z) < 150) this.spawnTurfCrew({ id: 'courier', x: t.x + 12, z: t.z }, true);
      }
    }
    for (const c of [...this.crews]) {
      const far = Math.hypot(c.x - p.x, c.z - p.z) > 190 || (c.where === 'street' && this.d.layer() !== 'street') || (c.where === 'hideout' && !this.inHideout);
      if (far && !c.fightSince) {
        this.removeCrew(c);
        continue;
      }
      this.updateCrew(c, dt, p);
    }
    // Dead (or carried out some other way): the hideout empties until you come back.
    if (this.inHideout && this.hideout && this.time - this.enteredAt > 4 && (this.d.layer() !== 'sewer' || Math.abs(p.feetY - this.hideout.y) > 6)) {
      this.inHideout = false;
      this.hideout.root.visible = false;
      for (const c of this.crews.filter((c) => c.where === 'hideout')) this.removeCrew(c);
    }
    this.updateHideout(dt);
  }

  private readonly respawnAt = new Map<string, number>();

  private updateAlvarez(p: ReturnType<GangDeps['player']>): void {
    const a = this.alvarez;
    if (!a) return;
    const show = this.state.stage >= 1 && this.d.layer() === 'street' && Math.hypot(a.x - p.x, a.z - p.z) < 90;
    if (show && !a.model) {
      a.model = new Humanoid({ skin: '#a26b42', hair: '#1b1410', top: '#3a3f4a', legs: '#22252b', shoes: '#151515', scale: 1, jacket: '#5a4a3a', hat: 'fedora', hatColor: '#2a2a2a' });
      a.model.root.position.set(a.x, this.d.peds.groundY(a.x, a.z), a.z);
      a.model.root.rotation.y = a.heading;
      this.d.scene.add(a.model.root);
    } else if (!show && a.model) {
      a.model.root.removeFromParent();
      a.model = null;
    }
    if (a.model) {
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d < 10) a.heading += (Math.atan2(-(p.z - a.z), p.x - a.x) - a.heading) * 0.05;
      a.model.root.rotation.y = a.heading;
      a.model.update(1 / 60, 0, true);
      if (this.state.stage === 1 && d < 14 && !this.d.bubbles.has('alvarez')) this.d.bubbles.say('alvarez', () => this.alvarezHead(), 'Over here. Alvarez.', 'police', 3);
    }
  }

  private updateHideout(dt: number): void {
    const h = this.hideout;
    if (!h || !h.root.visible) return;
    h.bulbs.emissiveIntensity = 1.4 + Math.sin(this.time * 2.3) * 0.2;
    for (const [i, l] of h.lights.entries()) l.intensity = 28 + Math.sin(this.time * 7 + i * 1.7) * (i === 2 ? 5 : 1);
    void dt;
  }

  private alive(m: GangMember): boolean {
    return m.mode === 'idle' || m.mode === 'fight' || m.mode === 'flee';
  }

  private head(ped: Ped): () => { x: number; y: number; z: number } | null {
    return () => (ped.state === 'dead' && ped.deadFor > 8 ? null : { x: ped.x, y: ped.y + 2.05, z: ped.z });
  }

  private updateCrew(c: Crew, dt: number, p: ReturnType<GangDeps['player']>): void {
    const sameFloor = c.where === 'hideout' ? this.inHideout : this.d.layer() === 'street';
    // Damage taken and noise provoke them.
    for (const m of c.members) {
      if (!this.alive(m)) continue;
      if (m.ped.health < (m.boss ? 400 : GANG.health) && !c.provoked) c.provoked = true;
    }
    const hostile = hostileOnSight(this.state, this.d.streetCred(), c.provoked);
    const dPlayer = Math.hypot(c.x - p.x, c.z - p.z);
    // In the hideout they need a moment to spot you by the door (and you a moment to find cover).
    const grace = c.where === 'hideout' && this.time - this.enteredAt < 3;
    const nearest = Math.min(...c.members.filter((m) => this.alive(m)).map((m) => Math.hypot(m.ped.x - p.x, m.ped.z - p.z)), 1e9);
    if (!c.fightSince && sameFloor && !p.dead && !grace && (c.provoked || (hostile && (c.where === 'hideout' ? nearest < GANG.noticeRange : dPlayer < GANG.noticeRange)))) {
      c.fightSince = this.time;
      c.provoked = true;
      const shouter = c.members.find((m) => this.alive(m) && !m.boss);
      if (shouter && this.time - this.lastNotice > 3) {
        this.lastNotice = this.time;
        this.d.bubbles.say(`gang-${c.id}`, this.head(shouter.ped), c.where === 'hideout' ? 'INTRUDER! Light them up!' : m3(['This is Kings turf!', 'Wrong corner, friend.', 'Get them!', "You're done!"], c.id.length), 'gang');
      }
      for (const m of c.members) if (this.alive(m) && !m.courier) m.mode = 'fight';
      for (const m of c.members) if (m.courier) m.mode = 'flee';
    }
    // Before a fight: they loiter and talk among themselves.
    if (!c.fightSince) {
      for (const m of c.members) {
        if (!this.alive(m)) continue;
        m.ped.speed = 0;
        if (Math.random() < dt * 0.04 && dPlayer < 30 && !this.d.bubbles.has(`gm-${m.name}`)) this.d.bubbles.say(`gm-${m.name}`, this.head(m.ped), m3(['Slow night.', 'Rook wants the count by Friday.', 'You see that Gutterat? Huge.', 'Cops been quiet.', 'Kings run this block.'], Math.floor(this.time)), 'think');
      }
      return;
    }
    // Police come to a street gang fight.
    if (c.where === 'street' && !c.policeCalled && this.time - c.fightSince > GANG.policeAfter) {
      c.policeCalled = true;
      this.spawnSquad(c);
    }
    const cops = c.cops.filter((k) => k.ped.state !== 'dead');
    const battleTurn = this.d.battleActive() && this.d.battleTurnBased();
    for (const m of c.members) {
      const ped = m.ped;
      // Down: they surrender (or are dead).
      if (this.alive(m) && (ped.state === 'dead' || ped.health <= (m.boss ? 0 : 28))) {
        this.memberDown(m, cops.length > 0);
        continue;
      }
      if (!this.alive(m)) continue;
      if (ped.state === 'down' || ped.state === 'fly') continue;
      ped.state = 'script';
      if (m.mode === 'flee') {
        // The courier runs; you have to catch him (or shoot his legs out).
        const ax = ped.x + (ped.x - p.x);
        const az = ped.z + (ped.z - p.z);
        this.move(m, dt, ax, az, 5.2);
        continue;
      }
      if (m.boss) {
        // Rook doesn't shoot: he waits on his throne and sends his Streetmon when you come close (or his crew falls).
        ped.speed = 0;
        ped.heading = Math.atan2(-(p.z - ped.z), p.x - ped.x);
        const crewDown = c.members.filter((x) => !x.boss).every((x) => !this.alive(x));
        if (!m.battled && !this.d.battleActive() && (Math.hypot(p.x - ped.x, p.z - ped.z) < 9 || crewDown)) {
          if (this.d.startBattle(m, `${BOSS.name}: ${BOSS.intro}`)) {
            m.battled = true;
            this.engaged = m;
          }
        }
        continue;
      }
      // Target: the player, or the nearest officer if one is closer.
      let tx = p.x;
      let tz = p.z;
      let targetCop: Cop | null = null;
      let td = Math.hypot(p.x - ped.x, p.z - ped.z);
      for (const k of cops) {
        const dk = Math.hypot(k.ped.x - ped.x, k.ped.z - ped.z);
        if (dk < td - 3) {
          td = dk;
          tx = k.ped.x;
          tz = k.ped.z;
          targetCop = k;
        }
      }
      if (!targetCop && (p.dead || !sameFloor)) {
        ped.speed = 0;
        continue;
      }
      // One of them sets his Streetmon on yours (once each).
      if (!targetCop && !m.battled && m.team.length && !this.d.battleActive() && td < 14 && p.onFoot) {
        if (this.d.startBattle(m, `${m.name} of the ${GANG.name}: "${m3(['Sic him!', 'Show them what Kings dogs do!', 'Eat them up!'], m.name.length)}"`)) {
          m.battled = true;
          this.engaged = m;
        }
      }
      if (m.weapon === 'bat') {
        const dd = this.move(m, dt, tx, tz, 4.6);
        if (dd < GANG.melee.reach && m.cd <= 0 && !battleTurn) {
          m.cd = GANG.melee.every;
          if (targetCop) this.d.peds.damage(targetCop.ped, GANG.melee.damage, tx - ped.x, tz - ped.z, 2);
          else this.d.hurtPlayer(GANG.melee.damage, `Beaten by the ${GANG.name}`, ped.x, ped.z);
        }
      } else {
        const spot = fightSpot(ped, { x: tx, z: tz }, m.side);
        this.move(m, dt, spot.x, spot.z, 3.4);
        ped.heading = Math.atan2(-(tz - ped.z), tx - ped.x);
        if (m.weapon !== 'none' && m.cd <= 0 && td < 32 && !battleTurn) {
          const burst = m.weapon === 'smg';
          m.cd = (GANG.shotEvery[0] + Math.random() * (GANG.shotEvery[1] - GANG.shotEvery[0])) * (burst ? 0.55 : 1) * (this.d.battleActive() ? 1.6 : 1);
          const from = new THREE.Vector3(ped.x, ped.y + 1.45, ped.z);
          if (targetCop) {
            if (this.d.weapons.npcFire(from, new THREE.Vector3(tx, targetCop.ped.y + 1.1, tz), 0.35)) this.d.peds.damage(targetCop.ped, 18, tx - ped.x, tz - ped.z, 0);
          } else {
            const hit = this.d.weapons.npcFire(from, new THREE.Vector3(p.x, p.y + 0.3, p.z), gangHitChance(td, p.moving, p.inCar));
            if (hit) this.d.hurtPlayer(GANG.damage * (burst ? 0.8 : 1), `Shot by the ${GANG.name}`, ped.x, ped.z);
          }
        }
      }
      m.cd -= dt;
    }
    this.updateCops(c, dt, p);
    // Everyone down: the fight's over.
    if (c.members.every((m) => !this.alive(m))) {
      if (c.doneAt === null) {
        c.doneAt = this.time;
        if (c.where === 'street') this.respawnAt.set(c.id, this.time + 600);
      }
      // Bodies and cuffed members clear away after a while (once you've left).
      if (this.time - c.doneAt > 40 && dPlayer > 60 && c.cops.every((k) => k.mode === 'leave')) this.removeCrew(c);
    }
  }

  /** Walk a member toward a point (inside the hideout's walls when down there). */
  private move(m: GangMember, dt: number, tx: number, tz: number, speed: number): number {
    if (m.crew.where === 'street') return this.d.peds.moveToward(m.ped, dt, tx, tz, speed);
    const h = this.hideout!;
    const ped = m.ped;
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) {
      ped.speed = 0;
      return dist;
    }
    const st = Math.min(dist, speed * dt);
    const nx = Math.max(h.x - h.L.w / 2 + 0.6, Math.min(h.x + h.L.w / 2 - 0.6, ped.x + (dx / dist) * st));
    const nz = Math.max(h.z - h.L.d / 2 + 0.6, Math.min(h.z + h.L.d / 2 - 0.6, ped.z + (dz / dist) * st));
    const blocked = h.L.cover.some((c) => Math.abs(nx - (h.x + c.x)) < (c.kind === 'car' ? 2.4 : 1.7) && Math.abs(nz - (h.z + c.z)) < (c.kind === 'car' ? 1.3 : 0.9));
    if (!blocked) {
      ped.x = nx;
      ped.z = nz;
      ped.speed = st / Math.max(dt, 1e-4);
    } else ped.speed = 0;
    ped.heading = Math.atan2(-dz, dx);
    return dist;
  }

  private memberDown(m: GangMember, copsHere: boolean): void {
    const ped = m.ped;
    const dead = ped.state === 'dead';
    m.mode = dead ? 'gone' : 'down';
    if (!dead) {
      ped.state = 'down';
      ped.timer = 1e6;
      this.d.bubbles.say(`gm-${m.name}`, this.head(ped), m3(["Alright! Alright, I'm done!", 'Ugh... Rook\'s gonna kill me.', 'Okay! I give!'], m.name.length), 'shout', 2.5);
    }
    if (m.courier) {
      const msg = gangEvent(this.state, 'courierBeaten');
      if (msg) this.d.big('THE KEY', '#ffd23f');
      if (msg) this.d.toast(msg, 6000);
    } else if (m.boss) {
      // Rook goes down when his team does (see onBattleEnd); a bullet can do it too.
      this.bossBeaten();
    } else {
      const msg = gangEvent(this.state, 'memberBeaten', m.crew.where);
      if (msg) this.d.toast(msg, 3000);
    }
    this.d.rep(copsHere ? 'gangArrestHelped' : 'gangBeaten');
    // They drop their takings.
    this.d.weapons.drop('cash', 'cash', 30 + Math.floor(Math.random() * 90), ped.x + 0.5, ped.y, ped.z);
    if (m.weapon !== 'none' && m.weapon !== 'bat' && this.d.weapons.inventory.has(m.weapon)) this.d.weapons.drop('weapon', m.weapon, m.weapon === 'smg' ? 30 : 12, ped.x - 0.5, ped.y, ped.z);
    this.d.dirty();
  }

  private bossBeaten(): void {
    if (this.state.bossBeaten) return;
    const msg = gangEvent(this.state, 'bossBeaten');
    this.d.big('KING ROOK FALLS', '#ff3b4a');
    this.d.rep('gangBossBeaten');
    this.d.rep('hideoutCleared');
    const r = QUEST.rewards;
    this.d.toast(`${msg} ${this.d.reward(r.cash, r.items, [r.weapon, 90])}`, 8000);
    this.d.dirty();
  }

  /** The game tells us how a battle against a member's Streetmon ended. */
  battleEnded(won: boolean): void {
    const m = this.engaged;
    this.engaged = null;
    if (!m) return;
    if (won) {
      if (m.boss) {
        this.d.bubbles.say('boss', this.head(m.ped), BOSS.win, 'gang', 5);
        m.ped.health = 0;
        m.ped.state = 'down';
        m.ped.timer = 1e6;
        m.mode = 'down';
        this.bossBeaten();
      } else {
        // His dog's down: he loses his nerve (and the crew loses a gun).
        m.ped.health = Math.min(m.ped.health, 20);
      }
    }
  }

  // ------------------------------------------------------------------ the police at a street gang fight

  private spawnSquad(c: Crew): void {
    const ang = Math.random() * Math.PI * 2;
    for (let k = 0; k < GANG.policeSquad; k++) {
      let x = c.x + Math.cos(ang + k * 0.4) * 38;
      let z = c.z + Math.sin(ang + k * 0.4) * 38;
      for (let t = 0; t < 8 && this.d.peds.blocked(x, z); t++) {
        x = c.x + Math.cos(ang + t) * (30 + t * 3);
        z = c.z + Math.sin(ang + t) * (30 + t * 3);
      }
      const ped = this.d.peds.spawnScripted(x, z, copLook(), 0, 'cop', `gangcop:${c.id}`);
      c.cops.push({ ped, cd: 1.5 + k * 0.4, mode: 'arrive', cuffing: null, cuffT: 0 });
    }
    const first = c.cops[0];
    if (first) this.d.bubbles.say(`cop-${c.id}`, this.head(first.ped), 'NYPD! Drop your weapons!', 'police', 3.5);
    this.d.toast('Sirens: the police are coming for the Gutter Kings.', 2500);
  }

  private updateCops(c: Crew, dt: number, p: ReturnType<GangDeps['player']>): void {
    for (const k of c.cops) {
      const ped = k.ped;
      if (ped.state === 'dead' || ped.state === 'down' || ped.state === 'fly') continue;
      ped.state = 'script';
      k.cd -= dt;
      const standing = c.members.filter((m) => this.alive(m) && !m.courier);
      const downed = c.members.find((m) => m.mode === 'down' && !c.cops.some((o) => o.cuffing === m));
      if (k.mode === 'leave') {
        this.d.peds.moveToward(ped, dt, c.x + (ped.x - c.x) * 3, c.z + (ped.z - c.z) * 3, 2.2);
        continue;
      }
      if (k.mode === 'cuff' && k.cuffing) {
        const m = k.cuffing;
        const dd = this.d.peds.moveToward(ped, dt, m.ped.x + 0.6, m.ped.z, 4.5);
        if (dd < 1.0) {
          k.cuffT += dt;
          ped.speed = 0;
          if (k.cuffT > 1.8) {
            m.mode = 'cuffed';
            this.d.bubbles.say(`cuff-${m.name}`, this.head(m.ped), "You're under arrest.", 'police', 2.5);
            k.cuffing = null;
            k.mode = 'fight';
            k.cuffT = 0;
            // Taken away: gone from the street.
            const mp = m.ped;
            window.setTimeout(() => this.d.peds.removePed(mp), 2500);
          }
        }
        continue;
      }
      if (standing.length) {
        k.mode = 'fight';
        const t = standing.reduce((a, b) => (Math.hypot(b.ped.x - ped.x, b.ped.z - ped.z) < Math.hypot(a.ped.x - ped.x, a.ped.z - ped.z) ? b : a));
        const spot = fightSpot(ped, t.ped, k.cd > 0.5 ? 1 : -1, [7, 14]);
        this.d.peds.moveToward(ped, dt, spot.x, spot.z, 4);
        ped.heading = Math.atan2(-(t.ped.z - ped.z), t.ped.x - ped.x);
        if (k.cd <= 0) {
          k.cd = 1.1 + Math.random() * 0.8;
          const from = new THREE.Vector3(ped.x, ped.y + 1.45, ped.z);
          if (this.d.weapons.npcFire(from, new THREE.Vector3(t.ped.x, t.ped.y + 1.1, t.ped.z), 0.45)) this.d.peds.damage(t.ped, GANG.copDamage, t.ped.x - ped.x, t.ped.z - ped.z, 0);
        }
      } else if (downed) {
        k.mode = 'cuff';
        k.cuffing = downed;
      } else if (this.d.wanted() > 0 && !p.dead && Math.hypot(p.x - ped.x, p.z - ped.z) < 30) {
        // The gang's done and you're wanted: they turn on you.
        this.d.peds.moveToward(ped, dt, p.x, p.z, 3.5);
        if (k.cd <= 0) {
          k.cd = 1.4;
          this.d.copFiresAtPlayer(ped);
        }
      } else {
        k.mode = 'leave';
        if (!this.d.bubbles.has(`cop-${c.id}`)) this.d.bubbles.say(`cop-${c.id}`, this.head(ped), m3(['Scene secure.', 'Thanks for the help. Now go home.', 'Clear!'], c.id.length), 'police', 3);
      }
    }
  }

  /** Markers for the minimap: crews in a fight (red) and the objective. */
  markers(): Array<{ x: number; z: number; color: string; size: number }> {
    const out: Array<{ x: number; z: number; color: string; size: number }> = [];
    for (const c of this.crews) for (const m of c.members) if (this.alive(m) && (c.fightSince || m.courier)) out.push({ x: m.ped.x, z: m.ped.z, color: m.courier ? '#ffd23f' : '#ff2a3a', size: 6 });
    const o = this.objective();
    if (o) out.push({ x: o.x, z: o.z, color: '#ff5a6a', size: 10 });
    return out;
  }

  /** Is anyone shooting at you right now (for the music and the HUD)? */
  get fighting(): boolean {
    return this.crews.some((c) => c.fightSince !== null && c.members.some((m) => this.alive(m)));
  }

  /** A battle with a member was refused or interrupted: let him try again later. */
  release(m: GangMember): void {
    m.battled = false;
    if (this.engaged === m) this.engaged = null;
  }
}

function m3<T>(a: readonly T[], i: number): T {
  return a[Math.abs(i) % a.length];
}

let crownTex: THREE.CanvasTexture | null = null;
/** A red spray-painted crown with "GK" under it. */
function crownTexture(): THREE.CanvasTexture {
  if (crownTex) return crownTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 184;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#c4121f';
  g.fillStyle = '#c4121f';
  g.lineWidth = 12;
  g.lineJoin = 'round';
  g.shadowColor = '#ff2a3a';
  g.shadowBlur = 6;
  g.beginPath();
  g.moveTo(40, 120);
  g.lineTo(52, 40);
  g.lineTo(96, 90);
  g.lineTo(128, 26);
  g.lineTo(160, 90);
  g.lineTo(204, 40);
  g.lineTo(216, 120);
  g.closePath();
  g.stroke();
  for (const x of [52, 128, 204]) {
    g.beginPath();
    g.arc(x, x === 128 ? 22 : 36, 9, 0, Math.PI * 2);
    g.fill();
  }
  g.font = '900 44px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.fillText('G K', 128, 172);
  // Drips.
  g.lineWidth = 3;
  for (const x of [60, 110, 150, 196]) {
    g.beginPath();
    g.moveTo(x, 122);
    g.lineTo(x, 122 + ((x * 7) % 30));
    g.stroke();
  }
  crownTex = new THREE.CanvasTexture(c);
  crownTex.colorSpace = THREE.SRGBColorSpace;
  return crownTex;
}

function tagTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const words = ['KINGS', 'GK 4 LIFE', 'ROOK RULES', 'NO SNITCH'];
  const cols = ['#c4121f', '#f2f2f2', '#ffd23f', '#3fd0ff'];
  const i = Math.abs(Math.round(seed)) % 4;
  g.font = '900 52px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#111';
  g.strokeText(words[i], 128, 64);
  g.fillStyle = cols[i];
  g.fillText(words[i], 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
