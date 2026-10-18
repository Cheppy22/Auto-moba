import { describe, expect, it } from 'vitest';
import type { Match, Stats, TechniquePreview } from '../src/sim';
import { breakPlan, buildViewOf } from '../src/ui/hud/buildsData';
import { estimateLine, ledgerRows, slotLabel, techniqueFace } from '../src/ui/TechniqueCard';
import { didText, slotTiles } from '../src/ui/TechniqueSlots';
import { content, liveMatch, toBell } from './helpers';

const stats = (s: Partial<Stats> = {}): Stats =>
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

function preview(over: Partial<TechniquePreview>): TechniquePreview {
  return {
    before: stats(),
    after: stats(),
    ability: null,
    replaces: null,
    estimate: null,
    ...over,
  };
}

/** A browser-style match at its first Act break (Builds open). */
function atBreak(seed: number): Match {
  const m = liveMatch(seed, { pauseForBreak: true, relics: { A: 'ai' } });
  toBell(m, 'break');
  return m;
}

describe('Technique card helpers', () => {
  it('lists stats and skill numbers that move, better or worse for the piece', () => {
    const rows = ledgerRows(
      preview({
        after: stats({ maxHp: 1150, armor: 15 }),
        ability: {
          before: { name: 'L-Leap', cooldownSec: 10, range: 200, radius: 0, power: 1 },
          after: { name: 'L-Leap', cooldownSec: 8.5, range: 300, radius: 0, power: 1.15 },
        },
      }),
    );
    const byLabel = new Map(rows.map((r) => [r.label, r]));
    expect(byLabel.get('Health')).toMatchObject({ before: '1000', after: '1150', better: true });
    expect(byLabel.get('Armor')).toMatchObject({ better: false });
    expect(byLabel.get('L-Leap cooldown')).toMatchObject({ after: '8.5 s', better: true });
    expect(byLabel.get('L-Leap reach')).toMatchObject({ before: '200', after: '300' });
    expect(byLabel.get('L-Leap power')).toMatchObject({ before: '100%', after: '115%' });
    expect(byLabel.has('L-Leap area')).toBe(false);
    expect(ledgerRows(preview({}))).toEqual([]);
  });

  it('writes the last Act line only when the piece counted something', () => {
    const est = { count: 'hits' as const, last: 212, value: 53, label: 'extra strikes' };
    expect(estimateLine(preview({ estimate: est }))).toBe(
      '212 hits last Act: about 53 extra strikes',
    );
    expect(estimateLine(preview({ estimate: { ...est, last: 0, value: 0 } }))).toBeNull();
    expect(estimateLine(null)).toBeNull();
  });

  it('names slots by the piece’s own skills and fills a held card’s text at its grade', () => {
    expect(slotLabel(content, 'knight', null, 'attack')).toBe('Attack');
    const skill = content.pieceById.get('knight')!.abilities[0].name;
    expect(slotLabel(content, 'knight', null, 'skill1')).toBe(skill);
    expect(slotLabel(content, 'knight', null, 'signature')).toBe('Signature');
    const d = content.techniques.find((x) => x.pool === 'common' && /\d/.test(x.desc))!;
    const plain = techniqueFace(content, d.id, 'plain')!;
    const brilliant = techniqueFace(content, d.id, 'brilliant')!;
    expect(plain.name).toBe(d.name);
    expect(plain.desc).not.toMatch(/\{[a-z]+\.[\w.]*\|/);
    expect(plain.desc).not.toContain('?');
    expect(brilliant.desc).not.toBe(plain.desc);
    expect(techniqueFace(content, 'no_such_card', 'plain')).toBeNull();
  });

  it('tallies what a Technique did in plain words', () => {
    expect(didText({ damage: 1840.4, heal: 0, shield: 320, procs: 9 })).toBe(
      '1,840 damage, 320 shields, fired 9 times',
    );
    expect(didText({ damage: 0, heal: 0, shield: 0, procs: 1 })).toBe('fired 1 time');
    expect(didText({ damage: 0, heal: 0, shield: 0, procs: 0 })).toBe('');
  });

  it('builds six slots from held Techniques, the Signature locked before an archetype', () => {
    const d = content.techniques.find((x) => x.pool === 'common' && x.slot === 'trait')!;
    const tiles = slotTiles(content, 'rook', null, [{ id: d.id, grade: 'sharp' }]);
    expect(tiles.map((t) => t.slot)).toEqual([
      'attack',
      'skill1',
      'skill2',
      'skill3',
      'signature',
      'trait',
    ]);
    expect(tiles[4].locked).toBe(true);
    expect(tiles[5].held).toMatchObject({ id: d.id, grade: 'sharp' });
    expect(tiles.filter((t) => t.held)).toHaveLength(1);
  });
});

describe('Builds tab data', () => {
  it('caches a piece’s Builds view until the match changes', () => {
    const m = atBreak(7);
    const id = m.state.teams.A.heroIds[0];
    const a = buildViewOf(m, id)!;
    expect(buildViewOf(m, id)).toBe(a);
    expect(a.offer?.cards).toHaveLength(3);
    expect(m.issue({ type: 'passOffer', heroId: id }).ok).toBe(true);
    const b = buildViewOf(m, id)!;
    expect(b).not.toBe(a);
    expect(b.offer!.decided).toBe('passed');
  });

  it('fixes the strip order and highlights for the break: highlighted pieces first', () => {
    const m = atBreak(7);
    const ids = m.state.teams.A.heroIds.slice();
    const plan = breakPlan(m, ids);
    expect(plan.order.slice().sort()).toEqual(ids.slice().sort());
    expect(plan.highlight.length).toBeGreaterThanOrEqual(1);
    expect(plan.highlight.length).toBeLessThanOrEqual(2);
    expect(plan.order.slice(0, plan.highlight.length)).toEqual(plan.highlight);
    // a pick does not move the stars or the order
    m.issue({ type: 'autoBuild', heroId: plan.highlight[0] });
    expect(breakPlan(m, ids)).toBe(plan);
  });
});
