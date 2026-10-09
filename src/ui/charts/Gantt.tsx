import { MarkerShape, type Marker } from './TimeChart';
import { clock } from './scale';
import { TimeFrame, type Guide } from './TimeFrame';

export interface GanttItem {
  t0: number;
  /** Leave out for a single moment (drawn as a marker). */
  t1?: number;
  color: string;
  label: string;
  shape?: Marker['shape'];
}

export interface GanttRow {
  id: string;
  label: string;
  items: GanttItem[];
}

const ROW = 28;

/** Rows of events and intervals over match time, on the same axis and guides as the line charts. */
export function Gantt(props: {
  label: string;
  xMax: number;
  rows: GanttRow[];
  guides?: Guide[];
  labelWidth?: number;
  testid?: string;
}) {
  const lw = props.labelWidth ?? 58;
  const height = props.rows.length * ROW + 16 + 22;
  return (
    <TimeFrame
      label={props.label}
      xMax={props.xMax}
      height={height}
      margin={{ l: lw }}
      guides={props.guides}
      testid={props.testid}
      readout={(t, sc) => {
        const rows: { color: string; label: string }[] = [];
        for (const r of props.rows)
          for (const it of r.items) {
            const hit =
              it.t1 !== undefined
                ? t >= it.t0 - 1 && t <= it.t1 + 1
                : Math.abs(sc.x(it.t0) - sc.x(t)) <= 9;
            if (hit)
              rows.push({
                color: it.color,
                label:
                  it.t1 !== undefined
                    ? `${it.label} ${clock(it.t0)}–${clock(it.t1)}`
                    : `${clock(it.t0)} ${it.label}`,
              });
          }
        return { tip: { title: clock(t), rows: rows.length ? rows : [{ label: 'Nothing here' }] } };
      }}
    >
      {(sc) => (
        <g>
          {props.rows.map((r, i) => {
            const cy = i * ROW + ROW / 2;
            return (
              <g key={r.id}>
                {i > 0 && <line x1={0} x2={sc.w} y1={i * ROW} y2={i * ROW} class="ch-grid" />}
                <text x={-8} y={cy} dy="0.32em" text-anchor="end" class="ch-rowlabel">
                  {r.label}
                </text>
                {r.items
                  .filter((it) => it.t1 !== undefined)
                  .map((it, k) => (
                    <rect
                      key={k}
                      x={sc.x(it.t0)}
                      y={cy - 7}
                      width={Math.max(3, sc.x(it.t1 as number) - sc.x(it.t0))}
                      height={14}
                      rx={3}
                      fill={it.color}
                      fill-opacity={0.85}
                    />
                  ))}
                {r.items
                  .filter((it) => it.t1 === undefined)
                  .map((it, k) => (
                    <MarkerShape
                      key={k}
                      m={{
                        t: it.t0,
                        shape: it.shape ?? 'diamond',
                        color: it.color,
                        label: it.label,
                      }}
                      x={sc.x(it.t0)}
                      y={cy}
                    />
                  ))}
              </g>
            );
          })}
        </g>
      )}
    </TimeFrame>
  );
}
