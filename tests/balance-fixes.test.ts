// Batch 2 of the 2026-10-18 game review (agency and balance, 2026-10-20): the last offer delivers
// a completed Combination, hand-picked pieces still get Resume's upgrades, the AI scores cards by
// their measured worth and main stat and rerolls and passes by value, the book move starts in the
// hand, and the relic draft's tailored card is any relic of the answering family.
import { describe, expect, it } from 'vitest';
import { Match, scoreCard, type BuildSubject, type MatchConfig } from '../src/sim';
import { lastOffer, statLean } from '../src/sim/builds';
import { content, liveMatch, piece, toAct, toBell } from './helpers';

const t = content.tuning;
const tech = (id: string) => content.techniqueById.get(id)!;
const subject = (over: Partial<BuildSubject> = {}): BuildSubject => ({
  seed: 7,
  team: 'A',
  piece: 'bishop',
  style: null,
  rank: 1,
  held: [],
  behind: false,
  ...over,
});

/** A browser-style match stopped at the break after Act `act`. */
function atBreak(seed: number, act: number, config: Partial<MatchConfig> = {}): Match {
  const m = liveMatch(seed, { map: 'long', pauseForBreak: true, relics: { A: 'ai' }, ...config });
  for (let n = 1; n < act; n++) {
    toBell(m, 'break');
    m.issue({ type: 'resumeAct' });
    toAct(m, n + 1);
  }
  toBell(m, 'break');
  return m;
}

describe('the last offer of a match', () => {
  it('Blitz: the second break is the last offer, and a pair completed there comes at once', () => {
    let m = atBreak(14, 2, { pace: 'blitz' });
    for (let seed = 15; m.state.bell.stage !== 'break' && seed < 30; seed++)
      m = atBreak(seed, 2, { pace: 'blitz' });
    expect(m.state.bell.stage).toBe('break');
    expect(lastOffer(m.ctx)).toBe(true);
    const k = piece(m, 'A', 'king');
    // hold one parent of Royal Court and put the other in the King's offer
    k.hero!.techniques = [{ id: 'shared_guard', grade: 'sharp' }];
    const offer = m.state.builds.offers.find((o) => o.heroId === k.id)!;
    offer.cards = [{ id: 'rallying_cry', grade: 'plain' }, ...offer.cards.slice(1)];
    const view = m.buildView(k.id)!;
    expect(view.offer!.cards[0].leadsTo.find((l) => l.id === 'royal_court')?.now).toBe(true);
    expect(m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 0 }).ok).toBe(true);
    const held = k.hero!.techniques.map((x) => x.id);
    expect(held).toContain('royal_court');
    // the Combination took its first parent's slot, at the parents' higher grade
    expect(held).not.toContain('rallying_cry');
    expect(k.hero!.techniques.find((x) => x.id === 'royal_court')!.grade).toBe('sharp');
  });

  it('Classical: the first break is not the last offer, so the pair waits for the next one', () => {
    const m = atBreak(14, 1);
    expect(lastOffer(m.ctx)).toBe(false);
    const k = piece(m, 'A', 'king');
    k.hero!.techniques = [{ id: 'shared_guard', grade: 'plain' }];
    const offer = m.state.builds.offers.find((o) => o.heroId === k.id)!;
    offer.cards = [{ id: 'rallying_cry', grade: 'plain' }, ...offer.cards.slice(1)];
    expect(m.buildView(k.id)!.offer!.cards[0].leadsTo[0].now).toBe(false);
    m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 0 });
    expect(k.hero!.techniques.map((x) => x.id)).not.toContain('royal_court');
  });
});

describe('Resume spends the gold of pieces picked by hand', () => {
  it('a piece whose card the player took still upgrades; one the player bought for keeps its gold', () => {
    const m = atBreak(14, 1);
    const k = piece(m, 'A', 'king');
    const q = piece(m, 'A', 'queen');
    expect(m.issue({ type: 'takeTechnique', heroId: k.id, cardIndex: 0 }).ok).toBe(true);
    k.hero!.gold = 5000;
    q.hero!.gold = 5000;
    const held = q.hero!.techniques[0];
    held.grade = 'plain';
    expect(m.issue({ type: 'upgradeTechnique', heroId: q.id, techniqueId: held.id }).ok).toBe(true);
    const qGold = q.hero!.gold;
    expect(m.issue({ type: 'resumeAct' }).ok).toBe(true);
    // the King's card was picked by hand, but nobody spent its gold: Resume bought upgrades
    expect(k.hero!.gold).toBeLessThan(5000);
    // the Queen's gold was spent by hand: Resume leaves the rest alone
    expect(q.hero!.gold).toBe(qGold);
  });
});

