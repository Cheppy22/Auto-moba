/**
 * The audio engine: one AudioContext, the mixer buses, a small hall reverb, and the few building
 * blocks (tone, noise burst, plucked and bell voices) every sound is made from. No audio files.
 *
 *   effects ─┐                      ┌─ reverb (shared) ─┐
 *   music ───┼─ duck ─ bus gains ───┴───────────────────┴─ master ─ compressor ─ speakers
 *   ambience ┘
 *
 * Everything here is reused or short-lived: the music pad and the garden loops are built once; a
 * cue makes a handful of tiny nodes that free themselves when they end, and a voice cap drops the
 * least important sounds if a fight gets busy.
 */
import { BUSES, busGain, mixer, sliderToGain, subscribeMixer, type Bus } from './mixer';

/**
 * Overall level into the master chain. Measured on an encoded 60 s mix (docs/audio/aaa-mix.m4a):
 * the chain is tuned for about -16 LUFS integrated and true peaks under -4 dBFS.
 */
/**
 * The master chain: gain into it, glue compressor threshold (dB) and ratio, limiter threshold (dB),
 * and the soft ceiling (linear).
 */
export const CHAIN = {
  output: 2.8,
  glueThreshold: -22,
  glueRatio: 3,
  limitThreshold: -10,
  ceiling: 0.45,
};
/** Most one-shot voices alive at once; past it new ones are skipped. */
const MAX_VOICES = 44;

export interface Engine {
  ctx: AudioContext;
  /** Where cue voices connect (dry to the effects bus, a little to the hall). */
  fx: GainNode;
  /** Where the cue being made right now connects: `fx`, or its own trim node (see `voiceCue`). */
  cueDest: AudioNode;
  /** Where music voices connect (ducks around the bell). */
  musicIn: GainNode;
  /** Where garden voices connect. */
  ambienceIn: GainNode;
  /** The shared white-noise buffer (a fixed pattern, so every device hears the same). */
  noise: AudioBuffer;
  /** Pink-ish noise, 4 s, for wind and water loops. */
  pink: AudioBuffer;
  buses: Record<Bus, GainNode>;
  voices: number;
  /** Cap on one-shot voices alive at once (unlimited for offline renders, which schedule everything up front). */
  maxVoices: number;
}

let engine: Engine | null = null;
let failed = false;

/** A tiny seeded generator for sound shaping that must not touch the sim's streams. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeNoise(c: AudioContext, seconds: number, pink: boolean): AudioBuffer {
  const buf = c.createBuffer(1, Math.round(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = lcg(pink ? 777 : 12345);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rnd() * 2 - 1;
    if (pink) {
      // Paul Kellet's cheap pink-noise filter
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else data[i] = w * 0.9;
  }
  if (pink) {
    // fade the loop point so it does not click
    const n = Math.min(2000, data.length >> 2);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      data[i] *= k;
      data[data.length - 1 - i] *= k;
    }
  }
  return buf;
}

/** A 1.8 s hall: decaying noise, a little different in each ear. */
function makeHall(c: AudioContext): AudioBuffer {
  const len = Math.round(c.sampleRate * 1.8);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = lcg(900 + ch * 31);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // darker as it dies away
      lp += (rnd() * 2 - 1 - lp) * (0.55 - 0.4 * t);
      data[i] = lp * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

function build(): Engine | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return createEngine(new Ctor());
}

/**
 * Wires the buses and the hall onto a context. The game uses a live AudioContext; the offline
 * renderer in `tools/` passes an OfflineAudioContext (it has the same graph methods).
 */
