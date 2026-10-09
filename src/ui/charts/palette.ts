import { PALETTE } from '../../render/theme';

/**
 * Chart colours. Teams keep the game's identity colours (ivory White, silver-violet Black).
 * Everything else takes the validated categorical slots in fixed order (dark steps: lightness band,
 * chroma floor, adjacent colour-blind separation and 3:1 contrast on the panel all pass), so a
 * series keeps its colour across charts.
 */
export const TEAM_COLOR = { A: PALETTE.teamA, B: PALETTE.teamB } as const;

export const CAT = {
  blue: '#3987e5',
  orange: '#d95926',
  aqua: '#199e70',
  yellow: '#c98500',
  magenta: '#d55181',
  violet: '#9085e9',
  red: '#e66767',
} as const;

/** Damage types: Blade, Soul, True. */
export const DAMAGE_COLOR = { blade: CAT.orange, soul: CAT.blue, true: CAT.yellow } as const;
export const DAMAGE_LABEL = { blade: 'Blade', soul: 'Soul', true: 'True' } as const;

/** Fixed order for gold sources and similar open categories. */
export const SOURCE_COLORS = [CAT.blue, CAT.orange, CAT.aqua, CAT.yellow, CAT.magenta, CAT.violet];

/** Guides shared by every time chart. */
export const GUIDE = {
  act: 'rgba(236, 226, 204, 0.22)',
  pressure: '#e0a93e',
} as const;

export const TEAM_NAME = { A: 'White', B: 'Black' } as const;
