import { useState } from 'preact/hooks';
import { ShopPanel } from './ShopPanel';
import { keeperPlace, n0 } from './format';
import { RichText } from './richtext';
import { useSession } from './session';
import { upgradeChanges } from './upgrades';

const UNSPENT_GOLD = 800;

function Upgrades() {
  const s = useSession();
  const m = s.match!;
  const id = m.state.playerHeroId!;
  const offer = m.state.upgradeOffers[id] ?? [];
  const p = m.unitById(id)!;
  if (offer.length === 0) {
    return (
      <div class="col">
        <div class="dim">Upgrade chosen for this phase.</div>
        <div class="row wrap">
          {p.hero!.upgrades.map((u) => (
            <span class="chip" key={u}>
              {s.content.upgradeById.get(u)?.name}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const def = s.content.heroById.get(p.defId)!;
  const n = offer.length;
  return (
    <div class="col">
      <div class="dim small upg-hint">
        Choose one tweak to an ability. It lasts the whole match.
      </div>
      <div class="hand" data-count={n}>
        {offer.map((uid, i) => {
          const u = s.content.upgradeById.get(uid)!;
          const ab = def.abilities[u.ability];
          const changes = upgradeChanges(ab, u);
          const mid = (n - 1) / 2;
          return (
            <button
              type="button"
              class="upg-card"
              key={uid}
              data-testid={`upgrade-${uid}`}
              style={{ '--rot': `${(i - mid) * 5}deg`, '--drop': `${Math.abs(i - mid) * 7}px` }}
              onClick={() => s.issue({ type: 'pickUpgrade', upgradeId: uid })}
            >
              <span class="upg-head">
                <i class="upg-num" aria-hidden="true">
                  {u.ability + 1}
                </i>
                <span class="upg-ability">{ab.name}</span>
              </span>
              <span class="upg-name">{u.name}</span>
              <span class="upg-rule" aria-hidden="true" />
              <span class="upg-desc">{u.desc}</span>
              {changes.length > 0 && (
                <span class="upg-changes">
                  {changes.map((c) => (
                    <b key={c}>{c}</b>
                  ))}
                </span>
              )}
              <span class="upg-about">{ab.desc}</span>
              <span class="upg-take">Take this</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Curse() {
  const s = useSession();
  const m = s.match!;
  const id = m.state.playerHeroId!;
  const offer = m.state.curseOffers.find((o) => o.heroId === id && !o.resolved);
  if (!offer) return <div class="dim">No one is offering you anything this time.</div>;
  const item = s.content.cursedById.get(offer.itemId)!;
  return (
    <div class="col">
      <div class="dim small">
        The Keeper found you. You are far behind, and the Keeper makes an offer. Take the gift, or
        refuse it. The exact price stays hidden until you accept, and it never leaves.
      </div>
      <div class="card col" style={{ borderColor: '#7a2a22' }}>
        <b>{item.name}</b>
        <div class="small">
          <RichText text={item.desc} />
        </div>
        <div class="row wrap">
          <span class="chip good">
            Boon: <RichText text={item.boonText} />
          </span>
          <span class="chip bad">Price: a flaw of type {item.flawType}</span>
        </div>
        <div class="row">
          <button
            class="btn primary"
            data-testid="curse-accept"
            onClick={() => s.issue({ type: 'acceptCurse' })}
          >
            Accept the gift
          </button>
          <button
            class="btn"
            data-testid="curse-refuse"
            onClick={() => s.issue({ type: 'refuseCurse' })}
          >
            Refuse
          </button>
        </div>
      </div>
    </div>
  );
}

export function Prep() {
  const s = useSession();
  const m = s.match!;
  const st = m.state;
  const id = st.playerHeroId!;
  const hero = m.unitById(id)!.hero!;
  const upgradePending = (st.upgradeOffers[id]?.length ?? 0) > 0;
  const cursePending = st.curseOffers.some((o) => o.heroId === id && !o.resolved);
  const hasCurse = st.curseOffers.some((o) => o.heroId === id);
  const tabs = [
    { id: 'upgrade', label: 'Upgrade', pending: upgradePending },
    { id: 'shop', label: `Shop · ${n0(hero.gold)}g`, pending: false },
    ...(hasCurse ? [{ id: 'curse', label: "Keeper's offer", pending: cursePending }] : []),
  ] as { id: 'upgrade' | 'shop' | 'curse'; label: string; pending: boolean }[];
  const tab = tabs.some((t) => t.id === s.ui.prepTab) ? s.ui.prepTab : 'upgrade';
  const keeperSpot = keeperPlace(st.keeper.spot);
  const slots = s.content.tuning.shop.slots;
  const [asking, setAsking] = useState(false);
  const start = (): void => {
    const unspent = hero.gold >= UNSPENT_GOLD && hero.items.length < slots;
    if (unspent && !upgradePending && !asking) setAsking(true);
    else s.issue({ type: 'startPhase' });
  };
  return (
    <div class="overlay" data-testid="prep">
      <div class="panel col prep-panel" style={{ width: 'min(1100px,100%)', maxHeight: '100%' }}>
        <div class="row wrap">
          <h2 class="grow">Before phase {st.phase.n}</h2>
          {st.pressure.map((p) => (
            <span class="chip bad" key={p}>
              {s.content.pressure.find((x) => x.id === p)?.name}
            </span>
          ))}
          <span class="chip">Keeper roams near {keeperSpot} next phase</span>
        </div>
        <div class="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              class={`btn ${tab === t.id ? 'on' : ''}`}
              data-testid={`tab-${t.id}`}
              onClick={() => s.setUi({ prepTab: t.id })}
            >
              {t.label}
              {t.pending ? ' •' : ''}
            </button>
          ))}
        </div>
        <div class="scroll prep-scroll">
          {tab === 'upgrade' && <Upgrades />}
          {tab === 'shop' && <ShopPanel />}
          {tab === 'curse' && <Curse />}
        </div>
        <div class="row">
          <div class="grow small" style={{ color: 'var(--bad)' }}>
            {s.ui.toast ?? ''}
          </div>
          {asking && (
            <div class="row wrap unspent" data-testid="unspent-prompt">
              <span>You have {n0(hero.gold)}g unspent. Shop first?</span>
              <button
                class="btn small primary"
                data-testid="unspent-shop"
                onClick={() => {
                  setAsking(false);
                  s.setUi({ prepTab: 'shop' });
                }}
              >
                Shop
              </button>
              <button
                class="btn small"
                data-testid="unspent-start"
                onClick={() => s.issue({ type: 'startPhase' })}
              >
                Start anyway
              </button>
            </div>
          )}
          {!asking && (
            <button class="btn primary" data-testid="start-phase" onClick={start}>
              Start phase {st.phase.n}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
