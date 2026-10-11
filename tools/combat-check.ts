// Combat legibility, AI judgement and stuck check over many AI-vs-AI matches.
// `npm run combat-check -- --matches 200 --seed 29000` prints one JSON line with:
// - stuckUnits: units (pieces, pawns, pawnlings) that wanted to move but stood still for more than
//   `--stuck-sec` (10) seconds, outside combat and away from their base; plus the worst run.
// - spacing: in-combat units with a same-team body touching theirs (blob share), mean gap to the
//   nearest same-team unit, and the share of melee attackers standing on their own side of the
//   target (two lines).
// - judgement: piece deaths in enemy Bastion/Throne range, low-health pieces fighting in tower range,
//   piece deaths by cause, and fight/flee flip-flops (a change back within 2 s).
import { loadNodeContent } from './content-node';
import { Match } from '../src/sim';
import type { Unit } from '../src/sim';
import { bodyRadius } from '../src/sim/collision';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const matches = arg('matches', 20);
const seed0 = arg('seed', 29000);
const stuckSec = arg('stuck-sec', 10);
const content = loadNodeContent();
const TPS = 20;
// --max-min M: stop each match after M minutes of play (a quick probe of the early game).
const maxTicks = arg('max-min', 40) * 60 * TPS;

const out = {
  matches,
  seed: seed0,
  stuckUnits: 0,
  stuckWorstSec: 0,
  stuckByKind: {} as Record<string, number>,
  stuckSamples: [] as string[],
  combatSamples: 0,
  blobShare: 0,
  nearestGap: 0,
  meleeSamples: 0,
  ownSideShare: 0,
  pieceDeaths: 0,
  deathsInTowerRange: 0,
  lowHpTowerFightTicks: 0,
  causes: {} as Record<string, number>,
  flipFlops: 0,
  engageChanges: 0,
  minutes: 0,
  whiteWins: 0,
  medianMin: 0,
  // mean minute of the first Throne kill, over the matches that had one
  throneMin: 0,
  thronesDown: 0,
  bastionsDown: 0,
  // [match minutes, minute of the first Throne kill]
  perMatch: [] as [number, number | null][],
  goals: {} as Record<string, number>,
  time: { all: 0, dead: 0, recall: 0, base: 0, flee: 0, retreat: 0, hold: 0 },
};

function enemyStructureNear(m: Match, u: Unit, pad: number): boolean {
  for (const s of m.state.units) {
    if (!s.alive || (s.kind !== 'tower' && s.kind !== 'guardian')) continue;
    if (s.team === u.team || s.team === 'neutral') continue;
    if (Math.hypot(u.x - s.x, u.y - s.y) <= s.stats.range + pad) return true;
  }
  return false;
}

