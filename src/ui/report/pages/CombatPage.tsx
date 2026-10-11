import { useState } from 'preact/hooks';
import type { Fight } from '../../../analysis';
import type { PieceId } from '../../../sim';
import {
  BarsH,
  CAT,
  ChartBox,
  DAMAGE_COLOR,
  DAMAGE_LABEL,
  Gantt,
  TEAM_COLOR,
  TimeChart,
  clock,
  compact,
  full,
} from '../../charts';
import { PieceGlyph } from '../../pieces';
import { shortName, toPts, type ReportData } from '../data';
import { GuideKey } from '../Guides';
import { Portrait } from '../parts';

const TYPES = ['blade', 'soul', 'true'] as const;
const HEAL_COLOR = CAT.aqua;
const TAKEN_COLOR = CAT.red;
const MIT_COLOR = CAT.blue;

function FightList(props: { data: ReportData }) {
  const { report, rowOf, tickRate } = props.data;
  const [all, setAll] = useState(false);
  const fights = report.fights;
  const shown = all ? fights : fights.slice(0, 8);
  return (
    <div class="rp-fights" data-testid="fight-list">
      {fights.length === 0 && <div class="dim small">No fights between pieces were recorded.</div>}
      {shown.map((f: Fight, i) => {
        const total = f.damageA + f.damageB;
        return (
          <div class="rp-fight" key={f.id} data-testid={`fight-${f.id}`}>
            <div class="rp-fight-head">
              <b>
                {clock(f.startTick / tickRate)}–{clock(f.endTick / tickRate)}
              </b>
              <span class="dim tiny">
                Fight {i + 1} · {f.sideA.length} v {f.sideB.length}
              </span>
              <span class="tiny rp-fight-falls">
                {f.deaths.length === 0 ? 'No falls' : `${f.deathsA} White, ${f.deathsB} Black fell`}
              </span>
            </div>
            <div class="rp-fight-sides">
              <span class="rp-fight-side A">
                {f.sideA.map((id) => {
                  const r = rowOf(id);
                  return r ? <Portrait key={id} row={r} size={26} /> : null;
                })}
              </span>
              <span class="rp-fight-vs dim tiny">vs</span>
              <span class="rp-fight-side B">
                {f.sideB.map((id) => {
                  const r = rowOf(id);
                  return r ? <Portrait key={id} row={r} size={26} /> : null;
                })}
              </span>
            </div>
            <div
              class="rp-fight-dmg"
              title={`Damage: White ${full(f.damageA)}, Black ${full(f.damageB)}`}
            >
              <span class="tiny">{compact(f.damageA)}</span>
              <span class="rp-split-mini" aria-hidden="true">
                {total > 0 ? (
                  <>
                    <i style={{ flexGrow: f.damageA, background: TEAM_COLOR.A }} />
                    <i style={{ flexGrow: f.damageB, background: TEAM_COLOR.B }} />
                  </>
                ) : (
                  <i style={{ flexGrow: 1, background: 'var(--rule)' }} />
                )}
              </span>
              <span class="tiny">{compact(f.damageB)}</span>
            </div>
          </div>
        );
      })}
      {fights.length > 8 && (
        <button class="btn rp-more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Show fewer' : `Show all ${fights.length} fights`}
        </button>
      )}
    </div>
  );
}

