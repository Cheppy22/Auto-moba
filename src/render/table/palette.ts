/**
 * Tournament Table palettes, one per look variant (`?look=table&variant=a|b|c`, default `a`).
 * Contrast rule for every variant: the ground (board, felt) stays in one value band and one hue
 * family, the pieces sit outside it (ivory above, ebony below or lifted with a light contour), and
 * every piece carries a team contour (outline + base ring) that reads at phone scale.
 */

export type VariantId = 'a' | 'b' | 'c';

export interface TableScheme {
  /** The hall behind the table (background gradient top / middle / bottom) and its fog. */
  hallTop: string;
  hallMid: string;
  hallBottom: string;
  fog: string;
  /** Table top: lamp pool from centre to the dark edge. */
  tableGrad: readonly [string, string, string, string];
  /** Frame walnut gradient and the dark wood used for slab sides and small props. */
  frameGrad: readonly [string, string, string];
  frame: string;
  frameDark: string;
  /** Board squares. */
  sqLight: string;
  sqDark: string;
  /** Lane felt. */
  felt: string;
  feltDark: string;
  feltLight: string;
  /** Jungle courts. */
  court: string;
  courtDark: string;
  brass: string;
  brassDark: string;
  silver: string;
  /** Base medallions. */
  baseA: string;
  baseB: string;
  /** Notation and lane-name paint. */
  notation: string;
  laneName: string;
  /** Lamp over the board: centre warmth (alpha) and corner darkening (alpha). */
  lampIn: number;
  lampOut: number;
  ink: string;
}

/** Team look: body, shade, metal trim, cloth (before a style colours it) and the base rim. */
export interface TeamScheme {
  body: string;
  shade: string;
  trim: string;
  cloth: string;
  dark: string;
  rim: string;
  /** Rim light strength on this team's figures. */
  rimK: number;
  /** Bar / marker colour (matches the HUD team colours). */
  mark: string;
  /** Contour (inverted-hull outline) colour and width in CSS pixels. */
  ink: string;
  inkPx: number;
  /** Base ring on the board under each piece and pawn. */
  halo: string;
}

export interface Build {
  stone: string;
  stoneDark: string;
  roof: string;
  pennant: string;
}

export interface Look {
  id: VariantId;
  name: string;
  table: TableScheme;
  team: Record<'A' | 'B', TeamScheme>;
  build: Record<'A' | 'B', Build>;
  /** Base ring: solid (unlit disc) or glow (additive). Size is relative to the piece base. */
  halo: { mode: 'solid' | 'glow'; opacity: number; size: number };
  /** Contact shadow strength (multiplies the blob opacity). */
  blob: number;
  light: {
    sky: string;
    ground: string;
    skyK: number;
    key: string;
    keyK: number;
    back: string;
    backK: number;
  };
  /**
   * Camera: tilt (degrees above the board) per screen shape; landscape and desktop search the
   * range for the tilt that frames the board biggest. Narrow FOV = flatter, fairer perspective.
   */
  cam: {
    portrait: number;
    landscape: readonly [number, number];
    desktop: readonly [number, number];
    fov: number;
  };
  /**
   * Piece size as a fraction of the prototype's on-screen height (the view corrects for the
   * steeper tilt, so this is what the eye sees: smaller pieces, told apart by contour).
   */
  size: number;
}

const BUILD_DEFAULT: Record<'A' | 'B', Build> = {
  A: { stone: '#d9cdb0', stoneDark: '#a8987a', roof: '#b58d47', pennant: '#e2b85c' },
  B: { stone: '#3a3b42', stoneDark: '#26272d', roof: '#56637e', pennant: '#8f9ad0' },
};

