import { describe, expect, it } from 'vitest';
import { report } from '../tools/report';
import { simulateMatch } from '../tools/simulate';
import { content } from './helpers';

describe('balance tooling', () => {
  const results = [11, 12, 13].map((seed) => simulateMatch(content, seed));

  it('summarizes a match', () => {
    const r = results[0];
    expect(r.heroes).toHaveLength(10);
    expect(r.minutes).toBeGreaterThan(1);
    expect(r.winner).not.toBeNull();
    expect(Number.isFinite(r.ms)).toBe(true);
  });

  it('writes a report with every section and no broken numbers', () => {
    const { md, stats } = report(results);
    for (const h of [
      'Balance report',
      'Tempo: gambits and pawns',
      'Pieces',
      'Styles',
      'Build paths',
      'Lanes',
      'Items',
      'Curses, comebacks, obelisks',
      'Targets',
    ]) {
      expect(md).toContain(h);
    }
    expect(md).not.toMatch(/NaN|undefined/);
    expect(stats.matches).toBe(3);
  });

  it('can fix a setup and switch White gambits off for the baseline', () => {
    const pieces = content.pieces.map((p, i) => ({
      piece: p.id,
      path: 'defense' as const,
      lane: (['top', 'top', 'bot', 'bot', 'mid'] as const)[i],
    }));
    const forced = Object.fromEntries(content.pieces.map((p) => [p.id, p.styles[2].id]));
    const r = simulateMatch(content, 5, {
      setup: { A: { opening: 'italian', pieces } },
      forceStyles: { A: forced },
      noGambitsA: true,
    });
    const white = r.heroes.filter((h) => h.team === 'A');
    expect(white.every((h) => h.path === 'defense')).toBe(true);
    for (const p of content.pieces) {
      const h = white.find((x) => x.def === p.id)!;
      // A forced archetype shows once the piece reaches Rank 4.
      if (h.rank >= 4) expect(h.style).toBe(p.styles[2].id);
    }
    expect(Object.keys(r.gambits.A)).toHaveLength(0);
    expect(r.pawns.A).toBe(0);
  });
});
