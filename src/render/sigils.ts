export interface SigilSpec {
  hue: number;
  rings: number;
  spokes: number;
  glyph: 'gear' | 'crane' | 'rail' | 'compass';
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

function drawGlyph(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  glyph: SigilSpec['glyph'],
): void {
  g.beginPath();
  switch (glyph) {
    case 'gear': {
      const teeth = 8;
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.72;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'crane': {
      g.moveTo(x, y - r);
      g.lineTo(x + r, y + r * 0.6);
      g.lineTo(x, y + r * 0.2);
      g.lineTo(x - r, y + r * 0.6);
      g.closePath();
      break;
    }
    case 'rail': {
      g.moveTo(x - r * 0.6, y - r);
      g.lineTo(x - r * 0.6, y + r);
      g.moveTo(x + r * 0.6, y - r);
      g.lineTo(x + r * 0.6, y + r);
      for (let i = -2; i <= 2; i++) {
        g.moveTo(x - r * 0.9, y + i * r * 0.4);
        g.lineTo(x + r * 0.9, y + i * r * 0.4);
      }
      break;
    }
    case 'compass': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.moveTo(x - r * 0.5, y);
      g.lineTo(x, y - r * 0.5);
      g.lineTo(x + r * 0.5, y);
      g.lineTo(x, y + r * 0.5);
      g.closePath();
      break;
    }
  }
  g.stroke();
}

export function drawSigil(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spec: SigilSpec,
  tint: string,
  alive = true,
): void {
  g.save();
  g.globalAlpha = alive ? 1 : 0.35;
  g.fillStyle = 'rgba(10,12,12,0.9)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(1, r * 0.12);
  g.strokeStyle = tint;
  ring(g, x, y, r);
  g.strokeStyle = `hsl(${spec.hue} 48% 62%)`;
  for (let i = 1; i < spec.rings; i++) ring(g, x, y, r * (1 - i * 0.2));
  g.lineWidth = Math.max(0.6, r * 0.07);
  g.beginPath();
  for (let i = 0; i < spec.spokes; i++) {
    const a = (i / spec.spokes) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    g.lineTo(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96);
  }
  g.stroke();
  g.lineWidth = Math.max(1, r * 0.1);
  g.strokeStyle = `hsl(${spec.hue} 85% 72%)`;
  drawGlyph(g, x, y, r * 0.5, spec.glyph);
  g.restore();
}
