import { useMemo } from 'preact/hooks';
import type { ActTechTally, Content, School, TechTally } from '../../sim';
import { SCHOOL_COLOR, SchoolGlyph } from '../schools';
import { useSession } from '../session';
import { ChartBox } from '../charts';
import { counted, effectOf, tallyText, zeroTally } from '../builds/tally';

/** One Technique a piece held at some point: per-Act effect and the match total. */
export interface TotalsRow {
  id: string;
  name: string;
  school: School;
  held: boolean;
  /** Index 0 is Act 1. */
  perAct: TechTally[];
  total: TechTally;
}

/**
 * The end report's per-Technique totals for one piece: every Technique it held or that counted
 * anything, with what it did in each Act and over the match. Pure, so a unit test can check that
 * the Acts add up to the match.
 */
export function totalsFor(
  c: Content,
  log: readonly ActTechTally[],
  heroId: number,
  finalIds: readonly string[],
): TotalsRow[] {
  const acts = log.reduce((n, r) => Math.max(n, r.act), 0);
  const ids = new Set<string>(finalIds);
  for (const r of log)
    for (const key of Object.keys(r.techniques)) {
      const [h, id] = key.split(':');
      if (Number(h) === heroId) ids.add(id);
    }
  const rows: TotalsRow[] = [];
  for (const id of ids) {
    const def = c.techniqueById.get(id);
    if (!def) continue;
    const perAct = Array.from({ length: acts }, (_, i) => {
      const t = log.find((r) => r.act === i + 1)?.techniques[`${heroId}:${id}`];
      return t ? { ...t } : zeroTally();
    });
    const total = zeroTally();
    for (const t of perAct) {
      total.damage += t.damage;
      total.heal += t.heal;
      total.shield += t.shield;
      total.procs += t.procs;
    }
    rows.push({
      id,
      name: def.name,
      school: def.school,
      held: finalIds.includes(id),
      perAct,
      total,
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.held) - Number(a.held) ||
      effectOf(b.total) - effectOf(a.total) ||
      a.name.localeCompare(b.name),
  );
}

const short = (v: number): string =>
  v >= 10_000
    ? `${Math.round(v / 1000)}k`
    : v >= 1000
      ? `${(v / 1000).toFixed(1)}k`
      : String(Math.round(v));

/** What each of a piece's Techniques did in each Act and over the match (the Pieces page). */
export function TechniqueTotals(props: { heroId: number; finalIds: readonly string[] }) {
  const s = useSession();
  const m = s.match!;
  const rows = useMemo(
    () => totalsFor(s.content, m.techniqueLog(), props.heroId, props.finalIds),
    [s.content, m, props.heroId, props.finalIds],
  );
  const acts = rows[0]?.perAct.length ?? 0;
  return (
    <ChartBox
      testid="piece-technique-totals"
      title="What its Techniques did"
      note="damage, healing and shields added, by Act"
    >
      {rows.length === 0 ? (
        <p class="dim tiny">It held no Techniques.</p>
      ) : (
        <ul class="tt">
          {rows.map((r) => (
            <li
              key={r.id}
              class="tt-row"
              data-testid={`tt-${r.id}`}
              style={{ '--school': SCHOOL_COLOR[r.school] }}
            >
              <span class="tt-name">
                <SchoolGlyph school={r.school} size={14} />
                <b>{r.name}</b>
                {!r.held && <span class="dim tiny"> replaced</span>}
              </span>
              {acts > 0 && (
                <span class="tt-acts" style={{ '--n': acts }}>
                  {r.perAct.map((t, i) => (
                    <span
                      key={i}
                      class={`tt-act ${counted(t) ? '' : 'none'}`}
                      title={`Act ${i + 1}: ${tallyText(t, 'nothing counted')}`}
                    >
                      <span class="tt-n">
                        {effectOf(t) >= 1 ? short(effectOf(t)) : t.procs > 0 ? `×${t.procs}` : '·'}
                      </span>
                      <span class="tt-l tiny">Act {i + 1}</span>
                    </span>
                  ))}
                </span>
              )}
              <span class="tt-total tiny" data-testid={`tt-total-${r.id}`}>
                Match: {tallyText(r.total, 'nothing to count (it changes stats)')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartBox>
  );
}
