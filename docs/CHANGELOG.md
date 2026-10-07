# Changelog

Newest first. One entry per change: what changed, why, and any measured effect. How the game works _now_ is in [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md); this file is history. Commit ids are on branch `test-product`.

## 2026-10-07

- **Broadcast view** (spec [BROADCAST.md](BROADCAST.md)). A three.js spectator view toggled from the speed panel: a director picks the most important play each moment and an NFL-style camera dollies or cuts to it with a lower-third caption; Follow and Free camera modes; roster portraits pick who to follow. Art built from code, visual-only ragdoll and debris physics. Why: Cheppy wanted to watch fights up close, Deadlock-style, without changing the game. three.js is a new dependency (approved) and loads only when the view is opened, so the 2D game's load is unchanged. The sim is untouched (no balance effect).
- **Docs consolidated** (this commit). `SOURCE_OF_TRUTH.md` (living game description) and this changelog replace `DESIGN.md`, `BUILD_NOTES.md` and `DECISIONS.md`, which moved to `docs/archive/`. `ARCHITECTURE.md` stays.
- **Decision log added** (`80695d0`), later merged into the source of truth.
- **Item sheet v2** (`264b0a8`, spec `810ff99`).
  - All 36 items rewritten: at most two stats plus one named rule, tier 3 items are Relics.
  - Engine: trigger filters `vs`, `ofType`, `everyNth`, `hpBelow`; stacking `maxStacks`; target `nearestEnemyHero`; custom behaviors `outOfCombat`, `inCombat`, `execute`, `lastStand`, `cooldownTick`, `payHp`, `payPct`.
  - Item color theory (one hue per category, brightness for tier) and a text markup rendered by `src/ui/richtext.tsx`. Cursed and holy texts use it too.
  - Measured (800 matches): heroes 44.5–54.8%, Team A 52.4%, median 16.0 min.
- **Playtest 1 fixes** (`77d1afb`, findings `52afe83`). All 27 items in `docs/PLAYTEST.md` except three gaps.
  - Player's hero: auto-buy (toggleable) and heal recall, as the AI heroes have.
  - Shopping while dead; no Keeper stock in the between-phase shop.
  - Comeback bounty, and a fix for the kill-streak bounty that read a zeroed streak.
  - Draft: you pick first from all 14 heroes, then the AI fills both teams.
  - Interface: shop details always visible, upgrade cards that fit phones with before→after numbers, a consolidated report with takeaways and an expandable scoreboard, readable event log, hero ring and halo, map label collisions, Escape closes overlays, an unspent-gold reminder, 8× speed, and a Send/Ignore prompt for jungle events.
  - Effect: a hands-off player's team win rate went from 14% to 36–50% (28 matches).
- **Tower tuning** (`e4fd380`). A report that four heroes razed a lane in 15 s. Towers now 3600 health (inner ×1.25), heroes deal ×0.5 to structures, and structures lose at most 9% max health per second. Median match length rose from about 12 to about 15 minutes.

## 2026-10-06 (test-product work)

- **Fix AI engagement, rescues, healing and feeding** (`4950272`).
  - Heroes count themselves in fight math, so farmers join fights and allies rescue the ganked.
  - Healing thresholds and careful fight entry.
  - Wary mode and lane swaps after repeated deaths.
  - Second jungle shop moved to the diagonal corner; tier 3 only at jungle shops.
  - Auction and bids switched off; new shop, upgrade and report screens.
  - Measured: farmers' join-fight goal went from 0% to 7–16% of the time; heroes ending with a tier-3 item went from 36% to 45–52%.
- **Loosen a 3-seed mid-lane time bound** (`6e98466`). The test was fragile; the 100-match mid share is 25%.
- **Diagnostics tool** (`cc7666c`): `npm run diagnose`.
- **Fix passive early game, add dispositions, rebalance** (`b791c85`).
  - Heroes idled at spawn because a stale path was kept when a goal moved less than 40 units, and the guardian threat radius was oversized.
  - Farmer, Attacker and Defender dispositions replaced the "usually X lane" preference; lanes are 2 Left, 2 Right, 1 Mid.
  - Measured: median 11.9 min, all heroes 44–54%.
- **Big update** (`d711ffe`): 14 unique heroes (one per match), 36 items, jungle events and two jungle shops with a suggestion queue, curse notices, Keeper teleport removed, rounded map, AAA-grade UI overhaul with a design system.
- **Lane discipline AI and a nine-hero balance pass** (`5416654`). Mid had carried 89% of hero damage; lane-bound goals now follow the lane path.
- **Fix untappable phone-portrait dock buttons** (`4de420c`). A CSS cleanup had removed a pointer-events rule; caught by the CI browser test.
- **Item categories renamed Mind/Body/Soul, attunement bonuses, balance** (`077aaec`).
- **UI pass 2** (`ae6484f`): hero codex, decluttered corner HUD, Deadlock-style shop, map gates.
- **Lane names shown as Left and Right** (`e708613`).
- **Map rotated top-to-bottom, HUD nested in corners, xxxHolic/esoteric theme** (`2e0bafa`).
- **Dishonored-inspired UI theme** (`ef269c2`).
- **Deploy test-product to GitHub Pages** (`7708050`).
- **Phone layouts and touch controls** (`54b3abd`).

## 2026-10-06 (initial build, branch `claude/architecture-docs`)

- **Design baseline and architecture docs** (`0e64caf`).
- **M1** (`92180a1`): deterministic simulation core, content pipeline, AI, headless runner, tests.
- **M2** (`f76cf3a`): watchable game: canvas renderer, sigils, HUD, draft, frame clock, browser smoke test.
- **M3** (`0e77cb5`): between-phase loop: analysis layer, phase and match reports, replay.
- **M4 and M5 tests** (`e888eac`): phases, biomes, pressure, Keeper, curses, auction, obelisks.
- **M6** (`4adb2ba`, `e4500e0`): balance runner, pairwise matrix, AI siege and defense, tuning, fairness fixes, curse tuning, report fixes. Found: a friendly-fire bug in area abilities, team asymmetry from biome pairing (fixed by mirroring), and an iteration-order bias.
- **Polish** (`0243c9e`).

## Notes carried from the original build (still true)

- No projectiles and no collision: attacks and abilities resolve instantly, and units may overlap.
- Abilities never target structures; only auto-attacks damage towers and guardians.
- Unit iteration order rotates each tick, and units with a lethal hit pending still act that tick (otherwise the first unit always won simultaneous kills).
- Numbers mostly live in `content/tuning.json`; AI scoring weights in `src/sim/ai/strategic.ts` and `behavior.ts` are mostly inline.
- Determinism: the same seed gives an identical event log; replay export reproduces a match exactly.
