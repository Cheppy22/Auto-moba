import { useState } from 'preact/hooks';
import { naturalPath, type Content, type Path, type PieceId, type SetupEntry } from '../../sim';
import { ItemIcon } from '../ItemIcon';
import { Term, Terms } from '../glossary';
import { PATHS, PATH_LABEL, PIECE_ORDER, PieceGlyph } from '../pieces';
import { plainText } from '../richtext';
import { PATH_FOCUS, buildOrder, firstBuys, leanOf, pathMeaning } from './data';

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
  const lean = leanOf(order);
  const buys = firstBuys(c, shown, path);
  const natural = naturalPath(def);
  return (
    <section class="sp-page pp" aria-label="Build paths">
      <div class="sp-lede">
        <h3>
          <Term id="build-path">Build paths</Term>
        </h3>
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
          <div class="pp-info">
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
            <p class="pp-meaning">{pathMeaning(c, shown, path)}</p>
            <div class="pp-lean" aria-label="Stat leaning">
              {LEAN_ROWS.map((r) => (
                <div class="lean-row" key={r.key}>
                  <span>{r.label}</span>
                  <span class="lean-bar" aria-hidden="true">
                    <i
                      class={`lean-${r.key}`}
                      style={{ width: `${Math.round(lean[r.key] * 100)}%` }}
                    />
                  </span>
                  <span class="lean-pct">{Math.round(lean[r.key] * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div class="pp-order">
            <h4 class="sp-sub">Typical first buys</h4>
            <ol class="buys" data-testid="first-buys">
              {buys.map((b, i) => (
                <li key={`${b.item.id}${i}`} class={`buy cat-${b.item.category}`}>
                  <span class="buy-n">{i + 1}</span>
                  <span class="buy-icon">
                    <ItemIcon id={b.item.id} size={30} />
                  </span>
                  <span class="buy-text">
                    <b>
                      {b.item.name} <i class="buy-cost">{b.item.cost}g</i>
                    </b>
                    <span class="buy-fx">{plainText(b.item.desc)}</span>
                    {b.toward && <span class="buy-parts">Part of {b.toward.name}</span>}
                  </span>
                </li>
              ))}
            </ol>
            <h4 class="sp-sub">Then builds toward</h4>
            <p class="pp-later" data-testid="build-list">
              {order
                .filter((it) => it.tier >= 2)
                .map((it) => (
                  <span key={it.id} class={`later cat-${it.category}`}>
                    <ItemIcon id={it.id} size={18} />
                    {it.name}
                  </span>
                ))}
            </p>
            <p class="pp-note" data-testid={`style-desc-${shown}`}>
              <Terms
                text={`The AI shops on its own as gold comes in, and may add an armor or resist item against the enemy’s damage. The ${def.name} picks an archetype at Rank 4, which can change this list.`}
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
