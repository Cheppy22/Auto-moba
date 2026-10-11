# Code review and cleanup plan (2026-10-11)

Branch `test-product-2` at `5627502`. Plan only: no source code was changed. Reviewer: Opus.

## BLUF

1. **Health: decent.** Strict types are clean (0 `any`, 0 `@ts-ignore`, 0 lint disables), layer rules hold, the sim is deterministic (same hashes on two runs). The debt is in a handful of giant functions, not everywhere.
2. **Biggest problems:** six functions of 180–620 lines (report summary, AI brain, gambit logic, UI session); the same small helpers (lane names, team names, "which lane is this point") copied in 5–30 places; about 1,000 lines of dead code (old hero sigils, the switched-off auction, a dev mock that ships to players).
3. **The browser tests are broken:** 6 of 13 Playwright tests fail. They look **stale**, not like game bugs: the test helpers never press Resume at the Act break.
4. **Expected cut:** about 1,500–2,300 lines out of 41,900 (4–5%), sim about 10–20% faster, `npm run check` from 3.4 min to about 2 min.
5. **Do first:** Phase 0 (save the baseline script, fix the stale e2e helpers), then Phase 1 (delete dead code). Both are low risk and the determinism hashes must not change.

## 1. Baseline (the "must not change" contract)

Raw outputs are in the session scratchpad (`check.txt`, `playwright.txt`, `baseline-run1.jsonl`, `baseline-run2.jsonl`, `baseline.ts`, `profile-summary.txt`, `vitest-files.txt`, `bundle-breakdown.txt`). Phase 0 copies the script into `tools/` so every later phase can rerun it.

