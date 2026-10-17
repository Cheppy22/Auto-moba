import { describe, expect, it } from 'vitest';
import {
  aimRunRelic,
  aiReward,
  applyReward,
  beginMatch,
  betterFinish,
  finishLabel,
  finishOf,
  generateOpponents,
  Match,
  newRun,
  nextMatchConfig,
  openingEdge,
  outcomeOf,
  recordResult,
  revealOpponent,
  rewardOffers,
  setArchetype,
  type CarriedRelic,
  type Content,
  type MatchConfig,
  type MatchOutcome,
  type RunState,
} from '../src/sim';
import { drawWeight } from '../src/sim/gambits';
import { adjudicate } from '../src/sim/runRules';
import { aiTempoTurn } from '../src/sim/pawnPlan';
import { giveGold } from '../src/sim/shop';
import { content, liveMatch, logHash, piece, toBell } from './helpers';

const T = content.tournament!;
const outcome = (won: boolean, o: Partial<MatchOutcome> = {}): MatchOutcome => ({
  winner: won ? 'A' : 'B',
  minutes: 12,
  adjudicated: false,
  mvp: null,
  relics: [],
  styles: {},
  items: {},
  ...o,
});
const carried = (id: string, aim: Partial<CarriedRelic> = {}): CarriedRelic => ({
  id,
  lane: null,
  piece: null,
  card: null,
  trigger: null,
  quota: null,
  reserve: null,
  ...aim,
});
/** Plays the current round's match as `won` without a sim (run steps only). */
function step(run: RunState, won: boolean, o: Partial<MatchOutcome> = {}): RunState {
  const b = beginMatch(content, run, run.court);
  if (!b.ok) throw new Error(b.reason);
  return recordResult(content, b.run, outcome(won, o));
}
function take(run: RunState): RunState {
  const r = applyReward(content, run, aiReward(content, run)!);
  if (!r.ok) throw new Error(r.reason);
  return r.run;
}
/** A relic with nothing to aim (so it fits any court), other than Battery. */
const plain = content.relics.filter((r) => r.bind === 'none' && !r.rally).map((r) => r.id);
const pieceRelic = content.relics.find((r) => r.bind === 'piece')!;
const laneRelic = content.relics.find((r) => r.bind === 'lane' && r.id !== 'battery')!;

/** A run match config as the browser builds it, ending after one short Act. */
function shortMatch(config: Partial<MatchConfig>, seed = 41): Match {
  const m = liveMatch(seed, config);
  m.ctx.t = { ...m.ctx.t, maxPhases: 1 };
  m.runToEnd();
  return m;
}

/** The content without its hand-made courts: the generated stand-ins (the fallback when `courts.json` is missing). */
const standIn: Content = { ...content, courts: [], courtById: new Map() };

describe('Tournament run: the generated stand-ins (fallback)', () => {
  it('is the same for the same seed and follows the round table', () => {
    const a = generateOpponents(standIn, 77);
    expect(generateOpponents(standIn, 77)).toEqual(a);
    expect(generateOpponents(standIn, 78).map((o) => o.name)).not.toEqual(a.map((o) => o.name));
    expect(a.map((o) => o.round)).toEqual([1, 2, 3, 4]);
    expect(a.map((o) => o.relics.length)).toEqual(T.rounds.map((r) => r.relics));
    expect(a.map((o) => o.tempoBonus)).toEqual(T.rounds.map((r) => r.tempoBonus));
    expect(a[3].name).toBe("The Black Queen's Court");
    expect(new Set(a.map((o) => o.name)).size).toBe(4);
    for (const o of a.slice(0, 3)) expect(T.names).toContain(o.name);
    for (const o of a) expect(new Set(o.relics.map((r) => r.id)).size).toBe(o.relics.length);
  });

  it('gives the Semifinal and Final an Opening that does best against yours', () => {
    let run = newRun(standIn, 5);
    run.court.opening = 'kings_gambit';
    const best = Math.max(
      ...content.openings.map((o) => openingEdge(o.schools, ['sacrifice', 'march'])),
    );
    for (const i of [2, 3]) {
      const o = revealOpponent(standIn, run, i);
      const schools = content.openingById.get(o.setup.opening)!.schools;
      expect(openingEdge(schools, ['sacrifice', 'march'])).toBe(best);
      expect(o.setup.opening).toBe('french');
      expect(o.relics).toHaveLength(T.rounds[i].relics);
    }
    // Club and County keep their seeded Opening
    expect(revealOpponent(standIn, run, 1)).toEqual(run.opponents[1]);
    run = step(take(step(run, true)), true);
    expect(run.round).toBe(2);
    expect(run.opponents[2].setup.opening).toBe('french');
  });
});

