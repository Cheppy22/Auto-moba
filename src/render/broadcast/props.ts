import {
  BoxGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import type { Bit } from './kit';

/**
 * Signature props: one accessory per chess style that changes the piece's silhouette (a banner,
 * a tower shield, wings...), so a style reads from the game camera on both teams. Built from
 * primitives and merged into the piece's limb meshes (each prop rides the part that carries it:
 * the weapon arm, the off arm, the torso or the head), so they add no draw calls (Regent's
 * orbiting ring is the one extra mesh).
 */

const TAU = Math.PI * 2;

export type V3 = [number, number, number];

export function bit(
  geo: BufferGeometry,
  color: ColorRepresentation,
  at?: V3,
  rot?: V3,
  scale?: number | V3,
): Bit {
  return { geo, color, at, rot, scale };
}

export function lathe(points: [number, number][], seg = 16, phiStart = 0, phiLength = TAU) {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    seg,
    phiStart,
    phiLength,
  );
}

/** Team colours a prop is painted with. */
export interface PropScheme {
  body: string;
  shade: string;
  trim: string;
  cloak: string;
  /** True for Black (ebony body, silver trim). */
  dark: boolean;
}

/** Where props attach on a piece, in model units (the piece faces +z, weapon hand at +x). */
export interface Anchors {
  hand: V3;
  off: V3;
  shoulderY: number;
  shoulderX: number;
  /** Half the chest depth: how far the front of the torso is from the middle. */
  radius: number;
  neckY: number;
  headTop: number;
  headY: number;
  backZ: number;
  hipY: number;
}

/** How a figure holds itself and what its attack looks like. */
export type Gesture = 'strike' | 'cast' | 'bow';

export interface StyleProps {
  /** Lit, inked parts on the torso (static). */
  body?: Bit[];
  /** Lit parts on the head (move with it). Absolute coordinates. */
  head?: Bit[];
  /** Replaces the piece's default weapon in the weapon hand (absolute coordinates). */
  weapon?: Bit[];
  /** Replaces what the off hand holds by default (rides the off arm). */
  off?: Bit[];
  /** Unlit style-colour parts on the torso. */
  glow?: Bit[];
  /** Unlit style-colour parts on the head. */
  headGlow?: Bit[];
  /** Unlit style-colour parts held in the weapon hand (swing with the arm). */
  armGlow?: Bit[];
  /** Unlit style-colour parts on the off arm. */
  offGlow?: Bit[];
  /** Unlit parts that orbit the piece (figure space). */
  spin?: Bit[];
  /** Arm rest angles override (radians about x; negative raises the arm forward). */
  restR?: number;
  restL?: number;
  /** Scales how far the weapon arm swings on an attack. */
  lungeK?: number;
  gesture?: Gesture;
}

const STEEL = '#e8edf3';
const HOOD_A = '#a597c4';
const HOOD_B = '#3d2f6a';

const cyl = (r: number, h: number, seg = 7, r2 = r): CylinderGeometry =>
  new CylinderGeometry(r, r2, h, seg);
const box = (x: number, y: number, z: number): BoxGeometry => new BoxGeometry(x, y, z);
const ball = (r: number, seg = 9): SphereGeometry =>
  new SphereGeometry(r, seg, Math.max(5, seg - 2));

function wood(s: PropScheme): string {
  return s.dark ? '#4a3c52' : '#9a6a3a';
}

/** A spiked ball (flail or mace head). */
function spikes(at: V3, r: number, color: string): Bit[] {
  const out: Bit[] = [bit(new IcosahedronGeometry(r, 0), color, at)];
  const dirs: V3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const [dx, dy, dz] of dirs) {
    const rot: V3 =
      dx !== 0
        ? [0, 0, -dx * (Math.PI / 2)]
        : dz !== 0
          ? [dz * (Math.PI / 2), 0, 0]
          : [dy < 0 ? Math.PI : 0, 0, 0];
    out.push(
      bit(
        new ConeGeometry(r * 0.45, r * 1.2, 5),
        color,
        [at[0] + dx * r, at[1] + dy * r, at[2] + dz * r],
        rot,
      ),
    );
  }
  return out;
}

/* ---------------------------------- King ---------------------------------- */

