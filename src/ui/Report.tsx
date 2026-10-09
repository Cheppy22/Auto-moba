import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { clamp } from './charts/scale';
import { CombatPage } from './report/pages/CombatPage';
import { EconomyPage } from './report/pages/EconomyPage';
import { LogPage } from './report/pages/LogPage';
import { ObjectivesPage } from './report/pages/ObjectivesPage';
import { PieceChips, PieceDetail } from './report/pages/PiecesPage';
import { ResultPage } from './report/pages/ResultPage';
import { ReplayPanel } from './report/ReplayPanel';
import { useReportData, type ReportData } from './report/data';
import { reducedMotion } from './report/parts';
import { useSession } from './session';

export const REPORT_PAGES = [
  { id: 'result', label: 'Result' },
  { id: 'economy', label: 'Economy' },
  { id: 'combat', label: 'Combat' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'replay', label: 'Replay' },
  { id: 'log', label: 'Log' },
] as const;

type PageId = (typeof REPORT_PAGES)[number]['id'];
const PIECES = REPORT_PAGES.findIndex((p) => p.id === 'pieces');
const REPLAY = REPORT_PAGES.findIndex((p) => p.id === 'replay');
const LAST = REPORT_PAGES.length - 1;

function Wait() {
  return <div class="rp-wait dim small">Drawing the charts…</div>;
}

/**
 * The end screen: a swipeable report. The first page is the result splash; the other pages are
 * full-width and scroll-snapped, with a tab bar on top that follows the page and jumps on tap.
 */
export function Report() {
  const s = useSession();
  const data = useReportData();
  const [page, setPage] = useState(0);
  // pages are drawn when they are the current page or next to it, and kept afterwards
  const [seen, setSeen] = useState<Set<number>>(new Set([0, 1]));
  const pager = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const target = useRef<number | null>(null);
  const raf = useRef(0);
  const pageRef = useRef(0);
  pageRef.current = page;

  const first = data.sum.rows.find((r) => r.team === 'A')?.id ?? data.sum.rows[0]?.id ?? 0;
  const picked = data.rowOf(s.ui.reportHero ?? -1) ? (s.ui.reportHero as number) : first;
  const pick = (id: number): void => s.setUi({ reportHero: id });

  const goTo = useCallback((i: number, instant = false): void => {
    const el = pager.current;
    const n = clamp(i, 0, LAST);
    setPage(n);
    if (!el) return;
    target.current = n;
    window.setTimeout(() => {
      if (target.current === n) target.current = null;
    }, 900);
    el.scrollTo({
      left: n * el.clientWidth,
      behavior: instant || reducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  const onScroll = (): void => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = pager.current;
      if (!el || !el.clientWidth) return;
      const i = clamp(Math.round(el.scrollLeft / el.clientWidth), 0, LAST);
      if (target.current !== null) {
        if (i !== target.current) return;
        target.current = null;
      }
      if (i !== pageRef.current) setPage(i);
    });
  };

  useEffect(
    () =>
      setSeen((old) => {
        const next = new Set(old);
        for (const i of [page - 1, page, page + 1]) if (i >= 0 && i <= LAST) next.add(i);
        return next.size === old.size ? old : next;
      }),
    [page],
  );

  // the tab bar scrolls itself so the current tab is in view
  useEffect(() => {
    const bar = tabs.current;
    const tab = bar?.children[page] as HTMLElement | undefined;
    if (!bar || !tab) return;
    const left = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [page]);

  // keyboard arrows turn the page (not while a slider or text box has the keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'))
        return;
      e.preventDefault();
      goTo(pageRef.current + (e.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  // a resize or rotation keeps the same page in view
  useEffect(() => {
    const on = (): void => {
      const el = pager.current;
      if (el) el.scrollTo({ left: pageRef.current * el.clientWidth, behavior: 'auto' });
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const body = (id: PageId, d: ReportData, active: boolean) => {
    switch (id) {
      case 'result':
        return (
          <ResultPage
            data={d}
            swipeHint
            onOpenPiece={(pid) => {
              pick(pid);
              goTo(PIECES);
            }}
          />
        );
      case 'economy':
        return <EconomyPage data={d} />;
      case 'combat':
        return <CombatPage data={d} />;
      case 'objectives':
        return <ObjectivesPage data={d} />;
      case 'pieces':
        return (
          <div class="rp-page-body" data-testid="page-pieces-body">
            <PieceChips data={d} value={picked} onPick={pick} testid="piece-chip" />
            <PieceDetail data={d} id={picked} onReplay={() => goTo(REPLAY)} />
          </div>
        );
      case 'replay':
        return (
          <div class="rp-page-body" data-testid="page-replay-body">
            <PieceChips data={d} value={picked} onPick={pick} testid="replay-chip" />
            <ReplayPanel data={d} id={picked} active={active} />
          </div>
        );
      case 'log':
        return <LogPage data={d} />;
    }
  };

  return (
    <div class="overlay rp-overlay" data-testid="report" data-page={REPORT_PAGES[page].id}>
      <div class="panel rp-shell">
        <div class="rp-tabbar">
          <div class="rp-tabs" role="tablist" aria-label="Report pages" ref={tabs}>
            {REPORT_PAGES.map((p, i) => (
              <button
                key={p.id}
                role="tab"
                id={`rp-tab-${p.id}`}
                aria-selected={page === i}
                aria-controls={`rp-page-${p.id}`}
                class={`rp-tab ${page === i ? 'on' : ''}`}
                data-testid={`report-tab-${p.id}`}
                onClick={() => goTo(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {data.mock && <span class="rp-mock tiny">Sample data</span>}
        </div>
        <div class="rp-pagerwrap">
          <div class="rp-pager" ref={pager} onScroll={onScroll} data-testid="report-pager">
            {REPORT_PAGES.map((p, i) => (
              <section
                key={p.id}
                class="rp-page"
                id={`rp-page-${p.id}`}
                role="tabpanel"
                aria-labelledby={`rp-tab-${p.id}`}
                aria-hidden={page !== i}
                data-testid={`report-page-${p.id}`}
              >
                <div class="rp-page-scroll">
                  {seen.has(i) ? body(p.id, data, page === i) : <Wait />}
                </div>
              </section>
            ))}
          </div>
          <button
            class="rp-arrow prev"
            aria-label="Previous page"
            data-testid="report-prev"
            disabled={page === 0}
            onClick={() => goTo(page - 1)}
          >
            ‹
          </button>
          <button
            class="rp-arrow next"
            aria-label="Next page"
            data-testid="report-next"
            disabled={page === LAST}
            onClick={() => goTo(page + 1)}
          >
            ›
          </button>
        </div>
        <div class="rp-dots" aria-hidden="false">
          {REPORT_PAGES.map((p, i) => (
            <button
              key={p.id}
              class={`rp-dot ${page === i ? 'on' : ''}`}
              aria-label={`Go to ${p.label}`}
              data-testid={`report-dot-${p.id}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
