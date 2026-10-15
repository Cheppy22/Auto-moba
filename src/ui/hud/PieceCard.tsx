import type { Unit } from '../../sim';
import { Term, Terms } from '../glossary';
import { ItemIcon } from '../ItemIcon';
import { itemCategory } from '../itemInfo';
import {
  LANE_LABEL,
  PATH_LABEL,
  PieceGlyph,
  StyleBadge,
  pieceLabel,
  styleColor,
  styleDesc,
  styleLabel,
} from '../pieces';
import { forkOptionName, useEscape, useSession } from '../session';
import { shownItems } from './blackItems';
import { courtName } from '../../analysis/text';

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * A compact card for any piece, either team: piece and style, what the style does, path, rank
 * with its next step, and the items it carries. Opens from a roster portrait or a tap on the board.
 */
export function PieceCard() {
  const s = useSession();
  const m = s.match!;
  const id = s.ui.card;
  const u: Unit | undefined = id === null ? undefined : m.unitById(id);
  useEscape(id !== null, () => s.closeCard());
  if (!u || !u.hero) return null;
  const h = u.hero;
  const team = u.team === 'B' ? 'B' : 'A';
  const style = h.style ? s.content.styleByKey.get(`${h.defId}/${h.style}`) : undefined;
  const itemName = (item: string): string =>
    (s.content.itemById.get(item) ?? s.content.cursedById.get(item))?.name ?? item;
  const taken = h.perks
    .filter((p) => p.optionId)
    .map((p) => ({
      rank: p.rank,
      name: forkOptionName(s.content, h.defId, h.style, p.rank, p.optionId ?? ''),
    }))
    .filter((p) => p.name);
  const items = shownItems(m, u);
  const snap = m.snapshot();
  const waiting = snap.forks.some((f) => f.heroId === u.id);
  const highGround = snap.units.some((x) => x.id === u.id && x.highGround === true);
  const next = h.rank + 1;
  const nextText =
    next > 8
      ? 'Top rank reached.'
      : next === 4 || next === 8
        ? next === 4
          ? 'Rank 4: choose an archetype'
          : `Rank ${next}: a fork (two paths)`
        : `Rank ${next}: ${
            next <= 3
              ? (s.content.pieceById.get(h.defId)?.generic[String(next) as '2' | '3']?.name ?? '')
              : (style?.ranks[String(next) as '5' | '6' | '7']?.name ?? '')
          }`;
  return (
    <div
      class={`ucard side-${team}`}
      data-testid="unit-card"
      data-team={team}
      data-piece={h.defId}
      role="dialog"
      aria-label={`${pieceLabel(s.content, h.defId)}, ${h.style ? styleLabel(s.content, h.defId, h.style) : 'Generic'}`}
      style={{ '--sty': h.style ? styleColor(h.style) : '#c9a35a' }}
    >
      <header class="ucard-head">
        <PieceGlyph piece={h.defId} team={team} size={30} />
        <div class="ucard-name">
          <b data-testid="unit-card-piece">
            {pieceLabel(s.content, h.defId)}
            <span class="dim"> · {courtName(team)}</span>
          </b>
          <span class="ucard-style" data-testid="unit-card-style">
            {h.style ? (
              <>
                <StyleBadge style={h.style} team={team} size={16} />
                {styleLabel(s.content, h.defId, h.style)}
              </>
            ) : (
              'Generic'
            )}
          </span>
        </div>
        <button
          class="ucard-x"
          data-testid="unit-card-close"
          aria-label="Close"
          onClick={() => s.closeCard()}
        >
          ×
        </button>
      </header>
      <p class="ucard-desc">
        {h.style ? (
          styleDesc(s.content, h.defId, h.style)
        ) : (
          <Terms
            text="Uses its base kit until Rank 4, then chooses an archetype."
            skip={['rank']}
          />
        )}
      </p>
      <div class="ucard-meta">
        <span class="chip">{PATH_LABEL[h.path]}</span>
        <span class="chip">{LANE_LABEL[h.lane ?? 'mid']}</span>
        <span class="dim tiny">
          {h.kills} kills · {h.deaths} deaths
        </span>
      </div>
      <div class="ucard-rank">
        <b>
          <Term id="rank">Rank</Term> {h.rank}
        </b>
        <span class="rank-pips" aria-hidden="true">
          {RANKS.map((r) => (
            <i key={r} class={r <= h.rank ? 'on' : ''} />
          ))}
        </span>
      </div>
      <p class="ucard-next tiny dim">
        <Terms
          skip={['rank', 'archetype']}
          max={1}
          text={
            waiting ? 'A fork is waiting for a choice.' : next > 8 ? nextText : `Next: ${nextText}`
          }
        />
      </p>
      {highGround && (
        <p class="ucard-hg tiny" data-testid="unit-card-highground">
          <Term id="eye-badge">Eye badge</Term>: this piece holds the{' '}
          <Term id="high-ground">high ground</Term> over its target.
        </p>
      )}
      {taken.map((t) => (
        <p class="ucard-fork tiny" key={t.rank}>
          <span class="dim">
            Rank {t.rank} {t.rank === 4 ? 'archetype' : 'fork'}:
          </span>{' '}
          {t.name}
        </p>
      ))}
      <div class="ucard-items" data-testid="unit-card-items">
        {items.length === 0 && <span class="dim tiny">No items yet.</span>}
        {items.map((item, i) => (
          <span key={`${item}:${i}`} class={`ucard-item cat-${itemCategory(s.content, item)}`}>
            <ItemIcon id={item} size={16} />
            <span>{itemName(item)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
