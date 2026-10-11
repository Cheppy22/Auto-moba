import type {
  ActCardStat,
  ActReport,
  CardMetrics,
  DeathCause,
  Fall,
  FightRecord,
  FightZone,
  GameEvent,
  LaneId,
  PieceId,
  PlayTeam,
} from '../sim';
import { courtName, laneName } from './text';

const PIECE: Record<PieceId, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

export const pieceWord = (p: PieceId): string => PIECE[p];

// ------------------------------------------------------------------ fights

type Verdict = 'won' | 'lost' | 'even';

interface FightVerdict {
  verdict: Verdict;
  /** Enemy pieces that fell. */
  won: number;
  /** Your pieces that fell. */
  lost: number;
}

export const fightVerdict = (f: FightRecord, viewer: PlayTeam = 'A'): FightVerdict => {
  const foe = viewer === 'A' ? 'B' : 'A';
  const won = f.lost[foe];
  const lost = f.lost[viewer];
  return { verdict: won > lost ? 'won' : won < lost ? 'lost' : 'even', won, lost };
};

/** Whether a fight is worth a tag: at least one piece fell. */
export const decisive = (f: FightRecord): boolean => f.lost.A + f.lost.B > 0;

function zoneName(zone: FightZone, viewer: PlayTeam = 'A'): string {
  switch (zone) {
    case 'top':
    case 'mid':
    case 'bot':
      return zone === 'mid' ? 'Mid' : `${laneName(zone)} lane`;
    case 'jungle':
      return 'Jungle';
    case 'baseA':
      return viewer === 'A' ? 'Your base' : 'Their base';
    case 'baseB':
      return viewer === 'B' ? 'Your base' : 'Their base';
  }
}

/** "Left lane — won 3 for 1", "Mid — lost 0 for 2", "Right lane — even trade 1 for 1". */
export function fightLine(f: FightRecord, viewer: PlayTeam = 'A'): string {
  const v = fightVerdict(f, viewer);
  const place = zoneName(f.zone, viewer);
  if (v.verdict === 'even') return `${place} — even trade, ${v.won} for ${v.lost}`;
  return `${place} — ${v.verdict} ${v.won} for ${v.lost}`;
}

interface FightSummary {
  won: number;
  lost: number;
  even: number;
  biggest: FightRecord | null;
}

export function summarizeFights(report: ActReport, viewer: PlayTeam = 'A'): FightSummary {
  const out: FightSummary = { won: 0, lost: 0, even: 0, biggest: null };
  let size = 0;
  for (const f of report.fights) {
    if (!decisive(f)) continue;
    const v = fightVerdict(f, viewer).verdict;
    if (v === 'won') out.won++;
    else if (v === 'lost') out.lost++;
    else out.even++;
    const n = f.lost.A + f.lost.B;
    if (n > size) {
      size = n;
      out.biggest = f;
    }
  }
  return out;
}

export function fightsText(s: FightSummary): string {
  return `Fights this Act: won ${s.won}, lost ${s.lost}, even ${s.even}`;
}

// ------------------------------------------------------------------ why a piece fell

const CAUSE_WORD: Record<DeathCause, string> = {
  burst: 'Burst',
  focus: 'Focus',
  outOfPosition: 'Out of position',
  outnumbered: 'Outnumbered',
  traded: 'Traded',
};

export const causeWord = (c: DeathCause): string => CAUSE_WORD[c];

const KILLER_KIND: Record<string, string> = {
  minion: 'pawnlings',
  tower: 'a Bastion',
  guardian: 'the Throne',
  camp: 'the jungle',
};

const list = (ps: PieceId[]): string => ps.map(pieceWord).join(', ');

/** What a death means in a few words: "focused by Queen, Knight". */
export function fallPhrase(f: Pick<Fall, 'cause' | 'killer' | 'killerKind' | 'by'>): string {
  const by = f.by.length > 0 ? list(f.by) : null;
  switch (f.cause) {
    case 'burst':
      return by ? `burst down by ${by}` : 'burst down';
    case 'focus':
      return `focused by ${by ?? 'three pieces'}`;
    case 'outOfPosition':
      return by ? `caught out of position by ${by}` : 'caught out of position';
    case 'outnumbered':
      return by ? `outnumbered by ${by}` : 'outnumbered';
    case 'traded':
      if (f.killer) return `traded with ${pieceWord(f.killer)}`;
      return `worn down by ${KILLER_KIND[f.killerKind] ?? 'the board'}`;
  }
}

/** The toast for a White piece's death payload: "Your Rook fell — focused by Queen, Knight". */
export function fallToast(
  piece: PieceId,
  fall: { cause: DeathCause; killer: PieceId | null; by: PieceId[] },
): string {
  return `Your ${pieceWord(piece)} fell — ${fallPhrase({ ...fall, killerKind: fall.killer ? 'hero' : 'none' })}`;
}

// ------------------------------------------------------------------ gambit impact

