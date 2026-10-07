import { useState } from 'preact/hooks';
import type { ShopEntry } from '../sim';
import { ItemIcon } from './ItemIcon';
import { keeperPlace, n0 } from './format';
import { itemCategory } from './itemInfo';
import { RichText, plainText, splitRule } from './richtext';
import { useSession } from './session';

const BLURB: Record<string, string> = {
  mind: 'Technique and skill with a weapon: melee and physical power, Blade damage and attack speed.',
  body: 'The vessel: health, armor and regeneration.',
  soul: 'The spirit: Soul power, resistance and cooldowns. Power with a price.',
};

const CATS = [
  { id: 'mind', label: 'Mind' },
  { id: 'body', label: 'Body' },
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
  if (cat === 'mind')
    return (
      <svg {...common}>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  if (cat === 'body')
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

function ItemDesc({ desc }: { desc: string }) {
  const { stats, rule } = splitRule(desc);
  return (
    <div data-testid="item-desc" title={plainText(desc)}>
      {stats && (
        <div>
          <RichText text={stats} />
        </div>
      )}
      {rule && (
        <div class="detail-rule">
          <RichText text={rule} />
        </div>
      )}
    </div>
  );
}

const JUNGLE_ONLY = 'sold at the jungle stalls';
const NO_SHOP = 'no shop in reach';

function Tile(props: {
  e: ShopEntry;
  selected: boolean;
  onPick: () => void;
  count: number;
  recommended: boolean;
  dimmed: boolean;
}) {
  const { e } = props;
  const state = e.canBuy ? 'ready' : 'poor';
  return (
    <button
      class={`tile t${e.tier} cat-${e.category} ${state} ${props.selected ? 'sel' : ''} ${
        e.consumed.length ? 'combo' : ''
      } ${props.dimmed ? 'dimmed' : ''} ${props.recommended ? 'rec' : ''}`}
      data-testid={`item-${e.id}`}
      onClick={props.onPick}
      title={e.name}
      aria-label={`${e.name}, tier ${e.tier}, ${n0(e.price)} gold`}
    >
      <span class="tile-tier" aria-hidden="true">
        {'◆'.repeat(e.tier)}
      </span>
      {props.recommended && <span class="tile-rec">Next</span>}
      <span class="tile-icon">
        <ItemIcon id={e.id} size={20} />
        {props.count > 0 && <i class="tile-count">{props.count}</i>}
      </span>
      <span class="tile-name">{e.name}</span>
      <span class="tile-price">{n0(e.price)}</span>
    </button>
  );
}

function Attunement({ cat, owned }: { cat: Cat; owned: number }) {
  const s = useSession();
  const tiers = s.content.tuning.attunement[cat];
  const slots = s.content.tuning.shop.slots;
  const active = [...tiers].reverse().find((t) => owned >= t.count);
  const next = tiers.find((t) => owned < t.count);
  const full = [
    BLURB[cat],
    active ? `${active.title} (${active.count}): ${active.text}` : `Own 2 ${cat} items to attune.`,
    next ? `${next.count - owned} more for ${next.title}: ${next.text}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div class={`attune cat-${cat}`} data-testid="attunement" title={full}>
      <div class="attune-track" aria-label={`${owned} of ${slots} ${cat} items owned`}>
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            class={`attune-pip ${i < owned ? 'on' : ''} ${tiers.some((t) => t.count === i + 1) ? 'mark' : ''}`}
          />
        ))}
      </div>
      <span class="attune-line tiny">
        {active ? (
          <>
            <b>{active.title}</b> {active.text}
          </>
        ) : (
          <span class="dim">Own 2 {cat} items to attune</span>
        )}
        {next && (
          <span class="dim">
            {' '}
            · +{next.count - owned} for {next.title}
          </span>
        )}
      </span>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}

const sentence = (t: string): string => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function ShopPanel({ onClose }: { onClose?: () => void }) {
  const s = useSession();
  const m = s.match!;
  const entries = m.shopList();
  const p = m.unitById(m.state.playerHeroId!)!;
  const owned = p.hero!.items;
  const slots = s.content.tuning.shop.slots;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const recommended = m.recommendedItem();
  const first = recommended ? byId.get(recommended) : undefined;
  const [cat, setCat] = useState<Cat>(first?.category ?? 'mind');
  const [picked, setSel] = useState<{ kind: 'shop' | 'owned'; id: string } | null>(null);
  const sel = picked ?? (first ? { kind: 'shop' as const, id: first.id } : null);
  const [confirming, setConfirming] = useState(false);
  const live = m.state.phase.kind === 'live';
  const tier3 = entries.filter((e) => e.tier === 3);
  const atStall = tier3.some((e) => e.reason !== JUNGLE_ONLY);
  const ownedByCat: Record<string, number> = {};
  for (const id of owned) {
    const c = s.content.itemById.get(id)?.category ?? s.content.cursedById.get(id)?.category;
    if (c) ownedByCat[c] = (ownedByCat[c] ?? 0) + 1;
  }
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

  const sendTo = (shopId: string): void => {
    const queued = p.hero!.suggest.includes(shopId);
    if (s.suggestShop(shopId) && !queued) onClose?.();
  };

  const strip = () => {
    if (selEntry) {
      const def = s.content.itemById.get(selEntry.id)!;
      const builtFrom = def.from;
      const buildsInto = s.content.items.filter((x) => x.from.includes(def.id));
      const saved = selEntry.cost - selEntry.price;
      const needsStall =
        live && !selEntry.canBuy && [JUNGLE_ONLY, NO_SHOP].includes(selEntry.reason);
      return (
        <div class="strip-body" data-testid="item-detail">
          <div class={`strip-top cat-${def.category}`}>
            <span class="detail-icon">
              <ItemIcon id={def.id} size={24} />
            </span>
            <div class="strip-title">
              <div class="detail-name">{def.name}</div>
              <div class="dim tiny strip-meta">
                {def.category} · tier {def.tier}
                {selEntry.source === 'keeper' ? ' · Keeper stock' : ''}
                {selEntry.source === 'jungle' ? ' · jungle stalls only' : ''}
                {selEntry.id === recommended ? ' · recommended' : ''}
                {saved > 0 ? ` · parts worth ${n0(saved)}g used` : ''}
              </div>
            </div>
            {!confirming ? (
              <button
                class="btn primary strip-act"
                disabled={!selEntry.canBuy}
                data-testid="buy"
                onClick={() => setConfirming(true)}
              >
                Buy <span class="strip-price">{n0(selEntry.price)}g</span>
              </button>
            ) : (
              <div class="strip-confirm" data-testid="buy-confirm-box">
                <button
                  class="btn primary"
                  data-testid="buy-confirm"
                  onClick={() => {
                    const r = s.issue({ type: 'buy', itemId: selEntry.id });
                    if (r.ok) pick(null);
                    else setConfirming(false);
                  }}
                >
                  Spend {n0(selEntry.price)}g
                </button>
                <button class="btn" aria-label="Cancel" onClick={() => setConfirming(false)}>
                  <CloseGlyph />
                </button>
              </div>
            )}
          </div>
          <div class="strip-desc">
            <ItemDesc desc={def.desc} />
          </div>
          {!selEntry.canBuy && selEntry.reason && !needsStall && (
            <div class="strip-reason" data-testid="buy-reason">
              {sentence(selEntry.reason)}
            </div>
          )}
          {needsStall && (
            <div class="strip-send">
              {s.content.map.shops.map((shop) => {
                const queued = p.hero!.suggest.includes(shop.id);
                return (
                  <button
                    key={shop.id}
                    class={`btn small ${queued ? 'on' : ''}`}
                    data-testid={`send-${shop.id}`}
                    aria-pressed={queued}
                    onClick={() => sendTo(shop.id)}
                  >
                    {queued ? `Sending you to ${shop.name}` : `Send me to ${shop.name}`}
                  </button>
                );
              })}
            </div>
          )}
          {(builtFrom.length > 0 || buildsInto.length > 0) &&
            (selEntry.canBuy || !selEntry.reason || needsStall) && (
              <div
                class="tiny strip-foot"
                title={`${builtFrom.length ? `Built from ${builtFrom.map(nameOf).join(', ')}. ` : ''}${
                  buildsInto.length
                    ? `Builds into ${buildsInto.map((x) => x.name).join(', ')}.`
                    : ''
                }`}
              >
                {builtFrom.length > 0 && (
                  <span>
                    <span class="dim">Built from </span>
                    {builtFrom.map((id, i) => (
                      <span key={id} class={owned.includes(id) ? 'good' : ''}>
                        {i > 0 ? ', ' : ''}
                        {nameOf(id)}
                        {owned.includes(id) ? ' (owned)' : ''}
                      </span>
                    ))}
                  </span>
                )}
                {buildsInto.length > 0 && (
                  <span>
                    {builtFrom.length > 0 ? ' · ' : ''}
                    <span class="dim">Into </span>
                    {buildsInto.map((x) => x.name).join(', ')}
                  </span>
                )}
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
        <div class="strip-body" data-testid="item-detail">
          <div class={`strip-top cat-${itemCategory(s.content, selOwned)}`}>
            <span class="detail-icon">
              <ItemIcon id={selOwned} size={24} />
            </span>
            <div class="strip-title">
              <div class="detail-name">{nameOf(selOwned)}</div>
              <div class="dim tiny strip-meta">yours</div>
            </div>
            {def &&
              (!confirming ? (
                <button
                  class="btn strip-act"
                  data-testid="sell"
                  onClick={() => setConfirming(true)}
                >
                  Sell <span class="strip-price">{n0(refund)}g</span>
                </button>
              ) : (
                <div class="strip-confirm">
                  <button
                    class="btn primary"
                    data-testid="sell-confirm"
                    onClick={() => {
                      s.issue({ type: 'sell', itemId: selOwned });
                      pick(null);
                    }}
                  >
                    Sell for {n0(refund)}g
                  </button>
                  <button class="btn" aria-label="Cancel" onClick={() => setConfirming(false)}>
                    <CloseGlyph />
                  </button>
                </div>
              ))}
          </div>
          <div class="strip-desc">
            <ItemDesc desc={def?.desc ?? (cursed ? cursed.boonText : holy ? holy.desc : '')} />
          </div>
          {!def && <div class="dim tiny">This cannot be sold.</div>}
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
    <div class="shop" data-testid="shop">
      <div class="shop-head">
        <span class="gold shop-gold" aria-label={`${n0(p.hero!.gold)} gold`}>
          <i class="coin" aria-hidden="true" />
          {n0(p.hero!.gold)}
        </span>
        <div class="slots" aria-label="Your items">
          {Array.from({ length: slots }, (_, i) => {
            const id = owned[i];
            return id ? (
              <button
                key={i}
                class={`slot filled cat-${itemCategory(s.content, id)} ${selOwned === id ? 'sel' : ''}`}
                title={nameOf(id)}
                aria-label={nameOf(id)}
                onClick={() => pick({ kind: 'owned', id })}
              >
                <ItemIcon id={id} size={22} />
              </button>
            ) : (
              <span key={i} class="slot" />
            );
          })}
        </div>
        {onClose && (
          <button class="shop-x" data-testid="shop-close" aria-label="Close shop" onClick={onClose}>
            <CloseGlyph />
          </button>
        )}
      </div>
      <div class="cat-tabs" role="tablist" aria-label="Item category">
        {CATS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            class={`btn cat-${c.id} ${cat === c.id ? 'on' : ''}`}
            data-testid={`cat-${c.id}`}
            onClick={() => {
              setCat(c.id);
              pick(null);
            }}
          >
            <CatGlyph cat={c.id} size={15} />
            <span>{c.label}</span>
            <i class="cat-count" aria-label={`${ownedByCat[c.id] ?? 0} owned`}>
              {ownedByCat[c.id] ?? 0}
            </i>
          </button>
        ))}
      </div>
      <div class="shop-tiles">
        <Attunement cat={cat} owned={ownedByCat[cat] ?? 0} />
        {!p.alive && <span class="chip bad">Down: base items only</span>}
        {(atStall ? [3, 1, 2] : [1, 2, 3]).map((tier) => {
          const list = entries.filter((e) => e.category === cat && e.tier === tier);
          if (list.length === 0) return null;
          const jungleOnly = tier === 3 && !atStall;
          return (
            <div class={`tier-row ${jungleOnly ? 'dimmed' : ''}`} key={tier} data-tier={tier}>
              <div class="tier-label">
                <span aria-hidden="true">{'◆'.repeat(tier)}</span>{' '}
                {tier === 3 && atStall
                  ? 'Tier 3 · sold here'
                  : jungleOnly
                    ? 'Tier 3 · jungle stalls only'
                    : `Tier ${tier}`}
              </div>
              <div class="tiles">
                {list.map((e) => (
                  <Tile
                    key={e.id}
                    e={e}
                    selected={sel?.kind === 'shop' && sel.id === e.id}
                    count={owned.filter((x) => x === e.id).length}
                    recommended={e.id === recommended}
                    dimmed={jungleOnly}
                    onPick={() => pick({ kind: 'shop', id: e.id })}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div class="tiny dim keeper-line">Cheshire Keeper: {keeperPlace(m.state.keeper.spot)}</div>
      </div>
      <aside class="shop-strip" aria-label="Selected item">
        {strip()}
      </aside>
    </div>
  );
}
