import { useMemo, useState } from 'preact/hooks';
import { buildReport, inputFromMatch, type Scope } from '../analysis';
import { courtName } from '../analysis/text';
import { HeroView } from './report/HeroView';
import { EventLog, Scoreboard, Takeaways } from './report/TeamView';
import { PieceGlyph } from './pieces';
import { useLayout } from './layout';
import { useEscape, useSession } from './session';

/** The end screen: who won, then the match report (whole match or one Act). */
export function Report() {
  const s = useSession();
  const m = s.match!;
  const st = m.state;
  const [scope, setScope] = useState<Scope>({ kind: 'match' });
  const [open, setOpen] = useState(false);
  const input = useMemo(() => inputFromMatch(m, s.content), [m, s.content, st.phase.kind]);
  const key = scope.kind === 'match' ? 'match' : `act${scope.n}`;
  const report = useMemo(() => buildReport(input, scope, 'A'), [input, key]);
  const whole = useMemo(() => buildReport(input, { kind: 'match' }, 'A'), [input]);
  const acts = whole.phases;
  const hero = s.ui.reportHero;
  const showDetails = open || hero !== null;
  useEscape(showDetails, () => {
    setOpen(false);
    s.setUi({ reportHero: null });
  });
  const layout = useLayout();
  const items: Record<number, string[]> = {};
  for (const h of report.heroes) items[h.id] = [...(m.unitById(h.id)?.hero?.items ?? [])];
  const win = st.winner;
  return (
    <div class="overlay" data-testid="report" style={{ alignItems: 'flex-start' }}>
      <div class="panel col report-panel">
        <div class={`verdict ${win ?? 'draw'}`} data-testid="verdict">
          <PieceGlyph piece="king" team={win === 'B' ? 'B' : 'A'} size={40} />
          <div class="grow">
            <h2 data-testid="winner" style={{ margin: 0 }}>
              {win ? `Checkmate: ${courtName(win)} wins` : 'No checkmate: the match is drawn'}
            </h2>
            <div class="dim small" data-testid="courts">
              White (you) vs Black · {st.phase.n} {st.phase.n === 1 ? 'Act' : 'Acts'}
            </div>
          </div>
          <button class="btn primary" data-testid="new-match" onClick={() => s.reset()}>
            New match
          </button>
        </div>
        <div class="row wrap">
          {acts.map((n) => (
            <button
              key={n}
              class={`btn small ${scope.kind === 'phase' && scope.n === n ? 'on' : ''}`}
              data-testid={`scope-${n}`}
              onClick={() => setScope({ kind: 'phase', n })}
            >
              Act {n}
            </button>
          ))}
          <button
            class={`btn small ${scope.kind === 'match' ? 'on' : ''}`}
            data-testid="scope-match"
            onClick={() => setScope({ kind: 'match' })}
          >
            Whole match
          </button>
        </div>
        <div class="scroll report-scroll col">
          <Takeaways report={report} folded={layout === 'landscape'} />
          <Scoreboard report={report} items={items} />
          <section class="details">
            <button
              class="btn details-toggle"
              data-testid="details-toggle"
              aria-expanded={showDetails}
              onClick={() => setOpen(!showDetails)}
            >
              <span aria-hidden="true">{showDetails ? '▾' : '▸'}</span> Details
              <span class="dim small"> replay, paths, charts and events</span>
            </button>
            {showDetails && (
              <div class="col details-body" data-testid="details">
                {hero === null ? (
                  <>
                    <div class="dim small">Click a piece in the scoreboard to open its replay.</div>
                    <EventLog report={report} />
                  </>
                ) : (
                  <HeroView report={report} heroId={hero} biomes={whole.special.biomes} />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
