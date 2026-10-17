# Project instructions

Auto-MOBA: a single-player auto-battler MOBA (TypeScript, Vite, Preact, Canvas). Work on branch `test-product-2` (the chess variant; spec `docs/CHESS.md` overrides the source of truth here). `test-product` is the main game.

**Read first:** `docs/SOURCE_OF_TRUTH.md`. It describes the game as it is now, the owner's working agreement (answer style, approval rules, git rules) and the list of decisions that were reversed. `docs/ARCHITECTURE.md` covers the code layout.

## Documentation rules (always follow)

1. If a change alters how the game works, edit the matching section of `docs/SOURCE_OF_TRUTH.md`. Overwrite old text; don't append history there.
2. Every change gets one entry at the top of `docs/CHANGELOG.md`: date, what changed, why, and any measured effect.
3. If you reverse an earlier decision, add a row to "Reversed decisions" in the source of truth.
4. Don't create new top-level docs. Dated specs and reports go in `docs/` and are linked from the source of truth. Old docs go in `docs/archive/`.

## Owner principle

Always choose the most stable, long-lasting solution: fix root causes, not symptoms; prefer changes that won't need redoing over quick patches that trade one problem for another.

## Before you finish

Run `npm run check`, and `npx playwright test` for interface changes. Commit and push to `test-product-2` (never open a PR unless asked).

## Test budget (approved 2026-10-13)

Test enough to decide, then stop. Every agent brief states a deadline and these limits.

1. **Balance changes:** tune with 200-match probes (direction only: ±7 points of noise). Confirm once with `npm run balance -- --matches 800 --seed 29000 --quiet --workers 2`. Run a second 800 on seed 31000 only if the first lands outside 48–52% White or the change touches map or rules.
2. **Player-facing check:** every balance task also runs one 200-match `--white-player` probe (with `--white-every 60` when cards matter). AI-vs-AI alone misses player-side problems.
3. **Skip balance runs** only when the change cannot affect AI-vs-AI games by design (player-only code, render, UI) and `npm run baseline` is identical.
4. **Deadline:** report within the brief's time box with what you have; commit work first; ask before any run beyond the budget.
5. **When to run what** (approved 2026-10-17):
   - Docs only: format check.
   - Numbers only (balance): `npm run check` + `npm run baseline` + the balance budget above; browser specs only if a test asserts those numbers.
   - Sim logic, no screens: quick unit tests while working; full `npm run check` + `npm run baseline` + `tests/e2e/smoke.spec.ts` before reporting.
   - Screens/render: quick unit tests + the touched browser specs while working; full `npm run check` + touched specs + smoke before reporting.
   - A merge whose tree is identical to what the agent tested: push, run nothing. A merge combining two pieces of work: `npm run check` + `npm run baseline` + specs for screens either side touched.
   - Full `npx playwright test`: once a day, or before announcing a milestone as live — not on every merge.
6. **Parallel agents are fine.** A sim test that times out under load gets one solo rerun before it counts as a failure.
7. **Estimates:** pad time estimates by 1.5×; an 800-match run takes about 30 min with 2 workers (use 3 workers when only one agent is running).
