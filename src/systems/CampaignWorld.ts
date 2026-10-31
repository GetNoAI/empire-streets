import * as THREE from 'three';
import { Humanoid } from '../player/Humanoid';
import { markBloom } from '../render/SelectiveBloom';
import type { QuestManager, QuestMarker } from './questManager.js';

/**
 * The campaign in the world: the people who give you jobs and the bosses you fight, standing on
 * their corners with an icon over their heads (a yellow M for a job on offer, a tick for a
 * turn-in, a red skull for a boss you're sent to fight), and the current objective: a yellow
 * beacon with a ring on the ground showing its boundary.
 *
 * People only stand there while they have something for you (and you're within
 * `giverShowRadius`); bosses only while you're sent to fight them.
 */

export interface CampaignWorldDeps {
  scene: THREE.Scene;
  quests: QuestManager;
  groundY(x: number, z: number): number;
  /** Where the player is (on foot or in a car) and their layer. */
  player(): { x: number; z: number; onFoot: boolean; layer: string };
}

type IconKind = 'offer' | 'turnIn' | 'boss';

interface Figure {
  id: string;
  kind: 'npc' | 'boss';
  model: Humanoid;
  icon: THREE.Sprite;
  iconKind: IconKind;
  x: number;
  z: number;
  heading: number;
  bob: number;
}

const ICON_COLORS: Record<IconKind, string> = { offer: '#ffd23f', turnIn: '#4be37a', boss: '#ff4b3a' };