describe('Tournament run: steps', () => {
  it('win -> Spoils -> next round; a loss ends the run', () => {
    const run = newRun(content, 11);
    expect(run.status).toBe('between');
    expect(nextMatchConfig(content, run).seed).toBe(nextMatchConfig(content, run).seed);
    const won = step(run, true, { items: { king: 2, queen: 4, rook: 1, bishop: 3, knight: 5 } });
    expect(won.round).toBe(1);
    expect(won.status).toBe('between');
    expect(won.offers!.map((o) => o.kind)).toEqual(['relic', 'heirloom', 'book']);
    expect(() => nextMatchConfig(content, won)).toThrow(/reward/);
    expect(beginMatch(content, won, won.court).ok).toBe(false);
    const next = take(won);
    expect(next.offers).toBeNull();
    expect(nextMatchConfig(content, next).seed).not.toBe(nextMatchConfig(content, run).seed);
    const lost = step(next, false);
    expect(lost.status).toBe('out');
    expect(lost.results.map((r) => r.won)).toEqual([true, false]);
    expect(finishOf(lost)).toEqual({ v: 1, round: 1, champion: false });
    expect(() => nextMatchConfig(content, lost)).toThrow();
    // the input run is never changed
    expect(run.results).toHaveLength(0);
  });

  it('a dead tie counts as a loss; winning the Final makes a champion', () => {
    expect(step(newRun(content, 3), false, { winner: null, adjudicated: true }).status).toBe('out');
    let run = newRun(content, 3);
    for (let i = 0; i < 3; i++) run = take(step(run, true));
    run = step(run, true);
    expect(run.status).toBe('champion');
    expect(run.offers).toBeNull();
    expect(run.results).toHaveLength(4);
    const f = finishOf(run)!;
    expect(finishLabel(content, f)).toBe('Champion');
    expect(finishLabel(content, { v: 1, round: 3, champion: false })).toBe('Reached the Final');
    expect(betterFinish({ v: 1, round: 3, champion: false }, f)).toBe(f);
    expect(betterFinish(f, { v: 1, round: 2, champion: false })).toBe(f);
  });

  it('carries court, archetypes and relics; resets the rest (fresh match)', () => {
    let run = newRun(content, 21);
    const court = { ...run.court, opening: 'french' };
    const b = beginMatch(content, run, court);
    expect(b.ok && b.run.court.opening).toBe('french');
    if (!b.ok) return;
    run = recordResult(
      content,
      b.run,
      outcome(true, {
        styles: { queen: 'duelist' },
        relics: [carried(pieceRelic.id, { piece: 'knight' })],
      }),
    );
    expect(run.court.opening).toBe('french');
    expect(run.archetypes).toEqual({ queen: 'duelist' });
    expect(run.relics.map((r) => r.id)).toEqual([pieceRelic.id]);
    run = take(run);
    // Run kit: change and clear archetypes, re-aim a relic
    const kit = setArchetype(content, run, 'rook', content.pieceById.get('rook')!.styles[0].id);
    expect(kit.ok).toBe(true);
    if (!kit.ok) return;
    expect(setArchetype(content, kit.run, 'rook', 'nope').ok).toBe(false);
    const cleared = setArchetype(content, kit.run, 'queen', null);
    expect(cleared.ok && cleared.run.archetypes.queen).toBeUndefined();
    const aimed = aimRunRelic(content, kit.run, pieceRelic.id, { piece: 'bishop' });
    expect(aimed.ok && aimed.run.relics[0].piece).toBe('bishop');
    expect(aimRunRelic(content, kit.run, pieceRelic.id, { piece: null }).ok).toBe(false);
    const cfg = nextMatchConfig(content, kit.run);
    expect(cfg.lockStyles?.A).toEqual({ queen: 'duelist', rook: kit.run.archetypes.rook });
    expect(cfg.adjudicate).toBe(true);
    expect(cfg.relicMax).toBe(5);
    expect(cfg.setup?.A).toBeUndefined();
    expect(nextMatchConfig(content, kit.run, true).setup?.A).toEqual(kit.run.court);
    expect(cfg.start?.B?.tempoBonus).toBe(5);
    expect(cfg.start?.A?.relics?.map((r) => r.id)).toEqual(kit.run.relics.map((r) => r.id));
    // a piece that did not reach Rank 4 keeps its earlier archetype
    const b2 = beginMatch(content, kit.run, kit.run.court);
    if (!b2.ok) return;
    const after = recordResult(content, b2.run, outcome(true, { styles: { king: 'warlord' } }));
    expect(after.archetypes).toEqual({ ...kit.run.archetypes, king: 'warlord' });
  });
});

