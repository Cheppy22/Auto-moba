import type { PieceId } from '../../sim';
import type { PieceRow } from '../../analysis/summary';
import { PieceGlyph, StyleBadge } from '../pieces';

export const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const teamWord = (t: 'A' | 'B'): string => (t === 'A' ? 'White' : 'Black');

/** The match MVP's crown. */
export function Crown(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      class="rp-crown"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Match MVP"
    >
      <path
        d="M3 18.5 2 7.5l5.2 4.3L12 4.5l4.8 7.3L22 7.5l-1 11z M3.6 20.2h16.8v2H3.6z"
        fill="#f0d58a"
        stroke="#7a5a1e"
        stroke-width="1.1"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** The mark for a team's best piece (smaller than the crown). */
export function TeamStar(props: { size?: number; team: 'A' | 'B' }) {
  const s = props.size ?? 12;
  return (
    <svg
      class="rp-star"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${teamWord(props.team)} best piece`}
    >
      <path
        d="M12 2.2l2.9 6.2 6.7.8-4.9 4.6 1.3 6.7L12 17l-6 3.5 1.3-6.7L2.4 9.2l6.7-.8z"
        fill={props.team === 'A' ? '#f1e6c8' : '#aab4e6'}
        stroke="#14111d"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** A piece's portrait: silhouette on a team plate with the style emblem in the corner. */
export function Portrait(props: {
  row: Pick<PieceRow, 'piece' | 'team' | 'style' | 'name'>;
  size?: number;
  mark?: 'mvp' | 'best' | null;
}) {
  const size = props.size ?? 38;
  const r = props.row;
  return (
    <span class={`rp-portrait ${r.team}`} style={{ width: `${size}px`, height: `${size}px` }}>
      <PieceGlyph piece={r.piece as PieceId} team={r.team} size={Math.round(size * 0.72)} />
      <StyleBadge style={r.style} team={r.team} size={Math.round(size * 0.46)} class="rp-emblem" />
      {props.mark === 'mvp' && <Crown size={Math.round(size * 0.46)} />}
      {props.mark === 'best' && <TeamStar team={r.team} size={Math.round(size * 0.34)} />}
    </span>
  );
}
