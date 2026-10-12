import {
  BoxGeometry,
  BufferGeometry,
  Color,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly building blocks for the Tournament Table look. Every model is a list of `Part`s
 * (a primitive, a colour, a place, and optionally the bone that moves it), merged into one
 * non-indexed vertex-colour geometry. Few segments on purpose: the faceted, flat-shaded look.
 */

export type V3 = [number, number, number];

export interface Part {
  g: BufferGeometry;
  c: ColorRepresentation;
  p?: V3;
  r?: V3;
  s?: number | V3;
  /** Bone index for skinned figures (see `piece.ts`). */
  bone?: number;
  /** Drawn unlit in its own colour (glows, gems, flames). */
  glow?: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

function bake(part: Part): BufferGeometry {
  const g = part.g.index ? part.g.toNonIndexed() : part.g;
  if (g !== part.g) part.g.dispose();
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const n = g.getAttribute('position').count;
  _c.set(part.c);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aBone', new Float32BufferAttribute(new Float32Array(n).fill(part.bone ?? 0), 1));
  g.setAttribute(
    'aGlow',
    new Float32BufferAttribute(new Float32Array(n).fill(part.glow ? 1 : 0), 1),
  );
  const [rx, ry, rz] = part.r ?? [0, 0, 0];
  const s = part.s ?? 1;
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  const [x, y, z] = part.p ?? [0, 0, 0];
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
  g.applyMatrix4(_m);
  return g;
}

/** Merges parts into one geometry with `color`, `aBone` and `aGlow` attributes. */
export function merge(parts: Part[]): BufferGeometry {
  const geos = parts.map(bake);
  const out = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  if (!out) throw new Error('table: parts do not share attributes');
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------ primitives ------------------------------ */

/** Box centred on its middle. */
export const box = (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d);

/** An n-sided frustum standing on y=0 (rTop, rBottom, height). */
export function prism(rTop: number, rBot: number, h: number, sides = 6): BufferGeometry {
  return new CylinderGeometry(rTop, rBot, h, sides, 1).translate(0, h / 2, 0);
}

/** An n-sided cone standing on y=0 (`open`: no base, for cones seen only from above). */
export function cone(r: number, h: number, sides = 5, open = false): BufferGeometry {
  return new ConeGeometry(r, h, sides, 1, open).translate(0, h / 2, 0);
}

/** A faceted ball. */
export const gem = (r: number): BufferGeometry => new IcosahedronGeometry(r, 0);
export const octa = (r: number): BufferGeometry => new OctahedronGeometry(r, 0);
export const dodeca = (r: number): BufferGeometry => new DodecahedronGeometry(r, 0);

/** A ring lying flat (in the XZ plane). */
export function ring(r: number, tube: number, seg = 8, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(r, tube, 3, seg, arc).rotateX(Math.PI / 2);
}

/** A ring standing up, facing +Z (halos, hooks). */
export function hoop(r: number, tube: number, seg = 8, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(r, tube, 3, seg, arc);
}

/** A lathe from [radius, y] pairs: robes, skirts, bases. */
export function lathe(pts: [number, number][], sides = 7): BufferGeometry {
  return new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    sides,
  );
}

/**
 * A flat silhouette extruded `depth` along Z (centred on z=0): flags, blades, wings, horns.
 * Points are [x, y] in the XY plane.
 */
export function slab(pts: [number, number][], depth: number): BufferGeometry {
  const s = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 }).translate(
    0,
    0,
    -depth / 2,
  );
}

/** A spiky star disc in the XY plane (sun halos, gear crowns). */
export function star(points: number, rOut: number, rIn: number, depth: number): BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return slab(pts, depth);
}

/** A crescent in the XY plane (opening to +X). */
export function crescent(r: number, thick: number, depth: number, seg = 7): BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI * 0.8 + (i / seg) * Math.PI * 1.6;
    pts.push([-Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = seg; i >= 0; i--) {
    const a = -Math.PI * 0.7 + (i / seg) * Math.PI * 1.4;
    pts.push([-Math.cos(a) * (r - thick) + thick * 0.4, Math.sin(a) * (r - thick * 0.6)]);
  }
  return slab(pts, depth);
}

/** A bar from a to b with a square section (staffs, poles, lances). */
export function rod(a: V3, b: V3, w: number, sides = 4): Part['g'] {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new CylinderGeometry(w / 2, w / 2, len, sides, 1);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/** A tapered spike from a (base, radius r) to b (tip). */
export function spike(a: V3, b: V3, r: number, sides = 4): BufferGeometry {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new ConeGeometry(r, len, sides, 1).translate(0, len / 2, 0);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** Colour helpers. */
export function shade(c: ColorRepresentation, k: number): string {
  return `#${new Color(c).multiplyScalar(k).getHexString()}`;
}

export function mix(a: ColorRepresentation, b: ColorRepresentation, t: number): string {
  return `#${new Color(a).lerp(new Color(b), t).getHexString()}`;
}
