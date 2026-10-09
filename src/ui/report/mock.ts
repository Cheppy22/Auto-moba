import type { Content, PlayTeam } from '../../sim';
import type { RosterEntry } from '../../analysis';
import {
  SERIES_STEP_SEC,
  type MatchSummary,
  type PieceRow,
  type SummarySeries,
  type TimelineEntry,
} from '../../analysis/summary';

/**
 * A realistic, deterministic MatchSummary for working on the report screens (dev only, switched on
 * with `?mock` in the address). Ten pieces, about fifteen minutes, three Acts and a Checkmate.
 */
export function mockSummary(roster: RosterEntry[], c: Content): MatchSummary {
  let seed = 7;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tr = c.tuning.tickRate;
  const endSec = 15 * 60 + 12;
  const endTick = endSec * tr;
  const winner: PlayTeam = 'A';
  const rows: PieceRow[] = roster.map((r, i) => {
    const win = r.team === winner;
    const mult = { king: 0.6, queen: 1.5, rook: 0.7, bishop: 0.8, knight: 1.1 }[r.def] ?? 1;
    const f = (win ? 1.12 : 0.92) * (0.85 + rnd() * 0.3);
    const kills = Math.round(mult * f * (3 + rnd() * 5));
    const deaths = Math.round((win ? 3 : 5) * (0.5 + rnd()));
    const items = c.items
      .filter((it) => !it.id.includes('_'))
      .slice(i, i + 4 + (i % 3))
      .map((x) => x.id);
    const pieceName = c.pieceById.get(r.def as 'king')?.name ?? r.def;
    const styleName = c.styleByKey.get(`${r.def}/${r.style}`)?.name ?? r.style;
    return {
      id: r.id,
      team: r.team,
      piece: r.def,
      pieceName,
      name: `${r.team === 'A' ? 'White' : 'Black'} ${pieceName}`,
      style: r.style,
      styleName,
      path: r.path,
      startLane: r.role,
      lane: r.role,
      rank: Math.min(8, Math.round(4 + f * 3)),
      kills,
      deaths,
      assists: Math.round(kills * (1 + rnd() * 2)),
      damageDealt: Math.round(mult * f * (5200 + rnd() * 5000)),
      damageTaken: Math.round((win ? 0.9 : 1.1) * (4800 + rnd() * 6000)),
      healingDone: r.def === 'bishop' ? Math.round(4200 * f) : Math.round(rnd() * 600),
      objectiveDamage: Math.round(mult * f * 2500 * rnd()),
      structureKills: Math.round(rnd() * 2),
      pawnKills: Math.round(rnd() * 6),
      pawnlingKills: Math.round(30 + rnd() * 60),
      goldEarned: Math.round(mult * f * (6200 + rnd() * 2400)),
      finalItems: items,
      finalItemNames: items.map((id) => c.itemById.get(id)?.name ?? id),
      longestLifeTicks: Math.round((120 + rnd() * 300) * tr),
      score: 0,
    };
  });
  const team = (t: PlayTeam) => rows.filter((r) => r.team === t);
  const sum = (t: PlayTeam, k: keyof PieceRow): number =>
    team(t).reduce((a, r) => a + (r[k] as number), 0);
  for (const r of rows)
    r.score = r.kills * 3 + r.assists * 1.5 - r.deaths * 2 + r.damageDealt / 600;
  const best = (rs: PieceRow[]): PieceRow => rs.reduce((a, b) => (b.score > a.score ? b : a));
  const topW = best(team('A'));
  const topB = best(team('B'));
  const mvpRow = topW.score >= topB.score ? topW : topB;
  const steps = Math.floor(endSec / SERIES_STEP_SEC);
  const ticks = Array.from({ length: steps + 1 }, (_, i) =>
    Math.min(endTick, i * SERIES_STEP_SEC * tr),
  );
  ticks[ticks.length - 1] = endTick;
  const cum = (final: number, shape = 1.15) =>
    ticks.map((tick) => ({ tick, total: Math.round(final * Math.pow(tick / endTick, shape)) }));
  const goldA = sum('A', 'goldEarned');
  const goldB = sum('B', 'goldEarned');
  const gold = { A: cum(goldA), B: cum(goldB, 1.05) };
  const kills = { A: cum(sum('A', 'kills'), 1.3), B: cum(sum('B', 'kills'), 1.2) };
  const alive = (t: PlayTeam) =>
    ticks.map((tick, i) => ({
      tick,
      count: Math.max(
        0,
        Math.min(
          5,
          5 -
            Math.round(
              1.5 +
                Math.sin(i / (t === 'A' ? 5 : 3.7) + (t === 'A' ? 0 : 2)) * 1.6 +
                (t === winner ? 0 : i / 40),
            ),
        ),
      ),
    }));
  const series: SummarySeries = {
    ticks,
    gold,
    goldLead: ticks.map((tick, i) => ({ tick, diff: gold.A[i].total - gold.B[i].total })),
    damage: { A: cum(sum('A', 'damageDealt')), B: cum(sum('B', 'damageDealt')) },
    kills,
    rank: rows.map((r) => ({
      id: r.id,
      points: Array.from({ length: r.rank }, (_, k) => ({
        tick: Math.round((k === 0 ? 0 : Math.pow(k / r.rank, 0.85)) * endSec * 0.97 * tr),
        rank: k + 1,
      })),
    })),
    alive: { A: alive('A'), B: alive('B') },
    pawnsFielded: {
      A: ticks.map((tick) => ({ tick, count: Math.floor((tick / endTick) * 9) })),
      B: ticks.map((tick) => ({ tick, count: Math.floor((tick / endTick) * 8) })),
    },
  };
  const at = (sec: number): number => Math.round(sec * tr);
  const bastions = [
    { team: 'B' as const, lane: 'top', index: 0, tick: at(300), by: 'A' as const },
    { team: 'A' as const, lane: 'mid', index: 0, tick: at(372), by: 'B' as const },
    { team: 'B' as const, lane: 'mid', index: 0, tick: at(441), by: 'A' as const },
    { team: 'B' as const, lane: 'bot', index: 0, tick: at(530), by: 'A' as const },
    { team: 'B' as const, lane: 'top', index: 1, tick: at(618), by: 'A' as const },
    { team: 'A' as const, lane: 'bot', index: 0, tick: at(702), by: 'B' as const },
    { team: 'B' as const, lane: 'mid', index: 1, tick: at(790), by: 'A' as const },
  ];
  const timeline: TimelineEntry[] = [
    { tick: 0, kind: 'act', team: null, label: 'Act 1 begins' },
    { tick: at(240), kind: 'act', team: null, label: 'Act 2 begins' },
    { tick: at(480), kind: 'act', team: null, label: 'Act 3 begins' },
    { tick: at(720), kind: 'act', team: null, label: 'Act 4 begins' },
    ...bastions.map<TimelineEntry>((b) => ({
      tick: b.tick,
      kind: 'bastion',
      team: b.by,
      label: `${b.team === 'A' ? 'White' : 'Black'} Bastion fell`,
    })),
  ];
  return {
    winner,
    endTick,
    tickRate: tr,
    minutes: endSec / 60,
    acts: 4,
    checkmate: { throneFirst: true, loser: 'B', tick: endTick },
    rows,
    teams: {
      A: teamSum('A', rows, bastions, true),
      B: teamSum('B', rows, bastions, false),
    },
    mvp: {
      match: { row: mvpRow, reason: 'Most kills and damage' },
      White: { row: topW, reason: '' },
      Black: { row: topB, reason: '' },
    },
    awards: [
      aw(
        'dmg',
        'Most damage',
        best(rows.slice().sort((a, b) => b.damageDealt - a.damageDealt)),
        'damage',
      ),
    ].concat(awards(rows)),
    series,
    timeline,
    objectives: {
      bastions,
      throne: [{ team: 'B', tick: at(880), by: 'A' }],
      checks: [
        { team: 'B', fromTick: at(620), toTick: at(660) },
        { team: 'A', fromTick: at(700), toTick: at(735) },
        { team: 'B', fromTick: at(890), toTick: endTick },
      ],
    },
  };
}

