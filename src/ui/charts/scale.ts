/** Small scale and tick helpers for the report charts. Time is in seconds everywhere. */

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** m:ss for a time in seconds. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 1,234 -> "1.2k", with a sign when asked. */
export function compact(v: number, signed = false): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  if (a >= 10000) return `${sign}${Math.round(a / 1000)}k`;
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}${Math.round(a)}`;
}

export const full = (v: number): string => Math.round(v).toLocaleString('en-US');

/** "Nice" tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

/** Time ticks (seconds) every 1, 2, 5 or 10 minutes, so about `count` fit. */
export function timeTicks(maxSec: number, count = 6): number[] {
  const steps = [30, 60, 120, 180, 300, 600, 900, 1200];
  const step = steps.find((s) => maxSec / s <= count) ?? 1800;
  const out: number[] = [];
  for (let t = 0; t <= maxSec + 0.5; t += step) out.push(t);
  return out;
}

export interface Pt {
  t: number;
  v: number;
}

/** Value of a series at time t: linear between points, or held (step) from the last point. */
export function valueAt(pts: readonly Pt[], t: number, step: boolean): number | null {
  if (pts.length === 0) return null;
  if (t < pts[0].t) return step ? null : pts[0].v;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  if (step || !b) return a.v;
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a.v + (b.v - a.v) * f;
}

const f1 = (n: number): string => n.toFixed(1);

/** SVG path for a polyline or a step line. `extendTo` holds the last value out to that x. */
export function linePath(
  pts: readonly Pt[],
  x: (t: number) => number,
  y: (v: number) => number,
  step: boolean,
  extendTo?: number,
): string {
  if (pts.length === 0) return '';
  let d = `M${f1(x(pts[0].t))},${f1(y(pts[0].v))}`;
  for (let i = 1; i < pts.length; i++) {
    if (step) d += `H${f1(x(pts[i].t))}V${f1(y(pts[i].v))}`;
    else d += `L${f1(x(pts[i].t))},${f1(y(pts[i].v))}`;
  }
  if (extendTo !== undefined && pts[pts.length - 1].t < extendTo) d += `H${f1(x(extendTo))}`;
  return d;
}

/** Area between the line and a baseline value. */
export function areaPath(
  pts: readonly Pt[],
  x: (t: number) => number,
  y: (v: number) => number,
  base: number,
  step: boolean,
  extendTo?: number,
): string {
  if (pts.length === 0) return '';
  const end =
    extendTo !== undefined ? Math.max(extendTo, pts[pts.length - 1].t) : pts[pts.length - 1].t;
  const top = linePath(pts, x, y, step, extendTo);
  return `${top}L${f1(x(end))},${f1(y(base))}L${f1(x(pts[0].t))},${f1(y(base))}Z`;
}
