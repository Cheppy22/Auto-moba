export const PALETTE = {
  bg: '#0a0b10',
  panel: '#171923',
  border: '#2a2f3d',
  text: '#e8e6df',
  dim: '#9aa0b4',
  gold: '#e7c35a',
  neutral: '#b9a6ff',
  camp: '#d08a4a',
  teamA: '#4fd1c5',
  teamB: '#f2677b',
} as const;

export function teamColor(team: string): string {
  return team === 'A' ? PALETTE.teamA : team === 'B' ? PALETTE.teamB : PALETTE.neutral;
}
