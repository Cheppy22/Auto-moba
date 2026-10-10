import { describe, expect, it } from 'vitest';
import { CUSTOM_BEHAVIORS, validateRefs } from '../src/sim';
import { TPS } from '../src/sim/combat';
import { content } from './helpers';

describe('content', () => {
  it('passes cross-reference validation', () => {
    expect(validateRefs(content)).toEqual([]);
  });

  it('ships the prototype scope', () => {
    expect(content.pieces.map((p) => p.id).sort()).toEqual([
      'bishop',
      'king',
      'knight',
      'queen',
      'rook',
    ]);
    for (const p of content.pieces) {
      expect(p.abilities).toHaveLength(3);
      expect(p.styles).toHaveLength(3);
      for (const st of p.styles) {
        expect(content.kitByKey.get(`${p.id}/${st.id}`)).toHaveLength(4);
        expect(st.forks['8']).toHaveLength(2);
      }
    }
    expect(content.items.length).toBeGreaterThanOrEqual(15);
    expect(content.cursed).toHaveLength(6);
    expect(content.holy).toHaveLength(2);
    expect(content.biomes).toHaveLength(5);
    expect(content.pressure.map((p) => p.id)).toEqual([
      'thinning_veil',
      'spirit_tide',
      'keeper_debts',
      'endgame',
    ]);
  });

  it('has the sixteen gambit cards, one signature card per piece, each in a school', () => {
    expect(content.gambits.map((g) => g.effect ?? g.id).sort()).toEqual([
      'advance',
      'barricade',
      'castle',
      'check',
      'exchange',
      'fork',
      'hold_the_file',
      'open_file',
      'outpost',
      'pawn_sacrifice',
      'pawn_storm',
      'poisoned_pawn',
      'queens_gambit',
      'regroup',
      'sanctuary',
      'siege',
    ]);
    const school = (id: string): string => content.gambitById.get(id)!.school;
    expect(['advance', 'pawn_storm', 'siege'].map(school)).toEqual(['march', 'march', 'march']);
    expect(['check', 'fork'].map(school)).toEqual(['initiative', 'initiative']);
    expect(['hold_the_file', 'castle', 'sanctuary'].map(school)).toEqual(Array(3).fill('fortress'));
    expect(school('queens_gambit')).toBe('sacrifice');
    expect(school('regroup')).toBe('position');
    expect(content.openings.map((o) => o.id)).toEqual([
      'italian',
      'sicilian',
      'french',
      'kings_gambit',
    ]);
    const sig = content.gambits.filter((g) => g.piece !== null).map((g) => g.piece);
    expect(sig.sort()).toEqual(['bishop', 'king', 'knight', 'queen', 'rook']);
  });

  it('rank thresholds start at 0 and rise', () => {
    const th = content.tuning.ranks.goldThresholds;
    expect(th[0]).toBe(0);
    for (let i = 1; i < th.length; i++) expect(th[i]).toBeGreaterThan(th[i - 1]);
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
      ...content.pieces.flatMap((p) => [
        ...p.passives,
        ...p.styles.flatMap((st) => [
          ...st.passives,
          ...Object.values(st.ranks).flatMap((r) => r.triggers),
          ...st.forks['8'].flatMap((f) => f.triggers),
        ]),
        ...Object.values(p.generic).flatMap((r) => r.triggers),
      ]),
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
