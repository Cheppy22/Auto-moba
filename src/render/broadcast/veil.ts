import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Uint16BufferAttribute,
  Vector2,
  Vector3,
} from 'three';
import { type Content, shapeDist, type Snapshot } from '../../sim';
import { type Bit, BRASS, type Kit, LACQUER } from './kit';
import { ofudaTexture } from './scenery';
import { type TerrainField, WATER_Y } from './terrain';

const TAU = Math.PI * 2;
/** Seconds the mist and the gate seals take to burn away once a clearing opens. */
const DISSOLVE = 2.2;
const TAGS = 5;
/** Mist layers: height above the ground and how much each one shows. */
const LAYERS: [number, number][] = [
  [1.6, 1],
  [5.2, 0.75],
  [9.4, 0.5],
];
const RINGS = 9;
const SEGS = 44;
/** Gate seals stand this far clear of a lane corridor's edge, so they never sit in a lane. */
const LANE_CLEAR = 10;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const _sw = new Quaternion();

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
  float a = vMask * (0.12 + 0.34 * wisp);
  // burn away: a ragged front sweeps in from the rim with an ember edge
  float dn = vn(vL * 0.06 + vLayer * 1.7) * 0.6 + (1.0 - r) * 0.4;
  float cut = uDissolve * 1.25 - 0.1;
  if (dn < cut) discard;
  float edge = (1.0 - smoothstep(cut, cut + 0.12, dn)) * step(0.001, uDissolve);
  vec3 ink = vec3(0.1, 0.07, 0.2);
  vec3 lilac = vec3(0.56, 0.47, 0.86);
  vec3 col = mix(ink, lilac, wisp * (0.55 + 0.25 * vLayer));
  col += vec3(1.0, 0.68, 0.32) * edge * 1.5;
  a = max(a * (1.0 - uDissolve * 0.6), edge * vMask * 0.9);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VEIL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The thin curtain of mist hanging behind a gate rope, darkest at the foot. */
