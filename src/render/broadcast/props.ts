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
 * primitives and merged into the piece's existing meshes, so they add no draw calls (Regent's
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
  radius: number;
  neckY: number;
  headTop: number;
  backZ: number;
}

export interface StyleProps {
  /** Lit, inked parts on the body (static). */
  body?: Bit[];
  /** Lit parts on the head (move with it). Absolute coordinates. */
  head?: Bit[];
  /** Replaces the piece's default weapon in the weapon hand (absolute coordinates). */
  weapon?: Bit[];
  /** Added to the weapon arm next to the default weapon. */
  arm?: Bit[];
  /** Unlit style-colour parts (static, figure space). */
  glow?: Bit[];
  /** Unlit style-colour parts held in the weapon hand (swing with the arm; absolute coordinates). */
  armGlow?: Bit[];
  /** Unlit parts that orbit the piece (figure space; turned about the y axis through `pivot`). */
  spin?: Bit[];
}

const STEEL = '#e8edf3';
const FUR_A = '#efe6d2';
const FUR_B = '#2c2633';
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

/** A spiked ball (flail head). */
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

function warlord(s: PropScheme, a: Anchors, c: string): StyleProps {
  const px = a.off[0] - 1.2;
  const pz = a.off[2];
  const top = 64;
  return {
    body: [
      bit(cyl(0.8, top - 2), wood(s), [px, (top - 2) / 2 + 1, pz]),
      bit(new ConeGeometry(1.5, 4, 6), s.trim, [px, top + 1.5, pz]),
      bit(box(17, 1.1, 1.1), s.trim, [px - 7.6, top - 2.2, pz]),
      bit(ball(1.3, 7), s.trim, [px - 16, top - 2.2, pz]),
    ],
    glow: [
      // a swallow-tailed banner, two panels in a shallow V so it never reads edge-on
      bit(box(8.4, 16, 0.6), c, [px - 4.2, top - 10.5, pz + 0.9], [0, 0.42, 0]),
      bit(box(8.4, 16, 0.6), c, [px - 11.8, top - 10.5, pz + 0.9], [0, -0.42, 0]),
      bit(new ConeGeometry(2.6, 5, 3), c, [px - 4.2, top - 20.5, pz + 0.9], [Math.PI, 0.42, 0]),
      bit(new ConeGeometry(2.6, 5, 3), c, [px - 11.8, top - 20.5, pz + 0.9], [Math.PI, -0.42, 0]),
    ],
  };
}

function sovereign(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [ox, oy, oz] = a.off;
  const sx = ox - 2.8;
  const sz = oz + 3;
  const [hx, hy, hz] = a.hand;
  const crown: Bit[] = [];
  for (let i = 0; i < 3; i++)
    crown.push(
      bit(new ConeGeometry(1.5, 4.6, 5), s.trim, [sx - 0.4, oy + 14.2, sz + (i - 1) * 4.8]),
    );
  const point = (r: number, h: number): ConeGeometry => new ConeGeometry(r, h, 4);
  return {
    body: [
      // a big crowned kite shield on the off arm, face outward
      bit(box(1.8, 17, 14.5), s.trim, [sx, oy + 2.5, sz]),
      bit(point(7.2, 9), s.trim, [sx, oy - 10.5, sz], [Math.PI, Math.PI / 4, 0], [0.25, 1, 1]),
      bit(box(1.6, 2.4, 15), s.trim, [sx - 0.3, oy + 11.6, sz]),
      ...crown,
    ],
    glow: [
      bit(box(0.5, 14.6, 12), c, [sx - 1, oy + 2.6, sz]),
      bit(point(5.9, 7.4), c, [sx - 1, oy - 9, sz], [Math.PI, Math.PI / 4, 0], [0.09, 1, 1]),
    ],
    // a long ranged sceptre with a big orb
    weapon: [
      bit(cyl(0.7, 36, 6), s.trim, [hx, hy + 8, hz]),
      bit(new TorusGeometry(3.6, 0.5, 6, 16), s.trim, [hx, hy + 30, hz]),
      bit(new TorusGeometry(3.6, 0.5, 6, 16).rotateY(Math.PI / 2), s.trim, [hx, hy + 30, hz]),
      bit(box(0.8, 3.4, 0.8), s.trim, [hx, hy + 35.2, hz]),
    ],
    armGlow: [bit(ball(2.8, 10), c, [hx, hy + 30, hz])],
  };
}

