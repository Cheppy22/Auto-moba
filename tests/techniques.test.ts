// Piece builds with Techniques, phase 1 (SPEC-PIECE-BUILDS-2026-10-18 4.11): content, grades,
// offers, the AI's pick, "Pick for me", the break commands and gold, preview and attribution.
import { describe, expect, it } from 'vitest';
import {
  GRADES,
  Match,
  aiChoice,
  drawOffer,
  gradedTechnique,
  readyCombinations,
  scoreCard,
  techniqueText,
  type BuildSubject,
  type Grade,
  type MatchConfig,
  type PieceId,
} from '../src/sim';
import { CUSTOM_BEHAVIORS } from '../src/sim/combat';
import { computeStats } from '../src/sim/stats';
import { withTechnique } from '../src/sim/techniques';
import { content, liveMatch, logHash, piece, toBell } from './helpers';

const t = content.tuning;
const tech = (id: string) => content.techniqueById.get(id)!;
const subject = (over: Partial<BuildSubject> = {}): BuildSubject => ({
  seed: 7,
  team: 'A',
  piece: 'knight',
  style: null,
  rank: 1,
  held: [],
  schools: [],
  behind: false,
  ...over,
});

/** A browser-style match with Techniques at its first Act break (relics by the AI so Resume is open). */
function atBreak(seed: number, config: Partial<MatchConfig> = {}): Match {
  const m = liveMatch(seed, {
    techniques: true,
    pauseForBreak: true,
    relics: { A: 'ai' },
    ...config,
  });
  toBell(m, 'break');
  return m;
}

describe('Technique content', () => {
  it('loads a few Techniques per school, with the six slots and every pool', () => {
    const schools = new Set(content.techniques.map((d) => d.school));
    expect(schools.size).toBe(6);
    for (const pool of ['common', 'piece', 'archetype', 'combination'])
      expect(content.techniques.some((d) => d.pool === pool)).toBe(true);
    for (const p of ['king', 'queen', 'rook', 'bishop', 'knight'])
      expect(content.techniques.some((d) => d.piece === p && d.pool === 'piece')).toBe(true);
  });

  it('fills every number in the text from its own data, at every grade', () => {
    for (const d of content.techniques) {
      for (const g of GRADES) {
        const text = techniqueText(d, t.builds.grades[g]);
        expect(text.desc, d.id).not.toMatch(
          /\?|NaN|undefined|\{[A-Za-z][\w.]*\|(pct|mul|less|num)\}/,
        );
        if (d.dubious) expect(text.price!, d.id).toMatch(/The price/);
      }
      // no number is typed into the text by hand
      const bare = (s: string) => s.replace(/\{[A-Za-z][\w.]*\|(pct|mul|less|num)\}/g, '');
      expect(bare(d.desc), d.id).not.toMatch(/\d/);
      expect(bare(d.playsLike), d.id).not.toMatch(/\d/);
    }
  });

  it('uses only custom behaviours the engine has', () => {
    for (const d of content.techniques)
      for (const tr of [...d.triggers, ...(d.dubious?.triggers ?? [])])
        if (tr.custom) expect(CUSTOM_BEHAVIORS[tr.custom], `${d.id} ${tr.custom}`).toBeDefined();
  });

  it('gives Combinations two parents in different slots, and parent 1 the same slot', () => {
    for (const d of content.techniques.filter((x) => x.pool === 'combination')) {
      const [a, b] = d.parents!.map(tech);
      expect(a.slot).toBe(d.slot);
      expect(b.slot).not.toBe(a.slot);
    }
  });
});

