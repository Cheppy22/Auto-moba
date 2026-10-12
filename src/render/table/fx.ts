import {
  type Camera,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { drawStyleEmblem, STYLE_IDS, styleEmblemIndex } from '../emblems';
import { bolt, chip } from './models';
import { Crowd } from './crowd';

const _v = new Vector3();
const _c = new Color();
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _z = new Vector3(0, 0, 1);

interface Flight {
  from: Vector3;
  to: Vector3;
  color: Color;
  age: number;
  life: number;
  big: boolean;
}

/** Attacks in flight: faceted glowing bolts, one instanced draw call; they burst on arrival. */
export class Bolts {
  readonly crowd: Crowd;
  private readonly live: Flight[] = [];
  private readonly pool: Flight[] = [];

  constructor(
    mat: Material,
    private readonly chips: Chips,
  ) {
    this.crowd = new Crowd(bolt(), mat, 64, true);
  }

  fire(from: Vector3, to: Vector3, color: ColorRepresentation, big: boolean): void {
    if (this.live.length >= 64) return;
    const f = this.pool.pop() ?? {
      from: new Vector3(),
      to: new Vector3(),
      color: new Color(),
      age: 0,
      life: 0,
      big,
    };
    f.from.copy(from);
    f.to.copy(to);
    f.color.set(color);
    f.age = 0;
    f.life = Math.min(0.32, 0.08 + from.distanceTo(to) / 2400);
    f.big = big;
    this.live.push(f);
  }

  update(dt: number): void {
    const c = this.crowd;
    c.begin();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        this.chips.burst(f.to.x, f.to.y, f.to.z, f.color, f.big ? 7 : 3, f.big ? 1.4 : 0.8);
        this.live.splice(i, 1);
        this.pool.push(f);
        continue;
      }
      _v.lerpVectors(f.from, f.to, t);
      _v.y += Math.sin(t * Math.PI) * 10;
      _s.subVectors(f.to, f.from).normalize();
      _q.setFromUnitVectors(_z, _s);
      const w = f.big ? 9 : 6;
      _m.compose(_v, _q, _s.set(w, w, w * 3.2));
      c.color(c.addMatrix(_m), _c.copy(f.color).lerp(WHITE, 0.3));
    }
    c.end();
  }

  clear(): void {
    for (const f of this.live) this.pool.push(f);
    this.live.length = 0;
  }
}

const WHITE = new Color('#ffffff');

interface Bit {
  p: Vector3;
  v: Vector3;
  spin: number;
  rot: number;
  size: number;
  age: number;
  life: number;
  color: Color;
  /** Gravity factor: 1 falls and bounces, 0 drifts, negative floats up. */
  g: number;
}

/** Faceted chips: hits, captures and falling buildings. One instanced draw call. */
export class Chips {
  readonly crowd: Crowd;
  private readonly live: Bit[] = [];
  private readonly pool: Bit[] = [];
  private seed = 1;
  /** Floor height under a world point (chips bounce on it); flat by default. */
  ground: ((x: number, z: number) => number) | null = null;

