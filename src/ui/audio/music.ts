/**
 * The music bed: sparse, generative, in D minor. A soft string pad holds the chord; a plucked
 * harpsichord-like motif wanders over it and is varied bar by bar from its own seeded generator
 * (never the sim's). A calm layer plays on the menus and in Setup; as tension rises a low
 * ostinato, a tremolo string pair and a denser motif fade in. Layers crossfade over seconds.
 *
 * `Composer` is pure (notes in, no Web Audio) so it can be tested; `MusicPlayer` plays it.
 */
import { duckParam, lcg, midiHz, pluck, type Engine } from './synth';

/** D3, the tonic every chord is measured from. */
export const TONIC = 50;
/** Natural minor, in semitones above the tonic. */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const BPM = 72;
export const BEATS_PER_BAR = 4;
export const BAR_SEC = (60 / BPM) * BEATS_PER_BAR;

export interface Chord {
  /** Semitones above the tonic. */
  root: number;
  /** Semitones above the root. */
  tones: readonly number[];
}

const MIN = [0, 3, 7] as const;
const MAJ = [0, 4, 7] as const;
const DIM = [0, 3, 6] as const;
const c = (root: number, tones: readonly number[]): Chord => ({ root, tones });

const CALM_PROGRESSIONS: readonly (readonly Chord[])[] = [
  [c(0, MIN), c(8, MAJ), c(3, MAJ), c(10, MAJ)],
  [c(0, MIN), c(5, MIN), c(10, MAJ), c(3, MAJ)],
  [c(0, MIN), c(8, MAJ), c(5, MIN), c(7, MAJ)],
];
const TENSE_PROGRESSIONS: readonly (readonly Chord[])[] = [
  [c(0, MIN), c(2, DIM), c(7, MAJ), c(0, MIN)],
  [c(0, MIN), c(7, MAJ), c(8, MAJ), c(7, MAJ)],
  [c(0, MIN), c(1, MAJ), c(7, MAJ), c(0, MIN)],
];

export interface Note {
  /** Beat within the bar (0..4). */
  beat: number;
  midi: number;
  /** Beats it is meant to last (the pluck decays by itself). */
  dur: number;
  /** 0..1 */
  vel: number;
}

export interface BarPlan {
  chord: Chord;
  melody: Note[];
  bass: Note[];
}

interface MotifNote {
  /** Steps along the scale from the anchor. */
  step: number;
  beat: number;
  dur: number;
}

const MELODY_LOW = 62;
const MELODY_HIGH = 86;

