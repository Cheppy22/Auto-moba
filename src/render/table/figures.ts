import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { styleEmblem } from '../emblems';
import { TEAM, type TeamScheme } from './palette';
import {
  box,
  cone,
  crescent,
  dodeca,
  gem,
  hoop,
  lathe,
  mix,
  octa,
  type Part,
  prism,
  ring,
  rod,
  shade,
  slab,
  spike,
  star,
  type V3,
} from './mesh';

/**
 * The Tournament Table pieces: chunky, faceted humanoids carved like chess pieces. Each of the
 * five pieces has its own body plan and headgear (the silhouette), and each of the 15 styles adds
 * one bold colour block plus signature gear (the shape language). Authored in "figure units": the
 * King's cross tops out at 100; `piece.ts` scales figures up to miniature size.
 *
 * Bones: 0 torso (hips, skirt), 1 head, 2 right arm, 3 left arm, 4 right leg, 5 left leg,
 * 6 cape/back, 7 orbit (floating props that circle the figure).
 */
export type PieceId = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';
export const BONES = 8;
export const TORSO = 0;
export const HEAD = 1;
export const ARM_R = 2;
export const ARM_L = 3;
export const LEG_R = 4;
export const LEG_L = 5;
export const CAPE = 6;
export const ORBIT = 7;

export type Gesture = 'strike' | 'thrust' | 'cast' | 'shoot' | 'slam';

export interface Gait {
  /** Steps per radian of the walk phase. */
  freq: number;
  bob: number;
  stride: number;
  lift: number;
  lean: number;
  roll: number;
  arm: number;
  /** Forward thrust of the whole body on an attack. */
  thrust: number;
}

export interface FigureDef {
  parts: Part[];
  pivots: V3[];
  /** Arm rest angles [x, z] for the right and left arm. */
  restR: [number, number];
  restL: [number, number];
  height: number;
  /** Half width of the silhouette (bars, decluttering). */
  halfWidth: number;
  gait: Gait;
  gesture: Gesture;
  /** True when the orbit bone carries something (it spins). */
  orbit: boolean;
}

/** Figure-unit heights: the silhouette rule (King 1.0, Queen .95, Bishop .88, Knight .85, Rook .75 wide). */
export const FIG_HEIGHT: Record<PieceId, number> = {
  king: 100,
  queen: 95,
  rook: 76,
  bishop: 88,
  knight: 86,
};

const PI = Math.PI;
const _m = new Matrix4();
const _m2 = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _one = new Vector3(1, 1, 1);

/** Collects parts per bone; `hold` authors an item as seen at the arm's rest pose. */
class Fig {
  readonly parts: Part[] = [];
  readonly pivots: V3[] = Array.from({ length: BONES }, () => [0, 0, 0] as V3);
  restR: [number, number] = [-0.3, 0.08];
  restL: [number, number] = [-0.3, -0.08];
  orbit = false;

  add(
    bone: number,
    g: BufferGeometry,
    c: string,
    p?: V3,
    r?: V3,
    s?: number | V3,
    glow = false,
  ): void {
    this.parts.push({ g, c, p, r, s, bone, glow });
    if (bone === ORBIT) this.orbit = true;
  }

  /** An item in an arm's hand, authored where it sits at the rest pose (world-ish space). */
  hold(
    arm: 2 | 3,
    g: BufferGeometry,
    c: string,
    p: V3 = [0, 0, 0],
    r: V3 = [0, 0, 0],
    s: number | V3 = 1,
    glow = false,
  ): void {
    const sc = typeof s === 'number' ? _v.set(s, s, s) : _v.set(s[0], s[1], s[2]);
    _m.compose(new Vector3(...p), _q.setFromEuler(_e.set(...r)), sc);
    g.applyMatrix4(_m);
    const rest = arm === ARM_R ? this.restR : this.restL;
    const pv = this.pivots[arm];
    // undo the rest rotation about the shoulder so the item lands where it was authored
    _m.makeTranslation(-pv[0], -pv[1], -pv[2]);
    _m2.compose(new Vector3(0, 0, 0), _q.setFromEuler(_e.set(rest[0], 0, rest[1])).invert(), _one);
    g.applyMatrix4(_m)
      .applyMatrix4(_m2)
      .applyMatrix4(_m.makeTranslation(pv[0], pv[1], pv[2]));
    this.parts.push({ g, c, bone: arm, glow });
  }

  /** The hand position at rest (for authoring held items). */
  hand(arm: 2 | 3, len: number): V3 {
    const rest = arm === ARM_R ? this.restR : this.restL;
    const pv = this.pivots[arm];
    _v.set(0, -len, 0).applyEuler(_e.set(rest[0], 0, rest[1]));
    return [pv[0] + _v.x, pv[1] + _v.y, pv[2] + _v.z];
  }
}

interface Ink {
  t: TeamScheme;
  /** Cloth colour: the style colour, or the team cloth before Rank 4. */
  cloth: string;
  clothDark: string;
  /** Style colour (null before Rank 4). */
  s: string | null;
  metal: string;
  body: string;
  bodyShade: string;
  dark: string;
}

function ink(team: 'A' | 'B', style: string | null): Ink {
  const t = TEAM[team];
  const s = style ? styleEmblem(style).color : null;
  // big cloth areas lean toward the team value so a bright style never hides the side
  const cloth = s ? mix(s, team === 'A' ? t.body : t.shade, team === 'A' ? 0.12 : 0.28) : t.cloth;
  return {
    t,
    cloth,
    clothDark: shade(cloth, team === 'A' ? 0.62 : 0.55),
    s,
    metal: t.trim,
    body: t.body,
    bodyShade: t.shade,
    dark: t.dark,
  };
}

