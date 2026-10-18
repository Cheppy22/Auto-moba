import { useState } from 'preact/hooks';
import { pieceLabel } from './pieces';
import {
  COUNTERED_BY,
  COUNTERS,
  SCHOOL_COLOR,
  SCHOOL_JOB,
  SCHOOL_NAME,
  SCHOOL_ORDER,
  SchoolGlyph,
  schoolNames,
  type School,
} from './schools';
import { useSession } from './session';

/**
 * Rules -> All cards: a row of six school chips, and the picked school's four cards with their
 * cost and one line each. Read-only; live play adds nothing.
 */
export function AllCards() {
  const s = useSession();
  const [school, setSchool] = useState<School>(SCHOOL_ORDER[0]);
  const cards = s.content.gambits.filter((g) => g.school === school && g.weight > 0);
  const openers = s.content.openings.filter((o) => o.openingCard !== null);
  return (
    <div class="allcards" data-testid="allcards">
      <div class="ac-chips" role="tablist" aria-label="Schools">
        {SCHOOL_ORDER.map((sc) => (
          <button
            key={sc}
            role="tab"
            class={`ac-chip ${sc === school ? 'on' : ''}`}
            aria-selected={sc === school}
            aria-label={SCHOOL_NAME[sc]}
            title={SCHOOL_NAME[sc]}
            data-testid={`ac-chip-${sc}`}
            style={{ '--school': SCHOOL_COLOR[sc] }}
            onClick={() => setSchool(sc)}
          >
            <SchoolGlyph school={sc} size={22} />
          </button>
        ))}
      </div>
      <section
        class="ac-school"
        aria-label={`${SCHOOL_NAME[school]} cards`}
        data-testid={`ac-school-${school}`}
        style={{ '--school': SCHOOL_COLOR[school] }}
      >
        <h3 class="ac-h">
          <SchoolGlyph school={school} size={20} />
          {SCHOOL_NAME[school]}
        </h3>
        <p class="ac-job">{SCHOOL_JOB[school]}</p>
        <p class="ac-counter dim">
          Counters {schoolNames(COUNTERS[school])}. Countered by {schoolNames(COUNTERED_BY[school])}
          .
        </p>
        <ul class="ac-list">
          {cards.map((g) => {
            const opener = openers.filter((o) => o.openingCard === g.id).map((o) => o.name);
            return (
              <li class="ac-card" key={g.id} data-testid={`ac-card-${g.id}`}>
                <span class="ac-name">
                  <b>{g.name}</b>
                  <span class="ac-cost" aria-label={`${g.cost} Tempo`}>
                    {g.cost}
                  </span>
                </span>
                <span class="ac-desc">{g.desc}</span>
                {(g.piece || opener.length > 0) && (
                  <span class="ac-note dim">
                    {g.piece && `Needs the ${pieceLabel(s.content, g.piece)}. `}
                    {opener.length > 0 && `Opening card of the ${opener.join(' and ')}.`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
