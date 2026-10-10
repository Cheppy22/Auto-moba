import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { PALETTE } from '../theme';
import { INK, type Bit } from './kit';
import { type Anchors, bit, lathe, type V3 } from './props';

/**
 * The five chess pieces as humanoid rigs: hips and two legs, a torso, a head, two arms and a
 * cape, each its own part so the model can walk, swing and flinch. Every piece has a different
 * height, width, head and outline; the style (`Rig` builders take the style colour) adds large
 * areas of its own colour, and `props.ts` adds the signature props on top.
 */

const TAU = Math.PI * 2;
const PI = Math.PI;

export type PieceId = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';

export interface Scheme {
  body: string;
  shade: string;
  trim: string;
  skin: string;
  cloak: string;
  hair: string;
  boot: string;
  fur: string;
  furSpot: string;
  beard: string;
  mane: string;
  eye: string;
  dark: boolean;
  rim: string;
  rimK: number;
  ring: string;
}

export const SCHEMES: Record<'A' | 'B', Scheme> = {
  A: {
    // a slightly darker ivory than the board's cream roads, with brass trim
    body: '#ebe1c6',
    shade: '#c4b894',
    trim: PALETTE.whiteTrim,
    skin: '#f3e2c4',
    cloak: '#d9ceb2',
    hair: '#d9b45a',
    boot: '#8a6a44',
    fur: '#f6f1e4',
    furSpot: '#2c2633',
    beard: '#f1ede2',
    mane: '#d9b45a',
    eye: INK,
    dark: false,
    rim: '#ffd890',
    rimK: 0.5,
    ring: PALETTE.teamA,
  },
  B: {
    body: PALETTE.blackBody,
    shade: PALETTE.blackShade,
    trim: PALETTE.blackTrim,
    skin: '#8a85a0',
    cloak: '#262232',
    hair: '#14121a',
    boot: '#17141e',
    fur: '#575062',
    furSpot: '#14121a',
    beard: '#b9b6c8',
    mane: '#c6cfdc',
    eye: '#e6ecff',
    dark: true,
    rim: '#a9bcff',
    rimK: 1,
    ring: PALETTE.teamB,
  },
};

export interface Gait {
  /** Cadence multiplier on the shared walk phase. */
  freq: number;
  /** Leg swing (radians). */
  stride: number;
  /** Arm swing (radians). */
  arm: number;
  /** Vertical bob per step (units). */
  bob: number;
  /** Side-to-side sway of the whole figure (radians). */
  roll: number;
  /** Forward lean when moving (radians). */
  lean: number;
  /** Foot lift (units). */
  lift: number;
  /** Strike reach: arm swing and body thrust on an attack. */
  armLunge: number;
  thrust: number;
}

export interface Rig {
  height: number;
  /** Right-leg joint (the left is mirrored in x). */
  hip: V3;
  /** A fresh leg (relative to its hip joint); called once per side. */
  leg: () => Bit[];
  /** Static body parts (absolute coordinates). */
  torso: Bit[];
  head: Bit[];
  headPivot: V3;
  armR: Bit[];
  pivotR: V3;
  /** What the weapon hand holds by default (absolute coordinates). */
  weapon: Bit[];
  armL: Bit[];
  pivotL: V3;
  offItem: Bit[];
  cape: Bit[];
  capePivot: V3;
  anchors: Anchors;
  gait: Gait;
  restR: number;
  restL: number;
  /** Radius of the ragdoll chunks. */
  chunk: number;
}

/* ------------------------------- helpers ------------------------------- */

export const tube = (
  rTop: number,
  rBot: number,
  y0: number,
  y1: number,
  color: string,
  x = 0,
  z = 0,
  seg = 8,
): Bit => bit(new CylinderGeometry(rTop, rBot, y1 - y0, seg), color, [x, (y0 + y1) / 2, z]);

export const ball = (r: number, color: string, at: V3, scale?: number | V3, seg = 9): Bit =>
  bit(new SphereGeometry(r, seg, Math.max(5, seg - 2)), color, at, undefined, scale);

export const slab = (w: number, h: number, d: number, color: string, at: V3, rot?: V3): Bit =>
  bit(new BoxGeometry(w, h, d), color, at, rot);

export const cone = (
  r: number,
  h: number,
  color: string,
  at: V3,
  rot?: V3,
  seg = 5,
  scale?: number | V3,
): Bit => bit(new ConeGeometry(r, h, seg), color, at, rot, scale);

/** A horizontal ring (flat in xz). */
export const hoop = (R: number, t: number, color: string, at: V3, seg = 18): Bit =>
  bit(new TorusGeometry(R, t, 5, seg).rotateX(PI / 2), color, at);

function eyes(s: Scheme, y: number, z: number, dx: number, r = 0.5): Bit[] {
  return [-1, 1].map((x) => ball(r, s.eye, [x * dx, y, z], undefined, 6));
}

interface ArmSpec {
  side: 1 | -1;
  pivot: V3;
  upper: number;
  fore: number;
  rS: number;
  rE: number;
  rW: number;
  tilt: number;
  bend: number;
  sleeve: string;
  cuff?: string;
  hand: string;
  handR: number;
  extra?: Bit[];
}