/* ------------------------------ body plans ------------------------------ */

/** Arms authored hanging straight down from the shoulder pivot (bind pose). */
function arms(
  f: Fig,
  sx: number,
  sy: number,
  len: number,
  w: number,
  col: string,
  hand: string,
  sleeve?: { r: number; c: string },
): void {
  f.pivots[ARM_R] = [-sx, sy, 0];
  f.pivots[ARM_L] = [sx, sy, 0];
  for (const [bone, x] of [
    [ARM_R, -sx],
    [ARM_L, sx],
  ] as const) {
    f.add(bone, prism(w * 0.5, w * 0.62, len, 5), col, [x, sy - len, 0]);
    f.add(bone, gem(w * 0.62), hand, [x, sy - len - w * 0.35, 0]);
    if (sleeve)
      f.add(bone, prism(sleeve.r * 0.55, sleeve.r, len * 0.5, 6), sleeve.c, [
        x,
        sy - len * 0.75,
        0,
      ]);
  }
}

function legs(f: Fig, hx: number, hy: number, w: number, col: string, boot: string): void {
  f.pivots[LEG_R] = [-hx, hy, 0];
  f.pivots[LEG_L] = [hx, hy, 0];
  for (const [bone, x] of [
    [LEG_R, -hx],
    [LEG_L, hx],
  ] as const) {
    f.add(bone, box(w, hy, w * 1.05), col, [x, hy / 2, 0]);
    f.add(bone, box(w * 1.1, Math.min(5, hy * 0.25), w * 1.5), boot, [
      x,
      Math.min(2.5, hy * 0.12),
      w * 0.25,
    ]);
  }
}

