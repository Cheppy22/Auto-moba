import type { Snapshot, SnapGambit } from '../../sim';
import { PieceGlyph } from '../pieces';
import { useSession } from '../session';

const TARGET_TAG: Record<SnapGambit['target'], string> = {
  lane: 'Pick a lane',
  point: 'Pick a spot',
  enemy: 'Pick a target',
  none: 'Instant',
};

/** The gambit hand: three cards with cost, state and an expiry timer. */
export function Hand(props: { snap: Snapshot }) {
  const s = useSession();
  const { snap } = props;
  const g = s.content.tuning.gambits;
  const expireTicks = g.expireSec * 20;
  const refillTicks = g.refillSec * 20;
  const aimSlot = s.ui.aim?.kind === 'gambit' ? s.ui.aim.slot : -1;
  return (
    <div class="hand" data-testid="hand" role="group" aria-label="Gambit hand">
      {snap.hand.map((c) =>
        c.cardId === '' ? (
          <div class="gcard empty" key={c.slot} data-testid={`gambit-${c.slot}`} data-empty="true">
            <span class="gname dim">Next card</span>
            <span class="gstate dim">
              {c.refillTicks === null ? 'shuffling' : `in ${Math.ceil(c.refillTicks / 20)}s`}
            </span>
            <span class="timer refill">
              <i
                style={{
                  width: `${Math.round((1 - (c.refillTicks ?? refillTicks) / refillTicks) * 100)}%`,
                }}
              />
            </span>
          </div>
        ) : (
          <button
            key={c.slot}
            class={`gcard ${c.usable ? 'usable' : 'off'} ${aimSlot === c.slot ? 'aiming' : ''} ${c.piece ? 'sig' : ''}`}
            data-testid={`gambit-${c.slot}`}
            data-card={c.cardId}
            data-usable={c.usable}
            aria-disabled={!c.usable}
            aria-pressed={aimSlot === c.slot}
            title={`${c.name} (${c.cost} Tempo): ${c.desc}${c.usable ? '' : ` Not now: ${c.reason}.`}`}
            onClick={() => s.playCard(c.slot)}
          >
            <span class="ghead">
              {c.piece && <PieceGlyph piece={c.piece} team="A" size={18} class="gsig" />}
              <span class="gname">{c.name}</span>
              <span class="gcost" aria-label={`${c.cost} Tempo`}>
                {c.cost}
              </span>
            </span>
            <span class="gdesc">{c.desc}</span>
            <span class={`gstate ${c.usable ? '' : 'why'}`}>
              {c.usable ? TARGET_TAG[c.target] : c.reason}
            </span>
            <span class={`timer ${c.ticksLeft < expireTicks * 0.25 ? 'low' : ''}`}>
              <i style={{ width: `${Math.min(100, (c.ticksLeft / expireTicks) * 100)}%` }} />
            </span>
          </button>
        ),
      )}
    </div>
  );
}
