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
    });
  }
});
