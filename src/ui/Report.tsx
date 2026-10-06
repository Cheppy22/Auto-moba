import { useSession } from './session';

export function Report(props: { scope: 'phase' | 'match' }) {
  const s = useSession();
  const m = s.match!;
  const st = m.state;
  return (
    <div class="overlay" data-testid="report">
      <div class="panel col" style={{ width: 'min(700px,100%)' }}>
        <h2>{props.scope === 'match' ? 'Match report' : `Phase ${st.phase.n} report`}</h2>
        {st.winner && <div data-testid="winner">Winner: team {st.winner}</div>}
        <div class="row">
          {props.scope === 'phase' && (
            <button
              class="btn primary"
              data-testid="continue"
              onClick={() => s.issue({ type: 'continue' })}
            >
              Continue
            </button>
          )}
          {props.scope === 'match' && (
            <button class="btn primary" onClick={() => s.reset()}>
              New match
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
