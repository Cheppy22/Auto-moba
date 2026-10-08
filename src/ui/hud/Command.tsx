import type { Snapshot } from '../../sim';
import { PieceGlyph } from '../pieces';
import { useSession } from '../session';

/** The Tempo meter and the permanent Field Pawn button. */
export function Command(props: { snap: Snapshot }) {
  const s = useSession();
  const { snap } = props;
  const max = s.content.tuning.gambits.tempoMax;
  const p = snap.pawns.A;
  const tempo = snap.tempo.A;
  const why = tempo < p.cost ? 'Not enough Tempo' : p.alive >= p.cap ? 'Pawn cap reached' : '';
  const aiming = s.ui.aim?.kind === 'pawn';
  return (
    <div class="cmd">
      <div
        class="tempo glass"
        data-testid="tempo"
        role="meter"
        aria-label="Tempo"
        aria-valuenow={tempo}
        aria-valuemin={0}
        aria-valuemax={max}
        title="Tempo: +1 per second, more for kills and Bastions. It pays for gambits and pawns."
      >
        <span class="tempo-top">
          <span class="tempo-label">Tempo</span>
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
        class={`pawnbtn glass ${why ? 'off' : ''} ${aiming ? 'aiming' : ''}`}
        data-testid="field-pawn"
        aria-disabled={!!why}
        aria-pressed={aiming}
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
  );
}
