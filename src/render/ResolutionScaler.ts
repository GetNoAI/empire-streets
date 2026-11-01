import { platform } from '../mobile/Platform';
/**
 * Dynamic quality (engine-free, unit-tested): when frames run long because the GPU can't keep up
 * (high-DPI screens with bloom and shadows are the usual cause), quality steps down; when there's
 * headroom again it steps back up. It only steps down when the GPU is the bottleneck: if the
 * frame's own CPU work takes most of the frame, a lower resolution wouldn't help, so it leaves
 * the picture alone.
 *
 * The steps go cheapest-looking first: the shadow map halves (2048 -> 1024: barely visible) before
 * the resolution drops at all, and the resolution never drops so far it looks pixelated: on an
 * ordinary 1x screen it can only go from 1 to 0.875, on a 2x screen down to 1.25.
 *
 *   scale  = the pixel ratio used;  shadow = the shadow map size.
 */

export const RES = {
  /** Frame interval (s) above which we're dropping frames (under ~52 fps). */
  slow: 1 / 52,
  /** Frame interval below which there's headroom (~58 fps and up). */
  fast: 1 / 58,
  /** Seconds of slow frames before stepping down, of fast ones before stepping up. */
  downAfter: 1.2,
  upAfter: 6,
  /** Pixel-ratio step (fine on 1x screens, coarser on high-DPI ones) and the floor. */
  step: 0.25,
  fineStep: 0.125,
  min: platform.minScale,
  /** The floor is also never below this share of the screen's own ratio. */
  minShare: platform.touch ? 0.4 : 0.62,
  /** Shadow map sizes: full, then the reduced one tried before any resolution step. */
  shadowFull: platform.shadow,
  shadowLow: Math.min(1024, platform.shadow),
  /** After a change, wait this long before judging again (s). */
  settle: 2.5,
  /** Only GPU-bound frames count: the CPU part must be under this share of the interval. */
  cpuShare: 0.7,
};

export interface QualityLevel {
  scale: number;
  shadow: number;
}

/** The ladder of quality levels for a screen whose (capped) pixel ratio is `max`. */
export function qualityLevels(max: number, R: typeof RES = RES): QualityLevel[] {
  const out: QualityLevel[] = [
    { scale: max, shadow: R.shadowFull },
    { scale: max, shadow: R.shadowLow },
  ];
  const floor = Math.min(max, Math.max(R.min, max * R.minShare));
  const step = max <= 1.25 ? R.fineStep : R.step;
  for (let s = max - step; s >= floor - 1e-6; s -= step) out.push({ scale: Math.round(s * 1000) / 1000, shadow: R.shadowLow });
  return out;
}

export class ResolutionScaler {
  readonly levels: QualityLevel[];
  private level = 0;
  private avg: number = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  private settle: number;

  constructor(
    readonly max: number,
    private readonly R: typeof RES = RES,
  ) {
    this.levels = qualityLevels(max, R);
    this.settle = R.settle;
  }

  get scale(): number {
    return this.levels[this.level].scale;
  }

  get shadow(): number {
    return this.levels[this.level].shadow;
  }

  /** The lowest pixel ratio it will ever use. */
  get floor(): number {
    return this.levels[this.levels.length - 1].scale;
  }

  /**
   * One frame: `interval` is the time since the last frame, `cpu` how long our own frame work took.
   * Returns the new level when it changes, else null.
   */
  frame(interval: number, cpu: number): QualityLevel | null {
    const R = this.R;
    if (!(interval > 0) || interval > 0.25) return null; // a stall (tab switch, load), not a trend
    this.avg += (interval - this.avg) * 0.1;
    if (this.settle > 0) {
      this.settle -= interval;
      return null;
    }
    const gpuBound = cpu < interval * R.cpuShare;
    if (this.avg > R.slow && gpuBound) this.slowFor += interval;
    else this.slowFor = Math.max(0, this.slowFor - interval);
    if (this.avg < R.fast) this.fastFor += interval;
    else this.fastFor = 0;
    let next = this.level;
    if (this.slowFor > R.downAfter && this.level < this.levels.length - 1) next = this.level + 1;
    else if (this.fastFor > R.upAfter && this.level > 0) next = this.level - 1;
    if (next === this.level) return null;
    this.level = next;
    this.slowFor = 0;
    this.fastFor = 0;
    this.settle = R.settle;
    return this.levels[next];
  }
}
