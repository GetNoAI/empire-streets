import { CITY, type CityLayout } from '../world/CityLayout';

/**
 * Lane-level road network derived from the city layout (engine-free, unit-tested).
 * Nodes are junctions of an avenue and a street. Traffic drives on the right.
 * Directions: 0 = north (-Z), 1 = east (+X), 2 = south (+Z), 3 = west (-X).
 */

export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DZ = [-1, 0, 1, 0] as const;
/** Heading angle about +Y (0 = +X) for each direction, matching three.js rotation.y. */
export const DIR_HEADING = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;

export const LANE_WIDTH = 3.3;

export interface Point {
  x: number;
  z: number;
}

export interface Node {
  id: number;
  i: number;
  j: number;
  x: number;
  z: number;
  /** Neighbour node id per direction, or -1. */
  next: [number, number, number, number];
}

export type Axis = 'ave' | 'street';

export const axisOf = (d: Dir): Axis => (d === 0 || d === 2 ? 'ave' : 'street');
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;

/** Right-hand perpendicular of a travel direction (forward x up). */
export function rightOf(d: Dir): Point {
  return { x: -DZ[d], z: DX[d] };
}

export class RoadGraph {
  readonly nodes: Node[] = [];
  private readonly byIJ = new Map<string, Node>();

  constructor(readonly layout: CityLayout) {
    const L = layout;
    const covers = (kind: 'ave' | 'street', center: number, along: number): boolean =>
      L.roads.some((r) => r.kind === kind && Math.abs(r.center - center) < 0.01 && along >= r.from - 0.01 && along <= r.to + 0.01);
    L.aveX.forEach((x, i) => {
      L.streetZ.forEach((z, j) => {
        if (!covers('ave', x, z) || !covers('street', z, x)) return;
        const n: Node = { id: this.nodes.length, i, j, x, z, next: [-1, -1, -1, -1] };
        this.nodes.push(n);
        this.byIJ.set(`${i},${j}`, n);
      });
    });
    // Link neighbours when the road between them actually exists (no link across the park).
    for (const n of this.nodes) {
      const north = this.byIJ.get(`${n.i},${n.j - 1}`);
      const south = this.byIJ.get(`${n.i},${n.j + 1}`);
      const east = this.byIJ.get(`${n.i + 1},${n.j}`);
      const west = this.byIJ.get(`${n.i - 1},${n.j}`);
      if (north && covers('ave', n.x, (n.z + north.z) / 2)) n.next[0] = north.id;
      if (south && covers('ave', n.x, (n.z + south.z) / 2)) n.next[2] = south.id;
      if (east && covers('street', n.z, (n.x + east.x) / 2)) n.next[1] = east.id;
      if (west && covers('street', n.z, (n.x + west.x) / 2)) n.next[3] = west.id;
    }
  }

  node(id: number): Node {
    return this.nodes[id];
  }

  nodeAt(i: number, j: number): Node | undefined {
    return this.byIJ.get(`${i},${j}`);
  }

  /** Number of lanes each way on roads in direction d. */
  lanes(d: Dir): number {
    return axisOf(d) === 'ave' ? 2 : 1;
  }

  /** Lane centre offset to the right of the road centre line. lane 0 = inner (next to the centre). */
  laneOffset(lane: number): number {
    return LANE_WIDTH * (lane + 0.5);
  }

  /** Half-size of a junction box measured along direction d (how far it extends before/after the centre). */
  junctionHalf(d: Dir): number {
    return axisOf(d) === 'ave' ? CITY.streetWidth / 2 : CITY.aveWidth / 2;
  }

  /** Distance from a junction centre to the stop line for traffic travelling in d. */
  stopDistance(d: Dir): number {
    return this.junctionHalf(d) + 4.2;
  }

  /** Point on the lane line of direction d and lane, `s` metres past node n along d. */
  lanePoint(n: Node, d: Dir, lane: number, s: number): Point {
    const r = rightOf(d);
    const o = this.laneOffset(lane);
    return { x: n.x + DX[d] * s + r.x * o, z: n.z + DZ[d] * s + r.z * o };
  }

  /** Exits from node n for a vehicle arriving in direction d (no U-turns unless it is a dead end). */
  exits(n: Node, d: Dir): Dir[] {
    const out = DIRS.filter((e) => e !== opposite(d) && n.next[e] >= 0);
    if (out.length === 0 && n.next[opposite(d)] >= 0) return [opposite(d)];
    return out;
  }

