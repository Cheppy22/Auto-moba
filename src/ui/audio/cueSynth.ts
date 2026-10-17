/**
 * How each cue sounds. Every cue is a few short oscillator and noise voices from `synth.ts`;
 * `t` is when it starts (audio-clock seconds). Wood, brass, glass and stone: the chess room.
 */
import { CUE_TRIM, type Cue, type CueOpts } from './cues';
import { bell, burst, tone, type BurstSpec, type Engine, type ToneSpec } from './synth';

type Voice = (e: Engine, t: number, o: CueOpts) => void;

/** A note with its pitch and loudness scaled (Black's gambits play lower and quieter). */
function kit(e: Engine, t: number, pitch: number, gain: number) {
  return {
    tone(s: Omit<ToneSpec, 'start'> & { at?: number }): void {
      const { at, ...rest } = s;
      tone(e, {
        ...rest,
        from: s.from * pitch,
        to: s.to === undefined ? undefined : s.to * pitch,
        peak: s.peak * gain,
        start: t + (at ?? 0),
      });
    },
    burst(s: Omit<BurstSpec, 'start'> & { at?: number }): void {
      const { at, ...rest } = s;
      burst(e, { ...rest, peak: s.peak * gain, start: t + (at ?? 0) });
    },
    bell(at: number, f: number, amp: number, ring = 1, bright = 1): void {
      bell(e, t + at, f * pitch, amp * gain, ring, bright);
    },
  };
}

const toll: Voice = (e, t, o) => {
  const level = 0.5 + 0.25 * Math.min(3, Math.max(1, o.n ?? 1));
  bell(e, t, 174, 0.34 * level);
  burst(e, {
    kind: 'bandpass',
    freq: 900,
    q: 0.8,
    start: t,
    decay: 0.06,
    peak: 0.12 * level,
    priority: true,
  });
};

const tick: Voice = (e, t, o) => {
  const k = o.k ?? 0;
  const f = (o.n ?? 0) % 2 ? 1500 : 1250;
  tone(e, { from: f, to: f * 0.9, start: t, decay: 0.04, peak: 0.05 + 0.04 * k });
  burst(e, { kind: 'bandpass', freq: 3200, q: 2, start: t, decay: 0.02, peak: 0.03 + 0.02 * k });
};

/** Capture: a piece set down hard on a board. */
const clack: Voice = (e, t, o) => {
  const base = o.team === 'B' ? 880 : 1040;
  tone(e, { from: base, to: base * 0.38, start: t, decay: 0.1, peak: 0.22 });
  tone(e, {
    type: 'triangle',
    from: base * 1.9,
    to: base * 0.8,
    start: t,
    decay: 0.04,
    peak: 0.07,
  });
  burst(e, { kind: 'bandpass', freq: 2200, q: 1.4, start: t, decay: 0.04, peak: 0.14 });
};

/** Your piece falls: lower and duller than a capture, with a short hollow knock. */
const fall: Voice = (e, t) => {
  tone(e, { from: 520, to: 190, start: t, decay: 0.16, peak: 0.2 });
  tone(e, { type: 'triangle', from: 260, to: 120, start: t + 0.05, decay: 0.2, peak: 0.1 });
  burst(e, { kind: 'lowpass', freq: 900, q: 0.8, start: t, decay: 0.06, peak: 0.12 });
};

const chime: Voice = (e, t) => {
  for (const [f, at, amp] of [
    [784, 0, 0.16],
    [1175, 0.09, 0.14],
    [1568, 0.09, 0.07],
  ] as const)
    tone(e, { from: f, start: t + at, decay: 1.3, peak: amp });
};

const thud: Voice = (e, t) => {
  tone(e, { from: 150, to: 52, start: t, decay: 0.24, peak: 0.42 });
  burst(e, { kind: 'lowpass', freq: 320, q: 0.7, start: t, decay: 0.12, peak: 0.2 });
};

const tap: Voice = (e, t) => {
  tone(e, { type: 'triangle', from: 1000, to: 780, start: t, decay: 0.03, peak: 0.07 });
};

const tab: Voice = (e, t) => {
  tone(e, { type: 'triangle', from: 720, to: 640, start: t, decay: 0.035, peak: 0.05 });
  tone(e, { type: 'triangle', from: 1010, to: 900, start: t + 0.045, decay: 0.04, peak: 0.055 });
};

