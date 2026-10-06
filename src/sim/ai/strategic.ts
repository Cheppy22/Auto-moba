import { dist } from '../core/math';
import { hpPct, isTargetable, type Ctx } from '../ctx';
import type { LaneId } from '../content/schema';
import { startRecall } from '../recall';
import { findPath, LANES } from '../world/map';
import type { Goal, GoalKind, PlayTeam, Unit } from '../types';
import { other } from '../types';
import { closestLane, enemyTowerTarget, pointAtProgress, progressAt } from './lanes';
import { matchupAt } from './power';
import { nextPurchase } from './shopping';

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
  const keep =
    old !== null &&
    old.key === g.key &&
    u.pathI < u.path.length &&
    dist(old.x, old.y, g.x, g.y) < 40;
  h.goal = g;
  if (keep) return;
  u.path = findPath(ctx.world, { x: u.x, y: u.y }, { x: g.x, y: g.y }, openSlots(ctx));
  u.pathI = 0;
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

  const healing = cur !== null && (cur.kind === 'retreat' || cur.kind === 'base');
  const needHeal = hp < pers.retreatHp || (healing && hp < 0.78) || h.engage === 'flee';
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
      const p = nextPurchase(ctx, u, true);
      const since = ctx.s.tick - (h.lastRecallTick ?? -9999);
      if (p && h.gold >= 750 && since > 400) {
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
        (laneHero ? 1.0 : 0.2) * (post.farmLane ?? 1),
      ),
    );

    const foeG = ctx.guardians[other(team)];
    const guardianOpen = foeG !== null && isTargetable(ctx, foeG);
    const pushTarget: Unit | null = foeTower ?? (guardianOpen ? foeG : null);
    if (pushTarget) {
      const target = pushTarget;
      let px: number;
      let py: number;
      if (target.kind === 'tower') {
        const tp = progressAt(ctx, team, lane, target.x, target.y);
        const p = pointAtProgress(ctx, team, lane, tp - 90 / ctx.world.lanes[lane].length);
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
      const score = (0.3 + 0.7 * support + (guardianOpen ? 0.35 : 0)) * (post.pushTower ?? 1);
      cands.push(cand('pushTower', px, py, goalKey('pushTower', target.id), score, target.id));
    }

    const structures: Unit[] = [];
    for (const l of LANES) for (const t of ctx.towers[team][l]) if (t?.alive) structures.push(t);
    const myG = ctx.guardians[team];
    if (myG?.alive) structures.push(myG);
    let bestDef: Cand | null = null;
    for (const st of structures) {
      const threat = enemiesNear(ctx, u, st.x, st.y, ai.ai.defendRadius);
      if (threat <= 0) continue;
      const d = dist(u.x, u.y, st.x, st.y);
      const score =
        (0.4 + 0.12 * Math.min(6, threat)) * (post.defendTower ?? 1) * Math.max(0.2, 1 - d / 2500);
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
            const base0 = h.role === 'jungle' ? 1.1 : 0.3;
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

    let bestFight: Cand | null = null;
    for (const id of ctx.s.teams[team].heroIds) {
      const ally = ctx.unit(id);
      if (!ally || ally.id === u.id || !ally.alive) continue;
      if (ctx.s.tick - ally.lastDamagedTick > 80) continue;
      const d = dist(u.x, u.y, ally.x, ally.y);
      if (d > 700 || d < 90) continue;
      const m = matchupAt(ctx, team, ally.x, ally.y, u);
      if (m.enemyHeroes === 0 || m.ratio * pers.riskTaking < pers.engageRatio) continue;
      const score = 0.85 * (post.joinFight ?? 1) * (1 - d / 900);
      if (!bestFight || score > bestFight.score) {
        bestFight = cand(
          'joinFight',
          ally.x,
          ally.y,
          goalKey('joinFight', ally.id),
          score,
          ally.id,
        );
      }
    }
    if (bestFight) cands.push(bestFight);

    for (const ob of ctx.s.units) {
      if (ob.kind !== 'obelisk' || !ob.alive) continue;
      const d = dist(u.x, u.y, ob.x, ob.y);
      const key = goalKey('takeObelisk', ob.id);
      const claims = ctx.s.board[team].claims[key] ?? 0;
      if (claims > (cur?.key === key ? 1 : 0)) continue;
      if (enemiesNear(ctx, u, ob.x, ob.y, 160) >= 4) continue;
      const score =
        0.75 *
        (post.takeObelisk ?? 1) *
        Math.max(0.1, 1 - d / 2200) *
        (h.role === 'jungle' ? 1.3 : 1);
      cands.push(cand('takeObelisk', ob.x, ob.y, key, score, ob.id));
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
