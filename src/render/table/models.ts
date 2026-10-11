import type { BufferGeometry } from 'three';
import {
  box,
  cone,
  dodeca,
  gem,
  lathe,
  merge,
  octa,
  type Part,
  prism,
  ring,
  rod,
  slab,
  spike,
} from './mesh';
import { CLAY, TABLE, TEAM } from './palette';

/**
 * Static faceted models drawn as instanced crowds (one draw call per kind and team). All sizes
 * are in world units (the King stands 150).
 */

const PI = Math.PI;
type Team = 'A' | 'B';

/** Stone, roof and pennant colours of each side's buildings. */
const BUILD: Record<Team, { stone: string; stoneDark: string; roof: string; pennant: string }> = {
  A: { stone: '#d9cdb0', stoneDark: '#a8987a', roof: '#b58d47', pennant: '#e2b85c' },
  B: { stone: '#3a3b42', stoneDark: '#26272d', roof: '#56637e', pennant: '#8f9ad0' },
};

/** Pawnling: a Staunton pawn on stubby legs (ball head, collar, bell body), 54 tall. */
export function pawnling(team: Team, ranged: boolean): BufferGeometry {
  const t = TEAM[team];
  const p: Part[] = [
    {
      g: lathe(
        [
          [0, 0],
          [15, 0],
          [14, 4],
          [9, 9],
          [7, 24],
          [0, 24],
        ],
        7,
      ),
      c: t.body,
      p: [0, 4, 0],
    },
    { g: prism(15.4, 15.4, 2.6, 7), c: t.trim, p: [0, 4, 0] },
    { g: prism(11, 11, 3, 7), c: t.trim, p: [0, 27, 0] },
    { g: gem(10), c: t.body, p: [0, 39, 0] },
    { g: box(5, 6, 6), c: t.shade, p: [-5, 2, 0] },
    { g: box(5, 6, 6), c: t.shade, p: [5, 2, 0] },
  ];
  if (ranged) p.push({ g: cone(7, 9, 5), c: t.cloth, p: [0, 46, 0] });
  else
    p.push({
      g: slab(
        [
          [-1, 0],
          [1, 0],
          [1, 16],
          [0, 19],
          [-1, 16],
        ],
        0.8,
      ),
      c: t.trim,
      p: [11, 10, 5],
      r: [0.5, 0, 0],
    });
  return merge(p);
}

/** Pawn: an armoured pawn soldier with a crested helm, shield and spear, 80 tall. */
export function pawn(team: Team): BufferGeometry {
  const t = TEAM[team];
  return merge([
    { g: box(7, 14, 8), c: t.shade, p: [-6, 7, 0] },
    { g: box(7, 14, 8), c: t.shade, p: [6, 7, 0] },
    {
      g: lathe(
        [
          [0, 0],
          [17, 0],
          [16, 4],
          [12, 14],
          [10, 32],
          [0, 32],
        ],
        7,
      ),
      c: t.body,
      p: [0, 12, 0],
    },
    { g: prism(17.4, 17.4, 3, 7), c: t.trim, p: [0, 12, 0] },
    { g: box(16, 22, 1.6), c: t.cloth, p: [0, 28, 11], r: [-0.1, 0, 0] },
    { g: prism(14, 14, 3.4, 7), c: t.trim, p: [0, 44, 0] },
    { g: gem(13), c: t.body, p: [0, 58, 0] },
    { g: prism(13.6, 13.6, 3, 8), c: t.trim, p: [0, 56, 0] },
    {
      g: slab(
        [
          [-9, 0],
          [9, 0],
          [12, 9],
          [0, 14],
          [-12, 9],
        ],
        2.6,
      ),
      c: t.cloth,
      p: [0, 68, 0],
      r: [0, PI / 2, 0],
    },
    {
      g: slab(
        [
          [-10, 10],
          [10, 10],
          [9, -6],
          [0, -15],
          [-9, -6],
        ],
        2.4,
      ),
      c: t.cloth,
      p: [15, 30, 8],
      r: [0, -0.5, 0],
    },
    { g: rod([-15, 6, 6], [-15, 84, 10], 2.6), c: t.dark },
    { g: spike([-15, 84, 10], [-15, 96, 10.6], 3, 4), c: t.trim },
  ]);
}

/** Bastion: a squat keep under a hipped roof with a tall pennant (never crenellated: that's the Rook). */
export function bastion(team: Team): BufferGeometry {
  const b = BUILD[team];
  const t = TEAM[team];
  return merge([
    { g: prism(52, 58, 12, 8), c: b.stoneDark },
    { g: box(66, 64, 66), c: b.stone, p: [0, 44, 0] },
    { g: box(70, 6, 70), c: b.stoneDark, p: [0, 14, 0] },
    { g: box(70, 5, 70), c: t.trim, p: [0, 76, 0] },
    { g: box(18, 26, 4), c: TABLE.ink, p: [0, 25, 33] },
    { g: box(8, 12, 4), c: TABLE.ink, p: [-20, 54, 33] },
    { g: box(8, 12, 4), c: TABLE.ink, p: [20, 54, 33] },
    { g: cone(56, 46, 4), c: b.roof, p: [0, 78, 0], r: [0, PI / 4, 0] },
    { g: gem(5), c: t.trim, p: [0, 126, 0] },
    { g: rod([0, 124, 0], [0, 188, 0], 3.2), c: TABLE.frameDark },
    {
      g: slab(
        [
          [0, 0],
          [38, -6],
          [0, -22],
        ],
        2,
      ),
      c: b.pennant,
      p: [1.5, 186, 0],
    },
  ]);
}

