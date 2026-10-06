import type { GameEvent, Posture, Unit } from '../sim';
import { SigilIcon } from './SigilIcon';
import { mmss, n0 } from './format';
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

function Ticker() {
  const s = useSession();
  const m = s.match!;
  const out: { text: string; cls: string; key: number }[] = [];
  const ev = m.events;
  for (let i = ev.length - 1; i >= 0 && out.length < 6; i--) {
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

function Roster() {
  const s = useSession();
  const m = s.match!;
  const rows = (team: 'A' | 'B') =>
    m.state.teams[team].heroIds.map((id) => {
      const u = m.unitById(id)!;
      const def = s.content.heroById.get(u.defId)!;
      return (
        <div class="row" key={id} style={{ gap: '6px' }}>
          <SigilIcon spec={def.sigil} team={team} size={22} alive={u.alive} />
          <div class="grow">
            <div class="tiny" style={{ opacity: u.alive ? 1 : 0.5 }}>
              {def.name.split(',')[0]} <span class="dim">{u.hero!.role}</span>
              {u.hero!.isPlayer ? ' (you)' : ''}
            </div>
            <div class="bar">
              <i
                style={{
                  width: `${(u.alive ? u.hp / u.stats.maxHp : 0) * 100}%`,
                  background: team === 'A' ? 'var(--a)' : 'var(--b)',
                }}
              />
            </div>
          </div>
          <div class="tiny dim">
            {u.hero!.kills}/{u.hero!.deaths}
          </div>
        </div>
      );
    });
  return (
    <div class="hud-side col" style={{ gap: '4px' }}>
      <div class="panel col" style={{ padding: '8px', gap: '4px' }}>
        {rows('A')}
        <div style={{ height: '1px', background: 'var(--border)' }} />
        {rows('B')}
      </div>
    </div>
  );
}

function PlayerCard({ u }: { u: Unit }) {
  const s = useSession();
  const def = s.content.heroById.get(u.defId)!;
  const h = u.hero!;
  return (
    <div
      class="panel col"
      style={{ width: '330px', padding: '10px', gap: '6px' }}
      data-testid="player-card"
    >
      <div class="row">
        <SigilIcon spec={def.sigil} team="A" size={40} alive={u.alive} />
        <div class="grow">
          <div>{def.name}</div>
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
      <div class="row wrap" style={{ gap: '4px' }}>
        {h.items.length === 0 && <span class="dim tiny">No items yet</span>}
        {h.items.map((id) => {
          const it =
            s.content.itemById.get(id) ??
            s.content.cursedById.get(id) ??
            s.content.holyById.get(id);
          const cls = s.content.cursedById.has(id)
            ? 'bad'
            : s.content.holyById.has(id)
              ? 'gold'
              : '';
          return (
            <span
              class={`chip ${cls}`}
              key={id}
              title={'desc' in (it ?? {}) ? (it as { desc: string }).desc : ''}
            >
              {it?.name ?? id}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Hud() {
  const s = useSession();
  const m = s.match!;
  const snap = m.snapshot();
  const p = m.state.playerHeroId !== null ? m.unitById(m.state.playerHeroId) : undefined;
  const setSpeed = (v: Speed) => s.setUi({ speed: v });
  const nearShop = (() => {
    if (!p) return false;
    return m.shopList().some((e) => e.canBuy || e.reason !== 'no shop in reach');
  })();
  const pressure = snap.pressure.map(
    (id) => s.content.pressure.find((x) => x.id === id)?.name ?? id,
  );
  return (
    <>
      <div class="hud-top">
        <div class="panel row" style={{ padding: '6px 12px' }}>
          <b data-testid="phase">Phase {m.state.phase.n}</b>
          <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
          <span class="teamA">{snap.points.A} pts</span>
          <span class="teamB">{snap.points.B} pts</span>
        </div>
        {pressure.map((n) => (
          <span class="chip bad" key={n}>
            {n}
          </span>
        ))}
        <div class="grow" />
        <div class="panel row" style={{ padding: '4px' }}>
          {([0, 1, 2, 4] as Speed[]).map((v) => (
            <button
              key={v}
              class={`btn small ${s.ui.speed === v ? 'on' : ''}`}
              data-testid={`speed-${v}`}
              onClick={() => setSpeed(v)}
            >
              {v === 0 ? 'Pause' : `${v}x`}
            </button>
          ))}
        </div>
      </div>
      <Roster />
      <Ticker />
      {s.ui.toast && <div class="toast">{s.ui.toast}</div>}
      <div class="hud-bottom">
        {p && <PlayerCard u={p} />}
        {p && (
          <div class="panel col" style={{ padding: '10px' }}>
            <div class="row">
              <span class="dim small">Posture</span>
              {POSTURES.map((x) => (
                <button
                  key={x.id}
                  class={`btn ${p.hero!.posture === x.id ? 'on' : ''}`}
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
                onClick={() => s.issue({ type: 'setPosture', posture: 'default' })}
              >
                Default
              </button>
            </div>
            <div class="row">
              <span class="dim small">Recall</span>
              <button
                class="btn"
                disabled={!p.alive || !!p.hero!.recall}
                data-testid="recall-base"
                onClick={() => s.issue({ type: 'recall', dest: 'base' })}
              >
                To base
              </button>
              <button
                class="btn"
                disabled={!p.alive || !!p.hero!.recall}
                data-testid="recall-keeper"
                onClick={() => s.issue({ type: 'recall', dest: 'keeper' })}
              >
                To the Keeper
              </button>
              <button
                class="btn"
                data-testid="shop-toggle"
                onClick={() => s.setUi({ shopOpen: !s.ui.shopOpen })}
              >
                {nearShop ? 'Shop' : 'Shop (not in reach)'}
              </button>
              {p.hero!.recall && <span class="chip gold">recalling…</span>}
            </div>
          </div>
        )}
      </div>
      {s.ui.shopOpen && (
        <div class="overlay" style={{ background: 'rgba(6,7,11,0.6)' }}>
          <div class="panel col" style={{ width: 'min(900px,100%)', maxHeight: '90%' }}>
            <div class="row">
              <h2 class="grow">Shop</h2>
              <button class="btn" onClick={() => s.setUi({ shopOpen: false })}>
                Close
              </button>
            </div>
            <ShopPanel />
          </div>
        </div>
      )}
    </>
  );
}
