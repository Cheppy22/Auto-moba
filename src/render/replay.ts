import type { Content } from '../sim';
import { PALETTE, teamColor } from './theme';
import { makeView, toScreen, toWorld, type View } from './view';

const NO_INSETS = { top: 4, right: 4, bottom: 4, left: 4 };

function replayView(w: number, h: number, mapSize: number, dpr: number): View {
  return makeView(w, h, mapSize, 600, NO_INSETS, 1, dpr);
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
  purchases: { tick: number; label: string }[];
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
  const v = replayView(rect.width, rect.height, content.map.size, 1);
  const w = toWorld(v, clientX - rect.left, clientY - rect.top);
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
  const v = replayView(canvas.width, canvas.height, content.map.size, dpr);
  const p = v.p;
  const xy = (x: number, y: number): [number, number] => {
    const c = toScreen(v, x, y);
    return [c.x, c.y];
  };
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
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
  g.fillStyle = '#12111b';
  g.fill();
  g.strokeStyle = 'rgba(224,169,62,0.35)';
  g.lineWidth = 1;
  g.stroke();

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
      g.fillStyle = 'rgba(16,14,24,0.6)';
      g.fill();
      g.strokeStyle = 'rgba(185,160,230,0.22)';
    }
    g.lineWidth = 1;
    g.stroke();
  }
  for (const lane of [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot]) {
    g.beginPath();
    lane.forEach(([x, y], i) => (i === 0 ? g.moveTo(...xy(x, y)) : g.lineTo(...xy(x, y))));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(120,100,150,0.3)';
    g.lineWidth = 26 * p;
    g.stroke();
    g.strokeStyle = '#272233';
    g.lineWidth = 21 * p;
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
    g.strokeStyle = sel ? '#ffffff' : active ? '#f0b44c' : 'rgba(224,169,62,0.7)';
    g.fillStyle = sel ? 'rgba(255,255,255,0.18)' : 'rgba(224,169,62,0.12)';
    g.lineWidth = sel ? 3 : 1.5;
    g.beginPath();
    g.arc(...xy(f.x, f.y), 20 * p + 2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  for (const d of data.deaths) {
    g.strokeStyle = '#d04a52';
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
  for (const b of data.purchases) {
    const pt = pointAt(data.path, b.tick);
    if (!pt) continue;
    g.fillStyle = PALETTE.gold;
    const s = 4 * p + 2;
    const [bx, by] = xy(pt.x, pt.y);
    g.fillRect(bx - s, by - s, s * 2, s * 2);
  }
  for (const r of data.recalls) {
    const pt = pointAt(data.path, r.tick);
    if (!pt) continue;
    g.strokeStyle = '#c4a8f0';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(...xy(pt.x, pt.y), 7 * p + 3, 0, Math.PI * 2);
    g.stroke();
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
