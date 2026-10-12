import type { BufferGeometry } from 'three';
import type { MapDef, WalkShape } from '../../sim';
import { buildTerrain, shapeDist } from '../../sim';
import type { Orient } from './board';
import { cone, merge, prism, type Part } from './mesh';
import { TABLE } from './palette';
import { type Ground, RELIEF } from './relief';

/**
 * Colours of the Long Board's zones. Each zone kind owns one surface so it reads at a glance; none
 * uses an item-category hue (the groves are a dark pine, far from Body's bright moss).
 */
const ZONE = {
  water: '#0f2a39',
  waterLight: '#2f6a80',
  grove: '#1c2924',
  groveDark: '#141e1a',
  groveLeaf: '#2a3a31',
  clearing: '#27352d',
  pit: '#15171b',
  road: '#57534b',
  roadJoint: '#3b3832',
  verge: '#3d3933',
  vergeDot: '#57514a',
  sally: '#4b4033',
  sallyLine: '#8a6c34',
  marble: '#5e5d59',
  marbleDark: '#4b4a47',
} as const;

const FILES = 'abcdefgh';

/** Mixes two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** A small deterministic hash in [0, 1) (the paint is the same every load). */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Adds a walkable shape, grown by `pad`, to the current path (a capsule, or a flat-ended box). */
function shapePath(g: CanvasRenderingContext2D, s: WalkShape, pad: number): void {
  const r = s.r + pad;
  if (r <= 0) return;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = Math.hypot(dx, dy);
  const t = Math.atan2(dy, dx);
  if (s.box) {
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const ex = ux * pad;
    const ey = uy * pad;
    const nx = -uy * r;
    const ny = ux * r;
    // the same turning sense as the capsules' arcs, so overlapping shapes add up (no holes)
    g.moveTo(s.ax - ex - nx, s.ay - ey - ny);
    g.lineTo(s.bx + ex - nx, s.by + ey - ny);
    g.lineTo(s.bx + ex + nx, s.by + ey + ny);
    g.lineTo(s.ax - ex + nx, s.ay - ey + ny);
    g.closePath();
    return;
  }
  g.moveTo(s.ax + Math.cos(t + Math.PI / 2) * r, s.ay + Math.sin(t + Math.PI / 2) * r);
  g.arc(s.ax, s.ay, r, t + Math.PI / 2, t + (Math.PI * 3) / 2);
  g.arc(s.bx, s.by, r, t - Math.PI / 2, t + Math.PI / 2);
  g.closePath();
}

function fillShapes(
  g: CanvasRenderingContext2D,
  shapes: readonly WalkShape[],
  pad: number,
  style: string | CanvasGradient | CanvasPattern,
): void {
  g.beginPath();
  for (const s of shapes) shapePath(g, s, pad);
  g.fillStyle = style;
  g.fill();
}

/**
 * Paints the Long Board's top (board and frame) in sim coordinates: an 8 × 16 chessboard whose
 * home-terrace rows are a shade lighter, water across the river band, and one surface per zone:
 * felt lanes with brass chevrons on the ramps, pine groves with their clearings, the Pit's brass
 * rings, marble Squares, gravel verges, winding Sally Paths and the flagstone River Road.
 * `k` is texture pixels per sim unit; text faces the player (White at the bottom in portrait, on
 * the left in landscape).
 */
