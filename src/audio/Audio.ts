/**
 * Synthesised audio (no sound files): engine with simulated gear changes, tyre squeal, wind,
 * crashes, horn, doors, footsteps, explosions and a low city ambience bed.
 */

import type { CryParams } from './Cries';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a sound comes from: a world position (played through a 3D voice, src/audio/Spatial.ts,
 * so it pans and falls off with distance from the camera), or a plain distance in metres (the
 * old flat fade, still used for sounds that are "on you": your own gun, the race beeps).
 */
export type Where = number | Vec3;

/** What the 3D layer gives the synth: the listener's position, and a voice (an input node on a panner) at a point. */
export interface SpatialBackend {
  ears(): Vec3;
  voice(at: Vec3, range: number, seconds: number): AudioNode | null;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** The 3D voice the sound being built goes to (null: straight to the master bus). */
  private spot: AudioNode | null = null;
  private spatial: SpatialBackend | null = null;
  private enabled = true;
  private volume = 0.6;
  private readonly baseVolume = 0.6;
  private loops: {
    engA: OscillatorNode;
    engB: OscillatorNode;
    engFilter: BiquadFilterNode;
    engGain: GainNode;
    squealGain: GainNode;
    squealFilter: BiquadFilterNode;
    windGain: GainNode;
    windFilter: BiquadFilterNode;
    ambGain: GainNode;
    horn: GainNode;
    siren: OscillatorNode;
    sirenGain: GainNode;
  } | null = null;
  private gear = 1;
  private lastStep = 0;
  private sirenT = 0;

  /** Must run inside a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.buildLoops();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get on(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  /** Effects volume from the options (0..1 of the default level). */
  setVolume(v: number): void {
    this.volume = this.baseVolume * Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  /** The context and master bus, for the 3D layer (null until the first user gesture). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): GainNode | null {
    return this.master;
  }

  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  setSpatial(b: SpatialBackend | null): void {
    this.spatial = b;
  }

  private ready(): boolean {
    this.spot = null;
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Loudness for a sound heard out to `range` metres. A world position gets a 3D voice (the
   * panner does the falloff, so this returns 1, or 0 past the range); a distance gets the flat
   * linear fade.
   */
  private att(where: Where, range: number, seconds = 1.5): number {
    if (typeof where === 'number') return Number.isFinite(where) ? Math.max(0, 1 - Math.max(0, where) / range) : 0;
    if (!where || !Number.isFinite(where.x) || !Number.isFinite(where.z)) return 0;
    if (!this.spatial) return 1;
    const l = this.spatial.ears();
    const d = Math.hypot(where.x - l.x, (where.y ?? l.y) - l.y, where.z - l.z);
    if (d > range) return 0;
    this.spot = this.spatial.voice(where, range, seconds);
    return this.spot ? 1 : Math.max(0, 1 - d / range);
  }

  private dest(): AudioNode {
    return this.spot ?? this.master!;
  }

  /** Metres from the listener (0 without the 3D layer or for a distance given as a number's own value). */
  distanceTo(where: Where): number {
    if (typeof where === 'number') return where;
    if (!this.spatial) return 0;
    const l = this.spatial.ears();
    return Math.hypot(where.x - l.x, where.y - l.y, where.z - l.z);
  }

  private noiseSource(loop: boolean): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  private buildLoops(): void {
    const ctx = this.ctx!;
    const out = this.master!;
    const engA = ctx.createOscillator();
    engA.type = 'sawtooth';
    const engB = ctx.createOscillator();
    engB.type = 'square';
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.Q.value = 3;
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    const engMixB = ctx.createGain();
    engMixB.gain.value = 0.5;
    engA.connect(engFilter);
    engB.connect(engMixB).connect(engFilter);
    engFilter.connect(engGain).connect(out);
    engA.start();
    engB.start();

    const sq = this.noiseSource(true);
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1500;
    squealFilter.Q.value = 6;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    sq.connect(squealFilter).connect(squealGain).connect(out);
    sq.start();

    const wind = this.noiseSource(true);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(out);
    wind.start();

    const amb = this.noiseSource(true);
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 260;
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.05;
    amb.connect(ambFilter).connect(ambGain).connect(out);
    amb.start();

    // Horn: two detuned squares (a classic dual-tone car horn).
    const horn = ctx.createGain();
    horn.gain.value = 0;
    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.value = 2200;
    for (const f of [415, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(hornFilter);
      o.start();
    }
    hornFilter.connect(horn).connect(out);

    const siren = ctx.createOscillator();
    siren.type = 'triangle';
    siren.frequency.value = 700;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    siren.connect(sirenGain).connect(out);
    siren.start();

    this.loops = { engA, engB, engFilter, engGain, squealGain, squealFilter, windGain, windFilter, ambGain, horn, siren, sirenGain };
  }

  /**
   * Engine note from road speed via a simple gearbox model: RPM climbs through each gear, drops on upshift.
   */
  updateCar(active: boolean, speed: number, maxSpeed: number, throttle: number, gears: number, slip: number, dt: number): void {
    if (!this.ready() || !this.loops) return;
    const L = this.loops;
    const t = this.ctx!.currentTime;
    const v = Math.abs(speed);
    const gearTop = (g: number): number => (maxSpeed * g) / gears;
    while (this.gear < gears && v > gearTop(this.gear) * 0.95) this.gear++;
    while (this.gear > 1 && v < gearTop(this.gear - 1) * 0.7) this.gear--;
    const lo = this.gear === 1 ? 0 : gearTop(this.gear - 1) * 0.55;
    const rpm01 = Math.min(1, Math.max(0, (v - lo) / Math.max(1, gearTop(this.gear) - lo)));
    const rpm = 800 + rpm01 * 5200 + throttle * 300;
    const f = rpm / 60; // firing fundamental-ish
    L.engA.frequency.setTargetAtTime(f, t, 0.04);
    L.engB.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    L.engFilter.frequency.setTargetAtTime(300 + rpm01 * 1800 + throttle * 600, t, 0.06);
    L.engGain.gain.setTargetAtTime(active ? 0.07 + throttle * 0.06 : 0, t, 0.08);
    const sq = active ? Math.min(1, Math.max(0, (Math.abs(slip) - 3) / 6)) : 0;
    L.squealGain.gain.setTargetAtTime(sq * 0.16, t, 0.05);
    L.squealFilter.frequency.setTargetAtTime(1300 + sq * 500, t, 0.1);
    const w = Math.min(1, v / 50);
    L.windGain.gain.setTargetAtTime(active ? w * w * 0.12 : 0, t, 0.2);
    L.windFilter.frequency.setTargetAtTime(300 + w * 1200, t, 0.2);
    void dt;
  }

  get currentGear(): number {
    return this.gear;
  }

  setHorn(on: boolean): void {
    if (!this.ready() || !this.loops) return;
    this.loops.horn.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx!.currentTime, 0.015);
  }

  /** A short horn blast from another car, attenuated by distance in metres. */
  honk(where: Where): void {
    if (!this.ready()) return;
    const k = this.att(where, 90, 0.8);
    if (k < 0.03) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    const len = 0.25 + Math.random() * 0.35;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * k, t + 0.02);
    g.gain.setValueAtTime(0.05 * k, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
    const pitch = 0.85 + Math.random() * 0.3;
    for (const f of [400 * pitch, 500 * pitch]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.1);
    }
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1800;
    g.connect(flt).connect(this.dest());
  }

