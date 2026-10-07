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

/** A chess pawn in team colour; ranged pawns hold up a small playing card. */
export function drawMinion(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  ranged: boolean,
): void {
  g.save();
  g.translate(x, y + s * 0.1);
  g.beginPath();
  g.moveTo(-s * 0.85, s * 1.1);
  g.lineTo(s * 0.85, s * 1.1);
  g.lineTo(s * 0.85, s * 0.75);
  g.quadraticCurveTo(s * 0.5, s * 0.7, s * 0.38, 0);
  g.lineTo(s * 0.62, -s * 0.05);
  g.lineTo(s * 0.62, -s * 0.3);
  g.lineTo(-s * 0.62, -s * 0.3);
  g.lineTo(-s * 0.62, -s * 0.05);
  g.lineTo(-s * 0.38, 0);
  g.quadraticCurveTo(-s * 0.5, s * 0.7, -s * 0.85, s * 0.75);
  g.closePath();
  g.moveTo(s * 0.5, -s * 0.8);
  g.arc(0, -s * 0.8, s * 0.5, 0, TAU);
  plate(g, color, Math.max(1.2, s * 0.32));
  if (ranged) {
    g.save();
    g.translate(s * 1.05, -s * 0.15);
    g.rotate(0.35);
    g.beginPath();
    g.rect(-s * 0.38, -s * 0.55, s * 0.76, s * 1.1);
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1, s * 0.26);
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#ece2cc';
    g.fill();
    g.beginPath();
    g.moveTo(0, s * 0.3);
    g.bezierCurveTo(-s * 0.46, -s * 0.05, -s * 0.2, -s * 0.38, 0, -s * 0.12);
    g.bezierCurveTo(s * 0.2, -s * 0.38, s * 0.46, -s * 0.05, 0, s * 0.3);
    g.fillStyle = '#b3262e';
    g.fill();
    g.restore();
  }
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

const BRASS = '#e0a93e';

/** A crowned chess king in team colour. Under half health it burns red. */
export function drawKing(
  g: G,
  x: number,
  y: number,
  s: number,
  color: string,
  tick: number,
  rage: boolean,
): void {
  g.save();
  g.translate(x, y + s * 0.2);
  const aura = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.7);
  aura.addColorStop(0, rage ? 'rgba(255,90,74,0.32)' : color + '40');
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = aura;
  g.beginPath();
  g.arc(0, 0, s * 1.7, 0, TAU);
  g.fill();
  g.beginPath();
  g.ellipse(0, s * 1.08, s * 1.3, s * 0.38, 0, 0, TAU);
  g.fillStyle = 'rgba(14,12,18,0.92)';
  g.fill();
  g.lineWidth = Math.max(1.4, s * 0.1);
  g.strokeStyle = color;
  g.stroke();
  if (rage) {
    g.shadowColor = '#ff5a4a';
    g.shadowBlur = s * (0.7 + 0.35 * Math.sin(tick / 4));
  }
  const body = (): void => {
    g.beginPath();
    g.moveTo(-s * 0.95, s * 1.1);
    g.lineTo(s * 0.95, s * 1.1);
    g.lineTo(s * 0.95, s * 0.82);
    g.lineTo(s * 0.74, s * 0.82);
    g.quadraticCurveTo(s * 0.5, s * 0.55, s * 0.34, 0);
    g.lineTo(s * 0.34, -s * 0.2);
    g.lineTo(s * 0.62, -s * 0.2);
    g.lineTo(s * 0.62, -s * 0.42);
    g.lineTo(-s * 0.62, -s * 0.42);
    g.lineTo(-s * 0.62, -s * 0.2);
    g.lineTo(-s * 0.34, -s * 0.2);
    g.lineTo(-s * 0.34, 0);
    g.quadraticCurveTo(-s * 0.5, s * 0.55, -s * 0.74, s * 0.82);
    g.lineTo(-s * 0.95, s * 0.82);
    g.closePath();
    g.moveTo(-s * 0.44, -s * 0.42);
    g.quadraticCurveTo(-s * 0.55, -s * 0.9, 0, -s * 0.96);
    g.quadraticCurveTo(s * 0.55, -s * 0.9, s * 0.44, -s * 0.42);
    g.closePath();
  };
  body();
  plate(g, color, Math.max(1.4, s * 0.13));
  g.shadowBlur = 0;
  // crown: three points on a band, a cross above
  g.beginPath();
  g.moveTo(-s * 0.5, -s * 0.84);
  g.lineTo(-s * 0.52, -s * 1.18);
  g.lineTo(-s * 0.25, -s * 1.0);
  g.lineTo(0, -s * 1.26);
  g.lineTo(s * 0.25, -s * 1.0);
  g.lineTo(s * 0.52, -s * 1.18);
  g.lineTo(s * 0.5, -s * 0.84);
  g.closePath();
  plate(g, BRASS, Math.max(1.2, s * 0.11), 'rgba(255,255,255,0.3)');
  g.beginPath();
  g.rect(-s * 0.07, -s * 1.7, s * 0.14, s * 0.46);
  g.rect(-s * 0.26, -s * 1.56, s * 0.52, s * 0.14);
  plate(g, BRASS, Math.max(1.2, s * 0.1), 'rgba(255,255,255,0.3)');
  g.beginPath();
  g.arc(0, -s * 0.66, s * 0.13, 0, TAU);
  g.fillStyle = rage ? '#ff5a4a' : INK;
  g.fill();
  g.restore();
}