/** Folds a note into the melody's range by octaves. */
export function fold(midi: number, lo = MELODY_LOW, hi = MELODY_HIGH): number {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** MIDI note `steps` scale steps above (or below) a scale-degree anchor. */
function scaleNote(degree: number, steps: number): number {
  const d = degree + steps;
  const oct = Math.floor(d / 7);
  return TONIC + 12 + oct * 12 + SCALE[((d % 7) + 7) % 7];
}

export class Composer {
  private prog: readonly Chord[] = CALM_PROGRESSIONS[0];
  private barIn = 0;
  private motif: MotifNote[];
  private bars = 0;

  constructor(private readonly rng: () => number) {
    this.motif = this.makeMotif();
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rng() * list.length)];
  }

  private makeMotif(): MotifNote[] {
    // 3 to 5 notes: a short rhythm of quarters and halves with small steps, ending on a rest or a leap
    const n = 3 + Math.floor(this.rng() * 3);
    const out: MotifNote[] = [];
    let beat = 0;
    let step = 0;
    for (let i = 0; i < n && beat < 3.5; i++) {
      const dur = this.rng() < 0.6 ? 1 : this.rng() < 0.5 ? 0.5 : 2;
      out.push({ step, beat, dur });
      beat += dur;
      const move = this.pick([-2, -1, -1, 1, 1, 2, 3]);
      step += move;
    }
    return out;
  }

  /** The next bar. `tension` 0..1 decides how dense and how dark. */
  nextBar(tension: number): BarPlan {
    if (this.barIn === 0) {
      const tense = this.rng() < tension * 0.9;
      this.prog = this.pick(tense ? TENSE_PROGRESSIONS : CALM_PROGRESSIONS);
    }
    const chord = this.prog[this.barIn];
    this.barIn = (this.barIn + 1) % this.prog.length;
    this.bars++;
    // now and then the motif itself changes a note, so long listening never loops
    if (this.bars % 8 === 0) {
      const i = Math.floor(this.rng() * this.motif.length);
      this.motif[i] = { ...this.motif[i], step: this.motif[i].step + this.pick([-2, -1, 1, 2]) };
    }
    if (this.bars % 32 === 0) this.motif = this.makeMotif();

    const melody: Note[] = [];
    const restP = 0.5 - 0.35 * tension;
    if (this.rng() >= restP) {
      const mode = this.rng();
      // anchor on a chord tone near the middle of the range
      const toneSemi = chord.root + this.pick(chord.tones);
      const anchor = fold(TONIC + 12 + toneSemi, 64, 76);
      const anchorDeg = nearestDegree(anchor);
      const base: MotifNote[] =
        mode < 0.45
          ? this.motif
          : mode < 0.7
            ? this.motif.map((m) => ({ ...m, step: -m.step })) // upside down
            : mode < 0.88
              ? this.motif.map((m, i, a) => ({ ...m, step: a[a.length - 1 - i].step })) // backwards
              : this.motif.slice(0, 2); // just the head
      for (const m of base) {
        if (m.beat >= BEATS_PER_BAR) continue;
        melody.push({
          beat: m.beat,
          midi: fold(scaleNote(anchorDeg, m.step)),
          dur: m.dur,
          vel: 0.55 + this.rng() * 0.35,
        });
      }
      // at high tension the line doubles with a quiet octave echo
      if (tension > 0.6 && this.rng() < 0.5)
        for (const m of melody.slice(0, 2))
          melody.push({ ...m, beat: m.beat + 0.5, midi: fold(m.midi + 12), vel: m.vel * 0.5 });
    }

    const bass: Note[] = [];
    const rootMidi = 36 + 2 + (chord.root % 12); // D2 and up
    bass.push({ beat: 0, midi: rootMidi, dur: 4, vel: 0.7 + this.rng() * 0.2 });
    if (tension > 0.4) {
      // an eighth-note ostinato on the root and fifth, fuller the tenser it gets
      const gate = 0.25 + 0.7 * tension;
      for (let i = 1; i < 8; i++) {
        if (this.rng() > gate) continue;
        const fifth = i % 4 === 2;
        bass.push({
          beat: i / 2,
          midi: rootMidi + (fifth ? 7 : 0) + (i === 7 ? 12 : 0),
          dur: 0.5,
          vel: 0.4 + 0.3 * tension,
        });
      }
    }
    return { chord, melody, bass };
  }
}

