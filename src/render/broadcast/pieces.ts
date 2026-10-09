import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type MeshToonMaterial,
  type Quaternion,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { styleEmblem } from '../emblems';
import { PALETTE } from '../theme';
import { type Bit, hash, INK, type Kit, type Piece } from './kit';
import { type Anchors, bit, lathe, type PropScheme, styleProps, type V3 } from './props';
import { WATER_Y } from './terrain';

const TAU = Math.PI * 2;

/** Pieces are drawn a little larger than their sim footprint so they read from the skycam. */
export const PIECE_SCALE = 1.3;

export type PieceId = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';
export const PIECE_IDS: readonly PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];

export function isPieceId(s: unknown): s is PieceId {
  return typeof s === 'string' && (PIECE_IDS as readonly string[]).includes(s);
}

/** Height of each piece's crown in model units (before PIECE_SCALE), for bars and badges. */
export const PIECE_HEIGHT: Record<PieceId, number> = {
  king: 41,
  queen: 43,
  rook: 35,
  bishop: 44,
  knight: 46,
};

interface Scheme {
  body: string;
  shade: string;
  trim: string;
  skin: string;
  cloak: string;
  hair: string;
  rim: string;
  rimK: number;
  ring: string;
}

const SCHEMES: Record<'A' | 'B', Scheme> = {
  A: {
    body: PALETTE.whiteBody,
    shade: PALETTE.whiteShade,
    trim: PALETTE.whiteTrim,
    skin: '#f3e6cc',
    cloak: '#d9ceb2',
    hair: '#d9b45a',
    rim: '#ffd890',
    rimK: 0.5,
    ring: PALETTE.teamA,
  },
  B: {
    body: PALETTE.blackBody,
    shade: PALETTE.blackShade,
    trim: PALETTE.blackTrim,
    skin: '#7b7690',
    cloak: '#262232',
    hair: '#14121a',
    rim: '#a9bcff',
    rimK: 1,
    ring: PALETTE.teamB,
  },
};

/** Moves bits so that `pivot` becomes the origin (for parts that rotate about a joint). */
function about(bits: Bit[], pivot: V3): Bit[] {
  return bits.map((b) => {
    const at = b.at ?? [0, 0, 0];
    return { ...b, at: [at[0] - pivot[0], at[1] - pivot[1], at[2] - pivot[2]] as V3 };
  });
}

/** The style colour (accent sash, props, ground ring), from the shared emblem table. */
export function styleAccent(style: string | null | undefined): string | null {
  return style ? styleEmblem(style).color : null;
}

function propScheme(team: 'A' | 'B', s: Scheme): PropScheme {
  return { body: s.body, shade: s.shade, trim: s.trim, cloak: s.cloak, dark: team === 'B' };
}

interface Parts {
  /** Plinth, torso and static dressing. */
  body: Bit[];
  /** Everything that sits above the neck. */
  head: Bit[];
  headPivot: V3;
  /** The weapon arm (shoulder and hand, model coordinates): rotates about its shoulder. */
  arm: Bit[];
  /** What the weapon hand holds by default (a style prop may replace it). */
  weapon: Bit[];
  armPivot: V3;
  /** Where style props attach. */
  anchors: Anchors;
  armRest: number;
  armLunge: number;
  /** Forward thrust of the whole figure on a lunge. */
  thrust: number;
  /** Optional trailing cloth, swaying behind. */
  tail?: Bit[];
  tailPivot?: V3;
  /** The style sash (unlit style colour). */
  accent: (c: string) => Bit[];
}

function plinth(s: Scheme, r: number): Bit[] {
  return [
    bit(
      lathe([
        [0.01, 0],
        [r, 0],
        [r, 1.5],
        [r * 0.84, 2.5],
        [r * 0.72, 3.4],
        [0.01, 3.4],
      ]),
      s.shade,
    ),
    bit(new TorusGeometry(r * 0.86, 0.55, 5, 20).rotateX(Math.PI / 2), s.trim, [0, 2.1, 0]),
  ];
}

function eyes(s: Scheme, y: number, z: number, dx = 1.35): Bit[] {
  const c = s.body === PALETTE.blackBody ? '#e6ecff' : INK;
  return [-1, 1].map((x) => bit(new SphereGeometry(0.5, 6, 5), c, [x * dx, y, z]));
}

