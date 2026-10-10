import { useEffect, useRef } from 'preact/hooks';
import type { LaneId, PlayTeam } from '../../sim';
import { courtName, laneName } from '../../analysis/text';
import { introStages, type IntroPiece } from '../intro';
import { PIECE_ORDER, PieceGlyph, pieceLabel } from '../pieces';
import { SchoolChip } from '../schools';
import { useEscape, useSession } from '../session';

/** Where a tag sits above its piece, in scene units. */
const PIECE_LIFT = 30;
/** Tag height plus gap, and how far a team's stack stands off its pieces, in CSS pixels. */
const TAG_PITCH = 24;
const STACK_OFFSET = 78;
/** Clear of the rosters in the side columns. */
const EDGE = 66;
const TOP = 64;
const BOTTOM = 70;
/** A tap this soon after the intro starts is the Begin tap finishing, not a skip. */
const TAP_GRACE_MS = 400;

const byPiece = (a: IntroPiece, b: IntroPiece): number =>
  PIECE_ORDER.indexOf(a.piece) - PIECE_ORDER.indexOf(b.piece);

function Opening(props: { team: PlayTeam }) {
  const s = useSession();
  const { team } = props;
  const o = s.content.openingById.get(s.match!.state.opening[team]);
  return (
    <div class={`intro-side ${team === 'A' ? 'a' : 'b'}`} data-testid={`intro-opening-${team}`}>
      <span class="intro-court">{courtName(team)}</span>
      <b class="intro-opening">{o?.name ?? ''}</b>
      <span class="intro-schools">
        {o && o.schools.length > 0 ? (
          o.schools.map((sc) => <SchoolChip key={sc} school={sc} glyph={15} />)
        ) : (
          <span class="school-chip balanced">Balanced</span>
        )}
      </span>
    </div>
  );
}

function LaneHeader(props: { lane: LaneId; pieces: IntroPiece[] }) {
  const s = useSession();
  const { lane } = props;
  const side = (team: PlayTeam) =>
    props.pieces.filter((p) => p.lane === lane && p.team === team).sort(byPiece);
  return (
    <div class="intro-lane" data-testid={`intro-lane-${lane}`}>
      <b class="intro-lane-name">{laneName(lane)} lane</b>
      {(['A', 'B'] as const).map((team) => (
        <div class={`intro-lane-side ${team === 'A' ? 'a' : 'b'}`} key={team}>
          <span class="intro-court">{courtName(team)}</span>
          {side(team).map((p) => (
            <span class="intro-piece" key={p.id}>
              <PieceGlyph piece={p.piece} team={team} size={16} />
              {pieceLabel(s.content, p.piece)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * "Rook · Left" over each piece. A team starts in a tight huddle, so its tags stand in a column
 * beside it (toward the board's heart, or away from it when the lane headers fill the middle),
 * each joined to its piece by a thin line; both follow the camera every frame without re-rendering.
 */
function Tags(props: { pieces: IntroPiece[]; outward: boolean }) {
  const s = useSession();
  const root = useRef<HTMLDivElement>(null);
  const live = useRef(props.pieces);
  live.current = props.pieces;
  const sign = props.outward ? -1 : 1;
  useEffect(
    () =>
      s.onFrame(() => {
        const box = root.current;
        const view = s.view;
        if (!box || !view) return;
        const w = box.clientWidth;
        const h = box.clientHeight;
        const half = s.content.map.size / 2;
        const heart = view.project(half, half);
        for (const team of ['A', 'B'] as const) {
          const mine = live.current
            .filter((p) => p.team === team)
            .map((p) => ({ p, at: view.project(p.x, p.y, PIECE_LIFT) }))
            .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
          if (mine.length === 0) continue;
          const ax = mine.reduce((t, q) => t + q.at.x, 0) / mine.length;
          const ay = mine.reduce((t, q) => t + q.at.y, 0) / mine.length;
          const len = Math.hypot(heart.x - ax, heart.y - ay) || 1;
          const cx = ax + sign * ((heart.x - ax) / len) * STACK_OFFSET;
          const cy = ay + sign * ((heart.y - ay) / len) * STACK_OFFSET;
          mine.forEach(({ p, at }, i) => {
            const tag = box.querySelector<HTMLElement>(`[data-tag="${p.id}"]`);
            const line = box.querySelector<SVGLineElement>(`[data-line="${p.id}"]`);
            if (!tag || !line) return;
            const reach = tag.offsetWidth / 2;
            const x = Math.min(w - EDGE - reach, Math.max(EDGE + reach, cx));
            const y = Math.min(
              h - BOTTOM,
              Math.max(TOP, cy + (i - (mine.length - 1) / 2) * TAG_PITCH),
            );
            tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            line.setAttribute('x1', x.toFixed(1));
            line.setAttribute('y1', y.toFixed(1));
            line.setAttribute('x2', at.x.toFixed(1));
            line.setAttribute('y2', at.y.toFixed(1));
          });
        }
      }),
    [s],
  );
  return (
    <div class="intro-tags" ref={root}>
      <svg class="intro-lines" aria-hidden="true">
        {props.pieces.map((p) => (
          <line key={p.id} data-line={p.id} class={p.team === 'A' ? 'a' : 'b'} />
        ))}
      </svg>
      {props.pieces.map((p) => (
        <div class="intro-pin" key={p.id} data-tag={p.id}>
          <div class={`intro-tag ${p.team === 'A' ? 'a' : 'b'}`} data-testid="intro-tag">
            <PieceGlyph piece={p.piece} team={p.team} size={14} />
            {pieceLabel(s.content, p.piece)} · {laneName(p.lane)}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The match intro: both Openings, then each court and each lane with a name over every piece.
 * Tap anywhere, Skip or Escape ends it; the loop holds the sim and the camera follows the stage.
 */
export function Intro() {
  const s = useSession();
  const intro = s.ui.intro;
  useEscape(!!intro, () => s.skipIntro());
  if (!intro) return null;
  const stage = introStages(intro.reduced)[intro.stage];
  if (!stage) return null;
  const lanes: LaneId[] = ['top', 'mid', 'bot'];
  const tap = (): void => {
    if (performance.now() - intro.startedAt > TAP_GRACE_MS) s.skipIntro();
  };
  return (
    <div class="intro" data-testid="intro" data-stage={stage.kind} onClick={tap}>
      {stage.kind === 'card' && (
        <div class="intro-card" key="card">
          <Opening team="A" />
          <span class="intro-vs">against</span>
          <Opening team="B" />
        </div>
      )}
      {stage.kind === 'court' && (
        <Tags
          key={stage.team}
          outward={false}
          pieces={intro.pieces.filter((p) => p.team === stage.team)}
        />
      )}
      {stage.kind === 'lane' && (
        <LaneHeader key={stage.lane} lane={stage.lane} pieces={intro.pieces} />
      )}
      {stage.kind === 'roll' && (
        <>
          <Tags key="tags" outward pieces={intro.pieces} />
          <div class="intro-lanes">
            {lanes.map((lane) => (
              <LaneHeader key={lane} lane={lane} pieces={intro.pieces} />
            ))}
          </div>
        </>
      )}
      <button
        class="btn small intro-skip glass"
        data-testid="intro-skip"
        onClick={(e) => {
          e.stopPropagation();
          s.skipIntro();
        }}
      >
        Skip
      </button>
    </div>
  );
}
