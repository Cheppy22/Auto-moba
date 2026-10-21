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
  rod,
  slab,
  spike,
} from './mesh';
import { CLAY, LOOK, TABLE, TEAM } from './palette';

/**
 * Static faceted models drawn as instanced crowds (one draw call per kind and team). All sizes
 * are in world units (the King stands 150).
 */

const PI = Math.PI;
type Team = 'A' | 'B';

/** Stone, roof and pennant colours of each side's buildings (per look variant). */
const BUILD = LOOK.build;

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

/**
 * Battlements round the top of a round tower: `n` merlons on a circle of radius `r` at height `y`
 * (each a block facing outward), the gaps between them being the crenels.
 */
function merlons(n: number, r: number, y: number, w: number, h: number, c: string): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + PI / n;
    out.push({
      g: box(w, h, w * 0.8),
      c,
      p: [Math.sin(a) * r, y + h / 2, Math.cos(a) * r],
      r: [0, a, 0],
    });
  }
  return out;
}

/**
 * Bastion: a chess rook tower (visuals review D3): a round, slightly tapering shaft on a moulded
 * foot, a band and cap in the team colour, a flared collar under four merlons, and a team banner
 * above. Low poly (eight sides) and about 250 triangles.
 */
export function bastion(team: Team): BufferGeometry {
  const b = BUILD[team];
  const t = TEAM[team];
  return merge([
    { g: prism(40, 45, 12, 8), c: b.stoneDark },
    { g: prism(31, 36, 60, 8), c: b.stone, p: [0, 12, 0] },
    { g: prism(32.5, 32.5, 6, 8), c: t.trim, p: [0, 44, 0] },
    { g: prism(41, 31, 12, 8), c: b.stone, p: [0, 72, 0] },
    { g: prism(41, 41, 6, 8), c: b.stoneDark, p: [0, 84, 0] },
    // the cap inside the battlements: team colour, seen from the camera above
    { g: prism(33, 33, 2, 8), c: b.roof, p: [0, 89, 0] },
    ...merlons(4, 35, 90, 22, 15, b.stone),
    { g: box(14, 22, 4), c: TABLE.ink, p: [0, 12, 33] },
    { g: box(5, 13, 4), c: TABLE.ink, p: [0, 54, 31] },
    { g: rod([0, 90, 0], [0, 150, 0], 3.2), c: TABLE.frameDark },
    {
      g: slab(
        [
          [0, 0],
          [34, -5],
          [0, -20],
        ],
        2,
      ),
      c: b.pennant,
      p: [1.5, 149, 0],
    },
  ]);
}

/**
 * Throne: a crowned keep (visuals review D3) on the stepped dais: an octagonal keep with a team
 * band and a gate, battlements, and a giant glowing crown on its roof, flanked by banners.
 */
export function throne(team: Team): BufferGeometry {
  const b = BUILD[team];
  const t = TEAM[team];
  const p: Part[] = [
    { g: prism(112, 122, 12, 8), c: b.stoneDark },
    { g: prism(92, 100, 12, 8), c: b.stone, p: [0, 12, 0] },
    { g: prism(93, 93, 3, 8), c: t.trim, p: [0, 24, 0] },
    { g: prism(56, 63, 92, 8), c: b.stone, p: [0, 24, 0] },
    { g: prism(58.5, 58.5, 7, 8), c: t.trim, p: [0, 62, 0] },
    { g: prism(70, 57, 14, 8), c: b.stone, p: [0, 116, 0] },
    { g: prism(70, 70, 6, 8), c: b.stoneDark, p: [0, 130, 0] },
    { g: prism(60, 60, 2, 8), c: b.roof, p: [0, 136, 0] },
    ...merlons(8, 62, 136, 22, 16, b.stone),
    { g: box(26, 40, 4), c: TABLE.ink, p: [0, 26, 58] },
    { g: box(7, 18, 4), c: TABLE.ink, p: [-22, 86, 55] },
    { g: box(7, 18, 4), c: TABLE.ink, p: [22, 86, 55] },
    // the crown on the roof: a glowing band, five points and a cross
    { g: prism(34, 30, 14, 8), c: t.trim, p: [0, 138, 0], glow: true },
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    p.push({
      g: spike(
        [Math.sin(a) * 30, 150, Math.cos(a) * 30],
        [Math.sin(a) * 38, 186, Math.cos(a) * 38],
        7,
        4,
      ),
      c: t.trim,
      glow: true,
    });
  }
  p.push({ g: gem(9), c: t.trim, p: [0, 160, 0], glow: true });
  p.push({ g: box(7, 38, 7), c: t.trim, p: [0, 188, 0], glow: true });
  p.push({ g: box(24, 7, 7), c: t.trim, p: [0, 194, 0], glow: true });
  for (const s of [-1, 1]) {
    p.push({ g: rod([s * 86, 36, -10], [s * 86, 176, -10], 4), c: TABLE.frameDark });
    p.push({
      g: slab(
        [
          [-16, 0],
          [16, 0],
          [16, -60],
          [0, -47],
          [-16, -60],
        ],
        2,
      ),
      c: b.pennant,
      p: [s * 86, 170, -10],
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
