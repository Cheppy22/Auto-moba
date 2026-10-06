import { useState } from 'preact/hooks';
import type { GameEvent, Posture, Unit } from '../sim';
import { SigilIcon } from './SigilIcon';
import { mmss, n0, roleLabel } from './format';
import { useLayout, type Layout } from './layout';
import { useSession, type Session, type Speed } from './session';
import { ShopPanel } from './ShopPanel';

const POSTURES: { id: Posture; label: string; hint: string }[] = [
  {
    id: 'push',
    label: 'Push',
    hint: 'Favor towers and lane pressure (a suggestion, not an order)',
  },
  {
    id: 'farm',
    label: 'Farm',
    hint: 'Favor minions and jungle camps (a suggestion, not an order)',
  },
  {
    id: 'defend',
    label: 'Defend',
    hint: 'Favor protecting structures (a suggestion, not an order)',
  },
];

function heroName(s: Session, id: number): string {
  const u = s.match!.unitById(id);
  return u ? (s.content.heroById.get(u.defId)?.name ?? u.defId) : `#${id}`;
}

function describe(s: Session, e: GameEvent): { text: string; cls: string } | null {
  switch (e.type) {
    case 'death': {
      if (e.payload.kind !== 'hero') return null;
      const k = e.payload.killerKind;
      const by =
        k === 'hero'
          ? heroName(s, e.payload.killer)
          : k === 'none'
            ? ''
            : k === 'camp'
              ? 'a camp monster'
              : `a ${k}`;
      return {
        text: `${heroName(s, e.payload.id)} fell${by ? ` to ${by}` : ''}`,
        cls: e.payload.team === 'A' ? 'teamA' : 'teamB',
      };
    }
    case 'structureDown':
      return {
        text: `A ${e.payload.kind} of team ${e.payload.team} fell`,
        cls: 'gold',
      };
    case 'obeliskClaimed':
      return {
        text: `Team ${e.payload.team} claimed an obelisk (${e.payload.reward})`,
        cls: 'gold',
      };
    case 'pressure':
      return { text: `Pressure: ${e.payload.name}`, cls: 'teamB' };
    case 'curseAccepted':
      return { text: `${heroName(s, e.payload.hero)} accepted a curse`, cls: 'teamB' };
    case 'biomeOpen':
      return {
        text: `A new place opens: ${s.content.biomeById.get(e.payload.biome)?.name ?? ''}`,
        cls: 'dim',
      };
    default:
      return null;
  }
}

function Ticker({ lines = 6 }: { lines?: number }) {
  const s = useSession();
  const m = s.match!;
  const out: { text: string; cls: string; key: number }[] = [];
  const ev = m.events;
  for (let i = ev.length - 1; i >= 0 && out.length < lines; i--) {
    const d = describe(s, ev[i]);
    if (d) out.push({ ...d, key: ev[i].seq });
  }
  return (
    <div class="ticker">
      {out.map((o) => (
        <div key={o.key} class={o.cls}>
          {o.text}
        </div>
      ))}
    </div>
  );
}

