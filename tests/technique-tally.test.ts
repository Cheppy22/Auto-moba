import { describe, expect, it } from 'vitest';
import type { TechTally } from '../src/sim';
import { counted, effectOf, tallyRows, tallyText, topRows } from '../src/ui/builds/tally';
import { totalsFor } from '../src/ui/report/TechniqueTotals';
import { content, liveMatch, piece, runAi } from './helpers';

const t = (damage: number, heal = 0, shield = 0, procs = 0): TechTally => ({
  damage,
  heal,
  shield,
  procs,
});

describe('tally text', () => {
  it('says what a Technique did in plain words, and when it counted nothing', () => {
    expect(tallyText(t(1840, 320, 0, 9))).toBe('1,840 damage · 320 healed · fired 9 times');
    expect(tallyText(t(0, 0, 90, 1))).toBe('90 shielded · fired once');
    expect(tallyText(t(0))).toBe('Nothing to count yet');
    expect(counted(t(0))).toBe(false);
    expect(counted(t(0, 0, 0, 1))).toBe(true);
    expect(effectOf(t(10, 5, 2))).toBe(17);
  });

  it('ranks the Techniques of the pieces asked for by effect, and keeps the top three that counted', () => {
    const map: Record<string, TechTally> = {
      '1:ambush': t(500),
      '1:wind_up': t(900, 0, 0, 4),
      '2:the_vault': t(0, 0, 0, 0),
      '2:toll': t(0, 0, 300, 5),
      '3:escort': t(9999),
      '1:no_such_card': t(5000),
    };
    const mine: Record<number, 'knight' | 'rook'> = { 1: 'knight', 2: 'rook' };
    const rows = tallyRows(content, map, (id) => mine[id] ?? null);
    expect(rows.map((r) => r.id)).toEqual(['wind_up', 'ambush', 'toll', 'the_vault']);
    expect(topRows(rows, 3).map((r) => r.id)).toEqual(['wind_up', 'ambush', 'toll']);
    expect(topRows(rows, 2)).toHaveLength(2);
  });
});

describe('what each Technique did over a match', () => {
  const m = runAi(29000);

  it('the per-Act log adds up to the match totals the sim keeps', () => {
    const log = m.techniqueLog();
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.map((r) => r.act)).toEqual(log.map((_r, i) => i + 1));
    const sum: Record<string, TechTally> = {};
    for (const r of log)
      for (const [key, v] of Object.entries(r.techniques)) {
        const s = (sum[key] ??= t(0));
        s.damage += v.damage;
        s.heal += v.heal;
        s.shield += v.shield;
        s.procs += v.procs;
      }
    const match = m.state.builds.match;
    expect(Object.keys(sum).sort()).toEqual(Object.keys(match).sort());
    for (const key of Object.keys(match)) {
      expect(sum[key].damage).toBeCloseTo(match[key].damage, 6);
      expect(sum[key].heal).toBeCloseTo(match[key].heal, 6);
      expect(sum[key].shield).toBeCloseTo(match[key].shield, 6);
      expect(sum[key].procs).toBe(match[key].procs);
    }
    expect(Object.keys(match).length).toBeGreaterThan(0);
  });

  it('reading the log never moves the match (the log is not state)', () => {
    const a = liveMatch(7);
    a.step(2000);
    const before = JSON.stringify(a.state);
    a.techniqueLog();
    expect(JSON.stringify(a.state)).toBe(before);
  });

  it('a piece’s totals list every Technique it held, with an entry per Act that adds up', () => {
    const u = piece(m, 'A', 'knight');
    const held = u.hero!.techniques.map((x) => x.id);
    const rows = totalsFor(content, m.techniqueLog(), u.id, held);
    const acts = m.techniqueLog().length;
    for (const id of held) expect(rows.some((r) => r.id === id && r.held)).toBe(true);
    for (const r of rows) {
      expect(r.perAct).toHaveLength(acts);
      const key = `${u.id}:${r.id}`;
      const want = m.state.builds.match[key]?.damage ?? 0;
      expect(r.perAct.reduce((a, x) => a + x.damage, 0)).toBeCloseTo(want, 6);
      expect(r.total.damage).toBeCloseTo(want, 6);
    }
    // held ones come first
    const firstReplaced = rows.findIndex((r) => !r.held);
    if (firstReplaced >= 0) expect(rows.slice(0, firstReplaced).every((r) => r.held)).toBe(true);
  });
});
