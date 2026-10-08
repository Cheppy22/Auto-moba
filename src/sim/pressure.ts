import { TPS } from './combat';
import { rand } from './core/rng';
import type { Ctx } from './ctx';
import { dirtyAll } from './stats';
import { makeMinion } from './units';
import { laneWaypoints, laneT } from './world/map';
import type { LaneId } from './content/schema';
import type { PlayTeam } from './types';

export function applyPressure(ctx: Ctx): void {
  const n = ctx.s.phase.n;
  for (const ev of ctx.c.pressure) {
    if (n < ev.fromPhase || ctx.s.pressure.includes(ev.id)) continue;
    ctx.s.pressure.push(ev.id);
    for (const [tag, m] of Object.entries(ev.tagMult))
      ctx.s.tagMult[tag] = (ctx.s.tagMult[tag] ?? 1) * m;
    ctx.emit('pressure', { event: ev.id, name: ev.name });
    dirtyAll(ctx);
  }
}

function tideWave(ctx: Ctx): void {
  const dirTeam: PlayTeam = rand(ctx.s.rng, 'mapgen') < 0.5 ? 'A' : 'B';
  const scale = 1 + ctx.t.waves.scalePerPhase * (ctx.s.phase.n - 1) + 0.2;
  for (const slot of ctx.s.slots) {
    if (!slot.open) continue;
    const def = ctx.world.map.slots.find((s) => s.id === slot.id)!;
    const port = def.ports[0];
    const lane: LaneId = port.lane;
    const wps = laneWaypoints(ctx.world, dirTeam, lane);
    const lg = ctx.world.lanes[lane];
    const portT = port.t;
    const prog = dirTeam === 'A' ? portT : 1 - portT;
    const startIdx = wps.findIndex((w) => {
      const t = laneT(lg, w[0], w[1]);
      return (dirTeam === 'A' ? t : 1 - t) > prog + 0.01;
    });
    const path: [number, number][] = [[def.x, def.y], ...wps.slice(Math.max(0, startIdx))];
    for (let i = 0; i < 3; i++) {
      const u = makeMinion(ctx, dirTeam, lane, 'melee', scale, 0);
      u.team = 'neutral';
      u.defId = 'tide_spirit';
      u.bounty = 12;
      u.x = def.x + (i - 1) * 10;
      u.y = def.y + 6;
      u.px = u.x;
      u.py = u.y;
      u.path = path;
      u.pathI = 0;
    }
  }
}

export function tickSpiritTide(ctx: Ctx): void {
  if (!ctx.s.pressure.includes('spirit_tide')) return;
  if (ctx.s.tick < ctx.s.tideNextTick) return;
  ctx.s.tideNextTick = ctx.s.tick + 30 * TPS;
  tideWave(ctx);
}
