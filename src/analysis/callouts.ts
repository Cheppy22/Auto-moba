import type { ActPieceStat, ActReport, LaneId, PlayTeam } from '../sim';
import { laneName } from './text';

export interface Callout {
  /** Rule that produced it (one callout per rule per subject). */
  id: string;
  /** Higher reads first. Losses outrank wins. */
  severity: number;
  tone: 'bad' | 'good' | 'note';
  text: string;
}

const PIECE: Record<string, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};
const KILLER: Record<string, string> = {
  minion: 'pawns',
  tower: 'Bastions',
  guardian: 'their Throne',
  camp: 'the jungle',
};
const LANES: LaneId[] = ['top', 'mid', 'bot'];
const MAX_CALLOUTS = 3;
const MIN_CALLOUTS = 2;

const pieceName = (id: string): string => PIECE[id] ?? id;
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const pct = (v: number): string => `${Math.round(v * 100)}%`;

function killerPhrase(p: ActPieceStat): string {
  const entries = Object.entries(p.diedTo).sort((a, b) => b[1] - a[1]);
  const [by, n] = entries[0] ?? ['none', 0];
  if (by === 'none' || n < 2 || n / p.deaths < 0.6) return '';
  const who = PIECE[by] ? `their ${PIECE[by]}` : KILLER[by];
  return who ? `, mostly to ${who}` : '';
}

/**
 * Plain-language coaching for the Act that just closed, ranked by severity: only rules that are
 * true of these numbers fire, and at most three are returned (at least two when the Act allows).
 */
export function actCallouts(report: ActReport, viewer: PlayTeam = 'A'): Callout[] {
  const me = report.teams[viewer];
  const foe = report.teams[viewer === 'A' ? 'B' : 'A'];
  const out: Callout[] = [];
  const add = (c: Callout): void => {
    out.push(c);
  };

  if (me.throneLost)
    add({
      id: 'throne-lost',
      severity: 1,
      tone: 'bad',
      text: 'Your Throne fell. If your King falls now he cannot return.',
    });

  if (me.bastionsLost.length > 0) {
    const n = me.bastionsLost.length;
    const where = [...new Set(me.bastionsLost)].map(laneName).join(' and ');
    add({
      id: 'bastion-lost',
      severity: 0.85 + 0.03 * n,
      tone: 'bad',
      text: n === 1 ? `You lost a Bastion on the ${where}.` : `You lost ${n} Bastions (${where}).`,
    });
  }

  for (const p of me.pieces) {
    if (p.deaths < 2) continue;
    add({
      id: `died-${p.piece}`,
      severity: Math.min(0.9, 0.55 + 0.1 * (p.deaths - 2)),
      tone: 'bad',
      text: `Your ${laneName(p.lane)} ${pieceName(p.piece)} died ${p.deaths}× this Act${killerPhrase(p)}.`,
    });
  }

  const tempoGap = foe.tempo - me.tempo;
  if (tempoGap >= 40)
    add({
      id: 'tempo-behind',
      severity: 0.4 + Math.min(0.3, tempoGap / 400),
      tone: 'bad',
      text: `They out-earned you by ${tempoGap} Tempo.`,
    });
  else if (tempoGap <= -40)
    add({
      id: 'tempo-ahead',
      severity: 0.3,
      tone: 'good',
      text: `You out-earned them by ${-tempoGap} Tempo.`,
    });

  if (me.gambits === 0 && me.pawns === 0 && me.tempoHeld >= 30)
    add({
      id: 'tempo-idle',
      severity: 0.5,
      tone: 'bad',
      text: `You played no gambits and fielded no pawns: ${me.tempoHeld} Tempo is sitting unused.`,
    });

  const waves = Math.max(1, report.waves);
  for (const lane of LANES) {
    const perWave = (me.pawnlingsLost[lane] - foe.pawnlingsLost[lane]) / waves;
    if (perWave >= 1.5)
      add({
        id: `pawnlings-${lane}`,
        severity: 0.45 + Math.min(0.25, perWave * 0.05),
        tone: 'bad',
        text: `The ${laneName(lane)} lane lost about ${Math.round(perWave)} more pawnlings per wave than theirs.`,
      });
  }

  const pieceDamage = me.pieces.reduce((a, p) => a + p.damage, 0);
  if (pieceDamage >= 400) {
    const share = (p: ActPieceStat): number => p.damage / pieceDamage;
    const low = [...me.pieces].sort((a, b) => share(a) - share(b))[0];
    if (low && share(low) < 0.1)
      add({
        id: 'low-damage',
        severity: 0.4,
        tone: 'bad',
        text: `Your ${pieceName(low.piece)} dealt only ${pct(share(low))} of your damage.`,
      });
    const top = [...me.pieces].sort((a, b) => share(b) - share(a))[0];
    if (top && share(top) >= 0.5)
      add({
        id: 'carry-damage',
        severity: 0.25,
        tone: 'note',
        text: `Your ${pieceName(top.piece)} dealt ${pct(share(top))} of your damage. Keep it alive.`,
      });
  }

  if (
    foe.damage > 0 &&
    me.damage > 0 &&
    foe.damage >= me.damage * 1.3 &&
    foe.damage - me.damage >= 1000
  )
    add({
      id: 'damage-behind',
      severity: 0.35,
      tone: 'bad',
      text: `They dealt ${pct(foe.damage / me.damage - 1)} more damage than you.`,
    });

  const obeliskGap = foe.obelisks - me.obelisks;
  if (obeliskGap >= 1)
    add({
      id: 'obelisks',
      severity: 0.35,
      tone: 'bad',
      text: `They claimed ${obeliskGap} more ${plural(obeliskGap, 'obelisk', 'obelisks')} than you.`,
    });

  if (foe.bastionsLost.length > 0) {
    const n = foe.bastionsLost.length;
    const where = [...new Set(foe.bastionsLost)].map(laneName).join(' and ');
    add({
      id: 'bastion-taken',
      severity: 0.5,
      tone: 'good',
      text: n === 1 ? `You took a Bastion on the ${where}.` : `You took ${n} Bastions (${where}).`,
    });
  }

  for (const p of foe.pieces) {
    if (p.deaths < 2) continue;
    add({
      id: `foe-died-${p.piece}`,
      severity: 0.4,
      tone: 'good',
      text: `Their ${pieceName(p.piece)} fell ${p.deaths}× this Act. Press the lane.`,
    });
  }

  if (me.pieceDeaths === 0 && foe.pieceDeaths >= 1)
    add({
      id: 'clean',
      severity: 0.35,
      tone: 'good',
      text: 'None of your pieces fell this Act.',
    });

  out.sort((a, b) => b.severity - a.severity);
  const picked = out.slice(0, MAX_CALLOUTS);
  if (picked.length < MIN_CALLOUTS)
    picked.push({
      id: 'quiet',
      severity: 0,
      tone: 'note',
      text:
        me.pieceDeaths + foe.pieceDeaths === 0
          ? 'A quiet Act: no piece fell on either side.'
          : 'An even Act: neither side pulled clearly ahead.',
    });
  return picked;
}
