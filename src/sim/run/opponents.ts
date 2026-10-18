// The four opposing courts of a run (spec 1B "Opponents", 3B). A run draws one hand-made court per
// round from `content/courts.json` (seeded); how hard the round is stays in the round table of
// `content/tournament.json`. Without courts content the old generator stands in.
import type { Content } from '../content/loader';
import {
  RELIC_FAMILIES,
  type CourtDef,
  type RelicDef,
  type TournamentDef,
} from '../content/schema';
import { mixSeed, pick, rand, seedStreams, shuffle, type RngState } from '../core/rng';
import { defaultAim } from '../runRules';
import { openingEdge } from '../schools';
import { aiSetup } from '../setup';
import type { CarriedRelic, TeamSetup } from '../types';
import type { OpponentDef, RoundNo, RunState } from './types';

export function tournamentOf(c: Content): TournamentDef {
  if (!c.tournament) throw new Error('content/tournament.json is not loaded');
  return c.tournament;
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Black's starting relics: for each one a seeded offer of three from different families, picked by
 * the relic AI's score (base, plus a bonus per tag the court matches, plus seeded jitter) and aimed
 * by the default rule. Without an Act report the court's tags are its Opening and its schools.
 */
function startingRelics(
  c: Content,
  rng: RngState,
  court: TeamSetup,
  n: number,
  held: CarriedRelic[] = [],
  skip: readonly string[] = [],
): CarriedRelic[] {
  const ai = c.tuning.relics.ai;
  const tags = new Set<string>(['opening', ...(c.openingById.get(court.opening)?.schools ?? [])]);
  const out: CarriedRelic[] = held.map((r) => ({ ...r }));
  while (out.length < n) {
    const pool = c.relics.filter((r) => !out.some((o) => o.id === r.id) && !skip.includes(r.id));
    const families = RELIC_FAMILIES.filter((f) => pool.some((r) => r.family === f));
    if (families.length === 0) break;
    const offers = shuffle(rng, 'relic', families)
      .slice(0, c.tuning.relics.offers)
      .map((f) =>
        pick(
          rng,
          'relic',
          pool.filter((r) => r.family === f),
        ),
      );
    let best: { def: RelicDef; score: number } | null = null;
    for (const def of offers) {
      const score =
        ai.base +
        ai.tag * def.tags.filter((t) => tags.has(t)).length +
        ai.jitter * rand(rng, 'relic');
      if (!best || score > best.score) best = { def, score };
    }
    out.push({ id: best!.def.id, ...defaultAim(c, court, best!.def) });
  }
  return out;
}

/** The hand-made court behind an opponent, if it came from `content/courts.json`. */
export function courtOf(c: Content, opp: Pick<OpponentDef, 'courtId'>): CourtDef | undefined {
  return opp.courtId ? c.courtById.get(opp.courtId) : undefined;
}

/**
 * A hand-made court as the round's opponent: its fixed Opening, lanes and archetypes, its signature
 * relic (aimed by the default rule unless the court names a lane or piece) and, for the rest of the
 * round's relics, seeded picks as before. The round table sets the count (at least the signature)
 * and the Tempo.
 */
function authoredOpponent(
  c: Content,
  court: CourtDef,
  row: TournamentDef['rounds'][number],
  seed: number,
): OpponentDef {
  const setup: TeamSetup = {
    opening: court.opening,
    pieces: court.pieces.map((e) => ({
      ...e,
      ...(court.firstMoves ? { firstMove: court.firstMoves[e.piece] } : {}),
    })),
  };
  const def = c.relicById.get(court.signature.relic)!;
  const aim = defaultAim(c, setup, def);
  if (court.signature.lane) aim.lane = court.signature.lane;
  if (court.signature.piece) aim.piece = court.signature.piece;
  const signature: CarriedRelic = { id: def.id, ...aim };
  return {
    id: `${court.id}-${row.round}`,
    name: court.name,
    round: row.round as RoundNo,
    courtId: court.id,
    setup,
    styles: { ...court.styles },
    signatureRelic: def.id,
    relics: startingRelics(
      c,
      seedStreams(mixSeed(seed, 'relics', row.round)),
      setup,
      Math.max(row.relics, 1),
      [signature],
      // Battery moves pieces between lanes: a court's lane layout is part of who it is
      ['battery'],
    ),
    tempoBonus: row.tempoBonus,
  };
}

/**
 * The four courts of a run, seeded by the run seed. With courts content: one hand-made court per
 * round from that round's pool (the Final's pool holds the Black Queen's Court). Without it (or
 * with a round that has no court): the stand-in generator, three names from the pool and the Black
 * Queen's Court for the Final; each court's Opening, paths and lanes by Black's setup AI; starting
 * relics and Tempo by the round table. Generated rounds with a counter-Opening get it when they
 * come up (`revealOpponent`), against the Opening White played last; hand-made courts keep theirs.
 */
export function generateOpponents(c: Content, seed: number): OpponentDef[] {
  const t = tournamentOf(c);
  if (t.rounds.every((row) => c.courts.some((k) => k.round === row.round)))
    return t.rounds.map((row) => {
      const pool = c.courts.filter((k) => k.round === row.round);
      const court = pick(seedStreams(mixSeed(seed, 'court-draw', row.round)), 'draft', pool);
      return authoredOpponent(c, court, row, seed);
    });
  return generateStandIns(c, seed);
}

/** The stand-in generator (used only when `content/courts.json` is missing). */
function generateStandIns(c: Content, seed: number): OpponentDef[] {
  const t = tournamentOf(c);
  const names = shuffle(seedStreams(mixSeed(seed, 'names')), 'draft', t.names).filter(
    (n) => n !== t.finalName,
  );
  return t.rounds.map((row, i) => {
    const name = row.round === 4 ? t.finalName : names[i];
    const setup = aiSetup(c, seedStreams(mixSeed(seed, 'court', row.round)));
    const relics = startingRelics(
      c,
      seedStreams(mixSeed(seed, 'relics', row.round)),
      setup,
      row.relics,
    );
    return {
      id: `${slug(name)}-${row.round}`,
      name,
      round: row.round as RoundNo,
      setup,
      relics,
      tempoBonus: row.tempoBonus,
    };
  });
}

/**
 * Fixes the Opening of a counter round's court when that round comes up: one of the Openings that
 * does best against White's last Opening (seeded among ties), and its starting relics again for
 * that Opening. Other rounds are returned unchanged.
 */
export function revealOpponent(c: Content, run: RunState, index: number): OpponentDef {
  const opp = run.opponents[index];
  const row = tournamentOf(c).rounds[index];
  if (!opp || opp.courtId || !row?.counterOpening) return opp;
  const mine = c.openingById.get(run.court.opening)?.schools ?? [];
  const scored = c.openings.map((o) => ({ id: o.id, edge: openingEdge(o.schools, mine) }));
  const top = Math.max(...scored.map((x) => x.edge));
  const rng = seedStreams(mixSeed(run.seed, 'reveal', row.round, run.court.opening));
  const opening = pick(
    rng,
    'draft',
    scored.filter((x) => x.edge === top),
  ).id;
  const setup: TeamSetup = { opening, pieces: opp.setup.pieces.map((e) => ({ ...e })) };
  return { ...opp, setup, relics: startingRelics(c, rng, setup, row.relics) };
}