function king(f: Fig, k: Ink, style: string | null): void {
  f.restR = [-0.55, 0.12];
  f.restL = [-0.25, -0.1];
  legs(f, 5, 20, 7, k.bodyShade, k.dark);
  // bell robe, belt, broad chest, ermine mantle
  f.add(
    TORSO,
    lathe(
      [
        [0, 0],
        [19, 0],
        [18, 4],
        [14, 22],
        [11.5, 31],
        [0, 31],
      ],
      8,
    ),
    k.body,
  );
  f.add(TORSO, prism(19.4, 19.4, 3, 8), k.metal, [0, 0, 0]);
  f.add(TORSO, prism(14, 11, 24, 7), k.body, [0, 30, 0]);
  f.add(TORSO, prism(12.2, 12.2, 3.2, 7), k.metal, [0, 30, 0]);
  f.add(
    TORSO,
    slab(
      [
        [-4, 0],
        [4, 0],
        [5, 28],
        [-5, 28],
      ],
      2,
    ),
    k.cloth,
    [0, 2, 16.6],
    [-0.21, 0, 0],
  );
  f.add(TORSO, prism(10, 19, 7, 8), k.cloth, [0, 49, 0]);
  f.add(TORSO, prism(9.5, 9.5, 2.5, 8), k.bodyShade, [0, 55.5, 0]);
  // head, beard, crown with the tall cross
  f.pivots[HEAD] = [0, 57, 0];
  f.add(HEAD, dodeca(8.5), k.body, [0, 65, 0]);
  f.add(HEAD, cone(6.5, 13, 5), mix(k.bodyShade, k.metal, 0.35), [0, 63, 5.5], [PI, 0, 0]);
  f.add(HEAD, prism(9.6, 8.6, 6, 8), k.metal, [0, 71, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    f.add(HEAD, cone(2.4, 5.5, 4), k.metal, [Math.cos(a) * 8.6, 76.5, Math.sin(a) * 8.6]);
  }
  f.add(HEAD, box(5, 23, 5), k.metal, [0, 88, 0]);
  f.add(HEAD, box(16, 5, 5), k.metal, [0, 91, 0]);
  // cape
  f.pivots[CAPE] = [0, 54, -8];
  f.add(
    CAPE,
    slab(
      [
        [-12, 0],
        [12, 0],
        [18, -51],
        [-18, -51],
      ],
      2.4,
    ),
    k.clothDark,
    [0, 54, -12.5],
    [0.08, 0, 0],
  );
  arms(f, 15.5, 52, 21, 7, k.body, k.bodyShade, { r: 7.5, c: k.cloth });
  if (!style) {
    const h = f.hand(ARM_R, 24);
    f.hold(ARM_R, rod([0, -10, 0], [0, 30, 0], 2.4), k.metal, h);
    f.hold(ARM_R, gem(4.2), k.metal, [h[0], h[1] + 32, h[2]]);
  }
}

function queen(f: Fig, k: Ink): void {
  f.restR = [-0.5, 0.15];
  f.restL = [-0.2, -0.12];
  legs(f, 4, 16, 6, k.bodyShade, k.dark);
  // flared gown: the widest hem of any piece; hem and overskirt panels in cloth
  f.add(
    TORSO,
    lathe(
      [
        [0, 0],
        [21, 0],
        [20, 3],
        [13, 16],
        [7.2, 33],
        [0, 33],
      ],
      9,
    ),
    k.body,
  );
  f.add(TORSO, prism(21.4, 21.4, 2.6, 9), k.metal);
  for (const side of [-1, 1])
    f.add(
      TORSO,
      slab(
        [
          [-5, 0],
          [5, 0],
          [2, 31],
          [-2, 31],
        ],
        1.6,
      ),
      k.cloth,
      [side * 11, 1, 9],
      [-0.36, side * 0.75, 0],
    );
  f.add(TORSO, prism(10, 7, 19, 7), k.body, [0, 33, 0]);
  f.add(TORSO, prism(7.6, 7.6, 2.4, 7), k.metal, [0, 33, 0]);
  f.add(TORSO, gem(5.2), k.cloth, [-10, 50, 0]);
  f.add(TORSO, gem(5.2), k.cloth, [10, 50, 0]);
  // head, bun, spiky coronet with the ball on top
  f.pivots[HEAD] = [0, 52, 0];
  f.add(HEAD, gem(7.6), k.body, [0, 60, 0]);
  f.add(HEAD, gem(5), k.bodyShade, [0, 61, -6]);
  f.add(HEAD, ring(7.6, 1.4, 9), k.metal, [0, 66, 0]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2;
    f.add(
      HEAD,
      spike(
        [Math.cos(a) * 7.4, 66, Math.sin(a) * 7.4],
        [Math.cos(a) * 13, 83, Math.sin(a) * 13],
        2.6,
        4,
      ),
      k.metal,
    );
  }
  f.add(HEAD, rod([0, 66, 0], [0, 86, 0], 2), k.metal);
  f.add(HEAD, gem(4.2), k.metal, [0, 89.5, 0]);
  f.pivots[CAPE] = [0, 50, -6];
  arms(f, 11.5, 49, 19, 5, k.body, k.bodyShade);
}

function rook(f: Fig, k: Ink): void {
  f.restR = [-0.35, 0.18];
  f.restL = [-0.35, -0.18];
  legs(f, 8, 18, 10, k.bodyShade, k.dark);
  // the block: widest torso, belly band, pauldrons, tabard
  f.add(TORSO, box(34, 30, 22), k.body, [0, 33, 0]);
  f.add(TORSO, box(35, 4, 23), k.metal, [0, 21, 0]);
  f.add(TORSO, box(36, 6, 24), k.bodyShade, [0, 15.5, 0]);
  f.add(TORSO, box(18, 30, 1.6), k.cloth, [0, 31, 11.6]);
  f.add(TORSO, box(15, 10, 17), k.metal, [-20, 46, 0], [0, 0, 0.2]);
  f.add(TORSO, box(15, 10, 17), k.metal, [20, 46, 0], [0, 0, -0.2]);
  // crenellated tower helm with a dark visor slit
  f.pivots[HEAD] = [0, 48, 0];
  f.add(HEAD, prism(13, 13.5, 16, 8), k.body, [0, 47, 0]);
  f.add(HEAD, box(17, 3.2, 3), k.dark, [0, 56, 12.2]);
  f.add(HEAD, prism(13.6, 13.6, 2.6, 8), k.metal, [0, 61, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    f.add(HEAD, box(8, 9, 8), k.body, [Math.cos(a) * 9.6, 67.5, Math.sin(a) * 9.6], [0, -a, 0]);
  }
  f.pivots[CAPE] = [0, 46, -11];
  arms(f, 22, 45, 21, 9.5, k.body, k.bodyShade);
}

function bishop(f: Fig, k: Ink): void {
  f.restR = [-0.3, 0.1];
  f.restL = [-0.6, -0.12];
  legs(f, 4, 14, 6, k.bodyShade, k.dark);
  // narrow column robe, stole, capelet
  f.add(
    TORSO,
    lathe(
      [
        [0, 0],
        [14, 0],
        [13, 3],
        [10, 30],
        [9, 49],
        [0, 49],
      ],
      7,
    ),
    k.body,
  );
  f.add(TORSO, prism(14.3, 14.3, 2.4, 7), k.metal);
  f.add(
    TORSO,
    slab(
      [
        [-3.6, 0],
        [3.6, 0],
        [2.6, 46],
        [-2.6, 46],
      ],
      1.4,
    ),
    k.cloth,
    [0, 2, 11.7],
    [-0.07, 0, 0],
  );
  f.add(TORSO, prism(8, 13, 8, 7), k.cloth, [0, 42, 0]);
  // head and the cleft mitre (two leaves) with a ball on top
  f.pivots[HEAD] = [0, 50, 0];
  f.add(HEAD, gem(7), k.body, [0, 57, 0]);
  const leaf: [number, number][] = [
    [-7.5, 0],
    [7.5, 0],
    [6.5, 9],
    [3.5, 17],
    [0, 22],
    [-3.5, 17],
    [-6.5, 9],
  ];
  f.add(HEAD, slab(leaf, 4.4), k.body, [0, 62.5, 2.4], [0.13, 0, 0]);
  f.add(HEAD, slab(leaf, 4.4), k.body, [0, 62.5, -2.4], [-0.13, 0, 0]);
  f.add(HEAD, box(15.4, 2.8, 9.4), k.metal, [0, 63.4, 0]);
  f.add(HEAD, box(2, 12, 0.8), k.cloth, [0, 71, 5.4], [0.13, 0, 0]);
  f.add(HEAD, gem(2.8), k.metal, [0, 86, 0]);
  f.pivots[CAPE] = [0, 47, -8];
  arms(f, 11.5, 46, 19, 6, k.body, k.bodyShade, { r: 6.2, c: k.body });
}

function knight(f: Fig, k: Ink): void {
  f.restR = [-0.4, 0.12];
  f.restL = [-0.55, -0.1];
  legs(f, 6, 24, 8, k.body, k.dark);
  // armoured trunk with faulds
  f.add(TORSO, prism(11, 13, 8, 7), k.bodyShade, [0, 18, 0]);
  f.add(TORSO, prism(12.5, 10, 26, 7), k.body, [0, 24, 0]);
  f.add(TORSO, prism(10.4, 10.4, 2.6, 7), k.metal, [0, 25, 0]);
  f.add(TORSO, box(10, 16, 1.5), k.cloth, [0, 36, 11.2], [-0.08, 0, 0]);
  f.add(TORSO, gem(6.4), k.metal, [-13, 47, 0]);
  f.add(TORSO, gem(6.4), k.metal, [13, 47, 0]);
  // horse-head helm: neck, skull, long muzzle forward, ears and a mane crest down the back
  f.pivots[HEAD] = [0, 49, 0];
  f.add(HEAD, box(10, 15, 11), k.body, [0, 56, 0], [0.3, 0, 0]);
  f.add(HEAD, box(11.5, 12, 14), k.body, [0, 67, 2]);
  f.add(HEAD, box(9, 9, 17), k.body, [0, 62.5, 12.5], [0.38, 0, 0]);
  f.add(HEAD, box(9.6, 3.2, 4), k.dark, [0, 58.2, 19.8], [0.38, 0, 0]);
  f.add(HEAD, box(1.6, 2.4, 2.6), k.dark, [-5.8, 67, 6]);
  f.add(HEAD, box(1.6, 2.4, 2.6), k.dark, [5.8, 67, 6]);
  f.add(HEAD, cone(2.4, 8, 4), k.body, [-3.6, 72, -1], [-0.3, 0, -0.15]);
  f.add(HEAD, cone(2.4, 8, 4), k.body, [3.6, 72, -1], [-0.3, 0, 0.15]);
  f.add(
    HEAD,
    slab(
      [
        [0, 0],
        [4, 10],
        [10, 14],
        [8, 4],
        [12, 6],
        [9, -4],
        [12, -10],
        [6, -16],
        [0, -22],
        [-3, -10],
      ],
      3,
    ),
    k.cloth,
    [0, 74, -3],
    [0, PI / 2, 0],
  );
  f.pivots[CAPE] = [0, 47, -9];
  f.add(
    CAPE,
    slab(
      [
        [-10, 0],
        [10, 0],
        [13, -30],
        [-13, -30],
      ],
      2,
    ),
    k.clothDark,
    [0, 47, -11],
    [0.12, 0, 0],
  );
  arms(f, 14.5, 45, 20, 7, k.body, k.bodyShade);
  if (k.s === null) {
    // generic: sword and kite shield
    const h = f.hand(ARM_R, 22);
    f.hold(
      ARM_R,
      slab(
        [
          [-1.6, 0],
          [1.6, 0],
          [1.6, 24],
          [0, 28],
          [-1.6, 24],
        ],
        0.9,
      ),
      k.metal,
      [h[0], h[1], h[2] + 2],
      [0.6, 0, 0],
    );
    f.hold(ARM_R, box(8, 1.6, 2), k.metal, [h[0], h[1] + 0.5, h[2] + 2], [0.6, 0, 0]);
    const l = f.hand(ARM_L, 16);
    f.hold(
      ARM_L,
      slab(
        [
          [-8, 8],
          [8, 8],
          [7, -4],
          [0, -14],
          [-7, -4],
        ],
        2,
      ),
      k.cloth,
      [l[0] + 3, l[1], l[2] + 4],
      [0, 0.35, 0],
    );
  }
}

/* ------------------------------ style kits ------------------------------ */

function warlord(f: Fig, k: Ink): void {
  // war banner on the back (tallest point of any piece), spiked pauldrons, double axe
  f.add(CAPE, rod([0, 40, -15], [0, 118, -15], 2.4), k.metal);
  f.add(
    CAPE,
    slab(
      [
        [0, 0],
        [20, 0],
        [20, -26],
        [10, -19],
        [0, -26],
      ],
      1.6,
    ),
    k.cloth,
    [1, 117, -15],
  );
  f.add(CAPE, gem(3.6), k.metal, [11, 105, -15]);
  for (const x of [-16, 16])
    f.add(TORSO, cone(3.5, 11, 4), k.metal, [x, 53, 0], [0, 0, -Math.sign(x) * 0.5]);
  f.add(
    CAPE,
    slab(
      [
        [-13, 0],
        [13, 0],
        [22, -50],
        [10, -46],
        [0, -52],
        [-10, -46],
        [-22, -50],
      ],
      2.6,
    ),
    k.cloth,
    [0, 54, -13],
    [0.12, 0, 0],
  );
  const h = f.hand(ARM_R, 24);
  f.hold(ARM_R, rod([0, -6, 0], [0, 32, 0], 2.6), k.dark, h);
  for (const s of [-1, 1])
    f.hold(
      ARM_R,
      slab(
        [
          [0, 6],
          [s * 13, 11],
          [s * 15, 0],
          [s * 13, -11],
          [0, -6],
        ],
        1.4,
      ),
      k.metal,
      [h[0], h[1] + 27, h[2]],
    );
}

function sovereign(f: Fig, k: Ink): void {
  // golden stand-up collar fan, orb staff, three shields orbiting the court
  f.add(
    CAPE,
    slab(
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * PI;
        return [Math.cos(a) * 17, Math.sin(a) * 17] as [number, number];
      }),
      1.6,
    ),
    k.cloth,
    [0, 56, -9],
  );
  f.add(
    CAPE,
    slab(
      [
        [-14, 0],
        [14, 0],
        [21, -52],
        [-21, -52],
      ],
      2.6,
    ),
    k.cloth,
    [0, 54, -13],
    [0.1, 0, 0],
  );
  const h = f.hand(ARM_R, 24);
  f.hold(ARM_R, rod([0, -18, 0], [0, 40, 0], 2.4), k.metal, h);
  f.hold(ARM_R, gem(6), k.cloth, [h[0], h[1] + 44, h[2]], [0, 0, 0], 1, true);
  f.hold(ARM_R, ring(6.5, 1.2, 8), k.metal, [h[0], h[1] + 44, h[2]]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    f.add(
      ORBIT,
      slab(
        [
          [-5, 5],
          [5, 5],
          [5, -1],
          [0, -7],
          [-5, -1],
        ],
        1.4,
      ),
      k.cloth,
      [Math.sin(a) * 27, 44, Math.cos(a) * 27],
      [0, a, 0],
      1,
      true,
    );
  }
}

