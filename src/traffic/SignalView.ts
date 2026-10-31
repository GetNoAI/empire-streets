import * as THREE from 'three';
import type { SignalLenses } from '../world/CityBuilder';
import type { RoadGraph } from './RoadGraph';
import type { Light, Signals } from './Signals';

const ON: Record<Light, THREE.Color> = {
  red: new THREE.Color(4, 0.35, 0.25),
  yellow: new THREE.Color(3.5, 2.0, 0.3),
  green: new THREE.Color(0.35, 3.5, 1.0),
};
const OFF = new THREE.Color(0.08, 0.08, 0.08);

/** Lights the red/amber/green lenses of every signal head from the live signal state. */
export class SignalView {
  private readonly nodeOf: number[];
  private readonly last: Array<Light | null>;
  private timer = 0;

  constructor(
    private readonly lenses: SignalLenses,
    graph: RoadGraph,
    private readonly signals: Signals,
  ) {
    this.nodeOf = lenses.heads.map((h) => {
      const n = graph.nodes.find((m) => Math.abs(m.x - h.nodeX) < 1 && Math.abs(m.z - h.nodeZ) < 1);
      return n ? n.id : -1;
    });
    this.last = lenses.heads.map(() => null);
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    let changed = false;
    const { red, amber, green, heads } = this.lenses;
    for (let i = 0; i < heads.length; i++) {
      const node = this.nodeOf[i];
      if (node < 0) continue;
      const light = this.signals.light(node, heads[i].axis);
      if (light === this.last[i]) continue;
      this.last[i] = light;
      red.setColorAt(i, light === 'red' ? ON.red : OFF);
      amber.setColorAt(i, light === 'yellow' ? ON.yellow : OFF);
      green.setColorAt(i, light === 'green' ? ON.green : OFF);
      changed = true;
    }
    if (changed) {
      for (const m of [red, amber, green]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
