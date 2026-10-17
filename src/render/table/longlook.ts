import type { BufferGeometry } from 'three';
import type { MapDef, WalkShape } from '../../sim';
import { buildTerrain, shapeDist } from '../../sim';
import type { Orient } from './board';
import { box, cone, merge, prism, type Part } from './mesh';
import { TABLE } from './palette';
import { type Ground, RELIEF } from './relief';

/**
 * The Long Board's visual language (docs/LOOK-LONGBOARD-2026-10-12.md): one meaning per look.
 * Felt = lane; flagstone = any other walkable ground; a pale stone lip = a change of height;
 * a brass medallion (ring + badge with an icon) = a place you use or fight over; calm floor
 * tiles = dead space; trees, hedges and water only on dead space. `a` and `b` follow the same
 * rules in two moods.
 */
export type MapStyleId = 'a' | 'b';

export interface MapStyle {
  id: 'a' | 'b';
  /** Dead-space floor: tile colour on the midfield and home terraces, joints, corner stones. */
  floor: string;
  floorHome: string;
  floorJoint: string;
  floorStud: string | null;
  /** Floor tile side (sim units). */
  tile: number;
  /** The stone lip: kerbs, cliff tops, ramp treads, plinths, arches. */
  coping: string;
  copingDark: string;
  /** Flagstone (roads, paths, Squares, clearings) and the grove yards. */
  road: string;
  roadJoint: string;
  yard: string;
  yardJoint: string;
  /** Yard stone size (width, height): setts in a, bricks in b. */
  yardStone: readonly [number, number];
  felt: string;
  feltDark: string;
  feltLight: string;
  water: string;
  waterLight: string;
  pit: string;
  /** Medallion enamel (badge field). */
  enamel: string;
  pine: readonly [string, string, string, string];
  trunk: string;
  /** Clipped hedge round the groves (b only), and the pine rows' offsets from the grove edge. */
  hedge: readonly [string, string] | null;
  pineRows: readonly number[];
  /** The surroundings: the lake round the garden, and the haze the far distance fades into. */
  lake: string;
  haze: string;
}

const STYLES: Record<'a' | 'b', MapStyle> = {
  // a · Slate garden: cool night slate, teal felt, pale limestone paths, moss-set yards, pines
  a: {
    id: 'a',
    floor: '#252a30',
    floorHome: '#2d333a',
    floorJoint: '#1b1f24',
    floorStud: null,
    tile: 125,
    coping: '#a39c8c',
    copingDark: '#5d584f',
    road: '#6d6a62',
    roadJoint: '#504e48',
    yard: '#304337',
    yardJoint: '#24342b',
    yardStone: [60, 40],
    felt: '#28474a',
    feltDark: '#1d3537',
    feltLight: '#2e5255',
    water: '#0c2431',
    waterLight: '#2a6276',
    pit: '#191c20',
    enamel: '#14181c',
    pine: ['#20372b', '#284434', '#2a4535', '#31513e'],
    trunk: '#3a2a1c',
    hedge: null,
    pineRows: [22, 58],
    lake: '#0b1e29',
    haze: '#17232a',
  },
  // b · Lamplit parterre: warm umber tiles, bottle-green felt, honey sandstone, hedged groves
  b: {
    id: 'b',
    floor: '#2c241e',
    floorHome: '#352c24',
    floorJoint: '#1f1914',
    floorStud: '#4d4033',
    tile: 125,
    coping: '#c4a87c',
    copingDark: '#6b5639',
    road: '#8c7149',
    roadJoint: '#685337',
    yard: '#653d2b',
    yardJoint: '#48291c',
    yardStone: [36, 18],
    felt: '#21452f',
    feltDark: '#193826',
    feltLight: '#285238',
    water: '#0d1d30',
    waterLight: '#2d5376',
    pit: '#1d1813',
    enamel: '#1a1410',
    pine: ['#243c27', '#2d4a2f', '#2e4c30', '#385c39'],
    trunk: '#3f2c1b',
    hedge: ['#2b4a2b', '#38603a'],
    pineRows: [44, 76],
    lake: '#0c1828',
    haze: '#241c16',
  },
};