/** Throne: a stepped dais, a tall-backed throne and a giant crown above it, flanked by banners. */
export function throne(team: Team): BufferGeometry {
  const b = BUILD[team];
  const t = TEAM[team];
  const p: Part[] = [
    { g: prism(112, 122, 12, 8), c: b.stoneDark },
    { g: prism(92, 100, 12, 8), c: b.stone, p: [0, 12, 0] },
    { g: prism(72, 78, 12, 8), c: b.stoneDark, p: [0, 24, 0] },
    { g: prism(73, 73, 3, 8), c: t.trim, p: [0, 35, 0] },
    { g: box(62, 22, 50), c: t.body, p: [0, 47, 6] },
    { g: box(64, 6, 52), c: t.trim, p: [0, 59, 6] },
    { g: box(12, 34, 50), c: t.body, p: [-34, 62, 6] },
    { g: box(12, 34, 50), c: t.body, p: [34, 62, 6] },
    { g: box(66, 112, 14), c: t.body, p: [0, 92, -18] },
    { g: box(42, 82, 3), c: t.cloth, p: [0, 90, -10] },
    { g: cone(40, 34, 4), c: t.body, p: [0, 148, -18], r: [0, PI / 4, 0], s: [1, 1, 0.35] },
    { g: ring(26, 4, 8), c: t.trim, p: [0, 196, -18], glow: true },
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    p.push({
      g: spike(
        [Math.cos(a) * 26, 196, -18 + Math.sin(a) * 26],
        [Math.cos(a) * 32, 222, -18 + Math.sin(a) * 32],
        5,
        4,
      ),
      c: t.trim,
      glow: true,
    });
  }
  p.push({ g: box(6, 34, 6), c: t.trim, p: [0, 228, -18], glow: true });
  p.push({ g: box(22, 6, 6), c: t.trim, p: [0, 232, -18], glow: true });
  for (const s of [-1, 1]) {
    p.push({ g: rod([s * 86, 36, -10], [s * 86, 190, -10], 4), c: TABLE.frameDark });
    p.push({
      g: slab(
        [
          [-16, 0],
          [16, 0],
          [16, -64],
          [0, -50],
          [-16, -64],
        ],
        2,
      ),
      c: b.pennant,
      p: [s * 86, 184, -10],
    });
  }
  return merge(p);
}

/** Neutral creatures: fired terracotta beasts with glowing eyes, in three sizes. */
export function creature(tier: 0 | 1 | 2): BufferGeometry {
  const c = CLAY;
  const shrink = 0.85;
  if (tier === 2) {
    // golem: hulking torso, small horned head, fists on the ground
    return scaled(shrink, [
      { g: box(16, 28, 18), c: c.shade, p: [-14, 14, 0] },
      { g: box(16, 28, 18), c: c.shade, p: [14, 14, 0] },
      { g: dodeca(34), c: c.body, p: [0, 58, 0], s: [1.15, 0.95, 0.9] },
      { g: box(70, 14, 34), c: c.shade, p: [0, 82, 0] },
      { g: gem(15), c: c.body, p: [0, 96, 16] },
      { g: box(16, 3, 2), c: c.eye, p: [0, 98, 29], glow: true },
      { g: cone(5, 18, 4), c: c.horn, p: [-12, 102, 12], r: [0, 0, 0.6] },
      { g: cone(5, 18, 4), c: c.horn, p: [12, 102, 12], r: [0, 0, -0.6] },
      { g: box(16, 46, 18), c: c.body, p: [-42, 52, 8], r: [0.25, 0, 0.12] },
      { g: box(16, 46, 18), c: c.body, p: [42, 52, 8], r: [0.25, 0, -0.12] },
      { g: dodeca(13), c: c.shade, p: [-46, 26, 16] },
      { g: dodeca(13), c: c.shade, p: [46, 26, 16] },
    ]);
  }
  const k = tier === 1 ? 1.45 : 1;
  // a horned, four-legged beast (boar-like when large)
  const p: Part[] = [
    { g: box(26, 18, 36), c: c.body, p: [0, 22, 0] },
    { g: box(28, 6, 30), c: c.shade, p: [0, 33, -2] },
    { g: box(18, 16, 16), c: c.body, p: [0, 26, 22], r: [0.25, 0, 0] },
    { g: box(12, 8, 10), c: c.shade, p: [0, 21, 31], r: [0.25, 0, 0] },
    { g: box(13, 2.6, 2), c: c.eye, p: [0, 29, 30], glow: true },
    { g: cone(3, 12, 4), c: c.horn, p: [-7, 32, 22], r: [-0.5, 0, 0.4] },
    { g: cone(3, 12, 4), c: c.horn, p: [7, 32, 22], r: [-0.5, 0, -0.4] },
  ];
  for (const [x, z] of [
    [-9, 12],
    [9, 12],
    [-9, -12],
    [9, -12],
  ])
    p.push({ g: box(7, 14, 7), c: c.shade, p: [x, 7, z] });
  if (tier === 1) {
    p.push({ g: cone(2.6, 12, 4), c: c.horn, p: [-6, 18, 34], r: [1.1, 0, 0] });
    p.push({ g: cone(2.6, 12, 4), c: c.horn, p: [6, 18, 34], r: [1.1, 0, 0] });
  }
  const g = merge(p);
  g.scale(k * shrink, k * shrink, k * shrink);
  return g;
}

