import { Broadcast } from './Broadcast';
import { useSession } from './session';

/** Hosts the 3D game view. It is the only view of the match; the draft has no game behind it. */
export function Stage() {
  const s = useSession();
  const inGame = !!s.match && s.match.state.phase.kind !== 'draft';
  return <div class="stage">{inGame && <Broadcast />}</div>;
}
