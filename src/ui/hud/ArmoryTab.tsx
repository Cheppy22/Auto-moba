import { useEffect, useState } from 'preact/hooks';
import type { ArmoryTile, ArmoryView } from '../../sim';
import { n0 } from '../format';
import { Term } from '../glossary';
import { ItemIcon } from '../ItemIcon';
import { itemCategory } from '../itemInfo';
import { whitePieces } from '../Orders';
import { PATH_LABEL, PieceGlyph, pieceLabel } from '../pieces';
import { RichText } from '../richtext';
import { useSession } from '../session';

type Session = ReturnType<typeof useSession>;

const CATS = [
  { id: 'mind', label: 'Mind', glyph: '◆' },
  { id: 'body', label: 'Body', glyph: '■' },
  { id: 'soul', label: 'Soul', glyph: '●' },
] as const;

const TIERS = [
  { tier: 1, label: 'Tier 1' },
  { tier: 2, label: 'Tier 2' },
  { tier: 3, label: 'Masterworks' },
] as const;

/** The sim's refusals in plain words. */
const BLOCKED: Record<string, string> = {
  'no free slot': 'Your bag is full. Sell an item to make room.',
  'already owned': 'This piece already has it.',
};

/** Gold in a chip: whole numbers, thousands as 1.2k so five chips fit a phone. */
const chipGold = (g: number): string => (g >= 10000 ? `${(g / 1000).toFixed(1)}k` : n0(g));

function itemInfo(
  s: Session,
  id: string,
): { name: string; desc: string; category: string; cursed: boolean } {
  const it = s.content.itemById.get(id);
  if (it) return { name: it.name, desc: it.desc, category: it.category, cursed: false };
  const c = s.content.cursedById.get(id);
  return {
    name: c?.name ?? id,
    desc: c && 'desc' in c ? String((c as { desc: string }).desc) : '',
    category: itemCategory(s.content, id),
    cursed: true,
  };
}

/** The held item that is built from `id` (so the plan already has it covered), if any. */
function coveredBy(view: ArmoryView, id: string): string | null {
  const byId = new Map(view.tiles.map((t) => [t.id, t]));
  const within = (item: string): boolean =>
    (byId.get(item)?.parts ?? []).some((p) => p === id || within(p));
  return view.items.find(within) ?? null;
}

function Check() {
  return (
    <svg class="ar-tick" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2.2 6.4l2.6 2.6 5-5.6" fill="none" stroke="currentColor" stroke-width="1.8" />
    </svg>
  );
}

/** One item in the grid. */
function Tile(props: { t: ArmoryTile; on: boolean; onPick: () => void }) {
  const { t } = props;
  const poor = !t.owned && !t.affordable && !t.blocked;
  const blocked = !t.owned && !!t.blocked;
  const marks = [
    t.owned ? 'owned' : '',
    t.inPlan ? 'in plan' : '',
    t.suggested ? 'AI suggests' : '',
    poor ? 'not enough gold' : '',
    blocked ? (BLOCKED[t.blocked ?? ''] ?? t.blocked ?? '') : '',
  ].filter(Boolean);
  return (
    <button
      class={`ar-tile cat-${t.category} tier-${t.tier} ${t.owned ? 'owned' : ''} ${t.inPlan ? 'plan' : ''} ${poor ? 'poor' : ''} ${blocked ? 'blocked' : ''} ${props.on ? 'sel' : ''}`}
      data-testid={`armory-tile-${t.id}`}
      aria-pressed={props.on}
      aria-label={`${t.name}, ${t.owned ? 'owned' : `${t.price} gold`}${marks.length ? `, ${marks.join(', ')}` : ''}`}
      onClick={props.onPick}
    >
      <span class="ar-ico">
        <ItemIcon id={t.id} size={22} />
      </span>
      <span class="ar-name">{t.name}</span>
      <span class="ar-price">
        {t.owned ? (
          'Owned'
        ) : (
          <>
            <i class="coin" aria-hidden="true" />
            {n0(t.price)}
          </>
        )}
      </span>
      {t.owned && <Check />}
      {t.suggested && <i class="ar-pip" aria-hidden="true" />}
    </button>
  );
}