function scaled(k: number, parts: Part[]): BufferGeometry {
  const g = merge(parts);
  g.scale(k, k, k);
  return g;
}

/** A floating lantern spirit (event minions). */
export function spirit(): BufferGeometry {
  return merge([
    { g: octa(13), c: '#ffd77a', p: [0, 34, 0], s: [1, 1.3, 1], glow: true },
    { g: cone(14, 12, 6), c: CLAY.dark, p: [0, 48, 0] },
    { g: prism(10, 12, 4, 6), c: CLAY.dark, p: [0, 16, 0] },
    { g: spike([0, 16, 0], [0, 4, 0], 4, 4), c: CLAY.shade },
  ]);
}

/** Obelisk plinth (the crystal is a separate crowd so it can take the claim colour). */
export function obeliskPlinth(): BufferGeometry {
  return merge([
    { g: prism(26, 30, 10, 6), c: TABLE.frameDark },
    { g: prism(18, 22, 12, 6), c: TABLE.brassDark, p: [0, 10, 0] },
    { g: prism(19, 19, 3, 6), c: TABLE.brass, p: [0, 21, 0] },
  ]);
}

export function obeliskCrystal(): BufferGeometry {
  return merge([{ g: octa(16), c: '#ffffff', p: [0, 56, 0], s: [0.8, 2.2, 0.8], glow: true }]);
}

/** The Arbiter (the Keeper): a tall robed referee carrying a chess clock. */
export function keeper(): BufferGeometry {
  return merge([
    {
      g: lathe(
        [
          [0, 0],
          [22, 0],
          [20, 4],
          [14, 40],
          [11, 70],
          [0, 70],
        ],
        7,
      ),
      c: '#3b3346',
    },
    { g: prism(14, 14, 3, 7), c: TABLE.brass, p: [0, 40, 0] },
    { g: prism(10, 16, 10, 7), c: '#4c4258', p: [0, 64, 0] },
    { g: gem(10), c: '#d8cbb2', p: [0, 84, 0] },
    { g: cone(12, 18, 6), c: '#2b2533', p: [0, 88, -1] },
    { g: box(30, 16, 10), c: TABLE.frame, p: [0, 50, 20] },
    { g: box(9, 9, 1), c: '#efe6d2', p: [-7, 51, 25.2] },
    { g: box(9, 9, 1), c: '#efe6d2', p: [7, 51, 25.2] },
    { g: box(4, 4, 4), c: '#b8392c', p: [-7, 60, 20] },
    { g: box(4, 4, 4), c: TABLE.brass, p: [7, 60, 20] },
  ]);
}

/** A miniature's round base: rim (team metal) and top (style colour), both unit-sized. */
export function baseRim(): BufferGeometry {
  return merge([{ g: prism(1, 1.08, 0.45, 12), c: '#ffffff' }]);
}

export function baseTop(): BufferGeometry {
  return merge([{ g: prism(0.8, 0.86, 0.6, 12), c: '#ffffff' }]);
}

/** A chip of a broken piece (capture and structure bursts). */
export function chip(): BufferGeometry {
  return merge([{ g: octa(1), c: '#ffffff', s: [1, 0.6, 0.8] }]);
}

/** A faceted bolt for attacks in flight. */
export function bolt(): BufferGeometry {
  return merge([{ g: octa(1), c: '#ffffff', s: [0.5, 0.5, 1], glow: true }]);
}

/** Chess clock and a capture tray on the table edge (mood props, static). */
export function tableProps(): BufferGeometry {
  return merge([
    { g: box(150, 70, 70), c: TABLE.frame, p: [0, 35, 0] },
    { g: box(156, 8, 76), c: TABLE.frameDark, p: [0, 4, 0] },
    { g: box(46, 46, 4), c: '#efe6d2', p: [-38, 42, 35.5] },
    { g: box(46, 46, 4), c: '#efe6d2', p: [38, 42, 35.5] },
    { g: box(3, 18, 2), c: TABLE.ink, p: [-38, 48, 38], r: [0, 0, 0.6] },
    { g: box(3, 18, 2), c: TABLE.ink, p: [38, 48, 38], r: [0, 0, -1.2] },
    { g: prism(7, 7, 14, 6), c: TABLE.brass, p: [-38, 70, 0] },
    { g: prism(7, 7, 8, 6), c: TABLE.brass, p: [38, 70, 0] },
  ]);
}
