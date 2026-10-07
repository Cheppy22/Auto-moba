import { describe, expect, it } from 'vitest';
import { CUSTOM_BEHAVIORS, validateRefs } from '../src/sim';
import { TPS } from '../src/sim/combat';
import { content } from './helpers';

describe('content', () => {
  it('passes cross-reference validation', () => {
    expect(validateRefs(content)).toEqual([]);
  });

  it('ships the prototype scope', () => {
    expect(content.heroes).toHaveLength(14);
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

  it('keeps the tick rate constant in step with tuning.json', () => {
    expect(content.tuning.tickRate).toBe(TPS);
  });

  it('keeps the custom behavior list short', () => {
    expect(Object.keys(CUSTOM_BEHAVIORS).length).toBeLessThanOrEqual(12);
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

  it('has at least twelve base items per category with unique ids', () => {
    expect(new Set(content.items.map((i) => i.id)).size).toBe(content.items.length);
    for (const cat of ['mind', 'body', 'soul'] as const) {
      const mine = content.items.filter((i) => i.category === cat);
      expect(mine.length).toBeGreaterThanOrEqual(12);
      for (const tier of [1, 2, 3]) expect(mine.some((i) => i.tier === tier)).toBe(true);
    }
  });

  it('recipes stay inside one category, and every part feeds a higher tier', () => {
    for (const it of content.items) {
      for (const f of it.from) expect(content.itemById.get(f)!.category).toBe(it.category);
      if (it.tier > 1) {
        expect(it.from.length).toBeGreaterThan(0);
        for (const f of it.from) expect(content.itemById.get(f)!.tier).toBe(it.tier - 1);
      }
      if (it.tier < 3)
        expect(
          content.items.some((o) => o.from.includes(it.id)),
          it.id,
        ).toBe(true);
      expect(it.desc.length).toBeGreaterThan(7);
    }
  });

  it('prices follow the tier bands', () => {
    const band: Record<number, [number, number]> = {
      1: [250, 350],
      2: [800, 1000],
      3: [1700, 2100],
    };
    for (const it of content.items) {
      expect(it.cost, it.id).toBeGreaterThanOrEqual(band[it.tier]![0]);
      expect(it.cost, it.id).toBeLessThanOrEqual(band[it.tier]![1]);
    }
  });
});