function warlord(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a tall war banner planted on the back, and a spiked mace
  const px = 0;
  const pz = a.backZ - 3.4;
  const top = 70;
  const [hx, hy, hz] = a.hand;
  return {
    body: [
      bit(cyl(0.9, top - 2), wood(s), [px, (top - 2) / 2 + 1, pz]),
      bit(new ConeGeometry(1.6, 4.4, 6), s.trim, [px, top + 1.8, pz]),
      bit(box(21, 1.2, 1.2), s.trim, [px, top - 2.4, pz]),
      bit(ball(1.4, 7), s.trim, [px - 10.5, top - 2.4, pz]),
      bit(ball(1.4, 7), s.trim, [px + 10.5, top - 2.4, pz]),
    ],
    glow: [
      // a swallow-tailed banner, two panels in a shallow V so it never reads edge-on
      bit(box(10, 25, 0.6), c, [px - 5, top - 15.4, pz + 0.8], [0, 0.34, 0]),
      bit(box(10, 25, 0.6), c, [px + 5, top - 15.4, pz + 0.8], [0, -0.34, 0]),
      bit(new ConeGeometry(2.9, 5.4, 3), c, [px - 5, top - 30.8, pz + 0.8], [Math.PI, 0.34, 0]),
      bit(new ConeGeometry(2.9, 5.4, 3), c, [px + 5, top - 30.8, pz + 0.8], [Math.PI, -0.34, 0]),
      bit(
        box(3, 3, 0.8),
        s.dark ? STEEL : '#fff4d0',
        [px - 5, top - 10, pz + 1.3],
        [0, 0.34, 0.78],
      ),
      bit(
        box(3, 3, 0.8),
        s.dark ? STEEL : '#fff4d0',
        [px + 5, top - 10, pz + 1.3],
        [0, -0.34, 0.78],
      ),
    ],
    weapon: [
      bit(cyl(0.75, 24, 6), wood(s), [hx, hy + 6, hz]),
      bit(cyl(1.6, 2, 7), s.trim, [hx, hy + 17.4, hz]),
      ...spikes([hx, hy + 20.4, hz], 3.1, s.trim),
    ],
  };
}

function sovereign(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [ox, oy, oz] = a.off;
  const [hx, hy, hz] = a.hand;
  // a big crowned kite shield held forward on the off arm
  const at: V3 = [ox - 3.2, oy + 3, oz + 4];
  const rot: V3 = [0, -0.55, 0];
  const point = (r: number, h: number): ConeGeometry => new ConeGeometry(r, h, 4);
  const crown: Bit[] = [];
  for (let i = 0; i < 3; i++)
    crown.push(
      bit(new ConeGeometry(1.5, 4.6, 5), s.trim, [
        at[0] + (i - 1) * 4.2 * 0.85,
        at[1] + 11.8,
        at[2] - (i - 1) * 4.2 * 0.5,
      ]),
    );
  return {
    off: [
      bit(box(14.5, 17, 1.8), s.trim, at, rot),
      bit(
        point(7.2, 9),
        s.trim,
        [at[0], at[1] - 12.5, at[2]],
        [0, -0.55 + Math.PI / 4, Math.PI],
        [1, 1, 0.25],
      ),
      bit(box(15, 2.4, 1.8), s.trim, [at[0], at[1] + 9, at[2]], rot),
      ...crown,
    ],
    offGlow: [
      bit(box(12, 14.4, 0.5), c, [at[0] + 0.2, at[1] + 0.4, at[2] + 1], rot),
      bit(
        point(5.9, 7.4),
        c,
        [at[0] + 0.2, at[1] - 10.4, at[2] + 1],
        [0, -0.55 + Math.PI / 4, Math.PI],
        [1, 1, 0.09],
      ),
    ],
    // a long sceptre with a big orb
    weapon: [
      bit(cyl(0.7, 34, 6), s.trim, [hx, hy + 8, hz]),
      bit(new TorusGeometry(3.7, 0.5, 6, 16), s.trim, [hx, hy + 28, hz]),
      bit(new TorusGeometry(3.7, 0.5, 6, 16).rotateY(Math.PI / 2), s.trim, [hx, hy + 28, hz]),
      bit(box(0.8, 3.4, 0.8), s.trim, [hx, hy + 33.4, hz]),
    ],
    armGlow: [bit(ball(2.9, 10), c, [hx, hy + 28, hz])],
    gesture: 'cast',
  };
}

