import { loadNodeContent } from '../tools/content-node';
import { Match, hashContent } from '../src/sim';
import type { BellStage, MatchConfig, PieceId, PlayTeam, Unit } from '../src/sim';

export const content = loadNodeContent();

/** A live match (White's default setup), AI on both sides unless the config says otherwise. */
export function liveMatch(seed: number, config: Partial<MatchConfig> = {}): Match {
  const m = Match.create(content, { seed, autoGambits: { A: true, B: true }, ...config });
  if (m.state.phase.kind === 'setup') m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  return m;
}

/** Steps until Act `n` has begun (the bell makes an Act a little longer than its clock). */
export function toAct(m: Match, n: number): void {
  while (m.state.phase.kind === 'live' && m.state.phase.n < n) if (m.step(1) === 0) break;
}

/** Steps until the bell reaches `stage`. */
export function toBell(m: Match, stage: BellStage): void {
  while (m.state.phase.kind === 'live' && m.state.bell.stage !== stage) if (m.step(1) === 0) break;
}

export function runAi(seed: number, maxPhases = 12): Match {
  const m = liveMatch(seed);
  m.runToEnd(maxPhases);
  return m;
}

export function runCfg(config: MatchConfig, maxPhases = 12): Match {
  const m = Match.create(content, config);
  m.runToEnd(maxPhases);
  return m;
}

/** A team's piece unit by piece id. */
export function piece(m: Match, team: PlayTeam, id: PieceId): Unit {
  for (const uid of m.state.teams[team].heroIds) {
    const u = m.unitById(uid)!;
    if (u.hero!.defId === id) return u;
  }
  throw new Error(`no ${id} on ${team}`);
}

export const logHash = (m: Match): string => hashContent({ e: m.events, s: m.samples });
