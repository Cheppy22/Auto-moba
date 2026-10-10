import {
  BackSide,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshToonMaterial,
  type Quaternion,
} from 'three';
import { styleEmblem } from '../emblems';
import { PALETTE } from '../theme';
import { buildRig, type PieceId, type Rig, SCHEMES, type Scheme } from './figures';
import { hash, INK, type Bit, type Kit, type Piece } from './kit';
import { type Gesture, type PropScheme, styleProps, type V3 } from './props';
import { WATER_Y } from './terrain';

export type { PieceId };

/** Pieces are drawn a little larger than their sim footprint so they read from the skycam. */
export const PIECE_SCALE = 1.3;

export const PIECE_IDS: readonly PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];

export function isPieceId(s: unknown): s is PieceId {
  return typeof s === 'string' && (PIECE_IDS as readonly string[]).includes(s);
}

/** Height of each piece's crown in model units (before PIECE_SCALE), for bars and badges. */
export const PIECE_HEIGHT: Record<PieceId, number> = {
  king: 44,
  queen: 48.5,
  rook: 34,
  bishop: 46,
  knight: 43,
};

/** The style colour (accent sash, props, ground ring), from the shared emblem table. */
export function styleAccent(style: string | null | undefined): string | null {
  return style ? styleEmblem(style).color : null;
}

function propScheme(team: 'A' | 'B', s: Scheme): PropScheme {
  return { body: s.body, shade: s.shade, trim: s.trim, cloak: s.cloak, dark: team === 'B' };
}

/** Moves bits so that `pivot` becomes the origin (for parts that rotate about a joint). */
function about(bits: Bit[], pivot: V3): Bit[] {
  return bits.map((b) => {
    const at = b.at ?? [0, 0, 0];
    return { ...b, at: [at[0] - pivot[0], at[1] - pivot[1], at[2] - pivot[2]] as V3 };
  });
}

const glow = (bits: Bit[] | undefined): Bit[] => (bits ?? []).map((b) => ({ ...b, glow: true }));

/** What the animation needs each frame. */
export interface PieceMotion {
  yaw: number;
  move: number;
  phase: number;
  lunge: number;
  flinch: number;
  time: number;
}

/** The bones of a figure, in the order their parts are merged. */
const PARTS = ['torso', 'head', 'armR', 'armL', 'legR', 'legL', 'cape'] as const;
type PartName = (typeof PARTS)[number];

interface PartBits {
  /** Bits relative to the part's joint. */
  local: Bit[];
  pivot: V3;
}

const shift = (bits: Bit[], d: V3): Bit[] =>
  bits.map((b) => {
    const at = b.at ?? [0, 0, 0];
    return { ...b, at: [at[0] + d[0], at[1] + d[1], at[2] + d[2]] as V3 };
  });

/**
 * A chess piece as a humanoid character: hips and two legs, a torso, a head, two arms and a cape.
 * The whole figure is one merged mesh (plus its ink outline): every vertex carries the index of
 * the bone that moves it and the vertex shader poses it from seven matrices, so a piece costs two
 * draw calls however many parts it has. The style adds its own colour and signature props to
 * the parts that carry them. When a piece dies it is cut into per-part meshes for the ragdoll.
 */
export class PieceModel {
  readonly root = new Group();
  /** Ground markers (ring, shadow): positioned with the root but never yawed. */
  readonly markers = new Group();
  readonly piece: PieceId;
  readonly team: 'A' | 'B';
  /** Crown height in world units at scale 1 (for bars and badges). */
  readonly height: number;
  private readonly figure = new Group();
  /** Joints: empty groups whose transforms drive the bone matrices (and carry ragdoll parts). */
  private readonly joint: Record<PartName, Group> = {
    torso: new Group(),
    head: new Group(),
    armR: new Group(),
    armL: new Group(),
    legR: new Group(),
    legL: new Group(),
    cape: new Group(),
  };
  private readonly bones: Matrix4[] = PARTS.map(() => new Matrix4());
  private readonly unpivot: Matrix4[] = PARTS.map(() => new Matrix4());
  private readonly cloth: MeshToonMaterial;
  private readonly rig: Rig;
  private readonly seed: number;
  private readonly restR: number;
  private readonly restL: number;
  private readonly lungeK: number;
  private readonly gesture: Gesture;
  private readonly kit: Kit;
  private readonly accent: string;
  private readonly accentColor = new Color();
  private spin: Mesh | null = null;
  private pending = false;
  private popAt = -9;
  private cut: Mesh[] = [];

