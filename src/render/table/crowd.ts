import {
  BackSide,
  BufferGeometry,
  Color,
  type ColorRepresentation,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Welded copy of a model (position plus the kept attributes) with smooth normals, for outlines. */
export function hullOf(geo: BufferGeometry, keep: string[] = []): BufferGeometry {
  const h = new BufferGeometry();
  h.setAttribute('position', geo.getAttribute('position').clone());
  for (const k of keep) {
    const a = geo.getAttribute(k);
    if (a) h.setAttribute(k, a.clone());
  }
  const hull = mergeVertices(h, 0.05);
  hull.computeVertexNormals();
  h.dispose();
  return hull;
}

/** Inverted-hull outline for instanced crowds: `ink` is the width in world units. */
export function crowdInk(color: ColorRepresentation, ink: { value: number }): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color, side: BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uInk = ink;
    shader.vertexShader =
      'uniform float uInk;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
transformed += normalize(normal) * uInk / length(instanceMatrix[0].xyz);
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'table-crowd-ink';
  return m;
}

/**
 * The faceted material every static model shares: vertex colours, flat shading, a soft
 * specular, a cool rim and unlit "glow" vertices (aGlow). One shader program for the board.
 */
export function facetMaterial(
  rim: ColorRepresentation = '#9fb8ff',
  rimK = 0.35,
): MeshPhongMaterial {
  const m = new MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 22,
    specular: '#262320',
  });
  const rimC = new Color(rim);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rimC };
    shader.uniforms.uRimK = { value: rimK };
    shader.vertexShader =
      'attribute float aGlow;\nvarying float vGlow;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGlow = aGlow;',
      );
    shader.fragmentShader =
      'uniform vec3 uRim;\nuniform float uRimK;\nvarying float vGlow;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
  vec3 vd = normalize(vViewPosition);
  float rm = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 2.2);
  outgoingLight += uRim * rm * uRimK;
  outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.15, vGlow);
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `table-facet-${rimK}`;
  return m;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

/** An instanced set redrawn every frame: begin(), add() per member, end(). */
export class Crowd {
  readonly mesh: InstancedMesh;
  /** Optional outline drawn from the same instance matrices. */
  ink: InstancedMesh | null = null;
  private n = 0;

  constructor(
    geo: BufferGeometry,
    mat: Material,
    readonly cap: number,
    colors = false,
  ) {
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    if (colors) {
      _c.set('#ffffff');
      for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, _c);
      this.mesh.instanceColor?.setUsage(DynamicDrawUsage);
    }
  }

  /** Adds an inverted-hull outline that shares this crowd's instance matrices. */
  outline(hull: BufferGeometry, mat: Material): InstancedMesh {
    const o = new InstancedMesh(hull, mat, this.cap);
    o.instanceMatrix = this.mesh.instanceMatrix;
    o.frustumCulled = false;
    o.count = 0;
    this.ink = o;
    return o;
  }

  begin(): void {
    this.n = 0;
  }

  /** Adds one member; returns its index (or -1 when full). Tilts are in the member's own frame. */
  add(
    x: number,
    y: number,
    z: number,
    yaw: number,
    s: number,
    tiltX = 0,
    tiltZ = 0,
    sy = s,
  ): number {
    if (this.n >= this.cap) return -1;
    _m.compose(
      _p.set(x, y, z),
      _q.setFromEuler(_e.set(tiltX, yaw, tiltZ, 'YXZ')),
      _s.set(s, sy, s),
    );
    this.mesh.setMatrixAt(this.n, _m);
    return this.n++;
  }

  /** Non-uniform scale (bases, shadows). */
  addXYZ(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): number {
    if (this.n >= this.cap) return -1;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0, 'YXZ')), _s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, _m);
    return this.n++;
  }

  addMatrix(m: Matrix4): number {
    if (this.n >= this.cap) return -1;
    this.mesh.setMatrixAt(this.n, m);
    return this.n++;
  }

  color(i: number, c: Color): void {
    if (i >= 0) this.mesh.setColorAt(i, c);
  }

  end(): void {
    this.mesh.count = this.n;
    if (this.ink) this.ink.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.ink?.geometry.dispose();
    this.ink?.dispose();
  }
}
