import type { Unit } from '../../sim';
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
import { useEscape, useSession } from '../session';

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
  const style = s.content.styleByKey.get(`${h.defId}/${h.style}`);
  const itemName = (item: string): string =>
    (s.content.itemById.get(item) ?? s.content.cursedById.get(item) ?? s.content.holyById.get(item))
      ?.name ?? item;
  const taken = h.perks
    .filter((p) => p.optionId)
    .map((p) => ({
      rank: p.rank,
      name: style?.forks[String(p.rank) as '4' | '8']?.find((o) => o.id === p.optionId)?.name ?? '',
    }))
    .filter((p) => p.name);
  const waiting = m.snapshot().forks.some((f) => f.heroId === u.id);
  const next = h.rank + 1;
  const nextText =
    next > 8
      ? 'Top rank reached.'
      : next === 4 || next === 8
        ? `Rank ${next}: a fork (two paths)`
        : `Rank ${next}: ${style?.ranks[String(next) as '2' | '3' | '5' | '6' | '7']?.name ?? ''}`;
  return (
    <div
      class={`ucard side-${team}`}
      data-testid="unit-card"
      data-team={team}
      data-piece={h.defId}
      role="dialog"
      aria-label={`${pieceLabel(s.content, h.defId)}, ${styleLabel(s.content, h.defId, h.style)}`}
      style={{ '--sty': styleColor(h.style) }}
    >
      <header class="ucard-head">
        <PieceGlyph piece={h.defId} team={team} size={30} />
        <div class="ucard-name">
          <b data-testid="unit-card-piece">
            {pieceLabel(s.content, h.defId)}
            <span class="dim"> · {team === 'A' ? 'White' : 'Black'}</span>
          </b>
          <span class="ucard-style" data-testid="unit-card-style">
            <StyleBadge style={h.style} team={team} size={16} />
            {styleLabel(s.content, h.defId, h.style)}
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
      <p class="ucard-desc">{styleDesc(s.content, h.defId, h.style)}</p>
      <div class="ucard-meta">
        <span class="chip">{PATH_LABEL[h.path]}</span>
        <span class="chip">{LANE_LABEL[h.lane ?? 'mid']}</span>
        <span class="dim tiny">
          {h.kills} kills · {h.deaths} deaths
        </span>
      </div>
      <div class="ucard-rank">
        <b>Rank {h.rank}</b>
        <span class="rank-pips" aria-hidden="true">
          {RANKS.map((r) => (
            <i key={r} class={r <= h.rank ? 'on' : ''} />
          ))}
        </span>
      </div>
      <p class="ucard-next tiny dim">
        {waiting ? 'A fork is waiting for a choice.' : next > 8 ? nextText : `Next: ${nextText}`}
      </p>
      {taken.map((t) => (
        <p class="ucard-fork tiny" key={t.rank}>
          <span class="dim">Rank {t.rank} fork:</span> {t.name}
        </p>
      ))}
      <div class="ucard-items" data-testid="unit-card-items">
        {h.items.length === 0 && <span class="dim tiny">No items yet.</span>}
        {h.items.map((item, i) => (
          <span key={`${item}:${i}`} class={`ucard-item cat-${itemCategory(s.content, item)}`}>
            <ItemIcon id={item} size={16} />
            <span>{itemName(item)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
