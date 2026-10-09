import type { ComponentChildren } from 'preact';

export type Swatch = 'box' | 'line' | 'dash' | 'diamond' | 'tri' | 'square' | 'tick';

export interface LegendItem {
  label: string;
  color: string;
  shape?: Swatch;
}

const SIZE = 12;

function Mark(props: { shape: Swatch; color: string }) {
  const c = props.color;
  const s = SIZE;
  return (
    <svg width={s + 4} height={s} viewBox={`0 0 ${s + 4} ${s}`} aria-hidden="true">
      {props.shape === 'box' && <rect x="1" y="2" width={s + 2} height={s - 4} rx="2" fill={c} />}
      {props.shape === 'line' && (
        <line
          x1="0"
          x2={s + 4}
          y1={s / 2}
          y2={s / 2}
          stroke={c}
          stroke-width="2.4"
          stroke-linecap="round"
        />
      )}
      {props.shape === 'dash' && (
        <line
          x1="0"
          x2={s + 4}
          y1={s / 2}
          y2={s / 2}
          stroke={c}
          stroke-width="2"
          stroke-dasharray="3 2.5"
        />
      )}
      {props.shape === 'tick' && (
        <line x1="8" x2="8" y1="0" y2={s} stroke={c} stroke-width="1.5" stroke-dasharray="2 2" />
      )}
      {props.shape === 'diamond' && (
        <path
          d={`M8,1 L${s + 1},${s / 2} L8,${s - 1} L${3},${s / 2}Z`}
          fill={c}
          stroke="#14111d"
          stroke-width="1"
        />
      )}
      {props.shape === 'square' && (
        <rect x="3" y="2" width="9" height="8" fill={c} stroke="#14111d" stroke-width="1" />
      )}
      {props.shape === 'tri' && (
        <path
          d={`M8,1 L${s + 1},${s - 1} L3,${s - 1}Z`}
          fill={c}
          stroke="#14111d"
          stroke-width="1"
        />
      )}
    </svg>
  );
}

/** Always present for two or more series, so identity is never colour alone. */
export function Legend(props: { items: LegendItem[]; children?: ComponentChildren }) {
  return (
    <ul class="ch-legend" aria-label="Legend">
      {props.items.map((it) => (
        <li key={it.label}>
          <Mark shape={it.shape ?? 'box'} color={it.color} />
          <span>{it.label}</span>
        </li>
      ))}
      {props.children}
    </ul>
  );
}
