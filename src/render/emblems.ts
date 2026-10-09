/**
 * Style emblems: one colour and one glyph for each of the 15 chess styles, so a piece's style
 * reads at a glance on both teams. The glyph shape is the colour-blind-safe cue; the colour is
 * the fast cue. Glyphs are SVG path data on a 24×24 box, drawn with Path2D on canvas and as
 * inline SVG in the UI, so both surfaces show exactly the same mark. No image files.
 */

export type StyleId =
  | 'warlord'
  | 'sovereign'
  | 'usurper'
  | 'regent'
  | 'duelist'
  | 'huntress'
  | 'bastion'
  | 'ram'
  | 'vanguard'
  | 'light'
  | 'shadow'
  | 'zealot'
  | 'lancer'
  | 'errant'
  | 'paladin';

export type EmblemGlyph =
  | 'banner'
  | 'shieldCrown'
  | 'chalice'
  | 'orb'
  | 'crossedBlades'
  | 'bow'
  | 'tower'
  | 'ramHorns'
  | 'lanceTip'
  | 'sun'
  | 'crescent'
  | 'flame'
  | 'lance'
  | 'compass'
  | 'wingedShield'
  | 'unknown';

export interface StyleEmblem {
  /** Style id as in content/pieces/*.json. */
  id: string;
  /** Display name. */
  name: string;
  /** Piece the style belongs to. */
  piece: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | null;
  /** Style colour (hex). Mid-to-light so a dark glyph reads on it and it holds on ebony. */
  color: string;
  /** Glyph id (shape cue that survives colour blindness). */
  glyph: EmblemGlyph;
}

/** One stroke or fill of a glyph, in the 24×24 box. */
export interface EmblemPart {
  d: string;
  /** 'fill' fills the path; 'stroke' strokes it with `w` (round caps and joins). */
  mode: 'fill' | 'stroke';
  w?: number;
  /** Fill rule for cut-outs. */
  rule?: 'nonzero' | 'evenodd';
}

/** What the UI needs to draw an emblem as native SVG. */
export interface EmblemDescriptor {
  viewBox: '0 0 24 24';
  color: string;
  ink: string;
  rim: string;
  /** Transform applied to the glyph group when drawn on the plate. */
  glyphTransform: string;
  parts: EmblemPart[];
}

export interface EmblemDrawOptions {
  /** Centre; defaults to (size/2, size/2). */
  x?: number;
  y?: number;
  /** Draw the coloured disc behind the glyph (default true). Off: a coloured glyph with a dark outline. */
  plate?: boolean;
  /** Team: tints the outer rim (ivory for White, silver for Black). */
  team?: 'A' | 'B' | null;
  /** Overall alpha. */
  alpha?: number;
}

/** Dark ink for glyphs on the plate and outlines. */
export const EMBLEM_INK = '#15121b';
const RIM_A = '#f6ecd0';
const RIM_B = '#c9d2e4';
const RIM_NONE = '#e8e2d4';

export const STYLE_EMBLEMS: Readonly<Record<StyleId, StyleEmblem>> = {
  warlord: { id: 'warlord', name: 'Warlord', piece: 'king', color: '#e0383f', glyph: 'banner' },
  sovereign: {
    id: 'sovereign',
    name: 'Sovereign',
    piece: 'king',
    color: '#f2c234',
    glyph: 'shieldCrown',
  },
  usurper: { id: 'usurper', name: 'Usurper', piece: 'king', color: '#c4329a', glyph: 'chalice' },
  regent: { id: 'regent', name: 'Regent', piece: 'queen', color: '#22bfa2', glyph: 'orb' },
  duelist: {
    id: 'duelist',
    name: 'Duelist',
    piece: 'queen',
    color: '#ff8fb4',
    glyph: 'crossedBlades',
  },
  huntress: { id: 'huntress', name: 'Huntress', piece: 'queen', color: '#5cc04e', glyph: 'bow' },
  bastion: { id: 'bastion', name: 'Bastion', piece: 'rook', color: '#9aa8bd', glyph: 'tower' },
  ram: { id: 'ram', name: 'Battering Ram', piece: 'rook', color: '#c48a4c', glyph: 'ramHorns' },
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    piece: 'rook',
    color: '#4f82f0',
    glyph: 'lanceTip',
  },
  light: { id: 'light', name: 'Light', piece: 'bishop', color: '#fff0a0', glyph: 'sun' },
  shadow: { id: 'shadow', name: 'Shadow', piece: 'bishop', color: '#9a74f0', glyph: 'crescent' },
  zealot: { id: 'zealot', name: 'Zealot', piece: 'bishop', color: '#ff7224', glyph: 'flame' },
  lancer: { id: 'lancer', name: 'Lancer', piece: 'knight', color: '#56d4f4', glyph: 'lance' },
  errant: { id: 'errant', name: 'Errant', piece: 'knight', color: '#b9c23e', glyph: 'compass' },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    piece: 'knight',
    color: '#dde9ff',
    glyph: 'wingedShield',
  },
};

