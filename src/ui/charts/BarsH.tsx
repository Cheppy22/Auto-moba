import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useWidth } from './hooks';
import { full } from './scale';
import { Tip } from './Tip';

export interface BarSeg {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface BarRow {
  id: string;
  label: string;
  /** A small SVG (piece glyph) drawn before the label. */
  glyph?: ComponentChildren;
  segs: BarSeg[];
}

const GLYPH = 22;

/**
 * Horizontal (stacked) bars, one row per entry, with a 2px gap between segments and the total at
 * the end. Hover or tap a row for its breakdown.
 */
export function BarsH(props: {
  label: string;
  rows: BarRow[];
  rowHeight?: number;
  labelWidth?: number;
  format?: (v: number) => string;
  /** Shared maximum, so two charts can use one scale. */
  max?: number;
  /** One thin bar per segment, side by side, instead of one stacked bar. */
  grouped?: boolean;
  testid?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const rh = props.rowHeight ?? 30;
  const lw = props.labelWidth ?? 82;
  const vw = 46;
  const fmt = props.format ?? full;
  const bw = Math.max(20, width - lw - vw - 6);
  const totals = props.rows.map((r) => r.segs.reduce((a, s) => a + s.value, 0));
  const peaks = props.rows.map((r) => Math.max(0, ...r.segs.map((s) => s.value)));
  const max = Math.max(1, props.max ?? 0, ...(props.grouped ? peaks : totals));
  const height = props.rows.length * rh + 4;
  const hotIdx = props.rows.findIndex((r) => r.id === hot);
  const hotRow = hotIdx >= 0 ? props.rows[hotIdx] : null;
  return (
    <div
      class="ch-body"
      ref={ref}
      data-testid={props.testid}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHot(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={props.label}
          class="ch-svg"
        >
          {props.rows.map((r, i) => {
            const y = i * rh + 2;
            let x = lw;
            const total = totals[i];
            return (
              <g key={r.id} class={hot === r.id ? 'ch-row hot' : 'ch-row'}>
                <rect x={0} y={y} width={width} height={rh} class="ch-rowbg" rx={3} />
                {r.glyph && <g transform={`translate(0,${y + (rh - GLYPH) / 2})`}>{r.glyph}</g>}
                <text x={r.glyph ? GLYPH + 5 : 4} y={y + rh / 2} dy="0.32em" class="ch-rowlabel">
                  {r.label}
                </text>
                {props.grouped &&
                  r.segs.map((s, k) => {
                    const n = r.segs.length;
                    const sub = (rh - 10 - (n - 1) * 3) / n;
                    const wpx = Math.max(s.value > 0 ? 2 : 0, (s.value / max) * bw);
                    const by = y + 5 + k * (sub + 3);
                    return (
                      <g key={s.key}>
                        <rect
                          x={lw}
                          y={by}
                          width={wpx}
                          height={sub}
                          rx={3}
                          fill={s.color}
                          class="ch-grow"
                        />
                        <text x={lw + wpx + 5} y={by + sub / 2} dy="0.34em" class="ch-value sm">
                          {fmt(s.value)}
                        </text>
                      </g>
                    );
                  })}
                {!props.grouped &&
                  r.segs.map((s) => {
                    const wpx = (s.value / max) * bw;
                    if (wpx <= 0) return null;
                    const seg = (
                      <rect
                        key={s.key}
                        x={x}
                        y={y + 6}
                        width={Math.max(1, wpx - 2)}
                        height={rh - 12}
                        rx={3}
                        fill={s.color}
                        class="ch-grow"
                      />
                    );
                    x += wpx;
                    return seg;
                  })}
                {!props.grouped && (
                  <text x={width - 2} y={y + rh / 2} dy="0.32em" text-anchor="end" class="ch-value">
                    {fmt(total)}
                  </text>
                )}
                <rect
                  x={0}
                  y={y}
                  width={width}
                  height={rh}
                  fill="transparent"
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHot(r.id)}
                  onPointerDown={() => setHot(hot === r.id ? null : r.id)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hotRow && (
        <Tip
          x={width * 0.5}
          y={hotIdx * rh + rh + 2}
          width={width}
          data={{
            title: hotRow.label,
            rows: [
              ...hotRow.segs
                .filter((s) => s.value > 0)
                .map((s) => ({ color: s.color, label: s.label, value: fmt(s.value) })),
              ...(props.grouped ? [] : [{ label: 'Total', value: fmt(totals[hotIdx]) }]),
            ],
          }}
        />
      )}
    </div>
  );
}