function usurper(s: PropScheme, a: Anchors, c: string): StyleProps {
  const body: Bit[] = [];
  const glow: Bit[] = [];
  // a tall spiked collar fanned behind the head
  for (let i = 0; i < 7; i++) {
    const t = (i / 6 - 0.5) * 2.6;
    const x = Math.sin(t) * 8;
    const z = -Math.cos(t) * 7.2;
    const h = 10 - Math.abs(t) * 3.4;
    glow.push(
      bit(box(4.2, h, 0.9), c, [x, a.neckY + h / 2 + 0.6, z], [-0.25, Math.PI - t, 0]),
      bit(new ConeGeometry(1.8, 5, 4), c, [x * 1.1, a.neckY + h + 2.8, z * 1.1], [-0.25, 0, 0]),
    );
  }
  // thorned shoulders
  for (const side of [-1, 1])
    for (let i = 0; i < 2; i++)
      body.push(
        bit(
          new ConeGeometry(1.4, 6 - i * 1.8, 5),
          s.dark ? '#1b1722' : '#3b2a3a',
          [side * (a.shoulderX + 2.2 + i * 2.2), a.shoulderY + 4.6 - i * 1.8, 0],
          [0, 0, -side * (0.5 + i * 0.5)],
        ),
      );
  const [ox, oy, oz] = a.off;
  const cup = lathe(
    [
      [0.01, 0],
      [3, 0],
      [0.7, 1.2],
      [0.6, 4.6],
      [3.6, 6.4],
      [4, 10.5],
      [3.4, 10.6],
      [0.01, 8],
    ],
    12,
  );
  return {
    body,
    glow,
    off: [bit(cup, s.dark ? '#1b1722' : '#3b2a3a', [ox, oy - 0.8, oz + 1])],
    offGlow: [bit(new CylinderGeometry(3.4, 3.4, 0.6, 12), c, [ox, oy + 9.5, oz + 1])],
  };
}

/* ---------------------------------- Queen --------------------------------- */

function regent(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const cy = a.shoulderY - 6;
  const spin: Bit[] = [
    bit(new TorusGeometry(15, 0.75, 6, 40).rotateX(Math.PI / 2 - 0.22), c, [0, cy, 0]),
  ];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    spin.push(
      bit(ball(2.6, 10), c, [
        Math.cos(t) * 15,
        cy + Math.sin(t) * 15 * Math.sin(0.22),
        Math.sin(t) * 15,
      ]),
    );
  }
  return {
    spin,
    weapon: [
      bit(cyl(0.6, 22, 6), s.trim, [hx, hy + 5, hz]),
      bit(new TorusGeometry(2.6, 0.45, 6, 14), s.trim, [hx, hy + 16.8, hz]),
    ],
    armGlow: [bit(ball(2.3, 10), c, [hx, hy + 16.8, hz])],
    gesture: 'cast',
  };
}

function duelist(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const [ox, oy, oz] = a.off;
  const hy0 = a.headY + 3.6;
  const plume: V3[] = [
    [4.4, hy0 + 3.4, 0.6],
    [5.8, hy0 + 4.4, -2.4],
    [5.8, hy0 + 4.4, -5.8],
    [4.6, hy0 + 3, -8.6],
    [3, hy0 + 0.8, -10.2],
  ];
  return {
    weapon: [
      bit(cyl(0.5, 3.6, 6), s.trim, [hx, hy, hz + 1], [Math.PI / 2, 0, 0]),
      bit(new TorusGeometry(2.4, 0.42, 6, 14, Math.PI * 1.3).rotateY(Math.PI / 2), s.trim, [
        hx,
        hy,
        hz + 3,
      ]),
      bit(box(6, 0.6, 0.9), s.trim, [hx, hy, hz + 3.4]),
      // a long rapier
      bit(box(0.8, 0.5, 32), STEEL, [hx, hy, hz + 19.5]),
    ],
    armGlow: [bit(new SphereGeometry(1.9, 8, 6), c, [hx, hy, hz + 3])],
    off: [
      bit(box(0.6, 0.5, 11), STEEL, [ox, oy, oz + 7]),
      bit(box(4.4, 0.6, 0.9), s.trim, [ox, oy, oz + 1.6]),
    ],
    // a cocked hat with a sweeping plume
    head: [
      bit(cyl(6.8, 0.7, 16), s.dark ? '#1b1722' : '#5a3a3a', [0, hy0 + 0.6, 0], [0.1, 0, 0.14]),
      bit(cyl(3.9, 4.1, 3.6, 14), s.dark ? '#1b1722' : '#5a3a3a', [0, hy0 + 2.6, 0]),
      bit(new TorusGeometry(4.05, 0.5, 5, 14).rotateX(Math.PI / 2), s.trim, [0, hy0 + 1.6, 0]),
    ],
    headGlow: plume.map((p, i) => bit(ball(1.6 - i * 0.14, 8), c, p, [0.9, 1, 2.2])),
    glow: [
      // a baldric across the chest
      bit(box(1.8, 15, 0.7), c, [0, a.shoulderY - 6.6, a.radius + 0.3], [-0.05, 0, 0.62]),
    ],
  };
}

