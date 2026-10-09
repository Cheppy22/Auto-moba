import {
  BarsH,
  CAT,
  ChartBox,
  Gantt,
  SplitBar,
  TEAM_COLOR,
  TimeChart,
  clock,
  full,
  type GanttRow,
} from '../../charts';
import { laneName } from '../../../analysis/text';
import { useSession } from '../../session';
import { toPts, type ReportData } from '../data';
import { GuideKey } from '../Guides';
import { teamWord } from '../parts';

const LANES = ['top', 'mid', 'bot'] as const;
const PAWN_COLOR = CAT.blue;
const GAMBIT_COLOR = CAT.orange;

export function ObjectivesPage(props: { data: ReportData }) {
  const s = useSession();
  const { sum, report, tickRate, endSec, guides } = props.data;
  const o = sum.objectives;
  const at = (tick: number): number => tick / tickRate;
  const rows: GanttRow[] = [
    ...LANES.map((lane) => ({
      id: lane,
      label: laneName(lane),
      items: o.bastions
        .filter((b) => b.lane === lane)
        .map((b) => ({
          t0: at(b.tick),
          color: TEAM_COLOR[b.team],
          shape: 'diamond' as const,
          label: `${teamWord(b.team)} ${b.index === 0 ? 'outer' : 'inner'} Bastion fell`,
        })),
    })),
    {
      id: 'throne',
      label: 'Throne',
      items: o.throne.map((t) => ({
        t0: at(t.tick),
        color: TEAM_COLOR[t.team],
        shape: 'square' as const,
        label: `${teamWord(t.team)} Throne fell`,
      })),
    },
    ...(['A', 'B'] as const).map((team) => ({
      id: `check${team}`,
      label: `${teamWord(team)} Check`,
      items: o.checks
        .filter((c) => c.team === team)
        .map((c) => ({
          t0: at(c.fromTick),
          t1: Math.max(at(c.toTick), at(c.fromTick) + 1),
          color: TEAM_COLOR[team],
          label: `${teamWord(team)} King down`,
        })),
    })),
  ];
  const cards = new Map<string, { a: number; b: number }>();
  for (const t of ['A', 'B'] as const)
    for (const [id, n] of Object.entries(sum.teams[t].gambitsPlayed)) {
      const c = cards.get(id) ?? { a: 0, b: 0 };
      if (t === 'A') c.a += n;
      else c.b += n;
      cards.set(id, c);
    }
  const orders = [
    {
      id: 'pawns',
      label: 'Pawns fielded',
      a: sum.teams.A.pawnsFielded,
      b: sum.teams.B.pawnsFielded,
    },
    ...[...cards.entries()]
      .sort((x, y) => y[1].a + y[1].b - (x[1].a + x[1].b))
      .map(([id, c]) => ({ id, label: s.content.gambitById.get(id)?.name ?? id, a: c.a, b: c.b })),
  ];
  const orderRows = orders.map((r) => ({
    id: r.id,
    label: r.label,
    segs: [
      { key: 'A', label: 'White', value: r.a, color: TEAM_COLOR.A },
      { key: 'B', label: 'Black', value: r.b, color: TEAM_COLOR.B },
    ],
  }));
  const pressure = report.special.pressure;
  return (
    <div class="rp-page-body grid" data-testid="page-objectives-body">
      <GuideKey guides={guides} />
      <ChartBox
        testid="chart-objectives"
        wide
        title="Bastions, Thrones and Check"
        note="Colour shows whose structure fell, or whose King was down"
        legend={[
          { label: 'Bastion fell', color: '#b9b2a2', shape: 'diamond' },
          { label: 'Throne fell', color: '#b9b2a2', shape: 'square' },
          { label: 'King down (Check)', color: '#b9b2a2', shape: 'box' },
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
        table={{
          head: ['Time', 'What', 'Side'],
          rows: [
            ...o.bastions.map((b) => [
              clock(at(b.tick)),
              `Bastion fell (${laneName(b.lane)})`,
              teamWord(b.team),
            ]),
            ...o.throne.map((t) => [clock(at(t.tick)), 'Throne fell', teamWord(t.team)]),
            ...o.checks.map((c) => [
              clock(at(c.fromTick)),
              `Check until ${clock(at(c.toTick))}`,
              teamWord(c.team),
            ]),
          ].sort((x, y) => String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true })),
        }}
      >
        <Gantt
          label="Bastion and Throne falls per lane, with spells of Check"
          xMax={endSec}
          rows={rows}
          guides={guides}
          labelWidth={72}
          testid="chart-objectives-svg"
        />
      </ChartBox>
      <ChartBox
        testid="chart-orders"
        title="Pawns fielded and gambits played"
        legend={[
          { label: 'White', color: TEAM_COLOR.A },
          { label: 'Black', color: TEAM_COLOR.B },
        ]}
        table={{
          head: ['Order', 'White', 'Black'],
          rows: orders.map((r) => [r.label, r.a, r.b]),
        }}
      >
        <BarsH
          label="Pawns fielded and gambit cards played by each team"
          rows={orderRows}
          grouped
          rowHeight={38}
          labelWidth={104}
        />
      </ChartBox>
      <ChartBox
        testid="chart-tempo"
        title="Tempo spent"
        legend={[
          { label: 'Pawns', color: PAWN_COLOR },
          { label: 'Gambits', color: GAMBIT_COLOR },
        ]}
      >
        {(['A', 'B'] as const).map((t) => (
          <div class="rp-tempo" key={t}>
            <b class={`team${t}`}>{teamWord(t)}</b>
            <SplitBar
              label={`${teamWord(t)} Tempo: pawns and gambits`}
              testid={`tempo-${t}`}
              parts={[
                {
                  key: 'pawns',
                  label: 'Pawns',
                  value: sum.teams[t].tempoOnPawns,
                  color: PAWN_COLOR,
                },
                {
                  key: 'gambits',
                  label: 'Gambits',
                  value: sum.teams[t].tempoOnGambits,
                  color: GAMBIT_COLOR,
                },
              ]}
            />
          </div>
        ))}
      </ChartBox>
      <ChartBox
        testid="chart-pawns"
        title="Pawns fielded over time"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <TimeChart
          label="Pawns each team has fielded so far"
          xMax={endSec}
          series={[
            {
              id: 'A',
              label: 'White',
              color: TEAM_COLOR.A,
              pts: toPts(sum.series.pawnsFielded.A, 'count', tickRate),
              mode: 'step',
            },
            {
              id: 'B',
              label: 'Black',
              color: TEAM_COLOR.B,
              pts: toPts(sum.series.pawnsFielded.B, 'count', tickRate),
              mode: 'step',
              dash: '6 3',
            },
          ]}
          guides={guides}
          integerTicks
          height={160}
        />
      </ChartBox>
      <ChartBox testid="chart-events" title="Acts and pressure events">
        <ul class="rp-events">
          {guides.map((g, i) => (
            <li key={i} class={g.kind}>
              <b>{clock(g.t)}</b> {g.label}
            </li>
          ))}
          {guides.length === 0 && <li class="dim">None recorded.</li>}
        </ul>
        {pressure.length === 0 && guides.length > 0 && (
          <div class="tiny dim">No pressure events fired.</div>
        )}
        <div class="tiny dim">{full(sum.acts)} Acts in this match.</div>
      </ChartBox>
    </div>
  );
}
