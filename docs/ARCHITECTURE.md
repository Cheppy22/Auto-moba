# Auto-MOBA — Architecture v1

As of 2026-10-06. Game decisions live in [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) (the original v1 baseline is in [archive/DESIGN-v1.md](archive/DESIGN-v1.md)); this file covers frameworks, systems, boundaries and milestone tasks. How each task is coded is decided per task by the planner agent.

The prototype is one browser game in TypeScript. A deterministic simulation core is walled off from rendering and UI, and all content lives in validated data files.

## Scope and principles

**In scope (M1–M6):** 9 heroes (4 at first, 5 added later), about 15 items, 6 cursed items, 2 holy items, 5 biomes, 4 pressure events, one neutral AI difficulty, a full match loop with reports, and a headless balance runner.

**Out of scope:** meta-progression, lane identity, The Core mode, lore, multiplayer, save/load between sessions, audio, a mobile-first layout, and multiple AI difficulties.

**Six rules every task obeys:**

1. **Split.** `src/sim` imports nothing from the browser, DOM, canvas, UI or timers. A lint rule enforces it.
2. **Determinism.** Fixed tick, seeded random streams, and no `Math.random`, `Date.now` or wall-clock reads inside the sim. The same seed and the same command list always produce the same match.
3. **Data-driven content.** Heroes, items, upgrades, biomes, events, badges and tuning numbers live in JSON under `content/`. They are schema-validated at load and in tests.
4. **Record everything.** The sim emits typed events and position samples. Reports and replays read only that log, never live state.
5. **Commands in, snapshots out.** UI and input code never mutate sim state. They issue commands and read snapshots.
6. **Minimal dependencies.** Any runtime dependency beyond the stack list below needs Cheppy's approval.

## Stack and repo layout

| Piece               | Choice                                                        | Why                                                  |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Language            | TypeScript, `strict`                                          | Types are the contract between layers                |
| Dev server / bundle | Vite                                                          | Zero-config, fast reload                             |
| Tests               | Vitest                                                        | Same config as Vite; runs sim tests in Node          |
| Browser smoke tests | Playwright (preinstalled Chromium)                            | Checks screens load and a match runs                 |
| Game drawing        | three.js 3D view (lazy loaded); Canvas 2D for report replays  | One physical 3D map; 2D only draws report paths      |
| Screens             | Preact                                                        | Reports and shop need interactive UI; about 4 KB     |
| Content schemas     | Zod                                                           | One schema gives both types and load-time validation |
| Lint / format       | ESLint with `no-restricted-imports` per folder, plus Prettier | Enforces layer boundaries without an extra plugin    |
| Node scripts        | `tsx`                                                         | Runs headless matches and the balance runner         |

```
content/         JSON: heroes, items, upgrades, biomes, pressure, badges, map, tuning
src/sim/         pure simulation: core, world, systems, ai, events, commands, content loader
src/analysis/    pure: event log -> report models (stats, fights, badges, paths)
src/render/      sigils, theme, report replay (Canvas 2D);
                 broadcast/ = the three.js game view, terrain and play director
src/ui/          Preact screens: setup board, live HUD (gambits, forks), Adjourn, reports
src/app/         wiring: frame clock, speed control, screen state machine
tools/           Node: headless match, batch balance runner
tests/           cross-layer tests: determinism, golden match, content, e2e
docs/            SOURCE_OF_TRUTH.md, CHANGELOG.md, ARCHITECTURE.md, archive/
```

## System map

Arrows point from a layer to what it may import. Lint enforces each arrow.

```
app ────► ui ────► analysis ────► sim
 │         └──────────────────────► sim   (public API)
 └──────► render ─────────────────► sim   (snapshot types)
tools ──► analysis, sim                    (Node)
content/ (JSON) ──────────────────► sim   (content loader)
```

- `sim` depends on nothing.
- `analysis` depends on `sim` event and state types only.
- `render` depends on `sim` snapshot types.
- `ui` depends on `analysis` models and the `sim` public API.
- `app` wires everything. `tools` uses `sim` and `analysis` in Node.

