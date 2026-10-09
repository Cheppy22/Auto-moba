import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Fight } from '../../analysis';
import { drawReplay, replayHit, type ReplayData } from '../../render';
import { useSession } from '../session';
import { mmss, n0 } from '../format';
import { heroName, itemName } from './common';
import type { ReportData } from './data';
import { reducedMotion } from './parts';

/** The path replay for one piece: map, scrub bar, fights, purchases and falls on a timeline. */
export function ReplayPanel(props: { data: ReportData; id: number; active: boolean }) {
  const s = useSession();
  const { report } = props.data;
  const h = report.heroes.find((x) => x.id === props.id);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(report.fromTick);
  const [playing, setPlaying] = useState(false);
  const [fightId, setFightId] = useState<number | null>(null);
  const fights = useMemo(
    () => report.fights.filter((f) => h && f.participants.includes(h.id)),
    [report, h],
  );
  const biomes = report.special.biomes;
  const data: ReplayData | null = useMemo(
    () =>
      h
        ? {
            team: h.team,
            path: h.path,
            fights: fights.map((f) => ({
              id: f.id,
              x: f.x,
              y: f.y,
              startTick: f.startTick,
              endTick: f.endTick,
            })),
            purchases: h.purchases.map((p) => ({
              tick: p.tick,
              label: itemName(s.content, p.item),
            })),
            deaths: h.deathRecords.map((d) => ({ tick: d.tick, x: d.x, y: d.y })),
            recalls: h.recalls
              .filter((r) => r.stage === 'start')
              .map((r) => ({ tick: r.tick, dest: r.dest })),
            slots: s.content.map.slots.map((sl) => ({
              id: sl.id,
              biomeId:
                biomes.find((b) => b.slot === sl.id && b.tick <= report.toTick)?.biome ?? null,
            })),
            selectedFight: fightId,
          }
        : null,
    [h, fights, fightId, report.toTick, biomes, s.content],
  );
  useEffect(() => {
    setTick(report.fromTick);
    setFightId(null);
    setPlaying(false);
  }, [props.id, report.fromTick, report.toTick]);
  useEffect(() => {
    if (canvas.current && data && props.active) drawReplay(canvas.current, s.content, data, tick);
  }, [data, tick, s.content, props.active]);
  // redraw when the canvas changes size (rotation, window resize)
  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (data && el.clientWidth > 0) drawReplay(el, s.content, data, tick);
    });
    ro.observe(el);
    return () => ro.disconnect();
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
  // leaving the page stops playback
  useEffect(() => {
    if (!props.active) setPlaying(false);
  }, [props.active]);
  if (!h || !data) return null;

  const span = Math.max(1, report.toTick - report.fromTick);
  const at = (t: number): string => `${((t - report.fromTick) / span) * 100}%`;
  const selected: Fight | undefined = fights.find((f) => f.id === fightId);
  return (
    <div class="rp-replay" data-testid="replay">
      <div class="rp-replay-map">
        <canvas
          ref={canvas}
          class="rp-replay-canvas"
          aria-label={`Path of the ${heroName(s.content, h.def)} through the match`}
          onClick={(e) => {
            const id = replayHit(e.currentTarget, s.content, data, e.clientX, e.clientY);
            setFightId(id);
            if (id !== null) {
              const f = fights.find((x) => x.id === id);
              if (f) setTick(f.startTick);
            }
          }}
        />
      </div>
      <div class="rp-replay-side">
        <div class="row">
          <h4 class="grow">Path through the match</h4>
          <button
            class="btn rp-btn"
            data-testid="replay-play"
            onClick={() => {
              if (reducedMotion()) setTick(report.toTick);
              else {
                if (tick >= report.toTick) setTick(report.fromTick);
                setPlaying(!playing);
              }
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <span class="tiny dim rp-clock">{mmss(tick)}</span>
        </div>
        <input
          class="rp-scrub"
          type="range"
          min={report.fromTick}
          max={report.toTick}
          value={tick}
          aria-label="Replay time"
          onInput={(e) => {
            setPlaying(false);
            setTick(Number((e.target as HTMLInputElement).value));
          }}
          data-testid="scrub"
        />
        <div class="timeline rp-timeline" title="fights, purchases, falls">
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
              Damage: <span class="teamA">{n0(selected.damageA)}</span> from White,{' '}
              <span class="teamB">{n0(selected.damageB)}</span> from Black. Pieces fallen:{' '}
              <span class="teamA">{selected.deathsA}</span> White,{' '}
              <span class="teamB">{selected.deathsB}</span> Black.
            </div>
            <table class="stats">
              <thead>
                <tr>
                  <th>Piece</th>
                  <th>Dealt</th>
                  <th>Taken</th>
                </tr>
              </thead>
              <tbody>
                {selected.participants.map((id) => {
                  const p = report.heroes.find((x) => x.id === id);
                  if (!p) return null;
                  const d = selected.damage[id] ?? { dealt: 0, taken: 0 };
                  return (
                    <tr key={id} style={{ fontWeight: id === h.id ? 700 : 400 }}>
                      <td class={p.team === 'A' ? 'teamA' : 'teamB'}>
                        {p.team === 'A' ? 'White' : 'Black'} {heroName(s.content, p.def)}
                      </td>
                      <td>{n0(d.dealt)}</td>
                      <td>{n0(d.taken)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="dim tiny">
            Tap a fight on the map or the timeline to see who fought, the damage exchanged and who
            fell.
          </div>
        )}
      </div>
    </div>
  );
}
