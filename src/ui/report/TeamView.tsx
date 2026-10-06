import type { HeroModel, Report } from '../../analysis';
import { SigilIcon } from '../SigilIcon';
import { n0, keeperPlace, roleLabel } from '../format';
import { useSession } from '../session';
import { Num, heroName, itemName, teamClass } from './common';

function HeroCard(props: { h: HeroModel; report: Report; skip: boolean }) {
  const s = useSession();
  const { h, report } = props;
  const def = s.content.heroById.get(h.def)!;
  const badges = report.badges.filter((b) => b.heroId === h.id);
  const sel = s.ui.reportHero === h.id;
  return (
    <div
      class={`card clickable col ${sel ? 'sel' : ''}`}
      data-testid={`report-hero-${h.id}`}
      onClick={() => s.setUi({ reportHero: h.id })}
    >
      <div class="row">
        <SigilIcon spec={def.sigil} team={h.team} size={34} />
        <div class="grow">
          <div class="small">
            {heroName(s.content, h.def)} <span class="dim tiny">{roleLabel(h.role)}</span>
          </div>
          <div class="tiny dim">
            K/D/A {h.kills}/{h.deaths}/{h.assists}
          </div>
        </div>
      </div>
      <div class="row wrap tiny" style={{ gap: '10px' }}>
        <span>
          <span class="dim">Gold </span>
          <Num value={h.goldEarned} skip={props.skip} />
        </span>
        <span>
          <span class="dim">Dealt </span>
          <Num value={h.damageDealt} skip={props.skip} />
        </span>
        <span>
          <span class="dim">Taken </span>
          <Num value={h.damageTaken} skip={props.skip} />
        </span>
      </div>
      <div class="row wrap" style={{ gap: '4px' }}>
        {badges.map((b) => (
          <span class="chip tiny" key={b.id} title={`${b.metric}: ${n0(b.value)}`}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TeamView(props: { report: Report; skip: boolean }) {
  const s = useSession();
  const r = props.report;
  const rows: { label: string; a: number; b: number }[] = [
    { label: 'Hero kills', a: r.teams.A.kills, b: r.teams.B.kills },
    { label: 'Hero deaths', a: r.teams.A.deaths, b: r.teams.B.deaths },
    { label: 'Gold earned', a: r.teams.A.goldEarned, b: r.teams.B.goldEarned },
    { label: 'Damage to heroes', a: r.teams.A.damageToHeroes, b: r.teams.B.damageToHeroes },
    { label: 'Damage to structures', a: r.teams.A.objectiveDamage, b: r.teams.B.objectiveDamage },
    { label: 'Towers destroyed', a: r.teams.A.towersDestroyed, b: r.teams.B.towersDestroyed },
    { label: 'Camps cleared', a: r.teams.A.campsCleared, b: r.teams.B.campsCleared },
    { label: 'Obelisks claimed', a: r.teams.A.obelisksClaimed, b: r.teams.B.obelisksClaimed },
    { label: 'Team points earned', a: r.teams.A.pointsEarned, b: r.teams.B.pointsEarned },
  ];
  const mine = r.special.bids.filter((b) => b.team === 'A');
  const revealed = r.special.auction !== null;
  return (
    <div class="col">
      <div class="row wrap" style={{ alignItems: 'flex-start' }}>
        <div class="col grow" style={{ minWidth: '260px' }}>
          <h3 class="teamA">Your team</h3>
          {r.heroes
            .filter((h) => h.team === 'A')
            .map((h) => (
              <HeroCard key={h.id} h={h} report={r} skip={props.skip} />
            ))}
        </div>
        <div class="col" style={{ flex: '1.2', minWidth: '300px' }}>
          <h3>Totals</h3>
          <table class="stats" data-testid="team-table">
            <thead>
              <tr>
                <th></th>
                <th class="teamA">Your team</th>
                <th class="teamB">Enemy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td>
                    <Num value={x.a} skip={props.skip} />
                  </td>
                  <td>
                    <Num value={x.b} skip={props.skip} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="card col">
            <b class="small">Recorded in this window</b>
            {r.special.structures.map((x, i) => (
              <div class="tiny" key={i}>
                {Math.floor(x.tick / 1200)}:
                {String(Math.floor((x.tick % 1200) / 20)).padStart(2, '0')} {x.kind} ({x.lane}
                {x.kind === 'tower' ? ` #${x.index + 1}` : ''}) belonging to{' '}
                <span class={teamClass(x.team)}>team {x.team}</span> destroyed
              </div>
            ))}
            {r.special.biomes.map((x, i) => (
              <div class="tiny" key={`b${i}`}>
                {s.content.biomeById.get(x.biome)?.name} opened at {x.slot}
              </div>
            ))}
            {r.special.pressure.map((x, i) => (
              <div class="tiny teamB" key={`p${i}`}>
                Pressure event: {x.name}
              </div>
            ))}
            {r.special.obelisks.map((x, i) => (
              <div class="tiny" key={`o${i}`}>
                <span class={teamClass(x.team)}>Team {x.team}</span> claimed {x.node}: {x.reward}{' '}
                {x.value ? `(${x.value})` : ''}
              </div>
            ))}
            {r.special.keeper.map((x, i) => (
              <div class="tiny dim" key={`k${i}`}>
                Keeper at {keeperPlace(x.spot)}:{' '}
                {x.stock.map((id) => itemName(s.content, id)).join(', ')}
              </div>
            ))}
            {r.special.curses.map((x, i) => (
              <div class="tiny" key={`c${i}`}>
                {heroName(s.content, r.heroes.find((h) => h.id === x.hero)?.def ?? '')}:{' '}
                {x.flaw
                  ? `accepted ${itemName(s.content, x.item)}, flaw ${x.flaw}`
                  : x.refused
                    ? `refused ${itemName(s.content, x.item)}`
                    : `offered ${itemName(s.content, x.item)}`}
              </div>
            ))}
            {mine.map((x, i) => (
              <div class="tiny" key={`m${i}`}>
                Your team bid {x.points} points and {x.gold} gold
              </div>
            ))}
            {revealed && r.special.auction && (
              <div class="tiny gold">
                Holy auction resolved: {itemName(s.content, r.special.auction.holy)}, team{' '}
                {r.special.auction.winner} won. Sealed bids were {r.special.auction.pointsA}p +{' '}
                {r.special.auction.goldA}g (A) and {r.special.auction.pointsB}p +{' '}
                {r.special.auction.goldB}g (B).
              </div>
            )}
          </div>
        </div>
        <div class="col grow" style={{ minWidth: '260px' }}>
          <h3 class="teamB">Enemy team</h3>
          {r.heroes
            .filter((h) => h.team === 'B')
            .map((h) => (
              <HeroCard key={h.id} h={h} report={r} skip={props.skip} />
            ))}
        </div>
      </div>
    </div>
  );
}