/** A two-segment arm (upper arm, bent forearm, hand), hanging from `pivot`. */
function arm(a: ArmSpec): { bits: Bit[]; hand: V3 } {
  const [px, py, pz] = a.pivot;
  const st = Math.sin(a.tilt) * a.side;
  const e: V3 = [px + st * a.upper, py - Math.cos(a.tilt) * a.upper, pz];
  const d: V3 = [0, -Math.cos(a.bend), Math.sin(a.bend)];
  const h: V3 = [e[0], e[1] + d[1] * a.fore, e[2] + d[2] * a.fore];
  const bits: Bit[] = [
    ball(a.rS * 1.05, a.sleeve, [px, py, pz], undefined, 8),
    bit(
      new CylinderGeometry(a.rE, a.rS, a.upper, 8),
      a.sleeve,
      [(px + e[0]) / 2, (py + e[1]) / 2, pz],
      [0, 0, PI + a.tilt * a.side],
    ),
    ball(a.rE * 1.05, a.sleeve, e, undefined, 8),
    bit(
      new CylinderGeometry(a.rW, a.rE, a.fore, 8),
      a.sleeve,
      [e[0], (e[1] + h[1]) / 2, (e[2] + h[2]) / 2],
      [PI - a.bend, 0, 0],
    ),
  ];
  if (a.cuff)
    bits.push(
      bit(
        new TorusGeometry(a.rW * 1.02, a.rW * 0.2, 5, 12),
        a.cuff,
        [e[0], h[1] + 0.2, h[2]],
        [PI / 2 - a.bend, 0, 0],
      ),
    );
  const hand: V3 = [h[0], h[1] + d[1] * a.handR * 0.5, h[2] + d[2] * a.handR * 0.5];
  bits.push(ball(a.handR, a.hand, hand, undefined, 8));
  if (a.extra) bits.push(...a.extra);
  return { bits, hand };
}

interface LegSpec {
  len: number;
  rTop: number;
  rBot: number;
  color: string;
  boot: string;
  bootW: number;
  bootL: number;
  bootH: number;
  extra?: Bit[];
}

/** A straight leg and boot, relative to its hip joint. */
function leg(l: LegSpec): Bit[] {
  const bits: Bit[] = [
    tube(l.rTop, l.rBot, -l.len, 0, l.color),
    slab(l.bootW, l.bootH, l.bootL, l.boot, [0, -l.len - l.bootH / 2 + 0.3, l.bootL * 0.26]),
    ball(
      l.bootW * 0.52,
      l.boot,
      [0, -l.len - l.bootH * 0.45, l.bootL * 0.7],
      [1, l.bootH / l.bootW, 1.1],
      7,
    ),
  ];
  if (l.extra) bits.push(...l.extra);
  return bits;
}

/** Lathe revolved profile, listed from the bottom up. */
const body = (pts: [number, number][], color: string, seg = 16): Bit => bit(lathe(pts, seg), color);

/* --------------------------------- King --------------------------------- */

