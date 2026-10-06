import { TPS } from './combat';
import { pick, weightedPick } from './core/rng';
import type { Ctx } from './ctx';
import { giveGold } from './shop';
import { newUnit } from './units';
import type { Stats } from './content/schema';
import type { PlayTeam } from './types';

export function scheduleObelisks(ctx: Ctx): void {
  const n = ctx.s.phase.n;
  ctx.s.obeliskSchedule =
    n <= 3 ? ctx.t.obelisk.spawnSec.map((s) => ctx.s.tick + Math.round(s * TPS)) : [];
}

const OB_STATS: Stats = {
  maxHp: 1,
  hpRegen: 0,
  armor: 0,
  resist: 0,
  bladeDmg: 0,
  atkSpeed: 1,
  soulPower: 0,
  moveSpeed: 0,
  cdr: 0,
  range: 0,
  respawnMult: 1,
  incomeMult: 1,
  damageTakenMult: 1,
};

function spawnObelisk(ctx: Ctx): void {
  const slotsOpen = new Set(ctx.s.slots.filter((s) => s.open).map((s) => s.id));
  const taken = new Set(
    ctx.s.units.filter((u) => u.kind === 'obelisk' && u.alive).map((u) => u.obelisk!.nodeId),
  );
  const nodes = ctx.world.map.obeliskNodes.filter(
    (n) => (!n.slot || slotsOpen.has(n.slot)) && !taken.has(n.id),
  );
  if (nodes.length === 0) return;
  const node = pick(ctx.s.rng, 'mapgen', nodes);
  const u = newUnit(ctx, 'obelisk', 'neutral', 'obelisk', node.x, node.y, { ...OB_STATS });
  u.obelisk = {
    nodeId: node.id,
    claim: { A: 0, B: 0 },
    expireTick: ctx.s.tick + Math.round(ctx.t.obelisk.expireSec * TPS),
  };
  ctx.emit('obeliskSpawn', { unit: u.id, node: node.id, x: node.x, y: node.y });
}

function claim(ctx: Ctx, ob: ReturnType<Ctx['unit']> & object, team: PlayTeam): void {
  const cfg = ctx.t.obelisk;
  const reward = weightedPick(ctx.s.rng, 'loot', cfg.rewards, (r) => r.weight);
  const teamState = ctx.s.teams[team];
  teamState.points += cfg.points;
  ctx.emit('teamPoints', { team, amount: cfg.points, source: 'obelisk' });
  let label: string = reward.kind;
  let value = reward.value;
  if (reward.kind === 'points') {
    teamState.points += reward.value;
    ctx.emit('teamPoints', { team, amount: reward.value, source: 'obelisk-bonus' });
  } else if (reward.kind === 'gold') {
    for (const id of teamState.heroIds) {
      const h = ctx.unit(id);
      if (h) giveGold(ctx, h, reward.value, 'obelisk');
    }
  } else if (reward.kind === 'buff' && reward.stat && reward.mod) {
    for (const id of teamState.heroIds) {
      const h = ctx.unit(id);
      if (!h) continue;
      h.mods.push({
        id: `obelisk:${ob.id}:${reward.stat}`,
        stat: reward.stat,
        kind: reward.mod,
        value: reward.value,
        source: 'obelisk',
        tags: [],
        expiresTick: null,
      });
      h.dirty = true;
    }
    label = `buff:${reward.stat}`;
  } else if (reward.kind === 'unlock') {
    const locked = ctx.c.items.filter((i) => i.tier === 3 && !teamState.unlocks.includes(i.id));
    if (locked.length) {
      const it = pick(ctx.s.rng, 'loot', locked);
      teamState.unlocks.push(it.id);
      label = `unlock:${it.id}`;
    } else {
      teamState.points += 3;
      label = 'points';
      value = 3;
    }
  }
  ctx.emit('obeliskClaimed', { team, node: ob.obelisk!.nodeId, reward: label, value });
  ob.alive = false;
}

export function tickObelisks(ctx: Ctx): void {
  const tick = ctx.s.tick;
  while (ctx.s.obeliskSchedule.length && ctx.s.obeliskSchedule[0] <= tick) {
    ctx.s.obeliskSchedule.shift();
    spawnObelisk(ctx);
  }
  if (tick % 5 !== 0) return;
  const cfg = ctx.t.obelisk;
  const need = cfg.claimSec * TPS;
  for (const ob of ctx.s.units) {
    if (ob.kind !== 'obelisk' || !ob.alive || !ob.obelisk) continue;
    if (tick >= ob.obelisk.expireTick) {
      ob.alive = false;
      ctx.emit('obeliskExpired', { node: ob.obelisk.nodeId });
      continue;
    }
    const present: Record<PlayTeam, number> = { A: 0, B: 0 };
    for (const h of ctx.grid.query(ob.x, ob.y, cfg.radius)) {
      if (h.alive && h.kind === 'hero' && h.team !== 'neutral') present[h.team]++;
    }
    for (const team of ['A', 'B'] as PlayTeam[]) {
      const foe: PlayTeam = team === 'A' ? 'B' : 'A';
      if (present[team] > 0 && present[foe] === 0) ob.obelisk.claim[team] += 5;
      else if (present[team] === 0)
        ob.obelisk.claim[team] = Math.max(0, ob.obelisk.claim[team] - 3);
      if (ob.obelisk.claim[team] >= need) {
        claim(ctx, ob, team);
        break;
      }
    }
  }
}
