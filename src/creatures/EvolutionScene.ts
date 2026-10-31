import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { Effects } from '../fx/Effects';
import type { CreatureInstance, CreatureModels } from './CreatureModels';
import { displayName, type Creature } from './Creature';
import { move, species } from './Data';
import { evolve, replaceMove, type ProgressEvent } from './Progression';
import { EvolutionFx, silhouette } from '../fx/EvolutionFx';
import { playCry } from './CreatureCry';

/**
 * The evolution sequence, staged in the street next to the player: a column of light rises round
 * the creature, motes of light spiral in, the screen's edges darken and a shimmering tone climbs;
 * the creature turns into a white silhouette (playing its evolve_glow clip) and flickers between
 * its old and new shapes faster and faster while the camera eases in, then a white flash, a ring
 * of light across the ground and a fanfare as it bursts into the new form (EvolutionFx). Press B (or the button) before the end to stop it. Afterwards, any moves the
 * new form can learn are offered.
 */

const GLOW_START = 1.2;
const FLICKER_START = 3.2;
const DONE_AT = 6;

export class EvolutionScene {
  private readonly el: HTMLDivElement;
  private readonly msg: HTMLDivElement;
  private readonly buttons: HTMLDivElement;
  private creature: Creature | null = null;
  private to = '';
  private t = 0;
  private stage: 'intro' | 'glow' | 'learn' | 'outro' | 'idle' = 'idle';
  private oldInst: CreatureInstance | null = null;
  private newInst: CreatureInstance | null = null;
  private readonly at = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private onDone: ((evolved: boolean) => void) | null = null;
  private evolved = false;
  private pending: ProgressEvent[] = [];
  private outroUntil = 0;
  private oldName = '';
  private oldSpecies = '';
  private readonly fx: EvolutionFx;
  private stopRise: (() => void) | null = null;
  private build = 0;

