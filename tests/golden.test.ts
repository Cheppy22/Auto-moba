import { describe, expect, it } from 'vitest';
import { runAi } from './helpers';

describe('golden matches', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed} finishes with invariants intact`, () => {
      const m = runAi(seed, 10);
      const s = m.state;
      expect(s.winner).not.toBeNull();
      expect(s.phase.kind).toBe('end');
      expect(s.phase.n).toBeLessThan(10);
      for (const u of s.units) {
        expect(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp)).toBe(true);
        expect(u.hp).toBeGreaterThanOrEqual(0);
        if (u.hero) expect(u.hero.gold).toBeGreaterThanOrEqual(0);
      }
      for (const smp of m.samples) {
        expect(Number.isFinite(smp.x) && Number.isFinite(smp.y)).toBe(true);
        expect(smp.hp).toBeGreaterThanOrEqual(0);
      }
      let last = -1;
      for (const e of m.events) {
        expect(e.seq).toBeGreaterThan(last);
        last = e.seq;
      }
      expect(m.events.filter((e) => e.type === 'matchEnd')).toHaveLength(1);
      // Checkmate: the loser's Throne is down and its King is dead.
      const loser = s.winner === 'A' ? 'B' : 'A';
      expect(m.events.filter((e) => e.type === 'checkmate')).toHaveLength(1);
      expect(s.throneDown[loser]).toBe(true);
      const king = s.teams[loser].heroIds
        .map((id) => m.unitById(id)!)
        .find((u) => u.hero!.defId === 'king')!;
      expect(king.alive).toBe(false);
      for (const id of [...s.teams.A.heroIds, ...s.teams.B.heroIds]) {
        const h = m.unitById(id)!.hero!;
        expect(h.rank).toBeGreaterThanOrEqual(1);
        expect(h.rank).toBeLessThanOrEqual(8);
      }
    });
  }
});