describe('Tournament run: rewards', () => {
  const won = (seed: number): RunState => step(newRun(content, seed), true, { items: { rook: 0 } });

  it('offers one of each kind, the same cards after a reload', () => {
    const run = won(31);
    expect(rewardOffers(content, run, { rook: 0 })).toEqual(run.offers);
    const [relic, heirloom, book] = run.offers!;
    expect(relic.kind).toBe('relic');
    if (heirloom.kind !== 'heirloom' || book.kind !== 'book') throw new Error('kinds');
    // the piece with the fewest items at the end of the match gets the heirloom card
    const counts = { king: 3, queen: 4, rook: 1, bishop: 2, knight: 6 };
    const h = rewardOffers(content, run, counts).find((o) => o.kind === 'heirloom');
    expect(h && h.kind === 'heirloom' && h.piece).toBe('rook');
    const item = content.itemById.get(heirloom.item)!;
    expect(item.tier).toBeLessThanOrEqual(2);
    expect(item.cost).toBeLessThanOrEqual(T.heirloomMaxPrice);
    const schools = content.openingById.get(run.court.opening)!.schools;
    if (schools.length) expect(schools).toContain(content.gambitById.get(book.card)!.school);
  });

  it('applies each kind; the AI takes a relic while there is room', () => {
    const run = won(32);
    expect(aiReward(content, run)?.kind).toBe('relic');
    for (const offer of run.offers!) {
      const r = applyReward(content, run, offer);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      if (offer.kind === 'relic') expect(r.run.relics.map((x) => x.id)).toContain(offer.relic);
      if (offer.kind === 'heirloom') expect(r.run.heirlooms[offer.piece]).toBe(offer.item);
      if (offer.kind === 'book') expect(r.run.books).toEqual([offer.card]);
    }
    expect(applyReward(content, run, { kind: 'book', card: 'nope' }).ok).toBe(false);
  });

  it('with the relic row full the AI weighs the heirloom against the book move by gold', () => {
    const full: RunState = {
      ...won(34),
      relics: plain.slice(0, T.relicMax).map((id) => carried(id)),
    };
    const book = full.offers!.find((o) => o.kind === 'book')!;
    const heirloom = (cost: number) => {
      const item = content.items.find((i) => i.tier <= 2 && i.cost === cost)!;
      return { kind: 'heirloom' as const, piece: 'rook' as const, item: item.id };
    };
    const cheap = heirloom(
      Math.min(...content.items.filter((i) => i.tier === 1).map((i) => i.cost)),
    );
    const dear = heirloom(
      Math.max(...content.items.filter((i) => i.tier === 2).map((i) => i.cost)),
    );
    expect(content.itemById.get(cheap.item)!.cost).toBeLessThan(T.aiBookGold);
    expect(content.itemById.get(dear.item)!.cost).toBeGreaterThan(T.aiBookGold);
    expect(aiReward(content, { ...full, offers: [full.offers![0], cheap, book] })).toEqual(book);
    expect(aiReward(content, { ...full, offers: [full.offers![0], dear, book] })).toEqual(dear);
  });

  it('swaps a relic when five are held', () => {
    const base = newRun(content, 33);
    const b = beginMatch(content, base, base.court);
    if (!b.ok) throw new Error(b.reason);
    const five = plain.slice(0, 5).map((id) => carried(id));
    const run = recordResult(
      content,
      b.run,
      outcome(true, { relics: [...five, carried(plain[5])] }),
    );
    expect(run.relics).toHaveLength(5);
    const relic = run.offers!.find((o) => o.kind === 'relic')!;
    expect(aiReward(content, run)?.kind).not.toBe('relic');
    expect(applyReward(content, run, relic).ok).toBe(false);
    if (relic.kind !== 'relic') return;
    const r = applyReward(content, run, { ...relic, replaces: five[0].id });
    expect(r.ok && r.run.relics.map((x) => x.id)).toEqual([
      ...five.slice(1).map((x) => x.id),
      relic.relic,
    ]);
  });
});

