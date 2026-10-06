import { useState } from 'preact/hooks';
import { ShopPanel } from './ShopPanel';
import { n0, keeperPlace } from './format';
import { useSession } from './session';

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
  return (
    <div class="col">
      <div class="dim small">Choose one tweak to an ability. It lasts the whole match.</div>
      <div class="hero-grid">
        {offer.map((uid) => {
          const u = s.content.upgradeById.get(uid)!;
          return (
            <div class="card col" key={uid}>
              <b>{u.name}</b>
              <div class="tiny dim">Ability: {def.abilities[u.ability].name}</div>
              <div class="small">{u.desc}</div>
              <button
                class="btn primary"
                data-testid={`upgrade-${uid}`}
                onClick={() => s.issue({ type: 'pickUpgrade', upgradeId: uid })}
              >
                Choose
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Auction() {
  const s = useSession();
  const m = s.match!;
  const a = m.state.auction;
  const p = m.unitById(m.state.playerHeroId!)!;
  const team = p.team as 'A' | 'B';
  const holy = s.content.holyById.get(a.holyId)!;
  const [points, setPoints] = useState(0);
  const [gold, setGold] = useState(0);
  const mine = a.bids[team];
  const teamPoints = m.state.teams[team].points;
  if (a.awaitingRecipient) {
    return (
      <div class="col">
        <h3>Your team won the holy item</h3>
        <div class="card col">
          <b>{holy.name}</b>
          <div class="small">{holy.desc}</div>
        </div>
        <div class="dim small">Choose who carries it.</div>
        <div class="row wrap">
          {m.state.teams[team].heroIds.map((id) => {
            const u = m.unitById(id)!;
            return (
              <button
                class="btn"
                key={id}
                data-testid={`recipient-${id}`}
                onClick={() => s.issue({ type: 'chooseHolyRecipient', heroId: id })}
              >
                {s.content.heroById.get(u.defId)!.name.split(',')[0]} ({u.hero!.role})
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (a.resolved) {
    return (
      <div class="col">
        <div class="card col">
          <b>{holy.name}</b>
          <div class="small">{holy.desc}</div>
          <div class="dim small">
            Won by team {a.winner}. Bids were sealed: yours was {mine.points} points and {mine.gold}{' '}
            gold.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="col">
      <div class="card col">
        <b>The Holy Item</b>
        <div class="small">{holy.hint}</div>
        <div class="dim tiny">
          One holy item is awarded at the start of phase 3 to the highest sealed bid. Bids from
          earlier phases add up. Team points count for {s.content.tuning.auction.pointRate}× gold.
          The losing side gets {Math.round(s.content.tuning.auction.loserRefund * 100)}% of its gold
          back; spent points are gone.
        </div>
      </div>
      <div class="row wrap">
        <span class="chip">
          Team points: <b>{teamPoints}</b>
        </span>
        <span class="chip gold">Your gold: {n0(p.hero!.gold)}</span>
        <span class="chip">
          Your bids so far: {mine.points} pts, {mine.gold}g
        </span>
      </div>
      <div class="row wrap">
        <label class="row small">
          Points
          <input
            type="number"
            min={0}
            max={teamPoints}
            value={points}
            onInput={(e) => setPoints(Number((e.target as HTMLInputElement).value))}
            data-testid="bid-points"
          />
        </label>
        <label class="row small">
          Gold
          <input
            type="number"
            min={0}
            max={p.hero!.gold}
            step={50}
            value={gold}
            onInput={(e) => setGold(Number((e.target as HTMLInputElement).value))}
            data-testid="bid-gold"
          />
        </label>
        <button
          class="btn primary"
          data-testid="bid"
          onClick={() => {
            const r = s.issue({ type: 'bid', points, gold });
            if (r.ok) {
              setPoints(0);
              setGold(0);
            }
          }}
        >
          Place sealed bid
        </button>
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
        <div class="small">{item.desc}</div>
        <div class="row wrap">
          <span class="chip good">Boon: {item.boonText}</span>
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
  const upgradePending = (st.upgradeOffers[id]?.length ?? 0) > 0;
  const cursePending = st.curseOffers.some((o) => o.heroId === id && !o.resolved);
  const hasCurse = st.curseOffers.some((o) => o.heroId === id);
  const auctionVisible = st.phase.n <= 3 || st.auction.awaitingRecipient;
  const auctionPending = st.auction.awaitingRecipient;
  const tabs = [
    { id: 'upgrade', label: 'Upgrade', pending: upgradePending },
    { id: 'shop', label: 'Shop', pending: false },
    ...(auctionVisible ? [{ id: 'auction', label: 'Holy auction', pending: auctionPending }] : []),
    ...(hasCurse ? [{ id: 'curse', label: "Keeper's offer", pending: cursePending }] : []),
  ] as { id: 'upgrade' | 'shop' | 'auction' | 'curse'; label: string; pending: boolean }[];
  const tab = tabs.some((t) => t.id === s.ui.prepTab) ? s.ui.prepTab : 'upgrade';
  const keeperSpot = keeperPlace(st.keeper.spot);
  const stock = st.keeper.stock.map((x) => s.content.itemById.get(x)?.name ?? x);
  return (
    <div class="overlay" data-testid="prep">
      <div class="panel col" style={{ width: 'min(1100px,100%)', maxHeight: '100%' }}>
        <div class="row wrap">
          <h2 class="grow">Before phase {st.phase.n}</h2>
          {st.pressure.map((p) => (
            <span class="chip bad" key={p}>
              {s.content.pressure.find((x) => x.id === p)?.name}
            </span>
          ))}
          <span class="chip">
            Keeper near {keeperSpot}: {stock.join(', ')}
          </span>
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
          {tab === 'auction' && <Auction />}
          {tab === 'curse' && <Curse />}
        </div>
        <div class="row">
          <div class="grow small" style={{ color: 'var(--bad)' }}>
            {s.ui.toast ?? ''}
          </div>
          <button
            class="btn primary"
            data-testid="start-phase"
            onClick={() => s.issue({ type: 'startPhase' })}
          >
            Start phase {st.phase.n}
          </button>
        </div>
      </div>
    </div>
  );
}
