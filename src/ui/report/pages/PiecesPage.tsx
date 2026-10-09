import type { Content, PieceId } from '../../../sim';
import type { HeroModel } from '../../../analysis';
import type { PieceRow } from '../../../analysis/summary';
import {
  CAT,
  ChartBox,
  DAMAGE_COLOR,
  DAMAGE_LABEL,
  Gantt,
  SplitBar,
  clock,
  full,
} from '../../charts';
import { ItemIcon } from '../../ItemIcon';
import { itemCategory } from '../../itemInfo';
import { LANE_LABEL, PATH_LABEL, StyleBadge, styleDesc } from '../../pieces';
import { useSession } from '../../session';
import { itemName } from '../common';
import type { ReportData } from '../data';
import { Portrait } from '../parts';
import { GOLD_GROUPS, goldGroup } from './EconomyPage';

const TYPES = ['blade', 'soul', 'true'] as const;
const KILLER: Record<string, string> = {
  camp: 'a camp monster',
  tower: 'a Bastion',
  guardian: 'a Throne',
  minion: 'a pawn or pawnling',
  none: 'the board',
};

function forkName(c: Content, h: HeroModel, rank: number, optionId: string): string {
  for (const st of c.pieceById.get(h.def as PieceId)?.styles ?? []) {
    const o = st.forks[String(rank) as '4' | '8']?.find((f) => f.id === optionId);
    if (o) return o.name;
  }
  return optionId;
}

/** The chip row that picks one of the ten pieces (shared by the Pieces and Replay pages). */
export function PieceChips(props: {
  data: ReportData;
  value: number;
  onPick: (id: number) => void;
  testid: string;
}) {
  return (
    <div class="rp-chips" role="radiogroup" aria-label="Choose a piece" data-testid={props.testid}>
      {props.data.sum.rows.map((r) => (
        <button
          key={r.id}
          role="radio"
          aria-checked={props.value === r.id}
          class={`rp-chip ${r.team} ${props.value === r.id ? 'on' : ''}`}
          data-testid={`${props.testid}-${r.id}`}
          onClick={() => props.onPick(r.id)}
        >
          <Portrait row={r} size={30} />
          <span>{r.pieceName}</span>
        </button>
      ))}
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div class="rp-fact">
      <b>{props.value}</b>
      <span>{props.label}</span>
    </div>
  );
}