describe('Tournament run: in the match', () => {
  it('a match without run fields has no run state (Exhibition unchanged)', () => {
    const m = liveMatch(9);
    expect(m.state.run).toBeUndefined();
    expect('max' in m.snapshot().relics).toBe(false);
  });

  it('places carried relics by piece type, heirlooms, book moves and Tempo', () => {
    const heir = content.items.find((i) => i.tier === 2)!;
    const book = content.gambits.find((g) => g.weight > 0)!;
    const m = liveMatch(12, {
      relicMax: 5,
      start: {
        A: {
          relics: [
            carried(pieceRelic.id, { piece: 'knight' }),
            carried(laneRelic.id, { lane: 'bot' }),
          ],
          heirlooms: { rook: heir.id },
          books: [book.id],
        },
        B: { relics: [carried(plain[0])], tempoBonus: 15 },
      },
    });
    const held = m.state.relics.held.A;
    expect(held.find((h) => h.id === pieceRelic.id)!.piece).toBe(piece(m, 'A', 'knight').id);
    expect(held.find((h) => h.id === laneRelic.id)!.lane).toBe('bot');
    expect(m.state.relics.held.B.map((h) => h.id)).toEqual([plain[0]]);
    const rook = piece(m, 'A', 'rook');
    expect(rook.hero!.items).toEqual([heir.id]);
    expect(rook.hp).toBe(rook.stats.maxHp);
    expect(piece(m, 'A', 'queen').hero!.items).toEqual([]);
    expect(m.state.tempo.B - m.state.tempo.A).toBe(15);
    const withBook = drawWeight(m.ctx, 'A')(book);
    m.state.run!.books.A = [];
    expect(withBook).toBe(2 * drawWeight(m.ctx, 'A')(book));
    expect(m.snapshot().relics.max).toBe(5);
  });

  it('a carried aim that no longer fits falls back to the default aim', () => {
    const m = liveMatch(13, {
      start: { A: { relics: [carried(pieceRelic.id, { piece: null })] } },
    });
    const h = m.state.relics.held.A[0];
    expect(h.id).toBe(pieceRelic.id);
    expect(h.piece).not.toBeNull();
  });

  it('holds up to five relics in a run; a draft at the cap is replace-or-decline', () => {
    const five = plain.slice(0, 5).map((id) => carried(id));
    const m = liveMatch(14, {
      pauseForBreak: true,
      relicMax: 5,
      start: { A: { relics: [...five, carried(plain[5])] } },
    });
    expect(m.state.relics.held.A).toHaveLength(5);
    toBell(m, 'break');
    const offer = m.state.relics.offers.A[0];
    expect(m.issue({ type: 'pickRelic', relicId: offer.id }).reason).toMatch(/five relics/);
    expect(m.issue({ type: 'pickRelic', relicId: offer.id, replace: plain[0] }).ok).toBe(true);
    expect(m.state.relics.held.A).toHaveLength(5);
  });

  it("Black's own cap (the round table's relicMax) stops its starting relics and its drafts", () => {
    const m = liveMatch(17, {
      pauseForBreak: true,
      relicMax: 5,
      relicMaxB: 1,
      start: { B: { relics: plain.slice(0, 3).map((id) => carried(id)) } },
    });
    expect(m.state.relics.held.B).toHaveLength(1);
    toBell(m, 'break');
    m.issue({ type: 'autoRelic' });
    m.issue({ type: 'resumeAct' });
    expect(m.state.relics.held.B).toHaveLength(1);
    // the round table passes it on, only for a round that sets one, and never below the relics
    // the court starts with (a Club court drafts none but keeps its signature relic)
    const run = newRun(content, 35);
    const rows = T.rounds.map((r) => r.relicMax);
    expect(nextMatchConfig(content, run).relicMaxB).toBe(
      Math.max(rows[0]!, run.opponents[0].relics.length),
    );
  });

  it("the round table's aiPawnShare sets Black's Tempo split for that match only", () => {
    const run = newRun(content, 35);
    const share = T.rounds[0].aiPawnShare;
    expect(nextMatchConfig(content, run).aiPawnShareB).toBe(share);
    const m = liveMatch(17, { aiPawnShareB: 1 });
    expect(m.state.run?.aiPawnShareB).toBe(1);
    // with every Tempo owed to pawns, Black holds its cards while a lane is short
    m.state.tempoSpent.B = { pawns: 0, cards: 0 };
    expect(aiTempoTurn(m.ctx, 'B')).toBe('pawns');
    m.state.tempoSpent.B = { pawns: 1000, cards: 1 };
    expect(aiTempoTurn(m.ctx, 'B')).toBe('pawns');
    expect(liveMatch(17).state.run).toBeUndefined();
  });

  it('lockStyles resolves Rank 4 at once and still pauses Rank 8', () => {
    const duelist = 'duelist';
    const m = liveMatch(15, {
      autoGambits: { A: false, B: true },
      pauseForForks: true,
      lockStyles: { A: { queen: duelist } },
    });
    const q = piece(m, 'A', 'queen');
    giveGold(m.ctx, q, 1e6, 'test');
    expect(q.hero!.style).toBe(duelist);
    const fork = m.events.find((e) => e.type === 'fork' && e.payload.id === q.id);
    expect(fork?.type === 'fork' && fork.payload.locked).toBe(true);
    expect(m.state.forks.filter((f) => f.heroId === q.id).map((f) => f.rank)).toEqual([8]);
    // an unlocked piece still waits at Rank 4
    const r = piece(m, 'A', 'rook');
    giveGold(m.ctx, r, 1e6, 'test');
    expect(m.state.forks.filter((f) => f.heroId === r.id).map((f) => f.rank)).toContain(4);
  });

  it('adjudicates by Bastions destroyed, then Throne health; a tie is null', () => {
    const m = liveMatch(16);
    expect(adjudicate(m.ctx)).toBeNull();
    m.ctx.guardians.B!.hp -= 100;
    expect(adjudicate(m.ctx)).toBe('A');
    m.ctx.towers.A.top[0].alive = false;
    expect(adjudicate(m.ctx)).toBe('B');
    m.ctx.towers.B.mid[0].alive = false;
    expect(adjudicate(m.ctx)).toBe('A');
  });

  it('ends a match without Checkmate with a winner only when asked; carries by piece type', () => {
    const relics = [carried(pieceRelic.id, { piece: 'bishop' })];
    const run = shortMatch({ adjudicate: true, relicMax: 5, start: { A: { relics } } });
    expect(run.state.phase.kind).toBe('end');
    const end = run.events.findLast((e) => e.type === 'matchEnd')!;
    expect(end.type === 'matchEnd' && end.payload.adjudicated).toBe(true);
    expect(run.state.winner).toBe(adjudicate(run.ctx));
    const o = outcomeOf(run, 'queen');
    expect(o.adjudicated).toBe(true);
    expect(o.relics.find((r) => r.id === pieceRelic.id)!.piece).toBe('bishop');
    expect(o.mvp).toBe('queen');
    const plainEnd = shortMatch({});
    expect(plainEnd.state.winner).toBeNull();
    expect(outcomeOf(plainEnd).adjudicated).toBe(false);
  });

  it('a run match replays the same (determinism)', () => {
    const run = newRun(content, 61);
    const cfg = { ...nextMatchConfig(content, run, true), map: 'long' as const };
    const a = Match.create(content, cfg);
    const b = Match.create(content, cfg);
    a.step(2400);
    b.step(2400);
    expect(logHash(a)).toBe(logHash(b));
    expect(a.state.relics.held.B).toEqual(b.state.relics.held.B);
  });
});
