import type { ComponentChildren } from 'preact';

export interface TipRow {
  color?: string;
  label: string;
  value?: string;
}

export interface TipData {
  title: string;
  rows: TipRow[];
}

/** An HTML tooltip placed inside a relatively positioned chart body. */
export function Tip(props: {
  x: number;
  y?: number;
  width: number;
  data: TipData;
  children?: ComponentChildren;
}) {
  const right = props.x > props.width * 0.55;
  const style = right
    ? { right: `${Math.max(2, props.width - props.x + 12)}px`, top: `${props.y ?? 4}px` }
    : { left: `${Math.max(2, props.x + 12)}px`, top: `${props.y ?? 4}px` };
  return (
    <div class="ch-tip" style={style} role="status" data-testid="chart-tip">
      <b>{props.data.title}</b>
      {props.data.rows.map((r, i) => (
        <div class="ch-tip-row" key={i}>
          {r.color && <i style={{ background: r.color }} />}
          <span>{r.label}</span>
          {r.value !== undefined && <em>{r.value}</em>}
        </div>
      ))}
      {props.children}
    </div>
  );
}