function usurper(f: Fig, k: Ink): void {
  // jagged cloak, spiked collar, curved blade and the chalice
  f.add(
    CAPE,
    slab(
      [
        [-13, 0],
        [13, 0],
        [19, -30],
        [14, -38],
        [17, -50],
        [8, -42],
        [2, -52],
        [-5, -41],
        [-12, -51],
        [-14, -36],
        [-20, -32],
      ],
      2.4,
    ),
    k.clothDark,
    [0, 54, -13],
    [0.14, 0, 0],
  );
  for (const a of [-0.5, 0, 0.5])
    f.add(
      CAPE,
      cone(2.6, 14, 4),
      k.cloth,
      [Math.sin(a) * 9, 56, -8 - Math.cos(a) * 2],
      [-0.45, 0, -a],
    );
  const h = f.hand(ARM_R, 24);
  f.hold(
    ARM_R,
    slab(
      [
        [0, 0],
        [3, 0],
        [7, 16],
        [6, 28],
        [2, 34],
        [3, 20],
      ],
      1,
    ),
    k.metal,
    [h[0] - 1, h[1], h[2] + 1],
    [0.9, 0, 0],
  );
  const l = f.hand(ARM_L, 23);
  f.hold(ARM_L, prism(1.2, 3, 5, 5), k.metal, [l[0], l[1] + 1, l[2] + 3]);
  f.hold(ARM_L, prism(5, 1.8, 6, 6), k.metal, [l[0], l[1] + 6, l[2] + 3]);
  f.hold(
    ARM_L,
    prism(4.2, 4.2, 1.2, 6),
    k.cloth,
    [l[0], l[1] + 10.6, l[2] + 3],
    [0, 0, 0],
    1,
    true,
  );
}

