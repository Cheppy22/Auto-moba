import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { BuildView, Match, TechniqueSlot } from '../../sim';
import { Terms } from '../glossary';
import { whitePieces } from '../Orders';
import { PieceGlyph, StyleBadge, pieceLabel, styleLabel } from '../pieces';
import { RichText } from '../richtext';
import { useSession } from '../session';
import { GRADE_MARK } from '../TechniqueChip';
import { GRADE_WORD, TechLedger, TechniqueCard, ledgerRows, techniqueFace } from '../TechniqueCard';
import { SlotDetail, SlotRow, type SlotTile } from '../TechniqueSlots';
import {
  REASON_TEXT,
  breakPlan,
  buildViewOf,
  loadPickForMe,
  savePickForMe,
  upgradePreviewOf,
  type BreakPlan,
} from './buildsData';

/** The piece shown at this break, kept while the player visits other tabs. */
let shownAt: { tick: number; heroId: number } | null = null;
/** Offers already dealt (turned over) at this break: `tick:heroId:rerolls`. */
const dealt = new Set<string>();

/** Upgrade a held Technique: the rule at the next grade, its numbers, and the price. */
function UpgradeBox(props: { m: Match; v: BuildView; tile: SlotTile; onDone: () => void }) {
  const s = useSession();
  const { v, tile } = props;
  const h = tile.held!;
  const next = h.nextGrade ?? null;
  const cost = h.upgradeCost ?? null;
  if (!next || cost === null) return <p class="bld-upnote">Brilliant is the top grade.</p>;
  const face = techniqueFace(s.content, h.id, next, v.piece);
  const preview = next === 'plain' ? null : upgradePreviewOf(props.m, v.heroId, h.id, next);
  const short = v.gold < cost;
  return (
    <div class="bld-upgrade" data-testid="builds-upgrade-box">
      <p class="bld-upnext">
        <i>
          At {GRADE_WORD[next]} {GRADE_MARK[next]}
        </i>{' '}
        {face && <RichText text={face.desc} />}
      </p>
      {preview && ledgerRows(preview).length > 0 && (
        <TechLedger rows={ledgerRows(preview)} testid="builds-upgrade-change" />
      )}
      {v.open && (
        <button
          class="btn primary bld-upbtn"
          data-testid="builds-upgrade"
          disabled={short}
          onClick={() => {
            if (s.issue({ type: 'upgradeTechnique', heroId: v.heroId, techniqueId: h.id }).ok)
              props.onDone();
          }}
        >
          {short
            ? `Upgrade needs ${cost} gold`
            : `Upgrade to ${GRADE_WORD[next]} ${GRADE_MARK[next]} · ${cost} gold`}
        </button>
      )}
    </div>
  );
}

