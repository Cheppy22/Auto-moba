import { describe, expect, it } from 'vitest';
import { maybeSwapLane } from '../src/sim/ai/swap';
import { content, liveMatch } from './helpers';

describe('AI engagement', () => {
  it('a hero that keeps dying without a kill swaps lanes with a teammate', () => {
    const m = liveMatch(7);
    const ids = m.state.teams.A.heroIds;
    const units = ids.map((id) => m.unitById(id)!);
    const loser = units[0];
    const mate = units.find((u) => u.hero!.lane !== loser.hero!.lane)!;
    const before = { a: loser.hero!.lane, b: mate.hero!.lane };
    loser.hero!.lossStreak = content.tuning.ai.swapAfterDeaths;
    for (const u of units) if (u !== loser) u.hero!.lossStreak = 0;
    maybeSwapLane(m.ctx, loser);
    const swapped = [loser, ...units.filter((u) => u !== loser)].some(
      (u) => u.hero!.lane !== (u === loser ? before.a : before.b) && u.hero!.lane !== null,
    );
    expect(swapped).toBe(true);
    expect(loser.hero!.lossStreak).toBe(0);
  });

  it('farmers rescue allies in a winnable fight over a long match', () => {
    let joined = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const m = liveMatch(seed);
      while (m.state.phase.kind === 'live' && m.state.tick < 20 * 60 * 6) {
        m.step(20);
        for (const u of m.state.units)
          if (u.hero?.disposition === 'farmer' && u.hero.goal?.kind === 'joinFight') joined++;
      }
    }
    expect(joined).toBeGreaterThan(0);
  });

  it('in a two-piece lane the farmer (the Knight first) jungles', () => {
    const m = liveMatch(9);
    for (const t of ['A', 'B'] as const) {
      const units = m.state.teams[t].heroIds.map((id) => m.unitById(id)!);
      for (const u of units) {
        const mates = units.filter((x) => x.hero!.lane === u.hero!.lane);
        if (u.hero!.jungler) {
          expect(mates).toHaveLength(2);
          expect(u.hero!.disposition).toBe('farmer');
        }
      }
      const knight = units.find((u) => u.hero!.defId === 'knight')!;
      const pair = units.filter((x) => x.hero!.lane === knight.hero!.lane);
      if (pair.length === 2) expect(knight.hero!.jungler).toBe(true);
    }
  });
});
