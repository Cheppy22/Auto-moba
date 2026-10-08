import { describe, expect, it } from 'vitest';
import { recompute } from '../src/sim/stats';
import { content, liveMatch, piece } from './helpers';

function setup(items: string[]) {
  const m = liveMatch(7, { autoGambits: { A: false, B: false } });
  const p = piece(m, 'A', 'queen');
  p.hero!.items = [];
  // Measure attunement alone: no style stat tilt or passives.
  const key = `queen/${p.hero!.style}`;
  const style = content.styleByKey.get(key)!;
  content.styleByKey.set(key, { ...style, mods: [], passives: [] });
  try {
    return measure(m, p, items);
  } finally {
    content.styleByKey.set(key, style);
  }
}

function measure(m: ReturnType<typeof liveMatch>, p: ReturnType<typeof piece>, items: string[]) {
  recompute(m.ctx, p);
  const base = { ...p.stats };
  p.hero!.items = items;
  recompute(m.ctx, p);
  return { base, now: p.stats };
}

describe('attunement', () => {
  it('has no bonus below two items of a category', () => {
    const { base, now } = setup(['iron_lung']);
    expect(now.armor).toBe(base.armor);
    expect(now.maxHp).toBe(base.maxHp + 150);
  });

  it('adds the 2-item bonus on top of the items themselves', () => {
    const { base, now } = setup(['iron_lung', 'riveted_plate']);
    const hp = (base.maxHp + 150) * 1.06;
    expect(now.maxHp).toBeCloseTo(hp, 5);
  });

  it('uses only the highest tier reached, not a sum of tiers', () => {
    const four = setup(['iron_lung', 'riveted_plate', 'wanderer_boots', 'boiler_heart']);
    const flat = (base: number): number => base + 150 + 350;
    expect(four.now.maxHp).toBeCloseTo(flat(four.base.maxHp) * 1.12, 5);
  });

  it('does not mix categories into one count', () => {
    const { base, now } = setup(['iron_lung', 'rusted_cleaver']);
    expect(now.maxHp).toBe(base.maxHp + 150);
    expect(now.bladeDmg).toBe(base.bladeDmg + 10);
  });
});
