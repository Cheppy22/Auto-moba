import { useState } from 'preact/hooks';
import type { PieceId, Unit } from '../sim';
import { courtName } from '../analysis/text';
import { ItemIcon } from './ItemIcon';
import { LaneBoard, type BoardPiece } from './LaneBoard';
import { RichText, plainText } from './richtext';
import { itemCategory } from './itemInfo';
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
import { n0 } from './format';
import { useEscape, useSession } from './session';

type Tab = 'lanes' | 'paths' | 'armory';

const TABS: { id: Tab; label: string }[] = [
  { id: 'lanes', label: 'Lanes' },
  { id: 'paths', label: 'Paths' },
  { id: 'armory', label: 'Armory' },
];

function whitePieces(s: ReturnType<typeof useSession>): Unit[] {
  const m = s.match!;
  return m.state.teams.A.heroIds
    .map((id) => m.unitById(id))
    .filter((u): u is Unit => !!u && !!u.hero)
    .sort((a, b) => PIECE_ORDER.indexOf(a.hero!.defId) - PIECE_ORDER.indexOf(b.hero!.defId));
}

function Lanes() {
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
              <span class="dim"> · {styleLabel(s.content, h.defId, h.style)}</span>
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

function Paths() {
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
                  {styleLabel(s.content, h.defId, h.style)} · Rank {h.rank} ·{' '}
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

function Armory() {
  const s = useSession();
  const m = s.match!;
  const [sel, setSel] = useState<{ hero: number; item: string } | null>(null);
  const def = (id: string) =>
    s.content.itemById.get(id) ?? s.content.cursedById.get(id) ?? s.content.holyById.get(id);
  const desc = (id: string): string => {
    const it = def(id);
    return it && 'desc' in it ? (it as { desc: string }).desc : '';
  };
  return (
    <div class="col" data-testid="tab-armory">
      <p class="dim small">
        What each piece carries and will buy next. Read only: they shop on their own.
      </p>
      {whitePieces(s).map((u) => {
        const h = u.hero!;
        const next = m.nextBuy(u.id);
        const open = sel && sel.hero === u.id ? sel.item : null;
        const tile = (id: string, key: string, isNext: boolean) => {
          const it = def(id);
          const on = open === id;
          return (
            <button
              key={key}
              class={`atile cat-${itemCategory(s.content, id)} ${isNext ? 'next' : ''} ${on ? 'sel' : ''}`}
              data-testid={isNext ? `next-${h.defId}` : `item-${h.defId}-${id}`}
              aria-pressed={on}
              title={`${it?.name ?? id}: ${plainText(desc(id))}`}
              onClick={() => setSel(on ? null : { hero: u.id, item: id })}
            >
              <span class="aicon">
                <ItemIcon id={id} size={22} />
              </span>
              <span class="aname">{it?.name ?? id}</span>
              {isNext && <i class="anext">Next</i>}
            </button>
          );
        };
        return (
          <section class="card armory-card" key={u.id} data-testid={`armory-${h.defId}`}>
            <div class="row">
              <PieceGlyph piece={h.defId} team="A" size={28} />
              <b class="grow">
                {pieceLabel(s.content, h.defId)}
                <span class="dim tiny"> · {PATH_LABEL[h.path]}</span>
              </b>
              <span class="gold small">
                <i class="coin" aria-hidden="true" />
                {n0(h.gold)}
              </span>
            </div>
            <div class="atiles">
              {h.items.length === 0 && <span class="dim small">No items yet.</span>}
              {h.items.map((id, i) => tile(id, `${id}:${i}`, false))}
              {next && tile(next, 'next', true)}
            </div>
            {open && (
              <div class={`adesc small cat-${itemCategory(s.content, open)}`}>
                <b>{def(open)?.name}</b> <RichText text={desc(open)} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Mini() {
  const s = useSession();
  const m = s.match!;
  const snap = m.snapshot();
  return (
    <div class="mini" data-testid="mini-score">
      {(['A', 'B'] as const).map((t) => {
        const team = m.state.teams[t];
        return (
          <div class={`mini-team ${t === 'A' ? 'a' : 'b'}`} key={t}>
            <b>{courtName(t)}</b>
            <span class="pts-big">{snap.points[t]}</span>
            <span class="dim tiny">
              {team.kills} kills · {team.towersDown} Bastions taken · Tempo {snap.tempo[t]} · Pawns{' '}
              {snap.pawns[t].alive}/{snap.pawns[t].cap}
              {snap.check[t] ? ' · In Check' : ''}
              {snap.throneDown[t] ? ' · Throne down' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The paused panel: lanes, build paths and a read-only look at every piece's items. */
export function Adjourn() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>('lanes');
  const resume = (): void => s.resume();
  useEscape(true, resume);
  return (
    <div class="overlay adjourn" data-testid="adjourn-panel" role="dialog" aria-label="Adjourned">
      <div class="panel col adjourn-panel">
        <div class="row">
          <h2 class="grow">Adjourned</h2>
          <button class="btn primary" data-testid="resume" onClick={resume}>
            Resume
          </button>
        </div>
        <Mini />
        <div class="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              class={`btn ${tab === t.id ? 'on' : ''}`}
              data-testid={`tab-${t.id}-btn`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="adjourn-body scroll">
          {tab === 'lanes' && <Lanes />}
          {tab === 'paths' && <Paths />}
          {tab === 'armory' && <Armory />}
        </div>
      </div>
    </div>
  );
}
