/**
 * The pace the player last picked (Blitz or Classical), kept in localStorage. With nothing saved
 * a phone (portrait or landscape layout) starts on Blitz and a desktop on Classical. An Exhibition
 * reads it on Setup's third page; a Tournament run picks it once at the Draw.
 */
import type { MatchPace } from '../sim';
import { detectLayout } from './layout';

const STORE_KEY = 'automoba.pace';

/** Blitz on phones, Classical on desktop. */
export function defaultPace(w: number, h: number): MatchPace {
  return detectLayout(w, h) === 'desktop' ? 'classical' : 'blitz';
}

export function readPace(): MatchPace {
  if (typeof window === 'undefined') return 'classical';
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v === 'blitz' || v === 'classical') return v;
  } catch {
    // blocked storage: fall back to the device default
  }
  return defaultPace(window.innerWidth, window.innerHeight);
}

export function storePace(pace: MatchPace): void {
  try {
    window.localStorage.setItem(STORE_KEY, pace);
  } catch {
    // private windows and blocked storage: the choice just lasts for this visit
  }
}