  /** Wail siren for nearby police; distance 0..1 (1 = far). */
  updateSiren(on: boolean, dt: number, distance01: number): void {
    if (!this.ready() || !this.loops) return;
    this.sirenT += dt;
    const t = this.ctx!.currentTime;
    const f = 650 + 450 * (0.5 + 0.5 * Math.sin(this.sirenT * 2.4));
    this.loops.siren.frequency.setTargetAtTime(f, t, 0.02);
    this.loops.sirenGain.gain.setTargetAtTime(on ? 0.05 * (1 - distance01) : 0, t, 0.1);
  }

  silenceCar(): void {
    if (!this.ready() || !this.loops) return;
    const t = this.ctx!.currentTime;
    for (const g of [this.loops.engGain, this.loops.squealGain, this.loops.windGain, this.loops.horn]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  private burst(type: BiquadFilterType, f0: number, f1: number, gain: number, dur: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const s = this.noiseSource(true);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt).connect(g).connect(this.dest());
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, gain: number, dur: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.dest());
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** intensity 0..1, distance in metres from the listener. */
  crash(intensity: number, where: Where = 0): void {
    if (!this.ready()) return;
    const k = Math.min(1, intensity) * this.att(where, 120, 0.8);
    if (k < 0.02) return;
    this.burst('lowpass', 2500, 120, 0.9 * k, 0.35 + 0.3 * k);
    this.tone('sine', 90, 35, 0.6 * k, 0.3);
    if (k > 0.4) this.burst('highpass', 3500, 2000, 0.35 * k, 0.5, 0.04); // glass/metal
  }

  /** Tuning ability sounds by id (from vehicle_streetmon_tuning.json), attenuated with distance. */
  sfx(id: string, where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 300, 1.6);
    if (k < 0.02) return;
    switch (id) {
      case 'sfx_nitrous_hiss':
        this.burst('highpass', 1200, 4200, 0.55 * k, 0.9);
        this.tone('sawtooth', 70, 140, 0.25 * k, 0.8);
        break;
      case 'sfx_backfire_bang':
        this.burst('lowpass', 2200, 150, 1.0 * k, 0.4);
        this.tone('square', 80, 35, 0.5 * k, 0.25);
        this.burst('lowpass', 1800, 120, 0.7 * k, 0.3, 0.12);
        break;
      case 'sfx_bass_drop':
        this.tone('sine', 120, 28, 1.1 * k, 1.2);
        this.tone('square', 55, 30, 0.35 * k, 0.7);
        this.burst('lowpass', 400, 60, 0.8 * k, 0.9);
        break;
      case 'sfx_spikes_drop':
        this.burst('highpass', 3000, 1500, 0.4 * k, 0.25);
        this.burst('bandpass', 1800, 900, 0.3 * k, 0.2, 0.08);
        break;
      case 'sfx_tyre_pop':
        this.burst('bandpass', 1400, 400, 0.8 * k, 0.18);
        this.burst('highpass', 2500, 1200, 0.3 * k, 0.6, 0.05);
        break;
      case 'sfx_jam':
        this.tone('sawtooth', 1800, 200, 0.12 * k, 0.35);
        this.burst('bandpass', 2400, 2400, 0.25 * k, 0.4);
        break;
      case 'sfx_glass':
        this.burst('highpass', 4000, 2500, 0.7 * k, 0.35);
        this.tone('triangle', 2600, 1800, 0.15 * k, 0.25, 0.03);
        break;
      case 'sfx_vault_open':
        this.tone('sine', 70, 45, 0.6 * k, 1.4);
        this.burst('lowpass', 600, 120, 0.4 * k, 1.2);
        break;
      case 'sfx_bag':
        this.burst('lowpass', 900, 300, 0.35 * k, 0.18);
        break;
      case 'sfx_drill':
        this.tone('square', 220, 260, 0.08 * k, 0.15);
        this.burst('bandpass', 3000, 2800, 0.12 * k, 0.15);
        break;
      case 'sfx_alarm_bell':
        this.tone('square', 980, 980, 0.13 * k, 0.28);
        this.tone('square', 760, 760, 0.13 * k, 0.28, 0.3);
        break;
      case 'sfx_race_beep':
        this.tone('square', 660, 660, 0.22 * k, 0.22);
        break;
      case 'sfx_race_go':
        this.tone('square', 1320, 1320, 0.26 * k, 0.55);
        this.tone('sine', 660, 660, 0.18 * k, 0.55);
        break;
      case 'sfx_checkpoint':
        this.tone('sine', 880, 1320, 0.22 * k, 0.16);
        this.tone('sine', 1320, 1760, 0.16 * k, 0.16, 0.08);
        break;
      // Destructible props breaking: a heavy clang for steel, a clatter for sheet metal, a crack
      // and splinter for wood, a hollow pop for plastic; and a broken hydrant's hiss.
      case 'sfx_break_metal':
        this.burst('lowpass', 1800, 160, 0.8 * k, 0.45);
        this.tone('triangle', 420, 380, 0.22 * k, 1.1, 0.02);
        this.tone('triangle', 1130, 1060, 0.1 * k, 0.9, 0.02);
        this.burst('bandpass', 2600, 1800, 0.25 * k, 0.6, 0.18);
        break;
      case 'sfx_break_lightMetal':
        this.burst('bandpass', 1600, 700, 0.6 * k, 0.3);
        this.tone('square', 640, 300, 0.12 * k, 0.25);
        this.burst('highpass', 2800, 2000, 0.3 * k, 0.35, 0.12);
        this.burst('bandpass', 1200, 900, 0.25 * k, 0.2, 0.28);
        break;
      case 'sfx_break_wood':
        this.burst('bandpass', 900, 300, 0.85 * k, 0.12);
        this.burst('highpass', 1600, 900, 0.4 * k, 0.5, 0.05);
        this.tone('sine', 110, 50, 0.35 * k, 0.4);
        this.burst('lowpass', 700, 150, 0.4 * k, 0.6, 0.35);
        break;
      case 'sfx_break_plastic':
        this.burst('bandpass', 1100, 500, 0.6 * k, 0.12);
        this.tone('sine', 320, 140, 0.2 * k, 0.15);
        this.burst('highpass', 2200, 1600, 0.25 * k, 0.4, 0.08);
        break;
      // The pond: a splash (something going in), a big one (a car, a dive), swim strokes, wading, climbing out.
      case 'sfx_splash':
        this.burst('lowpass', 2400, 400, 0.45 * k, 0.45);
        this.burst('highpass', 1800, 3200, 0.2 * k, 0.6, 0.05);
        this.tone('sine', 380, 150, 0.08 * k, 0.12);
        break;
      case 'sfx_splash_big':
        this.burst('lowpass', 1800, 120, 0.9 * k, 1.1);
        this.burst('highpass', 1500, 3500, 0.35 * k, 1.3, 0.08);
        this.tone('sine', 120, 45, 0.45 * k, 0.5);
        for (let i = 0; i < 4; i++) this.burst('bandpass', 1200 + i * 300, 600, 0.12 * k, 0.25, 0.45 + i * 0.18);
        break;
      case 'sfx_swim':
        this.burst('bandpass', 900, 1600, 0.12 * k, 0.28);
        this.burst('highpass', 2200, 3000, 0.06 * k, 0.25, 0.12);
        break;
      case 'sfx_roll':
        // Cloth and a shoulder on the pavement.
        this.burst('bandpass', 700, 300, 0.22 * k, 0.32);
        this.tone('sine', 110, 55, 0.12 * k, 0.12, 0.18);
        break;
      case 'sfx_dive':
        this.burst('highpass', 1800, 900, 0.18 * k, 0.35);
        this.burst('lowpass', 600, 180, 0.3 * k, 0.3, 0.55);
        this.tone('sine', 95, 45, 0.18 * k, 0.15, 0.6);
        break;
      case 'sfx_wade':
        this.burst('lowpass', 900, 300, 0.1 * k, 0.3);
        break;
      case 'sfx_climb':
        this.burst('lowpass', 1400, 300, 0.25 * k, 0.4);
        this.tone('sine', 140, 60, 0.15 * k, 0.15, 0.1);
        break;
      case 'sfx_geyser':
        this.burst('highpass', 900, 1400, 0.22 * k, 1.3);
        this.burst('bandpass', 500, 700, 0.15 * k, 1.2);
        break;
      default:
        this.burst('lowpass', 1500, 200, 0.5 * k, 0.3);
    }
  }

