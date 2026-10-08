import { useEffect } from 'preact/hooks';
import { Draft } from './Draft';
import { Hud } from './Hud';
import { Prep } from './Prep';
import { Report } from './Report';
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
    <div
      class="shell"
      data-phase={kind}
      data-sheet={kind === 'live' && s.ui.shopOpen ? 'open' : undefined}
      data-testid="shell"
    >
      <Stage />
      {kind === 'draft' && <Draft />}
      {kind === 'prep' && <Prep />}
      {kind === 'live' && <Hud />}
      {kind === 'report' && <Report scope="phase" />}
      {kind === 'end' && <Report scope="match" />}
    </div>
  );
}
