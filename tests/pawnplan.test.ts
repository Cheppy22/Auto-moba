import { describe, expect, it } from 'vitest';
import { content, liveMatch } from './helpers';

const TPS = content.tuning.tickRate;

const pawnsIn = (m: ReturnType<typeof liveMatch>, lane: string): number =>
  m.state.units.filter((u) => u.alive && u.pawn && u.team === 'A' && u.lane === lane).length;

describe("White's standing pawn plan", () => {
  it('fields pawns toward the lane counts when Tempo allows, and keeps the reserve', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: true } });
    expect(m.issue({ type: 'setPawnPlan', quota: { top: 1, mid: 2, bot: 0 } }).ok).toBe(true);
    expect(m.snapshot().pawnPlan?.reserve).toBe(content.tuning.pawns.planReserve);
    m.state.tempo.A = 100;
    m.step(TPS * 3);
    expect(pawnsIn(m, 'mid')).toBe(2);
    expect(pawnsIn(m, 'top')).toBe(1);
    expect(pawnsIn(m, 'bot')).toBe(0);
    // each pawn cost 15: the plan never spends below its reserve (40)
    m.state.tempo.A = content.tuning.pawns.planReserve + 10;
    m.state.units = m.state.units.filter((u) => !(u.team === 'A' && u.pawn && u.lane === 'mid'));
    const before = m.snapshot().pawns.A.alive;
    m.step(TPS / 2);
    expect(m.snapshot().pawns.A.alive).toBe(before);
  });

  it('refuses counts above the pawn cap and negative counts', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: true } });
    const cap = m.snapshot().pawns.A.cap;
    expect(m.issue({ type: 'setPawnPlan', quota: { top: cap, mid: 1, bot: 0 } }).ok).toBe(false);
    expect(m.issue({ type: 'setPawnPlan', quota: { top: -1, mid: 1, bot: 0 } }).ok).toBe(false);
    expect(m.snapshot().pawnPlan).toBeUndefined();
  });

  it('is absent (and changes nothing) in AI-vs-AI matches', () => {
    const a = liveMatch(11);
    const b = liveMatch(11);
    a.step(TPS * 60);
    b.step(TPS * 60);
    expect(a.snapshot().pawnPlan).toBeUndefined();
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('gives way to Pawn Structure, which keeps its own counts', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: true } });
    m.issue({ type: 'setPawnPlan', quota: { top: 0, mid: 3, bot: 0 } });
    m.state.relics.held.A.push({
      id: 'pawn_structure',
      lane: null,
      piece: null,
      card: null,
      trigger: null,
      quota: { top: 0, mid: 0, bot: 1 },
      reserve: 0,
    });
    m.state.tempo.A = 100;
    m.step(TPS * 3);
    expect(pawnsIn(m, 'bot')).toBe(1);
    expect(pawnsIn(m, 'mid')).toBe(0);
  });

  it('has an auto switch: off fields nothing and keeps the counts, on resumes', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: true } });
    m.issue({ type: 'setPawnPlan', quota: { top: 0, mid: 2, bot: 0 } });
    expect(m.snapshot().pawnPlan?.auto).toBe(true);
    expect(m.issue({ type: 'setPawnAuto', auto: false }).ok).toBe(true);
    // changing the counts while it is off does not switch it back on
    m.issue({ type: 'setPawnPlan', quota: { top: 0, mid: 3, bot: 0 } });
    expect(m.snapshot().pawnPlan).toMatchObject({ auto: false, quota: { mid: 3 } });
    m.state.tempo.A = 100;
    m.step(TPS * 3);
    expect(pawnsIn(m, 'mid')).toBe(0);
    m.issue({ type: 'setPawnAuto', auto: true });
    m.state.tempo.A = 100;
    m.step(TPS * 3);
    expect(pawnsIn(m, 'mid')).toBe(3);
  });
});
