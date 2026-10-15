// Tournament run steps (spec 1B): a run is four matches; win to go on, lose once and it is over.
// Court, archetypes and relics carry; items, gold, Ranks, Tempo, pawns and health reset (every
// match is a fresh `Match`). Every function returns a new `RunState` and never changes its input.
import { TPS } from '../combat';
import type { Content } from '../content/loader';
import { PIECE_IDS, SEALED_TRIGGERS, type LaneId, type PieceId } from '../content/schema';
import { mixSeed, seedStreams } from '../core/rng';
import { sealableUnder } from '../draft';
import type { Match } from '../match';
import { aiSetup, validateSetup } from '../setup';
import type { CarriedRelic, MatchConfig, TeamSetup } from '../types';
import { LANES } from '../world/map';
import { generateOpponents, revealOpponent, tournamentOf } from './opponents';
import { rewardOffers } from './rewards';
import type { BestFinish, MatchOutcome, RunMatchResult, RunPace, RunState, RunStep } from './types';

/** The seed of a run's match in a round (0..3). */
export const matchSeed = (runSeed: number, round: number): number =>
  mixSeed(runSeed, 'match', round);

const copySetup = (t: TeamSetup): TeamSetup => ({
  opening: t.opening,
  pieces: t.pieces.map((e) => ({ ...e })),
});

/**
 * A new run: the draw of four courts and, as White's court, the same default the first match's
 * Setup would pre-fill. Classical only until 2B (the pace is kept for it).
 */
export function newRun(c: Content, seed: number, pace: RunPace = 'classical'): RunState {
  tournamentOf(c);
  return {
    v: 1,
    seed,
    pace,
    round: 0,
    opponents: generateOpponents(c, seed),
    court: aiSetup(c, seedStreams(matchSeed(seed, 0))),
    archetypes: {},
    relics: [],
    heirlooms: {},
    books: [],
    results: [],
    offers: null,
    status: 'between',
  };
}

/** The round's name ("Club", "County", "Semifinal", "Final"). */
export const roundName = (c: Content, round: number): string =>
  tournamentOf(c).rounds[round]?.name ?? '';

/**
 * The config for the current round's match: its seed, Black's court, both sides' start, White's
 * carried archetypes, adjudication and the run's relic cap. The browser adds its own flags
 * (pauses, map) and plays White's court through Setup; `withCourt` fixes it for headless runs.
 */
export function nextMatchConfig(c: Content, run: RunState, withCourt = false): MatchConfig {
  if (run.status === 'champion' || run.status === 'out') throw new Error('the run is over');
  if (run.offers) throw new Error('pick a reward first');
  const opp = run.opponents[run.round];
  const t = tournamentOf(c);
  const capB = t.rounds[run.round]?.relicMax;
  return {
    seed: matchSeed(run.seed, run.round),
    setup: { B: copySetup(opp.setup), ...(withCourt ? { A: copySetup(run.court) } : {}) },
    start: {
      A: {
        relics: run.relics.map((r) => ({ ...r, quota: r.quota ? { ...r.quota } : null })),
        heirlooms: { ...run.heirlooms },
        books: [...run.books],
      },
      B: { relics: opp.relics.map((r) => ({ ...r })), tempoBonus: opp.tempoBonus },
    },
    lockStyles: { A: { ...run.archetypes } },
    adjudicate: true,
    relicMax: t.relicMax,
    ...(capB !== undefined ? { relicMaxB: capB } : {}),
    ...(opp.styles ? { forceStyles: { B: { ...opp.styles } } } : {}),
    // 2B (Blitz) adds its pace settings here from `run.pace`; Classical uses the defaults.
  };
}

/** The match begins with this court (Setup's Begin): the run is `playing` until its result. */
export function beginMatch(c: Content, run: RunState, court: TeamSetup): RunStep {
  if (run.status !== 'between' || run.offers)
    return { ok: false, reason: 'no match is due in this run' };
  const err = validateSetup(c, court);
  if (err) return { ok: false, reason: err };
  return { ok: true, run: { ...structuredClone(run), court: copySetup(court), status: 'playing' } };
}

/**
 * What a finished match hands the run: the winner, length, adjudication, White's relics (by piece
 * type), archetypes and item counts. `mvp` is White's best piece from the report, if the caller
 * has one.
 */
export function outcomeOf(match: Match, mvp: PieceId | null = null): MatchOutcome {
  const s = match.state;
  if (s.phase.kind !== 'end') throw new Error('the match has not ended');
  const pieceOf = (id: number | null): PieceId | null =>
    id === null ? null : (match.unitById(id)?.hero?.defId ?? null);
  const styles: MatchOutcome['styles'] = {};
  const items: MatchOutcome['items'] = {};
  for (const id of s.teams.A.heroIds) {
    const h = match.unitById(id)?.hero;
    if (!h) continue;
    if (h.style) styles[h.defId] = h.style;
    items[h.defId] = h.items.length;
  }
  const end = match.events.findLast((e) => e.type === 'matchEnd');
  return {
    winner: s.winner,
    minutes: s.tick / TPS / 60,
    adjudicated: !!(end && end.type === 'matchEnd' && end.payload.adjudicated),
    mvp,
    relics: s.relics.held.A.map((h) => ({
      id: h.id,
      lane: h.lane,
      piece: pieceOf(h.piece),
      card: h.card,
      trigger: h.trigger,
      quota: h.quota ? { ...h.quota } : null,
      reserve: h.reserve,
    })),
    styles,
    items,
  };
}