function sash(r: number, y: number, tilt = 0.55, tube = 0.85): BufferGeometry {
  return new TorusGeometry(r, tube, 6, 20).rotateX(Math.PI / 2).rotateZ(tilt);
}

function king(s: Scheme): Parts {
  const body: Bit[] = [
    ...plinth(s, 9.4),
    bit(
      lathe([
        [0.01, 3],
        [9.4, 3],
        [9.1, 6],
        [7.8, 12],
        [6.8, 18],
        [6.5, 22],
        [7.4, 24.4],
        [0.01, 25],
      ]),
      s.body,
    ),
    // ermine collar and belt
    bit(new TorusGeometry(7, 1.9, 7, 20).rotateX(Math.PI / 2), s.cloak, [0, 24, 0]),
    bit(new TorusGeometry(7.5, 0.8, 5, 20).rotateX(Math.PI / 2), s.trim, [0, 13, 0]),
    bit(new BoxGeometry(2.2, 2.2, 0.8), s.trim, [0, 13, 7.6]),
    // cloak
    bit(new BoxGeometry(15.4, 24, 1.5), s.cloak, [0, 14.5, -7.5], [0.1, 0, 0]),
    bit(new BoxGeometry(15.4, 1.6, 1.8), s.trim, [0, 2.8, -9.2], [0.1, 0, 0]),
    bit(new SphereGeometry(2.7, 8, 6), s.body, [-9, 21.6, 0]),
    bit(new SphereGeometry(1.8, 7, 5), s.skin, [-9.4, 15.4, 3]),
  ];
  const head: Bit[] = [
    bit(new SphereGeometry(3.9, 14, 10), s.skin, [0, 28.8, 0]),
    ...eyes(s, 29.3, 3.5),
    bit(new CylinderGeometry(3.6, 3.7, 3.8, 14, 1, true), s.hair, [0, 27.3, -0.2]), // beard line
    bit(new CylinderGeometry(4.5, 4.3, 2.4, 14), s.trim, [0, 32.2, 0]),
    bit(new TorusGeometry(4.5, 0.4, 5, 16).rotateX(Math.PI / 2), s.trim, [0, 33.6, 0]),
    bit(new CylinderGeometry(1.1, 1.1, 6, 6), s.trim, [0, 38, 0]),
    bit(new BoxGeometry(4.6, 1.3, 1.3), s.trim, [0, 39.2, 0]),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    head.push(
      bit(new ConeGeometry(1, 3.4, 5), s.trim, [Math.cos(a) * 4, 34.6, Math.sin(a) * 4]),
      bit(new SphereGeometry(0.65, 6, 5), '#ffffff', [Math.cos(a) * 4, 36.6, Math.sin(a) * 4]),
    );
  }
  const armPivot: V3 = [9, 21, 0.5];
  const arm: Bit[] = [
    bit(new SphereGeometry(2.7, 8, 6), s.body, [9, 21, 0.5]),
    bit(new SphereGeometry(1.9, 7, 5), s.skin, [9.4, 14.5, 3]),
  ];
  const weapon: Bit[] = [
    bit(new CylinderGeometry(0.6, 0.7, 24, 6), s.trim, [9.4, 17.5, 3]),
    bit(new SphereGeometry(2.3, 10, 8), s.trim, [9.4, 30, 3]),
    bit(new SphereGeometry(1.2, 8, 6), '#ffffff', [9.4, 30, 3]),
  ];
  return {
    body,
    head,
    headPivot: [0, 26, 0],
    arm,
    weapon,
    armPivot,
    anchors: {
      hand: [9.4, 14.5, 3],
      off: [-9.4, 15.4, 3],
      shoulderY: 21,
      radius: 9.4,
      neckY: 24,
      headTop: 40,
      backZ: -9,
    },
    armRest: 0.2,
    armLunge: 1.5,
    thrust: 3.4,
    accent: (c) => [bit(sash(7.1, 0, 0.6), c, [0, 17.5, 0])],
  };
}