describe('the full set (spec 4.3)', () => {
  it('holds 18 common, 20 piece (4 each), 30 archetype, 10 Combinations and 6 Dubious moved in', () => {
    const by = (pool: string) => content.techniques.filter((d) => d.pool === pool);
    const moved = ['hungry_mask', 'borrowed_years', 'lantern_of_the_drowned', 'pact_of_ash'];
    expect(by('common')).toHaveLength(18 + 6);
    for (const id of [...moved, 'drink_me', 'eat_me']) expect(tech(id).dubious, id).toBeDefined();
    expect(by('piece')).toHaveLength(20);
    for (const p of ['king', 'queen', 'rook', 'bishop', 'knight'])
      expect(by('piece').filter((d) => d.piece === p)).toHaveLength(4);
    expect(by('archetype')).toHaveLength(30);
    expect(by('combination')).toHaveLength(10);
    // each common school has three cards besides the six moved Dubious ones
    const commons = by('common').filter(
      (d) => !moved.includes(d.id) && d.id !== 'drink_me' && d.id !== 'eat_me',
    );
    for (const school of ['march', 'initiative', 'fortress', 'sacrifice', 'position', 'clock'])
      expect(
        commons.filter((d) => d.school === school),
        school,
      ).toHaveLength(3);
  });

  it('moves every Rank 8 option in as an archetype Technique with the same effect', () => {
    for (const p of content.pieces)
      for (const st of p.styles)
        for (const f of st.forks['8']) {
          const d = tech(f.id);
          expect(d.archetype).toBe(st.id);
          expect(d.mods).toEqual(f.mods);
          expect(d.triggers.map((x) => ({ ...x, desc: undefined }))).toEqual(
            f.triggers.map((x) => ({ ...x, desc: undefined })),
          );
          expect([d.cooldownMul, d.powerMul, d.radiusMul]).toEqual([
            f.cooldownMul,
            f.powerMul,
            f.radiusMul,
          ]);
        }
  });

  it('gives every named court five legal first moves, and Black takes them at the start', () => {
    for (const k of content.courts) expect(k.firstMoves, k.id).toBeDefined();
    const court = content.courts[0];
    const m = Match.create(content, {
      seed: 5,
      techniques: true,
      autoGambits: { A: true, B: true },
      setup: {
        B: {
          opening: court.opening,
          pieces: court.pieces.map((e) => ({ ...e, firstMove: court.firstMoves![e.piece] })),
        },
      },
    });
    m.issue({ type: 'setupTeam', ...m.defaultSetup() });
    m.step(1);
    for (const e of court.pieces)
      expect(piece(m, 'B', e.piece).hero!.techniques!.map((h) => h.id)).toEqual([
        court.firstMoves![e.piece],
      ]);
  });
});

describe('grades', () => {
  it('scale the bonus 1.5x at Sharp and 2x at Brilliant; counts, durations and the price stay', () => {
    const wind = tech('wind_up');
    const sharp = gradedTechnique(wind, t.builds.grades.sharp);
    const eff = sharp.triggers[0].effects[0] as { bladeScale: number };
    expect(eff.bladeScale).toBeCloseTo(1.5);
    expect(sharp.triggers[0].everyNth).toBe(4);
    const pin = gradedTechnique(tech('pin'), t.builds.grades.brilliant);
    const slow = pin.triggers[0].effects[0] as { value: number; durationSec: number };
    expect(slow.value).toBeCloseTo(0.2); // 40% slow -> 80%
    expect(slow.durationSec).toBe(1.5);
    const blood = gradedTechnique(tech('blood_price'), t.builds.grades.brilliant);
    expect(blood.mods[0].value).toBeCloseTo(1.4);
    const price = blood.dubious!.triggers[0].effects[0] as { maxHpPct: number };
    expect(price.maxHpPct).toBe(0.01);
    const walk = gradedTechnique(tech('kings_walk'), t.builds.grades.sharp);
    expect(walk.powerMul).toBeCloseTo(1.225);
    expect((walk.triggers[0].effects[0] as { durationSec: number }).durationSec).toBe(1);
    const counter = gradedTechnique(tech('counter_gambit'), t.builds.grades.sharp);
    expect(counter.cooldownMul).toBeCloseTo(0.775);
    const guard = gradedTechnique(tech('shared_guard'), t.builds.grades.brilliant);
    expect((guard.triggers[0].effects[0] as { share: number }).share).toBeCloseTo(1.2);
    expect(gradedTechnique(wind, 1.5)).toBe(sharp); // cached
    expect(techniqueText(wind, 2).desc).toMatch(/200% Blade/);
  });

  it('rolls one grade per offer with the table odds by break (10,000 draws)', () => {
    for (const at of [1, 2, 3]) {
      const n = 10000;
      const count: Record<Grade, number> = { plain: 0, sharp: 0, brilliant: 0 };
      for (let i = 0; i < n; i++) count[drawOffer(content, t, subject({ seed: i }), at, 0).grade]++;
      const odds = t.builds.gradeOdds[at];
      expect(count.plain / n).toBeCloseTo(odds[0], 1);
      expect(count.sharp / n).toBeCloseTo(odds[1], 1);
      expect(count.brilliant / n).toBeCloseTo(odds[2], 1);
    }
    for (let i = 0; i < 200; i++)
      expect(drawOffer(content, t, subject({ seed: i }), 0, 0).grade).toBe('plain');
  });
});

