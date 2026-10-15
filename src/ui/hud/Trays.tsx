import { useRef } from 'preact/hooks';
import { mmss } from '../format';
import { PieceGlyph, pieceLabel } from '../pieces';
import { useSession } from '../session';
import { courtUnits } from './courtUnits';
import { courtName } from '../../analysis/text';

/** How long a piece lingers in the tray after it respawns, for its slide out. */
const LEAVE_MS = 320;

/**
 * A capture tray: the pieces of one team that are down right now, in the order they fell, each
 * with its respawn timer. A piece slides in when it is taken and out when it comes back.
 * `fallen` is the team whose pieces sit in the tray (the left tray is White's catch: Black pieces).
 */
export function CaptureTray(props: { fallen: 'A' | 'B' }) {
  const s = useSession();
  const m = s.match!;
  const { fallen } = props;
  const owner = courtName(fallen);
  const taker = courtName(fallen === 'A' ? 'B' : 'A');
  const kept = useRef<{ order: number[]; leaving: Map<number, number> }>({
    order: [],
    leaving: new Map(),
  });
  const { order, leaving } = kept.current;
  const now = performance.now();
  const units = courtUnits(m, fallen);
  const down = new Set(units.filter((u) => !u.alive).map((u) => u.id));
  for (const u of units) {
    if (!u.alive) {
      leaving.delete(u.id);
      if (!order.includes(u.id)) order.push(u.id);
    } else if (order.includes(u.id) && !leaving.has(u.id)) leaving.set(u.id, now);
  }
  for (const [id, at] of leaving) {
    if (now - at > LEAVE_MS) {
      leaving.delete(id);
      order.splice(order.indexOf(id), 1);
    }
  }
  const tick = m.state.tick;
  return (
    <div
      class={`tray tray-${fallen}`}
      data-testid={`tray-${fallen}`}
      data-count={down.size}
      role="group"
      aria-label={`${owner} pieces ${taker} has taken`}
      title={`${owner} pieces ${taker} has taken, until they return`}
    >
      {order.length === 0 && <span class="tray-empty" aria-hidden="true" />}
      {order.map((id) => {
        const u = units.find((x) => x.id === id);
        const h = u?.hero;
        if (!u || !h) return null;
        const left = h.respawnAt === null ? null : Math.max(0, h.respawnAt - tick);
        const gone = !down.has(id);
        return (
          <span
            key={`${id}:${h.deaths}`}
            class={`tray-item ${gone ? 'leaving' : ''}`}
            data-testid={`tray-item-${fallen}-${h.defId}`}
            title={`${pieceLabel(s.content, h.defId)}: ${left === null ? 'out for good' : `back in ${mmss(left)}`}`}
          >
            <PieceGlyph piece={h.defId} team={fallen} size={24} />
            <i class="tray-time">{gone ? '' : left === null ? '×' : mmss(left)}</i>
          </span>
        );
      })}
    </div>
  );
}
