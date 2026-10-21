import { describe, expect, it } from 'vitest';
import type { GameEvent, Match, PlayTeam } from '../src/sim';
import { sealableUnder } from '../src/sim';
import { blackPlayLine, cardResult } from '../src/analysis/feedback';
import { aiCardPick, playGambit } from '../src/sim/gambits';
import { cardCost, heldRelic } from '../src/sim/relics';
import { content, liveMatch, piece, runAi } from './helpers';

// The Clock school (spec SPEC-GAMBITS-OPENINGS-2026-10-18, phase A): Zugzwang, Time Trouble,
// Opening Book and Increment.

const TPS = content.tuning.tickRate;
const card = (id: string) => content.gambitById.get(id)!;
const param = (id: string, key: string): number => card(id).params[key];

/** A live match where only the test plays cards (no gambit AI on either side). */
const quiet = (seed: number): Match => liveMatch(seed, { autoGambits: { A: false, B: false } });

/** Sets a side's whole hand (null for an empty slot); cards never expire during the test. */
function setHand(m: Match, team: PlayTeam, cards: (string | null)[]): void {
  m.state.hands[team] = cards.map((cardId) => ({
    cardId,
    expireTick: m.state.tick + 9999,
    refillTick: cardId === null ? m.state.tick + 9999 : null,
  }));
}

function play(m: Match, slot = 0): { ok: boolean; reason?: string } {
  return m.issue({ type: 'playGambit', slot });
}

const gambitEvents = (m: Match): Extract<GameEvent, { type: 'gambit' }>['payload'][] =>
  m.events.flatMap((e) => (e.type === 'gambit' ? [e.payload] : []));

