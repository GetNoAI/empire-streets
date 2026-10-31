import type { Axis, RoadGraph } from './RoadGraph';

export type Light = 'green' | 'yellow' | 'red';

/** Seconds per phase. Avenues get the longer green, as in Manhattan. */
export const SIGNAL_TIMING = {
  aveGreen: 16,
  streetGreen: 11,
  yellow: 3,
  allRed: 1.5,
} as const;

export const SIGNAL_CYCLE =
  SIGNAL_TIMING.aveGreen + SIGNAL_TIMING.yellow + SIGNAL_TIMING.allRed + SIGNAL_TIMING.streetGreen + SIGNAL_TIMING.yellow + SIGNAL_TIMING.allRed;

/**
 * Fixed-time signals at every junction. Offsets along each avenue create a "green wave"
 * for northbound traffic at about 13 m/s.
 */
export class Signals {
  private time = 0;
  private readonly offsets: number[];

  constructor(private readonly graph: RoadGraph) {
    this.offsets = graph.nodes.map((n) => {
      // Downstream (north) junctions turn green later, by the travel time between them.
      const wave = -n.z / 13;
      return (((wave + n.i * 7.3) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
    });
  }

  update(dt: number): void {
    this.time += dt;
  }

  /** Light shown to traffic travelling along `axis` at node `id`. */
  light(id: number, axis: Axis): Light {
    return lightAt(this.time + this.offsets[id], axis);
  }

  /** Pedestrians may start crossing a road of `axis` while the cross street has green. */
  walk(id: number, roadAxis: Axis): boolean {
    return this.light(id, roadAxis === 'ave' ? 'street' : 'ave') === 'green';
  }

  get nodeCount(): number {
    return this.graph.nodes.length;
  }
}

export function lightAt(t: number, axis: Axis): Light {
  const T = SIGNAL_TIMING;
  const c = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const aveEnd = T.aveGreen;
  const aveYellowEnd = aveEnd + T.yellow;
  const streetStart = aveYellowEnd + T.allRed;
  const streetEnd = streetStart + T.streetGreen;
  const streetYellowEnd = streetEnd + T.yellow;
  if (axis === 'ave') {
    if (c < aveEnd) return 'green';
    if (c < aveYellowEnd) return 'yellow';
    return 'red';
  }
  if (c >= streetStart && c < streetEnd) return 'green';
  if (c >= streetEnd && c < streetYellowEnd) return 'yellow';
  return 'red';
}
