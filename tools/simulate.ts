import { Match, type Content, type PlayTeam } from '../src/sim';
import { teamNetWorth } from '../src/sim/curses';

export interface HeroResult {
  team: PlayTeam;
  def: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  items: string[];
  upgrades: number;
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
  auction: { holy: string; winner: PlayTeam | null; won: boolean } | null;
  lead1: PlayTeam | null;
  comeback: boolean;
  obelisks: Record<PlayTeam, number>;
  towers: Record<PlayTeam, number>;
  kills: Record<PlayTeam, number>;
  campsCleared: number;
  firstTowerMinute: number | null;
}

export function simulateMatch(
  content: Content,
  seed: number,
  maxPhases = 10,
  draft?: { A: string[]; B: string[] },
): MatchSummary {
  const t0 = process.hrtime.bigint();
  const m = Match.create(content, { seed, player: null, draft });
  let lead1: PlayTeam | null = null;
  for (let guard = 0; guard < maxPhases * 3 + 6; guard++) {
    const s = m.state;
    if (s.phase.kind === 'end') break;
    if (s.phase.kind === 'live') {
      m.step(content.tuning.phaseSeconds * content.tuning.tickRate + 5);
      if (m.state.phase.kind === 'report' && m.state.phase.n === 1) {
        const a = teamNetWorth(m.ctx, 'A');
        const b = teamNetWorth(m.ctx, 'B');
        lead1 = a === b ? null : a > b ? 'A' : 'B';
      }
      continue;
    }
    if (s.phase.n >= maxPhases && s.phase.kind === 'report') break;
    if (!m.autoAdvance().ok) break;
  }
  const s = m.state;
  const winner = s.winner;
  const heroes: HeroResult[] = [];
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of s.teams[team].heroIds) {
      const u = m.unitById(id)!;
      const h = u.hero!;
      heroes.push({
        team,
        def: h.defId,
        role: h.role,
        won: winner === team,
        kills: h.kills,
        deaths: h.deaths,
        assists: h.assists,
        goldEarned: h.goldEarned,
        items: h.items.slice(),
        upgrades: h.upgrades.length,
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
  let campsCleared = 0;
  let firstTowerMinute: number | null = null;
  for (const e of m.events) {
    if (e.type === 'curseOffered') curses.offered++;
    else if (e.type === 'curseRefused') curses.refused++;
    else if (e.type === 'curseAccepted') {
      curses.accepted++;
      const t = teamOfHero.get(e.payload.hero);
      curses.acceptedBy.push({ item: e.payload.item, won: t !== undefined && t === winner });
    } else if (e.type === 'obeliskClaimed') obelisks[e.payload.team]++;
    else if (e.type === 'campCleared') campsCleared++;
    else if (
      e.type === 'structureDown' &&
      e.payload.kind === 'tower' &&
      firstTowerMinute === null
    ) {
      firstTowerMinute = e.tick / content.tuning.tickRate / 60;
    }
  }
  const resolved = m.events.find((e) => e.type === 'auctionResolved');
  const auction =
    resolved && resolved.type === 'auctionResolved'
      ? {
          holy: resolved.payload.holy,
          winner: resolved.payload.winner,
          won: resolved.payload.winner === winner,
        }
      : null;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    seed,
    winner,
    phases: s.phase.n,
    minutes: s.tick / content.tuning.tickRate / 60,
    ticks: s.tick,
    ms,
    heroes,
    curses,
    auction,
    lead1,
    comeback: lead1 !== null && winner !== null && winner !== lead1,
    obelisks,
    towers: { A: s.teams.A.towersDown, B: s.teams.B.towersDown },
    kills: { A: s.teams.A.kills, B: s.teams.B.kills },
    campsCleared,
    firstTowerMinute,
  };
}