function iconTexture(kind: IconKind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(66, 68, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ICON_COLORS[kind];
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#111';
  g.strokeStyle = '#111';
  if (kind === 'offer') {
    g.font = '900 78px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('M', 64, 68);
  } else if (kind === 'turnIn') {
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(38, 66);
    g.lineTo(56, 84);
    g.lineTo(92, 44);
    g.stroke();
  } else {
    // Skull.
    g.beginPath();
    g.arc(64, 56, 30, 0, Math.PI * 2);
    g.fill();
    g.fillRect(46, 74, 36, 22);
    g.fillStyle = ICON_COLORS.boss;
    for (const x of [52, 76]) {
      g.beginPath();
      g.arc(x, 56, 8, 0, Math.PI * 2);
      g.fill();
    }
    for (const x of [54, 62, 70]) g.fillRect(x, 84, 4, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CampaignWorld {
  private readonly figures = new Map<string, Figure>();
  private readonly icons: Record<IconKind, THREE.SpriteMaterial>;
  readonly beacon: THREE.Group;
  private readonly ring: THREE.Mesh;
  private time = 0;

  constructor(private readonly d: CampaignWorldDeps) {
    this.icons = {
      offer: new THREE.SpriteMaterial({ map: iconTexture('offer'), depthTest: false, transparent: true }),
      turnIn: new THREE.SpriteMaterial({ map: iconTexture('turnIn'), depthTest: false, transparent: true }),
      boss: new THREE.SpriteMaterial({ map: iconTexture('boss'), depthTest: false, transparent: true }),
    };
    // The objective: a column of light and a ring on the ground.
    this.beacon = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    col.position.y = 20;
    markBloom(col);
    this.beacon.add(col);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.4), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    markBloom(this.ring);
    this.beacon.add(this.ring);
    this.beacon.visible = false;
    this.beacon.name = 'mission-beacon';
    d.scene.add(this.beacon);
  }

  /** Who's standing where (for markers and dialogue). */
  where(ref: string): { x: number; z: number } | null {
    const [kind, id] = ref.split(':');
    const Q = this.d.quests;
    if (kind === 'npc') return Q.npc(id)?.at ?? null;
    if (kind === 'boss') return Q.boss(id)?.at ?? null;
    return null;
  }

  /** The person or boss within talking range on foot, if any. */
  nearby(): { kind: 'npc' | 'boss'; id: string; name: string } | null {
    const p = this.d.player();
    if (!p.onFoot || p.layer !== 'street') return null;
    const R = this.d.quests.campaign.settings?.talkRadius ?? 2.4;
    let best: Figure | null = null;
    let bd = R;
    for (const f of this.figures.values()) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    if (!best) return null;
    const name = best.kind === 'npc' ? this.d.quests.npc(best.id)?.name ?? best.id : this.d.quests.boss(best.id)?.name ?? best.id;
    return { kind: best.kind, id: best.id, name };
  }

  /** The closest person or boss standing within `r` metres (any layer check left to the caller). */
  within(r: number): { kind: 'npc' | 'boss'; id: string } | null {
    const p = this.d.player();
    let best: Figure | null = null;
    let bd = r;
    for (const f of this.figures.values()) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best ? { kind: best.kind, id: best.id } : null;
  }

  /** The prompt line for whoever's in range. */
  prompt(): string | null {
    const n = this.nearby();
    if (!n) return null;
    return n.kind === 'boss' ? `E  Challenge ${n.name}` : `E  Talk to ${n.name}`;
  }

  update(dt: number, markers: QuestMarker[], hideBeacon = false): void {
    this.time += dt;
    const Q = this.d.quests;
    const p = this.d.player();
    const show = Q.campaign.settings?.giverShowRadius ?? 160;
    // Who should be standing in the world.
    const want = new Map<string, { kind: 'npc' | 'boss'; id: string; icon: IconKind }>();
    if (p.layer === 'street') {
      for (const g of Q.givers()) {
        if (g.role === 'active') continue;
        // A tick for a turn-in; an M for a job on offer or someone you've been sent to.
        want.set(`npc:${g.npc}`, { kind: 'npc', id: g.npc, icon: g.role === 'turnIn' && Q.status(g.quest) === 'ready' ? 'turnIn' : 'offer' });
      }
      for (const m of markers) if (m.kind === 'boss') {
        const a = [...Q.activeQuests.keys()].find((id) => id === m.quest);
        const o = a ? Q.currentObjective(a) : null;
        if (o?.boss) want.set(`boss:${o.boss}`, { kind: 'boss', id: o.boss, icon: 'boss' });
      }
    }
    for (const [key, f] of this.figures) {
      const w = want.get(key);
      if (!w || Math.hypot(f.x - p.x, f.z - p.z) > show + 20) {
        this.drop(key);
        continue;
      }
      if (w.icon !== f.iconKind) {
        f.iconKind = w.icon;
        f.icon.material = this.icons[w.icon];
      }
    }
    for (const [key, w] of want) {
      if (this.figures.has(key)) continue;
      const def = w.kind === 'npc' ? Q.npc(w.id) : Q.boss(w.id);
      if (!def || Math.hypot(def.at.x - p.x, def.at.z - p.z) > show) continue;
      const model = new Humanoid({ ...def.look, scale: w.kind === 'boss' ? 1.08 : 1 });
      const icon = new THREE.Sprite(this.icons[w.icon]);
      icon.scale.setScalar(0.9);
      icon.renderOrder = 21;
      model.root.name = `campaign-${key}`;
      this.d.scene.add(model.root);
      this.d.scene.add(icon);
      this.figures.set(key, { id: w.id, kind: w.kind, model, icon, iconKind: w.icon, x: def.at.x, z: def.at.z, heading: def.heading ?? 0, bob: Math.random() * 6 });
    }
    for (const f of this.figures.values()) {
      const y = this.d.groundY(f.x, f.z);
      f.model.root.position.set(f.x, y, f.z);
      // Turn to face you when you come close.
      const dist = Math.hypot(p.x - f.x, p.z - f.z);
      // (Heading as the crowd uses it: atan2(-dz, dx), 0 = facing +x.)
      const want = dist < 12 ? Math.atan2(-(p.z - f.z), p.x - f.x) : f.heading;
      let dh = want - f.model.root.rotation.y;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      f.model.root.rotation.y += dh * Math.min(1, dt * 4);
      f.model.update(dt, 0, true);
      f.icon.position.set(f.x, y + 2.55 + Math.sin(this.time * 2.4 + f.bob) * 0.08, f.z);
    }
    // The tracked objective's beacon (a REACH_MARKER boundary, or the objective's spot).
    const target = markers.find((m) => m.tracked && m.kind === 'boundary') ?? markers.find((m) => m.tracked && (m.kind === 'objective' || m.kind === 'boss'));
    this.beacon.visible = !!target && p.layer === 'street' && !hideBeacon;
    if (target) {
      // A person is the objective: just the ring at their feet, no column through them.
      this.beacon.children[0].visible = !target.person;
      this.beacon.position.set(target.x, this.d.groundY(target.x, target.z) + 0.05, target.z);
      const r = target.kind === 'boundary' ? target.radius ?? 6 : 2.2;
      this.ring.scale.setScalar(r);
      const col = new THREE.Color(target.color);
      for (const c of this.beacon.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(1.5);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.time * 3) * 0.25;
    }
  }

  /** People standing in the world (tests, debugging). */
  get standing(): string[] {
    return [...this.figures.keys()];
  }

  private drop(key: string): void {
    const f = this.figures.get(key);
    if (!f) return;
    f.model.root.removeFromParent();
    f.icon.removeFromParent();
    this.figures.delete(key);
  }

  clear(): void {
    for (const k of [...this.figures.keys()]) this.drop(k);
    this.beacon.visible = false;
  }
}
