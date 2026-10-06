import type { HeroModel, Report } from '../../analysis';
import { ItemIcon } from '../ItemIcon';
import { SigilIcon } from '../SigilIcon';
import { n0, keeperPlace, roleLabel } from '../format';
import { useSession } from '../session';
import { heroName, itemName, teamClass } from './common';

function best(hs: HeroModel[], f: (h: HeroModel) => number): HeroModel | null {
  let top: HeroModel | null = null;
  for (const h of hs) if (f(h) > (top ? f(top) : 0)) top = h;
  return top;
}

export function Takeaways(props: { report: Report }) {
  const s = useSession();
  const r = props.report;
  const nm = (h: HeroModel): string => heroName(s.content, h.def);
  const tag = (h: HeroModel) => <b class={teamClass(h.team)}>{nm(h)}</b>;
  const lost = r.special.structures.filter((x) => x.kind === 'tower' && x.team === 'A');
  const took = r.special.structures.filter((x) => x.kind === 'tower' && x.team === 'B');
  const lanes = [...new Set(lost.map((x) => x.lane))];
  const killer = best(r.heroes, (h) => h.kills);
  const feeder = best(r.heroes, (h) => h.deaths);
  const lead = r.teams.A.goldEarned - r.teams.B.goldEarned;
  const score = (h: HeroModel): number => h.kills * 2 + h.assists - h.deaths;
  const mine = r.heroes.filter((h) => h.team === 'A');
  const top = mine.length ? mine.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  const low = mine.length ? mine.reduce((a, b) => (score(b) < score(a) ? b : a)) : null;
  return (
    <ul class="takeaways" data-testid="takeaways">
      <li>
        <span class="tk-k">Towers</span>
        {lost.length === 0 ? 'You lost no towers' : `You lost ${lost.length} (${lanes.join(', ')})`}
        {`; took ${took.length}.`}
      </li>
      <li>
        <span class="tk-k">Fights</span>
        {killer ? (
          <>
            Top killer {tag(killer)} ({killer.kills}).{' '}
          </>
        ) : (
          'No hero kills. '
        )}
        {feeder && (
          <>
            Most deaths {tag(feeder)} ({feeder.deaths}).
          </>
        )}
      </li>
      <li>
        <span class="tk-k">Economy</span>
        {lead === 0
          ? 'Gold even. '
          : `Gold ${lead > 0 ? 'lead' : 'deficit'} ${n0(Math.abs(lead))}. `}
        {top && low && top !== low && (
          <>
            Best on your team {tag(top)}, weakest {tag(low)}.
          </>
        )}
      </li>
    </ul>
  );
}

export function Scoreboard(props: { report: Report; items: Record<number, string[]> }) {
  const s = useSession();
  const r = props.report;
  const group = (team: 'A' | 'B') => {
    const hs = r.heroes.filter((h) => h.team === team);
    const t = r.teams[team];
    return (
      <>
        <tr class={`sb-team ${team}`}>
          <td>{team === 'A' ? 'Your team' : 'Enemy team'}</td>
          <td>
            {t.kills}/{t.deaths}/{t.assists}
          </td>
          <td>{n0(t.goldEarned)}</td>
          <td>{n0(t.damageToHeroes)}</td>
          <td class="sb-items tiny dim">
            {t.towersDestroyed} towers · {t.campsCleared} camps
          </td>
        </tr>
        {hs.map((h) => {
          const def = s.content.heroById.get(h.def)!;
          const open = (): void => s.setUi({ reportHero: h.id });
          return (
            <tr
              key={h.id}
              class={`sb-row ${s.ui.reportHero === h.id ? 'sel' : ''}`}
              data-testid={`report-hero-${h.id}`}
              tabIndex={0}
              role="button"
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open();
                }
              }}
            >
              <td>
                <span class="sb-hero">
                  <SigilIcon spec={def.sigil} team={h.team} size={26} />
                  <span>
                    {heroName(s.content, h.def)}
                    <span class="dim tiny"> {roleLabel(h.role)}</span>
                  </span>
                </span>
              </td>
              <td>
                {h.kills}/{h.deaths}/{h.assists}
              </td>
              <td>{n0(h.goldEarned)}</td>
              <td>{n0(h.damageDealt)}</td>
              <td class="sb-items">
                {(props.items[h.id] ?? []).map((id, i) => (
                  <span key={i} class="sb-item" title={itemName(s.content, id)}>
                    <ItemIcon id={id} size={18} />
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </>
    );
  };
  return (
    <div class="sb-wrap">
      <table class="stats scoreboard" data-testid="team-table">
        <thead>
          <tr>
            <th>Hero</th>
            <th>K/D/A</th>
            <th>Gold</th>
            <th>Damage</th>
            <th class="sb-items">Items</th>
          </tr>
        </thead>
        <tbody>
          {group('A')}
          {group('B')}
        </tbody>
      </table>
    </div>
  );
}

export function EventLog(props: { report: Report }) {
  const s = useSession();
  const r = props.report;
  return (
    <div class="card col">
      <b class="small">Recorded in this window</b>
      {r.special.structures.map((x, i) => (
        <div class="tiny" key={i}>
          {Math.floor(x.tick / 1200)}:{String(Math.floor((x.tick % 1200) / 20)).padStart(2, '0')}{' '}
          {x.kind} ({x.lane}
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
          Keeper at {keeperPlace(x.spot)}: {x.stock.map((id) => itemName(s.content, id)).join(', ')}
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
    </div>
  );
}
