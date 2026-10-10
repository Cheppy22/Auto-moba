import { useState } from 'preact/hooks';
import type { Path, PieceId, SetupEntry } from '../sim';
import { LaneBoard } from './LaneBoard';
import { PATHS, PATH_HINT, PATH_LABEL, PIECE_ORDER, PieceGlyph, LANE_LABEL } from './pieces';
import { SchoolChip } from './schools';
import { useSession } from './session';

/** The setup board: an Opening, a build path for each of White's five pieces, then the lanes. */
export function Setup() {
  const s = useSession();
  const m = s.match!;
  const [entries, setEntries] = useState<SetupEntry[]>(() => {
    const d = m.defaultSetup();
    return PIECE_ORDER.map((p) => d.pieces.find((e) => e.piece === p)!);
  });
  const [selected, setSelected] = useState<PieceId | null>(null);
  const openings = s.content.openings;
  const [opening, setOpening] = useState<string>(
    () => (openings.find((o) => o.id === 'italian') ?? openings[0])?.id ?? 'italian',
  );
  const names: Record<string, string> = {};
  for (const p of s.content.pieces) names[p.id] = p.name;
  const patch = (piece: PieceId, change: Partial<SetupEntry>): void =>
    setEntries(entries.map((e) => (e.piece === piece ? { ...e, ...change } : e)));
  const begin = (): void => {
    s.issue({
      type: 'setupTeam',
      opening,
      pieces: entries.map(({ piece, path, lane }) => ({ piece, path, lane })),
    });
  };
  return (
    <div class="overlay setup" data-testid="setup">
      <div class="setup-main">
        <header class="setup-head">
          <div class="setup-title">
            <h2>Set the board</h2>
            <p class="dim small">
              Pick an Opening and each piece’s build path, then tap a piece and a lane. Black’s
              court is chosen in secret.
            </p>
          </div>
          <LaneBoard
            pieces={entries}
            names={names}
            selected={selected}
            onSelect={setSelected}
            onChange={(next) => setEntries(next as SetupEntry[])}
          />
          <div class="openings" role="radiogroup" aria-label="Opening" data-testid="openings">
            {openings.map((o) => (
              <button
                key={o.id}
                class={`opening ${opening === o.id ? 'on' : ''}`}
                role="radio"
                aria-checked={opening === o.id}
                data-testid={`opening-${o.id}`}
                onClick={() => setOpening(o.id)}
              >
                <b class="opening-name">{o.name}</b>
                <span class="opening-desc tiny dim">{o.desc}</span>
                <span class="opening-schools">
                  {o.schools.length === 0 ? (
                    <span class="school-chip balanced">Balanced</span>
                  ) : (
                    o.schools.map((sc) => <SchoolChip key={sc} school={sc} />)
                  )}
                </span>
              </button>
            ))}
          </div>
        </header>
        <div class="setup-cards" data-testid="setup-cards">
          {entries.map((e) => {
            const def = s.content.pieceById.get(e.piece)!;
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
                <p class="style-desc tiny dim" data-testid={`style-desc-${e.piece}`}>
                  Chooses its archetype at Rank 4
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
