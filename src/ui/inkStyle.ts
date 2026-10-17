/**
 * "Ink style": the ink-and-brass post-process on the 3D board (ink lines, toon light, paper grain).
 * Off by default; the player turns it on next to the board theme (Title, Adjourn) and the choice is
 * kept in localStorage. `?fx=ink` (or `?fx=off`) in the address overrides it for that visit.
 */
const STORE_KEY = 'automoba.ink';
const listeners = new Set<() => void>();

function readInk(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URLSearchParams(window.location.search).get('fx');
  if (url === 'ink') return true;
  if (url === 'off') return false;
  try {
    return window.localStorage.getItem(STORE_KEY) === 'on';
  } catch {
    return false;
  }
}

let ink = readInk();

export const inkStyle = (): boolean => ink;

export function setInkStyle(on: boolean): void {
  if (on === ink) return;
  ink = on;
  try {
    window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
  for (const fn of listeners) fn();
}

export function subscribeInkStyle(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