function queen(s: Scheme): Parts {
  const body: Bit[] = [
    ...plinth(s, 8.6),
    bit(
      lathe([
        [0.01, 3],
        [8.6, 3],
        [8.2, 6],
        [6.6, 12],
        [4.4, 18],
        [3.4, 22.5],
        [4.6, 26.5],
        [4.2, 28.4],
        [0.01, 29],
      ]),
      s.body,
    ),
    bit(new TorusGeometry(3.9, 0.7, 5, 16).rotateX(Math.PI / 2), s.trim, [0, 21.5, 0]),
    bit(new TorusGeometry(8.1, 0.55, 5, 20).rotateX(Math.PI / 2), s.trim, [0, 4.4, 0]),
    bit(new SphereGeometry(2.1, 8, 6), s.body, [-5.5, 26, 0]),
    bit(new SphereGeometry(1.5, 7, 5), s.skin, [-6.2, 20.5, 2.4]),
    bit(new CylinderGeometry(1.3, 1.7, 3, 7), s.skin, [0, 29.8, 0]),
  ];
  const head: Bit[] = [
    bit(new SphereGeometry(3.4, 14, 10), s.skin, [0, 33, 0.2]),
    ...eyes(s, 33.3, 3.1, 1.2),
    bit(new SphereGeometry(3.8, 12, 9, 0, TAU, 0, 2.3), s.hair, [0, 33.3, -0.9]),
    bit(new CylinderGeometry(3.9, 3.8, 1.3, 14), s.trim, [0, 36, 0]),
    bit(new SphereGeometry(2.2, 8, 6), s.hair, [0, 28.8, -2.6], undefined, [1.4, 2.6, 0.8]),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const tall = i === 0 ? 1.6 : 1;
    head.push(
      bit(new ConeGeometry(0.8, 3.2 * tall, 5), s.trim, [
        Math.cos(a) * 3.5,
        38 + tall,
        Math.sin(a) * 3.5,
      ]),
      bit(new SphereGeometry(0.6, 6, 5), '#ffffff', [
        Math.cos(a) * 3.5,
        39.8 + tall * 1.2,
        Math.sin(a) * 3.5,
      ]),
    );
  }
  const armPivot: V3 = [5.5, 25.5, 1];
  const arm: Bit[] = [
    bit(new SphereGeometry(2.1, 8, 6), s.body, [5.5, 25.5, 1]),
    bit(new SphereGeometry(1.5, 7, 5), s.skin, [6, 20, 3.4]),
  ];
  const weapon: Bit[] = [
    bit(new CylinderGeometry(0.5, 0.5, 3.6, 6), s.trim, [6, 20, 4.4], [Math.PI / 2, 0, 0]),
    bit(new BoxGeometry(5, 0.6, 0.9), s.trim, [6, 20, 6.4]),
    bit(new BoxGeometry(0.7, 0.5, 17), '#e4eaf0', [6, 20, 15.2]),
  ];
  const tailPivot: V3 = [0, 27, -3.5];
  return {
    body,
    head,
    headPivot: [0, 30, 0],
    arm,
    weapon,
    armPivot,
    anchors: {
      hand: [6, 20, 3.4],
      off: [-6.2, 20.5, 2.4],
      shoulderY: 25.5,
      radius: 8.6,
      neckY: 28.5,
      headTop: 42,
      backZ: -5.5,
    },
    armRest: 0.5,
    armLunge: 1.9,
    thrust: 4.4,
    tail: about(
      [
        bit(new BoxGeometry(5, 21, 0.7), s.cloak, [0, 17, -5], [0.12, 0, 0]),
        bit(new BoxGeometry(5.6, 1.3, 0.9), s.trim, [0, 6.6, -5.5], [0.12, 0, 0]),
        bit(new BoxGeometry(2.6, 17, 0.6), s.trim, [-4.2, 19, -4.6], [0.1, 0, -0.15]),
      ],
      tailPivot,
    ),
    tailPivot,
    accent: (c) => [bit(sash(4.4, 0, -0.55, 0.7), c, [0, 24, 0])],
  };
}

