import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { HeroModel, Report } from '../../analysis';
import type { LaneId, PieceId } from '../../sim';
import { ItemIcon } from '../ItemIcon';
import { itemCategory } from '../itemInfo';
import { LANE_LABEL, PieceGlyph } from '../pieces';
import { courtName, eventLines } from '../../analysis/text';
import { mmss, n0, roleLabel } from '../format';
import { useWidthBelow } from '../layout';
import { useSession } from '../session';
import { heroName, itemName, teamClass } from './common';

function best(hs: HeroModel[], f: (h: HeroModel) => number): HeroModel | null {
  let top: HeroModel | null = null;
  for (const h of hs) if (f(h) > (top ? f(top) : 0)) top = h;
  return top;
}

export function Takeaways(props: { report: Report; folded: boolean }) {
  const s = useSession();
  const r = props.report;
  const nm = (h: HeroModel): string => heroName(s.content, h.def);
  const tag = (h: HeroModel) => (
    <b class={teamClass(h.team)}>
      {courtName(h.team)} {nm(h)}
    </b>
  );
  const lost = r.special.structures.filter((x) => x.kind === 'tower' && x.team === 'A');
  const took = r.special.structures.filter((x) => x.kind === 'tower' && x.team === 'B');
  const lanes = [...new Set(lost.map((x) => LANE_LABEL[x.lane as LaneId] ?? x.lane))];
  const killer = best(r.heroes, (h) => h.kills);
  const feeder = best(r.heroes, (h) => h.deaths);
  const lead = r.teams.A.goldEarned - r.teams.B.goldEarned;
  const score = (h: HeroModel): number => h.kills * 2 + h.assists - h.deaths;
  const mine = r.heroes.filter((h) => h.team === 'A');
  const top = mine.length ? mine.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  const low = mine.length ? mine.reduce((a, b) => (score(b) < score(a) ? b : a)) : null;
  const pts = { A: r.teams.A.pointsEarned, B: r.teams.B.pointsEarned };
  const lead2 = pts.A === pts.B ? null : pts.A > pts.B ? 'A' : 'B';
  const unit = r.scope.kind === 'match' ? 'Match' : 'Act';
  const verdict = (
    <>
      <span class="tk-k">Points</span>
      {lead2
        ? `${unit}: ${courtName(lead2)} earned ${n0(pts[lead2])} points to ${n0(pts[lead2 === 'A' ? 'B' : 'A'])}.`
        : `${unit}: level on points (${n0(pts.A)} each).`}
    </>
  );
  const played = Object.entries(r.teams.A.gambitsPlayed)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${s.content.gambitById.get(id)?.name ?? id} ×${n}`)
    .join(', ');
  const list = (
    <ul class="takeaways" data-testid="takeaways">
      {!props.folded && <li>{verdict}</li>}
      <li>
        <span class="tk-k">Bastions</span>
        {lost.length === 0
          ? 'White lost no Bastions'
          : `White lost ${lost.length} (${lanes.join(', ')})`}
        {`; took ${took.length}.`}
        {r.teams.A.guardianDestroyed && ' White felled the Black Throne.'}
        {r.teams.B.guardianDestroyed && ' Black felled the White Throne.'}
      </li>
      <li>
        <span class="tk-k">Fights</span>
        {killer ? (
          <>
            Top killer {tag(killer)} ({killer.kills}).{' '}
          </>
        ) : (
          'No piece kills. '
        )}
        {feeder && (
          <>
            Most falls {tag(feeder)} ({feeder.deaths}).
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
            Best White piece {tag(top)}, weakest {tag(low)}.
          </>
        )}
      </li>
      <li>
        <span class="tk-k">Orders</span>
        {played ? `White played ${played}. ` : 'White played no gambits. '}
        {`Pawns fielded: White ${r.teams.A.pawnsFielded}, Black ${r.teams.B.pawnsFielded}. `}
        {`Check: White ${r.teams.A.checks}, Black ${r.teams.B.checks}.`}
      </li>
    </ul>
  );
  if (!props.folded) return list;
  return (
    <details class="takeaways-fold" data-testid="takeaways-fold">
      <summary>{verdict}</summary>
      {list}
    </details>
  );
}

export function Scoreboard(props: { report: Report; items: Record<number, string[]> }) {
  const s = useSession();
  const r = props.report;
  const narrow = useWidthBelow(500);
  const [expanded, setExpanded] = useState<number | null>(null);
  const open = (id: number): void => s.setUi({ reportHero: id });
  const group = (team: 'A' | 'B') => {
    const hs = r.heroes.filter((h) => h.team === team);
    const t = r.teams[team];
    return (
      <>
        <tr class={`sb-team ${team}`}>
          <td>{team === 'A' ? 'White (you)' : 'Black'}</td>
          <td>
            {t.kills}/{t.deaths}/{t.assists}
          </td>
          <td>{n0(t.goldEarned)}</td>
          {!narrow && <td>{n0(t.damageToHeroes)}</td>}
          {!narrow && (
            <td class="sb-items tiny dim">
              {t.towersDestroyed} Bastions · {t.campsCleared} camps
            </td>
          )}
        </tr>
        {hs.map((h) => {
          const activate = (): void =>
            narrow ? setExpanded(expanded === h.id ? null : h.id) : open(h.id);
          const icons = (props.items[h.id] ?? []).map((id, i) => (
            <span
              key={`${id}:${i}`}
              class={`sb-item cat-${itemCategory(s.content, id)}`}
              title={itemName(s.content, id)}
            >
              <ItemIcon id={id} size={18} />
            </span>
          ));
          return (
            <Fragment key={h.id}>
              <tr
                class={`sb-row ${s.ui.reportHero === h.id ? 'sel' : ''}`}
                data-testid={`report-hero-${h.id}`}
                tabIndex={0}
                role="button"
                aria-expanded={narrow ? expanded === h.id : undefined}
                onClick={activate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                  }
                }}
              >
                <td>
                  <span class="sb-hero">
                    <PieceGlyph piece={h.def as PieceId} team={h.team} size={26} />
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
                {!narrow && <td>{n0(h.damageDealt)}</td>}
                {!narrow && <td class="sb-items">{icons}</td>}
              </tr>
              {narrow && expanded === h.id && (
                <tr key={`${h.id}x`} class="sb-more">
                  <td colSpan={3}>
                    <div class="row wrap">
                      <span class="small">Damage {n0(h.damageDealt)}</span>
                      <span class="sb-icons">{icons}</span>
                      <button
                        class="btn small grow"
                        data-testid={`open-hero-${h.id}`}
                        onClick={() => open(h.id)}
                      >
                        Replay
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
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
            <th>Piece</th>
            <th>K/D/A</th>
            <th>Gold</th>
            {!narrow && <th>Damage</th>}
            {!narrow && <th class="sb-items">Items</th>}
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
  const lines = eventLines(props.report, s.content, 'A');
  return (
    <div class="card col">
      <b class="small">Recorded in this window</b>
      {lines.map((l, i) => (
        <div class={`tiny ${l.team ? teamClass(l.team) : 'dim'}`} key={i}>
          {mmss(l.tick)} {l.text}
        </div>
      ))}
    </div>
  );
}
