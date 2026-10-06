import { awardHoly, placeBid } from './auction';
import type { Ctx } from './ctx';
import { pendingOffer, resolveCurse } from './curses';
import { continueFromReport, startLive } from './phase';
import { startRecall } from './recall';
import { buyItem, sellItem } from './shop';
import type { Command, CommandResult, PlayTeam, Unit } from './types';

const ROLES = new Set(['top', 'mid', 'bot', 'jungle']);

function playerHero(ctx: Ctx): Unit | null {
  return ctx.s.playerHeroId === null ? null : (ctx.unit(ctx.s.playerHeroId) ?? null);
}

export type StartMatchFn = (ctx: Ctx) => void;

export function applyCommand(ctx: Ctx, cmd: Command, startMatch: StartMatchFn): CommandResult {
  const r = run(ctx, cmd, startMatch);
  if (!r.ok) ctx.emit('commandRejected', { cmd: cmd.type, reason: r.reason ?? 'rejected' });
  return r;
}

function run(ctx: Ctx, cmd: Command, startMatch: StartMatchFn): CommandResult {
  const s = ctx.s;
  const kind = s.phase.kind;
  if (kind === 'end') return { ok: false, reason: 'match is over' };
  switch (cmd.type) {
    case 'pickHero': {
      if (kind !== 'draft' || !s.draft) return { ok: false, reason: 'not drafting' };
      if (!ctx.c.heroById.has(cmd.heroId)) return { ok: false, reason: 'unknown hero' };
      s.draft.playerHero = cmd.heroId;
      return { ok: true };
    }
    case 'pickLane': {
      if (kind !== 'draft' || !s.draft) return { ok: false, reason: 'not drafting' };
      if (!ROLES.has(cmd.role)) return { ok: false, reason: 'unknown lane' };
      s.draft.playerRole = cmd.role;
      return { ok: true };
    }
    case 'startMatch': {
      if (kind !== 'draft' || !s.draft) return { ok: false, reason: 'not drafting' };
      if (!s.draft.playerHero || !s.draft.playerRole)
        return { ok: false, reason: 'pick a hero and a lane first' };
      startMatch(ctx);
      return { ok: true };
    }
    case 'setPosture': {
      const p = playerHero(ctx);
      if (!p || !p.hero) return { ok: false, reason: 'no player hero' };
      if (kind !== 'live' && kind !== 'prep') return { ok: false, reason: 'not now' };
      p.hero.posture = cmd.posture;
      ctx.emit('posture', { id: p.id, posture: cmd.posture });
      return { ok: true };
    }
    case 'recall': {
      const p = playerHero(ctx);
      if (!p || !p.hero) return { ok: false, reason: 'no player hero' };
      if (kind !== 'live') return { ok: false, reason: 'recall works during a phase' };
      if (!p.alive) return { ok: false, reason: 'you are dead' };
      if (p.hero.recall) return { ok: false, reason: 'already recalling' };
      return startRecall(ctx, p, cmd.dest) ? { ok: true } : { ok: false, reason: 'cannot recall' };
    }
    case 'buy': {
      const p = playerHero(ctx);
      if (!p) return { ok: false, reason: 'no player hero' };
      if (kind !== 'live' && kind !== 'prep') return { ok: false, reason: 'not now' };
      return buyItem(ctx, p, cmd.itemId);
    }
    case 'sell': {
      const p = playerHero(ctx);
      if (!p) return { ok: false, reason: 'no player hero' };
      if (kind !== 'live' && kind !== 'prep') return { ok: false, reason: 'not now' };
      return sellItem(ctx, p, cmd.itemId);
    }
    case 'pickUpgrade': {
      const p = playerHero(ctx);
      if (!p || !p.hero || kind !== 'prep')
        return { ok: false, reason: 'upgrades are picked before a phase' };
      const offer = s.upgradeOffers[p.id];
      if (!offer || !offer.includes(cmd.upgradeId)) return { ok: false, reason: 'not offered' };
      p.hero.upgrades.push(cmd.upgradeId);
      delete s.upgradeOffers[p.id];
      ctx.emit('upgradePick', { id: p.id, upgrade: cmd.upgradeId });
      return { ok: true };
    }
    case 'bid': {
      const p = playerHero(ctx);
      if (!p || p.team === 'neutral') return { ok: false, reason: 'no player hero' };
      return placeBid(ctx, p.team as PlayTeam, p, cmd.points, cmd.gold);
    }
    case 'acceptCurse':
    case 'refuseCurse': {
      const p = playerHero(ctx);
      if (!p || kind !== 'prep') return { ok: false, reason: 'not now' };
      const offer = pendingOffer(ctx, p.id);
      if (!offer) return { ok: false, reason: 'no offer' };
      resolveCurse(ctx, offer, cmd.type === 'acceptCurse');
      return { ok: true };
    }
    case 'chooseHolyRecipient': {
      const p = playerHero(ctx);
      if (!p || !s.auction.awaitingRecipient) return { ok: false, reason: 'nothing to choose' };
      const target = ctx.unit(cmd.heroId);
      if (!target || target.team !== p.team)
        return { ok: false, reason: 'pick a hero on your team' };
      awardHoly(ctx, cmd.heroId);
      return { ok: true };
    }
    case 'startPhase':
      return startLive(ctx);
    case 'continue':
      return continueFromReport(ctx);
  }
}