/** a: Tournament Night. The prototype's walnut hall with a darker, cooler board and team contours. */
const NIGHT: Look = {
  id: 'a',
  name: 'Tournament Night',
  table: {
    hallTop: '#0b090a',
    hallMid: '#17110e',
    hallBottom: '#251a12',
    fog: '#110c0a',
    tableGrad: ['#4a3121', '#332218', '#1b120b', '#0b0806'],
    frameGrad: ['#3f2818', '#4b301d', '#331f12'],
    frame: '#4a2f1d',
    frameDark: '#24160d',
    sqLight: '#6f675a',
    sqDark: '#4c463e',
    felt: '#2c4a43',
    feltDark: '#223a35',
    feltLight: '#33544c',
    court: '#4d453a',
    courtDark: '#3e372f',
    brass: '#c9a35a',
    brassDark: '#7d6232',
    silver: '#c3ccd8',
    baseA: '#b3a585',
    baseB: '#3c404a',
    notation: '#d9b46a',
    laneName: '#e2c27c',
    lampIn: 0.12,
    lampOut: 0.4,
    ink: '#120d0a',
  },
  team: {
    A: {
      body: '#f8f0df',
      shade: '#ddd0b2',
      trim: '#c9a35a',
      cloth: '#eee2c4',
      dark: '#6b5636',
      rim: '#ffd98a',
      rimK: 0.4,
      mark: '#f1e6c8',
      ink: '#140d08',
      inkPx: 1.15,
      halo: '#f2c658',
    },
    B: {
      body: '#2b2727',
      shade: '#1b1818',
      trim: '#d6dee9',
      cloth: '#46526e',
      dark: '#0f0d0d',
      rim: '#a8c4ff',
      rimK: 1.15,
      mark: '#8f9ad0',
      ink: '#4f73cf',
      inkPx: 1,
      halo: '#5b8cff',
    },
  },
  build: BUILD_DEFAULT,
  halo: { mode: 'solid', opacity: 0.95, size: 1.55 },
  blob: 1,
  light: {
    sky: '#fff0d6',
    ground: '#3b2a1c',
    skyK: 1.05,
    key: '#ffe2b4',
    keyK: 2.3,
    back: '#a8bfff',
    backK: 1.4,
  },
  cam: { portrait: 48, landscape: [30, 40], desktop: [36, 52], fov: 26 },
  size: 0.74,
};

/** b: Club Daylight. A bright club room: cool grey stone, slate felt, heavy ink on every piece. */
const DAYLIGHT: Look = {
  id: 'b',
  name: 'Club Daylight',
  table: {
    hallTop: '#9aa3ad',
    hallMid: '#b9c0c7',
    hallBottom: '#7f8892',
    fog: '#a3abb4',
    tableGrad: ['#c9b391', '#ad9675', '#8b765b', '#6c5b46'],
    frameGrad: ['#9a7f5e', '#ab8f6a', '#876d4f'],
    frame: '#9a7f5e',
    frameDark: '#5e4b37',
    sqLight: '#a3a7aa',
    sqDark: '#7b8085',
    felt: '#56728e',
    feltDark: '#48637d',
    feltLight: '#5f7c98',
    court: '#686d72',
    courtDark: '#5a5f64',
    brass: '#c49c58',
    brassDark: '#7a6038',
    silver: '#c3ccd8',
    baseA: '#ddd3bd',
    baseB: '#474c55',
    notation: '#3a2c1e',
    laneName: '#efe6d2',
    lampIn: 0.05,
    lampOut: 0.14,
    ink: '#15100c',
  },
  team: {
    A: {
      body: '#f6eddb',
      shade: '#d9caa8',
      trim: '#b8862e',
      cloth: '#e9dbb9',
      dark: '#5e4a2c',
      rim: '#fff2d0',
      rimK: 0.15,
      mark: '#f1e6c8',
      ink: '#15100c',
      inkPx: 2,
      halo: '#f7e4a8',
    },
    B: {
      body: '#26221f',
      shade: '#171412',
      trim: '#c0c8d4',
      cloth: '#3c4660',
      dark: '#0f0d0d',
      rim: '#d4dcea',
      rimK: 0.75,
      mark: '#8f9ad0',
      ink: '#15100c',
      inkPx: 1.6,
      halo: '#15171c',
    },
  },
  build: BUILD_DEFAULT,
  halo: { mode: 'solid', opacity: 0.92, size: 1.45 },
  blob: 1.2,
  light: {
    sky: '#ffffff',
    ground: '#8a8f96',
    skyK: 1.35,
    key: '#fff6e8',
    keyK: 1.9,
    back: '#dfe8ff',
    backK: 0.6,
  },
  cam: { portrait: 40, landscape: [28, 36], desktop: [34, 46], fov: 30 },
  size: 0.7,
};

