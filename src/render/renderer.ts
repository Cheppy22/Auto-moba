import type { Content, Snapshot, SnapUnit } from '../sim';
import { drawSigil, type SigilSpec } from './sigils';
import { PALETTE, teamColor } from './theme';

export interface DrawOptions {
  alpha: number;
  highlightId?: number | null;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Renderer {
  private g: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement;
  private backdropKey = '';
  private px = 1;
  private size = 1000;
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
    this.backdrop = document.createElement('canvas');
    this.size = content.map.size;
    this.lanes = [content.map.lanes.top, content.map.lanes.mid, content.map.lanes.bot] as [
      number,
      number,
    ][][];
    this.bases = content.map.bases as { A: [number, number]; B: [number, number] };
    for (const h of content.heroes) this.sigils.set(h.id, h.sigil);
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
    this.px = Math.min(w, h) / this.size;
  }

  private offset(): { ox: number; oy: number } {
    return {
      ox: (this.canvas.width - this.size * this.px) / 2,
      oy: (this.canvas.height - this.size * this.px) / 2,
    };
  }

  private paintBackdrop(snap: Snapshot): void {
    const key =
      snap.slots.map((s) => `${s.id}${s.open ? s.biomeId : '-'}`).join('|') + this.canvas.width;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    const b = this.backdrop.getContext('2d')!;
    const { ox, oy } = this.offset();
    const p = this.px;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = PALETTE.bg;
    b.fillRect(0, 0, this.backdrop.width, this.backdrop.height);
    const grad = b.createRadialGradient(
      ox + 500 * p,
      oy + 500 * p,
      40 * p,
      ox + 500 * p,
      oy + 500 * p,
      720 * p,
    );
    grad.addColorStop(0, '#171a26');
    grad.addColorStop(1, '#0a0b10');
    b.fillStyle = grad;
    b.fillRect(ox, oy, this.size * p, this.size * p);
    b.strokeStyle = 'rgba(120,130,160,0.06)';
    b.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      b.beginPath();
      b.moveTo(ox + i * 100 * p, oy);
      b.lineTo(ox + i * 100 * p, oy + this.size * p);
      b.moveTo(ox, oy + i * 100 * p);
      b.lineTo(ox + this.size * p, oy + i * 100 * p);
      b.stroke();
    }
    for (const s of snap.slots) {
      const cx = ox + s.x * p;
      const cy = oy + s.y * p;
      const r = s.radius * p;
      if (s.open && s.biomeId) {
        const biome = this.content.biomeById.get(s.biomeId)!;
        const gr = b.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.25);
        gr.addColorStop(0, biome.palette.accent + 'aa');
        gr.addColorStop(0.6, biome.palette.ground + 'cc');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = gr;
        b.beginPath();
        b.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
        b.fill();
        b.strokeStyle = biome.palette.glow + '88';
        b.lineWidth = 1.5;
        b.setLineDash([]);
        b.beginPath();
        b.arc(cx, cy, r, 0, Math.PI * 2);
        b.stroke();
        b.fillStyle = biome.palette.glow + 'cc';
        b.font = `${Math.round(11 * p * 1.3)}px system-ui, sans-serif`;
        b.textAlign = 'center';
        b.fillText(biome.name, cx, cy - r - 6 * p);
      } else {
        b.fillStyle = 'rgba(30,34,48,0.7)';
        b.beginPath();
        b.arc(cx, cy, r, 0, Math.PI * 2);
        b.fill();
        b.strokeStyle = 'rgba(140,150,180,0.25)';
        b.setLineDash([6 * p, 6 * p]);
        b.beginPath();
        b.arc(cx, cy, r, 0, Math.PI * 2);
        b.stroke();
        b.setLineDash([]);
        b.fillStyle = 'rgba(160,170,200,0.35)';
        b.font = `${Math.round(18 * p * 1.3)}px system-ui, sans-serif`;
        b.textAlign = 'center';
        b.fillText('fog', cx, cy + 5 * p);
      }
    }
    for (const lane of this.lanes) {
      b.beginPath();
      lane.forEach(([x, y], i) =>
        i === 0 ? b.moveTo(ox + x * p, oy + y * p) : b.lineTo(ox + x * p, oy + y * p),
      );
      b.lineCap = 'round';
      b.lineJoin = 'round';
      b.strokeStyle = 'rgba(40,46,66,0.9)';
      b.lineWidth = 30 * p;
      b.stroke();
      b.strokeStyle = 'rgba(90,100,135,0.35)';
      b.lineWidth = 1.5;
      b.setLineDash([8 * p, 10 * p]);
      b.stroke();
      b.setLineDash([]);
    }
    for (const t of ['A', 'B'] as const) {
      const [x, y] = this.bases[t];
      const gr = b.createRadialGradient(ox + x * p, oy + y * p, 4, ox + x * p, oy + y * p, 90 * p);
      gr.addColorStop(0, teamColor(t) + '55');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = gr;
      b.beginPath();
      b.arc(ox + x * p, oy + y * p, 90 * p, 0, Math.PI * 2);
      b.fill();
      b.strokeStyle = teamColor(t) + '99';
      b.lineWidth = 2;
      b.beginPath();
      b.arc(ox + x * p, oy + y * p, 60 * p, 0, Math.PI * 2);
      b.stroke();
    }
  }

  private bar(x: number, y: number, w: number, frac: number, color: string): void {
    const g = this.g;
    const h = Math.max(2, 3 * this.px);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x - w / 2, y, w, h);
    g.fillStyle = color;
    g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  drawEmpty(): void {
    this.resize();
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PALETTE.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.backdropKey = '';
  }

  draw(snap: Snapshot, opts: DrawOptions): void {
    this.resize();
    const g = this.g;
    const p = this.px;
    const { ox, oy } = this.offset();
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.paintBackdrop(snap);
    g.drawImage(this.backdrop, 0, 0);
    const pos = (u: SnapUnit): { x: number; y: number } => ({
      x: ox + lerp(u.px, u.x, opts.alpha) * p,
      y: oy + lerp(u.py, u.y, opts.alpha) * p,
    });
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
          ? 'rgba(255,220,140,0.9)'
          : teamColor(u.team) + 'cc';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

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
          g.arc(x, y, (u.range > 40 ? 2.4 : 3.2) * p, 0, Math.PI * 2);
          g.fill();
          if (u.hp < u.maxHp) this.bar(x, y - 7 * p, 9 * p, u.hp / u.maxHp, col);
          break;
        }
        case 'camp': {
          g.fillStyle = PALETTE.camp;
          g.beginPath();
          g.arc(x, y, 5 * p, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.6)';
          g.stroke();
          if (u.hp < u.maxHp) this.bar(x, y - 9 * p, 12 * p, u.hp / u.maxHp, PALETTE.camp);
          break;
        }
        case 'tower': {
          const s = 8 * p;
          g.fillStyle = 'rgba(10,12,18,0.95)';
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
          this.bar(x, y - s - 6 * p, 22 * p, u.hp / u.maxHp, col);
          break;
        }
        case 'guardian': {
          const s = 15 * p;
          g.fillStyle = 'rgba(10,12,18,0.95)';
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
          this.bar(x, y - s - 8 * p, 40 * p, u.hp / u.maxHp, col);
          break;
        }
        case 'obelisk': {
          const s = 9 * p;
          g.fillStyle = '#c9a7ff';
          g.strokeStyle = '#ffffff88';
          g.beginPath();
          g.moveTo(x, y - s * 1.5);
          g.lineTo(x + s * 0.7, y);
          g.lineTo(x, y + s);
          g.lineTo(x - s * 0.7, y);
          g.closePath();
          g.fill();
          g.stroke();
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
          const s = 8 * p;
          const pulse = 1 + Math.sin(snap.tick / 8) * 0.12;
          g.strokeStyle = PALETTE.gold + '88';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(x, y, s * 2.2 * pulse, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = PALETTE.gold;
          g.beginPath();
          g.arc(x, y, s * 0.8, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = PALETTE.text;
          g.font = `${Math.round(10 * p * 1.2)}px system-ui, sans-serif`;
          g.textAlign = 'center';
          g.fillText('Keeper', x, y + s * 2.8);
          break;
        }
        case 'hero': {
          const spec = this.sigils.get(u.defId);
          if (!spec) break;
          const r = 11 * p;
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
            this.bar(x, y - r - 7 * p, 26 * p, u.hp / u.maxHp, col);
            if (u.shield > 0)
              this.bar(x, y - r - 11 * p, 26 * p, Math.min(1, u.shield / u.maxHp), '#cfe8ff');
            if (u.curse) {
              g.fillStyle = '#c64d6e';
              g.fillRect(x + r * 0.6, y + r * 0.2, 4 * p, 4 * p);
            }
            if (u.holy) {
              g.fillStyle = '#ffe9a6';
              g.fillRect(x + r * 0.6, y + r * 0.2 + 5 * p, 4 * p, 4 * p);
            }
          }
          if (u.isPlayer) {
            g.fillStyle = '#ffffff';
            g.font = `bold ${Math.round(9 * p * 1.2)}px system-ui, sans-serif`;
            g.textAlign = 'center';
            g.fillText('YOU', x, y + r + 12 * p);
          }
          break;
        }
      }
    }
    if (snap.pressure.length) {
      g.fillStyle = 'rgba(160,40,70,0.10)';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