function Roster({ team, dir }: { team: 'A' | 'B'; dir: 'row' | 'col' }) {
  const s = useSession();
  const m = s.match!;
  return (
    <div
      class={`roster ${dir} panel`}
      data-testid={team === 'A' ? 'roster' : 'roster-enemy'}
      aria-label={team === 'A' ? 'Your team' : 'Enemy team'}
    >
      {m.state.teams[team].heroIds.map((id) => {
        const u = m.unitById(id)!;
        const def = s.content.heroById.get(u.defId)!;
        return (
          <div
            class={`roster-cell ${u.hero!.isPlayer ? 'me' : ''}`}
            key={id}
            title={`${def.name} (${roleLabel(u.hero!.role)}) ${u.hero!.kills}/${u.hero!.deaths}`}
          >
            <SigilIcon
              spec={def.sigil}
              team={team}
              size={dir === 'col' ? 20 : 26}
              alive={u.alive}
            />
            <div class="bar">
              <i
                style={{
                  width: `${(u.alive ? u.hp / u.stats.maxHp : 0) * 100}%`,
                  background: team === 'A' ? 'var(--a)' : 'var(--b)',
                }}
              />
            </div>
            {dir === 'row' && (
              <div class="tiny dim">
                {u.hero!.kills}/{u.hero!.deaths}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ u, layout }: { u: Unit; layout: Layout }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const def = s.content.heroById.get(u.defId)!;
  const h = u.hero!;
  const compact = layout !== 'desktop';
  const itemDef = (id: string) =>
    s.content.itemById.get(id) ?? s.content.cursedById.get(id) ?? s.content.holyById.get(id);
  return (
    <div
      class="panel col player-card"
      style={{ width: compact ? '100%' : '330px', padding: compact ? '8px' : '10px', gap: '6px' }}
      data-testid="player-card"
      onClick={() => compact && setOpen(!open)}
    >
      <div class="row">
        <SigilIcon spec={def.sigil} team="A" size={compact ? 32 : 40} alive={u.alive} />
        <div class="grow">
          <div class={compact ? 'small' : ''}>{compact ? def.name.split(',')[0] : def.name}</div>
          <div class="bar" style={{ height: '9px' }}>
            <i style={{ width: `${(u.hp / u.stats.maxHp) * 100}%`, background: 'var(--a)' }} />
          </div>
          <div class="tiny dim">
            {n0(u.hp)} / {n0(u.stats.maxHp)} hp{' '}
            {u.alive ? '' : `· respawn ${mmss((h.respawnAt ?? 0) - s.match!.state.tick)}`}
          </div>
        </div>
        <div class="gold" data-testid="gold">
          {n0(h.gold)}g
        </div>
      </div>
      <div class="row wrap" style={{ gap: '4px' }}>
        {def.abilities.map((a, i) => (
          <span class={`chip ${h.cd[i] > 0 ? 'dim' : 'good'}`} key={a.id} title={a.desc}>
            {a.name.split(' ')[0]} {h.cd[i] > 0 ? (h.cd[i] / 20).toFixed(0) : 'ready'}
          </span>
        ))}
      </div>
      <div class="row wrap" style={{ gap: '4px', display: compact ? 'none' : undefined }}>
        {h.items.length === 0 && <span class="dim tiny">No items yet</span>}
        {h.items.map((id) => {
          const cls = s.content.cursedById.has(id)
            ? 'bad'
            : s.content.holyById.has(id)
              ? 'gold'
              : '';
          const it = itemDef(id);
          return (
            <span
              class={`chip ${cls}`}
              key={id}
              title={it && 'desc' in it ? (it as { desc: string }).desc : ''}
            >
              {it?.name ?? id}
            </span>
          );
        })}
      </div>
      {compact && open && (
        <div class="col" style={{ gap: '3px' }} data-testid="card-details">
          {def.abilities.map((a) => (
            <div class="tiny" key={a.id}>
              <b>{a.name}</b> <span class="dim">{a.desc}</span>
            </div>
          ))}
          {h.items.map((id) => {
            const it = itemDef(id);
            return (
              <div class="tiny" key={id}>
                <b>{it?.name ?? id}</b>{' '}
                <span class="dim">{it && 'desc' in it ? (it as { desc: string }).desc : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      {compact && (
        <div class="tiny dim">
          {h.items.length} item{h.items.length === 1 ? '' : 's'} · tap for details
        </div>
      )}
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

function Controls({ u, layout }: { u: Unit; layout: Layout }) {
  const s = useSession();
  const m = s.match!;
  const compact = layout !== 'desktop';
  const nearShop = m.shopList().some((e) => e.canBuy || e.reason !== 'no shop in reach');
  const cur = POSTURES.find((x) => x.id === u.hero!.posture);
  const busy = !u.alive || !!u.hero!.recall;
  return (
    <div class={`panel col controls ${compact ? 'compact' : ''}`} style={{ padding: '10px' }}>
      <div class="row ctl-row">
        {!compact && <span class="dim small">Posture</span>}
        {POSTURES.map((x) => (
          <button
            key={x.id}
            class={`btn grow ${u.hero!.posture === x.id ? 'on' : ''}`}
            title={x.hint}
            data-testid={`posture-${x.id}`}
            onClick={() => s.issue({ type: 'setPosture', posture: x.id })}
          >
            {x.label}
          </button>
        ))}
        <button
          class="btn small"
          title="Back to this hero's own default posture"
          data-testid="posture-default"
          onClick={() => s.issue({ type: 'setPosture', posture: 'default' })}
        >
          Default
        </button>
      </div>
      {compact && (
        <div class="tiny dim" data-testid="posture-hint">
          {cur ? cur.hint : "This hero's own default posture (a suggestion, not an order)"}
        </div>
      )}
      <div class="row ctl-row">
        {!compact && <span class="dim small">Recall</span>}
        <button
          class="btn grow"
          disabled={busy}
          data-testid="recall-base"
          onClick={() => s.issue({ type: 'recall', dest: 'base' })}
        >
          To base
        </button>
        <button
          class="btn grow"
          disabled={busy}
          data-testid="recall-keeper"
          onClick={() => s.issue({ type: 'recall', dest: 'keeper' })}
        >
          To the Keeper
        </button>
        <button
          class="btn grow"
          data-testid="shop-toggle"
          onClick={() => s.setUi({ shopOpen: !s.ui.shopOpen })}
        >
          {nearShop ? 'Shop' : compact ? 'Shop (far)' : 'Shop (not in reach)'}
        </button>
        {u.hero!.recall && <span class="chip gold">recalling…</span>}
      </div>
    </div>
  );
}

export function Hud() {
  const s = useSession();
  const layout = useLayout();
  const m = s.match!;
  const snap = m.snapshot();
  const p = m.state.playerHeroId !== null ? m.unitById(m.state.playerHeroId) : undefined;
  const pressure = snap.pressure.map(
    (id) => s.content.pressure.find((x) => x.id === id)?.name ?? id,
  );
  const score = (
    <div class="panel row hud-score" style={{ padding: '6px 12px' }}>
      <b data-testid="phase">Phase {m.state.phase.n}</b>
      <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
      <span class="teamA">{snap.points.A} pts</span>
      <span class="teamB">{snap.points.B} pts</span>
    </div>
  );
  const chips = pressure.map((n) => (
    <span class="chip bad" key={n}>
      {n}
    </span>
  ));
  const shop = s.ui.shopOpen && (
    <div class="overlay" style={{ background: 'rgba(6,7,11,0.6)' }}>
      <div class="panel col" style={{ width: 'min(900px,100%)', maxHeight: '100%' }}>
        <div class="row">
          <h2 class="grow">Shop</h2>
          <button class="btn" onClick={() => s.setUi({ shopOpen: false })}>
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
  const status = (
    <>
      {score}
      {chips.length > 0 && <div class="row wrap hud-chips">{chips}</div>}
    </>
  );

  if (layout === 'portrait') {
    return (
      <div class="hud-portrait">
        <div class="map-zone">
          <div class="corner tl">{status}</div>
          <div class="corner tr">{speed}</div>
          <div class="corner bl">
            <Roster team="A" dir="col" />
          </div>
          <div class="corner br">
            <Roster team="B" dir="col" />
          </div>
        </div>
        {toast}
        <div class="hud-dock portrait">
          {p && <PlayerCard u={p} layout={layout} />}
          {p && <Controls u={p} layout={layout} />}
        </div>
        {shop}
      </div>
    );
  }
  return (
    <div class={`map-zone full ${layout}`}>
      <div class="corner tl">
        {status}
        <Roster team="A" dir="row" />
        {layout === 'desktop' && <Ticker lines={4} />}
      </div>
      <div class="corner tr">
        {speed}
        <Roster team="B" dir="row" />
      </div>
      <div class="corner bl">{p && <PlayerCard u={p} layout={layout} />}</div>
      <div class="corner br">{p && <Controls u={p} layout={layout} />}</div>
      {toast}
      {shop}
    </div>
  );
}