function king(s: Scheme, c: string): Rig {
  const hipY = 12;
  const hx = 3.8;
  const pivotR: V3 = [10.6, 25.4, 0.2];
  const pivotL: V3 = [-10.6, 25.4, 0.2];
  const sleeve = s.body;
  const mk = (side: 1 | -1, pivot: V3): ReturnType<typeof arm> =>
    arm({
      side,
      pivot,
      upper: 6.4,
      fore: 6,
      rS: 3,
      rE: 2.6,
      rW: 2.3,
      tilt: 0.16,
      bend: 0.95,
      sleeve,
      cuff: s.trim,
      hand: s.skin,
      handR: 2,
      // fur-trimmed shoulder
      extra: [
        ball(4.1, s.fur, [pivot[0], pivot[1] + 0.4, pivot[2]], [1, 0.85, 1]),
        ball(0.6, s.furSpot, [pivot[0] + side * 1.2, pivot[1] + 3.6, pivot[2] + 1.6], undefined, 5),
        ball(0.6, s.furSpot, [pivot[0] + side * 3.2, pivot[1] + 2.2, pivot[2] + 1.4], undefined, 5),
        ball(0.6, s.furSpot, [pivot[0] + side * 3.6, pivot[1] - 0.2, pivot[2] - 1.8], undefined, 5),
      ],
    });
  const R = mk(1, pivotR);
  const L = mk(-1, pivotL);
  const spots: Bit[] = [];
  for (let i = 0; i < 6; i++) {
    const a = PI * (0.18 + (i / 5) * 0.64);
    spots.push(ball(0.55, s.furSpot, [Math.cos(a) * 8.1, 28.2, Math.sin(a) * 8.1], undefined, 5));
  }
  const torso: Bit[] = [
    body(
      [
        [0.01, 3.6],
        [9.8, 3.6],
        [9.7, 5.5],
        [9, 10],
        [8.2, 15],
        [8, 19],
        [9, 23.5],
        [9.4, 26],
        [7.2, 28.6],
        [0.01, 29],
      ],
      s.body,
    ),
    hoop(9.9, 0.75, s.trim, [0, 4.4, 0]),
    hoop(8.3, 0.9, s.trim, [0, 15, 0]),
    slab(2.4, 2.4, 0.8, s.trim, [0, 15, 8.4]),
    // surcoat panel in the style colour, framed in gold
    slab(6.2, 12.4, 0.8, c, [0, 9.6, 9.2], [-0.08, 0, 0]),
    slab(0.8, 12.4, 1, s.trim, [-3.4, 9.6, 9.2], [-0.08, 0, 0]),
    slab(0.8, 12.4, 1, s.trim, [3.4, 9.6, 9.2], [-0.08, 0, 0]),
    // ermine collar
    hoop(7.9, 2.7, s.fur, [0, 27.6, 0], 20),
    ...spots,
    tube(2.6, 2.8, 27.5, 30.3, s.skin),
  ];
  const head: Bit[] = [
    ball(4.5, s.skin, [0, 33, 0], [1, 1.02, 1], 12),
    ...eyes(s, 33.6, 4, 1.7, 0.55),
    slab(2.4, 0.5, 0.6, s.hair, [-1.7, 34.6, 4.1]),
    slab(2.4, 0.5, 0.6, s.hair, [1.7, 34.6, 4.1]),
    ball(0.9, s.skin, [0, 32.6, 4.6], undefined, 6),
    // beard and moustache
    cone(4.2, 7.5, s.beard, [0, 28.8, 1.9], [PI + 0.12, 0, 0], 9),
    ball(1, s.beard, [-1.3, 31.9, 4.1], [1.4, 0.7, 0.8], 6),
    ball(1, s.beard, [1.3, 31.9, 4.1], [1.4, 0.7, 0.8], 6),
    ball(1.4, s.beard, [-4.3, 33, -0.8], [0.8, 1.5, 1], 6),
    ball(1.4, s.beard, [4.3, 33, -0.8], [0.8, 1.5, 1], 6),
    // the crown: band, five fleurons, an orb and a cross
    tube(5, 5.1, 36, 38.4, s.trim, 0, 0, 14),
    hoop(5.1, 0.35, s.trim, [0, 38.5, 0], 16),
    ball(0.7, '#ffffff', [0, 37.3, 5.1], undefined, 6),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + PI / 2;
    head.push(
      cone(0.95, 3.2, s.trim, [Math.cos(a) * 4.5, 40, Math.sin(a) * 4.5]),
      ball(0.6, '#ffffff', [Math.cos(a) * 4.5, 41.8, Math.sin(a) * 4.5], undefined, 5),
    );
  }
  head.push(
    tube(0.5, 0.6, 38, 40.4, s.trim, 0, 0, 6),
    ball(1.1, s.trim, [0, 40.6, 0], undefined, 7),
    slab(0.9, 3.2, 0.9, s.trim, [0, 42.4, 0]),
    slab(3, 0.9, 0.9, s.trim, [0, 42.8, 0]),
  );
  const [hx0, hy0, hz0] = R.hand;
  const mantle = [
    slab(19, 25, 1.3, c, [0, 14.5, -9.3], [0.05, 0, 0]),
    slab(20.6, 2.3, 2.2, s.fur, [0, 2.6, -9.4], [0.05, 0, 0]),
    slab(1.8, 25, 2.2, s.fur, [-9.7, 14.5, -9.3], [0.05, 0, 0]),
    slab(1.8, 25, 2.2, s.fur, [9.7, 14.5, -9.3], [0.05, 0, 0]),
    ...[-6, -2, 2, 6].map((x) => slab(1.1, 1.2, 2.4, s.furSpot, [x, 2.6, -9.3], [0.05, 0, 0])),
    slab(17, 1.2, 2.2, s.fur, [0, 26.6, -8.6], [0.05, 0, 0]),
  ];
  return {
    height: 44,
    hip: [hx, hipY, 0],
    leg: () =>
      leg({
        len: 8.2,
        rTop: 3.2,
        rBot: 2.9,
        color: s.shade,
        boot: s.boot,
        bootW: 5.6,
        bootL: 8.6,
        bootH: 3.8,
      }),
    torso,
    head,
    headPivot: [0, 29, 0],
    armR: R.bits,
    pivotR,
    weapon: [
      // a gold sceptre
      tube(0.55, 0.65, hy0 - 5, hy0 + 19, s.trim, hx0, hz0, 6),
      ball(2.2, s.trim, [hx0, hy0 + 20.4, hz0], undefined, 9),
      ball(1.1, '#ffffff', [hx0, hy0 + 20.4, hz0 + 1.2], undefined, 6),
    ],
    armL: L.bits,
    pivotL,
    offItem: [
      // the orb of state
      ball(2.7, s.trim, [L.hand[0], L.hand[1] + 2.6, L.hand[2] + 0.4], undefined, 9),
      hoop(2.8, 0.35, s.shade, [L.hand[0], L.hand[1] + 2.6, L.hand[2] + 0.4], 12),
      slab(0.7, 2.4, 0.7, s.trim, [L.hand[0], L.hand[1] + 5.8, L.hand[2] + 0.4]),
      slab(2, 0.7, 0.7, s.trim, [L.hand[0], L.hand[1] + 6.2, L.hand[2] + 0.4]),
    ],
    cape: mantle,
    capePivot: [0, 26.5, -8],
    anchors: {
      hand: R.hand,
      off: L.hand,
      shoulderY: 25.4,
      shoulderX: 10.6,
      radius: 9.4,
      neckY: 29,
      headTop: 44,
      headY: 33,
      backZ: -10,
      hipY,
    },
    gait: {
      freq: 0.8,
      stride: 0.4,
      arm: 0.2,
      bob: 1.2,
      roll: 0.1,
      lean: 0.03,
      lift: 1,
      armLunge: 1.5,
      thrust: 3,
    },
    restR: 0.04,
    restL: 0.04,
    chunk: 6.5,
  };
}

