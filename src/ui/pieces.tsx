import type { Content, LaneId, Path, PieceId } from '../sim';
import { styleEmblem, styleEmblemDescriptor } from '../render/emblems';
import { PALETTE } from '../render/theme';

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const PIECE_ORDER: PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];

export const LANE_LABEL: Record<LaneId, string> = { top: 'Left', mid: 'Mid', bot: 'Right' };
export const LANE_TAG: Record<LaneId, string> = { top: 'L', mid: 'M', bot: 'R' };
export const LANE_SLOTS: Record<LaneId, number> = { top: 2, mid: 1, bot: 2 };
export const LANES: LaneId[] = ['top', 'mid', 'bot'];

export const PATH_LABEL: Record<Path, string> = {
  offense: 'Offense',
  defense: 'Defense',
  utility: 'Utility',
};
export const PATH_HINT: Record<Path, string> = {
  offense: 'Buys damage and speed first',
  defense: 'Buys health and armor first',
  utility: 'Buys support and control first',
};
export const PATHS: Path[] = ['offense', 'defense', 'utility'];

export const pieceLabel = (c: Content, piece: string): string =>
  c.pieceById.get(piece as PieceId)?.name ?? cap(piece);

export const styleLabel = (c: Content, piece: string, style: string | null): string =>
  (style && c.styleByKey.get(`${piece}/${style}`)?.name) || '';

export const styleDesc = (c: Content, piece: string, style: string | null): string =>
  (style && c.styleByKey.get(`${piece}/${style}`)?.desc) || '';

/** The style's colour (hex), for borders and text accents. */
export const styleColor = (style: string | null): string => styleEmblem(style).color;

/** A style's emblem: its colour plate with a glyph that is also a shape cue. Both teams. */
export function StyleBadge(props: {
  style: string | null;
  team?: 'A' | 'B' | null;
  size?: number;
  class?: string;
}) {
  const size = props.size ?? 18;
  const d = styleEmblemDescriptor(props.style, props.team ?? null);
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox={d.viewBox}
      aria-hidden="true"
      data-style={props.style ?? ''}
    >
      <circle cx="12" cy="12" r="11.4" fill={d.rim} />
      <circle cx="12" cy="12" r="10.5" fill={d.ink} />
      <circle cx="12" cy="12" r="9.3" fill={d.color} />
      <g transform={d.glyphTransform}>
        {d.parts.map((p, i) =>
          p.mode === 'fill' ? (
            <path
              key={i}
              d={p.d}
              fill={d.ink}
              fill-rule={p.rule === 'evenodd' ? 'evenodd' : undefined}
            />
          ) : (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={d.ink}
              stroke-width={p.w ?? 2}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          ),
        )}
      </g>
    </svg>
  );
}

const BODY: Record<PieceId, string> = {
  king: 'M10.8 1.4h2.4v1.9h2v2.3h-2v1.9h-2.4V5.6h-2V3.3h2z M12 9.2c-3.5 0-6.2 1.9-6.2 4.8 0 1.4.7 2.5 1.8 3.3L6.4 20.2h11.2l-1.2-2.9c1.1-.8 1.8-1.9 1.8-3.3 0-2.9-2.7-4.8-6.2-4.8z M5 20.2h14v2.4H5z',
  queen:
    'M4.6 7.6l3.5 4.6.3-5.8 2.6 5.3L12 5.4l1 6.1 2.6-5.1.3 5.8 3.5-4.6-2.4 9H7z M5.6 17.6h12.8v2.2H5.6z M4.8 20.2h14.4v2.4H4.8z',
  rook: 'M5.4 2.4h3.1v2.6h2V2.4h3v2.6h2V2.4h3.1v6.4l-2.5 2.1v5.8l2 1.8v2.2H5.9v-2.2l2-1.8v-5.8L5.4 8.8z',
  bishop:
    'M12 4.7C8.7 7 7 9.7 7 12.1c0 1.8.9 3.1 2.3 3.9L8.1 19.2h7.8l-1.2-3.2c1.4-.8 2.3-2.1 2.3-3.9 0-2.4-1.7-5.1-5-7.4z M5.8 19.2h12.4v2.4H5.8z',
  knight:
    'M7.4 21.6c-.1-3.4.8-6.2 2.8-8.1-2 .4-3.5 1.6-5 3.4-.4-3 .7-5.6 3.4-7.8l-.2-2.2 1.9.9L12.2 3l1.6 2.3c3.6 1.2 5.8 4.4 5.8 8.6v7.7z',
};
const EXTRA: Partial<Record<PieceId, string>> = {
  bishop: 'M12 1.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
};
const BISHOP_SLIT = 'M10.3 9.2l3.4 3.4';

/** The chess silhouette of a piece, ivory with brass trim for White and ebony with silver for Black. */
export function PieceGlyph(props: {
  piece: PieceId | 'pawn';
  team?: 'A' | 'B';
  size?: number;
  class?: string;
}) {
  const size = props.size ?? 24;
  const white = (props.team ?? 'A') === 'A';
  const fill = white ? PALETTE.whiteBody : PALETTE.blackBody;
  const line = white ? PALETTE.whiteTrim : PALETTE.blackTrim;
  const cut = white ? '#3b3022' : '#e8edf5';
  if (props.piece === 'pawn') {
    return (
      <svg
        class={props.class}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill={fill}
        stroke={line}
        stroke-width="1"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="6.6" r="3.2" />
        <path d="M8.6 10.6h6.8l-1.1 1.7c1.1 1 1.7 2.4 1.7 4.2 0 1-.3 1.9-.8 2.6h-8.4c-.5-.7-.8-1.6-.8-2.6 0-1.8.6-3.2 1.7-4.2z" />
        <path d="M5.8 19.2h12.4v2.6H5.8z" />
      </svg>
    );
  }
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={fill}
      stroke={line}
      stroke-width="1"
      stroke-linejoin="round"
    >
      <path d={BODY[props.piece]} />
      {EXTRA[props.piece] && <path d={EXTRA[props.piece]} />}
      {props.piece === 'bishop' && (
        <path d={BISHOP_SLIT} stroke={cut} stroke-width="1.6" stroke-linecap="round" fill="none" />
      )}
      {props.piece === 'knight' && <circle cx="12.6" cy="8.3" r="0.9" fill={cut} stroke="none" />}
    </svg>
  );
}