function regent(f: Fig, k: Ink): void {
  // tall fan collar, ringed staff, two orbs circling her
  f.add(CAPE, star(7, 19, 11, 1.4), k.cloth, [0, 62, -9]);
  f.add(
    CAPE,
    slab(
      [
        [-10, 0],
        [10, 0],
        [17, -48],
        [-17, -48],
      ],
      2,
    ),
    k.clothDark,
    [0, 50, -10],
    [0.1, 0, 0],
  );
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, rod([0, -20, 0], [0, 38, 0], 2.2), k.metal, h);
  f.hold(ARM_R, hoop(6, 1.3, 8), k.metal, [h[0], h[1] + 44, h[2]]);
  f.hold(ARM_R, gem(3.6), k.cloth, [h[0], h[1] + 44, h[2]], [0, 0, 0], 1, true);
  for (const a of [0, PI])
    f.add(ORBIT, gem(5.5), k.cloth, [Math.sin(a) * 23, 46, Math.cos(a) * 23], [0, 0, 0], 1, true);
}

function duelist(f: Fig, k: Ink): void {
  // sweeping plume, sash, rapier and parrying dagger
  f.add(
    HEAD,
    slab(
      [
        [0, 0],
        [3, 2],
        [8, 12],
        [10, 24],
        [6, 20],
        [2, 10],
      ],
      1.4,
    ),
    k.cloth,
    [5, 66, -2],
    [0, 0.4, -0.35],
  );
  f.add(TORSO, box(3.4, 24, 13), k.cloth, [0, 42, 0], [0, PI / 2, 0.75]);
  f.add(
    TORSO,
    slab(
      [
        [-6, 0],
        [6, 0],
        [3, 26],
        [-3, 26],
      ],
      1.4,
    ),
    k.cloth,
    [0, 2, 15],
    [-0.5, 0, 0],
  );
  const h = f.hand(ARM_R, 21);
  f.hold(ARM_R, box(1.4, 40, 0.8), k.metal, [h[0], h[1] + 14.6, h[2] + 13.6], [0.75, 0, 0]);
  f.hold(ARM_R, hoop(3.4, 1.1, 6, PI), k.metal, [h[0], h[1] + 1, h[2] + 1], [0.75, PI / 2, 0]);
  const l = f.hand(ARM_L, 21);
  f.hold(ARM_L, box(1.2, 12, 0.8), k.metal, [l[0], l[1] + 5, l[2] + 4], [0.4, 0, 0]);
}

