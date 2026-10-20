import type { MatchPace } from '../sim';
import { Term } from './glossary';

const OPTIONS: { id: MatchPace; name: string; line: string }[] = [
  {
    id: 'blitz',
    name: 'Blitz',
    line: '3 Acts, about 10 min. Checkmate ends it early; if not, decided on points.',
  },
  { id: 'classical', name: 'Classical', line: 'The full match, about 15 min.' },
];

/**
 * The pace switch (Setup's Opening page in an Exhibition, the Draw in a Tournament): Blitz or
 * Classical, each with one line. The choice is remembered on this device (`src/ui/pace.ts`).
 */
export function PacePicker(props: {
  value: MatchPace;
  onPick: (pace: MatchPace) => void;
  /** One line under the switch (with the two glossary words), e.g. what the choice covers. */
  note?: string;
}) {
  return (
    <div class="pace-pick" data-testid="pace-picker">
      <span class="pace-pick-label">Pace</span>
      <div class="pace-opts" role="radiogroup" aria-label="Pace">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={props.value === o.id}
            class={`pace-opt ${props.value === o.id ? 'on' : ''}`}
            data-testid={`pace-${o.id}`}
            onClick={() => props.onPick(o.id)}
          >
            <b>{o.name}</b>
            <span>{o.line}</span>
          </button>
        ))}
      </div>
      <p class="pace-now">{OPTIONS.find((o) => o.id === props.value)?.line}</p>
      {props.note && (
        <p class="pace-note">
          <Term id="blitz">Blitz</Term> or <Term id="classical">Classical</Term>: {props.note}
        </p>
      )}
    </div>
  );
}
