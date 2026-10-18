import type { Content } from '../sim';
import { PALETTE, teamColor } from './theme';
import { makeView, toScreen, toWorld, type View } from './view';

const NO_INSETS = { top: 4, right: 4, bottom: 4, left: 4 };

function replayView(w: number, h: number, mapSize: number, dpr: number): View {
  // the whole board fits: half the view span is 54% of the map size (bases sit near the top and bottom edge)
  return makeView(w, h, mapSize, mapSize * 0.54, NO_INSETS, 1, dpr);
}

/** Map to canvas pixels and back, with the scale (pixels per map unit) along each screen axis. */
interface Proj {
  xy(x: number, y: number): [number, number];
  inv(X: number, Y: number): { x: number; y: number };
  sx: number;
  sy: number;
  p: number;
}

/**
 * The square map is drawn as a diamond (White's base at the bottom); the Long Board lies on its
 * side, White on the left and Black on the right, like the 3D view on a wide screen.
 */
function projFor(w: number, h: number, content: Content, dpr: number): Proj {
  const map = content.map;
  if (map.length === undefined) {
    const v = replayView(w, h, map.size, dpr);
    return {
      xy: (x, y) => {
        const c = toScreen(v, x, y);
        return [c.x, c.y];
      },
      inv: (X, Y) => toWorld(v, X, Y),
      sx: v.sx,
      sy: v.sy,
      p: v.p,
    };
  }
  const L = map.length;
  const W = map.size;
  const pad = 6 * dpr;
  const k = Math.min((w - pad * 2) / L, (h - pad * 2) / W);
  const left = (w - L * k) / 2;
  const top = (h - W * k) / 2;
  return {
    xy: (x, y) => [left + (L - y) * k, top + x * k],
    inv: (X, Y) => ({ x: (Y - top) / k, y: L - (X - left) / k }),
    sx: k,
    sy: k,
    p: k,
  };
}

export interface ReplayPoint {
  tick: number;
  x: number;
  y: number;
  hp: number;
}

export interface ReplayData {
  team: 'A' | 'B';
  path: ReplayPoint[];
  fights: { id: number; x: number; y: number; startTick: number; endTick: number }[];
  /** Techniques taken or upgraded (at Setup and the Act breaks). */
  picks: { tick: number; label: string }[];
  deaths: { tick: number; x: number; y: number }[];
  recalls: { tick: number; dest: string }[];
  slots: { id: string; biomeId: string | null }[];
  selectedFight: number | null;
}

export function pointAt(path: ReplayPoint[], tick: number): ReplayPoint | null {
  if (path.length === 0) return null;
  if (tick <= path[0].tick) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (path[i].tick >= tick) {
      const a = path[i - 1];
      const b = path[i];
      const f = b.tick === a.tick ? 0 : (tick - a.tick) / (b.tick - a.tick);
      return {
        tick,
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        hp: a.hp + (b.hp - a.hp) * f,
      };
    }
  }
  return path[path.length - 1];
}

export function replayHit(
  canvas: HTMLCanvasElement,
  content: Content,
  data: ReplayData,
  clientX: number,
  clientY: number,
): number | null {
  const rect = canvas.getBoundingClientRect();
  const w = projFor(rect.width, rect.height, content, 1).inv(
    clientX - rect.left,
    clientY - rect.top,
  );
  const wx = w.x;
  const wy = w.y;
  let best: number | null = null;
  let bestD = 40;
  for (const f of data.fights) {
    const d = Math.hypot(f.x - wx, f.y - wy);
    if (d < bestD) {
      bestD = d;
      best = f.id;
    }
  }
  return best;
}

/**
 * The Long Board's ground for the replay map: the board, the river band, the two terrace edges,
 * and the zones (groves, the Pit, Squares, verges, the River Road, Sally Paths).
 */
function drawLongGround(
  g: CanvasRenderingContext2D,
  content: Content,
  xy: (x: number, y: number) => [number, number],
  p: number,
): void {
  const map = content.map;
  const W = map.size;
  const L = map.length ?? W;
  const mid = L / 2;
  const box = (x0: number, y0: number, x1: number, y1: number): void => {
    const [ax, ay] = xy(x0, y0);
    const [bx, by] = xy(x1, y1);
    g.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  };
  g.fillStyle = '#14110e';
  box(0, 0, W, L);
  // home terraces a shade lighter, the river band blue
  g.fillStyle = '#1d1913';
  const t = map.terraces;
  if (t) {
    box(0, 0, W, mid - t.home);
    box(0, mid + t.home, W, L);
    g.fillStyle = '#132631';
    box(0, mid - t.river, W, mid + t.river);
  }
  const AREA: Record<string, string> = {
    grove: 'rgba(48,72,58,0.85)',
    pit: 'rgba(30,32,38,0.95)',
    square: 'rgba(120,110,90,0.55)',
    verge: 'rgba(90,82,70,0.5)',
    road: 'rgba(110,104,92,0.6)',
    sally: 'rgba(110,90,66,0.6)',
  };
  for (const a of map.areas) {
    g.strokeStyle = AREA[a.kind] ?? 'rgba(90,82,70,0.5)';
    g.lineWidth = a.r * 2 * p;
    g.lineCap = a.box ? 'butt' : 'round';
    g.lineJoin = 'round';
    g.beginPath();
    const pts = a.pts.length === 1 ? [a.pts[0], a.pts[0]] : a.pts;
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(...xy(x, y)) : g.lineTo(...xy(x, y))));
    g.stroke();
  }
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(201,163,90,0.35)';
  g.lineWidth = 1;
  const [ax, ay] = xy(0, 0);
  const [bx, by] = xy(W, L);
  g.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
}

