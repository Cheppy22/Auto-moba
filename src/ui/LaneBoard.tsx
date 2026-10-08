import type { LaneId, PieceId } from '../sim';
import { LANES, LANE_LABEL, LANE_SLOTS, PieceGlyph } from './pieces';

export interface BoardPiece {
  piece: PieceId;
  lane: LaneId;
}

/** Moves a piece to a lane; if that lane is full it swaps with the piece already there. */
export function moveToLane<T extends BoardPiece>(list: T[], piece: PieceId, lane: LaneId): T[] {
  const mine = list.find((e) => e.piece === piece);
  if (!mine || mine.lane === lane) return list;
  const there = list.filter((e) => e.lane === lane);
  const swap = there.length >= LANE_SLOTS[lane] ? there[0] : null;
  return list.map((e) => {
    if (e === mine) return { ...e, lane };
    if (swap && e === swap) return { ...e, lane: mine.lane };
    return e;
  });
}

/** Swaps the lanes of two pieces. */
export function swapLanes<T extends BoardPiece>(list: T[], a: PieceId, b: PieceId): T[] {
  const x = list.find((e) => e.piece === a);
  const y = list.find((e) => e.piece === b);
  if (!x || !y) return list;
  return list.map((e) => (e === x ? { ...e, lane: y.lane } : e === y ? { ...e, lane: x.lane } : e));
}

/**
 * Three lane zones (Left 2, Mid 1, Right 2). Tap a piece, then a lane; tap a piece in another
 * lane to swap the two.
 */
export function LaneBoard(props: {
  pieces: BoardPiece[];
  names: Record<string, string>;
  selected: PieceId | null;
  onSelect: (piece: PieceId | null) => void;
  onChange: (next: BoardPiece[]) => void;
  testid?: string;
}) {
  const { pieces, selected } = props;
  const zoneTap = (lane: LaneId): void => {
    if (!selected) return;
    props.onChange(moveToLane(pieces, selected, lane));
  };
  const chipTap = (piece: PieceId, lane: LaneId): void => {
    if (selected && selected !== piece) {
      const sel = pieces.find((e) => e.piece === selected);
      if (sel && sel.lane !== lane) {
        props.onChange(swapLanes(pieces, selected, piece));
        return;
      }
    }
    props.onSelect(selected === piece ? null : piece);
  };
  return (
    <div class="laneboard" data-testid={props.testid ?? 'lane-board'}>
      {LANES.map((lane) => {
        const here = pieces.filter((e) => e.lane === lane);
        const free = LANE_SLOTS[lane] - here.length;
        return (
          <div
            key={lane}
            class={`lane-zone ${selected && !here.some((e) => e.piece === selected) ? 'ready' : ''}`}
            data-testid={`zone-${lane}`}
            role="button"
            tabIndex={0}
            aria-label={`${LANE_LABEL[lane]} lane, ${here.length} of ${LANE_SLOTS[lane]}`}
            onClick={() => zoneTap(lane)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                zoneTap(lane);
              }
            }}
          >
            <div class="lane-name">
              {LANE_LABEL[lane]}
              <span class="dim">
                {here.length}/{LANE_SLOTS[lane]}
              </span>
            </div>
            <div class="lane-slots">
              {here.map((e) => (
                <button
                  key={e.piece}
                  class={`lane-chip ${selected === e.piece ? 'sel' : ''}`}
                  data-testid={`chip-${e.piece}`}
                  aria-pressed={selected === e.piece}
                  title={props.names[e.piece]}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    chipTap(e.piece, lane);
                  }}
                >
                  <PieceGlyph piece={e.piece} team="A" size={26} />
                  <span class="chip-name">{props.names[e.piece]}</span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, free) }, (_, i) => (
                <span class="lane-empty" key={`e${i}`} aria-hidden="true" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
