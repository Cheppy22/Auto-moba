import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { MapDef } from '../../sim';
import type { MapStyleId } from './longlook';
import type { LongRelief } from './relief';
import { TERRACE } from './relief';

/**
 * The life pass on the Long Board: weather drifting over the garden, ripples on the river and the
 * lake, a flock of birds circling over the water and a slow drift in
 * the light. Everything moves in the vertex shader from one time uniform, so the whole pass costs
 * four draw calls and no per-frame work beyond setting uniforms. It is decoration only: it never
 * reads units, and with reduced motion it is hidden.
 */

/** How the weather looks per theme: a cool night drizzle with pale motes, or warm fireflies and leaves. */
interface Weather {
  motes: { color: string; n: number; size: number; alpha: number; pulse: number };
  fall:
    | { kind: 'rain'; color: string; n: number; size: number; alpha: number; speed: number }
    | { kind: 'leaves'; colors: [string, string]; n: number; size: number; speed: number };
  birds: string;
  ripple: string;
}

const WEATHER: Record<MapStyleId, Weather> = {
  a: {
    motes: { color: '#bfe3f0', n: 110, size: 9, alpha: 0.6, pulse: 0.35 },
    fall: { kind: 'rain', color: '#cfe6f5', n: 260, size: 2.2, alpha: 0.2, speed: 900 },
    birds: '#8fa3b3',
    ripple: '#d6ecf7',
  },
  b: {
    motes: { color: '#ffc864', n: 110, size: 15, alpha: 1, pulse: 1 },
    fall: { kind: 'leaves', colors: ['#c4692e', '#e0a443'], n: 60, size: 17, speed: 55 },
    birds: '#d2b98c',
    ripple: '#ffe2a8',
  },
};

/** The weather box: it follows the camera's target and wraps (world units). */
const BOX = new Vector3(2600, 520, 2600);
const BIRDS = 9;
const RIPPLES = 46;

type Shader = WebGLProgramParametersWithUniforms;

function dotTexture(soft: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.72, 'rgba(255,255,255,0)');
    r.addColorStop(0.82, 'rgba(255,255,255,1)');
    r.addColorStop(0.92, 'rgba(255,255,255,0.4)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A seeded random in [0, 1) (decoration only; the sim's random is never touched). */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A quad of `n` instances with a per-instance vec4 of random numbers. */
function quads(n: number, seed: number): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  const q = new PlaneGeometry(1, 1);
  g.index = q.index;
  g.setAttribute('position', q.getAttribute('position'));
  g.setAttribute('uv', q.getAttribute('uv'));
  const r = rng(seed);
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = r();
  g.setAttribute('aSeed', new InstancedBufferAttribute(a, 4));
  g.instanceCount = n;
  q.dispose();
  return g;
}

export class Life {
  readonly group = new Group();
  private readonly owned: { dispose(): void }[] = [];
  private readonly u = {
    uTime: { value: 0 },
    uCenter: { value: new Vector3() },
    uBox: { value: BOX.clone() },
  };
  private readonly motes: Mesh;
  private readonly fall: Mesh;
  private readonly ripples: Mesh;
  private readonly birds: Mesh;
  private readonly moteMat: MeshBasicMaterial;
  private readonly fallMat: MeshBasicMaterial;
  private readonly rippleMat: MeshBasicMaterial;
  private readonly birdMat: MeshBasicMaterial;
  private readonly moteU = { uSize: { value: 7 }, uPulse: { value: 0.3 } };
  private readonly fallU = { uSize: { value: 2 }, uSpeed: { value: 900 }, uLeaf: { value: 0 } };
  private readonly leafA = new Color();
  private readonly leafB = new Color();
  private theme: MapStyleId | null = null;

