/**
 * Tournament Table palette. Value rule: pieces own the extremes (ivory ~90% lightness, ebony
 * ~15%), the ground stays in the middle band. UI roots (ebony, walnut, ivory, brass, silver-slate)
 * are kept so the board sits under the HUD without a seam.
 */
export const TABLE = {
  /** The hall behind the table (background gradient top / bottom). */
  hallTop: '#0c0a0b',
  hallBottom: '#2a1d15',
  /** Walnut table and frame. */
  table: '#2b1c13',
  tableLight: '#3a2619',
  frame: '#4a2f1d',
  frameDark: '#2c1a10',
  /** Board squares: mid tones, low contrast. */
  sqLight: '#978466',
  sqDark: '#66513b',
  /** Lane felt: a mid green that is neither the ivory nor the ebony value. */
  felt: '#3d6b54',
  feltDark: '#2f5644',
  feltLight: '#4a7a61',
  /** Jungle courts: one step darker than the board. */
  court: '#4b3a2a',
  courtDark: '#3a2c20',
  brass: '#c9a35a',
  brassDark: '#7d6232',
  silver: '#c3ccd8',
  /** Base medallions. */
  baseA: '#a99a7a',
  baseB: '#4c4f58',
  ink: '#120d0a',
} as const;

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
}

export const TEAM: Record<'A' | 'B', TeamScheme> = {
  A: {
    body: '#f2e9d6',
    shade: '#cdbf9e',
    trim: '#c9a35a',
    cloth: '#e3d3ae',
    dark: '#6b5636',
    rim: '#e8b85a',
    rimK: 0.35,
    mark: '#f1e6c8',
  },
  B: {
    body: '#2b2725',
    shade: '#1b1817',
    trim: '#c3ccd8',
    cloth: '#3c4660',
    dark: '#0f0d0d',
    rim: '#9fb8ff',
    rimK: 0.95,
    mark: '#8f9ad0',
  },
};

/** Neutral creatures: fired terracotta with glowing eyes. */
export const CLAY = {
  body: '#9a6243',
  shade: '#6e4129',
  dark: '#4a2a1a',
  eye: '#ffd36a',
  horn: '#e9d9b8',
} as const;
