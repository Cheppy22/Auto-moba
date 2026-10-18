import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { AllCards } from './AllCards';
import { BY_ID, GLOSSARY, GLOSSARY_GROUPS, findTerms } from './glossaryData';
import { useEscape } from './session';

// ---------------------------------------------------------------- one popover for the whole app

interface Open {
  id: string;
  anchor: HTMLElement;
  more: boolean;
}

let current: Open | null = null;
const subs = new Set<() => void>();
const emit = (): void => subs.forEach((f) => f());

function openTerm(id: string, anchor: HTMLElement): void {
  current = { id, anchor, more: false };
  emit();
}

function closeTerm(restoreFocus = false): void {
  const was = current;
  current = null;
  emit();
  if (restoreFocus) was?.anchor.focus({ preventScroll: true });
}

/**
 * A game word with a dotted brass underline. Tap, click, Enter or Space shows its one-sentence
 * definition in the popover; it never pauses anything. A span with a button role, so it can sit
 * inside a real button (a gambit card) without nesting buttons.
 */
export function Term(props: { id: string; children?: ComponentChildren; prose?: boolean }) {
  const entry = BY_ID.get(props.id);
  if (!entry) return <>{props.children}</>;
  const toggle = (el: HTMLElement): void => {
    if (current?.anchor === el) closeTerm();
    else openTerm(entry.id, el);
  };
  return (
    <span
      class={props.prose ? 'term prose' : 'term'}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      data-term={entry.id}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(e.currentTarget as HTMLElement);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        toggle(e.currentTarget as HTMLElement);
      }}
    >
      {props.children ?? entry.term}
    </span>
  );
}

/**
 * Plain text with its game words marked: only the first appearance of each word, at most `max`
 * words, and none from `skip` (words the same panel already marks elsewhere).
 */
export function Terms(props: { text: string; skip?: string[]; max?: number }) {
  const { text } = props;
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const f of findTerms(text, props.skip, props.max)) {
    out.push(text.slice(last, f.start));
    out.push(
      <Term key={`${f.id}:${f.start}`} id={f.id} prose>
        {text.slice(f.start, f.end)}
      </Term>,
    );
    last = f.end;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

interface Place {
  left: number;
  top: number;
  below: boolean;
  arrow: number;
}

const GAP = 8;

function place(anchor: HTMLElement, box: HTMLElement): Place {
  const r = anchor.getClientRects()[0] ?? anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const mid = r.left + r.width / 2;
  const left = Math.max(GAP, Math.min(mid - w / 2, vw - w - GAP));
  let top = r.top - h - GAP;
  let below = false;
  if (top < GAP) {
    below = true;
    top = Math.min(r.bottom + GAP, Math.max(GAP, vh - h - GAP));
  }
  return { left, top, below, arrow: Math.max(12, Math.min(mid - left, w - 12)) };
}

/** The single definition popover; mounted once, at the app root. */
export function GlossaryPopover() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = (): void => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  const cur = current;
  const entry = cur ? BY_ID.get(cur.id) : undefined;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Place | null>(null);
  useEscape(cur !== null, () => closeTerm(true));

  // put it next to the word, and give the screen reader its description
  useLayoutEffect(() => {
    if (!cur || !box.current) {
      setPos(null);
      return;
    }
    setPos(place(cur.anchor, box.current));
    box.current.focus({ preventScroll: true });
    cur.anchor.setAttribute('aria-describedby', 'gloss-pop');
    return () => cur.anchor.removeAttribute('aria-describedby');
  }, [cur?.anchor, cur?.id]);
  useLayoutEffect(() => {
    if (cur && box.current) setPos(place(cur.anchor, box.current));
  }, [cur?.more]);

  // tap outside closes; follow the word while the page moves; drop it if the word is gone
  useEffect(() => {
    if (!cur) return;
    const { anchor } = cur;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (t && (box.current?.contains(t) || t.closest('.term'))) return;
      closeTerm();
    };
    const follow = (): void => {
      if (!anchor.isConnected) closeTerm();
      else if (box.current) setPos(place(anchor, box.current));
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    const timer = window.setInterval(follow, 250);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      window.clearInterval(timer);
    };
  }, [cur?.anchor]);

  if (!cur || !entry) return null;
  const see = (entry.see ?? []).flatMap((id) => BY_ID.get(id) ?? []).slice(0, 3);
  return (
    <div
      ref={box}
      id="gloss-pop"
      class={`gloss-pop ${pos?.below ? 'below' : ''}`}
      role="dialog"
      aria-label={`${entry.term}, definition`}
      tabIndex={-1}
      data-testid="gloss-pop"
      data-term={entry.id}
      style={{
        left: `${pos?.left ?? 0}px`,
        top: `${pos?.top ?? 0}px`,
        opacity: pos ? undefined : 0,
        '--arrow': `${pos?.arrow ?? 20}px`,
      }}
    >
      <b class="gloss-term">{entry.term}</b>
      <p class="gloss-short" data-testid="gloss-short">
        {entry.short}
      </p>
      {entry.more &&
        (cur.more ? (
          <p class="gloss-more" data-testid="gloss-more">
            {entry.more}
          </p>
        ) : (
          <button
            type="button"
            class="gloss-morebtn"
            data-testid="gloss-more-btn"
            onClick={() => {
              current = { ...cur, more: true };
              emit();
            }}
          >
            More
          </button>
        ))}
      {see.length > 0 && (
        <div class="gloss-see">
          <span>See also</span>
          {see.map((e) => (
            <button
              type="button"
              key={e.id}
              class="gloss-chip"
              onClick={() => {
                current = { id: e.id, anchor: cur.anchor, more: false };
                emit();
              }}
            >
              {e.term}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Rules words, grouped, each with its full definition. */
function WordsList() {
  return (
    <div class="rules-list" data-testid="rules-list">
      {GLOSSARY_GROUPS.map((group) => (
        <section key={group} class="rules-group">
          <h3 class="rules-h">{group}</h3>
          <dl>
            {GLOSSARY.filter((e) => e.group === group).map((e) => (
              <div key={e.id} class="rules-row" data-testid={`rule-${e.id}`}>
                <dt>{e.term}</dt>
                <dd>
                  {e.short}
                  {e.more && <span class="dim"> {e.more}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Words or All cards: the Rules page (Title) and the Rules tab (Adjourn) hold both. */
export function RulesList() {
  const [view, setView] = useState<'words' | 'cards'>('words');
  return (
    <div class="rules-all">
      <div class="rules-switch" role="tablist" aria-label="Rules">
        {(
          [
            ['words', 'Words'],
            ['cards', 'All cards'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            class={`btn ${view === id ? 'on' : ''}`}
            aria-selected={view === id}
            data-testid={`rules-view-${id}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'words' ? <WordsList /> : <AllCards />}
    </div>
  );
}

/** The Rules page opened from the Title. */
export function RulesPage(props: { onClose: () => void }) {
  useEscape(true, props.onClose);
  return (
    <div class="overlay rules-page" role="dialog" aria-label="Rules" data-testid="rules-page">
      <div class="panel col rules-panel">
        <div class="row">
          <h2 class="grow">Rules</h2>
          <button class="btn primary" data-testid="rules-close" onClick={props.onClose}>
            Close
          </button>
        </div>
        <p class="dim small">
          Every game word in one place. In the game, a word with a dotted underline opens its
          definition when you tap it.
        </p>
        <div class="rules-scroll scroll">
          <RulesList />
        </div>
      </div>
    </div>
  );
}