function rook(s: Scheme): Parts {
  const body: Bit[] = [
    ...plinth(s, 11),
    bit(
      lathe([
        [0.01, 3],
        [10.6, 3],
        [10, 6],
        [8.8, 9],
        [8.6, 20],
        [9.8, 22],
        [10.6, 23.5],
        [0.01, 23.5],
      ]),
      s.body,
    ),
    bit(new TorusGeometry(8.8, 0.45, 5, 22).rotateX(Math.PI / 2), s.shade, [0, 10.5, 0]),
    bit(new TorusGeometry(8.7, 0.45, 5, 22).rotateX(Math.PI / 2), s.shade, [0, 16, 0]),
    bit(new TorusGeometry(10.1, 0.9, 5, 22).rotateX(Math.PI / 2), s.trim, [0, 22.2, 0]),
    // gate and arrow slits
    bit(new BoxGeometry(5, 6.4, 1), INK, [0, 8.4, 9.2]),
    bit(new BoxGeometry(3.4, 1.6, 1), INK, [0, 12.4, 9.2]),
    bit(new BoxGeometry(5.6, 0.8, 1.3), s.trim, [0, 11.6, 9.2]),
    bit(new BoxGeometry(0.9, 4.2, 0.8), INK, [-5.4, 16.2, 7]),
    bit(new BoxGeometry(0.9, 4.2, 0.8), INK, [5.4, 16.2, 7]),
    // pauldrons
    bit(new SphereGeometry(3.6, 9, 7), s.shade, [-11, 17, 0]),
    bit(new SphereGeometry(2.6, 8, 6), s.skin, [-11.4, 11.5, 3]),
  ];
  const head: Bit[] = [
    bit(new CylinderGeometry(7.2, 7.8, 4.4, 14), s.body, [0, 25.7, 0]),
    bit(new TorusGeometry(7.5, 0.55, 5, 20).rotateX(Math.PI / 2), s.trim, [0, 27.9, 0]),
    bit(new BoxGeometry(8, 0.9, 1.2), INK, [0, 26.3, 7.1]),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    head.push(
      bit(
        new BoxGeometry(4.2, 4.4, 3.2),
        s.body,
        [Math.cos(a) * 7.6, 30.2, Math.sin(a) * 7.6],
        [0, -a + Math.PI / 2, 0],
      ),
    );
  }
  const armPivot: V3 = [11, 17, 0.5];
  const arm: Bit[] = [
    bit(new SphereGeometry(3.6, 9, 7), s.shade, [11, 17, 0.5]),
    bit(new SphereGeometry(2.7, 8, 6), s.skin, [11.4, 11.5, 3.5]),
  ];
  const weapon: Bit[] = [
    bit(new CylinderGeometry(0.9, 1, 17, 6), s.trim, [11.4, 13.5, 5.5], [Math.PI / 2.4, 0, 0]),
    bit(new BoxGeometry(6.4, 5.4, 5.4), s.shade, [11.4, 11, 14]),
    bit(new BoxGeometry(6.8, 1.2, 5.8), s.trim, [11.4, 14, 14]),
  ];
  return {
    body,
    head,
    headPivot: [0, 24, 0],
    arm,
    weapon,
    armPivot,
    anchors: {
      hand: [11.4, 11.5, 3.5],
      off: [-11.4, 11.5, 3],
      shoulderY: 17,
      radius: 10.6,
      neckY: 23.5,
      headTop: 32.5,
      backZ: -10,
    },
    armRest: 0.15,
    armLunge: 1.7,
    thrust: 3,
    accent: (c) => [
      bit(new BoxGeometry(2.4, 0.7, 0.8), c, [-2.6, 26.3, 7.3]),
      bit(new BoxGeometry(2.4, 0.7, 0.8), c, [2.6, 26.3, 7.3]),
      bit(sash(9, 0, 0.45, 0.8), c, [0, 14, 0]),
    ],
  };
}

