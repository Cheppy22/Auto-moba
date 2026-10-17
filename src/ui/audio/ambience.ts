/**
 * The garden around the board, made from looped noise and a few oscillators that are built once.
 *
 * - Slate garden (theme a): cool wind in the pines, a brook, distant birds.
 * - Lamplit parterre (theme b): a warm evening hum, a fountain with now-and-then drops, crickets.
 *
 * Switching theme crossfades the two. `intensity` (0..1, from the fighting) swells the wind and
 * adds a low rumble, and thins the birds and crickets; the bell ducks it for a moment.
 */
import { lcg, tone, type Engine } from './synth';

export type Theme = 'a' | 'b';

const SCHEDULER_MS = 300;

export class Ambience {
  private readonly rng: () => number;
  private timer = 0;
  private theme: Theme = 'a';
  private intensity = 0;
  private started = false;
  private readonly slate: GainNode;
  private readonly lamp: GainNode;
  private readonly windGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly warmGain: GainNode;
  private readonly rumble: GainNode;
  private readonly birds: { osc: OscillatorNode; gain: GainNode }[] = [];
  private readonly crickets: { osc: OscillatorNode; gain: GainNode }[] = [];
  private nextBird = 0;
  private nextCricket = 0;
  private nextDrop = 0;

  constructor(
    private readonly e: Engine,
    seed: number,
  ) {
    this.rng = lcg(seed);
    const ctx = e.ctx;
    const out = e.ambienceIn;
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 2);

    this.slate = ctx.createGain();
    this.slate.gain.value = 1;
    this.slate.connect(out);
    this.lamp = ctx.createGain();
    this.lamp.gain.value = 0;
    this.lamp.connect(out);

