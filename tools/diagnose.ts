import { loadNodeContent } from './content-node';
import { Match, type PlayTeam } from '../src/sim';
import { unitDps, unitEhp } from '../src/sim/ai/power';
import { dist } from '../src/sim/core/math';

const N = Number(process.argv[2] ?? 40);
const SEED = Number(process.argv[3] ?? 51000);
const content = loadNodeContent();

type Disp = 'farmer' | 'attacker' | 'defender';
const agg = {
  matches: 0,
  minutes: 0,
  byDisp: {} as Record<
    Disp,
    {
      n: number;
      kp: number;
      deaths: number;
      joinTicks: number;
      samples: number;
      nearFightIgnored: number;
      nearFightJoined: number;
      heroDmg: number;
    }
  >,
  lowIdle: 0,
  lowSamples: 0,
  heroSamples: 0,
  lowIdleDeaths: 0,
  deaths: 0,
  deathHp: [] as number[],
  recalls: 0,
  recallHp: [] as number[],
  ganks: 0,
  ganksWinnable: 0,
  winnableHelpers: {} as Record<string, number>,
  winnableNoOneCame: 0,
  maxDeaths: [] as number[],
  feeders8: 0,
  streak4: 0,
  t3: [] as { min: number; disp: Disp; hero: string; item: string }[],
  heroMatches: 0,
  heroesWithT3: 0,
  unlocks: [] as number[],
  entryHp: [] as number[],
  killerKinds: {} as Record<string, number>,
  deathsByStreak: [0, 0, 0, 0, 0, 0] as number[],
  swaps: 0,
  byHero: {} as Record<string, { n: number; d: number; k: number }>,
  healSelf: 0,
  healAlly: 0,
  healerMiss: 0,
  healerSamples: 0,
};
for (const d of ['farmer', 'attacker', 'defender'] as Disp[])
  agg.byDisp[d] = {
    n: 0,
    kp: 0,
    deaths: 0,
    joinTicks: 0,
    samples: 0,
    nearFightIgnored: 0,
    nearFightJoined: 0,
    heroDmg: 0,
  };

function sideSum(m: Match, team: PlayTeam, x: number, y: number) {
  const t = m.ctx.t.ai;
  let aE = 0,
    aD = 0,
    eE = 0,
    eD = 0;
  for (const u of m.ctx.grid.query(x, y, Math.max(t.allyRadius, t.fightRadius))) {
    if (
      !u.alive ||
      (u.kind !== 'hero' && u.kind !== 'minion' && u.kind !== 'tower' && u.kind !== 'guardian')
    )
      continue;
    const w = u.kind === 'hero' ? 1 : u.kind === 'minion' ? 0.2 : 0.6;
    const d = dist(x, y, u.x, u.y);
    if (u.team === team) {
      if (d > t.allyRadius) continue;
      aE += unitEhp(u) * w;
      aD += unitDps(u) * (u.kind === 'minion' ? 0.5 : 1);
    } else if (u.team !== 'neutral') {
      if (d > t.fightRadius) continue;
      if ((u.kind === 'tower' || u.kind === 'guardian') && d > u.stats.range + 40) continue;
      eE += unitEhp(u) * w;
      eD += unitDps(u) * (u.kind === 'minion' ? 0.5 : 1);
    }
  }
  return { aE, aD, eE, eD };
}