function huntress(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [ox, oy, oz] = a.off;
  const R = 19;
  const gz = oz + 2.4;
  const bow = new TorusGeometry(R, 1.35, 5, 22, 2.1).rotateZ(-1.05).rotateY(-Math.PI / 2);
  const tipDy = Math.sin(1.05) * R;
  const tipDz = Math.cos(1.05) * R - R;
  const [hx, hy, hz] = a.hand;
  const quiverZ = a.backZ - 3.4;
  const fletch = (x: number, y: number, z: number): Bit =>
    bit(new ConeGeometry(1.2, 3.4, 4), c, [x, y, z], [-0.35, 0, -0.35]);
  return {
    off: [bit(cyl(0.22, tipDy * 2, 4), s.dark ? '#c6cfdc' : '#f4ead2', [ox, oy + 1, gz + tipDz])],
    offGlow: [bit(bow, c, [ox, oy + 1, gz - R]), bit(box(2.2, 4, 2.2), s.trim, [ox, oy + 1, gz])],
    body: [
      // quiver on the back
      bit(
        cyl(2.2, 14, 8, 1.8),
        s.dark ? '#3a2e44' : '#7a4a2a',
        [3.4, a.shoulderY - 2, quiverZ],
        [-0.3, 0, -0.35],
      ),
    ],
    glow: [
      fletch(5, a.shoulderY + 6.2, quiverZ - 2.6),
      fletch(6.6, a.shoulderY + 5.6, quiverZ - 2),
      fletch(5.6, a.shoulderY + 7, quiverZ - 0.8),
    ],
    // an arrow in the draw hand
    weapon: [
      bit(cyl(0.3, 16, 4), s.trim, [hx, hy, hz + 5], [Math.PI / 2, 0, 0]),
      bit(new ConeGeometry(0.9, 2.4, 4), STEEL, [hx, hy, hz + 14], [Math.PI / 2, 0, 0]),
    ],
    restL: -0.5,
    gesture: 'bow',
  };
}

/* ---------------------------------- Rook ---------------------------------- */

function bastion(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a tall tower shield held across the front-left
  const [ox, oy, oz] = a.off;
  const at: V3 = [ox + 3.4, oy + 5.4, oz + 9];
  const rot: V3 = [0, 0.3, 0];
  const merlons: Bit[] = [];
  for (let i = 0; i < 3; i++)
    merlons.push(
      bit(
        box(4.2, 3.4, 2.6),
        s.trim,
        [
          at[0] + (i - 1) * 6.4 * Math.cos(0.3),
          at[1] + 15.4,
          at[2] - (i - 1) * 6.4 * Math.sin(0.3),
        ],
        rot,
      ),
    );
  return {
    off: [bit(box(21, 29, 2.8), s.trim, at, rot), ...merlons],
    offGlow: [
      bit(box(17, 24.6, 0.6), c, [at[0] - 0.4, at[1] - 0.2, at[2] + 1.6], rot),
      bit(ball(2.4, 8), s.dark ? '#c6cfdc' : '#7a5a2a', [at[0] - 0.5, at[1] + 1, at[2] + 2.4]),
    ],
    restL: -0.15,
  };
}

