import type { PlayTeam } from '../../../sim';
import type { Award, PieceRow } from '../../../analysis/summary';
import { clock, full } from '../../charts';
import { TEAM_COLOR } from '../../charts';
import { ItemIcon } from '../../ItemIcon';
import { itemCategory } from '../../itemInfo';
import { PieceGlyph } from '../../pieces';
import { useSession } from '../../session';
import { Num } from '../common';
import type { ReportData } from '../data';
import { Portrait, reducedMotion, teamWord } from '../parts';

const fmtAward = (a: Award): string => {
  if (a.unit === 'seconds') return clock(a.value);
  if (a.unit === 'tick') return clock(a.value / 20);
  return full(a.value);
};

function Banner(props: { data: ReportData; onSame: () => void; onNew: () => void; hint: boolean }) {
  const { sum } = props.data;
  const win = sum.winner;
  const kicker = sum.checkmate ? 'Checkmate' : 'No checkmate';
  const verdict = win ? `${teamWord(win)} wins` : 'Draw';
  const acts = `${sum.acts} ${sum.acts === 1 ? 'Act' : 'Acts'}`;
  return (
    <header class={`rp-banner ${win ?? 'draw'}`} data-testid="verdict">
      <div class="rp-banner-glow" aria-hidden="true" />
      <div class="rp-banner-king">
        <PieceGlyph piece="king" team={win ?? 'A'} size={72} />
      </div>
      <h2 class="rp-banner-title" data-testid="winner">
        <span class="rp-kicker">{kicker}</span>
        <span class="rp-sep"> · </span>
        <span class="rp-verdict">{verdict}</span>
      </h2>
      <div class="rp-banner-meta" data-testid="courts">
        <span>
          <b>{clock(sum.endTick / sum.tickRate)}</b> match length
        </span>
        <span>
          <b>{acts}</b>
        </span>
        <span class="dim">White (you) vs Black</span>
      </div>
      <div class="rp-banner-actions">
        <button class="btn primary rp-btn" data-testid="new-match" onClick={props.onNew}>
          New match
        </button>
        <button class="btn rp-btn" data-testid="same-seed" onClick={props.onSame}>
          Same seed
        </button>
      </div>
      {props.hint && (
        <div class="rp-swipe" aria-hidden="true" data-testid="swipe-hint">
          <span class="touch">
            Swipe <span>→</span>
          </span>
          <span class="mouse">Use ← → or the tabs</span>
        </div>
      )}
    </header>
  );
}

