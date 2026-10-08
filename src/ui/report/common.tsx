import { useEffect, useRef, useState } from 'preact/hooks';
import type { Content, PieceId, PlayTeam } from '../../sim';
import { n0 } from '../format';

export const heroName = (c: Content, def: string): string =>
  c.pieceById.get(def as PieceId)?.name ?? def;

export const itemName = (c: Content, id: string): string =>
  c.itemById.get(id)?.name ?? c.cursedById.get(id)?.name ?? c.holyById.get(id)?.name ?? id;

export const teamClass = (t: PlayTeam | string): string =>
  t === 'A' ? 'teamA' : t === 'B' ? 'teamB' : 'dim';

export function Num(props: { value: number; skip: boolean }) {
  const [shown, setShown] = useState(props.skip ? props.value : 0);
  const ref = useRef(0);
  useEffect(() => {
    if (props.skip) {
      setShown(props.value);
      return;
    }
    const start = performance.now();
    const dur = 650;
    const tick = (now: number): void => {
      const f = Math.min(1, (now - start) / dur);
      setShown(props.value * (1 - Math.pow(1 - f, 3)));
      if (f < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [props.value, props.skip]);
  return <span>{n0(shown)}</span>;
}

export function BarRow(props: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
}) {
  const f = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  return (
    <div class="row" style={{ gap: '6px' }}>
      <div class="tiny" style={{ width: '92px' }}>
        {props.label}
      </div>
      <div class="bar grow">
        <i style={{ width: `${f * 100}%`, background: props.color ?? 'var(--accent)' }} />
      </div>
      <div class="tiny" style={{ width: '74px', textAlign: 'right' }}>
        {n0(props.value)}
        {props.suffix ?? ''}
      </div>
    </div>
  );
}

export function Sparkline(props: {
  points: { tick: number; total: number }[];
  from: number;
  to: number;
  marks: number[];
  color: string;
}) {
  const w = 260;
  const h = 56;
  const pts = props.points;
  const span = Math.max(1, props.to - props.from);
  const maxV = Math.max(1, ...pts.map((p) => p.total));
  const x = (t: number): number => ((t - props.from) / span) * w;
  const y = (v: number): number => h - 4 - (v / maxV) * (h - 10);
  const d = pts.length
    ? `M${x(props.from)},${y(0)} ` +
      pts.map((p) => `L${x(p.tick).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
    : '';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      role="img"
      aria-label="Gold earned over time"
    >
      <rect x="0" y="0" width={w} height={h} fill="#07090a" rx="4" />
      {d && <path d={d} fill="none" stroke={props.color} stroke-width="1.8" />}
      {props.marks.map((t, i) => (
        <line
          key={i}
          x1={x(t)}
          x2={x(t)}
          y1={4}
          y2={h - 4}
          stroke="#e0a93e"
          stroke-width="1"
          stroke-dasharray="2 3"
        />
      ))}
    </svg>
  );
}