function ram(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a battering ram carried on the weapon shoulder, the arm hugging it
  const x = a.shoulderX - 1.6;
  const y = a.shoulderY + 10.4;
  const len = 40;
  const zc = len / 2 - 14;
  const front = zc + len / 2;
  const body: Bit[] = [bit(cyl(3, len, 9), wood(s), [x, y, zc], [Math.PI / 2, 0, 0])];
  for (const dz of [-12, 0, 12])
    body.push(bit(new TorusGeometry(3.3, 0.6, 5, 14), s.trim, [x, y, zc + dz]));
  body.push(
    bit(ball(4.5, 10), s.trim, [x, y, front + 1.5], undefined, [1, 1, 1.15]),
    bit(cyl(1.4, 7, 6), s.trim, [x + 2, y - 5, zc - 5]),
  );
  // curled horns on the ram head, in the style colour
  const horn = (): BufferGeometry =>
    new TorusGeometry(2.9, 1.3, 6, 14, Math.PI * 1.6).rotateY(Math.PI / 2);
  return {
    body,
    glow: [bit(horn(), c, [x + 4.8, y + 1, front]), bit(horn(), c, [x - 4.8, y + 1, front])],
    weapon: [],
    restR: -2.3,
    lungeK: 0.08,
  };
}

function vanguard(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a long lance raised forward, with a pennant under the head
  const [hx, hy, hz] = a.hand;
  const tilt = 0.62;
  const L = 56;
  const at = (t: number, side = 0): V3 => [
    hx,
    hy + Math.cos(tilt) * t - Math.sin(tilt) * side,
    hz + Math.sin(tilt) * t + Math.cos(tilt) * side,
  ];
  return {
    weapon: [
      bit(cyl(1.1, L, 7, 1.4), wood(s), at(L / 2 - 8), [tilt, 0, 0]),
      bit(new ConeGeometry(2.6, 7.5, 6), STEEL, at(L - 4.5), [tilt, 0, 0]),
      bit(new ConeGeometry(3.8, 5, 8), s.trim, at(2), [tilt + Math.PI, 0, 0]),
    ],
    armGlow: [bit(box(0.6, 8, 17), c, at(L - 17, -8), [tilt - Math.PI / 2 + 0.1, 0, 0])],
    glow: [
      // a chevron on the chest
      bit(box(2.4, 10, 1), c, [-3.4, a.shoulderY - 5, a.radius + 0.2], [0, 0, -0.9]),
      bit(box(2.4, 10, 1), c, [3.4, a.shoulderY - 5, a.radius + 0.2], [0, 0, 0.9]),
    ],
  };
}

/* --------------------------------- Bishop --------------------------------- */

function light(s: PropScheme, a: Anchors, c: string): StyleProps {
  const hc: V3 = [0, a.headTop - 4, -3.6];
  const headGlow: Bit[] = [bit(new TorusGeometry(8.6, 1, 6, 28), c, hc, [-0.45, 0, 0])];
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * TAU;
    const r = 11.4;
    headGlow.push(
      bit(
        new ConeGeometry(0.9, i % 2 ? 3.2 : 5, 4),
        c,
        [
          hc[0] + Math.cos(t) * r,
          hc[1] + Math.sin(t) * r * Math.cos(0.45),
          hc[2] - Math.sin(t) * r * Math.sin(0.45),
        ],
        [-0.45, 0, t - Math.PI / 2],
      ),
    );
  }
  // a sunburst behind the back
  const sun: V3 = [0, a.shoulderY + 1, a.backZ - 3.4];
  const glow: Bit[] = [bit(new TorusGeometry(10, 0.9, 6, 30), c, sun)];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * TAU;
    const len = i % 2 ? 6 : 10;
    const r = 12.4 + len / 2;
    glow.push(
      bit(
        new ConeGeometry(1.5, len, 4),
        c,
        [sun[0] + Math.cos(t) * r, sun[1] + Math.sin(t) * r, sun[2]],
        [0, 0, t - Math.PI / 2],
      ),
    );
  }
  const [hx, hy, hz] = a.hand;
  return {
    headGlow,
    glow,
    weapon: [
      bit(cyl(0.55, 36, 6), s.trim, [hx, hy + 2, hz]),
      bit(new TorusGeometry(3.8, 0.5, 6, 16), s.trim, [hx, hy + 22, hz]),
    ],
    armGlow: [bit(new CylinderGeometry(3, 3, 0.8, 14).rotateX(Math.PI / 2), c, [hx, hy + 22, hz])],
    gesture: 'cast',
  };
}

