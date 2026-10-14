import { useEffect } from 'preact/hooks';
import { Adjourn } from './Adjourn';
import { GlossaryPopover } from './glossary';
import { Hud } from './Hud';
import { Intro } from './hud/Intro';
import { Report } from './Report';
import { Setup } from './Setup';
import { Stage } from './Stage';
import { Title } from './Title';
import { RunScreen } from './run/RunScreen';
import { useLayout } from './layout';
import { useSession } from './session';

export function App() {
  const s = useSession();
  const layout = useLayout();
  document.documentElement.dataset.layout = layout;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') s.closeTopOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);
  const m = s.match;
  if (!m)
    return (
      <>
        {s.run ? <RunScreen /> : <Title />}
        <GlossaryPopover />
      </>
    );
  const kind = m.state.phase.kind;
  const bell = kind === 'live' ? m.state.bell.stage : 'none';
  const snap = bell === 'none' ? null : m.snapshot().act;
  const pend = s.content.tuning.bell.pendingSaturation;
  const sat =
    bell === 'break' ? 0 : bell === 'halt' ? pend * (1 - (snap?.haltProgress ?? 0)) : pend;
  return (
    <div
      class="shell"
      data-phase={kind}
      data-bell={bell}
      data-testid="shell"
      data-intro={kind === 'live' && s.ui.intro && s.ui.intro.phase !== 'out' ? 'true' : undefined}
      style={bell === 'none' ? undefined : { '--bell-sat': sat }}
    >
      <Stage />
      {kind === 'setup' && <Setup />}
      {kind === 'live' && <Hud />}
      {kind === 'live' && <Intro />}
      {kind === 'live' && s.ui.adjourned && <Adjourn />}
      {kind === 'end' && <Report />}
      <GlossaryPopover />
    </div>
  );
}
