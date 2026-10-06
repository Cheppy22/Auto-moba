import { dist } from '../core/math';
import { hpPct, isTargetable, type Ctx } from '../ctx';
import type { LaneId } from '../content/schema';
import { startRecall } from '../recall';
import { findPath, LANES, lanePoint, laneT } from '../world/map';
import type { Goal, GoalKind, PlayTeam, Unit } from '../types';
import { other } from '../types';
import { closestLane, enemyTowerTarget, lanePath, pointAtProgress, progressAt } from './lanes';
import { matchupAt } from './power';
import { aiShop, nextPurchase } from './shopping';
import { shopAt } from '../shop';
import { isWary } from './swap';

interface Cand {
  goal: Goal;
  score: number;
}

const goalKey = (kind: GoalKind, id: string | number): string => `${kind}:${id}`;

function openSlots(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const s of ctx.s.slots) if (s.open) out.add(s.id);
  return out;
}

function cand(
  kind: GoalKind,
  x: number,
  y: number,
  key: string,
  score: number,
  targetId: number | null = null,
): Cand {
  return { goal: { kind, x, y, targetId, key }, score };
}

function enemiesNear(ctx: Ctx, u: Unit, x: number, y: number, r: number): number {
  let n = 0;
  for (const e of ctx.grid.query(x, y, r)) {
    if (!e.alive || e.team === u.team || e.team === 'neutral') continue;
    if (e.kind === 'hero') n += 2;
    else if (e.kind === 'minion') n += 1;
  }
  return n;
}

function standoff(u: Unit): number {
  return Math.max(90, Math.min(130, u.stats.range + 14));
}

function threatNear(
  ctx: Ctx,
  team: PlayTeam,
  x: number,
  y: number,
  r: number,
  minions = true,
): number {
  let heroes = 0;
  let foeMinions = 0;
  let ownMinions = 0;
  for (const e of ctx.grid.query(x, y, r)) {
    if (!e.alive) continue;
    if (e.kind === 'hero' && e.team !== team && e.team !== 'neutral') heroes++;
    else if (e.kind === 'minion') {
      if (e.team === team) ownMinions++;
      else foeMinions++;
    }
  }
  return heroes * 2 + (minions ? Math.max(0, foeMinions - ownMinions) * 0.35 : 0);
}

function alliedMinionsNear(ctx: Ctx, team: PlayTeam, x: number, y: number, r: number): number {
  let n = 0;
  for (const m of ctx.grid.query(x, y, r))
    if (m.alive && m.team === team && m.kind === 'minion') n++;
  return n;
}

function alliedHeroesNear(
  ctx: Ctx,
  team: PlayTeam,
  x: number,
  y: number,
  r: number,
  skip: number,
): number {
  let n = 0;
  for (const m of ctx.grid.query(x, y, r)) {
    if (m.alive && m.team === team && m.kind === 'hero' && m.id !== skip) n++;
  }
  return n;
}

function teamPlan(ctx: Ctx, team: PlayTeam): { siege: boolean; lane: LaneId } {
  const board = ctx.s.board[team];
  const plan = board.plan;
  if (ctx.s.tick - plan.tick < 20) return plan;
  plan.tick = ctx.s.tick;
  const foe = other(team);
  let aliveA = 0;
  let hpSum = 0;
  let aliveE = 0;
  for (const id of ctx.s.teams[team].heroIds) {
    const h = ctx.unit(id);
    if (h?.alive) {
      aliveA++;
      hpSum += hpPct(h);
    }
  }
  for (const id of ctx.s.teams[foe].heroIds) if (ctx.unit(id)?.alive) aliveE++;
  const avg = aliveA > 0 ? hpSum / aliveA : 0;
  const t = ctx.t.ai;
  const start = plan.siege
    ? aliveA >= 3 && avg >= t.siegeKeepHp
    : aliveA >= 4 && aliveA >= aliveE && avg >= t.siegeStartHp;
  const myG = ctx.guardians[team];
  const homeThreat = myG ? threatNear(ctx, team, myG.x, myG.y, ctx.t.ai.defendRadius * 2) : 0;
  plan.siege = start && ctx.s.tick >= t.siegeAfterTick && homeThreat < 3;
  // Siege lane: fewest standing towers, then the lane the team has most heroes assigned to; the
  // short mid diagonal is penalised so the front-runner lane is not always mid. Sticky once chosen.
  const assigned: Record<LaneId, number> = { top: 0, mid: 0, bot: 0 };
  for (const id of ctx.s.teams[team].heroIds) {
    const l = ctx.unit(id)?.hero?.lane;
    if (l) assigned[l]++;
  }
  const laneScore = (lane: LaneId): number => {
    const [o, i] = ctx.towers[foe][lane];
    return (
      (o?.alive ? 2 : 0) +
      (i?.alive ? 1 : 0) -
      ctx.front[team][lane] * 0.5 -
      assigned[lane] * t.siegeAssignedBonus +
      (lane === 'mid' ? t.siegeMidPenalty : 0) -
      (plan.siege && lane === plan.lane ? t.siegeLaneStick : 0)
    );
  };
  let bestLane: LaneId = plan.lane;
  let bestScore = Infinity;
  for (const lane of LANES) {
    const score = laneScore(lane);
    if (score < bestScore) {
      bestScore = score;
      bestLane = lane;
    }
  }
  plan.lane = bestLane;
  return plan;
}