const deny: Voice = (e, t) => {
  tone(e, { type: 'triangle', from: 230, to: 160, start: t, decay: 0.07, peak: 0.13 });
  tone(e, { type: 'triangle', from: 210, to: 140, start: t + 0.1, decay: 0.09, peak: 0.12 });
  burst(e, { kind: 'lowpass', freq: 500, q: 0.7, start: t, decay: 0.05, peak: 0.07 });
};

/** Check: two close pings, a minor second apart; lower and gloomier when it is your King. */
const check: Voice = (e, t, o) => {
  const [a, b] = o.team === 'A' ? [622, 659] : [988, 1047];
  bell(e, t, a, 0.14, 0.5, 0.6);
  bell(e, t + 0.17, b, 0.16, 0.6, 0.6);
};

const checkmateWin: Voice = (e, t) => {
  [293.66, 369.99, 440, 587.33].forEach((f, i) =>
    tone(e, {
      type: 'triangle',
      from: f,
      start: t + i * 0.11,
      decay: 0.7,
      peak: 0.1,
      priority: true,
    }),
  );
  [293.66, 440, 587.33, 739.99].forEach((f) =>
    tone(e, {
      type: 'triangle',
      from: f,
      start: t + 0.5,
      decay: 2.2,
      peak: 0.09,
      attack: 0.03,
      priority: true,
    }),
  );
  bell(e, t + 0.5, 587.33, 0.2, 1, 1);
  burst(e, { kind: 'bandpass', freq: 3000, q: 0.8, start: t + 0.5, decay: 0.1, peak: 0.06 });
};

const checkmateLoss: Voice = (e, t) => {
  [293.66, 220, 174.61, 146.83].forEach((f, i) =>
    tone(e, {
      type: 'triangle',
      from: f,
      start: t + i * 0.22,
      decay: 1.2,
      peak: 0.1,
      priority: true,
    }),
  );
  [146.83, 174.61, 220].forEach((f) =>
    tone(e, {
      type: 'sine',
      from: f,
      start: t + 0.9,
      decay: 2.6,
      peak: 0.1,
      attack: 0.05,
      priority: true,
    }),
  );
  bell(e, t + 0.4, 98, 0.32, 1.6, 0.5);
  burst(e, {
    kind: 'lowpass',
    freq: 220,
    q: 0.8,
    start: t + 0.4,
    decay: 1.8,
    peak: 0.2,
    attack: 0.1,
  });
};

const throneDown: Voice = (e, t) => {
  bell(e, t, 82.4, 0.45, 1.8, 0.5);
  tone(e, { from: 62, to: 30, start: t, decay: 1.1, peak: 0.5, priority: true });
  burst(e, {
    kind: 'lowpass',
    freq: 420,
    q: 0.7,
    sweepTo: 80,
    start: t,
    decay: 1.3,
    peak: 0.3,
    priority: true,
  });
  burst(e, { kind: 'highpass', freq: 2500, q: 0.7, start: t, decay: 0.08, peak: 0.28 });
};

/** A faint heavy thump; it only has to say "something big is being hit". */
const throneHit: Voice = (e, t) => {
  tone(e, { from: 90, to: 45, start: t, decay: 0.22, peak: 0.1 });
  burst(e, { kind: 'lowpass', freq: 180, q: 0.7, start: t, decay: 0.15, peak: 0.07 });
};

const bastion: Voice = (e, t, o) => {
  burst(e, { kind: 'bandpass', freq: 700, q: 0.8, sweepTo: 250, start: t, decay: 0.8, peak: 0.28 });
  for (const at of [0.05, 0.12, 0.2, 0.33, 0.47])
    burst(e, {
      kind: 'highpass',
      freq: 1800 + at * 2400,
      q: 0.7,
      start: t + at,
      decay: 0.03,
      peak: 0.1,
    });
  tone(e, { from: 112, to: 44, start: t, decay: 0.65, peak: 0.42 });
  // theirs falling is a small reward; yours is a low, minor knell
  if (o.team === 'B') {
    bell(e, t + 0.38, 659, 0.07, 0.6);
    bell(e, t + 0.5, 988, 0.05, 0.5);
  } else bell(e, t + 0.3, 98, 0.12, 0.8, 0.4);
};

const rank: Voice = (e, t) => {
  [880, 1175, 1480].forEach((f, i) =>
    tone(e, { from: f, start: t + i * 0.06, decay: 0.5, peak: 0.07 }),
  );
};

