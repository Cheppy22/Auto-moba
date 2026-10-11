/**
 * The game's small sound set, made with the Web Audio API (no audio files): wood, brass and clock.
 * Nothing plays until the player has touched the page once (`unlock`, called from the first tap or
 * key), and the mute switch is remembered in localStorage. The bell is the loudest sound.
 */

export type Cue = 'toll' | 'tick' | 'clack' | 'chime' | 'thud' | 'tap';

const STORE_KEY = 'automoba.sound';
/** Overall level: modest, so the bell (the loudest cue) never startles. */
const MASTER = 0.45;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();
let lastClack = -1;
let tickSide = 0;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === 'off';
  } catch {
    return false;
  }
}

export const isMuted = (): boolean => muted;

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(STORE_KEY, value ? 'off' : 'on');
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.02);
  for (const fn of listeners) fn();
}

export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Starts (or wakes) the audio context. Browsers only allow it from a tap or key press. */
export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch (err) {
    console.error('Sound could not start', err);
    ctx = null;
    master = null;
  }
}

function ready(): AudioContext | null {
  return ctx && master && ctx.state === 'running' && !muted ? ctx : null;
}

/** A quarter second of white noise, shared by every cue that needs a click or a thump. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const buf = c.createBuffer(1, Math.round(c.sampleRate * 0.25), c.sampleRate);
  const data = buf.getChannelData(0);
  // a fixed pattern (not Math.random), so every device hears the same click
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0x80000000 - 1) * 0.9;
  }
  noise = buf;
  return buf;
}

/** One oscillator with a fast attack and an exponential decay. */
function tone(
  c: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  start: number,
  decay: number,
  peak: number,
): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + decay * 0.7);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + decay + 0.05);
}

/** A burst of filtered noise: the click of wood, the thump of felt. */
function burst(
  c: AudioContext,
  kind: BiquadFilterType,
  freq: number,
  q: number,
  start: number,
  decay: number,
  peak: number,
): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = kind;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  src.connect(f).connect(g).connect(master!);
  src.start(start);
  src.stop(start + decay + 0.02);
}

/** Bell partials: ratio to the strike note, level and ring time in seconds. */
const BELL: readonly (readonly [number, number, number])[] = [
  [1, 1, 3.4],
  [2, 0.55, 2.4],
  [2.76, 0.42, 1.7],
  [4.07, 0.26, 1.1],
  [5.4, 0.16, 0.7],
];

/** Toll `n` of 3: a low brass bell, each strike louder than the one before. */
function toll(c: AudioContext, n: number): void {
  const t = c.currentTime;
  const level = 0.5 + 0.25 * Math.min(3, Math.max(1, n));
  for (const [ratio, amp, ring] of BELL)
    tone(c, 'sine', 174 * ratio, 174 * ratio, t, ring, 0.34 * level * amp);
  burst(c, 'bandpass', 900, 0.8, t, 0.06, 0.12 * level);
}

/** A soft chess-clock tick; `k` (0..1) grows through the countdown. */
function tick(c: AudioContext, k: number): void {
  const t = c.currentTime;
  tickSide ^= 1;
  const f = tickSide ? 1500 : 1250;
  tone(c, 'sine', f, f * 0.9, t, 0.04, 0.05 + 0.04 * k);
  burst(c, 'bandpass', 3200, 2, t, 0.02, 0.03 + 0.02 * k);
}

/** A wooden clack: a piece set down hard on a board. */
function clack(c: AudioContext, team: string | undefined): void {
  const t = c.currentTime;
  if (t - lastClack < 0.09) return;
  lastClack = t;
  const base = team === 'B' ? 880 : 1040;
  tone(c, 'sine', base, base * 0.38, t, 0.1, 0.22);
  tone(c, 'triangle', base * 1.9, base * 0.8, t, 0.04, 0.07);
  burst(c, 'bandpass', 2200, 1.4, t, 0.04, 0.14);
}

/** A brass chime: a rising fifth, for a relic taken or a path chosen. */
function chime(c: AudioContext): void {
  const t = c.currentTime;
  for (const [f, at, amp] of [
    [784, 0, 0.16],
    [1175, 0.09, 0.14],
    [1568, 0.09, 0.07],
  ] as const)
    tone(c, 'sine', f, f, t + at, 1.3, amp);
}

/** A gambit lands: a low felt thud. */
function thud(c: AudioContext): void {
  const t = c.currentTime;
  tone(c, 'sine', 150, 52, t, 0.24, 0.42);
  burst(c, 'lowpass', 320, 0.7, t, 0.12, 0.2);
}

/** A tap on a control: a short dry wooden tick. */
function tap(c: AudioContext): void {
  const t = c.currentTime;
  tone(c, 'triangle', 1000, 780, t, 0.03, 0.07);
}

/** Plays a cue now (silent while muted or before the first tap). `n` is the toll or tick strength. */
export function play(cue: Cue, opts: { n?: number; team?: string; k?: number } = {}): void {
  const c = ready();
  if (!c) return;
  switch (cue) {
    case 'toll':
      return toll(c, opts.n ?? 1);
    case 'tick':
      return tick(c, opts.k ?? 0);
    case 'clack':
      return clack(c, opts.team);
    case 'chime':
      return chime(c);
    case 'thud':
      return thud(c);
    case 'tap':
      return tap(c);
  }
}