function usurper(s: PropScheme, a: Anchors, c: string): StyleProps {
  const fur = s.dark ? FUR_B : FUR_A;
  const body: Bit[] = [
    bit(new TorusGeometry(8.2, 2.8, 7, 18).rotateX(Math.PI / 2), fur, [0, a.neckY + 0.2, 0]),
  ];
  const glow: Bit[] = [];
  // a tall spiked collar fanned behind the head
  for (let i = 0; i < 7; i++) {
    const t = (i / 6 - 0.5) * 2.4;
    const x = Math.sin(t) * 7;
    const z = -Math.cos(t) * 7;
    glow.push(
      bit(box(4.4, 15, 0.9), c, [x, a.neckY + 8, z], [-0.35 * Math.cos(t), t, 0.35 * Math.sin(t)]),
      bit(
        new ConeGeometry(1.7, 6, 4),
        c,
        [x * 1.33, a.neckY + 17.5, z * 1.33],
        [-0.4 * Math.cos(t), 0, 0.4 * Math.sin(t)],
      ),
    );
  }
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
  body.push(bit(cup, s.dark ? '#1b1722' : '#3b2a3a', [ox - 0.6, oy - 0.5, oz + 2.4]));
  glow.push(bit(new CylinderGeometry(3.4, 3.4, 0.6, 12), c, [ox - 0.6, oy + 9.9, oz + 2.4]));
  return { body, glow };
}

function regent(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const spin: Bit[] = [
    bit(new TorusGeometry(15, 0.75, 6, 40).rotateX(Math.PI / 2 - 0.22), c, [0, 24, 0]),
  ];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * TAU;
    spin.push(
      bit(ball(2.6, 10), c, [
        Math.cos(t) * 15,
        24 + Math.sin(t) * 15 * Math.sin(0.22),
        Math.sin(t) * 15,
      ]),
    );
  }
  return {
    spin,
    weapon: [
      bit(cyl(0.6, 16, 6), s.trim, [hx, hy + 4, hz + 1]),
      bit(new TorusGeometry(2.4, 0.45, 6, 14), s.trim, [hx, hy + 13.5, hz + 1]),
      bit(ball(2.1, 10), c, [hx, hy + 13.5, hz + 1]),
    ],
  };
}

function duelist(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const [ox, oy, oz] = a.off;
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
      bit(box(0.8, 0.5, 30), STEEL, [hx, hy, hz + 18.5]),
    ],
    body: [bit(box(0.6, 0.4, 9), STEEL, [ox, oy - 0.5, oz + 6])],
    armGlow: [bit(new SphereGeometry(1.8, 8, 6), c, [hx, hy, hz + 3])],
    glow: [
      // a sweeping plume from the crown
      bit(box(2.4, 3.4, 18), c, [1.2, a.headTop + 2, -5], [-0.7, 0.15, 0]),
      bit(box(1.8, 2.6, 13), c, [2.6, a.headTop - 0.5, -7.5], [-0.95, 0.35, 0]),
      // a short shoulder cape
      bit(box(9, 15, 0.8), c, [-4.8, a.shoulderY - 6.5, -4.2], [0.18, 0.3, 0.12]),
    ],
  };
}

