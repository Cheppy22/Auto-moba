const TAU = Math.PI * 2;
const INK = '#0b0a0f';

type G = CanvasRenderingContext2D;

function plate(g: G, fill: string, outline: number, shade = 'rgba(255,255,255,0.22)'): void {
  g.lineJoin = 'round';
  g.lineWidth = outline;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = shade;
  g.fillRect(-1000, -1000, 2000, 1000);
  g.restore();
}

export function drawMinion(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  ranged: boolean,
): void {
  g.save();
  g.translate(x, y);
  g.beginPath();
  if (ranged) {
    g.moveTo(0, -s * 1.2);
    g.bezierCurveTo(s * 0.9, -s * 0.3, s * 0.9, s * 0.8, 0, s * 0.9);
    g.bezierCurveTo(-s * 0.9, s * 0.8, -s * 0.9, -s * 0.3, 0, -s * 1.2);
  } else {
    g.moveTo(0, -s * 1.1);
    g.lineTo(s * 0.85, -s * 0.5);
    g.lineTo(s * 0.7, s * 0.4);
    g.lineTo(0, s * 1.0);
    g.lineTo(-s * 0.7, s * 0.4);
    g.lineTo(-s * 0.85, -s * 0.5);
  }
  g.closePath();
  plate(g, color, Math.max(1.2, s * 0.35));
  g.restore();
}

export function drawCamp(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  elite: boolean,
  tick: number,
): void {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, s * 0.1, s * 0.85, Math.PI * 0.1, Math.PI * 0.9, true);
  g.lineTo(-s * 0.6, s * 0.95);
  g.lineTo(-s * 0.2, s * 0.65);
  g.lineTo(0, s * 0.98);
  g.lineTo(s * 0.2, s * 0.65);
  g.lineTo(s * 0.6, s * 0.95);
  g.closePath();
  g.moveTo(-s * 0.7, -s * 0.5);
  g.lineTo(-s * 1.05, -s * 1.15);
  g.lineTo(-s * 0.25, -s * 0.75);
  g.moveTo(s * 0.7, -s * 0.5);
  g.lineTo(s * 1.05, -s * 1.15);
  g.lineTo(s * 0.25, -s * 0.75);
  plate(g, color, Math.max(1.4, s * 0.3));
  const glow = 0.65 + 0.35 * Math.sin(tick / 9);
  g.fillStyle = `rgba(255,${elite ? 90 : 220},${elite ? 70 : 140},${glow})`;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(side * s * 0.38, -s * 0.05, s * 0.2, s * 0.12, side * 0.4, 0, TAU);
    g.fill();
  }
  g.restore();
}

export function drawTower(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  firing: boolean,
): void {
  g.save();
  g.translate(x, y);
  if (firing) {
    g.shadowColor = color;
    g.shadowBlur = s * 1.4;
  }
  g.beginPath();
  g.rect(-s * 0.42, s * 0.05, s * 0.84, s * 0.85);
  plate(g, '#1c1824', Math.max(1.2, s * 0.22), 'rgba(255,255,255,0.08)');
  const roof = (w: number, top: number, base: number): void => {
    g.beginPath();
    g.moveTo(-w * 1.12, base + s * 0.1);
    g.quadraticCurveTo(-w * 0.8, base, -w * 0.3, base - (base - top) * 0.45);
    g.lineTo(0, top);
    g.lineTo(w * 0.3, base - (base - top) * 0.45);
    g.quadraticCurveTo(w * 0.8, base, w * 1.12, base + s * 0.1);
    g.closePath();
    plate(g, color, Math.max(1.2, s * 0.22));
  };
  roof(s * 0.95, -s * 0.35, s * 0.18);
  roof(s * 0.6, -s * 0.95, -s * 0.38);
  g.shadowBlur = 0;
  g.beginPath();
  g.moveTo(0, -s * 0.95);
  g.lineTo(0, -s * 1.35);
  g.lineWidth = Math.max(1, s * 0.14);
  g.strokeStyle = color;
  g.stroke();
  g.beginPath();
  g.arc(0, -s * 1.4, s * 0.14, 0, TAU);
  g.fillStyle = firing ? '#fff2c8' : color;
  g.fill();
  g.restore();
}

