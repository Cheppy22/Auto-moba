import { HpRing } from '../Ornament';
import { LANE_LABEL, PieceGlyph, pieceLabel } from '../pieces';
import { useSession } from '../session';
import { courtUnits } from './courtUnits';

/**
 * Black's five pieces as small tokens in the top bar: icon, health ring, rank, alive or down.
 * Tap one for its piece card (the same card as a tap on the board).
 */
export function BlackCourt() {
  const s = useSession();
  const m = s.match!;
  return (
    <div class="bcourt" data-testid="roster-enemy" role="group" aria-label="Black pieces">
      {courtUnits(m, 'B').map((u) => {
        const h = u.hero!;
        const frac = u.alive ? u.hp / u.stats.maxHp : 0;
        const hurt = u.alive && frac < 0.35;
        const open = s.ui.card === u.id;
        const name = pieceLabel(s.content, h.defId);
        return (
          <button
            key={u.id}
            class={`btoken ${u.alive ? '' : 'down'} ${open ? 'open' : ''}`}
            data-testid={`roster-B-${h.defId}`}
            data-rank={h.rank}
            aria-label={`Black ${name}, rank ${h.rank}, ${LANE_LABEL[h.lane ?? 'mid']}${u.alive ? '' : ', down'}`}
            aria-expanded={open}
            title={`Black ${name} · Rank ${h.rank}${u.alive ? '' : ' · down'} (tap for details)`}
            onClick={() => s.openCard(u.id)}
          >
            <HpRing frac={frac} color={hurt ? 'var(--clock-hi)' : 'var(--b)'} alive={u.alive}>
              <PieceGlyph piece={h.defId} team="B" size={18} />
            </HpRing>
            <b class="btoken-rank">{h.rank}</b>
            {!u.alive && (
              <i class="btoken-x" aria-hidden="true">
                ×
              </i>
            )}
          </button>
        );
      })}
    </div>
  );
}
