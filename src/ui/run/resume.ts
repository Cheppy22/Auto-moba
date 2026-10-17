// Resume a match after a reload: play the saved command log back into a fresh match (the sim is
// deterministic, so this reaches the same position) and check the position against the fingerprint
// taken when the match was saved. The replay runs in slices so the page stays responsive and can
// show progress; it is the same loop as `Match.fromReplay`, cut into pieces.
import { hashContent, Match, type Content } from '../../sim';
import type { MatchSave } from './save';

/** Ticks per `step` call, and how long the page runs before it yields to the browser (ms). */
const CHUNK = 100;
const SLICE_MS = 40;

/** A short fingerprint of where a match stands: the tick, the event count and every unit's place and health. */
export function matchFingerprint(m: Match): string {
  const units = m.snapshot().units.map((u) => [u.id, u.x, u.y, u.hp, u.alive]);
  return hashContent({ tick: m.state.tick, events: m.events.length, units });
}

/** The save the next reload will find, taken from a live match. */
export function snapshotMatch(m: Match, run: MatchSave['run'], speed: number): MatchSave {
  return {
    v: 1,
    replay: m.exportReplay(),
    tick: m.state.tick,
    act: m.state.phase.n,
    run,
    speed,
    check: matchFingerprint(m),
  };
}

const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Rebuilds the saved match. `onProgress` gets 0..1 between slices. Throws if the replay does not
 * reproduce the saved position (a different version of the game, or a damaged save).
 */
export async function restoreMatch(
  content: Content,
  save: MatchSave,
  onProgress: (fraction: number) => void,
): Promise<Match> {
  const { replay } = save;
  if (replay.contentHash !== content.hash) throw new Error('saved with different content');
  const total = replay.ops.reduce((n, o) => n + (o.op === 'step' ? o.ticks : 0), 0) || 1;
  const m = Match.create(content, replay.config);
  let done = 0;
  let sliceStart = performance.now();
  for (const op of replay.ops) {
    if (op.op === 'issue') {
      m.issue(op.cmd);
      continue;
    }
    let left = op.ticks;
    while (left > 0) {
      const ran = m.step(Math.min(left, CHUNK));
      if (ran === 0) throw new Error(`the replay stalled at tick ${m.state.tick}`);
      left -= ran;
      done += ran;
      if (performance.now() - sliceStart > SLICE_MS) {
        onProgress(Math.min(1, done / total));
        await nextTask();
        sliceStart = performance.now();
      }
    }
  }
  if (m.state.tick !== save.tick)
    throw new Error(`the replay reached tick ${m.state.tick}, not ${save.tick}`);
  if (matchFingerprint(m) !== save.check)
    throw new Error('the replay did not match the saved position');
  onProgress(1);
  return m;
}
