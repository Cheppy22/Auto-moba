// Small pieces the Tournament run's screens share: a court's seal, an Opening line, a relic row.
import type { CarriedRelic, Content, CourtDef, OpponentDef, RunState } from '../../sim';
import { finishLabel, roundName, type BestFinish } from '../../sim';
import { laneName } from '../../analysis/text';
import { LANES, PIECE_ORDER, PieceGlyph, StyleBadge, pieceLabel, styleLabel } from '../pieces';
import { RelicSeal, relicText } from '../relics';
import { SCHOOL_COLOR, SCHOOL_ORDER, SchoolChip } from '../schools';
import { HeraldicSeal } from './seals';

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * A court's seal: a hand-made court's heraldic seal, or (for a generated stand-in) a wax-like
 * medallion with a Black piece in it, its colour and piece drawn from the court's name.
 */
export function CourtSeal(props: {
  name: string;
  court?: CourtDef;
  size?: number;
  final?: boolean;
}) {
  if (props.court)
    return <HeraldicSeal court={props.court} size={props.size} final={props.final} />;
  const h = hash(props.name);
  const colour = SCHOOL_COLOR[SCHOOL_ORDER[h % SCHOOL_ORDER.length]];
  const piece = props.final ? 'queen' : PIECE_ORDER[(h >>> 4) % PIECE_ORDER.length];
  const size = props.size ?? 52;
  return (
    <span
      class={`court-seal ${props.final ? 'final' : ''}`}
      style={{ '--seal': colour, width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <PieceGlyph piece={piece} team="B" size={Math.round(size * 0.58)} />
    </span>
  );
}

/** An Opening's name and its school chips. */
export function OpeningLine(props: { c: Content; opening: string }) {
  const o = props.c.openingById.get(props.opening);
  if (!o) return null;
  return (
    <span class="opening-line">
      <b>{o.name}</b>
      <span class="opening-schools">
        {o.schools.length > 0 ? (
          o.schools.map((s) => <SchoolChip key={s} school={s} glyph={13} />)
        ) : (
          <span class="school-chip balanced">Balanced</span>
        )}
      </span>
    </span>
  );
}

/** Relics as seal and name, one per line (their names are what a player reads). */
export function RelicNames(props: { c: Content; relics: Pick<CarriedRelic, 'id'>[] }) {
  return (
    <ul class="relic-names">
      {props.relics.map((r) => {
        const def = props.c.relicById.get(r.id);
        if (!def) return null;
        return (
          <li key={r.id}>
            <RelicSeal family={def.family} size={20} />
            <span>{def.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Round 2 of 4 · County". */
export const roundLine = (c: Content, run: RunState, round = run.round): string =>
  `Round ${round + 1} of ${run.opponents.length} · ${roundName(c, round)}`;

/** What a court starts with, in a sentence ("Starts with 2 relics and +10 Tempo."). */
export function startsWith(c: Content, opp: OpponentDef): string {
  const n = opp.relics.length;
  const parts: string[] = [];
  parts.push(n === 0 ? 'no relics' : n === 1 ? '1 relic' : `${n} relics`);
  if (opp.tempoBonus > 0) parts.push(`+${opp.tempoBonus} Tempo`);
  return `Starts with ${parts.join(' and ')}.`;
}

/** The best-finish line: "Best: reached the Final". */
export function bestText(c: Content, best: BestFinish): string {
  const label = finishLabel(c, best);
  return `Best: ${best.champion ? label : label.charAt(0).toLowerCase() + label.slice(1)}`;
}

/** The end title of a run that was lost: "Out in the Semifinal", "Out in the Club round". */
export function outLabel(c: Content, round: number): string {
  const name = roundName(c, round);
  return name === 'Semifinal' || name === 'Final'
    ? `Out in the ${name}`
    : `Out in the ${name} round`;
}

/** A court's five archetypes as small badges with their names, in the usual piece order. */
export function CourtStyles(props: { c: Content; court: CourtDef }) {
  const { c, court } = props;
  return (
    <ul class="court-styles" data-testid="court-styles" aria-label="Archetypes it takes at Rank 4">
      {PIECE_ORDER.map((p) => (
        <li key={p}>
          <StyleBadge style={court.styles[p]} team="B" size={16} />
          <span>
            <span class="cs-piece">{pieceLabel(c, p)}</span> {styleLabel(c, p, court.styles[p])}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Where a court fields its pieces: "Left: Knight, Bishop. Mid: Queen. Right: King, Rook." */
export function laneLine(c: Content, court: CourtDef): string {
  return LANES.map((lane) => {
    const names = PIECE_ORDER.filter((p) =>
      court.pieces.some((e) => e.piece === p && e.lane === lane),
    );
    return `${laneName(lane)}: ${names.map((p) => pieceLabel(c, p)).join(', ')}`;
  }).join('. ');
}

/** The relic a court always starts with: its seal and name, and what it does for that court. */
export function SignatureRelic(props: { c: Content; court: CourtDef; text?: boolean }) {
  const def = props.c.relicById.get(props.court.signature.relic);
  if (!def) return null;
  return (
    <span class="signature-relic" data-testid="signature-relic">
      <RelicSeal family={def.family} size={18} />
      <span>
        <b>{def.name}</b>
        {props.text && (
          <span class="sig-text"> {relicText(props.c, def, 'B', props.court.opening)}</span>
        )}
      </span>
    </span>
  );
}