  constructor(
    parent: HTMLElement,
    private readonly scene: THREE.Scene,
    private readonly models: CreatureModels,
    private readonly effects: Effects,
    private readonly groundY: (x: number, z: number) => number,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'evo';
    this.el.style.display = 'none';
    this.msg = document.createElement('div');
    this.msg.className = 'b-msg';
    this.buttons = document.createElement('div');
    this.buttons.className = 'b-menu fight';
    this.el.append(this.msg, this.buttons);
    parent.appendChild(this.el);
    this.fx = new EvolutionFx(scene, parent);
    this.buttons.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || b.disabled) return;
      this.press(b.dataset['act'] ?? '', Number(b.dataset['arg'] ?? -1));
    });
  }

  get active(): boolean {
    return this.stage !== 'idle';
  }

  /** Starts the sequence in front of the player (`facing`: direction the player looks, XZ). */
  start(c: Creature, to: string, player: THREE.Vector3, facing: THREE.Vector3, onDone: (evolved: boolean) => void): void {
    this.creature = c;
    this.to = to;
    this.t = 0;
    this.stage = 'intro';
    this.build = 0;
    this.evolved = false;
    this.pending = [];
    this.onDone = onDone;
    this.oldName = displayName(c);
    this.oldSpecies = c.speciesId;
    const f = facing.clone().setY(0).normalize();
    this.at.copy(player).addScaledVector(f, 2.6);
    this.at.y = this.groundY(this.at.x, this.at.z);
    const right = new THREE.Vector3(f.z, 0, -f.x);
    this.camPos.copy(player).addScaledVector(right, 1.6).addScaledVector(f, -0.6).setY(this.at.y + 1.7);
    this.camLook.copy(this.at).setY(this.at.y + species(c.speciesId).model.height * 0.5);
    this.el.style.display = 'block';
    this.fx.start(this.at, species(c.speciesId).model.height);
    this.message(`What? ${this.oldName} is evolving!`);
    this.drawButtons();
    const heading = Math.atan2(-f.x, -f.z);
    void this.models.instance(c.speciesId, c.shiny).then((inst) => {
      if (this.creature !== c) return inst.dispose();
      this.oldInst = inst;
      inst.root.position.copy(this.at);
      inst.root.rotation.y = heading;
      this.scene.add(inst.root);
    });
    void this.models.instance(to, c.shiny).then((inst) => {
      if (this.creature !== c) return inst.dispose();
      this.newInst = inst;
      inst.root.position.copy(this.at);
      inst.root.rotation.y = heading;
      inst.root.visible = false;
      // The new shape only ever shows as a silhouette until the burst.
      if (!this.evolved) silhouette(inst.root, true);
      this.scene.add(inst.root);
    });
  }

  cameraPose(pos: THREE.Vector3, look: THREE.Vector3): void {
    // Eases in as it builds (a quarter of the way), and back out after.
    pos.copy(this.camPos).lerp(this.camLook, this.build * 0.25);
    look.copy(this.camLook);
  }

  private message(t: string): void {
    this.msg.textContent = t;
  }

  private drawButtons(): void {
    if (this.stage === 'intro' || this.stage === 'glow') {
      this.buttons.innerHTML = `<button class="bbtn back" data-act="stop"><b>Stop evolution</b><small>B</small></button>`;
      this.buttons.style.display = 'grid';
    } else if (this.stage === 'learn') {
      const e = this.pending[0];
      if (!e || e.kind !== 'learnPrompt') return;
      const c = this.creature!;
      this.buttons.innerHTML =
        c.moves
          .map((id, i) => {
            const locked = id === 'reload' && species(c.speciesId).types.includes('gun');
            return `<button class="bbtn move" data-act="forget" data-arg="${i}" ${locked ? 'disabled' : ''}><b>Forget ${move(id).name}</b><small>${locked ? 'Gun types must keep Reload' : ''}</small><kbd>${i + 1}</kbd></button>`;
          })
          .join('') + `<button class="bbtn back" data-act="forget" data-arg="-1"><b>Don't learn ${move(e.moveId).name}</b><kbd>5</kbd></button>`;
      this.buttons.style.display = 'grid';
    } else {
      this.buttons.innerHTML = '';
      this.buttons.style.display = 'none';
    }
  }

  /** Keys: B stops; 1-5 answer a move prompt. Returns true if used. */
  key(code: string): boolean {
    if (!this.active) return false;
    if (code === 'KeyB') {
      this.press('stop', -1);
      return true;
    }
    const n = code.startsWith('Digit') ? Number(code.slice(5)) : 0;
    if (this.stage === 'learn' && n >= 1 && n <= 5) {
      const btn = this.buttons.querySelectorAll('button')[n - 1] as HTMLButtonElement | undefined;
      if (btn && !btn.disabled) this.press('forget', Number(btn.dataset['arg']));
      return true;
    }
    return false;
  }

  private press(act: string, arg: number): void {
    if (act === 'stop' && (this.stage === 'intro' || this.stage === 'glow')) {
      // Cancelled: back to the old shape.
      this.oldInst?.play('idle', 0.2);
      if (this.oldInst) this.oldInst.root.visible = true;
      if (this.newInst) this.newInst.root.visible = false;
      this.message(`Huh? ${this.oldName} stopped evolving!`);
      this.stopRise?.();
      this.stopRise = null;
      this.fx.cancel();
      if (this.oldInst) silhouette(this.oldInst.root, false);
      this.stage = 'outro';
      this.outroUntil = this.t + 2;
      this.drawButtons();
      audio.thud();
    } else if (act === 'forget' && this.stage === 'learn') {
      const e = this.pending.shift();
      if (e && e.kind === 'learnPrompt') {
        const c = this.creature!;
        const old = arg >= 0 ? replaceMove(c, arg, e.moveId) : null;
        this.message(old ? `${displayName(c)} forgot ${move(old).name} and learned ${move(e.moveId).name}!` : `${displayName(c)} did not learn ${move(e.moveId).name}.`);
      }
      this.nextPending();
    }
  }

  private nextPending(): void {
    while (this.pending.length && this.pending[0].kind === 'learned') {
      const e = this.pending.shift()!;
      if (e.kind === 'learned') this.message(`${displayName(e.creature)} learned ${move(e.moveId).name}!`);
    }
    if (this.pending.length && this.pending[0].kind === 'learnPrompt') {
      const e = this.pending[0];
      this.stage = 'learn';
      if (document.pointerLockElement) document.exitPointerLock();
      if (e.kind === 'learnPrompt') this.message(`${displayName(e.creature)} wants to learn ${move(e.moveId).name}, but already knows 4 moves. Forget one?`);
      this.drawButtons();
      return;
    }
    this.stage = 'outro';
    this.outroUntil = this.t + 2.2;
    this.drawButtons();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    this.oldInst?.mixer.update(dt);
    this.newInst?.mixer.update(dt);
    if (this.stage === 'intro' && t >= GLOW_START) {
      this.stage = 'glow';
      this.oldInst?.play('evolve_glow', 0.3);
      this.stopRise = audio.evolveRise(DONE_AT - GLOW_START);
    }
    // How far it has built (0..1), and the flicker (0..1).
    const target = this.stage === 'glow' ? Math.min(1, (t - GLOW_START) / (DONE_AT - GLOW_START)) : this.stage === 'intro' ? 0.05 : 0;
    this.build += (target - this.build) * Math.min(1, dt * (this.stage === 'glow' ? 6 : 1.5));
    const flicker = this.stage === 'glow' && t > FLICKER_START ? (t - FLICKER_START) / (DONE_AT - FLICKER_START) : 0;
    this.fx.update(dt, this.stage === 'glow' ? target : 0, flicker);
    // The old shape whitens out a moment into the glow.
    if (this.stage === 'glow' && t > GLOW_START + 0.7 && this.oldInst && !this.oldInst.root.userData['evoWhite']) {
      this.oldInst.root.userData['evoWhite'] = true;
      silhouette(this.oldInst.root, true);
    }
    if (this.stage === 'glow') {
      // Flicker between old and new shapes, faster and faster.
      if (t > FLICKER_START && this.oldInst && this.newInst) {
        const k = (t - FLICKER_START) / (DONE_AT - FLICKER_START);
        const rate = 2 + k * 14;
        const showNew = Math.sin((t - FLICKER_START) * rate * Math.PI) > 0.35 - k * 0.5;
        this.oldInst.root.visible = !showNew;
        this.newInst.root.visible = showNew;
        if (!this.newInst.current || this.newInst.current === 'idle') this.newInst.play('evolve_glow', 0);
      }
      if (t >= DONE_AT) this.complete();
    }
    if (this.stage === 'outro' && t >= this.outroUntil) this.finish();
  }

  private complete(): void {
    const c = this.creature!;
    this.pending = evolve(c, this.to);
    this.evolved = true;
    if (this.oldInst) this.oldInst.root.visible = false;
    if (this.newInst) {
      silhouette(this.newInst.root, false);
      this.newInst.root.visible = true;
      this.newInst.play('idle', 0.3);
    }
    this.stopRise = null;
    this.fx.burst();
    const h = species(this.to).model.height;
    // A bigger new form: the camera steps back and looks up to keep it all in frame.
    const oldH = species(this.oldSpecies).model.height;
    if (h > oldH) {
      const away = this.camPos.clone().sub(this.at).setY(0).normalize();
      this.camPos.addScaledVector(away, (h - oldH) * 1.1);
      this.camPos.y += (h - oldH) * 0.5;
    }
    this.camLook.y = this.at.y + h * 0.5;
    this.effects.sparks(this.at.x, this.at.y + 0.8, this.at.z, 30);
    this.effects.burst({ x: this.at.x, y: this.at.y + h * 0.5, z: this.at.z, count: 40, r: 1, g: 0.95, b: 0.75, speed: 5, up: 2, life: 1.1, size0: 0.35, size1: 0.05, drag: 1.2 });
    this.effects.burst({ x: this.at.x, y: this.at.y + 0.1, z: this.at.z, count: 30, r: 0.75, g: 0.9, b: 1, speed: 3, up: 4, life: 1.6, size0: 0.18, size1: 0.02, lift: 1.5, jitter: h });
    audio.evolveBurst();
    // The new form's first cry, just after the fanfare.
    const to = this.to;
    window.setTimeout(() => playCry(to, 3), 900);
    this.message(`Congratulations! ${this.oldName} evolved into ${species(this.to).name}!`);
    this.stage = 'outro';
    this.outroUntil = this.t + 2.4;
    this.drawButtons();
    // Move prompts follow after the congratulations.
    if (this.pending.length) {
      const queued = this.pending;
      this.pending = [];
      window.setTimeout(() => {
        if (this.creature !== c) return;
        this.pending = queued;
        this.nextPending();
      }, 2200);
      this.outroUntil = Infinity;
    }
  }

  private finish(): void {
    this.stage = 'idle';
    this.build = 0;
    this.stopRise?.();
    this.stopRise = null;
    this.fx.hide();
    for (const inst of [this.oldInst, this.newInst]) if (inst) silhouette(inst.root, false);
    this.el.style.display = 'none';
    this.oldInst?.dispose();
    this.newInst?.dispose();
    this.oldInst = null;
    this.newInst = null;
    this.creature = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.(this.evolved);
  }
}