function aw(
  id: string,
  title: string,
  r: PieceRow,
  unit: 'damage' | 'count' | 'gold',
): MatchSummary['awards'][number] {
  const value = unit === 'damage' ? r.damageDealt : unit === 'gold' ? r.goldEarned : r.kills;
  return {
    id,
    title,
    pieceId: r.id,
    team: r.team,
    value,
    unit,
    label: `${r.name}: ${value.toLocaleString('en-US')}`,
    tie: false,
  };
}

function awards(rows: PieceRow[]): MatchSummary['awards'] {
  const top = (f: (r: PieceRow) => number): PieceRow =>
    rows.reduce((a, b) => (f(b) > f(a) ? b : a));
  return [
    aw(
      'gold',
      'Most gold',
      top((r) => r.goldEarned),
      'gold',
    ),
    aw(
      'kills',
      'Most kills',
      top((r) => r.kills),
      'count',
    ),
    {
      ...aw(
        'heal',
        'Most healing',
        top((r) => r.healingDone),
        'damage',
      ),
      value: top((r) => r.healingDone).healingDone,
    },
  ];
}

function teamSum(
  t: PlayTeam,
  rows: PieceRow[],
  bastions: { by: PlayTeam | null }[],
  won: boolean,
): MatchSummary['teams'][PlayTeam] {
  const mine = rows.filter((r) => r.team === t);
  const s = (k: keyof PieceRow): number => mine.reduce((a, r) => a + (r[k] as number), 0);
  return {
    kills: s('kills'),
    deaths: s('deaths'),
    goldEarned: s('goldEarned'),
    damageToPieces: s('damageDealt'),
    objectiveDamage: s('objectiveDamage'),
    bastionsDestroyed: bastions.filter((b) => b.by === t).length,
    throneDestroyed: won,
    checks: won ? 1 : 2,
    gambitsPlayed: won
      ? { advance: 3, check: 2, castle: 1, sanctuary: 2 }
      : { advance: 2, regroup: 1, check: 1 },
    pawnsFielded: won ? 9 : 8,
    pawnKills: s('pawnKills'),
    pawnlingKills: s('pawnlingKills'),
    tempoOnGambits: won ? 8 * 20 : 4 * 20,
    tempoOnPawns: won ? 9 * 15 : 8 * 15,
  };
}
