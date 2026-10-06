import { useState } from 'preact/hooks';
import type { Unit } from '../sim';
import { SigilIcon } from './SigilIcon';
import { mmss, n0 } from './format';
import { useLayout, type Layout } from './layout';
import { useSession, type Speed } from './session';
import { ShopPanel } from './ShopPanel';

function Roster({ team }: { team: 'A' | 'B' }) {
  const s = useSession();
  const m = s.match!;
  return (
    <div
      class="roster"
      data-testid={team === 'A' ? 'roster' : 'roster-enemy'}
      aria-label={team === 'A' ? 'Your team' : 'Enemy team'}
    >
      {m.state.teams[team].heroIds.map((id) => {
        const u = m.unitById(id)!;
        const def = s.content.heroById.get(u.defId)!;
        const frac = u.alive ? u.hp / u.stats.maxHp : 0;
        return (
          <div
            class={`roster-cell ${u.hero!.isPlayer ? 'me' : ''}`}
            key={id}
            title={`${def.name} · ${u.hero!.kills} kills, ${u.hero!.deaths} deaths`}
          >
            <SigilIcon spec={def.sigil} team={team} size={26} alive={u.alive} />
            <div class="bar">
              <i
                style={{
                  width: `${frac * 100}%`,
                  background: team === 'A' ? 'var(--a)' : 'var(--b)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ u }: { u: Unit }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const def = s.content.heroById.get(u.defId)!;
  const h = u.hero!;
  const itemDef = (id: string) =>
    s.content.itemById.get(id) ?? s.content.cursedById.get(id) ?? s.content.holyById.get(id);
  const dead = !u.alive;
  return (
    <div class="player-card-wrap">
      {open && (
        <div class="panel col card-pop" data-testid="card-details">
          {def.abilities.map((a, i) => (
            <div class="small" key={a.id}>
              <b>
                {i + 1}. {a.name}
              </b>{' '}
              <span class="dim">{a.desc}</span>
            </div>
          ))}
          {h.items.length === 0 && <div class="dim small">No items yet.</div>}
          {h.items.map((id) => {
            const it = itemDef(id);
            return (
              <div class="small" key={id}>
                <b>{it?.name ?? id}</b>{' '}
                <span class="dim">{it && 'desc' in it ? (it as { desc: string }).desc : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      <button
        class="panel player-card"
        data-testid="player-card"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SigilIcon spec={def.sigil} team="A" size={34} alive={u.alive} />
        <div class="player-main">
          <div class="bar" style={{ height: '8px' }}>
            <i style={{ width: `${(u.hp / u.stats.maxHp) * 100}%`, background: 'var(--a)' }} />
          </div>
          <div class="pips">
            {def.abilities.map((a, i) => {
              const total = Math.max(1, a.cooldownSec * 20);
              const ready = h.cd[i] <= 0;
              const frac = ready ? 1 : 1 - h.cd[i] / total;
              return (
                <span
                  key={a.id}
                  class={`pip ${ready ? 'ready' : ''}`}
                  style={{ '--f': `${Math.round(frac * 360)}deg` }}
                  title={`${a.name}: ${a.desc}`}
                >
                  {i + 1}
                </span>
              );
            })}
            {dead && (
              <span class="tiny dim">respawn {mmss((h.respawnAt ?? 0) - s.match!.state.tick)}</span>
            )}
          </div>
        </div>
        <div class="gold player-gold" data-testid="gold">
          {n0(h.gold)}g
        </div>
      </button>
    </div>
  );
}

function SpeedControls() {
  const s = useSession();
  return (
    <div class="seg" role="group" aria-label="Speed">
      {([0, 1, 2, 4] as Speed[]).map((v) => (
        <button
          key={v}
          class={`btn small ${s.ui.speed === v ? 'on' : ''}`}
          data-testid={`speed-${v}`}
          onClick={() => s.setUi({ speed: v })}
        >
          {v === 0 ? 'Pause' : `${v}x`}
        </button>
      ))}
    </div>
  );
}

function Controls({ u }: { u: Unit }) {
  const s = useSession();
  const m = s.match!;
  const nearShop = m.shopList().some((e) => e.canBuy || e.reason !== 'no shop in reach');
  const busy = !u.alive || !!u.hero!.recall;
  const farming = u.hero!.posture === 'farm';
  return (
    <div class="panel controls">
      <button
        class="btn"
        disabled={busy}
        data-testid="recall-base"
        title="Teleport home, then the shop opens"
        onClick={() => s.issue({ type: 'recall', dest: 'base' })}
      >
        Base
      </button>
      <button
        class="btn"
        disabled={busy}
        data-testid="recall-keeper"
        title="Teleport to the Keeper, then the shop opens"
        onClick={() => s.issue({ type: 'recall', dest: 'keeper' })}
      >
        Keeper
      </button>
      <button
        class={`btn ${nearShop ? '' : 'far'}`}
        data-testid="shop-toggle"
        title={nearShop ? 'Open the shop' : 'No shop in reach: browse only'}
        onClick={() => s.setUi({ shopOpen: !s.ui.shopOpen })}
      >
        Shop
      </button>
      <button
        class={`btn ${farming ? 'on' : ''}`}
        data-testid="farm-toggle"
        aria-pressed={farming}
        title="Ask your hero to favor minions and camps (a suggestion, not an order)"
        onClick={() => s.issue({ type: 'setPosture', posture: farming ? 'default' : 'farm' })}
      >
        Farm
      </button>
      {u.hero!.recall && <span class="chip gold recalling">recalling…</span>}
    </div>
  );
}

export function Hud() {
  const s = useSession();
  const layout: Layout = useLayout();
  const m = s.match!;
  const snap = m.snapshot();
  const p = m.state.playerHeroId !== null ? m.unitById(m.state.playerHeroId) : undefined;
  const pressure = snap.pressure.map(
    (id) => s.content.pressure.find((x) => x.id === id)?.name ?? id,
  );
  const score = (
    <div class="panel row hud-score">
      <b data-testid="phase">Phase {m.state.phase.n}</b>
      <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
      <span class="teamA">{snap.points.A}</span>
      <span class="dim">:</span>
      <span class="teamB">{snap.points.B}</span>
    </div>
  );
  const chips = pressure.length > 0 && (
    <div class="row wrap hud-chips">
      {pressure.map((n) => (
        <span class="chip bad" key={n}>
          {n}
        </span>
      ))}
    </div>
  );
  const shop = s.ui.shopOpen && (
    <div class="overlay shop-overlay">
      <div class="panel col" style={{ width: 'min(960px,100%)', maxHeight: '100%' }}>
        <div class="row">
          <h2 class="grow">Shop</h2>
          <span class="dim small">The match is paused while you shop.</span>
          <button class="btn" data-testid="shop-close" onClick={() => s.setUi({ shopOpen: false })}>
            Close
          </button>
        </div>
        <div class="scroll shop-scroll">
          <ShopPanel />
        </div>
      </div>
    </div>
  );
  const toast = s.ui.toast && <div class="toast">{s.ui.toast}</div>;
  const speed = (
    <div class="panel speed-panel">
      <SpeedControls />
    </div>
  );

  if (layout === 'portrait') {
    return (
      <div class="hud-portrait">
        <div class="map-zone">
          <div class="corner tl">
            {score}
            {chips}
          </div>
          <div class="corner tr">{speed}</div>
          <div class="corner bl">
            <Roster team="A" />
          </div>
          <div class="corner br">
            <Roster team="B" />
          </div>
        </div>
        {toast}
        <div class="hud-dock portrait">
          {p && <PlayerCard u={p} />}
          {p && <Controls u={p} />}
        </div>
        {shop}
      </div>
    );
  }
  return (
    <div class={`map-zone full ${layout}`}>
      <div class="corner tl">
        {score}
        <Roster team="A" />
        {chips}
      </div>
      <div class="corner tr">
        {speed}
        <Roster team="B" />
      </div>
      <div class="corner bl">{p && <PlayerCard u={p} />}</div>
      <div class="corner br">{p && <Controls u={p} />}</div>
      {toast}
      {shop}
    </div>
  );
}
