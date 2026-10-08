# Changelog

Newest first. One entry per change: what changed, why, and any measured effect. How the game works _now_ is in [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md); this file is history. Commit ids are on branch `test-product`.

## 2026-10-08

- **Build stamp on the chess title screen** ("Chess variant · build <commit>") and the tab title "Auto-MOBA · Chess". Why: the old and chess title screens both mention a chessboard, so Cheppy couldn't tell which build the browser was showing.
- **Chess variant playable** (branch `test-product-2`, spec [CHESS.md](CHESS.md), pieces [PIECES.md](PIECES.md)). Why: Cheppy's experimental twist.
  - Sim: five pieces per side (King, Queen, Rook, Bishop, Knight) with 3 styles each, build paths, automatic Ranks 1–8 with forks at 4 and 8, pawnlings (old minion waves) plus pawns fielded with Tempo, a random hand of gambits, Bastions and Thrones, Check and Checkmate. No player character; the 14 heroes are removed. Engine additions: stun, taunt, Knight leaps over terrain, per-style attack kind and build paths, and a fix for ally-targeted skills never casting.
  - Interface: setup board, live HUD with gambit hand, Tempo, Field Pawn and fork cards, Adjourn panel with the read-only Armory, Checkmate screen. Phone, landscape and desktop.
  - Art: chess-piece characters, ivory and ebony board, rank badges.
  - Checks: `npm run check` (173 unit tests) and the Playwright suite pass.
  - Measured (400 matches, seed 29000, gambits on both sides): White 48.1%, median 16.6 min. With gambits off for both sides White wins only 44.1%, so a bias against White remains (same pattern as `test-product` after the walls change). Outlier styles: Shadow, Regent, Errant and Battering Ram win 58–62%; Duelist, Lancer and Light win 40–44%. Not tuned yet.
- **Chess variant spec** ([CHESS.md](CHESS.md), branch `test-product-2` only). Five chess pieces per team replace the heroes, no player character, pawns replace minion waves, continuous Acts with Ranks, forks and a random Gambit hand. Why: Cheppy's experimental twist, workshopped and approved 2026-10-08.
- **Second test site** at `/v2/`. The Pages workflow now builds `test-product` at the root and `test-product-2` (the chess experiment) under `/v2/`; a push to either branch redeploys both. If the v2 build fails, the main site still deploys. Why: Cheppy wants to play the experimental branch in a browser.

## 2026-10-07

- **3D island and mobile shop** (in progress, committed for testing). Why: Cheppy asked for a physical 3D map as the default and a shop that stops covering the phone screen.
  - Map: the 3D view is the only view; the 2D map is deleted. Raised bases, valley lanes, cliffs and forest outside the walkable shapes, a river with fords, and sealed jungle clearings that open by phase. Units are kept inside walkable space by the sim; the unit-level stall test is in `tests/terrain.test.ts`.
  - Interface: tappable shop pins over the 3D view. Shop: bottom sheet on phones, side sheet in landscape, drawer on desktop.
  - Checks: `npm run check` and all 5 Playwright tests pass. Not yet done: balance re-measure after the walls, a real-phone test, and the Sim/Art polish passes listed as open in the source of truth.
- **Wonderland blend, content and text pass** (spec [WONDERLAND.md](WONDERLAND.md); the art half is a separate entry). Data and text only, no engine code.
  - Four hero reskins with new ids, files, names, ability and upgrade text, sigil glyphs and hues, all numbers unchanged: Last Train `revenant` to The White Rabbit `rabbit`; Hatsu `rickshaw` to The Hatter `hatter`; Ashen Smelter `smelter` to The Queen of Hearts `queen`; The Hollow Cartographer `cartographer` to The Caterpillar `caterpillar`. Sigil hues nudged off clashes: rabbit 65 (cat is 48), hatter 150 (miko 172), queen 10 (ronin 350, oiran 345), caterpillar 235. Four glyphs added to the sigil schema: `watch`, `teacup`, `heart`, `mushroom`.
  - The Single Cut is now Vorpal Blade (`vorpal_blade`); its rule is named Snicker-Snack, same execute numbers. Two new cursed items: Drink Me (+20% move speed, +15% attack speed; price max health −15%) and Eat Me (+25% max health, +10 armor; price move speed −15%).
  - Two new biomes joined the pool: Tea Party Glade (station tiers, attack speed camp buff) and Croquet Rose Garden (foundry tiers, Blade damage buff). Two new jungle events: Unbirthday Tea Party (well family) and The Jabberwock (oni family, ×1.25 health and slam damage).
  - Chess framing text: guardian shows as White King or Red King, "Restless Guardians" is now "The Kings Wake" (rule id and event id unchanged), the report ends with "Checkmate: the White Court wins" (or Red), Team A and B are the White and Red Court on the title, draft and report header, and the Keeper is the Cheshire Keeper in text.
  - Tests: hero ids renamed; counts for cursed items (6), biomes (5) and events (6) updated. The determinism and golden tests compare runs with each other rather than stored hashes, so no fixture needed regenerating.
  - Measured (800 matches, seed 29000): heroes 43.3–57.7%, Team A 52.8%, median 16.0 min (p90 22.1). Outside 44–56%: Rabbit 57.7%, Hatter 56.8%, Sweep 43.3%. Not retuned; the new biomes, events, cursed items and reseeded rolls all shifted at once, so re-measure before tuning.
- **Wonderland blend, art pass** (spec [WONDERLAND.md](WONDERLAND.md)). Four new sigil glyphs; chess-king guardians with rage glow, pawn minions (ranged pawns hold a card), the Cheshire grin Keeper that fades in and out, checkerboard base floors, Tea Party Glade and Croquet Rose Garden art and props in 2D and 3D, a Jabberwock model, and director captions "King under siege", "The King marches" and "Checkmate". Render only, no balance effect.
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
