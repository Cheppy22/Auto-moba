import { TPS } from './combat';
import type { Ctx } from './ctx';
import { laneMomentum } from './feedback';
import type {
  ActCardStat,
  ActPieceStat,
  ActReport,
  ActTally,
  ActTeamStat,
  FightRecord,
  GameEvent,
  LaneId,
  PlayTeam,
} from './types';
import { PLAY_TEAMS } from './names';

const METRICS = [
  'dealt',
  'structure',
  'taken',
  'bonus',
  'prevented',
  'healed',
  'kills',
  'deaths',
  'met',
  'drained',
] as const;

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
      mitigated: 0,
      diedTo: {},
      falls: {},
    };
  });
  return {
    tempo: Math.round(ctx.s.actTally.tempo[team]),
    damage: 0,
    mitigated: 0,
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
    cards: [],
  };
}

/** Reads the Act's slice of the event log into per-team and per-piece numbers. */
export function buildActReport(ctx: Ctx): ActReport {
  const teams = { A: teamStat(ctx, 'A'), B: teamStat(ctx, 'B') };
  const pieceOf = new Map<number, ActPieceStat>();
  const teamOf = new Map<number, PlayTeam>();
  for (const team of PLAY_TEAMS) {
    for (const p of teams[team].pieces) {
      pieceOf.set(p.id, p);
      teamOf.set(p.id, team);
    }
  }
  const fights: FightRecord[] = [];
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
        if (e.payload.tgtKind === 'hero') {
          const m = e.payload.mitigated ?? 0;
          const tp = pieceOf.get(e.payload.tgt);
          const tt = teamOf.get(e.payload.tgt);
          if (tp && tt) {
            tp.mitigated += m;
            teams[tt].mitigated += m;
          }
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
        const cause = e.payload.fall?.cause;
        if (cause) victim.falls[cause] = (victim.falls[cause] ?? 0) + 1;
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
      case 'fightEnd':
        if (e.payload.lost.A + e.payload.lost.B > 0) fights.push(e.payload);
        break;
      case 'gambitEnd': {
        const g = e.payload;
        const cards = teams[g.team].cards;
        let c = cards.find((x) => x.cardId === g.cardId);
        if (!c) {
          c = {
            cardId: g.cardId,
            plays: 0,
            tempo: 0,
            seconds: 0,
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
          } satisfies ActCardStat;
          cards.push(c);
        }
        c.plays++;
        c.tempo += g.cost;
        c.seconds += (g.endTick - g.startTick) / TPS;
        for (const k of METRICS) c[k] += g[k];
        break;
      }
      default:
        break;
    }
  }
  for (const team of PLAY_TEAMS) teams[team].damage = Math.round(teams[team].damage);
  for (const team of PLAY_TEAMS) teams[team].mitigated = Math.round(teams[team].mitigated);
  for (const team of PLAY_TEAMS)
    for (const p of teams[team].pieces) {
      p.damage = Math.round(p.damage);
      p.mitigated = Math.round(p.mitigated);
    }
  for (const team of PLAY_TEAMS)
    for (const c of teams[team].cards) c.seconds = Math.round(c.seconds);
  return {
    act: ctx.s.phase.n,
    waves: ctx.s.actTally.waves,
    teams,
    fights,
    lanes: laneMomentum(ctx),
  };
}
