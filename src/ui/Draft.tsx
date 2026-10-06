import { roleLabel } from './format';
import type { Role } from '../sim';
import { HeroDetail } from './HeroCodex';
import { SigilIcon } from './SigilIcon';
import { useSession } from './session';

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'top', label: 'Left lane', hint: 'One hero holds each side lane' },
  { id: 'mid', label: 'Mid lane', hint: 'Short lane, fast fights' },
  { id: 'bot', label: 'Right lane', hint: 'Two heroes share this lane' },
  { id: 'jungle', label: 'Jungle', hint: 'Clears camps, joins fights' },
];

export function Draft() {
  const s = useSession();
  const m = s.match!;
  const d = m.state.draft!;
  const heroes = s.content.heroes;
  const sel = d.playerHero ? s.content.heroById.get(d.playerHero) : undefined;
  const ready = !!d.playerHero && !!d.playerRole;
  return (
    <div class="overlay" data-testid="draft">
      <div class="panel col" style={{ width: 'min(1100px, 100%)' }}>
        <h2>Draft</h2>
        <div class="row wrap draft-cols" style={{ alignItems: 'flex-start' }}>
          <div class="col grow" style={{ minWidth: '220px' }}>
            <h3 class="teamA">Your team</h3>
            {d.aiHeroes.A.map((id, i) => {
              const h = s.content.heroById.get(id)!;
              return (
                <div class="card row" key={i}>
                  <SigilIcon spec={h.sigil} team="A" />
                  <div>
                    <div>{h.name}</div>
                    <div class="dim tiny">
                      {h.era} · usually {roleLabel(h.preferredRole)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div class={`card row ${sel ? 'sel' : ''}`}>
              {sel ? <SigilIcon spec={sel.sigil} team="A" /> : <div style={{ width: '36px' }} />}
              <div>
                <div>{sel ? `You: ${sel.name}` : 'You: choose a hero'}</div>
                <div class="dim tiny">
                  {d.playerRole ? `Lane: ${roleLabel(d.playerRole)}` : 'Choose a lane'}
                </div>
              </div>
            </div>
          </div>
          <div class="col" style={{ flex: '2', minWidth: '320px' }}>
            <h3>Choose your hero</h3>
            <div class="hero-grid">
              {heroes.map((h) => (
                <div
                  key={h.id}
                  class={`card clickable col ${d.playerHero === h.id ? 'sel' : ''}`}
                  data-testid={`hero-${h.id}`}
                  onClick={() => s.issue({ type: 'pickHero', heroId: h.id })}
                >
                  <div class="row">
                    <SigilIcon spec={h.sigil} team="A" size={44} />
                    <div>
                      <div>{h.name}</div>
                      <div class="dim tiny">{h.era}</div>
                    </div>
                  </div>
                  <div class="dim tiny">{h.blurb}</div>
                  <div class="tiny">
                    {h.attackKind} · {h.defaultPosture} · {h.personality}
                  </div>
                </div>
              ))}
            </div>
            <div class="card">
              {sel ? (
                <HeroDetail hero={sel} compact />
              ) : (
                <div class="dim">Pick a hero to read what they do.</div>
              )}
            </div>
            <h3>Choose your lane</h3>
            <div class="row wrap">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  class={`btn ${d.playerRole === r.id ? 'on' : ''}`}
                  title={r.hint}
                  data-testid={`lane-${r.id}`}
                  onClick={() => s.issue({ type: 'pickLane', role: r.id })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div class="col grow" style={{ minWidth: '220px' }}>
            <h3 class="teamB">Enemy team</h3>
            {d.aiHeroes.B.map((id, i) => {
              const h = s.content.heroById.get(id)!;
              return (
                <div class="card row" key={i}>
                  <SigilIcon spec={h.sigil} team="B" />
                  <div>
                    <div>{h.name}</div>
                    <div class="dim tiny">
                      {h.era} · usually {roleLabel(h.preferredRole)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div class="row">
          <div class="grow dim small">{s.ui.toast ?? ''}</div>
          <button
            class="btn primary"
            disabled={!ready}
            data-testid="begin"
            onClick={() => s.issue({ type: 'startMatch' })}
          >
            Enter the dimension
          </button>
        </div>
      </div>
    </div>
  );
}