/** c: Spotlight Arena. A near-black slate board under a spotlight; pieces carry glowing team contours. */
const ARENA: Look = {
  id: 'c',
  name: 'Spotlight Arena',
  table: {
    hallTop: '#050607',
    hallMid: '#0a0c0f',
    hallBottom: '#12151b',
    fog: '#07080a',
    tableGrad: ['#1d2126', '#14171b', '#0b0d10', '#050607'],
    frameGrad: ['#1f2328', '#2a2f36', '#181b1f'],
    frame: '#262b31',
    frameDark: '#0e1013',
    sqLight: '#3b4047',
    sqDark: '#2b2f35',
    felt: '#1e2d30',
    feltDark: '#172427',
    feltLight: '#23373a',
    court: '#33373e',
    courtDark: '#2a2e34',
    brass: '#e0b860',
    brassDark: '#8a6c34',
    silver: '#c3ccd8',
    baseA: '#6e6450',
    baseB: '#2a3140',
    notation: '#c9a35a',
    laneName: '#e8c77e',
    lampIn: 0.16,
    lampOut: 0.55,
    ink: '#08090b',
  },
  team: {
    A: {
      body: '#fbf4e4',
      shade: '#e4d8bc',
      trim: '#e6b85a',
      cloth: '#f0e4c6',
      dark: '#6b5636',
      rim: '#ffc95e',
      rimK: 0.4,
      mark: '#f1e6c8',
      ink: '#e9a93a',
      inkPx: 1.2,
      halo: '#ffae3a',
    },
    B: {
      body: '#4a5161',
      shade: '#323845',
      trim: '#dfe6f0',
      cloth: '#5b6b8e',
      dark: '#1a1d22',
      rim: '#55d0ff',
      rimK: 1.05,
      mark: '#8f9ad0',
      ink: '#2aa6e8',
      inkPx: 1.2,
      halo: '#2fb0ff',
    },
  },
  build: {
    A: BUILD_DEFAULT.A,
    B: { stone: '#565a66', stoneDark: '#3c3f48', roof: '#5f73a0', pennant: '#7fc8ff' },
  },
  halo: { mode: 'glow', opacity: 0.9, size: 1.7 },
  blob: 1.2,
  light: {
    sky: '#d8e0ff',
    ground: '#101216',
    skyK: 0.8,
    key: '#fff1d8',
    keyK: 2.8,
    back: '#7fb8ff',
    backK: 1.8,
  },
  cam: { portrait: 54, landscape: [32, 44], desktop: [40, 56], fov: 22 },
  size: 0.72,
};

export const LOOKS: Record<VariantId, Look> = { a: NIGHT, b: DAYLIGHT, c: ARENA };

function pick(): Look {
  if (typeof location === 'undefined') return NIGHT;
  const v = new URLSearchParams(location.search).get('variant');
  return v === 'b' || v === 'c' ? LOOKS[v] : NIGHT;
}

/** The variant in play (read once from the URL). */
export const LOOK: Look = pick();
export const TABLE: TableScheme = LOOK.table;
export const TEAM: Record<'A' | 'B', TeamScheme> = LOOK.team;

/** Neutral creatures: fired terracotta with glowing eyes. */
export const CLAY = {
  body: '#9a6243',
  shade: '#6e4129',
  dark: '#4a2a1a',
  eye: '#ffd36a',
  horn: '#e9d9b8',
} as const;