| Check                  | Result                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm run check`        | **Pass.** 27 test files, 245 tests. 3 min 26 s wall (unit tests alone 157 s)                |
| `npx playwright test`  | **7 pass, 6 fail**, 35.5 min (see table below)                                              |
| Determinism            | 10 matches run twice: **all hashes identical**                                              |
| Sim speed              | 0.21–0.29 ms per tick (about 3.5 s per 15-minute match), 38.9 s for the 10 baseline matches |
| `vite build`           | main `index.js` 559 KB (171 KB gzip), lazy `broadcast.js` 760 KB (207 KB gzip), CSS 87 KB   |
| Bundle contents        | broadcast: three.js 446 KB + our 3D code 142 KB. index: content JSON ~100 KB, **zod 91 KB** |
| Snapshot / report cost | `snapshot()` 0.09 ms (cheap). Report open: `buildReport` 71 ms + `buildSummary` 115 ms      |

**Determinism hashes.** AI vs AI, default White setup, `runToEnd(12)`. `log` = `hashContent({e: events, s: samples})`, `state` = `hashContent(m.state)`, `snap` = `hashContent(m.snapshot())`.

| Variant    | Seed  | Winner | Act | Final tick | Events | log            | state          | snap           |
| ---------- | ----- | ------ | --- | ---------- | ------ | -------------- | -------------- | -------------- |
| relics on  | 1     | A      | 2   | 9167       | 8767   | df73a333760b0  | dd9f76a3c34a0  | 15389e420f6cfb |
| relics on  | 2     | B      | 5   | 26266      | 30730  | 1ccfa3353b6d95 | 542b89cf4c9b4  | c0d5965d0d2f5  |
| relics on  | 3     | B      | 4   | 18761      | 40463  | 19bb7d742f5edd | 143b98b0217c53 | 1f37736e716c31 |
| relics on  | 11    | A      | 3   | 14202      | 18993  | 1fc4ddbe630307 | 77a292e9abe06  | 6b6a6924523ab  |
| relics on  | 29000 | B      | 3   | 15575      | 17499  | 1cced8a89eb89d | 1e589b17f8bd76 | 1448171a57e61e |
| relics off | 1     | B      | 4   | 18113      | 20703  | 1e2460e31bbf1e | 15ebbbd7f9d326 | a2276d33821b1  |
| relics off | 2     | A      | 3   | 15087      | 14834  | a2b8fec1a818e  | 9089b7cc18a20  | ffc83ca167e65  |
| relics off | 3     | B      | 3   | 15387      | 29333  | 1e37a2b9518dd7 | 7551bbeb3bca7  | 33fc481ed86b3  |
| relics off | 11    | A      | 4   | 19790      | 34081  | 4fcbed592cec1  | 1a84698bc595d5 | 32b86727b89a7  |
| relics off | 29000 | B      | 2   | 10877      | 11151  | 4f31387a9010d  | 1db5415d0a2fab | 19483bc482c6a4 |

**Playwright, per test** (chromium at /opt/pw-browsers, 1 worker):

| Spec                                    | Result | Why it failed                                                                                          | Verdict |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ------- |
| hud: long-press gambit card             | pass   |                                                                                                        |         |
| hud: roster lane tag flashes            | pass   |                                                                                                        |         |
| mobile portrait (`mobile.spec.ts:45`)   | fail   | 15-min timeout: the Act break sheet covers the speed chip (`:214`)                                     | stale   |
| mobile landscape                        | fail   | "reached fork while stepping the sim" (`:185`)                                                         | stale   |
| report portrait / landscape / desktop   | fail   | `playToEnd` (`helpers.ts:228`) steps but never sends `resumeAct`, so the match sits at the Act 1 break | stale   |
| smoke: full match (`smoke.spec.ts:141`) | fail   | gambit count 5, expected 2: Black's auto-gambits are counted too                                       | stale   |
| smoke: Act ends with the bell           | pass   |                                                                                                        |         |
| view: 4 tests                           | pass   |                                                                                                        |         |

All six broke after the Act break landed (commit `631521f`, which turned on `pauseForBreak`). No e2e file sends `resumeAct`. The game itself looks fine; the helpers need a "press Resume / let the AI pick the relic" step.

**Unit-test time:** `events.test.ts` 77 s (16 full matches, 7 of them exact repeats: seed 33 four times, seeds 1–4 twice), `phases` 36 s, `bell` 25 s, `relics` 25 s, `determinism` 23 s. Everything else is under 20 s.

**CPU profile** (3 headless matches, self/inclusive time): `stepUnits` 25% (minion behaviour 13%, `nearestEnemy` 5%), `tickUnitState` 15% (`cleanExpired` 4.5%), `resolveCollisions` 12%, `strategicUpdate` 12%, **garbage collector 7%**, grid `clear` 3.8%, terrain `confine` 4%, stats `recompute` 4%.

## 2. Survey

**Size.** `src` 40.6k lines (sim 12.8k, render 11.7k, ui 13.8k incl. 5.5k CSS, analysis 2.2k), tools 1.3k, tests 6.1k, content JSON 7.9k. Biggest files: `report.css` 1390, `hud.css` 1243, `broadcast/models.ts` 1124, `sim/types.ts` 1107, `figures.ts` 1088, `gambits.ts` 1073, `terrain.ts` 1070, `scene.ts` 1051, `analysis/summary.ts` 1003. There are 44 functions over 100 lines and 90 over 60.

**Worst offenders (simplify or rewrite):**

| #   | Where                                                                                             | Size                    | Why it hurts                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/analysis/summary.ts:385` `buildSummary`                                                      | 619 lines, 137 branches | One function does lookups, one event pass, rows, awards, MVP, series and checkmate. It calls `buildReport` itself, and `src/ui/report/data.ts:48-49` calls `buildReport` again (+71 ms) |
| 2   | `src/sim/ai/strategic.ts:219` `strategicUpdate`                                                   | 382 lines, 190 branches | The whole AI brain in one function, with numbers typed straight into the code (600, 220, 350, 0.78, 0.12) instead of read from `tuning.json`. No unit tests                             |
| 3   | `src/sim/gambits.ts:325` `applyCard` + `:766` `plan`                                              | 219 + 264 lines         | Two parallel 20-case `switch`es over the same cards. Adding a card means editing 3+ places in a 1,073-line file. No test covers each card's plan                                        |
| 4   | `src/ui/session.tsx`                                                                              | 821 lines, 39 methods   | A god object: intro, aiming, forks, bell, toasts, chips, Black banners. `syncEvents` (`:586`) is 167 lines                                                                              |
| 5   | `src/sim/match.ts:377` `snapshot` and `src/analysis/index.ts:274` `buildReport`                   | 180 and 293 lines       | Long hand-built object literals that mix lookups with formatting. Fine for speed, hard to change safely                                                                                 |
| 6   | `src/ui/report/ReplayPanel.tsx:11`, `Report.tsx:37`, `ObjectivesPage.tsx:23`, `CombatPage.tsx:93` | 208–249 lines each      | One giant JSX function per page, with the same chart legends repeated (`{label:'White', color: TEAM_COLOR.A}` appears 8 times)                                                          |

**Dead code** (checked by script: no reference outside the defining file, plus a reachability walk from `main.tsx`):

