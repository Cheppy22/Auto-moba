import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LinearMipmapLinearFilter,
  Mesh,
  MeshToonMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Uint32BufferAttribute,
  Vector2,
} from 'three';
import { buildTerrain, type Content, type Terrain, type WalkShape } from '../../sim';
import { PALETTE } from '../theme';
import type { Kit } from './kit';
import { rand01 } from './kit';

const TAU = Math.PI * 2;

/** Radius of the floating island (world units); everything beyond falls away into the void. */
export const ISLAND_R = 700;
/** Height of the river surface. Ground that dips below it is wet; fords are a few units under. */
export const WATER_Y = -2.6;
/** Half width of the heightfield square (world units) and its cell count. */
const E = 708;
const N = 236;
const STEP = (2 * E) / N;
const W1 = N + 1;
/** Distances to the walkable edge are only tracked this far; the massif tops out before then. */
const D_CAP = 140;
/** The cliff foot starts this far beyond the walkable edge, so a unit at the edge never clips rock. */
const SHOULDER = 5;
const RIVER_CORE = 20;
const FALL_START = 664;
const FALL_Y = -36;
const SQRT1_2 = Math.SQRT1_2;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function lattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, seed);
  const b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed);
  const d = lattice(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, y, seed + o * 17) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** The field the view is currently showing, so `heightAt` can be called from anywhere. */
let active: TerrainField | null = null;

function register(field: TerrainField): void {
  active = field;
}

/** Ground height at a sim point (0..map size on both axes). 0 when no view exists yet. */
export function heightAt(simX: number, simY: number): number {
  return active ? active.heightAt(simX, simY) : 0;
}

interface SlotDef {
  x: number;
  y: number;
  radius: number;
  lift: number;
}

/**
 * The shape of the world as numbers: one heightfield over the whole island (walkable ground, rock
 * massifs, the river) built from the same capsules the sim keeps units inside. Mesh, scenery,
 * water and every unit read heights from here.
 */
export class TerrainField {
  readonly half: number;
  readonly shapes: WalkShape[];
  readonly h = new Float32Array(W1 * W1);
  readonly d = new Float32Array(W1 * W1);
  private readonly t: Terrain;
  private readonly bases: [number, number][];
  private readonly slots: SlotDef[];
  private readonly shops: { x: number; y: number }[];

  constructor(content: Content) {
    const map = content.map;
    this.half = map.size / 2;
    this.t = buildTerrain(map);
    this.shapes = this.t.shapes;
    this.bases = [map.bases.A, map.bases.B].map((b) => [b[0], b[1]] as [number, number]);
    this.slots = map.slots.map((s) => ({
      x: s.x,
      y: s.y,
      radius: s.radius + map.walk.slotPad,
      lift: s.openPhase <= 1 ? 4 : s.openPhase === 2 ? 11 : -7,
    }));
    this.shops = map.shops.map((s) => ({ x: s.x, y: s.y }));
    this.bake();
    register(this);
  }

  dispose(): void {
    if (active === this) active = null;
  }