## Simulation core

A fixed-step state machine at 20 ticks per second, driven by commands, reading nothing from the outside world.

**Clock**

- 1 tick = 50 ms of game time. A 4-minute phase is 4,800 ticks.
- Browser speeds are pause, 1x, 2x and 4x, which only change ticks per real second. Headless runs go as fast as the CPU allows.
- The renderer interpolates between each unit's previous and current position.
- Between phases the tick clock is frozen. Commands issued then are stamped with the frozen tick plus a sequence number.

**State**

- One `MatchState` object holds everything: plain serializable data, no classes, closures or browser references.
- Entities are typed records keyed by numeric id: hero, minion, tower, guardian, camp monster, projectile, obelisk, keeper. Shared fields (position, team, hp, stats) sit on a common unit shape. Not a full ECS.
- Teams are `A`, `B` and `neutral` from day one (camps, Spirit Tide waves, keeper).

**Randomness**

- A seeded generator in state, split into independent streams: `mapgen`, `ai`, `combat`, `loot`, `keeper`, `draft`. A new roll in one system never shifts another.

**Determinism limits**

- Guaranteed for the same build on the same JavaScript engine. Cross-browser replay is not guaranteed in v1.
- Trig and other transcendental math go through one `sim/core/math` module so it can later be swapped for lookup tables.

**System order per tick**

1. Apply queued commands
2. Phase clock and pressure-event rules
3. Spawns (minion waves, camps, obelisks)
4. AI strategic layer (1 Hz per hero, staggered across ticks)
5. AI tactical layer (targets, ability casts)
6. Ability and effect execution
7. Movement and collision
8. Projectiles and damage resolution
9. Buffs, damage over time and regen tick
10. Deaths, rewards and respawn timers
11. Objectives (towers, guardian, obelisk claims)
12. Event flush and position sampling

**Public API.** The only way in or out is `src/sim/match`: create a match from a config (seed, content, draft), step N ticks, issue a command, read the phase state, read a render snapshot, read the event log, and export a replay (seed, content hash, command list).

## Game systems

Each system owns one slice of `MatchState`, runs at a fixed point in the tick order, and reports what happened only through events.

### Map and navigation

- **Fixed skeleton:** 2 bases, 3 lanes as polylines, 2 towers per lane per team, a guardian in each base.
- **Biome slots:** 6 regions between lanes. 2 open at phase 1 (inner jungle), 2 at phase 2, 2 at phase 3. When a slot opens, the `mapgen` stream draws a biome template.
- **Biome template (data):** camp spots, a reward table and nav nodes that attach to the slot's fixed entry points.
- **Navigation:** a waypoint graph (lanes, jungle, open biome nodes) with shortest-path search. Local steering only inside fights. No grid pathfinding.
- **Walkable space** (`world/terrain.ts`): capsules for lane corridors, bases, open jungle clearings and their gate paths, shops and Keeper spots (sizes in `map.json` → `walk`). Every move is confined to them; a chase whose straight line crosses solid ground detours through the nav graph. The 3D view builds its cliffs from the same shapes.
- **Jungle refresh:** at each phase start, camp types in open slots are re-rolled from their biome's table.
- **Spatial index:** a uniform grid for range and target queries.

### Stats, damage and effects

- **Damage types:** Blade (reduced by armor), Soul (reduced by resist), True (unreduced; curses and guardians only).
- **Stat block:** hp, regen, armor, resist, blade damage, attack speed, soul power, move speed, cooldown reduction, range.
- **Modifier stack:** every stat change is `{stat, add | mul, value, source, tags}`; stats recompute when the stack changes; the source is kept for reports.
- **Global tag multipliers:** match-wide rules scale everything carrying a tag (Thinning Veil scales `heal`; Keeper Calls In Debts doubles `curse`). No special cases in combat code.
- **Effect primitives (v1 only):** damage, heal, shield, stat modifier, damage over time, dash, aura. Triggers: on hit, on cast, on damaged, on kill, periodic, on low hp.
- **Escape hatch:** a registry of named custom behaviors in TypeScript, capped at 5 entries for the prototype, each with a test.
- **Abilities:** 3 plus an ultimate per hero, all auto-cast; cast conditions are data.