/* --------------------------------- Queen -------------------------------- */

function queen(s: Scheme, c: string, style: string | null): Rig {
  const k = 2.8; // she stands taller than everyone
  const hipY = 17.2 + k;
  const hx = 2.5;
  const pivotR: V3 = [5, 29.8 + k, 0];
  const pivotL: V3 = [-5, 29.8 + k, 0];
  const mk = (side: 1 | -1, pivot: V3, bend: number): ReturnType<typeof arm> =>
    arm({
      side,
      pivot,
      upper: 8,
      fore: 8,
      rS: 1.7,
      rE: 1.4,
      rW: 1.15,
      tilt: 0.12,
      bend,
      sleeve: s.body,
      cuff: s.trim,
      hand: s.skin,
      handR: 1.3,
      extra: [ball(2.4, s.body, [pivot[0], pivot[1] + 0.6, pivot[2]], [1, 0.9, 1], 8)],
    });
  const R = mk(1, pivotR, 0.8);
  const L = mk(-1, pivotL, 0.8);
  // a long divided gown: each half belongs to a leg so the skirt opens as she steps
  const gown = (): Bit[] => [
    body(
      [
        [0.01, -(hipY - 1.6)],
        [5.9, -(hipY - 1.6)],
        [5.4, -(hipY - 6.5)],
        [4.2, -(hipY - 12)],
        [3, -(hipY - 18.3)],
        [2.4, 1.6],
        [0.01, 1.6],
      ].map(([r, y]) => [r, y] as [number, number]),
      s.body,
      14,
    ),
    bit(new TorusGeometry(5.8, 0.6, 5, 16).rotateX(PI / 2), c, [0, -(hipY - 1.9), 0]),
    bit(new TorusGeometry(4.3, 0.3, 4, 14).rotateX(PI / 2), s.trim, [0, -(hipY - 9), 0]),
  ];
  const legBase = (): Bit[] =>
    leg({
      len: 14.8 + k,
      rTop: 1.6,
      rBot: 1.35,
      color: s.shade,
      boot: s.boot,
      bootW: 3.2,
      bootL: 6.2,
      bootH: 2.4,
    });
  const torso: Bit[] = [
    body(
      [
        [0.01, 16 + k],
        [4.4, 16 + k],
        [3.6, 19 + k],
        [3.1, 22.5 + k],
        [3.7, 25.5 + k],
        [4.4, 28 + k],
        [4, 30.2 + k],
        [2.2, 31.5 + k],
        [0.01, 31.8 + k],
      ],
      s.body,
    ),
    hoop(3.3, 0.6, s.trim, [0, 22.4 + k, 0], 14),
    // coat lapels and a cinched bodice in the style colour
    slab(1.4, 9, 0.6, c, [-1.7, 26.6 + k, 4.1], [-0.1, 0, -0.18]),
    slab(1.4, 9, 0.6, c, [1.7, 26.6 + k, 4.1], [-0.1, 0, 0.18]),
    slab(3.4, 4.6, 0.6, c, [0, 19.8 + k, 3.6], [-0.1, 0, 0]),
    tube(1.3, 1.45, 30.8 + k, 34.4 + k, s.skin),
  ];
  // the high fan collar behind the head
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const t = (i / (blades - 1) - 0.5) * 2.5;
    const x = Math.sin(t) * 5.4;
    const z = -Math.cos(t) * 4.2 - 0.6;
    const big = 1 - Math.abs(t) * 0.12;
    torso.push(
      bit(new BoxGeometry(3.5, 11 * big, 0.5), s.body, [x, 39.2 + k, z], [0.18, PI - t, 0]),
      bit(
        new BoxGeometry(3.0, 9 * big, 0.45),
        c,
        [x * 0.93, 38.4 + k, z * 0.93 + 0.55],
        [0.18, PI - t, 0],
      ),
      bit(new ConeGeometry(0.8, 2, 4), s.trim, [x * 1.08, 45.2 + k * 0.96, z * 1.1], [0.18, 0, 0]),
    );
  }
  const head: Bit[] = [
    ball(3.6, s.skin, [0, 37.4 + k, 0.1], undefined, 12),
    ...eyes(s, 37.9 + k, 3.2, 1.3, 0.45),
    bit(new SphereGeometry(3.95, 12, 9, 0, TAU, 0, 2.3), s.hair, [0, 37.8 + k, -0.9]),
    ball(3, s.hair, [0, 32.6 + k, -3.3], [1, 3.2, 0.7], 8),
    ball(0.55, '#c23a4a', [0, 36.4 + k, 3.55], [1, 0.6, 0.6], 6),
  ];
  if (style !== 'duelist') {
    head.push(tube(3.95, 4, 39.6 + k, 40.8 + k, s.trim, 0, 0, 14));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + PI / 2;
      const h = i === 0 ? 4.4 : 3;
      head.push(
        cone(0.8, h, s.trim, [Math.cos(a) * 3.6, 40.8 + k + h / 2, Math.sin(a) * 3.6]),
        ball(0.55, '#ffffff', [Math.cos(a) * 3.6, 41.2 + k + h, Math.sin(a) * 3.6], undefined, 5),
      );
    }
  }
  const [hx0, hy0, hz0] = R.hand;
  return {
    height: 48.5,
    hip: [hx, hipY, 0],
    leg: () => [...legBase(), ...gown()],
    torso,
    head,
    headPivot: [0, 33.4 + k, 0],
    armR: R.bits,
    pivotR,
    weapon: [
      tube(0.4, 0.45, hy0 - 3, hy0 + 8, s.trim, hx0, hz0, 6),
      ball(1.5, s.trim, [hx0, hy0 + 9.4, hz0], undefined, 7),
      ball(0.8, '#ffffff', [hx0, hy0 + 9.4, hz0 + 0.8], undefined, 5),
    ],
    armL: L.bits,
    pivotL,
    offItem: [],
    // coat tails in the style colour
    cape: [
      slab(5.4, 24, 0.7, c, [-2.9, 17.5 + k, -4.9], [0.1, 0, 0]),
      slab(5.4, 24, 0.7, c, [2.9, 17.5 + k, -4.9], [0.1, 0, 0]),
      slab(0.8, 24, 0.9, s.trim, [0, 17.5 + k, -5], [0.1, 0, 0]),
      slab(11.8, 1.1, 0.9, s.trim, [0, 5.8 + k, -5.5], [0.1, 0, 0]),
    ],
    capePivot: [0, 29 + k, -4],
    anchors: {
      hand: R.hand,
      off: L.hand,
      shoulderY: 29.8 + k,
      shoulderX: 5,
      radius: 4.4,
      neckY: 31.5 + k,
      headTop: style === 'duelist' ? 41.5 + k : 48.2,
      headY: 37.4 + k,
      backZ: -5.4,
      hipY,
    },
    gait: {
      freq: 0.85,
      stride: 0.3,
      arm: 0.34,
      bob: 0.55,
      roll: 0.03,
      lean: 0.06,
      lift: 0.6,
      armLunge: 1.9,
      thrust: 4,
    },
    restR: 0.04,
    restL: 0.04,
    chunk: 4.5,
  };
}

