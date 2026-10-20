import { describe, expect, it } from 'vitest';
import { openingInfo, openingMatchups } from '../src/ui/setup/data';
import { content } from './helpers';

describe('Opening matchups', () => {
  it('lists each enemy school once, with one verdict, for every Opening', () => {
    for (const o of content.openings) {
      const info = openingInfo(content, o);
      const all = [...info.strongVs, ...info.evenVs, ...info.weakVs].map((m) => m.other);
      expect(new Set(all).size, o.id).toBe(all.length);
      for (const m of [...info.strongVs, ...info.evenVs, ...info.weakVs])
        expect(m.text.length, `${o.id} vs ${m.other}`).toBeGreaterThan(0);
    }
  });

  it("shows each of an Opening's own schools once per matchup (no doubled glyph)", () => {
    for (const o of content.openings) {
      const info = openingInfo(content, o);
      for (const m of [...info.strongVs, ...info.evenVs, ...info.weakVs])
        expect(new Set(m.mine).size, `${o.id} vs ${m.other}`).toBe(m.mine.length);
    }
  });

  it('French Defence: March is good, Initiative is weak (net), Sacrifice is even', () => {
    const french = content.openings.find((o) => o.id === 'french')!;
    const { strongVs, weakVs, evenVs } = openingMatchups(french.schools);
    expect(strongVs.map((m) => m.other)).toEqual(['march']);
    expect(weakVs.map((m) => m.other)).toEqual(['initiative']);
    expect(evenVs.map((m) => m.other)).toEqual(['sacrifice']);
  });
});
