import { useMemo, useState } from 'preact/hooks';
import type { TimelineKind } from '../../../analysis/summary';
import { eventLines } from '../../../analysis/text';
import { TEAM_COLOR, clock } from '../../charts';
import { useSession } from '../../session';
import type { ReportData } from '../data';

type Filter = 'all' | 'kills' | 'structures' | 'ranks' | 'forks' | 'gambits' | 'events';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'kills', label: 'Kills' },
  { id: 'structures', label: 'Structures' },
  { id: 'ranks', label: 'Ranks' },
  { id: 'forks', label: 'Forks' },
  { id: 'gambits', label: 'Gambits' },
  { id: 'events', label: 'Events' },
];

const BUCKET: Record<TimelineKind, Filter> = {
  kill: 'kills',
  bastion: 'structures',
  throne: 'structures',
  check: 'structures',
  rank: 'ranks',
  fork: 'forks',
  gambit: 'gambits',
  act: 'events',
  event: 'events',
};

interface Line {
  tick: number;
  bucket: Filter;
  team: 'A' | 'B' | null;
  text: string;
}

export function LogPage(props: { data: ReportData }) {
  const s = useSession();
  const { sum, report, tickRate } = props.data;
  const [filter, setFilter] = useState<Filter>('all');
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = sum.timeline.map((e) => ({
      tick: e.tick,
      bucket: BUCKET[e.kind] ?? 'events',
      team: e.team,
      text: e.label,
    }));
    // jungle openings and obelisks are not in the summary timeline
    if (!props.data.mock)
      for (const l of eventLines(report, s.content, 'A'))
        if (l.kind === 'biome' || l.kind === 'obelisk')
          out.push({ tick: l.tick, bucket: 'events', team: l.team ?? null, text: l.text });
    return out.sort((a, b) => a.tick - b.tick);
  }, [sum, report, s.content, props.data.mock]);
  const count = (f: Filter): number =>
    f === 'all' ? lines.length : lines.filter((l) => l.bucket === f).length;
  const shown = filter === 'all' ? lines : lines.filter((l) => l.bucket === filter);
  return (
    <div class="rp-page-body" data-testid="page-log-body">
      <div
        class="rp-chips filters"
        role="radiogroup"
        aria-label="Filter the log"
        data-testid="log-filters"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={filter === f.id}
            class={`rp-chip ${filter === f.id ? 'on' : ''}`}
            data-testid={`log-filter-${f.id}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span class="dim tiny">{count(f.id)}</span>
          </button>
        ))}
      </div>
      <ol class="rp-log" data-testid="log-list">
        {shown.map((l, i) => (
          <li key={i} class={`rp-log-line ${l.team ?? ''}`}>
            <b>{clock(l.tick / tickRate)}</b>
            <i
              style={{ background: l.team ? TEAM_COLOR[l.team] : 'var(--faint)' }}
              aria-hidden="true"
            />
            <span>{l.text}</span>
          </li>
        ))}
        {shown.length === 0 && <li class="dim">Nothing of this kind was recorded.</li>}
      </ol>
    </div>
  );
}