/* --------------------------------- Rook --------------------------------- */

function rook(s: Scheme, c: string): Rig {
  const hipY = 9.6;
  const hx = 5;
  const pivotR: V3 = [13.4, 21.2, 0];
  const pivotL: V3 = [-13.4, 21.2, 0];
  const mk = (side: 1 | -1, pivot: V3): ReturnType<typeof arm> => {
    const [px, py, pz] = pivot;
    const merlons: Bit[] = [-1, 0, 1].map((i) =>
      slab(2.5, 2.6, 2.4, s.body, [px + i * 3.3 * 0.9 + side * 0.3, py + 5.6, pz], [0, 0, 0]),
    );
    return arm({
      side,
      pivot,
      upper: 5.2,
      fore: 5,
      rS: 4,
      rE: 3.6,
      rW: 3.4,
      tilt: 0.1,
      bend: 0.75,
      sleeve: s.shade,
      cuff: s.trim,
      hand: s.body,
      handR: 4.3,
      extra: [
        // a crenellated pauldron
        ball(5.4, s.body, [px, py + 0.4, pz], [1, 0.82, 1], 10),
        hoop(5.3, 0.6, s.trim, [px, py + 1.2, pz], 14),
        ...merlons,
        slab(5.4, 1.1, 1.2, INK, [px, py + 0.2, pz + 5.2]),
      ],
    });
  };
  const R = mk(1, pivotR);
  const L = mk(-1, pivotL);
  const torso: Bit[] = [
    body(
      [
        [0.01, 8],
        [9.6, 8],
        [10.2, 12],
        [10.4, 17],
        [10.8, 21],
        [9.4, 24.2],
        [0.01, 24.6],
      ],
      s.body,
      18,
    ),
    hoop(10.3, 1, s.trim, [0, 12.2, 0], 20),
    hoop(10.4, 0.45, s.shade, [0, 17, 0], 20),
    // the gate on the belly, arrow slits on the chest
    slab(5, 6, 1, INK, [0, 9.4, 9.6]),
    slab(5.8, 0.8, 1.3, s.trim, [0, 12.6, 9.8]),
    slab(0.9, 4.2, 0.8, INK, [-5, 18, 9], [0, 0.45, 0]),
    slab(0.9, 4.2, 0.8, INK, [5, 18, 9], [0, -0.45, 0]),
    // tabard in the style colour
    slab(8.6, 9, 0.8, c, [0, 7.6, 10.4], [-0.05, 0, 0]),
    slab(0.8, 9, 1, s.trim, [-4.5, 7.6, 10.4], [-0.05, 0, 0]),
    slab(0.8, 9, 1, s.trim, [4.5, 7.6, 10.4], [-0.05, 0, 0]),
    tube(6.2, 7.4, 24, 26.6, s.shade, 0, 0, 12),
  ];
  // crenellated skirt
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    torso.push(
      bit(
        new BoxGeometry(3.7, 3, 2.2),
        s.body,
        [Math.cos(a) * 9.7, 8.8, Math.sin(a) * 9.7],
        [0, -a + PI / 2, 0],
      ),
    );
  }
  const head: Bit[] = [
    tube(5.9, 5.6, 24.8, 30.6, s.body, 0, 0, 14),
    hoop(6.1, 0.75, s.trim, [0, 30.8, 0]),
    tube(5.2, 5.4, 30.8, 31.5, s.shade, 0, 0, 14),
    // visor slit and eyes
    slab(7, 1, 1.1, INK, [0, 28, 5.6]),
    ...[-1.8, 1.8].map((x) => slab(1.2, 0.5, 0.4, s.eye, [x, 28, 6.2])),
    slab(1, 3.4, 0.9, INK, [0, 25.8, 5.6]),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + PI / 2 / 7;
    head.push(
      bit(
        new BoxGeometry(3.2, 3.4, 2.2),
        s.body,
        [Math.cos(a) * 5.1, 33.2, Math.sin(a) * 5.1],
        [0, -a + PI / 2, 0],
      ),
    );
  }
  const [hx0, hy0, hz0] = R.hand;
  return {
    height: 34,
    hip: [hx, hipY, 0],
    leg: () =>
      leg({
        len: 5.6,
        rTop: 4.5,
        rBot: 4.1,
        color: s.shade,
        boot: s.shade,
        bootW: 9,
        bootL: 11.5,
        bootH: 4,
        extra: [ball(4.6, s.body, [0, -2.4, 1.2], [1, 0.8, 1], 8)],
      }),
    torso,
    head,
    headPivot: [0, 24.2, 0],
    armR: R.bits,
    pivotR,
    weapon: [
      // a maul with a tower-top head
      tube(1, 1.1, hy0 - 6, hy0 + 14, s.trim, hx0, hz0, 6),
      slab(8, 7, 7, s.shade, [hx0, hy0 + 15.5, hz0]),
      slab(8.6, 1.2, 7.6, s.trim, [hx0, hy0 + 12.4, hz0]),
      ...[-2.8, 2.8].map((x) => slab(2.6, 2.2, 2.6, s.shade, [hx0 + x, hy0 + 20, hz0])),
    ],
    armL: L.bits,
    pivotL,
    offItem: [],
    cape: [
      slab(11.4, 17, 1.1, c, [0, 14.5, -10.9]),
      slab(11.8, 1.2, 1.5, s.trim, [0, 6.2, -10.9]),
      slab(11.8, 1.2, 1.5, s.trim, [0, 22, -10.9]),
    ],
    capePivot: [0, 23, -10.4],
    anchors: {
      hand: R.hand,
      off: L.hand,
      shoulderY: 21.2,
      shoulderX: 13.4,
      radius: 10.6,
      neckY: 24.5,
      headTop: 34,
      headY: 28,
      backZ: -10.6,
      hipY,
    },
    gait: {
      freq: 0.62,
      stride: 0.5,
      arm: 0.36,
      bob: 1.8,
      roll: 0.07,
      lean: 0.02,
      lift: 1.2,
      armLunge: 1.7,
      thrust: 2.6,
    },
    restR: 0.04,
    restL: 0.04,
    chunk: 8,
  };
}