export function CombatPage(props: { data: ReportData }) {
  const { sum, report, tickRate, endSec, guides, dealtByType } = props.data;
  const byDamage = [...sum.rows].sort((a, b) => b.damageDealt - a.damageDealt);
  const dealtRows = byDamage.map((r) => {
    const mix = dealtByType.get(r.id) ?? { blade: 0, soul: 0, true: 0 };
    return {
      id: String(r.id),
      label: shortName(r),
      glyph: <PieceGlyph piece={r.piece as PieceId} team={r.team} size={20} />,
      segs: TYPES.map((t) => ({
        key: t,
        label: DAMAGE_LABEL[t],
        value: mix[t],
        color: DAMAGE_COLOR[t],
      })),
    };
  });
  const maxBoth = Math.max(
    1,
    ...sum.rows.map((r) => Math.max(r.damageTaken, r.healingDone, r.mitigated)),
  );
  const takenRows = sum.rows.map((r) => ({
    id: String(r.id),
    label: shortName(r),
    glyph: <PieceGlyph piece={r.piece as PieceId} team={r.team} size={20} />,
    segs: [
      { key: 'taken', label: 'Damage taken', value: r.damageTaken, color: TAKEN_COLOR },
      { key: 'heal', label: 'Healing done', value: r.healingDone, color: HEAL_COLOR },
      { key: 'mit', label: 'Damage mitigated', value: r.mitigated, color: MIT_COLOR },
    ],
  }));
  const fightRows = [
    {
      id: 'fights',
      label: 'Fights',
      items: report.fights.map((f) => ({
        t0: f.startTick / tickRate,
        t1: f.endTick / tickRate,
        color: CAT.yellow,
        label: `Fight, ${f.sideA.length} v ${f.sideB.length}`,
      })),
    },
  ];
  return (
    <div class="rp-page-body grid" data-testid="page-combat-body">
      <GuideKey guides={guides} />
      <ChartBox
        testid="chart-dealt"
        title="Damage to pieces, by type"
        legend={TYPES.map((t) => ({ label: DAMAGE_LABEL[t], color: DAMAGE_COLOR[t] }))}
        table={{
          head: ['Piece', 'Blade', 'Soul', 'True', 'Total'],
          rows: dealtRows.map((r) => [
            r.label,
            ...r.segs.map((s) => full(s.value)),
            full(r.segs.reduce((a, s) => a + s.value, 0)),
          ]),
        }}
      >
        <BarsH
          label="Damage each piece dealt to enemy pieces, by damage type"
          rows={dealtRows}
          format={compact}
        />
      </ChartBox>
      <ChartBox
        testid="chart-taken"
        title="Damage taken, healing done and damage mitigated"
        legend={[
          { label: 'Damage taken', color: TAKEN_COLOR },
          { label: 'Healing done', color: HEAL_COLOR },
          { label: 'Damage mitigated', color: MIT_COLOR },
        ]}
        table={{
          head: ['Piece', 'Damage taken', 'Healing done', 'Damage mitigated'],
          rows: sum.rows.map((r) => [
            shortName(r),
            full(r.damageTaken),
            full(r.healingDone),
            full(r.mitigated),
          ]),
        }}
      >
        <BarsH
          label="Damage taken, healing done and damage mitigated, per piece"
          rows={takenRows}
          grouped
          max={maxBoth}
          rowHeight={54}
          format={compact}
        />
      </ChartBox>
      <ChartBox
        testid="chart-mitigated"
        title="Damage mitigated over time"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <TimeChart
          label="Damage each team's pieces have not taken so far, from armor, resist, shields and damage reduction"
          xMax={endSec}
          series={[
            {
              id: 'A',
              label: 'White mitigated',
              color: TEAM_COLOR.A,
              pts: toPts(sum.series.mitigated.A, 'total', tickRate),
              mode: 'line',
            },
            {
              id: 'B',
              label: 'Black mitigated',
              color: TEAM_COLOR.B,
              pts: toPts(sum.series.mitigated.B, 'total', tickRate),
              mode: 'line',
              dash: '6 3',
            },
          ]}
          guides={guides}
          yFormat={compact}
          height={170}
          testid="chart-mitigated-svg"
        />
      </ChartBox>
      <ChartBox
        testid="chart-kills"
        title="Kills over time"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <TimeChart
          label="Pieces each team has killed so far"
          xMax={endSec}
          series={[
            {
              id: 'A',
              label: 'White kills',
              color: TEAM_COLOR.A,
              pts: toPts(sum.series.kills.A, 'total', tickRate),
              mode: 'step',
            },
            {
              id: 'B',
              label: 'Black kills',
              color: TEAM_COLOR.B,
              pts: toPts(sum.series.kills.B, 'total', tickRate),
              mode: 'step',
              dash: '6 3',
            },
          ]}
          guides={guides}
          integerTicks
          height={170}
          testid="chart-kills-svg"
        />
      </ChartBox>
      <ChartBox
        testid="chart-alive"
        title="Pieces alive"
        legend={[
          { label: 'White', color: TEAM_COLOR.A, shape: 'line' },
          { label: 'Black', color: TEAM_COLOR.B, shape: 'line' },
        ]}
      >
        <TimeChart
          label="Pieces alive on each team over time"
          xMax={endSec}
          series={[
            {
              id: 'A',
              label: 'White alive',
              color: TEAM_COLOR.A,
              pts: toPts(sum.series.alive.A, 'count', tickRate),
              mode: 'step',
            },
            {
              id: 'B',
              label: 'Black alive',
              color: TEAM_COLOR.B,
              pts: toPts(sum.series.alive.B, 'count', tickRate),
              mode: 'step',
              dash: '6 3',
            },
          ]}
          yDomain={[0, 5]}
          guides={guides}
          integerTicks
          height={170}
          testid="chart-alive-svg"
        />
      </ChartBox>
      <ChartBox wide testid="chart-fights" title="Fights" note={`${report.fights.length} recorded`}>
        <Gantt
          label="When the fights between pieces happened"
          xMax={endSec}
          rows={fightRows}
          guides={guides}
          labelWidth={44}
        />
        <FightList data={props.data} />
      </ChartBox>
    </div>
  );
}
