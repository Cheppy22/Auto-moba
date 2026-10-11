import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/sim';
import { relicDesc, relicText, shownRelics } from '../src/ui/relics';
import { content } from './helpers';

const def = (id: string) => content.relicById.get(id)!;

describe('relic text for each side', () => {
  it("names Black's own Opening, not White's", () => {
    const text = relicText(content, def('opening_theory'), 'B', 'french');
    expect(text).toContain("French Defence's two schools");
    expect(text).not.toMatch(/your Opening|Italian/);
  });

  it('keeps the Italian Game line for an Italian Game side', () => {
    expect(relicText(content, def('opening_theory'), 'B', 'italian')).toContain('Italian Game:');
    expect(relicText(content, def('opening_theory'), 'A', 'italian')).toContain('your Opening');
  });

  it('drops the Italian Game line for a White side that plays another Opening', () => {
    expect(relicText(content, def('sealed_move'), 'A', 'sicilian')).not.toMatch(/Italian/);
    expect(relicText(content, def('sealed_move'), 'A', 'italian')).toContain(
      'any school for Italian',
    );
    expect(relicText(content, def('opening_theory'), 'A', 'french')).not.toMatch(/Italian/);
  });

  it("reads Black's relics in the third person", () => {
    for (const r of content.relics) {
      const text = relicText(content, r, 'B', 'sicilian');
      expect(text, r.id).not.toMatch(/\b[Yy]ou(r)?\b/);
    }
    expect(relicText(content, def('sortie'), 'B', 'sicilian')).toContain("Black's Bastions");
    expect(relicText(content, def('kings_ransom'), 'B', 'sicilian')).toContain('Black is in Check');
  });

  it('drops the Rally prefix a Rally chip already shows', () => {
    const rally = content.relics.find((r) => r.rally)!;
    expect(rally.desc).toMatch(/^Rally\. /);
    expect(relicDesc(rally)).not.toMatch(/^Rally/);
  });
});

describe("Black's new relic stays secret until the next Act", () => {
  const snap = (bell: string): Snapshot =>
    ({
      act: { bell },
      relics: {
        held: { A: [], B: [{ id: 'a' }, { id: 'b' }] },
        latest: { A: null, B: 'b' },
      },
    }) as unknown as Snapshot;

  it('hides the freshly taken relic on the break sheet', () => {
    expect(shownRelics(snap('break'), 'B').map((h) => h.id)).toEqual(['a']);
  });

  it('shows it again once play resumes', () => {
    expect(shownRelics(snap('none'), 'B').map((h) => h.id)).toEqual(['a', 'b']);
  });
});