/** The scale degree (0..6, counted from the tonic up from D4) nearest a MIDI note. */
function nearestDegree(midi: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let d = -7; d < 14; d++) {
    const dist = Math.abs(scaleNote(d, 0) - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ playing it

const LOOKAHEAD = 1.8;
const SCHEDULER_MS = 250;

export class MusicPlayer {
  private readonly composer: Composer;
  private readonly rng: () => number;
  private timer = 0;
  private nextBar = 0;
  private target = 0;
  private cur = 0;
  private readonly padOscs: OscillatorNode[] = [];
  private readonly padGain: GainNode;
  private readonly tenseGain: GainNode;
  private readonly tenseOscs: OscillatorNode[] = [];
  private started = false;

  constructor(
    private readonly e: Engine,
    seed: number,
  ) {
    this.rng = lcg(seed);
    this.composer = new Composer(lcg(seed ^ 0x9e3779b9));
    const ctx = e.ctx;
    // calm layer: three chord tones, each two slightly detuned saws, through a slowly breathing lowpass
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 650;
    padFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoDepth.gain.value = 220;
    lfo.connect(lfoDepth).connect(padFilter.frequency);
    lfo.start();
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = i % 2 ? 7 : -7;
      o.frequency.value = midiHz(62);
      o.connect(padFilter);
      o.start();
      this.padOscs.push(o);
    }
    padFilter.connect(this.padGain).connect(e.musicIn);

    // tense layer: a pair of strings a tritone-ish apart with a trembling bow
    this.tenseGain = ctx.createGain();
    this.tenseGain.gain.value = 0;
    const tenseFilter = ctx.createBiquadFilter();
    tenseFilter.type = 'bandpass';
    tenseFilter.frequency.value = 900;
    tenseFilter.Q.value = 0.9;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const tremLfo = ctx.createOscillator();
    const tremDepth = ctx.createGain();
    tremLfo.frequency.value = 6.2;
    tremDepth.gain.value = 0.3;
    tremLfo.connect(tremDepth).connect(trem.gain);
    tremLfo.start();
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(57 + i * 6);
      o.connect(tenseFilter);
      o.start();
      this.tenseOscs.push(o);
    }
    tenseFilter.connect(trem).connect(this.tenseGain).connect(e.musicIn);
    e.musicIn.gain.setValueAtTime(0, ctx.currentTime);
    e.musicIn.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 1.5);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.nextBar = this.e.ctx.currentTime + 0.4;
    this.timer = window.setInterval(() => this.tick(), SCHEDULER_MS);
    this.tick();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.started = false;
  }

  /** Where the tension should head (0..1); the music eases there over a few seconds. */
  setTension(t: number): void {
    this.target = Math.min(1, Math.max(0, t));
  }

  /** A big stinger: the music steps back to `depth` for `sec` seconds (`at`: audio-clock time, default now). */
  duck(sec: number, depth = 0.3, at = this.e.ctx.currentTime): void {
    duckParam(this.e.musicIn.gain, at, sec, depth, 1.2);
  }

  /**
   * Offline rendering (docs samples): schedules `seconds` of music from time 0. `tension` is a
   * fixed value or a function of time (seconds), so a render can run calm to tense.
   */
  scheduleOffline(seconds: number, tension: number | ((t: number) => number)): void {
    const at = (t: number): number => (typeof tension === 'number' ? tension : tension(t));
    for (let t = 0.2; t < seconds; t += BAR_SEC) {
      const T = at(t);
      this.cur = this.target = T;
      this.padGain.gain.setTargetAtTime(0.03 * (1 - 0.45 * T), t, 0.3);
      this.tenseGain.gain.setTargetAtTime(0.085 * T * T, t, 0.3);
      this.scheduleBar(t);
    }
  }

  private tick(): void {
    const e = this.e;
    if (e.ctx.state !== 'running') {
      // while suspended the clock stands still; just keep the bar line ahead of the clock
      this.nextBar = Math.max(this.nextBar, e.ctx.currentTime + 0.2);
      return;
    }
    const now = e.ctx.currentTime;
    this.cur += (this.target - this.cur) * 0.12;
    if (this.nextBar < now - 0.3) this.nextBar = now + 0.2;
    while (this.nextBar < now + LOOKAHEAD) {
      this.scheduleBar(this.nextBar);
      this.nextBar += BAR_SEC;
    }
    const T = this.cur;
    this.padGain.gain.setTargetAtTime(0.03 * (1 - 0.45 * T), now, 1.2);
    this.tenseGain.gain.setTargetAtTime(0.085 * T * T, now, 1.2);
  }

  private scheduleBar(t0: number): void {
    const e = this.e;
    const plan = this.composer.nextBar(this.cur);
    const beat = 60 / BPM;
    // pad: glide the chord tones (root, third, fifth in two octaves' worth of voices)
    plan.chord.tones.forEach((semi, i) => {
      const f = midiHz(TONIC + 12 + plan.chord.root + semi);
      this.padOscs[i * 2].frequency.setTargetAtTime(f, t0, 0.5);
      this.padOscs[i * 2 + 1].frequency.setTargetAtTime(f, t0, 0.5);
    });
    const low = midiHz(TONIC + plan.chord.root);
    this.tenseOscs[0].frequency.setTargetAtTime(low * 1.5, t0, 0.6);
    this.tenseOscs[1].frequency.setTargetAtTime(low * 1.5 * Math.pow(2, 6 / 12), t0, 0.6);
    for (const n of plan.melody) {
      const pan = (this.rng() - 0.5) * 0.7;
      pluck(e, t0 + n.beat * beat, midiHz(n.midi), 0.1 * n.vel, 1.5, 0.45, e.musicIn, pan);
    }
    for (const n of plan.bass)
      pluck(
        e,
        t0 + n.beat * beat,
        midiHz(n.midi),
        0.1 * n.vel,
        n.dur > 1 ? 2.2 : 0.7,
        1,
        e.musicIn,
      );
  }
}
