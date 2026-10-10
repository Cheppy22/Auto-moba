import { useState } from 'preact/hooks';
import { courtName } from '../analysis/text';
import { ItemIcon } from './ItemIcon';
import { Lanes, Paths, whitePieces } from './Orders';
import { RichText, plainText } from './richtext';
import { itemCategory } from './itemInfo';
import {
  PATH_LABEL,
  PieceGlyph,
  pieceLabel,
} from './pieces';
import { n0 } from './format';
import { SchoolChip } from './schools';
import { useEscape, useSession } from './session';

/** Black's Opening stays hidden for the first minute of play (20 ticks a second). */
const REVEAL_TICKS = 60 * 20;

type Tab = 'lanes' | 'paths' | 'armory';

const TABS: { id: Tab; label: string }[] = [
  { id: 'lanes', label: 'Lanes' },
  { id: 'paths', label: 'Paths' },
  { id: 'armory', label: 'Armory' },
];

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
        const id = snap.opening?.[t] ?? null;
        const shown = id !== null && (t === 'A' || snap.tick >= REVEAL_TICKS);
        const opening = shown ? s.content.openings.find((o) => o.id === id) : undefined;
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
            <span class="mini-opening tiny" data-testid={`opening-${t}`}>
              <span class="dim">Opening</span>{' '}
              <b>{opening ? opening.name : shown ? id : 'Not yet seen'}</b>
              {opening?.schools.map((sc) => (
                <SchoolChip key={sc} school={sc} glyph={11} />
              ))}
              {opening && opening.schools.length === 0 && (
                <span class="school-chip balanced">Balanced</span>
              )}
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