export function drawReplay(
  canvas: HTMLCanvasElement,
  content: Content,
  data: ReplayData,
  tick: number,
): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 480;
  const cssH = canvas.clientHeight || 480;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const g = canvas.getContext('2d');
  if (!g) return;
  const v = projFor(canvas.width, canvas.height, content, dpr);
  const p = v.p;
  const xy = v.xy;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (content.map.length !== undefined) drawLongGround(g, content, xy, p);
  else {
    const mid = content.map.size / 2;
    const [gcx, gcy] = xy(mid, mid);
    g.beginPath();
    g.ellipse(
      gcx,
      gcy,
      0.612 * content.map.size * v.sx,
      0.612 * content.map.size * v.sy,
      0,
      0,
      Math.PI * 2,
    );
    g.fillStyle = '#14110e';
    g.fill();
    g.strokeStyle = 'rgba(201,163,90,0.35)';
    g.lineWidth = 1;
    g.stroke();
  }

  for (const s of content.map.slots) {
    const state = data.slots.find((x) => x.id === s.id);
    const biome = state?.biomeId ? content.biomeById.get(state.biomeId) : undefined;
    g.beginPath();
    g.ellipse(...xy(s.x, s.y), s.radius * v.sx, s.radius * v.sy, 0, 0, Math.PI * 2);
    if (biome) {
      g.fillStyle = biome.palette.ground + 'cc';
      g.fill();
      g.strokeStyle = biome.palette.glow + '66';
    } else {
      g.fillStyle = 'rgba(42,30,22,0.7)';
      g.fill();
      g.strokeStyle = 'rgba(201,163,90,0.22)';
    }
    g.lineWidth = 1;
    g.stroke();
  }
  // the Long Board's lanes are drawn near their real width (its zones are drawn to scale)
  const lw = content.map.length !== undefined ? content.map.walk.lane * 1.2 : 21;
  for (const lane of [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot]) {
    g.beginPath();
    lane.forEach(([x, y], i) => (i === 0 ? g.moveTo(...xy(x, y)) : g.lineTo(...xy(x, y))));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(201,163,90,0.3)';
    g.lineWidth = (lw + 5) * p;
    g.stroke();
    g.strokeStyle = '#4a3a2a';
    g.lineWidth = lw * p;
    g.stroke();
  }
  for (const t of ['A', 'B'] as const) {
    const [bx, by] = content.map.bases[t];
    g.strokeStyle = teamColor(t) + '88';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(...xy(bx, by), 40 * p, 0, Math.PI * 2);
    g.stroke();
  }

  const col = teamColor(data.team);
  const upto = data.path.filter((q) => q.tick <= tick);
  if (data.path.length > 1) {
    g.strokeStyle = col + '33';
    g.lineWidth = 2;
    g.beginPath();
    data.path.forEach((q, i) => (i === 0 ? g.moveTo(...xy(q.x, q.y)) : g.lineTo(...xy(q.x, q.y))));
    g.stroke();
  }
  if (upto.length > 1) {
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    upto.forEach((q, i) => (i === 0 ? g.moveTo(...xy(q.x, q.y)) : g.lineTo(...xy(q.x, q.y))));
    g.stroke();
  }

  for (const f of data.fights) {
    const sel = f.id === data.selectedFight;
    const active = tick >= f.startTick && tick <= f.endTick;
    g.strokeStyle = sel ? '#ffffff' : active ? '#f0d58a' : 'rgba(201,163,90,0.7)';
    g.fillStyle = sel ? 'rgba(255,255,255,0.18)' : 'rgba(201,163,90,0.12)';
    g.lineWidth = sel ? 3 : 1.5;
    g.beginPath();
    g.arc(...xy(f.x, f.y), 20 * p + 2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  for (const d of data.deaths) {
    g.strokeStyle = '#e0675a';
    g.lineWidth = 2.5;
    const s = 6 * p + 2;
    g.beginPath();
    const [dx, dy] = xy(d.x, d.y);
    g.moveTo(dx - s, dy - s);
    g.lineTo(dx + s, dy + s);
    g.moveTo(dx + s, dy - s);
    g.lineTo(dx - s, dy + s);
    g.stroke();
  }
  for (const b of data.picks) {
    const pt = pointAt(data.path, b.tick);
    if (!pt) continue;
    g.fillStyle = PALETTE.gold;
    const s = 4 * p + 2;
    const [bx, by] = xy(pt.x, pt.y);
    g.fillRect(bx - s, by - s, s * 2, s * 2);
  }
  const now = pointAt(data.path, tick);
  if (now) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(...xy(now.x, now.y), 6 * p + 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(...xy(now.x, now.y), 4 * p + 1, 0, Math.PI * 2);
    g.fill();
  }
}
