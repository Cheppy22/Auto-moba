import type { Content, Snapshot, SnapUnit } from '../sim';
import { drawSigil, type SigilSpec } from './sigils';
import { DISPLAY_FONT, PALETTE, teamColor } from './theme';
import {
  drawShopStall,
  drawCamp,
  drawHeroFrame,
  drawGuardian,
  drawMinion,
  drawObelisk,
  drawTower,
} from './icons';
import { makeView, toScreen, toWorld, type Insets, type View } from './view';

export interface CurseMark {
  heroId: number;
  startTick: number;
  life: number;
  title: string;
  own: boolean;
}

export interface DrawOptions {
  alpha: number;
  highlightId?: number | null;
  curses?: CurseMark[];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;
const GROUND_R = 612;
const EVENT_COLORS: Record<string, string> = {
  procession: '#f0b44c',
  parade: '#c4a8f0',
  well: '#6fb4d0',
  oni: '#d04a52',
};

export function drawButterfly(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  flap: number,
  color: string,
): void {
  const open = 0.55 + 0.45 * Math.abs(flap);
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.strokeStyle = '#120a06';
  g.lineWidth = Math.max(0.6, s * 0.06);
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * s * 0.45 * open, -s * 0.22, s * 0.5 * open, s * 0.38, side * -0.5, 0, TAU);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(side * s * 0.32 * open, s * 0.3, s * 0.3 * open, s * 0.26, side * 0.6, 0, TAU);
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#120a06';
  g.fillRect(-s * 0.05, -s * 0.45, s * 0.1, s * 0.9);
  g.restore();
}

interface MapLabel {
  text: string;
  x: number;
  y: number;
  px: number;
  fill: string;
  prio: number;
  pinned?: boolean;
  bold?: boolean;
}

interface Obstacle {
  x: number;
  y: number;
  r: number;
}

const HALO_TICKS = 60;

export class Renderer {
  private labels: MapLabel[] = [];
  private obstacles: Obstacle[] = [];
  private haloUntil = 0;
  private haloRequested = false;
  private lastPhaseKey = '';
  private lastPlayerAlive: boolean | null = null;
  private g: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement;
  private backdropKey = '';
  private view: View = { cx: 0, cy: 0, sx: 1, sy: 1, p: 1, mid: 500 };
  private size = 1000;
  private halfSpan = 640;
  private insets: Insets = { top: 8, right: 8, bottom: 8, left: 8 };
  private maxStretch = 1.3;
  private sigils = new Map<string, SigilSpec>();
  private lanes: [number, number][][];
  private bases: { A: [number, number]; B: [number, number] };