/** One of the six bag slots: an item held, a planned item as a ghost, or an empty place. */
function Slot(props: {
  s: Session;
  id: string | null;
  ghost: boolean;
  i: number;
  on: boolean;
  replacing: boolean;
  onPick: () => void;
}) {
  if (!props.id) {
    return (
      <div class="ar-slot empty" data-testid={`armory-slot-${props.i}`} aria-label="Empty slot">
        <span class="ar-name">Empty</span>
      </div>
    );
  }
  const info = itemInfo(props.s, props.id);
  return (
    <button
      class={`ar-slot cat-${info.category} ${props.ghost ? 'ghost' : 'held'} ${info.cursed ? 'cursed' : ''} ${props.on ? 'sel' : ''} ${props.replacing ? 'replacing' : ''}`}
      data-testid={`armory-slot-${props.i}`}
      data-item={props.id}
      data-ghost={props.ghost}
      aria-pressed={props.on}
      aria-label={`${info.name}, ${props.ghost ? 'planned, not bought yet' : info.cursed ? 'cursed, cannot be sold' : 'owned'}`}
      onClick={props.onPick}
    >
      <span class="ar-ico">
        <ItemIcon id={props.id} size={22} />
      </span>
      <span class="ar-name">{info.name}</span>
    </button>
  );
}

