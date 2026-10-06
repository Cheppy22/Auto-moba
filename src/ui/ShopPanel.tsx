import { n0, keeperPlace } from './format';
import { useSession } from './session';

const CATS = [
  { id: 'blade', label: 'Blade' },
  { id: 'flesh', label: 'Flesh' },
  { id: 'soul', label: 'Soul' },
] as const;

export function ShopPanel() {
  const s = useSession();
  const m = s.match!;
  const entries = m.shopList();
  const p = m.unitById(m.state.playerHeroId!)!;
  const owned = p.hero!.items;
  return (
    <div class="col" data-testid="shop">
      <div class="row">
        <span class="gold">{n0(p.hero!.gold)} gold</span>
        <span class="dim small">
          Slots {owned.length}/{s.content.tuning.shop.slots}
        </span>
        <span class="dim small">Keeper at {keeperPlace(m.state.keeper.spot)}</span>
      </div>
      <div class="row wrap" style={{ gap: '4px' }}>
        {owned.map((id) => {
          const it = s.content.itemById.get(id);
          return (
            <span key={id} class="chip">
              {it?.name ??
                s.content.cursedById.get(id)?.name ??
                s.content.holyById.get(id)?.name ??
                id}
              {it && (
                <button
                  class="btn small"
                  style={{ marginLeft: '6px' }}
                  onClick={() => s.issue({ type: 'sell', itemId: id })}
                >
                  sell
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div class="row wrap" style={{ alignItems: 'flex-start' }}>
        {CATS.map((c) => (
          <div class="col grow" style={{ minWidth: '240px' }} key={c.id}>
            <h3>{c.label}</h3>
            {[1, 2, 3].map((tier) =>
              entries
                .filter((e) => e.category === c.id && e.tier === tier)
                .map((e) => (
                  <div
                    class="card col"
                    key={e.id}
                    style={{ opacity: e.source === 'locked' ? 0.55 : 1 }}
                  >
                    <div class="row">
                      <b class="grow">{e.name}</b>
                      <span class="chip">T{e.tier}</span>
                      {e.source === 'keeper' && <span class="chip gold">Keeper</span>}
                      {e.source === 'locked' && <span class="chip">locked</span>}
                    </div>
                    <div class="dim tiny">{e.desc}</div>
                    <div class="row">
                      <span class="gold small">{n0(e.price)}g</span>
                      {e.consumed.length > 0 && (
                        <span class="tiny dim">combines {e.consumed.length} owned</span>
                      )}
                      <div class="grow" />
                      <button
                        class="btn small"
                        disabled={!e.canBuy}
                        title={e.reason}
                        data-testid={`buy-${e.id}`}
                        onClick={() => s.issue({ type: 'buy', itemId: e.id })}
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                )),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
