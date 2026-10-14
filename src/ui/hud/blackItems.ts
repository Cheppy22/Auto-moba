import type { Match, Unit } from '../../sim';

/**
 * The items a piece card may show. Black shops at the Act break before the sheet opens, but its new
 * items stay hidden until the next Act starts: while the armory is open this is Black's bag as it
 * was when the bell rang (its break purchases undone, their parts given back).
 */
export function shownItems(m: Match, u: Unit): string[] {
  const items = (u.hero?.items ?? []).slice();
  if (u.team !== 'B' || !m.armoryOpen) return items;
  // the break is frozen at one tick, so its purchases are the newest events
  const since = m.state.tick - 5;
  const events = m.events;
  for (let i = events.length - 1; i >= 0 && events[i].tick >= since; i--) {
    const e = events[i];
    if (e.type !== 'purchase' || e.payload.id !== u.id || e.payload.at !== 'break') continue;
    const k = items.lastIndexOf(e.payload.item);
    if (k >= 0) items.splice(k, 1);
    items.push(...e.payload.consumed);
  }
  return items;
}
