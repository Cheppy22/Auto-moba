import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { mostTakenType, type Fight, type HeroModel, type Report } from '../../analysis';
import { drawReplay, replayHit, teamColor, type ReplayData } from '../../render';
import { SigilIcon } from '../SigilIcon';
import { mmss, n0, pct, roleLabel } from '../format';
import { useSession } from '../session';
import { BarRow, Sparkline, heroName, itemName } from './common';

function ReplayPanel(props: {
  h: HeroModel;
  report: Report;
  biomes: { tick: number; slot: string; biome: string }[];
}) {
  const s = useSession();
  const { h, report } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(report.fromTick);
  const [playing, setPlaying] = useState(false);
  const [fightId, setFightId] = useState<number | null>(null);
  const fights = useMemo(
    () => report.fights.filter((f) => f.participants.includes(h.id)),
    [report, h.id],
  );
  const data: ReplayData = useMemo(
    () => ({
      team: h.team,
      path: h.path,
      fights: fights.map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y,
        startTick: f.startTick,
        endTick: f.endTick,
      })),
      purchases: h.purchases.map((p) => ({ tick: p.tick, label: itemName(s.content, p.item) })),
      deaths: h.deathRecords.map((d) => ({ tick: d.tick, x: d.x, y: d.y })),
      recalls: h.recalls
        .filter((r) => r.stage === 'start')
        .map((r) => ({ tick: r.tick, dest: r.dest })),
      slots: s.content.map.slots.map((sl) => ({
        id: sl.id,
        biomeId:
          props.biomes.find((b) => b.slot === sl.id && b.tick <= report.toTick)?.biome ?? null,
      })),
      selectedFight: fightId,
    }),
    [h, fights, fightId, report.toTick, props.biomes, s.content],
  );
  useEffect(() => {
    setTick(report.fromTick);
    setFightId(null);
    setPlaying(false);
  }, [h.id, report.fromTick, report.toTick]);
  useEffect(() => {
    if (canvas.current) drawReplay(canvas.current, s.content, data, tick);
  }, [data, tick, s.content]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = now - last;
      last = now;
      setTick((t) => {
        const next = t + (dt / 1000) * 20 * 12;
        if (next >= report.toTick) {
          setPlaying(false);
          return report.toTick;
        }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, report.toTick]);

  const span = Math.max(1, report.toTick - report.fromTick);
  const at = (t: number): string => `${((t - report.fromTick) / span) * 100}%`;
  const selected: Fight | undefined = fights.find((f) => f.id === fightId);
  return (
    <div class="col" data-testid="replay">
      <div class="row">
        <h3 class="grow">Path through the match</h3>
        <button class="btn small" onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <span class="tiny dim">{mmss(tick)}</span>
      </div>
      <canvas
        ref={canvas}
        style={{
          width: '100%',
          aspectRatio: '1',
          maxHeight: '440px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          const id = replayHit(e.currentTarget, s.content, data, e.clientX, e.clientY);
          setFightId(id);
          if (id !== null) {
            const f = fights.find((x) => x.id === id);
            if (f) setTick(f.startTick);
          }
        }}
      />
      <input
        type="range"
        min={report.fromTick}
        max={report.toTick}
        value={tick}
        onInput={(e) => {
          setPlaying(false);
          setTick(Number((e.target as HTMLInputElement).value));
        }}
        data-testid="scrub"
      />
      <div class="timeline" title="fights, purchases, deaths">
        {fights.map((f) => (
          <div
            key={`f${f.id}`}
            class="mark"
            style={{
              left: at(f.startTick),
              width: `max(8px, ${((f.endTick - f.startTick) / span) * 100}%)`,
              background: fightId === f.id ? '#ffffff' : 'rgba(224,169,62,0.7)',
              top: '4px',
              bottom: '18px',
            }}
            onClick={() => {
              setFightId(f.id);
              setTick(f.startTick);
            }}
          />
        ))}
        {h.purchases.map((p, i) => (
          <div
            key={`p${i}`}
            class="mark"
            title={`${mmss(p.tick)} bought ${itemName(s.content, p.item)}`}
            style={{
              left: at(p.tick),
              width: '6px',
              background: 'var(--gold)',
              top: '20px',
              bottom: '3px',
            }}
            onClick={() => setTick(p.tick)}
          />
        ))}
        {h.deathRecords.map((d, i) => (
          <div
            key={`d${i}`}
            class="mark"
            title={`${mmss(d.tick)} fell`}
            style={{
              left: at(d.tick),
              width: '6px',
              background: 'var(--bad)',
              top: '20px',
              bottom: '3px',
            }}
            onClick={() => setTick(d.tick)}
          />
        ))}
      </div>
      <div class="row wrap tiny dim">
        <span>
          <span style={{ color: 'rgba(255,170,90,0.9)' }}>■</span> fights
        </span>
        <span>
          <span class="gold">■</span> purchases
        </span>
        <span>
          <span style={{ color: 'var(--bad)' }}>✕</span> falls
        </span>
        <span>
          <span style={{ color: 'var(--accent)' }}>◯</span> recalls
        </span>
      </div>
      {selected ? (
        <div class="card col" data-testid="fight-detail">
          <b class="small">
            Fight at {mmss(selected.startTick)} to {mmss(selected.endTick)}
          </b>
          <div class="tiny">
            Damage: <span class="teamA">{n0(selected.damageA)}</span> from your team,{' '}
            <span class="teamB">{n0(selected.damageB)}</span> from the enemy. Heroes fallen:{' '}
            <span class="teamA">{selected.deathsA}</span> of yours,{' '}
            <span class="teamB">{selected.deathsB}</span> of theirs.
          </div>
          <table class="stats">
            <thead>
              <tr>
                <th>Hero</th>
                <th>Dealt</th>
                <th>Taken</th>
              </tr>
            </thead>
            <tbody>
              {selected.participants.map((id) => {
                const p = report.heroes.find((x) => x.id === id)!;
                const d = selected.damage[id] ?? { dealt: 0, taken: 0 };
                return (
                  <tr key={id} style={{ fontWeight: id === h.id ? 700 : 400 }}>
                    <td class={p.team === 'A' ? 'teamA' : 'teamB'}>{heroName(s.content, p.def)}</td>
                    <td>{n0(d.dealt)}</td>
                    <td>{n0(d.taken)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selected.deaths.length > 0 && (
            <div class="tiny dim">
              Falls:{' '}
              {selected.deaths
                .map(
                  (d) =>
                    `${heroName(s.content, report.heroes.find((x) => x.id === d.id)?.def ?? '')} at ${mmss(d.tick)}`,
                )
                .join(', ')}
            </div>
          )}
        </div>
      ) : (
        <div class="dim tiny">
          Click a fight marker on the map or the timeline to see who fought, the damage exchanged
          and who fell.
        </div>
      )}
    </div>
  );
}

export function HeroView(props: {
  report: Report;
  heroId: number;
  biomes: { tick: number; slot: string; biome: string }[];
}) {
  const s = useSession();
  const r = props.report;
  const h = r.heroes.find((x) => x.id === props.heroId);
  if (!h) return null;
  const def = s.content.heroById.get(h.def)!;
  const mt = mostTakenType(h);
  const badges = r.badges.filter((b) => b.heroId === h.id);
  const dealtMax = Math.max(1, ...Object.values(h.dealtBy));
  const takenMax = Math.max(1, h.taken.blade, h.taken.soul, h.taken.true);
  const fromMax = Math.max(1, ...Object.values(h.takenFrom));
  const goldMax = Math.max(1, ...Object.values(h.goldBySource));
  const origins = Object.entries(h.takenByOrigin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <div class="col" data-testid="hero-view">
      <div class="row">
        <SigilIcon spec={def.sigil} team={h.team} size={46} />
        <div class="grow">
          <h2 style={{ margin: 0 }} class={h.team === 'A' ? 'teamA' : 'teamB'}>
            {def.name}
          </h2>
          <div class="dim small">
            {roleLabel(h.role)} · K/D/A {h.kills}/{h.deaths}/{h.assists} · {n0(h.distance)} units
            traveled
          </div>
        </div>
        <button class="btn" onClick={() => s.setUi({ reportHero: null })} data-testid="back-team">
          Back to teams
        </button>
      </div>
      <div class="row wrap" style={{ gap: '6px' }}>
        {mt && (
          <span class="chip" data-testid="most-taken">
            Most damage taken from:{' '}
            {mt.type === 'blade' ? 'Blade' : mt.type === 'soul' ? 'Soul' : 'True'} ({pct(mt.share)})
          </span>
        )}
        {badges.map((b) => (
          <span class="chip" key={b.id}>
            {b.label} ({n0(b.value)})
          </span>
        ))}
      </div>
      <div class="row wrap" style={{ alignItems: 'flex-start' }}>
        <div class="col" style={{ flex: '1', minWidth: '320px' }}>
          <div class="card col">
            <b class="small">Damage dealt, by target</b>
            {Object.entries(h.dealtBy)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <BarRow key={k} label={k} value={v} max={dealtMax} color={teamColor(h.team)} />
              ))}
          </div>
          <div class="card col">
            <b class="small">Damage taken, by type</b>
            <BarRow label="Blade" value={h.taken.blade} max={takenMax} color="#c98a4a" />
            <BarRow label="Soul" value={h.taken.soul} max={takenMax} color="#7fa8c0" />
            <BarRow label="True" value={h.taken.true} max={takenMax} color="#d8d0bc" />
            <b class="small" style={{ marginTop: '6px' }}>
              Damage taken, by source
            </b>
            {Object.entries(h.takenFrom)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <BarRow key={k} label={k} value={v} max={fromMax} />
              ))}
            <b class="small" style={{ marginTop: '6px' }}>
              Top damage origins
            </b>
            {origins.map(([k, v]) => (
              <BarRow
                key={k}
                label={k.replace('ability:', '').replace('item:', '')}
                value={v}
                max={origins[0]?.[1] ?? 1}
              />
            ))}
          </div>
          <div class="card col">
            <b class="small">Gold earned: {n0(h.goldEarned)}</b>
            <Sparkline
              points={h.goldSeries}
              from={r.fromTick}
              to={r.toTick}
              marks={h.purchases.map((p) => p.tick)}
              color={teamColor(h.team)}
            />
            <div class="tiny dim">Dashed lines mark purchases.</div>
            {Object.entries(h.goldBySource)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <BarRow key={k} label={k} value={v} max={goldMax} color="var(--gold)" />
              ))}
            <div class="tiny dim">
              Healing done {n0(h.healingDone)} · healing received {n0(h.healingReceived)}
            </div>
          </div>
          <div class="card col">
            <b class="small">Purchases and choices</b>
            {h.purchases.length === 0 && <div class="tiny dim">No purchases in this window.</div>}
            {h.purchases.map((p, i) => (
              <div class="tiny" key={i}>
                <span class="dim">{mmss(p.tick)}</span> bought {itemName(s.content, p.item)} for{' '}
                {n0(p.price)}g
                {p.consumed.length > 0
                  ? ` (combined ${p.consumed.map((c) => itemName(s.content, c)).join(' + ')})`
                  : ''}
              </div>
            ))}
            {h.sells.map((p, i) => (
              <div class="tiny" key={`s${i}`}>
                <span class="dim">{mmss(p.tick)}</span> sold {itemName(s.content, p.item)} for{' '}
                {n0(p.refund)}g
              </div>
            ))}
            {h.upgrades.map((u, i) => (
              <div class="tiny" key={`u${i}`}>
                <span class="dim">{mmss(u.tick)}</span> upgrade:{' '}
                {s.content.upgradeById.get(u.upgrade)?.name ?? u.upgrade}
              </div>
            ))}
            {h.postures.map((u, i) => (
              <div class="tiny" key={`po${i}`}>
                <span class="dim">{mmss(u.tick)}</span> posture set to {u.posture}
              </div>
            ))}
            {h.curse.map((c, i) => (
              <div class="tiny" key={`c${i}`}>
                <span class="dim">{mmss(c.tick)}</span> accepted {itemName(s.content, c.item)},
                flaw: {c.flaw}
              </div>
            ))}
          </div>
          {h.deathRecords.length > 0 && (
            <div class="card col">
              <b class="small">Falls</b>
              {h.deathRecords.map((d, i) => (
                <div class="tiny" key={i}>
                  <span class="dim">{mmss(d.tick)}</span> fell to{' '}
                  {d.killerKind === 'hero'
                    ? heroName(s.content, r.heroes.find((x) => x.id === d.killer)?.def ?? '')
                    : d.killerKind === 'camp'
                      ? 'a camp monster'
                      : `a ${d.killerKind}`}
                  . Damage in the 6 seconds before: Blade {n0(d.mix.blade)}, Soul {n0(d.mix.soul)},
                  True {n0(d.mix.true)}.
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: '1', minWidth: '320px' }}>
          <ReplayPanel h={h} report={r} biomes={props.biomes} />
        </div>
      </div>
    </div>
  );
}