export function createEngine(context: BaseAudioContext): Engine {
  const offline =
    typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;
  const ctx = context as AudioContext;
  const master = ctx.createGain();
  // glue compressor, then a fast limiter, then a soft ceiling: a busy fight stays loud (about
  // -16 LUFS) while true peaks stay under -4 dBFS (phone speakers, AAC)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = CHAIN.glueThreshold;
  comp.knee.value = 14;
  comp.ratio.value = CHAIN.glueRatio;
  comp.attack.value = 0.008;
  comp.release.value = 0.3;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = CHAIN.limitThreshold;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  const ceiling = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = CHAIN.ceiling * Math.tanh(x / CHAIN.ceiling);
  }
  ceiling.curve = curve;
  ceiling.oversample = '2x';
  master.connect(comp).connect(limiter).connect(ceiling).connect(ctx.destination);

  const hall = ctx.createConvolver();
  hall.buffer = makeHall(ctx);
  const hallReturn = ctx.createGain();
  hallReturn.gain.value = 0.9;
  hall.connect(hallReturn).connect(master);

  const buses = {} as Record<Bus, GainNode>;
  for (const b of BUSES) buses[b] = ctx.createGain();
  buses.master = master;

  const wire = (bus: GainNode, send: number): GainNode => {
    const input = ctx.createGain();
    input.connect(bus);
    const s = ctx.createGain();
    s.gain.value = send;
    input.connect(s).connect(hall);
    bus.connect(master);
    return input;
  };
  const fx = wire(buses.effects, 0.22);
  const musicIn = ctx.createGain();
  const musicSend = wire(buses.music, 0.3);
  musicIn.connect(musicSend);
  const ambienceIn = wire(buses.ambience, 0.12);

  const e: Engine = {
    ctx,
    fx,
    cueDest: fx,
    musicIn,
    ambienceIn,
    noise: makeNoise(ctx, 0.25, false),
    pink: makeNoise(ctx, 4, true),
    buses,
    voices: 0,
    maxVoices: offline ? Infinity : MAX_VOICES,
  };
  return e;
}

/** Applies the mixer's volumes (smoothly, so a slider never crackles). */
export function applyMixer(target: Engine | null = engine): void {
  if (!target) return;
  const m = mixer();
  const { ctx, buses } = target;
  buses.master.gain.setTargetAtTime(busGain(m, 'master') * CHAIN.output, ctx.currentTime, 0.03);
  for (const b of ['music', 'ambience', 'effects'] as const)
    buses[b].gain.setTargetAtTime(sliderToGain(m.volume[b]), ctx.currentTime, 0.05);
}

/** Starts (or wakes) the engine. Browsers only allow it from a tap or key press. */
export function startEngine(): Engine | null {
  if (failed) return null;
  try {
    if (!engine) {
      engine = build();
      if (!engine) {
        failed = true;
        return null;
      }
      subscribeMixer(() => applyMixer());
      applyMixer();
    }
    if (engine.ctx.state === 'suspended' && !mixer().muted) void engine.ctx.resume();
    return engine;
  } catch (err) {
    console.error('Sound could not start', err);
    failed = true;
    engine = null;
    return null;
  }
}

export const getEngine = (): Engine | null => engine;

/** The engine, when it is running and not muted (cues and loops ask this before they sound). */
export function liveEngine(): Engine | null {
  return engine && engine.ctx.state === 'running' && !mixer().muted ? engine : null;
}

// ------------------------------------------------------------------ building blocks

function claim(e: Engine, priority: boolean): boolean {
  if (e.voices >= e.maxVoices && !priority) return false;
  e.voices++;
  return true;
}

function release(e: Engine, node: AudioScheduledSourceNode): void {
  node.onended = () => {
    e.voices = Math.max(0, e.voices - 1);
    node.disconnect();
  };
}

export interface ToneSpec {
  type?: OscillatorType;
  from: number;
  /** Ends here (exponential glide over 70% of the decay); default: stays. */
  to?: number;
  start: number;
  decay: number;
  peak: number;
  /** Attack in seconds. */
  attack?: number;
  dest?: AudioNode;
  /** Detune in cents. */
  detune?: number;
  /** Counts toward the voice cap but is never skipped (bells, stingers). */
  priority?: boolean;
  /** Stereo position -1..1. */
  pan?: number;
}

/** One oscillator with a fast attack and an exponential decay. */
export function tone(e: Engine, s: ToneSpec): void {
  if (!claim(e, !!s.priority)) return;
  const c = e.ctx;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = s.type ?? 'sine';
  osc.frequency.setValueAtTime(s.from, s.start);
  if (s.to !== undefined && s.to !== s.from)
    osc.frequency.exponentialRampToValueAtTime(s.to, s.start + s.decay * 0.7);
  if (s.detune) osc.detune.value = s.detune;
  const attack = s.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, s.start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, s.peak), s.start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, s.start + s.decay);
  let out: AudioNode = g;
  osc.connect(g);
  if (s.pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, s.pan));
    g.connect(p);
    out = p;
  }
  out.connect(s.dest ?? e.cueDest);
  release(e, osc);
  osc.start(s.start);
  osc.stop(s.start + s.decay + 0.05);
}