  constructor(
    kit: Kit,
    piece: PieceId,
    team: 'A' | 'B',
    readonly style: string | null,
  ) {
    this.kit = kit;
    this.piece = piece;
    this.team = team;
    this.seed = hash(`${piece}${team}`) % 628;
    const emblem = styleEmblem(style);
    // a piece with no style yet wears plain team colours: no style colour, props or emblem
    this.accent = style ? emblem.color : SCHEMES[team].cloak;
    this.accentColor.set(this.accent);
    const made = this.assemble();
    const rig = made.rig;
    this.rig = rig;
    const s = made.scheme;
    this.height = rig.height;
    this.restR = made.props.restR ?? rig.restR;
    this.restL = made.props.restL ?? rig.restL;
    this.lungeK = made.props.lungeK ?? 1;
    this.gesture = made.props.gesture ?? 'strike';

    // joints at rest
    PARTS.forEach((name, i) => {
      const j = this.joint[name];
      j.position.set(...made.parts[name].pivot);
      this.unpivot[i].makeTranslation(
        -made.parts[name].pivot[0],
        -made.parts[name].pivot[1],
        -made.parts[name].pivot[2],
      );
      this.figure.add(j);
    });
    this.joint.armR.rotation.x = this.restR;
    this.joint.armL.rotation.x = this.restL;

    // materials: one lit cloth for the whole figure, one ink outline, both posed by the bones
    this.cloth = kit.uniqueVertexToon();
    const rim = new Color(s.rim);
    const k = s.rimK;
    const bones = this.bones;
    this.cloth.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = { value: rim };
      shader.uniforms.uRimK = { value: k };
      shader.uniforms.uBones = { value: bones };
      // `aBone` picks the bone matrix; `aGlow` marks vertices drawn unlit in their own colour
      shader.vertexShader =
        'attribute float aBone;\nattribute float aGlow;\nvarying float vGlow;\nuniform mat4 uBones[7];\n' +
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
            '#include <begin_vertex>\ntransformed = (boneM * vec4(transformed, 1.0)).xyz;',
          );
      shader.fragmentShader =
        'uniform vec3 uRim;\nuniform float uRimK;\nvarying float vGlow;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `{
  vec3 vd = normalize(vViewPosition);
  float rm = pow(1.0 - clamp(dot(normalize(normal), vd), 0.0, 1.0), 2.4);
  outgoingLight += uRim * rm * uRimK;
  outgoingLight = mix(outgoingLight, diffuseColor.rgb + totalEmissiveRadiance, vGlow);
}
#include <opaque_fragment>`,
        );
    };
    this.cloth.customProgramCacheKey = () => 'piece-bones';
    const ink = kit.own(new MeshBasicMaterial({ color: INK, side: BackSide }));
    ink.userData.ink = 0.8;
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.uInk = kit.inkWidth;
      shader.uniforms.uK = { value: 0.8 };
      shader.uniforms.uBones = { value: bones };
      shader.vertexShader =
        'attribute float aBone;\nuniform mat4 uBones[7];\nuniform float uInk;\nuniform float uK;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed += normalize(normal) * uInk * uK / length(modelMatrix[0].xyz);
