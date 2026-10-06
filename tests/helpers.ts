import { loadNodeContent } from '../tools/content-node';
import { Match, hashContent } from '../src/sim';
import type { MatchConfig } from '../src/sim';

export const content = loadNodeContent();

export function runAi(seed: number, maxPhases = 12): Match {
  const m = Match.create(content, { seed, player: null });
  m.runToEnd(maxPhases);
  return m;
}

export function runCfg(config: MatchConfig, maxPhases = 12): Match {
  const m = Match.create(content, config);
  m.runToEnd(maxPhases);
  return m;
}

export const logHash = (m: Match): string => hashContent({ e: m.events, s: m.samples });
