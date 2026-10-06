import { describe, expect, it } from 'vitest';
import { CUSTOM_BEHAVIORS, validateRefs } from '../src/sim';
import { content } from './helpers';

describe('content', () => {
  it('passes cross-reference validation', () => {
    expect(validateRefs(content)).toEqual([]);
  });

  it('ships the prototype scope', () => {
    expect(content.heroes).toHaveLength(4);
    expect(content.items.length).toBeGreaterThanOrEqual(15);
    expect(content.cursed).toHaveLength(4);
    expect(content.holy).toHaveLength(2);
    expect(content.biomes).toHaveLength(3);
    expect(content.pressure.map((p) => p.id)).toEqual([
      'thinning_veil',
      'spirit_tide',
      'keeper_debts',
      'restless_guardians',
    ]);
  });

  it('caps custom behaviors at five', () => {
    expect(Object.keys(CUSTOM_BEHAVIORS).length).toBeLessThanOrEqual(5);
  });

  it('every custom trigger names a registered behavior', () => {
    const names = new Set(Object.keys(CUSTOM_BEHAVIORS));
    const all = [
      ...content.items.flatMap((i) => i.triggers),
      ...content.cursed.flatMap((c) => [...c.triggers, ...c.flaws.flatMap((f) => f.triggers)]),
      ...content.holy.flatMap((h) => h.triggers),
      ...content.heroes.flatMap((h) => h.passives),
    ];
    for (const t of all) if (t.custom) expect(names.has(t.custom)).toBe(true);
  });

  it('report badge labels state a metric, not a judgment', () => {
    const banned = /\b(should|better|worse|bad|good|weak|strong|fix|improve|mistake)\b/i;
    for (const b of content.badges) expect(banned.test(b.label)).toBe(false);
  });

  it('item recipes form a strict tier ladder', () => {
    for (const it of content.items) {
      for (const f of it.from) expect(content.itemById.get(f)!.tier).toBeLessThan(it.tier);
    }
  });
});