- `src/render/sigils.ts`: **the whole file (309 lines)**. These are the old hero sigils; only `src/render/index.ts:1-2` re-exports them and nothing imports them.
- The auction: `src/sim/auction.ts` (120 lines). `aiBids`, `placeBid` and `resolveAuction` are never called. Only `initAuction` runs, and it draws one `loot` random number, so **removing it changes the hashes** unless that draw is kept. Related: `AuctionState`, the `bid` and `auctionResolved` events, the analysis `auction` block (`analysis/index.ts:139,296,484`), `tuning.auction`, and `content/items/holy.json` (82 lines; holy items can never be awarded).
- About 45 unused exports, for example `combat.ts` `runTrigger`/`amountOf`, `rng.ts` `randInt`, `map.ts` `nearestNode`, `curses.ts` `pendingOffer`, `gambits.ts` `aiGambits`, `ui/relics.tsx` `FAMILY_*`, `ui/layout.ts` `useWidthBelow`, `analysis/text.ts` `obeliskText`/`biomeText`, and `emblems.ts` `styleEmblemSvg`/`styleGlyphParts`. Another 157 symbols are exported but used only inside their own file.
- 6 tuning keys that nothing reads: `tower.heroFocusSec`, `ai.recallBelowHp`, `ai.wanderJitter`, `ai.joinFightRadius`, `ai.suggestScore`, `curse.maxPerPhase`.
- `src/ui/report/mock.ts` (260 lines) is a dev-only fixture (`?mock`), but its text is **inside the production bundle**.
- CSS: only 3 unused classes (`clickable`, `hero-grid`, `divider` in `controls.css`). The CSS is tidy and tokenised; the many files are an organisation question, not dead weight.

**Old main-game leftovers.** Most of them are **still live in chess** (shops, items, curses decided by the AI, Keeper, biomes, obelisks, jungle events, pressure). Only the auction/holy path and the sigils are truly dead. `docs/ARCHITECTURE.md` still describes the hero game (M1–M6, 9 heroes, the auction) and is out of date.

**Duplication:**

| Helper                              | Copies | Where                                                                                                                                                                                           |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane display names (Left/Mid/Right) | 5      | `ui/pieces.tsx:9`, `sim/callouts.ts:23`, `sim/relics.ts:54`, `render/broadcast/director.ts:50`, `analysis/text.ts:4`                                                                            |
| Team names (White/Black)            | ~30    | maps in `sim/pieces.ts:66`, `ui/charts/palette.ts:34`, `ui/report/parts.tsx:13`, plus inline `team === 'A' ? 'White' : 'Black'` across hud and report                                           |
| Piece names                         | 2      | `sim/callouts.ts:32`, `analysis/feedback.ts:16` (both also in content `pieceById`)                                                                                                              |
| "Nearest lane to a point"           | 5      | `sim/feedback.ts:34` `laneAt`, `sim/ai/lanes.ts:46` `closestLane`, `analysis/feedback.ts:230` `laneNear`, `analysis/summary.ts:309` `inferLane`, `render/broadcast/director.ts:375`             |
| `clamp` / `lerp` / `cap` / `pct`    | 10     | `sim/core/math.ts`, `sim/feedback.ts:328`, `director.ts:55`, `terrain.ts:30`, `scene.ts:36`, `ui/charts/scale.ts`, `ui/pieces.tsx:5`, `analysis/text.ts:27`, `summary.ts:247`, `callouts.ts:52` |
| `['A','B'] as PlayTeam[]`           | 24     | across sim; `TPS = 20` is copied in `app/loop.ts:3`                                                                                                                                             |

**Layering:** the boundary test passes. Small gaps: ui imports render internals directly (`render/theme`, `render/emblems`, `render/broadcast/types`), and half of the `render/index.ts` barrel is unused. `tools/simulate.ts` imports `sim/curses` directly (tools are not covered by the test).

**Hot-path waste (sim):**

- `cleanExpired` (`combat.ts:698`) builds new `mods`/`shields` arrays for every unit every tick, even when nothing expired. This is the main source of the 7% GC time.
- `Grid.query` (`core/grid.ts:30`) allocates a new result array per call. `minionBehavior` (`behavior.ts:277`) creates a new closure per call.
- `isTargetable` (`ctx.ts:55-60`) builds a lane array and a closure for every Throne check.
- `Grid.clear` walks all 400 cells every tick. Collision re-sorts from scratch every tick (an insertion sort, O(n²) in the worst case).

