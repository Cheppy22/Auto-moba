import { useMemo } from 'preact/hooks';
import { buildReport, inputFromMatch, type Report } from '../../analysis';
import { buildSummary, type MatchSummary, type PieceRow } from '../../analysis/summary';
import type { DamageType } from '../../sim';
import type { Guide } from '../charts';
import { useSession } from '../session';
import { mockSummary } from './mock';

export type TypeMix = Record<DamageType, number>;

export interface ReportData {
  sum: MatchSummary;
  /** The whole-match report: per-piece detail (gold by source, purchases, forks, deaths, paths). */
  report: Report;
  /** Seconds. */
  endSec: number;
  tickRate: number;
  /** Act boundaries and pressure events, shared by every time chart. */
  guides: Guide[];
  /** Damage each piece dealt to enemy pieces, by damage type. */
  dealtByType: Map<number, TypeMix>;
  /** Damage each piece took, by damage type. */
  takenByType: Map<number, TypeMix>;
  rowOf: (id: number) => PieceRow | undefined;
  /** True when a mock summary is showing (dev only). */
  mock: boolean;
}

const mix = (): TypeMix => ({ blade: 0, soul: 0, true: 0 });

/** Dev-only: `?mock` in the address shows the fixture summary instead of the real one. */
function wantsMock(): boolean {
  try {
    return import.meta.env.DEV && /[?&]mock(=|&|$)/.test(window.location.search);
  } catch {
    return false;
  }
}

/** Everything the report pages read, built once per finished match. */
export function useReportData(): ReportData {
  const s = useSession();
  const m = s.match!;
  const content = s.content;
  const events = m.events;
  const endTick = events.length ? events[events.length - 1].tick : 0;
  return useMemo(() => {
    const input = inputFromMatch(m, content);
    const report = buildReport(input, { kind: 'match' }, 'A');
    let sum = buildSummary(input);
    let mock = false;
    if (wantsMock()) {
      sum = mockSummary(report.roster, content);
      mock = true;
    }
    const tr = sum.tickRate || content.tuning.tickRate;
    const dealt = new Map<number, TypeMix>();
    const taken = new Map<number, TypeMix>();
    const isPiece = new Set(report.roster.map((r) => r.id));
    const guides: Guide[] = [];
    for (const e of events) {
      if (e.type === 'damage' && e.payload.tgtKind === 'hero') {
        const p = e.payload;
        if (isPiece.has(p.src)) {
          const d = dealt.get(p.src) ?? mix();
          d[p.dtype] += p.amount;
          dealt.set(p.src, d);
        }
        const t = taken.get(p.tgt) ?? mix();
        t[p.dtype] += p.amount;
        taken.set(p.tgt, t);
      } else if (e.type === 'phaseStart' && e.payload.kind === 'live' && e.payload.phase > 1) {
        guides.push({ t: e.tick / tr, kind: 'act', label: `Act ${e.payload.phase}` });
      }
    }
    for (const p of report.special.pressure)
      guides.push({ t: p.tick / tr, kind: 'pressure', label: `Pressure: ${p.name}` });
    if (mock) {
      // the fixture has no event log: give each piece a plausible mix of its own damage
      for (const r of sum.rows) {
        const k = (r.id % 3) / 10;
        dealt.set(r.id, {
          blade: r.damageDealt * (0.55 - k),
          soul: r.damageDealt * (0.4 + k),
          true: r.damageDealt * 0.05,
        });
        taken.set(r.id, {
          blade: r.damageTaken * 0.5,
          soul: r.damageTaken * 0.42,
          true: r.damageTaken * 0.08,
        });
      }
      guides.length = 0;
      sum.timeline
        .filter((t) => t.kind === 'act' && t.tick > 0)
        .forEach((t, i) => guides.push({ t: t.tick / tr, kind: 'act', label: `Act ${i + 2}` }));
      guides.push({ t: 560, kind: 'pressure', label: 'Pressure: Thinning Veil' });
    }
    const rowMap = new Map(sum.rows.map((r) => [r.id, r]));
    return {
      sum,
      report,
      endSec: Math.max(1, (sum.endTick || endTick) / tr),
      tickRate: tr,
      guides: guides.sort((a, b) => a.t - b.t),
      dealtByType: dealt,
      takenByType: taken,
      rowOf: (id: number) => rowMap.get(id),
      mock,
    };
  }, [m, content, endTick]);
}

/** [{tick, total|diff|count|rank}] -> chart points in seconds. */
export function toPts<T extends { tick: number }>(
  list: readonly T[],
  key: keyof T,
  tickRate: number,
): { t: number; v: number }[] {
  return list.map((p) => ({ t: p.tick / tickRate, v: p[key] as unknown as number }));
}

/** Short names for chart rows: "W Queen". */
export const shortName = (r: { team: 'A' | 'B'; pieceName: string }): string =>
  `${r.team === 'A' ? 'W' : 'B'} ${r.pieceName}`;
