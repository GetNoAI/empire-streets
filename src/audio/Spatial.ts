import * as THREE from 'three';
import { audio, type SpatialBackend, type Vec3 } from './Audio';

/**
 * The 3D sound layer: a `THREE.AudioListener` on the camera and pools of `THREE.PositionalAudio`
 * voices, all on the synth's own AudioContext (`THREE.AudioContext.setContext`) and routed through
 * its master bus, so the sound toggle and volume still cover everything.
 *
 *  - One-shots (crashes, explosions, gunfire, horn blasts, capture pods, Streetmon moves and cries,
 *    tuning abilities, props breaking) ask `voice(at)` for a pooled panner at a point; the synth
 *    builds the sound into it. The panner does the panning and the distance falloff (inverse,
 *    with a reference distance an eighth of the sound's range).
 *  - Engines: the nearest moving AI cars (traffic, racers, police) each get a looping engine
 *    voice, a saw and a square through a low-pass, pitched by a simple gearbox model from their
 *    speed, and a tyre-squeal voice (band-passed noise) that opens up with their sideways slip.
 *    Your own car stays in the listener's head (src/audio/Audio.ts `updateCar`).
 *  - Sirens: the nearest police units with lights on each get a wailing siren that pans as they
 *    pass and falls off over a few hundred metres.
 */

interface OneShot {
  pa: THREE.PositionalAudio;
  input: GainNode;
  until: number;
}

/** A car the engine voices can follow (anything with a position and a speed). */
export interface EngineSource {
  key: object;
  position: Vec3;
  /** Signed forward speed (m/s), top speed, gears; throttle 0..1; sideways slip at the rear (m/s). */
  speed: number;
  maxSpeed: number;
  gears: number;
  throttle: number;
  slip: number;
  /** Bigger engines sound lower (1 = a sedan). */
  pitch?: number;
}

export interface SirenSource {
  key: object;
  position: Vec3;
}

interface LoopVoice {
  pa: THREE.PositionalAudio;
  key: object | null;
  fresh: boolean;
}

interface EngineVoice extends LoopVoice {
  a: OscillatorNode;
  b: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  squeal: GainNode;
  squealFilter: BiquadFilterNode;
}

interface SirenVoice extends LoopVoice {
  osc: OscillatorNode;
  harm: OscillatorNode;
  gain: GainNode;
  phase: number;
}

export const SPATIAL = {
  oneShots: 20,
  engines: 5,
  sirens: 3,
  /** Engines further than this are left silent (m). */
  engineRange: 70,
  sirenRange: 340,
};

export class SpatialAudio implements SpatialBackend {
  readonly listener: THREE.AudioListener;
  private readonly ctx: AudioContext;
  private readonly pos = new THREE.Vector3();
  private readonly shots: OneShot[] = [];
  private readonly engines: EngineVoice[] = [];
  private readonly sirens: SirenVoice[] = [];
  private readonly model: PanningModelType;
  private t = 0;

  constructor(
    private readonly camera: THREE.Camera,
    o: { hrtf?: boolean; engines?: number; sirens?: number; oneShots?: number } = {},
  ) {
    const ctx = audio.context;
    const master = audio.output;
    if (!ctx || !master) throw new Error('SpatialAudio needs the audio engine unlocked first');
    this.ctx = ctx;
    this.model = o.hrtf === false ? 'equalpower' : 'HRTF';
    THREE.AudioContext.setContext(ctx);
    this.listener = new THREE.AudioListener();
    // Through the synth's master bus (mute, volume), not straight to the speakers.
    this.listener.gain.disconnect();
    this.listener.gain.connect(master);
    camera.add(this.listener);
    for (let i = 0; i < (o.oneShots ?? SPATIAL.oneShots); i++) {
      const pa = this.panner(1);
      const input = ctx.createGain();
      pa.setNodeSource(input as unknown as AudioBufferSourceNode);
      this.shots.push({ pa, input, until: 0 });
    }
    for (let i = 0; i < (o.engines ?? SPATIAL.engines); i++) this.engines.push(this.engineVoice());
    for (let i = 0; i < (o.sirens ?? SPATIAL.sirens); i++) this.sirens.push(this.sirenVoice(i));
  }

