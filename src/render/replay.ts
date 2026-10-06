import type { Content } from '../sim';
import { PALETTE, teamColor } from './theme';

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
  const size = Math.min(rect.width, rect.height);
  const ox = (rect.width - size) / 2;
  const oy = (rect.height - size) / 2;
  const wx = ((clientX - rect.left - ox) / size) * content.map.size;
  const wy = ((clientY - rect.top - oy) / size) * content.map.size;
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
  const size = Math.min(canvas.width, canvas.height);
  const ox = (canvas.width - size) / 2;
  const oy = (canvas.height - size) / 2;
  const p = size / content.map.size;
  const X = (x: number): number => ox + x * p;
  const Y = (y: number): number => oy + y * p;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#10131c';
  g.fillRect(ox, oy, size, size);

  for (const s of content.map.slots) {
    const state = data.slots.find((x) => x.id === s.id);
    const biome = state?.biomeId ? content.biomeById.get(state.biomeId) : undefined;
    g.beginPath();
    g.arc(X(s.x), Y(s.y), s.radius * p, 0, Math.PI * 2);
    if (biome) {
      g.fillStyle = biome.palette.ground + 'cc';
      g.fill();
      g.strokeStyle = biome.palette.glow + '66';
    } else {
      g.fillStyle = 'rgba(30,34,48,0.5)';
      g.fill();
      g.strokeStyle = 'rgba(140,150,180,0.2)';
    }
    g.lineWidth = 1;
    g.stroke();
  }
  for (const lane of [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot]) {
    g.beginPath();
    lane.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(40,46,66,0.95)';
    g.lineWidth = 22 * p;
    g.stroke();
  }
  for (const t of ['A', 'B'] as const) {
    const [bx, by] = content.map.bases[t];
    g.strokeStyle = teamColor(t) + '88';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(X(bx), Y(by), 40 * p, 0, Math.PI * 2);
    g.stroke();
  }

  const col = teamColor(data.team);
  const upto = data.path.filter((q) => q.tick <= tick);
  if (data.path.length > 1) {
    g.strokeStyle = col + '33';
    g.lineWidth = 2;
    g.beginPath();
    data.path.forEach((q, i) => (i === 0 ? g.moveTo(X(q.x), Y(q.y)) : g.lineTo(X(q.x), Y(q.y))));
    g.stroke();
  }
  if (upto.length > 1) {
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    upto.forEach((q, i) => (i === 0 ? g.moveTo(X(q.x), Y(q.y)) : g.lineTo(X(q.x), Y(q.y))));
    g.stroke();
  }

  for (const f of data.fights) {
    const sel = f.id === data.selectedFight;
    const active = tick >= f.startTick && tick <= f.endTick;
    g.strokeStyle = sel ? '#ffffff' : active ? '#ffd27a' : 'rgba(255,170,90,0.75)';
    g.fillStyle = sel ? 'rgba(255,255,255,0.18)' : 'rgba(255,170,90,0.14)';
    g.lineWidth = sel ? 3 : 1.5;
    g.beginPath();
    g.arc(X(f.x), Y(f.y), 20 * p + 2, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  for (const d of data.deaths) {
    g.strokeStyle = '#ff6b81';
    g.lineWidth = 2.5;
    const s = 6 * p + 2;
    g.beginPath();
    g.moveTo(X(d.x) - s, Y(d.y) - s);
    g.lineTo(X(d.x) + s, Y(d.y) + s);
    g.moveTo(X(d.x) + s, Y(d.y) - s);
    g.lineTo(X(d.x) - s, Y(d.y) + s);
    g.stroke();
  }
  for (const b of data.purchases) {
    const pt = pointAt(data.path, b.tick);
    if (!pt) continue;
    g.fillStyle = PALETTE.gold;
    const s = 4 * p + 2;
    g.fillRect(X(pt.x) - s, Y(pt.y) - s, s * 2, s * 2);
  }
  for (const r of data.recalls) {
    const pt = pointAt(data.path, r.tick);
    if (!pt) continue;
    g.strokeStyle = '#a8d8ff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(X(pt.x), Y(pt.y), 7 * p + 3, 0, Math.PI * 2);
    g.stroke();
  }
  const now = pointAt(data.path, tick);
  if (now) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(X(now.x), Y(now.y), 6 * p + 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(X(now.x), Y(now.y), 4 * p + 1, 0, Math.PI * 2);
    g.fill();
  }
}