  /**
   * Waypoints through junction n turning from direction `from` (lane a) to `to` (lane b):
   * a quadratic curve from the stop line to the far side of the box.
   */
  turnPath(n: Node, from: Dir, a: number, to: Dir, b: number): Point[] {
    const p0 = this.lanePoint(n, from, a, -this.stopDistance(from));
    const p2 = this.lanePoint(n, to, b, this.junctionHalf(to) + 2);
    let p1: Point;
    if (from === to) {
      p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    } else if (to === opposite(from)) {
      // U-turn at a dead end: swing wide through the box.
      const c = this.lanePoint(n, from, a, 0);
      p1 = { x: c.x + DX[from] * 6, z: c.z + DZ[from] * 6 };
    } else {
      // Corner: where the incoming and outgoing lane lines cross.
      const inLine = this.lanePoint(n, from, a, 0);
      const outLine = this.lanePoint(n, to, b, 0);
      p1 = axisOf(from) === 'ave' ? { x: inLine.x, z: outLine.z } : { x: outLine.x, z: inLine.z };
    }
    const pts: Point[] = [];
    const steps = from === to ? 2 : 7;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z });
    }
    return pts;
  }

  /** Lane to use after a turn: right turns hug the kerb, left turns take the inner lane. */
  laneAfterTurn(from: Dir, to: Dir, lane: number): number {
    const lanes = this.lanes(to);
    if (to === from) return Math.min(lane, lanes - 1);
    if (to === turnRight(from)) return lanes - 1;
    return 0;
  }

  /** The lane a car should be in before taking this exit. */
  laneBeforeTurn(from: Dir, to: Dir, lane: number): number {
    const lanes = this.lanes(from);
    if (to === turnRight(from)) return lanes - 1;
    if (to === turnLeft(from)) return 0;
    return Math.min(lane, lanes - 1);
  }

  /** Nearest junction to a point. */
  nearestNode(x: number, z: number): Node {
    let best = this.nodes[0];
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /**
   * Where a car at (x, z) heading roughly along `dir` will next reach a junction: the nearest node in
   * front of it on its road (or the nearest node if it isn't on a road along that axis).
   */
  nodeAhead(x: number, z: number, dir: Dir): Node {
    let best: Node | null = null;
    let bestAlong = Infinity;
    for (const n of this.nodes) {
      const along = (n.x - x) * DX[dir] + (n.z - z) * DZ[dir];
      const across = Math.abs((n.x - x) * DZ[dir] - (n.z - z) * DX[dir]);
      if (along < -2 || across > 14) continue;
      if (along < bestAlong) {
        bestAlong = along;
        best = n;
      }
    }
    return best ?? this.nearestNode(x, z);
  }

  /** Shortest junction-to-junction route (A* over road lengths). Returns node ids including both ends. */
  route(from: number, to: number): number[] {
    if (from === to) return [from];
    const goal = this.nodes[to];
    const h = (n: Node): number => Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z);
    const g = new Map<number, number>([[from, 0]]);
    const came = new Map<number, number>();
    const open: Array<{ id: number; f: number }> = [{ id: from, f: h(this.nodes[from]) }];
    const closed = new Set<number>();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { id } = open.splice(bi, 1)[0];
      if (id === to) {
        const path = [to];
        let c = to;
        while (came.has(c)) {
          c = came.get(c)!;
          path.push(c);
        }
        return path.reverse();
      }
      if (closed.has(id)) continue;
      closed.add(id);
      const n = this.nodes[id];
      for (const d of DIRS) {
        const m = n.next[d];
        if (m < 0 || closed.has(m)) continue;
        const nb = this.nodes[m];
        const cost = g.get(id)! + Math.abs(nb.x - n.x) + Math.abs(nb.z - n.z);
        if (cost < (g.get(m) ?? Infinity)) {
          g.set(m, cost);
          came.set(m, id);
          open.push({ id: m, f: cost + h(nb) });
        }
      }
    }
    return [];
  }

  /** Direction from node a to its neighbour b, or -1 if they aren't linked. */
  dirBetween(a: number, b: number): Dir | -1 {
    const n = this.nodes[a];
    for (const d of DIRS) if (n.next[d] === b) return d;
    return -1;
  }

  /**
   * Drivable waypoints along a node route for a car currently heading in `arriveDir` toward route[0].
   * Uses the same lane lines and turn curves as traffic, so it stays on the road surface.
   */
  routeWaypoints(route: number[], arriveDir: Dir, lane: number, straightSpeed: number, turnSpeed: number): Array<Point & { vmax: number }> {
    const out: Array<Point & { vmax: number }> = [];
    let from = arriveDir;
    let curLane = Math.min(lane, this.lanes(from) - 1);
    for (let k = 0; k < route.length; k++) {
      const n = this.nodes[route[k]];
      if (k === route.length - 1) {
        // Final junction: aim through its centre on our lane.
        const p = this.lanePoint(n, from, curLane, 0);
        out.push({ ...p, vmax: straightSpeed });
        break;
      }
      const d = this.dirBetween(route[k], route[k + 1]);
      if (d === -1) break;
      const a = this.laneBeforeTurn(from, d, curLane);
      const b = this.laneAfterTurn(from, d, a);
      const v = d === from ? straightSpeed : d === opposite(from) ? turnSpeed * 0.6 : turnSpeed;
      // Approach point on the incoming road (absent when the route starts where no road comes in).
      if (n.next[opposite(from)] >= 0) out.push({ ...this.lanePoint(n, from, a, -this.stopDistance(from)), vmax: v });
      for (const p of this.turnPath(n, from, a, d, b)) out.push({ ...p, vmax: v });
      from = d;
      curLane = Math.min(lane, this.lanes(d) - 1);
    }
    return out;
  }

  /** All directed lane segments (for spawning): from node a toward a's neighbour in d. */
  segments(): Array<{ from: Node; d: Dir; lane: number; length: number }> {
    const out: Array<{ from: Node; d: Dir; lane: number; length: number }> = [];
    for (const n of this.nodes) {
      for (const d of DIRS) {
        if (n.next[d] < 0) continue;
        const m = this.nodes[n.next[d]];
        const length = Math.abs(m.x - n.x) + Math.abs(m.z - n.z);
        for (let lane = 0; lane < this.lanes(d); lane++) out.push({ from: n, d, lane, length });
      }
    }
    return out;
  }
}