function Awards(props: { data: ReportData }) {
  const { sum, rowOf } = props.data;
  const list = sum.awards.slice(0, 4);
  if (list.length === 0) return null;
  return (
    <ul class="rp-awards" data-testid="awards" aria-label="Awards">
      {list.map((a, i) => {
        const row = a.pieceId !== null ? rowOf(a.pieceId) : undefined;
        const team: PlayTeam | null = a.team;
        return (
          <li
            key={a.id}
            class="rp-award"
            data-testid={`award-${a.id}`}
            style={{ '--i': i } as Record<string, number>}
          >
            <span class="rp-award-title">{a.title}</span>
            <span class="rp-award-row">
              <span class="rp-award-who">
                {row ? (
                  <Portrait row={row} size={24} />
                ) : (
                  team && <PieceGlyph piece="king" team={team} size={22} />
                )}
                <span class={team ? `team${team}` : ''}>
                  {row ? row.name : team ? teamWord(team) : ''}
                </span>
              </span>
              <span class="rp-award-value">{fmtAward(a)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Totals(props: { data: ReportData }) {
  const { teams } = props.data.sum;
  const metrics: { id: string; label: string; a: number; b: number; hint?: string }[] = [
    { id: 'kills', label: 'Kills', a: teams.A.kills, b: teams.B.kills },
    { id: 'gold', label: 'Gold', a: teams.A.goldEarned, b: teams.B.goldEarned },
    { id: 'damage', label: 'Damage', a: teams.A.damageToPieces, b: teams.B.damageToPieces },
    {
      id: 'bastions',
      label: 'Bastions',
      a: teams.A.bastionsDestroyed,
      b: teams.B.bastionsDestroyed,
      hint: 'Enemy Bastions destroyed',
    },
    {
      id: 'checks',
      label: 'Checks',
      a: teams.A.checks,
      b: teams.B.checks,
      hint: 'Times the King fell with the Throne standing',
    },
  ];
  return (
    <section class="rp-totals" data-testid="team-totals" aria-label="Team totals">
      <div class="rp-totals-head">
        <b class="teamA">White</b>
        <span class="dim tiny">Team totals</span>
        <b class="teamB">Black</b>
      </div>
      {metrics.map((m) => {
        const total = m.a + m.b;
        return (
          <div class="rp-total" key={m.id} title={m.hint} data-testid={`total-${m.id}`}>
            <span class="rp-total-a">{full(m.a)}</span>
            <span class="rp-total-mid">
              <span class="rp-total-label">{m.label}</span>
              <span class="rp-total-bar" aria-hidden="true">
                {total > 0 ? (
                  <>
                    <i style={{ flexGrow: m.a, background: TEAM_COLOR.A }} />
                    <i style={{ flexGrow: m.b, background: TEAM_COLOR.B }} />
                  </>
                ) : (
                  <i style={{ flexGrow: 1, background: 'var(--rule)' }} />
                )}
              </span>
            </span>
            <span class="rp-total-b">{full(m.b)}</span>
          </div>
        );
      })}
    </section>
  );
}

function ScoreRow(props: {
  row: PieceRow;
  mark: 'mvp' | 'best' | null;
  onOpen: (id: number) => void;
  skip: boolean;
}) {
  const s = useSession();
  const r = props.row;
  return (
    <div
      class={`rp-srow ${r.team}`}
      role="row"
      data-testid={`report-hero-${r.id}`}
      data-mark={props.mark ?? ''}
      tabIndex={0}
      onClick={() => props.onOpen(r.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onOpen(r.id);
        }
      }}
      aria-label={`${r.name}, ${r.styleName}, rank ${r.rank}. ${r.kills} kills, ${r.deaths} deaths, ${r.assists} assists. Open details.`}
    >
      <span class="rp-c-piece" role="cell">
        <Portrait row={r} mark={props.mark} />
        <span class="rp-pname">
          <b>
            {r.pieceName}
            <span class="rp-rankbadge" title={`Rank ${r.rank}`} aria-label={`Rank ${r.rank}`}>
              {r.rank}
            </span>
          </b>
          <span class="dim tiny">{r.styleName}</span>
        </span>
      </span>
      <span class="rp-c rp-c-kda" role="cell" data-label="K / D / A">
        <Num value={r.kills} skip={props.skip} />/<Num value={r.deaths} skip={props.skip} />/
        <Num value={r.assists} skip={props.skip} />
      </span>
      <span class="rp-c" role="cell" data-label="Damage">
        <Num value={r.damageDealt} skip={props.skip} />
      </span>
      <span class="rp-c" role="cell" data-label="Healing">
        <Num value={r.healingDone} skip={props.skip} />
      </span>
      <span class="rp-c rp-c-gold" role="cell" data-label="Gold">
        <Num value={r.goldEarned} skip={props.skip} />
      </span>
      <span class="rp-c-items" role="cell" aria-label="Final items">
        {r.finalItems.map((id, i) => (
          <span
            key={`${id}:${i}`}
            class={`rp-item cat-${itemCategory(s.content, id)}`}
            title={r.finalItemNames[i] ?? id}
          >
            <ItemIcon id={id} size={18} />
          </span>
        ))}
        {r.finalItems.length === 0 && <span class="dim tiny">No items</span>}
      </span>
    </div>
  );
}

function Block(props: {
  team: PlayTeam;
  data: ReportData;
  onOpen: (id: number) => void;
  skip: boolean;
}) {
  const { sum } = props.data;
  const rows = sum.rows.filter((r) => r.team === props.team);
  const best = props.team === 'A' ? sum.mvp.White?.row.id : sum.mvp.Black?.row.id;
  const mvp = sum.mvp.match?.row.id;
  const won = sum.winner === props.team;
  return (
    <section
      class={`rp-block ${props.team}`}
      data-testid={`team-${props.team}`}
      role="table"
      aria-label={`${teamWord(props.team)} scoreboard`}
    >
      <h3 class="rp-block-head">
        <PieceGlyph piece="king" team={props.team} size={22} />
        <span>{teamWord(props.team)}</span>
        {props.team === 'A' && <span class="dim tiny">(you)</span>}
        <span class={`rp-tag ${won ? 'won' : ''}`}>
          {sum.winner === null ? 'Draw' : won ? 'Winner' : 'Defeated'}
        </span>
      </h3>
      <div class="rp-shead" role="row" aria-hidden="true">
        <span class="rp-c-piece">Piece</span>
        <span class="rp-c rp-c-kda">K/D/A</span>
        <span class="rp-c">
          <span class="long">Damage</span>
          <span class="short">Dmg</span>
        </span>
        <span class="rp-c">
          <span class="long">Healing</span>
          <span class="short">Heal</span>
        </span>
        <span class="rp-c rp-c-gold">Gold</span>
        <span class="rp-c-items">Items</span>
      </div>
      {rows.map((r) => (
        <ScoreRow
          key={r.id}
          row={r}
          mark={r.id === mvp ? 'mvp' : r.id === best ? 'best' : null}
          onOpen={props.onOpen}
          skip={props.skip}
        />
      ))}
    </section>
  );
}

export function ResultPage(props: {
  data: ReportData;
  onOpenPiece: (id: number) => void;
  swipeHint: boolean;
}) {
  const s = useSession();
  const skip = reducedMotion();
  return (
    <div class="rp-result">
      <Banner
        data={props.data}
        hint={props.swipeHint}
        onNew={() => s.reset()}
        onSame={() => s.newMatch({ seed: s.match!.config.seed })}
      />
      <div class="rp-teams">
        <Block team="A" data={props.data} onOpen={props.onOpenPiece} skip={skip} />
        <Block team="B" data={props.data} onOpen={props.onOpenPiece} skip={skip} />
      </div>
      <Awards data={props.data} />
      <Totals data={props.data} />
      <div class="rp-legend-line tiny dim">
        <span>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 18.5 2 7.5l5.2 4.3L12 4.5l4.8 7.3L22 7.5l-1 11z M3.6 20.2h16.8v2H3.6z"
              fill="#f0d58a"
              stroke="#7a5a1e"
              stroke-width="1.1"
            />
          </svg>{' '}
          Match MVP
        </span>
        <span>
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.2l2.9 6.2 6.7.8-4.9 4.6 1.3 6.7L12 17l-6 3.5 1.3-6.7L2.4 9.2l6.7-.8z"
              fill="#cfc6b0"
              stroke="#14111d"
              stroke-width="1.2"
            />
          </svg>{' '}
          Team’s best piece
        </span>
        <span>Tap a row for the piece’s detail</span>
      </div>
    </div>
  );
}