export function PieceDetail(props: { data: ReportData; id: number; onReplay: () => void }) {
  const s = useSession();
  const { report, tickRate, endSec, guides, dealtByType, takenByType, rowOf } = props.data;
  const r = rowOf(props.id) as PieceRow | undefined;
  const h = report.heroes.find((x) => x.id === props.id);
  if (!r || !h) return null;
  const at = (tick: number): number => tick / tickRate;
  const dealt = dealtByType.get(r.id) ?? { blade: 0, soul: 0, true: 0 };
  const taken = takenByType.get(r.id) ?? { blade: 0, soul: 0, true: 0 };
  const gold: Record<string, number> = {};
  for (const [src, v] of Object.entries(h.goldBySource))
    gold[goldGroup(src)] = (gold[goldGroup(src)] ?? 0) + v;
  const killerName = (d: HeroModel['deathRecords'][number]): string =>
    d.killerKind === 'hero'
      ? (rowOf(d.killer)?.name ?? 'a piece')
      : (KILLER[d.killerKind] ?? `a ${d.killerKind}`);
  const rows = [
    {
      id: 'items',
      label: 'Items',
      items: h.purchases.map((p) => ({
        t0: at(p.tick),
        color: CAT.yellow,
        shape: 'square' as const,
        label: `Bought ${itemName(s.content, p.item)} (${full(p.price)}g)`,
      })),
    },
    {
      id: 'ranks',
      label: 'Ranks',
      items: h.ranks.map((u) => ({
        t0: at(u.tick),
        color: CAT.blue,
        shape: 'circle' as const,
        label: `Rank ${u.rank}${u.bonus ? `: ${u.bonus}` : ''}`,
      })),
    },
    {
      id: 'forks',
      label: 'Forks',
      items: h.forks.map((f) => ({
        t0: at(f.tick),
        color: CAT.violet,
        shape: 'diamond' as const,
        label: `Fork, Rank ${f.rank}: ${forkName(s.content, h, f.rank, f.optionId)}`,
      })),
    },
    {
      id: 'falls',
      label: 'Falls',
      items: h.deathRecords.map((d) => ({
        t0: at(d.tick),
        color: CAT.red,
        shape: 'tri' as const,
        label: `Fell to ${killerName(d)}`,
      })),
    },
  ];
  type Entry = { tick: number; kind: string; text: string };
  const story: Entry[] = [
    ...h.purchases.map((p) => ({
      tick: p.tick,
      kind: 'buy',
      text: `Bought ${itemName(s.content, p.item)} for ${full(p.price)}g${p.consumed.length ? ` (combined ${p.consumed.map((c) => itemName(s.content, c)).join(' + ')})` : ''}`,
    })),
    ...h.sells.map((p) => ({
      tick: p.tick,
      kind: 'buy',
      text: `Sold ${itemName(s.content, p.item)} for ${full(p.refund)}g`,
    })),
    ...h.ranks.map((u) => ({
      tick: u.tick,
      kind: 'rank',
      text: `Reached Rank ${u.rank}${u.bonus ? `: ${u.bonus}` : ''}`,
    })),
    ...h.forks.map((f) => ({
      tick: f.tick,
      kind: 'fork',
      text: `Fork at Rank ${f.rank}: ${forkName(s.content, h, f.rank, f.optionId)}${f.auto ? ' (picked by the AI)' : ''}`,
    })),
    ...h.deathRecords.map((d) => ({
      tick: d.tick,
      kind: 'fall',
      text: `Fell to ${killerName(d)}. Damage in the 6 seconds before: Blade ${full(d.mix.blade)}, Soul ${full(d.mix.soul)}, True ${full(d.mix.true)}`,
    })),
  ].sort((a, b) => a.tick - b.tick);
  return (
    <div class="rp-piece" data-testid="hero-view">
      <header class={`rp-piece-head ${r.team}`}>
        <Portrait row={r} size={64} />
        <div class="rp-piece-id">
          <h3 class={`team${r.team}`}>{r.name}</h3>
          <div class="rp-piece-style">
            <StyleBadge style={r.style} team={r.team} size={18} /> {r.styleName}
            <span class="dim"> · {PATH_LABEL[r.path as keyof typeof PATH_LABEL] ?? r.path}</span>
          </div>
          <div class="dim tiny">
            {styleDesc(s.content, r.piece, r.style)}{' '}
            {r.lane ? `· Ended in the ${LANE_LABEL[r.lane as 'top'] ?? r.lane} lane` : ''}
          </div>
        </div>
        <button class="btn rp-btn" onClick={props.onReplay} data-testid="open-replay">
          Path replay
        </button>
      </header>
      <div class="rp-facts">
        <Fact label="Rank" value={String(r.rank)} />
        <Fact label="K / D / A" value={`${r.kills}/${r.deaths}/${r.assists}`} />
        <Fact label="Damage" value={full(r.damageDealt)} />
        <Fact label="Taken" value={full(r.damageTaken)} />
        <Fact label="Healing" value={full(r.healingDone)} />
        <Fact label="Gold" value={full(r.goldEarned)} />
        <Fact label="Bastion dmg" value={full(r.objectiveDamage)} />
        <Fact label="Pawn kills" value={String(r.pawnKills)} />
      </div>
      <div class="rp-items-line" aria-label="Final items">
        {r.finalItems.map((id, i) => (
          <span
            key={`${id}${i}`}
            class={`rp-item big cat-${itemCategory(s.content, id)}`}
            title={r.finalItemNames[i] ?? id}
          >
            <ItemIcon id={id} size={22} />
          </span>
        ))}
        {r.finalItems.length === 0 && <span class="dim tiny">No final items</span>}
      </div>
      <ChartBox
        testid="chart-life"
        title="Purchases, ranks, forks and falls"
        legend={[
          { label: 'Item bought', color: CAT.yellow, shape: 'square' },
          { label: 'Rank up', color: CAT.blue, shape: 'diamond' },
          { label: 'Fork', color: CAT.violet, shape: 'diamond' },
          { label: 'Fall', color: CAT.red, shape: 'tri' },
        ]}
      >
        <Gantt
          label={`${r.name}: purchases, ranks, forks and falls over time`}
          xMax={endSec}
          rows={rows}
          guides={guides}
          labelWidth={48}
        />
      </ChartBox>
      <ChartBox testid="chart-mix" title="Damage and gold mix">
        <div class="rp-mix">
          <div>
            <div class="tiny dim">Damage dealt to pieces</div>
            <SplitBar
              label="Damage dealt by type"
              parts={TYPES.map((t) => ({
                key: t,
                label: DAMAGE_LABEL[t],
                value: dealt[t],
                color: DAMAGE_COLOR[t],
              }))}
            />
          </div>
          <div>
            <div class="tiny dim">Damage taken</div>
            <SplitBar
              label="Damage taken by type"
              parts={TYPES.map((t) => ({
                key: t,
                label: DAMAGE_LABEL[t],
                value: taken[t],
                color: DAMAGE_COLOR[t],
              }))}
            />
          </div>
          <div>
            <div class="tiny dim">Gold by source</div>
            <SplitBar
              label="Gold by source"
              parts={GOLD_GROUPS.map((g) => ({
                key: g.key,
                label: g.label,
                value: gold[g.key] ?? 0,
                color: g.color,
              }))}
            />
          </div>
        </div>
      </ChartBox>
      <ChartBox testid="piece-story" title="In order" note={`${story.length} entries`}>
        <ol class="rp-story">
          {story.map((e, i) => (
            <li key={i} class={e.kind}>
              <b>{clock(at(e.tick))}</b> {e.text}
            </li>
          ))}
          {story.length === 0 && <li class="dim">Nothing recorded for this piece.</li>}
        </ol>
      </ChartBox>
    </div>
  );
}