const rankBig: Voice = (e, t) => {
  bell(e, t, 523.25, 0.16, 0.9);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(e, { from: f, start: t + i * 0.04, decay: 1.5, peak: 0.08, attack: 0.01 }),
  );
  tone(e, { from: 2093, start: t + 0.1, decay: 1.2, peak: 0.03 });
  tone(e, { from: 2637, start: t + 0.18, decay: 1.2, peak: 0.025 });
};

const relic: Voice = (e, t) => {
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    tone(e, { from: f, start: t + i * 0.07, decay: i === 3 ? 1.4 : 0.9, peak: 0.08 });
    tone(e, { type: 'triangle', from: f * 2, start: t + i * 0.07, decay: 0.25, peak: 0.015 });
  });
  bell(e, t + 0.2, 1568, 0.05, 0.6);
};

const buy: Voice = (e, t) => {
  tone(e, { from: 2200, to: 2180, start: t, decay: 0.25, peak: 0.08 });
  tone(e, { from: 3300, to: 3280, start: t + 0.07, decay: 0.3, peak: 0.06 });
  burst(e, { kind: 'bandpass', freq: 6000, q: 2, start: t, decay: 0.02, peak: 0.04 });
};

const sell: Voice = (e, t) => {
  tone(e, { from: 3000, to: 2900, start: t, decay: 0.22, peak: 0.06 });
  tone(e, { from: 2100, to: 1900, start: t + 0.07, decay: 0.3, peak: 0.07 });
  burst(e, { kind: 'bandpass', freq: 5000, q: 2, start: t + 0.07, decay: 0.02, peak: 0.035 });
};

const spoils: Voice = (e, t) => {
  [261.63, 329.63, 392, 523.25].forEach((f, i) =>
    tone(e, {
      type: i % 2 ? 'triangle' : 'sine',
      from: f,
      start: t + i * 0.03,
      decay: 1.7,
      peak: 0.08,
      attack: 0.03,
    }),
  );
  bell(e, t + 0.06, 784, 0.06, 0.6);
};

const roundWin: Voice = (e, t) => {
  for (const [f, at, dur] of [
    [392, 0, 0.3],
    [392, 0.15, 0.3],
    [523.25, 0.3, 0.5],
    [659.25, 0.62, 1.8],
  ] as const) {
    tone(e, {
      type: 'triangle',
      from: f,
      start: t + at,
      decay: dur,
      peak: 0.1,
      attack: 0.012,
      priority: true,
    });
    tone(e, { type: 'sawtooth', from: f, start: t + at, decay: dur, peak: 0.018, attack: 0.02 });
  }
  [261.63, 329.63, 392].forEach((f) =>
    tone(e, { from: f, start: t + 0.62, decay: 2, peak: 0.07, attack: 0.04 }),
  );
  bell(e, t + 0.62, 1318.5, 0.05, 0.7);
};

const roundLoss: Voice = (e, t) => {
  [392, 349.23, 293.66, 220].forEach((f, i) =>
    tone(e, {
      type: 'triangle',
      from: f,
      start: t + i * 0.42,
      decay: 1.0 + i * 0.3,
      peak: 0.1,
      priority: true,
    }),
  );
  bell(e, t + 1.26, 110, 0.18, 1.3, 0.4);
};

const eye: Voice = (e, t) => {
  tone(e, { from: 2637, start: t, decay: 0.25, peak: 0.012, attack: 0.01 });
  tone(e, { from: 3136, start: t + 0.06, decay: 0.3, peak: 0.008, attack: 0.01 });
};

const actStart: Voice = (e, t) => {
  tone(e, { from: 98, start: t, decay: 2.4, peak: 0.12, attack: 0.6 });
  tone(e, { from: 147, start: t + 0.1, decay: 2.2, peak: 0.07, attack: 0.6 });
  burst(e, { kind: 'bandpass', freq: 500, q: 1.2, start: t + 0.55, decay: 0.08, peak: 0.12 });
};

const seal: Voice = (e, t) => {
  burst(e, { kind: 'lowpass', freq: 400, q: 0.7, start: t, decay: 0.1, peak: 0.15 });
  tone(e, { type: 'triangle', from: 1800, to: 900, start: t + 0.06, decay: 0.03, peak: 0.08 });
  tone(e, { from: 1568, start: t + 0.1, decay: 0.6, peak: 0.04 });
};

// ---- the six gambit schools (Black's plays use the same sound, lower and quieter)

