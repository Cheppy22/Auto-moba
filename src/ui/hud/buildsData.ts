import type { AdviceReason, BuildView, Match, TechniquePreview } from '../../sim';

/**
 * The Builds screens read the sim through a cache: `Match.buildView` runs a stat preview per offered
 * card, and the HUD re-renders several times a second. The match only changes by a tick or an event
 * (every build command logs one), so tick and event count key the cache.
 */
interface Entry {
  key: string;
  views: Map<number, BuildView | null>;
  previews: Map<string, TechniquePreview | null>;
}

const cache = new WeakMap<Match, Entry>();

function entry(m: Match): Entry {
  const key = `${m.state.tick}:${m.events.length}`;
  let e = cache.get(m);
  if (!e || e.key !== key) {
    e = { key, views: new Map(), previews: new Map() };
    cache.set(m, e);
  }
  return e;
}

/** `Match.buildView`, computed once per change of the match. */
export function buildViewOf(m: Match, heroId: number): BuildView | null {
  const e = entry(m);
  if (!e.views.has(heroId)) e.views.set(heroId, m.buildView(heroId));
  return e.views.get(heroId) ?? null;
}

/** `Match.techniquePreview` for an upgrade (the held card at its next grade), cached the same way. */
export function upgradePreviewOf(
  m: Match,
  heroId: number,
  id: string,
  grade: 'sharp' | 'brilliant',
): TechniquePreview | null {
  const e = entry(m);
  const k = `${heroId}:${id}:${grade}`;
  if (!e.previews.has(k)) e.previews.set(k, m.techniquePreview(heroId, id, grade));
  return e.previews.get(k) ?? null;
}

/**
 * What "Pick for me" shows for one break, fixed when the tab first opens at that break so the
 * pieces do not jump about as picks are made: the strip's order (the highlighted pieces first, then
 * a piece with a Combination on offer, then the most gold) and the 1-2 highlighted pieces with
 * their reasons.
 */
export interface BreakPlan {
  tick: number;
  order: number[];
  highlight: number[];
  reasons: Map<number, AdviceReason[]>;
}

const plans = new WeakMap<Match, BreakPlan>();

export function breakPlan(m: Match, pieces: readonly number[]): BreakPlan {
  const old = plans.get(m);
  if (old && old.tick === m.state.tick) return old;
  const advice = m.buildAdvice('A');
  const reasons = new Map<number, AdviceReason[]>();
  for (const p of advice.pieces) reasons.set(p.heroId, p.reasons);
  const rank = (id: number): number[] => {
    const v = buildViewOf(m, id);
    const hi = advice.highlight.indexOf(id);
    const combo = v?.offer?.cards.some((c) => c.combination) ? 0 : 1;
    return [hi < 0 ? 9 : hi, combo, -(v?.gold ?? 0)];
  };
  const order = pieces.slice().sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return pieces.indexOf(a) - pieces.indexOf(b);
  });
  const plan = { tick: m.state.tick, order, highlight: advice.highlight.slice(), reasons };
  plans.set(m, plan);
  return plan;
}

const PICK_KEY = 'automoba.pickForMe';

/** "Pick for me" is on unless the player turned it off on this device. */
export function loadPickForMe(): boolean {
  try {
    return localStorage.getItem(PICK_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function savePickForMe(on: boolean): void {
  try {
    localStorage.setItem(PICK_KEY, on ? 'on' : 'off');
  } catch (err) {
    console.warn('Could not remember the Pick for me switch on this device', err);
  }
}

/** Why a pick was highlighted, in a few plain words. */
export const REASON_TEXT: Record<AdviceReason, string> = {
  combination: 'a Combination is on offer',
  brilliant: 'a Brilliant offer: double numbers',
  sharp: 'a Sharp offer: numbers ×1.5',
  carry: 'your top-damage piece last Act',
  spread: 'the three cards differ a lot',
};