/** Mixes two #rrggbb colours (the result is #rrggbb too). */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** A #rrggbb colour with an alpha. */
export function rgba(c: string, a: number): string {
  const p = (i: number): number => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgba(${p(0)},${p(1)},${p(2)},${a})`;
}

/** A small deterministic hash in [0, 1) (the paint is the same every load). */
export function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Adds a walkable shape, grown by `pad`, to the current path (a capsule, or a flat-ended box). */
export function shapePath(g: CanvasRenderingContext2D, s: WalkShape, pad: number): void {
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

export function fillShapes(
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

export function mapStyle(id: MapStyleId): MapStyle {
  return STYLES[id];
}

/** Height of the floor lip over the walkable ground, and its bevel (sim/world units). */
export const LIP = { h: 16, bevel: 12 } as const;

/** A gap in a grove's edge where a path enters: centre on the edge, along-edge unit, half width. */
export interface GroveGate {
  x: number;
  y: number;
  /** Unit vector along the grove edge, and the outward normal. */
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  half: number;
  /** What walks through it ('port' for a clearing's gate path, 'sally' for a Sally spur). */
  kind: WalkShape['kind'];
}

/** A point at arc length `d` round a grove capsule grown to radius `R`. */
function ringPoint(gr: WalkShape, R: number, d: number): [number, number] {
  const len = Math.hypot(gr.bx - gr.ax, gr.by - gr.ay);
  const ux = (gr.bx - gr.ax) / (len || 1);
  const uy = (gr.by - gr.ay) / (len || 1);
  if (d < len) return [gr.ax + ux * d - uy * R, gr.ay + uy * d + ux * R];
  if (d < len + Math.PI * R) {
    const a = Math.atan2(ux, -uy) - (d - len) / R;
    return [gr.bx + Math.cos(a) * R, gr.by + Math.sin(a) * R];
  }
  if (d < 2 * len + Math.PI * R) {
    const k = d - len - Math.PI * R;
    return [gr.bx - ux * k + uy * R, gr.by - uy * k - ux * R];
  }
  const a = Math.atan2(-ux, uy) - (d - 2 * len - Math.PI * R) / R;
  return [gr.ax + Math.cos(a) * R, gr.ay + Math.sin(a) * R];
}

const ringLen = (gr: WalkShape, R: number): number =>
  2 * Math.hypot(gr.bx - gr.ax, gr.by - gr.ay) + 2 * Math.PI * R;

/** Paths that can cross a grove's edge (not its own floor, its clearings or the Pit beside it). */
function crossers(shapes: readonly WalkShape[]): WalkShape[] {
  const own = ['grove', 'slot', 'spot', 'pit'];
  return shapes.filter((s) => !own.includes(s.kind));
}

/**
 * Every place a walkable path crosses a grove's edge, outside the river band: found from the
 * sim's own walkable shapes, so the arches always stand where the real gates are.
 */
export function groveGates(map: MapDef): GroveGate[] {
  const shapes = buildTerrain(map).shapes;
  const cross = crossers(shapes);
  const pits = shapes.filter((s) => s.kind === 'pit');
  const out: GroveGate[] = [];
  const STEP = 3;
  for (const gr of shapes.filter((s) => s.kind === 'grove')) {
    const R = gr.r + 6;
    const total = ringLen(gr, R);
    const n = Math.floor(total / STEP);
    const hit: (WalkShape | null)[] = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = ringPoint(gr, R, i * STEP);
      // where the Pit opens onto the grove there is no edge to gate
      const open = pits.some((p) => shapeDist(p, x, y) < 0);
      hit.push(open ? null : (cross.find((c) => shapeDist(c, x, y) < 0) ?? null));
    }
    // start the walk on a clear sample so no run wraps round the end of the array
    const start = hit.findIndex((h) => h === null);
    if (start < 0) continue;
    let run: number[] = [];
    const flush = (): void => {
      if (run.length * STEP < 30) {
        run = [];
        return;
      }
      const [x0, y0] = ringPoint(gr, gr.r, run[0] * STEP);
      const [x1, y1] = ringPoint(gr, gr.r, run[run.length - 1] * STEP);
      const [cx, cy] = ringPoint(gr, gr.r, run[run.length >> 1] * STEP);
      const tl = Math.hypot(x1 - x0, y1 - y0) || 1;
      // outward normal: away from the grove's axis
      const len = Math.hypot(gr.bx - gr.ax, gr.by - gr.ay) || 1;
      const f = Math.max(
        0,
        Math.min(1, ((cx - gr.ax) * (gr.bx - gr.ax) + (cy - gr.ay) * (gr.by - gr.ay)) / len ** 2),
      );
      const qx = cx - (gr.ax + (gr.bx - gr.ax) * f);
      const qy = cy - (gr.ay + (gr.by - gr.ay) * f);
      const ql = Math.hypot(qx, qy) || 1;
      out.push({
        x: cx,
        y: cy,
        tx: (x1 - x0) / tl,
        ty: (y1 - y0) / tl,
        nx: qx / ql,
        ny: qy / ql,
        half: tl / 2,
        kind: hit[run[run.length >> 1]]!.kind,
      });
      run = [];
    };
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (hit[i]) run.push(i);
      else flush();
    }
    flush();
  }
  return out;
}

/* --------------------------------- paint --------------------------------- */

/** Fills the current clip with a world-aligned running bond of stones (one flagstone family). */
function bond(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sw: number,
  sh: number,
  base: string,
  joint: string,
  seed: number,
): void {
  g.fillStyle = base;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  let n = seed;
  const r0 = Math.floor(y0 / sh);
  const r1 = Math.ceil(y1 / sh);
  for (let r = r0; r < r1; r++) {
    const off = (r & 1) * sw * 0.5;
    const c0 = Math.floor((x0 - off) / sw);
    const c1 = Math.ceil((x1 - off) / sw);
    for (let c = c0; c < c1; c++) {
      const t = hash(n++);
      if (t < 0.55) continue;
      g.fillStyle = t < 0.78 ? mix(base, '#000000', 0.07) : mix(base, '#ffffff', 0.05);
      g.fillRect(c * sw + off, r * sh, sw, sh);
    }
  }
  g.strokeStyle = joint;
  g.lineWidth = 2.5;
  g.beginPath();
  for (let r = r0; r <= r1; r++) {
    g.moveTo(x0, r * sh);
    g.lineTo(x1, r * sh);
    const off = (r & 1) * sw * 0.5;
    for (let x = Math.floor((x0 - off) / sw) * sw + off; x < x1; x += sw) {
      g.moveTo(x, r * sh);
      g.lineTo(x, r * sh + sh);
    }
  }
  g.stroke();
}

/** Bounding box of shapes grown by `pad`. */
function bounds(shapes: readonly WalkShape[], pad: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const r = s.r + pad;
    x0 = Math.min(x0, s.ax - r, s.bx - r);
    y0 = Math.min(y0, s.ay - r, s.by - r);
    x1 = Math.max(x1, s.ax + r, s.bx + r);
    y1 = Math.max(y1, s.ay + r, s.by + r);
  }
  return [x0, y0, x1, y1];
}

/** Paves the union of `shapes` (grown by `pad`) with the running bond. */
function pave(
  g: CanvasRenderingContext2D,
  shapes: readonly WalkShape[],
  pad: number,
  st: { base: string; joint: string; sw: number; sh: number; seed: number },
): void {
  if (!shapes.length) return;
  g.save();
  g.beginPath();
  for (const s of shapes) shapePath(g, s, pad);
  g.clip();
  const [x0, y0, x1, y1] = bounds(shapes, pad + 2);
  bond(g, x0, y0, x1, y1, st.sw, st.sh, st.base, st.joint, st.seed);
  g.restore();
}

type Icon = 'paw' | 'gem' | 'star' | 'eye';

/** A badge icon centred on (0, 0), `r` its radius, in the current fill. */
function icon(g: CanvasRenderingContext2D, kind: Icon, r: number): void {
  g.beginPath();
  if (kind === 'paw') {
    g.ellipse(0, r * 0.28, r * 0.42, r * 0.34, 0, 0, Math.PI * 2);
    for (const [x, y, s] of [
      [-0.5, -0.18, 0.17],
      [-0.2, -0.5, 0.18],
      [0.2, -0.5, 0.18],
      [0.5, -0.18, 0.17],
    ] as const) {
      g.moveTo(x * r + s * r, y * r);
      g.arc(x * r, y * r, s * r, 0, Math.PI * 2);
    }
  } else if (kind === 'gem') {
    g.moveTo(-r * 0.62, -r * 0.18);
    g.lineTo(-r * 0.32, -r * 0.52);
    g.lineTo(r * 0.32, -r * 0.52);
    g.lineTo(r * 0.62, -r * 0.18);
    g.lineTo(0, r * 0.62);
    g.closePath();
  } else if (kind === 'star') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 0.7 : r * 0.24;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
  g.fill();
  if (kind === 'gem') {
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = r * 0.07;
    g.beginPath();
    g.moveTo(-r * 0.62, -r * 0.18);
    g.lineTo(r * 0.62, -r * 0.18);
    g.stroke();
  }
}

/** A round brass badge with an icon, upright to the player. */
function badge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: Icon,
  st: MapStyle,
  upright: number,
): void {
  g.fillStyle = 'rgba(6,5,4,0.75)';
  g.beginPath();
  g.arc(x, y, r + 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = TABLE.brass;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = st.enamel;
  g.beginPath();
  g.arc(x, y, r * 0.8, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(x, y);
  g.rotate(upright);
  g.fillStyle = TABLE.brass;
  icon(g, kind, r * 0.8);
  g.restore();
}

/** A medallion's brass ring: a band between two dark hairlines and a thin inner ring. */
function ringBand(g: CanvasRenderingContext2D, x: number, y: number, R: number, w: number): void {
  g.strokeStyle = 'rgba(6,5,4,0.7)';
  g.lineWidth = w + 6;
  g.beginPath();
  g.arc(x, y, R, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = TABLE.brass;
  g.lineWidth = w;
  g.stroke();
  g.strokeStyle = TABLE.brassDark;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(x, y, R - w * 1.6, 0, Math.PI * 2);
  g.stroke();
}

/**
 * Paints the Long Board's top in a style of the visual language (sim coordinates; `k` texture
 * pixels per sim unit; text and badges face the player). The dead-space floor and the river run
 * on past the board's edge across the `apron` round it, darkening toward the woods and the lake.
 */
export function paintLongStyled(
  g: CanvasRenderingContext2D,
  k: number,
  map: MapDef,
  apron: number,
  o: Orient,
  st: MapStyle,
): void {
  const W = map.size;
  const L = map.length ?? map.size;
  const mid = L / 2;
  const t = map.terraces!;
  const F = apron;
  g.setTransform(k, 0, 0, k, F * k, F * k);
  const upright = o === 'portrait' ? 0 : -Math.PI / 2;
  // the player's near side on the board: down the screen
  const nearX = o === 'portrait' ? 0 : 1;
  const nearY = o === 'portrait' ? 1 : 0;
  const glyph = (txt: string, x: number, y: number): void => {
    g.save();
    g.translate(x, y);
    g.rotate(upright);
    g.fillText(txt, 0, 0);
    g.restore();
  };

  // dead space: calm floor tiles, one shade per terrace (home a little lighter), on past the edge
  const T = st.tile;
  const i0 = -Math.ceil(F / T);
  const i1 = Math.ceil((W + F) / T);
  const j0 = -Math.ceil(F / T);
  const j1 = Math.ceil((L + F) / T);
  let n = 0;
  for (let i = i0; i < i1; i++)
    for (let j = j0; j < j1; j++) {
      const e = Math.abs((j + 0.5) * T - mid);
      const base = e >= t.home ? st.floorHome : st.floor;
      g.fillStyle = mix(base, '#000000', hash(n++ + 4000) * 0.08);
      g.fillRect(i * T, j * T, T + 0.5, T + 0.5);
    }
  g.strokeStyle = st.floorJoint;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = i0 + 1; i < i1; i++) {
    g.moveTo(i * T, -F);
    g.lineTo(i * T, L + F);
  }
  for (let j = j0 + 1; j < j1; j++) {
    g.moveTo(-F, j * T);
    g.lineTo(W + F, j * T);
  }
  g.stroke();
  if (st.floorStud) {
    // b: small inset stones where four tiles meet
    g.fillStyle = st.floorStud;
    for (let x = i0 * T; x < W + F; x += T)
      for (let y = j0 * T; y < L + F; y += T) {
        g.beginPath();
        g.moveTo(x, y - 11);
        g.lineTo(x + 11, y);
        g.lineTo(x, y + 11);
        g.lineTo(x - 11, y);
        g.closePath();
        g.fill();
      }
  }
  // lamp light: warm along the spine, darker toward the corners
  g.save();
  g.translate(W / 2, mid);
  g.scale(1, L / W);
  const lamp = g.createRadialGradient(0, 0, W * 0.05, 0, 0, W * 0.78);
  lamp.addColorStop(0, `rgba(255,226,170,${TABLE.lampIn * 0.8})`);
  lamp.addColorStop(0.6, 'rgba(0,0,0,0)');
  lamp.addColorStop(1, `rgba(10,6,3,${TABLE.lampOut})`);
  g.fillStyle = lamp;
  g.fillRect(-W / 2, -W / 2, W, W);
  g.restore();

  // the river: open water running out to the lake either side, a few soft ripples
  const r0 = mid - t.river;
  const wg = g.createLinearGradient(0, r0, 0, mid + t.river);
  wg.addColorStop(0, st.water);
  wg.addColorStop(0.5, mix(st.water, st.waterLight, 0.3));
  wg.addColorStop(1, st.water);
  g.fillStyle = wg;
  g.fillRect(-F, r0, W + F * 2, t.river * 2);
  g.strokeStyle = mix(st.water, st.waterLight, 0.7);
  g.lineWidth = 3;
  for (let i = 0; i < 30; i++) {
    const y = r0 + 20 + hash(i) * (t.river * 2 - 40);
    const x = -F + hash(i + 50) * (W + F * 2);
    const len = 40 + hash(i + 90) * 60;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 4, y - 5, x + len / 2, y);
    g.quadraticCurveTo(x + (len * 3) / 4, y + 5, x + len, y);
    g.stroke();
  }
  // cliff tops: the stone lip along each terrace edge (on the higher side)
  for (const e of [t.river, t.home])
    for (const s of [-1, 1]) {
      const y = mid + s * e;
      g.fillStyle = 'rgba(6,5,4,0.6)';
      g.fillRect(-F, s < 0 ? y : y - 6, W + F * 2, 6);
      g.fillStyle = st.coping;
      g.fillRect(-F, s < 0 ? y - 9 : y, W + F * 2, 9);
    }

  const shapes = buildTerrain(map).shapes;
  const of = (...kinds: WalkShape['kind'][]): WalkShape[] =>
    shapes.filter((s) => kinds.includes(s.kind));
  const lanes = of('lane');
  const groves = of('grove');
  const ports = of('port').filter((s) => map.slots.some((sl) => sl.x === s.ax && sl.y === s.ay));
  // every walkable edge: a dark shadow line, then the stone lip (the bevel's face shows it)
  fillShapes(g, shapes, LIP.bevel + 8, 'rgba(6,5,4,0.65)');
  fillShapes(g, shapes, LIP.bevel + 3, st.coping);
  fillShapes(g, shapes, 2, st.copingDark);

  // grove yards: a darker course of the flagstone, then the paths through them
  pave(g, groves, 0, {
    base: st.yard,
    joint: st.yardJoint,
    sw: st.yardStone[0],
    sh: st.yardStone[1],
    seed: 900,
  });
  // shade the banks just inside the yard's edge (the yard is sunken)
  g.save();
  g.beginPath();
  for (const s of groves) shapePath(g, s, 0);
  g.clip();
  g.lineWidth = 26;
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  for (const s of groves) shapePath(g, s, 0);
  g.stroke();
  g.restore();

  // flagstone: River Road, Sally Paths and spurs, verges, gate paths, then gate thresholds
  const stone = { base: st.road, joint: st.roadJoint, sw: 44, sh: 30, seed: 100 };
  const roads = [...of('road', 'sally', 'verge'), ...ports];
  pave(g, roads, 0, stone);
  const gates = groveGates(map);
  for (const gt of gates) {
    // a paved threshold that widens into the grove (the grove floor is walkable: real ground)
    const R = gt.half + 22;
    g.save();
    g.beginPath();
    for (const s of groves) shapePath(g, s, 0);
    g.clip();
    g.beginPath();
    g.arc(gt.x, gt.y, R, 0, Math.PI * 2);
    g.clip();
    bond(g, gt.x - R, gt.y - R, gt.x + R, gt.y + R, 44, 30, st.road, st.roadJoint, 300);
    g.restore();
  }

  // clearings: round paved courts in a brass ring (the camp medallion)
  for (const sl of map.slots) {
    const R = sl.radius * 0.92;
    const disc: WalkShape = {
      kind: 'slot',
      ax: sl.x,
      ay: sl.y,
      bx: sl.x,
      by: sl.y,
      r: R,
      slot: null,
      lane: null,
    };
    pave(g, [disc], 0, { ...stone, base: mix(st.road, '#ffffff', 0.04), seed: 500 });
    ringBand(g, sl.x, sl.y, R, 9);
  }

  // the Pit: a dark sunken court
  for (const s of of('pit')) {
    pave(g, [s], 0, {
      base: st.pit,
      joint: mix(st.pit, '#000000', 0.35),
      sw: 60,
      sh: 40,
      seed: 700,
    });
    const pg = g.createRadialGradient(s.ax, s.ay, s.r * 0.4, s.ax, s.ay, s.r);
    pg.addColorStop(0, 'rgba(0,0,0,0)');
    pg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(s.ax, s.ay, s.r, 0, Math.PI * 2);
    g.fill();
  }

  // lanes: felt runners (darker edge, lighter nap down the middle)
  fillShapes(g, lanes, 0, st.feltDark);
  fillShapes(g, lanes, -6, st.felt);
  g.save();
  g.beginPath();
  for (const s of lanes) shapePath(g, s, 0);
  g.clip();
  g.strokeStyle = st.feltLight;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = map.walk.lane * 0.9;
  for (const lane of Object.values(map.lanes)) {
    g.beginPath();
    lane.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke();
  }
  g.restore();
  // ramps: stone treads across the felt, each with a dark riser on its downhill side
  for (const s of lanes) {
    if (!s.box || s.r >= map.walk.lane) continue;
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const cy = (s.ay + s.by) / 2;
    const up = (cy < mid ? -1 : 1) * Math.sign(s.by - s.ay || 1);
    const ux = ((s.bx - s.ax) / len) * up;
    const uy = ((s.by - s.ay) / len) * up;
    const cx = (s.ax + s.bx) / 2;
    const w = s.r * 0.9;
    for (const f of [-0.36, -0.12, 0.12, 0.36]) {
      const px = cx + ux * len * f;
      const py = cy + uy * len * f;
      const bar = (dx: number, lw: number, col: string): void => {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(px - uy * w + ux * dx, py + ux * w + uy * dx);
        g.lineTo(px + uy * w + ux * dx, py - ux * w + uy * dx);
        g.stroke();
      };
      bar(-6, 7, 'rgba(6,5,4,0.55)');
      bar(0, 8, st.coping);
    }
  }

  // shop Squares: flagstone plazas over the Mid lane, the shop medallion in the middle
  for (const a of map.areas.filter((x) => x.kind === 'square')) {
    const [ax, ay] = a.pts[0];
    const [bx, by] = a.pts[a.pts.length - 1];
    const sqShape: WalkShape = { kind: 'square', ax, ay, bx, by, r: a.r, slot: null, lane: null };
    sqShape.box = true;
    pave(g, [sqShape], 0, { ...stone, seed: 800 });
  }
  for (const s of of('shop')) ringBand(g, s.ax, s.ay, s.r * 0.72, 8);

  // the Pit's medallion: one wide ring over the causeways
  for (const s of of('pit')) ringBand(g, s.ax, s.ay, s.r * 0.93, 11);

  // Bastion plinths: stone squares with a darker inset (height, not a place: no brass)
  const sites = map.bastions
    ? [map.bastions.A, map.bastions.B].flatMap((side) => Object.values(side).flat())
    : [];
  for (const [tx, ty] of sites) {
    const h = RELIEF.tileHalf;
    g.fillStyle = 'rgba(6,5,4,0.6)';
    g.fillRect(tx - h - 8, ty - h - 8, h * 2 + 16, h * 2 + 16);
    g.fillStyle = st.coping;
    g.fillRect(tx - h - 2, ty - h - 2, h * 2 + 4, h * 2 + 4);
    g.fillStyle = st.road;
    g.fillRect(tx - h + 9, ty - h + 9, h * 2 - 18, h * 2 - 18);
    g.strokeStyle = st.roadJoint;
    g.lineWidth = 3;
    g.strokeRect(tx - h * 0.6, ty - h * 0.6, h * 1.2, h * 1.2);
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

  // badges: on the near edge of each ring, turned off a lane if the near edge falls on one
  const onLane = (x: number, y: number, r: number): boolean =>
    lanes.some((s) => shapeDist(s, x, y) < r);
  const place = (
    cx: number,
    cy: number,
    R: number,
    r: number,
    avoid: boolean,
  ): [number, number] => {
    for (const a of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = nearX * c - nearY * s;
      const dy = nearX * s + nearY * c;
      const x = cx + dx * R;
      const y = cy + dy * R;
      if (!avoid || !onLane(x, y, r * 0.6)) return [x, y];
    }
    return [cx + nearX * R, cy + nearY * R];
  };
  for (const sl of map.slots) {
    const [x, y] = place(sl.x, sl.y, sl.radius * 0.92, CAMP_BADGE, false);
    badge(g, x, y, CAMP_BADGE, 'paw', st, upright);
  }
  for (const s of of('shop')) {
    const [x, y] = place(s.ax, s.ay, s.r * 0.72, 34, false);
    badge(g, x, y, 34, 'gem', st, upright);
  }
  for (const s of of('pit')) {
    const [x, y] = place(s.ax, s.ay, s.r * 0.93, 42, true);
    badge(g, x, y, 42, 'star', st, upright);
  }
  // the Keeper's other spots (in the groves, on the River Road): a badge alone
  const pits = of('pit');
  for (const s of of('spot')) {
    if (pits.some((p) => Math.hypot(p.ax - s.ax, p.ay - s.ay) < p.r)) continue;
    badge(g, s.ax, s.ay, 30, 'star', st, upright);
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

  // past the board's edge the floor gives way to the woods' dark earth, then the bank to the lake
  const earth = mix(st.pine[0], st.floor, 0.45);
  const bankAt = (F - BANK) / F;
  const fade = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const fg = g.createLinearGradient(x0, y0, x1, y1);
    fg.addColorStop(0, rgba(earth, 0));
    fg.addColorStop(0.18, rgba(earth, 0.35));
    fg.addColorStop(bankAt * 0.8, rgba(earth, 0.92));
    fg.addColorStop(bankAt + (1 - bankAt) * 0.55, mix(earth, '#000000', 0.25));
    fg.addColorStop(1, st.lake);
    return fg;
  };
  g.fillStyle = fade(0, 0, -F, 0);
  g.fillRect(-F, -F, F, L + F * 2);
  g.fillStyle = fade(W, 0, W + F, 0);
  g.fillRect(W, -F, F, L + F * 2);
  g.fillStyle = fade(0, 0, 0, -F);
  g.fillRect(0, -F, W, F);
  g.fillStyle = fade(0, L, 0, L + F);
  g.fillRect(0, L, W, F);
}

/** How far in from the apron's outer edge its bank starts down to the lake (sim units). */
export const BANK = 150;

/**
 * The lake round the garden, painted into a square canvas of side `S` that covers `size` world
 * units centred on the board: lighter shallows round the island with a few ripples, darkening
 * outward into the haze (so the plane's edge never shows).
 */
export function paintLake(
  g: CanvasRenderingContext2D,
  S: number,
  size: number,
  map: MapDef,
  st: MapStyle,
): void {
  const k = S / size;
  const c = S / 2;
  g.fillStyle = st.haze;
  g.fillRect(0, 0, S, S);
  const W = map.size * k;
  const L = (map.length ?? map.size) * k;
  // the deep water: a wide soft glow round the island, fading into the haze
  g.save();
  g.translate(c, c);
  g.scale(1, L / W);
  const deep = g.createRadialGradient(0, 0, W * 0.4, 0, 0, W * 4.2);
  deep.addColorStop(0, st.lake);
  deep.addColorStop(0.45, mix(st.lake, st.haze, 0.45));
  deep.addColorStop(1, st.haze);
  g.fillStyle = deep;
  g.fillRect(-c, -c * (W / L), S, S * (W / L));
  // the shallows: lamplight on the water close to the island
  const shallow = g.createRadialGradient(0, 0, W * 0.5, 0, 0, W * 1.5);
  shallow.addColorStop(0, rgba(st.waterLight, 0.28));
  shallow.addColorStop(1, rgba(st.waterLight, 0));
  g.fillStyle = shallow;
  g.fillRect(-W * 1.6, -W * 1.6, W * 3.2, W * 3.2);
  g.restore();
  // ripples near the island
  g.strokeStyle = rgba(st.waterLight, 0.22);
  g.lineWidth = Math.max(1, 5 * k);
  for (let i = 0; i < 160; i++) {
    const a = hash(i + 7000) * Math.PI * 2;
    const r = 0.62 + hash(i + 7100) * 0.9;
    const x = c + Math.cos(a) * W * r * 1.05;
    const y = c + Math.sin(a) * L * r * 0.62;
    const len = (60 + hash(i + 7200) * 120) * k;
    g.beginPath();
    g.moveTo(x - len / 2, y);
    g.quadraticCurveTo(x, y - 6 * k, x + len / 2, y);
    g.stroke();
  }
}

/**
 * The closed-clearing cover (a dark iron disc with a keyhole), painted into a square canvas of
 * side `S`: the clearing's medallion shows through dimmed until the clearing opens.
 */
export function paintCover(
  g: CanvasRenderingContext2D,
  S: number,
  st: MapStyle,
  /** The clearing's ring and its badge (radii as fractions of the cover's radius). */
  ring: number,
  badgeR: number,
): void {
  const c = S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(8,9,11,0.72)';
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = TABLE.brassDark;
  g.lineWidth = S * 0.025;
  g.beginPath();
  g.arc(c, c, c - S * 0.03, 0, Math.PI * 2);
  g.stroke();
  // keyhole
  g.fillStyle = mix(st.coping, '#000000', 0.15);
  g.beginPath();
  g.arc(c, c - S * 0.05, S * 0.075, 0, Math.PI * 2);
  g.moveTo(c - S * 0.04, c);
  g.lineTo(c + S * 0.04, c);
  g.lineTo(c + S * 0.065, c + S * 0.15);
  g.lineTo(c - S * 0.065, c + S * 0.15);
  g.closePath();
  g.fill();
  // a notch where the camp badge sits (the near edge; the board turns the cover with the screen)
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(c, c + ring * c, badgeR * c, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

/** Radius of a clearing's camp badge (sim units). */
export const CAMP_BADGE = 38;

/* ---------------------------------- 3D ---------------------------------- */

/**
 * The groves' enclosures, one static mesh: pines (15% bigger than phase 3) on the dead space round
 * each grove, a clipped hedge along its edge in style b, and a stone gate arch over every path
 * that enters it (posts either side of the path, a lintel across).
 */
export function groveProps(map: MapDef, ground: Ground, st: MapStyle): BufferGeometry | null {
  const shapes = buildTerrain(map).shapes;
  const cross = crossers(shapes);
  const groves = shapes.filter((s) => s.kind === 'grove');
  const W = map.size;
  const L = map.length ?? map.size;
  const river = map.terraces?.river ?? 0;
  const parts: Part[] = [];
  const clear = (x: number, y: number, pad: number): boolean =>
    x > 30 &&
    y > 30 &&
    x < W - 30 &&
    y < L - 30 &&
    Math.abs(y - L / 2) >= river + 12 &&
    !shapes.some((s) => shapeDist(s, x, y) < pad);
  const world = (x: number, y: number, lift: number): [number, number, number] => [
    x - W / 2,
    ground.atSim(x, y) + lift,
    y - L / 2,
  ];
  let n = 0;
  const PINE = 1.15;
  for (const gr of groves) {
    for (const off of st.pineRows) {
      const R = gr.r + off;
      const perim = ringLen(gr, R);
      for (let d = 0; d < perim; d += 34) {
        const [x, y] = ringPoint(gr, R, d);
        if (!clear(x, y, 14)) continue;
        const k = (0.8 + hash(n++) * 0.4) * PINE;
        const at = world(x, y, -2);
        const turn: [number, number, number] = [0, hash(n++) * Math.PI, 0];
        const dark = hash(n++) < 0.5;
        // open shapes: the trunk's ends and the cones' bases are never seen from above
        parts.push(
          { g: prism(3, 4, 12, 5, true), c: st.trunk, p: at, r: turn, s: k },
          {
            g: cone(17, 30, 6, true),
            c: dark ? st.pine[0] : st.pine[1],
            p: [at[0], at[1] + 9 * k, at[2]],
            r: turn,
            s: k,
          },
          {
            g: cone(12, 24, 6, true),
            c: dark ? st.pine[2] : st.pine[3],
            p: [at[0], at[1] + 26 * k, at[2]],
            r: turn,
            s: k,
          },
        );
      }
    }
    // b: a clipped hedge hugging the grove's edge, broken wherever a path crosses
    if (st.hedge) {
      const R = gr.r + 10;
      const perim = ringLen(gr, R);
      const step = 22;
      for (let d = 0; d < perim; d += step) {
        const [x0, y0] = ringPoint(gr, R, d);
        const [x1, y1] = ringPoint(gr, R, Math.min(perim, d + step));
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (!clear(x0, y0, 3) || !clear(x1, y1, 3) || !clear(mx, my, 3)) continue;
        if (cross.some((c) => shapeDist(c, mx, my) < 8)) continue;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const at = world(mx, my, 0);
        const rot: [number, number, number] = [0, Math.atan2(-(y1 - y0), x1 - x0), 0];
        parts.push(
          { g: box(len + 3, 24, 12), c: st.hedge[0], p: [at[0], at[1] + 12, at[2]], r: rot },
          { g: box(len + 3, 4, 9), c: st.hedge[1], p: [at[0], at[1] + 25, at[2]], r: rot },
        );
      }
    }
  }
  // gate arches: stone posts either side of each path into a grove, a lintel across
  for (const gt of groveGates(map)) {
    const span = gt.half + 10;
    const H = 58;
    const ax = gt.x + gt.nx * 10;
    const ay = gt.y + gt.ny * 10;
    const ends: [number, number][] = [
      [ax - gt.tx * span, ay - gt.ty * span],
      [ax + gt.tx * span, ay + gt.ty * span],
    ];
    const rot: [number, number, number] = [0, Math.atan2(-gt.ty, gt.tx), 0];
    let top = -Infinity;
    for (const [x, y] of ends) top = Math.max(top, ground.atSim(x, y));
    // posts with a capstone stand above the lintel, so the gate reads from straight above too
    for (const [x, y] of ends) {
      const at = world(x, y, 0);
      const h = top + H + 8 - at[1];
      parts.push(
        { g: box(20, h, 20), c: st.coping, p: [at[0], at[1] + h / 2, at[2]], r: rot },
        { g: box(26, 7, 26), c: st.coping, p: [at[0], top + H + 11, at[2]], r: rot },
        { g: box(26, 6, 26), c: st.copingDark, p: [at[0], at[1] + 3, at[2]], r: rot },
      );
    }
    const c = world(ax, ay, 0);
    parts.push(
      { g: box(span * 2 - 8, 11, 14), c: st.coping, p: [c[0], top + H - 4, c[2]], r: rot },
      { g: box(span * 2 - 8, 4, 10), c: st.copingDark, p: [c[0], top + H - 16, c[2]], r: rot },
    );
  }
  return parts.length ? merge(parts) : null;
}
