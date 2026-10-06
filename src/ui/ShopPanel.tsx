import { useState } from 'preact/hooks';
import type { ShopEntry } from '../sim';
import { keeperPlace, n0 } from './format';
import { useSession } from './session';

const CATS = [
  { id: 'blade', label: 'Blade' },
  { id: 'flesh', label: 'Flesh' },
  { id: 'soul', label: 'Soul' },
] as const;
type Cat = (typeof CATS)[number]['id'];

function CatGlyph({ cat, size = 18 }: { cat: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
  if (cat === 'blade')
    return (
      <svg {...common}>
        <path d="M5 19L17 7l2-4-4 2L3 17z" />
        <path d="M14 12l-2 2M7 20l-3 1 1-3" />
      </svg>
    );
  if (cat === 'flesh')
    return (
      <svg {...common}>
        <path d="M12 21C6 16 3 12.5 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3.5-3 7-9 12z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2.5-5 .3 1.5 1 2.5 2 3 .3-3 .2-5 1.5-8z" />
    </svg>
  );
}

function Tile(props: { e: ShopEntry; selected: boolean; onPick: () => void; count: number }) {
  const { e } = props;
  const state = e.source === 'locked' ? 'locked' : e.canBuy ? 'ready' : 'poor';
  return (
    <button
      class={`tile cat-${e.category} ${state} ${props.selected ? 'sel' : ''} ${
        e.consumed.length ? 'combo' : ''
      }`}
      data-testid={`item-${e.id}`}
      onClick={props.onPick}
      title={e.name}
    >
      <span class="tile-icon">
        <CatGlyph cat={e.category} />
        {props.count > 0 && <i class="tile-count">{props.count}</i>}
      </span>
      <span class="tile-name">{e.name}</span>
      <span class="tile-price">{n0(e.price)}g</span>
    </button>
  );
}

export function ShopPanel() {
  const s = useSession();
  const m = s.match!;
  const entries = m.shopList();
  const p = m.unitById(m.state.playerHeroId!)!;
  const owned = p.hero!.items;
  const slots = s.content.tuning.shop.slots;
  const [cat, setCat] = useState<Cat>('blade');
  const [sel, setSel] = useState<{ kind: 'shop' | 'owned'; id: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const nameOf = (id: string): string =>
    s.content.itemById.get(id)?.name ??
    s.content.cursedById.get(id)?.name ??
    s.content.holyById.get(id)?.name ??
    id;
  const pick = (next: { kind: 'shop' | 'owned'; id: string } | null): void => {
    setSel(next);
    setConfirming(false);
  };

  const selEntry = sel?.kind === 'shop' ? byId.get(sel.id) : undefined;
  const selOwned = sel?.kind === 'owned' ? sel.id : null;

  const detail = () => {
    if (selEntry) {
      const def = s.content.itemById.get(selEntry.id)!;
      const builtFrom = def.from;
      const buildsInto = s.content.items.filter((x) => x.from.includes(def.id));
      const saved = selEntry.cost - selEntry.price;
      return (
        <div class="col detail-body" data-testid="item-detail">
          <div class="row">
            <span class={`detail-icon cat-${def.category}`}>
              <CatGlyph cat={def.category} size={22} />
            </span>
            <div class="grow">
              <div class="detail-name">{def.name}</div>
              <div class="dim tiny">
                {def.category} · tier {def.tier}
                {selEntry.source === 'keeper' ? ' · Keeper stock' : ''}
                {selEntry.source === 'locked' ? ' · locked' : ''}
              </div>
            </div>
          </div>
          <div>{def.desc}</div>
          {builtFrom.length > 0 && (
            <div class="tiny">
              <span class="dim">Built from </span>
              {builtFrom.map((id, i) => (
                <span key={id} class={owned.includes(id) ? 'good' : ''}>
                  {i > 0 ? ', ' : ''}
                  {nameOf(id)}
                  {owned.includes(id) ? ' (owned)' : ''}
                </span>
              ))}
            </div>
          )}
          {buildsInto.length > 0 && (
            <div class="tiny">
              <span class="dim">Builds into </span>
              {buildsInto.map((x) => x.name).join(', ')}
            </div>
          )}
          <div class="row">
            <span class="gold">{n0(selEntry.price)}g</span>
            {saved > 0 && <span class="dim tiny">(components worth {n0(saved)}g used)</span>}
          </div>
          {!confirming ? (
            <button
              class="btn primary"
              disabled={!selEntry.canBuy}
              data-testid="buy"
              onClick={() => setConfirming(true)}
            >
              {selEntry.canBuy ? 'Buy' : selEntry.reason || 'Unavailable'}
            </button>
          ) : (
            <div class="col confirm" data-testid="buy-confirm-box">
              <div>
                Spend <b class="gold">{n0(selEntry.price)}g</b> on {def.name}?
              </div>
              <div class="row">
                <button
                  class="btn primary grow"
                  data-testid="buy-confirm"
                  onClick={() => {
                    const r = s.issue({ type: 'buy', itemId: selEntry.id });
                    if (r.ok) pick(null);
                    else setConfirming(false);
                  }}
                >
                  Confirm
                </button>
                <button class="btn grow" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (selOwned) {
      const def = s.content.itemById.get(selOwned);
      const cursed = s.content.cursedById.get(selOwned);
      const holy = s.content.holyById.get(selOwned);
      const refund = def ? Math.round(def.cost * s.content.tuning.shop.sellRefund) : 0;
      return (
        <div class="col detail-body" data-testid="item-detail">
          <div class="detail-name">{nameOf(selOwned)}</div>
          <div>{def?.desc ?? (cursed ? cursed.boonText : holy ? holy.desc : '')}</div>
          {def ? (
            !confirming ? (
              <button class="btn" data-testid="sell" onClick={() => setConfirming(true)}>
                Sell for {n0(refund)}g
              </button>
            ) : (
              <div class="col confirm">
                <div>
                  Sell {def.name} for <b class="gold">{n0(refund)}g</b>?
                </div>
                <div class="row">
                  <button
                    class="btn primary grow"
                    data-testid="sell-confirm"
                    onClick={() => {
                      s.issue({ type: 'sell', itemId: selOwned });
                      pick(null);
                    }}
                  >
                    Confirm
                  </button>
                  <button class="btn grow" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <div class="dim tiny">This cannot be sold.</div>
          )}
        </div>
      );
    }
    return (
      <div class="dim detail-empty" data-testid="item-detail-empty">
        Select an item to read what it does.
      </div>
    );
  };

  return (
    <div class="col shop" data-testid="shop">
      <div class="row wrap shop-top">
        <span class="gold">{n0(p.hero!.gold)} gold</span>
        <div class="slots" aria-label="Your items">
          {Array.from({ length: slots }, (_, i) => {
            const id = owned[i];
            return id ? (
              <button
                key={i}
                class={`slot filled ${selOwned === id ? 'sel' : ''}`}
                title={nameOf(id)}
                onClick={() => pick({ kind: 'owned', id })}
              >
                {nameOf(id)
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)}
              </button>
            ) : (
              <span key={i} class="slot" />
            );
          })}
        </div>
        <span class="dim small grow" style={{ textAlign: 'right' }}>
          Keeper: {keeperPlace(m.state.keeper.spot)}
        </span>
      </div>
      <div class="shop-body">
        <div class="col shop-main">
          <div class="cat-tabs">
            {CATS.map((c) => (
              <button
                key={c.id}
                class={`btn cat-${c.id} ${cat === c.id ? 'on' : ''}`}
                data-testid={`cat-${c.id}`}
                onClick={() => {
                  setCat(c.id);
                  pick(null);
                }}
              >
                <CatGlyph cat={c.id} size={16} /> {c.label}
              </button>
            ))}
          </div>
          {[1, 2, 3].map((tier) => {
            const list = entries.filter((e) => e.category === cat && e.tier === tier);
            if (list.length === 0) return null;
            return (
              <div class="tier-row" key={tier}>
                <div class="tier-label">Tier {tier}</div>
                <div class="tiles">
                  {list.map((e) => (
                    <Tile
                      key={e.id}
                      e={e}
                      selected={sel?.kind === 'shop' && sel.id === e.id}
                      count={owned.filter((x) => x === e.id).length}
                      onPick={() => pick({ kind: 'shop', id: e.id })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <aside class="panel shop-detail">{detail()}</aside>
      </div>
    </div>
  );
}
