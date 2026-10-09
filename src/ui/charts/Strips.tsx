import { clock, linePath, valueAt, type Pt } from './scale';
import { TimeFrame, type Guide } from './TimeFrame';

export interface StripRow {
  id: string;
  label: string;
  color: string;
  pts: Pt[];
  /** Highest value on this row (rank 8). */
  max: number;
}

const BAND = 34;

/** Small multiples: one short step-line band per row, sharing the time axis. */
export function Strips(props: {
  label: string;
  xMax: number;
  rows: StripRow[];
  guides?: Guide[];
  labelWidth?: number;
  testid?: string;
}) {
  const lw = props.labelWidth ?? 60;
  const height = props.rows.length * BAND + 16 + 22;
  return (
    <TimeFrame
      label={props.label}
      xMax={props.xMax}
      height={height}
      margin={{ l: lw }}
      guides={props.guides}
      testid={props.testid}
      readout={(t) => ({
        tip: {
          title: clock(t),
          rows: props.rows.map((r) => ({
            color: r.color,
            label: r.label,
            value: `Rank ${valueAt(r.pts, t, true) ?? 1}`,
          })),
        },
      })}
    >
      {(sc) => (
        <g>
          {props.rows.map((r, i) => {
            const top = i * BAND + 3;
            const hh = BAND - 8;
            const y = (v: number): number => top + hh - ((v - 1) / Math.max(1, r.max - 1)) * hh;
            return (
              <g key={r.id}>
                <line x1={0} x2={sc.w} y1={top + hh + 2} y2={top + hh + 2} class="ch-grid" />
                <text x={-8} y={top + hh / 2 + 1} dy="0.32em" text-anchor="end" class="ch-rowlabel">
                  {r.label}
                </text>
                <path
                  d={linePath(r.pts, sc.x, y, true, props.xMax)}
                  fill="none"
                  stroke={r.color}
                  stroke-width={2}
                  stroke-linejoin="round"
                  class="ch-draw"
                />
                {r.pts.slice(1).map((p, k) => (
                  <circle key={k} cx={sc.x(p.t)} cy={y(p.v)} r={2} fill={r.color} />
                ))}
              </g>
            );
          })}
        </g>
      )}
    </TimeFrame>
  );
}
