import { describe, expect, it } from 'vitest';
import { plainText } from '../src/ui/richtext';
import { content } from './helpers';

const TAG = /\{[mbstgpr]\|[^{}|]*\}/g;

describe('item description markup', () => {
  const texts: [string, string][] = [
    ...content.items.map((i): [string, string] => [i.id, i.desc]),
    ...content.cursed.map((c): [string, string] => [c.id, c.boonText]),
    ...content.cursed.flatMap((c) => c.flaws.map((f): [string, string] => [f.id, f.text])),
    ...content.holy.map((h): [string, string] => [h.id, h.desc]),
  ];

  it('every description uses only well-formed tags', () => {
    for (const [id, text] of texts) {
      expect(text.length, id).toBeGreaterThan(0);
      expect(text.replace(TAG, ''), id).not.toMatch(/[{}]/);
    }
  });

  it('every item has exactly one named rule, and tier 3 items are relics', () => {
    for (const i of content.items) {
      const rules = i.desc.match(/\{r\|[^}]*\}/g) ?? [];
      expect(rules.length, i.id).toBeGreaterThanOrEqual(1);
      expect(plainText(i.desc), i.id).not.toContain('{');
    }
  });

  it('every item has at most two stat mods (the price counts as a stat)', () => {
    for (const i of content.items) {
      const stats = i.mods.filter((m) => m.stat !== 'damageTakenMult');
      expect(stats.length, i.id).toBeLessThanOrEqual(2);
    }
  });
});