for (let k = 0; k < N; k++) {
  const m = Match.create(content, { seed: SEED + k, autoGambits: { A: true, B: true } });
  const ctx = m.ctx;
  const heroes = () => ctx.s.units.filter((u) => u.kind === 'hero');
  const lowSince = new Map<number, number>();
  const lastLowIdle = new Map<number, number>();
  const deathsNoKill = new Map<number, number>();
  const maxStreak = new Map<number, number>();
  let evI = 0;
  const posHist: Map<number, [number, number][]> = new Map();
  const fightStart = new Map<number, { tick: number; hp: number }>();
  for (let guard = 0; guard < 60 && ctx.s.phase.kind !== 'end'; guard++) {
    if (ctx.s.phase.kind !== 'live') {
      m.issue({ type: 'setupTeam', ...m.defaultSetup() });
      continue;
    }
    while (ctx.s.phase.kind === 'live') {
      m.step(1);
      const tick = ctx.s.tick;
      const evs = m.events;
      for (; evI < evs.length; evI++) {
        const e = evs[evI] as { type: string; tick: number; payload: Record<string, unknown> };
        if (e.type === 'laneSwap') agg.swaps++;
        if (e.type === 'recall' && e.payload.stage === 'start') {
          const u = m.unitById(e.payload.id as number);
          if (u?.hero) {
            agg.recalls++;
            agg.recallHp.push(u.hp / u.stats.maxHp);
          }
        }
        if (e.type === 'heal' && String(e.payload.origin).startsWith('ability')) {
          if (e.payload.src === e.payload.tgt) agg.healSelf += e.payload.amount as number;
          else agg.healAlly += e.payload.amount as number;
        }
        if (e.type === 'damage' && e.payload.srcKind === 'hero' && e.payload.tgtKind === 'hero') {
          const tg = m.unitById(e.payload.tgt as number);
          const fs = tg ? fightStart.get(tg.id) : undefined;
          if (tg && (!fs || tick - fs.tick > 200))
            fightStart.set(tg.id, {
              tick,
              hp: (tg.hp + (e.payload.amount as number)) / tg.stats.maxHp,
            });
          const u = m.unitById(e.payload.src as number);
          if (u?.hero) agg.byDisp[u.hero.disposition as Disp].heroDmg += e.payload.amount as number;
        }
        if (e.type === 'purchase') {
          const it = content.itemById.get(e.payload.item as string);
          const u = m.unitById(e.payload.id as number);
          if (it?.tier === 3 && u?.hero)
            agg.t3.push({
              min: tick / 1200,
              disp: u.hero.disposition as Disp,
              hero: u.hero.defId,
              item: it.id,
            });
        }
        if (e.type === 'death' && e.payload.kind === 'hero') {
          const v = m.unitById(e.payload.id as number)!;
          const team = v.team as PlayTeam;
          agg.deaths++;
          const kk = String(e.payload.killerKind);
          agg.killerKinds[kk] = (agg.killerKinds[kk] ?? 0) + 1;
          agg.deathsByStreak[Math.min(5, v.hero!.lossStreak)]++;
          const fs = fightStart.get(v.id);
          if (fs && tick - fs.tick < 200) agg.entryHp.push(fs.hp);
          const kid = e.payload.killer as number;
          const killer = m.unitById(kid);
          if (killer?.hero) {
            deathsNoKill.set(killer.id, 0);
          }
          const dn = (deathsNoKill.get(v.id) ?? 0) + 1;
          deathsNoKill.set(v.id, dn);
          maxStreak.set(v.id, Math.max(maxStreak.get(v.id) ?? 0, dn));
          const li = lastLowIdle.get(v.id);
          if (li !== undefined && tick - li < 600) agg.lowIdleDeaths++;
          const x = e.payload.x as number,
            y = e.payload.y as number;
          let foes = 0;
          for (const f of heroes())
            if (f.alive && f.team !== team && dist(f.x, f.y, x, y) < 350) foes++;
          if (foes === 0 || ctx.s.tick < 200) continue;
          agg.ganks++;
          const base = sideSum(m, team, x, y);
          const helpers = heroes().filter(
            (a) =>
              a.alive &&
              a.team === team &&
              a.id !== v.id &&
              dist(a.x, a.y, x, y) > 300 &&
              dist(a.x, a.y, x, y) < 1000 &&
              a.hp / a.stats.maxHp > 0.45,
          );
          let aE = base.aE + unitEhp(v) + v.stats.maxHp * 0.35,
            aD = base.aD + unitDps(v);
          for (const a of helpers) {
            aE += unitEhp(a);
            aD += unitDps(a);
          }
          const ratio = (aE * aD) / Math.max(1, base.eE * base.eD);
          if (helpers.length > 0 && ratio >= 1.3) {
            agg.ganksWinnable++;
            let anyCame = false;
            for (const a of helpers) {
              const g = a.hero!.goal?.kind ?? 'none';
              const key = `${a.hero!.disposition}:${g}`;
              agg.winnableHelpers[key] = (agg.winnableHelpers[key] ?? 0) + 1;
              const hist = posHist.get(a.id) ?? [];
              const before = hist[0];
              if (before && dist(before[0], before[1], x, y) - dist(a.x, a.y, x, y) > 60)
                anyCame = true;
            }
            if (!anyCame) agg.winnableNoOneCame++;
          }
        }
      }
      if (tick % 10 !== 0) continue;
      for (const u of heroes()) {
        const h = u.hero!;
        const hist = posHist.get(u.id) ?? [];
        hist.push([u.x, u.y]);
        if (hist.length > 8) hist.shift();
        posHist.set(u.id, hist);
        if (!u.alive) continue;
        agg.heroSamples++;
        if (['cat', 'miko'].includes(h.defId)) {
          agg.healerSamples++;
          const hurt = heroes().some(
            (a) =>
              a.alive &&
              a.team === u.team &&
              a.id !== u.id &&
              a.hp / a.stats.maxHp < 0.5 &&
              dist(a.x, a.y, u.x, u.y) > 150 &&
              dist(a.x, a.y, u.x, u.y) < 600,
          );
          const nearHurt = heroes().some(
            (a) =>
              a.alive &&
              a.team === u.team &&
              a.id !== u.id &&
              a.hp / a.stats.maxHp < 0.5 &&
              dist(a.x, a.y, u.x, u.y) <= 150,
          );
          if (hurt && !nearHurt) agg.healerMiss++;
        }
        const dd = agg.byDisp[h.disposition as Disp];
        dd.samples++;
        if (h.goal?.kind === 'joinFight') dd.joinTicks++;
        const hp = u.hp / u.stats.maxHp;
        const team = u.team as PlayTeam;
        const b = ctx.world.basePos[team];
        let foeNear = false;
        for (const f of heroes())
          if (f.alive && f.team !== team && dist(f.x, f.y, u.x, u.y) < 700) foeNear = true;
        const healing =
          !!h.recall ||
          dist(u.x, u.y, b.x, b.y) < 250 ||
          h.goal?.kind === 'retreat' ||
          h.goal?.kind === 'base';
        if (hp < 0.5) agg.lowSamples++;
        if (hp < 0.5 && !foeNear && !healing) {
          const s0 = lowSince.get(u.id) ?? tick;
          lowSince.set(u.id, s0);
          if (tick - s0 >= 100) {
            agg.lowIdle++;
            lastLowIdle.set(u.id, tick);
          }
        } else lowSince.delete(u.id);
        // farmer/others near a fight they could swing
        if (hp > 0.5) {
          for (const a of heroes()) {
            if (a.id === u.id || !a.alive || a.team !== team) continue;
            if (tick - a.lastDamagedTick > 30) continue;
            const d = dist(u.x, u.y, a.x, a.y);
            if (d < 120 || d > 500) continue;
            let enemyHero = false;
            for (const f of heroes())
              if (f.alive && f.team !== team && dist(f.x, f.y, a.x, a.y) < 300) enemyHero = true;
            if (!enemyHero) continue;
            const s = sideSum(m, team, a.x, a.y);
            const withMe = ((s.aE + unitEhp(u)) * (s.aD + unitDps(u))) / Math.max(1, s.eE * s.eD);
            const without = (s.aE * s.aD) / Math.max(1, s.eE * s.eD);
            if (withMe >= 1.2 && without < 1.2) {
              if (h.goal?.kind === 'joinFight') dd.nearFightJoined++;
              else dd.nearFightIgnored++;
            }
            break;
          }
        }
      }
    }
  }
  agg.matches++;
  agg.minutes += ctx.s.tick / 1200;
  agg.unlocks.push(ctx.s.teams.A.unlocks.length + ctx.s.teams.B.unlocks.length);
  let worst = 0;
  for (const u of heroes()) {
    const h = u.hero!;
    agg.heroMatches++;
    if (h.items.some((id) => content.itemById.get(id)?.tier === 3)) agg.heroesWithT3++;
    const dd = agg.byDisp[h.disposition as Disp];
    dd.n++;
    const bh = (agg.byHero[h.defId] ??= { n: 0, d: 0, k: 0 });
    bh.n++;
    bh.d += h.deaths;
    bh.k += h.kills;
    dd.deaths += h.deaths;
    const tk = ctx.s.teams[u.team as PlayTeam].kills;
    dd.kp += tk > 0 ? (h.kills + h.assists) / tk : 0;
    worst = Math.max(worst, h.deaths);
    if (h.deaths >= 8) agg.feeders8++;
    if ((maxStreak.get(u.id) ?? 0) >= 4) agg.streak4++;
  }
  agg.maxDeaths.push(worst);
}

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};
console.log(`matches ${agg.matches}, avg ${(agg.minutes / agg.matches).toFixed(1)} min`);
console.log('\n== Engagement by disposition ==');
for (const [d, v] of Object.entries(agg.byDisp)) {
  console.log(
    `${d.padEnd(9)} KP ${pct(v.kp, v.n)}  deaths/match ${(v.deaths / v.n).toFixed(1)}  joinFight-goal ${pct(v.joinTicks, v.samples)}  hero dmg/match ${(v.heroDmg / v.n).toFixed(0)}  swing-fights joined ${v.nearFightJoined} ignored ${v.nearFightIgnored} (${pct(v.nearFightIgnored, v.nearFightIgnored + v.nearFightJoined)} ignored)`,
  );
}
console.log('\n== Healing ==');
console.log(
  `time at <50% hp: ${pct(agg.lowSamples, agg.heroSamples)} of alive time; of which idle-safe-not-healing (>=5s): ${pct(agg.lowIdle, agg.lowSamples)}`,
);
console.log(
  `deaths within 30s of an un-used safe heal window: ${pct(agg.lowIdleDeaths, agg.deaths)} of ${agg.deaths}`,
);
console.log(
  `recalls/match ${(agg.recalls / agg.matches).toFixed(1)}  median hp at recall ${med(agg.recallHp).toFixed(2)}`,
);
const q = (xs: number[], f: number) => {
  const s2 = [...xs].sort((a, b) => a - b);
  return s2[Math.floor(s2.length * f)] ?? 0;
};
console.log(
  `hp when the fatal fight began: p25 ${q(agg.entryHp, 0.25).toFixed(2)} median ${q(agg.entryHp, 0.5).toFixed(2)}; deaths that began the fight under 50%: ${pct(agg.entryHp.filter((x) => x < 0.5).length, agg.entryHp.length)}`,
);
console.log(
  `ability healing: on self ${agg.healSelf.toFixed(0)} vs on allies ${agg.healAlly.toFixed(0)}; healer samples with a hurt ally 150-600u away and none in heal range: ${pct(agg.healerMiss, agg.healerSamples)}`,
);
console.log('\n== Rescues ==');
console.log(
  `hero deaths with an enemy hero present: ${agg.ganks}; winnable if nearby allies (300-1000u, >45% hp) had come: ${agg.ganksWinnable} (${pct(agg.ganksWinnable, agg.ganks)}); of those no ally moved toward it: ${pct(agg.winnableNoOneCame, agg.ganksWinnable)}`,
);
console.log(
  'what nearby helpers were doing:',
  Object.entries(agg.winnableHelpers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k} ${v}`)
    .join(', '),
);
console.log('\n== Feeding ==');
console.log(
  `median worst-deaths per match ${med(agg.maxDeaths)}, max ${Math.max(...agg.maxDeaths)}; hero-games with 8+ deaths ${pct(agg.feeders8, agg.heroMatches)}; with 4+ deaths in a row without a kill ${pct(agg.streak4, agg.heroMatches)}`,
);
console.log(
  'killer kinds',
  agg.killerKinds,
  'deaths at loss-streak 0..5+',
  agg.deathsByStreak,
  'lane swaps/match',
  (agg.swaps / agg.matches).toFixed(1),
);
console.log(
  'deaths/kills per game by hero:',
  Object.entries(agg.byHero)
    .map(([k, v]) => `${k} ${(v.d / v.n).toFixed(1)}/${(v.k / v.n).toFixed(1)}`)
    .join(', '),
);
console.log('\n== Tier 3 ==');
console.log(
  `hero-games ending with a tier-3: ${pct(agg.heroesWithT3, agg.heroMatches)}; tier-3 buys ${agg.t3.length} (${(agg.t3.length / agg.matches).toFixed(1)}/match), median minute ${med(agg.t3.map((x) => x.min)).toFixed(1)}; unlocks/match ${(agg.unlocks.reduce((a, b) => a + b, 0) / agg.matches).toFixed(1)}`,
);
const byD: Record<string, number> = {};
for (const t of agg.t3) byD[t.disp] = (byD[t.disp] ?? 0) + 1;
console.log('tier-3 buys by disposition', byD);
