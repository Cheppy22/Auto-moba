import { useState } from 'preact/hooks';
import type { Content, SetupEntry } from '../../sim';
import { LANE_TAG, PATH_LABEL, PieceGlyph } from '../pieces';
import { SCHOOL_COLOR, SCHOOL_NAME, SchoolChip, SchoolGlyph } from '../schools';
import { exampleHands, openingInfo } from './data';

type Opening = Content['openings'][number];

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function OpeningCard(props: {
  content: Content;
  opening: Opening;
  on: boolean;
  onPick: () => void;
}) {
  const { content: c, opening: o } = props;
  const [more, setMore] = useState(false);
  const info = openingInfo(c, o);
  const hands = more ? exampleHands(c, o) : [];
  return (
    <div class={`op ${props.on ? 'on' : ''} ${more ? 'open' : ''}`}>
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
          <span class="op-desc">{o.desc}</span>
          <span class="op-schools">
            {o.schools.length === 0 ? (
              <span class="school-chip balanced">Balanced</span>
            ) : (
              o.schools.map((sc) => <SchoolChip key={sc} school={sc} />)
            )}
          </span>
        </span>
      </button>
      <button
        class="op-more"
        aria-expanded={more}
        data-testid={`opening-more-${o.id}`}
        onClick={() => setMore(!more)}
      >
        {more ? 'Less' : 'More'}
        <span class="op-caret" aria-hidden="true" />
      </button>
      {more && (
        <div class="op-body" data-testid={`opening-body-${o.id}`}>
          <h5>What it does</h5>
          <p>{info.explain}</p>
          <h5>How it plays</h5>
          <p>{info.plays}</p>
          {info.share && (
            <p class="op-share">
              Favoured cards are {pct(info.share.with)} of your draws, against{' '}
              {pct(info.share.without)} with no Opening.
            </p>
          )}
          {info.cards.length > 0 && <p class="dim">More often: {info.cards.join(', ')}.</p>}
          {info.strongVs.length > 0 && (
            <>
              <h5>Good against</h5>
              <ul class="match">
                {info.strongVs.map((m) => (
                  <li key={`${m.mine}${m.other}`}>
                    <span class="match-pair">
                      <SchoolGlyph school={m.mine} size={13} />
                      <SchoolGlyph school={m.other} size={13} />
                      <b style={{ color: SCHOOL_COLOR[m.other] }}>{SCHOOL_NAME[m.other]}</b>
                    </span>
                    <span>{m.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {info.weakVs.length > 0 && (
            <>
              <h5>Weak against</h5>
              <ul class="match">
                {info.weakVs.map((m) => (
                  <li key={`${m.mine}${m.other}`}>
                    <span class="match-pair">
                      <SchoolGlyph school={m.mine} size={13} />
                      <SchoolGlyph school={m.other} size={13} />
                      <b style={{ color: SCHOOL_COLOR[m.other] }}>{SCHOOL_NAME[m.other]}</b>
                    </span>
                    <span>{m.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h5>Example hands</h5>
          <p class="dim tiny">Samples drawn with this Opening’s weights. Real hands vary.</p>
          <div class="hands">
            {hands.map((h, i) => (
              <div class="hand" key={i}>
                {h.map((g) => (
                  <span
                    class="hcard"
                    key={g.id}
                    style={{ '--school': SCHOOL_COLOR[g.school] }}
                    title={g.desc}
                  >
                    <SchoolGlyph school={g.school} size={14} />
                    <b>{g.name}</b>
                    <i>{g.cost} Tempo</i>
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
  return (
    <section class="sp-page op-page" aria-label="Opening">
      <div class="sp-lede">
        <h3>Opening</h3>
        <p>An Opening tilts which gambit cards you are dealt. Tap More to read how each plays.</p>
      </div>
      <div class="openings" role="radiogroup" aria-label="Opening" data-testid="openings">
        {c.openings.map((o) => (
          <OpeningCard
            key={o.id}
            content={c}
            opening={o}
            on={props.opening === o.id}
            onPick={() => props.onOpening(o.id)}
          />
        ))}
      </div>
      <h4 class="sp-sub">Your setup</h4>
      <div class="recap" aria-label="Your setup" data-testid="recap">
        {props.entries.map((e) => (
          <span class="recap-piece" key={e.piece}>
            <PieceGlyph piece={e.piece} team="A" size={22} />
            <b>{LANE_TAG[e.lane]}</b>
            <i>{PATH_LABEL[e.path]}</i>
          </span>
        ))}
      </div>
    </section>
  );
}
