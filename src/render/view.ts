export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface View {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  p: number;
  mid: number;
}

const R = Math.SQRT1_2;

export function makeView(
  w: number,
  h: number,
  mapSize: number,
  halfSpan: number,
  insets: Insets,
  maxStretch: number,
  dpr: number,
): View {
  const left = insets.left * dpr;
  const right = insets.right * dpr;
  const top = insets.top * dpr;
  const bottom = insets.bottom * dpr;
  const bw = Math.max(50, w - left - right);
  const bh = Math.max(50, h - top - bottom);
  let sx = bw / (2 * halfSpan);
  let sy = bh / (2 * halfSpan);
  if (sx > sy * maxStretch) sx = sy * maxStretch;
  if (sy > sx * maxStretch) sy = sx * maxStretch;
  return {
    cx: left + bw / 2,
    cy: top + bh / 2,
    sx,
    sy,
    p: Math.sqrt(sx * sy),
    mid: mapSize / 2,
  };
}

export function toScreen(v: View, x: number, y: number): { x: number; y: number } {
  const u = x - v.mid;
  const w = y - v.mid;
  return { x: v.cx + (u + w) * R * v.sx, y: v.cy + (w - u) * R * v.sy };
}

export function toWorld(v: View, X: number, Y: number): { x: number; y: number } {
  const a = (X - v.cx) / v.sx;
  const b = (Y - v.cy) / v.sy;
  return { x: v.mid + (a - b) * R, y: v.mid + (a + b) * R };
}