export function setGoal(ctx: Ctx, u: Unit, g: Goal): void {
  const h = u.hero!;
  const old = h.goal;
  const board = ctx.s.board[u.team as PlayTeam];
  if (old && old.key !== g.key) {
    board.claims[old.key] = Math.max(0, (board.claims[old.key] ?? 1) - 1);
  }
  if (!old || old.key !== g.key) {
    board.claims[g.key] = (board.claims[g.key] ?? 0) + 1;
    h.goalSetTick = ctx.s.tick;
  }
  const pathEnd = u.path.length > 0 ? u.path[u.path.length - 1] : null;
  const keep =
    old !== null &&
    old.key === g.key &&
    u.pathI < u.path.length &&
    pathEnd !== null &&
    dist(pathEnd[0], pathEnd[1], g.x, g.y) < 40;
  h.goal = g;
  if (keep) return;
  const route = (x: number, y: number): [number, number][] =>
    findPath(ctx.world, { x: u.x, y: u.y }, { x, y }, openSlots(ctx));
  let lp: [number, number][] | null =
    g.kind === 'retreat' || g.kind === 'base' ? retreatLanePath(ctx, u, g.x, g.y) : null;
  const tgt = g.kind === 'pushTower' && g.targetId !== null ? ctx.unit(g.targetId) : null;
  if (lp) {
    // retreat: already routed down the hero's own lane
  } else if (tgt?.kind === 'guardian') {
    // Approach the exposed guardian down a side lane (the siege lane), not across the middle.
    const team = u.team as PlayTeam;
    const plan = ctx.s.board[team].plan;
    const lane: LaneId = plan.siege ? plan.lane : (h.lane ?? closestLane(ctx, u));
    const fb = ctx.world.basePos[other(team)];
    const approach = lanePath(ctx, u, lane, fb.x, fb.y, ctx.t.ai.laneHugRadius, route);
    if (approach) lp = [...approach, [g.x, g.y]];
  } else {
    const laneGoal = g.kind === 'pushTower' || g.kind === 'farmLane' ? laneOfGoal(ctx, g) : null;
    if (laneGoal) lp = lanePath(ctx, u, laneGoal, g.x, g.y, ctx.t.ai.laneHugRadius, route);
  }
  u.path = lp ?? route(g.x, g.y);
  u.pathI = 0;
}

/** Retreat home down the lane the hero is standing on instead of cutting across the middle. */
export function retreatLanePath(
  ctx: Ctx,
  u: Unit,
  x: number,
  y: number,
): [number, number][] | null {
  const lane = closestLane(ctx, u);
  const geo = ctx.world.lanes[lane];
  const p = lanePoint(geo, laneT(geo, u.x, u.y));
  if (dist(u.x, u.y, p.x, p.y) > ctx.t.ai.laneHugRadius) return null;
  return lanePath(ctx, u, lane, x, y, ctx.t.ai.laneHugRadius, () => []);
}

function laneOfGoal(ctx: Ctx, g: Goal): LaneId | null {
  let best: LaneId | null = null;
  let bestD = Infinity;
  for (const lane of LANES) {
    const geo = ctx.world.lanes[lane];
    const p = lanePoint(geo, laneT(geo, g.x, g.y));
    const d = dist(g.x, g.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = lane;
    }
  }
  return bestD <= ctx.t.ai.laneHugRadius ? best : null;
}

