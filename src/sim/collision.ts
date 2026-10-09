import { sqrt } from './core/math';
import type { Ctx } from './ctx';
import { confine } from './world/terrain';
import type { Unit } from './types';

/**
 * Soft body collision. After everyone has moved, overlapping bodies are shoved apart along the line
 * between them, the lighter one moving further (piece > pawn > pawnling). Bodies that never move
 * (Bastions, Thrones, obelisks, the Keeper) still shove others out. A small overlap is tolerated and
 * a push is capped, so crowds settle instead of jittering; a unit walking head-on into a blocker
 * also steps sideways, so two columns pass each other instead of freezing nose to nose.
 *
 * Deterministic: bodies are visited in unit order (ids ascend), every pair once, with no random
 * numbers; pushes are gathered first and applied together, so the visiting order cannot matter.
 */

/** Fixed fallback directions for two bodies on exactly the same spot. */
const SPREAD: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.7071, 0.7071],
  [0, 1],
  [-0.7071, 0.7071],
  [-1, 0],
  [-0.7071, -0.7071],
  [0, -1],
  [0.7071, -0.7071],
];

// Scratch space reused every tick (sized on demand, always reset before use).
const scratch: Unit[] = [];
const mobile: Unit[] = [];
const fixed: Unit[] = [];
let rad = new Float64Array(256);
let mass = new Float64Array(256);
let pushX = new Float64Array(256);
let pushY = new Float64Array(256);
let fixedRad = new Float64Array(64);
let order = new Int32Array(256);
let sortX = new Float64Array(256);

function isFixed(u: Unit): boolean {
  return u.kind === 'tower' || u.kind === 'guardian' || u.kind === 'obelisk' || u.kind === 'keeper';
}

/** Ghosts (the procession, the oni) drift through everything. */
function collides(u: Unit): boolean {
  return u.alive && !u.ev?.ghost;
}

export function bodyRadius(ctx: Ctx, u: Unit): number {
  const r = ctx.t.collision.radius;
  switch (u.kind) {
    case 'hero':
      return r.piece;
    case 'tower':
      return r.tower;
    case 'guardian':
      return r.guardian;
    case 'obelisk':
      return r.obelisk;
    case 'keeper':
      return r.keeper;
    case 'camp':
      return Math.min(r.neutralMax, r.neutralBase + r.neutralPerHp * u.base.maxHp);
    default:
      if (u.ev) return Math.min(r.neutralMax, r.neutralBase + r.neutralPerHp * u.base.maxHp);
      return u.pawn ? r.pawn : r.pawnling;
  }
}

/** Zero for bodies that never move. */
export function bodyMass(ctx: Ctx, u: Unit): number {
  const m = ctx.t.collision.mass;
  if (isFixed(u)) return 0;
  if (u.kind === 'hero') return m.piece;
  if (u.kind === 'camp' || u.ev) return m.neutral;
  return u.pawn ? m.pawn : m.pawnling;
}

/** True when the unit's body rests against a body that never moves. */
export function touchesFixedBody(ctx: Ctx, u: Unit): boolean {
  const cfg = ctx.t.collision;
  const ru = bodyRadius(ctx, u);
  scratch.length = 0;
  ctx.grid.query(u.x, u.y, ru + cfg.radius.guardian + 4, scratch);
  for (const b of scratch) {
    if (!b.alive || !isFixed(b)) continue;
    if (sqrt((u.x - b.x) ** 2 + (u.y - b.y) ** 2) <= ru + bodyRadius(ctx, b) + cfg.tolerance + 2)
      return true;
  }
  return false;
}

function grow(n: number): void {
  if (rad.length >= n) return;
  let size = rad.length;
  while (size < n) size *= 2;
  rad = new Float64Array(size);
  mass = new Float64Array(size);
  pushX = new Float64Array(size);
  pushY = new Float64Array(size);
  order = new Int32Array(size);
  sortX = new Float64Array(size);
}

/**
 * Adds the sideways step of a unit that is being shoved straight back against its own heading: it
 * slides off to whichever side of the blocker it is already offset to (a dead-centre meeting goes
 * by id parity), so two units meeting head-on part ways rather than both dodging the same way.
 */
function slideAway(i: number, u: Unit, nx: number, ny: number, amount: number): void {
  const hx = u.x - u.px;
  const hy = u.y - u.py;
  const hl = sqrt(hx * hx + hy * hy);
  if (hl < 0.2) return;
  // (nx, ny) is the direction this unit is being pushed; blocked means it points against the heading.
  if ((hx * nx + hy * ny) / hl > -0.5) return;
  const lx = -hy / hl;
  const ly = hx / hl;
  const off = lx * nx + ly * ny;
  const side = off > 0.05 ? 1 : off < -0.05 ? -1 : (u.id & 1) === 0 ? 1 : -1;
  pushX[i] += lx * side * amount;
  pushY[i] += ly * side * amount;
}

