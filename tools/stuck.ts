// Stuck diagnostic: share of hero ticks spent in runs of >= 40 ticks where the hero wanted to
// move (a chase target out of range, or a path to follow) but moved under 20% of its step.
import { loadNodeContent } from './content-node';
import { Match } from '../src/sim';

const seeds = process.argv.slice(2).map(Number);
if (seeds.length === 0) seeds.push(1, 2, 3);
const content = loadNodeContent();
const MIN_RUN = 40;
let heroTicks = 0;
let stuckTicks = 0;
let runs = 0;

for (const seed of seeds) {
  const m = Match.create(content, { seed, player: null });
  const run = new Map<number, number>();
  for (let guard = 0; guard < 60; guard++) {
    const s = m.state;
    if (s.phase.kind === 'end') break;
    if (s.phase.kind !== 'live') {
      if (!m.autoAdvance().ok) break;
      continue;
    }
    while (m.state.phase.kind === 'live') {
      m.step(1);
      for (const u of m.state.units) {
        if (u.kind !== 'hero' || !u.alive || !u.hero) continue;
        heroTicks++;
        const h = u.hero;
        const t = u.targetId === null ? undefined : m.unitById(u.targetId);
        const pad = t && (t.kind === 'tower' || t.kind === 'guardian') ? 16 : 4;
        const inRange = !!t && t.alive && Math.hypot(u.x - t.x, u.y - t.y) <= u.stats.range + pad;
        const wp = u.path[u.pathI];
        const hasPath = !!wp && Math.hypot(u.x - wp[0], u.y - wp[1]) >= 1;
        const wants =
          !h.recall &&
          h.engage !== 'hold' &&
          !inRange &&
          (hasPath || (!!t && t.alive && h.engage === 'fight'));
        const step = u.stats.moveSpeed / 20;
        const moved = Math.hypot(u.x - u.px, u.y - u.py);
        if (wants && step >= 1 && moved < step * 0.2) {
          const n = (run.get(u.id) ?? 0) + 1;
          run.set(u.id, n);
          if (n === MIN_RUN) {
            runs++;
            stuckTicks += MIN_RUN;
          } else if (n > MIN_RUN) stuckTicks++;
        } else run.set(u.id, 0);
      }
    }
  }
}
console.log(
  JSON.stringify({
    seeds,
    heroTicks,
    stuckTicks,
    runs,
    stuckPct: +((100 * stuckTicks) / Math.max(1, heroTicks)).toFixed(3),
  }),
);
