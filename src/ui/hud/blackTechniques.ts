import type { HeldTechnique, Match, Unit } from '../../sim';

/**
 * The Techniques a piece card may show. Black's AI builds at the Act break before the sheet opens,
 * but its picks and upgrades stay hidden until the next Act starts: while the break's offers are
 * open this is Black's build as it was when the bell rang (this break's picks undone).
 */
export function shownTechniques(m: Match, u: Unit): HeldTechnique[] {
  const held = (u.hero?.techniques ?? []).map((x) => ({ ...x }));
  const builds = m.state.builds;
  if (u.team !== 'B' || !builds.open) return held;
  const act = m.state.phase.n;
  const events = m.events;
  // the break is frozen at one tick, so its picks are the newest events (undone newest first)
  for (let i = events.length - 1; i >= 0 && events[i].tick >= m.state.tick - 5; i--) {
    const e = events[i];
    if (e.type === 'techniqueUpgrade' && e.payload.id === u.id) {
      const x = held.find((h) => h.id === e.payload.technique);
      if (x) x.grade = e.payload.grade === 'brilliant' ? 'sharp' : 'plain';
    } else if (e.type === 'technique' && e.payload.id === u.id && e.payload.at === act) {
      const k = held.findIndex((h) => h.id === e.payload.technique);
      if (k >= 0) held.splice(k, 1);
      const was = e.payload.replaced;
      if (was) held.push({ id: was, grade: 'plain' });
    }
  }
  return held;
}
