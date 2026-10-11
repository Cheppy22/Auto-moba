import { PALETTE } from '../../render/theme';

/**
 * Chart colours. Teams keep the game's identity colours (ivory White, silver-violet Black).
 * Everything else takes slots drawn from the Grand Board palette in fixed order (slate, copper,
 * baize, brass, bone, periwinkle, clock red), so a series keeps its colour across charts.
 */
export const TEAM_COLOR = { A: PALETTE.teamA, B: PALETTE.teamB } as const;

export const CAT = {
  blue: '#9aa5b8',
  orange: '#b9794a',
  aqua: '#5fae86',
  yellow: '#c9a35a',
  magenta: '#cbbd9f',
  violet: '#8e9bc9',
  red: '#e0675a',
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