export function drawGuardian(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  tick: number,
  rage: boolean,
): void {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, 0, s, 0, TAU);
  g.fillStyle = 'rgba(14,12,18,0.96)';
  g.fill();
  g.lineWidth = Math.max(1.6, s * 0.12);
  g.strokeStyle = color;
  g.stroke();
  g.rotate(tick / 120);
  for (let i = 0; i < 8; i++) {
    g.save();
    g.rotate((i / 8) * TAU);
    g.beginPath();
    g.moveTo(-s * 0.16, -s * 1.02);
    g.lineTo(0, -s * 1.5);
    g.lineTo(s * 0.16, -s * 1.02);
    g.closePath();
    plate(g, color, Math.max(1, s * 0.07));
    g.restore();
  }
  g.rotate(-tick / 120);
  g.beginPath();
  g.moveTo(-s * 0.72, 0);
  g.quadraticCurveTo(0, -s * 0.62, s * 0.72, 0);
  g.quadraticCurveTo(0, s * 0.62, -s * 0.72, 0);
  g.closePath();
  g.fillStyle = '#0a0910';
  g.fill();
  g.lineWidth = Math.max(1, s * 0.08);
  g.strokeStyle = color;
  g.stroke();
  g.beginPath();
  g.arc(0, 0, s * 0.24, 0, TAU);
  g.fillStyle = rage ? '#ff5a4a' : color;
  g.fill();
  g.beginPath();
  g.arc(0, 0, s * 0.1, 0, TAU);
  g.fillStyle = INK;
  g.fill();
  g.restore();
}

export function drawObelisk(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  claim: number,
  tick: number,
): void {
  g.save();
  g.translate(x, y + Math.sin(tick / 14) * s * 0.08);
  g.shadowColor = color;
  g.shadowBlur = s * 1.3;
  g.beginPath();
  g.moveTo(0, -s * 1.7);
  g.lineTo(s * 0.62, -s * 0.5);
  g.lineTo(s * 0.5, s * 0.9);
  g.lineTo(0, s * 1.15);
  g.lineTo(-s * 0.5, s * 0.9);
  g.lineTo(-s * 0.62, -s * 0.5);
  g.closePath();
  plate(g, color, Math.max(1.2, s * 0.14), 'rgba(255,255,255,0.28)');
  g.shadowBlur = 0;
  g.beginPath();
  g.moveTo(0, -s * 1.7);
  g.lineTo(0, s * 1.15);
  g.moveTo(-s * 0.62, -s * 0.5);
  g.lineTo(0, -s * 0.2);
  g.lineTo(s * 0.62, -s * 0.5);
  g.lineWidth = Math.max(1, s * 0.07);
  g.strokeStyle = 'rgba(11,10,15,0.55)';
  g.stroke();
  if (claim > 0) {
    g.beginPath();
    g.arc(0, 0, s * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, claim));
    g.lineWidth = Math.max(2, s * 0.18);
    g.strokeStyle = '#fff';
    g.stroke();
  }
  g.restore();
}

export function drawHeroFrame(
  g: G,
  x: number,
  y: number,
  r: number,
  team: string,
  color: string,
  alive: boolean,
): void {
  g.save();
  g.translate(x, y);
  g.globalAlpha = alive ? 1 : 0.35;
  const path = (): void => {
    g.beginPath();
    if (team === 'B') {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        const px = Math.cos(a) * r * 1.12;
        const py = Math.sin(a) * r * 1.12;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    } else {
      g.arc(0, 0, r, 0, TAU);
    }
  };
  path();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2.4, r * 0.3);
  g.strokeStyle = INK;
  g.stroke();
  path();
  g.lineWidth = Math.max(1.4, r * 0.16);
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  if (team === 'B') {
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * r * 0.22, -r * 1.12);
      g.lineTo(side * r * 0.55, -r * 1.55);
      g.lineTo(side * r * 0.02, -r * 1.2);
      g.closePath();
      g.fill();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      g.beginPath();
      g.arc(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.1, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

export function drawShopStall(
  g: G,
  x: number,
  y: number,
  s: number,
  tick: number,
  queued: number,
  near: boolean,
): void {
  g.save();
  g.translate(x, y);
  if (queued > 0 || near) {
    g.shadowColor = '#f0d58a';
    g.shadowBlur = s * (1 + 0.4 * Math.sin(tick / 8));
  }
  g.beginPath();
  g.rect(-s * 0.8, -s * 0.1, s * 1.6, s * 0.95);
  plate(g, '#2a2234', Math.max(1.2, s * 0.18), 'rgba(255,255,255,0.08)');
  g.beginPath();
  g.moveTo(-s * 1.05, -s * 0.05);
  g.lineTo(0, -s * 0.95);
  g.lineTo(s * 1.05, -s * 0.05);
  g.closePath();
  plate(g, '#b3262e', Math.max(1.2, s * 0.2), 'rgba(255,255,255,0.18)');
  g.shadowBlur = 0;
  g.strokeStyle = '#f0d58a';
  g.lineWidth = Math.max(1, s * 0.1);
  for (const dx of [-0.45, 0, 0.45]) {
    g.beginPath();
    g.moveTo(s * dx, -s * 0.05);
    g.lineTo(s * dx, s * 0.35);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, s * 0.62, s * 0.2, 0, TAU);
  g.fillStyle = '#f0d58a';
  g.fill();
  if (queued > 0) {
    g.beginPath();
    g.arc(s * 0.95, -s * 0.85, s * 0.42, 0, TAU);
    g.fillStyle = '#f0d58a';
    g.fill();
    g.fillStyle = INK;
    g.font = `bold ${Math.round(s * 0.62)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(queued), s * 0.95, -s * 0.83);
  }
  g.restore();
}
