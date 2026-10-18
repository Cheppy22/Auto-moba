import { useEffect, useState } from 'preact/hooks';
import type { ForkPreview, PieceId, SnapFork, Stats } from '../../sim';
import { Term } from '../glossary';
import { PieceGlyph, StyleBadge, pieceLabel, styleColor, styleLabel } from '../pieces';
import { num } from '../relicPlan';
import { useSession } from '../session';
import { ForkTutor } from './Tutor';

/** The stats a fork can change, in the order the preview lists them, with their names. */
const STAT_ROWS: { key: keyof Stats; label: string; fmt?: (v: number) => string }[] = [
  { key: 'maxHp', label: 'Health' },
  { key: 'bladeDmg', label: 'Blade' },
  { key: 'soulPower', label: 'Soul' },
  { key: 'range', label: 'Reach' },
  { key: 'armor', label: 'Armor' },
  { key: 'resist', label: 'Resist' },
  { key: 'atkSpeed', label: 'Attack speed', fmt: (v) => v.toFixed(2) },
  { key: 'moveSpeed', label: 'Speed' },
  { key: 'cdr', label: 'Cooldowns', fmt: (v) => `−${Math.round(v * 100)}%` },
  { key: 'hpRegen', label: 'Regen', fmt: (v) => v.toFixed(1) },
];

export interface StatDelta {
  label: string;
  before: string;
  after: string;
  up: boolean;
}

/** The stats that change, biggest change first (by share of the old value). */
export function statDeltas(p: ForkPreview): StatDelta[] {
  const out: (StatDelta & { size: number })[] = [];
  for (const r of STAT_ROWS) {
    const b = p.before[r.key];
    const a = p.after[r.key];
    const fmt = r.fmt ?? num;
    if (fmt(b) === fmt(a)) continue;
    out.push({
      label: r.label,
      before: fmt(b),
      after: fmt(a),
      up: a > b,
      size: Math.abs(a - b) / Math.max(Math.abs(b), r.key === 'cdr' ? 0.1 : 1),
    });
  }
  return out.sort((x, y) => y.size - x.size).map(({ size: _size, ...d }) => d);
}

/** The line about the signature skill an archetype adds. */
function skillLine(p: ForkPreview): { name: string; text: string } | null {
  if (!p.signature) return null;
  const s = p.signature;
  const bits = [`${num(s.cooldownSec)} s cooldown`];
  if (s.range > 0) bits.push(`reach ${num(s.range)}`);
  if (s.radius > 0) bits.push(`area ${num(s.radius)}`);
  return { name: `New skill: ${s.name}`, text: bits.join(', ') };
}

/**
 * Draws the piece's 3D model in each option's style (the intro's portrait renderer), in the
 * background; the glyph stands in until it arrives or when WebGL is missing.
 */
function usePortraits(piece: PieceId, styles: (string | null)[]): ReadonlyMap<string, string> {
  const [map, setMap] = useState<ReadonlyMap<string, string>>(new Map());
  const key = `${piece}|${styles.join(',')}`;
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      import('../../render/portraits')
        .then(({ renderPortraits, portraitKey }) => {
          const keys = styles.map((style) => ({ piece, team: 'A' as const, style }));
          const drawn = renderPortraits(keys, 192);
          const out = new Map<string, string>();
          for (const k of keys) {
            const url = drawn.get(portraitKey(k));
            if (url) out.set(k.style ?? '-', url);
          }
          if (live) setMap(out);
        })
        .catch((err) => console.error('The fork portraits failed to draw', err));
    }, 60);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [key]);
  return map;
}

