import { bodyRadius } from './collision';
import { atan2, cos, dist, sin, sqrt } from './core/math';
import type { Ctx } from './ctx';
import { clearLine, walkable } from './world/terrain';
import type { Unit } from './types';

/**
 * Engagement spacing. Once per tick, before anyone moves, every attacker close to its target gets a
 * slot on a ring around that target: melee attackers just inside their reach, ranged attackers at a
 * standoff. The slots of one team on one target form a fan centred between where the attackers
 * already stand and their own base, so attackers spread around the target instead of stacking on
 * one point, and two sides that fight each other form two lines.
 *
 * Deterministic: groups are built in unit order, attackers are laid out by their angle around the
 * target (ties by id), and no random numbers are drawn.
 */

interface Slot {
  x: number;
  y: number;
  targetId: number;
}

const slots = new Map<number, Slot>();
const groups = new Map<number, Unit[]>();
const pool: Unit[][] = [];
// scratch for one group
let ang = new Float64Array(64);
let half = new Float64Array(64);
let ring = new Float64Array(64);
let idx = new Int32Array(64);

function grow(n: number): void {
  if (ang.length >= n) return;
  let size = ang.length;
  while (size < n) size *= 2;
  ang = new Float64Array(size);
  half = new Float64Array(size);
  ring = new Float64Array(size);
  idx = new Int32Array(size);
}

/** Units that walk to a fight: pieces, pawns, pawnlings, camps and event units (not ghosts). */
function mover(u: Unit): boolean {
  return (u.kind === 'hero' || u.kind === 'minion' || u.kind === 'camp') && !u.ev?.ghost;
}

/** Reach padding the attack check allows: structures are big. */
export function reachPad(t: Unit): number {
  return t.kind === 'tower' || t.kind === 'guardian' ? 16 : 4;
}

export function isMelee(ctx: Ctx, u: Unit): boolean {
  return u.stats.range <= ctx.t.spacing.meleeMaxRange;
}

/** Distance from the target's centre at which this attacker's slot sits. */
function ringRadius(ctx: Ctx, u: Unit, t: Unit): number {
  const sp = ctx.t.spacing;
  const reach = u.stats.range + reachPad(t);
  const touch = bodyRadius(ctx, u) + bodyRadius(ctx, t);
  if (isMelee(ctx, u)) return Math.max(touch + 1, reach - sp.meleeInset);
  return Math.max(touch + 4, reach * sp.rangedFrac);
}

function layOut(ctx: Ctx, t: Unit, list: Unit[]): void {
  const sp = ctx.t.spacing;
  const n = list.length;
  grow(n);
  // fan centre: where the attackers stand, pulled toward their own base
  let cx = 0;
  let cy = 0;
  for (const u of list) {
    const dx = u.x - t.x;
    const dy = u.y - t.y;
    const d = sqrt(dx * dx + dy * dy);
    if (d > 0.001) {
      cx += dx / d;
      cy += dy / d;
    }
  }
  let cl = sqrt(cx * cx + cy * cy);
  if (cl > 0.001) {
    cx /= cl;
    cy /= cl;
  }
  const team = list[0].team;
  if (team !== 'neutral') {
    const b = ctx.world.basePos[team];
    const bx = b.x - t.x;
    const by = b.y - t.y;
    const bl = sqrt(bx * bx + by * by);
    if (bl > 0.001) {
      cx += (bx / bl) * sp.sideBias;
      cy += (by / bl) * sp.sideBias;
    }
  }
  cl = sqrt(cx * cx + cy * cy);
  if (cl < 0.001) {
    cx = 1;
    cy = 0;
  } else {
    cx /= cl;
    cy /= cl;
  }
  let total = 0;
  for (let i = 0; i < n; i++) {
    const u = list[i];
    const dx = u.x - t.x;
    const dy = u.y - t.y;
    // signed angle of the attacker around the fan centre, in (-pi, pi]
    ang[i] = atan2(cx * dy - cy * dx, cx * dx + cy * dy);
    ring[i] = ringRadius(ctx, u, t);
    const gap = isMelee(ctx, u) ? sp.meleeGap : sp.rangedGap;
    // arc taken by the body plus half a gap each side, as an angle on its ring
    half[i] = Math.min(Math.PI, (bodyRadius(ctx, u) + gap / 2) / ring[i]);
    total += 2 * half[i];
    idx[i] = i;
  }
  // order by angle (ties by id): neighbours keep their side, nobody crosses the target
  for (let i = 1; i < n; i++) {
    const k = idx[i];
    let p = i;
    while (
      p > 0 &&
      (ang[idx[p - 1]] > ang[k] || (ang[idx[p - 1]] === ang[k] && list[idx[p - 1]].id > list[k].id))
    ) {
      idx[p] = idx[p - 1];
      p--;
    }
    idx[p] = k;
  }
  const squeeze = total > 2 * Math.PI ? (2 * Math.PI) / total : 1;
  let at = (-total * squeeze) / 2;
  const base = atan2(cy, cx);
  for (let q = 0; q < n; q++) {
    const i = idx[q];
    const u = list[i];
    const a = base + at + half[i] * squeeze;
    at += 2 * half[i] * squeeze;
    let sx = t.x + cos(a) * ring[i];
    let sy = t.y + sin(a) * ring[i];
    const terrain = ctx.world.terrain;
    if (!walkable(terrain, ctx.open, sx, sy) || !clearLine(terrain, ctx.open, t.x, t.y, sx, sy)) {
      // the fan runs into a wall: keep the attacker's own bearing instead
      const dx = u.x - t.x;
      const dy = u.y - t.y;
      const d = sqrt(dx * dx + dy * dy);
      if (d < 0.001) continue;
      sx = t.x + (dx / d) * ring[i];
      sy = t.y + (dy / d) * ring[i];
      if (!walkable(terrain, ctx.open, sx, sy)) continue;
    }
    slots.set(u.id, { x: sx, y: sy, targetId: t.id });
  }
}

/** Rebuilds every attacker's slot from where units stand now. Call once per tick before moving. */
export function planSlots(ctx: Ctx): void {
  slots.clear();
  for (const list of groups.values()) {
    list.length = 0;
    pool.push(list);
  }
  groups.clear();
  const reachOut = ctx.t.spacing.approach;
  for (const u of ctx.s.units) {
    if (!u.alive || u.targetId === null || !mover(u)) continue;
    const t = ctx.unit(u.targetId);
    if (!t || !t.alive) continue;
    if (dist(u.x, u.y, t.x, t.y) > ringRadius(ctx, u, t) + reachOut) continue;
    // one fan per target, team and attack style
    const key =
      t.id * 8 + (u.team === 'A' ? 0 : u.team === 'B' ? 2 : 4) + (isMelee(ctx, u) ? 0 : 1);
    let list = groups.get(key);
    if (!list) {
      list = pool.pop() ?? [];
      groups.set(key, list);
    }
    list.push(u);
  }
  for (const [key, list] of groups) {
    const t = ctx.unit(Math.floor(key / 8))!;
    layOut(ctx, t, list);
  }
}

/** This attacker's slot on target `t`, or null (far away, no room, or a different target). */
export function slotFor(u: Unit, t: Unit): { x: number; y: number } | null {
  const s = slots.get(u.id);
  return s && s.targetId === t.id ? s : null;
}
