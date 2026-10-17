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
      'Hero win rates',
      'Win rate by lane',
      'Items',
      'Curses, auction, comebacks, obelisks',
      'Targets',
    ]) {
      expect(md).toContain(h);
    }
    expect(md).not.toMatch(/NaN|undefined/);
    expect(stats.matches).toBe(3);
  });

  it('forces a hero draft for pairwise runs', () => {
    const draft = { A: Array(5).fill('queen'), B: Array(5).fill('miko') };
    const r = simulateMatch(content, 5, 10, draft);
    expect(r.heroes.filter((h) => h.team === 'A').every((h) => h.def === 'queen')).toBe(true);
    expect(r.heroes.filter((h) => h.team === 'B').every((h) => h.def === 'miko')).toBe(true);
  });
});
