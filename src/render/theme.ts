export const PALETTE = {
  bg: '#08080c',
  panel: '#141320',
  border: '#6b5532',
  text: '#ece2cc',
  dim: '#9d93a8',
  gold: '#e0a93e',
  neutral: '#b9a0e6',
  spirit: '#c4a8f0',
  seal: '#b3262e',
  camp: '#b0794a',
  /** White: ivory and pearl, with brass trim. */
  teamA: '#f1e6c8',
  /** Black: ebony and obsidian read as cold silver-violet when drawn as a mark (bars, rings, streaks). */
  teamB: '#8f9ad0',
  whiteBody: '#f3eee0',
  whiteShade: '#cfc6b0',
  whiteTrim: '#c8963c',
  blackBody: '#35313f',
  blackShade: '#201d29',
  blackTrim: '#c6cfdc',
} as const;

export function teamColor(team: string): string {
  return team === 'A' ? PALETTE.teamA : team === 'B' ? PALETTE.teamB : PALETTE.neutral;
}