function shadow(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a peaked hood open at the front, over the mitre
  const hood = lathe(
    [
      [5.8, a.neckY - 1],
      [6, a.neckY + 3],
      [5.4, a.neckY + 7.8],
      [4.2, a.neckY + 12],
      [2.3, a.neckY + 15.4],
      [0.01, a.neckY + 17.2],
    ],
    16,
    TAU * 0.14,
    TAU * 0.72,
  );
  const [ox, oy, oz] = a.off;
  return {
    head: [bit(hood, s.dark ? HOOD_B : HOOD_A)],
    body: [
      // a tattered mantle over the shoulders
      bit(
        lathe(
          [
            [0.01, a.neckY + 1],
            [6.4, a.neckY - 0.6],
            [8.6, a.neckY - 6],
            [9, a.neckY - 9],
          ],
          14,
        ),
        s.dark ? HOOD_B : HOOD_A,
      ),
    ],
    off: [
      bit(cyl(0.3, 6, 4), s.trim, [ox, oy - 2.2, oz + 1]),
      bit(box(3.4, 0.8, 3.4), s.trim, [ox, oy - 5.2, oz + 1]),
    ],
    glow: [
      bit(
        new TorusGeometry(6.2, 0.95, 5, 18, TAU * 0.72)
          .rotateX(Math.PI / 2)
          .rotateY(-Math.PI / 2 - TAU * 0.14),
        c,
        [0, a.neckY - 1.2, 0],
      ),
    ],
    // a lantern of violet fire in the off hand
    offGlow: [bit(new IcosahedronGeometry(2.4, 0), c, [ox, oy - 8, oz + 1])],
    gesture: 'cast',
  };
}

function zealot(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const chain: Bit[] = [];
  for (let i = 0; i < 4; i++)
    chain.push(
      bit(ball(0.75, 6), s.trim, [hx + 1.6 + i * 1.6, hy + 9 - i * 0.9, hz + 2 + i * 0.6]),
    );
  const [ox, oy, oz] = a.off;
  return {
    weapon: [
      bit(cyl(0.7, 12, 6), wood(s), [hx, hy + 3.5, hz], [0.25, 0, -0.3]),
      ...chain,
      ...spikes([hx + 9.8, hy + 5.4, hz + 5], 3.2, s.dark ? '#c6cfdc' : '#5a4a3a'),
    ],
    off: [
      bit(cyl(0.8, 14, 6), wood(s), [ox, oy + 3, oz + 1]),
      bit(cyl(2.5, 2.8, 8, 1.6), s.trim, [ox, oy + 10.8, oz + 1]),
    ],
    // a burning censer flame
    offGlow: [
      bit(new ConeGeometry(3.6, 12, 6), c, [ox, oy + 17.4, oz + 1]),
      bit(new ConeGeometry(1.9, 6.6, 5), '#fff0b0', [ox, oy + 15.6, oz + 2.2]),
    ],
  };
}

/* --------------------------------- Knight --------------------------------- */

function lancer(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a heavy couched lance in the style colour, with a vamplate and pennon
  const [hx, hy, hz] = a.hand;
  const L = 56;
  const stripes: Bit[] = [];
  for (const t of [14, 24, 34])
    stripes.push(bit(new TorusGeometry(2.45 - t * 0.04, 0.55, 5, 12), s.trim, [hx, hy, hz + t]));
  return {
    weapon: [
      bit(new ConeGeometry(5, 7, 10), s.trim, [hx, hy, hz + 3], [-Math.PI / 2, 0, 0]),
      bit(cyl(1, 8, 6), s.trim, [hx, hy, hz - 2], [Math.PI / 2, 0, 0]),
      ...stripes,
    ],
    armGlow: [
      bit(new ConeGeometry(2.8, L, 8), c, [hx, hy, hz + 4 + L / 2], [Math.PI / 2, 0, 0]),
      bit(box(0.5, 4.4, 9), c, [hx, hy + 3.8, hz + 10]),
    ],
  };
}