export function paintLong(
  g: CanvasRenderingContext2D,
  k: number,
  map: MapDef,
  frame: number,
  o: Orient,
): void {
  const W = map.size;
  const L = map.length ?? map.size;
  const mid = L / 2;
  const t = map.terraces!;
  const F = frame;
  g.setTransform(k, 0, 0, k, F * k, F * k);
  const upright = o === 'portrait' ? 0 : -Math.PI / 2;
  const glyph = (txt: string, x: number, y: number): void => {
    g.save();
    g.translate(x, y);
    g.rotate(upright);
    g.fillText(txt, 0, 0);
    g.restore();
  };

  // frame: walnut with a sheen and a brass inlay; notation faces the player
  const fg = g.createLinearGradient(-F, -F, W + F, L + F);
  fg.addColorStop(0, TABLE.frameGrad[0]);
  fg.addColorStop(0.5, TABLE.frameGrad[1]);
  fg.addColorStop(1, TABLE.frameGrad[2]);
  g.fillStyle = fg;
  g.fillRect(-F, -F, W + F * 2, L + F * 2);
  g.strokeStyle = TABLE.brassDark;
  g.lineWidth = 4;
  g.strokeRect(-F * 0.72, -F * 0.72, W + F * 1.44, L + F * 1.44);
  const sq = W / 8;
  const rows = Math.round(L / sq);
  g.fillStyle = TABLE.notation;
  g.font = `${Math.round(F * 0.5)}px 'IM Fell English SC', Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    glyph(FILES[i], sq * (i + 0.5), L + F * 0.42);
    glyph(FILES[i], sq * (i + 0.5), -F * 0.42);
  }
  for (let j = 0; j < rows; j++) {
    glyph(String(j + 1), -F * 0.42, L - sq * (j + 0.5));
    glyph(String(j + 1), W + F * 0.42, L - sq * (j + 0.5));
  }

  // the chessboard: home-terrace rows a shade lighter, so the three heights read even from above
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < rows; j++) {
      const e = Math.abs((j + 0.5) * sq - mid);
      const base = (i + j) % 2 === 0 ? TABLE.sqLight : TABLE.sqDark;
      g.fillStyle = e >= t.home ? mix(base, '#b8a888', 0.16) : base;
      g.fillRect(i * sq, j * sq, sq + 0.5, sq + 0.5);
    }
  // lamp light: warm along the board's spine, darker toward the corners
  g.save();
  g.translate(W / 2, mid);
  g.scale(1, L / W);
  const lamp = g.createRadialGradient(0, 0, W * 0.05, 0, 0, W * 0.78);
  lamp.addColorStop(0, `rgba(255,226,170,${TABLE.lampIn})`);
  lamp.addColorStop(0.6, 'rgba(0,0,0,0)');
  lamp.addColorStop(1, `rgba(10,6,3,${TABLE.lampOut})`);
  g.fillStyle = lamp;
  g.fillRect(-W / 2, -W / 2, W, W);
  g.restore();

  // the river: open water across the board, with ripples
  const r0 = mid - t.river;
  const wg = g.createLinearGradient(0, r0, 0, mid + t.river);
  wg.addColorStop(0, ZONE.water);
  wg.addColorStop(0.5, mix(ZONE.water, ZONE.waterLight, 0.35));
  wg.addColorStop(1, ZONE.water);
  g.fillStyle = wg;
  g.fillRect(0, r0, W, t.river * 2);
  g.strokeStyle = ZONE.waterLight;
  g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const y = r0 + 14 + hash(i) * (t.river * 2 - 28);
    const x = hash(i + 50) * W;
    const len = 50 + hash(i + 90) * 70;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 4, y - 6, x + len / 2, y);
    g.quadraticCurveTo(x + (len * 3) / 4, y + 6, x + len, y);
    g.stroke();
  }
  // cliff tops: a brass hairline along each terrace edge
  g.strokeStyle = 'rgba(201,163,90,0.45)';
  g.lineWidth = 4;
  for (const e of [t.river, t.home])
    for (const y of [mid - e, mid + e]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

  const shapes = buildTerrain(map).shapes;
  const of = (...kinds: WalkShape['kind'][]): WalkShape[] =>
    shapes.filter((s) => kinds.includes(s.kind));
  const lanes = of('lane');
  const groves = of('grove');
  const gates = of('port').filter((s) => s.slot !== null || map.slots.some((sl) => sl.x === s.ax));
  // every walkable floor shares one dark outline and a brass edge, then each zone gets its surface
  fillShapes(g, shapes, 12, 'rgba(8,6,4,0.7)');
  fillShapes(g, shapes, 6, TABLE.brassDark);

  // groves: dark pine with leaf litter; their gates share the floor
  fillShapes(g, [...groves, ...gates], 0, ZONE.grove);
  g.save();
  g.beginPath();
  for (const s of groves) shapePath(g, s, 0);
  g.clip();
  let n = 0;
  for (const s of groves) {
    const x0 = Math.min(s.ax, s.bx) - s.r;
    const y0 = Math.min(s.ay, s.by) - s.r;
    const w = Math.abs(s.bx - s.ax) + s.r * 2;
    const h = Math.abs(s.by - s.ay) + s.r * 2;
    for (let i = 0; i < 90; i++, n++) {
      g.fillStyle = hash(n + 7) < 0.5 ? ZONE.groveLeaf : ZONE.groveDark;
      g.beginPath();
      g.ellipse(
        x0 + hash(n) * w,
        y0 + hash(n + 3) * h,
        8 + hash(n + 5) * 14,
        5 + hash(n + 6) * 8,
        hash(n + 9) * Math.PI,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }
  // clearings: a lighter glade with a dashed brass ring
  for (const sl of map.slots) {
    g.fillStyle = ZONE.clearing;
    g.beginPath();
    g.arc(sl.x, sl.y, sl.radius * 0.92, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([16, 12]);
    g.strokeStyle = TABLE.brassDark;
    g.lineWidth = 4;
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();

  // verges: gravel strips; Sally Paths: winding dirt with a dashed brass line
  fillShapes(g, of('verge'), 0, ZONE.verge);
  g.fillStyle = ZONE.vergeDot;
  for (const s of of('verge')) {
    const y0 = Math.min(s.ay, s.by);
    const h = Math.abs(s.by - s.ay);
    for (let i = 0; i < 40; i++, n++)
      g.fillRect(s.ax - s.r + hash(n) * s.r * 2, y0 + hash(n + 1) * h, 4, 4);
  }
  const sally = of('sally');
  fillShapes(g, sally, 0, ZONE.sally);
  g.strokeStyle = ZONE.sallyLine;
  g.lineWidth = 5;
  g.setLineDash([18, 16]);
  for (const a of map.areas.filter((x) => x.kind === 'sally')) {
    g.beginPath();
    a.pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
  }
  g.setLineDash([]);

  // the River Road: flagstones with joints across the road
  const road = of('road');
  fillShapes(g, road, 0, ZONE.road);
  g.save();
  g.beginPath();
  for (const s of road) shapePath(g, s, 0);
  g.clip();
  g.strokeStyle = ZONE.roadJoint;
  g.lineWidth = 3;
  for (const s of road) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const ux = (s.bx - s.ax) / (len || 1);
    const uy = (s.by - s.ay) / (len || 1);
    for (let d = 0; d <= len; d += 46) {
      const x = s.ax + ux * d;
      const y = s.ay + uy * d;
      g.beginPath();
      g.moveTo(x - uy * s.r, y + ux * s.r);
      g.lineTo(x + uy * s.r, y - ux * s.r);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(s.ax, s.ay);
    g.lineTo(s.bx, s.by);
    g.stroke();
  }
  g.restore();

  // the Pit: a dark basin with brass rings
  for (const s of of('pit')) {
    const pg = g.createRadialGradient(s.ax, s.ay, 0, s.ax, s.ay, s.r);
    pg.addColorStop(0, '#0c0d10');
    pg.addColorStop(1, ZONE.pit);
    g.fillStyle = pg;
    g.beginPath();
    g.arc(s.ax, s.ay, s.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = TABLE.brassDark;
    for (const [rr, lw] of [
      [s.r * 0.92, 5],
      [s.r * 0.62, 3],
      [s.r * 0.3, 3],
    ] as const) {
      g.lineWidth = lw;
      g.beginPath();
      g.arc(s.ax, s.ay, rr, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.beginPath();
      g.moveTo(s.ax + Math.cos(a) * s.r * 0.3, s.ay + Math.sin(a) * s.r * 0.3);
      g.lineTo(s.ax + Math.cos(a) * s.r * 0.92, s.ay + Math.sin(a) * s.r * 0.92);
      g.stroke();
    }
  }

  // lanes: felt runners (a darker edge, a lighter nap down the middle)
  fillShapes(g, lanes, 0, TABLE.feltDark);
  fillShapes(g, lanes, -6, TABLE.felt);
  g.save();
  g.beginPath();
  for (const s of lanes) shapePath(g, s, 0);
  g.clip();
  g.strokeStyle = TABLE.feltLight;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = map.walk.lane * 0.9;
  for (const lane of Object.values(map.lanes)) {
    g.beginPath();
    lane.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
  }
  g.restore();
  // ramps: three brass chevrons pointing uphill (away from the river)
  for (const s of lanes) {
    if (!s.box || s.r >= map.walk.lane) continue;
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const cy = (s.ay + s.by) / 2;
    const up = (cy < mid ? -1 : 1) * Math.sign(s.by - s.ay || 1);
    const ux = ((s.bx - s.ax) / len) * up;
    const uy = ((s.by - s.ay) / len) * up;
    const cx = (s.ax + s.bx) / 2;
    for (const f of [-0.3, 0, 0.3]) {
      const px = cx + ux * len * f;
      const py = cy + uy * len * f;
      const w = s.r * 0.62;
      const back = 20;
      g.beginPath();
      g.moveTo(px - uy * w - ux * back, py + ux * w - uy * back);
      g.lineTo(px + ux * 6, py + uy * 6);
      g.lineTo(px + uy * w - ux * back, py - ux * w - uy * back);
      g.strokeStyle = 'rgba(8,6,4,0.6)';
      g.lineWidth = 14;
      g.stroke();
      g.strokeStyle = TABLE.brass;
      g.lineWidth = 7;
      g.stroke();
    }
  }

  // Squares: marble plazas in a brass rim, laid over the Mid lane
  for (const a of map.areas.filter((x) => x.kind === 'square')) {
    const [ax, ay] = a.pts[0];
    const [bx, by] = a.pts[a.pts.length - 1];
    const x0 = Math.min(ax, bx) - a.r;
    const y0 = Math.min(ay, by);
    const w = a.r * 2;
    const h = Math.abs(by - ay);
    const cs = w / 4;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < Math.round(h / cs); j++) {
        g.fillStyle = (i + j) % 2 === 0 ? ZONE.marble : ZONE.marbleDark;
        g.fillRect(x0 + i * cs, y0 + j * cs, cs + 0.5, cs + 0.5);
      }
    g.strokeStyle = TABLE.brass;
    g.lineWidth = 5;
    g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
  }

  // Bastion squares: a marble tile edged in brass under every Bastion
  const sites = map.bastions
    ? [map.bastions.A, map.bastions.B].flatMap((side) => Object.values(side).flat())
    : [];
  for (const [tx, ty] of sites) {
    const h = RELIEF.tileHalf;
    g.fillStyle = 'rgba(10,6,4,0.6)';
    g.fillRect(tx - h - 8, ty - h - 8, h * 2 + 16, h * 2 + 16);
    g.fillStyle = TABLE.brass;
    g.fillRect(tx - h - 3, ty - h - 3, h * 2 + 6, h * 2 + 6);
    g.fillStyle = TABLE.sqLight;
    g.fillRect(tx - h + 3, ty - h + 3, h * 2 - 6, h * 2 - 6);
    g.strokeStyle = TABLE.brassDark;
    g.lineWidth = 3;
    g.strokeRect(tx - h * 0.62, ty - h * 0.62, h * 1.24, h * 1.24);
  }

  // base medallions: brass ring, team marble, an eight-point brass star
  for (const [team, [bx, by]] of Object.entries(map.bases)) {
    const R = map.walk.base;
    g.fillStyle = TABLE.brass;
    g.beginPath();
    g.arc(bx, by, R + 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = team === 'A' ? TABLE.baseA : TABLE.baseB;
    g.beginPath();
    g.arc(bx, by, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = team === 'A' ? 'rgba(125,98,50,0.8)' : 'rgba(195,204,216,0.45)';
    g.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const rr = i % 2 === 0 ? R * 0.86 : R * 0.55;
      g.beginPath();
      g.moveTo(bx + Math.cos(a - 0.2) * R * 0.2, by + Math.sin(a - 0.2) * R * 0.2);
      g.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
      g.lineTo(bx + Math.cos(a + 0.2) * R * 0.2, by + Math.sin(a + 0.2) * R * 0.2);
      g.stroke();
    }
    g.beginPath();
    g.arc(bx, by, R * 0.93, 0, Math.PI * 2);
    g.stroke();
  }

  // shop stalls and Keeper spots: brass medallions
  for (const s of of('shop', 'spot')) {
    const R = s.kind === 'shop' ? s.r * 0.6 : s.r * 0.45;
    g.strokeStyle = s.kind === 'shop' ? TABLE.brass : 'rgba(201,163,90,0.55)';
    g.lineWidth = s.kind === 'shop' ? 6 : 4;
    g.beginPath();
    g.arc(s.ax, s.ay, R, 0, Math.PI * 2);
    g.stroke();
  }

  // lane names in brass on the felt, just out of White's base
  g.font = `${Math.round(map.walk.lane * 0.42)}px 'IM Fell English SC', Georgia, serif`;
  const names: [keyof typeof map.lanes, string][] = [
    ['top', 'LEFT'],
    ['mid', 'MID'],
    ['bot', 'RIGHT'],
  ];
  for (const [id, name] of names) {
    const p = map.lanes[id];
    const [x0, y0] = p[0];
    const [x1, y1] = p[1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const d = map.walk.base + 120;
    const x = x0 + ((x1 - x0) / len) * d;
    const y = y0 + ((y1 - y0) / len) * d;
    g.fillStyle = 'rgba(10,6,4,0.55)';
    glyph(name, x + 3, y + 3);
    g.fillStyle = TABLE.laneName;
    glyph(name, x, y);
  }
}

/**
 * Low-poly pines on the open ground that hugs each grove (the rim on the Mid side and the grove
 * ends), never on a walkable floor or over water: one static mesh. Null without groves.
 */
export function groveTrees(map: MapDef, ground: Ground): BufferGeometry | null {
  const shapes = buildTerrain(map).shapes;
  const groves = shapes.filter((s) => s.kind === 'grove');
  const W = map.size;
  const L = map.length ?? map.size;
  const river = map.terraces?.river ?? 0;
  const parts: Part[] = [];
  let n = 0;
  for (const gr of groves) {
    const len = Math.hypot(gr.bx - gr.ax, gr.by - gr.ay);
    const ux = (gr.bx - gr.ax) / (len || 1);
    const uy = (gr.by - gr.ay) / (len || 1);
    for (const off of [22, 58]) {
      const R = gr.r + off;
      // walk the outline of the grown capsule: two straight sides and two half circles
      const perim = 2 * len + 2 * Math.PI * R;
      for (let d = 0; d < perim; d += 34) {
        let x: number;
        let y: number;
        if (d < len) {
          x = gr.ax + ux * d - uy * R;
          y = gr.ay + uy * d + ux * R;
        } else if (d < len + Math.PI * R) {
          const a = Math.atan2(ux, -uy) - (d - len) / R;
          x = gr.bx + Math.cos(a) * R;
          y = gr.by + Math.sin(a) * R;
        } else if (d < 2 * len + Math.PI * R) {
          const k = d - len - Math.PI * R;
          x = gr.bx - ux * k + uy * R;
          y = gr.by - uy * k - ux * R;
        } else {
          const a = Math.atan2(-ux, uy) - (d - 2 * len - Math.PI * R) / R;
          x = gr.ax + Math.cos(a) * R;
          y = gr.ay + Math.sin(a) * R;
        }
        if (x < 30 || y < 30 || x > W - 30 || y > L - 30) continue;
        if (Math.abs(y - L / 2) < river + 12) continue;
        if (shapes.some((s) => shapeDist(s, x, y) < 14)) continue;
        const k = 0.8 + hash(n++) * 0.4;
        const at: [number, number, number] = [x - W / 2, ground.atSim(x, y) - 2, y - L / 2];
        const turn: [number, number, number] = [0, hash(n++) * Math.PI, 0];
        const dark = hash(n++) < 0.5;
        parts.push(
          { g: prism(3, 4, 12, 5), c: '#3a2a1c', p: at, r: turn, s: k },
          {
            g: cone(17, 30, 6),
            c: dark ? '#20372b' : '#284434',
            p: [at[0], at[1] + 9 * k, at[2]],
            r: turn,
            s: k,
          },
          {
            g: cone(12, 24, 6),
            c: dark ? '#2a4535' : '#31513e',
            p: [at[0], at[1] + 26 * k, at[2]],
            r: turn,
            s: k,
          },
        );
      }
    }
  }
  return parts.length ? merge(parts) : null;
}
