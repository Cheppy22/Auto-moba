import {
  BarsH,
  ChartBox,
  TEAM_COLOR,
  SOURCE_COLORS,
  TimeChart,
  Strips,
  compact,
  full,
  type Marker,
} from '../../charts';
import { PieceGlyph } from '../../pieces';
import type { PieceId } from '../../../sim';
import { GuideKey } from '../Guides';
import { shortName, toPts, type ReportData } from '../data';

export const GOLD_GROUPS = [
  { key: 'passive', label: 'Passive income', color: SOURCE_COLORS[0] },
  { key: 'pawnlings', label: 'Pawnlings', color: SOURCE_COLORS[1] },
  { key: 'pawns', label: 'Pawns', color: SOURCE_COLORS[2] },
  { key: 'pieces', label: 'Kills and assists', color: SOURCE_COLORS[3] },
  { key: 'bastions', label: 'Bastions', color: SOURCE_COLORS[4] },
  { key: 'jungle', label: 'Jungle and events', color: SOURCE_COLORS[5] },
] as const;

export function goldGroup(source: string): (typeof GOLD_GROUPS)[number]['key'] {
  if (source === 'passive') return 'passive';
  if (source === 'lasthit') return 'pawnlings';
  if (source === 'pawn' || source === 'pawnTeam') return 'pawns';
  if (source === 'kill' || source === 'assist' || source === 'share') return 'pieces';
  if (source === 'tower') return 'bastions';
  return 'jungle';
}

export function EconomyPage(props: { data: ReportData }) {
  const { sum, report, tickRate, endSec, guides } = props.data;
  const lead = toPts(sum.series.goldLead, 'diff', tickRate);
  const leadAt = (t: number): number => {
    let v = 0;
    for (const p of lead) {
      if (p.t > t) break;
      v = p.v;
    }
    return v;
  };
  const markers: Marker[] = [
    ...sum.objectives.bastions.map<Marker>((b) => ({
      t: b.tick / tickRate,
      v: leadAt(b.tick / tickRate),
      shape: 'diamond',
      color: TEAM_COLOR[b.team],
      label: `${b.team === 'A' ? 'White' : 'Black'} Bastion fell`,
    })),
    ...sum.objectives.checks.map<Marker>((c) => ({
      t: c.fromTick / tickRate,
      v: leadAt(c.fromTick / tickRate),
      shape: 'tri',
      color: TEAM_COLOR[c.team],
      label: `${c.team === 'A' ? 'White' : 'Black'} in Check`,
    })),
  ];
  const sorted = [...sum.rows].sort((a, b) => b.goldEarned - a.goldEarned);
  const sourceRows = sorted.map((r) => {
    const hero = report.heroes.find((h) => h.id === r.id);
    const by: Record<string, number> = {};
    for (const [src, v] of Object.entries(hero?.goldBySource ?? {}))
      by[goldGroup(src)] = (by[goldGroup(src)] ?? 0) + v;
    return {
      id: String(r.id),
      label: shortName(r),
      glyph: <PieceGlyph piece={r.piece as PieceId} team={r.team} size={20} />,
      segs: GOLD_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        value: by[g.key] ?? 0,
        color: g.color,
      })),
    };
  });
  const mockSources = props.data.mock;
  const ranks = sum.rows.map((r) => {
    const s = sum.series.rank.find((x) => x.id === r.id);
    const pts = toPts(s?.points ?? [], 'rank', tickRate);
    if (pts.length === 0 || pts[0].t > 0) pts.unshift({ t: 0, v: 1 });
    return { id: String(r.id), label: shortName(r), color: TEAM_COLOR[r.team], pts, max: 8 };
  });
  return (
    <div class="rp-page-body grid" data-testid="page-economy-body">
      <GuideKey guides={guides} />
      <ChartBox
        testid="chart-lead"
        wide
        title="Gold lead over time"
        note="White above the line, Black below"
        legend={[
          { label: 'White ahead', color: TEAM_COLOR.A, shape: 'box' },
          { label: 'Black ahead', color: TEAM_COLOR.B, shape: 'box' },
          { label: 'Bastion fell', color: '#b9b2a2', shape: 'diamond' },
          { label: 'Check', color: '#b9b2a2', shape: 'tri' },
        ]}
        table={{
          head: ['Time', 'White lead'],
          rows: lead
            .filter((_, i) => i % 3 === 0)
            .map((p) => [
              `${Math.floor(p.t / 60)}:${String(Math.round(p.t % 60)).padStart(2, '0')}`,
              full(p.v),
            ]),
        }}
      >
        <TimeChart
          label="Gold lead over time, White above zero and Black below"
          xMax={endSec}
          series={[
            {
              id: 'lead',
              label: 'White lead',
              color: '#efe6d2',
              pts: lead,
              mode: 'line',
              fmt: (v) => (v >= 0 ? `White +${full(v)}` : `Black +${full(-v)}`),
            },
          ]}
          diverge={{ pos: TEAM_COLOR.A, neg: TEAM_COLOR.B }}
          markers={markers}
          guides={guides}
          yFormat={(v) => compact(v, true)}
          height={200}
          testid="chart-lead-svg"
        />
        <div class="ch-foot tiny dim">
          Marker colour shows whose Bastion fell or whose King fell.
        </div>
      </ChartBox>
      <ChartBox
        testid="chart-gold"
        title="Gold earned, by team"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <TimeChart
          label="Cumulative gold earned by each team"
          xMax={endSec}
          series={[
            {
              id: 'A',
              label: 'White',
              color: TEAM_COLOR.A,
              pts: toPts(sum.series.gold.A, 'total', tickRate),
              mode: 'line',
            },
            {
              id: 'B',
              label: 'Black',
              color: TEAM_COLOR.B,
              pts: toPts(sum.series.gold.B, 'total', tickRate),
              mode: 'line',
              dash: '6 3',
            },
          ]}
          guides={guides}
          yFormat={compact}
          height={180}
          testid="chart-gold-svg"
        />
      </ChartBox>
      <ChartBox
        testid="chart-sources"
        title="Gold by source, per piece"
        note={mockSources ? 'sample data' : undefined}
        legend={GOLD_GROUPS.map((g) => ({ label: g.label, color: g.color }))}
        table={{
          head: ['Piece', ...GOLD_GROUPS.map((g) => g.label)],
          rows: sourceRows.map((r) => [r.label, ...r.segs.map((s) => full(s.value))]),
        }}
      >
        <BarsH label="Gold earned by source for each piece" rows={sourceRows} format={compact} />
      </ChartBox>
      <ChartBox
        testid="chart-ranks"
        wide
        title="Rank over time"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <Strips
          label="Rank of every piece over time, Rank 1 to 8"
          xMax={endSec}
          rows={ranks}
          guides={guides}
        />
        <div class="ch-foot tiny dim">Each band runs from Rank 1 (bottom) to Rank 8 (top).</div>
      </ChartBox>
    </div>
  );
}
