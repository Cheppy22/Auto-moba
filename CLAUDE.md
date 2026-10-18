# Project instructions

Auto-MOBA: a single-player auto-battler MOBA (TypeScript, Vite, Preact, Canvas). Work on branch `test-product`.

**Read first:** `docs/SOURCE_OF_TRUTH.md`. It describes the game as it is now, the owner's working agreement (answer style, approval rules, git rules) and the list of decisions that were reversed. `docs/ARCHITECTURE.md` covers the code layout.

## Documentation rules (always follow)

1. If a change alters how the game works, edit the matching section of `docs/SOURCE_OF_TRUTH.md`. Overwrite old text; don't append history there.
2. Every change gets one entry at the top of `docs/CHANGELOG.md`: date, what changed, why, and any measured effect.
3. If you reverse an earlier decision, add a row to "Reversed decisions" in the source of truth.
4. Don't create new top-level docs. Dated specs and reports go in `docs/` and are linked from the source of truth. Old docs go in `docs/archive/`.

## Before you finish

Run `npm run check`, and `npx playwright test` for interface changes. Balance changes need `npm run balance -- --matches 800 --seed 29000 --quiet`. Commit and push to `test-product` (never open a PR unless asked).