**Render loop:** in good shape. Geometries are cached (`kit.geo`), minions are instanced, scratch vectors are reused, and arrays are reset each frame. `snapshot()` runs about 4–6 times per frame (Broadcast, Hud, App, PieceCard), but it costs only 0.09 ms, so this is low priority. Not verified: whether models dropped for camp and event units free their materials (`scene.ts:578` `drop` only removes them from the scene). Worth one `renderer.info.memory` check over a long match.

**Test gaps:** there are no direct unit tests for `commands.ts` (validation), `impact.ts` (gambit impact), `ai/strategic.ts`, the per-card gambit `plan`, `events.ts` (jungle events, integration only), or the lane helpers. The e2e helpers do not cover the Act break or relic picks.

## 3. Cleanup plan (phases)

Each phase ships on its own. The gate for every phase: `npm run check` plus `tools/baseline.ts` gives the **same 10 hashes** (unless the phase is marked as changing behaviour), and `npx playwright test` passes for UI phases. LOC counts are estimates.

### Phase 0: Safety net (Sonnet, about 1 h, risk L)

| Item                                                                                                                                    | Files                                           | LOC | Verify                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --- | ------------------------- |
| Add `tools/baseline.ts` (the scratch script) and `npm run baseline`; it prints the table above and exits 1 on any hash mismatch         | `tools/`, `package.json`, `tools/baseline.json` | +80 | Gives the 10 hashes above |
| Fix the stale e2e helpers: `playToEnd`/`stepUntil` send `resumeAct` + `autoRelic` at breaks; the smoke test counts only White's gambits | `tests/e2e/helpers.ts`, `smoke.spec.ts`         | ~30 | 13/13 Playwright pass     |

### Phase 1 (a): Delete dead code, hashes identical (Sonnet ×2 in parallel, risk L)

| Item                                                                                         | Files                                                | LOC removed           | Verify                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Delete `render/sigils.ts` and its barrel lines; trim the unused `render/index.ts` re-exports | render                                               | ~330                  | build + boundary test                                                |
| Delete about 45 unused exports; drop `export` from the 157 file-local ones                   | all (split: agent A sim+analysis, agent B render+ui) | ~250                  | tsc, hashes                                                          |
| Remove the 6 dead tuning keys and their schema lines                                         | `content/tuning.json`, `schema.ts`                   | ~12                   | hashes (the content hash changes; replays stay valid within a build) |
| Move `ui/report/mock.ts` to a test fixture, or load it via a dev-only dynamic `import()`     | `ui/report/data.ts`, `mock.ts`                       | 260 out of the bundle | build: "Act 4 begins" is gone from `index.js`                        |

### Phase 2 (a): Remove the auction and holy items (Sonnet, risk M, **owner decision 1**)

Delete `auction.ts`, `AuctionState`, the `bid`/`auctionResolved` events, the analysis auction block, `tuning.auction`, `holy.json` and `HolyItemSchema`, and the `special.test.ts` auction test. **Keep one `rand(rng,'loot')` call where `initAuction` was, so the hashes stay identical.** Dropping that call is a separate, intentional hash change that needs the 800-match balance run. About 300 lines removed. Update the "Cursed and holy items" section of the source of truth and add a row to Reversed decisions.

### Phase 3 (b): Dedupe and shorten, hashes identical (Sonnet, risk L)

| Item                                                                                                                                                     | LOC  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| New `src/sim/names.ts` (exported from `sim/index`): `PLAY_TEAMS`, `TEAM_NAME`, `LANE_NAME`, `PIECE_NAME`, `teamWord()`. Replace the ~40 copies           | −120 |
| One `nearestLane(lanes, x, y, maxOff)` in `sim/world/map.ts`, used by feedback, ai/lanes, analysis and the director (keep `<=` vs `<` tie rules exactly) | −80  |
| Export `clamp`/`lerp`/`TPS` through `sim/index`, delete the local copies; add a `TEAM_LEGEND` const for the report charts                                | −60  |

### Phase 4 (c): Simplify the worst offenders, hashes identical (Opus, one at a time, risk M–H)

| Item                                                                                                                                  | Risk | LOC change   | Verify                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------ | ---------------------------------------------------- |
| Gambits: one table `CARDS[effect] = { plan, apply }`, a file per school under `sim/gambits/`. The order of rng draws must not change  | H    | −150, split  | hashes + new per-card tests (Phase 6)                |
| `strategicUpdate`: split into `healCands`, `laneCands`, `fightCands`, `objectiveCands`, `pick`; move the magic numbers to `tuning.ai` | H    | −60, split   | hashes (identical only if the numbers are unchanged) |
| `buildSummary`: split along its 7 marked sections; accept a ready `report` so `data.ts` builds it once                                | M    | −100, −71 ms | `summary.test.ts` + hashes of the summary output     |
| `Session`: move `syncEvents`, chips and banners to `ui/sessionEvents.ts`, and intro/aiming to their own modules                       | M    | ±0, split    | Playwright                                           |
| Report pages: shared `<TeamLegend>` and a chart-section helper                                                                        | L    | −150         | Playwright report spec                               |