  /** Signed distance to the nearest walkable shape (negative inside), capped at D_CAP. */
  sdf(x: number, y: number): number {
    const t = this.t;
    const c = Math.floor(x / t.cell);
    const r = Math.floor(y / t.cell);
    let best = D_CAP;
    const shapes = t.shapes;
    if (c >= 0 && r >= 0 && c < t.cols && r < t.cols) {
      const list = t.cells[r * t.cols + c];
      for (let i = 0; i < list.length; i++) {
        const s = shapes[list[i]];
        const dx = s.bx - s.ax;
        const dy = s.by - s.ay;
        const l2 = dx * dx + dy * dy;
        let f = l2 === 0 ? 0 : ((x - s.ax) * dx + (y - s.ay) * dy) / l2;
        f = f < 0 ? 0 : f > 1 ? 1 : f;
        const px = x - (s.ax + dx * f);
        const py = y - (s.ay + dy * f);
        const dd = Math.sqrt(px * px + py * py) - s.r;
        if (dd < best) best = dd;
      }
      return best;
    }
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy;
      let f = l2 === 0 ? 0 : ((x - s.ax) * dx + (y - s.ay) * dy) / l2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const px = x - (s.ax + dx * f);
      const py = y - (s.ay + dy * f);
      const dd = Math.sqrt(px * px + py * py) - s.r;
      if (dd < best) best = dd;
    }
    return best;
  }

  /** Lateral offset of the river's centre line (along the (1,-1) axis) at distance s along it. */
  riverCenter(s: number): number {
    return 12 * Math.sin(s * 0.0105 + 0.7) + 6 * Math.sin(s * 0.026 + 2.3);
  }

  /** Distance from the river's centre line. */
  riverDist(x: number, y: number): number {
    const a = (x - y) * SQRT1_2;
    const s = (x + y - 2 * this.half) * SQRT1_2;
    return Math.abs(a - this.riverCenter(s));
  }

  /** Walkable-ground elevation, defined everywhere so cliffs can grow out of it. */
  private ground(x: number, y: number): number {
    let g = 0;
    for (const [bx, by] of this.bases) {
      const r = Math.hypot(x - bx, y - by);
      // a terraced dais: 20 on top, 14, then 8, then the land falls away towards the lanes
      g = Math.max(
        g,
        8 * (1 - smooth(96, 340, r)) + 6 * (1 - smooth(78, 88, r)) + 6 * (1 - smooth(50, 60, r)),
      );
    }
    const rc = Math.hypot(x - this.half, y - this.half);
    g -= 3.4 * Math.exp(-((rc / 240) * (rc / 240)));
    // gentle rolls, mirrored across the river so the two halves feel alike
    const a = fbm(x * 0.011, y * 0.011, 3, 2);
    const b = fbm(y * 0.011, x * 0.011, 3, 2);
    g += (a + b - 1) * 6.5;
    for (const s of this.slots) {
      const r = Math.hypot(x - s.x, y - s.y);
      g += s.lift * (1 - smooth(s.radius + 4, s.radius + 92, r));
    }
    for (const s of this.shops) {
      const r = Math.hypot(x - s.x, y - s.y);
      g += 7 * (1 - smooth(60, 108, r));
    }
    // the river: a shallow bed at a fixed depth under the water, banks easing up to the land
    const rr = this.riverDist(x, y);
    const bed = WATER_Y - 3 + (vnoise(x * 0.05, y * 0.05, 8) - 0.5) * 1.2;
    const t = smooth(RIVER_CORE, RIVER_CORE + 46, rr);
    return Math.min(g, bed + (g - bed) * t);
  }

  /** Rock massif height at a point `d` units from walkable ground (stepped ledges, noise-varied). */
  private massif(x: number, y: number, d: number): number {
    const de = d - SHOULDER;
    if (de <= 0) return 0;
    const rr = this.riverDist(x, y);
    const gorge = smooth(RIVER_CORE + 8, RIVER_CORE + 96, rr);
    const n1 = fbm(x * 0.0055, y * 0.0055, 11, 3);
    const top = 34 + 44 * smooth(0.3, 0.7, n1);
    const n2 = vnoise(x * 0.018, y * 0.018, 5);
    const k1 = 14 + 10 * n2;
    const k2 = 48 + 24 * n2;
    const k3 = 104 + 34 * n2;
    let h =
      top * 0.4 * smooth(0, 6.5, de) +
      top * 0.27 * smooth(k1, k1 + 8, de) +
      top * 0.21 * smooth(k2, k2 + 9, de) +
      top * 0.12 * smooth(k3, k3 + 12, de);
    h += (fbm(x * 0.045, y * 0.045, 23, 2) - 0.5) * 9 * smooth(6, 20, de);
    return h * gorge;
  }

  private bake(): void {
    const half = this.half;
    for (let j = 0; j < W1; j++) {
      for (let i = 0; i < W1; i++) {
        const wx = -E + i * STEP;
        const wz = -E + j * STEP;
        const r = Math.hypot(wx, wz);
        if (r > ISLAND_R + STEP * 1.5) {
          this.d[j * W1 + i] = D_CAP;
          this.h[j * W1 + i] = FALL_Y;
          continue;
        }
        const x = wx + half;
        const y = wz + half;
        const d = this.sdf(x, y);
        let height = this.ground(x, y) + this.massif(x, y, d);
        if (r > FALL_START - 30)
          height += 12 * smooth(2, 12, d) * smooth(FALL_START - 36, FALL_START - 14, r);
        if (r > FALL_START) height = lerp(height, FALL_Y, smooth(FALL_START, ISLAND_R, r));
        this.d[j * W1 + i] = d;
        this.h[j * W1 + i] = r > ISLAND_R ? FALL_Y : height;
      }
    }
  }

  /** Height at world (x, z), interpolated exactly like the rendered triangles. */
  heightW(wx: number, wz: number): number {
    const fx = (wx + E) / STEP;
    const fz = (wz + E) / STEP;
    if (fx <= 0 || fz <= 0 || fx >= N || fz >= N) return FALL_Y;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * W1 + i;
    const h = this.h;
    if (u + v <= 1) return h[k] + (h[k + 1] - h[k]) * u + (h[k + W1] - h[k]) * v;
    return (
      h[k + W1 + 1] + (h[k + W1] - h[k + W1 + 1]) * (1 - u) + (h[k + 1] - h[k + W1 + 1]) * (1 - v)
    );
  }

  heightAt(simX: number, simY: number): number {
    return this.heightW(simX - this.half, simY - this.half);
  }

  /** Height of whatever you would see at this point: the ground, or the river surface over it. */
  surfaceAt(simX: number, simY: number): number {
    return Math.max(this.heightAt(simX, simY), WATER_Y);
  }

  surfaceW(wx: number, wz: number): number {
    return Math.max(this.heightW(wx, wz), WATER_Y);
  }

  /** Walkable-edge distance from the baked grid (negative inside), for painting and scattering. */
  sdfAt(simX: number, simY: number): number {
    const fx = (simX - this.half + E) / STEP;
    const fz = (simY - this.half + E) / STEP;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return D_CAP;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * W1 + i;
    const d = this.d;
    return lerp(lerp(d[k], d[k + 1], u), lerp(d[k + W1], d[k + W1 + 1], u), v);
  }

  /**
   * The playfield's convex outline in scene space (walkable ground plus headroom for units), for
   * framing the camera. Few points, so it is cheap to test every frame the view changes.
   */
  outline(): { x: number; y: number; z: number }[] {
    const pts: [number, number][] = [];
    for (const s of this.shapes) {
      for (const [cx, cy] of [
        [s.ax, s.ay],
        [s.bx, s.by],
      ]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          pts.push([cx + Math.cos(a) * s.r, cy + Math.sin(a) * s.r]);
        }
      }
    }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]): number =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const hull: [number, number][] = [];
    for (const half of [0, 1]) {
      const start = hull.length;
      const list = half === 0 ? pts : [...pts].reverse();
      for (const p of list) {
        while (
          hull.length >= start + 2 &&
          cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
        )
          hull.pop();
        hull.push(p);
      }
      hull.pop();
    }
    return hull.map(([x, y]) => ({
      x: x - this.half,
      y: Math.max(this.heightAt(x, y), WATER_Y) + 40,
      z: y - this.half,
    }));
  }

  /** Steepness (rise over run) at a sim point. */
  slopeAt(simX: number, simY: number): number {
    const e = 4;
    const dx = this.heightAt(simX + e, simY) - this.heightAt(simX - e, simY);
    const dy = this.heightAt(simX, simY + e) - this.heightAt(simX, simY - e);
    return Math.hypot(dx, dy) / (2 * e);
  }
}

