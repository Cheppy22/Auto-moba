import type { Snapshot, SnapGambit } from '../../sim';
import { PieceGlyph } from '../pieces';
import { longPress, longPressed } from '../press';
import { useSession } from '../session';

export const TARGET_TAG: Record<SnapGambit['target'], string> = {
  lane: 'Pick a lane',
  point: 'Pick a spot',
  enemy: 'Pick a target',
  none: 'Instant',
};

/** The full text of a gambit: shown on a long press, and in the aim tray once a card is aimed. */
export function GambitInfo(props: { snap: Snapshot }) {
  const s = useSession();
  const info = s.ui.info;
  const c = info ? props.snap.hand[info.slot] : undefined;
  if (!info || !c || c.cardId !== info.cardId) return null;
  return (
    <div class="ginfo glass" data-testid="gambit-info" role="status" onClick={() => s.closeInfo()}>
      <span class="ginfo-top">
        <b>{c.name}</b>
        <span class="gcost" aria-label={`${c.cost} Tempo`}>
          {c.cost}
        </span>
      </span>
      <span class="ginfo-desc">{c.desc}</span>
      <span class="ginfo-tag dim tiny">
        {TARGET_TAG[c.target]}
        {c.usable ? '' : ` · Not now: ${c.reason}`}
      </span>
    </div>
  );
}

/**
 * The gambit hand: three cards showing name and cost. The full text is the tooltip, a long press,
 * or the aim tray; a card only says more when it cannot be played (why) or is about to expire.
 */
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
            <span class="gstate dim">
              {c.refillTicks === null ? 'Shuffling' : `Next in ${Math.ceil(c.refillTicks / 20)}s`}
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
            onClick={() => {
              if (longPressed()) return;
              s.closeInfo();
              s.playCard(c.slot);
            }}
            {...longPress(() => s.showInfo(c.slot))}
          >
            <span class="ghead">
              {c.piece && <PieceGlyph piece={c.piece} team="A" size={16} class="gsig" />}
              <span class="gname">{c.name}</span>
              <span class="gcost" aria-label={`${c.cost} Tempo`}>
                {c.cost}
              </span>
            </span>
            {!c.usable && <span class="gstate why">{c.reason}</span>}
            <span class={`timer ${c.ticksLeft < expireTicks * 0.25 ? 'low' : ''}`}>
              <i style={{ width: `${Math.min(100, (c.ticksLeft / expireTicks) * 100)}%` }} />
            </span>
          </button>
        ),
      )}
    </div>
  );
}
