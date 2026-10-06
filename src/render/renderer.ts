import type { Content, Snapshot, SnapUnit } from '../sim';
import { drawSigil, type SigilSpec } from './sigils';
import { DISPLAY_FONT, PALETTE, teamColor } from './theme';
import { makeView, toScreen, type Insets, type View } from './view';

export interface DrawOptions {
  alpha: number;
  highlightId?: number | null;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = Math.PI * 2;

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

export class Renderer {
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
    const lo = 55;
    const hi = this.size - 55;
    for (const [inset, alpha] of [
      [0, 0.5],
      [14, 0.22],
    ] as const) {
      b.beginPath();
      const pts = [
        this.S(lo - inset, lo - inset),
        this.S(hi + inset, lo - inset),
        this.S(hi + inset, hi + inset),
        this.S(lo - inset, hi + inset),
      ];
      pts.forEach((c, i) => (i === 0 ? b.moveTo(c.x, c.y) : b.lineTo(c.x, c.y)));
      b.closePath();
      b.strokeStyle = `rgba(224,169,62,${alpha})`;
      b.lineWidth = inset === 0 ? 1.5 : 1;
      b.stroke();
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
        b.fillStyle = biome.palette.glow + 'dd';
        b.font = `${Math.max(10, Math.round(11 * p * 1.3))}px ${DISPLAY_FONT}`;
        b.textAlign = 'center';
        b.fillText(biome.name, c.x, c.y - ry * 1.12 - 6 * p);
      } else {
        b.fillStyle = 'rgba(16,14,24,0.7)';
        this.ellipse(b, s.x, s.y, s.radius);
        b.fill();
        b.strokeStyle = 'rgba(185,160,230,0.22)';
        b.setLineDash([4 * p, 7 * p]);
        b.stroke();
        b.setLineDash([]);
        b.fillStyle = 'rgba(200,185,225,0.3)';
        b.font = `${Math.max(9, Math.round(13 * p * 1.3))}px ${DISPLAY_FONT}`;
        b.textAlign = 'center';
        b.fillText('uncharted', c.x, c.y + 4 * p);
      }
    }
    for (const lane of this.lanes) {
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
      b.strokeStyle = 'rgba(70,58,40,0.35)';
      b.lineWidth = 34 * p;
      b.stroke();
      trace();
      b.strokeStyle = 'rgba(20,18,20,0.95)';
      b.lineWidth = 28 * p;
      b.stroke();
      trace();
      b.strokeStyle = 'rgba(224,169,62,0.3)';
      b.lineWidth = 1.2;
      b.setLineDash([6 * p, 10 * p]);
      b.stroke();
      b.setLineDash([]);
    }
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
    const h = Math.max(2, 3 * this.view.p);
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(x - w / 2, y, w, h);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
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
    const pos = (u: SnapUnit): { x: number; y: number } =>
      this.S(lerp(u.px, u.x, opts.alpha), lerp(u.py, u.y, opts.alpha));
    const byId = new Map<number, SnapUnit>();
    for (const u of snap.units) byId.set(u.id, u);

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
          g.fillStyle = u.team === 'neutral' ? PALETTE.neutral : col;
          g.beginPath();
          g.arc(x, y, (u.range > 40 ? 2.4 : 3.2) * q, 0, Math.PI * 2);
          g.fill();
          if (u.hp < u.maxHp) this.bar(x, y - 7 * q, 9 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'camp': {
          g.fillStyle = PALETTE.camp;
          g.beginPath();
          g.arc(x, y, 5 * q, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.6)';
          g.stroke();
          if (u.hp < u.maxHp) this.bar(x, y - 9 * q, 12 * q, u.hp / u.maxHp, PALETTE.camp);
          break;
        }
        case 'tower': {
          const s = 8 * q;
          g.fillStyle = 'rgba(12,14,14,0.95)';
          g.strokeStyle = col;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y - s);
          g.lineTo(x + s, y);
          g.lineTo(x, y + s);
          g.lineTo(x - s, y);
          g.closePath();
          g.fill();
          g.stroke();
          this.bar(x, y - s - 6 * q, 22 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'guardian': {
          const s = 15 * q;
          g.fillStyle = 'rgba(12,14,14,0.95)';
          g.strokeStyle = col;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(x, y, s, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.beginPath();
          g.ellipse(x, y, s * 0.7, s * 0.35, 0, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = col;
          g.beginPath();
          g.arc(x, y, s * 0.17, 0, Math.PI * 2);
          g.fill();
          this.bar(x, y - s - 8 * q, 40 * q, u.hp / u.maxHp, col);
          break;
        }
        case 'obelisk': {
          const s = 9 * q;
          g.shadowColor = PALETTE.spirit;
          g.shadowBlur = 10 * q;
          g.fillStyle = PALETTE.spirit;
          g.strokeStyle = '#f2e8ffaa';
          g.beginPath();
          g.moveTo(x, y - s * 1.5);
          g.lineTo(x + s * 0.7, y);
          g.lineTo(x, y + s);
          g.lineTo(x - s * 0.7, y);
          g.closePath();
          g.fill();
          g.stroke();
          g.shadowBlur = 0;
          if (u.claim > 0) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, s * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u.claim));
            g.stroke();
          }
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
          g.fillStyle = PALETTE.text;
          g.font = `${Math.round(10 * q * 1.2)}px ${DISPLAY_FONT}`;
          g.textAlign = 'center';
          g.fillText('Keeper', x, y + s * 2.9);
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
          if (u.isPlayer || u.id === opts.highlightId) {
            g.strokeStyle = '#ffffff';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, r * 1.45, 0, Math.PI * 2);
            g.stroke();
          }
          drawSigil(g, x, y, r, spec, col, u.alive);
          if (u.alive) {
            this.bar(x, y - r - 7 * q, 26 * q, u.hp / u.maxHp, col);
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
            g.fillStyle = '#ffffff';
            g.font = `${Math.round(10 * q * 1.2)}px ${DISPLAY_FONT}`;
            g.textAlign = 'center';
            g.fillText('YOU', x, y + r + 12 * q);
          }
          break;
        }
      }
    }
    if (snap.pressure.length) {
      g.fillStyle = 'rgba(110,20,30,0.12)';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