function huntress(f: Fig, k: Ink): void {
  // hooded cloak, quiver, longbow as tall as she is
  f.add(
    CAPE,
    slab(
      [
        [-11, 0],
        [11, 0],
        [19, -50],
        [-19, -50],
      ],
      2.2,
    ),
    k.clothDark,
    [0, 51, -10],
    [0.08, 0, 0],
  );
  f.add(HEAD, gem(8.2), k.clothDark, [0, 60.5, -3.4], [0, 0, 0], [1, 1, 0.9]);
  f.add(CAPE, prism(3.6, 3.6, 22, 6), k.dark, [6, 30, -13], [0.2, 0, -0.35]);
  for (let i = 0; i < 3; i++)
    f.add(CAPE, cone(1.8, 5, 3), k.cloth, [10.5 + i * 1.6, 51 + i * 0.6, -9 - i], [0.2, 0, -0.35]);
  const l = f.hand(ARM_L, 20);
  f.hold(
    ARM_L,
    hoop(28, 1.6, 9, PI * 0.82),
    k.dark,
    [l[0] + 1, l[1] + 2, l[2] + 4 - 28],
    [0, -PI / 2, -0.41 * PI],
  );
  f.hold(ARM_L, rod([0, -26.7, 0], [0, 26.7, 0], 0.6), k.metal, [
    l[0] + 1,
    l[1] + 2,
    l[2] + 4 - 20,
  ]);
}

function bastion(f: Fig, k: Ink): void {
  // a pavise taller than the rook, planted in front of the left arm; steel band on the helm
  const l = f.hand(ARM_L, 18);
  f.hold(ARM_L, box(25, 46, 3), k.cloth, [l[0] + 2, l[1] + 12, l[2] + 10], [0, 0.18, 0]);
  f.hold(ARM_L, box(3.2, 40, 3.6), k.metal, [l[0] + 2, l[1] + 12, l[2] + 10.6], [0, 0.18, 0]);
  f.hold(ARM_L, box(20, 3.2, 3.6), k.metal, [l[0] + 2, l[1] + 18, l[2] + 10.6], [0, 0.18, 0]);
  f.add(HEAD, prism(14.4, 14.4, 3.2, 8), k.cloth, [0, 50, 0]);
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, rod([0, -4, 0], [0, 18, 0], 2.6), k.dark, h);
  f.hold(ARM_R, octa(5), k.metal, [h[0], h[1] + 20, h[2]]);
}

function ram(f: Fig, k: Ink): void {
  // curled horns and a battering log carried forward in both hands
  for (const s of [-1, 1]) {
    f.add(
      HEAD,
      hoop(6.5, 2.6, 7, PI * 1.5),
      mix(k.cloth, '#efe2c4', 0.45),
      [s * 15, 58, 1],
      [0, (s * PI) / 2, s * 0.6],
    );
  }
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, prism(6.5, 6.5, 50, 7), k.cloth, [0, h[1] + 4, h[2] - 12], [PI / 2, 0, 0]);
  f.hold(ARM_R, prism(8, 5, 9, 7), k.metal, [0, h[1] + 4, h[2] + 38], [PI / 2, 0, 0]);
  f.hold(ARM_R, prism(7, 7, 2.4, 7), k.metal, [0, h[1] + 4, h[2] + 10], [PI / 2, 0, 0]);
}

function vanguard(f: Fig, k: Ink): void {
  // long glaive with a pennant, chevron shield, crest fin
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, rod([0, -30, -10], [0, 62, 14], 2.4), k.dark, h);
  f.hold(ARM_R, spike([0, 62, 14], [0, 80, 19], 3.4, 4), k.metal, h);
  f.hold(
    ARM_R,
    slab(
      [
        [0, 0],
        [16, -3],
        [0, -12],
      ],
      1.2,
    ),
    k.cloth,
    [h[0], h[1] + 54, h[2] + 11],
    [0, PI / 2, 0],
  );
  const l = f.hand(ARM_L, 18);
  f.hold(
    ARM_L,
    slab(
      [
        [-11, 10],
        [0, 4],
        [11, 10],
        [11, -2],
        [0, -16],
        [-11, -2],
      ],
      2.4,
    ),
    k.cloth,
    [l[0] + 2, l[1] + 6, l[2] + 9],
    [0, 0.2, 0],
  );
  f.add(
    HEAD,
    slab(
      [
        [-10, 0],
        [8, 0],
        [10, 6],
        [2, 10],
        [-12, 6],
      ],
      2,
    ),
    k.cloth,
    [0, 63, 0],
    [0, PI / 2, 0],
  );
}

function light(f: Fig, k: Ink): void {
  // radiant sun disc behind the head, lantern on the crozier
  f.add(HEAD, star(12, 19, 13, 1.2), k.cloth, [0, 66, -8], [0, 0, 0], 1, true);
  f.add(HEAD, hoop(13.2, 1, 12), k.metal, [0, 66, -8.6]);
  const l = f.hand(ARM_L, 21);
  f.hold(ARM_L, rod([0, -24, 0], [0, 40, 0], 2.2), k.metal, l);
  f.hold(ARM_L, hoop(5, 1.2, 7, PI * 1.2), k.metal, [l[0], l[1] + 43, l[2] + 2], [0, PI / 2, 0]);
  f.hold(ARM_L, prism(3, 3.6, 6, 6), k.cloth, [l[0], l[1] + 33, l[2] + 5.5], [0, 0, 0], 1, true);
}

