import { pick } from './core/rng';
import type { Ctx } from './ctx';

/** Deferred draft: the AI fills both teams only after the player has picked from the full roster. */
export function pickDeferred(ctx: Ctx, heroId: string): void {
  const d = ctx.s.draft!;
  const prev = d.playerHero;
  if (d.aiHeroes.A.length === 0) {
    let pool = ctx.c.heroes.filter((h) => h.id !== heroId);
    const take = (): string => {
      const h = pick(ctx.s.rng, 'draft', pool);
      pool = pool.filter((x) => x.id !== h.id);
      return h.id;
    };
    for (let i = 0; i < 4; i++) d.aiHeroes.A.push(take());
    for (let i = 0; i < 5; i++) d.aiHeroes.B.push(take());
    return;
  }
  for (const team of ['A', 'B'] as const) {
    const i = d.aiHeroes[team].indexOf(heroId);
    if (i < 0) continue;
    const used = new Set([...d.aiHeroes.A, ...d.aiHeroes.B, heroId]);
    const spare = ctx.c.heroes.find((h) => !used.has(h.id) || h.id === prev);
    if (spare) d.aiHeroes[team][i] = spare.id;
  }
}
