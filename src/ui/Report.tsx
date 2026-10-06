import { useMemo, useState } from 'preact/hooks';
import { buildReport, inputFromMatch, type Scope } from '../analysis';
import { HeroView } from './report/HeroView';
import { TeamView } from './report/TeamView';
import { useSession } from './session';

export function Report(props: { scope: 'phase' | 'match' }) {
  const s = useSession();
  const m = s.match!;
  const st = m.state;
  const current = st.phase.n;
  const [scope, setScope] = useState<Scope>(
    props.scope === 'match' ? { kind: 'match' } : { kind: 'phase', n: current },
  );
  const [skip, setSkip] = useState(false);
  const input = useMemo(
    () => inputFromMatch(m, s.content),
    [m, s.content, st.phase.kind, st.phase.n],
  );
  const key = scope.kind === 'match' ? 'match' : `phase${scope.n}`;
  const viewer =
    m.state.playerHeroId !== null
      ? (m.unitById(m.state.playerHeroId)?.team as 'A' | 'B')
      : undefined;
  const report = useMemo(() => buildReport(input, scope, viewer), [input, key, viewer]);
  const whole = useMemo(() => buildReport(input, { kind: 'match' }, viewer), [input, viewer]);
  const phases = whole.phases;
  const hero = s.ui.reportHero;
  const title = props.scope === 'match' ? 'Match report' : `Phase ${current} report`;
  return (
    <div class="overlay" data-testid="report" style={{ alignItems: 'flex-start' }}>
      <div class="panel col" style={{ width: 'min(1280px,100%)' }}>
        <div class="row wrap">
          <h2 class="grow" style={{ margin: 0 }}>
            {title}
          </h2>
          {st.winner && (
            <span class="chip gold" data-testid="winner">
              Team {st.winner} destroyed the enemy guardian
            </span>
          )}
          <button class={`btn small ${skip ? 'on' : ''}`} onClick={() => setSkip(!skip)}>
            Skip animation
          </button>
        </div>
        <div class="row wrap">
          {phases.map((n) => (
            <button
              key={n}
              class={`btn small ${scope.kind === 'phase' && scope.n === n ? 'on' : ''}`}
              data-testid={`scope-${n}`}
              onClick={() => setScope({ kind: 'phase', n })}
            >
              Phase {n}
            </button>
          ))}
          <button
            class={`btn small ${scope.kind === 'match' ? 'on' : ''}`}
            data-testid="scope-match"
            onClick={() => setScope({ kind: 'match' })}
          >
            Whole match
          </button>
          <div class="grow" />
          {props.scope === 'phase' && (
            <button
              class="btn primary"
              data-testid="continue"
              onClick={() => s.issue({ type: 'continue' })}
            >
              On to phase {current + 1}
            </button>
          )}
          {props.scope === 'match' && (
            <button class="btn primary" data-testid="new-match" onClick={() => s.reset()}>
              New match
            </button>
          )}
        </div>
        <div class="scroll" style={{ maxHeight: 'calc(100vh - 150px)' }}>
          {hero === null ? (
            <TeamView report={report} skip={skip} />
          ) : (
            <HeroView report={report} heroId={hero} biomes={whole.special.biomes} />
          )}
        </div>
      </div>
    </div>
  );
}