function bishop(s: Scheme): Parts {
  const body: Bit[] = [
    ...plinth(s, 8.4),
    bit(
      lathe([
        [0.01, 3],
        [8.4, 3],
        [8, 6],
        [6.2, 13],
        [4.6, 20],
        [4, 25],
        [4.8, 27.2],
        [0.01, 28],
      ]),
      s.body,
    ),
    bit(new TorusGeometry(5.1, 0.9, 6, 18).rotateX(Math.PI / 2), s.trim, [0, 14.5, 0]),
    bit(new TorusGeometry(4.8, 1.2, 6, 18).rotateX(Math.PI / 2), s.cloak, [0, 27, 0]),
    bit(new BoxGeometry(3.6, 22, 0.7), s.trim, [0, 14.5, 6.4], [-0.2, 0, 0]),
    bit(new SphereGeometry(2.1, 8, 6), s.body, [-5.2, 25, 0]),
    bit(new SphereGeometry(1.5, 7, 5), s.skin, [-5.8, 21, 3.4]),
  ];
  const mitre = lathe(
    [
      [0.01, 33.2],
      [3.5, 33.2],
      [3.9, 35.2],
      [3.5, 38],
      [2.3, 41],
      [1, 43.4],
      [0.01, 44.2],
    ],
    14,
  ).scale(1, 1, 0.62);
  const head: Bit[] = [
    bit(new SphereGeometry(3.2, 14, 10), s.skin, [0, 30.6, 0]),
    ...eyes(s, 31, 2.9, 1.1),
    bit(mitre, s.body),
    bit(new CylinderGeometry(3.7, 3.7, 1, 14).scale(1, 1, 0.7), s.trim, [0, 33.4, 0]),
    // the slit: a diagonal band that splits the mitre
    bit(new BoxGeometry(1.4, 12, 0.6), s.trim, [0, 38, 2.3], [0, 0, 0.55]),
    bit(new BoxGeometry(0.5, 12, 0.7), INK, [0, 38, 2.35], [0, 0, 0.55]),
    bit(new BoxGeometry(0.9, 3.4, 0.9), s.trim, [0, 44.8, 0]),
    bit(new BoxGeometry(2.4, 0.8, 0.9), s.trim, [0, 45.4, 0]),
  ];
  const armPivot: V3 = [5.2, 25, 1];
  const arm: Bit[] = [
    bit(new SphereGeometry(2.1, 8, 6), s.body, [5.2, 25, 1]),
    bit(new SphereGeometry(1.5, 7, 5), s.skin, [5.8, 21, 3.4]),
  ];
  const weapon: Bit[] = [
    bit(new CylinderGeometry(0.5, 0.6, 38, 6), s.trim, [5.8, 20, 3.4]),
    bit(new TorusGeometry(2.6, 0.5, 6, 14, Math.PI * 1.5).rotateZ(-0.4), s.trim, [5.8, 41.5, 3.4]),
    bit(new SphereGeometry(1.1, 8, 6), '#ffffff', [5.8, 39.2, 3.4]),
  ];
  return {
    body,
    head,
    headPivot: [0, 28.5, 0],
    arm,
    weapon,
    armPivot,
    anchors: {
      hand: [5.8, 21, 3.4],
      off: [-5.8, 21, 3.4],
      shoulderY: 25,
      radius: 8.4,
      neckY: 27.5,
      headTop: 45,
      backZ: -5.5,
    },
    armRest: 0.12,
    armLunge: 0.9,
    thrust: 1.6,
    accent: (c) => [bit(sash(5.4, 0, 0.6, 0.8), c, [0, 20, 0])],
  };
}

