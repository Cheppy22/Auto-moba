import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/sim';
import {
  CUES,
  CUE_INFO,
  SCHOOL_CUE,
  Throttle,
  commandCue,
  eventCues,
  roundCue,
  tapCue,
  type EventLookup,
} from '../src/ui/audio/cues';
import { VOICES } from '../src/ui/audio/cueSynth';
import { Heat, heatOf, moodFor, type MoodInput } from '../src/ui/audio/mood';
import {
  BUSES,
  DEFAULT_VOLUME,
  busGain,
  loadMixer,
  parseVolumes,
  saveMixer,
  sliderToGain,
} from '../src/ui/audio/mixer';
import { BAR_SEC, Composer, fold } from '../src/ui/audio/music';
import { lcg } from '../src/ui/audio/synth';
import { play, unlock } from '../src/ui/sound';
import { SCHOOL_ORDER } from '../src/ui/schools';

const ev = (type: string, payload: Record<string, unknown>): GameEvent =>
  ({ tick: 1, seq: 1, type, payload }) as unknown as GameEvent;

const look: EventLookup = {
  heroTeam: (id) => (id === 1 ? 'A' : id === 2 ? 'B' : undefined),
  school: (c) => (c === 'advance' ? 'march' : undefined),
  speed: 1,
};

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('the cue set', () => {
  it('has more than 20 cues, each with a description and a sound', () => {
    expect(CUES.length).toBeGreaterThanOrEqual(20);
    for (const c of CUES) {
      expect(CUE_INFO[c].desc.length).toBeGreaterThan(10);
      expect(typeof VOICES[c]).toBe('function');
    }
    expect(Object.keys(VOICES).sort()).toEqual([...CUES].sort());
  });

  it('gives every gambit school its own cue', () => {
    const cues = SCHOOL_ORDER.map((s) => SCHOOL_CUE[s]);
    expect(new Set(cues).size).toBe(SCHOOL_ORDER.length);
  });
});

