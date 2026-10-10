import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ActReport, LaneId, PlayTeam, Snapshot } from '../../sim';
import { actCallouts } from '../../analysis/callouts';
import { courtName, laneName } from '../../analysis/text';
import { n0 } from '../format';
import { Orders } from '../Orders';
import { PieceGlyph, pieceLabel } from '../pieces';
import { useSession } from '../session';

type Tab = 'report' | 'orders';

const TABS: { id: Tab; label: string }[] = [
  { id: 'report', label: 'Report' },
  { id: 'orders', label: 'Orders' },
];

interface Row {
  key: string;
  label: string;
  a: number;
  b: number;
  /** Which way is better for a side. */
  better: 'high' | 'low';
}

const bastionsDown = (r: ActReport, team: PlayTeam): number =>
  r.teams[team === 'A' ? 'B' : 'A'].bastionsLost.length;

function rows(r: ActReport): Row[] {
  const t = r.teams;
  return [
    { key: 'tempo', label: 'Tempo earned', a: t.A.tempo, b: t.B.tempo, better: 'high' },
    { key: 'damage', label: 'Damage dealt', a: t.A.damage, b: t.B.damage, better: 'high' },
    { key: 'deaths', label: 'Piece deaths', a: t.A.pieceDeaths, b: t.B.pieceDeaths, better: 'low' },
    {
      key: 'bastions',
      label: 'Bastions destroyed',
      a: bastionsDown(r, 'A'),
      b: bastionsDown(r, 'B'),
      better: 'high',
    },
    { key: 'obelisks', label: 'Obelisks claimed', a: t.A.obelisks, b: t.B.obelisks, better: 'high' },
    { key: 'camps', label: 'Camps cleared', a: t.A.camps, b: t.B.camps, better: 'high' },
    { key: 'gambits', label: 'Gambits played', a: t.A.gambits, b: t.B.gambits, better: 'high' },
  ];
}

function lead(row: Row, side: 'a' | 'b'): boolean {
  if (row.a === row.b) return false;
  const aAhead = row.better === 'high' ? row.a > row.b : row.a < row.b;
  return side === 'a' ? aAhead : !aAhead;
}

function Report(props: { report: ActReport }) {
  const s = useSession();
  const { report } = props;
  const callouts = useMemo(() => actCallouts(report), [report]);
  const laneFacts: [LaneId, string][] = [];
  for (const p of report.teams.A.pieces) laneFacts.push([p.lane, p.piece]);
  return (
    <div class="bs-report" data-testid="break-report">
      <ul class="bs-callouts" data-testid="break-callouts">
        {callouts.map((c) => (
          <li key={c.id} class={`bs-callout ${c.tone}`} data-testid={`callout-${c.id}`}>
            {c.text}
          </li>
        ))}
      </ul>
      <table class="bs-table" data-testid="break-numbers">
        <caption class="tiny dim">This Act, side by side</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" class="a">
              {courtName('A')}
            </th>
            <th scope="col" class="b">
              {courtName('B')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows(report).map((r) => (
            <tr key={r.key} data-testid={`break-row-${r.key}`}>
              <th scope="row">{r.label}</th>
              <td class={`a ${lead(r, 'a') ? 'lead' : ''}`}>{n0(r.a)}</td>
              <td class={`b ${lead(r, 'b') ? 'lead' : ''}`}>{n0(r.b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="bs-pieces tiny dim" aria-label="White pieces this Act">
        {report.teams.A.pieces.map((p) => (
          <span key={p.id} class="bs-piece">
            <PieceGlyph piece={p.piece} team="A" size={18} />
            {pieceLabel(s.content, p.piece)} · {laneName(p.lane)} · {p.kills}/{p.deaths} · {n0(p.damage)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The Act break sheet: play is frozen. A bottom sheet slides up with the Act report and the
 * Orders (lanes and paths); "Resume" starts the next Act. No time limit.
 */
export function BreakSheet(props: { snap: Snapshot }) {
  const s = useSession();
  const { act } = props.snap;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);
  if (!act.report) return null;
  const tab = s.ui.breakTab;
  return (
    <>
      <div class="break-scrim" aria-hidden="true" />
      <section
        class={`breaksheet ${shown ? 'open' : ''}`}
        data-testid="break-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Act ${act.n} break`}
      >
        <header class="bs-head">
          <div class="bs-title">
            <b>Act {act.n} complete</b>
            <span class="tiny dim">The bell has rung. Play is stopped.</span>
          </div>
          <div class="tabs bs-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                class={`btn ${tab === t.id ? 'on' : ''}`}
                data-testid={`break-tab-${t.id}`}
                onClick={() => s.setBreakTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        <div class="bs-body scroll">
          {tab === 'report' ? <Report report={act.report} /> : <Orders />}
        </div>
        <footer class="bs-foot">
          <button
            class="btn primary bs-resume"
            data-testid="break-resume"
            onClick={() => s.resumeAct()}
          >
            Resume — Act {act.n + 1}
          </button>
        </footer>
      </section>
    </>
  );
}
