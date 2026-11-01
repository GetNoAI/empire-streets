import * as THREE from 'three';
import trainersJson from '../data/trainers.json';
import { Humanoid, type HumanoidLook } from '../player/Humanoid';
import type { CityLayout } from '../world/CityLayout';
import { CITY } from '../world/CityLayout';
import type { CreatureInstance, CreatureModels } from './CreatureModels';
import { createCreature, type Creature } from './Creature';
import { species } from './Data';
import { withSurface } from '../render/Surfaces';

/**
 * Gang trainers: people hanging out on street corners (and in the park) with their lead creature
 * beside them. Walk within sight and they come over and challenge you to a battle you can't run
 * from. Beat them for cash; they won't challenge you again.
 */

export interface TrainerSpec {
  id: string;
  name: string;
  gang: string;
  ave: number;
  street: number;
  /** Street corner, the park, or 'roof': the nearest walkable rooftop to (ave, street). */
  corner: 'ne' | 'nw' | 'se' | 'sw' | 'park' | 'roof';
  look: { top: string; legs: string; build?: 'm' | 'f'; hairStyle?: 'short' | 'long' | 'bun' | 'ponytail' | 'bald'; skirt?: boolean; apron?: string };
  team: Array<[string, number]>;
  reward: number;
  intro: string;
  lose: string;
}

export interface Trainer {
  spec: TrainerSpec;
  /** Standing height for rooftop trainers (null = on the street). */
  y: number | null;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  heading: number;
  state: 'idle' | 'approach' | 'waiting' | 'battle' | 'beaten';
  model: Humanoid | null;
  pet: CreatureInstance | null;
  petLoading: boolean;
  /** Creatures for the current challenge (fresh each time). */
  team: Creature[];
  cooldown: number;
  bubble: THREE.Sprite | null;
}

export const TRAINERS: TrainerSpec[] = (trainersJson as unknown as { trainers: TrainerSpec[] }).trainers;

export function validateTrainers(list: TrainerSpec[]): void {
  const ids = new Set<string>();
  for (const t of list) {
    if (!t.id || ids.has(t.id)) throw new Error(`trainers.json: id "${t.id}" missing or duplicated`);
    ids.add(t.id);
    if (!(t.ave >= 0 && t.ave < CITY.numAves && t.street >= 0 && t.street < CITY.numStreets)) throw new Error(`trainers.json ${t.id}: ave/street out of range`);
    if (!t.team.length || t.team.length > 6) throw new Error(`trainers.json ${t.id}: team needs 1-6 creatures`);
    for (const [sid, lvl] of t.team) {
      const sp = species(sid);
      if (sp.human) throw new Error(`trainers.json ${t.id}: "${sid}" is not a creature`);
      if (!(lvl >= 1 && lvl <= 100)) throw new Error(`trainers.json ${t.id}: level out of range`);
    }
  }
}
validateTrainers(TRAINERS);

const SIGHT = 10;

export interface TrainerEvents {
  /** The trainer reached the player: start the battle. */
  onChallenge(t: Trainer): void;
}

export class TrainerSystem {
  readonly trainers: Trainer[] = [];
  /** Ids of trainers already beaten (saved). */
  readonly beaten = new Set<string>();
  enabled = true;

  constructor(
    private readonly scene: THREE.Scene,
    layout: CityLayout,
    private readonly models: CreatureModels,
    walkable: (x: number, z: number) => boolean,
    private readonly groundY: (x: number, z: number) => number,
    private readonly events: TrainerEvents,
    /** Where a rooftop trainer stands (feet), near their avenue/street; null to leave them out. */
    roofSpot?: (spec: TrainerSpec) => { x: number; y: number; z: number } | null,
  ) {
    for (const spec of TRAINERS) {
      const roof = spec.corner === 'roof' ? roofSpot?.(spec) ?? null : null;
      if (spec.corner === 'roof' && !roof) continue;
      const p = roof ?? spotFor(layout, spec, walkable);
      this.trainers.push({
        spec,
        y: roof ? roof.y : null,
        homeX: p.x,
        homeZ: p.z,
        x: p.x,
        z: p.z,
        heading: Math.random() * Math.PI * 2,
        state: 'idle',
        model: null,
        pet: null,
        petLoading: false,
        team: [],
        cooldown: 0,
        bubble: null,
      });
    }
  }