transformed = (uBones[int(aBone + 0.5)] * vec4(transformed, 1.0)).xyz;`,
        );
    };
    ink.customProgramCacheKey = () => 'piece-ink-bones';

    const id = `${piece}:${team}:${style ?? '-'}`;
    const geo = kit.geo(`piece-figure:${id}`, () =>
      kit.merge(
        PARTS.flatMap((name, i) =>
          shift(made.parts[name].local, made.parts[name].pivot).map((b) => ({ ...b, bone: i })),
        ),
      ),
    );
    const mesh = new Mesh(geo, this.cloth);
    mesh.castShadow = true;
    mesh.add(new Mesh(kit.hull(geo), ink));
    this.figure.add(mesh);

    if (made.props.spin) {
      const spin = made.props.spin;
      this.spin = kit.inkedGlow(`piece-spin:${id}`, () => spin, 0.5);
      this.figure.add(this.spin);
    }
    this.root.add(this.figure);
    this.root.scale.setScalar(PIECE_SCALE);

    const ring = kit.styleRing(
      style ? this.accent : team === 'A' ? PALETTE.teamA : PALETTE.teamB,
      19,
    );
    ring.position.y = 0.9;
    this.markers.add(kit.blob(13, 0.65), ring);
    this.animate({ yaw: 0, move: 0, phase: 0, lunge: 0, flinch: 0, time: 0 }, undefined);
  }

  /** Builds the rig and the props, and splits them into the bones' parts (fresh geometry each call). */
  private assemble(): {
    rig: Rig;
    scheme: Scheme;
    props: ReturnType<typeof styleProps>;
    parts: Record<PartName, PartBits>;
  } {
    const { rig, scheme: s } = buildRig(this.piece, this.team, this.accent, this.style);
    const props = styleProps(this.style, propScheme(this.team, s), rig.anchors, this.accent);
    const [hx, hy, hz] = rig.hip;
    const parts: Record<PartName, PartBits> = {
      torso: {
        pivot: [0, 0, 0],
        local: [...rig.torso, ...(props.body ?? []), ...glow(props.glow)],
      },
      head: {
        pivot: rig.headPivot,
        local: about([...rig.head, ...(props.head ?? []), ...glow(props.headGlow)], rig.headPivot),
      },
      armR: {
        pivot: rig.pivotR,
        local: about(
          [...rig.armR, ...(props.weapon ?? rig.weapon), ...glow(props.armGlow)],
          rig.pivotR,
        ),
      },
      armL: {
        pivot: rig.pivotL,
        local: about(
          [...rig.armL, ...(props.off ?? rig.offItem), ...glow(props.offGlow)],
          rig.pivotL,
        ),
      },
      legR: { pivot: [hx, hy, hz], local: rig.leg() },
      legL: { pivot: [-hx, hy, hz], local: rig.leg() },
      cape: { pivot: rig.capePivot, local: about(rig.cape, rig.capePivot) },
    };
    return { rig, scheme: s, props, parts };
  }

  /** Starts the Rank 4 transformation: the new look pops in, glowing in the style colour. */
  transform(): void {
    this.pending = true;
  }

  /** `boost` enlarges the figure on far shots so it stays readable on small screens. */
  place(x: number, y: number, z: number, yaw: number, boost = 1): void {
    this.root.position.set(x, y, z);
    this.root.scale.setScalar(PIECE_SCALE * boost);
    this.markers.position.set(x, Math.max(y, WATER_Y + 0.2), z);
    this.markers.scale.setScalar(boost);
    this.root.rotation.y = yaw;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.markers.visible = v;
  }

  /**
   * Parts the ragdoll takes with it (the first three are the body, head and weapon arm). The
   * posed figure is cut into one mesh per joint; the cuts are dropped when the piece next animates.
   */
  pieces(): Piece[] {
    if (this.cut.length === 0) {
      const made = this.assemble();
      PARTS.forEach((name) => {
        const m = this.kit.solid(
          `piece-cut-${name}:${this.piece}:${this.team}:${this.style ?? '-'}`,
          () => made.parts[name].local,
          0.8,
        );
        this.joint[name].add(m);
        this.cut.push(m);
      });
    }
    this.root.updateWorldMatrix(true, true);
    const r = this.rig.chunk * PIECE_SCALE;
    const j = this.joint;
    return [
      { object: j.torso, radius: r, lie: true },
      { object: j.head, radius: r * 0.62, lie: false },
      { object: j.armR, radius: r * 0.55, lie: false },
      { object: j.armL, radius: r * 0.5, lie: false },
      { object: j.legR, radius: r * 0.5, lie: true },
      { object: j.legL, radius: r * 0.5, lie: true },
      { object: j.cape, radius: r * 0.45, lie: true },
    ];
  }

  animate(p: PieceMotion, camQuat: Quaternion | undefined): void {
    void camQuat;
    if (this.cut.length > 0) {
      for (const m of this.cut) m.removeFromParent();
      this.cut.length = 0;
    }
    const rig = this.rig;
    const g = rig.gait;
    const j = this.joint;
    const mv = p.move;
    const idle = 1 - mv;
    const ph = p.phase * g.freq;
    const sw = Math.sin(ph);
    const co = Math.cos(ph);
    const L = p.lunge;
    const F = p.flinch;
    const t = p.time + this.seed;
    const strike = this.gesture === 'strike';
    const cast = this.gesture === 'cast';

    // whole figure: step bob, sway, lean into the run, thrust on attack, recoil on hit
    const f = this.figure;
    f.position.y = Math.abs(sw) * g.bob * mv + Math.sin(t * 2.2) * 0.22 * idle;
    f.position.z = (strike ? L * g.thrust : cast ? -L * 1.2 : L * 0.6) - F * 2.4;
    f.rotation.x = g.lean * mv + (strike ? L * 0.3 : -L * 0.1) - F * 0.4;
    f.rotation.z = sw * g.roll * mv;
    f.rotation.y = -sw * g.roll * 0.6 * mv;
    f.scale.set(1 + F * 0.06, 1 + Math.sin(t * 2.2) * 0.01 - F * 0.07, 1 + F * 0.06);

    // legs: swing opposite each other, lifting the foot on the forward swing
    const step = g.stride * mv;
    j.legR.rotation.x = -sw * step - (strike ? L * 0.5 : 0);
    j.legL.rotation.x = sw * step + (strike ? L * 0.3 : 0);
    j.legR.position.y = rig.hip[1] + Math.max(0, co) * g.lift * mv;
    j.legL.position.y = rig.hip[1] + Math.max(0, -co) * g.lift * mv;

    // arms: counter-swing, then the attack gesture, then the flinch
    const aw = g.arm * mv;
    const breathe = Math.sin(t * 1.6) * 0.03 * idle;
    let r = this.restR + sw * aw * 0.55;
    let l = this.restL - sw * aw;
    if (strike) {
      r -= L * g.armLunge * this.lungeK;
      l -= L * 0.45;
    } else if (cast) {
      r -= L * 2.3;
      l -= L * 1.9;
    } else {
      r += L * 0.8;
      l -= L * 0.4;
    }
    j.armR.rotation.x = r;
    j.armL.rotation.x = l;
    j.armR.rotation.z = F * 0.7 + breathe + (cast ? L * 0.25 : 0);
    j.armL.rotation.z = -F * 0.7 - breathe - (cast ? L * 0.25 : 0);

    // head: bobs, looks about when idle, snaps back when hit
    j.head.position.y = rig.headPivot[1] + Math.sin(t * 2.2 + 0.6) * 0.22;
    j.head.rotation.x =
      -F * 0.5 - (cast ? L * 0.3 : 0) + (strike ? L * 0.12 : 0) - g.lean * mv * 0.8;
    j.head.rotation.y = Math.sin(t * 0.7) * 0.22 * idle;

    // cape streams behind a moving figure
    j.cape.rotation.x = 0.05 + mv * (0.12 + g.lean * 1.6) + Math.sin(t * 2.6) * 0.04 + L * 0.2;
    j.cape.rotation.z = sw * 0.08 * mv + Math.sin(t * 1.9) * 0.04;

    // bone matrices: joint transform, then back to the joint's rest origin
    for (let i = 0; i < PARTS.length; i++) {
      const jt = j[PARTS[i]];
      jt.updateMatrix();
      this.bones[i].multiplyMatrices(jt.matrix, this.unpivot[i]);
    }

    if (this.pending) {
      this.pending = false;
      this.popAt = p.time;
    }
    const pop = Math.max(0, 1 - (p.time - this.popAt) / 1.1);
    if (pop > 0) {
      const swell = Math.sin(pop * Math.PI) * 0.2;
      f.scale.x += swell;
      f.scale.y += swell * 1.3;
      f.scale.z += swell;
    }
    const ac = this.accentColor;
    this.cloth.emissive.setRGB(
      F * 0.6 + ac.r * pop * 0.7,
      F * 0.6 + ac.g * pop * 0.7,
      F * 0.6 + ac.b * pop * 0.7,
    );
    if (this.spin) this.spin.rotation.y = p.time * 0.9 + this.seed;
  }
}
