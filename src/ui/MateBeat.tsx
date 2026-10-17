import { useEffect } from 'preact/hooks';
import { courtName } from '../analysis/text';
import { useSession } from './session';

/**
 * The Checkmate beat's frame: letterbox bars close in while the 3D view pushes in on the losing
 * King; as he hits the ground (the view says so) the word lands in the lower bar. A tap, Enter, Space or Escape
 * skips to the result splash.
 */
export function MateBeat() {
  const s = useSession();
  const beat = s.ui.mateBeat;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') s.endMateBeat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);
  if (!beat) return null;
  return (
    <div
      class="mate-beat"
      data-testid="mate-beat"
      data-winner={beat.winner}
      data-fallen={beat.fallen ? 'true' : 'false'}
      role="status"
      onClick={() => s.endMateBeat()}
    >
      <div class="mate-bar mate-top" />
      <div class="mate-bar mate-bottom">
        <div class="mate-words">
          <span class="mate-word">Checkmate</span>
          <span class="mate-sub">{courtName(beat.winner)} wins</span>
        </div>
      </div>
    </div>
  );
}