function errant(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const pz = a.backZ - 3.6;
  const py = a.shoulderY - 4.6;
  return {
    body: [
      // a travelling pack with a bedroll and a hanging lantern
      bit(box(9.4, 10.4, 5.8), s.dark ? '#3a2e44' : '#8a5a34', [0, py, pz]),
      bit(box(9.8, 1.2, 6.2), s.trim, [0, py + 2.4, pz]),
      bit(cyl(0.3, 4, 4), s.trim, [5.4, py - 2.4, pz - 2.4]),
    ],
    glow: [
      bit(cyl(2.5, 14, 10).rotateZ(Math.PI / 2), c, [0, py + 6.4, pz]),
      bit(new IcosahedronGeometry(1.7, 0), '#ffe08a', [5.4, py - 5.4, pz - 2.4]),
      // a compass on the chest
      bit(new CylinderGeometry(3.2, 3.2, 0.8, 14).rotateX(Math.PI / 2), c, [
        0,
        21.4,
        a.radius + 0.4,
      ]),
      bit(
        new ConeGeometry(1, 4.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4),
        '#15121b',
        [0, 21.4, a.radius + 1],
        [Math.PI / 2, 0, 0],
      ),
    ],
    // a short spear in place of the sword
    weapon: [
      bit(cyl(0.6, 26, 6), wood(s), [hx, hy, hz + 10], [Math.PI / 2, 0, 0]),
      bit(new ConeGeometry(1.6, 5.4, 5), STEEL, [hx, hy, hz + 25], [Math.PI / 2, 0, 0]),
    ],
  };
}

function paladin(s: PropScheme, a: Anchors, c: string): StyleProps {
  const feather = s.dark ? '#c9d2e4' : '#fbf8ef';
  const body: Bit[] = [];
  const glow: Bit[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const len = 22 - i * 3.6;
      const ang = 0.55 + i * 0.32;
      const root: V3 = [side * 2.4, a.shoulderY + 1, a.backZ - 2.4];
      const dx = Math.sin(ang) * len * 0.5;
      const dy = Math.cos(ang) * len * 0.5;
      body.push(
        bit(
          box(len, 3.6, 0.9),
          feather,
          [root[0] + side * dx * 1.0, root[1] + dy * 0.9, root[2] - 1.5],
          [0.15, side * -0.3, side * (Math.PI / 2 - ang)],
        ),
      );
      if (i === 0)
        glow.push(
          bit(
            box(5.4, 3.8, 1),
            c,
            [root[0] + side * dx * 1.85, root[1] + dy * 1.75, root[2] - 2],
            [0.15, side * -0.3, side * (Math.PI / 2 - ang)],
          ),
        );
    }
  }
  const [ox, oy, oz] = a.off;
  const at: V3 = [ox - 2.6, oy + 2.4, oz + 3.4];
  const rot: V3 = [0, -0.5, 0];
  return {
    body,
    glow,
    off: [
      bit(box(11, 12, 1.6), s.trim, at, rot),
      bit(
        new ConeGeometry(5.6, 7.5, 4),
        s.trim,
        [at[0], at[1] - 9.2, at[2]],
        [0, -0.5 + Math.PI / 4, Math.PI],
        [1, 1, 0.28],
      ),
    ],
    offGlow: [
      bit(box(9.2, 10, 0.5), c, [at[0] + 0.1, at[1] + 0.2, at[2] + 0.9], rot),
      bit(
        new ConeGeometry(4.5, 5.6, 4),
        c,
        [at[0] + 0.1, at[1] - 8.6, at[2] + 0.9],
        [0, -0.5 + Math.PI / 4, Math.PI],
        [1, 1, 0.1],
      ),
      bit(box(0.7, 7.6, 0.6), '#ffffff', [at[0] + 0.2, at[1] + 0.4, at[2] + 1.4], rot),
      bit(box(5, 0.7, 0.6), '#ffffff', [at[0] + 0.2, at[1] + 2, at[2] + 1.4], rot),
    ],
  };
}

const BUILDERS: Record<string, (s: PropScheme, a: Anchors, c: string) => StyleProps> = {
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

/** The signature props for a style (empty for an unknown style). */
export function styleProps(
  style: string | null,
  s: PropScheme,
  a: Anchors,
  color: string,
): StyleProps {
  const b = style ? BUILDERS[style] : undefined;
  return b ? b(s, a, color) : {};
}