function knight(s: Scheme): Parts {
  const glint = s.body === PALETTE.blackBody ? '#e6ecff' : INK;
  const body: Bit[] = [
    ...plinth(s, 9.4),
    bit(
      lathe([
        [0.01, 3],
        [9.2, 3],
        [8.6, 7],
        [6.6, 12],
        [5.4, 15],
        [0.01, 16],
      ]),
      s.body,
    ),
    bit(new TorusGeometry(6.4, 0.8, 5, 18).rotateX(Math.PI / 2), s.trim, [0, 14.4, 0]),
    bit(new BoxGeometry(12, 10, 1.2), s.cloak, [0, 9, -6.4], [0.14, 0, 0]),
    bit(new SphereGeometry(2.6, 8, 6), s.shade, [-7, 13.4, 0]),
    bit(new SphereGeometry(1.7, 7, 5), s.skin, [-7.6, 8, 3]),
  ];
  const neckPivot: V3 = [0, 14, 0];
  const head: Bit[] = about(
    [
      // arched neck, skull, muzzle
      bit(new BoxGeometry(6.8, 21, 7.2), s.body, [0, 25, 2.2], [0.36, 0, 0]),
      bit(new BoxGeometry(6.4, 6.6, 11.4), s.body, [0, 36.6, 8.6], [0.6, 0, 0]),
      bit(new BoxGeometry(4.8, 5.2, 6.8), s.shade, [0, 31.8, 15.4], [0.6, 0, 0]),
      bit(new BoxGeometry(5.2, 1.2, 1.4), s.trim, [0, 29.4, 17.8], [0.6, 0, 0]),
      bit(new SphereGeometry(0.6, 6, 5), INK, [-1.5, 30.4, 18.4]),
      bit(new SphereGeometry(0.6, 6, 5), INK, [1.5, 30.4, 18.4]),
      bit(new SphereGeometry(0.85, 6, 5), glint, [-3.3, 38.2, 10]),
      bit(new SphereGeometry(0.85, 6, 5), glint, [3.3, 38.2, 10]),
      // helm plate down the face, ears and forelock
      bit(new BoxGeometry(2.6, 12.4, 0.8), s.trim, [0, 35.2, 12.4], [0.6, 0, 0]),
      bit(new ConeGeometry(1.4, 5, 5), s.body, [-2.2, 42.4, 5.4], [0.2, 0, 0.14]),
      bit(new ConeGeometry(1.4, 5, 5), s.body, [2.2, 42.4, 5.4], [0.2, 0, -0.14]),
      bit(new ConeGeometry(1.8, 5.4, 5), s.hair, [0, 41.4, 8.2], [0.9, 0, 0]),
    ],
    neckPivot,
  );
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = 17 + t * 22;
    const z = 2.2 + (y - 25) * 0.36 - 4.4;
    head.push(
      ...about([bit(new ConeGeometry(1.7, 5.2, 5), s.hair, [0, y, z], [-1.1, 0, 0])], neckPivot),
    );
  }
  const armPivot: V3 = [7, 12.5, 1];
  const arm: Bit[] = [
    bit(new SphereGeometry(2.6, 8, 6), s.shade, [7, 13.4, 0.5]),
    bit(new SphereGeometry(1.8, 7, 5), s.skin, [7.6, 8, 3.4]),
  ];
  const weapon: Bit[] = [
    bit(new CylinderGeometry(0.65, 0.8, 30, 6), s.trim, [7.6, 8, 13], [Math.PI / 2, 0, 0]),
    bit(new ConeGeometry(1.4, 7, 6), '#e4eaf0', [7.6, 8, 31.5], [Math.PI / 2, 0, 0]),
    bit(
      new BoxGeometry(0.3, 3.2, 7),
      s.body === PALETTE.blackBody ? '#c6cfdc' : '#b8352f',
      [7.6, 9.8, 22],
    ),
  ];
  return {
    body,
    head,
    headPivot: neckPivot,
    arm,
    weapon,
    armPivot,
    anchors: {
      hand: [7.6, 8, 3.4],
      off: [-7.6, 8, 3],
      shoulderY: 13.4,
      radius: 9.2,
      neckY: 16,
      headTop: 44,
      backZ: -6.5,
    },
    armRest: -0.05,
    armLunge: -0.5,
    thrust: 6.4,
    accent: (c) => [bit(sash(6.2, 0, -0.5, 0.8), c, [0, 11, 0])],
  };
}

const BUILDERS: Record<PieceId, (s: Scheme) => Parts> = { king, queen, rook, bishop, knight };

/** What the animation needs each frame (a subset of the old hero pose). */
export interface PieceMotion {
  yaw: number;
  move: number;
  phase: number;
  lunge: number;
  flinch: number;
  time: number;
}

