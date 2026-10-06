import { useState } from 'preact/hooks';
import type { HeroDef } from '../sim';
import { SigilIcon } from './SigilIcon';
import { roleLabel } from './format';
import { useSession } from './session';

const STAT_ROWS: { key: keyof HeroDef['stats']; label: string; hint: string }[] = [
  { key: 'maxHp', label: 'Health', hint: 'How much damage they can take' },
  { key: 'bladeDmg', label: 'Blade damage', hint: 'Strength of basic attacks' },
  { key: 'soulPower', label: 'Soul power', hint: 'Strength of spells' },
  { key: 'moveSpeed', label: 'Speed', hint: 'How fast they move' },
  { key: 'range', label: 'Reach', hint: 'How far they can attack from' },
];

export function HeroDetail({ hero, compact = false }: { hero: HeroDef; compact?: boolean }) {
  const s = useSession();
  const heroes = s.content.heroes;
  const max = (k: keyof HeroDef['stats']): number => Math.max(...heroes.map((h) => h.stats[k]));
  const passives = hero.passives as { desc?: string; name?: string }[];
  return (
    <div class="col hero-detail" data-testid="hero-detail">
      <div class="row">
        <SigilIcon spec={hero.sigil} team="A" size={compact ? 44 : 56} />
        <div class="grow">
          <div class="detail-name">{hero.name}</div>
          <div class="dim small">
            {hero.title} · {hero.era} · {hero.attackKind}
          </div>
          <div class="dim tiny">Usually plays {roleLabel(hero.preferredRole)}</div>
        </div>
      </div>
      {hero.playstyle && <div data-testid="hero-playstyle">{hero.playstyle}</div>}
      <div class="stat-bars">
        {STAT_ROWS.map((r) => (
          <div class="stat-row" key={r.key} title={r.hint}>
            <span class="dim small">{r.label}</span>
            <div class="bar">
              <i
                style={{
                  width: `${Math.max(6, (hero.stats[r.key] / max(r.key)) * 100)}%`,
                  background: 'var(--spirit)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <h3>Abilities</h3>
      <div class="col" style={{ gap: '6px' }}>
        {hero.abilities.map((a, i) => (
          <div class="ability" key={a.id}>
            <span class="pip ready">{i + 1}</span>
            <div class="grow">
              <div>
                <b>{a.name}</b> <span class="dim tiny">every {a.cooldownSec}s</span>
              </div>
              <div class="dim small">{a.desc}</div>
            </div>
          </div>
        ))}
        {passives.map((p, i) => (
          <div class="ability" key={`p${i}`}>
            <span class="pip">P</span>
            <div class="grow">
              <div>
                <b>{p.name ?? 'Passive'}</b>
              </div>
              <div class="dim small">{p.desc ?? 'Always active.'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroCodex({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const heroes = s.content.heroes;
  const [id, setId] = useState(heroes[0].id);
  const hero = s.content.heroById.get(id)!;
  return (
    <div class="overlay" data-testid="codex">
      <div class="panel col codex" style={{ width: 'min(960px,100%)', maxHeight: '100%' }}>
        <div class="row">
          <h2 class="grow">Heroes</h2>
          <button class="btn" data-testid="codex-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div class="codex-body">
          <div class="codex-list">
            {heroes.map((h) => (
              <button
                key={h.id}
                class={`card clickable row ${id === h.id ? 'sel' : ''}`}
                data-testid={`codex-${h.id}`}
                onClick={() => setId(h.id)}
              >
                <SigilIcon spec={h.sigil} team="A" size={34} />
                <div style={{ textAlign: 'left' }}>
                  <div class="small">{h.name.split(',')[0]}</div>
                  <div class="dim tiny">{h.attackKind}</div>
                </div>
              </button>
            ))}
          </div>
          <div class="scroll codex-detail">
            <HeroDetail hero={hero} />
          </div>
        </div>
      </div>
    </div>
  );
}