/** The 15 style ids in a fixed order (atlas cell index = position here). */
export const STYLE_IDS: readonly StyleId[] = [
  'warlord',
  'sovereign',
  'usurper',
  'regent',
  'duelist',
  'huntress',
  'bastion',
  'ram',
  'vanguard',
  'light',
  'shadow',
  'zealot',
  'lancer',
  'errant',
  'paladin',
];

function hashHue(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

/** The emblem for a style id; unknown ids get a neutral hashed colour and a plain dot glyph. */
export function styleEmblem(styleId: string | null | undefined): StyleEmblem {
  const known = styleId ? (STYLE_EMBLEMS as Record<string, StyleEmblem>)[styleId] : undefined;
  if (known) return known;
  const id = styleId ?? '';
  return {
    id,
    name: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'No style',
    piece: null,
    color: id ? `hsl(${hashHue(id)} 55% 65%)` : '#a49cb0',
    glyph: 'unknown',
  };
}

/** Atlas cell for a style (0–14), or 15 for unknown/none. */
export function styleEmblemIndex(styleId: string | null | undefined): number {
  const i = styleId ? STYLE_IDS.indexOf(styleId as StyleId) : -1;
  return i < 0 ? STYLE_IDS.length : i;
}

// ---- glyph geometry (24×24) ----

const f = (d: string, rule?: 'evenodd'): EmblemPart => ({ d, mode: 'fill', rule });
const s = (d: string, w: number): EmblemPart => ({ d, mode: 'stroke', w });
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;
const n1 = (v: number): string => (Math.round(v * 100) / 100).toString();

function rays(cx: number, cy: number, r0: number, r1: number, count: number, rot = 0): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2;
    d += `M${n1(cx + Math.cos(a) * r0)} ${n1(cy + Math.sin(a) * r0)}L${n1(cx + Math.cos(a) * r1)} ${n1(cy + Math.sin(a) * r1)}`;
  }
  return d;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, rot: number): string {
  let d = '';
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    d += `${i === 0 ? 'M' : 'L'}${n1(cx + ex * c - ey * sn)} ${n1(cy + ex * sn + ey * c)}`;
  }
  return d + 'Z';
}

