import { full } from './scale';

export interface SplitPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** One bar split into parts (pawns vs gambits), labelled underneath so colour is never alone. */
export function SplitBar(props: { label: string; parts: SplitPart[]; testid?: string }) {
  const total = props.parts.reduce((a, p) => a + p.value, 0);
  return (
    <div class="split" role="img" aria-label={props.label} data-testid={props.testid}>
      <div class="split-bar">
        {total === 0 && <i class="split-empty" />}
        {props.parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <i
              key={p.key}
              style={{ flexGrow: p.value, background: p.color }}
              title={`${p.label} ${full(p.value)}`}
            />
          ))}
      </div>
      <div class="split-key">
        {props.parts.map((p) => (
          <span key={p.key}>
            <b style={{ background: p.color }} />
            {p.label} <em>{full(p.value)}</em>
            {total > 0 && <small> ({Math.round((p.value / total) * 100)}%)</small>}
          </span>
        ))}
      </div>
    </div>
  );
}