describe('offers', () => {
  it('are the same for the same seed and change with it, and with each reroll', () => {
    const a = drawOffer(content, t, subject(), 1, 0);
    expect(drawOffer(content, t, subject(), 1, 0)).toEqual(a);
    const others = [1, 2, 3, 4, 5].map((s) =>
      drawOffer(content, t, subject({ seed: 100 + s }), 1, 0),
    );
    expect(others.some((o) => JSON.stringify(o.cards) !== JSON.stringify(a.cards))).toBe(true);
    const rerolls = [1, 2, 3].map((r) => drawOffer(content, t, subject(), 1, r, a.grade));
    expect(rerolls.some((o) => JSON.stringify(o.cards) !== JSON.stringify(a.cards))).toBe(true);
    expect(rerolls.every((o) => o.grade === a.grade)).toBe(true);
  });

  it('hold three cards: own pool, common pool, wild; one per slot; never a held card', () => {
    for (let seed = 0; seed < 300; seed++) {
      const held = [{ id: 'family_fork', grade: 'plain' as Grade }];
      const o = drawOffer(content, t, subject({ seed, held }), 1, 0);
      expect(o.cards).toHaveLength(3);
      const defs = o.cards.map((c) => tech(c.id));
      expect(new Set(defs.map((d) => d.slot)).size).toBe(3);
      expect(defs.some((d) => d.id === 'family_fork')).toBe(false);
      expect(defs[0].piece).toBe('knight');
      expect(defs[1].pool).toBe('common');
      for (const d of defs) {
        expect(d.slot).not.toBe('signature'); // locked before Rank 4
        expect(d.pool).not.toBe('combination');
        if (d.piece) expect(d.piece).toBe('knight');
      }
    }
  });

  it('offer archetype cards only to that archetype, in the Signature slot', () => {
    let seen = 0;
    for (let seed = 0; seed < 300; seed++) {
      const hunt = drawOffer(
        content,
        t,
        subject({ seed, piece: 'queen', style: 'huntress', rank: 4 }),
        1,
        0,
      );
      const ids = hunt.cards.map((c) => c.id);
      expect(ids).not.toContain('duelist_cuts');
      if (ids.includes('huntress_split')) seen++;
      const generic = drawOffer(content, t, subject({ seed, piece: 'queen' }), 1, 0);
      expect(generic.cards.map((c) => c.id)).not.toContain('huntress_split');
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("draw the Opening's schools more often", () => {
    const share = (schools: BuildSubject['schools']): number => {
      let hits = 0;
      let all = 0;
      for (let seed = 0; seed < 2000; seed++) {
        for (const c of drawOffer(content, t, subject({ seed, schools }), 1, 0).cards) {
          all++;
          if (tech(c.id).school === 'fortress') hits++;
        }
      }
      return hits / all;
    };
    expect(share(['fortress', 'position'])).toBeGreaterThan(share([]) * 1.3);
  });

  it('deal a ready Combination as the wild card, at its parents’ higher grade', () => {
    const held = [
      { id: 'wind_up', grade: 'sharp' as Grade },
      { id: 'spare_minute', grade: 'plain' as Grade },
    ];
    const subj = subject({ held });
    expect(readyCombinations(content, subj).map((d) => d.id)).toEqual(['windmill']);
    const o = drawOffer(content, t, subj, 2, 0);
    expect(o.cards[2]).toEqual({ id: 'windmill', grade: 'sharp' });
    expect(o.cards.slice(0, 2).every((c) => tech(c.id).slot !== 'attack')).toBe(true);
    // taking it upgrades parent 1 into it, in its slot; parent 2 stays
    const after = withTechnique(content, held, 'windmill', 'sharp').map((h) => h.id);
    expect(after).toEqual(['windmill', 'spare_minute']);
    // parent 1 is folded in: never offered again
    for (let seed = 0; seed < 100; seed++) {
      const later = drawOffer(
        content,
        t,
        subject({ seed, held: withTechnique(content, held, 'windmill', 'sharp') }),
        3,
        0,
      );
      expect(later.cards.map((c) => c.id)).not.toContain('wind_up');
    }
  });
});

describe('the AI pick', () => {
  it('takes the best-scored card, the same every time; a Combination wins', () => {
    const subj = subject({
      held: [
        { id: 'wind_up', grade: 'plain' },
        { id: 'spare_minute', grade: 'plain' },
      ],
    });
    const o = drawOffer(content, t, subj, 2, 0);
    const i = aiChoice(content, t, subj, o.cards, 2)!;
    expect(o.cards[i].id).toBe('windmill');
    const scores = o.cards.map((c) => scoreCard(content, t, subj, c, 2));
    expect(scores[i]).toBe(Math.max(...scores));
    expect(aiChoice(content, t, subj, o.cards, 2)).toBe(i);
  });

  it('fills an empty slot before replacing a held card', () => {
    const subj = subject({ held: [{ id: 'the_vault', grade: 'brilliant' }] });
    const fill = scoreCard(content, t, subj, { id: 'pin', grade: 'plain' }, 1);
    const swap = scoreCard(content, t, subj, { id: 'toll', grade: 'plain' }, 1);
    expect(fill).toBeGreaterThan(swap);
  });
});

describe('a match without Techniques', () => {
  it('has no build state and plays as before', () => {
    const m = liveMatch(3);
    expect(m.state.builds).toBeUndefined();
    expect(piece(m, 'A', 'queen').hero!.techniques).toBeUndefined();
    expect(m.firstMoves()).toBeNull();
    expect(m.issue({ type: 'autoBuild', heroId: null }).ok).toBe(false);
  });
});

describe('a match with Techniques', () => {
  it('deals First moves at Setup, as the setup view showed, and honours the player’s pick', () => {
    const m = Match.create(content, {
      seed: 41,
      techniques: true,
      autoGambits: { A: true, B: true },
    });
    const view = m.firstMoves()!;
    expect(view.pieces).toHaveLength(5);
    expect(view.pieces.filter((p) => p.highlight).length).toBeGreaterThanOrEqual(1);
    expect(view.pieces.filter((p) => p.highlight).length).toBeLessThanOrEqual(2);
    const setup = m.defaultSetup();
    const knight = view.pieces.find((p) => p.piece === 'knight')!;
    const other = knight.cards.findIndex((_c, i) => i !== knight.suggested);
    const pieces = setup.pieces.map((e) =>
      e.piece === 'knight' ? { ...e, firstMove: knight.cards[other].id } : e,
    );
    m.issue({ type: 'setupTeam', opening: setup.opening, pieces });
    for (const p of view.pieces) {
      const u = piece(m, 'A', p.piece as PieceId);
      const want = p.piece === 'knight' ? other : p.suggested!;
      expect(u.hero!.techniques!.map((x) => x.id)).toEqual([p.cards[want].id]);
    }
    for (const id of m.state.teams.B.heroIds)
      expect(m.unitById(id)!.hero!.techniques).toHaveLength(1);
  });

  it('opens offers at the break: take, pass, reroll and upgrade by gold; Black is not White’s', () => {
    const m = atBreak(12);
    const k = piece(m, 'A', 'knight');
    const q = piece(m, 'A', 'queen');
    const r = piece(m, 'A', 'rook');
    const b = piece(m, 'A', 'bishop');
    expect(m.state.builds!.offers).toHaveLength(10);
    // Black already picked; its pieces are not White's
    const bk = piece(m, 'B', 'knight');
    expect(m.state.builds!.offers.find((o) => o.heroId === bk.id)!.decided).toBe('taken');
    expect(m.issue({ type: 'takeTechnique', heroId: bk.id, cardIndex: 0 }).ok).toBe(false);
    // reroll: 200, then 300
    k.hero!.gold = 1000;
    const before = m.buildView(k.id)!.offer!.cards.map((c) => c.id);
    expect(m.issue({ type: 'rerollOffer', heroId: k.id }).ok).toBe(true);
    expect(k.hero!.gold).toBe(800);
    expect(m.buildView(k.id)!.offer!.rerollCost).toBe(300);
    expect(m.issue({ type: 'rerollOffer', heroId: k.id }).ok).toBe(true);
    expect(k.hero!.gold).toBe(500);
    expect(m.buildView(k.id)!.offer!.cards.map((c) => c.id)).not.toEqual(before);
    k.hero!.gold = 100;
    expect(m.issue({ type: 'rerollOffer', heroId: k.id }).reason).toBe('not enough gold');
    // take
    const view = m.buildView(k.id)!;
    expect(m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 1 }).ok).toBe(true);
    expect(k.hero!.techniques!.map((x) => x.id)).toContain(view.offer!.cards[1].id);
    expect(m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 0 }).ok).toBe(false);
    // pass gives gold
    const g = q.hero!.gold;
    expect(m.issue({ type: 'passOffer', heroId: q.id }).ok).toBe(true);
    expect(q.hero!.gold).toBe(g + t.builds.passGold);
    // upgrade Plain -> Sharp -> Brilliant, then no more
    const held = r.hero!.techniques![0];
    held.grade = 'plain';
    r.hero!.gold = 2000;
    expect(m.issue({ type: 'upgradeTechnique', heroId: r.id, techniqueId: held.id }).ok).toBe(true);
    expect(r.hero!.gold).toBe(1400);
    expect(m.issue({ type: 'upgradeTechnique', heroId: r.id, techniqueId: held.id }).ok).toBe(true);
    expect(r.hero!.gold).toBe(200);
    expect(r.hero!.techniques![0].grade).toBe('brilliant');
    expect(m.issue({ type: 'upgradeTechnique', heroId: r.id, techniqueId: held.id }).reason).toBe(
      'already Brilliant',
    );
    // Resume: the untouched bishop takes exactly the card the AI suggested
    const sugg = m.buildView(b.id)!.offer!;
    const want = sugg.cards[sugg.suggested!].id;
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
    expect(b.hero!.techniques!.map((x) => x.id)).toContain(want);
    expect(m.state.builds!.open).toBe(false);
    expect(m.issue({ type: 'autoBuild', heroId: null }).ok).toBe(false);
  });

  it('"Let the AI choose" takes the card "AI suggests" marks; advice highlights 1-2 pieces', () => {
    const m = atBreak(13);
    const advice = m.buildAdvice('A');
    expect(advice.pieces).toHaveLength(5);
    expect(advice.highlight.length).toBeGreaterThanOrEqual(1);
    expect(advice.highlight.length).toBeLessThanOrEqual(2);
    const top = Math.max(...advice.pieces.map((p) => p.stakes));
    expect(advice.pieces.find((p) => p.heroId === advice.highlight[0])!.stakes).toBe(top);
    for (const p of advice.pieces) {
      const v = m.buildView(p.heroId)!;
      expect(v.offer!.suggested).toBe(p.pick);
      const want = v.offer!.cards[p.pick!].id;
      expect(m.issue({ type: 'autoBuild', heroId: p.heroId }).ok).toBe(true);
      expect(m.unitById(p.heroId)!.hero!.techniques!.map((x) => x.id)).toContain(want);
    }
  });

  it('gives a piece that reached Rank 8 a Brilliant offer, once', () => {
    const m = liveMatch(14, { techniques: true, pauseForBreak: true, relics: { A: 'ai' } });
    toBell(m, 'halt');
    const q = piece(m, 'A', 'queen');
    q.hero!.rank = 8;
    toBell(m, 'break');
    const o = m.state.builds!.offers.find((x) => x.heroId === q.id)!;
    expect(o.grade).toBe('brilliant');
    expect(m.state.builds!.brilliantUsed).toContain(q.id);
  });

  it('previews exactly the stats the piece has after taking the card', () => {
    const m = atBreak(15);
    const q = piece(m, 'A', 'queen');
    const v = m.buildView(q.id)!;
    for (const [i, card] of v.offer!.cards.entries()) {
      if (i !== 0) continue;
      const p = card.preview!;
      expect(m.issue({ type: 'takeTechnique', heroId: q.id, cardIndex: i }).ok).toBe(true);
      const now = computeStats(m.ctx, q).stats;
      expect(now).toEqual(p.after);
    }
  });

  it('replays the same with build commands', () => {
    const m = atBreak(16);
    const k = piece(m, 'A', 'knight');
    k.hero!.gold += 0;
    m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 2 });
    m.issue({ type: 'passOffer', heroId: piece(m, 'A', 'queen').id });
    m.issue({ type: 'resumeAct' });
    m.step(2000);
    const again = Match.fromReplay(content, m.exportReplay());
    expect(logHash(again)).toBe(logHash(m));
  });

  it('counts what each Technique did: its trigger damage adds up to its damage events', () => {
    const m = liveMatch(17, { techniques: true });
    m.runToEnd(6);
    const b = m.state.builds!;
    let checked = 0;
    for (const [key, row] of Object.entries(b.match)) {
      const [hero, id] = key.split(':');
      const def = tech(id);
      if (def.powerMul !== 1) continue; // skill boosts are credited a share of the skill
      let sum = 0;
      for (const e of m.events)
        if (
          e.type === 'damage' &&
          e.payload.src === Number(hero) &&
          e.payload.origin === `item:tech:${id}`
        )
          sum += e.payload.amount;
      expect(row.damage).toBeCloseTo(sum, -1);
      if (sum > 0) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is deterministic headless, AI on both sides', () => {
    const a = liveMatch(18, { techniques: true });
    a.runToEnd(4);
    const b = liveMatch(18, { techniques: true });
    b.runToEnd(4);
    expect(logHash(a)).toBe(logHash(b));
    expect(a.events.filter((e) => e.type === 'technique').length).toBeGreaterThanOrEqual(10);
  });
});