  /**
   * Streetmon move sounds (ids from move_fx.json / moveFxPlan.js), synthesised like everything
   * else: gunfire variants, whooshes and slams, crumbling rubble, electric zaps and beams, bass
   * thumps and drops, hissing smoke, wet splashes, chimes for buffs and heals, glass, impacts
   * (heavier for critical and super-effective hits, duller when resisted), and the legendary
   * roars, stomps and quakes. `size` scales loudness and pitch a little (1 = normal).
   */
  moveSfx(id: string, where: Where = 0, size = 1): void {
    if (!this.ready()) return;
    const distance = where;
    const k = this.att(where, 220, 2.6) * Math.min(1.4, 0.75 + size * 0.25);
    if (k < 0.02) return;
    const lo = 1 / Math.max(0.6, Math.min(1.8, size)); // bigger moves sound lower
    switch (id) {
      case 'gun_pistol':
        this.gunshot('pistol', distance);
        break;
      case 'gun_shotgun':
        this.gunshot('shotgun', distance);
        break;
      case 'gun_sniper':
        this.gunshot('sniper', distance);
        break;
      case 'gun_burst':
        for (let i = 0; i < 4; i++) {
          this.burst('bandpass', 3000, 1300, 0.34 * k, 0.07, i * 0.075);
          this.tone('square', 250, 110, 0.08 * k, 0.04, i * 0.075);
        }
        break;
      case 'dart':
        this.burst('highpass', 2600, 4200, 0.18 * k, 0.12);
        this.tone('sine', 1800, 900, 0.05 * k, 0.1);
        break;
      case 'thump_shot':
        this.burst('lowpass', 1200, 200, 0.5 * k, 0.16);
        this.tone('sine', 140, 60, 0.3 * k, 0.12);
        break;
      case 'whoosh':
        this.burst('bandpass', 500 * lo, 2400, 0.22 * k, 0.22);
        break;
      case 'slam':
        this.tone('sine', 150 * lo, 45, 0.6 * k, 0.22);
        this.burst('lowpass', 1200, 150, 0.5 * k, 0.2);
        break;
      case 'slam_heavy':
        this.tone('sine', 110 * lo, 28, 0.95 * k, 0.45);
        this.burst('lowpass', 1600, 80, 0.8 * k, 0.5);
        this.burst('bandpass', 700, 250, 0.35 * k, 0.6, 0.06); // rubble settling
        break;
      case 'crunch':
        this.burst('bandpass', 1800, 500, 0.45 * k, 0.14);
        this.tone('square', 180, 70, 0.15 * k, 0.1);
        break;
      case 'rubble':
        for (let i = 0; i < 5; i++) this.burst('bandpass', 900 + Math.random() * 900, 200, 0.28 * k, 0.18, i * 0.07 + Math.random() * 0.03);
        this.tone('sine', 70, 35, 0.4 * k, 0.6);
        break;
      case 'coin':
        this.tone('triangle', 2100, 2100, 0.1 * k, 0.12);
        this.tone('triangle', 3150, 3150, 0.07 * k, 0.2, 0.06);
        break;
      case 'zap':
        this.tone('sawtooth', 1600, 220, 0.12 * k, 0.16);
        this.burst('highpass', 3200, 5200, 0.22 * k, 0.12);
        break;
      case 'zap_big':
        this.tone('sawtooth', 900 * lo, 80, 0.22 * k, 0.45);
        this.burst('highpass', 2500, 6000, 0.4 * k, 0.35);
        this.burst('lowpass', 900, 100, 0.4 * k, 0.3, 0.05);
        break;
      case 'beam': {
        // A rising hum that holds, then cuts.
        this.tone('sawtooth', 180 * lo, 520 * lo, 0.12 * k, 0.5);
        this.tone('sine', 360 * lo, 1040 * lo, 0.1 * k, 0.5);
        this.burst('bandpass', 2000, 3500, 0.12 * k, 0.5);
        break;
      }
      case 'bass':
        this.tone('sine', 95 * lo, 40, 0.75 * k, 0.35);
        this.burst('lowpass', 300, 60, 0.4 * k, 0.3);
        break;
      case 'bass_big':
        this.tone('sine', 80 * lo, 30, 1.0 * k, 0.6);
        this.tone('square', 40 * lo, 28, 0.25 * k, 0.5);
        break;
      case 'bass_drop':
        this.sfx('sfx_bass_drop', distance);
        break;
      case 'screech':
        this.tone('sawtooth', 2400, 3400, 0.08 * k, 0.3);
        this.tone('square', 2450, 3300, 0.05 * k, 0.3);
        break;
      case 'hiss':
        this.burst('highpass', 2500, 1500, 0.3 * k, 0.6);
        break;
      case 'puff':
        this.burst('lowpass', 700, 200, 0.4 * k, 0.3);
        break;
      case 'boom':
        this.burst('lowpass', 1800, 70, 1.0 * k, 0.9);
        this.tone('sine', 75 * lo, 25, 0.8 * k, 0.6);
        break;
      case 'splash':
        this.burst('bandpass', 1400, 400, 0.4 * k, 0.25);
        this.burst('highpass', 2500, 1400, 0.15 * k, 0.3, 0.05);
        break;
      case 'squelch':
        this.tone('sine', 300, 120, 0.25 * k, 0.15);
        this.burst('bandpass', 900, 350, 0.3 * k, 0.18);
        break;
      case 'gurgle':
        for (let i = 0; i < 4; i++) this.tone('sine', 220 + Math.random() * 180, 90, 0.2 * k, 0.12, i * 0.09);
        this.burst('lowpass', 600, 120, 0.4 * k, 0.6);
        break;
      case 'chime_up':
        [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.07 * k, 0.16, i * 0.07));
        break;
      case 'chime_down':
        [880, 660, 440].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.07 * k, 0.16, i * 0.07));
        break;
      case 'heal':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone('sine', f, f, 0.06 * k, 0.25, i * 0.06));
        break;
      case 'glass':
        this.sfx('sfx_glass', distance);
        break;
      case 'reload':
        this.reload();
        break;
      case 'impact':
        this.tone('sine', 160, 60, 0.35 * k, 0.12);
        this.burst('lowpass', 1400, 300, 0.3 * k, 0.1);
        break;
      case 'impact_heavy':
        this.tone('sine', 120, 40, 0.6 * k, 0.25);
        this.burst('lowpass', 1600, 150, 0.55 * k, 0.25);
        break;
      case 'crit':
        this.tone('sine', 130, 40, 0.65 * k, 0.28);
        this.burst('lowpass', 2000, 150, 0.6 * k, 0.25);
        this.tone('triangle', 1760, 1760, 0.06 * k, 0.12, 0.02);
        break;
      case 'super':
        this.tone('sine', 140, 45, 0.6 * k, 0.25);
        this.burst('lowpass', 1800, 160, 0.5 * k, 0.22);
        this.tone('square', 990, 1320, 0.05 * k, 0.12, 0.03);
        break;
      case 'resist':
        this.burst('lowpass', 600, 200, 0.25 * k, 0.12);
        break;
      case 'faint':
        this.tone('triangle', 520, 130, 0.12 * k, 0.6);
        this.tone('sine', 120, 45, 0.4 * k, 0.3, 0.35);
        break;
      case 'flash':
        this.burst('highpass', 4000, 6000, 0.25 * k, 0.18);
        this.tone('sine', 2600, 1200, 0.06 * k, 0.25);
        break;
      case 'roar': {
        // A legendary's roar: a growl of detuned saws through a sweeping filter, with sub rumble.
        const ctx = this.ctx!;
        const t = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32 * k, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(300, t);
        flt.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
        flt.frequency.exponentialRampToValueAtTime(250, t + 1.8);
        for (const f of [62, 64.5, 93]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f * lo, t);
          o.frequency.linearRampToValueAtTime(f * lo * 0.8, t + 1.8);
          o.connect(flt);
          o.start(t);
          o.stop(t + 1.9);
        }
        flt.connect(g).connect(this.dest());
        this.burst('bandpass', 700, 300, 0.3 * k, 1.4);
        this.tone('sine', 45, 28, 0.7 * k, 1.6);
        break;
      }
      case 'stomp':
        this.tone('sine', 60, 22, 1.0 * k, 0.7);
        this.burst('lowpass', 900, 50, 0.8 * k, 0.7);
        break;
      case 'quake':
        this.tone('sine', 38, 24, 0.9 * k, 2.2);
        for (let i = 0; i < 6; i++) this.burst('lowpass', 500, 60, 0.35 * k, 0.4, i * 0.3);
        break;
      default:
        this.burst('lowpass', 1200, 200, 0.3 * k, 0.2);
    }
  }

  explosion(where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 400, 2.4);
    if (k < 0.02) return;
    this.burst('lowpass', 1600, 60, 1.2 * k, 2.2);
    this.tone('sine', 65, 20, 1.0 * k, 1.4);
  }

  /** Gunshot by weapon id, attenuated with distance (metres). */
  gunshot(id: string, where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 260, 1);
    if (k < 0.02) return;
    switch (id) {
      case 'pistol':
        this.burst('bandpass', 2600, 700, 0.55 * k, 0.14);
        this.tone('square', 220, 60, 0.18 * k, 0.08);
        break;
      case 'revolver':
        this.burst('lowpass', 3000, 300, 0.9 * k, 0.32);
        this.tone('sine', 120, 40, 0.5 * k, 0.22);
        break;
      case 'shotgun':
        this.burst('lowpass', 3500, 200, 1.0 * k, 0.45);
        this.tone('sine', 95, 30, 0.6 * k, 0.3);
        this.burst('highpass', 1800, 900, 0.2 * k, 0.12, 0.35); // pump
        break;
      case 'smg':
        this.burst('bandpass', 3200, 1400, 0.38 * k, 0.07);
        this.tone('square', 260, 110, 0.1 * k, 0.04);
        break;
      case 'rifle':
        this.burst('bandpass', 2400, 500, 0.7 * k, 0.16);
        this.tone('sawtooth', 160, 50, 0.22 * k, 0.1);
        break;
      case 'sniper':
        this.burst('lowpass', 4000, 150, 1.1 * k, 0.9);
        this.tone('sine', 80, 25, 0.7 * k, 0.6);
        this.burst('highpass', 2500, 1500, 0.15 * k, 0.1, 0.7); // bolt
        break;
      case 'npc':
        this.burst('bandpass', 2300, 700, 0.4 * k, 0.13);
        break;
      default:
        this.burst('bandpass', 2000, 600, 0.4 * k, 0.12);
    }
  }

  /** Melee: whoosh, plus a thump when it connects. */
  swing(hit: boolean): void {
    if (!this.ready()) return;
    this.burst('bandpass', 600, 1800, 0.12, 0.12);
    if (hit) {
      this.tone('sine', 120, 50, 0.4, 0.12, 0.05);
      this.burst('lowpass', 900, 200, 0.3, 0.1, 0.05);
    }
  }

  reload(): void {
    if (!this.ready()) return;
    this.burst('highpass', 3000, 2000, 0.12, 0.05);
    this.burst('highpass', 2600, 1800, 0.14, 0.06, 0.25);
  }

  dryFire(): void {
    if (!this.ready()) return;
    this.burst('highpass', 4000, 3000, 0.08, 0.03);
  }

  /** Bottle breaking and fuel catching. */
  molotov(where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 120, 1);
    if (k < 0.02) return;
    this.burst('highpass', 5000, 2500, 0.4 * k, 0.25);
    this.burst('lowpass', 500, 1500, 0.5 * k, 0.9, 0.05);
  }

  bulletHit(metal: boolean, where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 60, 0.2);
    if (k < 0.05) return;
    if (metal) this.tone('square', 1500 + Math.random() * 700, 500, 0.06 * k, 0.06);
    else this.burst('highpass', 2500, 1200, 0.1 * k, 0.04);
  }

  /**
   * Capture pods (Hoodballs and the rest): the throw's whoosh, the flash as it opens and pulls
   * the Streetmon in, the clack when it lands, each wobble's click, the lock-shut click and
   * chime, or the pop when it bursts open. Heard from where the pod is.
   */
  pod(kind: 'throw' | 'open' | 'land' | 'shake' | 'click' | 'burst', where: Where = 0): void {
    if (!this.ready()) return;
    const k = this.att(where, 70, 1.2);
    if (k < 0.03) return;
    switch (kind) {
      case 'throw':
        this.burst('bandpass', 500, 2200, 0.16 * k, 0.28);
        this.tone('sine', 300, 520, 0.05 * k, 0.25);
        break;
      case 'open':
        this.tone('sine', 520, 1560, 0.14 * k, 0.32);
        this.burst('highpass', 2400, 6000, 0.16 * k, 0.4);
        this.tone('triangle', 1040, 2080, 0.06 * k, 0.3, 0.06);
        break;
      case 'land':
        this.tone('square', 900, 420, 0.07 * k, 0.05);
        this.burst('bandpass', 1800, 900, 0.14 * k, 0.06);
        this.tone('square', 760, 380, 0.04 * k, 0.04, 0.11);
        break;
      case 'shake':
        this.burst('bandpass', 2600, 1800, 0.14 * k, 0.04);
        this.tone('square', 1400, 1100, 0.04 * k, 0.03, 0.05);
        this.burst('bandpass', 2200, 1600, 0.1 * k, 0.04, 0.16);
        break;
      case 'click':
        this.tone('square', 2200, 2000, 0.1 * k, 0.03);
        this.burst('highpass', 3200, 2600, 0.2 * k, 0.04);
        this.tone('triangle', 1320, 1320, 0.07 * k, 0.12, 0.12);
        this.tone('triangle', 1760, 1760, 0.07 * k, 0.16, 0.2);
        this.tone('triangle', 2640, 2640, 0.05 * k, 0.3, 0.28);
        break;
      case 'burst':
        this.burst('bandpass', 1300, 300, 0.4 * k, 0.16);
        this.tone('sine', 420, 120, 0.2 * k, 0.2);
        this.burst('highpass', 2600, 1400, 0.16 * k, 0.35, 0.04);
        break;
    }
  }

  cash(): void {
    if (!this.ready()) return;
    this.tone('triangle', 1320, 1320, 0.07, 0.08);
    this.tone('triangle', 1760, 1760, 0.07, 0.12, 0.08);
  }

  door(): void {
    if (!this.ready()) return;
    this.tone('sine', 160, 60, 0.4, 0.09);
    this.burst('lowpass', 900, 200, 0.3, 0.08, 0.05);
  }

  /** Throttled footstep tick while walking. */
  footstep(speed: number): void {
    if (!this.ready() || speed < 0.5) return;
    const now = performance.now();
    const interval = 1000 / (1.6 + speed * 0.55) / 2;
    if (now - this.lastStep < interval) return;
    this.lastStep = now;
    this.burst('bandpass', 900 + Math.random() * 300, 400, 0.08 + speed * 0.01, 0.06);
  }

  thud(): void {
    if (!this.ready()) return;
    this.tone('sine', 140, 45, 0.6, 0.2);
    this.burst('lowpass', 700, 150, 0.4, 0.15);
  }

  wasted(): void {
    if (!this.ready()) return;
    [330, 277, 220, 165].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.08, 0.45, i * 0.28));
  }

  /** Wanted level went up: a short rising two-tone alert. */
  wantedUp(): void {
    if (!this.ready()) return;
    this.tone('square', 660, 660, 0.06, 0.12);
    this.tone('square', 880, 880, 0.06, 0.18, 0.12);
  }

  busted(): void {
    if (!this.ready()) return;
    [523, 392, 330, 262].forEach((f, i) => this.tone('square', f, f, 0.07, 0.3, i * 0.2));
  }

  ui(): void {
    if (!this.ready()) return;
    this.tone('triangle', 880, 880, 0.06, 0.07);
  }

  /**
   * Evolution: a shimmering swell that climbs for `seconds` (two detuned sines sweeping up an
   * octave and a half with a tremolo that speeds up, plus an airy noise rise). Returns a stop
   * function (the evolution was cancelled).
   */
  evolveRise(seconds: number): () => void {
    if (!this.ready()) return () => undefined;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const end = t + seconds;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + seconds * 0.6);
    g.gain.exponentialRampToValueAtTime(0.14, end);
    // Tremolo: a gain wobbled by an LFO whose rate rises from 4 to 18 Hz.
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(4, t);
    lfo.frequency.exponentialRampToValueAtTime(18, end);
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    const oscs: OscillatorNode[] = [lfo];
    for (const [f, det] of [
      [330, 0],
      [331.5, 0],
      [495, 0],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 2.8 + det, end);
      o.connect(trem);
      oscs.push(o);
    }
    trem.connect(g).connect(this.master!);
    for (const o of oscs) {
      o.start(t);
      o.stop(end + 0.1);
    }
    this.burst('highpass', 1500, 7000, 0.06, seconds);
    let stopped = false;
    return () => {
      if (stopped || !this.ctx) return;
      stopped = true;
      const n = this.ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.25);
      for (const o of oscs) o.stop(n + 0.3);
    };
  }

  /**
   * A Streetmon's cry (src/audio/Cries.ts makes the parameters). `pitch` and `speed` bend it
   * (fainting: lower and slower); `distance` in metres fades it.
   */
  cry(p: CryParams, where: Where = 0, o: { pitch?: number; speed?: number; gain?: number } = {}): void {
    if (!this.ready()) return;
    const k = this.att(where, 160, 3.5) * (o.gain ?? 1);
    if (k < 0.03) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const sp = 1 / (o.speed ?? 1);
    const base = p.base * (o.pitch ?? 1);
    const end = t + p.length * sp + 0.1;
    const out = ctx.createGain();
    out.gain.value = 0.22 * k;
    out.connect(this.dest());
    if (p.echo > 0) {
      const dl = ctx.createDelay(1);
      dl.delayTime.value = p.echoDelay;
      const fb = ctx.createGain();
      fb.gain.value = p.echo;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      out.connect(dl).connect(lp).connect(fb).connect(dl);
      lp.connect(this.dest());
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.connect(out);
    const attack = p.wave === 'square' && p.vibRate === 0 ? 0.006 : 0.025;
    for (const sy of p.syllables) {
      const a = t + sy.at * sp;
      const d = sy.dur * sp;
      env.gain.setValueAtTime(0.0001, a);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, sy.amp), a + attack);
      env.gain.setValueAtTime(Math.max(0.0002, sy.amp * 0.85), a + d * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0001, a + d);
    }
    const contour = (f: AudioParam, mult: number): void => {
      f.setValueAtTime(base * mult * p.syllables[0].p0, t);
      for (const sy of p.syllables) {
        const a = t + sy.at * sp;
        const d = sy.dur * sp;
        f.setValueAtTime(base * mult * sy.p0, a);
        f.linearRampToValueAtTime(base * mult * sy.p1, a + d * 0.35);
        f.linearRampToValueAtTime(base * mult * sy.p2, a + d);
      }
    };
    const nodes: AudioScheduledSourceNode[] = [];
    // The voice: two detuned oscillators through a formant band-pass.
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = Math.min(9000, base * p.formant);
    formant.Q.value = p.q;
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    formant.connect(env);
    dry.connect(env);
    for (const [det, mix] of [
      [0, 1],
      [p.detune, p.mix2],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = p.wave;
      osc.detune.value = det;
      contour(osc.frequency, 1);
      const g = ctx.createGain();
      g.gain.value = mix * 0.5;
      osc.connect(g);
      g.connect(formant);
      g.connect(dry);
      if (p.vibRate > 0 && p.vibDepth > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = p.vibRate;
        const lg = ctx.createGain();
        lg.gain.value = base * p.vibDepth;
        lfo.connect(lg).connect(osc.frequency);
        nodes.push(lfo);
      }
      if (p.fmIndex > 0) {
        const mod = ctx.createOscillator();
        mod.frequency.value = base * p.fmRatio;
        const mg = ctx.createGain();
        mg.gain.value = base * p.fmIndex;
        mod.connect(mg).connect(osc.frequency);
        nodes.push(mod);
      }
      nodes.push(osc);
    }
    if (p.sub > 0) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      contour(sub.frequency, 0.5);
      const g = ctx.createGain();
      g.gain.value = p.sub * 0.6;
      sub.connect(g).connect(env);
      nodes.push(sub);
    }
    if (p.noise > 0) {
      const n = this.noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = p.noiseFreq;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = p.noise * 0.7;
      n.connect(f).connect(g).connect(env);
      nodes.push(n);
    }
    for (const n of nodes) {
      if (n instanceof AudioBufferSourceNode) n.start(t, Math.random());
      else n.start(t);
      n.stop(end + 0.05);
    }
  }

  /** Evolution complete: a bright burst and a major-chord fanfare. */
  evolveBurst(): void {
    if (!this.ready()) return;
    this.burst('highpass', 3000, 8000, 0.3, 0.5);
    this.tone('sine', 110, 40, 0.5, 0.6);
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.08, 0.9 - i * 0.1, 0.12 + i * 0.09));
    [1047, 1319, 1568].forEach((f, i) => this.tone('sine', f, f, 0.05, 1.2, 0.5 + i * 0.05));
  }
}

export const audio = new AudioEngine();