function huntress(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [ox, oy, oz] = a.off;
  const R = 18;
  const gz = oz + 2.4;
  const bow = new TorusGeometry(R, 1.35, 5, 22, 2.1).rotateZ(-1.05).rotateY(-Math.PI / 2);
  const tipDy = Math.sin(1.05) * R;
  const tipDz = Math.cos(1.05) * R - R;
  const [hx, hy, hz] = a.hand;
  return {
    body: [
      bit(cyl(0.22, tipDy * 2, 4), s.dark ? '#c6cfdc' : '#f4ead2', [ox - 1, oy + 3, gz + tipDz]),
      // quiver on the back
      bit(
        cyl(2.2, 13, 8, 1.8),
        s.dark ? '#3a2e44' : '#7a4a2a',
        [3.2, a.shoulderY - 2, a.backZ - 1],
        [-0.35, 0, -0.35],
      ),
    ],
    glow: [
      bit(bow, c, [ox - 1, oy + 3, gz - R]),
      bit(box(2.2, 4, 2.2), s.trim, [ox - 1, oy + 3, gz]),
      bit(
        new ConeGeometry(1.2, 3.4, 4),
        c,
        [4.6, a.shoulderY + 6, a.backZ - 3.8],
        [-0.35, 0, -0.35],
      ),
      bit(
        new ConeGeometry(1.2, 3.4, 4),
        c,
        [6.2, a.shoulderY + 5.4, a.backZ - 3.2],
        [-0.35, 0, -0.35],
      ),
      bit(
        new ConeGeometry(1.2, 3.4, 4),
        c,
        [5.2, a.shoulderY + 6.8, a.backZ - 2],
        [-0.35, 0, -0.35],
      ),
    ],
    // an arrow in the draw hand
    weapon: [
      bit(cyl(0.3, 16, 4), s.trim, [hx, hy, hz + 5], [Math.PI / 2, 0, 0]),
      bit(new ConeGeometry(0.9, 2.4, 4), STEEL, [hx, hy, hz + 14], [Math.PI / 2, 0, 0]),
    ],
  };
}

function bastion(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a tall tower shield across the front-left
  const at: V3 = [-6.5, 13.5, 11.5];
  const rot: V3 = [0, -0.42, 0];
  const merlons: Bit[] = [];
  for (let i = 0; i < 3; i++)
    merlons.push(
      bit(
        box(3, 3, 2),
        s.trim,
        [
          at[0] + (i - 1) * 4.6 * Math.cos(0.42),
          at[1] + 12.5,
          at[2] + (i - 1) * 4.6 * Math.sin(0.42),
        ],
        rot,
      ),
    );
  return {
    body: [bit(box(15, 22, 2.2), s.trim, at, rot), ...merlons],
    glow: [
      bit(box(12, 18.5, 0.6), c, [at[0] + 0.55, at[1], at[2] + 1.2], rot),
      bit(ball(1.8, 8), s.dark ? '#c6cfdc' : '#7a5a2a', [at[0] + 0.7, at[1], at[2] + 1.7]),
    ],
  };
}

function ram(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a battering ram on the weapon shoulder; it swings with the arm
  const [hx] = a.hand;
  const x = hx - 2;
  const y = a.shoulderY + 6;
  const len = 38;
  const zc = len / 2 - 4;
  const front = zc + len / 2;
  const weapon: Bit[] = [bit(cyl(3, len, 9), wood(s), [x, y, zc], [Math.PI / 2, 0, 0])];
  for (const dz of [-12, 0, 12])
    weapon.push(bit(new TorusGeometry(3.3, 0.6, 5, 14), s.trim, [x, y, zc + dz]));
  weapon.push(
    bit(ball(4.4, 10), s.trim, [x, y, front + 1.5], undefined, [1, 1, 1.15]),
    bit(cyl(1.8, 5, 7), s.trim, [x, y - 7, zc - 2]),
  );
  // curled horns on the ram head, in the style colour
  const horn = (): BufferGeometry =>
    new TorusGeometry(2.8, 1.25, 6, 14, Math.PI * 1.6).rotateY(Math.PI / 2);
  return {
    weapon,
    armGlow: [bit(horn(), c, [x + 4.6, y + 1, front]), bit(horn(), c, [x - 4.6, y + 1, front])],
  };
}

