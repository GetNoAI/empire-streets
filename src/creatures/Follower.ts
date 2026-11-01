import * as THREE from 'three';
import type { CreatureInstance, CreatureModels } from './CreatureModels';
import type { Creature } from './Creature';
import { species } from './Data';

/**
 * Your summoned Streetmon walking with you outside battles: it trots along beside and a little
 * behind you, catches up if you get ahead, and is put away while you drive or fight (the battle
 * stages its own model). Summon/recall with G.
 */
export class Follower {
  summoned = false;
  inst: CreatureInstance | null = null;
  private loadingKey = '';
  private key = '';
  creature: Creature | null = null;
  x = 0;
  y = 0;
  z = 0;
  private heading = 0;
  private speed = 0;
  private hidden = false;
  /** Where to stand relative to the player: metres behind and to the right. */
  offset = { back: 1.4, side: 0.9 };
  /** A spot to go to instead of following (a heist crew member at work). */
  goal: { x: number; z: number } | null = null;
  /** At the goal: play the attack clip (working on a door) instead of idling. */
  work = false;
  /** Something to turn toward when standing (a wild one it's fighting). */
  faceAt: { x: number; z: number } | null = null;
  /** Game-clock seconds left on a one-off clip (attack, hurt) before it goes back to walk/idle. */
  private clipFor = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: CreatureModels,
    private readonly groundY: (x: number, z: number) => number,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {}

  get visible(): boolean {
    return !!this.inst && this.inst.root.visible;
  }

  /** Plays a one-off clip (attack, hurt) over the walk/idle for a moment. */
  playOnce(clip: 'attack' | 'hurt', seconds = 0.6): void {
    if (!this.inst) return;
    this.inst.play(clip, 0.05);
    this.clipFor = seconds;
  }

  get height(): number {
    return this.creature ? species(this.creature.speciesId).model.height : 0;
  }

  summon(c: Creature, near: THREE.Vector3): void {
    this.summoned = true;
    this.setCreature(c);
    this.x = near.x + 1;
    this.z = near.z + 1;
    this.y = this.groundY(this.x, this.z);
  }

  recall(): void {
    this.summoned = false;
    this.inst?.dispose();
    this.inst = null;
    this.creature = null;
    this.key = '';
    this.loadingKey = '';
  }

  private setCreature(c: Creature): void {
    this.creature = c;
    const key = `${c.uid}|${c.speciesId}|${c.shiny}`;
    if (key === this.key || key === this.loadingKey) return;
    this.loadingKey = key;
    void this.models.instance(c.speciesId, c.shiny).then((inst) => {
      if (this.loadingKey !== key || !this.summoned) {
        inst.dispose();
        return;
      }
      this.inst?.dispose();
      this.inst = inst;
      this.key = key;
      this.loadingKey = '';
      this.scene.add(inst.root);
    });
  }

  /**
   * `lead` is the creature that should be out (the party lead); `hide` puts it away (driving,
   * battles, menus). `facing` is the player's heading (cars/player convention).
   */
  update(dt: number, player: THREE.Vector3, facing: number, lead: Creature | null, hide: boolean): void {
    if (!this.summoned) return;
    if (!lead || lead.hp <= 0) return;
    if (lead !== this.creature || `${lead.uid}|${lead.speciesId}|${lead.shiny}` !== this.key) this.setCreature(lead);
    const wasHidden = this.hidden;
    this.hidden = hide;
    if (this.inst) this.inst.root.visible = !hide;
    if (hide) return;
    const fx = Math.cos(facing);
    const fz = -Math.sin(facing);
    // Spot: a step behind and to the right of the player.
    const ob = this.offset.back;
    const os = this.offset.side;
    let tx = player.x - fx * ob + fz * -os;
    let tz = player.z - fz * ob - fx * -os;
    if (this.blocked(tx, tz)) {
      tx = player.x - fx * ob;
      tz = player.z - fz * ob;
    }
    if (this.goal) {
      tx = this.goal.x;
      tz = this.goal.z;
    }
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if ((d > 18 && !this.goal) || wasHidden) {
      // Too far behind (or just came back out): appear beside you.
      this.x = tx;
      this.z = tz;
      this.speed = 0;
    } else if (d > 0.35) {
      const want = Math.min(this.goal ? 7 : 9, d * 2.6);
      this.speed += (want - this.speed) * Math.min(1, dt * 6);
      const step = Math.min(d, this.speed * dt);
      const nx = this.x + (dx / d) * step;
      const nz = this.z + (dz / d) * step;
      if (!this.blocked(nx, nz)) {
        this.x = nx;
        this.z = nz;
      } else {
        this.x = tx;
        this.z = tz;
      }
      this.heading = Math.atan2(dx, dz);
    } else {
      this.speed *= Math.max(0, 1 - dt * 8);
      // Face the way you're facing when standing (or whatever it's squaring up to).
      const want = this.faceAt ? Math.atan2(this.faceAt.x - this.x, this.faceAt.z - this.z) : Math.atan2(fx, fz);
      let a = want - this.heading;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      this.heading += a * Math.min(1, dt * 3);
    }
    this.y = this.groundY(this.x, this.z);
    const inst = this.inst;
    if (!inst) return;
    inst.root.position.set(this.x, this.y, this.z);
    inst.root.rotation.y = this.heading;
    this.clipFor = Math.max(0, this.clipFor - dt);
    if (this.clipFor <= 0) inst.play(this.speed > 0.4 ? 'walk' : this.work ? 'attack' : 'idle');
    const walk = inst.clips.get('walk');
    const a = walk ? inst.mixer.existingAction(walk) : null;
    if (a) a.timeScale = Math.max(0.7, this.speed / Math.max(0.6, this.height * 1.4));
    inst.mixer.update(dt);
  }
}
