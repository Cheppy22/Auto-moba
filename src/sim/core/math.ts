export const sqrt = Math.sqrt;
export const atan2 = Math.atan2;
export const sin = Math.sin;
export const cos = Math.cos;

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