describe('Clock school cards', () => {
  it('Zugzwang discards the enemy’s dearest card at its line and that slot refills after its time', () => {
    const m = quiet(301);
    setHand(m, 'A', ['zugzwang', 'advance', null]);
    m.state.tempo.A = 100;
    // nothing dear enough in Black's hand: the card cannot be played
    setHand(m, 'B', ['advance', 'hold_the_file', 'open_file']);
    expect(m.snapshot().hand[0]).toMatchObject({ usable: false, school: 'clock' });
    expect(play(m).reason).toMatch(new RegExp(`${param('zugzwang', 'minCost')}\\+`));
    // Fork is dearer than Check; Advance is below the line
    setHand(m, 'B', ['check', 'advance', 'fork']);
    const tempo = m.state.tempo.A;
    expect(play(m).ok).toBe(true);
    expect(m.state.tempo.A).toBe(tempo - card('zugzwang').cost);
    const hand = m.state.hands.B;
    expect(hand.map((h) => h.cardId)).toEqual(['check', 'advance', null]);
    const refill = param('zugzwang', 'refillSec') * TPS;
    expect(hand[2].refillTick).toBe(m.state.tick + refill);
    expect(gambitEvents(m).at(-1)).toMatchObject({
      team: 'A',
      cardId: 'zugzwang',
      discarded: 'fork',
    });
    m.step(refill - 1);
    expect(m.state.hands.B[2].cardId).toBeNull();
    m.step(2);
    expect(m.state.hands.B[2].cardId).not.toBeNull();
    expect(m.state.hands.B[2].discarded).toBeUndefined();
  });

  it('Zugzwang on White shows the discarded slot and its longer refill in the hand', () => {
    const m = quiet(302);
    setHand(m, 'B', ['zugzwang', null, null]);
    m.state.tempo.B = 100;
    // White's dearest card is one it would play now (Time Trouble fits: Black holds 45+ Tempo)
    setHand(m, 'A', ['advance', 'time_trouble', 'open_file']);
    m.state.tempo.A = 50;
    expect(aiCardPick(m.ctx, 'B', true)?.slot).toBe(0);
    expect(playGambit(m.ctx, 'B', 0, {}).ok).toBe(true);
    const slot = m.snapshot().hand[1];
    expect(slot).toMatchObject({ cardId: '', discarded: true });
    expect(slot.refillTotal).toBe(param('zugzwang', 'refillSec') * TPS);
  });

  it('Time Trouble drains 20 Tempo and slows the enemy’s income by 30% for 20 s', () => {
    const m = quiet(303);
    setHand(m, 'A', ['time_trouble', null, null]);
    m.state.tempo.A = 100;
    m.state.tempo.B = 50;
    expect(play(m).ok).toBe(true);
    expect(m.state.tempo.B).toBe(50 - param('time_trouble', 'drain'));
    expect(gambitEvents(m).at(-1)).toMatchObject({
      cardId: 'time_trouble',
      drained: param('time_trouble', 'drain'),
    });
    // 10 s of income: Black's is slowed, White's is not
    const tally = { ...m.state.actTally.tempo };
    m.step(10 * TPS);
    const gainA = m.state.actTally.tempo.A - tally.A;
    const gainB = m.state.actTally.tempo.B - tally.B;
    expect(gainA).toBeGreaterThan(0);
    expect(gainB).toBeCloseTo(gainA * param('time_trouble', 'incomeMul'), 0);
    expect(m.snapshot().clock.slowTicks).toBe(0); // White is not slowed
    // after the window income is back to normal
    m.step(11 * TPS);
    expect(m.state.tempoSlow.B && m.state.tick < m.state.tempoSlow.B.untilTick).toBe(false);
    // the card's measured drain: the 20 now plus the income held back
    const end = m.events.find((e) => e.type === 'gambitEnd' && e.payload.cardId === 'time_trouble');
    expect(end?.type === 'gambitEnd' && end.payload.drained).toBeGreaterThan(
      param('time_trouble', 'drain'),
    );
  });

  it('Time Trouble drains no more than the enemy holds', () => {
    const m = quiet(304);
    setHand(m, 'A', ['time_trouble', null, null]);
    m.state.tempo.A = 100;
    m.state.tempo.B = 6;
    expect(play(m).ok).toBe(true);
    expect(m.state.tempo.B).toBe(0);
  });

  it('White sees its own slowed income on the Tempo meter', () => {
    const m = quiet(305);
    setHand(m, 'B', ['time_trouble', null, null]);
    m.state.tempo.B = 100;
    m.state.tempo.A = 60;
    expect(playGambit(m.ctx, 'B', 0, {}).ok).toBe(true);
    expect(m.state.tempo.A).toBe(60 - param('time_trouble', 'drain'));
    expect(m.snapshot().clock.slowTicks).toBeGreaterThan(18 * TPS);
  });

  it('Opening Book redeals the other cards from the Opening’s two schools', () => {
    const m = quiet(306);
    m.state.opening.A = 'sicilian';
    const schools = content.openingById.get('sicilian')!.schools;
    for (let i = 0; i < 6; i++) {
      setHand(m, 'A', ['hold_the_file', 'opening_book', 'barricade']);
      m.state.tempo.A = 100;
      expect(play(m, 1).ok).toBe(true);
      const hand = m.state.hands.A;
      expect(hand[1].cardId).toBeNull(); // the book's own slot refills as a played card does
      for (const i of [0, 2]) {
        const id = hand[i].cardId!;
        expect(schools).toContain(card(id).school);
        expect(hand[i].expireTick).toBe(m.state.tick + content.tuning.gambits.expireSec * TPS);
      }
      m.step(1);
    }
    const end = () =>
      m.events.find((e) => e.type === 'gambitEnd' && e.payload.cardId === 'opening_book');
    m.step(5 * TPS);
    const e = end();
    expect(e?.type === 'gambitEnd' && e.payload.cards).toBe(2);
  });

  it('Opening Book under the Italian Game redeals from any school', () => {
    const m = quiet(307);
    m.state.opening.A = 'italian';
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      setHand(m, 'A', ['opening_book', 'advance', 'check']);
      m.state.tempo.A = 100;
      expect(play(m, 0).ok).toBe(true);
      for (const h of m.state.hands.A.slice(1)) seen.add(card(h.cardId!).school);
      m.step(1);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('Increment gives 5 Tempo back on each card for 30 s, never below a net 3', () => {
    const m = quiet(308);
    setHand(m, 'A', ['increment', 'advance', 'pawn_sacrifice']);
    m.state.tempo.A = 100;
    expect(play(m, 0).ok).toBe(true);
    expect(m.snapshot().clock).toMatchObject({ refund: param('increment', 'refund') });
    // Advance (10) nets 5
    let before = m.state.tempo.A;
    expect(m.issue({ type: 'playGambit', slot: 1, lane: 'top' }).ok).toBe(true);
    expect(before - m.state.tempo.A).toBe(card('advance').cost - param('increment', 'refund'));
    // a cheap card nets at least the minimum, never less
    const refund = param('increment', 'refund');
    const min = content.tuning.gambits.minCost;
    const sac = card('pawn_sacrifice').cost;
    setHand(m, 'A', [null, 'pawn_sacrifice', 'hold_the_file']);
    m.state.tempo.A = 100;
    m.issue({ type: 'fieldPawn', lane: 'top' });
    before = m.state.tempo.A;
    expect(m.issue({ type: 'playGambit', slot: 1, lane: 'top' }).ok).toBe(true);
    expect(before - m.state.tempo.A).toBe(Math.max(min, sac - refund));
    // spending counts the full price; the give-back is income
    expect(m.state.tempoSpent.A.cards).toBe(
      card('increment').cost + card('advance').cost + card('pawn_sacrifice').cost,
    );
    // after 30 s nothing comes back
    m.step(31 * TPS);
    m.state.tempo.A = 100;
    expect(m.issue({ type: 'playGambit', slot: 2, lane: 'mid' }).ok).toBe(true);
    expect(m.state.tempo.A).toBe(100 - card('hold_the_file').cost);
    const end = m.events.find((e) => e.type === 'gambitEnd' && e.payload.cardId === 'increment');
    expect(end?.type === 'gambitEnd' && end.payload.refund).toBe(
      refund + Math.min(refund, sac - min),
    );
  });

  it('Increment with Opening Theory: a card at the 3-Tempo minimum gets nothing back', () => {
    const m = quiet(309);
    const min = content.tuning.gambits.minCost;
    // Increment itself is the cheapest card: in a Clock Opening, Opening Theory takes it to 3
    m.state.opening.A = content.openings.find((o) => o.schools.includes('clock'))!.id;
    m.state.relics.held.A.push(heldRelic('opening_theory', { id: 'opening_theory' }));
    const inc = card('increment');
    expect(cardCost(m.ctx, 'A', inc)).toBe(min);
    m.state.increment.A = { value: param('increment', 'refund'), untilTick: m.state.tick + 600 };
    setHand(m, 'A', ['increment', null, null]);
    m.state.tempo.A = 50;
    expect(m.issue({ type: 'playGambit', slot: 0 }).ok).toBe(true);
    expect(m.state.tempo.A).toBe(50 - min);
  });

  it('Sealed Move never holds Increment or Opening Book', () => {
    for (const o of ['italian', 'sicilian']) {
      expect(sealableUnder(content, o, 'increment')).toBe(false);
      expect(sealableUnder(content, o, 'opening_book')).toBe(false);
    }
    expect(sealableUnder(content, 'italian', 'zugzwang')).toBe(true);
    expect(sealableUnder(content, 'italian', 'time_trouble')).toBe(true);
    expect(sealableUnder(content, 'sicilian', 'time_trouble')).toBe(false);
  });
});

describe('Clock school AI plans', () => {
  /** The AI's pick for Black with only `id` in slot 0 and `rest` after it, whatever the Tempo. */
  const pickFor = (m: Match, id: string, rest: (string | null)[] = [null, null]) => {
    setHand(m, 'B', [id, ...rest]);
    return aiCardPick(m.ctx, 'B', true);
  };

  it('Time Trouble fires when the enemy holds 45+ Tempo, stronger in a fight', () => {
    const m = quiet(320);
    m.state.tempo.A = 30;
    expect(pickFor(m, 'time_trouble')).toBeNull();
    m.state.tempo.A = 60;
    const calm = pickFor(m, 'time_trouble')!.plan.score;
    expect(calm).toBeGreaterThanOrEqual(1);
    piece(m, 'A', 'rook').lastDamagedTick = m.state.tick;
    expect(pickFor(m, 'time_trouble')!.plan.score).toBeGreaterThan(calm);
    // not again while the enemy is already slowed
    m.state.tempoSlow.A = { value: 0.7, untilTick: m.state.tick + 100 };
    expect(pickFor(m, 'time_trouble')).toBeNull();
  });

  it('Zugzwang fires when the enemy holds a dear card it would play now and nearly the Tempo', () => {
    const m = quiet(321);
    m.state.tempo.B = 60; // White's Time Trouble fits (Black holds 45+)
    setHand(m, 'A', ['advance', 'open_file', null]);
    m.state.tempo.A = 90;
    expect(pickFor(m, 'zugzwang')).toBeNull();
    setHand(m, 'A', ['advance', 'time_trouble', null]);
    m.state.tempo.A = 2;
    expect(pickFor(m, 'zugzwang')).toBeNull();
    m.state.tempo.A = card('time_trouble').cost - 5;
    expect(pickFor(m, 'zugzwang')!.plan.score).toBeGreaterThanOrEqual(1);
    // a dear card with no use on the board yet (Fork with no enemy in the Knight's reach) is left
    setHand(m, 'A', ['advance', 'fork', null]);
    m.state.tempo.A = 90;
    expect(pickFor(m, 'zugzwang')).toBeNull();
  });

  it('Increment fires with the Tempo for itself and another card ready to play, ahead of it', () => {
    const m = quiet(322);
    m.state.tempo.A = 80; // Black's Time Trouble fits
    m.state.tempo.B = card('increment').cost + card('time_trouble').cost - 1;
    expect(pickFor(m, 'increment', ['time_trouble', null])?.slot).not.toBe(0);
    m.state.tempo.B = 80;
    expect(pickFor(m, 'increment', ['time_trouble', null])?.slot).toBe(0);
    m.state.tempo.A = 10; // now Time Trouble does not fit, so neither does Increment
    expect(pickFor(m, 'increment', ['time_trouble', null])).toBeNull();
    // two hand cards never wait on each other
    expect(pickFor(m, 'increment', ['opening_book', null])).toBeNull();
  });

  it('Opening Book fires when neither other card has fitted for 15 s and Tempo is 50+', () => {
    const m = quiet(323);
    m.state.tempo.B = 80;
    m.state.tempo.A = 0; // Time Trouble and Zugzwang have nothing to aim at
    const stale = (): void => {
      for (const h of m.state.hands.B) h.expireTick = m.state.tick + 20 * TPS;
    };
    setHand(m, 'B', ['opening_book', 'time_trouble', 'zugzwang']);
    expect(aiCardPick(m.ctx, 'B', true)).toBeNull(); // dealt just now
    stale();
    expect(aiCardPick(m.ctx, 'B', true)?.slot).toBe(0);
    m.state.tempo.B = 40;
    expect(aiCardPick(m.ctx, 'B', true)).toBeNull();
    m.state.tempo.B = 80;
    setHand(m, 'A', ['advance', 'open_file', null]);
    m.state.tempo.A = 80; // Time Trouble fits now: no digging
    expect(aiCardPick(m.ctx, 'B', true)?.slot).toBe(1);
  });

  it('the AI plays every Clock card in ordinary AI-vs-AI matches', () => {
    const played = new Set<string>();
    // seeds until the four have come up within four Acts each
    for (let seed = 25; played.size < 4 && seed < 40; seed++) {
      const m = runAi(seed, 4);
      for (const g of gambitEvents(m)) if (card(g.cardId).school === 'clock') played.add(g.cardId);
    }
    expect([...played].sort()).toEqual(['increment', 'opening_book', 'time_trouble', 'zugzwang']);
  }, 180_000);
});

describe('Clock school words', () => {
  const none = {
    dealt: 0,
    structure: 0,
    taken: 0,
    bonus: 0,
    prevented: 0,
    healed: 0,
    kills: 0,
    deaths: 0,
    met: 0,
    drained: 0,
    refund: 0,
    cards: 0,
  };

  it('impact lines say what each Clock card did', () => {
    expect(cardResult('time_trouble', { ...none, drained: 26.2 }, 20)).toBe('drained 26 Tempo');
    expect(cardResult('zugzwang', { ...none, cards: 1 }, 1, { fell: false, card: 'Fork' })).toBe(
      'discarded Fork',
    );
    expect(cardResult('zugzwang', { ...none, cards: 2 }, 2)).toBe('discarded 2 cards');
    expect(cardResult('increment', { ...none, refund: 15 }, 30)).toBe('gave back 15 Tempo');
    expect(cardResult('increment', none, 30)).toBe('ran 30 s');
    expect(cardResult('opening_book', { ...none, cards: 2 }, 1)).toBe('redealt 2 cards');
  });

  it('Black’s banner names what you lose', () => {
    const where = { lane: null, piece: null, structure: null };
    const p = { team: 'B' as const, cardId: 'zugzwang' };
    expect(blackPlayLine('Zugzwang', 'none', p, { ...where, discarded: 'Fork' })).toBe(
      'Black played Zugzwang: your Fork is discarded',
    );
    expect(
      blackPlayLine('Time Trouble', 'none', { ...p, cardId: 'time_trouble', drained: 20 }, where),
    ).toBe('Black played Time Trouble: you lose 20 Tempo');
    expect(blackPlayLine('Increment', 'none', { ...p, cardId: 'increment' }, where)).toBe(
      'Black played Increment',
    );
  });
});
