import { useState } from 'preact/hooks';
import type { LaneId, PieceId, Snapshot, Unit } from '../sim';
import { AutoPawn } from './AutoPawn';
import { LaneBoard, type BoardPiece } from './LaneBoard';
import {
  PATHS,
  PATH_HINT,
  PATH_LABEL,
  PIECE_ORDER,
  PieceGlyph,
  LANES,
  LANE_LABEL,
  LANE_SLOTS,
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
export function Lanes(props: { formation?: string | null }) {
  const s = useSession();
  const battery = s.match!.state.relics.held.A.find((h) => h.id === 'battery')?.lane ?? null;
  const slots = battery ? { ...LANE_SLOTS, [battery]: 3 } : LANE_SLOTS;
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
        {battery && ' Battery lets the bound lane hold three pieces, with one in each other lane.'}
      </p>
      {props.formation && (
        <p class="formation-warn small" role="alert" data-testid="formation-warn">
          {props.formation}
        </p>
      )}
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
        slots={slots}
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

/**
 * Pawn counts per lane (the Orders tab at each Act break): pawns are fielded on their own toward
 * these counts whenever Tempo is above the reserve; Field Pawn stays as a manual extra. Pawn
 * Structure, once held, does this job itself (pick its counts in Relics).
 */
export function PawnPlan(props: { snap: Snapshot }) {
  const s = useSession();
  const { snap } = props;
  const plan = snap.pawnPlan;
  const relic = snap.relics.held.A.some((h) => h.id === 'pawn_structure');
  const cap = snap.relics.pawnCap;
  const quota = plan?.quota ?? { top: 0, mid: 0, bot: 0 };
  const total = LANES.reduce((n, l) => n + quota[l], 0);
  const set = (lane: LaneId, delta: number): void => {
    if (quota[lane] + delta < 0 || total + delta > cap) return;
    s.issue({ type: 'setPawnPlan', quota: { ...quota, [lane]: quota[lane] + delta } });
  };
  return (
    <section class="card col pawn-plan" data-testid="pawn-plan">
      <b>Pawns per lane</b>
      {relic ? (
        <p class="dim small" data-testid="pawn-plan-relic">
          Pawn Structure is in play: it fields your pawns toward its own counts (set them in
          Relics).
        </p>
      ) : (
        <>
          <AutoPawn snap={snap} testId="plan-auto" />
          <p class="dim small">
            {plan?.auto === false
              ? 'Auto pawns are off: nothing is fielded for you, but your counts are kept. Field Pawn still works.'
              : `Fielded for you during the Act while Tempo stays above ${plan?.reserve ?? 40} (kept for gambits). Field Pawn still adds extras. Pawn Structure: you choose the reserve, and pawns cost 2 less.`}
          </p>
          <div class="rl-steppers" role="group" aria-label="Pawns to keep in each lane">
            {LANES.map((lane) => (
              <div class="rl-stepper" key={lane}>
                <span class="rl-aim-label">{LANE_LABEL[lane]}</span>
                <button
                  class="rl-step"
                  aria-label={`Fewer pawns in the ${LANE_LABEL[lane]} lane`}
                  data-testid={`plan-${lane}-minus`}
                  disabled={quota[lane] <= 0}
                  onClick={() => set(lane, -1)}
                >
                  −
                </button>
                <b data-testid={`plan-${lane}`}>{quota[lane]}</b>
                <button
                  class="rl-step"
                  aria-label={`More pawns in the ${LANE_LABEL[lane]} lane`}
                  data-testid={`plan-${lane}-plus`}
                  disabled={total >= cap}
                  onClick={() => set(lane, 1)}
                >
                  +
                </button>
              </div>
            ))}
            <span class="rl-total" data-testid="plan-total">
              {total}/{cap}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Lanes, pawn counts and paths together: the Orders tab of the Act break sheet. */
export function Orders(props: { formation?: string | null; snap: Snapshot }) {
  return (
    <div class="col orders" data-testid="tab-orders">
      <Lanes formation={props.formation} />
      <PawnPlan snap={props.snap} />
      <Paths />
    </div>
  );
}