export interface BurstSpec {
  kind: BiquadFilterType;
  freq: number;
  q?: number;
  start: number;
  decay: number;
  peak: number;
  /** Sweep the filter to this frequency over the decay. */
  sweepTo?: number;
  attack?: number;
  dest?: AudioNode;
  priority?: boolean;
}

/** A burst of filtered noise: the click of wood, the thump of felt, a crumble of stone. */
export function burst(e: Engine, s: BurstSpec): void {
  if (!claim(e, !!s.priority)) return;
  const c = e.ctx;
  const src = c.createBufferSource();
  src.buffer = s.decay > 0.24 ? e.pink : e.noise;
  src.loop = s.decay > 0.24;
  const f = c.createBiquadFilter();
  f.type = s.kind;
  f.frequency.setValueAtTime(s.freq, s.start);
  if (s.sweepTo) f.frequency.exponentialRampToValueAtTime(s.sweepTo, s.start + s.decay);
  f.Q.value = s.q ?? 1;
  const g = c.createGain();
  const attack = s.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, s.start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, s.peak), s.start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, s.start + s.decay);
  src
    .connect(f)
    .connect(g)
    .connect(s.dest ?? e.fx);
  release(e, src);
  src.start(s.start);
  src.stop(s.start + s.decay + 0.03);
}

/** Bell partials: ratio to the strike note, level and ring time (seconds, scaled by `ring`). */
const BELL: readonly (readonly [number, number, number])[] = [
  [1, 1, 3.4],
  [2, 0.55, 2.4],
  [2.76, 0.42, 1.7],
  [4.07, 0.26, 1.1],
  [5.4, 0.16, 0.7],
];

/** A struck bell at `f` Hz. `ring` scales how long it lasts, `amp` how loud, `bright` the upper partials. */
export function bell(
  e: Engine,
  start: number,
  f: number,
  amp: number,
  ring = 1,
  bright = 1,
  dest?: AudioNode,
): void {
  for (const [ratio, a, r] of BELL)
    tone(e, {
      from: f * ratio,
      start,
      decay: r * ring,
      peak: amp * a * (ratio > 2 ? bright : 1),
      dest,
      priority: ratio < 3,
    });
}

/**
 * A plucked, harpsichord-like note: a sine carrier with a fast-fading FM sparkle on top and a
 * quiet octave. `soft` (0..1) rounds it toward a lute.
 */
export function pluck(
  e: Engine,
  start: number,
  f: number,
  peak: number,
  decay: number,
  soft: number,
  dest: AudioNode,
  pan = 0,
): void {
  if (!claim(e, false)) return;
  const c = e.ctx;
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  const out = c.createGain();
  car.type = 'sine';
  car.frequency.value = f;
  mod.type = 'sine';
  mod.frequency.value = f * 2.001;
  const index = f * (2.4 - 1.6 * soft);
  modGain.gain.setValueAtTime(index, start);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, index * 0.04), start + decay * 0.35);
  mod.connect(modGain).connect(car.frequency);
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.003);
  out.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  car.connect(out);
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(dest);
  } else out.connect(dest);
  release(e, car);
  car.start(start);
  mod.start(start);
  car.stop(start + decay + 0.05);
  mod.stop(start + decay + 0.05);
  // one counted voice: the modulator ends with the carrier
  mod.onended = () => mod.disconnect();
}

/** Hz of a MIDI note. */
export const midiHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

/** Dips a gain to `depth` for `sec` seconds from `at`, then eases back (music and garden under a stinger). */
export function duckParam(
  g: AudioParam,
  at: number,
  sec: number,
  depth: number,
  back: number,
): void {
  if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(at);
  else g.cancelScheduledValues(at);
  g.setTargetAtTime(depth, at, 0.05);
  g.setTargetAtTime(1, at + sec, back);
}
