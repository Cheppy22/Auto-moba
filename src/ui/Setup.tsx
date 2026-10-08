import { useState } from 'preact/hooks';
import type { Path, PieceId, SetupEntry } from '../sim';
import { LaneBoard } from './LaneBoard';
import { PATHS, PATH_HINT, PATH_LABEL, PIECE_ORDER, PieceGlyph, LANE_LABEL } from './pieces';
import { useSession } from './session';

/** The setup board: a style and a build path for each of White's five pieces, then the lanes. */
export function Setup() {
  const s = useSession();
  const m = s.match!;
  const [entries, setEntries] = useState<SetupEntry[]>(() => {
    const d = m.defaultSetup();
    return PIECE_ORDER.map((p) => d.find((e) => e.piece === p)!);
  });
  const [selected, setSelected] = useState<PieceId | null>(null);
  const names: Record<string, string> = {};
  for (const p of s.content.pieces) names[p.id] = p.name;
  const patch = (piece: PieceId, change: Partial<SetupEntry>): void =>
    setEntries(entries.map((e) => (e.piece === piece ? { ...e, ...change } : e)));
  const begin = (): void => {
    s.issue({ type: 'setupTeam', pieces: entries });
  };
  return (
    <div class="overlay setup" data-testid="setup">
      <div class="setup-main">
        <header class="setup-head">
          <div class="setup-title">
            <h2>Set the board</h2>
            <p class="dim small">
              Choose each piece’s style and build path, then tap a piece and a lane. Black’s court
              is chosen in secret.
            </p>
          </div>
          <LaneBoard
            pieces={entries}
            names={names}
            selected={selected}
            onSelect={setSelected}
            onChange={(next) => setEntries(next as SetupEntry[])}
          />
        </header>
        <div class="setup-cards" data-testid="setup-cards">
          {entries.map((e) => {
            const def = s.content.pieceById.get(e.piece)!;
            const style = def.styles.find((x) => x.id === e.style) ?? def.styles[0];
            return (
              <section
                key={e.piece}
                class={`piece-card ${selected === e.piece ? 'sel' : ''}`}
                data-testid={`piece-${e.piece}`}
              >
                <button
                  class="piece-head"
                  aria-pressed={selected === e.piece}
                  onClick={() => setSelected(selected === e.piece ? null : e.piece)}
                  title="Select, then tap a lane above"
                >
                  <PieceGlyph piece={e.piece} team="A" size={34} />
                  <span class="piece-name">
                    <b>{def.name}</b>
                    <span class="dim tiny">
                      {def.title} · {def.attackKind}
                    </span>
                  </span>
                  <span class="chip gold piece-lane">{LANE_LABEL[e.lane]}</span>
                </button>
                <div class="seg styles" role="radiogroup" aria-label={`${def.name} style`}>
                  {def.styles.map((st) => (
                    <button
                      key={st.id}
                      class={`btn small ${e.style === st.id ? 'on' : ''}`}
                      role="radio"
                      aria-checked={e.style === st.id}
                      data-testid={`style-${e.piece}-${st.id}`}
                      onClick={() => patch(e.piece, { style: st.id })}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
                <p class="style-desc small dim" data-testid={`style-desc-${e.piece}`}>
                  {style.desc}
                </p>
                <div class="path-label tiny dim">
                  <b>Build path</b> <span>{PATH_HINT[e.path]}</span>
                </div>
                <div class="seg paths" role="radiogroup" aria-label={`${def.name} build path`}>
                  {PATHS.map((p: Path) => (
                    <button
                      key={p}
                      class={`btn small ${e.path === p ? 'on' : ''}`}
                      role="radio"
                      aria-checked={e.path === p}
                      title={PATH_HINT[p]}
                      data-testid={`path-${e.piece}-${p}`}
                      onClick={() => patch(e.piece, { path: p })}
                    >
                      {PATH_LABEL[p]}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <footer class="setup-foot">
          <button class="btn primary begin" data-testid="begin" onClick={begin}>
            Begin
          </button>
        </footer>
      </div>
    </div>
  );
}
