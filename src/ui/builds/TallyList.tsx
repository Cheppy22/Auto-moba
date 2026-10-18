import type { Content } from '../../sim';
import { pieceLabel } from '../pieces';
import { SCHOOL_COLOR, SchoolGlyph } from '../schools';
import { tallyText, type TallyRow } from './tally';

/** Techniques with what each did, one line apiece: school mark, name, piece, the numbers. */
export function TallyList(props: { c: Content; rows: readonly TallyRow[]; testid?: string }) {
  return (
    <ul class="tl" data-testid={props.testid}>
      {props.rows.map((r) => (
        <li
          key={`${r.heroId}:${r.id}`}
          data-testid={`tally-${r.piece}-${r.id}`}
          style={{ '--school': SCHOOL_COLOR[r.school] }}
        >
          <SchoolGlyph school={r.school} size={14} />
          <span class="tl-what">
            <b>{r.name}</b>
            <span class="dim"> · {pieceLabel(props.c, r.piece)}</span>
          </span>
          <span class="tl-nums">{tallyText(r.tally)}</span>
        </li>
      ))}
    </ul>
  );
}
