import { describe, expect, it } from 'vitest';
import { contentFor, Match, newRun, nextMatchConfig } from '../src/sim';
import { content, liveMatch, logHash } from './helpers';

const B = content.tuning.blitz;
const blitz = (seed: number): Match => liveMatch(seed, { map: 'long', pace: 'blitz' });

describe('Blitz pace', () => {
  it('changes only the Act cap and length, the Endgame Act and Throne health; Classical is the same object', () => {
    expect(contentFor(content, undefined)).toBe(content);
    expect(contentFor(content, undefined, 'classical')).toBe(content);
    const long = contentFor(content, 'long');
    const fast = contentFor(content, 'long', 'blitz');
    expect(fast.tuning.maxPhases).toBe(B.maxActs);
    expect(fast.tuning.guardian.hp).toBe(B.throneHp);
    expect(fast.tuning.phaseSeconds).toBe(B.actSec);
    expect(long.tuning.phaseSeconds).toBe(content.longBoard!.tuning.phaseSeconds);
    expect(fast.pressure.find((e) => e.rules.includes('endgame'))!.fromPhase).toBe(B.endgameAct);
    expect(long.pressure.find((e) => e.rules.includes('endgame'))!.fromPhase).toBe(7);
    expect(long.tuning.guardian.hp).toBe(content.tuning.guardian.hp);
  });

  it('starts Thrones at 3000 and marks the state; Classical state has no pace', () => {
    const m = blitz(4);
    expect(m.state.pace).toBe('blitz');
    for (const team of ['A', 'B'] as const) {
      const g = m.unitById(m.state.teams[team].guardianId) ?? m.ctx.guardians[team]!;
      expect(g.stats.maxHp).toBe(B.throneHp);
    }
    expect(liveMatch(4, { map: 'long' }).state.pace).toBeUndefined();
  });

  it('adjudicates when Act 3 ends without Checkmate', () => {
    const m = blitz(9);
    // jump to the last Act (as tests/phases.test.ts does) so the test stays short
    m.state.phase.n = B.maxActs;
    m.runToEnd();
    const end = m.events.find((e) => e.type === 'matchEnd');
    expect(end).toBeDefined();
    expect(m.state.phase.n).toBeLessThanOrEqual(B.maxActs);
    if (end?.type === 'matchEnd' && !m.events.some((e) => e.type === 'checkmate'))
      expect(end.payload.adjudicated).toBe(true);
  });

  it('a whole Blitz match is deterministic, lasts at most 3 Acts and has the Endgame from Act 3', () => {
    const a = blitz(17);
    a.runToEnd();
    const b = blitz(17);
    b.runToEnd();
    expect(logHash(a)).toBe(logHash(b));
    expect(a.state.phase.kind).toBe('end');
    expect(a.state.phase.n).toBeLessThanOrEqual(B.maxActs);
    expect(a.events.some((e) => e.type === 'pressure' && e.payload.event === 'endgame')).toBe(
      a.state.phase.n >= B.endgameAct,
    );
    const replay = Match.fromReplay(content, JSON.parse(JSON.stringify(a.exportReplay())));
    expect(logHash(replay)).toBe(logHash(a));
  });

  it('a Blitz run plays every match at Blitz', () => {
    const run = newRun(content, 5, 'blitz');
    expect(nextMatchConfig(content, run).pace).toBe('blitz');
    expect(nextMatchConfig(content, newRun(content, 5)).pace).toBeUndefined();
  });
});