/** Direction for two bodies on the same spot: fixed, and the same whichever way round they are asked. */
function normal(a: Unit, b: Unit): readonly [number, number] {
  const low = a.id < b.id;
  const dir = SPREAD[(low ? a.id * 3 + b.id : b.id * 3 + a.id) % SPREAD.length];
  return low ? dir : [-dir[0], -dir[1]];
}

export function resolveCollisions(ctx: Ctx): void {
  const cfg = ctx.t.collision;
  mobile.length = 0;
  fixed.length = 0;
  for (const u of ctx.s.units) {
    if (!collides(u)) continue;
    if (isFixed(u)) fixed.push(u);
    else mobile.push(u);
  }
  const m = mobile.length;
  if (m === 0) return;
  grow(m);
  if (fixedRad.length < fixed.length) fixedRad = new Float64Array(fixed.length * 2);
  for (let f = 0; f < fixed.length; f++) fixedRad[f] = bodyRadius(ctx, fixed[f]);
  let maxMobile = 0;
  for (let i = 0; i < m; i++) {
    rad[i] = bodyRadius(ctx, mobile[i]);
    mass[i] = bodyMass(ctx, mobile[i]);
    if (rad[i] > maxMobile) maxMobile = rad[i];
  }

  // Sweep and prune along x: bodies sorted by x (a stable insertion sort; ties keep id order), so
  // a body only meets the few that start within one reach of it.
  for (let i = 0; i < m; i++) {
    const x = mobile[i].x;
    let p = i;
    while (p > 0 && sortX[p - 1] > x) {
      sortX[p] = sortX[p - 1];
      order[p] = order[p - 1];
      p--;
    }
    sortX[p] = x;
    order[p] = i;
  }
  const cap = cfg.maxPush / cfg.iterations;
  // positions drift by up to `cap` per pass, for both bodies of a pair
  const span = 2 * maxMobile - cfg.tolerance + 2 * cfg.maxPush;
  for (let iter = 0; iter < cfg.iterations; iter++) {
    for (let i = 0; i < m; i++) {
      pushX[i] = 0;
      pushY[i] = 0;
    }
    let any = false;
    for (let p = 0; p < m; p++) {
      const i = order[p];
      const a = mobile[i];
      const ra = rad[i];
      const ma = mass[i];
      for (let q = p + 1; q < m && sortX[q] - sortX[p] < span; q++) {
        const j = order[q];
        const b = mobile[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const reach = ra + rad[j] - cfg.tolerance;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = sqrt(d2);
        let nx: number;
        let ny: number;
        if (d >= 1e-4) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const n = normal(a, b);
          nx = n[0];
          ny = n[1];
        }
        const push = (reach - d) * cfg.stiffness;
        const shareA = mass[j] / (ma + mass[j]);
        pushX[i] += nx * push * shareA;
        pushY[i] += ny * push * shareA;
        pushX[j] -= nx * push * (1 - shareA);
        pushY[j] -= ny * push * (1 - shareA);
        slideAway(i, a, nx, ny, push * cfg.slide);
        slideAway(j, b, -nx, -ny, push * cfg.slide);
        any = true;
      }
    }
    // bodies that never move shove the whole overlap onto the moving body
    for (let f = 0; f < fixed.length; f++) {
      const b = fixed[f];
      const fr = fixedRad[f];
      const lo = b.x - fr - maxMobile - cfg.maxPush;
      const hi = b.x + fr + maxMobile + cfg.maxPush;
      // first sorted body at or right of `lo`
      let l = 0;
      let h = m;
      while (l < h) {
        const mid = (l + h) >> 1;
        if (sortX[mid] < lo) l = mid + 1;
        else h = mid;
      }
      for (let q = l; q < m && sortX[q] <= hi; q++) {
        const i = order[q];
        const a = mobile[i];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const reach = rad[i] + fr - cfg.tolerance;
        const d2 = dx * dx + dy * dy;
        if (d2 >= reach * reach) continue;
        const d = sqrt(d2);
        let nx: number;
        let ny: number;
        if (d >= 1e-4) {
          nx = dx / d;
          ny = dy / d;
        } else {
          const n = normal(a, b);
          nx = n[0];
          ny = n[1];
        }
        const push = (reach - d) * cfg.stiffness;
        pushX[i] += nx * push;
        pushY[i] += ny * push;
        slideAway(i, a, nx, ny, push * cfg.slide);
        any = true;
      }
    }
    if (!any) return;
    for (let i = 0; i < m; i++) {
      let px = pushX[i];
      let py = pushY[i];
      const len = sqrt(px * px + py * py);
      if (len < 0.01) continue;
      const u = mobile[i];
      if (len > cap) {
        px = (px / len) * cap;
        py = (py / len) * cap;
      }
      const p = confine(ctx.world.terrain, ctx.open, u.x + px, u.y + py);
      u.x = p.x;
      u.y = p.y;
    }
  }
}
