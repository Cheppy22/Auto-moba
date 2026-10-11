import { useRef, useState } from 'preact/hooks';
import type { Content, LaneId, PieceId, SetupEntry } from '../../sim';
import { moveToLane, swapLanes } from '../LaneBoard';
import { LANES, LANE_SLOTS, PieceGlyph } from '../pieces';
import { DISPOSITION_LABEL, DISPOSITION_NOTE, LANE_FULL, laneNotes, passiveParts } from './data';

interface Dragging {
  piece: PieceId;
  x: number;
  y: number;
}

/** Page 2: the mini board (tap a piece then a lane, or drag), lane synergy and piece cards. */
export function BoardPage(props: {
  content: Content;
  entries: SetupEntry[];
  selected: PieceId | null;
  onSelect: (piece: PieceId | null) => void;
  onChange: (next: SetupEntry[]) => void;
}) {
  const { content: c, entries, selected } = props;
  const [drag, setDrag] = useState<Dragging | null>(null);
  const [over, setOver] = useState<LaneId | null>(null);
  const [open, setOpen] = useState<PieceId | null>(null);
  const press = useRef<{ id: number; x: number; y: number; piece: PieceId; moved: boolean } | null>(
    null,
  );
  const swallow = useRef(false);
  const bd = useRef<HTMLDivElement>(null);

  const zoneTap = (lane: LaneId): void => {
    if (selected) props.onChange(moveToLane(entries, selected, lane));
  };
  const chipTap = (piece: PieceId, lane: LaneId): void => {
    if (selected && selected !== piece) {
      const sel = entries.find((e) => e.piece === selected);
      if (sel && sel.lane !== lane) {
        props.onChange(swapLanes(entries, selected, piece));
        return;
      }
    }
    props.onSelect(selected === piece ? null : piece);
  };
  const under = (x: number, y: number): { lane: LaneId | null; piece: PieceId | null } => {
    const el = document.elementFromPoint(x, y);
    const zone = el?.closest<HTMLElement>('[data-lane]');
    const chip = el?.closest<HTMLElement>('[data-piece]');
    return {
      lane: (zone?.dataset.lane as LaneId | undefined) ?? null,
      piece: (chip?.dataset.piece as PieceId | undefined) ?? null,
    };
  };
  const drop = (piece: PieceId, x: number, y: number): void => {
    const t = under(x, y);
    const mine = entries.find((e) => e.piece === piece);
    if (!mine) return;
    if (t.piece && t.piece !== piece) {
      const other = entries.find((e) => e.piece === t.piece);
      if (other && other.lane !== mine.lane) props.onChange(swapLanes(entries, piece, t.piece));
    } else if (t.lane) {
      props.onChange(moveToLane(entries, piece, t.lane));
    }
    props.onSelect(null);
  };

  const lanes = LANES.map((lane) => ({
    lane,
    here: entries.filter((e) => e.lane === lane),
  }));
  const synergy = lanes
    .map(({ lane, here }) => ({
      lane,
      here,
      notes: here.length === 2 ? laneNotes(c, here[0].piece, here[1].piece) : [],
    }))
    .filter((l) => l.notes.length > 0);

  return (
    <section class="sp-page bp" aria-label="Board arrangement">
      <div class="sp-lede">
        <h3>Board arrangement</h3>
        <p>
          {selected
            ? `${c.pieceById.get(selected)!.name} selected. Tap a lane, or tap another piece to swap.`
            : 'Tap a piece, then a lane. Or drag a piece onto a lane. Left 2, Mid 1, Right 2.'}
        </p>
      </div>
      <div class="bp-grid">
        <div class="bp-left">
          <div class="bd" data-testid="lane-board" ref={bd}>
            <div class="bd-side bd-black">Black’s court (hidden)</div>
            <div class="bd-lanes">
              {lanes.map(({ lane, here }) => (
                <div
                  key={lane}
                  class={`bd-lane ${selected && !here.some((e) => e.piece === selected) ? 'ready' : ''} ${over === lane ? 'over' : ''}`}
                  data-lane={lane}
                  data-testid={`zone-${lane}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${LANE_FULL[lane]} lane, ${here.length} of ${LANE_SLOTS[lane]}`}
                  onClick={() => zoneTap(lane)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      zoneTap(lane);
                    }
                  }}
                >
                  <div class="bd-name">
                    {LANE_FULL[lane]}
                    <span>
                      {here.length}/{LANE_SLOTS[lane]}
                    </span>
                  </div>
                  <div class="bd-slots">
                    {here.map((e) => (
                      <button
                        key={e.piece}
                        class={`bd-chip ${selected === e.piece ? 'sel' : ''} ${drag?.piece === e.piece ? 'lifted' : ''}`}
                        data-piece={e.piece}
                        data-noswipe
                        data-testid={`chip-${e.piece}`}
                        aria-pressed={selected === e.piece}
                        title={c.pieceById.get(e.piece)!.name}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (swallow.current) {
                            swallow.current = false;
                            return;
                          }
                          chipTap(e.piece, lane);
                        }}
                        onPointerDown={(ev) => {
                          if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0))
                            return;
                          press.current = {
                            id: ev.pointerId,
                            x: ev.clientX,
                            y: ev.clientY,
                            piece: e.piece,
                            moved: false,
                          };
                        }}
                        onPointerMove={(ev) => {
                          const p = press.current;
                          if (!p || p.id !== ev.pointerId) return;
                          if (!p.moved) {
                            if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 8) return;
                            p.moved = true;
                            (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
                          }
                          setDrag({ piece: p.piece, x: ev.clientX, y: ev.clientY });
                          setOver(under(ev.clientX, ev.clientY).lane);
                        }}
                        onPointerUp={(ev) => {
                          const p = press.current;
                          press.current = null;
                          if (!p || p.id !== ev.pointerId || !p.moved) return;
                          swallow.current = true;
                          window.setTimeout(() => (swallow.current = false), 0);
                          drop(p.piece, ev.clientX, ev.clientY);
                          setDrag(null);
                          setOver(null);
                        }}
                        onPointerCancel={() => {
                          press.current = null;
                          setDrag(null);
                          setOver(null);
                        }}
                      >
                        <PieceGlyph piece={e.piece} team="A" size={34} />
                        <span class="bd-chip-name">{c.pieceById.get(e.piece)!.name}</span>
                      </button>
                    ))}
                    {Array.from({ length: Math.max(0, LANE_SLOTS[lane] - here.length) }, (_, i) => (
                      <span class="bd-empty" key={`e${i}`} aria-hidden="true" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div class="bd-side bd-white">Your court</div>
            {drag && bd.current && (
              <span
                class="bd-ghost"
                style={{
                  left: `${drag.x - bd.current.getBoundingClientRect().left}px`,
                  top: `${drag.y - bd.current.getBoundingClientRect().top}px`,
                }}
              >
                <PieceGlyph piece={drag.piece} team="A" size={40} />
              </span>
            )}
          </div>
          {synergy.length > 0 && (
            <div class="syn" data-testid="synergy">
              <h4 class="sp-sub">Lane synergy</h4>
              {synergy.map(({ lane, here, notes }) => (
                <div class="syn-lane" key={lane} data-testid={`synergy-${lane}`}>
                  <div class="syn-head">
                    <PieceGlyph piece={here[0].piece} team="A" size={22} />
                    <PieceGlyph piece={here[1].piece} team="A" size={22} />
                    <b>
                      {c.pieceById.get(here[0].piece)!.name} +{' '}
                      {c.pieceById.get(here[1].piece)!.name}
                    </b>
                    <span class="chip gold">{LANE_FULL[lane]}</span>
                  </div>
                  <ul>
                    {notes.map((n, i) => (
                      <li key={i}>
                        <i>{n.title}</i> {n.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div class="bp-right">
          <h4 class="sp-sub">Your pieces</h4>
          <div class="pcards" data-testid="piece-cards">
            {entries.map((e) => {
              const def = c.pieceById.get(e.piece)!;
              const isOpen = open === e.piece;
              return (
                <div
                  key={e.piece}
                  class={`pcard ${isOpen ? 'open' : ''} ${selected === e.piece ? 'sel' : ''}`}
                  data-testid={`desc-${e.piece}`}
                >
                  <button
                    class="pcard-head"
                    aria-expanded={isOpen}
                    data-testid={`desc-toggle-${e.piece}`}
                    onClick={() => setOpen(isOpen ? null : e.piece)}
                  >
                    <PieceGlyph piece={e.piece} team="A" size={32} />
                    <span class="pcard-name">
                      <b>{def.name}</b>
                      <span class="dim">{def.title}</span>
                    </span>
                    <span class="pcard-chips">
                      <span
                        class={`chip disp disp-${def.disposition}`}
                        title={DISPOSITION_NOTE[def.disposition]}
                      >
                        {DISPOSITION_LABEL[def.disposition]}
                      </span>
                      <span class="chip">{def.attackKind}</span>
                      <span class="chip gold">{LANE_FULL[e.lane]}</span>
                    </span>
                    <span class="pcard-caret" aria-hidden="true" />
                  </button>
                  <div class="pcard-drawer" aria-hidden={!isOpen}>
                    <div class="pcard-body" data-testid={`desc-${e.piece}-body`}>
                      <p class="pcard-role">
                        <b>{DISPOSITION_LABEL[def.disposition]}.</b>{' '}
                        {DISPOSITION_NOTE[def.disposition]}. {def.playstyle}
                      </p>
                      <h5>Base skills</h5>
                      <ul class="skills">
                        {def.abilities.map((a) => (
                          <li key={a.id}>
                            <b>{a.name}</b> <span>{a.desc}</span>
                          </li>
                        ))}
                        {def.passives.map((p, i) => {
                          const parts = passiveParts(p.desc ?? '');
                          return (
                            <li key={`p${i}`} class="passive">
                              <b>{parts.name || 'Passive'}</b> <i>passive</i>{' '}
                              <span>{parts.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