/* -------------------------------- Bishop -------------------------------- */

function bishop(s: Scheme, c: string): Rig {
  const hipY = 12.5;
  const hx = 2.2;
  const pivotR: V3 = [4.8, 28.4, 0];
  const pivotL: V3 = [-4.8, 28.4, 0];
  const mk = (side: 1 | -1, pivot: V3, bend: number): ReturnType<typeof arm> =>
    arm({
      side,
      pivot,
      upper: 6.2,
      fore: 6.2,
      rS: 1.9,
      rE: 1.7,
      rW: 3.5, // a bell sleeve
      tilt: 0.14,
      bend,
      sleeve: s.body,
      cuff: c,
      hand: s.skin,
      handR: 1.4,
      extra: [ball(2.5, s.body, [pivot[0], pivot[1] + 0.4, pivot[2]], [1, 0.85, 1], 8)],
    });
  const R = mk(1, pivotR, 0.9);
  const L = mk(-1, pivotL, 1.2);
  const mitre = lathe(
    [
      [0.01, 36],
      [3.5, 36],
      [3.9, 37.8],
      [3.4, 40],
      [2.2, 42.6],
      [1, 44.4],
      [0.01, 45],
    ],
    14,
  ).scale(1, 1, 0.62);
  const torso: Bit[] = [
    body(
      [
        [0.01, 4.4],
        [6.4, 4.4],
        [6.1, 7],
        [5, 13],
        [4, 19],
        [3.7, 24],
        [4.4, 27.2],
        [4.6, 29.4],
        [2.5, 30.6],
        [0.01, 31],
      ],
      s.body,
    ),
    hoop(6.3, 0.6, s.trim, [0, 5, 0]),
    hoop(4.1, 0.55, s.trim, [0, 19.5, 0], 14),
    // a mozzetta over the shoulders and a stole down the front, in the style colour
    bit(
      lathe(
        [
          [0.01, 31.2],
          [3.2, 30.8],
          [5.6, 28.6],
          [6.5, 25.8],
          [6.7, 25],
          [3.6, 25.4],
          [0.01, 25.4],
        ],
        14,
      ),
      c,
    ),
    slab(3.6, 20, 0.7, c, [0, 14.5, 5.3], [-0.16, 0, 0]),
    slab(3.9, 0.9, 0.9, s.trim, [0, 4.6, 5.8], [-0.16, 0, 0]),
    ...[8, 12, 16].map((y) =>
      slab(3.9, 0.5, 0.9, s.trim, [0, y + 3, 5.2 - (y - 8) * 0.05], [-0.16, 0, 0]),
    ),
    tube(1.5, 1.6, 30.5, 33, s.skin),
    hoop(2, 0.5, '#ffffff', [0, 31, 0], 10),
  ];
  const head: Bit[] = [
    ball(3.4, s.skin, [0, 34.6, 0], undefined, 12),
    ...eyes(s, 35, 3.1, 1.2, 0.45),
    bit(mitre, s.body),
    bit(new CylinderGeometry(3.75, 3.75, 1, 14).scale(1, 1, 0.7), s.trim, [0, 36.4, 0]),
    // the slit: a diagonal band that splits the mitre
    slab(1.5, 10, 0.6, c, [0, 40.6, 2.3], [0, 0, 0.55]),
    slab(0.5, 10, 0.7, INK, [0, 40.6, 2.35], [0, 0, 0.55]),
    ball(0.8, s.trim, [0, 45.3, 0], undefined, 6),
    // lappets hanging behind
    slab(1.2, 7, 0.3, s.trim, [-1.2, 34, -3.5], [0.1, 0, 0.1]),
    slab(1.2, 7, 0.3, s.trim, [1.2, 34, -3.5], [0.1, 0, -0.1]),
  ];
  const [hx0, hy0, hz0] = R.hand;
  const [ox, oy, oz] = L.hand;
  return {
    height: 46,
    hip: [hx, hipY, 0],
    leg: () =>
      leg({
        len: 9,
        rTop: 1.9,
        rBot: 1.7,
        color: s.shade,
        boot: s.boot,
        bootW: 4,
        bootL: 7,
        bootH: 3.5,
      }),
    torso,
    head,
    headPivot: [0, 31.5, 0],
    armR: R.bits,
    pivotR,
    weapon: [
      // a crozier
      tube(0.5, 0.6, hy0 - 8, hy0 + 24, s.trim, hx0, hz0, 6),
      bit(new TorusGeometry(2.5, 0.5, 6, 14, PI * 1.5).rotateZ(-0.4), s.trim, [hx0, hy0 + 26, hz0]),
      ball(1, '#ffffff', [hx0, hy0 + 23.8, hz0], undefined, 6),
    ],
    armL: L.bits,
    pivotL,
    offItem: [
      // a gilt prayer book
      slab(5.6, 1.5, 7.2, c, [ox, oy + 0.8, oz + 1.2], [-0.3, 0, 0]),
      slab(5.2, 1.2, 6.8, '#f4efe0', [ox, oy + 0.9, oz + 1.3], [-0.3, 0, 0]),
      slab(0.6, 1.6, 7.3, s.trim, [ox - 2.8, oy + 0.8, oz + 1.2], [-0.3, 0, 0]),
    ],
    // a long stole down the back
    cape: [
      slab(4.8, 25, 0.6, c, [0, 16.5, -4.9], [0.1, 0, 0]),
      slab(0.6, 25, 0.8, s.trim, [-2.5, 16.5, -4.9], [0.1, 0, 0]),
      slab(0.6, 25, 0.8, s.trim, [2.5, 16.5, -4.9], [0.1, 0, 0]),
      slab(5.6, 0.9, 0.9, s.trim, [0, 4.4, -5.3], [0.1, 0, 0]),
    ],
    capePivot: [0, 29, -4.2],
    anchors: {
      hand: R.hand,
      off: L.hand,
      shoulderY: 28.4,
      shoulderX: 4.8,
      radius: 5.4,
      neckY: 31.5,
      headTop: 46,
      headY: 34.6,
      backZ: -5.4,
      hipY,
    },
    gait: {
      freq: 0.8,
      stride: 0.28,
      arm: 0.16,
      bob: 0.5,
      roll: 0.03,
      lean: 0.03,
      lift: 0.5,
      armLunge: 1.1,
      thrust: 1.6,
    },
    restR: 0.04,
    restL: 0.04,
    chunk: 4.5,
  };
}

