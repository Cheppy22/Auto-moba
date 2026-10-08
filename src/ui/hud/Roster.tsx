import type { Unit } from '../../sim';
import { HpRing } from '../Ornament';
import { mmss } from '../format';
import { LANE_TAG, LANE_LABEL, PIECE_ORDER, PieceGlyph, pieceLabel, styleLabel } from '../pieces';
import { useSession } from '../session';

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];

/** One column of five portraits: health ring, rank numeral and pips, lane tag, respawn timer. */
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
        const pending = props.forks.includes(u.id);
        const frac = u.alive ? u.hp / u.stats.maxHp : 0;
        const left = h.respawnAt === null ? null : Math.max(0, h.respawnAt - tick);
        const name = pieceLabel(s.content, h.defId);
        const style = styleLabel(s.content, h.defId, h.style);
        return (
          <button
            key={u.id}
            class={`roster-cell pick ${team} ${followed ? 'followed' : ''} ${u.alive ? '' : 'down'} ${pending ? 'pending' : ''}`}
            data-testid={`roster-${team}-${h.defId}`}
            data-rank={h.rank}
            aria-label={`${team === 'A' ? 'White' : 'Black'} ${name}${style ? `, ${style}` : ''}, rank ${h.rank}, ${LANE_LABEL[h.lane ?? 'mid']}${u.alive ? '' : ', down'}`}
            title={`${name}${style ? ` · ${style}` : ''} · Rank ${h.rank} · ${h.kills} kills, ${h.deaths} deaths`}
            onClick={() => s.setUi({ cam: 'follow', follow: u.id })}
          >
            <span class="ringwrap">
              <HpRing frac={frac} color={team === 'A' ? 'var(--a)' : 'var(--b)'} alive={u.alive}>
                <PieceGlyph piece={h.defId} team={team} size={26} />
              </HpRing>
              <b class="rank-num" data-testid="rank-num">
                {h.rank}
              </b>
              <i class="lane-tag" aria-hidden="true">
                {LANE_TAG[h.lane ?? 'mid']}
              </i>
              {!u.alive && (
                <span class="respawn" data-testid="respawn">
                  {left === null ? '×' : mmss(left)}
                </span>
              )}
            </span>
            <span class="rank-pips" aria-hidden="true">
              {RANKS.map((r) => (
                <i key={r} class={r <= h.rank ? 'on' : ''} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
