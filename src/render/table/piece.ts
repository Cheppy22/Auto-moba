import {
  BackSide,
  type BufferGeometry,
  Color,
  type ColorRepresentation,
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
import { hullOf } from './crowd';
import { LOOK, TEAM } from './palette';

/** Figure units to world units at the prototype size (its King stood 190 world units tall). */
export const FIG_SCALE = 1.9;

/**
 * Size multiplier on the prototype miniatures for the current screen shape; the view sets it on
 * every refit so the on-screen height is `LOOK.size` of the prototype's whatever the tilt.
 * Pawns, pawnlings, bases and rings follow it.
 */
export const SIZE = { k: LOOK.size };

/** Size multiplier that keeps the on-screen height at `LOOK.size` of the prototype's. */
export function sizeFor(tiltDeg: number, protoTiltDeg: number): number {
  const r = Math.PI / 180;
  return (LOOK.size * Math.cos(protoTiltDeg * r)) / Math.cos(tiltDeg * r);
}

/** Shared GPU resources for every figure (geometry cache, the ink width uniform). */
export class FigureLib {
  /** Outline width per team in world units; the view sets it from the camera (a fixed px width). */
  readonly ink = { A: { value: 3 }, B: { value: 3 } };
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
      const hull = hullOf(geo, ['aBone']);
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
  /** A struck blow's strength (0 none, about 1 normal, up to 1.5 big): squash and a flash on the outline. */
  hit?: number;
  /** Teleport: 0 present, 1 beamed away (stretched into a thin column of light). */
  warp?: number;
  /** Opacity, 1 normally; below 1 only for the reduced-motion teleport fade. */
  fade?: number;
  /** Reduced motion: a hit flashes the outline but does not squash or rock the piece. */
  still?: boolean;
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
  /** World height and half width at rest (at the current size). */
  get height(): number {
    return this.def.height * FIG_SCALE * SIZE.k;
  }
  get halfWidth(): number {
    return this.def.halfWidth * FIG_SCALE * SIZE.k;
  }
  private readonly fig = new Group();
  private readonly def: FigureDef;
  private readonly bones: Matrix4[] = Array.from({ length: BONES }, () => new Matrix4());
  private readonly mat: MeshPhongMaterial;
  private readonly inkMat: MeshBasicMaterial;
  private readonly depth: MeshDepthMaterial;
  private readonly accent = new Color();
  private readonly glow = new Color();
  private readonly inkBase = new Color();
  private readonly hitCol = new Color();
  private readonly inkK = { value: 1 };
  private opacity = 1;
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
    this.seed = (piece.charCodeAt(0) * 7 + (team === 'B' ? 3 : 0)) % 17;
    this.accent.set(style ? styleEmblem(style).color : TEAM[team].rim);
    const t = TEAM[team];
    this.glow.set(t.halo);
    this.inkBase.set(t.ink);

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
    const lift = t.lift;
    this.mat.onBeforeCompile = (shader, r) => {
      base.call(this.mat, shader, r);
      shader.uniforms.uRim = { value: rim };
      shader.uniforms.uRimK = { value: rimK };
      shader.uniforms.uLift = { value: lift };
      shader.fragmentShader =
        'uniform vec3 uRim;\nuniform float uRimK;\nuniform float uLift;\nvarying float vGlow;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `{
  vec3 vd = normalize(vViewPosition);
  float rm = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 2.2);
  outgoingLight += uRim * rm * uRimK + diffuseColor.rgb * uLift;
  outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.15 + totalEmissiveRadiance, vGlow);
}
#include <opaque_fragment>`,
        );
    };
    this.mat.customProgramCacheKey = () => 'table-figure';

    this.inkMat = new MeshBasicMaterial({ color: t.ink, side: BackSide });
    const ink = lib.ink[team];
    this.inkMat.onBeforeCompile = (shader) => {
      shader.uniforms.uBones = { value: this.bones };
      shader.uniforms.uInk = ink;
      shader.uniforms.uInkK = this.inkK;
      shader.vertexShader =
        `attribute float aBone;\nuniform mat4 uBones[${BONES}];\nuniform float uInk;\nuniform float uInkK;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed += normalize(normal) * uInk * uInkK / length(modelMatrix[0].xyz);
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

  /** The colour the outline flashes toward on a hit (the attacker's team colour). */
  setHitColor(c: ColorRepresentation): void {
    this.hitCol.set(c);
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.upright();
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  /**
   * A captured piece knocked flying: the figure tumbles about its middle (`pivot` world units above
   * its feet), which travels to (x, cy, z); `pitch` tips it toward `yaw`, `roll` sideways.
   */
  fling(
    x: number,
    cy: number,
    z: number,
    yaw: number,
    pitch: number,
    roll: number,
    pivot: number,
    scale: number,
  ): void {
    const r = this.root;
    r.rotation.set(pitch, yaw, roll, 'YXZ');
    r.scale.setScalar(scale);
    _p.set(0, pivot * scale, 0).applyEuler(r.rotation);
    r.position.set(x - _p.x, cy - _p.y, z - _p.z);
  }

  /** Back to standing upright (after a fling). */
  private upright(): void {
    const r = this.root;
    if (r.rotation.x !== 0 || r.rotation.z !== 0 || r.scale.x !== 1) {
      r.rotation.set(0, r.rotation.y, 0, 'XYZ');
      r.scale.setScalar(1);
    }
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
    const H = m.hit ?? 0;
    const Hs = m.still ? 0 : H;
    const WP = m.warp ?? 0;
    // a struck blow squashes the piece and rocks it back on top of the small flinch
    const F = m.flinch + Hs * 0.6;
    const [rRx, rRz] = d.restR;
    const [rLx, rLz] = d.restL;

    // whole figure: hop on each step, lean into the run, wind back, lunge, recoil
    let y = Math.abs(sw) * g.bob * mv + Math.sin(t * 2.1) * 0.25 * idle;
    let z = -F * 3;
    let rx = g.lean * mv - F * 0.3;
    let ry = -sw * g.roll * 0.6 * mv;
    let sy = 1 + Math.sin(t * 2.1) * 0.012 * idle - F * 0.05 - Hs * 0.09;
    let sxz = 1 + F * 0.04 + Hs * 0.06;

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

    // teleport: stretch into a thin tall column of light (leaving) or condense out of one (arriving)
    if (WP > 0) {
      const w = clamp01(WP);
      sy *= 1 + w * w * 0.9;
      sxz *= Math.max(0.12, 1 - w * 0.92);
      y += w * w * 22;
    }

    const f = this.fig;
    const S = FIG_SCALE * SIZE.k;
    f.position.set(0, y * S, z * S);
    f.rotation.set(rx, ry, 0);

    // Rank 4: swell and glow in the style colour
    if (this.pending) {
      this.pending = false;
      this.popAt = m.time;
    }
    const pop = Math.max(0, 1 - (m.time - this.popAt) / 1.1);
    const swell = pop > 0 ? Math.sin(pop * Math.PI) * 0.22 : 0;
    f.scale.set(S * (sxz + swell), S * (sy + swell * 1.3), S * (sxz + swell));

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
    // hit flash is a warm ember, never white, so a struck ebony piece still reads as Black
    const wg = clamp01(WP) * 0.85;
    const gl = this.glow;
    // body flash: the old warm ember for the flinch, a hint of the attacker's colour for a blow
    const Fe = m.flinch;
    const hc = this.hitCol;
    const hb = Math.min(1, H) * 0.22;
    this.mat.emissive.setRGB(
      Fe * 0.42 + ac.r * k + gl.r * wg + hc.r * hb,
      Fe * 0.12 + ac.g * k + gl.g * wg + hc.g * hb,
      Fe * 0.04 + ac.b * k + gl.b * wg + hc.b * hb,
    );
    // outline: flashes toward the attacker's colour and thickens on a hit
    const hk = Math.min(1, H * 1.1);
    this.inkMat.color.copy(this.inkBase).lerp(this.hitCol, hk);
    this.inkK.value = 1 + H * 1.1;
    // opacity only moves for the reduced-motion teleport fade
    const op = m.fade ?? 1;
    if (op !== this.opacity) {
      this.opacity = op;
      const clear = op < 0.999;
      if (this.mat.transparent !== clear) {
        // the opaque shader variant ignores alpha, so switching needs a (cached) recompile
        this.mat.transparent = clear;
        this.inkMat.transparent = clear;
        this.mat.needsUpdate = true;
        this.inkMat.needsUpdate = true;
      }
      this.mat.opacity = op;
      this.inkMat.opacity = op;
    }
  }

  dispose(): void {
    this.mat.dispose();
    this.inkMat.dispose();
    this.depth.dispose();
  }
}