  constructor(mat: Material) {
    this.crowd = new Crowd(chip(), mat, 220, true);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  burst(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    n: number,
    power = 1,
    size = 4,
  ): void {
    for (let i = 0; i < n && this.live.length < 220; i++) {
      const b = this.pool.pop() ?? {
        p: new Vector3(),
        v: new Vector3(),
        spin: 0,
        rot: 0,
        size: 1,
        age: 0,
        life: 1,
        color: new Color(),
        g: 1,
      };
      b.g = 1;
      const a = this.rnd() * Math.PI * 2;
      const out = (40 + this.rnd() * 90) * power;
      b.p.set(x, y, z);
      b.v.set(Math.cos(a) * out, (90 + this.rnd() * 140) * power, Math.sin(a) * out);
      b.spin = (this.rnd() - 0.5) * 18;
      b.rot = this.rnd() * 6;
      b.size = size * (0.6 + this.rnd() * 0.8) * Math.sqrt(power);
      b.age = 0;
      b.life = 0.6 + this.rnd() * 0.5;
      b.color.set(color);
      this.live.push(b);
    }
  }

  /** Shards that float up from a standing piece and shrink away (a piece beaming out). */
  rise(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    n: number,
    spread: number,
    size = 4,
  ): void {
    for (let i = 0; i < n && this.live.length < 220; i++) {
      const b = this.take();
      const a = this.rnd() * Math.PI * 2;
      const r = this.rnd() * spread;
      b.p.set(x + Math.cos(a) * r, y + this.rnd() * spread * 1.4, z + Math.sin(a) * r);
      b.v.set(0, 90 + this.rnd() * 120, 0);
      b.g = -0.15;
      this.finish(b, color, size, 0.55 + this.rnd() * 0.3);
    }
  }

  /** Shards that fly in from around a point and shrink into it (a piece assembling). */
  gather(
    x: number,
    y: number,
    z: number,
    color: ColorRepresentation,
    n: number,
    radius: number,
    size = 4,
  ): void {
    for (let i = 0; i < n && this.live.length < 220; i++) {
      const b = this.take();
      const a = this.rnd() * Math.PI * 2;
      const r = radius * (0.6 + this.rnd() * 0.5);
      const life = 0.4 + this.rnd() * 0.15;
      b.p.set(x + Math.cos(a) * r, y + (this.rnd() - 0.2) * radius * 0.9, z + Math.sin(a) * r);
      b.v.set(x - b.p.x, y - b.p.y, z - b.p.z).multiplyScalar(1 / life);
      b.g = 0;
      this.finish(b, color, size, life);
    }
  }

  private take(): Bit {
    return (
      this.pool.pop() ?? {
        p: new Vector3(),
        v: new Vector3(),
        spin: 0,
        rot: 0,
        size: 1,
        age: 0,
        life: 1,
        color: new Color(),
        g: 1,
      }
    );
  }

  private finish(b: Bit, color: ColorRepresentation, size: number, life: number): void {
    b.spin = (this.rnd() - 0.5) * 14;
    b.rot = this.rnd() * 6;
    b.size = size * (0.6 + this.rnd() * 0.8);
    b.age = 0;
    b.life = life;
    b.color.set(color);
    this.live.push(b);
  }

  update(dt: number): void {
    const c = this.crowd;
    c.begin();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.live.splice(i, 1);
        this.pool.push(b);
        continue;
      }
      b.v.y -= 620 * dt * b.g;
      b.p.addScaledVector(b.v, dt);
      const floor = this.ground ? this.ground(b.p.x, b.p.z) + 1 : 1;
      if (b.g > 0 && b.p.y < floor) {
        b.p.y = floor;
        b.v.y *= -0.3;
        b.v.x *= 0.6;
        b.v.z *= 0.6;
      }
      b.rot += b.spin * dt;
      const k = 1 - Math.max(0, (b.age - b.life * 0.6) / (b.life * 0.4));
      const idx = c.add(b.p.x, b.p.y, b.p.z, b.rot, b.size * k, b.rot * 0.7, b.rot * 0.4);
      c.color(idx, b.color);
    }
    c.end();
  }

  clear(): void {
    for (const b of this.live) this.pool.push(b);
    this.live.length = 0;
  }
}

/**
 * Atlas: rows 0-2 numerals 1-8 on White, Black and fork-gold plates; rows 3-4 the 16 emblems;
 * row 5 the high-ground eye.
 */
const CELL = 64;
const COLS = 8;
const ROWS = 6;
const EYE = 5 * COLS;

