import type { Snapshot, SnapGambit } from '../../sim';
import { Term, Terms } from '../glossary';
import { PieceGlyph, pieceLabel } from '../pieces';
import { longPress, longPressed } from '../press';
import {
  COUNTERED_BY,
  COUNTERS,
  SCHOOL_COLOR,
  SCHOOL_JOB,
  SCHOOL_NAME,
  SchoolGlyph,
  schoolNames,
} from '../schools';
import { useEscape, useSession } from '../session';

export const TARGET_TAG: Record<SnapGambit['target'], string> = {
  lane: 'Pick a lane',
  point: 'Pick a spot',
  enemy: 'Pick a target',
  ally: 'Pick one of your pieces',
  none: 'Instant',
};

/** How a card's expiry reads once the sheet is open (the game is paused, so it holds still). */
function expiryText(ticksLeft: number): string {
  return `Expires in ${Math.max(1, Math.ceil(ticksLeft / 20))} s unless played`;
}

/**
 * The enlarged gambit card: a centred sheet opened by a long press (or right-click) on a card.
 * The game is paused while it is open. Play closes it and aims the card as a tap would; Close,
 * the scrim and Escape just close it.
 */
export function GambitSheet(props: { snap: Snapshot }) {
  const s = useSession();
  const info = s.ui.info;
  const c = info ? props.snap.hand[info.slot] : undefined;
  const open = !!info && !!c && c.cardId === info.cardId;
  useEscape(open, () => s.closeInfo());
  if (!info || !c || !open) return null;
  return (
    <>
      <div
        class="gsheet-scrim"
        data-testid="gambit-scrim"
        aria-hidden="true"
        onClick={() => {
          // the finger that opened the sheet is still lifting: that tap must not close it
          if (performance.now() - s.infoAt > 350) s.closeInfo();
        }}
      />
      <section
        class={`gsheet ${c.piece ? 'sig' : ''}`}
        data-testid="gambit-info"
        data-school={c.school}
        style={c.school ? { '--school': SCHOOL_COLOR[c.school] } : undefined}
        data-card={c.cardId}
        role="dialog"
        aria-modal="true"
        aria-label={`${c.name}, gambit`}
      >
        <header class="gs-head">
          {c.piece ? (
            <PieceGlyph piece={c.piece} team="A" size={36} class="gsig" />
          ) : (
            <span class="gs-any" aria-hidden="true">
              ♟
            </span>
          )}
          <div class="gs-title">
            <b data-testid="gambit-info-name">{c.name}</b>
            <span class="gs-sub" data-testid="gambit-info-piece">
              {c.piece ? `${pieceLabel(s.content, c.piece)} gambit` : 'Any piece'}
            </span>
          </div>
          <span class="gs-cost" data-testid="gambit-info-cost" aria-label={`${c.cost} Tempo`}>
            {c.cost}
            <small>
              <Term id="tempo">Tempo</Term>
            </small>
          </span>
        </header>
        <p class="gs-desc" data-testid="gambit-info-desc">
          <Terms text={c.desc} skip={['tempo']} max={2} />
        </p>
        {c.school && (
          <div class="gs-school" data-testid="gambit-info-school">
            <b class="gs-school-name">
              <SchoolGlyph school={c.school} size={18} />
              {SCHOOL_NAME[c.school]} <Term id="school">school</Term>
            </b>
            <span class="gs-school-job">{SCHOOL_JOB[c.school]}</span>
            <span class="gs-school-row">
              <i>Counters</i> {schoolNames(COUNTERS[c.school])}
            </span>
            <span class="gs-school-row">
              <i>Countered by</i> {schoolNames(COUNTERED_BY[c.school])}
            </span>
          </div>
        )}
        <ul class="gs-facts">
          <li data-testid="gambit-info-target">{TARGET_TAG[c.target]}</li>
          <li data-testid="gambit-info-expiry">{expiryText(c.ticksLeft)}</li>
          <li class="gs-paused">Game paused</li>
        </ul>
        {!c.usable && <p class="gs-why">Not now: {c.reason}</p>}
        <footer class="gs-actions">
          <button
            class="btn primary"
            data-testid="gambit-info-play"
            disabled={!c.usable}
            onClick={() => {
              const slot = c.slot;
              s.closeInfo();
              s.playCard(slot);
            }}
          >
            Play
          </button>
          <button class="btn" data-testid="gambit-info-close" onClick={() => s.closeInfo()}>
            Close
          </button>
        </footer>
      </section>
    </>
  );
}

/**
 * The gambit hand: three cards showing name and cost. The full text is the tooltip, the enlarged
 * sheet (long press or right-click), or the aim tray; a card only says more when it cannot be played (why) or is about to expire.
 */
export function Hand(props: { snap: Snapshot }) {
  const s = useSession();
  const { snap } = props;
  const g = s.content.tuning.gambits;
  const expireTicks = g.expireSec * 20;
  const refillTicks = snap.handRefillSec * 20;
  const aimSlot = s.ui.aim?.kind === 'gambit' ? s.ui.aim.slot : -1;
  // while the bell has stopped play every card is inert: dim them, but say it once (the bell line), not on each card
  const stopped = snap.act.bell === 'halt' || snap.act.bell === 'break';
  return (
    <div
      class="hand"
      data-testid="hand"
      role="group"
      aria-label="Gambit hand"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, snap.hand.length)}, minmax(0, 1fr))` }}
    >
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
            data-school={c.school}
            style={c.school ? { '--school': SCHOOL_COLOR[c.school] } : undefined}
            data-usable={c.usable}
            aria-disabled={!c.usable}
            aria-pressed={aimSlot === c.slot}
            title={`${c.name} (${c.school ? `${SCHOOL_NAME[c.school]}, ` : ''}${c.cost} Tempo): ${c.desc}${c.usable ? '' : ` Not now: ${c.reason}.`}`}
            onClick={() => {
              if (longPressed()) return;
              s.closeInfo();
              s.playCard(c.slot);
            }}
            {...longPress(() => s.showInfo(c.slot))}
          >
            <span class="ghead">
              {c.school && <SchoolGlyph school={c.school} size={14} class="gschool" />}
              {c.piece && <PieceGlyph piece={c.piece} team="A" size={16} class="gsig" />}
              <span class="gname">{c.name}</span>
              <span class="gcost" aria-label={`${c.cost} Tempo`}>
                {c.cost}
              </span>
            </span>
            {!c.usable && !stopped && <span class="gstate why">{c.reason}</span>}
            <span class={`timer ${c.ticksLeft < expireTicks * 0.25 ? 'low' : ''}`}>
              <i style={{ width: `${Math.min(100, (c.ticksLeft / expireTicks) * 100)}%` }} />
            </span>
          </button>
        ),
      )}
    </div>
  );
}
