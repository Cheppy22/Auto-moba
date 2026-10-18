import { describe, expect, it } from 'vitest';
import type { Match, PlayTeam, School } from '../src/sim';
import { SCHOOLS } from '../src/sim/content/schema';
import { playGambit } from '../src/sim/gambits';
import { openingMatchups } from '../src/ui/setup/data';
import { content, liveMatch, toAct } from './helpers';

// Phase C of SPEC-GAMBITS-OPENINGS-2026-10-18: eight Openings, each with an opening card.

const TPS = content.tuning.tickRate;

/** A live match with both Openings pinned and no card AI, so only the test plays cards. */
function withOpenings(seed: number, a: string, b: string, ai = false): Match {
  const base = liveMatch(seed).defaultSetup();
  return liveMatch(seed, {
    setup: { A: { ...base, opening: a }, B: { ...base, opening: b } },
    autoGambits: { A: ai, B: ai },
  });
}

const hand = (m: Match, team: PlayTeam): (string | null)[] =>
  m.state.hands[team].map((h) => h.cardId);
const school = (id: string): School => content.gambitById.get(id)!.school;

describe('Openings: content', () => {
  it('has eight Openings, each with an opening card from its own schools (Italian has none)', () => {
    expect(content.openings).toHaveLength(8);
    const card = (o: string): string | null => content.openingById.get(o)!.openingCard;
    expect(card('italian')).toBeNull();
    expect(
      [
        'sicilian',
        'french',
        'kings_gambit',
        'english',
        'scandinavian',
        'kings_indian',
        'caro_kann',
      ].map(card),
    ).toEqual([
      'fork',
      'hold_the_file',
      'pawn_sacrifice',
      'increment',
      'check',
      'exchange',
      'fortify',
    ]);
    for (const o of content.openings) {
      if (o.openingCard === null) {
        expect(o.schools, o.id).toEqual([]);
        continue;
      }
      expect(content.gambitById.has(o.openingCard), o.id).toBe(true);
      expect(o.schools, o.id).toContain(school(o.openingCard));
      expect(o.schools, o.id).toHaveLength(2);
    }
  });

  it('puts every school in at least two Openings', () => {
    for (const sc of SCHOOLS) {
      const n = content.openings.filter((o) => o.schools.includes(sc)).length;
      expect(n, sc).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives each enemy school one verdict per Opening, never two', () => {
    for (const o of content.openings) {
      const { strongVs, evenVs, weakVs } = openingMatchups(o.schools);
      const all = [...strongVs, ...evenVs, ...weakVs].map((m) => m.other);
      expect(new Set(all).size, o.id).toBe(all.length);
    }
  });

  it('matches the spec’s table of verdicts', () => {
    const verdicts = (id: string): Record<string, string[]> => {
      const { strongVs, evenVs, weakVs } = openingMatchups(content.openingById.get(id)!.schools);
      return {
        good: strongVs.map((m) => m.other),
        even: evenVs.map((m) => m.other),
        weak: weakVs.map((m) => m.other),
      };
    };
    expect(verdicts('english')).toEqual({
      good: ['sacrifice'],
      even: ['march'],
      weak: ['initiative'],
    });
    expect(verdicts('scandinavian')).toEqual({
      good: ['sacrifice', 'position'],
      even: ['fortress'],
      weak: ['march'],
    });
    expect(verdicts('kings_indian')).toEqual({
      good: ['fortress'],
      even: ['position'],
      weak: ['clock'],
    });
    expect(verdicts('caro_kann')).toEqual({
      good: [],
      even: ['march', 'initiative', 'sacrifice'],
      weak: [],
    });
  });

  it('points every court at a real Opening, and every Opening is some court’s', () => {
    for (const k of content.courts) expect(content.openingById.has(k.opening), k.id).toBe(true);
    const used = new Set(content.courts.map((k) => k.opening));
    for (const o of content.openings) expect(used.has(o.id), o.id).toBe(true);
  });

  it('switches the four named courts to the new Openings', () => {
    const opening = (id: string): string => content.courts.find((k) => k.id === id)!.opening;
    expect(opening('clockmaker')).toBe('english');
    expect(opening('lady-marlow')).toBe('caro_kann');
    expect(opening('black-queen')).toBe('scandinavian');
    expect(opening('mirrorgate')).toBe('kings_indian');
    expect(opening('brasswick')).toBe('italian');
  });
});

describe('The opening card', () => {
  it('is in both sides’ first hand, flagged, for every Opening with one', () => {
    for (const o of content.openings) {
      if (!o.openingCard) continue;
      const m = withOpenings(11, o.id, o.id);
      for (const team of ['A', 'B'] as const) {
        expect(m.state.hands[team][0], `${o.id} ${team}`).toMatchObject({
          cardId: o.openingCard,
          opening: true,
        });
        expect(m.snapshot().hand[0]).toMatchObject({ cardId: o.openingCard, opening: true });
        // the other two cards are ordinary, and never a copy
        expect(m.state.hands[team].slice(1).some((h) => h.opening)).toBe(false);
        expect(hand(m, team).filter((c) => c === o.openingCard)).toHaveLength(1);
      }
    }
  });

  it('is each side’s own: White and Black can open differently', () => {
    const m = withOpenings(12, 'sicilian', 'caro_kann');
    expect(m.state.hands.A[0].cardId).toBe('fork');
    expect(m.state.hands.B[0].cardId).toBe('fortify');
  });

  it('does not expire while Act 1 runs, and is an ordinary card once Act 2 starts', () => {
    const m = withOpenings(13, 'kings_indian', 'italian');
    const expire = content.tuning.gambits.expireSec * TPS;
    m.step(expire * 3);
    expect(m.state.phase.n).toBe(1);
    expect(m.state.hands.A[0]).toMatchObject({ cardId: 'exchange', opening: true });
    expect(m.snapshot().hand[0].ticksLeft).toBeGreaterThan(0);
    // ordinary cards were replaced meanwhile
    toAct(m, 2);
    m.step(1);
    expect(m.state.phase.n).toBe(2);
    expect(m.state.hands.A[0].opening).toBeUndefined();
    expect(m.state.hands.A[0].expireTick).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('is cleared when it is played, and the slot refills like any other', () => {
    const m = withOpenings(14, 'english', 'italian');
    m.state.tempo.A = 100;
    expect(m.issue({ type: 'playGambit', slot: 0 }).ok).toBe(true);
    const slot = m.state.hands.A[0];
    expect(slot.cardId).toBeNull();
    expect(slot.opening).toBeUndefined();
    expect(slot.refillTick).not.toBeNull();
    m.step(content.tuning.gambits.refillSec * TPS + 2);
    expect(m.state.hands.A[0].cardId).not.toBeNull();
    expect(m.state.hands.A[0].opening).toBeUndefined();
  });

  it('costs its normal price', () => {
    const m = withOpenings(15, 'caro_kann', 'italian');
    expect(m.snapshot().hand[0].cost).toBe(content.gambitById.get('fortify')!.cost);
  });

  it('stays in the hand when Opening Book redeals the others', () => {
    const m = withOpenings(16, 'scandinavian', 'italian');
    m.state.hands.A[1] = {
      cardId: 'opening_book',
      expireTick: m.state.tick + 9999,
      refillTick: null,
    };
    m.state.tempo.A = 100;
    const other = m.state.hands.A[2].cardId;
    expect(m.issue({ type: 'playGambit', slot: 1 }).ok).toBe(true);
    expect(m.state.hands.A[0]).toMatchObject({ cardId: 'check', opening: true });
    expect(other).not.toBeNull();
  });

  it('loses its mark when Zugzwang takes it', () => {
    const m = withOpenings(17, 'caro_kann', 'italian');
    m.state.hands.B = [
      { cardId: 'zugzwang', expireTick: m.state.tick + 9999, refillTick: null },
      { cardId: null, expireTick: 0, refillTick: m.state.tick + 9999 },
      { cardId: null, expireTick: 0, refillTick: m.state.tick + 9999 },
    ];
    m.state.hands.A[1] = { cardId: 'advance', expireTick: m.state.tick + 9999, refillTick: null };
    m.state.hands.A[2] = { cardId: 'regroup', expireTick: m.state.tick + 9999, refillTick: null };
    m.state.tempo.B = 100;
    // Fortify and Regroup both cost 17: the first dearest card is taken
    expect(playGambit(m.ctx, 'B', 0, {}).ok).toBe(true);
    expect(m.state.hands.A[0]).toMatchObject({ cardId: null });
    expect(m.state.hands.A[0].opening).toBeUndefined();
  });

  it('with the Italian Game, deals three different schools and no opening card', () => {
    for (let seed = 20; seed < 60; seed++) {
      const m = withOpenings(seed, 'italian', 'italian');
      for (const team of ['A', 'B'] as const) {
        const cards = hand(m, team).filter((c): c is string => c !== null);
        expect(cards, `${seed} ${team}`).toHaveLength(3);
        expect(new Set(cards.map(school)).size, `${seed} ${team}`).toBe(3);
        expect(m.state.hands[team].some((h) => h.opening)).toBe(false);
      }
    }
  });
});

describe('Opening choice', () => {
  it('draws Black’s random Opening from all eight', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) seen.add(liveMatch(seed).state.opening.B);
    expect(seen.size).toBe(8);
  });
});
