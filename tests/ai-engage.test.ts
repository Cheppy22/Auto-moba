import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { maybeSwapLane } from '../src/sim/ai/swap';
import { content } from './helpers';

describe('AI engagement', () => {
  it('a hero that keeps dying without a kill swaps lanes with a teammate', () => {
    const m = Match.create(content, { seed: 7, player: null });
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
      const m = Match.create(content, { seed, player: null });
      for (let g = 0; g < 40 && m.state.phase.kind !== 'end'; g++) {
        if (m.state.phase.kind === 'live') {
          for (let i = 0; i < 20 * 60; i += 20) {
            m.step(20);
            for (const u of m.state.units)
              if (u.hero?.disposition === 'farmer' && u.hero.goal?.kind === 'joinFight') joined++;
          }
        } else m.autoAdvance();
        if (m.state.tick > 20 * 60 * 6) break;
      }
    }
    expect(joined).toBeGreaterThan(0);
  });
});
