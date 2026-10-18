import type { Content, Grade } from '../sim';
import { SCHOOL_COLOR, SchoolGlyph } from './schools';

/** The grade mark after a Technique's name: Sharp `!`, Brilliant `!!`. */
export const GRADE_MARK: Record<Grade, string> = { plain: '', sharp: '!', brilliant: '!!' };

/** A held Technique as a small chip: its school's glyph and colour, its name and grade mark. */
export function TechniqueChip(props: { c: Content; id: string; grade?: Grade; glyph?: number }) {
  const d = props.c.techniqueById.get(props.id);
  if (!d) return null;
  const mark = props.grade ? GRADE_MARK[props.grade] : '';
  return (
    <span
      class="tech-chip"
      data-testid="tech-chip"
      data-technique={d.id}
      data-school={d.school}
      style={{ '--school': SCHOOL_COLOR[d.school] }}
    >
      <SchoolGlyph school={d.school} size={props.glyph ?? 14} />
      <span>
        {d.name}
        {mark && <b class="tech-grade"> {mark}</b>}
      </span>
    </span>
  );
}
