import type { Ctx } from './ctx';
import type {
  ActPieceStat,
  ActReport,
  ActTally,
  ActTeamStat,
  GameEvent,
  LaneId,
  PlayTeam,
} from './types';

const TEAMS: PlayTeam[] = ['A', 'B'];

export function freshTally(startSeq: number): ActTally {
  const lost = (): Record<LaneId, number> => ({ top: 0, mid: 0, bot: 0 });
  return {
    startSeq,
    tempo: { A: 0, B: 0 },
    waves: 0,
    pawnlingsLost: { A: lost(), B: lost() },
  };
}

function teamStat(ctx: Ctx, team: PlayTeam): ActTeamStat {
  const pieces: ActPieceStat[] = ctx.s.teams[team].heroIds.map((id) => {
    const u = ctx.unit(id)!;
    return {
      id,
      piece: u.hero!.defId,
      lane: u.hero!.lane ?? 'mid',
      kills: 0,
      deaths: 0,
      damage: 0,
      diedTo: {},
    };
  });
  return {
    tempo: Math.round(ctx.s.actTally.tempo[team]),
    damage: 0,
    pieceDeaths: 0,
    pieceKills: 0,
    bastionsLost: [],
    throneLost: false,
    obelisks: 0,
    camps: 0,
    gambits: 0,
    pawns: 0,
    tempoHeld: Math.floor(ctx.s.tempo[team]),
    pawnlingsLost: { ...ctx.s.actTally.pawnlingsLost[team] },
    pieces,
  };
}

/** Reads the Act's slice of the event log into per-team and per-piece numbers. */
export function buildActReport(ctx: Ctx): ActReport {
  const teams = { A: teamStat(ctx, 'A'), B: teamStat(ctx, 'B') };
  const pieceOf = new Map<number, ActPieceStat>();
  const teamOf = new Map<number, PlayTeam>();
  for (const team of TEAMS) {
    for (const p of teams[team].pieces) {
      pieceOf.set(p.id, p);
      teamOf.set(p.id, team);
    }
  }
  const events: GameEvent[] = ctx.rec.events;
  let from = events.length;
  while (from > 0 && events[from - 1].seq >= ctx.s.actTally.startSeq) from--;
  for (let i = from; i < events.length; i++) {
    const e = events[i];
    switch (e.type) {
      case 'damage': {
        const t = e.payload.srcTeam;
        if (t === 'A' || t === 'B') teams[t].damage += e.payload.amount;
        if (e.payload.srcKind === 'hero') {
          const p = pieceOf.get(e.payload.src);
          if (p) p.damage += e.payload.amount;
        }
        break;
      }
      case 'damageBucket': {
        const t = e.payload.srcTeam;
        if (t === 'A' || t === 'B') teams[t].damage += e.payload.amount;
        break;
      }
      case 'death': {
        if (e.payload.kind !== 'hero') break;
        const victim = pieceOf.get(e.payload.id);
        const team = teamOf.get(e.payload.id);
        if (!victim || !team) break;
        victim.deaths++;
        teams[team].pieceDeaths++;
        const killer = pieceOf.get(e.payload.killer);
        const by = e.payload.killerKind === 'hero' && killer ? killer.piece : e.payload.killerKind;
        victim.diedTo[by] = (victim.diedTo[by] ?? 0) + 1;
        if (killer) {
          killer.kills++;
          const kt = teamOf.get(killer.id);
          if (kt) teams[kt].pieceKills++;
        }
        break;
      }
      case 'structureDown': {
        const t = e.payload.team;
        if (t !== 'A' && t !== 'B') break;
        if (e.payload.kind === 'tower') teams[t].bastionsLost.push(e.payload.lane as LaneId);
        break;
      }
      case 'throneDown':
        teams[e.payload.team].throneLost = true;
        break;
      case 'obeliskClaimed':
        teams[e.payload.team].obelisks++;
        break;
      case 'campCleared': {
        const t = ctx.unit(e.payload.killer)?.team;
        if (t === 'A' || t === 'B') teams[t].camps++;
        break;
      }
      case 'gambit':
        teams[e.payload.team].gambits++;
        break;
      case 'pawnFielded':
        teams[e.payload.team].pawns++;
        break;
      default:
        break;
    }
  }
  for (const team of TEAMS) teams[team].damage = Math.round(teams[team].damage);
  for (const team of TEAMS) for (const p of teams[team].pieces) p.damage = Math.round(p.damage);
  return { act: ctx.s.phase.n, waves: ctx.s.actTally.waves, teams };
}
