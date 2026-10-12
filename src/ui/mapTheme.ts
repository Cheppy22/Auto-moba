/**
 * The Long Board's theme: `a` Slate garden (the default) or `b` Lamplit parterre. The player picks
 * it on the Title or in Adjourn; the choice is kept in localStorage. `?mapstyle=a|b` in the address
 * overrides it for that visit (screenshots, tests).
 */
export type MapTheme = 'a' | 'b';

export const THEMES: readonly { id: MapTheme; name: string }[] = [
  { id: 'a', name: 'Slate garden' },
  { id: 'b', name: 'Lamplit parterre' },
];

const STORE_KEY = 'automoba.mapstyle';
const isTheme = (v: unknown): v is MapTheme => v === 'a' || v === 'b';
const listeners = new Set<() => void>();

function readTheme(): MapTheme {
  if (typeof window === 'undefined') return 'a';
  const url = new URLSearchParams(window.location.search).get('mapstyle');
  if (isTheme(url)) return url;
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    return isTheme(v) ? v : 'a';
  } catch {
    return 'a';
  }
}

let theme = readTheme();

export const mapTheme = (): MapTheme => theme;

export function setMapTheme(value: MapTheme): void {
  if (value === theme) return;
  theme = value;
  try {
    window.localStorage.setItem(STORE_KEY, value);
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
  for (const fn of listeners) fn();
}

export function subscribeMapTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