const VEIL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uDissolve;
varying vec2 vUv;
${NOISE}
void main() {
  float t = uTime;
  float mist = vn(vec2(vUv.x * 6.0 + t * 0.2, vUv.y * 3.0 - t * 0.3)) * 0.6 + vn(vec2(vUv.x * 13.0 - t * 0.3, vUv.y * 7.0)) * 0.4;
  float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float a = (0.1 + 0.24 * mist) * (1.0 - smoothstep(0.25, 1.0, vUv.y)) * side;
  float dn = vn(vUv * vec2(9.0, 5.0));
  float cut = uDissolve * 1.3 - 0.15;
  if (dn < cut) discard;
  float edge = (1.0 - smoothstep(cut, cut + 0.16, dn)) * step(0.001, uDissolve);
  vec3 col = mix(vec3(0.12, 0.08, 0.24), vec3(0.5, 0.42, 0.82), mist);
  col += vec3(1.0, 0.7, 0.3) * edge * 1.6;
  gl_FragColor = vec4(col, max(a, edge * side * 0.8));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Veil {
  group: Group;
  mist: ShaderMaterial;
  veil: ShaderMaterial | null;
  /** Posts, ropes and paper: they sink into the ground as the seal breaks. */
  seals: Group;
  tags: InstancedMesh;
  ring: Mesh;
  cx: number;
  cy: number;
  gy: number;
  radius: number;
  opened: number | null;
  /** Owned GPU objects to release when the veil goes. */
  bag: { dispose(): void }[];
}

/**
 * The "Uncharted" look. A sealed clearing fills with low, slow ground mist (it never rises over
 * the lanes beside it) and each gate path is closed by a small shimenawa: two posts, a straw rope
 * with paper shide, and a thin curtain of mist, set inside the clearing's mouth. When the clearing
 * opens the mist burns off from the rim and the seals sink away.
 */
export class Veils {
  readonly group = new Group();
  private readonly veils = new Map<string, Veil>();
  private readonly tagTex = ofudaTexture();
  private readonly tagMat: MeshBasicMaterial;
  private readonly tagGeo = new PlaneGeometry(3.4, 7.2).translate(0, -3.6, 0);
  private seenFirst = false;

  constructor(
    private readonly kit: Kit,
    private readonly field: TerrainField,
    private readonly content: Content,
  ) {
    this.tagMat = new MeshBasicMaterial({
      map: this.tagTex,
      side: DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });
  }

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

  private build(slot: Snapshot['slots'][number]): Veil {
    const f = this.field;
    const kit = this.kit;
    const bag: { dispose(): void }[] = [];
    const pad = this.content.map.walk.slotPad;
    const R = slot.radius + pad;
    const group = new Group();
    const gy = f.heightAt(slot.x, slot.y);
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

    // one small shimenawa per gate path, inside the clearing's mouth and clear of the lane
    const seals = new Group();
    const solid: Bit[] = [];
    const strips: { x: number; y: number; z: number; yaw: number }[] = [];
    const curtain: number[] = [];
    const curtainUv: number[] = [];
    for (const s of f.shapes) {
      if (s.kind !== 'port' || s.slot !== slot.id) continue;
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // walk out from the centre to the mouth, then back off until the seal clears the lane
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
      const yaw = Math.atan2(ux, uy);
      const px = -uy;
      const py = ux;
      const ends: Vector3[] = [];
      for (const side of [-1, 1]) {
        const x = gx + px * half * side;
        const y = gyy + py * half * side;
        const base = f.heightAt(x, y);
        ends.push(new Vector3(x - f.half, base + 12.5, y - f.half));
        solid.push(
          {
            geo: new CylinderGeometry(1.15, 1.5, 14, 6),
            color: LACQUER,
            at: [x - f.half, base + 7, y - f.half],
          },
          {
            geo: new SphereGeometry(1.6, 8, 5),
            color: BRASS,
            at: [x - f.half, base + 14.4, y - f.half],
          },
        );
      }
      const mid = ends[0].clone().lerp(ends[1], 0.5);
      mid.y -= 3.2;
      const curve = new QuadraticBezierCurve3(ends[0], mid, ends[1]);
      const rope = new TubeGeometry(curve, 10, 1.15, 5, false);
      solid.push({ geo: rope, color: '#d2bd8a' });
      for (let i = 1; i <= 4; i++) {
        const p = curve.getPoint(i / 5);
        strips.push({ x: p.x, y: p.y - 0.6, z: p.z, yaw });
      }
      // the curtain: a ground-hugging sheet across the path, just inside the rope
      const c0 = ends[0];
      const c1 = ends[1];
      const back = 2.5;
      for (const [cc, u] of [
        [c0, 0],
        [c1, 1],
      ] as const) {
        const bx = cc.x - ux * back;
        const bz = cc.z - uy * back;
        const g0 = f.heightW(bx, bz);
        curtain.push(bx, g0 - 1, bz, bx, g0 + 17, bz);
        curtainUv.push(u, 0, u, 1);
      }
    }
    let veil: ShaderMaterial | null = null;
    if (solid.length) {
      const key = `veil-seal:${slot.id}`;
      const mesh = kit.solid(key, () => solid, 0.8);
      seals.add(mesh);
      const tags = new InstancedMesh(this.tagGeo, this.tagMat, strips.length);
      strips.forEach((t, i) => {
        _q.setFromAxisAngle(Y, t.yaw + ((i % 2) - 0.5) * 0.3);
        _m.compose(_p.set(t.x, t.y, t.z), _q, _s.setScalar(0.85 + (i % 3) * 0.08));
        tags.setMatrixAt(i, _m);
      });
      _s.set(1, 1, 1);
      tags.instanceMatrix.needsUpdate = true;
      seals.add(tags);
      bag.push(tags);
      const cg = new BufferGeometry();
      cg.setAttribute('position', new Float32BufferAttribute(curtain, 3));
      cg.setAttribute('uv', new Float32BufferAttribute(curtainUv, 2));
      const ci: number[] = [];
      for (let q = 0; q < curtain.length / 12; q++) {
        const b = q * 4;
        ci.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
      cg.setIndex(ci);
      veil = this.shader(VEIL_FRAG, VEIL_VERT);
      const cm = new Mesh(cg, veil);
      cm.renderOrder = 9;
      group.add(cm);
      bag.push(cg, veil);
    }
    group.add(seals);

    const ring = kit.decalRing('#a48cf0', R * 0.97, true, 0.42);
    ring.position.set(wx, gy + 0.9, wz);
    group.add(ring);
    bag.push(ring.material as MeshBasicMaterial);

    const tags = new InstancedMesh(this.tagGeo, this.tagMat, TAGS);
    tags.frustumCulled = false;
    group.add(tags);
    bag.push(tags);
    this.group.add(group);
    return {
      group,
      mist,
      veil,
      seals,
      tags,
      ring,
      cx: slot.x,
      cy: slot.y,
      gy,
      radius: R,
      opened: null,
      bag,
    };
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
      if (v.veil) {
        v.veil.uniforms.uTime.value = time;
        v.veil.uniforms.uDissolve.value = d;
      }
      v.ring.rotation.y = time * 0.08;
      (v.ring.material as MeshBasicMaterial).opacity = 0.42 * (1 - d);
      // the seals sink into the ground once the clearing opens
      const sink = d * d * 18;
      v.seals.position.y = -sink;
      v.seals.visible = d < 0.95;
      const f = this.field;
      const wx = v.cx - f.half;
      const wz = v.cy - f.half;
      for (let i = 0; i < TAGS; i++) {
        const a = (i / TAGS) * TAU + time * 0.07 * (i % 2 ? 1 : -1);
        const r = v.radius * (0.3 + 0.12 * i);
        const up = 10 + 2.5 * Math.sin(time * 0.6 + i * 1.7) + d * 46;
        _q.setFromAxisAngle(Y, -a + Math.PI / 2 + Math.sin(time * 1.1 + i) * 0.3);
        _sw.setFromAxisAngle(X, Math.sin(time * 1.5 + i * 1.3) * 0.25);
        _q.multiply(_sw);
        _p.set(wx + Math.cos(a) * r, v.gy + up, wz + Math.sin(a) * r);
        _m.compose(_p, _q, _s.setScalar(Math.max(0.001, 1 - d)));
        v.tags.setMatrixAt(i, _m);
      }
      v.tags.instanceMatrix.needsUpdate = true;
      _s.set(1, 1, 1);
    }
  }

  dispose(): void {
    for (const [id, v] of [...this.veils]) this.drop(id, v);
    this.tagTex.dispose();
    this.tagMat.dispose();
    this.tagGeo.dispose();
  }
}
