import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useWidth } from './hooks';
import { GUIDE } from './palette';
import { clamp, clock, niceTicks, timeTicks } from './scale';
import { Tip, type TipData } from './Tip';

export interface Guide {
  t: number;
  kind: 'act' | 'pressure';
  label: string;
}

export interface Margin {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface TimeScale {
  /** Seconds -> pixels inside the plot (0 is the left edge of the plot). */
  x: (t: number) => number;
  /** Value -> pixels inside the plot. */
  y: (v: number) => number;
  /** Plot size in pixels. */
  w: number;
  h: number;
  xMax: number;
}

export interface Readout {
  tip: TipData;
  /** Dots drawn on the cursor line, in value units. */
  dots?: { v: number; color: string }[];
}

export interface TimeFrameProps {
  /** Aria label for the whole chart. */
  label: string;
  /** Match length in seconds (the x domain is 0..xMax). */
  xMax: number;
  height: number;
  margin?: Partial<Margin>;
  /** The y domain; leave out for charts that draw their own rows. */
  yDomain?: [number, number];
  yTicks?: number[];
  yFormat?: (v: number) => string;
  /** Draw the y = 0 line stronger. */
  zeroLine?: boolean;
  guides?: Guide[];
  /** What the scrub cursor says at time t (seconds). */
  readout?: (t: number, sc: TimeScale) => Readout | null;
  /** Names the guides near the cursor in the tip. */
  children: (sc: TimeScale) => ComponentChildren;
  testid?: string;
}

const M: Margin = { l: 40, r: 8, t: 16, b: 22 };

/**
 * The shared frame of the time charts: responsive width, axes, grid, shared guides (Act
 * boundaries, pressure events) and a scrub cursor. The cursor follows the mouse on hover and a
 * finger on tap; it never captures the pointer or sets touch-action, so a horizontal swipe on the
 * chart still turns the report page.
 */
export function TimeFrame(props: TimeFrameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null);
  const m: Margin = { ...M, ...props.margin };
  const w = Math.max(0, width - m.l - m.r);
  const h = props.height - m.t - m.b;
  const xMax = Math.max(1, props.xMax);
  const [y0, y1] = props.yDomain ?? [0, 1];
  const sc: TimeScale = {
    x: (t) => (clamp(t, 0, xMax) / xMax) * w,
    y: (v) => h - ((v - y0) / (y1 - y0 || 1)) * h,
    w,
    h,
    xMax,
  };
  useEffect(() => {
    if (cursor === null) return;
    // a tap anywhere else lets go of a touch cursor
    const off = (e: PointerEvent): void => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setCursor(null);
    };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [cursor !== null]);

  const at = (e: PointerEvent): number => {
    const el = ref.current;
    const r = el?.getBoundingClientRect();
    const px = e.clientX - (r?.left ?? 0) - m.l;
    return clamp(px / (w || 1), 0, 1) * xMax;
  };
  const ro = cursor !== null && props.readout ? props.readout(cursor, sc) : null;
  const ticksX = timeTicks(xMax, w < 320 ? 4 : 6);
  const ticksY = props.yDomain ? (props.yTicks ?? niceTicks(y0, y1, 4)) : [];
  const guides = props.guides ?? [];
  // guides near the cursor join the tip
  const near =
    cursor !== null
      ? guides
          .filter((g) => Math.abs(sc.x(g.t) - sc.x(cursor)) <= 7)
          .map((g) => ({ label: g.label }))
      : [];
  const tip: TipData | null = ro
    ? { title: ro.tip.title, rows: [...ro.tip.rows, ...near.map((n) => ({ label: n.label }))] }
    : null;
  const cx = cursor !== null ? m.l + sc.x(cursor) : 0;
  return (
    <div
      class="ch-body"
      ref={ref}
      data-testid={props.testid}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setCursor(null);
      }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={props.height}
          viewBox={`0 0 ${width} ${props.height}`}
          role="img"
          aria-label={props.label}
          class="ch-svg"
        >
          <g transform={`translate(${m.l},${m.t})`}>
            {ticksY.map((v) => (
              <g key={`y${v}`}>
                <line
                  x1={0}
                  x2={w}
                  y1={sc.y(v)}
                  y2={sc.y(v)}
                  class={v === 0 && props.zeroLine ? 'ch-zero' : 'ch-grid'}
                />
                <text x={-6} y={sc.y(v)} dy="0.32em" text-anchor="end" class="ch-tick">
                  {(props.yFormat ?? String)(v)}
                </text>
              </g>
            ))}
            {ticksX.map((t) => (
              <text key={`x${t}`} x={sc.x(t)} y={h + 15} text-anchor="middle" class="ch-tick">
                {clock(t)}
              </text>
            ))}
            <line x1={0} x2={w} y1={h} y2={h} class="ch-axis" />
            {guides.map((g, i) => (
              <g key={`g${i}`} class={`ch-guide ${g.kind}`}>
                <line
                  x1={sc.x(g.t)}
                  x2={sc.x(g.t)}
                  y1={g.kind === 'act' ? -4 : 0}
                  y2={h}
                  stroke={g.kind === 'act' ? GUIDE.act : GUIDE.pressure}
                  stroke-width={g.kind === 'act' ? 1 : 1.25}
                  stroke-dasharray={g.kind === 'act' ? undefined : '2 3'}
                />
                {g.kind === 'act' ? (
                  <text x={sc.x(g.t) + 3} y={-5} class="ch-guide-label">
                    {g.label}
                  </text>
                ) : (
                  <path
                    d={`M${sc.x(g.t) - 3.5},-1 L${sc.x(g.t) + 3.5},-1 L${sc.x(g.t)},5Z`}
                    fill={GUIDE.pressure}
                  />
                )}
              </g>
            ))}
            {props.children(sc)}
            {cursor !== null && (
              <g pointer-events="none">
                <line x1={sc.x(cursor)} x2={sc.x(cursor)} y1={0} y2={h} class="ch-cursor" />
                {ro?.dots?.map((d, i) => (
                  <circle
                    key={i}
                    cx={sc.x(cursor)}
                    cy={sc.y(d.v)}
                    r={4}
                    fill={d.color}
                    class="ch-dot"
                  />
                ))}
              </g>
            )}
            {props.readout && (
              <rect
                x={0}
                y={-m.t}
                width={w}
                height={props.height - m.b}
                fill="transparent"
                class="ch-hit"
                onPointerDown={(e) => setCursor(at(e))}
                onPointerMove={(e) => {
                  if (e.pointerType === 'mouse' || e.buttons) setCursor(at(e));
                }}
              />
            )}
          </g>
        </svg>
      )}
      {tip && <Tip x={cx} width={width} data={tip} />}
    </div>
  );
}
