import { HpRing } from '../Ornament';
import type { Snapshot } from '../../sim';
import { LANE_NOW_LABEL, LaneMark, PieceGlyph, pieceLabel, shownLane } from '../pieces';
import { useSession } from '../session';
import { courtUnits } from './courtUnits';

/**
 * Black's five pieces as small tokens in the top bar: icon, health ring, rank, alive or down.
 * Tap one for its piece card (the same card as a tap on the board).
 */
export function BlackCourt(props: { snap: Snapshot }) {
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
        const su = props.snap.units.find((x) => x.id === u.id);
        const lane = shownLane(props.snap.act.n, u.alive, su?.lane ?? h.lane ?? 'mid', su?.laneNow);
        return (
          <button
            key={u.id}
            class={`btoken ${u.alive ? '' : 'down'} ${open ? 'open' : ''}`}
            data-testid={`roster-B-${h.defId}`}
            data-rank={h.rank}
            data-lane-now={lane}
            aria-label={`Black ${name}, rank ${h.rank}, ${LANE_NOW_LABEL[lane]}${u.alive ? '' : ', down'}`}
            aria-expanded={open}
            title={`Black ${name} · Rank ${h.rank}${u.alive ? '' : ' · down'} (tap for details)`}
            onClick={() => s.openCard(u.id)}
          >
            <HpRing frac={frac} color={hurt ? 'var(--clock-hi)' : 'var(--b)'} alive={u.alive}>
              <PieceGlyph piece={h.defId} team="B" size={18} />
            </HpRing>
            <b class="btoken-rank">{h.rank}</b>
            <i class="btoken-lane" data-testid="lane-tag" aria-hidden="true">
              <LaneMark at={lane} />
            </i>
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
