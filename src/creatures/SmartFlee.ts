import { type ObstacleField, type RayHit } from './WallProbe';

/**
 * SmartFleeBehavior: obstacle-aware fleeing by context steering (engine-free, unit-tested).
 *
 * Instead of running straight away from the threat (and into the nearest wall), a fleeing
 * Streetmon casts `rays` probes all round and scores each direction:
 *
 *   score = away * (how directly it leads away from the threat)
 *         + clearance * (open distance along it, up to lookAheadDistance)
 *         + momentum * (how close it is to the way it's already going)
 *         - blocked penalty (a wall within the body's buffer) - dead-end penalty (a short ray)
 *
 * and runs the best one, blended with its better neighbour for a smooth heading. Directions are
 * re-planned a few times a second (staggered between creatures), not every frame.
 *
 * Cornered (every probe in the forward half hits a wall within `cornerDistance`), it commits for a
 * moment to a slide along the longest open ray, preferring ones that swing wide of the threat, so
 * it skirts round you instead of pressing into the corner.
 */

export interface FleeConfig {
  /** Probe rays all round (8-12). */
  rays: number;
  /** How far the probes look (m). */
  lookAheadDistance: number;
  /** Clearance kept from walls (m from the body's surface): rays closer than this are blocked. */
  wallBufferRadius: number;
  /** Forward and side probes all hitting within this means cornered (m). */
  cornerDistance: number;
  /** Score weights. */
  weights: { away: number; clearance: number; momentum: number; blocked: number; deadEnd: number };
  /** Seconds a corner slide is committed to. */
  cornerCommit: number;
  /** Re-plans per second. */
  replanHz: number;
}

export const SMART_FLEE: FleeConfig = {
  rays: 12,
  lookAheadDistance: 5,
  wallBufferRadius: 0.8,
  cornerDistance: 2,
  weights: { away: 1.0, clearance: 0.9, momentum: 0.35, blocked: 2.5, deadEnd: 0.6 },
  cornerCommit: 0.9,
  replanHz: 8,
};

export interface Probe {
  /** Unit direction. */
  dx: number;
  dz: number;
  /** Open distance (m, from the body's surface; lookAheadDistance if clear). */
  open: number;
  hit: boolean;
  score: number;
}

/** Per-creature flee state (keep it on the creature between frames). */
export interface FleeMemory {
  dirX: number;
  dirZ: number;
  replanIn: number;
  /** Seconds left on a corner slide. */
  cornerFor: number;
  cornered: boolean;
  probes: Probe[];
  /** The direction chosen last plan (for the debug view). */
  chosen: number;
}

export function newFleeMemory(phase = 0): FleeMemory {
  return { dirX: 0, dirZ: 0, replanIn: phase, cornerFor: 0, cornered: false, probes: [], chosen: -1 };
}

export interface FleeAgent {
  x: number;
  z: number;
  /** Current velocity (m/s), for the momentum score. */
  vx: number;
  vz: number;
  /** Body radius (m). */
  radius: number;
}

export interface FleeSteer {
  /** Unit direction to run in. */
  dirX: number;
  dirZ: number;
  cornered: boolean;
  /** Probes from the last plan (for debugging). */
  probes: Probe[];
}

export class SmartFleeBehavior {
  readonly cfg: FleeConfig;

  constructor(cfg: Partial<FleeConfig> = {}) {
    this.cfg = { ...SMART_FLEE, ...cfg, weights: { ...SMART_FLEE.weights, ...(cfg.weights ?? {}) } };
  }

  /**
   * Which way to run from a threat at (tx, tz). Uses and updates `mem`; probes are only re-cast
   * when the plan is due (or `force`).
   */
  steer(agent: FleeAgent, tx: number, tz: number, field: ObstacleField, mem: FleeMemory, dt: number, force = false): FleeSteer {
    mem.replanIn -= dt;
    if (mem.cornerFor > 0) mem.cornerFor -= dt;
    if (!force && mem.replanIn > 0 && (mem.dirX || mem.dirZ)) return { dirX: mem.dirX, dirZ: mem.dirZ, cornered: mem.cornered, probes: mem.probes };
    mem.replanIn = 1 / this.cfg.replanHz;
    const plan = this.plan(agent, tx, tz, field, mem);
    mem.probes = plan.probes;
    mem.cornered = plan.cornered;
    mem.chosen = plan.chosen;
    mem.dirX = plan.dirX;
    mem.dirZ = plan.dirZ;
    return plan;
  }