  constructor(
    private canvas: HTMLCanvasElement,
    private content: Content,
  ) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d canvas unavailable');
    this.g = g;
    void document.fonts?.ready.then(() => {
      this.backdropKey = '';
    });
    this.backdrop = document.createElement('canvas');
    this.size = content.map.size;
    this.lanes = [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot] as [
      number,
      number,
    ][][];
    this.bases = content.map.bases as { A: [number, number]; B: [number, number] };
    for (const h of content.heroes) this.sigils.set(h.id, h.sigil);
  }

  setFrame(insets: Insets, maxStretch: number): void {
    const i = this.insets;
    if (
      i.top === insets.top &&
      i.right === insets.right &&
      i.bottom === insets.bottom &&
      i.left === insets.left &&
      this.maxStretch === maxStretch
    )
      return;
    this.insets = { ...insets };
    this.maxStretch = maxStretch;
    this.backdropKey = '';
  }

  getView(): View {
    return this.view;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || 800;
    const cssH = this.canvas.clientHeight || 800;
    const w = Math.max(200, Math.round(cssW * dpr));
    const h = Math.max(200, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.backdrop.width = w;
      this.backdrop.height = h;
      this.backdropKey = '';
    }
    this.view = makeView(w, h, this.size, this.halfSpan, this.insets, this.maxStretch, dpr);
  }

  private S(x: number, y: number): { x: number; y: number } {
    return toScreen(this.view, x, y);
  }

  private ellipse(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const c = this.S(x, y);
    g.beginPath();
    g.ellipse(c.x, c.y, r * this.view.sx, r * this.view.sy, 0, 0, TAU);
  }

  private paintVoid(b: CanvasRenderingContext2D): void {
    const W = this.backdrop.width;
    const H = this.backdrop.height;
    b.fillStyle = PALETTE.bg;
    b.fillRect(0, 0, W, H);
    const c = this.S(this.size / 2, this.size / 2);
    const haze = b.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(W, H) * 0.7);
    haze.addColorStop(0, '#1a1426');
    haze.addColorStop(0.55, '#0d0d14');
    haze.addColorStop(1, '#050508');
    b.fillStyle = haze;
    b.fillRect(0, 0, W, H);
    let seed = 1337;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const stars = Math.round((W * H) / 9000);
    for (let i = 0; i < stars; i++) {
      const a = rnd() * 0.5 + 0.08;
      b.fillStyle = rnd() < 0.2 ? `rgba(200,170,255,${a})` : `rgba(235,225,200,${a})`;
      const r = rnd() < 0.08 ? 1.6 : 0.8;
      b.fillRect(rnd() * W, rnd() * H, r, r);
    }
  }

  private paintSeal(b: CanvasRenderingContext2D): void {
    const v = this.view;
    const m = this.size / 2;
    const ring = (r: number, alpha: number, dash: number[] = []): void => {
      this.ellipse(b, m, m, r);
      b.strokeStyle = `rgba(185,160,230,${alpha})`;
      b.setLineDash(dash);
      b.stroke();
    };
    b.lineWidth = 1;
    ring(470, 0.1);
    ring(455, 0.07, [2, 6]);
    ring(300, 0.08);
    ring(150, 0.1);
    const star = (rot: number): void => {
      b.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = rot + (i / 3) * TAU;
        const c = this.S(m + Math.cos(a) * 300, m + Math.sin(a) * 300);
        if (i === 0) b.moveTo(c.x, c.y);
        else b.lineTo(c.x, c.y);
      }
      b.strokeStyle = 'rgba(185,160,230,0.07)';
      b.setLineDash([]);
      b.stroke();
    };
    star(Math.PI / 4);
    star(Math.PI / 4 + Math.PI);
    b.fillStyle = 'rgba(185,160,230,0.16)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const c = this.S(m + Math.cos(a) * 470, m + Math.sin(a) * 470);
      const r = (i % 6 === 0 ? 3 : 1.5) * v.p * 1.4;
      b.beginPath();
      b.arc(c.x, c.y, r, 0, TAU);
      b.fill();
    }
    for (const [r, alpha, w] of [
      [GROUND_R, 0.55, 1.6],
      [GROUND_R - 14, 0.22, 1],
    ] as const) {
      this.ellipse(b, m, m, r);
      b.strokeStyle = `rgba(224,169,62,${alpha})`;
      b.lineWidth = w;
      b.setLineDash([]);
      b.stroke();
    }
    this.ellipse(b, m, m, 62);
    b.strokeStyle = 'rgba(224,169,62,0.28)';
    b.lineWidth = 1.2;
    b.stroke();
  }

  private lanePt(lane: [number, number][], t: number): [number, number] {
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < lane.length; i++) {
      const d = Math.hypot(lane[i][0] - lane[i - 1][0], lane[i][1] - lane[i - 1][1]);
      segs.push(d);
      total += d;
    }
    let want = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i] || i === segs.length - 1) {
        const f = segs[i] === 0 ? 0 : Math.min(1, want / segs[i]);
        return [
          lane[i][0] + (lane[i + 1][0] - lane[i][0]) * f,
          lane[i][1] + (lane[i + 1][1] - lane[i][1]) * f,
        ];
      }
      want -= segs[i];
    }
    return lane[0];
  }

  private distToLanes(x: number, y: number): number {
    let best = Infinity;
    for (const lane of this.lanes) {
      for (let i = 1; i < lane.length; i++) {
        const [ax, ay] = lane[i - 1];
        const [bx, by] = lane[i];
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        best = Math.min(best, Math.hypot(x - (ax + dx * f), y - (ay + dy * f)));
      }
    }
    return best;
  }

  private paintGround(b: CanvasRenderingContext2D): void {
    const p = this.view.p;
    const m = this.size / 2;
    this.ellipse(b, m, m, GROUND_R);
    const c = this.S(this.size / 2, this.size / 2);
    const gr = b.createRadialGradient(c.x, c.y, 0, c.x, c.y, this.view.sx * 760);
    gr.addColorStop(0, '#1d1a26');
    gr.addColorStop(1, '#13121a');
    b.fillStyle = gr;
    b.fill();
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 520; i++) {
      const x = m - GROUND_R + rnd() * GROUND_R * 2;
      const y = m - GROUND_R + rnd() * GROUND_R * 2;
      const kind = rnd();
      if (Math.hypot(x - m, y - m) > GROUND_R - 14 || this.distToLanes(x, y) < 36) continue;
      const q = this.S(x, y);
      if (kind < 0.55) {
        b.fillStyle = 'rgba(90,110,80,0.35)';
        b.beginPath();
        b.ellipse(q.x, q.y, 2.2 * p, 1.3 * p, 0, 0, TAU);
        b.fill();
        b.fillRect(q.x - 0.5 * p, q.y - 3.5 * p, Math.max(1, 0.8 * p), 3 * p);
      } else {
        b.fillStyle = 'rgba(120,112,130,0.28)';
        b.beginPath();
        b.ellipse(q.x, q.y, 2.6 * p, 1.6 * p, 0, 0, TAU);
        b.fill();
      }
    }
  }

  private gateGeometry(slotId: string): {
    ports: { lane: number; gx: number; gy: number; ex: number; ey: number; ang: number }[];
    cx: number;
    cy: number;
    r: number;
  } | null {
    const def = this.content.map.slots.find((x) => x.id === slotId);
    if (!def) return null;
    const names = ['top', 'mid', 'bot'];
    const ports = def.ports.map((pt) => {
      const lane = names.indexOf(pt.lane);
      const [gx, gy] = this.lanePt(this.lanes[lane], pt.t);
      const ang = Math.atan2(gy - def.y, gx - def.x);
      return {
        lane,
        gx,
        gy,
        ex: def.x + Math.cos(ang) * def.radius,
        ey: def.y + Math.sin(ang) * def.radius,
        ang,
      };
    });
    return { ports, cx: def.x, cy: def.y, r: def.radius };
  }

  private paintWalls(b: CanvasRenderingContext2D, snap: Snapshot): void {
    const p = this.view.p;
    for (const s of snap.slots) {
      if (!s.open || !s.biomeId) continue;
      const geo = this.gateGeometry(s.id);
      if (!geo) continue;
      const biome = this.content.biomeById.get(s.biomeId)!;
      const gap = 0.2;
      const gaps = geo.ports.map((q) => q.ang);
      const inGap = (a: number): boolean =>
        gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gap);
      const R = geo.r * 1.04;
      const steps = 72;
      for (const [w, col] of [
        [7 * p, 'rgba(8,7,10,0.9)'],
        [3.2 * p, biome.palette.accent + 'bb'],
      ] as const) {
        b.lineWidth = w;
        b.strokeStyle = col;
        b.lineCap = 'butt';
        let drawing = false;
        b.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * TAU;
          if (inGap(a)) {
            drawing = false;
            continue;
          }
          const c = this.S(geo.cx + Math.cos(a) * R, geo.cy + Math.sin(a) * R);
          if (!drawing) {
            b.moveTo(c.x, c.y);
            drawing = true;
          } else b.lineTo(c.x, c.y);
        }
        b.stroke();
      }
      for (const q of geo.ports) {
        for (const side of [-1, 1]) {
          const a = q.ang + side * gap;
          const c = this.S(geo.cx + Math.cos(a) * R, geo.cy + Math.sin(a) * R);
          b.fillStyle = biome.palette.glow;
          b.beginPath();
          b.arc(c.x, c.y, 2.6 * p, 0, TAU);
          b.fill();
        }
      }
    }
  }

  private paintTrails(b: CanvasRenderingContext2D, snap: Snapshot): void {
    const p = this.view.p;
    for (const s of snap.slots) {
      if (!s.open || !s.biomeId) continue;
      const geo = this.gateGeometry(s.id);
      if (!geo) continue;
      for (const q of geo.ports) {
        const a = this.S(q.gx, q.gy);
        const e = this.S(q.ex, q.ey);
        b.beginPath();
        b.moveTo(a.x, a.y);
        b.lineTo(e.x, e.y);
        b.lineCap = 'round';
        b.strokeStyle = 'rgba(52,44,34,0.9)';
        b.lineWidth = 11 * p;
        b.stroke();
        b.strokeStyle = 'rgba(190,160,100,0.45)';
        b.lineWidth = 1.2;
        b.setLineDash([3 * p, 5 * p]);
        b.stroke();
        b.setLineDash([]);
      }
    }
  }

  private paintGates(b: CanvasRenderingContext2D, snap: Snapshot): void {
    const p = this.view.p;
    for (const s of snap.slots) {
      if (!s.open || !s.biomeId) continue;
      const geo = this.gateGeometry(s.id);
      if (!geo) continue;
      const biome = this.content.biomeById.get(s.biomeId)!;
      for (const q of geo.ports) {
        const c = this.S(q.gx, q.gy);
        const w = 9 * p;
        const h = 11 * p;
        b.strokeStyle = '#120a0c';
        b.lineWidth = 4.4 * p;
        b.lineCap = 'round';
        b.beginPath();
        b.moveTo(c.x - w, c.y + h * 0.4);
        b.lineTo(c.x - w, c.y - h * 0.5);
        b.moveTo(c.x + w, c.y + h * 0.4);
        b.lineTo(c.x + w, c.y - h * 0.5);
        b.moveTo(c.x - w * 1.35, c.y - h * 0.55);
        b.lineTo(c.x + w * 1.35, c.y - h * 0.55);
        b.stroke();
        b.strokeStyle = q.lane === 1 ? '#e0a93e' : biome.palette.glow;
        b.lineWidth = 2 * p;
        b.stroke();
      }
    }
  }

  private paintLaneLabels(b: CanvasRenderingContext2D): void {
    const p = this.view.p;
    const specs: { lane: number; t: number; text: string }[] = [
      { lane: 0, t: 0.25, text: 'LEFT LANE' },
      { lane: 1, t: 0.33, text: 'MID' },
      { lane: 2, t: 0.75, text: 'RIGHT LANE' },
    ];
    b.font = `${Math.max(9, Math.round(10 * p * 1.3))}px ${DISPLAY_FONT}`;
    b.textAlign = 'center';
    b.fillStyle = 'rgba(224,200,150,0.38)';
    for (const sp of specs) {
      const lane = this.lanes[sp.lane];
      const a = this.lanePt(lane, sp.t - 0.01);
      const c = this.lanePt(lane, sp.t + 0.01);
      const A = this.S(a[0], a[1]);
      const B = this.S(c[0], c[1]);
      const mid = this.lanePt(lane, sp.t);
      const M = this.S(mid[0], mid[1]);
      let ang = Math.atan2(B.y - A.y, B.x - A.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      b.save();
      b.translate(M.x, M.y);
      b.rotate(ang);
      b.fillText(sp.text, 0, -9 * p);
      b.restore();
    }
  }

  private drawCurseAura(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    tick: number,
    id: number,
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(tick / 7 + id);
    g.save();
    g.translate(x, y);
    const gr = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.4);
    gr.addColorStop(0, `rgba(179,38,46,${0.1 + 0.15 * pulse})`);
    gr.addColorStop(1, 'rgba(179,38,46,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, r * 2.4, 0, TAU);
    g.fill();
    g.rotate(tick / 60);
    g.setLineDash([r * 0.5, r * 0.4]);
    g.lineWidth = Math.max(1.2, r * 0.12);
    g.strokeStyle = `rgba(224,84,92,${0.55 + 0.4 * pulse})`;
    g.beginPath();
    g.arc(0, 0, r * 1.75, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    for (let i = 0; i < 5; i++) {
      const ph = (tick / 40 + i / 5) % 1;
      const a = (i / 5) * TAU + id;
      g.fillStyle = `rgba(255,140,120,${0.8 * (1 - ph)})`;
      g.beginPath();
      g.arc(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4 - ph * r * 1.6, r * 0.1, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  private drawCurseMarks(
    g: CanvasRenderingContext2D,
    snap: Snapshot,
    marks: CurseMark[],
    byId: Map<number, SnapUnit>,
    q: number,
    alpha: number,
  ): void {
    for (const m of marks) {
      const t = snap.tick - m.startTick;
      if (t < 0 || t > m.life) continue;
      const u = byId.get(m.heroId);
      if (!u) continue;
      const c = this.S(lerp(u.px, u.x, alpha), lerp(u.py, u.y, alpha));
      const fade = Math.min(1, (m.life - t) / 30);
      const r = 11 * q;
      g.save();
      g.globalAlpha = fade;
      if (t < 70) {
        for (let i = 0; i < 3; i++) {
          const f = Math.max(0, Math.min(1, (t - i * 10) / 50));
          if (f <= 0 || f >= 1) continue;
          g.beginPath();
          g.arc(c.x, c.y, r * (1.5 + f * 6), 0, TAU);
          g.lineWidth = Math.max(2, 4 * q * (1 - f));
          g.strokeStyle = `rgba(224,84,92,${1 - f})`;
          g.stroke();
        }
      }
      const label = `Cursed: ${m.title}`;
      g.font = `${Math.max(11, Math.round(11 * q))}px ${DISPLAY_FONT}`;
      const w = g.measureText(label).width + 22 * q * 0.6;
      const h = 16 * q * 0.9;
      const lx = c.x - w / 2;
      const ly = c.y - r * 2.6 - h;
      g.fillStyle = 'rgba(110,20,27,0.95)';
      g.strokeStyle = m.own ? '#f0d58a' : '#e0545c';
      g.lineWidth = Math.max(1.2, q * 0.9);
      g.beginPath();
      g.roundRect(lx, ly, w, h, 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#fbeee2';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, c.x, ly + h / 2 + 1);
      g.textBaseline = 'alphabetic';
      g.restore();
    }
  }

  private paintBiomeArt(
    b: CanvasRenderingContext2D,
    slot: { x: number; y: number; radius: number },
    biomeId: string,
    glow: string,
  ): void {
    const p = this.view.p;
    const c = this.S(slot.x, slot.y);
    const rx = slot.radius * this.view.sx;
    const ry = slot.radius * this.view.sy;
    b.save();
    b.beginPath();
    b.ellipse(c.x, c.y, rx * 0.98, ry * 0.98, 0, 0, TAU);
    b.clip();
    b.lineWidth = Math.max(0.8, 0.9 * p);
    let seed = biomeId.length * 7919 + Math.round(slot.x * 3 + slot.y);
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    if (biomeId === 'shrine') {
      for (let i = 1; i <= 5; i++) {
        b.strokeStyle = glow + (i % 2 ? '26' : '16');
        b.beginPath();
        b.ellipse(c.x, c.y, rx * (0.2 + i * 0.16), ry * (0.2 + i * 0.16), 0, 0, TAU);
        b.stroke();
      }
      b.fillStyle = glow + '30';
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU;
        const r = 0.2 + rnd() * 0.65;
        b.beginPath();
        b.ellipse(
          c.x + Math.cos(a) * rx * r,
          c.y + Math.sin(a) * ry * r,
          4 * p,
          2.4 * p,
          0.3,
          0,
          TAU,
        );
        b.fill();
      }
    } else if (biomeId === 'foundry') {
      b.strokeStyle = glow + '30';
      b.lineWidth = Math.max(1, 2.2 * p);
      b.setLineDash([5 * p, 4 * p]);
      for (const k of [0.45, 0.72]) {
        b.beginPath();
        b.ellipse(c.x, c.y, rx * k, ry * k, 0, 0, TAU);
        b.stroke();
      }
      b.setLineDash([]);
      b.fillStyle = glow + '66';
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU;
        const r = rnd() * 0.9;
        const sz = (0.6 + rnd() * 1.4) * p;
        b.fillRect(c.x + Math.cos(a) * rx * r, c.y + Math.sin(a) * ry * r, sz, sz);
      }
    } else {
      b.strokeStyle = glow + '30';
      b.lineWidth = Math.max(1, 1.4 * p);
      for (const off of [-0.14, 0.14]) {
        const a = this.S(slot.x - slot.radius, slot.y + off * slot.radius * 2);
        const e = this.S(slot.x + slot.radius, slot.y + off * slot.radius * 2);
        b.beginPath();
        b.moveTo(a.x, a.y);
        b.lineTo(e.x, e.y);
        b.stroke();
      }
      b.strokeStyle = glow + '22';
      for (let i = -6; i <= 6; i++) {
        const a = this.S(slot.x + (i / 6) * slot.radius * 0.95, slot.y - slot.radius * 0.2);
        const e = this.S(slot.x + (i / 6) * slot.radius * 0.95, slot.y + slot.radius * 0.2);
        b.beginPath();
        b.moveTo(a.x, a.y);
        b.lineTo(e.x, e.y);
        b.stroke();
      }
    }
    b.restore();
  }

  shopPoints(): { id: string; x: number; y: number }[] {
    const k = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    return this.content.map.shops.map((sh) => {
      const c = this.S(sh.x, sh.y);
      return { id: sh.id, x: Math.round(c.x / k), y: Math.round(c.y / k) };
    });
  }

  pickShop(canvasX: number, canvasY: number, tolerance = 70): string | null {
    const w = toWorld(this.view, canvasX, canvasY);
    let best: { id: string; d: number } | null = null;
    for (const sh of this.content.map.shops) {
      const d = Math.hypot(sh.x - w.x, sh.y - w.y);
      if (d <= tolerance && (!best || d < best.d)) best = { id: sh.id, d };
    }
    return best?.id ?? null;
  }

  private drawShops(g: CanvasRenderingContext2D, snap: Snapshot, q: number): void {
    const player = snap.units.find((u) => u.id === snap.playerHeroId);
    for (const sh of this.content.map.shops) {
      const c = this.S(sh.x, sh.y);
      const order = snap.suggest.indexOf(sh.id) + 1;
      const near = !!player && Math.hypot(player.x - sh.x, player.y - sh.y) < sh.radius + 20;
      g.save();
      g.beginPath();
      g.ellipse(c.x, c.y, sh.radius * this.view.sx, sh.radius * this.view.sy, 0, 0, TAU);
      g.fillStyle = order > 0 ? 'rgba(240,213,138,0.12)' : 'rgba(240,213,138,0.05)';
      g.fill();
      g.setLineDash([4 * q, 4 * q]);
      g.lineWidth = Math.max(1, 1.2 * q);
      g.strokeStyle = order > 0 ? '#f0d58a' : 'rgba(240,213,138,0.4)';
      g.stroke();
      g.setLineDash([]);
      g.restore();
      if (order > 0 && player) {
        const from = this.S(player.x, player.y);
        g.save();
        g.setLineDash([3 * q, 5 * q]);
        g.lineWidth = Math.max(1, 1.4 * q);
        g.strokeStyle = 'rgba(240,213,138,0.55)';
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(c.x, c.y);
        g.stroke();
        g.restore();
      }
      drawShopStall(g, c.x, c.y, 8 * q, snap.tick, order, near);
      this.labels.push({
        text: sh.name,
        x: c.x,
        y: c.y + 14 * q,
        px: Math.max(10, Math.round(10 * q * 1.1)),
        fill: order > 0 ? '#f0d58a' : 'rgba(240,213,138,0.85)',
        prio: 2,
      });
    }
  }

  private drawMotes(g: CanvasRenderingContext2D, snap: Snapshot, q: number): void {
    const m = this.size / 2;
    for (let i = 0; i < 34; i++) {
      const h = (i * 2654435761) >>> 0;
      const a0 = ((h & 1023) / 1023) * TAU;
      const r0 = 120 + (((h >>> 10) & 1023) / 1023) * 440;
      const ph = ((h >>> 20) & 255) / 255;
      const t = snap.tick / 20;
      const a = a0 + Math.sin(t * 0.15 + ph * 6) * 0.08;
      const r = r0 + Math.sin(t * 0.3 + ph * 9) * 14;
      const c = this.S(m + Math.cos(a) * r, m + Math.sin(a) * r - Math.sin(t * 0.5 + ph * 5) * 8);
      const al = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9 + ph * 12));
      g.fillStyle = i % 3 === 0 ? `rgba(240,213,138,${al})` : `rgba(196,168,240,${al})`;
      g.beginPath();
      g.arc(c.x, c.y, (0.9 + (i % 4) * 0.35) * q * 0.5, 0, TAU);
      g.fill();
    }
  }

  private paintBackdrop(snap: Snapshot): void {
    const key =
      snap.slots.map((s) => `${s.id}${s.open ? s.biomeId : '-'}`).join('|') +
      `${this.canvas.width}x${this.canvas.height}:${this.view.cx},${this.view.cy},${this.view.sx},${this.view.sy}`;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    const b = this.backdrop.getContext('2d')!;
    const p = this.view.p;
    b.setTransform(1, 0, 0, 1, 0, 0);
    this.paintVoid(b);
    this.paintGround(b);
    this.paintSeal(b);
    for (const s of snap.slots) {
      const c = this.S(s.x, s.y);
      const rx = s.radius * this.view.sx;
      const ry = s.radius * this.view.sy;
      if (s.open && s.biomeId) {
        const biome = this.content.biomeById.get(s.biomeId)!;
        b.save();
        b.translate(c.x, c.y);
        b.scale(rx / s.radius, ry / s.radius);
        const gr = b.createRadialGradient(0, 0, s.radius * 0.1, 0, 0, s.radius * 1.3);
        gr.addColorStop(0, biome.palette.accent + 'aa');
        gr.addColorStop(0.6, biome.palette.ground + 'cc');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = gr;
        b.beginPath();
        b.arc(0, 0, s.radius * 1.3, 0, TAU);
        b.fill();
        b.restore();
        this.paintBiomeArt(b, s, s.biomeId, biome.palette.glow);
        b.strokeStyle = biome.palette.glow + '99';
        b.lineWidth = 1.5;
        b.setLineDash([]);
        this.ellipse(b, s.x, s.y, s.radius);
        b.stroke();
        b.strokeStyle = biome.palette.glow + '44';
        this.ellipse(b, s.x, s.y, s.radius * 1.12);
        b.stroke();
        b.fillStyle = biome.palette.glow + '99';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          b.beginPath();
          b.arc(
            c.x + Math.cos(a) * rx * 1.06,
            c.y + Math.sin(a) * ry * 1.06,
            Math.max(1, 1.6 * p),
            0,
            TAU,
          );
          b.fill();
        }
      } else {
        b.fillStyle = 'rgba(10,8,16,0.82)';
        this.ellipse(b, s.x, s.y, s.radius);
        b.fill();
        b.strokeStyle = 'rgba(185,160,230,0.12)';
        b.setLineDash([4 * p, 7 * p]);
        b.stroke();
        b.setLineDash([]);
      }
    }
    this.paintWalls(b, snap);
    this.paintTrails(b, snap);
    const laneTint = ['rgba(120,190,200,0.45)', 'rgba(224,169,62,0.5)', 'rgba(200,120,170,0.45)'];
    for (const [li, lane] of this.lanes.entries()) {
      const trace = (): void => {
        b.beginPath();
        lane.forEach(([x, y], i) => {
          const c = this.S(x, y);
          if (i === 0) b.moveTo(c.x, c.y);
          else b.lineTo(c.x, c.y);
        });
      };
      b.lineCap = 'round';
      b.lineJoin = 'round';
      trace();
      b.strokeStyle = laneTint[li].replace(/[\d.]+\)$/, '0.38)');
      b.lineWidth = 36 * p;
      b.stroke();
      trace();
      b.strokeStyle = '#272233';
      b.lineWidth = 28 * p;
      b.stroke();
      trace();
      b.strokeStyle = laneTint[li];
      b.lineWidth = 1.4;
      b.setLineDash([6 * p, 10 * p]);
      b.stroke();
      b.setLineDash([]);
    }
    this.paintGates(b, snap);
    this.paintLaneLabels(b);
    for (const t of ['A', 'B'] as const) {
      const [x, y] = this.bases[t];
      const c = this.S(x, y);
      const R = 90 * p;
      const gr = b.createRadialGradient(c.x, c.y, 4, c.x, c.y, R);
      gr.addColorStop(0, teamColor(t) + '55');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = gr;
      b.beginPath();
      b.arc(c.x, c.y, R, 0, TAU);
      b.fill();
      b.strokeStyle = teamColor(t) + '99';
      b.lineWidth = 1.5;
      b.beginPath();
      b.arc(c.x, c.y, 60 * p, 0, TAU);
      b.stroke();
      b.strokeStyle = teamColor(t) + '55';
      b.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = -Math.PI / 2 + (i * 2 * TAU) / 6;
        const px = c.x + Math.cos(a) * 52 * p;
        const py = c.y + Math.sin(a) * 52 * p;
        if (i === 0) b.moveTo(px, py);
        else b.lineTo(px, py);
      }
      b.stroke();
    }
  }

  private bar(x: number, y: number, w: number, frac: number, color: string): void {
    const g = this.g;
    const h = Math.max(2.5, 3.4 * this.view.p);
    const f = Math.max(0, Math.min(1, frac));
    g.fillStyle = 'rgba(8,6,12,0.82)';
    g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * f, h);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x - w / 2, y, w * f, h * 0.4);
  }

  private drawEvents(g: CanvasRenderingContext2D, snap: Snapshot, q: number): void {
    const v = this.view;
    for (const e of snap.events) {
      const c = this.S(e.x, e.y);
      const col = EVENT_COLORS[e.type] ?? PALETTE.spirit;
      const warn = e.phase === 'warning';
      const pulse = 0.5 + 0.5 * Math.sin(snap.tick / 6);
      const rx = e.radius * v.sx;
      const ry = e.radius * v.sy;
      g.save();
      g.beginPath();
      g.ellipse(c.x, c.y, rx, ry, 0, 0, TAU);
      g.fillStyle = col + (warn ? '10' : '22');
      g.fill();
      g.lineWidth = Math.max(1.5, 1.6 * q);
      g.strokeStyle =
        col +
        (warn
          ? Math.round(80 + 120 * pulse)
              .toString(16)
              .padStart(2, '0')
          : 'dd');
      g.setLineDash(warn ? [5 * q, 5 * q] : []);
      g.stroke();
      g.setLineDash([]);
      if (!warn && e.progress !== undefined) {
        g.beginPath();
        g.ellipse(
          c.x,
          c.y,
          rx * 1.14,
          ry * 1.14,
          0,
          -Math.PI / 2,
          -Math.PI / 2 + TAU * Math.min(1, e.progress),
        );
        g.strokeStyle = e.team ? teamColor(e.team) : col;
        g.lineWidth = Math.max(2, 2.4 * q);
        g.stroke();
      }
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = Math.max(1.2, 1.4 * q);
      const s = 7 * q;
      g.beginPath();
      if (e.type === 'procession') {
        g.roundRect(c.x - s * 0.55, c.y - s * 0.8, s * 1.1, s * 1.6, s * 0.4);
        g.moveTo(c.x, c.y - s * 1.2);
        g.lineTo(c.x, c.y - s * 0.8);
        g.stroke();
      } else if (e.type === 'oni') {
        g.moveTo(c.x - s, c.y + s * 0.8);
        g.lineTo(c.x - s * 0.6, c.y - s);
        g.lineTo(c.x - s * 0.15, c.y - s * 0.2);
        g.lineTo(c.x + s * 0.15, c.y - s * 0.2);
        g.lineTo(c.x + s * 0.6, c.y - s);
        g.lineTo(c.x + s, c.y + s * 0.8);
        g.closePath();
        g.stroke();
      } else if (e.type === 'well') {
        g.ellipse(c.x, c.y, s, s * 0.7, 0, 0, TAU);
        g.moveTo(c.x + s * 0.5, c.y);
        g.ellipse(c.x, c.y, s * 0.5, s * 0.35, 0, 0, TAU);
        g.stroke();
      } else {
        for (let i = -1; i <= 1; i++) {
          g.moveTo(c.x + i * s * 0.9 + s * 0.35, c.y);
          g.arc(c.x + i * s * 0.9, c.y, s * 0.35, 0, TAU);
        }
        g.stroke();
      }
      this.labels.push({
        text: warn ? `${e.name} in ${Math.ceil(e.ticksLeft / 20)}s` : e.name,
        x: c.x,
        y: c.y + ry + 13 * q,
        px: Math.max(10, Math.round(10 * q * 1.2)),
        fill: col,
        prio: 1,
      });
      if (e.telegraph) {
        const t = this.S(e.telegraph.x, e.telegraph.y);
        g.beginPath();
        g.ellipse(t.x, t.y, e.telegraph.radius * v.sx, e.telegraph.radius * v.sy, 0, 0, TAU);
        g.fillStyle = `rgba(208,74,82,${0.12 + 0.18 * pulse})`;
        g.fill();
        g.strokeStyle = '#d04a52';
        g.stroke();
      }
      g.restore();
    }
  }

  /** Flash the player's halo again (e.g. when their portrait is tapped). */
  flashHalo(): void {
    this.haloRequested = true;
  }

  private trackHalo(snap: Snapshot): void {
    const player = snap.units.find((u) => u.isPlayer);
    const phaseKey = `${snap.phase.kind}${snap.phase.n}`;
    const alive = player ? player.alive : null;
    const liveStart = phaseKey !== this.lastPhaseKey && snap.phase.kind === 'live';
    const respawn = this.lastPlayerAlive === false && alive === true;
    if (liveStart || respawn || this.haloRequested) this.haloUntil = snap.tick + HALO_TICKS;
    this.haloRequested = false;
    this.lastPhaseKey = phaseKey;
    this.lastPlayerAlive = alive;
  }

  private cssDpr(): number {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  private youPx(q: number): number {
    const dpr = this.cssDpr();
    const narrow = this.canvas.clientWidth < 600;
    return Math.max((narrow ? 12 : 11) * dpr, Math.round(10 * q * 1.5));
  }

  private drawYouRing(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    tick: number,
    alive: boolean,
    q: number,
  ): void {
    g.save();
    g.strokeStyle = alive ? '#f0c24a' : 'rgba(240,194,74,0.45)';
    g.lineWidth = Math.max(1, 1.3 * q);
    g.beginPath();
    g.arc(x, y, r * 1.4, 0, TAU);
    g.stroke();
    const left = this.haloUntil - tick;
    if (alive && left > 0) {
      const f = left / HALO_TICKS;
      const pulse = 0.5 + 0.5 * Math.sin(tick / 2.5);
      const rad = r * 1.4 * (1 + pulse * 1);
      g.globalAlpha = Math.min(1, 0.35 + f * 0.65);
      g.strokeStyle = '#fff1b8';
      g.lineWidth = Math.max(2, 2.4 * q);
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(240,194,74,0.16)';
      g.fill();
    }
    g.restore();
  }

  private addSlotLabels(snap: Snapshot): void {
    const narrow = this.canvas.clientWidth < 600;
    for (const s of snap.slots) {
      const c = this.S(s.x, s.y);
      if (s.open && s.biomeId) {
        const biome = this.content.biomeById.get(s.biomeId);
        if (!biome) continue;
        this.labels.push({
          text: biome.name,
          x: c.x,
          y: c.y - s.radius * this.view.sy * 1.12 - 6 * this.view.p,
          px: Math.max(10, Math.round(11 * this.view.p * 1.3)),
          fill: biome.palette.glow + 'dd',
          prio: 4,
        });
      } else if (!narrow) {
        this.labels.push({
          text: 'uncharted',
          x: c.x,
          y: c.y + 4 * this.view.p,
          px: Math.max(9, Math.round(13 * this.view.p * 1.3)),
          fill: 'rgba(200,185,225,0.2)',
          prio: 5,
        });
      }
    }
  }

  private drawLabels(g: CanvasRenderingContext2D): void {
    const dpr = this.cssDpr();
    const step = 10 * dpr;
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    const hits = (b: { l: number; t: number; r: number; b: number }) => {
      for (const o of placed) if (b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t) return true;
      for (const o of this.obstacles) {
        const cx = Math.max(b.l, Math.min(o.x, b.r));
        const cy = Math.max(b.t, Math.min(o.y, b.b));
        if ((cx - o.x) ** 2 + (cy - o.y) ** 2 < o.r * o.r) return true;
      }
      return false;
    };
    g.save();
    g.textAlign = 'center';
    g.lineJoin = 'round';
    const order = this.labels.slice().sort((a, b) => a.prio - b.prio);
    for (const lb of order) {
      g.font = `${lb.bold ? 'bold ' : ''}${lb.px}px ${DISPLAY_FONT}`;
      const w = g.measureText(lb.text).width;
      const h = lb.px;
      let placedY: number | null = null;
      for (const dy of lb.pinned ? [0] : [0, step, step * 2]) {
        const y = lb.y + dy;
        const box = { l: lb.x - w / 2 - 2, r: lb.x + w / 2 + 2, t: y - h * 0.85, b: y + h * 0.25 };
        if (lb.pinned || !hits(box)) {
          placed.push(box);
          placedY = y;
          break;
        }
      }
      if (placedY === null) continue;
      g.lineWidth = Math.max(2, lb.px / 4);
      g.strokeStyle = 'rgba(8,6,12,0.85)';
      g.strokeText(lb.text, lb.x, placedY);
      g.fillStyle = lb.fill;
      g.fillText(lb.text, lb.x, placedY);
    }
    g.restore();
  }

  drawEmpty(): void {
    this.resize();
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.paintVoid(g);
    this.backdropKey = '';
  }

  draw(snap: Snapshot, opts: DrawOptions): void {
    this.resize();
    const g = this.g;
    const p = this.view.p;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = Math.max(1, 0.7 / (p / dpr));
    const q = p * k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.paintBackdrop(snap);
    g.drawImage(this.backdrop, 0, 0);
    this.labels = [];
    this.obstacles = [];
    this.trackHalo(snap);
    const pos = (u: SnapUnit): { x: number; y: number } =>
      this.S(lerp(u.px, u.x, opts.alpha), lerp(u.py, u.y, opts.alpha));
    const byId = new Map<number, SnapUnit>();
    for (const u of snap.units) byId.set(u.id, u);
    this.drawMotes(g, snap, q);
    this.drawShops(g, snap, q);
    this.drawEvents(g, snap, q);

    g.lineWidth = Math.max(1, p);
    for (const u of snap.units) {
      if (!u.flash || !u.alive || u.target === null) continue;
      const t = byId.get(u.target);
      if (!t) continue;
      const a = pos(u);
      const b = pos(t);
      g.strokeStyle =
        u.kind === 'tower' || u.kind === 'guardian'
          ? 'rgba(240,180,76,0.9)'
          : teamColor(u.team) + 'cc';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    g.lineWidth = 1;
    for (const s of snap.slots) {
      if (!s.open || !s.biomeId) continue;
      const biome = this.content.biomeById.get(s.biomeId);
      if (!biome) continue;
      const c = this.S(s.x, s.y);
      g.save();
      g.translate(c.x, c.y);
      g.scale(this.view.sx, this.view.sy);
      g.rotate((snap.tick / 400) * (s.x > s.y ? 1 : -1));
      g.strokeStyle = biome.palette.glow + '55';
      g.lineWidth = 1 / p;
      g.setLineDash([10, 14]);
      g.beginPath();
      g.arc(0, 0, s.radius * 0.82, 0, TAU);
      g.stroke();
      g.restore();
    }
    g.setLineDash([]);

    const order: Record<string, number> = {
      minion: 1,
      camp: 2,
      tower: 3,
      guardian: 4,
      obelisk: 5,
      keeper: 5,
      hero: 6,
    };
    const sorted = snap.units.slice().sort((a, b) => (order[a.kind] ?? 0) - (order[b.kind] ?? 0));
    for (const u of sorted) {
      const { x, y } = pos(u);
      const col = teamColor(u.team);
      switch (u.kind) {
        case 'minion': {
          drawMinion(g, x, y, 4 * q, u.team === 'neutral' ? PALETTE.neutral : col, u.range > 40);
          if (u.hp < u.maxHp) this.bar(x, y - 7 * q, 9 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'camp': {
          const elite = u.maxHp > 900;
          drawCamp(g, x, y, (elite ? 7 : 5) * q, PALETTE.camp, elite, snap.tick);
          this.obstacles.push({ x, y, r: (elite ? 8 : 6) * q });
          if (u.hp < u.maxHp) this.bar(x, y - 10 * q, 12 * q, u.hp / u.maxHp, PALETTE.camp);
          break;
        }
        case 'tower': {
          const s = 9 * q;
          drawTower(g, x, y, s, col, u.flash);
          this.obstacles.push({ x, y, r: s * 1.1 });
          this.bar(x, y - s * 1.7 - 4 * q, 22 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'guardian': {
          const s = 14 * q;
          drawGuardian(g, x, y, s, col, snap.tick, (u.maxHp > 0 ? u.hp / u.maxHp : 1) < 0.5);
          this.obstacles.push({ x, y, r: s * 1.2 });
          this.bar(x, y - s * 1.6 - 4 * q, 40 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'obelisk': {
          drawObelisk(g, x, y, 8 * q, PALETTE.spirit, u.claim, snap.tick);
          this.obstacles.push({ x, y, r: 9 * q });
          break;
        }
        case 'keeper': {
          const s = 8 * q;
          const pulse = 1 + Math.sin(snap.tick / 8) * 0.12;
          g.strokeStyle = PALETTE.gold + '66';
          g.lineWidth = 1.5;
          g.setLineDash([3 * q, 4 * q]);
          g.beginPath();
          g.arc(x, y, s * 2.4 * pulse, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          drawButterfly(g, x, y - s * 0.2, s * 1.3, Math.sin(snap.tick / 5), PALETTE.gold);
          this.labels.push({
            text: 'Keeper',
            x,
            y: y + s * 2.9,
            px: Math.max(10, Math.round(10 * q * 1.2)),
            fill: PALETTE.text,
            prio: 3,
          });
          this.obstacles.push({ x, y, r: s * 1.3 });
          break;
        }
        case 'hero': {
          const spec = this.sigils.get(u.defId);
          if (!spec) break;
          const r = 11 * q;
          if (u.recalling) {
            g.strokeStyle = PALETTE.gold;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, r * (1.5 + ((snap.tick % 20) / 20) * 0.8), 0, Math.PI * 2);
            g.stroke();
          }
          this.obstacles.push({ x, y, r: r * 1.25 });
          if (u.id === opts.highlightId && !u.isPlayer) {
            g.strokeStyle = '#ffffff';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, r * 1.45, 0, Math.PI * 2);
            g.stroke();
          }
          if (u.isPlayer) this.drawYouRing(g, x, y, r, snap.tick, u.alive, q);
          if (u.curse && u.alive) this.drawCurseAura(g, x, y, r, snap.tick, u.id);
          drawHeroFrame(g, x, y, r * 1.12, u.team, col, u.alive);
          drawSigil(g, x, y, r, spec, col, u.alive);
          if (u.alive) {
            this.bar(x, y - r - 9 * q, 26 * q, u.hp / u.maxHp, col);
            if (u.shield > 0)
              this.bar(x, y - r - 11 * q, 26 * q, Math.min(1, u.shield / u.maxHp), '#a9d0e0');
            if (u.curse) {
              g.fillStyle = '#8a2a22';
              g.fillRect(x + r * 0.6, y + r * 0.2, 4 * q, 4 * q);
            }
            if (u.holy) {
              g.fillStyle = '#f0d48a';
              g.fillRect(x + r * 0.6, y + r * 0.2 + 5 * q, 4 * q, 4 * q);
            }
          }
          if (u.isPlayer) {
            this.labels.push({
              text: 'YOU',
              x,
              y: y + r + 4 * q + this.youPx(q),
              px: this.youPx(q),
              fill: '#ffe08a',
              prio: 0,
              pinned: true,
              bold: true,
            });
          }
          break;
        }
      }
    }
    if (opts.curses?.length) this.drawCurseMarks(g, snap, opts.curses, byId, q, opts.alpha);
    this.addSlotLabels(snap);
    this.drawLabels(g);
    if (snap.pressure.length) {
      g.fillStyle = 'rgba(110,20,30,0.12)';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