describe('which sim events make which cue', () => {
  it('tolls the bell only while tolling, with the toll number', () => {
    expect(eventCues(ev('bell', { stage: 'tolling', toll: 2, act: 1 }), look)).toEqual([
      { cue: 'toll', opts: { n: 2 } },
    ]);
    expect(eventCues(ev('bell', { stage: 'halt', act: 1 }), look)).toEqual([]);
  });

  it('a capture clacks, your own fall knocks, pawns are silent, fast speed is quiet', () => {
    const death = (id: number) => ev('death', { id, kind: 'hero', team: 'A' });
    expect(eventCues(death(2), look)[0].cue).toBe('clack');
    expect(eventCues(death(1), look)[0].cue).toBe('fall');
    expect(eventCues(death(99), look)).toEqual([]);
    expect(eventCues(death(2), { ...look, speed: 4 })).toEqual([]);
  });

  it('rank ups: small by default, big at 4 and 8, only for White', () => {
    const up = (id: number, rank: number) => ev('rankUp', { id, rank, bonus: '' });
    expect(eventCues(up(1, 2), look)[0].cue).toBe('rank');
    expect(eventCues(up(1, 4), look)[0].cue).toBe('rankBig');
    expect(eventCues(up(1, 8), look)[0].cue).toBe('rankBig');
    expect(eventCues(up(2, 4), look)).toEqual([]);
  });

  it('Check, Throne and Checkmate', () => {
    expect(eventCues(ev('check', { team: 'A' }), look)[0].cue).toBe('check');
    expect(eventCues(ev('throneDown', { team: 'B' }), look)[0].cue).toBe('throneDown');
    expect(eventCues(ev('checkmate', { winner: 'A' }), look)[0].cue).toBe('checkmateWin');
    expect(eventCues(ev('checkmate', { winner: 'B' }), look)[0].cue).toBe('checkmateLoss');
    expect(eventCues(ev('matchEnd', { winner: 'A', phase: 3 }), look)).toEqual([]);
    expect(
      eventCues(ev('matchEnd', { winner: 'B', phase: 8, adjudicated: true }), look)[0].cue,
    ).toBe('checkmateLoss');
  });

  it('a Bastion falling and a Throne being hit', () => {
    expect(eventCues(ev('structureDown', { kind: 'tower', team: 'B' }), look)).toEqual([
      { cue: 'bastion', opts: { team: 'B' } },
    ]);
    expect(eventCues(ev('structureDown', { kind: 'guardian', team: 'B' }), look)).toEqual([]);
    expect(eventCues(ev('damage', { tgtKind: 'guardian', amount: 40 }), look)[0].cue).toBe(
      'throneHit',
    );
    expect(eventCues(ev('damage', { tgtKind: 'hero', amount: 40 }), look)).toEqual([]);
  });

  it('a gambit sounds its school; Black plays it darker; unknown cards fall back to a thud', () => {
    expect(eventCues(ev('gambit', { team: 'A', cardId: 'advance' }), look)).toEqual([
      { cue: 'march', opts: { dark: false } },
    ]);
    expect(eventCues(ev('gambit', { team: 'B', cardId: 'advance' }), look)).toEqual([
      { cue: 'march', opts: { dark: true } },
    ]);
    expect(eventCues(ev('gambit', { team: 'A', cardId: 'mystery' }), look)[0].cue).toBe('thud');
  });

  it('new Acts after the first swell; Sealed Moves click only when they fire for White', () => {
    expect(eventCues(ev('phaseStart', { phase: 1, kind: 'live' }), look)).toEqual([]);
    expect(eventCues(ev('phaseStart', { phase: 3, kind: 'live' }), look)[0].cue).toBe('actStart');
    expect(
      eventCues(ev('sealedMove', { team: 'A', card: 'x', trigger: 't', outcome: 'fired' }), look)[0]
        .cue,
    ).toBe('seal');
    expect(
      eventCues(ev('sealedMove', { team: 'A', card: 'x', trigger: 't', outcome: 'lapsed' }), look),
    ).toEqual([]);
  });

  it('commands, taps and round results', () => {
    expect(commandCue('buy')).toBe('buy');
    expect(commandCue('sell')).toBe('sell');
    expect(commandCue('pickRelic')).toBe('relic');
    expect(commandCue('setLane')).toBeNull();
    expect(tapCue(true)).toBe('tab');
    expect(tapCue(false)).toBe('tap');
    expect(roundCue('A')).toBe('roundWin');
    expect(roundCue('B')).toBe('roundLoss');
    expect(roundCue(null)).toBe('roundLoss');
  });

  it('the cooldown stops a cue from stacking', () => {
    const t = new Throttle();
    expect(t.allow('clack', 1000)).toBe(true);
    expect(t.allow('clack', 1050)).toBe(false);
    expect(t.allow('clack', 1100)).toBe(true);
    expect(t.allow('toll', 1100)).toBe(true);
    expect(t.allow('toll', 1101)).toBe(true);
  });
});

describe('the mixer', () => {
  it('starts from the defaults and reads damaged storage safely', () => {
    expect(parseVolumes(null)).toEqual(DEFAULT_VOLUME);
    expect(parseVolumes('not json')).toEqual(DEFAULT_VOLUME);
    expect(parseVolumes('{"music":5,"master":"x","effects":-2}')).toEqual({
      ...DEFAULT_VOLUME,
      music: 1,
      effects: 0,
    });
  });

  it('saves and loads volumes and the mute switch (old key kept)', () => {
    const store = memoryStore();
    saveMixer(
      { volume: { master: 0.3, music: 0.2, ambience: 0.1, effects: 0.9 }, muted: true },
      store,
    );
    expect(store.data.get('automoba.sound')).toBe('off');
    const back = loadMixer(store);
    expect(back.muted).toBe(true);
    expect(back.volume).toEqual({ master: 0.3, music: 0.2, ambience: 0.1, effects: 0.9 });
    expect(loadMixer(null)).toEqual({ volume: DEFAULT_VOLUME, muted: false });
  });

  it('mutes every bus and keeps loudness in order', () => {
    const s = { volume: { ...DEFAULT_VOLUME }, muted: false };
    for (const b of BUSES) expect(busGain(s, b)).toBeCloseTo(sliderToGain(DEFAULT_VOLUME[b]));
    for (const b of BUSES) expect(busGain({ ...s, muted: true }, b)).toBe(0);
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(0.5)).toBeLessThan(0.5);
    expect(sliderToGain(7)).toBe(1);
  });

  it('never throws when there is no audio (headless)', () => {
    expect(() => unlock()).not.toThrow();
    expect(() => play('toll', { n: 3 })).not.toThrow();
    expect(() => play('clock', { dark: true })).not.toThrow();
  });
});