/** One piece: its gold, the six slots (tap a held one for details and Upgrade), and its offer. */
function PiecePanel(props: {
  m: Match;
  v: BuildView;
  plan: BreakPlan;
  pickForMe: boolean;
  /** The strip and switches, drawn at the top of the left column. */
  children: ComponentChildren;
}) {
  const s = useSession();
  const { m, v, plan, pickForMe } = props;
  const [slot, setSlot] = useState<TechniqueSlot | null>(null);
  const [fresh, setFresh] = useState<TechniqueSlot | null>(null);
  const dealRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(null), 900);
    return () => window.clearTimeout(t);
  }, [fresh]);
  const unit = m.unitById(v.heroId);
  const style = unit?.hero?.style ?? null;
  const o = v.offer;
  const open = !!o && o.decided === null;
  const hi = pickForMe && open && plan.highlight.includes(v.heroId);
  const reasons = plan.reasons.get(v.heroId) ?? [];
  const tile = slot ? v.slots.find((t) => t.slot === slot && t.held) : undefined;
  const dealKey = o ? `${m.state.tick}:${v.heroId}:${o.rerolls}` : '';
  // the cards turn over once per break and again after each reroll, never on a mere re-render
  if (o && !dealt.has(dealKey)) {
    dealt.add(dealKey);
    dealRef.current = dealKey;
  }
  const deal = dealRef.current === dealKey;
  const taken =
    o?.decided === 'taken'
      ? o.cards.find((c) => v.slots.some((t) => t.held?.id === c.id))
      : undefined;
  const take = (i: number): void => {
    const card = o!.cards[i];
    if (s.issue({ type: 'takeTechnique', heroId: v.heroId, cardIndex: i }).ok) setFresh(card.slot);
  };
  return (
    <section
      class={`bld-piece ${hi ? 'hi' : ''}`}
      data-testid={`builds-${v.piece}`}
      data-hero={v.heroId}
      aria-label={pieceLabel(s.content, v.piece)}
    >
      <div class="bld-l">
        {props.children}
        <header class="bld-head">
          <PieceGlyph piece={v.piece} team="A" size={30} />
          <span class="bld-head-name">
            <b>{pieceLabel(s.content, v.piece)}</b>
            <span class="bld-head-sub">
              {style ? (
                <>
                  <StyleBadge style={style} team="A" size={14} />
                  {styleLabel(s.content, v.piece, style)}
                </>
              ) : (
                'Generic'
              )}{' '}
              · Rank {v.rank}
            </span>
          </span>
          <span class="bld-gold" data-testid="builds-gold">
            <span class="coin" />
            {v.gold}
          </span>
        </header>
        {hi && reasons.length > 0 && (
          <p class="bld-why" data-testid="builds-why">
            <i>★ Worth a look</i>{' '}
            {reasons
              .slice(0, 2)
              .map((r) => REASON_TEXT[r])
              .join('; ')}
            .
          </p>
        )}
        <SlotRow
          tiles={v.slots}
          fresh={fresh}
          selected={tile ? slot : null}
          onSelect={setSlot}
          testid={`builds-slots-${v.piece}`}
        />
        {tile && (
          <SlotDetail tile={tile} testid="builds-slot-detail" lastAct>
            <UpgradeBox m={m} v={v} tile={tile} onDone={() => setFresh(tile.slot)} />
          </SlotDetail>
        )}
        {!tile && v.slots.some((t) => t.held) && (
          <p class="bld-hint tiny dim">Tap a held Technique for what it did and to upgrade it.</p>
        )}
      </div>
      <div class="bld-r">
        {open && o && (
          <>
            <div class="bld-offer-head">
              <b>Take one</b>
              <span class={`tcard-gradeword ${o.grade}`}>
                {GRADE_WORD[o.grade]} offer{GRADE_MARK[o.grade] ? ` ${GRADE_MARK[o.grade]}` : ''}
              </span>
              {o.rerolls > 0 && <span class="dim tiny">rerolled ×{o.rerolls}</span>}
            </div>
            <div
              class={`bld-cards ${deal ? 'deal' : ''}`}
              key={dealKey}
              data-testid={`builds-cards-${v.piece}`}
            >
              {o.cards.map((c, i) => (
                <TechniqueCard
                  key={`${c.id}:${i}`}
                  card={c}
                  index={i}
                  mark={c.suggested ? (pickForMe ? 'picked' : 'suggested') : null}
                  testid={`builds-card-${v.piece}-${i}`}
                >
                  <button
                    class="btn primary tcard-take"
                    data-testid={`builds-take-${v.piece}-${i}`}
                    onClick={() => take(i)}
                  >
                    Take {c.name}
                  </button>
                </TechniqueCard>
              ))}
            </div>
            <div class="bld-actions">
              <button
                class="btn bld-act"
                data-testid="builds-reroll"
                disabled={v.gold < o.rerollCost}
                onClick={() => s.issue({ type: 'rerollOffer', heroId: v.heroId })}
              >
                <b>Reroll</b>
                <small>
                  {o.freeRerolls > 0
                    ? `free · ${o.freeRerolls} left`
                    : v.gold < o.rerollCost
                      ? `needs ${o.rerollCost} gold`
                      : `${o.rerollCost} gold`}
                </small>
              </button>
              <button
                class="btn bld-act"
                data-testid="builds-pass"
                onClick={() => s.issue({ type: 'passOffer', heroId: v.heroId })}
              >
                <b>Pass</b>
                <small>+{o.passGold} gold</small>
              </button>
              <button
                class="btn bld-act"
                data-testid="builds-auto"
                onClick={() => {
                  const i = o.suggested;
                  if (s.issue({ type: 'autoBuild', heroId: v.heroId }).ok && i !== null)
                    setFresh(o.cards[i].slot);
                }}
              >
                <b>Let the AI choose</b>
                <small>this piece</small>
              </button>
            </div>
          </>
        )}
        {o && o.decided !== null && (
          <p class="bld-decided" data-testid="builds-decided" data-decided={o.decided}>
            {o.decided === 'passed' ? (
              <>
                Passed: <b>+{o.passGold} gold</b>.
              </>
            ) : taken ? (
              <>
                Took{' '}
                <b>
                  {taken.name}
                  {GRADE_MARK[taken.grade] ? ` ${GRADE_MARK[taken.grade]}` : ''}
                </b>{' '}
                ({taken.slotName}). It starts working next Act.
              </>
            ) : (
              'Picked. It starts working next Act.'
            )}
          </p>
        )}
        {!o && <p class="bld-decided dim">No offer for this piece at this break.</p>}
      </div>
    </section>
  );
}