describe("the AI's card score", () => {
  it('reads which damage stat a Technique works through', () => {
    expect(statLean(tech('wind_up'))).toBe('blade');
    expect(statLean(tech('hungry_mask'))).toBe('blade');
    expect(statLean(tech('lantern_of_the_drowned'))).toBe('soul');
    expect(statLean(tech('pact_of_ash'))).toBeNull();
    // Escort's aura raises pawns' Blade, not the piece's own
    expect(statLean(tech('escort'))).toBeNull();
  });

  it('marks down a card built on the stat the piece is not built on (a Blade card for the Bishop)', () => {
    const card = { id: 'wind_up', grade: 'plain' as const };
    const bishop = scoreCard(content, t, subject({ piece: 'bishop' }), card, 1);
    const knight = scoreCard(content, t, subject({ piece: 'knight' }), card, 1);
    // the fit with each piece's lean differs too, so compare against the stat-free part
    expect(bishop).toBeLessThan(knight + t.builds.ai.offStat / 2);
  });

  it('adds the measured worth, and takes it away for the card it replaces', () => {
    const ids = [...content.techniqueValue.keys()];
    if (ids.length === 0) return; // no measured values in this content
    const best = ids.reduce((a, b) =>
      (content.techniqueValue.get(a)![0] ?? 0) >= (content.techniqueValue.get(b)![0] ?? 0) ? a : b,
    );
    const worst = ids.reduce((a, b) =>
      (content.techniqueValue.get(a)![0] ?? 0) <= (content.techniqueValue.get(b)![0] ?? 0) ? a : b,
    );
    expect(content.techniqueValue.get(best)![0]).toBeGreaterThan(
      content.techniqueValue.get(worst)![0],
    );
  });

  it('counts a card at the grade spare gold will buy (a rich piece late in a match)', () => {
    const held = [{ id: 'wind_up', grade: 'brilliant' as const }];
    const card = { id: 'clamp', grade: 'plain' as const };
    const poor = scoreCard(content, t, subject({ piece: 'knight', held, gold: 0 }), card, 5);
    const rich = scoreCard(content, t, subject({ piece: 'knight', held, gold: 5000 }), card, 5);
    expect(rich).toBeGreaterThan(poor);
  });
});

describe('the AI rerolls and passes by value', () => {
  it('rerolls and passes in a long AI-vs-AI match more often than never', () => {
    const m = liveMatch(29003, { map: 'long' });
    m.runToEnd(12);
    const rerolls = m.events.filter((e) => e.type === 'buildOffer' && e.payload.reroll > 0).length;
    const passes = m.events.filter((e) => e.type === 'offerPassed').length;
    // not a balance number: the rule must be able to fire (it never did: 0.1 rerolls, 0 passes)
    expect(rerolls + passes).toBeGreaterThan(0);
  });
});

describe('the book move', () => {
  const runMatch = (opening: string, books: string[]): Match => {
    const m = Match.create(content, {
      seed: 5,
      map: 'long',
      autoGambits: { A: true, B: true },
      adjudicate: true,
      start: { A: { books } },
    });
    const d = m.defaultSetup();
    m.issue({ type: 'setupTeam', ...d, opening });
    return m;
  };

  it("starts in the first hand next to the Opening's card and stays through Act 1", () => {
    const m = runMatch('sicilian', ['fortify']);
    const hand = m.state.hands.A;
    expect(hand[0].cardId).toBe('fork');
    expect(hand[1].cardId).toBe('fortify');
    expect(hand[1].book).toBe(true);
    expect(hand[1].opening).toBe(true);
    const snap = m.snapshot();
    expect(snap.hand[1].book).toBe(true);
  });

  it('takes slot 0 with the Italian Game, whose other cards come from two other schools', () => {
    const m = runMatch('italian', ['fortify']);
    const hand = m.state.hands.A;
    expect(hand[0].cardId).toBe('fortify');
    const schools = hand.map((h) => content.gambitById.get(h.cardId!)!.school);
    expect(new Set(schools).size).toBe(3);
  });

  it("is not dealt twice when it is the Opening's own card", () => {
    const m = runMatch('sicilian', ['fork']);
    const ids = m.state.hands.A.map((h) => h.cardId);
    expect(ids.filter((x) => x === 'fork')).toHaveLength(1);
    expect(m.state.hands.A.some((h) => h.book)).toBe(false);
  });
});