const GLYPHS: Record<EmblemGlyph, EmblemPart[]> = {
  // Warlord: a swallow-tailed war banner on a pole.
  banner: [s('M6 2.5V21.5', 2.4), f('M7 3.5H20L16.5 8.25L20 13H7Z')],
  // Sovereign: a crown over a shield.
  shieldCrown: [
    f('M5 9V3.5L8.5 6.2L12 2.5L15.5 6.2L19 3.5V9Z'),
    f('M5.5 10.5H18.5V14.5C18.5 18 15.5 20.5 12 22C8.5 20.5 5.5 18 5.5 14.5Z'),
  ],
  // Usurper: a goblet with a drip.
  chalice: [
    f('M5 2.5H19C19 8.5 16 12 12 12C8 12 5 8.5 5 2.5Z'),
    f('M10.6 11.5H13.4V17.5H10.6Z'),
    f('M6.5 21.5H17.5L15.5 17.5H8.5Z'),
    f('M3 9.5C3.8 11 4.4 12 4.4 13A1.4 1.4 0 0 1 1.6 13C1.6 12 2.2 11 3 9.5Z'),
  ],
  // Regent: an orb in a tilted ring.
  orb: [f(circle(12, 12, 5.2)), s(ellipse(12, 12, 10.2, 3.6, -0.45), 1.9)],
  // Duelist: two crossed rapiers with guards.
  crossedBlades: [
    s('M4 3L16.5 15.5M14 18.8L19.8 13M18 17L21 20', 2.1),
    s('M20 3L7.5 15.5M10 18.8L4.2 13M6 17L3 20', 2.1),
  ],
  // Huntress: a drawn bow and arrow.
  bow: [
    s('M8 2.5Q22 12 8 21.5', 2.4),
    s('M8 2.5L8 21.5', 1),
    s('M2.5 12H17.5', 1.8),
    f('M22 12L16.5 8.8V15.2Z'),
  ],
  // Bastion: a crenellated tower wall with a gate.
  tower: [f('M3.5 22V3H8V6.5H10V3H14V6.5H16V3H20.5V22H14.8V16.5A2.8 2.8 0 0 0 9.2 16.5V22Z')],
  // Battering Ram: curled ram horns over a head.
  ramHorns: [
    s('M10 8.5C8 3.5 2.5 3.5 2.5 9C2.5 13.5 7.5 13.5 7.5 10', 2.5),
    s('M14 8.5C16 3.5 21.5 3.5 21.5 9C21.5 13.5 16.5 13.5 16.5 10', 2.5),
    f('M8.5 7.5H15.5L13.5 21.5H10.5Z'),
  ],
  // Vanguard: a lance head over a chevron.
  lanceTip: [f('M12 1.5L16.5 9.5H7.5Z'), f('M3 16L12 10.5L21 16V21L12 15.5L3 21Z')],
  // Light: a sun.
  sun: [f(circle(12, 12, 4.6)), s(rays(12, 12, 7, 10.5, 8), 2.2)],
  // Shadow: a crescent moon with a star.
  crescent: [
    f('M14 2.2A10 10 0 1 0 21.8 14.2A7.6 7.6 0 1 1 14 2.2Z'),
    f('M18.5 3.5L19.4 5.6L21.5 6.5L19.4 7.4L18.5 9.5L17.6 7.4L15.5 6.5L17.6 5.6Z'),
  ],
  // Zealot: a flame with a hollow core.
  flame: [
    f(
      'M12 1.5C13.5 6 19 8.5 19 14.5C19 18.8 15.9 22 12 22C8.1 22 5 18.8 5 14.5C5 11 7 9.5 7.7 6.5C9.4 8 10.2 9.5 10.3 11.2C12.4 9 13 5.5 12 1.5Z' +
        'M12 13.2C13.6 15.2 15 16.4 15 18.2A3 3 0 0 1 9 18.2C9 16.4 10.4 15.2 12 13.2Z',
      'evenodd',
    ),
  ],
  // Lancer: a couched lance on the diagonal with a vamplate.
  lance: [s('M3 21L16 8', 2.4), f('M22 2L19.6 10.2L13.8 4.4Z'), f('M4.4 12.6L11.4 19.6L3 21Z')],
  // Errant: a compass rose in a ring.
  compass: [
    f('M12 1.5L14.3 9.7L22.5 12L14.3 14.3L12 22.5L9.7 14.3L1.5 12L9.7 9.7Z'),
    s(circle(12, 12, 6.6), 1.5),
  ],
  // Paladin: a kite shield with wings.
  wingedShield: [
    f('M8.6 6H15.4V12C15.4 15.5 13.8 17.6 12 19C10.2 17.6 8.6 15.5 8.6 12Z'),
    f('M7.6 7.5C5 7 3 5.2 1.5 3C1.2 7 2 10 3.5 11.5C4.5 12.5 6 13 7.6 13Z'),
    f('M16.4 7.5C19 7 21 5.2 22.5 3C22.8 7 22 10 20.5 11.5C19.5 12.5 18 13 16.4 13Z'),
  ],
  unknown: [f(circle(12, 12, 5))],
};

/** Scale of the glyph inside the plate (the plate is a disc of radius 11.3). */
const PLATE_GLYPH_SCALE = 0.66;
const PLATE_TRANSFORM = `translate(12 12) scale(${PLATE_GLYPH_SCALE}) translate(-12 -12)`;

/** Raw parts for a style's glyph (24×24 box). */
export function styleGlyphParts(styleId: string | null | undefined): EmblemPart[] {
  return GLYPHS[styleEmblem(styleId).glyph];
}

