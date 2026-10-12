# Project instructions

Auto-MOBA: a single-player auto-battler MOBA (TypeScript, Vite, Preact, Canvas). Work on branch `test-product-2` (the chess variant; spec `docs/CHESS.md` overrides the source of truth here). `test-product` is the main game.

**Read first:** `docs/SOURCE_OF_TRUTH.md`. It describes the game as it is now, the owner's working agreement (answer style, approval rules, git rules) and the list of decisions that were reversed. `docs/ARCHITECTURE.md` covers the code layout.

## Documentation rules (always follow)

1. If a change alters how the game works, edit the matching section of `docs/SOURCE_OF_TRUTH.md`. Overwrite old text; don't append history there.
2. Every change gets one entry at the top of `docs/CHANGELOG.md`: date, what changed, why, and any measured effect.
3. If you reverse an earlier decision, add a row to "Reversed decisions" in the source of truth.
4. Don't create new top-level docs. Dated specs and reports go in `docs/` and are linked from the source of truth. Old docs go in `docs/archive/`.

## Coding discipline

From [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT). Where these conflict with the working agreement in `docs/SOURCE_OF_TRUTH.md`, the working agreement wins.

1. **Think before coding.** State assumptions. If a request reads two ways, say so instead of picking silently. If a simpler approach exists, say so.
2. **Simplicity first.** Minimum code that solves the problem: no unrequested features, no abstractions for single-use code, no error handling for impossible cases. If 200 lines could be 50, rewrite it.
3. **Surgical changes.** Touch only what the task needs. Don't reformat or refactor neighbouring code; match the existing style. Mention unrelated dead code, don't delete it. Remove only what your own change made unused.
4. **Goal-driven.** Turn the task into a check you can run (a failing test, a sim seed, a screenshot), then loop until it passes. For multi-step work, give a short plan with a check per step.

## Skills in this repo

`.claude/skills/` (third-party, MIT; licences inside each folder): `diagnosing-bugs` (hard bugs: build a red-capable repro first), `tdd`, `two-axis-review` (review a branch against standards and its spec in `docs/`), `prototype` (throwaway logic or UI variants), `diagram-design` (HTML/SVG diagrams for docs).

## Before you finish

Run `npm run check`, and `npx playwright test` for interface changes. Balance changes need `npm run balance -- --matches 800 --seed 29000 --quiet`. Commit and push to `test-product-2` (never open a PR unless asked).