/**
 * A chess piece as a character: turned base, a head, a weapon arm and a style accent. Same
 * animation hooks as the old hero figures (walk bob, lunge, flinch, ragdoll parts).
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
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly arm = new Group();
  private readonly tail = new Group();
  private readonly cloth: MeshToonMaterial;
  private readonly spec: Parts;
  private readonly seed: number;

  constructor(
    kit: Kit,
    piece: PieceId,
    team: 'A' | 'B',
    readonly style: string | null,
  ) {
    this.piece = piece;
    this.team = team;
    this.height = PIECE_HEIGHT[piece];
    this.seed = hash(`${piece}${team}`) % 628;
    const s = SCHEMES[team];
    const spec = BUILDERS[piece](s);
    this.spec = spec;
    this.cloth = kit.uniqueVertexToon();
    const rim = new Color(s.rim);
    const k = s.rimK;
    this.cloth.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = { value: rim };
      shader.uniforms.uRimK = { value: k };
      shader.fragmentShader =
        'uniform vec3 uRim;\nuniform float uRimK;\n' +
        shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `{
  vec3 vd = normalize(vViewPosition);
  float rm = pow(1.0 - clamp(dot(normalize(normal), vd), 0.0, 1.0), 2.4);
  outgoingLight += uRim * rm * uRimK;
}
#include <opaque_fragment>`,
        );
    };
    this.cloth.customProgramCacheKey = () => 'piece-rim';

    const id = `${piece}:${team}:${style ?? '-'}`;
    const solid = (key: string, bits: () => Bit[], ink = 0.8): Mesh =>
      kit.solid(`piece-${key}:${id}`, bits, ink, this.cloth);
    const emblem = styleEmblem(style);
    const acc = style ? emblem.color : s.trim;
    const props = styleProps(style, propScheme(team, s), spec.anchors, acc);

    this.body.add(solid('body', () => [...spec.body, ...(props.body ?? [])], 1));
    this.figure.add(this.body);
    this.head.add(
      solid('head', () => about([...spec.head, ...(props.head ?? [])], spec.headPivot), 0.8),
    );
    this.head.position.set(...spec.headPivot);
    if (piece !== 'knight') this.head.scale.setScalar(1.14);
    this.figure.add(this.head);
    this.arm.add(
      solid(
        'arm',
        () => about([...spec.arm, ...(props.weapon ?? spec.weapon)], spec.armPivot),
        0.6,
      ),
    );
    if (props.armGlow) {
      const held = props.armGlow;
      this.arm.add(kit.inkedGlow(`piece-armglow:${id}`, () => about(held, spec.armPivot), 0.5));
    }
    this.arm.position.set(...spec.armPivot);
    this.arm.rotation.x = spec.armRest;
    this.figure.add(this.arm);
    if (spec.tail && spec.tailPivot) {
      const tail = spec.tail;
      this.tail.add(solid('tail', () => tail, 0.6));
      this.tail.position.set(...spec.tailPivot);
      this.figure.add(this.tail);
    }
    // unlit style-colour parts, inked so pale colours still read on ivory
    this.figure.add(
      kit.inkedGlow(`piece-accent:${id}`, () => [...spec.accent(acc), ...(props.glow ?? [])], 0.5),
    );
    if (props.spin) {
      const spin = props.spin;
      this.spin = kit.inkedGlow(`piece-spin:${id}`, () => spin, 0.5);
      this.figure.add(this.spin);
    }
    this.root.add(this.figure);
    this.root.scale.setScalar(PIECE_SCALE);

    const ring = kit.styleRing(acc, 19);
    ring.position.y = 0.9;
    this.markers.add(kit.blob(13, 0.65), ring);
  }

  private spin: Mesh | null = null;

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

  /** Parts the ragdoll takes with it. */
  pieces(): Piece[] {
    this.root.updateWorldMatrix(true, true);
    const out: Piece[] = [
      { object: this.body, radius: 6.5 * PIECE_SCALE, lie: true },
      { object: this.head, radius: 4 * PIECE_SCALE, lie: false },
      { object: this.arm, radius: 3.5 * PIECE_SCALE, lie: false },
    ];
    if (this.spec.tail) out.push({ object: this.tail, radius: 3 * PIECE_SCALE, lie: true });
    return out;
  }

  animate(p: PieceMotion, camQuat: Quaternion): void {
    void camQuat;
    const sp = this.spec;
    const bob = Math.abs(Math.sin(p.phase)) * 1.5 * p.move;
    const swing = Math.sin(p.phase);
    const f = this.figure;
    f.position.set(0, bob, p.lunge * sp.thrust - p.flinch * 2.4);
    f.rotation.set(p.move * 0.08 + p.lunge * 0.32 - p.flinch * 0.4, 0, swing * 0.05 * p.move);
    const breathe = 1 + Math.sin(p.time * 2.2 + this.seed) * 0.012;
    f.scale.set(1 + p.flinch * 0.06, breathe - p.flinch * 0.07, 1 + p.flinch * 0.06);
    this.head.position.y = sp.headPivot[1] + Math.sin(p.time * 2.2 + this.seed + 0.6) * 0.25;
    this.head.rotation.x =
      this.piece === 'knight' ? -p.lunge * 0.28 + Math.sin(p.time * 1.7 + this.seed) * 0.03 : 0;
    this.arm.rotation.x = sp.armRest - p.lunge * sp.armLunge + swing * 0.16 * p.move;
    if (sp.tail) {
      this.tail.rotation.x = 0.06 + Math.sin(p.time * 2.6 + this.seed) * 0.05 + p.move * 0.28;
      this.tail.rotation.z = Math.sin(p.time * 1.9 + this.seed) * 0.05 + swing * 0.08 * p.move;
    }
    this.cloth.emissive.setScalar(p.flinch * 0.6);
    if (this.spin) this.spin.rotation.y = p.time * 0.9 + this.seed;
  }
}
