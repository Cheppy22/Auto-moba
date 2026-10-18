import { useEffect, useState } from 'preact/hooks';
import type { ForkPreview, PieceId, SnapFork } from '../../sim';
import { Term } from '../glossary';
import { PieceGlyph, StyleBadge, pieceLabel, styleColor, styleLabel } from '../pieces';
import { num } from '../relicPlan';
import { useSession } from '../session';
import { statDeltas } from '../statDeltas';
import { ForkTutor } from './Tutor';

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
        <div class="fs-body">
          <ForkTutor />
          <Preview
            key={`${forkKey}:${opt.id}`}
            f={f}
            optionId={opt.id}
            playsLike={playsLike}
            desc={opt.desc}
            portrait={portraits.get(look)}
            look={look}
          />
          {f.kind === 'archetype' && (
            <p class="fs-slotline" data-testid="fork-signature-slot">
              Every archetype also opens the <b>Signature</b> slot for{' '}
              <Term id="technique">Techniques</Term>.
            </p>
          )}
        </div>
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
