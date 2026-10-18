import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  DataTexture,
  DoubleSide,
  FrontSide,
  type Side,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RedFormat,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INK = '#0b0a0f';
export const STONE = '#5b5569';
export const STONE_DARK = '#3b3647';
export const BRASS = '#c8963c';
export const LACQUER = '#2a1c24';
export const PAPER = '#ece2cc';
export const SKIN = '#e4d3b4';

const TAU = Math.PI * 2;

type Disposable = { dispose(): void };

/** One primitive of a merged model: where it sits, how it is turned and what colour it is. */
export interface Bit {
  geo: BufferGeometry;
  color: ColorRepresentation;
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: number | [number, number, number];
}

const _mat = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _pos = new Vector3();
const _scl = new Vector3();

function bake(bit: Bit): BufferGeometry {
  const g = bit.geo;
  const c = new Color(bit.color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  const [rx, ry, rz] = bit.rot ?? [0, 0, 0];
  const s = bit.scale ?? 1;
  if (typeof s === 'number') _scl.set(s, s, s);
  else _scl.set(s[0], s[1], s[2]);
  const [x, y, z] = bit.at ?? [0, 0, 0];
  _mat.compose(_pos.set(x, y, z), _quat.setFromEuler(_euler.set(rx, ry, rz)), _scl);
  return g.applyMatrix4(_mat);
}

/** A model part that a defeated figure breaks into. */
export interface Piece {
  object: Object3D;
  radius: number;
  lie: boolean;
}

export function put<T extends Object3D>(parent: Object3D, child: T, x = 0, y = 0, z = 0): T {
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

/** Shared GPU resources: toon ramp, cached materials and textures, ink outline hulls. */
export class Kit {
  /** World units of ink-outline thickness; the view retunes it with camera distance. */
  readonly inkWidth = { value: 1 };
  readonly gradient: DataTexture;
  private owned: Disposable[] = [];
  private toons = new Map<string, MeshToonMaterial>();
  private basics = new Map<string, MeshBasicMaterial>();
  private glows = new Map<string, SpriteMaterial>();
  private geos = new Map<string, BufferGeometry>();
  private hulls = new Map<BufferGeometry, BufferGeometry>();
  private inks = new Map<number, MeshBasicMaterial>();
  private textures = new Map<string, CanvasTexture>();

  constructor() {
    this.gradient = this.own(new DataTexture(new Uint8Array([64, 150, 255]), 3, 1, RedFormat));
    this.gradient.minFilter = NearestFilter;
    this.gradient.magFilter = NearestFilter;
    this.gradient.needsUpdate = true;
  }

  /** Merge already registered its geometry; `geo()` registers again, so drop the first entry. */
  private disown<T extends Disposable>(x: T): T {
    const i = this.owned.lastIndexOf(x);
    if (i >= 0) this.owned.splice(i, 1);
    return x;
  }

  own<T extends Disposable>(x: T): T {
    this.owned.push(x);
    return x;
  }

  geo(key: string, make: () => BufferGeometry): BufferGeometry {
    let g = this.geos.get(key);
    if (!g) {
      g = this.own(make());
      this.geos.set(key, g);
    }
    return g;
  }

  toon(
    color: ColorRepresentation,
    emissive?: ColorRepresentation,
    intensity = 1,
  ): MeshToonMaterial {
    const key = `${new Color(color).getHexString()}|${emissive === undefined ? '' : new Color(emissive).getHexString()}|${intensity}`;
    let m = this.toons.get(key);
    if (!m) {
      m = this.uniqueToon(color, emissive, intensity);
      this.toons.set(key, m);
    }
    return m;
  }

  uniqueToon(
    color: ColorRepresentation,
    emissive?: ColorRepresentation,
    intensity = 1,
  ): MeshToonMaterial {
    return this.own(
      new MeshToonMaterial({
        color,
        gradientMap: this.gradient,
        emissive: emissive ?? '#000000',
        emissiveIntensity: intensity,
      }),
    );
  }

  basic(color: ColorRepresentation, opacity = 1, additive = false): MeshBasicMaterial {
    const key = `${new Color(color).getHexString()}|${opacity}|${additive}`;
    let m = this.basics.get(key);
    if (!m) {
      m = this.own(
        new MeshBasicMaterial({
          color,
          transparent: opacity < 1 || additive,
          opacity,
          fog: false,
          depthWrite: !additive && opacity >= 1,
        }),
      );
      if (additive) m.blending = AdditiveBlending;
      this.basics.set(key, m);
    }
    return m;
  }

  texture(
    key: string,
    w: number,
    h: number,
    paint: (g: CanvasRenderingContext2D) => void,
  ): CanvasTexture {
    let t = this.textures.get(key);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      paint(c.getContext('2d')!);
      t = this.own(new CanvasTexture(c));
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.set(key, t);
    }
    return t;
  }

  glowTexture(): CanvasTexture {
    return this.texture('glow', 128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
  }

  ringTexture(dashed: boolean): CanvasTexture {
    return this.texture(dashed ? 'ring-dashed' : 'ring', 256, 256, (g) => {
      g.strokeStyle = '#fff';
      g.lineCap = 'butt';
      if (dashed) {
        g.lineWidth = 9;
        g.setLineDash([26, 16]);
        g.beginPath();
        g.arc(128, 128, 118, 0, TAU);
        g.stroke();
        g.setLineDash([]);
        g.lineWidth = 2.5;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.arc(128, 128, 104, 0, TAU);
        g.stroke();
      } else {
        const r = g.createRadialGradient(128, 128, 96, 128, 128, 124);
        r.addColorStop(0, 'rgba(255,255,255,0)');
        r.addColorStop(0.55, 'rgba(255,255,255,1)');
        r.addColorStop(0.75, 'rgba(255,255,255,0.9)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 256, 256);
      }
    });
  }

  /** A vertical fade (bright at the foot, clear at the top) for light pillars. */
  beamTexture(): CanvasTexture {
    return this.texture('beam', 4, 128, (g) => {
      const gr = g.createLinearGradient(0, 128, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 128);
    });
  }

  glow(color: ColorRepresentation, opacity = 0.9): SpriteMaterial {
    const key = `${new Color(color).getHexString()}|${opacity}`;
    let m = this.glows.get(key);
    if (!m) {
      m = this.own(
        new SpriteMaterial({
          map: this.glowTexture(),
          color,
          opacity,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      this.glows.set(key, m);
    }
    return m;
  }

  glowSprite(color: ColorRepresentation, size: number, opacity = 0.9): Sprite {
    const s = new Sprite(this.glow(color, opacity));
    s.scale.set(size, size, 1);
    return s;
  }

  /** A flat decal ring lying on the ground, radius r. Material is unique so its opacity can animate. */
  decalRing(color: ColorRepresentation, r: number, dashed = false, opacity = 1): Mesh {
    const mat = this.own(
      new MeshBasicMaterial({
        map: this.ringTexture(dashed),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    const m = new Mesh(
      this.geo('decal', () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      mat,
    );
    m.scale.set(r * 2, 1, r * 2);
    m.renderOrder = 6;
    return m;
  }

  glowDisc(color: ColorRepresentation, r: number, opacity = 0.5): Mesh {
    const mat = this.own(
      new MeshBasicMaterial({
        map: this.glowTexture(),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    );
    const m = new Mesh(
      this.geo('decal', () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      mat,
    );
    m.scale.set(r * 2, 1, r * 2);
    m.renderOrder = 5;
    return m;
  }

  private makeInk(k: number): MeshBasicMaterial {
    const m = new MeshBasicMaterial({ color: INK, side: BackSide });
    m.userData.ink = k;
    const width = this.inkWidth;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uInk = width;
      shader.uniforms.uK = { value: k };
      shader.vertexShader =
        'uniform float uInk;\nuniform float uK;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed += normalize(normal) * uInk * uK / length(modelMatrix[0].xyz);',
        );
    };
    m.customProgramCacheKey = () => 'ink-hull';
    return m;
  }

  /** Inverted-hull material; `unique` ones belong to the caller (fading bodies). */
  ink(k = 1, unique = false): MeshBasicMaterial {
    if (unique) return this.makeInk(k);
    let m = this.inks.get(k);
    if (!m) {
      m = this.own(this.makeInk(k));
      this.inks.set(k, m);
    }
    return m;
  }

  hull(geometry: BufferGeometry): BufferGeometry {
    let h = this.hulls.get(geometry);
    if (!h) {
      const g = geometry.clone();
      for (const name of ['normal', 'uv', 'color']) g.deleteAttribute(name);
      h = mergeVertices(g, 1e-3);
      h.computeVertexNormals();
      g.dispose();
      this.own(h);
      this.hulls.set(geometry, h);
    }
    return h;
  }

  /** A shaded mesh with an ink outline child. */
  inked(geometry: BufferGeometry, material: Material, k = 1): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.add(new Mesh(this.hull(geometry), this.ink(k)));
    return mesh;
  }

  /** Primitives baked into one vertex-colour geometry (one draw call instead of many). */
  merge(bits: Bit[]): BufferGeometry {
    const merged = mergeGeometries(bits.map(bake));
    if (!merged) throw new Error('model parts do not share attributes');
    for (const b of bits) b.geo.dispose();
    return this.own(merged);
  }

  vertexToon(): MeshToonMaterial {
    const key = 'vertex';
    let m = this.toons.get(key);
    if (!m) {
      m = this.uniqueVertexToon();
      this.toons.set(key, m);
    }
    return m;
  }

  /** Vertex-colour toon material owned by one model (so it can pulse on its own). */
  uniqueVertexToon(): MeshToonMaterial {
    return this.own(new MeshToonMaterial({ vertexColors: true, gradientMap: this.gradient }));
  }

  /** An inked, shaded, vertex-colour mesh built once per key and reused. */
  solid(key: string, make: () => Bit[], k = 1, material?: Material): Mesh {
    return this.inked(
      this.geo(key, () => this.disown(this.merge(make()))),
      material ?? this.vertexToon(),
      k,
    );
  }

  /** Unlit vertex-colour mesh for bright trim and glass. */
  glowSolid(key: string, make: () => Bit[], side: Side = FrontSide): Mesh {
    const geo = this.geo(key, () => this.disown(this.merge(make())));
    const mk = `vertex-basic-${side}`;
    let m = this.basics.get(mk);
    if (!m) {
      m = this.own(new MeshBasicMaterial({ vertexColors: true, side, fog: false }));
      this.basics.set(mk, m);
    }
    return new Mesh(geo, m);
  }

  /** Shorthand: cached geometry, inked mesh. */
  part(
    key: string,
    make: () => BufferGeometry,
    material: Material,
    k = 1,
    x = 0,
    y = 0,
    z = 0,
  ): Mesh {
    const m = this.inked(this.geo(key, make), material, k);
    m.position.set(x, y, z);
    return m;
  }

  /** Soft dark contact shadow lying on the ground. */
  blob(r: number, opacity = 0.55): Mesh {
    const tex = this.texture('blob', 128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    const mat = this.own(
      new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
      }),
    );
    const m = new Mesh(
      this.geo('decal', () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      mat,
    );
    m.scale.set(r * 2, 1, r * 2);
    m.position.y = 0.55;
    m.renderOrder = 4;
    return m;
  }

  /** Clone a model piece with its own materials so it can fade independently. */
  fadable(src: Object3D): { object: Object3D; materials: Material[] } {
    const object = src.clone(true);
    const materials: Material[] = [];
    const sprites: Object3D[] = [];
    object.traverse((o) => {
      if (o instanceof Sprite) sprites.push(o);
      if (!(o instanceof Mesh)) return;
      const old = o.material as Material;
      const next =
        typeof old.userData.ink === 'number' ? this.makeInk(old.userData.ink) : old.clone();
      next.transparent = true;
      o.material = next;
      materials.push(next);
    });
    for (const s of sprites) s.removeFromParent();
    return { object, materials };
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned = [];
    for (const m of [this.toons, this.basics, this.glows, this.geos, this.inks, this.textures])
      m.clear();
    this.hulls.clear();
  }
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rand01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A flat ring on the ground whose swept arc grows from north, clockwise (0..1). */
export class ProgressRing {
  readonly mesh: Mesh;
  private static readonly SEG = 72;
  private last = -1;

  constructor(kit: Kit, inner: number, outer: number, color: ColorRepresentation, opacity = 0.9) {
    const g = new RingGeometry(inner, outer, ProgressRing.SEG, 1)
      .rotateZ(Math.PI / 2)
      .scale(-1, 1, 1)
      .rotateX(-Math.PI / 2);
    this.mesh = new Mesh(
      kit.own(g),
      kit.own(
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
        }),
      ),
    );
    this.mesh.renderOrder = 7;
    this.set(0);
  }

  set(frac: number): void {
    const f = Math.max(0, Math.min(1, frac));
    if (Math.abs(f - this.last) < 0.004) return;
    this.last = f;
    this.mesh.geometry.setDrawRange(0, Math.ceil(f * ProgressRing.SEG) * 6);
    this.mesh.visible = f > 0;
  }

  get material(): MeshBasicMaterial {
    return this.mesh.material as MeshBasicMaterial;
  }
}
