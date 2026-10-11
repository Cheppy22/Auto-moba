import {
  BackSide,
  type BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshPhongMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
  Euler,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { styleEmblem } from '../emblems';
import {
  ARM_L,
  ARM_R,
  BONES,
  buildFigure,
  CAPE,
  type FigureDef,
  HEAD,
  LEG_L,
  LEG_R,
  ORBIT,
  type PieceId,
  TORSO,
} from './figures';
import { merge } from './mesh';
import { TEAM, TABLE } from './palette';

/** Figure units to world units: the King stands 190 world units tall (miniature scale). */
export const FIG_SCALE = 1.9;

/** Shared GPU resources for every figure (geometry cache, the ink width uniform). */
export class FigureLib {
  /** Outline width in world units; the view sets it from the camera so it stays about 1 px. */
  readonly ink = { value: 3 };
  private readonly geos = new Map<
    string,
    { geo: BufferGeometry; hull: BufferGeometry; def: FigureDef }
  >();

  get(
    piece: PieceId,
    team: 'A' | 'B',
    style: string | null,
  ): { geo: BufferGeometry; hull: BufferGeometry; def: FigureDef } {
    const key = `${piece}:${team}:${style ?? '-'}`;
    let e = this.geos.get(key);
    if (!e) {
      const def = buildFigure(piece, team, style);
      const geo = merge(def.parts);
      const h = geo.clone();
      for (const name of ['normal', 'color', 'aGlow']) h.deleteAttribute(name);
      const hull = mergeVertices(h, 0.05);
      hull.computeVertexNormals();
      h.dispose();
      e = { geo, hull, def };
      this.geos.set(key, e);
    }
    return e;
  }

  dispose(): void {
    for (const e of this.geos.values()) {
      e.geo.dispose();
      e.hull.dispose();
    }
    this.geos.clear();
  }
}

const BONE_HEAD = `attribute float aBone;\nattribute float aGlow;\nvarying float vGlow;\nuniform mat4 uBones[${BONES}];\n`;

/** Patches a material so `aBone` poses each vertex from the bone matrices. */
function skin(
  mat: MeshPhongMaterial | MeshDepthMaterial | MeshBasicMaterial,
  bones: Matrix4[],
  extra = '',
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBones = { value: bones };
    shader.vertexShader =
      BONE_HEAD +
      extra +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
mat4 boneM = uBones[int(aBone + 0.5)];
objectNormal = mat3(boneM) * objectNormal;
vGlow = aGlow;`,
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed = (uBones[int(aBone + 0.5)] * vec4(transformed, 1.0)).xyz;',
        );
  };
}

/** What a figure needs each frame. */
export interface FigureMotion {
  move: number;
  phase: number;
  /** Attack curve: snaps 0→1 on the blow, holds (impact frame), eases back. */
  attack: number;
  /** Wind-up before the next predicted blow (anticipation). */
  windup: number;
  flinch: number;
  time: number;
  /** Death: 0 alive, rising to 1 as the piece topples and sinks. */
  fall: number;
  /** Spawn: 0 just appeared (high above), 1 landed. */
  drop: number;
}

const _e = new Euler();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _t = new Matrix4();
const _u = new Matrix4();

const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * One chess piece as a skinned, faceted humanoid: one merged mesh posed by eight bone matrices in
 * the vertex shader, plus an inverted-hull ink outline. Two draw calls per piece.
 */
export class PieceFigure {
  readonly root = new Group();
  readonly piece: PieceId;
  readonly team: 'A' | 'B';
  readonly style: string | null;
  /** World height and half width at rest. */
  readonly height: number;
  readonly halfWidth: number;
  private readonly fig = new Group();
  private readonly def: FigureDef;
  private readonly bones: Matrix4[] = Array.from({ length: BONES }, () => new Matrix4());
  private readonly mat: MeshPhongMaterial;
  private readonly inkMat: MeshBasicMaterial;
  private readonly depth: MeshDepthMaterial;
  private readonly accent = new Color();
  private readonly seed: number;
  private popAt = -9;
  private pending = false;

  constructor(
    lib: FigureLib,
    piece: PieceId,
    team: 'A' | 'B',
    style: string | null,
    shadows: boolean,
  ) {
    this.piece = piece;
    this.team = team;
    this.style = style;
    const { geo, hull, def } = lib.get(piece, team, style);
    this.def = def;
    this.height = def.height * FIG_SCALE;
    this.halfWidth = def.halfWidth * FIG_SCALE;
    this.seed = (piece.charCodeAt(0) * 7 + (team === 'B' ? 3 : 0)) % 17;
    this.accent.set(style ? styleEmblem(style).color : TEAM[team].rim);
    const t = TEAM[team];

    this.mat = new MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      shininess: team === 'A' ? 26 : 40,
      specular: team === 'A' ? '#2a2620' : '#3a3e48',
    });
    skin(this.mat, this.bones);
    const base = this.mat.onBeforeCompile;
    const rim = new Color(t.rim);
    const rimK = t.rimK;
    this.mat.onBeforeCompile = (shader, r) => {
      base.call(this.mat, shader, r);
      shader.uniforms.uRim = { value: rim };
      shader.uniforms.uRimK = { value: rimK };
      shader.fragmentShader =
        'uniform vec3 uRim;\nuniform float uRimK;\nvarying float vGlow;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `{
  vec3 vd = normalize(vViewPosition);
  float rm = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 2.2);
  outgoingLight += uRim * rm * uRimK;
  outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.15 + totalEmissiveRadiance, vGlow);
}
#include <opaque_fragment>`,
        );
    };
    this.mat.customProgramCacheKey = () => 'table-figure';

    this.inkMat = new MeshBasicMaterial({ color: TABLE.ink, side: BackSide });
    const ink = lib.ink;
    this.inkMat.onBeforeCompile = (shader) => {
      shader.uniforms.uBones = { value: this.bones };
      shader.uniforms.uInk = ink;
      shader.vertexShader =
        `attribute float aBone;\nuniform mat4 uBones[${BONES}];\nuniform float uInk;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed += normalize(normal) * uInk / length(modelMatrix[0].xyz);
transformed = (uBones[int(aBone + 0.5)] * vec4(transformed, 1.0)).xyz;`,
        );
    };
    this.inkMat.customProgramCacheKey = () => 'table-figure-ink';

    this.depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    skin(this.depth, this.bones);
    this.depth.customProgramCacheKey = () => 'table-figure-depth';

    const mesh = new Mesh(geo, this.mat);
    mesh.castShadow = shadows;
    mesh.customDepthMaterial = this.depth;
    mesh.frustumCulled = false;
    const outline = new Mesh(hull, this.inkMat);
    outline.frustumCulled = false;
    this.fig.add(mesh, outline);
    this.fig.scale.setScalar(FIG_SCALE);
    this.root.add(this.fig);
    this.pose({ move: 0, phase: 0, attack: 0, windup: 0, flinch: 0, time: 0, fall: 0, drop: 1 });
  }

  /** The Rank 4 moment: the new look swells in, glowing in its style colour. */
  transform(): void {
    this.pending = true;
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Bone matrix: T(pivot + off) · R · S · T(-pivot). */
  private bone(i: number, rx: number, ry: number, rz: number, ox = 0, oy = 0, oz = 0, s = 1): void {
    const pv = this.def.pivots[i];
    _t.compose(
      _p.set(pv[0] + ox, pv[1] + oy, pv[2] + oz),
      _q.setFromEuler(_e.set(rx, ry, rz)),
      _s.set(s, s, s),
    );
    _u.makeTranslation(-pv[0], -pv[1], -pv[2]);
    this.bones[i].multiplyMatrices(_t, _u);
  }

  pose(m: FigureMotion): void {
    const d = this.def;
    const g = d.gait;
    const t = m.time + this.seed;
    const mv = m.move;
    const idle = 1 - mv;
    const ph = m.phase * g.freq;
    const sw = Math.sin(ph);
    const co = Math.cos(ph);
    const A = m.attack;
    const W = m.windup;
    const F = m.flinch;
    const [rRx, rRz] = d.restR;
    const [rLx, rLz] = d.restL;

    // whole figure: hop on each step, lean into the run, wind back, lunge, recoil
    let y = Math.abs(sw) * g.bob * mv + Math.sin(t * 2.1) * 0.25 * idle;
    let z = -F * 3;
    let rx = g.lean * mv - F * 0.3;
    let ry = -sw * g.roll * 0.6 * mv;
    let sy = 1 + Math.sin(t * 2.1) * 0.012 * idle - F * 0.05;
    let sxz = 1 + F * 0.04;

    let aRx = rRx + sw * g.arm * mv * 0.6;
    let aLx = rLx - sw * g.arm * mv;
    let aRz = rRz + F * 0.5;
    let aLz = rLz - F * 0.5;
    let headX = -F * 0.4 - g.lean * mv * 0.7;
    switch (d.gesture) {
      case 'strike':
        aRx += -W * 2.2 - A * 0.65;
        aLx += -A * 0.3 + W * 0.2;
        z += A * g.thrust - W * 2;
        rx += A * 0.16 - W * 0.12;
        ry += -W * 0.35 + A * 0.28;
        sy -= A * 0.05;
        sxz += A * 0.03;
        break;
      case 'thrust':
        aRx += -A * 1.15 + W * 0.55;
        aLx += -A * 0.95 + W * 0.4;
        z += A * g.thrust * 1.6 - W * 3;
        rx += A * 0.2 - W * 0.08;
        sy -= A * 0.04;
        break;
      case 'cast':
        aRx += -A * 2.3 - W * 0.4;
        aLx += -A * 2.1 - W * 0.3;
        aRz += W * 0.35 - A * 0.25;
        aLz -= W * 0.35 - A * 0.25;
        y += A * 3;
        headX -= A * 0.25;
        rx -= A * 0.08;
        break;
      case 'shoot': {
        const aim = Math.max(W, A, mv < 0.3 ? 0 : 0);
        aLx = (1 - aim) * aLx + aim * -1.45;
        aRx = (1 - aim) * aRx + aim * (-1.35 + W * 0.25) + A * 0.5;
        aRz += W * 0.4;
        ry += aim * 0.45;
        z -= A * 2.5;
        break;
      }
      case 'slam':
        aRx += -W * 2.7 - A * 0.4;
        aLx += -W * 2.7 - A * 0.4;
        rx += -W * 0.12 + A * 0.18;
        y -= A * 3;
        sy -= A * 0.1;
        sxz += A * 0.07;
        break;
    }

    // death: topple backwards, bounce, slide, sink; spawn: drop in and squash on landing
    if (m.fall > 0) {
      const f = m.fall;
      const tip =
        f < 0.42 ? (f / 0.42) ** 2 : 1 + Math.sin(clamp01((f - 0.42) / 0.18) * Math.PI) * -0.06;
      rx -= tip * (Math.PI / 2) * 0.96;
      z -= f * 14;
      y += f < 0.42 ? 0 : -clamp01((f - 0.65) / 0.35) * 18;
      const shrink = 1 - ease(clamp01((f - 0.7) / 0.3));
      sy *= shrink;
      sxz *= shrink;
    }
    if (m.drop < 1) {
      const dd = m.drop;
      y += (1 - dd) * (1 - dd) * 70;
      const land = clamp01((dd - 0.8) / 0.2);
      sy *= 1 - Math.sin(land * Math.PI) * 0.18;
      sxz *= 1 + Math.sin(land * Math.PI) * 0.1;
    }

    const f = this.fig;
    f.position.set(0, y * FIG_SCALE, z * FIG_SCALE);
    f.rotation.set(rx, ry, 0);

    // Rank 4: swell and glow in the style colour
    if (this.pending) {
      this.pending = false;
      this.popAt = m.time;
    }
    const pop = Math.max(0, 1 - (m.time - this.popAt) / 1.1);
    const swell = pop > 0 ? Math.sin(pop * Math.PI) * 0.22 : 0;
    f.scale.set(
      FIG_SCALE * (sxz + swell),
      FIG_SCALE * (sy + swell * 1.3),
      FIG_SCALE * (sxz + swell),
    );

    // legs swing opposite each other, lifting the forward foot
    const step = g.stride * mv;
    this.bone(TORSO, 0, 0, 0);
    this.bone(LEG_R, -sw * step - A * 0.3, 0, 0, 0, Math.max(0, co) * g.lift * mv, 0);
    this.bone(LEG_L, sw * step + A * 0.2, 0, 0, 0, Math.max(0, -co) * g.lift * mv, 0);
    this.bone(ARM_R, aRx, 0, aRz);
    this.bone(ARM_L, aLx, 0, aLz);
    this.bone(
      HEAD,
      headX,
      Math.sin(t * 0.7) * 0.25 * idle,
      0,
      0,
      Math.sin(t * 2.1 + 0.6) * 0.25,
      0,
    );
    this.bone(
      CAPE,
      0.05 + mv * (0.15 + g.lean * 1.5) + Math.sin(t * 2.6) * 0.04 + A * 0.15 + W * 0.1,
      0,
      sw * 0.08 * mv,
    );
    this.bone(
      ORBIT,
      0,
      d.orbit ? t * (1.1 + A * 4) : 0,
      0,
      0,
      d.orbit ? Math.sin(t * 1.7) * 2 : 0,
      0,
    );

    const ac = this.accent;
    const k = pop * 0.7;
    this.mat.emissive.setRGB(F * 0.55 + ac.r * k, F * 0.5 + ac.g * k, F * 0.45 + ac.b * k);
  }

  dispose(): void {
    this.mat.dispose();
    this.inkMat.dispose();
    this.depth.dispose();
  }
}