function shadow(f: Fig, k: Ink): void {
  // tattered dark over-robe, veil, crescent-bladed staff, wisps circling
  f.add(
    TORSO,
    slab(
      [
        [-14, 0],
        [-7, 5],
        [0, 0],
        [7, 5],
        [14, 0],
        [11, 26],
        [-11, 26],
      ],
      1.6,
    ),
    k.clothDark,
    [0, 0, 11.5],
    [-0.12, 0, 0],
  );
  f.add(
    CAPE,
    slab(
      [
        [-11, 0],
        [11, 0],
        [16, -40],
        [8, -34],
        [2, -46],
        [-6, -36],
        [-15, -44],
      ],
      2,
    ),
    k.clothDark,
    [0, 49, -10],
    [0.08, 0, 0],
  );
  const l = f.hand(ARM_L, 21);
  f.hold(ARM_L, rod([0, -24, 0], [0, 38, 0], 2.2), k.dark, l);
  f.hold(
    ARM_L,
    crescent(11, 4.5, 1.6),
    k.cloth,
    [l[0], l[1] + 44, l[2] + 2],
    [0, PI / 2, 0],
    1,
    true,
  );
  for (const a of [0.6, PI + 0.6])
    f.add(ORBIT, octa(3.6), k.cloth, [Math.sin(a) * 20, 38, Math.cos(a) * 20], [0, 0, 0], 1, true);
}

function zealot(f: Fig, k: Ink): void {
  // flame atop the mitre, steel pauldrons, a flaming flail
  f.add(HEAD, cone(4, 12, 5), k.cloth, [0, 84, 0], [0, 0, 0], 1, true);
  f.add(HEAD, cone(2.6, 8, 4), '#ffd36a', [2, 84, 1], [0, 0, -0.3], 1, true);
  f.add(TORSO, prism(7, 13.5, 5, 6), k.metal, [0, 45, 0]);
  const h = f.hand(ARM_R, 21);
  f.hold(ARM_R, rod([0, -4, 0], [0, 14, 2], 2.4), k.dark, h);
  f.hold(ARM_R, gem(1.6), k.metal, [h[0], h[1] + 17, h[2] + 4]);
  f.hold(ARM_R, gem(1.6), k.metal, [h[0], h[1] + 19, h[2] + 7]);
  f.hold(ARM_R, octa(6.2), k.cloth, [h[0], h[1] + 21, h[2] + 12], [0, 0.4, 0], 1, true);
  const l = f.hand(ARM_L, 20);
  f.hold(ARM_L, box(9, 11, 3), k.clothDark, [l[0] + 1, l[1] + 3, l[2] + 4], [0.2, 0.3, 0]);
}

function lancer(f: Fig, k: Ink): void {
  // couched lance (longest forward reach), vamplate, pennant, crest
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, cone(3.6, 68, 6), k.cloth, [h[0], h[1] + 4, h[2] - 6], [PI / 2, 0, 0]);
  f.hold(ARM_R, cone(7, 8, 7), k.metal, [h[0], h[1] + 4, h[2] + 4], [-PI / 2, 0, 0]);
  f.hold(
    ARM_R,
    slab(
      [
        [0, 0],
        [16, -2],
        [0, -8],
      ],
      1,
    ),
    k.metal,
    [h[0], h[1] + 6, h[2] + 40],
    [0, PI / 2, 0],
  );
  f.add(
    HEAD,
    slab(
      [
        [-10, 0],
        [10, 0],
        [12, 8],
        [0, 12],
        [-14, 7],
      ],
      2.4,
    ),
    k.cloth,
    [0, 72, -3],
    [0, PI / 2, 0],
  );
  const l = f.hand(ARM_L, 16);
  f.hold(ARM_L, prism(9, 9, 2, 8), k.cloth, [l[0] + 3, l[1], l[2] + 5], [PI / 2, 0, 0.3]);
}

function errant(f: Fig, k: Ink): void {
  // travel pack and bedroll, greatsword across the back, round buckler, hanging lantern
  f.add(CAPE, box(16, 18, 8), k.clothDark, [0, 37, -15]);
  f.add(CAPE, prism(4.6, 4.6, 22, 7), k.cloth, [-11, 48, -15], [0, 0, PI / 2]);
  f.add(
    CAPE,
    slab(
      [
        [-1.8, 0],
        [1.8, 0],
        [1.8, 40],
        [0, 44],
        [-1.8, 40],
      ],
      1,
    ),
    k.metal,
    [8, 14, -20],
    [0, 0, 0.5],
  );
  f.add(CAPE, box(9, 1.8, 2.2), k.metal, [-3, 34, -20], [0, 0, 0.5]);
  f.add(CAPE, prism(2.6, 3.2, 5, 6), '#ffd36a', [9, 26, -20], [0, 0, 0], 1, true);
  const l = f.hand(ARM_L, 16);
  f.hold(ARM_L, prism(8, 8, 2.4, 9), k.cloth, [l[0] + 3, l[1], l[2] + 5], [PI / 2, 0, 0.3]);
  f.hold(ARM_L, gem(2.6), k.metal, [l[0] + 3, l[1], l[2] + 6.6]);
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, rod([0, -2, 0], [0, 14, 4], 2), k.dark, h);
  f.hold(
    ARM_R,
    slab(
      [
        [0, 0],
        [9, 4],
        [8, -6],
      ],
      1.2,
    ),
    k.metal,
    [h[0], h[1] + 12, h[2] + 4],
    [0, PI / 2, 0],
  );
}