/** The detail panel docked above Resume: what the item does, what it costs, and what to do with it. */
function Dock(props: {
  s: Session;
  view: ArmoryView;
  sel: string | null;
  replacing: string | null;
  note: string;
  onBuy: (id: string) => void;
  onSell: (id: string) => void;
  onPlan: (id: string, target: string | null) => void;
  onChange: (id: string | null) => void;
  onPick: (id: string | null) => void;
}) {
  const { s, view, sel } = props;
  if (!sel) {
    const sug = view.suggestion ? view.tiles.find((t) => t.id === view.suggestion) : undefined;
    return (
      <div class="ar-dock idle" data-testid="armory-dock">
        {props.note && (
          <p class="ar-note" role="status">
            {props.note}
          </p>
        )}
        {sug ? (
          <button class="ar-hint" data-testid="armory-hint" onClick={() => props.onPick(sug.id)}>
            <i class="ar-pip" aria-hidden="true" />
            <span>
              <Term id="ai-suggests">AI suggests</Term> <b>{sug.name}</b> for{' '}
              {pieceLabel(s.content, view.piece)}
            </span>
            <span class="ar-price">
              <i class="coin" aria-hidden="true" />
              {n0(sug.price)}
            </span>
          </button>
        ) : (
          <p class="dim small">Tap an item to read it, buy it or add it to the plan.</p>
        )}
      </div>
    );
  }
  const info = itemInfo(s, sel);
  const tile = view.tiles.find((t) => t.id === sel);
  const owned = view.items.includes(sel);
  const ghost = !owned && view.planLeft.includes(sel);
  const refund = view.sellRefund[sel] ?? null;
  const gold = view.gold;
  const target = props.replacing ?? view.planLeft[view.planLeft.length - 1] ?? null;
  const why = !tile
    ? ''
    : owned
      ? ''
      : tile.blocked
        ? (BLOCKED[tile.blocked] ?? tile.blocked)
        : tile.price > gold
          ? `${n0(tile.price - gold)} gold short`
          : '';
  const off = tile && tile.cost - tile.price;
  const covered = owned ? null : coveredBy(view, sel);
  const planBtn = ((): { label: string; disabled: boolean; run: () => void } => {
    if (ghost && props.replacing !== sel)
      return { label: 'Change', disabled: false, run: () => props.onChange(sel) };
    if (ghost) return { label: 'Keep', disabled: false, run: () => props.onChange(null) };
    if (owned) return { label: 'Owned', disabled: true, run: () => undefined };
    if (view.plan.includes(sel)) return { label: 'In plan', disabled: true, run: () => undefined };
    if (covered) return { label: 'Covered', disabled: true, run: () => undefined };
    if (!target) return { label: 'Plan full', disabled: true, run: () => undefined };
    return { label: 'Put in plan', disabled: false, run: () => props.onPlan(sel, target) };
  })();
  return (
    <div
      class={`ar-dock cat-${info.category}`}
      data-testid="armory-dock"
      data-item={sel}
      aria-live="polite"
    >
      <div class="ar-dock-head">
        <span class="ar-ico big">
          <ItemIcon id={sel} size={26} />
        </span>
        <div class="grow">
          <b class="ar-dock-name" data-testid="armory-dock-name">
            {info.name}
          </b>
          <span class="tiny dim">
            {CATS.find((c) => c.id === info.category)?.label ?? ''} ·{' '}
            {!tile ? (
              'Cursed'
            ) : tile.tier === 3 ? (
              <Term id="masterwork">Masterwork</Term>
            ) : (
              `Tier ${tile.tier}`
            )}
          </span>
        </div>
        {!owned && tile && (
          <span class="ar-price big">
            <i class="coin" aria-hidden="true" />
            {n0(tile.price)}
          </span>
        )}
        <button
          class="ar-x"
          data-testid="armory-dock-close"
          aria-label="Close details"
          onClick={() => props.onPick(null)}
        >
          ×
        </button>
      </div>
      <p class="ar-desc small">
        <RichText text={info.desc} />
      </p>
      {tile && tile.parts.length > 0 && (
        <p class="ar-parts tiny">
          <Term id="parts">Built from</Term>{' '}
          {tile.parts.map((pid) => {
            const have = tile.partsOwned.includes(pid);
            return (
              <span key={pid} class={`ar-part ${have ? 'have' : ''}`}>
                {have && <Check />}
                {itemInfo(s, pid).name}
              </span>
            );
          })}
          {off ? <span class="dim"> · {n0(off)} off for parts you own</span> : null}
        </p>
      )}
      {props.replacing && props.replacing === sel && (
        <p class="ar-note" role="status">
          Pick another item below, then Put in plan.
        </p>
      )}
      {props.replacing && props.replacing !== sel && !owned && (
        <p class="ar-note" role="status">
          Put in plan swaps out {itemInfo(s, props.replacing).name}.
        </p>
      )}
      {props.note && (
        <p class="ar-note" role="status">
          {props.note}
        </p>
      )}
      {why && <p class="ar-why tiny">{why}</p>}
      {covered && !ghost && (
        <p class="ar-why tiny">{itemInfo(s, covered).name} is built from it, and you own that.</p>
      )}
      {owned && refund === null && <p class="ar-why tiny">Cursed items cannot be sold.</p>}
      <div class="ar-actions">
        {owned ? (
          <button
            class="btn primary"
            data-testid="armory-sell"
            disabled={refund === null || !view.open}
            onClick={() => props.onSell(sel)}
          >
            {refund === null ? 'Cannot sell' : `Sell · +${n0(refund)}`}
          </button>
        ) : (
          <button
            class="btn primary"
            data-testid="armory-buy"
            disabled={!tile || !tile.affordable}
            onClick={() => props.onBuy(sel)}
          >
            Buy · {tile ? n0(tile.price) : ''}
          </button>
        )}
        {!info.cursed && (
          <button
            class="btn"
            data-testid={ghost ? 'armory-plan-change' : 'armory-plan-put'}
            disabled={planBtn.disabled || !view.open}
            onClick={planBtn.run}
          >
            {planBtn.label}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The Armory tab of the Act break sheet: every White piece can buy and sell any of the 36 items
 * with its own gold, and edit the plan it shops by during the Act. Resume is never locked by it:
 * a piece left alone is shopped by the AI when the next Act starts.
 */
export function ArmoryTab() {
  const s = useSession();
  const m = s.match!;
  const pieces = whitePieces(s);
  const richest = pieces.reduce((a, b) => (b.hero!.gold > a.hero!.gold ? b : a), pieces[0]);
  const pick = pieces.find((u) => u.id === s.ui.armoryPick) ?? richest;
  const [sel, setSel] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // the first piece shown is the one with the most gold, and stays shown while gold moves
  useEffect(() => {
    if (s.ui.armoryPick === null && richest) s.setUi({ armoryPick: richest.id });
  }, [s, richest?.id]);
  // a tile picked behind the docked panel is scrolled back into view
  useEffect(() => {
    if (sel) document.querySelector('.ar-tile.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(''), 3200);
    return () => window.clearTimeout(t);
  }, [note]);
  const view = pick ? m.armoryView(pick.id) : null;
  if (!pick || !view) return null;
  const h = pick.hero!;
  const shownCat = cat ?? (view.suggestion ? itemCategory(s.content, view.suggestion) : 'mind');
  const pickItem = (id: string | null): void => {
    setSel(id);
    setReplacing(null);
    setNote('');
    if (id) setCat(itemCategory(s.content, id) || shownCat);
  };
  const nameOf = (id: string): string => itemInfo(s, id).name;
  const buy = (id: string): void => {
    if (s.issue({ type: 'buy', heroId: pick.id, item: id }).ok) {
      setReplacing(null);
      setNote(`Bought ${nameOf(id)}.`);
    }
  };
  const sell = (id: string): void => {
    if (s.issue({ type: 'sell', heroId: pick.id, item: id }).ok) setNote(`Sold ${nameOf(id)}.`);
  };
  const put = (id: string, target: string | null): void => {
    if (!target) return;
    const plan = view.plan.map((x) => (x === target ? id : x));
    if (s.issue({ type: 'setPlan', heroId: pick.id, plan }).ok) {
      setReplacing(null);
      setNote(`${nameOf(id)} is in the plan.`);
    }
  };
  const resetPlan = (): void => {
    if (s.issue({ type: 'setPlan', heroId: pick.id, plan: null }).ok) {
      setReplacing(null);
      setNote('Plan back to the build path.');
    }
  };
  const aiOne = (): void => {
    if (s.issue({ type: 'autoShop', heroId: pick.id }).ok) {
      setReplacing(null);
      setNote(`The AI shopped for ${pieceLabel(s.content, h.defId)}.`);
    }
  };
  const aiAll = (): void => {
    if (s.issue({ type: 'autoShop', heroId: null }).ok) {
      setReplacing(null);
      setNote('The AI shopped for every piece.');
    }
  };
  const slots: { id: string | null; ghost: boolean }[] = [];
  for (let i = 0; i < view.slots; i++) {
    if (i < view.items.length) slots.push({ id: view.items[i], ghost: false });
    else {
      const g = view.planLeft[i - view.items.length] ?? null;
      slots.push({ id: g, ghost: g !== null });
    }
  }
  const tiles = view.tiles.filter((t) => t.category === shownCat);
  return (
    <div class="ar" data-testid="break-armory" data-open={view.open}>
      <div class="ar-left">
        <div class="ar-strip" role="tablist" aria-label="Pieces">
          {pieces.map((u) => {
            const uh = u.hero!;
            const on = u.id === pick.id;
            return (
              <button
                key={u.id}
                role="tab"
                aria-selected={on}
                class={`ar-chip ${on ? 'on' : ''} ${uh.gold >= 300 ? 'rich' : ''}`}
                data-testid={`armory-piece-${uh.defId}`}
                aria-label={`${pieceLabel(s.content, uh.defId)}, ${n0(uh.gold)} gold, ${uh.items.length} of ${view.slots} items`}
                onClick={() => {
                  s.setUi({ armoryPick: u.id });
                  pickItem(null);
                }}
              >
                <PieceGlyph piece={uh.defId} team="A" size={24} />
                <b class="ar-chip-gold">{chipGold(uh.gold)}</b>
                <span class="ar-chip-n">
                  {uh.items.length}/{view.slots}
                </span>
              </button>
            );
          })}
        </div>
        <div class="ar-who">
          <b class="ar-who-name">{pieceLabel(s.content, h.defId)}</b>
          <span class="dim tiny">{PATH_LABEL[h.path]} path</span>
          <span class="ar-gold" data-testid="armory-gold">
            <i class="coin" aria-hidden="true" />
            {n0(h.gold)}
          </span>
        </div>
        <div class="ar-bag" data-testid="armory-bag">
          {slots.map((sl, i) => (
            <Slot
              key={i}
              s={s}
              i={i}
              id={sl.id}
              ghost={sl.ghost}
              on={!!sl.id && sel === sl.id}
              replacing={!!sl.id && replacing === sl.id}
              onPick={() => sl.id && pickItem(sel === sl.id ? null : sl.id)}
            />
          ))}
        </div>
        <div class="ar-plan" data-testid="armory-plan">
          <span class="small">
            <Term id="slot">Slots</Term> {view.items.length}/{view.slots} ·{' '}
            <Term id="plan">Plan</Term>:{' '}
            <b data-testid="armory-plan-state">
              {view.customPlan ? 'yours' : `${PATH_LABEL[h.path]} build path`}
            </b>
          </span>
          {view.customPlan && (
            <button
              class="btn small ar-reset"
              data-testid="armory-plan-reset"
              disabled={!view.open}
              onClick={resetPlan}
            >
              Reset to build path
            </button>
          )}
        </div>
        <p class="ar-legend tiny dim">
          <span>
            <i class="ar-pip" aria-hidden="true" /> AI suggests
          </span>
          <span>
            <i class="ar-key plan" aria-hidden="true" /> in plan
          </span>
          <span>
            <Check /> owned
          </span>
          <span>
            <i class="ar-key ghost" aria-hidden="true" /> planned, not bought
          </span>
        </p>
        <div class="ar-ai">
          <button
            class="btn small"
            data-testid="armory-ai-one"
            disabled={!view.open}
            onClick={aiOne}
          >
            Let the AI shop
          </button>
          <button
            class="btn small"
            data-testid="armory-ai-all"
            disabled={!view.open}
            onClick={aiAll}
          >
            AI shops for all
          </button>
        </div>
        <p class="ar-foot tiny dim">Untouched pieces shop on their own when you resume.</p>
      </div>
      <div class="ar-right">
        <div class="ar-cats" role="tablist" aria-label="Item kind">
          {CATS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={shownCat === c.id}
              class={`ar-cat cat-${c.id} ${shownCat === c.id ? 'on' : ''}`}
              data-testid={`armory-cat-${c.id}`}
              onClick={() => setCat(c.id)}
            >
              <span aria-hidden="true">{c.glyph}</span> {c.label}
            </button>
          ))}
        </div>
        <div class="ar-grid" data-testid="armory-grid">
          {TIERS.map((tr) => (
            <section class="ar-tier" key={tr.tier} aria-label={tr.label}>
              <h4 class="ar-tier-h">
                {tr.tier === 3 ? <Term id="masterwork">Masterworks</Term> : tr.label}
              </h4>
              <div class="ar-row">
                {tiles
                  .filter((t) => t.tier === tr.tier)
                  .map((t) => (
                    <Tile
                      key={t.id}
                      t={t}
                      on={sel === t.id}
                      onPick={() => {
                        setSel(sel === t.id ? null : t.id);
                        setNote('');
                      }}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <Dock
        s={s}
        view={view}
        sel={sel}
        replacing={replacing}
        note={note}
        onBuy={buy}
        onSell={sell}
        onPlan={put}
        onChange={setReplacing}
        onPick={pickItem}
      />
    </div>
  );
}