  /** A positional voice; loops use the cheaper equal-power panning (several play at once). */
  private panner(ref: number, loop = false): THREE.PositionalAudio {
    const pa = new THREE.PositionalAudio(this.listener);
    const p = pa.panner;
    p.panningModel = loop ? 'equalpower' : this.model;
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.maxDistance = 10000;
    return pa;
  }

  private place(pa: THREE.PositionalAudio, at: Vec3, jump: boolean): void {
    const p = pa.panner;
    const t = this.ctx.currentTime;
    if (p.positionX) {
      for (const [param, v] of [
        [p.positionX, at.x],
        [p.positionY, at.y],
        [p.positionZ, at.z],
      ] as const) {
        if (jump) {
          param.cancelScheduledValues(t);
          param.setValueAtTime(v, t);
        } else param.setTargetAtTime(v, t, 0.04);
      }
    } else p.setPosition(at.x, at.y, at.z);
  }

  // ------------------------------------------------------------------ SpatialBackend

  /** Where the ears are: the camera. */
  ears(): Vec3 {
    return this.pos;
  }

  voice(at: Vec3, range: number, seconds: number): AudioNode | null {
    const now = this.ctx.currentTime;
    // A free voice, else the one that frees up soonest.
    let best = this.shots[0];
    for (const s of this.shots) {
      if (s.until <= now) {
        best = s;
        break;
      }
      if (s.until < best.until) best = s;
    }
    if (!best) return null;
    best.until = now + seconds;
    best.pa.panner.refDistance = Math.max(1.5, range / 8);
    this.place(best.pa, at, true);
    return best.input;
  }

  // ------------------------------------------------------------------ loops

  private engineVoice(): EngineVoice {
    const ctx = this.ctx;
    const pa = this.panner(7, true);
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    const b = ctx.createOscillator();
    b.type = 'square';
    const mixB = ctx.createGain();
    mixB.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2.5;
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const input = ctx.createGain();
    a.connect(filter);
    b.connect(mixB).connect(filter);
    filter.connect(gain).connect(input);
    const noise = ctx.createBufferSource();
    noise.buffer = audio.noiseBuffer;
    noise.loop = true;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1500;
    squealFilter.Q.value = 6;
    const squeal = ctx.createGain();
    squeal.gain.value = 0;
    noise.connect(squealFilter).connect(squeal).connect(input);
    pa.setNodeSource(input as unknown as AudioBufferSourceNode);
    a.start();
    b.start();
    noise.start(0, Math.random());
    return { pa, key: null, fresh: true, a, b, filter, gain, squeal, squealFilter };
  }

  private sirenVoice(i: number): SirenVoice {
    const ctx = this.ctx;
    const pa = this.panner(20, true);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const harm = ctx.createOscillator();
    harm.type = 'square';
    harm.frequency.value = 1400;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(lp);
    harm.connect(harmGain).connect(lp);
    lp.connect(gain);
    pa.setNodeSource(gain as unknown as AudioBufferSourceNode);
    osc.start();
    harm.start();
    return { pa, key: null, fresh: true, osc, harm, gain, phase: i * 1.7 };
  }

  /**
   * Hands the loop voices to the nearest sources (keeping a voice on the car it already follows,
   * so nothing jumps), fades out the rest.
   */
  private assign<V extends LoopVoice, S extends { key: object; position: Vec3 }>(voices: V[], sources: readonly S[], range: number): Map<V, S> {
    const near = sources
      .map((s) => ({ s, d: Math.hypot(s.position.x - this.pos.x, s.position.y - this.pos.y, s.position.z - this.pos.z) }))
      .filter((x) => x.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, voices.length)
      .map((x) => x.s);
    const out = new Map<V, S>();
    const taken = new Set<object>();
    for (const v of voices) {
      const s = v.key ? near.find((n) => n.key === v.key) : undefined;
      if (s) {
        out.set(v, s);
        taken.add(s.key);
      }
    }
    for (const v of voices) {
      if (out.has(v)) continue;
      const s = near.find((n) => !taken.has(n.key));
      if (s) {
        out.set(v, s);
        taken.add(s.key);
        v.fresh = v.key !== s.key;
        v.key = s.key;
      } else v.key = null;
    }
    return out;
  }