### Phase 5 (d): Performance, hashes identical (Opus, risk M)

| Item                                                                                                                             | Est. gain             |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `cleanExpired`: scan first, filter only when something expired                                                                   | 3–5% sim, less GC     |
| `Grid.query` into a reusable scratch array; no closures in `nearestEnemy`/`minionBehavior`; constant lane list in `isTargetable` | 3–6%                  |
| `Grid.clear` only the cells used last tick                                                                                       | ~3%                   |
| Collision: keep last tick's x-order (care: ties must stay in id order, or the hashes change)                                     | 2–4%                  |
| Vitest: cache `runAi(seed)` per test file (`events.test.ts` runs 16 full matches, 7 of them repeats)                             | check 3.4 → ~2 min    |
| Optional: zod only in dev/tests, or `zod/mini` at runtime                                                                        | −60–90 KB main bundle |

Target: 10–20% faster sim, which matters for 800-match balance runs and phones at 4x speed. Measure with `npm run baseline` (ms per tick).

### Phase 6 (e): Tests worth adding (Sonnet, risk L)

Per-card gambit `plan` and `apply` tests (one board setup per card); `commands.ts` rejection reasons; `impact.ts` tallies; `nearestLane` edge cases; a `strategicUpdate` table test (low hp → retreat, Check → defend King); e2e: a relic pick at the break and the Battery "Resume refused" case.

### Expected total

| Bucket        | Lines removed                                                            |
| ------------- | ------------------------------------------------------------------------ |
| (a) dead code | 850–1,150 (incl. 260 moved out of the bundle)                            |
| (b) dedupe    | 250–350                                                                  |
| (c) simplify  | 400–800 (mostly splitting, so smaller functions rather than fewer lines) |
| **Total**     | **~1,500–2,300 of 41.9k (4–5%)**                                         |

## 4. How to split the work across agents

Use one worktree per agent and merge in this order so edits never collide:

1. **Phase 0**: one Sonnet agent (e2e helpers + `tools/baseline.ts`). Merge first; everything else checks against it.
2. **Phase 1**: two Sonnet agents in parallel, by folder: A = `src/sim` + `src/analysis` + content, B = `src/render` + `src/ui`. Merge A, then B.
3. **Phase 2**: one Sonnet agent (auction/holy), after Phase 1.
4. **Phase 3**: one Sonnet agent. It touches every layer, so run it alone.
5. **Phase 4**: Opus, **one item per agent, one after another**: gambits → strategic → summary → session → report pages. Each one must give identical hashes before the next starts.
6. **Phases 5 and 6**: Opus for the sim perf work (it touches the same sim files as Phase 4, so it goes after it). A Sonnet agent can write the Phase 6 tests in parallel, in `tests/` only.

Each agent runs `npm run check` + `npm run baseline`; UI phases also run Playwright. Each change gets a CHANGELOG entry.

## 5. Owner decisions

| #   | Question                                                                                                        | Recommendation                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delete the old main-game paths on this branch?                                                                  | **Yes, but only the dead ones:** the auction, holy items and hero sigils. Keep shops, items, curses, Keeper, biomes and obelisks; chess uses them.          |
| 2   | Keep both branches sharing code (`test-product` and `test-product-2`)?                                          | **No.** They have already diverged a lot (pieces vs heroes). Treat the chess branch as its own codebase and stop keeping files mergeable.                   |
| 3   | Merge the 16 CSS files?                                                                                         | **No big merge.** The CSS is tidy (only 3 unused classes, mostly tokens). At most, fold the tiny `items.css` and `richtext.css` into `base.css`. Low value. |
| 4   | Allow one intentional hash change (dropping the leftover auction random draw), with an 800-match balance rerun? | **Later, not now.** Keep the hashes identical through every phase; group any behaviour change with the next balance pass.                                   |
| 5   | Make Playwright part of "before you finish" again (35 min, software WebGL)?                                     | **Yes, per phase, not per change.** Six stale failures went unnoticed because e2e was skipped. Run the full suite at the end of each cleanup phase.         |
