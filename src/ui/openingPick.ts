/**
 * The Opening the player last began a match with, kept in localStorage so Setup's third page
 * starts on it. With nothing saved (a first visit, blocked storage) it starts on the Italian Game.
 */
const STORE_KEY = 'automoba.opening';

export function readOpening(valid: readonly string[]): string {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v && valid.includes(v)) return v;
  } catch {
    // blocked storage: start on the Italian Game
  }
  return 'italian';
}

export function storeOpening(id: string): void {
  try {
    window.localStorage.setItem(STORE_KEY, id);
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
}
