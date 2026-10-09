import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Uint32BufferAttribute,
  Vector2,
} from 'three';
import { type TerrainField, WATER_Y } from './terrain';

const SQRT1_2 = Math.SQRT1_2;
/**
 * The river runs `REACH` either side of the centre of the map and `SPAN` either side of its line
 * (both times the map's island radius over 700, as tuned), in `ALONG` by `ACROSS` quads.
 */
const REACH = 664;
const SPAN = 74;
const ALONG = 120;
const ACROSS = 40;

const VERT = /* glsl */ `
attribute float aDepth;
varying vec3 vW;
varying float vDepth;
void main() {
  vW = position;
  vDepth = aDepth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uLip;
varying vec3 vW;
varying float vDepth;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // a calm canal: the slow drift of the water is barely there
  vec2 flow = vec2(0.7071) * uTime * 2.4;
  vec2 p = vW.xz - flow;
  float w = vn(p * 0.05) * 0.6 + vn(p * 0.13 + 7.0) * 0.4;
  float ripple = smoothstep(0.55, 0.8, w);
  float depth = clamp(vDepth, 0.0, 6.0);
  vec3 shallow = vec3(0.2, 0.37, 0.38);
  vec3 deep = vec3(0.08, 0.17, 0.2);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 3.4, depth));
  // the sky laid on the water, warm at the horizon, with a few soft glints
  col += vec3(0.62, 0.56, 0.42) * (0.1 + 0.08 * ripple);
  float glint = smoothstep(0.93, 0.98, vn(p * 0.35 + uTime * 0.3)) * 0.18;
  col += vec3(1.0, 0.94, 0.8) * glint;
  // a pale line of foam where the water laps the stone
  float foam = smoothstep(1.2, 0.1, vDepth) * 0.5;
  col = mix(col, vec3(0.88, 0.86, 0.78), foam);
  float alpha = (0.78 + 0.14 * smoothstep(0.0, 3.0, depth)) * smoothstep(0.0, 0.3, vDepth);
  // the lip of the island: the canal runs out into the void
  float r = length(vW.xz);
  alpha *= 1.0 - smoothstep(uLip.x, uLip.y, r);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The canal: one animated sheet at a fixed level; where terrain rises above it, it vanishes. */
export class River {
  readonly group = new Group();
  private readonly mat: ShaderMaterial;
  private readonly geo: BufferGeometry;

  constructor(field: TerrainField) {
    const k = field.ws.k;
    const reach = REACH * k;
    const span = SPAN * k;
    const along = Math.round(ALONG * k);
    const cols = ACROSS + 1;
    const rows = along + 1;
    const pos = new Float32Array(cols * rows * 3);
    const depth = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const s = -reach + (r / along) * reach * 2;
      const center = field.riverCenter(s);
      for (let c = 0; c < cols; c++) {
        const a = center + (c / ACROSS - 0.5) * span * 2;
        const wx = (s + a) * SQRT1_2;
        const wz = (s - a) * SQRT1_2;
        const v = r * cols + c;
        pos[v * 3] = wx;
        pos[v * 3 + 1] = WATER_Y;
        pos[v * 3 + 2] = wz;
        depth[v] = WATER_Y - field.heightW(wx, wz);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < along; r++) {
      for (let c = 0; c < ACROSS; c++) {
        const a = r * cols + c;
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.geo.setAttribute('aDepth', new Float32BufferAttribute(depth, 1));
    this.geo.setIndex(new Uint32BufferAttribute(idx, 1));
    this.geo.computeBoundingSphere();
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uLip: { value: new Vector2(field.ws.islandR * 0.891, field.ws.islandR * 0.966) },
      },
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new Mesh(this.geo, this.mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
