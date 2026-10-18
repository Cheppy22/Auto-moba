import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import type { Snapshot } from '../../sim';
import { PieceGlyph } from '../pieces';
import { useSession } from '../session';

/** Full Tempo for this long (ticks, 20 a second) with nothing spent earns the nudge. */
const IDLE_FULL_TICKS = 5 * 20;

/** The Tempo meter, the permanent Field Pawn button, and a nudge when Tempo sits full and unspent. */
export function Command(props: { snap: Snapshot; lead?: ComponentChildren }) {
  const s = useSession();
  const { snap } = props;
  const max = snap.tempoMax;
  const p = snap.pawns.A;
  const tempo = snap.tempo.A;
  const why = tempo < p.cost ? 'Not enough Tempo' : p.alive >= p.cap ? 'Pawn cap reached' : '';
  const aiming = s.ui.aim !== null;
  const fullSince = useRef<number | null>(null);
  if (tempo < max) fullSince.current = null;
  else if (fullSince.current === null || fullSince.current > snap.tick)
    fullSince.current = snap.tick;
  const bell = snap.act.bell;
  const full = tempo >= max;
  const { slowTicks, incrementTicks, refund } = snap.clock;
  const nudge =
    full &&
    !aiming &&
    (bell === 'none' || bell === 'pending') &&
    snap.tick - (fullSince.current ?? snap.tick) >= IDLE_FULL_TICKS;
  return (
    <>
      {nudge && (
        <div class="tempo-nudge" role="status" data-testid="tempo-nudge">
          Tempo full — field pawns or play a card
        </div>
      )}
      <div class="cmd">
        {props.lead}
        <div
          class={`tempo glass ${full ? 'full' : ''} ${nudge ? 'nudge' : ''} ${slowTicks > 0 ? 'slowed' : ''}`}
          data-testid="tempo"
          data-full={full}
          role="meter"
          aria-label="Tempo"
          aria-valuenow={tempo}
          aria-valuemin={0}
          aria-valuemax={max}
          title="Tempo: +1 per second, more for kills and Bastions. It pays for gambits and pawns."
        >
          <span class="tempo-top">
            <span class="tempo-label">Tempo</span>
            {(slowTicks > 0 || incrementTicks > 0) && (
              <span class="tempo-clock" data-testid="tempo-clock">
                {slowTicks > 0 && (
                  <span class="tc-slow" title="Time Trouble: you earn Tempo slower for now">
                    Slowed {Math.ceil(slowTicks / 20)}s
                  </span>
                )}
                {incrementTicks > 0 && (
                  <span class="tc-inc" title="Increment: each card you play gives Tempo back">
                    +{refund} a card · {Math.ceil(incrementTicks / 20)}s
                  </span>
                )}
              </span>
            )}
            <b class="tempo-value" data-testid="tempo-value">
              {tempo}
            </b>
          </span>
          <span class="tempo-bar">
            <i style={{ width: `${Math.min(100, (tempo / max) * 100)}%` }} />
            <u style={{ left: `${(p.cost / max) * 100}%` }} title="Pawn cost" />
          </span>
        </div>
        <button
          class={`pawnbtn glass ${why ? 'off' : ''} ${s.ui.aim?.kind === 'pawn' ? 'aiming' : ''} ${nudge && !why ? 'nudge' : ''}`}
          data-testid="field-pawn"
          aria-disabled={!!why}
          aria-pressed={s.ui.aim?.kind === 'pawn'}
          title={`Field a pawn for ${p.cost} Tempo: an elite foot soldier that marches a lane. ${why}`}
          onClick={() => s.fieldPawn()}
        >
          <PieceGlyph piece="pawn" team="A" size={26} />
          <span class="pawn-text">
            <b>Field Pawn</b>
            <span data-testid="pawn-count">
              {p.alive}/{p.cap} · {p.cost} Tempo
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
