import { describe, expect, it } from 'vitest';
import type { RelicAim, RelicDef, Stats } from '../src/sim';
import { relicHeadline, relicPlan, type PlanInput } from '../src/ui/relicPlan';
import { content, liveMatch } from './helpers';

const def = (id: string): RelicDef => content.relicById.get(id)!;
const t = content.tuning;

/** Numbers a relic's own params can produce: the value, its percent, its change in percent. */
function allowed(r: RelicDef): Set<number> {
  const out = new Set<number>();
  const add = (v: number): void => {
    out.add(Math.round(v * 100) / 100);
  };
  for (const v of Object.values(r.params)) {
    add(Math.abs(v));
    add(Math.abs(v) * 100);
    add(Math.abs(v - 1) * 100);
  }
  // the one baseline a headline quotes: the pawn price it replaces
  if (r.id === 'pawn_majority') add(t.pawns.cost);
  return out;
}

const stats = (s: Partial<Stats>): Stats =>
  ({
    maxHp: 1000,
    hpRegen: 2,
    armor: 20,
    resist: 20,
    bladeDmg: 60,
    atkSpeed: 1,
    soulPower: 30,
    moveSpeed: 50,
    cdr: 0,
    range: 80,
    ...s,
  }) as Stats;

const input: PlanInput = {
  content,
  pieces: [
    { id: 1, piece: 'queen', lane: 'mid', stats: stats({ maxHp: 900, bladeDmg: 61 }) },
    { id: 2, piece: 'rook', lane: 'top', stats: stats({ armor: 40 }) },
    { id: 3, piece: 'knight', lane: 'top', stats: stats({ moveSpeed: 54 }) },
    { id: 4, piece: 'bishop', lane: 'bot', stats: stats({ soulPower: 54, bladeDmg: 34 }) },
    { id: 5, piece: 'king', lane: 'bot', stats: stats({}) },
  ],
  nextAct: 2,
  tempo: 60,
  tempoMax: t.gambits.tempoMax,
  pawnCap: 8,
  pawnCost: t.pawns.cost,
  handRefillSec: t.gambits.refillSec,
  opening: 'italian',
  cardCost: (id, discount) =>
    Math.max(t.gambits.minCost, (content.gambitById.get(id)?.cost ?? 0) - discount),
};

const aim = (patch: Partial<RelicAim>): RelicAim => ({
  lane: null,
  piece: null,
  card: null,
  trigger: null,
  quota: null,
  reserve: null,
  ...patch,
});

describe('relic headlines', () => {
  it('every relic has a one-line headline', () => {
    for (const r of content.relics) {
      expect(r.headline.length, r.id).toBeGreaterThan(10);
      expect(r.headline.length, r.id).toBeLessThanOrEqual(100);
      expect(r.headline.endsWith('.'), r.id).toBe(true);
    }
  });

  it("quotes only numbers the relic's own effect has", () => {
    for (const r of content.relics) {
      const found = (r.headline.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      const ok = allowed(r);
      for (const n of found)
        expect(ok.has(n), `${r.id}: ${n} is not one of its numbers`).toBe(true);
    }
  });

  it('fills the aim in', () => {
    expect(relicHeadline(content, def('half_open_file'), { lane: 'top' }, null)).toMatch(
      /^Your Left lane marches 8% faster/,
    );
    expect(relicHeadline(content, def('half_open_file'), {}, null)).toMatch(/^One lane/);
    expect(relicHeadline(content, def('crown_jewel'), {}, 'queen')).toMatch(/^Your Queen becomes/);
  });

  it('every style and Rank 8 option says how it plays', () => {
    for (const p of content.pieces)
      for (const s of p.styles) {
        expect(s.playsLike, s.id).not.toBe('');
        for (const f of s.forks['8']) expect(f.playsLike, f.id).not.toBe('');
      }
  });
});

describe('relic plan: what changes', () => {
  it('every relic shows at least one before → after line once aimed', () => {
    for (const r of content.relics) {
      const plan = relicPlan(
        input,
        r,
        aim({
          lane: 'top',
          piece: 1,
          card: r.cards[0] ?? 'advance',
          trigger: 'kill',
          quota: { top: 2, mid: 2, bot: 2 },
          reserve: 20,
        }),
      );
      expect(plan.rows.length, r.id).toBeGreaterThan(0);
      expect(plan.target, r.id).not.toBe('');
      for (const row of plan.rows) expect(row.before, `${r.id} ${row.label}`).not.toBe(row.after);
    }
  });

  it('uses the aimed piece and the real numbers', () => {
    const cj = def('crown_jewel');
    const plan = relicPlan(input, cj, aim({ piece: 1 }));
    expect(plan.target).toBe('Queen');
    const hp = plan.rows.find((r) => r.label === 'Health')!;
    expect(hp.before).toBe('900');
    expect(hp.after).toBe(String(Math.round(900 * cj.params.healthMul)));
    const dmg = plan.rows.find((r) => r.label === 'Blade damage')!;
    expect(dmg.after).toBe(String(Math.round(61 * cj.params.damageMul)));
  });

  it('a lane relic lists the pieces in that lane', () => {
    const plan = relicPlan(input, def('half_open_file'), aim({ lane: 'top' }));
    expect(plan.rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Rook speed', 'Knight speed']),
    );
    const knight = plan.rows.find((r) => r.label === 'Knight speed')!;
    expect(knight.after).toBe(String(Math.round(54 * def('half_open_file').params.speedMul)));
  });

  it('structure relics quote the tuning numbers', () => {
    const wall = relicPlan(input, def('curtain_wall'), aim({})).rows[0];
    expect(wall.before).toBe(String(t.tower.hp));
    expect(wall.after).toBe(String(Math.round(t.tower.hp * def('curtain_wall').params.healthMul)));
    const pawns = relicPlan(input, def('pawn_majority'), aim({})).rows[0];
    expect(pawns.before).toBe(`${t.pawns.cost} Tempo`);
    expect(pawns.after).toBe(`${def('pawn_majority').params.cost} Tempo`);
  });
});

describe('fork preview', () => {
  it('shows the archetype stat tilt on the real piece, before and after', () => {
    const m = liveMatch(5, { pauseForForks: true });
    const queen = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .find((u) => u.hero!.defId === 'queen')!;
    m.state.forks.push({ heroId: queen.id, rank: 4, deadlineTick: null });
    const prev = m.forkPreview(queen.id, 'regent')!;
    expect(prev).not.toBeNull();
    const regent = content.styleByKey.get('queen/regent')!;
    const range = regent.mods.find((x) => x.stat === 'range')!.value;
    expect(prev.after.range - prev.before.range).toBeCloseTo(range, 5);
    expect(prev.signature?.name).toBe(regent.ability.name);
    // the preview never changes the piece
    expect(queen.hero!.style).toBeNull();
    expect(m.forkPreview(queen.id, 'not_a_style')).toBeNull();
    const duelist = m.forkPreview(queen.id, 'duelist')!;
    expect(duelist.after.maxHp).toBeGreaterThan(duelist.before.maxHp);
  });
});
