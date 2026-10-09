import type { Content, GameEvent, PieceId, PlayTeam } from '../sim';
import { buildReport, type AnalysisInput } from './index';
import { PositionIndex } from './positions';
import { courtName, laneName } from './text';

/** Match-summary numbers for the result splash and the swipeable report pages. Pure and deterministic. */

/** Score weights for `PieceRow.score` (the MVP score). See `scoreRow`. */
export const MVP_WEIGHTS = {
  /** Per kill of an enemy piece. */
  kill: 3,
  /** Per assist. */
  assist: 1.5,
  /** Times the piece's share (0-1) of all damage dealt to pieces in the match. */
  damageShare: 40,
  /** Times the piece's share (0-1) of all healing done in the match. */
  healingShare: 15,
  /** Times the piece's share (0-1) of all damage dealt to Bastions and Thrones in the match. */
  objectiveShare: 25,
  /** Subtracted per death. */
  death: 2,
} as const;

/** Seconds of game time between chart samples. */
export const SERIES_STEP_SEC = 10;

export interface PieceRow {
  id: number;
  team: PlayTeam;
  /** Piece id (king, queen, rook, bishop, knight). */
  piece: string;
  /** Display name of the piece from content ("Knight"). */
  pieceName: string;
  /** "White Knight". */
  name: string;
  /** Style id and its display name from content ("lancer", "Lancer"). */
  style: string;
  styleName: string;
  /** Build path id (offense, defense, utility). */
  path: string;
  /** Lane the piece started in (inferred from where it walked), or null if unknown. */
  startLane: string | null;
  /** Lane the piece ended in (start lane plus lane changes in the log), or null if unknown. */
  lane: string | null;
  /** Final rank, 1-8. */
  rank: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Damage dealt to enemy pieces. */
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  /** Not recorded in the log (no shield events); always omitted for now. */
  shielding?: number;
  /** Damage dealt to Bastions and Thrones. */
  objectiveDamage: number;
  /** Bastions and Thrones this piece landed the final blow on. */
  structureKills: number;
  /** Elite pawns this piece killed (gold events from the pawn bounty). */
  pawnKills: number;
  /** Pawnlings this piece last-hit. */
  pawnlingKills: number;
  goldEarned: number;
  /** Item ids held at the end (purchases minus sells minus components consumed). */
  finalItems: string[];
  /** Same items as display names from content. */
  finalItemNames: string[];
  /** Longest single life, ticks (a life still running at the end counts up to the end). */
  longestLifeTicks: number;
  /** The MVP score: see `MVP_WEIGHTS` and `scoreRow`. */
  score: number;
}

export interface TeamSummary {
  /** Enemy pieces killed by this team (pieces, Bastions and pawns count; jungle and unknown killers do not). */
  kills: number;
  deaths: number;
  /** Of `deaths`, those with no enemy team to credit (jungle monsters, neutral units, unrecorded). */
  deathsToNeutral?: number;
  goldEarned: number;
  /** Damage this team's pieces dealt to enemy pieces (equals the sum of its rows' damageDealt). */
  damageToPieces: number;
  objectiveDamage: number;
  /** Enemy Bastions this team destroyed. */
  bastionsDestroyed: number;
  /** True if this team destroyed the enemy Throne. */
  throneDestroyed: boolean;
  /** Times this team's King fell while its Throne stood. */
  checks: number;
  gambitsPlayed: Record<string, number>;
  pawnsFielded: number;
  /** Pawn kills by this team's pieces (a floor: pawns killed by others are not logged). */
  pawnKills: number;
  /** Pawnlings last-hit by this team's pieces. */
  pawnlingKills: number;
  /** Tempo spent on gambits (card costs from content). */
  tempoOnGambits: number;
  /** Tempo spent fielding pawns (count times the pawn cost from content). */
  tempoOnPawns: number;
}

export interface MvpPick {
  row: PieceRow;
  /** Facts only, e.g. "Most damage, 3 Bastions, 4/1/6". */
  reason: string;
}

export interface Award {
  id: string;
  /** States the metric, never a judgment ("Most damage"). */
  title: string;
  /** Winning piece, or null for a team award. */
  pieceId: number | null;
  /** The team awarded (the piece's team, or the team that led for team awards). */
  team: PlayTeam | null;
  value: number;
  /** What `value` counts: damage, healing, count, gold, seconds or tick. */
  unit: 'damage' | 'healing' | 'count' | 'gold' | 'seconds' | 'tick';
  /** Plain words with the numbers, e.g. "White Knight: 12,340 damage". */
  label: string;
  /** True if another piece matched the value (ties are broken by a documented secondary stat, then id). */
  tie: boolean;
  /** Game tick the award refers to, when it is a moment. */
  tick?: number;
}