    const noise = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = e.pink;
      s.loop = true;
      s.start(0, this.rng() * 3);
      return s;
    };
    const lfo = (target: AudioParam, hz: number, depth: number): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
    };

    // --- slate: wind in the pines
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 330;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    noise().connect(this.windFilter).connect(this.windGain).connect(this.slate);
    lfo(this.windFilter.frequency, 0.09, 110);
    lfo(this.windGain.gain, 0.13, 0.016);

    // --- slate: a brook (two bands of noise, each with its own ripple)
    for (const [hz, q, level, ripple] of [
      [1500, 0.9, 0.02, 3.3],
      [2700, 1.2, 0.012, 5.7],
    ] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = hz;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      noise().connect(f).connect(g).connect(this.slate);
      lfo(g.gain, ripple, level * 0.4);
    }

    // --- slate: two bird voices, played by scheduled chirps
    for (let i = 0; i < 2; i++) this.birds.push(this.chirper(this.slate, 5200));

    // --- lamplit: the warm evening: soft low wind and a hum
    const warmF = ctx.createBiquadFilter();
    warmF.type = 'lowpass';
    warmF.frequency.value = 420;
    this.warmGain = ctx.createGain();
    this.warmGain.gain.value = 0.04;
    noise().connect(warmF).connect(this.warmGain).connect(this.lamp);
    lfo(this.warmGain.gain, 0.11, 0.012);
    for (const f of [98, 146.83]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.006;
      o.connect(g).connect(this.lamp);
      lfo(g.gain, 0.17 + f / 1000, 0.004);
      o.start();
    }

    // --- lamplit: the fountain
    for (const [kind, hz, q, level, ripple] of [
      ['highpass', 2600, 0.7, 0.022, 11],
      ['bandpass', 4800, 0.5, 0.018, 7.3],
    ] as const) {
      const f = ctx.createBiquadFilter();
      f.type = kind;
      f.frequency.value = hz;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      noise().connect(f).connect(g).connect(this.lamp);
      lfo(g.gain, ripple, level * 0.35);
    }

    // --- lamplit: crickets
    for (let i = 0; i < 2; i++) this.crickets.push(this.chirper(this.lamp, 6500, 4300 + i * 380));

    // --- both: a low rumble that only a big fight lifts
    const rumbleF = ctx.createBiquadFilter();
    rumbleF.type = 'lowpass';
    rumbleF.frequency.value = 140;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    noise().connect(rumbleF).connect(this.rumble).connect(out);
  }

  /** A silent oscillator whose gain and pitch are scripted ahead of time. */
  private chirper(
    dest: AudioNode,
    lowpass: number,
    freq = 3000,
  ): { osc: OscillatorNode; gain: GainNode } {
    const ctx = this.e.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    osc.connect(gain).connect(f).connect(dest);
    osc.start();
    return { osc, gain };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.e.ctx.currentTime;
    this.nextBird = now + 3;
    this.nextCricket = now + 2;
    this.nextDrop = now + 2;
    this.timer = window.setInterval(() => this.tick(), SCHEDULER_MS);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.started = false;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    const now = this.e.ctx.currentTime;
    this.slate.gain.setTargetAtTime(theme === 'a' ? 1 : 0, now, 1.6);
    this.lamp.gain.setTargetAtTime(theme === 'b' ? 1 : 0, now, 1.6);
  }

  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, v));
    const now = this.e.ctx.currentTime;
    const i = this.intensity;
    this.windGain.gain.setTargetAtTime(0.05 * (1 + 1.4 * i), now, 1.5);
    this.windFilter.frequency.setTargetAtTime(330 + 260 * i, now, 1.5);
    this.warmGain.gain.setTargetAtTime(0.04 * (1 + 0.8 * i), now, 1.5);
    this.rumble.gain.setTargetAtTime(0.1 * i * i, now, 1.2);
  }

  /** The bell: the garden steps back for `sec` seconds. */
  duck(sec: number): void {
    const g = this.e.ambienceIn.gain;
    const now = this.e.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0.45, now, 0.08);
    g.setTargetAtTime(1, now + sec, 1.5);
  }

  /** Offline rendering (docs samples): scripts `seconds` of birds, crickets and drops from time 0. */
  scheduleOffline(seconds: number): void {
    for (let t = 0.5; t < seconds; t += 3 + this.rng() * 5) {
      if (this.theme === 'a') this.chirp(t);
      else {
        this.cricket(t);
        this.cricket(t + 1.3);
      }
    }
  }

  private tick(): void {
    const e = this.e;
    if (e.ctx.state !== 'running') return;
    const now = e.ctx.currentTime;
    const calm = 1 + 2.5 * this.intensity; // gaps grow in a fight
    if (this.theme === 'a' && now >= this.nextBird) {
      this.chirp(now + 0.05);
      this.nextBird = now + (3 + this.rng() * 9) * calm;
    }
    if (this.theme === 'b') {
      if (now >= this.nextCricket) {
        this.cricket(now + 0.05);
        this.nextCricket = now + (0.9 + this.rng() * 2.2) * calm;
      }
      if (now >= this.nextDrop) {
        const f = 1800 + this.rng() * 1500;
        tone(e, {
          from: f,
          to: f * 1.35,
          start: now + 0.05,
          decay: 0.09,
          peak: 0.011,
          dest: e.ambienceIn,
          pan: (this.rng() - 0.5) * 0.8,
        });
        this.nextDrop = now + 1.4 + this.rng() * 3;
      }
    }
  }

  /** A short bird phrase: two to four rising or falling whistles, far away. */
  private chirp(t0: number): void {
    const v = this.birds[this.rng() < 0.5 ? 0 : 1];
    const n = 2 + Math.floor(this.rng() * 3);
    const base = 2300 + this.rng() * 1500;
    let t = t0;
    v.gain.gain.cancelScheduledValues(t0);
    for (let i = 0; i < n; i++) {
      const dur = 0.06 + this.rng() * 0.05;
      const f0 = base * (1 + (this.rng() - 0.4) * 0.35);
      const f1 = f0 * (this.rng() < 0.5 ? 1.25 : 0.78);
      v.osc.frequency.setValueAtTime(f0, t);
      v.osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      v.gain.gain.setValueAtTime(0.0001, t);
      v.gain.gain.linearRampToValueAtTime(0.014, t + dur * 0.3);
      v.gain.gain.linearRampToValueAtTime(0.0001, t + dur);
      t += dur + 0.05 + this.rng() * 0.04;
    }
  }

  /** A cricket's chirp: three quick pulses of a high tone. */
  private cricket(t0: number): void {
    const v = this.crickets[this.rng() < 0.5 ? 0 : 1];
    v.gain.gain.cancelScheduledValues(t0);
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.055;
      v.gain.gain.setValueAtTime(0.0001, t);
      v.gain.gain.linearRampToValueAtTime(0.0065, t + 0.01);
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.035);
    }
  }
}
