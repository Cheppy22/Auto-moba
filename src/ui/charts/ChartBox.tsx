import type { ComponentChildren } from 'preact';
import { Legend, type LegendItem } from './Legend';

export interface DataTable {
  head: string[];
  rows: (string | number)[][];
}

/** A titled chart with a legend and an optional data table for screen readers and the curious. */
export function ChartBox(props: {
  title: string;
  note?: string;
  legend?: LegendItem[];
  table?: DataTable;
  testid?: string;
  /** Spans both columns on wide screens. */
  wide?: boolean;
  children: ComponentChildren;
}) {
  return (
    <figure class={`ch ${props.wide ? 'wide' : ''}`} data-testid={props.testid}>
      <figcaption>
        <h4>{props.title}</h4>
        {props.note && <span class="ch-note">{props.note}</span>}
      </figcaption>
      {props.legend && props.legend.length > 0 && <Legend items={props.legend} />}
      {props.children}
      {props.table && (
        <details class="ch-table">
          <summary>Data table</summary>
          <div class="ch-table-scroll">
            <table>
              <thead>
                <tr>
                  {props.table.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
