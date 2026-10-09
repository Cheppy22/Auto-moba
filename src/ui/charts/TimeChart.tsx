import { useUid } from './hooks';
import { TEAM_COLOR } from './palette';
import { areaPath, clock, full, linePath, valueAt, type Pt } from './scale';
import { TimeFrame, type Guide, type Readout } from './TimeFrame';

export interface TimeSeries {
  id: string;
  label: string;
  color: string;
  pts: Pt[];
  /** line: straight segments; step: held values; area: line with a fill to zero. */
  mode: 'line' | 'step' | 'area';
  dash?: string;
  /** Overrides how the value reads in the tip. */
  fmt?: (v: number) => string;
}

export interface Marker {
  t: number;
  /** Value to sit on; markers without one sit on the baseline. */
  v?: number;
  shape: 'diamond' | 'tri' | 'square' | 'circle';
  color: string;
  /** Text for the tip when the cursor is near. */
  label: string;
}

export interface TimeChartProps {
  label: string;
  xMax: number;
  height?: number;
  series: TimeSeries[];
  /** Two-sided chart: White above the zero line, Black below, one series only. */
  diverge?: { pos: string; neg: string };
  markers?: Marker[];
  guides?: Guide[];
  yFormat?: (v: number) => string;
  /** Force the y domain, e.g. [0, 5] for counts. */
  yDomain?: [number, number];
  /** Whole-number y ticks (counts). */
  integerTicks?: boolean;
  testid?: string;
}

export function MarkerShape(props: { m: Marker; x: number; y: number; size?: number }) {
  const { m, x, y } = props;
  const s = props.size ?? 5.5;
  const common = { fill: m.color, stroke: '#14110e', 'stroke-width': 1.5 };
  if (m.shape === 'diamond')
    return (
      <path
        d={`M${x},${y - s - 1}L${x + s + 1},${y}L${x},${y + s + 1}L${x - s - 1},${y}Z`}
        {...common}
      />
    );
  if (m.shape === 'tri')
    return (
      <path d={`M${x},${y - s - 1}L${x + s + 1},${y + s}L${x - s - 1},${y + s}Z`} {...common} />
    );
  if (m.shape === 'square')
    return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...common} />;
  return <circle cx={x} cy={y} r={s} {...common} />;
}

/** Lines, steps and areas over match time, with an optional two-sided "lead" mode. */
export function TimeChart(props: TimeChartProps) {
  const uid = useUid('tc');
  const all = props.series.flatMap((s) => s.pts.map((p) => p.v));
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (props.diverge) {
    // keep both sides visible, but do not waste half the chart on a side that barely moves
    const top = Math.max(hi, -lo * 0.25, 1);
    const bottom = Math.max(-lo, hi * 0.25, 1);
    lo = -bottom;
    hi = top;
  }
  if (props.yDomain) [lo, hi] = props.yDomain;
  if (hi === lo) hi = lo + 1;
  const pad = props.yDomain ? 0 : (hi - lo) * 0.06;
  const dom: [number, number] = [lo === 0 && !props.diverge ? 0 : lo - pad, hi + pad];
  const markers = props.markers ?? [];
  const yFmt = props.yFormat ?? full;

  const readout = (t: number, sc: { x: (t: number) => number }): Readout => {
    const rows = props.series.map((s) => {
      const v = valueAt(s.pts, t, s.mode === 'step');
      return { s, v };
    });
    const dots = rows
      .filter((r) => r.v !== null)
      .map((r) => ({ v: r.v as number, color: r.s.color }));
    const nearM = markers.filter((m) => Math.abs(sc.x(m.t) - sc.x(t)) <= 8);
    return {
      tip: {
        title: clock(t),
        rows: [
          ...rows.map((r) => ({
            color: r.s.color,
            label: r.s.label,
            value: r.v === null ? '–' : (r.s.fmt ?? yFmt)(r.v),
          })),
          ...nearM.map((m) => ({ color: m.color, label: `${clock(m.t)} ${m.label}` })),
        ],
      },
      dots,
    };
  };

  return (
    <TimeFrame
      label={props.label}
      xMax={props.xMax}
      height={props.height ?? 190}
      yDomain={dom}
      yTicks={props.integerTicks ? intTicks(dom) : undefined}
      yFormat={yFmt}
      zeroLine={lo < 0}
      guides={props.guides}
      readout={readout}
      testid={props.testid}
    >
      {(sc) => (
        <g>
          {props.diverge &&
            props.series.slice(0, 1).map((s) => {
              const area = areaPath(s.pts, sc.x, sc.y, 0, false, props.xMax);
              const y0 = sc.y(0);
              return (
                <g key={s.id}>
                  <defs>
                    <clipPath id={`${uid}p`}>
                      <rect x={-2} y={-20} width={sc.w + 4} height={y0 + 20} />
                    </clipPath>
                    <clipPath id={`${uid}n`}>
                      <rect x={-2} y={y0} width={sc.w + 4} height={sc.h - y0 + 4} />
                    </clipPath>
                  </defs>
                  <path
                    d={area}
                    fill={props.diverge!.pos}
                    fill-opacity={0.38}
                    clip-path={`url(#${uid}p)`}
                    class="ch-draw"
                  />
                  <path
                    d={area}
                    fill={props.diverge!.neg}
                    fill-opacity={0.38}
                    clip-path={`url(#${uid}n)`}
                    class="ch-draw"
                  />
                  <path
                    d={linePath(s.pts, sc.x, sc.y, false, props.xMax)}
                    fill="none"
                    stroke={s.color}
                    stroke-width={2}
                    stroke-linejoin="round"
                    class="ch-draw"
                  />
                </g>
              );
            })}
          {!props.diverge &&
            props.series.map((s) => {
              const step = s.mode === 'step';
              return (
                <g key={s.id}>
                  {s.mode === 'area' && (
                    <path
                      d={areaPath(s.pts, sc.x, sc.y, Math.max(dom[0], 0), false, props.xMax)}
                      fill={s.color}
                      fill-opacity={0.2}
                      class="ch-draw"
                    />
                  )}
                  <path
                    d={linePath(s.pts, sc.x, sc.y, step, props.xMax)}
                    fill="none"
                    stroke={s.color}
                    stroke-width={2}
                    stroke-linejoin="round"
                    stroke-dasharray={s.dash}
                    class="ch-draw"
                  />
                </g>
              );
            })}
          {markers.map((m, i) => (
            <MarkerShape
              key={i}
              m={m}
              x={sc.x(m.t)}
              y={m.v === undefined ? sc.y(dom[0] < 0 ? 0 : dom[0]) : sc.y(m.v)}
            />
          ))}
        </g>
      )}
    </TimeFrame>
  );
}

function intTicks(dom: [number, number]): number[] {
  const out: number[] = [];
  const span = dom[1] - dom[0];
  const step = Math.max(1, Math.ceil(span / 4));
  for (let v = Math.ceil(dom[0]); v <= dom[1]; v += step) out.push(v);
  return out;
}

export { TEAM_COLOR };
