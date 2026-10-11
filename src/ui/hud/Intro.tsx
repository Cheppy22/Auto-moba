import type { LaneId, PlayTeam } from '../../sim';
import { courtName, laneName } from '../../analysis/text';
import { introTiming, type IntroPiece, type IntroState } from '../intro';
import { LANE_SLOTS, LANES, PIECE_ORDER, PieceGlyph, pieceLabel } from '../pieces';
import { SchoolChip } from '../schools';
import { useEscape, useSession } from '../session';

/** A tap this soon after the intro's clock starts is the Begin tap finishing, not a skip. */
const TAP_GRACE_MS = 400;

const byPiece = (a: IntroPiece, b: IntroPiece): number =>
  PIECE_ORDER.indexOf(a.piece) - PIECE_ORDER.indexOf(b.piece);

/** One side's Opening in the header: its name and its school marks. */
function Opening(props: { team: PlayTeam }) {
  const s = useSession();
  const { team } = props;
  const o = s.content.openingById.get(s.match!.state.opening[team]);
  return (
    <div class={`vs-opening ${team === 'A' ? 'a' : 'b'}`} data-testid={`intro-opening-${team}`}>
      <span class="vs-court">{courtName(team)}</span>
      <b class="vs-opening-name">{o?.name ?? ''}</b>
      <span class="vs-schools">
        {o && o.schools.length > 0 ? (
          o.schools.map((sc) => <SchoolChip key={sc} school={sc} glyph={13} />)
        ) : (
          <span class="school-chip balanced">Balanced</span>
        )}
      </span>
    </div>
  );
}

/** A piece's portrait (its own 3D model, drawn once by the render layer), its name and its role. */
function Figure(props: { piece: IntroPiece; portraits: IntroState['portraits'] }) {
  const s = useSession();
  const { piece, portraits } = props;
  const src = portraits?.get(`${piece.piece}:${piece.team}`);
  const def = s.content.pieceById.get(piece.piece);
  return (
    <div class={`vs-piece ${piece.team === 'A' ? 'a' : 'b'}`} data-testid="intro-piece">
      <div class="vs-plate">
        {src ? (
          <img src={src} alt="" draggable={false} />
        ) : (
          <PieceGlyph piece={piece.piece} team={piece.team} size={44} />
        )}
      </div>
      <b class="vs-name">{pieceLabel(s.content, piece.piece)}</b>
      <span class="vs-role">{def?.title.replace(/^The /, '') ?? ''}</span>
    </div>
  );
}

/**
 * The match intro: a versus card over the dimmed board. Both Openings across the top; below, one
 * column per lane (Left, Mid, Right) split by divider lines, Black's pieces in the top row and
 * White's in the bottom row so each faces its lane opponent across the middle. The pieces fade and
 * settle in together, the dividers draw, it holds, then it dissolves into the board. Tap anywhere,
 * Skip or Escape ends it; the loop holds the sim until it is gone.
 */
export function Intro() {
  const s = useSession();
  const intro = s.ui.intro;
  useEscape(!!intro, () => s.skipIntro());
  if (!intro) return null;
  const t = introTiming(intro.reduced);
  const side = (lane: LaneId, team: PlayTeam): IntroPiece[] =>
    intro.pieces.filter((p) => p.lane === lane && p.team === team).sort(byPiece);
  const tap = (): void => {
    if (performance.now() - intro.startedAt > TAP_GRACE_MS) s.skipIntro();
  };
  return (
    <div
      class="intro"
      data-testid="intro"
      data-phase={intro.phase}
      style={{ '--out-ms': `${t.endAt - t.outAt}ms` }}
      onClick={tap}
    >
      <div class="vs">
        <header class="vs-head">
          <Opening team="A" />
          <span class="vs-vs">vs</span>
          <Opening team="B" />
        </header>
        <div class="vs-lanes">
          {LANES.map((lane) => (
            <section
              class="vs-lane"
              key={lane}
              style={{ '--n': LANE_SLOTS[lane] }}
              data-testid={`intro-lane-${lane}`}
            >
              <div class="vs-row b">
                {side(lane, 'B').map((p) => (
                  <Figure key={p.id} piece={p} portraits={intro.portraits} />
                ))}
              </div>
              <b class="vs-lane-name">{laneName(lane)}</b>
              <div class="vs-row a">
                {side(lane, 'A').map((p) => (
                  <Figure key={p.id} piece={p} portraits={intro.portraits} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
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
