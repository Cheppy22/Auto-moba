// "New version ready" prompt. The app layer (src/app/pwa.ts) calls `offerUpdate` when a new build has
// finished downloading in the background; this shows a small bar on the title, between Tournament
// rounds and on the report, never during setup or a live match, so a reload never costs a match.
import { useEffect, useState } from 'preact/hooks';
import { useSession } from './session';

type Apply = () => void;

let offer: Apply | null = null;
const listeners = new Set<() => void>();

/** A new version is ready; `apply` swaps to it (and reloads the page). */
export function offerUpdate(apply: Apply): void {
  offer = apply;
  listeners.forEach((l) => l());
}

function useOffer(): Apply | null {
  const [, redraw] = useState(0);
  useEffect(() => {
    const l = (): void => redraw((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return offer;
}

export function UpdateNotice() {
  const apply = useOffer();
  const s = useSession();
  const quiet = !s.match || s.match.state.phase.kind === 'end';
  if (!apply || !quiet) return null;
  return (
    <div class="update-notice" role="status" data-testid="update-notice">
      <span>New version ready.</span>
      <button class="btn primary" data-testid="update-reload" onClick={apply}>
        Reload
      </button>
    </div>
  );
}
