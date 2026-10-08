import { Match, type Content, type PlayTeam, type SetupEntry } from '../src/sim';
import { teamNetWorth } from '../src/sim/curses';

export interface HeroResult {
  team: PlayTeam;
  /** Piece id. */
  def: string;
  style: string;
  path: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  items: string[];
  rank: number;
}

export interface MatchSummary {
  seed: number;
  winner: PlayTeam | null;
  phases: number;
  minutes: number;
  ticks: number;
  ms: number;
  heroes: HeroResult[];
  curses: {
    offered: number;
    accepted: number;
    refused: number;
    acceptedBy: { item: string; won: boolean }[];
  };
  lead1: PlayTeam | null;
  comeback: boolean;
  obelisks: Record<PlayTeam, number>;
  towers: Record<PlayTeam, number>;
  kills: Record<PlayTeam, number>;
  campsCleared: number;
  firstTowerMinute: number | null;
  gambits: Record<PlayTeam, Record<string, number>>;
  pawns: Record<PlayTeam, number>;
  /** Tempo spent per side on gambit cards and on fielding pawns. */
  tempoSpent: Record<PlayTeam, { cards: number; pawns: number }>;
  checks: Record<PlayTeam, number>;
  /** Minute each rank was first reached by any piece (index = rank). */
  rankMinute: (number | null)[];
  /** How the match ended: checkmate after the Throne fell first or the King fell first. */
  mate: 'throneFirst' | 'kingFirst' | null;
}

export interface SimOptions {
  maxPhases?: number;
  /** White never plays gambits or fields pawns (the gambit-value baseline). */
  noGambitsA?: boolean;
  /** Black never plays gambits or fields pawns. */
  noGambitsB?: boolean;
  setup?: { A?: SetupEntry[]; B?: SetupEntry[] };
}

export function simulateMatch(content: Content, seed: number, opts: SimOptions = {}): MatchSummary {
  const t0 = process.hrtime.bigint();
  const maxPhases = opts.maxPhases ?? 10;
  const m = Match.create(content, {
    seed,
    setup: opts.setup,
    autoGambits: { A: !opts.noGambitsA, B: !opts.noGambitsB },
    // The baseline removes Tempo spending only; forks still pick at once as the AI does.
    autoForks: { A: true, B: true },
  });
  if (m.state.phase.kind === 'setup') m.issue({ type: 'setupTeam', pieces: m.defaultSetup() });
  const act = content.tuning.phaseSeconds * content.tuning.tickRate;
  m.step(act);
  let lead1: PlayTeam | null = null;
  if (m.state.phase.kind === 'live') {
    const a = teamNetWorth(m.ctx, 'A');
    const b = teamNetWorth(m.ctx, 'B');
    lead1 = a === b ? null : a > b ? 'A' : 'B';
  }
  while (m.state.phase.kind === 'live' && m.state.phase.n <= maxPhases) m.step(act);
  const s = m.state;
  const winner = s.winner;
  const heroes: HeroResult[] = [];
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of s.teams[team].heroIds) {
      const h = m.unitById(id)!.hero!;
      heroes.push({
        team,
        def: h.defId,
        style: h.style,
        path: h.path,
        role: h.role,
        won: winner === team,
        kills: h.kills,
        deaths: h.deaths,
        assists: h.assists,
        goldEarned: h.goldEarned,
        items: h.items.slice(),
        rank: h.rank,
      });
    }
  }
  const curses = {
    offered: 0,
    accepted: 0,
    refused: 0,
    acceptedBy: [] as { item: string; won: boolean }[],
  };
  const teamOfHero = new Map<number, PlayTeam>();
  for (const team of ['A', 'B'] as PlayTeam[])
    for (const id of s.teams[team].heroIds) teamOfHero.set(id, team);
  const obelisks: Record<PlayTeam, number> = { A: 0, B: 0 };
  const gambits: Record<PlayTeam, Record<string, number>> = { A: {}, B: {} };
  const pawns: Record<PlayTeam, number> = { A: 0, B: 0 };
  const checks: Record<PlayTeam, number> = { A: 0, B: 0 };
  const tempoSpent = { A: { cards: 0, pawns: 0 }, B: { cards: 0, pawns: 0 } };
  const rankMinute: (number | null)[] = Array.from({ length: 9 }, () => null);
  let campsCleared = 0;
  let firstTowerMinute: number | null = null;
  let throneAt = -1;
  let mate: MatchSummary['mate'] = null;
  const min = (tick: number): number => tick / content.tuning.tickRate / 60;
  for (const e of m.events) {
    if (e.type === 'curseOffered') curses.offered++;
    else if (e.type === 'curseRefused') curses.refused++;
    else if (e.type === 'curseAccepted') {
      curses.accepted++;
      const t = teamOfHero.get(e.payload.hero);
      curses.acceptedBy.push({ item: e.payload.item, won: t !== undefined && t === winner });
    } else if (e.type === 'obeliskClaimed') obelisks[e.payload.team]++;
    else if (e.type === 'campCleared') campsCleared++;
    else if (e.type === 'gambit') {
      const g = gambits[e.payload.team];
      g[e.payload.cardId] = (g[e.payload.cardId] ?? 0) + 1;
      tempoSpent[e.payload.team].cards += content.gambitById.get(e.payload.cardId)?.cost ?? 0;
    } else if (e.type === 'pawnFielded') {
      pawns[e.payload.team]++;
      tempoSpent[e.payload.team].pawns += content.tuning.pawns.cost;
    } else if (e.type === 'check') checks[e.payload.team]++;
    else if (e.type === 'rankUp') {
      if (rankMinute[e.payload.rank] === null) rankMinute[e.payload.rank] = min(e.tick);
    } else if (e.type === 'throneDown' && winner && e.payload.team !== winner) throneAt = e.tick;
    else if (e.type === 'checkmate') mate = throneAt === e.tick ? 'kingFirst' : 'throneFirst';
    else if (
      e.type === 'structureDown' &&
      e.payload.kind === 'tower' &&
      firstTowerMinute === null
    ) {
      firstTowerMinute = min(e.tick);
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    seed,
    winner,
    phases: s.phase.n,
    minutes: min(s.tick),
    ticks: s.tick,
    ms,
    heroes,
    curses,
    lead1,
    comeback: lead1 !== null && winner !== null && winner !== lead1,
    obelisks,
    towers: { A: s.teams.A.towersDown, B: s.teams.B.towersDown },
    kills: { A: s.teams.A.kills, B: s.teams.B.kills },
    campsCleared,
    firstTowerMinute,
    gambits,
    pawns,
    tempoSpent,
    checks,
    rankMinute,
    mate,
  };
}
