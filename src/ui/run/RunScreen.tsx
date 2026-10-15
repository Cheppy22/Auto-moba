import { useSession } from '../session';
import { Draw } from './Draw';
import { RunSummary } from './RunSummary';
import { Spoils } from './Spoils';

/**
 * The run's screen between matches: the summary once it is over, Spoils while prizes are open,
 * else the draw. (Setup and the match are the ordinary screens, shown while a match exists.)
 */
export function RunScreen() {
  const s = useSession();
  const run = s.run!;
  if (run.status === 'champion' || run.status === 'out') return <RunSummary />;
  if (run.offers) return <Spoils />;
  return <Draw />;
}