  /** One planning pass: cast the probes, score them, handle corners. */
  plan(agent: FleeAgent, tx: number, tz: number, field: ObstacleField, mem: FleeMemory): FleeSteer & { chosen: number } {
    const C = this.cfg;
    const W = C.weights;
    const n = Math.max(4, Math.round(C.rays));
    // Away from the threat (if it's right on top of us, keep going the way we were).
    let ax = agent.x - tx;
    let az = agent.z - tz;
    let al = Math.hypot(ax, az);
    if (al < 1e-3) {
      ax = agent.vx || 1;
      az = agent.vz;
      al = Math.hypot(ax, az) || 1;
    }
    ax /= al;
    az /= al;
    const sp = Math.hypot(agent.vx, agent.vz);
    const mx = sp > 0.1 ? agent.vx / sp : mem.dirX;
    const mz = sp > 0.1 ? agent.vz / sp : mem.dirZ;
    const hasMomentum = mx !== 0 || mz !== 0;
    // Rotate the probe fan so one ray points straight away (the most useful direction gets sampled).
    const base = Math.atan2(az, ax);
    const probes: Probe[] = [];
    for (let k = 0; k < n; k++) {
      const a = base + (k / n) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const h: RayHit = field.ray(agent.x, agent.z, dx, dz, agent.radius + C.lookAheadDistance);
      const open = h.hit ? Math.max(0, h.dist - agent.radius) : C.lookAheadDistance;
      const away = (dx * ax + dz * az + 1) / 2;
      const clearance = open / C.lookAheadDistance;
      const momentum = hasMomentum ? (dx * mx + dz * mz + 1) / 2 : 0.5;
      let score = W.away * away + W.clearance * clearance + W.momentum * momentum;
      if (open < C.wallBufferRadius) score -= W.blocked * (1 - open / C.wallBufferRadius);
      else if (h.hit && open < C.cornerDistance) score -= W.deadEnd * (1 - open / C.cornerDistance);
      probes.push({ dx, dz, open, hit: h.hit, score });
    }
    // Cornered: everything in the half facing away from the threat (forward and sides) is shut.
    const forward = probes.filter((p) => p.dx * ax + p.dz * az > -0.05);
    const cornered = forward.length > 0 && forward.every((p) => p.hit && p.open < C.cornerDistance);
    let chosen: number;
    if (cornered || mem.cornerFor > 0) {
      if (cornered && mem.cornerFor <= 0) mem.cornerFor = C.cornerCommit;
      chosen = this.slideChoice(probes, agent, tx, tz, mem);
    } else {
      chosen = 0;
      for (let k = 1; k < n; k++) if (probes[k].score > probes[chosen].score) chosen = k;
    }
    // Smooth: lean toward the better neighbour in proportion to how close its score is.
    const p = probes[chosen];
    const l = probes[(chosen + n - 1) % n];
    const r = probes[(chosen + 1) % n];
    const nb = l.score > r.score ? l : r;
    const gap = p.score - nb.score;
    const lean = cornered || mem.cornerFor > 0 || nb.open < C.wallBufferRadius ? 0 : Math.max(0, 0.5 - gap * 2) * 0.5;
    let dx = p.dx * (1 - lean) + nb.dx * lean;
    let dz = p.dz * (1 - lean) + nb.dz * lean;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    return { dirX: dx, dirZ: dz, cornered: cornered || mem.cornerFor > 0, probes, chosen };
  }

  /**
   * The corner escape: the longest open ray, scored by how wide of the threat its path passes (so
   * in a dead end it runs out past you on the roomier side instead of into the back wall), and
   * keeping to the same side as the last slide.
   */
  private slideChoice(probes: Probe[], agent: FleeAgent, tx: number, tz: number, mem: FleeMemory): number {
    let best = 0;
    let bestS = -Infinity;
    probes.forEach((p, k) => {
      // Closest the path along this ray comes to the threat.
      const qx = tx - agent.x;
      const qz = tz - agent.z;
      const t = Math.max(0, Math.min(p.open, qx * p.dx + qz * p.dz));
      const pass = Math.hypot(qx - p.dx * t, qz - p.dz * t);
      const keepSide = mem.dirX || mem.dirZ ? (p.dx * mem.dirX + p.dz * mem.dirZ + 1) / 2 : 0.5;
      const s = Math.min(p.open, this.cfg.lookAheadDistance) * 0.6 + Math.min(pass, 4) * 1.2 - (pass < 1.2 ? 3 : 0) + keepSide * 0.6;
      if (s > bestS) {
        bestS = s;
        best = k;
      }
    });
    return best;
  }
}

/**
 * Combines a steering direction with the wall push into the velocity to move with: the push is
 * added (scaled by `strength`) and the result keeps the creature's speed.
 */
export function steerWithRepulsion(dirX: number, dirZ: number, speed: number, rx: number, rz: number, strength = 1.2): { vx: number; vz: number } {
  let x = dirX + rx * strength;
  let z = dirZ + rz * strength;
  const l = Math.hypot(x, z);
  if (l < 1e-4) return { vx: rx * speed, vz: rz * speed };
  x /= l;
  z /= l;
  return { vx: x * speed, vz: z * speed };
}
