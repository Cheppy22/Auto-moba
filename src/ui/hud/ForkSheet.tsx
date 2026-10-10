import type { ForkOptionDef, Path, SnapFork } from '../../sim';
import {
  PATH_LABEL,
  PATHS,
  PieceGlyph,
  StyleBadge,
  pieceLabel,
  styleColor,
  styleDesc,
  styleLabel,
} from '../pieces';
import { useSession } from '../session';

const OFFENSE_STATS = new Set(['bladeDmg', 'soulPower', 'atkSpeed']);
const DEFENSE_STATS = new Set(['maxHp', 'armor', 'resist', 'hpRegen', 'damageTakenMult']);

/** Which build path a fork option leans towards, when its numbers lean clearly one way. */
function lean(opt: ForkOptionDef | undefined): Path | null {
  if (!opt) return null;
  const ax = [0, 0, 0];
  for (const m of opt.mods) {
    const mag = Math.abs(m.kind === 'mul' ? m.value - 1 : m.value / 100);
    ax[OFFENSE_STATS.has(m.stat) ? 0 : DEFENSE_STATS.has(m.stat) ? 1 : 2] += mag;
  }
  // an ability tweak: more power or a shorter cooldown is offense, reach and width are utility
  ax[0] += Math.max(0, opt.powerMul - 1) + Math.max(0, 1 - opt.cooldownMul);
  ax[2] += Math.max(0, opt.rangeMul - 1) + Math.max(0, opt.radiusMul - 1);
  const order = [0, 1, 2].sort((x, y) => ax[y] - ax[x]);
  const [top, second] = [ax[order[0]], ax[order[1]]];
  if (top <= 0.02 || top < second * 1.3) return null;
  return PATHS[order[0]];
}

/**
 * The fork sheet: the match is paused. One piece at a time chooses an archetype (three options, Rank 4) or a skill path (two, Rank 8); "Let the AI
 * choose" answers everything that waits. A bottom sheet on phones, a docked card on desktop.
 */
export function ForkSheet(props: { forks: SnapFork[] }) {
  const s = useSession();
  const f = props.forks[0];
  if (!f) return null;
  const more = props.forks.length - 1;
  const archetype = f.kind === 'archetype';
  const styleDef = f.style ? s.content.styleByKey.get(`${f.piece}/${f.style}`) : undefined;
  const defs = archetype ? [] : (styleDef?.forks['8'] ?? []);
  return (
    <>
      <div class="fork-scrim" aria-hidden="true" />
      <section
        class="forksheet"
        data-testid="forks"
        role="dialog"
        aria-modal="true"
        aria-label={archetype ? 'Choose an archetype' : 'Choose a path'}
        data-kind={f.kind}
        style={{ '--sty': f.style ? styleColor(f.style) : '#c9a35a' }}
      >
        <header class="fs-head" data-testid={`fork-${f.heroId}`}>
          <PieceGlyph piece={f.piece} team="A" size={32} />
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
              Rank {f.rank} · {archetype ? 'Choose an archetype' : 'Choose a path'}
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
        {!archetype && <p class="fs-style-desc">{styleDesc(s.content, f.piece, f.style)}</p>}
        <div class={`fs-opts ${archetype ? 'archetypes' : ''}`}>
          {f.options.map((o) => {
            const tag = lean(defs.find((d) => d.id === o.id));
            return (
              <button
                key={o.id}
                class="fs-opt"
                data-testid={`fork-opt-${f.heroId}-${o.id}`}
                onClick={() => s.chooseFork(f.heroId, o.id)}
              >
                {archetype && <StyleBadge style={o.id} team="A" size={30} class="fs-emblem" />}
                <span class="fs-opt-text">
                  <span class="fs-opt-top">
                    <b>{o.name}</b>
                    {tag && <i class={`fs-tag ${tag}`}>{PATH_LABEL[tag]}-leaning</i>}
                  </span>
                  <span class="fs-opt-desc">{o.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button class="btn fs-auto" data-testid="fork-auto" onClick={() => s.autoForks()}>
          Let the AI choose{more > 0 ? ` for all ${props.forks.length}` : ''}
        </button>
      </section>
    </>
  );
}