/** Everything the UI needs to render the emblem as native SVG elements. */
export function styleEmblemDescriptor(
  styleId: string | null | undefined,
  team?: 'A' | 'B' | null,
): EmblemDescriptor {
  const e = styleEmblem(styleId);
  return {
    viewBox: '0 0 24 24',
    color: e.color,
    ink: EMBLEM_INK,
    rim: team === 'A' ? RIM_A : team === 'B' ? RIM_B : RIM_NONE,
    glyphTransform: PLATE_TRANSFORM,
    parts: GLYPHS[e.glyph],
  };
}

function partSvg(p: EmblemPart, color: string): string {
  return p.mode === 'fill'
    ? `<path d="${p.d}" fill="${color}"${p.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`
    : `<path d="${p.d}" fill="none" stroke="${color}" stroke-width="${p.w ?? 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * The emblem as an SVG string (`size` px square). Plate mode (default): a style-coloured disc
 * with a dark rim, a thin team-tinted outer ring and a dark glyph. `plate: false`: a coloured
 * glyph with a dark outline, for use on a dark panel.
 */
export function styleEmblemSvg(
  styleId: string | null | undefined,
  size: number,
  opts: { plate?: boolean; team?: 'A' | 'B' | null; title?: boolean } = {},
): string {
  const d = styleEmblemDescriptor(styleId, opts.team);
  const e = styleEmblem(styleId);
  const title = opts.title === false ? '' : `<title>${e.name}</title>`;
  let body: string;
  if (opts.plate === false) {
    const outline = d.parts
      .map((p) =>
        p.mode === 'fill'
          ? `<path d="${p.d}" fill="${d.ink}" stroke="${d.ink}" stroke-width="2.4" stroke-linejoin="round"${p.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`
          : `<path d="${p.d}" fill="none" stroke="${d.ink}" stroke-width="${(p.w ?? 2) + 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('');
    body = `<g transform="translate(12 12) scale(0.84) translate(-12 -12)">${outline}${d.parts.map((p) => partSvg(p, d.color)).join('')}</g>`;
  } else {
    body =
      `<circle cx="12" cy="12" r="11.4" fill="${d.rim}"/>` +
      `<circle cx="12" cy="12" r="10.5" fill="${d.ink}"/>` +
      `<circle cx="12" cy="12" r="9.3" fill="${d.color}"/>` +
      `<g transform="${PLATE_TRANSFORM}">${d.parts.map((p) => partSvg(p, d.ink)).join('')}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${e.name}">${title}${body}</svg>`;
}

const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

function drawParts(
  g: CanvasRenderingContext2D,
  parts: EmblemPart[],
  color: string,
  outline: number,
): void {
  for (const p of parts) {
    const path = path2d(p.d);
    if (p.mode === 'fill') {
      g.fillStyle = color;
      g.fill(path, p.rule ?? 'nonzero');
      if (outline > 0) {
        g.lineWidth = outline;
        g.strokeStyle = color;
        g.stroke(path);
      }
    } else {
      g.strokeStyle = color;
      g.lineWidth = (p.w ?? 2) + outline;
      g.stroke(path);
    }
  }
}

/**
 * Draw a style emblem on a 2D canvas, `size` px across, centred on (opts.x, opts.y).
 * Same look as `styleEmblemSvg`.
 */
export function drawStyleEmblem(
  g: CanvasRenderingContext2D,
  styleId: string | null | undefined,
  size: number,
  opts: EmblemDrawOptions = {},
): void {
  const d = styleEmblemDescriptor(styleId, opts.team);
  const cx = opts.x ?? size / 2;
  const cy = opts.y ?? size / 2;
  g.save();
  g.globalAlpha *= opts.alpha ?? 1;
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 24, size / 24);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (opts.plate === false) {
    g.translate(12, 12);
    g.scale(0.84, 0.84);
    g.translate(-12, -12);
    drawParts(g, d.parts, d.ink, 2.4);
    drawParts(g, d.parts, d.color, 0);
  } else {
    g.fillStyle = d.rim;
    g.beginPath();
    g.arc(12, 12, 11.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = d.ink;
    g.beginPath();
    g.arc(12, 12, 10.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = d.color;
    g.beginPath();
    g.arc(12, 12, 9.3, 0, Math.PI * 2);
    g.fill();
    g.translate(12, 12);
    g.scale(PLATE_GLYPH_SCALE, PLATE_GLYPH_SCALE);
    g.translate(-12, -12);
    drawParts(g, d.parts, d.ink, 0);
  }
  g.restore();
}
