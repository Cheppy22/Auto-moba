import { useState } from 'preact/hooks';
import { useSession } from './session';

/** "Replay tutorial" (Title and Adjourn): the first-match nudges show again, once each. */
export function ReplayTutorial() {
  const s = useSession();
  const [done, setDone] = useState(false);
  return (
    <button
      class="btn small replay-tutorial"
      data-testid="replay-tutorial"
      aria-live="polite"
      onClick={() => {
        s.tutor.replay();
        setDone(true);
      }}
    >
      {done ? 'Tutorial will replay' : 'Replay tutorial'}
    </button>
  );
}