describe('a match without items', () => {
  it('buys nothing and grows health and the main damage stat by builds.rankGrowth', () => {
    const m = liveMatch(19, { items: false, relics: { A: 'none', B: 'none' } });
    m.step(20 * 200);
    expect(m.events.some((e) => e.type === 'purchase')).toBe(false);
    const g = t.builds.rankGrowth;
    const other = t.ranks.growth;
    for (const id of ['queen', 'bishop'] as PieceId[]) {
      const u = piece(m, 'A', id);
      const bare = {
        ...u,
        mods: [],
        hero: { ...u.hero!, rank: 5, style: null, perks: [], items: [] },
      };
      const s = computeStats(m.ctx, bare).stats;
      const base = u.base;
      const soulMain = base.soulPower > base.bladeDmg;
      expect(s.maxHp).toBeCloseTo(base.maxHp * (1 + g.health * 4), 6);
      const main = soulMain ? 'soulPower' : 'bladeDmg';
      const off = soulMain ? 'bladeDmg' : 'soulPower';
      expect(s[main]).toBeCloseTo(base[main] * (1 + g.damage * 4), 6);
      expect(s[off]).toBeCloseTo(base[off] * (1 + other * 4), 6);
    }
    const q = piece(m, 'A', 'queen');
    expect(m.issue({ type: 'buy', heroId: q.id, item: content.items[0].id }).ok).toBe(false);
  });
});
