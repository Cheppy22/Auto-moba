import { useState } from 'preact/hooks';
import { courtName } from '../analysis/text';
import { Lanes, whitePieces } from './Orders';
import { RulesList, Term } from './glossary';
import { PieceGlyph, pieceLabel } from './pieces';
import { n0 } from './format';
import { SchoolChip } from './schools';
import { SlotRows } from './builds/SlotRows';
import { ReplayTutorial } from './ReplayTutorial';
import { SoundControls } from './SoundToggle';
import { ThemePicker } from './ThemePicker';
import { useEscape, useSession } from './session';

/** Black's Opening stays hidden for the first minute of play (20 ticks a second). */
const REVEAL_TICKS = 60 * 20;

type Tab = 'lanes' | 'builds' | 'rules';

const TABS: { id: Tab; label: string }[] = [
  { id: 'lanes', label: 'Lanes' },
  { id: 'builds', label: 'Builds' },
  { id: 'rules', label: 'Rules' },
];

/** Read only: each White piece's slots, with what each Technique has done so far this match. */
function Builds() {
  const s = useSession();
  const m = s.match!;
  return (
    <div class="col" data-testid="tab-builds">
      <p class="dim small">
        <Term id="technique">Techniques</Term> each piece holds, one per <Term id="slot">Slot</Term>
        , and what each has done this match so far. They change at an Act break, where gold can{' '}
        <Term id="upgrade">Upgrade</Term> one.
      </p>
      {whitePieces(s).map((u) => {
        const h = u.hero!;
        const v = m.buildView(u.id);
        return (
          <section class="card builds-piece" key={u.id} data-testid={`adjourn-builds-${h.defId}`}>
            <div class="row">
              <PieceGlyph piece={h.defId} team="A" size={28} />
              <b class="grow">{pieceLabel(s.content, h.defId)}</b>
              <span class="dim small">
                <Term id="rank">Rank</Term> {h.rank}
              </span>
              <span class="gold small">
                <i class="coin" aria-hidden="true" />
                {n0(h.gold)}
              </span>
            </div>
            {v && <SlotRows c={s.content} view={v} />}
          </section>
        );
      })}
    </div>
  );
}

function Mini() {
  const s = useSession();
  const m = s.match!;
  const snap = m.snapshot();
  return (
    <div class="mini" data-testid="mini-score">
      {(['A', 'B'] as const).map((t) => {
        const team = m.state.teams[t];
        const id = snap.opening?.[t] ?? null;
        const shown = id !== null && (t === 'A' || snap.tick >= REVEAL_TICKS);
        const opening = shown ? s.content.openings.find((o) => o.id === id) : undefined;
        return (
          <div class={`mini-team ${t === 'A' ? 'a' : 'b'}`} key={t}>
            <b>{courtName(t)}</b>
            <span class="pts-big">{snap.points[t]}</span>
            <span class="dim tiny">
              {team.kills} kills · {team.towersDown}{' '}
              {t === 'A' ? <Term id="bastion">Bastions</Term> : 'Bastions'} taken ·{' '}
              {t === 'A' ? <Term id="tempo">Tempo</Term> : 'Tempo'} {snap.tempo[t]} · Pawns{' '}
              {snap.pawns[t].alive}/{snap.pawns[t].cap}
              {snap.check[t] ? (
                <>
                  {' · In '}
                  <Term id="check">Check</Term>
                </>
              ) : (
                ''
              )}
              {snap.throneDown[t] ? (
                <>
                  {' · '}
                  <Term id="throne">Throne</Term>
                  {' down'}
                </>
              ) : (
                ''
              )}
            </span>
            <span class="mini-opening tiny" data-testid={`opening-${t}`}>
              <span class="dim">{t === 'A' ? <Term id="opening">Opening</Term> : 'Opening'}</span>{' '}
              <b>{opening ? opening.name : shown ? id : 'Not yet seen'}</b>
              {opening?.schools.map((sc) => (
                <SchoolChip key={sc} school={sc} glyph={11} />
              ))}
              {opening && opening.schools.length === 0 && (
                <span class="school-chip balanced">Balanced</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The paused panel: lanes, a read-only look at every piece's Techniques, and the rules. */
export function Adjourn() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>('lanes');
  const resume = (): void => s.resume();
  useEscape(true, resume);
  return (
    <div class="overlay adjourn" data-testid="adjourn-panel" role="dialog" aria-label="Adjourned">
      <div class="panel col adjourn-panel">
        <div class="row">
          <h2 class="grow">Adjourned</h2>
          <SoundControls />
          <button class="btn primary" data-testid="resume" onClick={resume}>
            Resume
          </button>
        </div>
        <ThemePicker />
        <ReplayTutorial />
        <Mini />
        <div class="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              class={`btn ${tab === t.id ? 'on' : ''}`}
              data-testid={`tab-${t.id}-btn`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="adjourn-body scroll">
          {tab === 'lanes' && <Lanes />}
          {tab === 'builds' && <Builds />}
          {tab === 'rules' && <RulesList />}
        </div>
      </div>
    </div>
  );
}
