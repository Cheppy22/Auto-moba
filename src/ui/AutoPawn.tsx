import type { Snapshot } from '../sim';
import { useSession } from './session';

/**
 * The on/off switch for automatic pawn fielding (the standing plan from Orders). Off keeps the
 * counts but fields nothing for you; the Field Pawn button still works. Remembered for the match.
 */
export function AutoPawn(props: { snap: Snapshot; testId: string }) {
  const s = useSession();
  const on = props.snap.pawnPlan?.auto ?? false;
  return (
    <button
      class={`autopawn ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      data-testid={props.testId}
      title="Fields pawns for you toward your Orders counts while Tempo stays above the reserve"
      onClick={() => s.issue({ type: 'setPawnAuto', auto: !on })}
    >
      <span class="autopawn-track" aria-hidden="true">
        <i />
      </span>
      <span class="autopawn-label">Auto pawns</span>
      <b>{on ? 'On' : 'Off'}</b>
    </button>
  );
}
