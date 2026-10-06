# Build notes (handoff for review)

All six milestones of [ARCHITECTURE.md](ARCHITECTURE.md) are built on branch `claude/architecture-docs` in one unattended session. This file is for the reviewer: what exists, where it deviates from the plan, what is weak, and where to look first. Numbers below were measured, not estimated.

## Status

| Check                                                                                            | Result                                                                                                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run check` (typecheck, lint with layer boundaries, prettier, 68 unit and integration tests) | passes                                                                                                          |
| `npm run build`                                                                                  | passes (264 KB JS, 81 KB gzip)                                                                                  |
| `npm run e2e` (Playwright, Chromium)                                                             | passes; covers draft, upgrade, shop buy, auction bid, a full phase, report, hero view, replay scrub, next phase |
| 1,000 headless matches (`docs/BALANCE_REPORT.md`)                                                | every hero within 40-60% (46.9-55.7%), median 13.1 min, 0.05 ms per tick, 0.9 s per match                       |
| Determinism                                                                                      | same seed gives an identical event-log hash; replay export reproduces a match exactly                           |

Size: `src/sim` 5.2k lines, `src/analysis` 0.8k, `src/render` 0.7k, `src/ui` 2.1k, `tools` 0.5k, `tests` 1.0k, `content` 2.1k lines of JSON. Commits are one per milestone (M4 and M5 code landed inside the M1 commit; their tests are the M4+M5 commit).

## Run it

See [README.md](../README.md). The game is `npm run dev`. To see a mid-phase screen quickly in a browser console: `__session.match.step(2400); __session.notify()`.

## Deviations from the architecture doc

Things that differ from what ARCHITECTURE.md says. None change a locked design decision unless marked **design**.

1. **No projectiles, no collision.** Attacks and abilities resolve instantly; units may overlap. The doc listed projectiles as an entity and a collision pass in the tick order.
2. **Abilities never target structures.** Heroes damage towers and guardians only with auto-attacks. Keeps casts from being wasted on buildings.
3. **No XP or levels, as designed.** Hero growth is `phaseStatGrowth` (8% max health, Blade damage and Soul power per phase) plus items and the 3+ upgrade picks. **design**: the doc never said how heroes grow in-phase; this is my reading.
4. **Biome slots open in mirrored pairs by reflection, not rotation.** Phase 1: the two centre slots. Phase 2: `tla` and `tlb`. Phase 3: `bra` and `brb`. The first draft paired by rotation, which gave one team a jungle beside the two-hero bottom lane; mirror matches (identical drafts both sides) then showed team A winning 42.7%. After the fix it is 49.3% over 600 matches. `tests/symmetry.test.ts` guards the geometry.
5. **Shop access.** Between phases every hero can buy the base catalog and the Keeper's stock. During a phase: base catalog at base, Keeper stock only near the Keeper. Tier-3 items are available only from Keeper stock or an obelisk unlock. **design**: the doc did not say whether tier 3 was in the base shop.
6. **Curses start at phase 2** (`curse.minPhase`), because net worth is equal at the start. When an offer is made the Keeper moves to the keeper spot nearest the offered hero.
7. **AI bids before it shops**, so it sets gold aside. Found by a test where the losing side had spent its gold first.
8. **Upgrade picks continue after phase 3** until a hero's pool of 6 is empty (the doc only required picks before phases 1-3).
9. **Unit iteration order rotates each tick and units with a lethal hit pending still act that tick.** Without this the first unit in the array always won simultaneous kills (first-mover bias toward team A).
10. **M6 "tuning in content/ only" was not honored.** The pass found real bugs and AI gaps, so it changed code. Details under "What the balance pass found" below. All changes are in the M6 commit.
11. **CI** has an `e2e` job that installs Chromium through Playwright. It has not run on GitHub; only locally against the preinstalled browser.

## Rules from the doc that are only partly kept

- **"Numbers live in content, not code."** Mostly kept (`content/tuning.json` has about 150 numbers). Still in code: `TPS = 20` (guarded by a test against `tuning.tickRate`), assist window 160 ticks, camp move speed 40, hero spawn offsets, the navigation start slack, and every weight inside `src/sim/ai/strategic.ts` and `behavior.ts` (scoring constants such as 0.8 farm base, 0.2 push base, 2.6 urgent base defense). Only posture tables, personalities and siege parameters are data.
- **Custom behavior registry capped at 5.** Two entries are used (`outOfCombatDrain`, `reviveOnce`; revive is handled in the death step, not through the registry call).
- **Reports state facts, never conclusions.** Badge labels and report text were written that way and a test bans judgement words in badge labels. Free text elsewhere in `src/ui/report/` is not machine-checked; skim it.

## How the AI works (short)

Every hero re-plans once per second (`src/sim/ai/strategic.ts`): it scores goals (farm lane, push tower, defend, clear camp, join fight, take obelisk, retreat) as base consideration times a posture weight, with +0.12 for the current goal. Posture is a weight table; personality changes retreat threshold, fight threshold (`Lanchester ratio` of local health times damage), chase distance and risk. Every tick (`behavior.ts`) it picks targets, attacks, or follows its path.

What I added beyond the plan, because without it matches stalled or were decided by accident:

- **Team siege plan**: when the team has 4+ heroes alive, at least as many as the enemy, and healthy, all heroes converge on the enemy lane with the fewest towers (or the guardian once exposed). They stage 260 units out until two heroes gather, a wave arrives, or 25 s pass.
- **Base defense**: threats near the guardian (radius 640) pull defenders at high priority and suppress sieges; defenders are limited by claims per structure; minion pressure counts as a threat only in the hero's own lane.
- **Ranged standoff**: ranged heroes stand just inside their own range of a tower and, if they outrange it, take no tower damage.
- **Hold patience**: a hero that waits in "hold" gets more willing to fight over time.
- **Lane discipline** (measured with `tools/lane-share.ts`; before the pass mid carried 89% of hero damage and 66% of hero time): (1) lane-bound goals (farm, push, siege staging, retreat) are routed _along the lane polyline_ (`lanePath` in `ai/lanes.ts`) instead of the shortest nav-graph path, which cut every rotation and every retreat through the mid diagonal and the centre jungle; the guardian is approached down the siege lane. Retreating down the own lane also stopped most "hero dies on the mid line while fleeing" kills. (2) The siege lane is chosen by fewest enemy towers, then by how many of the team's heroes are assigned to it, with a sticky bonus (`ai.siegeAssignedBonus`, `siegeMidPenalty`, `siegeLaneStick`). The pick is bistable: a `siegeMidPenalty` of 0.2 gives mid about 22% of hero damage, 0 gives about 36%. (3) Join-fight only within `ai.joinFightRadius` (450), and a tower in another lane is defended only if it is within `ai.defendOffLaneRadius` (600) of the hero (jungle heroes and the hero's own lane are unrestricted). (4) The team that leads the mid wave alternates by wave (`waves.midLeadUnits`), so the minion clash point drifts instead of sitting on the exact centre. Longer side-lane sieges made matches about 1 minute slower, so `minions.structureMul` went from 1.0 to 1.4 and `structureMulPerPhase` from 0.9 to 1.2, and the siege waits shorter (`siegeAfterTick` 1500, `siegeWaitTicks` 300).

## What the balance pass found (read this)

- **Friendly fire bug**: area abilities that choose a centre enemy (`enemyBurst`) were selecting the caster's allies as targets. It made the Hollow Cartographer look 30% win rate for hours; scaling its stats did nothing, which is what exposed it. Fixed in `combat.ts`; `tests/special.test.ts` now has a regression test that fails without the fix.
- **Team asymmetry** from the biome pairing (deviation 4) and the iteration-order bias (deviation 9).
- **Report windows**: a phase's PREP actions (AI purchases, bids, upgrade picks) were emitted before the phase-start marker, so they fell outside every phase report. `phaseStart(prep)` is now the first event of a phase, and `tests/analysis.test.ts` checks that phase slices add up to the whole match for purchases and picks.
- **Pathfinding**: heroes oscillated at the start node and never left base (found from a screenshot). Fixed by starting the search from every near node.
- **Pacing**: the game stalled around the towers. Fixes in data: structure HP and minion damage against structures that grows each phase (`minions.structureMulPerPhase`), and in AI: the siege plan.
- **Curses**: with the first boon values, accepting a curse changed the comeback rate by +1 point (31.8% off, 32.8% on, 500 matches each). With the committed, stronger boons it is +6.6 points (38.4%). Roughly 2 standard errors; treat as a first read.
- Distribution of match length is bimodal: about 43% end by minute 12, then a long tail of stalemates that end between minutes 13-25 (about 3% reach the Restless Guardians in phase 7).

## Known weaknesses and risks

| Area       | Issue                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Balance    | Duplicates of one hero are allowed (4-hero pool, 5 slots). Five Hollow Cartographers beat every other five-stack (71-79%). The no-duplicates rule fixes this with 11 heroes.                                                                                                                                                                                                                |
| Balance    | The holy item is very strong (holder's team wins 69-83%). That figure is confounded because the team that wins the auction is usually ahead; I did not run an A/B test.                                                                                                                                                                                                                     |
| Balance    | Hollow Cartographer is the strongest hero in random drafts (55.7%); smelter and revenant are lowest (47%). All are inside the band; the spread is not small.                                                                                                                                                                                                                                |
| AI         | No kiting, no vision or wards, simple recall logic. Heroes wander across lanes to defend. Matches look plausible but not smart.                                                                                                                                                                                                                                                             |
| Engagement | The in-phase decision space is still thin (posture and recall). The doc names this as the first question the prototype must answer (E2). I could not answer it unattended.                                                                                                                                                                                                                  |
| UI         | Phone layouts (portrait, landscape, touch targets) added on test-product. The map view is rotated 45 degrees (your base at the bottom) in `src/render/view.ts`; the sim keeps its original coordinates, so lane ids `top`/`bot` now appear on the left/right. No keyboard shortcuts, no audio, colors not audited for accessibility. No download button for replay export (the API exists). |
| UI         | No Keeper or lore text anywhere; the Keeper is a gold marker and a tab.                                                                                                                                                                                                                                                                                                                     |
| Tests      | No test that the enemy's sealed bid stays hidden in the report before resolution; the e2e covers one happy path; AI behavior is tested only through match outcomes, not unit by unit.                                                                                                                                                                                                       |
| Perf       | About 40,000 events per 12-minute match kept in memory; fine, but the UI re-renders the whole HUD at about 8 Hz while a phase runs.                                                                                                                                                                                                                                                         |

## Where to look first

1. `src/sim/ai/strategic.ts` and `src/sim/behavior.ts`: largest block of heuristics and most of what moves outcomes. Constants are inline.
2. `src/sim/phase.ts`, `src/sim/commands.ts`: every rule the player can trip (what blocks `startPhase`, what is legal when).
3. `src/sim/curses.ts` and `src/sim/auction.ts`: sealed bids, refunds, who gets offered a curse.
4. `src/analysis/index.ts`: report numbers; the tests tie them to the event log, but window boundaries (PREP of phase N through the end of LIVE N) deserve a second look.
5. Determinism hazards: any new `Map` or `Object.entries` iteration in `src/sim` must have a stable order; lint bans `Math.random`, `Date.now` and platform globals there.
6. `docs/BALANCE_REPORT.md` for current numbers and `tools/` for how to reproduce them.

## Not done

Meta-progression, lane identity, "The Core" mode, lore, multiple AI difficulties, audio, mobile layout, save and load, a human focus group. The design shelved the first four on purpose.
