import { useState } from 'preact/hooks';
import type { PieceId, Unit } from '../sim';
import { LaneBoard, type BoardPiece } from './LaneBoard';
import {
  PATHS,
  PATH_HINT,
  PATH_LABEL,
  PIECE_ORDER,
  PieceGlyph,
  LANE_LABEL,
  pieceLabel,
  styleLabel,
} from './pieces';
import { useSession } from './session';

export function whitePieces(s: ReturnType<typeof useSession>): Unit[] {
  const m = s.match!;
  return m.state.teams.A.heroIds
    .map((id) => m.unitById(id))
    .filter((u): u is Unit => !!u && !!u.hero)
    .sort((a, b) => PIECE_ORDER.indexOf(a.hero!.defId) - PIECE_ORDER.indexOf(b.hero!.defId));
}

/** Move White's pieces between lanes (shared by the Adjourn panel and the Act break sheet). */
export function Lanes() {
  const s = useSession();
  const [selected, setSelected] = useState<PieceId | null>(null);
  const pieces = whitePieces(s);
  const board: BoardPiece[] = pieces.map((u) => ({
    piece: u.hero!.defId,
    lane: u.hero!.lane ?? 'mid',
  }));
  const names: Record<string, string> = {};
  for (const p of s.content.pieces) names[p.id] = p.name;
  return (
    <div class="col" data-testid="tab-lanes">
      <p class="dim small">
        Tap a piece, then a lane. If the lane is full, the two pieces trade places. Orders take
        effect when you resume.
      </p>
      <LaneBoard
        pieces={board}
        names={names}
        selected={selected}
        onSelect={setSelected}
        onChange={(next) => {
          for (const n of next) {
            const u = pieces.find((x) => x.hero!.defId === n.piece);
            if (u && (u.hero!.lane ?? 'mid') !== n.lane)
              s.issue({ type: 'setLane', heroId: u.id, lane: n.lane });
          }
          setSelected(null);
        }}
        testid="adjourn-board"
      />
      <BlackCourt />
    </div>
  );
}

/** Black's setup, hidden on the setup board, is shown once the match has started. */
function BlackCourt() {
  const s = useSession();
  const m = s.match!;
  const units = m.state.teams.B.heroIds
    .map((id) => m.unitById(id))
    .filter((u): u is Unit => !!u && !!u.hero)
    .sort((a, b) => PIECE_ORDER.indexOf(a.hero!.defId) - PIECE_ORDER.indexOf(b.hero!.defId));
  return (
    <div class="card col black-court" data-testid="black-court">
      <b class="small">Black’s court</b>
      {units.map((u) => {
        const h = u.hero!;
        return (
          <div class="row small" key={u.id}>
            <PieceGlyph piece={h.defId} team="B" size={22} />
            <span class="grow">
              {pieceLabel(s.content, h.defId)}
              <span class="dim">
                {' '}
                · {h.style ? styleLabel(s.content, h.defId, h.style) : 'Generic'}
              </span>
            </span>
            <span class="dim">
              {LANE_LABEL[h.lane ?? 'mid']} · {PATH_LABEL[h.path]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** White's build paths (shared by the Adjourn panel and the Act break sheet). */
export function Paths() {
  const s = useSession();
  return (
    <div class="col" data-testid="tab-paths">
      <p class="dim small">
        A build path decides which items a piece buys first. Changing it takes effect at its next
        purchase.
      </p>
      {whitePieces(s).map((u) => {
        const h = u.hero!;
        return (
          <div class="card path-row" key={u.id} data-testid={`path-row-${h.defId}`}>
            <div class="row">
              <PieceGlyph piece={h.defId} team="A" size={30} />
              <div class="grow">
                <b>{pieceLabel(s.content, h.defId)}</b>
                <div class="dim tiny">
                  {h.style ? styleLabel(s.content, h.defId, h.style) : 'Generic'} · Rank {h.rank} ·{' '}
                  {LANE_LABEL[h.lane ?? 'mid']}
                </div>
              </div>
            </div>
            <div
              class="seg paths"
              role="radiogroup"
              aria-label={`${pieceLabel(s.content, h.defId)} path`}
            >
              {PATHS.map((p) => (
                <button
                  key={p}
                  class={`btn small ${h.path === p ? 'on' : ''}`}
                  role="radio"
                  aria-checked={h.path === p}
                  title={PATH_HINT[p]}
                  data-testid={`setpath-${h.defId}-${p}`}
                  onClick={() => s.issue({ type: 'setPath', heroId: u.id, path: p })}
                >
                  {PATH_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Lanes and paths together: the Orders tab of the Act break sheet. */
export function Orders() {
  return (
    <div class="col orders" data-testid="tab-orders">
      <Lanes />
      <Paths />
    </div>
  );
}