function vanguard(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a long lance raised forward, with a pennant under the head
  const [hx, hy, hz] = a.hand;
  const tilt = 0.62;
  const L = 54;
  const at = (t: number, side = 0): V3 => [
    hx,
    hy + Math.cos(tilt) * t - Math.sin(tilt) * side,
    hz + Math.sin(tilt) * t + Math.cos(tilt) * side,
  ];
  return {
    weapon: [
      bit(cyl(1, L, 7, 1.3), wood(s), at(L / 2 - 8), [tilt, 0, 0]),
      bit(new ConeGeometry(2.4, 7, 6), STEEL, at(L - 4.5), [tilt, 0, 0]),
      bit(new ConeGeometry(3.6, 5, 8), s.trim, at(2), [tilt + Math.PI, 0, 0]),
    ],
    armGlow: [bit(box(0.6, 7.5, 15), c, at(L - 16, -7.6), [tilt - Math.PI / 2 + 0.1, 0, 0])],
    glow: [
      // a chevron on the chest
      bit(box(2.2, 9, 1), c, [-3, a.shoulderY - 2, a.radius - 1.2], [0, 0, -0.9]),
      bit(box(2.2, 9, 1), c, [3, a.shoulderY - 2, a.radius - 1.2], [0, 0, 0.9]),
    ],
  };
}

function light(s: PropScheme, a: Anchors, c: string): StyleProps {
  const hc: V3 = [0, a.headTop - 4, -3.6];
  const glow: Bit[] = [bit(new TorusGeometry(8.4, 1, 6, 28), c, hc, [-0.45, 0, 0])];
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * TAU;
    const r = 11.2;
    glow.push(
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
  const [hx, hy, hz] = a.hand;
  return {
    glow,
    weapon: [
      bit(cyl(0.55, 34, 6), s.trim, [hx, hy - 1, hz]),
      bit(new TorusGeometry(3.6, 0.5, 6, 16), s.trim, [hx, hy + 19, hz]),
      bit(new CylinderGeometry(2.8, 2.8, 0.8, 14).rotateX(Math.PI / 2), c, [hx, hy + 19, hz]),
    ],
  };
}

function shadow(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a peaked hood open at the front, over the mitre
  const hood = lathe(
    [
      [6.4, a.neckY - 2],
      [6.6, a.neckY + 3],
      [6, a.neckY + 9],
      [4.6, a.neckY + 14],
      [2.4, a.neckY + 18.5],
      [0.01, a.neckY + 21.5],
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
            [7, a.neckY - 1],
            [9.6, a.neckY - 8],
            [9.8, a.neckY - 10],
          ],
          14,
        ),
        s.dark ? HOOD_B : HOOD_A,
      ),
      bit(cyl(0.3, 5, 4), s.trim, [ox - 0.5, oy - 2.5, oz + 2]),
      bit(box(3.4, 0.8, 3.4), s.trim, [ox - 0.5, oy - 5.5, oz + 2]),
    ],
    glow: [
      bit(
        new TorusGeometry(6.6, 0.95, 5, 18, TAU * 0.72)
          .rotateX(Math.PI / 2)
          .rotateY(-Math.PI / 2 - TAU * 0.14),
        c,
        [0, a.neckY - 1.6, 0],
      ),
      // a lantern of violet fire in the off hand
      bit(new IcosahedronGeometry(2.2, 0), c, [ox - 0.5, oy - 8.2, oz + 2]),
    ],
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
      bit(cyl(0.7, 11, 6), wood(s), [hx, hy + 3.5, hz], [0.25, 0, -0.3]),
      ...chain,
      ...spikes([hx + 9.5, hy + 5.4, hz + 5], 3, s.dark ? '#c6cfdc' : '#5a4a3a'),
    ],
    body: [
      bit(cyl(0.8, 12, 6), wood(s), [ox - 0.5, oy + 2, oz + 2]),
      bit(cyl(2.3, 2.6, 8, 1.5), s.trim, [ox - 0.5, oy + 8.8, oz + 2]),
    ],
    glow: [
      // a burning censer flame
      bit(new ConeGeometry(3.4, 11, 6), c, [ox - 0.5, oy + 15, oz + 2]),
      bit(new ConeGeometry(1.8, 6.4, 5), '#fff0b0', [ox - 0.5, oy + 13.4, oz + 3.2]),
    ],
  };
}

