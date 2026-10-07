import { useEffect, useRef, useState } from 'preact/hooks';
import type { Unit } from '../sim';
import { HpRing, Icon } from './Ornament';
import { ItemIcon } from './ItemIcon';
import { SigilIcon } from './SigilIcon';
import { mmss, n0 } from './format';
import { itemCategory } from './itemInfo';
import { RichText, plainText } from './richtext';
import { useLayout, type Layout } from './layout';
import { useEscape, useSession, NOTICE_TICKS, type Speed } from './session';
import { ShopPanel } from './ShopPanel';

function Roster({ team }: { team: 'A' | 'B' }) {
  const s = useSession();
  const m = s.match!;
  const narrow = window.innerWidth < 420;
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
            class="roster-cell"
            key={id}
            title={`${def.name} · ${u.hero!.kills} kills, ${u.hero!.deaths} deaths`}
          >
            <HpRing
              size={narrow ? 26 : 34}
              frac={frac}
              color={team === 'A' ? 'var(--a)' : 'var(--b)'}
              alive={u.alive}
              me={u.hero!.isPlayer}
            >
              <SigilIcon spec={def.sigil} team={team} size={narrow ? 18 : 26} alive={u.alive} />
            </HpRing>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ u }: { u: Unit }) {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const next = s.match!.recommendedItem();
  const def = s.content.heroById.get(u.defId)!;
  const h = u.hero!;
  const itemDef = (id: string) =>
    s.content.itemById.get(id) ?? s.content.cursedById.get(id) ?? s.content.holyById.get(id);
  const dead = !u.alive;
  return (
    <div class="player-card-wrap" ref={wrap}>
      {open && (
        <div class="panel col card-pop" data-testid="card-details">
          {def.abilities.map((a, i) => (
            <div class="small pop-line" key={a.id} title={a.desc}>
              <b>
                {i + 1}. {a.name}
              </b>{' '}
              <span class="dim">{a.desc}</span>
            </div>
          ))}
          {h.items.length === 0 && <div class="dim small">No items yet.</div>}
          {h.items.map((id, i) => {
            const it = itemDef(id);
            const desc = it && 'desc' in it ? (it as { desc: string }).desc : '';
            return (
              <div
                class={`small pop-line item cat-${itemCategory(s.content, id)}`}
                key={`${id}:${i}`}
                title={`${it?.name ?? id}: ${plainText(desc)}`}
              >
                <span class="pop-icon">
                  <ItemIcon id={id} size={14} />
                </span>
                <b>{it?.name ?? id}</b>{' '}
                <span class="dim">
                  <RichText text={desc} />
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button
        class="glass player-card"
        data-testid="player-card"
        aria-expanded={open}
        onClick={() => {
          s.flashHalo();
          setOpen(!open);
        }}
      >
        <HpRing
          size={58}
          frac={u.alive ? u.hp / u.stats.maxHp : 0}
          color="var(--a)"
          alive={u.alive}
          me
        >
          <SigilIcon spec={def.sigil} team="A" size={44} alive={u.alive} />
        </HpRing>
        <div class="player-main">
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
          </div>
          <div class="player-sub">
            {dead ? (
              <span class="tiny dim">respawn {mmss((h.respawnAt ?? 0) - s.match!.state.tick)}</span>
            ) : (
              <span class="tiny dim">
                {n0(u.hp)} / {n0(u.stats.maxHp)}
              </span>
            )}
          </div>
        </div>
        <div class="gold player-gold" data-testid="gold">
          <i class="coin" aria-hidden="true" />
          {n0(h.gold)}
          {next && (
            <span
              class={`next-item cat-${itemCategory(s.content, next)}`}
              data-testid="next-item"
              title={`Next: ${itemDef(next)?.name}`}
            >
              <ItemIcon id={next} size={20} />
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function SpeedControls() {
  const s = useSession();
  return (
    <div class="seg" role="group" aria-label="Speed">
      {([0, 1, 2, 4, 8] as Speed[]).map((v) => (
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
    <div class="glass controls">
      <button
        class="act"
        disabled={busy}
        data-testid="recall-base"
        title="Teleport home (3 s), then the shop opens"
        onClick={() => s.issue({ type: 'recall', dest: 'base' })}
      >
        <Icon name="base" />
        <span>Base</span>
      </button>
      <button
        class={`act ${nearShop ? '' : 'far'}`}
        data-testid="shop-toggle"
        title={nearShop ? 'Open the shop' : 'No shop in reach: browse only'}
        onClick={() => s.setUi({ shopOpen: !s.ui.shopOpen })}
      >
        <Icon name="shop" />
        <span>Shop</span>
      </button>
      <button
        class={`act ${u.hero!.autoBuy ? 'on' : ''}`}
        data-testid="autobuy-toggle"
        aria-pressed={u.hero!.autoBuy}
        title="Let your hero buy its build items at base or a stall"
        onClick={() => s.issue({ type: 'setAutoBuy', on: !u.hero!.autoBuy })}
      >
        <Icon name="coin" />
        <span>Auto-buy</span>
      </button>
      {u.hero!.disposition !== 'farmer' && (
        <button
          class={`act ${farming ? 'on' : ''}`}
          data-testid="farm-toggle"
          aria-pressed={farming}
          title="Ask your hero to favor minions and camps (a suggestion, not an order)"
          onClick={() => s.issue({ type: 'setPosture', posture: farming ? 'default' : 'farm' })}
        >
          <Icon name="farm" />
          <span>Farm</span>
        </button>
      )}
      {u.hero!.recall && <span class="ofuda warn recalling">recalling…</span>}
    </div>
  );
}

const PROMPT_MS = 8000;

function EventPrompt() {
  const s = useSession();
  const m = s.match!;
  const seen = useRef(new Set<number>());
  const [shown, setShown] = useState<{ id: number; name: string } | null>(null);
  const live = shown && m.state.events.some((e) => e.id === shown.id);
  useEffect(() => {
    if (shown && !live) setShown(null);
    if (shown) return;
    const ev = m.state.events.find((e) => !seen.current.has(e.id));
    if (!ev) return;
    seen.current.add(ev.id);
    setShown({ id: ev.id, name: s.content.eventById.get(ev.defId)?.name ?? ev.defId });
  });
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), PROMPT_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown || !live) return null;
  return (
    <div class="glass event-prompt" role="alert" data-testid="event-prompt">
      <span>{shown.name} starting: send your hero?</span>
      <button
        class="btn small primary"
        data-testid="event-send"
        onClick={() => {
          s.issue({ type: 'suggestEvent', eventId: shown.id });
          setShown(null);
        }}
      >
        Send
      </button>
      <button class="btn small" data-testid="event-ignore" onClick={() => setShown(null)}>
        Ignore
      </button>
    </div>
  );
}

function CurseNotices() {
  const s = useSession();
  const tick = s.match!.state.tick;
  const list = s.ui.notices.filter((n) => tick >= n.startTick).slice(-3);
  if (list.length === 0) return null;
  const own = list.find((n) => n.own);
  return (
    <>
      {own && <div class="curse-flash" key={own.id} aria-hidden="true" />}
      <div class="curse-notices" role="status" aria-live="polite" data-testid="curse-notices">
        {list.map((n) => (
          <div
            class={`curse-notice ${n.team === 'A' ? 'ally' : 'foe'} ${n.own ? 'own' : ''}`}
            key={n.id}
            style={{ '--life': `${NOTICE_TICKS / 20}s` }}
          >
            <span class="curse-glyph" aria-hidden="true">
              詛
            </span>
            <div>
              <div class="curse-title">
                Cursed: {n.title}
                {n.own ? ' · you' : n.team === 'A' ? ' · ally' : ' · enemy'}
              </div>
              <div class="curse-detail">{n.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </>
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
  const pointsHint = 'Points: kills, towers and objectives. The team with more wins the phase.';
  const score = (
    <div class="clock" data-testid="score">
      <div class="pts-col" title={`Your team's ${pointsHint}`}>
        <b class="pts a">{snap.points.A}</b>
        <span class="pts-label">You</span>
      </div>
      <div class="ofuda">
        <b data-testid="phase">Phase {m.state.phase.n}</b>
        <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
      </div>
      <div class="pts-col" title={`Enemy team's ${pointsHint}`}>
        <b class="pts b">{snap.points.B}</b>
        <span class="pts-label">Foe</span>
      </div>
    </div>
  );
  const announce = snap.events.map((e) => (
    <span
      class={`ofuda ${e.phase === 'warning' ? 'warn' : 'live'}`}
      key={e.id}
      data-testid="event-chip"
    >
      {e.name} · {e.phase === 'warning' ? `in ${Math.ceil(e.ticksLeft / 20)}s` : 'now'}
    </span>
  ));
  const queued = snap.suggest
    .map((id) => s.content.map.shops.find((x) => x.id === id)?.name ?? id)
    .join(' → ');
  const suggestChip = snap.suggest.length > 0 && (
    <div class="ofuda suggest" data-testid="suggest-chip">
      <span>Suggested: {queued}</span>
      <button
        class="suggest-x"
        aria-label="Clear suggestions"
        onClick={() => s.issue({ type: 'clearSuggest' })}
      >
        ×
      </button>
    </div>
  );
  const chips = (pressure.length > 0 || announce.length > 0) && (
    <div class="row wrap hud-chips">
      {pressure.map((n) => (
        <span class="chip bad" key={n}>
          {n}
        </span>
      ))}
      {announce}
    </div>
  );
  useEscape(s.ui.shopOpen, () => s.setUi({ shopOpen: false }));
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
  const toast = (s.ui.toast || s.ui.info) && (
    <div class={`toast ${s.ui.toast ? '' : 'info'}`}>{s.ui.toast ?? s.ui.info}</div>
  );
  const speed = (
    <div class="glass speed-panel">
      <SpeedControls />
    </div>
  );

  if (layout === 'portrait') {
    return (
      <div class="hud-portrait">
        <div class="map-zone">
          <div class="corner tl">
            {score}
            {suggestChip}
            {chips}
          </div>
          <div class="corner tr">{speed}</div>
          <div class="corner bl">
            <Roster team="A" />
          </div>
          <div class="corner br">
            <Roster team="B" />
          </div>
          <CurseNotices />
          <EventPrompt />
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
        {suggestChip}
        {chips}
      </div>
      <div class="corner tr">
        {speed}
        <Roster team="B" />
      </div>
      <CurseNotices />
      <EventPrompt />
      <div class="corner bl">{p && <PlayerCard u={p} />}</div>
      <div class="corner br">{p && <Controls u={p} />}</div>
      {toast}
      {shop}
    </div>
  );
}