function paladin(f: Fig, k: Ink): void {
  // great white wings, winged round shield, warhammer
  for (const s of [-1, 1]) {
    const wing: [number, number][] = [
      [0, 0],
      [s * 10, 12],
      [s * 26, 24],
      [s * 30, 14],
      [s * 24, 8],
      [s * 28, 0],
      [s * 20, -4],
      [s * 22, -14],
      [s * 10, -8],
    ];
    f.add(
      CAPE,
      slab(wing, 1.8),
      mix(k.cloth, '#ffffff', 0.25),
      [s * 3, 46, -12],
      [0, -s * 0.35, 0],
    );
  }
  const l = f.hand(ARM_L, 16);
  f.hold(ARM_L, prism(10, 10, 2.4, 9), k.cloth, [l[0] + 3, l[1], l[2] + 5], [PI / 2, 0, 0.3]);
  f.hold(
    ARM_L,
    slab(
      [
        [0, 0],
        [6, 4],
        [9, 1],
        [5, -2],
      ],
      1,
    ),
    k.metal,
    [l[0] + 4, l[1] + 1, l[2] + 6.8],
    [0, 0, 0],
  );
  f.hold(
    ARM_L,
    slab(
      [
        [0, 0],
        [-6, 4],
        [-9, 1],
        [-5, -2],
      ],
      1,
    ),
    k.metal,
    [l[0] + 2, l[1] + 1, l[2] + 6.8],
    [0, 0, 0],
  );
  const h = f.hand(ARM_R, 22);
  f.hold(ARM_R, rod([0, -4, 0], [0, 24, 0], 2.4), k.dark, h);
  f.hold(ARM_R, box(12, 7, 7), k.metal, [h[0], h[1] + 24, h[2]]);
}

const KITS: Record<string, (f: Fig, k: Ink) => void> = {
  warlord,
  sovereign,
  usurper,
  regent,
  duelist,
  huntress,
  bastion,
  ram,
  vanguard,
  light,
  shadow,
  zealot,
  lancer,
  errant,
  paladin,
};

const GAITS: Record<PieceId, Gait> = {
  king: {
    freq: 1,
    bob: 1.4,
    stride: 0.45,
    lift: 1.5,
    lean: 0.06,
    roll: 0.07,
    arm: 0.35,
    thrust: 5,
  },
  queen: {
    freq: 1.1,
    bob: 0.9,
    stride: 0.4,
    lift: 1.2,
    lean: 0.08,
    roll: 0.05,
    arm: 0.3,
    thrust: 6,
  },
  rook: {
    freq: 0.85,
    bob: 2.6,
    stride: 0.55,
    lift: 3,
    lean: 0.1,
    roll: 0.13,
    arm: 0.45,
    thrust: 7,
  },
  bishop: {
    freq: 1.05,
    bob: 1,
    stride: 0.4,
    lift: 1.2,
    lean: 0.07,
    roll: 0.05,
    arm: 0.3,
    thrust: 5,
  },
  knight: {
    freq: 1.25,
    bob: 3.2,
    stride: 0.75,
    lift: 3.4,
    lean: 0.16,
    roll: 0.06,
    arm: 0.5,
    thrust: 10,
  },
};

const GESTURE: Record<string, Gesture> = {
  king: 'strike',
  queen: 'cast',
  rook: 'slam',
  bishop: 'cast',
  knight: 'strike',
  sovereign: 'cast',
  duelist: 'thrust',
  huntress: 'shoot',
  ram: 'thrust',
  vanguard: 'thrust',
  zealot: 'strike',
  lancer: 'thrust',
};

const HALF_W: Record<PieceId, number> = { king: 19, queen: 21, rook: 26, bishop: 15, knight: 16 };

/** Builds a figure (fresh geometry every call). */
export function buildFigure(piece: PieceId, team: 'A' | 'B', style: string | null): FigureDef {
  const f = new Fig();
  const k = ink(team, style);
  if (piece === 'king') king(f, k, style);
  else if (piece === 'queen') queen(f, k);
  else if (piece === 'rook') rook(f, k);
  else if (piece === 'bishop') bishop(f, k);
  else knight(f, k);
  if (piece === 'bishop' && !style) {
    // generic crozier
    const l = f.hand(ARM_L, 21);
    f.hold(ARM_L, rod([0, -24, 0], [0, 40, 0], 2.2), k.metal, l);
    f.hold(ARM_L, hoop(5, 1.2, 7, PI * 1.2), k.metal, [l[0], l[1] + 43, l[2] + 2], [0, PI / 2, 0]);
  }
  if (piece === 'queen' && !style) {
    const h = f.hand(ARM_R, 22);
    f.hold(ARM_R, rod([0, -3, 0], [0, 14, 0], 1.8), k.metal, h);
    f.hold(ARM_R, gem(3), k.metal, [h[0], h[1] + 15, h[2]]);
  }
  if (piece === 'rook' && !style) {
    const h = f.hand(ARM_R, 22);
    f.hold(ARM_R, rod([0, -4, 0], [0, 20, 0], 2.6), k.dark, h);
    f.hold(ARM_R, box(11, 7, 7), k.metal, [h[0], h[1] + 21, h[2]]);
  }
  const kit = style ? KITS[style] : undefined;
  if (kit) kit(f, k);
  return {
    parts: f.parts,
    pivots: f.pivots,
    restR: f.restR,
    restL: f.restL,
    height: FIG_HEIGHT[piece],
    halfWidth: HALF_W[piece],
    gait: GAITS[piece],
    gesture: (style && GESTURE[style]) || GESTURE[piece],
    orbit: f.orbit,
  };
}
