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
      'Tempo pacing',
      'High-ground eye badge',
      'Pieces',
      'Styles',
      'Lanes',
      'Techniques',
      'Gold and Techniques at the Act breaks',
      'Comebacks, obelisks',
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
    for (const p of content.pieces) {
      const h = white.find((x) => x.def === p.id)!;
      // A forced archetype shows once the piece reaches Rank 4.
      if (h.rank >= 4) expect(h.style).toBe(p.styles[2].id);
    }
    expect(Object.keys(r.gambits.A)).toHaveLength(0);
    expect(r.pawns.A).toBe(0);
  });

  it('reads Tempo pacing, and the player stand-in plays cards while the plan fields pawns', () => {
    const r = results[0];
    const cards = (t: 'A' | 'B'): number => Object.values(r.gambits[t]).reduce((a, b) => a + b, 0);
    expect(r.pace.A.cardsByAct.reduce((a, b) => a + b, 0)).toBe(cards('A'));
    expect(r.pace.A.gaps).toHaveLength(Math.max(0, cards('A') - 1));
    expect(r.pace.A.firstAffordableSec).not.toBeNull();
    const act1 = r.pace.A.act1Playable.reduce((a, b) => a + b, 0);
    expect(act1).toBeGreaterThan(200);
    // the square map has no heights, so no eye badge
    expect(r.eye.onTicks).toBe(0);
    // White drafts no relics here, so no Sealed Move plays a card on its own between the stand-in's
    const p = simulateMatch(content, 11, {
      whitePlayer: true,
      whiteEvery: 60,
      maxPhases: 1,
      relics: { A: 'none' },
    });
    expect(p.pawns.A).toBeGreaterThan(0);
    // at most one card a minute; Increment does not use up the minute (it is played with the card
    // it refunds), so only a gap right after one may be shorter
    const short = p.pace.A.gaps.filter((g) => g < 60).length;
    expect(short).toBeLessThanOrEqual(p.gambits.A.increment ?? 0);
  });
});