  /** Fresh team for a challenge. */
  teamFor(t: Trainer): Creature[] {
    t.team = t.spec.team.map(([id, lvl]) => createCreature(id, lvl));
    return t.team;
  }

  markBeaten(t: Trainer): void {
    this.beaten.add(t.spec.id);
    t.state = 'beaten';
  }

  /** After a battle that wasn't a win: they go back to their corner and leave you alone a while. */
  release(t: Trainer, seconds: number): void {
    t.state = 'idle';
    t.cooldown = seconds;
  }

  update(dt: number, player: THREE.Vector3, playerFree: boolean, playerFeetY = 0): void {
    for (const t of this.trainers) {
      // Street trainers don't see you on a roof above them, and rooftop ones don't see the street.
      const sameLevel = Math.abs((t.y ?? 0) - playerFeetY) < 4;
      const d = sameLevel ? Math.hypot(t.x - player.x, t.z - player.z) : Math.hypot(t.x - player.x, t.z - player.z) + 1000;
      const dModel = Math.hypot(t.x - player.x, t.z - player.z);
      // Stream the model in when nearby.
      if (dModel < 140 && !t.model) this.spawnModel(t);
      else if (dModel > 170 && t.model) this.despawnModel(t);
      if (!t.model) continue;
      if (this.beaten.has(t.spec.id) && t.state !== 'battle') t.state = 'beaten';
      t.cooldown = Math.max(0, t.cooldown - dt);
      let speed = 0;
      switch (t.state) {
        case 'idle': {
          // Hang out at home; turn to face whoever comes close.
          t.heading = turn(t.heading, Math.atan2(-(player.z - t.z), player.x - t.x), d < 25 ? dt * 2 : 0);
          if (this.enabled && playerFree && t.cooldown <= 0 && d < SIGHT) {
            t.state = 'approach';
            this.showBubble(t, true);
          }
          break;
        }
        case 'approach': {
          if (!playerFree || d > SIGHT * 2.5) {
            t.state = 'idle';
            this.showBubble(t, false);
            break;
          }
          t.heading = turn(t.heading, Math.atan2(-(player.z - t.z), player.x - t.x), dt * 8);
          if (d > 2.2) {
            speed = 3.2;
            t.x += Math.cos(t.heading) * speed * dt;
            t.z -= Math.sin(t.heading) * speed * dt;
          } else {
            t.state = 'battle';
            this.showBubble(t, false);
            this.events.onChallenge(t);
          }
          break;
        }
        case 'battle':
          break;
        case 'beaten':
        case 'waiting': {
          // Walk back home.
          const hd = Math.hypot(t.homeX - t.x, t.homeZ - t.z);
          if (hd > 0.3) {
            t.heading = turn(t.heading, Math.atan2(-(t.homeZ - t.z), t.homeX - t.x), dt * 6);
            speed = 1.4;
            t.x += Math.cos(t.heading) * speed * dt;
            t.z -= Math.sin(t.heading) * speed * dt;
          }
          break;
        }
      }
      const y = t.y ?? this.groundY(t.x, t.z);
      t.model.root.position.set(t.x, y, t.z);
      t.model.root.rotation.y = t.heading;
      t.model.update(dt, speed, true);
      if (t.pet) {
        // The lead creature stays at their side.
        const side = t.heading + Math.PI / 2;
        const px = t.x + Math.cos(side) * 1.1 - Math.cos(t.heading) * 0.3;
        const pz = t.z - Math.sin(side) * 1.1 + Math.sin(t.heading) * 0.3;
        t.pet.root.position.set(px, t.y ?? this.groundY(px, pz), pz);
        t.pet.root.rotation.y = Math.atan2(Math.cos(t.heading), -Math.sin(t.heading));
        t.pet.root.visible = t.state !== 'battle';
        t.pet.play(speed > 0.1 ? 'walk' : 'idle');
        t.pet.mixer.update(dt);
      }
      if (t.bubble) t.bubble.position.set(t.x, y + 2.25, t.z);
    }
  }

