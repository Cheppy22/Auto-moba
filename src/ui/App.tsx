import { useEffect } from 'preact/hooks';
import { Adjourn } from './Adjourn';
import { Hud } from './Hud';
import { Report } from './Report';
import { Setup } from './Setup';
import { Stage } from './Stage';
import { Title } from './Title';
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
  if (!m) return <Title />;
  const kind = m.state.phase.kind;
  return (
    <div class="shell" data-phase={kind} data-testid="shell">
      <Stage />
      {kind === 'setup' && <Setup />}
      {kind === 'live' && <Hud />}
      {kind === 'live' && s.ui.adjourned && <Adjourn />}
      {kind === 'end' && <Report />}
    </div>
  );
}
