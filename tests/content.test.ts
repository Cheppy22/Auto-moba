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
        // each archetype's two Rank 8 options live on as its archetype Techniques
        const own = content.techniques.filter(
          (d) => d.pool === 'archetype' && d.piece === p.id && d.archetype === st.id,
        );
        expect(own, `${p.id}/${st.id}`).toHaveLength(2);
      }
    }
    expect(content.techniques).toHaveLength(84);
    expect(content.biomes).toHaveLength(5);
    expect(content.pressure.map((p) => p.id)).toEqual(['thinning_veil', 'spirit_tide', 'endgame']);
  });

  it('has the twenty-four gambit cards, one signature card per piece, each in a school', () => {
    expect(content.gambits.map((g) => g.effect ?? g.id).sort()).toEqual([
      'advance',
      'barricade',
      'breakthrough',
      'castle',
      'check',
      'desperado',
      'exchange',
      'fork',
      'fortify',
      'hold_the_file',
      'increment',
      'open_file',
      'opening_book',
      'outpost',
      'pawn_sacrifice',
      'pawn_storm',
      'pin',
      'poisoned_pawn',
      'queens_gambit',
      'regroup',
      'sanctuary',
      'siege',
      'time_trouble',
      'zugzwang',
    ]);
    const school = (id: string): string => content.gambitById.get(id)!.school;
    expect(['advance', 'pawn_storm', 'siege', 'breakthrough'].map(school)).toEqual(
      Array(4).fill('march'),
    );
    expect(['check', 'fork', 'pin', 'desperado'].map(school)).toEqual(Array(4).fill('initiative'));
    expect(['hold_the_file', 'castle', 'sanctuary', 'fortify'].map(school)).toEqual(
      Array(4).fill('fortress'),
    );
    expect(school('queens_gambit')).toBe('sacrifice');
    expect(school('regroup')).toBe('position');
    expect(['zugzwang', 'time_trouble', 'opening_book', 'increment'].map(school)).toEqual(
      Array(4).fill('clock'),
    );
    expect(content.openings.map((o) => o.id)).toEqual([
      'italian',
      'sicilian',
      'french',
      'kings_gambit',
      'english',
      'scandinavian',
      'kings_indian',
      'caro_kann',
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
      ...content.techniques.flatMap((d) => [...d.triggers, ...(d.dubious?.triggers ?? [])]),
      ...content.pieces.flatMap((p) => [
        ...p.passives,
        ...p.styles.flatMap((st) => [
          ...st.passives,
          ...Object.values(st.ranks).flatMap((r) => r.triggers),
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
});