/* -------------------------------- Knight -------------------------------- */

function knight(s: Scheme, c: string): Rig {
  const hipY = 14.5;
  const hx = 3.6;
  const pivotR: V3 = [7.6, 26, 0];
  const pivotL: V3 = [-7.6, 26, 0];
  const mk = (side: 1 | -1, pivot: V3): ReturnType<typeof arm> =>
    arm({
      side,
      pivot,
      upper: 5.6,
      fore: 5.4,
      rS: 2.4,
      rE: 2.1,
      rW: 2,
      tilt: 0.2,
      bend: 0.8,
      sleeve: s.body,
      cuff: s.trim,
      hand: s.shade,
      handR: 2.1,
      extra: [
        ball(3.6, s.shade, [pivot[0] + side * 0.4, pivot[1] + 0.5, pivot[2]], [1, 0.85, 1], 9),
        slab(0.7, 1.4, 5.4, s.trim, [pivot[0] + side * 0.6, pivot[1] + 2.6, pivot[2]]),
      ],
    });
  const R = mk(1, pivotR);
  const L = mk(-1, pivotL);
  const torso: Bit[] = [
    bit(
      lathe(
        [
          [0.01, 13.2],
          [5, 13.2],
          [4.6, 16],
          [5, 19.5],
          [6.3, 23.6],
          [6.6, 26.2],
          [4.2, 28.6],
          [0.01, 29],
        ],
        14,
      ).scale(1, 1, 0.82),
      s.body,
    ),
    tube(6.2, 5.2, 12.2, 15.2, s.shade, 0, 0, 12),
    tube(7, 6.4, 9.4, 12.2, s.shade, 0, 0, 12),
    hoop(6.4, 0.6, s.trim, [0, 9.4, 0], 14),
    hoop(4.9, 0.55, s.trim, [0, 14.4, 0], 14),
    slab(0.8, 8, 0.8, s.trim, [0, 22.4, 5.3], [-0.12, 0, 0]),
    // tabard in the style colour
    slab(4.6, 8.5, 0.7, c, [0, 9.2, 7.3], [-0.04, 0, 0]),
    tube(2.3, 3, 28.3, 30.4, s.shade),
  ];
  const head: Bit[] = [
    // a helm like a horse's head: dome, long muzzle, ears and a crest of mane
    ball(4.3, s.body, [0, 33.6, 0], undefined, 11),
    bit(new BoxGeometry(4.6, 4.8, 9), s.body, [0, 31.4, 7.4], [0.36, 0, 0]),
    ball(2.5, s.shade, [0, 29.6, 11.8], [0.9, 0.8, 1.25], 8),
    slab(1.4, 1.1, 0.4, INK, [-0.9, 29.9, 14.2]),
    slab(1.4, 1.1, 0.4, INK, [0.9, 29.9, 14.2]),
    slab(5, 0.9, 1.3, s.trim, [0, 35.4, 3.5], [0.3, 0, 0]),
    slab(1.2, 0.6, 8, s.trim, [0, 34.4, 6.6], [0.36, 0, 0]),
    slab(0.4, 2.8, 1.3, s.eye, [-3.5, 33.7, 2.4], [0, -0.6, 0]),
    slab(0.4, 2.8, 1.3, s.eye, [3.5, 33.7, 2.4], [0, 0.6, 0]),
    cone(1.2, 4.4, s.body, [-2.4, 38.4, -0.4], [-0.15, 0, 0.3]),
    cone(1.2, 4.4, s.body, [2.4, 38.4, -0.4], [-0.15, 0, -0.3]),
  ];
  // the mane runs from the brow down the back of the neck
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    head.push(
      cone(1.5, 4.6, s.mane, [0, 38 - t * 5.5 - t * t * 4, 2.6 - t * 8.5], [-1.1 - t * 0.5, 0, 0]),
    );
  }
  // the plume in the style colour
  const plume: V3[] = [
    [0, 39.6, -1.4],
    [0, 41.2, -3.6],
    [0, 41.6, -6.6],
    [0, 40.4, -9.4],
    [0, 38.2, -11.4],
  ];
  plume.forEach((p, i) => head.push(ball(1.7 - i * 0.12, c, p, [0.9, 1, 2], 7)));
  const [hx0, hy0, hz0] = R.hand;
  return {
    height: 43,
    hip: [hx, hipY, 0],
    leg: () =>
      leg({
        len: 10.8,
        rTop: 3,
        rBot: 2.2,
        color: s.body,
        boot: s.shade,
        bootW: 4.4,
        bootL: 8.4,
        bootH: 3.7,
        extra: [
          ball(2.9, s.shade, [0, -5.6, 0.8], [1, 0.9, 1], 8),
          hoop(2.5, 0.4, s.trim, [0, -9.4, 0], 10),
        ],
      }),
    torso,
    head,
    headPivot: [0, 28.6, 0],
    armR: R.bits,
    pivotR,
    weapon: [
      // a longsword
      slab(0.9, 22, 0.35, '#e4eaf0', [hx0, hy0 + 13, hz0]),
      cone(0.6, 2.6, '#e4eaf0', [hx0, hy0 + 25.2, hz0], undefined, 4),
      slab(5.4, 0.9, 1.1, s.trim, [hx0, hy0 + 1.8, hz0]),
      ball(0.9, s.trim, [hx0, hy0 - 1.4, hz0], undefined, 6),
    ],
    armL: L.bits,
    pivotL,
    offItem: [],
    cape: [
      slab(11.4, 21, 0.8, c, [0, 16.5, -6.5], [0.12, 0, 0]),
      slab(12, 1.2, 1.1, s.trim, [0, 6.2, -7], [0.12, 0, 0]),
      slab(11.6, 1.1, 1.1, s.trim, [0, 26.8, -5.4], [0.12, 0, 0]),
      ball(1, s.trim, [-5.6, 26.4, 0.4], undefined, 6),
      ball(1, s.trim, [5.6, 26.4, 0.4], undefined, 6),
    ],
    capePivot: [0, 27.2, -5.4],
    anchors: {
      hand: R.hand,
      off: L.hand,
      shoulderY: 26,
      shoulderX: 7.6,
      radius: 5.8,
      neckY: 29,
      headTop: 43,
      headY: 33.6,
      backZ: -7,
      hipY,
    },
    gait: {
      freq: 1.3,
      stride: 0.85,
      arm: 0.8,
      bob: 2.2,
      roll: 0.04,
      lean: 0.2,
      lift: 2.4,
      armLunge: 1.9,
      thrust: 5.4,
    },
    restR: 0.1,
    restL: 0.1,
    chunk: 5,
  };
}

const BUILDERS: Record<PieceId, (s: Scheme, c: string, style: string | null) => Rig> = {
  king,
  queen,
  rook,
  bishop,
  knight,
};

/** The humanoid rig for a piece, wearing the style colour `c`. */
export function buildRig(
  piece: PieceId,
  team: 'A' | 'B',
  c: string,
  style: string | null,
): { rig: Rig; scheme: Scheme } {
  const scheme = SCHEMES[team];
  const rig = BUILDERS[piece](scheme, c, style);
  return { rig, scheme };
}