const school =
  (voice: (k: ReturnType<typeof kit>) => void): Voice =>
  (e, t, o) =>
    voice(kit(e, t, o.dark ? 0.82 : 1, o.dark ? 0.65 : 1));

/** March: two drum beats and a rising fifth. */
const march = school((k) => {
  for (const at of [0, 0.13]) {
    k.tone({ from: 140, to: 70, decay: 0.16, peak: 0.3, at });
    k.burst({ kind: 'bandpass', freq: 1800, q: 1, decay: 0.05, peak: 0.12, at });
  }
  k.tone({ type: 'triangle', from: 330, decay: 0.5, peak: 0.07, at: 0.26 });
  k.tone({ type: 'triangle', from: 495, decay: 0.5, peak: 0.06, at: 0.3 });
});

/** Initiative: a sharp rapier zing. */
const initiative = school((k) => {
  k.tone({ from: 1800, to: 4200, decay: 0.22, peak: 0.07 });
  k.tone({ type: 'triangle', from: 2400, to: 5200, decay: 0.18, peak: 0.04 });
  k.burst({ kind: 'highpass', freq: 5000, q: 0.7, decay: 0.06, peak: 0.08 });
  k.tone({ from: 3136, decay: 0.4, peak: 0.04, at: 0.15 });
});

/** Fortress: a stone slam and a low metal ring. */
const fortress = school((k) => {
  k.tone({ from: 90, to: 50, decay: 0.4, peak: 0.38 });
  k.burst({ kind: 'lowpass', freq: 300, q: 0.7, decay: 0.2, peak: 0.3 });
  k.bell(0.02, 196, 0.1, 0.5, 0.3);
});

/** Sacrifice: a dark falling bell and a whisper. */
const sacrifice = school((k) => {
  k.bell(0, 311, 0.13, 1);
  k.tone({ from: 311, to: 233, decay: 1.2, peak: 0.06, at: 0.15 });
  k.tone({ from: 262, decay: 0.9, peak: 0.05, at: 0.2 });
  k.burst({ kind: 'bandpass', freq: 1200, q: 3, decay: 0.6, peak: 0.03, attack: 0.15 });
});

/** Position: a soft wooden slide that ends in a knock. */
const position = school((k) => {
  k.burst({
    kind: 'bandpass',
    freq: 400,
    q: 4,
    sweepTo: 1400,
    decay: 0.45,
    peak: 0.06,
    attack: 0.12,
  });
  k.tone({ type: 'triangle', from: 330, to: 440, decay: 0.5, peak: 0.06, attack: 0.05 });
  k.tone({ from: 600, to: 300, decay: 0.06, peak: 0.12, at: 0.4 });
});

/** Clock: a quick double tick and a small chime. */
const clock = school((k) => {
  k.tone({ from: 1500, to: 1400, decay: 0.04, peak: 0.07 });
  k.tone({ from: 1250, to: 1150, decay: 0.04, peak: 0.07, at: 0.1 });
  k.tone({ from: 2093, decay: 0.6, peak: 0.06, at: 0.2 });
  k.tone({ from: 2637, decay: 0.6, peak: 0.03, at: 0.28 });
});

export const VOICES: Record<Cue, Voice> = {
  toll,
  tick,
  clack,
  fall,
  chime,
  thud,
  tap,
  tab,
  deny,
  check,
  checkmateWin,
  checkmateLoss,
  throneDown,
  throneHit,
  bastion,
  rank,
  rankBig,
  relic,
  buy,
  sell,
  spoils,
  roundWin,
  roundLoss,
  eye,
  actStart,
  seal,
  march,
  initiative,
  fortress,
  sacrifice,
  position,
  clock,
};

const trims = new WeakMap<Engine, Map<Cue, GainNode>>();

/** Sounds one cue on an engine at audio-clock time `t`, through its own level trim. */
export function voiceCue(e: Engine, cue: Cue, t: number, opts: CueOpts): void {
  const gain = CUE_TRIM[cue] ?? 1;
  let dest: AudioNode = e.fx;
  if (gain !== 1) {
    let map = trims.get(e);
    if (!map) trims.set(e, (map = new Map()));
    let node = map.get(cue);
    if (!node) {
      node = e.ctx.createGain();
      node.gain.value = gain;
      node.connect(e.fx);
      map.set(cue, node);
    }
    dest = node;
  }
  e.cueDest = dest;
  try {
    VOICES[cue](e, t, opts);
  } finally {
    e.cueDest = e.fx;
  }
}