let gapSum = 0;
const lengths: number[] = [];
let blob = 0;
let ownSide = 0;
for (let k = 0; k < matches; k++) {
  const m = Match.create(content, { seed: seed0 + k, autoGambits: { A: true, B: true } });
  m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  const ctx = m.ctx;
  const still = new Map<number, number>();
  const counted = new Set<number>();
  const lastEngage = new Map<number, { e: string; tick: number }>();
  let seen = 0;
  let evI = 0;
  let throneAt = -1;
  while (m.state.phase.kind === 'live' && m.state.tick < maxTicks) {
    if (m.step(1) === 0) break;
    const s = m.state;
    for (; evI < m.events.length; evI++) {
      const e = m.events[evI];
      if (e.type === 'throneDown' && throneAt < 0) throneAt = e.tick;
      if (e.type === 'structureDown') out.bastionsDown++;
      if (e.type !== 'death') continue;
      const p = e.payload as {
        id: number;
        kind: string;
        x: number;
        y: number;
        fall?: { cause: string };
      };
      if (p.kind !== 'hero') continue;
      out.pieceDeaths++;
      const c = p.fall?.cause ?? 'none';
      out.causes[c] = (out.causes[c] ?? 0) + 1;
      const v = ctx.unit(p.id)!;
      if (enemyStructureNear(m, { ...v, x: p.x, y: p.y } as Unit, 10)) out.deathsInTowerRange++;
    }
    if (s.bell.stage !== 'none' && s.bell.stage !== 'pending') {
      still.clear();
      continue;
    }
    const tick = s.tick;
    for (const u of s.units) {
      if (!u.alive || (u.kind !== 'hero' && u.kind !== 'minion') || u.ev) {
        still.delete(u.id);
        continue;
      }
      if (u.team === 'neutral') continue;
      const base = ctx.world.basePos[u.team];
      const t = u.targetId === null ? undefined : ctx.unit(u.targetId);
      const pad = t && (t.kind === 'tower' || t.kind === 'guardian') ? 16 : 4;
      const inRange = !!t && t.alive && Math.hypot(u.x - t.x, u.y - t.y) <= u.stats.range + pad;
      const fighting = inRange || tick - u.lastDamagedTick <= 30;
      const atBase = Math.hypot(u.x - base.x, u.y - base.y) <= ctx.t.ai.healBaseRadius + 60;
      const stunned = u.stunUntil !== undefined && u.stunUntil > tick;
      const wp = u.path[u.pathI];
      const hasPath = !!wp && Math.hypot(u.x - wp[0], u.y - wp[1]) >= ctx.t.movement.arriveDist;
      const h = u.hero;
      const wants =
        !fighting &&
        !atBase &&
        !stunned &&
        !(h && (h.recall || h.engage === 'hold')) &&
        (hasPath || (!!t && t.alive && (!h || h.engage === 'fight')));
      const step = (u.stats.moveSpeed * ctx.t.movement.speedMul) / TPS;
      const moved = Math.hypot(u.x - u.px, u.y - u.py);
      if (wants && step >= 0.5 && moved < step * 0.2) {
        const n = (still.get(u.id) ?? 0) + 1;
        still.set(u.id, n);
        out.stuckWorstSec = Math.max(out.stuckWorstSec, n / TPS);
        if (n === stuckSec * TPS && !counted.has(u.id)) {
          counted.add(u.id);
          out.stuckUnits++;
          const kind = u.kind === 'hero' ? 'piece' : u.pawn ? 'pawn' : 'pawnling';
          out.stuckByKind[kind] = (out.stuckByKind[kind] ?? 0) + 1;
          if (out.stuckSamples.length < 8)
            out.stuckSamples.push(
              `seed ${seed0 + k} t${tick} ${kind}#${u.id} ${u.team} at ${u.x.toFixed(0)},${u.y.toFixed(0)}`,
            );
        }
      } else still.set(u.id, 0);
      if (h) {
        const le = lastEngage.get(u.id);
        if (le && le.e !== h.engage) {
          out.engageChanges++;
          if (tick - le.tick <= 2 * TPS && (le.e === 'flee') !== (h.engage === 'flee'))
            out.flipFlops++;
        }
        if (!le || le.e !== h.engage) lastEngage.set(u.id, { e: h.engage, tick });
      }
    }
    if (tick % 5 !== 0) continue;
    // spacing samples: units whose target is in reach
    for (const u of s.units) {
      if (!u.alive || (u.kind !== 'hero' && u.kind !== 'minion') || u.ev || u.team === 'neutral')
        continue;
      const t = u.targetId === null ? undefined : ctx.unit(u.targetId);
      if (!t || !t.alive || t.kind === 'tower' || t.kind === 'guardian') continue;
      const d = Math.hypot(u.x - t.x, u.y - t.y);
      if (d > u.stats.range + 8) continue;
      const ru = bodyRadius(ctx, u);
      let best = Infinity;
      let touching = false;
      for (const o of ctx.grid.query(u.x, u.y, 60)) {
        if (o === u || !o.alive || o.team !== u.team || (o.kind !== 'hero' && o.kind !== 'minion'))
          continue;
        const g = Math.hypot(u.x - o.x, u.y - o.y) - ru - bodyRadius(ctx, o);
        if (g < best) best = g;
        if (g < 1) touching = true;
      }
      out.combatSamples++;
      if (touching) blob++;
      gapSum += Math.min(best, 40);
      if (u.stats.range <= 40) {
        const base = ctx.world.basePos[u.team];
        const bx = base.x - t.x;
        const by = base.y - t.y;
        out.meleeSamples++;
        if ((u.x - t.x) * bx + (u.y - t.y) * by > 0) ownSide++;
      }
    }
    for (const u of s.units) {
      if (!u.hero || u.team === 'neutral') continue;
      out.time.all++;
      if (!u.alive) {
        out.time.dead++;
        continue;
      }
      const hb = ctx.world.basePos[u.team];
      if (u.hero.recall) out.time.recall++;
      else if (Math.hypot(u.x - hb.x, u.y - hb.y) <= ctx.t.ai.healBaseRadius + 60) out.time.base++;
      else if (u.hero.engage === 'flee') out.time.flee++;
      else if (u.hero.goal?.kind === 'retreat') out.time.retreat++;
      else if (u.hero.engage === 'hold') out.time.hold++;
      const gk = u.hero.goal?.kind ?? 'none';
      out.goals[gk] = (out.goals[gk] ?? 0) + 1;
      if (u.hp / u.stats.maxHp < 0.35 && u.hero.engage === 'fight' && enemyStructureNear(m, u, 0))
        out.lowHpTowerFightTicks += 5;
    }
    seen = tick;
  }
  out.minutes += seen / TPS / 60;
  lengths.push(seen / TPS / 60);
  out.perMatch.push([
    +(seen / TPS / 60).toFixed(1),
    throneAt < 0 ? null : +(throneAt / TPS / 60).toFixed(1),
  ]);
  if (throneAt >= 0) {
    out.throneMin += throneAt / TPS / 60;
    out.thronesDown++;
  }
  if (m.state.winner === 'A') out.whiteWins++;
  process.stderr.write(`${k + 1}/${matches}\r`);
}
out.blobShare = +(blob / Math.max(1, out.combatSamples)).toFixed(3);
out.nearestGap = +(gapSum / Math.max(1, out.combatSamples)).toFixed(2);
out.ownSideShare = +(ownSide / Math.max(1, out.meleeSamples)).toFixed(3);
out.minutes = +out.minutes.toFixed(1);
out.throneMin = +(out.throneMin / Math.max(1, out.thronesDown)).toFixed(2);
for (const k of Object.keys(out.time) as (keyof typeof out.time)[])
  if (k !== 'all') out.time[k] = +(out.time[k] / Math.max(1, out.time.all)).toFixed(3);
lengths.sort((a, b) => a - b);
out.medianMin = +(lengths[Math.floor(lengths.length / 2)] ?? 0).toFixed(2);
console.log(JSON.stringify(out));
