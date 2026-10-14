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

  it('is not stored for AI sides, and AI-vs-AI matches stay deterministic', () => {
    const a = liveMatch(11);
    const b = liveMatch(11);
    a.step(TPS * 60);
    b.step(TPS * 60);
    expect(a.snapshot().pawnPlan).toBeUndefined();
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('is followed by an AI side with the default counts and the same reserve', () => {
    const m = liveMatch(5);
    const blackPawns = (lane: string): number =>
      m.state.units.filter((u) => u.alive && u.pawn && u.team === 'B' && u.lane === lane).length;
    // no cards in Black's hand, so only the plan spends Tempo
    for (const h of m.state.hands.B) {
      h.cardId = null;
      h.refillTick = null;
    }
    const { planQuota, planReserve, cost } = content.tuning.pawns;
    m.state.tempo.B = 100;
    m.step(TPS * 3);
    const fielded = (['top', 'mid', 'bot'] as const).map(blackPawns);
    // 100 Tempo pays for 4 pawns before it reaches the reserve
    expect(fielded.reduce((n, x) => n + x, 0)).toBe(Math.floor((100 - planReserve) / cost));
    expect(m.state.tempo.B).toBeGreaterThanOrEqual(planReserve);
    m.state.tempo.B = 100;
    m.step(TPS * 3);
    expect(blackPawns('top')).toBe(planQuota.top);
    expect(blackPawns('mid')).toBe(planQuota.mid);
    expect(blackPawns('bot')).toBe(planQuota.bot);
  });

  it('lets an AI side play a card only if it keeps its card reserve after paying', () => {
    const m = liveMatch(5);
    const before = m.events.filter((e) => e.type === 'gambit' && e.payload.team === 'B').length;
    for (let i = 0; i < TPS * 20; i++) {
      // one Tempo short of the cheapest card in hand plus the reserve
      const costs = m.state.hands.B.flatMap((h) =>
        h.cardId === null ? [] : [content.gambitById.get(h.cardId)!.cost],
      );
      m.state.tempo.B = content.tuning.pawns.aiCardReserve + Math.min(...costs) - 1;
      m.step(1);
    }
    const after = m.events.filter((e) => e.type === 'gambit' && e.payload.team === 'B').length;
    expect(after).toBe(before);
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