const num = (v: number): string => Math.round(v).toLocaleString('en-US');

/** What a card measurably did, or null when the sim cannot attribute anything to it. */
function headline(id: string, m: CardMetrics, single: { fell: boolean } | null): string | null {
  switch (id) {
    case 'advance':
      return m.structure >= 1 ? `${num(m.structure)} Bastion damage` : null;
    case 'hold_the_file':
    case 'outpost':
      return m.prevented >= 10 ? `turned away about ${num(m.prevented)} damage` : null;
    case 'pawn_storm':
      return m.bonus >= 10 ? `about ${num(m.bonus)} extra damage from pawns` : null;
    case 'check': {
      const hit = m.bonus >= 10 ? `marked piece took ${num(m.bonus)} extra damage` : null;
      if (single?.fell) return hit ? `${hit}, and fell` : 'marked piece fell';
      return hit;
    }
    case 'queens_gambit':
      return Math.abs(m.bonus) >= 10
        ? `${m.bonus >= 0 ? '+' : '−'}${num(Math.abs(m.bonus))} net damage`
        : null;
    case 'siege':
      if (m.structure < 1) return null;
      return m.bonus >= 10
        ? `${num(m.structure)} Bastion damage, ${num(m.bonus)} from the card`
        : `${num(m.structure)} Bastion damage`;
    case 'sanctuary':
      return m.healed >= 10 ? `healed ${num(m.healed)}` : null;
    case 'pawn_sacrifice':
      return m.structure >= 1 ? `${num(m.structure)} Bastion damage` : null;
    case 'exchange':
      return m.bonus >= 10 ? `+${num(m.bonus)} team damage` : null;
    case 'poisoned_pawn':
      if (single)
        return single.fell ? `pawn fell, they lost ${num(m.drained)} Tempo` : 'pawn survived';
      return m.drained > 0 ? `drained ${num(m.drained)} Tempo` : null;
    case 'barricade':
      return m.met > 0 ? `${m.met} enemy ${m.met === 1 ? 'unit' : 'units'} reached the wall` : null;
    default:
      return null;
  }
}

const INSTANT: Record<string, string> = {
  castle: 'King and Rook swapped',
  fork: 'Knight leapt in',
  pawn_sacrifice: 'a pawn spent',
};

/**
 * One line on what a card did: the number the sim can attribute to it, else how long it ran;
 * always with the piece kills and losses beside it when there were any.
 */
export function cardResult(
  id: string,
  m: CardMetrics,
  seconds: number,
  single: { fell: boolean } | null = null,
): string {
  const parts: string[] = [];
  const head = headline(id, m, single);
  if (head) parts.push(head);
  else if (INSTANT[id]) parts.push(INSTANT[id]);
  else parts.push(`ran ${Math.round(seconds)} s`);
  if (m.kills > 0 || m.deaths > 0)
    parts.push(`nearby: ${m.kills} ${m.kills === 1 ? 'piece' : 'pieces'} felled, ${m.deaths} lost`);
  return parts.join('; ');
}

type GambitEnd = Extract<GameEvent, { type: 'gambitEnd' }>['payload'];

/** The line shown when a gambit's effect ends: "Barricade — 9 enemy units reached the wall". */
export function cardLine(name: string, g: GambitEnd, tps: number): string {
  return `${name} — ${cardResult(g.cardId, g, (g.endTick - g.startTick) / tps, { fell: g.fell })}`;
}

export const cardRow = (c: ActCardStat): string => cardResult(c.cardId, c, c.seconds / c.plays);

type GambitPlay = Extract<GameEvent, { type: 'gambit' }>['payload'];

/** The lane whose centre line passes within `maxOff` of the point, or null. */
export function laneNear(
  lanes: Record<LaneId, readonly (readonly number[])[]>,
  x: number,
  y: number,
  maxOff: number,
): LaneId | null {
  let best: LaneId | null = null;
  let bestD = maxOff;
  for (const id of ['top', 'mid', 'bot'] as const) {
    const line = lanes[id];
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1];
      const dx = line[i][0] - ax;
      const dy = line[i][1] - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
  }
  return best;
}

/**
 * The line for a gambit Black played: "Black played Barricade on Left lane", "Black played Check
 * on your Knight", or just the name for a card that needs no target.
 */
export function blackPlayLine(
  name: string,
  target: 'lane' | 'point' | 'enemy' | 'ally' | 'none',
  p: GambitPlay,
  where: { lane: LaneId | null; piece: PieceId | null; structure: string | null },
): string {
  const head = `${courtName('B')} played ${name}`;
  const lane = p.lane ?? where.lane;
  if ((target === 'lane' || target === 'point') && lane) return `${head} on ${laneName(lane)} lane`;
  if (target === 'enemy' && where.piece) return `${head} on your ${PIECE[where.piece]}`;
  if (target === 'enemy' && where.structure) return `${head} on your ${where.structure}`;
  return head;
}
