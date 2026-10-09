import type { Unit } from '../../sim';
import { HpRing } from '../Ornament';
import { mmss } from '../format';
import {
  LANE_TAG,
  LANE_LABEL,
  PIECE_ORDER,
  PieceGlyph,
  StyleBadge,
  pieceLabel,
  styleLabel,
} from '../pieces';
import { longPress, longPressed } from '../press';
import { useSession } from '../session';

/**
 * One column of five portraits: health ring, rank numeral, style emblem, lane tag, respawn timer.
 * First tap follows the piece; tapping the followed piece again (or holding any portrait) opens
 * its card. Both teams show their style.
 */
export function Roster(props: { team: 'A' | 'B'; forks: number[] }) {
  const s = useSession();
  const m = s.match!;
  const team = props.team;
  const tick = m.state.tick;
  const units = m.state.teams[team].heroIds
    .map((id) => m.unitById(id))
    .filter((u): u is Unit => !!u && !!u.hero)
    .sort((a, b) => PIECE_ORDER.indexOf(a.hero!.defId) - PIECE_ORDER.indexOf(b.hero!.defId));
  return (
    <div
      class={`roster side-${team}`}
      data-testid={team === 'A' ? 'roster' : 'roster-enemy'}
      aria-label={team === 'A' ? 'White pieces' : 'Black pieces'}
    >
      {units.map((u) => {
        const h = u.hero!;
        const followed = s.ui.cam === 'follow' && s.ui.follow === u.id;
        const open = s.ui.card === u.id;
        const pending = props.forks.includes(u.id);
        const frac = u.alive ? u.hp / u.stats.maxHp : 0;
        const hurt = u.alive && frac < 0.35;
        const left = h.respawnAt === null ? null : Math.max(0, h.respawnAt - tick);
        const name = pieceLabel(s.content, h.defId);
        const style = styleLabel(s.content, h.defId, h.style);
        const tap = (): void => {
          if (longPressed()) return;
          if (followed) s.openCard(u.id);
          else s.setUi({ cam: 'follow', follow: u.id, card: s.ui.card !== null ? u.id : null });
        };
        return (
          <button
            key={u.id}
            class={`roster-cell pick ${team} ${followed ? 'followed' : ''} ${open ? 'open' : ''} ${u.alive ? '' : 'down'} ${pending ? 'pending' : ''} ${hurt ? 'hurt' : ''}`}
            data-testid={`roster-${team}-${h.defId}`}
            data-rank={h.rank}
            data-style={h.style}
            aria-label={`${team === 'A' ? 'White' : 'Black'} ${name}${style ? `, ${style}` : ''}, rank ${h.rank}, ${LANE_LABEL[h.lane ?? 'mid']}${u.alive ? '' : ', down'}`}
            aria-expanded={open}
            title={`${name}${style ? ` · ${style}` : ''} · Rank ${h.rank}. Tap to follow, tap again or hold for details.`}
            onClick={tap}
            {...longPress(() => s.openCard(u.id))}
          >
            <span class="ringwrap">
              <HpRing
                frac={frac}
                color={hurt ? 'var(--clock-hi)' : team === 'A' ? 'var(--a)' : 'var(--b)'}
                alive={u.alive}
              >
                <PieceGlyph piece={h.defId} team={team} size={26} />
              </HpRing>
              <b class="rank-num" data-testid="rank-num">
                {h.rank}
              </b>
              <StyleBadge style={h.style} team={team} size={18} class="style-badge" />
              <i class="lane-tag" aria-hidden="true">
                {LANE_TAG[h.lane ?? 'mid']}
              </i>
              {!u.alive && (
                <span class="respawn" data-testid="respawn">
                  {left === null ? '×' : mmss(left)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