function lancer(s: PropScheme, a: Anchors, c: string): StyleProps {
  // a heavy couched lance in the style colour, with a vamplate and pennon
  const [hx, hy, hz] = a.hand;
  const L = 52;
  const stripes: Bit[] = [];
  for (const t of [14, 24, 34])
    stripes.push(bit(new TorusGeometry(2.25 - t * 0.04, 0.55, 5, 12), s.trim, [hx, hy, hz + t]));
  return {
    weapon: [
      bit(new ConeGeometry(5, 7, 10), s.trim, [hx, hy, hz + 3], [-Math.PI / 2, 0, 0]),
      bit(cyl(0.9, 6, 6), s.trim, [hx, hy, hz - 1], [Math.PI / 2, 0, 0]),
      ...stripes,
    ],
    armGlow: [
      bit(new ConeGeometry(2.6, L, 8), c, [hx, hy, hz + 4 + L / 2], [Math.PI / 2, 0, 0]),
      bit(box(0.5, 4, 8), c, [hx, hy + 3.4, hz + 9]),
    ],
  };
}

function errant(s: PropScheme, a: Anchors, c: string): StyleProps {
  const [hx, hy, hz] = a.hand;
  const pz = a.backZ - 4.6;
  return {
    body: [
      // a travelling pack with a bedroll and a hanging lantern
      bit(box(9, 10, 5.6), s.dark ? '#3a2e44' : '#8a5a34', [0, 13, pz]),
      bit(box(9.4, 1.2, 6), s.trim, [0, 16, pz]),
      bit(cyl(0.3, 4, 4), s.trim, [5.2, 12, pz - 2.4]),
    ],
    glow: [
      bit(cyl(2.4, 13, 10).rotateZ(Math.PI / 2), c, [0, 19.6, pz]),
      bit(new IcosahedronGeometry(1.6, 0), '#ffe08a', [5.2, 9, pz - 2.4]),
      // a compass on the chest
      bit(new CylinderGeometry(3.2, 3.2, 0.8, 14).rotateX(Math.PI / 2), c, [0, 10.5, 6.6]),
      bit(
        new ConeGeometry(1, 4.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4),
        '#15121b',
        [0, 10.5, 7.2],
        [Math.PI / 2, 0, 0],
      ),
    ],
    // a short spear in place of the lance
    weapon: [
      bit(cyl(0.6, 22, 6), wood(s), [hx, hy, hz + 9], [Math.PI / 2, 0, 0]),
      bit(new ConeGeometry(1.5, 5, 5), STEEL, [hx, hy, hz + 22], [Math.PI / 2, 0, 0]),
    ],
  };
}

function paladin(s: PropScheme, a: Anchors, c: string): StyleProps {
  const feather = s.dark ? '#c9d2e4' : '#fbf8ef';
  const body: Bit[] = [];
  const glow: Bit[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const len = 20 - i * 3.4;
      const ang = 0.55 + i * 0.32;
      const root: V3 = [side * 2.4, a.shoulderY + 1, a.backZ + 0.6];
      const dx = Math.sin(ang) * len * 0.5;
      const dy = Math.cos(ang) * len * 0.5;
      body.push(
        bit(
          box(len, 3.4, 0.9),
          feather,
          [root[0] + side * dx * 1.0, root[1] + dy * 0.9, root[2] - 1.5],
          [0.15, side * -0.3, side * (Math.PI / 2 - ang)],
        ),
      );
      if (i === 0)
        glow.push(
          bit(
            box(5, 3.6, 1),
            c,
            [root[0] + side * dx * 1.85, root[1] + dy * 1.75, root[2] - 2],
            [0.15, side * -0.3, side * (Math.PI / 2 - ang)],
          ),
        );
    }
  }
  const [ox, oy, oz] = a.off;
  body.push(
    bit(box(1.4, 10, 8), s.trim, [ox - 1.6, oy + 2.4, oz + 2]),
    bit(
      new ConeGeometry(4, 6, 4),
      s.trim,
      [ox - 1.6, oy - 5.4, oz + 2],
      [Math.PI, Math.PI / 4, 0],
      [0.25, 1, 1],
    ),
  );
  glow.push(
    bit(box(0.5, 8.4, 6.2), c, [ox - 2.4, oy + 2.6, oz + 2]),
    bit(box(0.6, 6, 1.4), '#ffffff', [ox - 2.7, oy + 2.4, oz + 2]),
    bit(box(0.6, 1.4, 4.4), '#ffffff', [ox - 2.7, oy + 3.6, oz + 2]),
  );
  return { body, glow };
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