describe('the music composer', () => {
  const bars = (seed: number, tension: number, n = 64) => {
    const c = new Composer(lcg(seed));
    return Array.from({ length: n }, () => c.nextBar(tension));
  };

  it('is deterministic for a seed and differs between seeds', () => {
    expect(bars(5, 0.3)).toEqual(bars(5, 0.3));
    expect(bars(5, 0.3)).not.toEqual(bars(6, 0.3));
  });

  it('keeps notes inside the melody range and inside the bar', () => {
    for (const plan of bars(11, 0.9, 200))
      for (const n of plan.melody) {
        expect(n.midi).toBeGreaterThanOrEqual(62);
        expect(n.midi).toBeLessThanOrEqual(86);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(5);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
      }
    expect(fold(20)).toBeGreaterThanOrEqual(62);
    expect(fold(120)).toBeLessThanOrEqual(86);
  });

  it('is sparse when calm and fuller when tense', () => {
    const notes = (t: number) =>
      bars(21, t, 300).reduce((a, p) => a + p.melody.length + p.bass.length, 0);
    const rests = (t: number) => bars(21, t, 300).filter((p) => p.melody.length === 0).length;
    expect(notes(0.9)).toBeGreaterThan(notes(0) * 1.4);
    expect(rests(0)).toBeGreaterThan(rests(1));
    // calm bars still often rest, so the bed breathes
    expect(rests(0)).toBeGreaterThan(60);
  });

  it('does not loop: many different bars over a long listen', () => {
    const sig = bars(3, 0.4, 120).map((p) => p.melody.map((n) => `${n.beat}:${n.midi}`).join(','));
    expect(new Set(sig).size).toBeGreaterThan(25);
  });

  it('a bar is a few seconds long', () => {
    expect(BAR_SEC).toBeGreaterThan(2);
    expect(BAR_SEC).toBeLessThan(6);
  });
});

describe('the mood', () => {
  const base: MoodInput = {
    screen: 'live',
    act: 1,
    endgameAct: 7,
    heat: 0,
    check: false,
    throneDown: false,
  };

  it('is calm on menus, setup and the report', () => {
    for (const screen of ['menu', 'setup', 'end'] as const)
      expect(moodFor({ ...base, screen, act: 0 })).toEqual({ tension: 0, intensity: 0 });
    expect(moodFor({ ...base, screen: 'break' }).tension).toBeLessThan(0.2);
  });

  it('rises with the Act, a big fight, Check and the Endgame, and stays within 0..1', () => {
    const t = (o: Partial<MoodInput>) => moodFor({ ...base, ...o }).tension;
    expect(t({ act: 4 })).toBeGreaterThan(t({ act: 1 }));
    expect(t({ heat: 0.8 })).toBeGreaterThan(t({}));
    expect(t({ check: true })).toBeGreaterThan(t({}));
    expect(t({ act: 7 })).toBeGreaterThan(t({ act: 6 }) + 0.2);
    const top = moodFor({ ...base, act: 9, heat: 1.2, check: true, throneDown: true });
    expect(top.tension).toBe(1);
    expect(top.intensity).toBeLessThanOrEqual(1);
    expect(moodFor({ ...base, heat: 0.9 }).intensity).toBeGreaterThan(0.5);
  });

  it('heat builds from fighting and fades with time', () => {
    const h = new Heat(6000);
    expect(h.read(0)).toBe(0);
    for (let i = 0; i < 10; i++) h.bump(0.1, 1000);
    expect(h.read(1000)).toBeCloseTo(1, 1);
    expect(h.read(1000 + 6000)).toBeCloseTo(Math.exp(-1), 1);
    expect(h.read(1000 + 60000)).toBeLessThan(0.01);
    expect(heatOf(ev('death', { kind: 'hero' }))).toBeGreaterThan(0);
    expect(heatOf(ev('death', { kind: 'minion' }))).toBe(0);
    expect(heatOf(ev('gold', {}))).toBe(0);
  });
});
