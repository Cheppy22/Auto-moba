import { loadNodeContent } from './content-node';
import { Match } from '../src/sim';

const seed = Number(process.argv[2] ?? 1);
const content = loadNodeContent();
const t0 = process.hrtime.bigint();
const m = Match.create(content, { seed, autoGambits: { A: true, B: true } });
m.runToEnd();
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const s = m.state;
console.log(
  JSON.stringify(
    {
      seed,
      winner: s.winner,
      act: s.phase.n,
      checkmate: m.events.some((e) => e.type === 'checkmate'),
      minutes: +(s.tick / 20 / 60).toFixed(2),
      ticks: s.tick,
      events: m.events.length,
      ms: Math.round(ms),
      msPerTick: +(ms / Math.max(1, s.tick)).toFixed(3),
      kills: { A: s.teams.A.kills, B: s.teams.B.kills },
      bastions: { A: s.teams.A.towersDown, B: s.teams.B.towersDown },
      tempo: s.tempo,
      gambits: m.events.filter((e) => e.type === 'gambit').length,
      pawns: m.events.filter((e) => e.type === 'pawnFielded').length,
    },
    null,
    2,
  ),
);