export interface TickTotal {
  tick: number;
  total: number;
}
export interface TickCount {
  tick: number;
  count: number;
}

export interface SummarySeries {
  /** Sample ticks shared by every series (every SERIES_STEP_SEC of game time, ending at the last tick). */
  ticks: number[];
  /** Cumulative gold earned by the team's pieces. */
  gold: Record<PlayTeam, TickTotal[]>;
  /** White (A) minus Black (B) cumulative gold. */
  goldLead: { tick: number; diff: number }[];
  /** Cumulative damage to enemy pieces. */
  damage: Record<PlayTeam, TickTotal[]>;
  /** Cumulative kills (same definition as `teams[t].kills`). */
  kills: Record<PlayTeam, TickTotal[]>;
  rank: { id: number; points: { tick: number; rank: number }[] }[];
  /** Pieces alive (from death and respawn events). */
  alive: Record<PlayTeam, TickCount[]>;
  /** Cumulative pawns fielded. Pawn deaths are not in the log, so "pawns alive" cannot be derived. */
  pawnsFielded: Record<PlayTeam, TickCount[]>;
}

export type TimelineKind =
  'kill' | 'bastion' | 'throne' | 'check' | 'rank' | 'fork' | 'gambit' | 'act' | 'event';

export interface TimelineEntry {
  tick: number;
  kind: TimelineKind;
  /** The side credited (killer, destroyer, player); for a Check, the side that put the other in Check. Null for neutral. */
  team: PlayTeam | null;
  pieceId?: number;
  label: string;
}

export interface SummaryObjectives {
  /** Bastions that fell. `team` owns the Bastion; `by` is the team credited with the kill (null if unknown). */
  bastions: { team: PlayTeam; lane: string; index: number; tick: number; by: PlayTeam | null }[];
  /** Thrones that fell. `team` owns the Throne. */
  throne: { team: PlayTeam; tick: number; by: PlayTeam | null }[];
  /** Spells of Check: `team`'s King was down. `toTick` is the respawn, or the end tick if never. */
  checks: { team: PlayTeam; fromTick: number; toTick: number }[];
}

export interface MatchSummary {
  /** Null when the log has no result (unfinished match or time out). */
  winner: PlayTeam | null;
  /** The last tick in the log. */
  endTick: number;
  tickRate: number;
  /** Game minutes (endTick / tickRate / 60). */
  minutes: number;
  /** Number of Acts that began. */
  acts: number;
  /** Set when the match ended in checkmate. `throneFirst`: the loser's Throne fell before its final King death. */
  checkmate: { throneFirst: boolean; loser: PlayTeam; tick: number } | null;
  /** Ten rows: White's five then Black's five, in roster order. */
  rows: PieceRow[];
  teams: Record<PlayTeam, TeamSummary>;
  mvp: {
    match: MvpPick | null;
    White: MvpPick | null;
    Black: MvpPick | null;
  };
  awards: Award[];
  series: SummarySeries;
  timeline: TimelineEntry[];
  objectives: SummaryObjectives;
}

/** The MVP score of a row given match totals. Documented in docs by the weights above. */
export function scoreRow(
  r: Pick<
    PieceRow,
    'kills' | 'assists' | 'deaths' | 'damageDealt' | 'healingDone' | 'objectiveDamage'
  >,
  totals: { damage: number; healing: number; objective: number },
): number {
  const share = (v: number, t: number): number => (t > 0 ? v / t : 0);
  return (
    MVP_WEIGHTS.kill * r.kills +
    MVP_WEIGHTS.assist * r.assists +
    MVP_WEIGHTS.damageShare * share(r.damageDealt, totals.damage) +
    MVP_WEIGHTS.healingShare * share(r.healingDone, totals.healing) +
    MVP_WEIGHTS.objectiveShare * share(r.objectiveDamage, totals.objective) -
    MVP_WEIGHTS.death * r.deaths
  );
}

const emptyTeam = (): TeamSummary => ({
  kills: 0,
  deaths: 0,
  deathsToNeutral: 0,
  goldEarned: 0,
  damageToPieces: 0,
  objectiveDamage: 0,
  bastionsDestroyed: 0,
  throneDestroyed: false,
  checks: 0,
  gambitsPlayed: {},
  pawnsFielded: 0,
  pawnKills: 0,
  pawnlingKills: 0,
  tempoOnGambits: 0,
  tempoOnPawns: 0,
});

