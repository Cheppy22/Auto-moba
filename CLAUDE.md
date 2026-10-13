# Project instructions

Auto-MOBA: a single-player auto-battler MOBA (TypeScript, Vite, Preact, Canvas). Work on branch `test-product-2` (the chess variant; spec `docs/CHESS.md` overrides the source of truth here). `test-product` is the main game.

**Read first:** `docs/SOURCE_OF_TRUTH.md`. It describes the game as it is now, the owner's working agreement (answer style, approval rules, git rules) and the list of decisions that were reversed. `docs/ARCHITECTURE.md` covers the code layout.

## Documentation rules (always follow)

1. If a change alters how the game works, edit the matching section of `docs/SOURCE_OF_TRUTH.md`. Overwrite old text; don't append history there.
2. Every change gets one entry at the top of `docs/CHANGELOG.md`: date, what changed, why, and any measured effect.
3. If you reverse an earlier decision, add a row to "Reversed decisions" in the source of truth.
4. Don't create new top-level docs. Dated specs and reports go in `docs/` and are linked from the source of truth. Old docs go in `docs/archive/`.

## Before you finish

Run `npm run check`, and `npx playwright test` for interface changes. Commit and push to `test-product-2` (never open a PR unless asked).

## Test budget (approved 2026-10-13)

Test enough to decide, then stop. Every agent brief states a deadline and these limits.

1. **Balance changes:** tune with 200-match probes (direction only: ±7 points of noise). Confirm once with `npm run balance -- --matches 800 --seed 29000 --quiet --workers 2`. Run a second 800 on seed 31000 only if the first lands outside 48–52% White or the change touches map or rules.
2. **Player-facing check:** every balance task also runs one 200-match `--white-player` probe (with `--white-every 60` when cards matter). AI-vs-AI alone misses player-side problems.
3. **Skip balance runs** only when the change cannot affect AI-vs-AI games by design (player-only code, render, UI) and `npm run baseline` is identical.
4. **Deadline:** report within the brief's time box with what you have; commit work first; ask before any run beyond the budget.
5. **Browser suite:** full `npx playwright test` once per merge, by the agent at the end. Don't re-run it when the merged tree is identical to the tested one.
6. **Parallel agents are fine.** A sim test that times out under load gets one solo rerun before it counts as a failure.
7. **Estimates:** pad time estimates by 1.5×; an 800-match run takes about 55 min with 2 workers (use 3 workers when only one agent is running).