/** Opacities of the Cheshire Keeper's grin and eyes: grin first in, last out. */
export function cheshireFade(tick: number): { grin: number; eyes: number } {
  const ph = tick % 360;
  let grin = 1;
  if (ph >= 250 && ph < 290) grin = 1 - 0.9 * ((ph - 250) / 40);
  else if (ph >= 290 && ph < 310) grin = 0.1;
  else if (ph >= 310) grin = 0.1 + 0.9 * ((ph - 310) / 50);
  const eyes = Math.max(0, Math.min(1, (grin - 0.35) / 0.55));
  return { grin, eyes };
}

/** The Cheshire Keeper: a crescent grin under two slanted eyes, brass and violet (a Tenniel tabby, no stripes). */
export function drawCheshire(g: G, x: number, y: number, s: number, tick: number): void {
  const { grin, eyes } = cheshireFade(tick);
  g.save();
  g.translate(x, y + Math.sin(tick / 20) * s * 0.06);
  g.lineJoin = 'round';
  const glow = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 2.1);
  glow.addColorStop(0, `rgba(185,160,230,${0.28 * grin})`);
  glow.addColorStop(1, 'rgba(185,160,230,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, s * 2.1, 0, TAU);
  g.fill();
  g.globalAlpha = eyes;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * s * 0.62, -s * 0.72);
    g.rotate(side * -0.28);
    g.beginPath();
    g.moveTo(-s * 0.4, s * 0.05);
    g.quadraticCurveTo(0, -s * 0.5, s * 0.4, s * 0.05);
    g.quadraticCurveTo(0, s * 0.3, -s * 0.4, s * 0.05);
    g.closePath();
    g.lineWidth = Math.max(1, s * 0.12);
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = '#b9a0e6';
    g.fill();
    g.beginPath();
    g.ellipse(0, -s * 0.06, s * 0.09, s * 0.2, 0, 0, TAU);
    g.fillStyle = BRASS;
    g.fill();
    g.restore();
  }
  g.globalAlpha = grin;
  g.beginPath();
  g.moveTo(-s * 1.15, -s * 0.18);
  g.quadraticCurveTo(0, s * 1.15, s * 1.15, -s * 0.18);
  g.quadraticCurveTo(0, s * 0.42, -s * 1.15, -s * 0.18);
  g.closePath();
  g.lineWidth = Math.max(1.2, s * 0.14);
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = '#f0d58a';
  g.fill();
  g.lineWidth = Math.max(0.8, s * 0.07);
  g.strokeStyle = 'rgba(11,10,15,0.7)';
  g.beginPath();
  for (let i = -3; i <= 3; i++) {
    const t = 0.5 + i * 0.11;
    const ox = (1 - t) * (1 - t) * -1.15 + 2 * t * (1 - t) * 0 + t * t * 1.15;
    const yo = (1 - t) * (1 - t) * -0.18 + 2 * t * (1 - t) * 1.15 + t * t * -0.18;
    const yi = (1 - t) * (1 - t) * -0.18 + 2 * t * (1 - t) * 0.42 + t * t * -0.18;
    g.moveTo(ox * s, yi * s);
    g.lineTo(ox * s, yo * s);
  }
  g.stroke();
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
