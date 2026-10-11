import { useState } from 'preact/hooks';
import { naturalPath, type Content, type Path, type PieceId, type SetupEntry } from '../../sim';
import { ItemIcon } from '../ItemIcon';
import { PATHS, PATH_LABEL, PIECE_ORDER, PieceGlyph } from '../pieces';
import { plainText } from '../richtext';
import { PATH_FOCUS, buildOrder, leanOf, pathMeaning } from './data';

const LEAN_ROWS: { key: 'damage' | 'toughness' | 'support'; label: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'toughness', label: 'Toughness' },
  { key: 'support', label: 'Support' },
];

/** Page 1: one piece at a time (tabs), its three paths, and what each path buys first. */
export function PathsPage(props: {
  content: Content;
  entries: SetupEntry[];
  onPath: (piece: PieceId, path: Path) => void;
}) {
  const { content: c, entries } = props;
  const [shown, setShown] = useState<PieceId>('queen');
  const def = c.pieceById.get(shown)!;
  const path = entries.find((e) => e.piece === shown)!.path;
  const order = buildOrder(c, shown, path);
  const lean = leanOf(order.map((b) => b.item));
  const natural = naturalPath(def);
  return (
    <section class="sp-page pp" aria-label="Build paths">
      <div class="sp-lede">
        <h3>Build paths</h3>
        <p>
          Your pieces buy their own items. A path tells a piece what to buy first. Each piece starts
          on its natural path.
        </p>
      </div>
      <div class="pp-grid">
        <div class="pp-tabs" role="tablist" aria-label="Piece" data-noswipe>
          {PIECE_ORDER.map((id) => {
            const p = c.pieceById.get(id)!;
            const chosen = entries.find((e) => e.piece === id)!.path;
            return (
              <button
                key={id}
                class={`pp-tab ${shown === id ? 'on' : ''}`}
                role="tab"
                aria-selected={shown === id}
                data-testid={`piece-${id}`}
                onClick={() => setShown(id)}
              >
                <PieceGlyph piece={id} team="A" size={30} />
                <b>{p.name}</b>
                <span class={`pp-tab-path p-${chosen}`}>{PATH_LABEL[chosen]}</span>
              </button>
            );
          })}
        </div>
        <div class="pp-detail" role="tabpanel" data-testid={`paths-${shown}`}>
          <header class="pp-head">
            <PieceGlyph piece={shown} team="A" size={44} />
            <div>
              <h3>{def.name}</h3>
              <p class="dim">
                {def.title} · {def.attackKind}
              </p>
            </div>
          </header>
          <div class="pp-paths" role="radiogroup" aria-label={`${def.name} build path`}>
            {PATHS.map((p) => (
              <button
                key={p}
                class={`pp-path ${path === p ? 'on' : ''}`}
                role="radio"
                aria-checked={path === p}
                data-testid={`path-${shown}-${p}`}
                onClick={() => props.onPath(shown, p)}
              >
                <b>{PATH_LABEL[p]}</b>
                <span>{PATH_FOCUS[p]}</span>
                {natural === p && <i class="pp-nat">Natural</i>}
              </button>
            ))}
          </div>
          <p class="pp-meaning" data-testid={`style-desc-${shown}`}>
            {pathMeaning(c, shown, path)} The {def.name} picks an archetype at Rank 4, which can
            change this list.
          </p>
          <div class="pp-lean" aria-label="Stat leaning">
            {LEAN_ROWS.map((r) => (
              <div class="lean-row" key={r.key}>
                <span>{r.label}</span>
                <span class="lean-bar" aria-hidden="true">
                  <i class={`lean-${r.key}`} style={{ width: `${Math.round(lean[r.key] * 100)}%` }} />
                </span>
                <span class="lean-pct">{Math.round(lean[r.key] * 100)}%</span>
              </div>
            ))}
          </div>
          <h4 class="sp-sub">Typical first buys</h4>
          <ol class="buys" data-testid="first-buys">
            {order.slice(0, 3).map((b, i) => (
              <li key={b.item.id} class={`buy cat-${b.item.category}`}>
                <span class="buy-n">{i + 1}</span>
                <span class="buy-icon">
                  <ItemIcon id={b.item.id} size={30} />
                </span>
                <span class="buy-text">
                  <b>
                    {b.item.name} <i class="buy-cost">{b.item.cost}g</i>
                  </b>
                  <span class="buy-fx">{plainText(b.item.desc)}</span>
                  {b.parts.length > 0 && (
                    <span class="buy-parts">
                      Built from {b.parts.map((x) => x.name).join(' + ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {order.length > 3 && (
            <p class="pp-later">
              <span class="dim">Then</span>
              {order.slice(3).map((b) => (
                <span key={b.item.id} class={`later cat-${b.item.category}`}>
                  <ItemIcon id={b.item.id} size={16} />
                  {b.item.name}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
