import type { Role } from '../sim';
import { HeroDetail } from './HeroCodex';
import { SigilIcon } from './SigilIcon';
import { dispositionLabel, roleLabel } from './format';
import { useSession } from './session';

const LANES: { id: Role; label: string; hint: string; x: number; y: number }[] = [
  { id: 'top', label: 'Left lane', hint: 'Two heroes share this lane', x: 15, y: 52 },
  {
    id: 'mid',
    label: 'Mid lane',
    hint: 'One hero: short lane, fast fights, free to roam',
    x: 50,
    y: 62,
  },
  { id: 'bot', label: 'Right lane', hint: 'Two heroes share this lane', x: 85, y: 52 },
];

function LaneMap(props: { value: Role | null; onPick: (r: Role) => void }) {
  return (
    <div class="lane-map" role="group" aria-label="Choose your lane">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="lm-ground" cx="50%" cy="50%" r="60%">
            <stop offset="0" stop-color="#241d33" />
            <stop offset="1" stop-color="#100e17" />
          </radialGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="94"
          fill="url(#lm-ground)"
          stroke="#6b5532"
          stroke-width="1.2"
        />
        <circle cx="100" cy="100" r="88" fill="none" stroke="#6b5532" stroke-opacity=".35" />
        <ellipse cx="66" cy="100" rx="16" ry="23" class="lm-jungle" />
        <ellipse cx="134" cy="100" rx="16" ry="23" class="lm-jungle" />
        <path d="M100 182 Q 8 100 100 18" class={`lm-lane ${props.value === 'top' ? 'on' : ''}`} />
        <path
          d="M100 182 Q 192 100 100 18"
          class={`lm-lane ${props.value === 'bot' ? 'on' : ''}`}
        />
        <path d="M100 182 L100 18" class={`lm-lane mid ${props.value === 'mid' ? 'on' : ''}`} />
        <circle cx="100" cy="182" r="8" class="lm-base a" />
        <circle cx="100" cy="18" r="8" class="lm-base b" />
      </svg>
      {LANES.map((l) => (
        <button
          key={l.id}
          class={`lane-pin ${props.value === l.id ? 'on' : ''}`}
          style={{ left: `${l.x}%`, top: `${l.y}%` }}
          title={l.hint}
          data-testid={`lane-${l.id}`}
          aria-pressed={props.value === l.id}
          onClick={() => props.onPick(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function Draft() {
  const s = useSession();
  const m = s.match!;
  const d = m.state.draft!;
  const taken = new Set([...d.aiHeroes.A, ...d.aiHeroes.B]);
  const heroes = s.content.heroes.filter((h) => !d.unique || !taken.has(h.id));
  const sel = d.playerHero ? s.content.heroById.get(d.playerHero) : undefined;
  const ready = !!d.playerHero && !!d.playerRole;
  const slot = (id: string, team: 'A' | 'B', key: number) => {
    const h = s.content.heroById.get(id)!;
    return (
      <div class="slotcard" key={key}>
        <SigilIcon spec={h.sigil} team={team} size={38} />
        <div>
          <div class="slot-name">{h.name.split(',')[0]}</div>
          <div class="dim tiny">{dispositionLabel(h.disposition)}</div>
        </div>
      </div>
    );
  };
  return (
    <div class="overlay" data-testid="draft">
      <div class="panel draft">
        <header class="draft-head">
          <h2>Draft</h2>
          <span class="dim small">Each hero can only be in one team per match.</span>
        </header>
        <aside class="draft-team">
          <h3 class="teamA">Your team</h3>
          {d.aiHeroes.A.map((id, i) => slot(id, 'A', i))}
          <div class={`slotcard you ${sel ? 'filled' : ''}`}>
            {sel ? <SigilIcon spec={sel.sigil} team="A" size={38} /> : <span class="slot-empty" />}
            <div>
              <div class="slot-name">{sel ? sel.name.split(',')[0] : 'You'}</div>
              <div class="dim tiny">
                {d.playerRole ? roleLabel(d.playerRole) : 'pick a hero and a lane'}
              </div>
            </div>
          </div>
        </aside>
        <main class="draft-main">
          <div class="hero-row" role="group" aria-label="Heroes you can pick">
            {heroes.map((h) => (
              <button
                key={h.id}
                aria-pressed={d.playerHero === h.id}
                class={`hero-pick ${d.playerHero === h.id ? 'sel' : ''}`}
                data-testid={`hero-${h.id}`}
                onClick={() => s.issue({ type: 'pickHero', heroId: h.id })}
              >
                <SigilIcon spec={h.sigil} team="A" size={58} />
                <span class="pick-name">{h.name.split(',')[0]}</span>
                <span class="dim tiny">
                  {h.attackKind} · {dispositionLabel(h.disposition)}
                </span>
              </button>
            ))}
          </div>
          <div class="draft-detail">
            {sel ? (
              <HeroDetail hero={sel} compact />
            ) : (
              <div class="dim detail-empty">Pick a hero to read what they do.</div>
            )}
          </div>
        </main>
        <aside class="draft-side">
          <LaneMap value={d.playerRole} onPick={(role) => s.issue({ type: 'pickLane', role })} />
          <h3 class="teamB">Enemy team</h3>
          <div class="enemy-row">
            {d.aiHeroes.B.map((id, i) => {
              const h = s.content.heroById.get(id)!;
              return (
                <div class="enemy-chip" key={i} title={h.name}>
                  <SigilIcon spec={h.sigil} team="B" size={34} />
                </div>
              );
            })}
          </div>
        </aside>
        <footer class="draft-foot">
          <div class="grow dim small">{s.ui.toast ?? ''}</div>
          <button
            class="btn primary"
            disabled={!ready}
            data-testid="begin"
            onClick={() => s.issue({ type: 'startMatch' })}
          >
            Enter the dimension
          </button>
        </footer>
      </div>
    </div>
  );
}
