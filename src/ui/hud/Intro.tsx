import { useEffect } from 'preact/hooks';
import { courtOf, type LaneId, type PlayTeam } from '../../sim';
import { courtName, laneName } from '../../analysis/text';
import { introOutMs, type IntroPiece, type IntroState } from '../intro';
import { LANE_SLOTS, LANES, PIECE_ORDER, PieceGlyph, pieceLabel } from '../pieces';
import { RelicSeal } from '../relics';
import { CourtSeal, roundLine } from '../run/parts';
import { CourtPortrait } from '../run/seals';
import { SchoolChip } from '../schools';
import { useSession } from '../session';
import { opensWith } from '../setup/data';

/** A tap or key this soon after the card goes up is the setup Begin finishing, not a start. */
const TAP_GRACE_MS = 400;

const byPiece = (a: IntroPiece, b: IntroPiece): number =>
  PIECE_ORDER.indexOf(a.piece) - PIECE_ORDER.indexOf(b.piece);

/** One side's Opening in the header: its name and its school marks. */
function Opening(props: { team: PlayTeam }) {
  const s = useSession();
  const { team } = props;
  const o = s.content.openingById.get(s.match!.state.opening[team]);
  // in a tournament run Black is a named court that starts with relics (shown as seals)
  const named = team === 'B' && s.run ? s.run.opponents[s.run.round].name : null;
  const relics = team === 'B' && s.run ? s.match!.state.relics.held.B : [];
  const court = named && s.run ? courtOf(s.content, s.run.opponents[s.run.round]) : undefined;
  const text = (
    <>
      <span class="vs-court" data-testid={named ? 'intro-court-name' : undefined}>
        {named ?? courtName(team)}
      </span>
      {court && (
        <i class="vs-motto" data-testid="intro-court-motto">
          {court.motto}
        </i>
      )}
      <b class="vs-opening-name">{o?.name ?? ''}</b>
      <span class="vs-schools">
        {o && o.schools.length > 0 ? (
          o.schools.map((sc) => <SchoolChip key={sc} school={sc} glyph={13} />)
        ) : (
          <span class="school-chip balanced">Balanced</span>
        )}
      </span>
      {o && (
        <span class="vs-opens" data-testid={`intro-opens-${team}`}>
          {opensWith(s.content, o)}
        </span>
      )}
      {relics.length > 0 && (
        <span class="vs-relics" data-testid="intro-relics-B" aria-label="Starting relics">
          {relics.map((h) => {
            const def = s.content.relicById.get(h.id);
            return def ? (
              <span key={h.id} title={def.name} class="vs-relic">
                <RelicSeal family={def.family} size={18} />
                <span class="vs-relic-name">{def.name}</span>
              </span>
            ) : null;
          })}
        </span>
      )}
    </>
  );
  return (
    <div
      class={`vs-opening ${team === 'A' ? 'a' : 'b'} ${court ? 'named' : ''}`}
      data-testid={`intro-opening-${team}`}
    >
      {court ? (
        <>
          <div class="vs-text">{text}</div>
          <span class="vs-art">
            <CourtPortrait
              court={court}
              width="var(--vs-art)"
              final={s.run!.round === s.run!.opponents.length - 1}
            />
            <CourtSeal
              name={court.name}
              court={court}
              final={s.run!.round === s.run!.opponents.length - 1}
              size={28}
            />
          </span>
        </>
      ) : (
        text
      )}
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
 * settle in together and the dividers draw. Then it holds, with no timer, until the player taps
 * anywhere, presses Begin, Enter, Space or Escape; the loop holds the sim until the card is gone.
 */
export function Intro() {
  const s = useSession();
  const intro = s.ui.intro;
  const on = !!intro;
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      e.preventDefault();
      if (e.repeat) return;
      const at = s.ui.intro?.startedAt ?? 0;
      if (e.key === 'Escape' || performance.now() - at > TAP_GRACE_MS) s.startFromIntro();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [s, on]);
  if (!intro) return null;
  const side = (lane: LaneId, team: PlayTeam): IntroPiece[] =>
    intro.pieces.filter((p) => p.lane === lane && p.team === team).sort(byPiece);
  const tap = (): void => {
    if (performance.now() - intro.startedAt > TAP_GRACE_MS) s.startFromIntro();
  };
  return (
    <div
      class="intro"
      data-testid="intro"
      data-phase={intro.phase}
      style={{ '--out-ms': `${introOutMs(intro.reduced)}ms` }}
      onClick={tap}
    >
      <div class={`vs ${s.run ? 'in-run' : ''}`}>
        {s.run && (
          <div class="vs-round" data-testid="intro-round">
            {roundLine(s.content, s.run)}
          </div>
        )}
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
        <button
          class="btn primary intro-begin"
          data-testid="intro-begin"
          onClick={(e) => {
            e.stopPropagation();
            s.startFromIntro();
          }}
        >
          Begin
        </button>
        <span class="intro-begin-hint">or tap anywhere</span>
      </div>
    </div>
  );
}
