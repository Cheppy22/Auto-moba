import {
  Color,
  DepthTexture,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

/**
 * "Ink style" (Fable review 4C, a prototype behind a switch): the scene is drawn into an offscreen
 * buffer, then one full-screen pass inks it like a printed game board.
 *
 * - **Ink lines** where the depth jumps (silhouettes: pieces, Bastions, terrace cliffs, arches) and
 *   where the surface turns (creases between flat-shaded faces), found from the depth buffer alone
 *   (the normals are rebuilt from five depth taps), so no extra scene pass is drawn. Lines fade out
 *   into the haze with distance, so the woods and the lake stay soft.
 * - **Toon light:** brightness is gently pulled toward three bands.
 * - **Paper:** a fixed grain of fibres in screen space (it never swims or stretches with the camera,
 *   and keeps its size at any zoom or tilt), a warm wash in the shadows and a soft vignette.
 *
 * Screen-space, so its cost depends on the pixels, not on the camera or the scene.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uPx;
uniform float uNear;
uniform float uFar;
uniform vec2 uTan;
uniform vec2 uFade;
uniform vec3 uInk;
uniform vec3 uWash;
uniform float uToon;
uniform float uGrain;
varying vec2 vUv;

float viewZ(vec2 uv) {
  return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
}
vec3 viewPos(vec2 uv, float z) {
  return vec3((uv * 2.0 - 1.0) * uTan * -z, z);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec4 base = texture2D(tColor, vUv);
  vec3 col = base.rgb;
  float d0 = texture2D(tDepth, vUv).x;
  vec2 o = uTexel * uPx;
  float zc = viewZ(vUv);
  float zl = viewZ(vUv - vec2(o.x, 0.0));
  float zr = viewZ(vUv + vec2(o.x, 0.0));
  float zd = viewZ(vUv - vec2(0.0, o.y));
  float zu = viewZ(vUv + vec2(0.0, o.y));
  float dist = -zc;

  // silhouettes: the depth's second difference against the distance (planes stay quiet)
  float dd = max(abs(zl + zr - 2.0 * zc), abs(zu + zd - 2.0 * zc)) / max(dist, 1.0);
  float edge = smoothstep(0.006, 0.03, dd);

  // creases: the four corner normals around this pixel disagree
  vec3 pc = viewPos(vUv, zc);
  vec3 pl = viewPos(vUv - vec2(o.x, 0.0), zl);
  vec3 pr = viewPos(vUv + vec2(o.x, 0.0), zr);
  vec3 pd = viewPos(vUv - vec2(0.0, o.y), zd);
  vec3 pu = viewPos(vUv + vec2(0.0, o.y), zu);
  vec3 nRU = normalize(cross(pr - pc, pu - pc));
  vec3 nLD = normalize(cross(pc - pl, pc - pd));
  vec3 nLU = normalize(cross(pc - pl, pu - pc));
  vec3 nRD = normalize(cross(pr - pc, pc - pd));
  float bend = 1.0 - min(dot(nRU, nLD), dot(nLU, nRD));
  edge = max(edge, smoothstep(0.12, 0.4, bend) * 0.8);

  // lines fade into the haze, and never on the sky
  edge *= 1.0 - smoothstep(uFade.x, uFade.y, dist);
  edge *= step(d0, 0.99999);

  // toon light: brightness pulled toward three soft bands (in perceptual space)
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float lp = pow(max(lum, 1e-4), 1.0 / 2.2);
  float b = lp * 3.0;
  float band = (floor(b) + smoothstep(0.3, 0.7, fract(b))) / 3.0;
  float lt = mix(lp, band, uToon);
  col *= pow(lt, 2.2) / max(lum, 1e-4);

  // paper: a warm wash in the shadows, fibres and grain fixed to the screen, a soft vignette
  float shade = 1.0 - smoothstep(0.0, 0.55, lp);
  col = mix(col, col * uWash, shade * 0.22);
  vec2 sp = gl_FragCoord.xy / uPx;
  float fib = vnoise(vec2(sp.x * 0.08 + sp.y * 0.03, sp.y * 0.6)) - 0.5;
  float grit = vnoise(sp * 0.7) - 0.5;
  float tooth = vnoise(sp * 0.18) - 0.5;
  float grain = fib * 0.9 + grit * 0.7 + tooth * 0.8;
  // multiplied on the lit tones, and a touch added so it still shows on the night-dark floor
  col *= 1.0 + uGrain * grain;
  col += uGrain * 0.12 * grain;
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.35;

  col = mix(col, uInk, clamp(edge, 0.0, 1.0) * 0.82);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class InkPass {
  private target: WebGLRenderTarget | null = null;
  private readonly size = new Vector2();
  private readonly mat: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: WebGLRenderer) {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uTexel: { value: new Vector2(1, 1) },
        uPx: { value: 1 },
        uNear: { value: 1 },
        uFar: { value: 1000 },
        uTan: { value: new Vector2(1, 1) },
        uFade: { value: new Vector2(4000, 9000) },
        uInk: { value: new Color('#1d140c').convertSRGBToLinear() },
        uWash: { value: new Color('#c9a77a').convertSRGBToLinear() },
        uToon: { value: 0.3 },
        uGrain: { value: 0.08 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** The offscreen buffer, (re)made at the canvas's drawing size. */
  private ensure(): WebGLRenderTarget {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x);
    const h = Math.max(1, this.size.y);
    if (this.target && this.target.width === w && this.target.height === h) return this.target;
    this.target?.dispose();
    const depth = new DepthTexture(w, h);
    depth.type = UnsignedIntType;
    // half floats keep the dark night tones free of banding; no multisampling: the ink lines cover
    // the silhouettes' stair-steps, and a multisampled buffer cost ~35% more frame time (measured)
    this.target = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      samples: 0,
      depthTexture: depth,
    });
    const u = this.mat.uniforms;
    u.tColor.value = this.target.texture;
    u.tDepth.value = depth;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uPx.value = Math.max(1, Math.round(r.getPixelRatio()));
    return this.target;
  }

  /** Draws the scene through the ink pass. `focus` is the camera's distance to its target. */
  render(scene: Scene, camera: PerspectiveCamera, focus: number): void {
    const r = this.renderer;
    const target = this.ensure();
    const u = this.mat.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    u.uTan.value.set(t * camera.aspect, t);
    u.uFade.value.set(focus + 1200, focus + 5200);
    // count both draws in renderer.info (the stats read the frame as a whole)
    r.info.autoReset = false;
    r.info.reset();
    r.setRenderTarget(target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
    r.info.autoReset = true;
  }

  dispose(): void {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