/**
 * The Act break's Builds tab. A strip of White's five pieces (gold, an open offer, the picks worth
 * a look), then one piece: its six slots (tap a held one for what it did and Upgrade) and its offer
 * of three cards with Take, Reroll, Pass and Let the AI choose. "Pick for me" (on by default) shows
 * the AI's pick on every offer as already chosen and stars the 1-2 picks that matter most; on
 * Resume every piece left undecided takes its marked card.
 */
export function BuildsTab() {
  const s = useSession();
  const m = s.match!;
  const units = whitePieces(s);
  const plan = breakPlan(
    m,
    units.map((u) => u.id),
  );
  const [pickForMe, setPickForMe] = useState(loadPickForMe);
  const remembered = shownAt && shownAt.tick === m.state.tick ? shownAt.heroId : null;
  const [sel, setSel] = useState<number>(remembered ?? plan.order[0] ?? units[0]?.id ?? -1);
  shownAt = { tick: m.state.tick, heroId: sel };
  const views = plan.order
    .map((id) => buildViewOf(m, id))
    .filter((v): v is BuildView => v !== null);
  const v = views.find((x) => x.heroId === sel) ?? views[0];
  const anyOpen = views.some((x) => x.offer && x.offer.decided === null);
  const toggle = (): void => {
    savePickForMe(!pickForMe);
    setPickForMe(!pickForMe);
  };
  return (
    <div class="bld" data-testid="builds-tab" data-pick-for-me={pickForMe ? 'on' : 'off'}>
      {v && (
        <PiecePanel key={v.heroId} m={m} v={v} plan={plan} pickForMe={pickForMe}>
          <div class="bld-side">
            <div class="bld-top">
              <button
                class={`bld-switch ${pickForMe ? 'on' : ''}`}
                role="switch"
                aria-checked={pickForMe}
                data-testid="builds-pick-for-me"
                onClick={toggle}
              >
                <span class="bld-track" aria-hidden="true">
                  <i />
                </span>
                Pick for me
              </button>
              <button
                class="btn bld-all"
                data-testid="builds-auto-all"
                disabled={!anyOpen}
                onClick={() => s.issue({ type: 'autoBuild', heroId: null })}
              >
                AI picks for all
              </button>
            </div>
            <p class="bld-intro" data-testid="builds-intro">
              <Terms
                max={1}
                text={
                  pickForMe
                    ? 'Every piece has a pick ready. ★ marks the ones worth a look; Take another card to change a pick.'
                    : 'Each piece takes one of three Techniques, or rerolls or passes with its gold.'
                }
              />
            </p>
            <nav
              class="bld-strip"
              role="tablist"
              aria-label="Your pieces"
              data-testid="builds-strip"
            >
              {views.map((x) => {
                const open = !!x.offer && x.offer.decided === null;
                const star = pickForMe && open && plan.highlight.includes(x.heroId);
                return (
                  <button
                    key={x.heroId}
                    role="tab"
                    aria-selected={x.heroId === v?.heroId}
                    class={`bld-chip ${x.heroId === v?.heroId ? 'on' : ''} ${star ? 'star' : ''}`}
                    data-testid={`builds-chip-${x.piece}`}
                    data-state={open ? (star ? 'star' : 'open') : 'done'}
                    aria-label={`${pieceLabel(s.content, x.piece)}, ${x.gold} gold${
                      open ? (star ? ', worth a look' : ', offer open') : ', decided'
                    }`}
                    onClick={() => setSel(x.heroId)}
                  >
                    <PieceGlyph piece={x.piece} team="A" size={24} />
                    <span class="bld-chip-gold">{x.gold}</span>
                    <i class="bld-chip-state" aria-hidden="true">
                      {open ? (star ? '★' : '') : '✓'}
                    </i>
                  </button>
                );
              })}
            </nav>
          </div>
        </PiecePanel>
      )}
      <p class="bld-foot tiny dim">
        {pickForMe
          ? 'On Resume, each piece you leave takes its marked card, and every piece spends its gold on upgrades unless you bought an upgrade or a reroll for it.'
          : 'Pieces you leave are picked for by the AI when you resume, and every piece spends its gold on upgrades unless you bought an upgrade or a reroll for it.'}
      </p>
    </div>
  );
}