const TEAMS: PlayTeam[] = ['A', 'B'];
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const other = (t: PlayTeam): PlayTeam => (t === 'A' ? 'B' : 'A');
const isPlay = (t: string | undefined | null): t is PlayTeam => t === 'A' || t === 'B';

/** 1234567 -> "1,234,567" (no locale, so output never varies by machine). */
function num(v: number): string {
  const r = Math.round(v);
  return (r < 0 ? '-' : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function clock(tick: number, tickRate: number): string {
  const sec = Math.floor(tick / tickRate);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Sample ticks: 0, step, 2 step ... and the end tick. */
function sampleTicks(endTick: number, step: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= endTick; t += step) out.push(t);
  if (out[out.length - 1] !== endTick) out.push(endTick);
  return out;
}

interface Delta {
  tick: number;
  delta: number;
}

/** Running sum of deltas (sorted by tick) read at each sample tick. */
function sweep(points: Delta[], ticks: number[], start = 0): number[] {
  const out: number[] = [];
  let i = 0;
  let acc = start;
  for (const t of ticks) {
    while (i < points.length && points[i].tick <= t) acc += points[i++].delta;
    out.push(acc);
  }
  return out;
}

const totals = (ticks: number[], v: number[]): TickTotal[] =>
  ticks.map((tick, i) => ({ tick, total: v[i] }));
const counts = (ticks: number[], v: number[]): TickCount[] =>
  ticks.map((tick, i) => ({ tick, count: v[i] }));

type LaneMap = Record<string, [number, number][]>;

function distToPolyline(x: number, y: number, line: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** The lane a piece walked first: nearest lane line over its early samples, away from the base. */
function inferLane(
  pos: PositionIndex,
  id: number,
  lanes: LaneMap,
  base: [number, number],
  tickRate: number,
): string | null {
  const ids = Object.keys(lanes);
  if (ids.length === 0) return null;
  for (const horizon of [120, 300, 1200]) {
    const votes: Record<string, number> = {};
    for (const s of pos.slice(id, 0, horizon * tickRate)) {
      if (Math.hypot(s.x - base[0], s.y - base[1]) < 180) continue;
      let best = ids[0];
      let bestD = Infinity;
      for (const l of ids) {
        const d = distToPolyline(s.x, s.y, lanes[l]);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      votes[best] = (votes[best] ?? 0) + 1;
    }
    let top: string | null = null;
    for (const l of ids) if (votes[l] && (top === null || votes[l] > votes[top])) top = l;
    if (top) return top;
  }
  return null;
}

interface Best {
  row: PieceRow;
  value: number;
  tie: boolean;
}

/** Highest (or lowest) value; ties go to the larger tiebreak, then the first row. Null if nobody qualifies. */
function pickBest(
  rows: PieceRow[],
  value: (r: PieceRow) => number,
  opts: { min?: boolean; qualify?: (r: PieceRow) => boolean; tiebreak?: (r: PieceRow) => number },
): Best | null {
  let best: Best | null = null;
  for (const row of rows) {
    if (opts.qualify && !opts.qualify(row)) continue;
    const v = value(row);
    if (!best) {
      best = { row, value: v, tie: false };
      continue;
    }
    if (v === best.value) {
      best.tie = true;
      if ((opts.tiebreak?.(row) ?? 0) > (opts.tiebreak?.(best.row) ?? 0)) best.row = row;
    } else if (opts.min ? v < best.value : v > best.value) {
      best = { row, value: v, tie: false };
    }
  }
  return best;
}

function forkName(
  content: Content | undefined,
  piece: string,
  style: string,
  rank: number,
  id: string,
): string {
  const st = content?.styleByKey.get(`${piece}/${style}`);
  const opts = rank === 8 ? st?.forks['8'] : st?.forks['4'];
  return opts?.find((o) => o.id === id)?.name ?? id.replace(/_/g, ' ');
}

export function buildSummary(input: AnalysisInput): MatchSummary {
  const content = input.content;
  const events: GameEvent[] = input.events;
  const tr = input.tickRate;
  const report = buildReport(input, { kind: 'match' });
  const endTick = events.length ? events[events.length - 1].tick : 0;
  const pos = new PositionIndex(input.samples);

  // --- lookups ----------------------------------------------------------------------------------
  const teamOfId = new Map<number, PlayTeam>(report.roster.map((r) => [r.id, r.team]));
  const rosterById = new Map(report.roster.map((r) => [r.id, r]));
  const pieceName = (def: string): string =>
    content?.pieceById.get(def as PieceId)?.name ?? cap(def);
  const nameOf = (id: number): string => {
    const r = rosterById.get(id);
    return r ? `${courtName(r.team)} ${pieceName(r.def)}` : 'Unknown';
  };
  const lanes = (content?.map.lanes ?? {}) as LaneMap;
  const bases = (content?.map.bases ?? { A: [0, 0], B: [0, 0] }) as Record<
    PlayTeam,
    [number, number]
  >;
  const payloadLane = new Map<number, string>();
  for (const e of events) {
    if (e.type !== 'matchStart') continue;
    // Forward compatible: use a start lane if the sim ever records one.
    for (const h of e.payload.heroes) {
      const l = (h as { lane?: unknown }).lane;
      if (typeof l === 'string') payloadLane.set(h.id, l);
    }
    break;
  }
  const startLane = new Map<number, string | null>();
  for (const r of report.roster)
    startLane.set(r.id, payloadLane.get(r.id) ?? inferLane(pos, r.id, lanes, bases[r.team], tr));
  const curLane = new Map(startLane);

  const rank = new Map<number, number>(report.roster.map((r) => [r.id, 1]));
  const items = new Map<number, string[]>(report.roster.map((r) => [r.id, []]));
  const pawnKills = new Map<number, number>();
  const pawnlingKills = new Map<number, number>();
  const bastionKills = new Map<number, number>();
  const throneKills = new Map<number, number>();
  const lifeStart = new Map<number, number>(report.roster.map((r) => [r.id, 0]));
  const alive = new Map<number, boolean>(report.roster.map((r) => [r.id, true]));
  const longest = new Map<number, number>(report.roster.map((r) => [r.id, 0]));
  const inc = (m: Map<number, number>, k: number): void => void m.set(k, (m.get(k) ?? 0) + 1);

  // Teams of units that appear as damage sources (to credit kills made by Bastions and pawns).
  const unitSide = new Map<number, string>();
  for (const e of events)
    if (e.type === 'damage' && e.payload.src) unitSide.set(e.payload.src, e.payload.srcTeam);
  const killerTeamOf = (killer: number, kind: string, victim: PlayTeam): PlayTeam | null => {
    const side = teamOfId.get(killer) ?? unitSide.get(killer);
    if (isPlay(side)) return side === victim ? null : side;
    if (kind === 'tower' || kind === 'guardian') return other(victim);
    return null;
  };

  const teams: Record<PlayTeam, TeamSummary> = { A: emptyTeam(), B: emptyTeam() };
  const timeline: TimelineEntry[] = [];
  const objectives: SummaryObjectives = { bastions: [], throne: [], checks: [] };
  const kingOf: Record<PlayTeam, number> = { A: -1, B: -1 };
  for (const r of report.roster) if (r.def === 'king') kingOf[r.team] = r.id;

  const goldInc: Record<PlayTeam, Delta[]> = { A: [], B: [] };
  const dmgInc: Record<PlayTeam, Delta[]> = { A: [], B: [] };
  const killInc: Record<PlayTeam, Delta[]> = { A: [], B: [] };
  const aliveInc: Record<PlayTeam, Delta[]> = { A: [], B: [] };
  const pawnInc: Record<PlayTeam, Delta[]> = { A: [], B: [] };
  const rankInc = new Map<number, { tick: number; rank: number }[]>(
    report.roster.map((r) => [r.id, []]),
  );

  let goldDiff = 0;
  let peak = { abs: 0, tick: 0, team: null as PlayTeam | null };
  let winner: PlayTeam | null = null;
  let acts = 0;
  let firstDeath: { tick: number; killer: number; victim: number } | null = null;
  const openCheck: Record<PlayTeam, number | null> = { A: null, B: null };
  const throneSeq: Partial<Record<PlayTeam, number>> = {};
  const kingDeathSeq: Partial<Record<PlayTeam, number>> = {};
  let mate: { loser: PlayTeam; tick: number } | null = null;

  // --- one pass over the log --------------------------------------------------------------------
  for (const e of events) {
    switch (e.type) {
      case 'phaseStart':
        if (e.payload.kind === 'live') {
          acts = Math.max(acts, e.payload.phase);
          timeline.push({
            tick: e.tick,
            kind: 'act',
            team: null,
            label: `Act ${e.payload.phase} begins`,
          });
        }
        break;
      case 'damage': {
        const p = e.payload;
        const st = teamOfId.get(p.src);
        if (st && p.tgtKind === 'hero') dmgInc[st].push({ tick: e.tick, delta: p.amount });
        break;
      }
      case 'gold': {
        const t = teamOfId.get(e.payload.id);
        if (!t) break;
        goldInc[t].push({ tick: e.tick, delta: e.payload.amount });
        goldDiff += t === 'A' ? e.payload.amount : -e.payload.amount;
        if (Math.abs(goldDiff) > peak.abs)
          peak = { abs: Math.abs(goldDiff), tick: e.tick, team: goldDiff > 0 ? 'A' : 'B' };
        if (e.payload.source === 'pawn') inc(pawnKills, e.payload.id);
        else if (e.payload.source === 'lasthit') inc(pawnlingKills, e.payload.id);
        break;
      }
      case 'purchase': {
        const list = items.get(e.payload.id);
        if (!list) break;
        for (const c of e.payload.consumed) {
          const i = list.indexOf(c);
          if (i >= 0) list.splice(i, 1);
        }
        list.push(e.payload.item);
        break;
      }
      case 'sell': {
        const list = items.get(e.payload.id);
        const i = list ? list.indexOf(e.payload.item) : -1;
        if (list && i >= 0) list.splice(i, 1);
        break;
      }
      case 'curseAccepted':
        items.get(e.payload.hero)?.push(e.payload.item);
        break;
      case 'rankUp': {
        rank.set(e.payload.id, e.payload.rank);
        rankInc.get(e.payload.id)?.push({ tick: e.tick, rank: e.payload.rank });
        const r = rosterById.get(e.payload.id);
        if (r)
          timeline.push({
            tick: e.tick,
            kind: 'rank',
            team: r.team,
            pieceId: r.id,
            label: `${nameOf(r.id)} reached Rank ${e.payload.rank}`,
          });
        break;
      }
      case 'fork': {
        const r = rosterById.get(e.payload.id);
        if (!r) break;
        const opt = forkName(content, r.def, r.style, e.payload.rank, e.payload.optionId);
        timeline.push({
          tick: e.tick,
          kind: 'fork',
          team: r.team,
          pieceId: r.id,
          label: `${nameOf(r.id)} took ${opt} at Rank ${e.payload.rank}${e.payload.auto ? ' (chosen automatically)' : ''}`,
        });
        break;
      }
      case 'laneSet':
        curLane.set(e.payload.id, e.payload.lane);
        break;
      case 'laneSwap': {
        const a = curLane.get(e.payload.a) ?? null;
        const b = curLane.get(e.payload.b) ?? null;
        curLane.set(e.payload.a, b);
        curLane.set(e.payload.b, a);
        break;
      }
      case 'gambit': {
        const t = e.payload.team;
        const def = content?.gambitById.get(e.payload.cardId);
        teams[t].tempoOnGambits += def?.cost ?? 0;
        const where = e.payload.lane ? ` (${laneName(e.payload.lane)})` : '';
        timeline.push({
          tick: e.tick,
          kind: 'gambit',
          team: t,
          label: `${courtName(t)} played ${def?.name ?? cap(e.payload.cardId.replace(/_/g, ' '))}${where}`,
        });
        break;
      }
      case 'pawnFielded': {
        const t = e.payload.team;
        teams[t].tempoOnPawns += content?.tuning.pawns.cost ?? 0;
        pawnInc[t].push({ tick: e.tick, delta: 1 });
        break;
      }
      case 'death': {
        const p = e.payload;
        const vt = teamOfId.get(p.id);
        if (!vt) break;
        alive.set(p.id, false);
        longest.set(p.id, Math.max(longest.get(p.id) ?? 0, e.tick - (lifeStart.get(p.id) ?? 0)));
        aliveInc[vt].push({ tick: e.tick, delta: -1 });
        const kt = killerTeamOf(p.killer, p.killerKind, vt);
        if (kt) {
          teams[kt].kills++;
          killInc[kt].push({ tick: e.tick, delta: 1 });
        } else teams[vt].deathsToNeutral = (teams[vt].deathsToNeutral ?? 0) + 1;
        if (!firstDeath) firstDeath = { tick: e.tick, killer: p.killer, victim: p.id };
        if (p.id === kingOf[vt]) kingDeathSeq[vt] = e.seq;
        const assists = p.assists.filter((a) => teamOfId.has(a)).map(nameOf);
        const tail = assists.length ? ` (assists: ${assists.join(', ')})` : '';
        const side = kt ? `${courtName(kt)} ` : '';
        let label: string;
        if (teamOfId.has(p.killer)) label = `${nameOf(p.killer)} killed ${nameOf(p.id)}${tail}`;
        else {
          const by =
            p.killerKind === 'tower'
              ? `${side}Bastion`
              : p.killerKind === 'guardian'
                ? `${side}Throne`
                : p.killerKind === 'minion'
                  ? unitSide.get(p.killer) === 'neutral'
                    ? 'a neutral unit'
                    : `a ${side}lane unit`
                  : p.killerKind === 'camp'
                    ? 'a jungle monster'
                    : p.killerKind === 'none'
                      ? 'an unrecorded cause'
                      : `a ${p.killerKind}`;
          label = `${nameOf(p.id)} was killed by ${by}${tail}`;
        }
        timeline.push({
          tick: e.tick,
          kind: 'kill',
          team: kt,
          pieceId: teamOfId.has(p.killer) ? p.killer : undefined,
          label,
        });
        break;
      }
      case 'respawn': {
        const vt = teamOfId.get(e.payload.id);
        if (!vt) break;
        alive.set(e.payload.id, true);
        lifeStart.set(e.payload.id, e.tick);
        aliveInc[vt].push({ tick: e.tick, delta: 1 });
        const from = openCheck[vt];
        if (e.payload.id === kingOf[vt] && from !== null) {
          objectives.checks.push({ team: vt, fromTick: from, toTick: e.tick });
          openCheck[vt] = null;
        }
        break;
      }
      case 'check':
        teams[e.payload.team].checks++;
        openCheck[e.payload.team] = e.tick;
        timeline.push({
          tick: e.tick,
          kind: 'check',
          team: other(e.payload.team),
          label: `${courtName(e.payload.team)} is in Check`,
        });
        break;
      case 'structureDown': {
        const p = e.payload;
        if (!isPlay(p.team)) break;
        const side = teamOfId.get(p.killer) ?? unitSide.get(p.killer);
        const credit: PlayTeam = isPlay(side) && side !== p.team ? side : other(p.team);
        const piece = teamOfId.has(p.killer) ? p.killer : undefined;
        if (p.kind === 'tower') {
          teams[credit].bastionsDestroyed++;
          if (piece !== undefined) inc(bastionKills, piece);
          objectives.bastions.push({
            team: p.team,
            lane: p.lane,
            index: p.index,
            tick: e.tick,
            by: credit,
          });
          timeline.push({
            tick: e.tick,
            kind: 'bastion',
            team: credit,
            pieceId: piece,
            label: `${courtName(p.team)} Bastion fell (${laneName(p.lane)})`,
          });
        } else if (p.kind === 'guardian') {
          teams[credit].throneDestroyed = true;
          if (piece !== undefined) inc(throneKills, piece);
          throneSeq[p.team] = e.seq;
          objectives.throne.push({ team: p.team, tick: e.tick, by: credit });
          timeline.push({
            tick: e.tick,
            kind: 'throne',
            team: credit,
            pieceId: piece,
            label: `${courtName(p.team)} Throne fell`,
          });
        }
        break;
      }
      case 'pressure':
        timeline.push({
          tick: e.tick,
          kind: 'event',
          team: null,
          label: `Pressure event: ${e.payload.name}`,
        });
        break;
      case 'checkmate':
        mate = { loser: other(e.payload.winner), tick: e.tick };
        timeline.push({
          tick: e.tick,
          kind: 'event',
          team: e.payload.winner,
          label: `Checkmate: ${courtName(e.payload.winner)} wins`,
        });
        break;
      case 'matchEnd':
        winner = e.payload.winner;
        break;
      default:
        break;
    }
  }
  for (const t of TEAMS) {
    const from = openCheck[t];
    if (from !== null) objectives.checks.push({ team: t, fromTick: from, toTick: endTick });
  }
  objectives.checks.sort((a, b) => a.fromTick - b.fromTick);
  for (const r of report.roster)
    if (alive.get(r.id))
      longest.set(r.id, Math.max(longest.get(r.id) ?? 0, endTick - (lifeStart.get(r.id) ?? 0)));

  // --- rows -------------------------------------------------------------------------------------
  const itemName = (id: string): string =>
    content?.itemById.get(id)?.name ??
    content?.cursedById.get(id)?.name ??
    cap(id.replace(/_/g, ' '));
  const rows: PieceRow[] = report.roster.map((r) => {
    const h = report.heroes.find((x) => x.id === r.id)!;
    const ids = items.get(r.id) ?? [];
    return {
      id: r.id,
      team: r.team,
      piece: r.def,
      pieceName: pieceName(r.def),
      name: nameOf(r.id),
      style: r.style,
      styleName: content?.styleByKey.get(`${r.def}/${r.style}`)?.name ?? cap(r.style),
      path: r.path,
      startLane: startLane.get(r.id) ?? null,
      lane: curLane.get(r.id) ?? null,
      rank: rank.get(r.id) ?? 1,
      kills: h.kills,
      deaths: h.deaths,
      assists: h.assists,
      damageDealt: h.damageDealt,
      damageTaken: h.damageTaken,
      healingDone: h.healingDone,
      objectiveDamage: h.objectiveDamage,
      structureKills: (bastionKills.get(r.id) ?? 0) + (throneKills.get(r.id) ?? 0),
      pawnKills: pawnKills.get(r.id) ?? 0,
      pawnlingKills: pawnlingKills.get(r.id) ?? 0,
      goldEarned: h.goldEarned,
      finalItems: ids,
      finalItemNames: ids.map(itemName),
      longestLifeTicks: longest.get(r.id) ?? 0,
      score: 0,
    };
  });

  for (const t of TEAMS) {
    const tm = report.teams[t];
    const mine = rows.filter((r) => r.team === t);
    const ts = teams[t];
    ts.deaths = tm.deaths;
    ts.goldEarned = tm.goldEarned;
    ts.objectiveDamage = tm.objectiveDamage;
    ts.damageToPieces = mine.reduce((a, r) => a + r.damageDealt, 0);
    ts.gambitsPlayed = tm.gambitsPlayed;
    ts.pawnsFielded = tm.pawnsFielded;
    ts.pawnKills = mine.reduce((a, r) => a + r.pawnKills, 0);
    ts.pawnlingKills = mine.reduce((a, r) => a + r.pawnlingKills, 0);
  }

  const matchTotals = {
    damage: rows.reduce((a, r) => a + r.damageDealt, 0),
    healing: rows.reduce((a, r) => a + r.healingDone, 0),
    objective: rows.reduce((a, r) => a + r.objectiveDamage, 0),
  };
  for (const r of rows) r.score = scoreRow(r, matchTotals);

  // --- awards -----------------------------------------------------------------------------------
  const awards: Award[] = [];
  const plural = (n: number, w: string): string =>
    `${num(n)} ${w}${Math.round(n) === 1 ? '' : 's'}`;
  const addAward = (
    id: string,
    title: string,
    best: Best | null,
    unit: Award['unit'],
    fmt: (v: number) => string,
  ): void => {
    if (!best) return;
    awards.push({
      id,
      title,
      pieceId: best.row.id,
      team: best.row.team,
      value: Math.round(best.value * 10) / 10,
      unit,
      label: `${best.row.name}: ${fmt(best.value)}`,
      tie: best.tie,
    });
  };
  addAward(
    'mostDamage',
    'Most damage',
    pickBest(rows, (r) => r.damageDealt, {
      qualify: (r) => r.damageDealt > 0,
      tiebreak: (r) => r.kills,
    }),
    'damage',
    (v) => `${num(v)} damage`,
  );
  addAward(
    'mostDamageTaken',
    'Most damage taken',
    pickBest(rows, (r) => r.damageTaken, { qualify: (r) => r.damageTaken > 0 }),
    'damage',
    (v) => `${num(v)} damage taken`,
  );
  addAward(
    'mostHealing',
    'Most healing',
    pickBest(rows, (r) => r.healingDone, { qualify: (r) => r.healingDone > 0 }),
    'healing',
    (v) => `${num(v)} healing`,
  );
  addAward(
    'mostKills',
    'Most kills',
    pickBest(rows, (r) => r.kills, { qualify: (r) => r.kills > 0, tiebreak: (r) => r.assists }),
    'count',
    (v) => plural(v, 'kill'),
  );
  addAward(
    'mostAssists',
    'Most assists',
    pickBest(rows, (r) => r.assists, { qualify: (r) => r.assists > 0, tiebreak: (r) => r.kills }),
    'count',
    (v) => plural(v, 'assist'),
  );
  addAward(
    'fewestDeaths',
    'Fewest deaths',
    pickBest(rows, (r) => r.deaths, {
      min: true,
      qualify: (r) => r.kills >= 1,
      tiebreak: (r) => r.kills,
    }),
    'count',
    (v) => plural(v, 'death'),
  );
  addAward(
    'topObjective',
    'Top objective damage',
    pickBest(rows, (r) => r.objectiveDamage, { qualify: (r) => r.objectiveDamage > 0 }),
    'damage',
    (v) => `${num(v)} objective damage`,
  );
  const fd = firstDeath as { tick: number; killer: number; victim: number } | null;
  const fdKiller = fd ? rows.find((r) => r.id === fd.killer) : undefined;
  if (fd && fdKiller) {
    awards.push({
      id: 'firstBlood',
      title: 'First blood',
      pieceId: fdKiller.id,
      team: fdKiller.team,
      value: fd.tick,
      unit: 'tick',
      label: `${fdKiller.name} killed ${nameOf(fd.victim)} at ${clock(fd.tick, tr)}`,
      tie: false,
      tick: fd.tick,
    });
  }
  const life = pickBest(rows, (r) => r.longestLifeTicks, {
    qualify: (r) => r.longestLifeTicks > 0,
  });
  if (life) {
    awards.push({
      id: 'longestLife',
      title: 'Longest life',
      pieceId: life.row.id,
      team: life.row.team,
      value: Math.round(life.value / tr),
      unit: 'seconds',
      label: `${life.row.name}: ${clock(life.value, tr)} in one life`,
      tie: life.tie,
    });
  }
  if (peak.team) {
    awards.push({
      id: 'biggestGoldLead',
      title: 'Biggest gold lead',
      pieceId: null,
      team: peak.team,
      value: peak.abs,
      unit: 'gold',
      label: `${courtName(peak.team)}: ${num(peak.abs)} gold ahead at ${clock(peak.tick, tr)}`,
      tie: false,
      tick: peak.tick,
    });
  }

  // --- MVP --------------------------------------------------------------------------------------
  const REASON_AWARDS = ['mostDamage', 'mostKills', 'mostAssists', 'mostHealing', 'topObjective'];
  const reasonFor = (row: PieceRow): string => {
    const facts = awards
      .filter((a) => a.pieceId === row.id && REASON_AWARDS.includes(a.id))
      .slice(0, 2)
      .map((a) => a.title);
    const b = bastionKills.get(row.id) ?? 0;
    if (b > 0) facts.push(plural(b, 'Bastion'));
    if ((throneKills.get(row.id) ?? 0) > 0) facts.push('the Throne');
    facts.push(`${row.kills}/${row.deaths}/${row.assists} K/D/A`);
    return facts.join(', ');
  };
  const bestScore = (list: PieceRow[]): MvpPick | null => {
    const top = pickBest(list, (r) => r.score, { tiebreak: (r) => r.kills });
    return top ? { row: top.row, reason: reasonFor(top.row) } : null;
  };

  // --- series -----------------------------------------------------------------------------------
  const ticks = sampleTicks(endTick, SERIES_STEP_SEC * tr);
  const goldS = { A: sweep(goldInc.A, ticks), B: sweep(goldInc.B, ticks) };
  const sizeOf = (t: PlayTeam): number => rows.filter((r) => r.team === t).length;
  const series: SummarySeries = {
    ticks,
    gold: { A: totals(ticks, goldS.A), B: totals(ticks, goldS.B) },
    goldLead: ticks.map((tick, i) => ({ tick, diff: goldS.A[i] - goldS.B[i] })),
    damage: {
      A: totals(ticks, sweep(dmgInc.A, ticks)),
      B: totals(ticks, sweep(dmgInc.B, ticks)),
    },
    kills: {
      A: totals(ticks, sweep(killInc.A, ticks)),
      B: totals(ticks, sweep(killInc.B, ticks)),
    },
    rank: rows.map((r) => {
      const ups = rankInc.get(r.id) ?? [];
      let i = 0;
      let cur = 1;
      return {
        id: r.id,
        points: ticks.map((tick) => {
          while (i < ups.length && ups[i].tick <= tick) cur = ups[i++].rank;
          return { tick, rank: cur };
        }),
      };
    }),
    alive: {
      A: counts(ticks, sweep(aliveInc.A, ticks, sizeOf('A'))),
      B: counts(ticks, sweep(aliveInc.B, ticks, sizeOf('B'))),
    },
    pawnsFielded: {
      A: counts(ticks, sweep(pawnInc.A, ticks)),
      B: counts(ticks, sweep(pawnInc.B, ticks)),
    },
  };

  // --- checkmate --------------------------------------------------------------------------------
  let checkmate: MatchSummary['checkmate'] = null;
  const m = mate as { loser: PlayTeam; tick: number } | null;
  if (m) {
    const ts = throneSeq[m.loser];
    const ks = kingDeathSeq[m.loser];
    checkmate = {
      throneFirst: ts !== undefined && ks !== undefined && ts < ks,
      loser: m.loser,
      tick: m.tick,
    };
  }

  timeline.sort((a, b) => a.tick - b.tick);
  return {
    winner,
    endTick,
    tickRate: tr,
    minutes: endTick / tr / 60,
    acts,
    checkmate,
    rows,
    teams,
    mvp: {
      match: bestScore(rows),
      White: bestScore(rows.filter((r) => r.team === 'A')),
      Black: bestScore(rows.filter((r) => r.team === 'B')),
    },
    awards,
    series,
    timeline,
    objectives,
  };
}
