import { useEffect, useRef, useState } from 'preact/hooks';
import type { Content, SetupEntry } from '../../sim';
import { Term, Terms } from '../glossary';
import { LANE_TAG, PieceGlyph } from '../pieces';
import { SCHOOL_COLOR, SCHOOL_NAME, SchoolGlyph } from '../schools';
import { exampleHands, openingInfo, openingMatchups, opensWith } from './data';

type Opening = Content['openings'][number];

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** One line of glyphs: which enemy schools this Opening is good, even and weak against. */
function VerdictStrip(props: { opening: Opening }) {
  const { strongVs, evenVs, weakVs } = openingMatchups(props.opening.schools);
  const groups = (
    [
      ['Good', '▲', 'good', strongVs],
      ['Even', '=', 'even', evenVs],
      ['Weak', '▼', 'weak', weakVs],
    ] as const
  ).filter(([, , , list]) => list.length > 0);
  if (groups.length === 0) return null;
  const label = groups
    .map(
      ([title, , , list]) => `${title} against ${list.map((m) => SCHOOL_NAME[m.other]).join(', ')}`,
    )
    .join('. ');
  return (
    <div
      class="op-verdict"
      role="img"
      aria-label={label}
      title={label}
      data-testid={`opening-verdict-${props.opening.id}`}
    >
      {groups.map(([title, mark, kind, list]) => (
        <span class={`ov ${kind}`} key={title}>
          <i>
            {title} {mark}
          </i>
          {list.map((m) => (
            <SchoolGlyph key={m.other} school={m.other} size={16} />
          ))}
        </span>
      ))}
    </div>
  );
}