function atlas(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * COLS;
  c.height = CELL * ROWS;
  const g = c.getContext('2d')!;
  const plates = [
    { fill: '#efe6d2', ring: '#c9a35a', ink: '#14110e' },
    { fill: '#23212a', ring: '#c3ccd8', ink: '#eef2fa' },
    { fill: '#f0c55a', ring: '#fff4cc', ink: '#14110e' },
  ];
  plates.forEach((pl, row) => {
    for (let i = 0; i < 8; i++) {
      const cx = i * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      g.fillStyle = '#0c0907';
      g.beginPath();
      g.arc(cx, cy, CELL * 0.47, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.ring;
      g.beginPath();
      g.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.fill;
      g.beginPath();
      g.arc(cx, cy, CELL * 0.34, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.ink;
      g.font = `bold ${Math.round(CELL * 0.5)}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), cx, cy + CELL * 0.03);
    }
  });
  for (let i = 0; i <= STYLE_IDS.length; i++) {
    const col = i % COLS;
    const row = 3 + Math.floor(i / COLS);
    drawStyleEmblem(g, i < STYLE_IDS.length ? STYLE_IDS[i] : null, CELL * 0.94, {
      x: col * CELL + CELL / 2,
      y: row * CELL + CELL / 2,
    });
  }
  eye(g, (EYE % COLS) * CELL + CELL / 2, Math.floor(EYE / COLS) * CELL + CELL / 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * The high-ground badge: an ivory eye on a dark round badge with a gold ring (the board's
 * medallion family) and a soft light halo, so it reads on any ground at phone size.
 */
function eye(g: CanvasRenderingContext2D, cx: number, cy: number): void {
  const halo = g.createRadialGradient(cx, cy, CELL * 0.36, cx, cy, CELL * 0.49);
  halo.addColorStop(0, 'rgba(255,236,190,0.6)');
  halo.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(cx, cy, CELL * 0.49, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0c0907';
  g.beginPath();
  g.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f0c55a';
  g.lineWidth = CELL * 0.06;
  g.beginPath();
  g.arc(cx, cy, CELL * 0.35, 0, Math.PI * 2);
  g.stroke();
  const w = CELL * 0.27;
  const h = CELL * 0.24;
  const almond = (): void => {
    g.beginPath();
    g.moveTo(cx - w, cy);
    g.quadraticCurveTo(cx, cy - h, cx + w, cy);
    g.quadraticCurveTo(cx, cy + h, cx - w, cy);
    g.closePath();
  };
  almond();
  g.fillStyle = '#fbf3e0';
  g.fill();
  g.save();
  almond();
  g.clip();
  g.fillStyle = '#d99a2b';
  g.beginPath();
  g.arc(cx, cy, CELL * 0.105, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0c0907';
  g.beginPath();
  g.arc(cx, cy, CELL * 0.05, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Camera-facing badges: at most a rank numeral on each piece's base, emblems only when leaning in. */
export class Tags {
  readonly mesh: InstancedMesh;
  private readonly cell: InstancedBufferAttribute;
  private readonly tex: CanvasTexture;
  private readonly quat = new Quaternion();
  private n = 0;

  constructor(private readonly cap = 48) {
    this.tex = atlas();
    const geo = new PlaneGeometry(1, 1);
    this.cell = new InstancedBufferAttribute(new Float32Array(cap), 1);
    this.cell.setUsage(DynamicDrawUsage);
    geo.setAttribute('aCell', this.cell);
    const mat = new MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute float aCell;\n' +
        shader.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
vMapUv = (uv + vec2(mod(aCell, ${COLS}.0), ${ROWS - 1}.0 - floor(aCell / ${COLS}.0))) / vec2(${COLS}.0, ${ROWS}.0);`,
        );
    };
    mat.customProgramCacheKey = () => 'table-tags';
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 60;
    this.mesh.count = 0;
  }

  begin(cam: Camera): void {
    this.n = 0;
    this.quat.copy(cam.quaternion);
  }

  private put(x: number, y: number, z: number, size: number, cell: number): void {
    if (this.n >= this.cap) return;
    _m.compose(_v.set(x, y, z), this.quat, _s.set(size, size, size));
    this.mesh.setMatrixAt(this.n, _m);
    this.cell.setX(this.n, cell);
    this.n++;
  }

  rank(
    x: number,
    y: number,
    z: number,
    size: number,
    rank: number,
    team: 'A' | 'B',
    fork: boolean,
  ): void {
    const r = Math.max(1, Math.min(8, Math.round(rank))) - 1;
    this.put(x, y, z, size, (fork ? 2 : team === 'A' ? 0 : 1) * COLS + r);
  }

  emblem(x: number, y: number, z: number, size: number, style: string | null): void {
    this.put(x, y, z, size, 3 * COLS + styleEmblemIndex(style));
  }

  /** The high-ground eye above a piece's health bar. */
  eye(x: number, y: number, z: number, size: number): void {
    this.put(x, y, z, size, EYE);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cell.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