/** The preview of the option being read: model, how it plays, the numbers and the skill. */
function Preview(props: {
  f: SnapFork;
  optionId: string;
  playsLike: string;
  desc: string;
  portrait: string | undefined;
  look: string | null;
}) {
  const s = useSession();
  const p = s.match!.forkPreview(props.f.heroId, props.optionId);
  const deltas = p ? statDeltas(p) : [];
  const skill = p ? skillLine(p) : null;
  return (
    <div
      class="fs-preview"
      data-testid="fork-preview"
      style={{ '--sty': props.look ? styleColor(props.look) : 'var(--brass)' }}
    >
      <figure class="fs-model" aria-hidden="true">
        {props.portrait ? (
          <img src={props.portrait} alt="" width={96} height={96} key={props.portrait} />
        ) : props.look ? (
          <StyleBadge style={props.look} team="A" size={44} />
        ) : (
          <PieceGlyph piece={props.f.piece} team="A" size={48} />
        )}
      </figure>
      <div class="fs-read">
        {props.playsLike && (
          <p class="fs-plays" data-testid="fork-plays">
            {props.playsLike}
          </p>
        )}
        {deltas.length > 0 && (
          <dl class="fs-deltas" data-testid="fork-deltas">
            {deltas.map((d) => (
              <div class={`fs-delta ${d.up ? 'up' : 'down'}`} key={d.label}>
                <dt>{d.label}</dt>
                <dd>
                  <span class="fs-b">{d.before}</span>
                  <span class="fs-arrow" aria-label="becomes">
                    →
                  </span>
                  <b>{d.after}</b>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {skill && (
        <p class="fs-skill" data-testid="fork-skill">
          <b>{skill.name}</b> {skill.text}
        </p>
      )}
      <p class="fs-rule">{props.desc}</p>
      <p class="fs-rule tiny dim" data-testid="fork-signature-slot">
        Opens the Signature slot for <Term id="technique">Techniques</Term>.
      </p>
    </div>
  );
}

/**
 * The fork sheet: the match is paused. One piece at a time chooses an archetype at Rank 4 (three
 * options). Tabs pick the option to read; its preview shows the new model, a "plays like" line,
 * the stats before → after and the signature skill; Choose confirms. "Let the AI choose" answers
 * everything that waits. A bottom sheet on phones, a docked card on desktop.
 */
export function ForkSheet(props: { forks: SnapFork[] }) {
  const s = useSession();
  const f = props.forks[0];
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null);
  const forkKey = f ? `${f.heroId}:${f.rank}` : '';
  const styles = f ? f.options.map((o) => o.id) : [];
  const portraits = usePortraits(f?.piece ?? 'king', styles);
  if (!f) return null;
  const more = props.forks.length - 1;
  const sel = picked?.key === forkKey ? picked.id : f.options[0].id;
  const opt = f.options.find((o) => o.id === sel) ?? f.options[0];
  const playsLike = s.content.styleByKey.get(`${f.piece}/${opt.id}`)?.playsLike ?? '';
  const look = opt.id;
  return (
    <>
      <div class="fork-scrim" aria-hidden="true" />
      <section
        class="forksheet"
        data-testid="forks"
        role="dialog"
        aria-modal="true"
        aria-label="Choose an archetype"
        data-kind={f.kind}
        style={{ '--sty': look ? styleColor(look) : '#c9a35a' }}
      >
        <header class="fs-head" data-testid={`fork-${f.heroId}`}>
          <PieceGlyph piece={f.piece} team="A" size={28} />
          <div class="fs-title">
            <b>
              {pieceLabel(s.content, f.piece)}
              <span class="fs-style">
                {f.style ? (
                  <>
                    <StyleBadge style={f.style} team="A" size={16} />
                    {styleLabel(s.content, f.piece, f.style)}
                  </>
                ) : (
                  'Generic'
                )}
              </span>
            </b>
            <span class="fs-sub">
              <Term id="rank">Rank</Term> {f.rank} · Choose an <Term id="archetype">archetype</Term>
              {more > 0 && (
                <span class="fs-more" data-testid="fork-more">
                  {' '}
                  · {more} more waiting
                </span>
              )}
            </span>
          </div>
          <span class="fs-paused" aria-hidden="true">
            Paused
          </span>
        </header>
        <ForkTutor />
        <div class="fs-opts archetypes" role="tablist" aria-label="Archetypes">
          {f.options.map((o) => {
            const on = o.id === opt.id;
            return (
              <button
                key={o.id}
                class={`fs-opt ${on ? 'on' : ''}`}
                role="tab"
                aria-selected={on}
                data-testid={`fork-opt-${f.heroId}-${o.id}`}
                style={{ '--opt': styleColor(o.id) }}
                onClick={() => setPicked({ key: forkKey, id: o.id })}
              >
                <StyleBadge style={o.id} team="A" size={24} class="fs-emblem" />
                <span class="fs-opt-text">
                  <b>{o.name}</b>
                </span>
              </button>
            );
          })}
        </div>
        <Preview
          key={`${forkKey}:${opt.id}`}
          f={f}
          optionId={opt.id}
          playsLike={playsLike}
          desc={opt.desc}
          portrait={portraits.get(look)}
          look={look}
        />
        <div class="fs-actions">
          <button
            class="btn primary fs-choose"
            data-testid="fork-choose"
            onClick={() => s.chooseFork(f.heroId, opt.id)}
          >
            {`Choose ${opt.name}`}
          </button>
          <button class="btn fs-auto" data-testid="fork-auto" onClick={() => s.autoForks()}>
            Let the AI choose{more > 0 ? ` for all ${props.forks.length}` : ''}
          </button>
        </div>
      </section>
    </>
  );
}
