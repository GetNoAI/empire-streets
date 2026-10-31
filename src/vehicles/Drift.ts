/**
 * Drift model (engine-free, unit-tested). The ray-cast vehicle controller keeps doing suspension and
 * tyre forces; this decides how much grip the rear tyres get each step from the slip angle, when a
 * drift starts and ends, and how much counter-steer to add so a keyboard can hold a slide.
 *
 * Slip angle β = signed angle from the car's nose to its direction of travel (positive = sliding
 * towards the car's left, i.e. the nose points right of where the car is going).
 */

export const DRIFT = {
  /** Handbrake taps start a drift above this speed (m/s, 35 km/h). */
  entrySpeed: 9.7,
  /** Power oversteer (RWD) starts a drift past this slip angle (degrees). */
  entryAngle: 12,
  /** The drift ends when |β| stays under this (degrees) ... */
  exitAngle: 5,
  /** ... for this long (s). */
  exitHold: 0.25,
  /** A new drift can't end for this long (s), so the slide has time to build after a tap. */
  entryGrace: 0.6,
  /** Below this the car isn't sliding enough to drift (m/s). */
  minSpeed: 5,
  /** Rear grip is full below this slip angle (degrees) ... */
  gripFullAngle: 6,
  /** ... and reaches the drift plateau here. */
  gripPlateauAngle: 18,
  /** Default drift grip as a share of normal grip when a spec doesn't set one. */
  driftGripShare: 0.62,
  /** Default counter-steer assist for the player (0 none, 1 the car steers into the slide itself). */
  counterSteerAssist: 0.55,
  /** Share of full steering lock always available in a drift, whatever the speed. */
  driftSteerFloor: 0.35,
  /** Yaw damping burst after a drift ends (s) and its strength (per s, times mass·r²). */
  exitDampTime: 0.4,
  yawDamping: 2.4,
  /** Slide angle held with full steering lock (degrees), plus this much more at full throttle. */
  targetAngle: 26,
  throttleAngle: 12,
  /** Past this the assist pushes hard against a spin (degrees). */
  maxAngle: 55,
  /** PD gains of the slide-angle assist (angular acceleration per rad of error, per rad/s of change). */
  angleGain: 7,
  angleDamping: 3.2,
  /** Extra gain beyond maxAngle. */
  spinGain: 22,
  /** Forward push along the car's nose while drifting on throttle (m/s² at full throttle and 30°+ of slide), so a drift keeps its speed. */
  boost: 7,
  /** AWD cars send this share of drive to the rear wheels while drifting. */
  awdRearBias: 0.75,
} as const;

const DEG = Math.PI / 180;

export interface DriftSpec {
  grip: number;
  handbrakeGrip: number;
  /** Rear grip on the plateau of a drift (defaults to grip × driftGripShare). */
  driftGrip?: number;
  counterSteerAssist?: number;
  yawDamping?: number;
  drive: 'rwd' | 'fwd' | 'awd';
}

/** Signed slip angle (radians) from the forward and velocity directions on the ground plane. */
export function slipAngle(fx: number, fz: number, vx: number, vz: number): number {
  const sp = Math.hypot(vx, vz);
  if (sp < 0.5) return 0;
  // Heading convention: angle about +Y, forward (cos h, -sin h). β = heading(v) - heading(f).
  let b = Math.atan2(-vz, vx) - Math.atan2(-fz, fx);
  while (b > Math.PI) b -= Math.PI * 2;
  while (b < -Math.PI) b += Math.PI * 2;
  return b;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Rear tyre grip for this step. */
export function rearGrip(spec: DriftSpec, betaRad: number, drifting: boolean, handbrake: boolean): number {
  if (handbrake) return spec.handbrakeGrip;
  if (!drifting) return spec.grip;
  const plateau = spec.driftGrip ?? spec.grip * DRIFT.driftGripShare;
  const k = smooth(DRIFT.gripFullAngle, DRIFT.gripPlateauAngle, Math.abs(betaRad) / DEG);
  return spec.grip + (plateau - spec.grip) * k;
}

/**
 * Extra front-wheel angle (radians, + = left) that points the wheels down the slide.
 * Full counter-steer is β itself, limited to the lock; the assist takes a share of it.
 */
export function counterSteer(betaRad: number, assist: number, maxLock: number): number {
  return Math.max(-maxLock, Math.min(maxLock, betaRad)) * assist;
}

export interface DriftInput {
  dt: number;
  /** Forward speed, m/s (negative = reversing). */
  speed: number;
  beta: number;
  handbrake: boolean;
  throttle: number;
  drive: 'rwd' | 'fwd' | 'awd';
}

/** Drift on/off with entry and exit rules; `justEnded` is true for the step a drift finishes. */
export class DriftState {
  drifting = false;
  /** Seconds left of the exit yaw damping burst. */
  exitDamp = 0;
  /** Seconds the current drift has lasted. */
  time = 0;
  private calm = 0;
  private prevHandbrake = false;

  update(i: DriftInput): { started: boolean; justEnded: boolean } {
    const absB = Math.abs(i.beta) / DEG;
    let started = false;
    let justEnded = false;
    this.exitDamp = Math.max(0, this.exitDamp - i.dt);
    if (!this.drifting) {
      const tap = i.handbrake && !this.prevHandbrake;
      const fast = i.speed > DRIFT.entrySpeed;
      const powerOversteer = i.drive !== 'fwd' && i.throttle > 0.5 && absB > DRIFT.entryAngle && i.speed > DRIFT.minSpeed;
      if ((tap && fast) || powerOversteer) {
        this.drifting = true;
        this.time = 0;
        this.calm = 0;
        started = true;
      }
    } else {
      this.time += i.dt;
      // The slide builds while the handbrake is held and just after a tap: don't count that as calm.
      const settling = i.handbrake || this.time < DRIFT.entryGrace;
      this.calm = absB < DRIFT.exitAngle && !settling ? this.calm + i.dt : 0;
      if (this.calm >= DRIFT.exitHold || i.speed < DRIFT.minSpeed) {
        this.drifting = false;
        this.exitDamp = DRIFT.exitDampTime;
        justEnded = true;
      }
    }
    this.prevHandbrake = i.handbrake;
    return { started, justEnded };
  }

  reset(): void {
    this.drifting = false;
    this.exitDamp = 0;
    this.time = 0;
    this.calm = 0;
    this.prevHandbrake = false;
  }
}

/**
 * Yaw assist while drifting: angular acceleration about +Y (rad/s², + = nose turns left) that pulls the
 * slide angle towards the one the player is asking for. Steering into the turn holds about 26°
 * (wider with throttle); letting go of the steering straightens the car out; past 55° it fights a spin.
 * `steer`: -1 full left .. 1 full right (as CarInput). `dBeta`: rate of change of β (rad/s).
 */
export function yawAssist(beta: number, dBeta: number, steer: number, throttle: number): number {
  // Turning left (steer < 0) means the nose points left of travel: β < 0.
  const target = steer * (DRIFT.targetAngle + DRIFT.throttleAngle * Math.max(0, throttle)) * DEG;
  let acc = DRIFT.angleGain * (beta - target) + DRIFT.angleDamping * dBeta;
  const over = Math.abs(beta) - DRIFT.maxAngle * DEG;
  if (over > 0) acc += Math.sign(beta) * DRIFT.spinGain * over;
  return acc;
}

/** Acceleration (m/s²) pushed along the direction of travel during a drift, offsetting the speed lost to the slide. */
export function driftBoost(beta: number, throttle: number): number {
  return DRIFT.boost * Math.max(0, throttle) * Math.min(1, Math.abs(beta) / (30 * DEG));
}
