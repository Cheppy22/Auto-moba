import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { tickBell } from '../src/sim/bell';
import { formationError } from '../src/sim/relics';
import { content, liveMatch, logHash, piece, toAct, toBell } from './helpers';

const TPS = content.tuning.tickRate;
const bell = content.tuning.bell;

const bellStages = (m: Match): string[] =>
  m.events
    .filter((e) => e.type === 'bell')
    .map((e) => (e.type === 'bell' ? `${e.payload.stage}${e.payload.toll ?? ''}` : ''));

const laneCounts = (m: Match, team: 'A' | 'B'): string =>
  ['top', 'mid', 'bot']
    .map((l) => m.state.teams[team].heroIds.filter((id) => m.unitById(id)!.hero!.lane === l).length)
    .join('/');

function playToResume(seed: number): Match {
  const m = liveMatch(seed, { pauseForBreak: true, relics: { A: 'ai' } });
  for (let i = 0; i < 2; i++) {
    toBell(m, 'break');
    m.issue({ type: 'resumeAct' });
  }
  m.step(400);
  return m;
}

describe('the Act break', () => {
  it('waits, tolls three times, halts, freezes on the sheet, and resumes into a full next Act', () => {
    const m = liveMatch(7, { pauseForBreak: true });
    toBell(m, 'break');
    expect(bellStages(m)).toEqual([
      'pending',
      'tolling1',
      'tolling2',
      'tolling3',
      'halt3',
      'break',
    ]);
    const snap = m.snapshot();
    expect(snap.act).toMatchObject({ n: 1, bell: 'break', remainingSec: 0, haltProgress: 1 });
    expect(snap.act.report?.act).toBe(1);
    expect(m.state.phase.n).toBe(1);

    const frozenAt = m.state.tick;
    const spots = m.state.units.map((u) => [u.x, u.y]);
    expect(m.step(40)).toBe(0);
    expect(m.state.tick).toBe(frozenAt);
    expect(m.state.units.map((u) => [u.x, u.y])).toEqual(spots);
    expect(m.snapshot().hand.every((h) => !h.usable)).toBe(true);
    expect(m.issue({ type: 'playGambit', slot: 0 }).ok).toBe(false);
    expect(m.issue({ type: 'fieldPawn', lane: 'top' }).ok).toBe(false);
    expect(m.events.filter((e) => e.type === 'phaseEnd')).toHaveLength(1);
    expect(m.events.filter((e) => e.type === 'phaseStart')).toHaveLength(1);

    expect(m.issue({ type: 'resumeAct' }).reason).toMatch(/relic/);
    expect(m.issue({ type: 'autoRelic' }).ok).toBe(true);
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(false);
    expect(m.state.phase).toMatchObject({ kind: 'live', n: 2, startTick: frozenAt });
    expect(m.snapshot().act).toMatchObject({ n: 2, bell: 'none', remainingSec: 240 });
    expect(m.state.actTally.waves).toBe(0);
    m.step(Math.round(bell.resumeWaveSec * TPS) + 2);
    expect(m.state.actTally.waves).toBe(1);
  });

  it('waits for calm up to the cap, then tolls anyway; a calm board tolls after calmSec', () => {
    const cap = liveMatch(3, { pauseForBreak: true });
    toBell(cap, 'pending');
    const start = cap.state.tick;
    while (cap.state.bell.stage === 'pending') {
      piece(cap, 'A', 'queen').lastDamagedTick = cap.state.tick;
      cap.step(1);
    }
    expect(cap.state.bell.stage).toBe('tolling');
    expect(cap.state.tick - start).toBe(bell.capSec * TPS);

    const calm = liveMatch(3, { pauseForBreak: true });
    toBell(calm, 'pending');
    for (const team of ['A', 'B'] as const)
      for (const id of calm.state.teams[team].heroIds) {
        const u = calm.unitById(id)!;
        u.lastDamagedTick = -9999;
        u.hero!.lastDealtTick = -9999;
      }
    let ticks = 0;
    while (calm.state.bell.stage === 'pending') {
      tickBell(calm.ctx);
      ticks++;
    }
    expect(ticks).toBe(bell.calmSec * TPS);
  });

  it('is deterministic with the sheet, replays exactly, and keeps lanes 2/2/1 (3/1/1 with Battery) after AI re-plans', () => {
    const a = playToResume(5);
    expect(logHash(playToResume(5))).toBe(logHash(a));
    const again = Match.fromReplay(content, JSON.parse(JSON.stringify(a.exportReplay())));
    expect(logHash(again)).toBe(logHash(a));

    for (const seed of [1, 2, 3, 4]) {
      const m = liveMatch(seed);
      toAct(m, 4);
      for (const team of ['A', 'B'] as const) {
        expect(formationError(m.ctx, team)).toBeNull();
        if (!m.state.relics.held[team].some((h) => h.id === 'battery'))
          expect(laneCounts(m, team)).toBe('2/1/2');
      }
    }
  });
});
