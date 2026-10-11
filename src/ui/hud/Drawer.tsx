import { useRef } from 'preact/hooks';
import type { Snapshot } from '../../sim';
import { AutoPawn } from '../AutoPawn';
import { useEscape, useSession } from '../session';
import { Aim } from './Aim';
import { Command } from './Command';
import { Hand } from './Hand';
import { NoteLane } from './Notes';

/** A drag this long (px) up or down on the bar opens or closes the drawer. */
const SWIPE_PX = 24;

/**
 * The gambit drawer. Collapsed it is one slim bar: the card toggle with the number of playable
 * cards, the Tempo meter and the Field Pawn button. Opened (tap the toggle, or swipe up) the hand
 * rises above the bar; the bar itself never moves, so the space the HUD takes stays the same.
 * Toasts, falls, the aim tray and the Tempo-full nudge float above the bar too.
 */
export function Drawer(props: { snap: Snapshot; open: boolean; onOpen: (open: boolean) => void }) {
  const s = useSession();
  const { snap, open, onOpen } = props;
  const playable = snap.hand.filter((c) => c.cardId !== '' && c.usable).length;
  // Pawn Structure fields pawns by its own counts, so the plan's switch has nothing to do
  const relicPawns = snap.relics.held.A.some((h) => h.id === 'pawn_structure');
  const down = useRef<number | null>(null);
  useEscape(open, () => onOpen(false));
  return (
    <div class="v2-drawer" data-testid="drawer" data-open={open}>
      <div class="dr-float">
        {s.ui.toast && (
          <div class="toast" role="alert" data-testid="toast">
            {s.ui.toast}
          </div>
        )}
        <NoteLane notes={s.ui.notes} />
        <Aim snap={snap} />
        <div class="dr-hand" id="dr-hand" aria-hidden={!open}>
          <div class="dr-hand-in">
            {!relicPawns && (
              <div class="dr-tools">
                <AutoPawn snap={snap} testId="drawer-auto-pawn" />
              </div>
            )}
            <Hand snap={snap} />
          </div>
        </div>
      </div>
      <div
        class="dr-bar glass"
        onPointerDown={(e) => {
          down.current = e.clientY;
        }}
        onPointerUp={(e) => {
          const from = down.current;
          down.current = null;
          if (from === null) return;
          if (from - e.clientY > SWIPE_PX) onOpen(true);
          else if (e.clientY - from > SWIPE_PX) onOpen(false);
        }}
        onPointerCancel={() => {
          down.current = null;
        }}
      >
        <Command
          snap={snap}
          lead={
            <button
              class={`dr-toggle ${open ? 'open' : ''}`}
              data-testid="drawer-toggle"
              data-playable={playable}
              aria-expanded={open}
              aria-controls="dr-hand"
              aria-label={`Gambit hand, ${playable} playable. Tap to ${open ? 'close' : 'open'}.`}
              onClick={() => onOpen(!open)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" class="dr-chev">
                <path
                  d="M2.5 9 7 4.5 11.5 9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="dr-label">Gambits</span>
              <b class={`dr-count ${playable === 0 ? 'none' : ''}`} data-testid="drawer-count">
                {playable}
              </b>
            </button>
          }
        />
      </div>
    </div>
  );
}