  /** Minimap markers for trainers you haven't beaten yet. */
  markers(player: THREE.Vector3): Array<{ x: number; z: number; color: string; size: number }> {
    return this.trainers
      .filter((t) => !this.beaten.has(t.spec.id) && t.y === null && Math.hypot(t.x - player.x, t.z - player.z) < 260)
      .map((t) => ({ x: t.x, z: t.z, color: '#ff4d6d', size: 7 }));
  }

  private spawnModel(t: Trainer): void {
    const look: HumanoidLook = { skin: '#8d5a3b', hair: '#1b1410', shoes: '#e8e8e8', scale: t.spec.look.build === 'f' ? 0.97 : 1.02, ...t.spec.look };
    if (t.spec.id.charCodeAt(0) % 3 === 0) look.skin = '#e0b48f';
    else if (t.spec.id.charCodeAt(0) % 3 === 1) look.skin = '#c08a5c';
    const m = new Humanoid(look);
    // A bandana in the gang colour.
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 6, 14), withSurface(new THREE.MeshStandardMaterial({ color: t.spec.look.top, roughness: 0.7 }), 'fabric'));
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 1.66, 0);
    m.root.add(band);
    m.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(m.root);
    t.model = m;
    if (!t.pet && !t.petLoading) {
      t.petLoading = true;
      const [lead] = t.spec.team[0];
      void this.models.instance(lead).then((inst) => {
        t.petLoading = false;
        if (!t.model) return inst.dispose();
        t.pet = inst;
        this.scene.add(inst.root);
      });
    }
  }

  private despawnModel(t: Trainer): void {
    t.model?.root.removeFromParent();
    t.model = null;
    t.pet?.dispose();
    t.pet = null;
    this.showBubble(t, false);
  }

  private showBubble(t: Trainer, on: boolean): void {
    if (!on) {
      t.bubble?.removeFromParent();
      t.bubble = null;
      return;
    }
    if (t.bubble) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.setScalar(0.55);
    this.scene.add(s);
    t.bubble = s;
  }
}

function turn(from: number, to: number, step: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-step, Math.min(step, d));
}

/** A sidewalk spot at the trainer's corner (or a lawn spot in the park). */
function spotFor(L: CityLayout, t: TrainerSpec, walkable: (x: number, z: number) => boolean): { x: number; z: number } {
  let x: number;
  let z: number;
  if (t.corner === 'park') {
    const f = (t.street - CITY.parkStreets[0]) / (CITY.parkStreets[1] - CITY.parkStreets[0]);
    x = L.park.x0 + (L.park.x1 - L.park.x0) * 0.2;
    z = L.park.z0 + (L.park.z1 - L.park.z0) * Math.min(0.9, Math.max(0.1, f));
  } else {
    const sx = t.corner.includes('e') ? 1 : -1;
    const sz = t.corner.includes('s') ? 1 : -1;
    x = L.aveX[t.ave] + sx * (CITY.aveWidth / 2 + 6);
    z = L.streetZ[t.street] + sz * (CITY.streetWidth / 2 + 2.2);
  }
  // Nudge onto open ground.
  for (let r = 0; r < 12; r++) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a / 8) * Math.PI * 2) * r;
      const pz = z + Math.sin((a / 8) * Math.PI * 2) * r;
      if (walkable(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