function OpeningCard(props: {
  content: Content;
  opening: Opening;
  on: boolean;
  onPick: () => void;
}) {
  const { content: c, opening: o } = props;
  const [more, setMore] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  // the picked row (with its verdict strip, or its opened More) scrolls into view inside its page,
  // never past its own top; only the page's own scroll moves, never the sliding pager around it
  useEffect(() => {
    const el = row.current;
    const pane = el?.closest('.sp-pane');
    if (!props.on || !el || !pane) return;
    const r = el.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    const over = r.bottom - p.bottom;
    if (over > 0) pane.scrollTop += Math.min(over + 8, Math.max(0, r.top - p.top));
  }, [props.on, more]);
  const info = openingInfo(c, o);
  const hands = more ? exampleHands(c, o) : [];
  const card = o.openingCard ? c.gambitById.get(o.openingCard) : undefined;
  return (
    <div ref={row} class={`op ${props.on ? 'on' : ''} ${more ? 'open' : ''}`}>
      <div class="op-row">
        <button
          class={`op-pick ${props.on ? 'on' : ''}`}
          role="radio"
          aria-checked={props.on}
          data-testid={`opening-${o.id}`}
          onClick={props.onPick}
        >
          <span class="op-mark" aria-hidden="true" />
          <span class="op-text">
            <b class="op-name">{o.name}</b>
            <span class="op-line">
              <span class="op-schools">
                {o.schools.length === 0 ? (
                  <span class="school-chip balanced">Balanced</span>
                ) : (
                  o.schools.map((sc) => <SchoolGlyph key={sc} school={sc} size={18} />)
                )}
              </span>
              <span class="op-opens" data-testid={`opening-opens-${o.id}`}>
                {opensWith(c, o)}
              </span>
            </span>
          </span>
        </button>
        <button
          class="op-more"
          aria-expanded={more}
          aria-label={`${more ? 'Less' : 'More'} about the ${o.name}`}
          data-testid={`opening-more-${o.id}`}
          onClick={() => setMore(!more)}
        >
          <span class="op-more-text">{more ? 'Less' : 'More'}</span>
          <span class="op-caret" aria-hidden="true" />
        </button>
      </div>
      {props.on && <VerdictStrip opening={o} />}
      {more && (
        <div class="op-body" data-testid={`opening-body-${o.id}`}>
          <h5>What it does</h5>
          <p>
            <Terms text={info.explain} skip={['opening']} max={2} />
          </p>
          <h5>How it plays</h5>
          <p>{info.plays}</p>
          <p data-testid={`opening-card-${o.id}`}>
            {card ? (
              <>
                Your <Term id="opening-card">opening card</Term> is <b>{card.name}</b>: it is in
                your first hand and stays until you play it or Act 1 ends.
              </>
            ) : (
              <>
                No <Term id="opening-card">opening card</Term>: your first hand holds three
                different schools.
              </>
            )}
          </p>
          {info.share && (
            <p class="op-share">
              Favoured cards are {pct(info.share.with)} of your draws, against{' '}
              {pct(info.share.without)} with no Opening.
            </p>
          )}
          {info.cards.length > 0 && <p class="dim">More often: {info.cards.join(', ')}.</p>}
          {(
            [
              ['Good against', info.strongVs],
              ['Even against', info.evenVs],
              ['Weak against', info.weakVs],
            ] as const
          ).map(
            ([title, list]) =>
              list.length > 0 && (
                <div key={title}>
                  <h5>{title}</h5>
                  <ul class="match">
                    {list.map((m) => (
                      <li key={m.other}>
                        <span class="match-pair">
                          {m.mine.map((s) => (
                            <SchoolGlyph key={s} school={s} size={13} />
                          ))}
                          <SchoolGlyph school={m.other} size={13} />
                          <b style={{ color: SCHOOL_COLOR[m.other] }}>{SCHOOL_NAME[m.other]}</b>
                        </span>
                        <span>{m.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          <h5>Example hands</h5>
          <p class="dim tiny">Samples drawn with this Opening’s weights. Real hands vary.</p>
          <div class="hands">
            {hands.map((h, i) => (
              <div class="hand" key={i}>
                {h.map((g, k) => (
                  <span
                    class={`hcard ${card && k === 0 ? 'opening' : ''}`}
                    key={g.id}
                    style={{ '--school': SCHOOL_COLOR[g.school] }}
                    title={g.desc}
                  >
                    <SchoolGlyph school={g.school} size={14} />
                    <b>{g.name}</b>
                    <i>{g.cost} Tempo</i>
                    {card && k === 0 && <em class="hcard-op">Opening</em>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Page 3: pick the Opening (with a "More" section each), review the setup, then Begin. */
export function OpeningPage(props: {
  content: Content;
  entries: SetupEntry[];
  opening: string;
  onOpening: (id: string) => void;
}) {
  const { content: c } = props;
  const half = Math.ceil(c.openings.length / 2);
  return (
    <section class="sp-page op-page" aria-label="Opening">
      <div class="sp-lede">
        <h3>
          <Term id="opening">Opening</Term>
        </h3>
        <p>
          <Terms
            skip={['opening']}
            text="An Opening tilts which gambit cards you are dealt and gives you one to open with. Tap More to read how each plays."
          />
        </p>
        <p class="op-hint" data-testid="opening-hint">
          New here? Italian Game or Caro-Kann.
        </p>
      </div>
      <div class="openings" role="radiogroup" aria-label="Opening" data-testid="openings">
        {[c.openings.slice(0, half), c.openings.slice(half)].map((col, i) => (
          <div class="op-col" key={i}>
            {col.map((o) => (
              <OpeningCard
                key={o.id}
                content={c}
                opening={o}
                on={props.opening === o.id}
                onPick={() => props.onOpening(o.id)}
              />
            ))}
          </div>
        ))}
      </div>
      <h4 class="sp-sub">Your setup</h4>
      <div class="recap" aria-label="Your setup" data-testid="recap">
        {props.entries.map((e) => (
          <span class="recap-piece" key={e.piece}>
            <PieceGlyph piece={e.piece} team="A" size={22} />
            <b>{LANE_TAG[e.lane]}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
