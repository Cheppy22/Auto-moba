import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector2,
} from 'three';
import { type Content, shapeDist, type Snapshot } from '../../sim';
import { type Bit, BRASS, type Kit } from './kit';
import { type TerrainField, WATER_Y } from './terrain';

const TAU = Math.PI * 2;
/** Seconds the mist and the gates take to clear once a clearing opens. */
const DISSOLVE = 2.2;
/** Mist layers: height above the ground and how much each one shows. */
const LAYERS: [number, number][] = [
  [1.4, 1],
  [4.4, 0.55],
];
const RINGS = 9;
const SEGS = 44;
/** Gates stand this far clear of a lane corridor's edge, so they never sit in a lane. */
const LANE_CLEAR = 10;
const IRON = '#27252a';
const STONE_PIER = '#d3ccb9';

const NOISE = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const MIST_VERT = /* glsl */ `
attribute float aMask;
attribute float aLayer;
varying vec2 vL;
varying float vMask;
varying float vLayer;
uniform vec2 uCenter;
void main() {
  vL = position.xz - uCenter;
  vMask = aMask;
  vLayer = aLayer;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Low, layered ground mist: it swirls slowly inside the clearing and burns off from the edge. */
const MIST_FRAG = /* glsl */ `
uniform float uTime;
uniform float uDissolve;
uniform float uR;
varying vec2 vL;
varying float vMask;
varying float vLayer;
${NOISE}
void main() {
  float t = uTime;
  float a0 = t * (0.018 + vLayer * 0.012) * (mod(vLayer, 2.0) < 0.5 ? 1.0 : -1.0);
  float cs = cos(a0);
  float sn = sin(a0);
  vec2 p = mat2(cs, -sn, sn, cs) * vL;
  vec2 q = p * 0.032 + vLayer * 3.1;
  float w = vn(q + vec2(t * 0.04, 0.0)) * 0.55 + vn(q * 2.3 - vec2(0.0, t * 0.06)) * 0.3 + vn(q * 5.1 + t * 0.09) * 0.15;
  float wisp = smoothstep(0.32, 0.78, w);
  float r = length(vL) / uR;
  float a = vMask * (0.07 + 0.2 * wisp);
  // burn away: a ragged front sweeps in from the rim with an ember edge
  float dn = vn(vL * 0.06 + vLayer * 1.7) * 0.6 + (1.0 - r) * 0.4;
  float cut = uDissolve * 1.25 - 0.1;
  if (dn < cut) discard;
  float edge = (1.0 - smoothstep(cut, cut + 0.12, dn)) * step(0.001, uDissolve);
  vec3 shade = vec3(0.56, 0.55, 0.54);
  vec3 pale = vec3(0.9, 0.87, 0.8);
  vec3 col = mix(shade, pale, wisp * (0.6 + 0.2 * vLayer));
  col += vec3(1.0, 0.82, 0.5) * edge * 0.5;
  a = max(a * (1.0 - uDissolve * 0.6), edge * vMask * 0.35);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Gate {
  pivot: Group;
  /** Heading of the leaf when shut, and which way it swings open (into the clearing). */
  base: number;
  sign: number;
}

interface Veil {
  group: Group;
  mist: ShaderMaterial;
  /** Piers, gates and bars: they swing open, then sink into the ground as the seal breaks. */
  seals: Group;
  gates: Gate[];
  cx: number;
  cy: number;
  radius: number;
  opened: number | null;
  /** Owned GPU objects to release when the veil goes. */
  bag: { dispose(): void }[];
}

/**
 * The "Uncharted" look. A sealed clearing fills with low, slow ground mist (it never rises over
 * the lanes beside it) and each gate path is closed by a pair of wrought-iron gates between two
 * stone piers, set inside the clearing's mouth. When the clearing opens the leaves swing in, the
 * mist clears from the rim and the gates sink away.
 */
export class Veils {
  readonly group = new Group();
  private readonly veils = new Map<string, Veil>();
  private seenFirst = false;

  constructor(
    private readonly kit: Kit,
    private readonly field: TerrainField,
    private readonly content: Content,
  ) {}

  private shader(frag: string, vert: string, extra: Record<string, { value: unknown }> = {}) {
    return new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 }, uDissolve: { value: 0 }, ...extra },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
  }

  /** Distance from a sim point to the nearest lane corridor's edge (negative inside a lane). */
  private laneGap(x: number, y: number): number {
    let best = Infinity;
    for (const s of this.field.shapes)
      if (s.kind === 'lane') best = Math.min(best, shapeDist(s, x, y));
    return best;
  }

  /** Stacked mist discs that follow the ground, faded at the rim and wherever a lane comes near. */
  private mistGeometry(cx: number, cy: number, R: number): BufferGeometry {
    const f = this.field;
    const per = 1 + RINGS * SEGS;
    const pos = new Float32Array(per * LAYERS.length * 3);
    const mask = new Float32Array(per * LAYERS.length);
    const layer = new Float32Array(per * LAYERS.length);
    const idx: number[] = [];
    LAYERS.forEach(([lift, weight], li) => {
      const o = li * per;
      const put = (k: number, x: number, y: number, m: number): void => {
        const g = Math.max(f.heightAt(x, y), WATER_Y);
        pos.set([x - f.half, g + lift, y - f.half], (o + k) * 3);
        mask[o + k] = m * weight;
        layer[o + k] = li;
      };
      put(0, cx, cy, 1);
      for (let r = 1; r <= RINGS; r++) {
        const rr = (r / RINGS) * R;
        for (let s = 0; s < SEGS; s++) {
          const a = (s / SEGS) * TAU;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          const rim = 1 - (r === RINGS ? 1 : Math.max(0, (rr / R - 0.62) / 0.38) ** 1.6);
          const lane = Math.min(1, Math.max(0, (this.laneGap(x, y) - 2) / 16));
          put(1 + (r - 1) * SEGS + s, x, y, rim * lane);
        }
      }
      for (let s = 0; s < SEGS; s++) idx.push(o, o + 1 + ((s + 1) % SEGS), o + 1 + s);
      for (let r = 1; r < RINGS; r++) {
        for (let s = 0; s < SEGS; s++) {
          const a = o + 1 + (r - 1) * SEGS + s;
          const b = o + 1 + (r - 1) * SEGS + ((s + 1) % SEGS);
          const c = a + SEGS;
          const d = b + SEGS;
          idx.push(a, b, d, a, d, c);
        }
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aMask', new Float32BufferAttribute(mask, 1));
    geo.setAttribute('aLayer', new Float32BufferAttribute(layer, 1));
    geo.setIndex(new Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  /** One gate leaf, hinged at the origin and reaching along +x: bars, rails and gilt spear tips. */
  private leafBits(len: number): Bit[] {
    const bits: Bit[] = [];
    for (const y of [1.6, 6.4, 11.4])
      bits.push({ geo: new BoxGeometry(len, 0.9, 0.9), color: IRON, at: [len / 2, y, 0] });
    const n = Math.max(2, Math.round(len / 2.8));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * len;
      bits.push(
        { geo: new CylinderGeometry(0.42, 0.42, 12.4, 4, 1, true), color: IRON, at: [x, 6.4, 0] },
        { geo: new ConeGeometry(0.9, 2.2, 4), color: BRASS, at: [x, 13.5, 0] },
      );
    }
    return bits;
  }

  private build(slot: Snapshot['slots'][number]): Veil {
    const f = this.field;
    const kit = this.kit;
    const bag: { dispose(): void }[] = [];
    const pad = this.content.map.walk.slotPad;
    const R = slot.radius + pad;
    const group = new Group();
    const wx = slot.x - f.half;
    const wz = slot.y - f.half;

    const mistGeo = this.mistGeometry(slot.x, slot.y, R);
    const mist = this.shader(MIST_FRAG, MIST_VERT, {
      uR: { value: R },
      uCenter: { value: new Vector2(wx, wz) },
    });
    const mistMesh = new Mesh(mistGeo, mist);
    mistMesh.renderOrder = 8;
    group.add(mistMesh);
    bag.push(mistGeo, mist);

    // one pair of gates per gate path, inside the clearing's mouth and clear of the lane
    const seals = new Group();
    const gates: Gate[] = [];
    const solid: Bit[] = [];
    for (const s of f.shapes) {
      if (s.kind !== 'port' || s.slot !== slot.id) continue;
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // walk out from the centre to the mouth, then back off until the gates clear the lane
      let at = R - 6;
      const half = s.r + 3;
      while (at > R * 0.5) {
        const gx = s.ax + ux * at;
        const gyy = s.ay + uy * at;
        const clear = Math.min(
          this.laneGap(gx - uy * half, gyy + ux * half),
          this.laneGap(gx + uy * half, gyy - ux * half),
          this.laneGap(gx, gyy),
        );
        if (clear >= LANE_CLEAR) break;
        at -= 2;
      }
      const gx = s.ax + ux * at;
      const gyy = s.ay + uy * at;
      const px = -uy;
      const py = ux;
      const leafLen = half - 1.8;
      const leaf = kit.geo(`gate-leaf:${Math.round(leafLen * 10)}`, () =>
        kit.merge(this.leafBits(leafLen)),
      );
      for (const side of [-1, 1]) {
        const x = gx + px * half * side;
        const y = gyy + py * half * side;
        const base = f.heightAt(x, y);
        solid.push(
          {
            geo: new BoxGeometry(3.6, 17, 3.6),
            color: STONE_PIER,
            at: [x - f.half, base + 8.5, y - f.half],
          },
          {
            geo: new BoxGeometry(4.6, 1.2, 4.6),
            color: '#b9b19c',
            at: [x - f.half, base + 17.4, y - f.half],
          },
          {
            geo: new SphereGeometry(1.9, 8, 5),
            color: BRASS,
            at: [x - f.half, base + 19.6, y - f.half],
          },
        );
        // the leaf reaches from this hinge towards the middle of the path
        const hx = -px * side;
        const hz = -py * side;
        const th = Math.atan2(-hz, hx);
        const sign = hz * -ux + hx * uy > 0 ? 1 : -1;
        const pivot = new Group();
        pivot.position.set(x - f.half, base + 0.2, y - f.half);
        pivot.rotation.y = th;
        const mesh = new Mesh(leaf, kit.vertexToon());
        pivot.add(mesh);
        seals.add(pivot);
        gates.push({ pivot, base: th, sign });
      }
    }
    if (solid.length) seals.add(kit.solid(`veil-seal:${slot.id}`, () => solid, 0.8));
    group.add(seals);
    this.group.add(group);
    return { group, mist, seals, gates, cx: slot.x, cy: slot.y, radius: R, opened: null, bag };
  }

  private drop(id: string, v: Veil): void {
    this.group.remove(v.group);
    for (const d of v.bag) d.dispose();
    this.veils.delete(id);
  }

  /** Call every frame with the snapshot's slots; starts and ends veils as clearings open. */
  sync(slots: Snapshot['slots'], time: number): void {
    for (const slot of slots) {
      const cur = this.veils.get(slot.id);
      if (!slot.open) {
        if (cur && cur.opened === null) continue;
        if (cur) this.drop(slot.id, cur);
        this.veils.set(slot.id, this.build(slot));
      } else if (cur && cur.opened === null) {
        if (this.seenFirst) cur.opened = time;
        else this.drop(slot.id, cur);
      }
    }
    this.seenFirst = true;
  }

  update(time: number): void {
    for (const [id, v] of this.veils) {
      let d = 0;
      if (v.opened !== null) {
        d = (time - v.opened) / DISSOLVE;
        if (d >= 1) {
          this.drop(id, v);
          continue;
        }
      }
      v.mist.uniforms.uTime.value = time;
      v.mist.uniforms.uDissolve.value = d;
      // the leaves swing in first, then everything sinks into the ground
      const open = smoothstep(0, 0.5, d);
      for (const g of v.gates) g.pivot.rotation.y = g.base + g.sign * open * 1.5;
      v.seals.position.y = -smoothstep(0.5, 1, d) * 24;
      v.seals.visible = d < 0.95;
    }
  }

  dispose(): void {
    for (const [id, v] of [...this.veils]) this.drop(id, v);
  }
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