### AI

- **Strategic layer (1 Hz, staggered):** utility scoring over a fixed goal list: farm lane, clear camp, push tower, defend tower, join fight, retreat, recall, take obelisk, visit keeper. Score = base considerations × posture weight.
- **Posture:** a data table of goal weights for Push / Farm / Defend / Default. Never a hard override; danger checks always run.
- **Personality:** changes tactical parameters only (retreat hp threshold, engage odds, chase distance). How a posture plays out, never which goals it favors.
- **Team blackboard:** per-team shared memory (threats, claimed goals, fights) so five heroes do not pile onto one camp.
- **Tactical layer (every tick):** target selection, ability casts from data conditions, spacing.
- **Non-player decision AIs:** shopping (build list in data plus one adaptation rule against the enemy's main damage type), upgrade picks, auction bids, curse acceptance; weighted by personality, using the `ai` stream.
- **Player hero rule:** same brain, but it never recalls to shop on its own. It still retreats.

### Economy and shop

- **Gold sources:** minion last hits plus a nearby share, kills and assists, towers, camps, obelisks, passive income; values in tuning data.
- **Net worth** = gold plus item value; drives the curse trigger and team comparison.
- **Shop:** 6 item slots per hero; recipes and tier upgrades in data; sell refunds 50%; cursed items cannot be sold.
- **Catalog per team:** base catalog plus obelisk unlocks plus the keeper's stock for the phase.
- **Access:** every hero shops between phases; during a phase, only at base or within the keeper's radius.
- **Recall:** a channel, then a teleport. Base: short. Keeper: longer. Damage interrupts it.

### Phases and pressure

- **Controller:** `DRAFT → PREP(1) → LIVE(1) → REPORT(1) → PREP(2) → … → END`, unbounded. Only LIVE ticks.
- Between phases, heroes keep their position and hp and shop remotely.
- **Respawn time** = phase base + growth × seconds into the phase; the phase base rises each phase.
- **Pressure events** (phase 4+) are data entries that switch on rules and stack:
  - Thinning Veil: global heal multiplier.
  - Spirit Tide: neutral waves from camps walk the lanes, reusing the wave system with team `neutral`.
  - Keeper Calls In Debts: the `curse` tag multiplier goes to 2.
  - The Kings Wake (id `restless_guardians`, rule `roamingGuardians`): guardian (King) AI switches from stationary to roaming.

### Keeper, curses, auction, obelisks

- **Keeper:** neutral, untargetable. Each PREP it relocates (`keeper` stream) and rolls its stock from data. If a curse is offered, it is placed near that hero.
- **Curse offer (each PREP):** losing team = lower team net worth; candidate = its lowest-net-worth hero, only if below 75% of the match average; at most one per phase. Flaw type shown; exact flaw rolled from the item's flaw pool on acceptance (`loot` stream). Permanent.
- **Holy auction:** bid windows in PREP 1, 2 and 3; bids add up. Bid = team points plus the player's own gold, points converted at a tuning rate. Sealed. Resolves at the end of PREP 3. Ties: more points, then a `loot` roll. The loser gets 50% of its gold back. The winning team picks the recipient.
- **Team points:** from obelisks and major camps, in a team pool.
- **Obelisks:** spawn on a schedule at random eligible nodes during phases 1–3; claimed by holding the radius uncontested for a set time; reward = points plus one small effect (buff, gold, or a team shop unlock).

## Content and data

All game content is JSON in `content/`, with one Zod schema per file type.

| File(s)           | Defines                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heroes/*.json`   | Stats, 3 abilities plus ultimate (as effect compositions), default posture, personality trait, upgrade pool, AI build list, sigil visual parameters       |
| `items/*.json`    | Category, tier, cost, modifiers and effects, recipe partners, upgrade target; cursed items add boons, flaw type and flaw pool; holy items add a hint text |
| `upgrades/*.json` | Ability tweaks offered in the pick 1 of 3 screen                                                                                                          |
| `biomes/*.json`   | Camp spots, camp types per phase, reward table, nav nodes, palette                                                                                        |
| `pressure.json`   | The 4 events in order, as rule switches and tag multipliers                                                                                               |
| `badges.json`     | Report badges: metric, rank rule (max or min), factual label                                                                                              |
| `map.json`        | Lane polylines, tower and base positions, biome slots and entry points                                                                                    |
| `tuning.json`     | Every number not tied to one hero or item: phase length, gold values, respawn curve, curse threshold, auction rate, obelisk schedule                      |

- The loader takes plain objects. The browser bundles JSON by static import; Node tools read it from disk. The sim never touches the file system or the bundler.
- Ids are stable strings (`item.hungry_mask`). Cross-references are checked by a content test.
- A content hash is stored in every replay.
- Badge labels state a metric ("Most damage taken from Soul"), never a judgment.

## Recording and reports

The sim records; `src/analysis` turns the log into numbers; the UI displays. No layer writes advice.

**Event log**

- Each event is `{tick, seq, type, payload}`: damage, heal, death, respawn, gold gained (with source), purchase, sell, upgrade pick, posture change, recall, tower or guardian destroyed, camp cleared, obelisk claimed, bid placed, auction resolved, curse offered / accepted / refused, phase start and end, pressure event, command rejected.
- Damage and heal events carry source, target, amount, damage type and origin (auto attack, ability id, item id).
- **Volume rule:** hero-involved events are logged individually; minion-versus-minion and camp damage are summed into 1-second buckets.
- **Position samples:** every hero every 10 ticks (0.5 s).
- Append-only, in memory, exportable as JSON with the replay.

**Analysis layer (pure functions)**

- Every model can be computed for one phase or the whole match.
- **Team model:** gold, kills, deaths, objectives, team points, towers, net worth over time.
- **Hero model:** damage dealt and taken by type and origin, gold by source, purchases in order, deaths with killer and damage mix, path samples.
- **Fights:** derived here, not in the sim: clusters of hero-on-hero damage close in time and space, with participants, duration, damage exchanged and deaths.
- **Badges:** computed from `badges.json` over hero models.

**Report screens:** team view; hero view (badges, breakdowns, gold over time, purchase timeline); map replay (path, scrubbable timeline, fight and purchase markers). The match report reuses them over the whole match.

## Presentation

**Game view (three.js, `src/render/broadcast/`, spec [BROADCAST.md](BROADCAST.md))**

- Reads a render snapshot built on demand once per frame (not per tick) plus the new events.
- Terrain: a heightfield island built from the sim's walkable shapes; height is visual only. Scenery is instanced; sealed jungle clearings are veiled until they open.
- Director picks the play; camera modes Auto, Follow and Free (touch: pan, pinch, twist).
- Hero sigils are generated by code from each hero's visual parameters. No image or model files.
- `project(x, y, lift)` gives screen positions for HTML overlays (shop pins).
- The report path replay is still Canvas 2D (`render/replay.ts`).

**UI (Preact)**

- Screen machine in `src/app`: Title → Draft → Prep (upgrade, then shop, auction, curse offer) → Live (HUD) → Report → Prep → … → Match Report.
- HUD: speed (pause, 1x, 2x, 4x), posture buttons, recall to base or keeper, hero status, phase timer, team score.
- UI-only state (selected tab, hovered hero) stays in the UI layer.

**Commands (the only input path)**

- During a phase: `setPosture`, `recall(base | keeper)`.
- Between phases: `pickUpgrade`, `buy`, `sell`, `bid`, `acceptCurse`, `refuseCurse`.
- Draft: `pickHero`, `pickLane`.
- Validated in the sim; a rejected command emits `commandRejected` with a reason.

## Quality gates

Every task merges only when `npm run check` passes: typecheck, lint (including layer boundaries), unit tests and the content test.

| Test                       | Proves                                                                                                    | From |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---- |
| Unit tests per system      | Each system's rules on tiny hand-built states                                                             | M1   |
| Determinism                | Same seed and commands, run twice, give an identical event-log hash                                       | M1   |
| Golden match               | A fixed seed finishes with invariants holding: no NaN or negative hp, gold never below 0, a winner exists | M1   |
| Content validation         | Every JSON file passes its schema and every cross-reference resolves                                      | M1   |
| Boundary lint              | `sim` and `analysis` import no browser code; `render` and `ui` import sim types and the public API only   | M1   |
| Browser smoke (Playwright) | The app loads, a match starts, a phase completes, screens render                                          | M2   |
| Balance runner             | Batch stats over many seeds                                                                               | M6   |

**Performance budgets**

- Sim: at most 0.25 ms per tick on average (one 3-phase headless match, 14,400 ticks, in about 4 s or less).
- Balance runner: 1,000 matches in about 20 minutes or less with parallel Node workers.
- Browser: 60 fps at 4x speed on a mid-range laptop.
- Event log: under 50 MB for a 6-phase match.

**Safety guard.** Tests and tools stop any match reaching phase 10 and flag it as a bug (The Kings Wake failed to end it). A test guard, not a game rule.

**Working rules for agents**

- One task = one reviewable change, about 400 lines of diff or less, including its tests.
- No new runtime dependency without Cheppy's approval.
- A change to the public API, an event type or a content schema updates this file in the same change.
- Content numbers change in `content/`, never as constants in code.
- No speculative abstraction: build what the current milestone needs.

## Milestones

Six milestones with one human checkpoint after M3. All tasks are built; see [archive/BUILD_NOTES.md](archive/BUILD_NOTES.md) for deviations, including that the human checkpoint was skipped by instruction and the M6 tuning pass touched code as well as content.

### M1 — Simulation core (headless)

- [x] Project scaffold: Vite, TypeScript strict, Vitest, ESLint boundary rules, Prettier, `npm run check`, CI workflow
- [x] Core: tick loop, seeded random streams, sim math module, id allocation, spatial grid
- [x] Content pipeline: Zod schemas, loader, content test; placeholder content for 4 heroes, 6 items, `map.json`, `tuning.json`
- [x] Map skeleton and waypoint navigation graph (lanes, bases, inner jungle slots only)
- [x] Units, stat block, modifier stack, damage types
- [x] Effect primitives and triggers; abilities as data; custom-behavior registry
- [x] Minion waves, towers, guardian, deaths, flat respawn
- [x] Gold sources, base shop, 6 slots, buy and sell commands
- [x] Hero AI: strategic goals, tactical layer, posture weights, personality, team blackboard, AI shopping
- [x] Basic phase controller: DRAFT, PREP, LIVE and REPORT states, 3 timed phases, then END on guardian death
- [x] Event log, position sampling, public match API, replay export
- [x] Headless runner (`tools/`) and the determinism and golden match tests

**Done when:** a headless 5v5 match drawn from the 4-hero pool runs to a winner within budget, the same seed gives the same log hash, and `npm run check` passes.

### M2 — Watchable game

- [x] Render snapshot and interpolation
- [x] Canvas renderer: map backdrop, units, effects, overlays
- [x] Procedural sigil generator for heroes; placeholder biome palettes
- [x] App frame clock with pause, 1x, 2x, 4x
- [x] HUD: posture buttons, recall to base, hero status, phase timer, score
- [x] Draft screen: see both teams, pick hero, pick lane
- [x] Playwright smoke test

**Done when:** Cheppy can draft, watch a full match at any speed, change posture and recall, and see the result.

### M3 — Between-phase loop

- [x] Upgrade content and the pick 1 of 3 screen
- [x] Shop screen: categories, recipes, tier upgrades
- [x] Analysis layer: phase slicing, team and hero models, fight detection, badges
- [x] Phase Report: team view, hero view, map replay with fight and purchase markers
- [x] Match Report
- [x] Expand items to about 15

**Done when:** Cheppy plays a full match through every between-phase screen, and every report number traces back to log events (tested).

### Checkpoint — Is watching and shopping fun?

Cheppy plays several matches and decides go, adjust or stop. If agency feels thin, the first fix to try is one player-triggered ability per phase.

### M4 — Phases and biomes

- [x] Biome templates, slot unlocks at phases 2 and 3, `mapgen` draws
- [x] Jungle re-roll each phase; camp rewards from biome tables
- [x] Respawn curve that grows within a phase and carries over
- [x] Unlimited phases and pressure events 4–7 with stacking
- [x] Phase-10 test guard
- [x] Content: 3 biomes

**Done when:** maps differ by seed, matches past phase 3 always end, and pressure events show in the event log.

### M5 — Special systems

- [x] Keeper entity: relocation, phase stock, recall to keeper
- [x] Cursed items: trigger rule, offer screen, hidden flaw roll, AI acceptance
- [x] Holy auction: bid windows, sealed resolution, refunds, recipient choice, AI bidding
- [x] Team points and obelisks: spawn schedule, claim, rewards, team shop unlocks
- [x] Fallen Saint check (holy and cursed together)
- [x] Report additions: points, bids, curses
- [x] Content: 4 cursed items, 2 holy items

**Done when:** every special system appears in a seeded test match and is visible in the reports.

### M6 — Balance pass

- [x] Batch runner with parallel workers and seed ranges
- [x] Balance report: win rate per hero and per lane, match length distribution, item buy and win rates, curse acceptance and outcomes, auction winner win rate, comeback rate
- [x] First tuning pass in `content/` only

**Done when:** a 1,000-match report exists, every hero is within a 40–60% win rate, and median match length is 11–14 minutes.

## Internal review log

An adversarial pass on the first draft found 16 issues; all are fixed above.

| #   | Found in draft                                                        | Change                                                         |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Phase controller was in M4, but M3's screens need it                  | A basic controller moved to M1                                 |
| 2   | Logging every minion hit meant hundreds of thousands of events        | Minion and camp damage summed per second                       |
| 3   | A 1 ms tick budget meant about 4 h for 1,000 matches                  | 0.25 ms per tick plus parallel workers                         |
| 4   | An abstract renderer interface was speculative                        | Removed                                                        |
| 5   | A lint boundaries plugin added a dependency                           | Built-in `no-restricted-imports`                               |
| 6   | Summon and knockback had no hero needing them                         | Cut from v1                                                    |
| 7   | The custom-behavior escape hatch was unbounded                        | Capped at 5, each tested                                       |
| 8   | One random stream broke golden tests on unrelated changes             | 6 purpose streams                                              |
| 9   | Spirit Tide and camps need a third side                               | `neutral` team from M1                                         |
| 10  | Bundler-only content imports would break Node tools                   | Loader takes plain objects                                     |
| 11  | Auction windows started at PREP 2                                     | Windows are PREP 1–3                                           |
| 12  | Travelling to the keeper needs movement control                       | Recall to keeper = longer channel, then teleport               |
| 13  | A render snapshot every tick wastes headless time                     | Built once per frame on demand                                 |
| 14  | Fight detection in the sim added complexity for a report-only concept | Derived in `analysis`                                          |
| 15  | Hero AI could auto-recall, removing the player's main decision        | The player hero never recalls on its own                       |
| 16  | Trig can differ across browsers                                       | Determinism scoped to one build and engine; trig in one module |

## Decisions (2026-10-06)

| #   | Question                                      | Decision                                                  |
| --- | --------------------------------------------- | --------------------------------------------------------- |
| 1   | Do heroes stay where they are between phases? | Yes: keep position and hp, shop remotely                  |
| 2   | M6 balance targets                            | Every hero at 40–60% win rate; median match 11–14 minutes |
| 3   | Repo copy for the planner agent               | Yes: this file and `SOURCE_OF_TRUTH.md`                   |