  /** Every frame: the ears follow the camera; engines and sirens follow their cars. */
  update(dt: number, engines: readonly EngineSource[], sirens: readonly SirenSource[]): void {
    this.t += dt;
    this.camera.getWorldPosition(this.pos);
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const em = this.assign(this.engines, engines, SPATIAL.engineRange);
    for (const v of this.engines) {
      const s = em.get(v);
      if (!s) {
        v.gain.gain.setTargetAtTime(0, t, 0.15);
        v.squeal.gain.setTargetAtTime(0, t, 0.1);
        continue;
      }
      this.place(v.pa, s.position, v.fresh);
      if (v.fresh) v.gain.gain.setValueAtTime(0, t);
      v.fresh = false;
      // Gearbox: rpm climbs through each gear and drops on the upshift.
      const speed = Math.abs(s.speed);
      const gears = Math.max(1, s.gears);
      const per = Math.max(1, s.maxSpeed) / gears;
      const gear = Math.min(gears, Math.floor(speed / per) + 1);
      const lo = (gear - 1) * per * 0.55;
      const rpm01 = Math.min(1, Math.max(0, (speed - lo) / Math.max(1, gear * per - lo)));
      const rpm = (800 + rpm01 * 4600 + s.throttle * 300) * (s.pitch ?? 1);
      v.a.frequency.setTargetAtTime(rpm / 60, t, 0.05);
      v.b.frequency.setTargetAtTime(rpm / 120, t, 0.05);
      v.filter.frequency.setTargetAtTime(280 + rpm01 * 1500 + s.throttle * 500, t, 0.08);
      const idle = speed < 0.3 && s.throttle < 0.05;
      v.gain.gain.setTargetAtTime(idle ? 0.025 : 0.05 + s.throttle * 0.05 + rpm01 * 0.02, t, 0.1);
      const sq = Math.min(1, Math.max(0, (Math.abs(s.slip) - 3) / 6));
      v.squeal.gain.setTargetAtTime(sq * 0.14, t, 0.05);
      v.squealFilter.frequency.setTargetAtTime(1300 + sq * 500, t, 0.1);
    }
    const sm = this.assign(this.sirens, sirens, SPATIAL.sirenRange);
    for (const v of this.sirens) {
      const s = sm.get(v);
      if (!s) {
        v.gain.gain.setTargetAtTime(0, t, 0.2);
        continue;
      }
      this.place(v.pa, s.position, v.fresh);
      if (v.fresh) v.gain.gain.setValueAtTime(0, t);
      v.fresh = false;
      // Wail: a slow sweep 650..1100 Hz, each unit a little out of step with the others.
      const f = 650 + 450 * (0.5 + 0.5 * Math.sin((this.t + v.phase) * 2.4));
      v.osc.frequency.setTargetAtTime(f, t, 0.02);
      v.harm.frequency.setTargetAtTime(f * 2, t, 0.02);
      v.gain.gain.setTargetAtTime(0.09, t, 0.15);
    }
  }

  /** Mutes every loop (pause, a cutscene, a battle). */
  hush(): void {
    const t = this.ctx.currentTime;
    for (const v of this.engines) {
      v.gain.gain.setTargetAtTime(0, t, 0.05);
      v.squeal.gain.setTargetAtTime(0, t, 0.05);
      v.key = null;
    }
    for (const v of this.sirens) {
      v.gain.gain.setTargetAtTime(0, t, 0.05);
      v.key = null;
    }
  }
}