/* -------------------------------------------------------------------------- */
/* Painting                                                                    */
/* -------------------------------------------------------------------------- */

const LANE_TINT: Record<string, string> = { top: '#78bec8', mid: '#e0a93e', bot: '#c878aa' };
const FLOOR: Record<string, string> = {
  lane: '#4a4260',
  base: '#3a3050',
  slot: '#3c3650',
  port: '#43394f',
  shop: '#4a3f52',
  spot: '#4a4260',
};

function rockTexture(): CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const wrapNoise = (u: number, v: number, fx: number, fy: number, seed: number): number => {
    const x = u * fx;
    const y = v * fy;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = x - ix;
    const sy = y - iy;
    const a = lattice(ix % fx, iy % fy, seed);
    const b = lattice((ix + 1) % fx, iy % fy, seed);
    const cc = lattice(ix % fx, (iy + 1) % fy, seed);
    const dd = lattice((ix + 1) % fx, (iy + 1) % fy, seed);
    const uu = sx * sx * (3 - 2 * sx);
    const vv = sy * sy * (3 - 2 * sy);
    return lerp(lerp(a, b, uu), lerp(cc, dd, uu), vv);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const strata = wrapNoise(u, v, 3, 22, 1);
      const fine = wrapNoise(u, v, 24, 24, 2);
      const crack = wrapNoise(u, v, 10, 3, 3);
      let val = 0.5 + (strata - 0.5) * 0.62 + (fine - 0.5) * 0.28;
      if (crack > 0.66 && fine > 0.45) val -= 0.16;
      val = clamp(val, 0, 1);
      const o = (y * S + x) * 4;
      img.data[o] = lerp(50, 128, val);
      img.data[o + 1] = lerp(50, 124, val);
      img.data[o + 2] = lerp(64, 142, val);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** The cliff and ground look: painted ground (`map`) on flat land, striated rock on steep faces. */
function terrainMaterial(kit: Kit, map: CanvasTexture, rock: CanvasTexture): MeshToonMaterial {
  const m = new MeshToonMaterial({ map, vertexColors: true, gradientMap: kit.gradient });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRock = { value: rock };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nattribute float aWet;\nvarying float vWet;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWP = position;\nvWN = normal;\nvWet = aWet;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vWet;\nuniform sampler2D uRock;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float up = clamp(normalize(vWN).y, 0.0, 1.0);
  float steep = smoothstep(0.86, 0.6, up);
  vec3 an = pow(abs(normalize(vWN)), vec3(4.0));
  an /= (an.x + an.y + an.z);
  vec3 rx = texture2D(uRock, vWP.zy * 0.011).rgb;
  vec3 ry = texture2D(uRock, vWP.xz * 0.011 + 0.31).rgb;
  vec3 rz = texture2D(uRock, vWP.xy * 0.011 + 0.67).rgb;
  vec3 rock = rx * an.x + ry * an.y + rz * an.z;
  float hh = clamp(vWP.y / 78.0, 0.0, 1.0);
  rock *= mix(vec3(0.6, 0.6, 0.74), vec3(1.1, 1.05, 0.98), hh);
  diffuseColor.rgb = mix(diffuseColor.rgb, rock, steep);
  diffuseColor.rgb *= mix(1.0, 0.55, vWet);
  diffuseColor.rgb += vec3(0.0, 0.025, 0.05) * vWet;
}`,
      );
  };
  m.customProgramCacheKey = () => 'terrain-toon';
  return m;
}

/**
 * The heightfield mesh plus its painted ground. Slot clearings repaint their floor when they open
 * (`setSlotArt`); nothing else changes after construction.
 */
export class TerrainView {
  readonly group = new Group();
  readonly field: TerrainField;
  private readonly kit: Kit;
  private readonly content: Content;
  private readonly size = 2048;
  private readonly base: HTMLCanvasElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly tex: CanvasTexture;
  private readonly rock: CanvasTexture;
  private readonly mesh: Mesh;
  private readonly arts = new Map<string, HTMLCanvasElement>();
  private readonly owned: { dispose(): void }[] = [];
  private dirty = false;

  constructor(kit: Kit, content: Content, shadows: boolean) {
    this.kit = kit;
    this.content = content;
    this.field = new TerrainField(content);
    this.base = this.paintBase();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.minFilter = LinearMipmapLinearFilter;
    this.rock = rockTexture();
    this.repaint();
    const geo = this.buildGeometry();
    const mat = terrainMaterial(kit, this.tex, this.rock);
    this.mesh = new Mesh(geo, mat);
    this.mesh.receiveShadow = shadows;
    this.mesh.castShadow = shadows;
    this.group.add(this.mesh, this.buildUnderside());
    this.owned.push(geo, mat, this.tex, this.rock);
  }

  /** Sim point to canvas pixel transform, applied to a 2D context. */
  private frame(g: CanvasRenderingContext2D): void {
    const k = this.size / (2 * E);
    const o = (E - this.field.half) * k;
    g.setTransform(k, 0, 0, k, o, o);
  }

  private paintBase(): HTMLCanvasElement {
    const f = this.field;
    const half = f.half;
    const c = document.createElement('canvas');
    c.width = this.size;
    c.height = this.size;
    const g = c.getContext('2d')!;
    this.frame(g);
    const lo = half - E;
    let seed = 90210;
    const rnd = (): number => rand01(seed++);

    // rock tops: mossy slate with lichen and strata scratches
    g.fillStyle = '#292c37';
    g.fillRect(lo, lo, E * 2, E * 2);
    for (let i = 0; i < 260; i++) {
      const x = lo + rnd() * E * 2;
      const y = lo + rnd() * E * 2;
      const r = 26 + rnd() * 110;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const kind = rnd();
      gr.addColorStop(
        0,
        kind < 0.58
          ? 'rgba(62,104,82,0.36)'
          : kind < 0.72
            ? 'rgba(96,84,128,0.2)'
            : 'rgba(10,8,18,0.34)',
      );
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const x = lo + rnd() * E * 2;
      const y = lo + rnd() * E * 2;
      const len = 8 + rnd() * 30;
      const a = -0.3 + rnd() * 0.6;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(210,200,235,0.05)' : 'rgba(0,0,0,0.12)';
      g.lineWidth = 0.8 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    for (let i = 0; i < 5200; i++) {
      const x = lo + rnd() * E * 2;
      const y = lo + rnd() * E * 2;
      const kind = rnd();
      g.fillStyle =
        kind < 0.55
          ? 'rgba(104,150,112,0.26)'
          : kind < 0.93
            ? 'rgba(170,160,196,0.16)'
            : 'rgba(224,169,62,0.34)';
      g.beginPath();
      g.ellipse(x, y, 0.8 + rnd() * 1.8, 0.6 + rnd() * 1.2, rnd() * 3, 0, TAU);
      g.fill();
    }

    // river banks: wet pebbles either side of the water
    g.strokeStyle = 'rgba(96,110,150,0.22)';
    g.lineJoin = 'round';
    for (const [w, a] of [
      [150, 0.1],
      [104, 0.16],
      [66, 0.24],
    ] as const) {
      g.lineWidth = w;
      g.strokeStyle = `rgba(88,104,142,${a})`;
      g.beginPath();
      for (let s = -ISLAND_R; s <= ISLAND_R; s += 24) {
        const a0 = f.riverCenter(s);
        const x = half + (s + a0) * SQRT1_2;
        const y = half + (s - a0) * SQRT1_2;
        if (s === -ISLAND_R) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }

    // shadowed foot of the cliffs, then the walkable floor on top (capsule union, exact edges)
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const stroke = (s: WalkShape, width: number, style: string): void => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
    };
    for (const s of f.shapes) stroke(s, (s.r + SHOULDER + 5) * 2, 'rgba(8,6,14,0.55)');
    for (const s of f.shapes) stroke(s, (s.r + SHOULDER) * 2, '#17131f');
    for (const s of f.shapes) stroke(s, s.r * 2, FLOOR[s.kind] ?? FLOOR.lane);

    // floor speckle: only where the ground really is walkable
    seed = 5150;
    for (let i = 0; i < 16000; i++) {
      const x = rnd() * 1000;
      const y = rnd() * 1000;
      if (f.sdfAt(x, y) > -5) continue;
      const kind = rnd();
      g.fillStyle =
        kind < 0.4
          ? 'rgba(0,0,0,0.2)'
          : kind < 0.86
            ? 'rgba(190,176,214,0.12)'
            : kind < 0.95
              ? 'rgba(110,150,118,0.2)'
              : 'rgba(224,169,62,0.28)';
      g.beginPath();
      g.ellipse(x, y, 0.8 + rnd() * 2.6, 0.6 + rnd() * 1.6, rnd() * 3, 0, TAU);
      g.fill();
    }

    // lane wear: a lighter track with the lane's own colour as a faint dashed line
    const lanes = this.content.map.lanes;
    for (const id of ['top', 'mid', 'bot'] as const) {
      const pts = lanes[id];
      const trace = (): void => {
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      };
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = LANE_TINT[id] + '26';
      g.lineWidth = 56;
      trace();
      g.stroke();
      g.strokeStyle = 'rgba(150,134,184,0.2)';
      g.lineWidth = 44;
      trace();
      g.stroke();
      g.strokeStyle = 'rgba(196,182,222,0.16)';
      g.lineWidth = 22;
      trace();
      g.stroke();
      g.setLineDash([9, 13]);
      g.lineCap = 'butt';
      g.strokeStyle = LANE_TINT[id] + 'aa';
      g.lineWidth = 1.7;
      trace();
      g.stroke();
      g.setLineDash([]);
    }
    // path stones along the lanes
    seed = 777;
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 1000;
      const y = rnd() * 1000;
      const d = f.sdfAt(x, y);
      if (d > -14 || d < -34) continue;
      g.fillStyle = rnd() < 0.5 ? 'rgba(206,196,226,0.15)' : 'rgba(6,4,10,0.26)';
      g.beginPath();
      g.ellipse(x, y, 1.4 + rnd() * 2.8, 1 + rnd() * 1.8, rnd() * 3, 0, TAU);
      g.fill();
    }

    // port and shop paths get a darker beaten-earth centre line
    g.lineCap = 'round';
    for (const s of f.shapes) {
      if (s.kind !== 'port') continue;
      stroke(s, 15, 'rgba(24,18,30,0.5)');
      stroke(s, 7, 'rgba(120,104,140,0.2)');
    }

    // bases: low-contrast checkerboard under a seal, matching the terraces
    for (const team of ['A', 'B'] as const) {
      const [bx, by] = this.content.map.bases[team];
      const col = team === 'A' ? PALETTE.teamA : PALETTE.teamB;
      g.save();
      g.beginPath();
      g.arc(bx, by, this.content.map.walk.base - 1, 0, TAU);
      g.clip();
      g.translate(bx, by);
      g.rotate(Math.PI / 4);
      const t = 15;
      for (let i = -10; i <= 10; i++) {
        for (let j = -10; j <= 10; j++) {
          g.fillStyle = (i + j) & 1 ? '#43324a' : '#241b2e';
          g.fillRect(i * t, j * t, t, t);
        }
      }
      g.restore();
      g.lineWidth = 1.6;
      for (const [r, a] of [
        [103, 0.55],
        [86, 0.5],
        [57, 0.5],
        [46, 0.4],
      ] as const) {
        g.strokeStyle = col + Math.round(a * 255).toString(16);
        g.beginPath();
        g.arc(bx, by, r, 0, TAU);
        g.stroke();
      }
      g.fillStyle = col + '30';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath();
        g.arc(bx + Math.cos(a) * 95, by + Math.sin(a) * 95, i % 6 === 0 ? 2.6 : 1.4, 0, TAU);
        g.fill();
      }
    }
    // shops: a brass-ringed plaza
    for (const s of this.content.map.shops) {
      g.fillStyle = 'rgba(30,22,36,0.5)';
      g.beginPath();
      g.arc(s.x, s.y, s.radius, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(200,150,60,0.4)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(s.x, s.y, s.radius, 0, TAU);
      g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  /** Paints a clearing's floor (its biome, or the sealed look). `art` spans 2.6 radii. */
  setSlotArt(slotId: string, art: HTMLCanvasElement | null): void {
    if (art) this.arts.set(slotId, art);
    else this.arts.delete(slotId);
    this.dirty = true;
  }

  /** Uploads any changed clearing floors to the GPU (call once after a batch of `setSlotArt`). */
  flush(): void {
    if (this.dirty) this.repaint();
  }

  private repaint(): void {
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.base, 0, 0);
    this.frame(g);
    for (const s of this.content.map.slots) {
      const art = this.arts.get(s.id);
      if (!art) continue;
      const r = s.radius * 1.3;
      g.drawImage(art, s.x - r, s.y - r, r * 2, r * 2);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  private buildGeometry(): BufferGeometry {
    const f = this.field;
    const n = W1 * W1;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    const rad = new Float32Array(n);
    const wet = new Float32Array(n);
    const h = f.h;
    for (let j = 0; j < W1; j++) {
      for (let i = 0; i < W1; i++) {
        const k = j * W1 + i;
        const wx = -E + i * STEP;
        const wz = -E + j * STEP;
        const r = Math.hypot(wx, wz);
        rad[k] = r;
        const sx0 = wx + f.half;
        const sy0 = wz + f.half;
        wet[k] =
          (1 - smooth(RIVER_CORE + 6, RIVER_CORE + 54, f.riverDist(sx0, sy0))) *
          smooth(WATER_Y + 2.4, WATER_Y + 0.4, h[k]);
        const s = r > ISLAND_R ? ISLAND_R / r : 1;
        pos[k * 3] = wx * s;
        pos[k * 3 + 1] = h[k];
        pos[k * 3 + 2] = wz * s;
        uv[k * 2] = (wx * s + E) / (2 * E);
        uv[k * 2 + 1] = 1 - (wz * s + E) / (2 * E);
        // baked occlusion: hollows and cliff feet darker, ledge edges a touch lighter
        const hi = (a: number, b: number): number => h[clamp(b, 0, N) * W1 + clamp(a, 0, N)];
        const avg = (hi(i - 2, j) + hi(i + 2, j) + hi(i, j - 2) + hi(i, j + 2)) / 4;
        const diff = avg - h[k];
        const ao = 1 - 0.5 * clamp(diff / 11, 0, 1) + 0.12 * clamp(-diff / 9, 0, 1);
        const edge = 1 - 0.35 * smooth(FALL_START - 10, ISLAND_R, r);
        const v = ao * edge;
        col[k * 3] = v;
        col[k * 3 + 1] = v;
        col[k * 3 + 2] = v * 1.02;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * W1 + i;
        const b = a + 1;
        const c = a + W1;
        const d = c + 1;
        if (Math.min(rad[a], rad[b], rad[c], rad[d]) > ISLAND_R) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    geo.setAttribute('aWet', new Float32BufferAttribute(wet, 1));
    geo.setIndex(new Uint32BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /** The underside of the floating island: a faceted spire hanging into the void. */
  private buildUnderside(): Mesh {
    const prof: [number, number][] = [
      [ISLAND_R, FALL_Y],
      [ISLAND_R - 34, -84],
      [560, -150],
      [450, -222],
      [340, -300],
      [230, -372],
      [130, -450],
      [48, -526],
      [0, -570],
    ];
    const under = new LatheGeometry(
      prof.map(([r, y]) => new Vector2(r, y)),
      44,
    );
    const p = under.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      const a = Math.atan2(z, x);
      const j = 0.92 + 0.05 * Math.sin(a * 7 + y * 0.03) + 0.035 * Math.sin(a * 13 - y * 0.05);
      const edge = y > FALL_Y + 1 ? 1 : j;
      p.setXYZ(i, x * edge, y + (y > FALL_Y + 1 ? 0 : Math.sin(a * 5 + y * 0.02) * 10), z * edge);
    }
    const faceted = under.toNonIndexed();
    under.dispose();
    faceted.computeVertexNormals();
    this.owned.push(faceted);
    return new Mesh(faceted, this.kit.toon(new Color('#241f2e')));
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.field.dispose();
  }
}
