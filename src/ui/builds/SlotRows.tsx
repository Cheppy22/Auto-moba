import type { BuildView, Content, TechniqueSlot } from '../../sim';
import { TechniqueChip } from '../TechniqueChip';
import { counted, tallyText } from './tally';

const SLOT_KIND: Record<TechniqueSlot, string> = {
  attack: 'Attack',
  skill1: 'Skill I',
  skill2: 'Skill II',
  skill3: 'Skill III',
  signature: 'Signature',
  trait: 'Trait',
};

/**
 * A piece's six slots as read-only rows: the slot's name, the Technique held there with its grade,
 * what it has done this match so far, and a "1 away" note when a Combination lacks one parent.
 */
export function SlotRows(props: { c: Content; view: BuildView; testid?: string }) {
  return (
    <ul class="sr" data-testid={props.testid}>
      {props.view.slots.map((sl) => (
        <li
          key={sl.slot}
          class={`sr-row ${sl.held ? 'held' : 'empty'}`}
          data-testid={`slot-${sl.slot}`}
        >
          <span class="sr-slot">
            {SLOT_KIND[sl.slot] !== sl.name && (
              <span class="sr-kind tiny">{SLOT_KIND[sl.slot]}</span>
            )}
            {sl.name}
          </span>
          {sl.held ? (
            <span class="sr-body">
              <TechniqueChip c={props.c} id={sl.held.id} grade={sl.held.grade} />
              <span class="sr-did tiny">
                {counted(sl.held.did.match)
                  ? tallyText(sl.held.did.match)
                  : 'Nothing counted yet (it may only change stats)'}
              </span>
              {sl.held.oneAway.length > 0 && (
                <span class="sr-away tiny">1 away from {sl.held.oneAway.join(', ')}</span>
              )}
            </span>
          ) : (
            <span class="sr-body dim tiny">
              {sl.locked ? 'Opens at Rank 4 with the archetype' : 'Empty'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