/**
 * Records the current round's match. A loss (or a dead tie) ends the run (`out`); winning the
 * Final makes White `champion`; any other win moves to the next round, fixes that court's
 * counter-Opening if it has one, and opens Spoils. White's relics and archetypes from the match
 * carry; a piece that never reached Rank 4 keeps its earlier archetype.
 */
export function recordResult(c: Content, run: RunState, outcome: MatchOutcome): RunState {
  if (run.status !== 'playing') throw new Error('no match of this run is being played');
  const next: RunState = structuredClone(run);
  const won = outcome.winner === 'A';
  const result: RunMatchResult = {
    opponent: run.opponents[run.round].name,
    won,
    minutes: outcome.minutes,
    adjudicated: outcome.adjudicated,
    mvp: outcome.mvp,
  };
  next.results.push(result);
  next.relics = outcome.relics.slice(0, tournamentOf(c).relicMax).map((r) => ({ ...r }));
  next.archetypes = { ...run.archetypes, ...outcome.styles };
  if (!won) {
    next.status = 'out';
    return next;
  }
  if (run.round >= run.opponents.length - 1) {
    next.status = 'champion';
    return next;
  }
  next.round = run.round + 1;
  next.opponents[next.round] = revealOpponent(c, next, next.round);
  next.offers = rewardOffers(c, next, outcome.items);
  next.status = 'between';
  return next;
}

/** Run kit: a piece's carried archetype, or null to choose it at Rank 4 again. */
export function setArchetype(
  c: Content,
  run: RunState,
  piece: PieceId,
  style: string | null,
): RunStep {
  if (run.status !== 'between') return { ok: false, reason: 'change archetypes between matches' };
  if (!(PIECE_IDS as readonly string[]).includes(piece))
    return { ok: false, reason: 'unknown piece' };
  if (style !== null && !c.pieceById.get(piece)?.styles.some((st) => st.id === style))
    return { ok: false, reason: 'not one of that piece’s archetypes' };
  const next = structuredClone(run);
  if (style === null) delete next.archetypes[piece];
  else next.archetypes[piece] = style;
  return { ok: true, run: next };
}

/**
 * Run kit: re-aims a carried relic (lane, piece, lane card, sealed card and trigger, pawn quota).
 * Only the shape is checked here; at match start an aim that no longer fits the court falls back
 * to the default aim.
 */
export function aimRunRelic(
  c: Content,
  run: RunState,
  relicId: string,
  aim: Partial<Omit<CarriedRelic, 'id'>>,
): RunStep {
  if (run.status !== 'between') return { ok: false, reason: 'aim relics between matches' };
  const i = run.relics.findIndex((r) => r.id === relicId);
  const def = c.relicById.get(relicId);
  if (i < 0 || !def) return { ok: false, reason: 'that relic is not in your run' };
  const cur = run.relics[i];
  const want = { ...cur, ...aim, id: relicId };
  const needLane = def.bind === 'lane' || def.bind === 'laneCard';
  if (needLane && !LANES.includes(want.lane as LaneId))
    return { ok: false, reason: 'aim it at a lane' };
  if (def.bind === 'piece' && !(PIECE_IDS as readonly string[]).includes(want.piece ?? ''))
    return { ok: false, reason: 'aim it at one of your pieces' };
  if (def.bind === 'laneCard' && !def.cards.includes(want.card ?? ''))
    return { ok: false, reason: 'pick a lane card' };
  if (def.bind === 'sealed') {
    if (!want.card || !sealableUnder(c, run.court.opening, want.card))
      return { ok: false, reason: "pick a card from your Opening's schools" };
    if (!want.trigger || !SEALED_TRIGGERS.includes(want.trigger))
      return { ok: false, reason: 'pick a trigger' };
  }
  if (def.bind === 'quota') {
    const q = want.quota;
    if (!q || LANES.some((l) => !Number.isInteger(q[l]) || q[l] < 0))
      return { ok: false, reason: 'set a pawn quota for each lane' };
    if (LANES.reduce((n, l) => n + q[l], 0) > c.tuning.pawns.capBase)
      return { ok: false, reason: 'the quotas are more than your pawn cap' };
    if (want.reserve === null || !c.tuning.relics.reserves.includes(want.reserve))
      return { ok: false, reason: 'pick a Tempo reserve' };
  }
  const next = structuredClone(run);
  next.relics[i] = want;
  return { ok: true, run: next };
}

/** How far an ended run got (null while it goes on). */
export function finishOf(run: RunState): BestFinish | null {
  if (run.status !== 'champion' && run.status !== 'out') return null;
  return { v: 1, round: run.round, champion: run.status === 'champion' };
}

/** The better of two finishes (champion, then the furthest round). */
export function betterFinish(a: BestFinish | null, b: BestFinish | null): BestFinish | null {
  if (!a || !b) return a ?? b;
  const score = (f: BestFinish): number => f.round + (f.champion ? 10 : 0);
  return score(b) > score(a) ? b : a;
}

/** The best-finish line: "Champion", "Reached the Final", … "Out in the Club round". */
export function finishLabel(c: Content, f: BestFinish): string {
  if (f.champion) return 'Champion';
  if (f.round === 0) return `Out in the ${roundName(c, 0)} round`;
  const name = roundName(c, f.round);
  return name === 'Semifinal' || name === 'Final'
    ? `Reached the ${name}`
    : `Reached the ${name} round`;
}