export function strategicUpdate(ctx: Ctx, u: Unit): void {
  const h = u.hero;
  if (!h || !u.alive || u.team === 'neutral') return;
  if (h.recall) return;
  const team = u.team as PlayTeam;
  const def = ctx.c.heroById.get(h.defId)!;
  const pers = ctx.t.personalities[def.personality];
  const post = ctx.t.posture[h.posture] ?? ctx.t.posture.default;
  const ai = ctx.t;
  const base = ctx.world.basePos[team];
  const hp = hpPct(u);
  const distBase = dist(u.x, u.y, base.x, base.y);
  const cands: Cand[] = [];
  const cur = h.goal;

  const here = shopAt(ctx, u);
  if (here) {
    const q = h.suggest.indexOf(here);
    if (q >= 0) {
      h.suggest.splice(q, 1);
      if (h.isPlayer) ctx.emit('shopVisit', { id: u.id, shop: here });
      else aiShop(ctx, u);
      if (cur?.kind === 'visitShop') h.goal = null;
    } else if (!h.isPlayer && cur?.kind === 'visitShop') {
      aiShop(ctx, u);
      h.lastRecallTick = ctx.s.tick;
      h.goal = null;
    }
  }

  const wary = isWary(ctx, h);
  const healing = cur !== null && (cur.kind === 'retreat' || cur.kind === 'base');
  const foesClose = enemiesNear(ctx, u, u.x, u.y, 600) > 0;
  const needHeal =
    hp < pers.retreatHp + (wary ? 0.12 : 0) ||
    (healing && hp < 0.78) ||
    h.engage === 'flee' ||
    (hp < ai.ai.healSafeHp && !foesClose);
  if (needHeal) {
    const threatened = enemiesNear(ctx, u, u.x, u.y, 220) > 0;
    if (distBase <= ai.ai.healBaseRadius) {
      cands.push(cand('base', base.x, base.y, goalKey('base', 0), 10));
    } else {
      if (!h.isPlayer && !threatened && distBase > 350) {
        startRecall(ctx, u, 'base');
        return;
      }
      cands.push(cand('retreat', base.x, base.y, goalKey('retreat', 0), 10));
    }
  } else {
    if (!h.isPlayer && distBase > 400 && enemiesNear(ctx, u, u.x, u.y, 260) === 0) {
      const p = nextPurchase(ctx, u, 'base');
      const since = ctx.s.tick - (h.lastRecallTick ?? -9999);
      let shopClose = false;
      for (const sh of ctx.world.map.shops)
        if (dist(u.x, u.y, sh.x, sh.y) <= ai.ai.shopTripRadius) shopClose = true;
      if (p && h.gold >= 750 && since > 400 && !shopClose) {
        h.lastRecallTick = ctx.s.tick;
        startRecall(ctx, u, 'base');
        return;
      }
    }
    const lane: LaneId = h.lane ?? closestLane(ctx, u);
    const laneHero = h.lane !== null;
    const prog = ctx.front[team][lane];
    const foeTower = enemyTowerTarget(ctx, team, lane);
    const tf = ctx.world.map.towerFractions;
    let farmProg = prog - 0.02;
    if (foeTower) {
      const tp = progressAt(ctx, team, lane, foeTower.x, foeTower.y);
      farmProg = Math.min(farmProg, tp - 0.085);
    }
    farmProg = Math.max(farmProg, tf.inner);
    const fp = pointAtProgress(ctx, team, lane, farmProg);
    cands.push(
      cand(
        'farmLane',
        fp.x,
        fp.y,
        goalKey('farmLane', lane),
        (laneHero ? 0.8 : 0.2) * (post.farmLane ?? 1),
      ),
    );

    const foeG = ctx.guardians[other(team)];
    const guardianOpen = foeG !== null && isTargetable(ctx, foeG);
    const plan = teamPlan(ctx, team);
    if (plan.siege && hp > 0.5) {
      const st = guardianOpen ? foeG : enemyTowerTarget(ctx, team, plan.lane);
      if (st) {
        let sx: number;
        let sy: number;
        let stageX: number;
        let stageY: number;
        if (st.kind === 'tower') {
          const lg = ctx.world.lanes[plan.lane].length;
          const tp = progressAt(ctx, team, plan.lane, st.x, st.y);
          const atp = pointAtProgress(ctx, team, plan.lane, tp - standoff(u) / lg);
          const stp = pointAtProgress(ctx, team, plan.lane, tp - 260 / lg);
          sx = atp.x;
          sy = atp.y;
          stageX = stp.x;
          stageY = stp.y;
        } else {
          const dx = base.x - st.x;
          const dy = base.y - st.y;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          sx = st.x + (dx / l) * 100;
          sy = st.y + (dy / l) * 100;
          stageX = st.x + (dx / l) * 330;
          stageY = st.y + (dy / l) * 330;
        }
        const need = Math.min(
          ai.ai.siegeGather,
          ctx.s.teams[team].heroIds.filter((id) => ctx.unit(id)?.alive).length,
        );
        const gathered = alliedHeroesNear(ctx, team, stageX, stageY, 420, u.id) + 1;
        const here = alliedHeroesNear(ctx, team, st.x, st.y, 420, u.id) + 1;
        const go =
          gathered >= need || here >= need || ctx.s.tick - h.goalSetTick > ai.ai.siegeWaitTicks;
        cands.push(
          go
            ? cand(
                'pushTower',
                sx,
                sy,
                goalKey('pushTower', st.id),
                ai.ai.siegeScore * (0.5 + 0.5 * (post.pushTower ?? 1)),
                st.id,
              )
            : cand(
                'pushTower',
                stageX,
                stageY,
                goalKey('pushTower', `stage${st.id}`),
                ai.ai.siegeScore * (0.5 + 0.5 * (post.pushTower ?? 1)),
                st.id,
              ),
        );
      }
    }
    const pushTarget: Unit | null = guardianOpen ? foeG : foeTower;
    if (pushTarget) {
      const target = pushTarget;
      let px: number;
      let py: number;
      if (target.kind === 'tower') {
        const tp = progressAt(ctx, team, lane, target.x, target.y);
        const p = pointAtProgress(ctx, team, lane, tp - standoff(u) / ctx.world.lanes[lane].length);
        px = p.x;
        py = p.y;
      } else {
        const dx = base.x - target.x;
        const dy = base.y - target.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        px = target.x + (dx / l) * 100;
        py = target.y + (dy / l) * 100;
      }
      const wave = alliedMinionsNear(ctx, team, target.x, target.y, ai.ai.pushWaveRadius);
      const mates = alliedHeroesNear(ctx, team, target.x, target.y, ai.ai.pushWaveRadius, u.id);
      let support = Math.min(1, wave * 0.3 + mates * 0.3);
      const foes = enemiesNear(ctx, u, target.x, target.y, 260);
      if (foes >= 4 && mates < 2) support *= 0.5;
      let deadFoes = 0;
      for (const id of ctx.s.teams[other(team)].heroIds) if (!ctx.unit(id)?.alive) deadFoes++;
      const score =
        (0.2 + 0.9 * support + (guardianOpen ? 0.4 : 0) + 0.3 * deadFoes) * (post.pushTower ?? 1);
      cands.push(cand('pushTower', px, py, goalKey('pushTower', target.id), score, target.id));
    }

    const structures: Unit[] = [];
    for (const l of LANES) for (const t of ctx.towers[team][l]) if (t?.alive) structures.push(t);
    const myG = ctx.guardians[team];
    if (myG?.alive) structures.push(myG);
    let bestDef: Cand | null = null;
    for (const st of structures) {
      const radius =
        st.kind === 'guardian'
          ? ai.ai.guardianThreatRadius
          : st.tower?.index === 1
            ? ai.ai.defendRadius * 1.4
            : ai.ai.defendRadius;
      const ownLane = st.kind === 'tower' && (h.lane === null || st.tower?.lane === h.lane);
      const threat = threatNear(ctx, team, st.x, st.y, radius, ownLane || st.kind === 'guardian');
      if (threat < 1.2) continue;
      const key = goalKey('defendTower', st.id);
      const claimed = ctx.s.board[team].claims[key] ?? 0;
      if (claimed > (cur?.key === key ? 2 : 1)) continue;
      const d = dist(u.x, u.y, st.x, st.y);
      if (!ownLane && st.kind === 'tower' && d > ai.ai.defendOffLaneRadius) continue;
      const urgent = st.kind === 'guardian' && threat >= 2;
      const score = urgent
        ? (2.6 + 0.15 * Math.min(6, threat)) * (0.6 + 0.4 * (post.defendTower ?? 1))
        : (0.35 + 0.12 * Math.min(6, threat)) *
          (post.defendTower ?? 1) *
          Math.max(0.2, 1 - d / 2500);
      if (!bestDef || score > bestDef.score) {
        const dx = base.x - st.x;
        const dy = base.y - st.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        bestDef = cand(
          'defendTower',
          st.x + (dx / l) * 40,
          st.y + (dy / l) * 40,
          goalKey('defendTower', st.id),
          score,
          st.id,
        );
      }
    }
    if (bestDef) cands.push(bestDef);

    if (hp > 0.5) {
      let bestCamp: Cand | null = null;
      for (const sl of ctx.s.slots) {
        if (!sl.open) continue;
        for (const ids of sl.campIds) {
          for (const id of ids) {
            const cu = ctx.unit(id);
            if (!cu || !cu.alive) continue;
            const d = dist(u.x, u.y, cu.x, cu.y);
            const claims =
              ctx.s.board[team].claims[goalKey('clearCamp', cu.camp!.slot + cu.camp!.spot)] ?? 0;
            const mine = cur?.key === goalKey('clearCamp', cu.camp!.slot + cu.camp!.spot);
            if (claims > (mine ? 1 : 0)) continue;
            const base0 = h.jungler ? 1.1 : h.disposition === 'farmer' ? 0.5 : 0.3;
            const score = base0 * (post.clearCamp ?? 1) * Math.max(0.2, 1 - d / 1800);
            if (!bestCamp || score > bestCamp.score) {
              bestCamp = cand(
                'clearCamp',
                cu.x,
                cu.y,
                goalKey('clearCamp', cu.camp!.slot + cu.camp!.spot),
                score,
                cu.id,
              );
            }
          }
        }
      }
      if (bestCamp) cands.push(bestCamp);
    }

    // Rescue and join: count this hero in the fight, wherever it stands within reach.
    let bestFight: Cand | null = null;
    const healer = def.abilities.some(
      (a, i) => h.cd[i] <= 0 && a.effects.some((e) => e.type === 'heal'),
    );
    for (const id of ctx.s.teams[team].heroIds) {
      const ally = ctx.unit(id);
      if (!ally || ally.id === u.id || !ally.alive) continue;
      const d = dist(u.x, u.y, ally.x, ally.y);
      if (d > ai.ai.rescueRadius || d < 90) continue;
      const inFight = ctx.s.tick - ally.lastDamagedTick <= 100;
      const hurt = hpPct(ally) < 0.6;
      if (!inFight && !(healer && hurt)) continue;
      const m = matchupAt(ctx, team, ally.x, ally.y, u, u);
      const resolve = (0.8 + 0.2 * pers.riskTaking) * (wary ? 0.8 : 1);
      if (m.enemyHeroes > 0 && m.ratio * resolve < ai.ai.rescueRatio) continue;
      const losing = matchupAt(ctx, team, ally.x, ally.y, u).ratio < 1.1;
      const urgency = (losing ? 1 : 0.85) * (hpPct(ally) < 0.5 ? 1.1 : 1);
      const score =
        ai.ai.rescueScore * urgency * (post.joinFight ?? 1) * (1 - d / (ai.ai.rescueRadius * 1.3));
      const midPenalty = h.lane !== 'mid' && closestLane(ctx, ally) === 'mid' ? 0.6 : 1;
      const wantHeal = healer && hurt;
      const total = (m.enemyHeroes === 0 ? (wantHeal ? score * 0.6 : 0) : score) * midPenalty;
      if (total > 0 && (!bestFight || total > bestFight.score)) {
        bestFight = cand(
          'joinFight',
          ally.x,
          ally.y,
          goalKey('joinFight', ally.id),
          total,
          ally.id,
        );
      }
    }
    if (bestFight) cands.push(bestFight);

    // Hunt: attackers chase beatable heroes; anyone finishes a weak, isolated enemy.
    if (hp > 0.55 && !wary) {
      let bestHunt: Cand | null = null;
      for (const id of ctx.s.teams[other(team)].heroIds) {
        const foe = ctx.unit(id);
        if (!foe || !foe.alive) continue;
        const d = dist(u.x, u.y, foe.x, foe.y);
        if (d > ai.ai.huntRadius || d < 70) continue;
        if (h.lane !== 'mid' && closestLane(ctx, foe) === 'mid') continue;
        const weak = hpPct(foe) < ai.ai.easyKillHp;
        const weight = Math.max(post.hunt ?? 1, weak ? 1.2 : 0);
        if (weight <= 0.5) continue;
        const mm = matchupAt(ctx, team, foe.x, foe.y, u, u);
        if (mm.ratio * pers.riskTaking * (weak ? 1.4 : 1) < pers.engageRatio) continue;
        const score = ai.ai.huntScore * weight * (1 - d / (ai.ai.huntRadius * 1.25));
        if (!bestHunt || score > bestHunt.score) {
          bestHunt = cand(
            'joinFight',
            foe.x,
            foe.y,
            goalKey('joinFight', `hunt${foe.id}`),
            score,
            foe.id,
          );
        }
      }
      if (bestHunt) cands.push(bestHunt);
    }

    for (const ob of ctx.s.units) {
      if (ob.kind !== 'obelisk' || !ob.alive) continue;
      const d = dist(u.x, u.y, ob.x, ob.y);
      const key = goalKey('takeObelisk', ob.id);
      const claims = ctx.s.board[team].claims[key] ?? 0;
      if (claims > (cur?.key === key ? 1 : 0)) continue;
      if (enemiesNear(ctx, u, ob.x, ob.y, 160) >= 4) continue;
      const score =
        0.75 * (post.takeObelisk ?? 1) * Math.max(0.1, 1 - d / 2200) * (h.jungler ? 1.3 : 1);
      cands.push(cand('takeObelisk', ob.x, ob.y, key, score, ob.id));
    }

    // Jungle events: a lane hero only goes when its lane is quiet (no defend candidate, no team
    // siege) and the event is close; at most `aiMax` heroes per team per event (board claims).
    const quiet = !bestDef && !(plan.siege && laneHero) && hp > 0.6;
    if (quiet) {
      for (const ev of ctx.s.events) {
        const def = ctx.c.eventById.get(ev.defId)!;
        if (ev.phase === 'warning' && (def.kind === 'procession' || def.kind === 'parade'))
          continue;
        const d = dist(u.x, u.y, ev.x, ev.y);
        const reach = laneHero ? def.aiRadius : def.aiRadius * 1.6;
        if (d > reach) continue;
        const key = goalKey('contestEvent', ev.id);
        const claims = ctx.s.board[team].claims[key] ?? 0;
        if (claims > (cur?.key === key ? def.aiMax : def.aiMax - 1)) continue;
        if (enemiesNear(ctx, u, ev.x, ev.y, 260) >= 5) continue;
        const score =
          def.aiWeight *
          (post.contestEvent ?? 1) *
          Math.max(0.2, 1.15 - (0.6 * d) / reach) *
          (laneHero ? 1 : 1.3);
        cands.push(cand('contestEvent', ev.x, ev.y, key, score, null));
      }
    }
  }

  if (!needHeal) {
    const shopCand = (id: string, score: number): void => {
      const sh = ctx.world.map.shops.find((x) => x.id === id);
      if (sh) cands.push(cand('visitShop', sh.x, sh.y, goalKey('visitShop', id), score));
    };
    if (h.suggest.length > 0) {
      shopCand(h.suggest[0], ai.ai.suggestScore);
    } else if (!h.isPlayer && h.gold >= ai.ai.shopTripGold) {
      const big = nextPurchase(ctx, u, 'jungle');
      const smallOnly = nextPurchase(ctx, u, 'base');
      const wantsT3 = !!big && ctx.c.itemById.get(big.id)?.tier === 3;
      const radius = wantsT3 ? ai.ai.tier3TripRadius : ai.ai.shopTripRadius;
      if ((wantsT3 || smallOnly) && enemiesNear(ctx, u, u.x, u.y, 420) === 0) {
        let bestShop: { id: string; d: number } | null = null;
        for (const sh of ctx.world.map.shops) {
          const d = dist(u.x, u.y, sh.x, sh.y);
          if (d <= radius && (!bestShop || d < bestShop.d)) bestShop = { id: sh.id, d };
        }
        if (bestShop)
          shopCand(
            bestShop.id,
            (wantsT3 ? ai.ai.tier3TripScore : ai.ai.shopTripScore) * (1.2 - bestShop.d / radius),
          );
      }
    }
  }

  if (wary) {
    for (const c of cands) {
      if (c.goal.kind === 'pushTower') c.score *= 0.45;
      else if (c.goal.kind === 'joinFight') c.score *= 0.6;
      else if (c.goal.kind === 'farmLane' || c.goal.kind === 'defendTower') c.score *= 1.5;
    }
  }
  let best: Cand | null = null;
  for (const c of cands) {
    const bonus = cur && cur.key === c.goal.key ? 0.12 : 0;
    const total = c.score + bonus;
    if (!best || total > best.score) best = { goal: c.goal, score: total };
  }
  if (!best) return;
  setGoal(ctx, u, best.goal);
}