  constructor(
    private readonly map: MapDef,
    private readonly relief: LongRelief,
    theme: MapStyleId,
  ) {
    const own = <T extends { dispose(): void }>(x: T): T => {
      this.owned.push(x);
      return x;
    };
    const soft = own(dotTexture(true));
    const ring = own(dotTexture(false));

    // motes / fireflies: soft dots drifting and bobbing, pulsing in brightness
    this.moteMat = own(
      new MeshBasicMaterial({
        map: soft,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.patch(this.moteMat, 'life-motes', this.moteU, {
      vars: 'uniform float uSize;\nuniform float uPulse;',
      body: `
  vec3 p = aSeed.xyz * uBox;
  float ph = aSeed.w * 6.2832;
  p += vec3(sin(uTime * 0.31 + ph) * 60.0 + uTime * 9.0,
            sin(uTime * 0.53 + ph * 1.7) * 28.0,
            cos(uTime * 0.27 + ph) * 60.0 + uTime * 4.0);
  p = wrapBox(p);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  mvPosition.xy += position.xy * uSize * (0.6 + aSeed.w * 0.8);
  gl_Position = projectionMatrix * mvPosition;
  vLife = (1.0 - uPulse) + uPulse * max(0.0, sin(uTime * (0.8 + aSeed.y * 1.6) + ph * 3.0));`,
    });
    this.motes = new Mesh(own(quads(140, 11)), this.moteMat);

    // the falling layer: drizzle streaks (a) or tumbling leaves (b)
    this.fallMat = own(new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.patch(this.fallMat, 'life-fall', this.fallU, {
      vars: 'uniform float uSize;\nuniform float uSpeed;\nuniform float uLeaf;',
      body: `
  vec3 p = aSeed.xyz * uBox;
  float ph = aSeed.w * 6.2832;
  float sp = uSpeed * (0.75 + aSeed.w * 0.5);
  p.y -= uTime * sp;
  p.x += uTime * sp * mix(0.12, 0.35, uLeaf) + uLeaf * sin(uTime * 1.3 + ph) * 40.0;
  p.z += uLeaf * cos(uTime * 1.1 + ph) * 40.0;
  p = wrapBox(p);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  vec2 q = position.xy;
  if (uLeaf > 0.5) {
    float a = uTime * (1.5 + aSeed.x * 2.0) + ph;
    q.x *= 0.35 + 0.65 * abs(sin(a * 1.3));
    q = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
    q *= uSize * (0.7 + aSeed.z * 0.6);
  } else {
    q *= vec2(uSize, uSize * 16.0);
  }
  mvPosition.xy += q;
  gl_Position = projectionMatrix * mvPosition;
  vLife = 0.55 + 0.45 * aSeed.y;
  vQ = position.xy;`,
      // a leaf: an almond with a pale midrib; a raindrop: a streak soft at its sides
      color: `
  if (uLeaf > 0.5) {
    if (abs(vQ.x) * 2.0 + pow(abs(vQ.y) * 2.0, 2.0) > 1.0) discard;
    diffuseColor.rgb = mix(diffuseColor.rgb, uLeafB, step(0.775, vLife));
    diffuseColor.rgb *= 0.8 + 0.4 * smoothstep(0.06, 0.0, abs(vQ.x));
  } else diffuseColor.a *= 1.0 - abs(vQ.x) * 2.0;`,
    });
    this.fall = new Mesh(own(quads(260, 23)), this.fallMat);

    // ripples: rings that open and fade on the river and the lake, each on its own clock
    this.rippleMat = own(
      new MeshBasicMaterial({
        map: ring,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        opacity: 0.5,
      }),
    );
    const rg = own(new InstancedBufferGeometry());
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    rg.index = flat.index;
    rg.setAttribute('position', flat.getAttribute('position'));
    rg.setAttribute('uv', flat.getAttribute('uv'));
    flat.dispose();
    rg.setAttribute('aSeed', new InstancedBufferAttribute(this.rippleSites(), 4));
    rg.instanceCount = RIPPLES;
    this.patch(
      this.rippleMat,
      'life-ripple',
      {},
      {
        vars: '',
        body: `
  float age = fract(uTime / (3.0 + fract(aSeed.w * 7.0) * 3.0) + aSeed.w);
  vec3 p = aSeed.xyz + position * mix(8.0, 64.0 + fract(aSeed.w * 13.0) * 40.0, age);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vLife = (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.08, age);`,
      },
    );
    this.ripples = new Mesh(rg, this.rippleMat);

    // birds: a loose flock circling wide over the water, wings beating then gliding
    this.birdMat = own(new MeshBasicMaterial({ side: DoubleSide }));
    const bg = own(this.birdGeometry());
    this.patch(
      this.birdMat,
      'life-birds',
      {},
      {
        vars: `uniform vec2 uOrbit;`,
        body: `
  float ph = aSeed.w * 6.2832;
  float ang = uTime * (0.045 + aSeed.x * 0.01) + aSeed.y * 0.9;
  vec2 c = vec2(cos(ang), sin(ang)) * uOrbit * (1.0 + aSeed.z * 0.12);
  float h = 520.0 + aSeed.z * 260.0 + sin(uTime * 0.4 + ph) * 30.0;
  vec2 dir = normalize(vec2(-sin(ang) * uOrbit.x, cos(ang) * uOrbit.y));
  float beat = sin(uTime * 9.0 + ph) * step(0.35, fract(uTime * 0.07 + aSeed.w));
  vec3 lp = position * (44.0 + aSeed.x * 14.0);
  lp.y += abs(lp.x) * beat * 0.55;
  vec3 p = vec3(c.x, h, c.y);
  p.x += dir.x * lp.z + dir.y * lp.x;
  p.z += dir.y * lp.z - dir.x * lp.x;
  p.y += lp.y;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vLife = 1.0;`,
        extra: { uOrbit: { value: [map.size / 2 + 1300, (map.length ?? map.size) / 2 + 900] } },
      },
    );
    this.birds = new Mesh(bg, this.birdMat);

    for (const m of [this.motes, this.fall, this.ripples, this.birds]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.motes.renderOrder = 5;
    this.fall.renderOrder = 5;
    this.ripples.renderOrder = 1;
    this.setTheme(theme);
  }

  /** Points on open water: the river band (where the relief is at water level) and the lake near the island. */
  private rippleSites(): Float32Array {
    const r = rng(97);
    const out = new Float32Array(RIPPLES * 4);
    const hx = this.map.size / 2;
    const hz = (this.map.length ?? this.map.size) / 2;
    const river = this.map.terraces?.river ?? 250;
    let n = 0;
    for (let tries = 0; n < RIPPLES && tries < 4000; tries++) {
      let x: number;
      let z: number;
      let y: number;
      if (n % 2 === 0) {
        x = (r() * 2 - 1) * (hx + 300);
        z = (r() * 2 - 1) * river * 0.9;
        const g = this.relief.at(x, z);
        if (g > TERRACE.water + 3) continue;
        y = TERRACE.water + 1.5;
      } else {
        // the lake, a ring out past the bank (the island is the board plus its apron)
        const a = r() * Math.PI * 2;
        const d = 420 + r() * 700;
        x = Math.cos(a) * (hx + d);
        z = Math.sin(a) * (hz + d);
        y = TERRACE.lake + 9.5;
      }
      out.set([x, y, z, r()], n * 4);
      n++;
    }
    return out;
  }

  /** A bird: a small body and two swept wings (x across, z forward), one instance per bird. */
  private birdGeometry(): InstancedBufferGeometry {
    const g = new InstancedBufferGeometry();
    // prettier-ignore
    const p = [
      // left wing, right wing (tips swept back), body
      0, 0, 0.35, -1, 0.05, -0.25, 0, 0, -0.2,
      0, 0, 0.35, 0, 0, -0.2, 1, 0.05, -0.25,
      0, 0, 0.55, -0.12, 0, -0.5, 0.12, 0, -0.5,
    ];
    const b = new BufferGeometry();
    b.setAttribute('position', new Float32BufferAttribute(p, 3));
    g.setAttribute('position', b.getAttribute('position'));
    const r = rng(41);
    const a = new Float32Array(BIRDS * 4);
    for (let i = 0; i < a.length; i++) a[i] = r();
    // a loose flock: the birds share most of their orbit
    for (let i = 0; i < BIRDS; i++) a[i * 4 + 1] = i * 0.07 + a[i * 4 + 1] * 0.05;
    g.setAttribute('aSeed', new InstancedBufferAttribute(a, 4));
    g.instanceCount = BIRDS;
    b.dispose();
    return g;
  }

  /**
   * Shared shader patch: the per-instance seed, the time, the weather box round the camera, a
   * `vLife` varying that scales the alpha. `body` replaces the vertex projection.
   */
  private patch(
    mat: Material,
    key: string,
    uniforms: Record<string, { value: unknown }>,
    src: { vars: string; body: string; color?: string; extra?: Record<string, { value: unknown }> },
  ): void {
    mat.onBeforeCompile = (sh: Shader) => {
      Object.assign(sh.uniforms, this.u, uniforms, src.extra ?? {});
      if (key === 'life-fall') sh.uniforms.uLeafB = { value: this.leafB };
      sh.vertexShader = `attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
varying float vLife;
varying vec2 vQ;
${src.vars}
vec3 wrapBox(vec3 p) {
  vec3 lo = uCenter - vec3(uBox.x * 0.5, 0.0, uBox.z * 0.5);
  return lo + mod(p - lo, uBox);
}
${sh.vertexShader}`.replace('#include <project_vertex>', src.body);
      sh.fragmentShader = `varying float vLife;
varying vec2 vQ;
${key === 'life-fall' ? 'uniform vec3 uLeafB;\nuniform float uLeaf;' : ''}
${sh.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.a *= vLife;
  ${src.color ?? ''}`,
      );
    };
    mat.customProgramCacheKey = () => key;
  }

  setTheme(theme: MapStyleId): void {
    if (theme === this.theme) return;
    this.theme = theme;
    const w = WEATHER[theme];
    this.moteMat.color.set(w.motes.color);
    this.moteMat.opacity = w.motes.alpha;
    this.moteU.uSize.value = w.motes.size;
    this.moteU.uPulse.value = w.motes.pulse;
    (this.motes.geometry as InstancedBufferGeometry).instanceCount = w.motes.n;
    const f = w.fall;
    const fg = this.fall.geometry as InstancedBufferGeometry;
    fg.instanceCount = f.n;
    this.fallU.uSize.value = f.size;
    this.fallU.uSpeed.value = f.speed;
    if (f.kind === 'rain') {
      this.fallU.uLeaf.value = 0;
      this.fallMat.color.set(f.color);
      this.fallMat.opacity = f.alpha;
      this.fallMat.blending = AdditiveBlending;
      this.fallMat.side = DoubleSide;
    } else {
      this.fallU.uLeaf.value = 1;
      this.leafA.set(f.colors[0]);
      this.leafB.set(f.colors[1]);
      this.fallMat.color.copy(this.leafA);
      this.fallMat.opacity = 0.95;
      this.fallMat.blending = NormalBlending;
      this.fallMat.side = DoubleSide;
    }
    this.fallMat.needsUpdate = true;
    this.rippleMat.color.set(w.ripple);
    this.rippleMat.opacity = theme === 'a' ? 0.4 : 0.32;
    this.birdMat.color.set(w.birds);
  }

  /**
   * Each frame: the clock (the view's effect clock, so the bell's halt and a capture's hit-stop
   * slow it too) and where the weather box sits (the camera's target).
   */
  update(time: number, x: number, z: number, reduced: boolean): void {
    this.u.uTime.value = reduced ? 0 : time;
    this.u.uCenter.value.set(x, this.relief.at(x, z) - 40, z);
    this.motes.visible = !reduced;
    this.fall.visible = !reduced;
    this.ripples.visible = !reduced;
    this.birds.visible = !reduced;
  }

  /** Draw calls this pass adds while visible. */
  get calls(): number {
    return this.group.children.filter((c) => c.visible).length;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
  }
}
