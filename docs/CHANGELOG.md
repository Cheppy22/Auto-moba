# Changelog

Newest first. One entry per change: what changed, why, and any measured effect. How the game works _now_ is in [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md); this file is history. Commit ids are on branch `test-product`.

## 2026-10-10

- **Map ×1.5, humanoid pieces, combat flash, lane tag, gambit long-press** (branch `test-product-2`). Why: Cheppy's requests.
  - Map size 1950 (×1.5); lanes ×1.25 (half-width 90); unit sizes unchanged; `movement.speedMul` 1.5 so travel time is about the same.
  - Pieces are humanoids with a unique design each (King, Queen, Rook, Bishop, Knight); each style adds a large style-colour area and a signature prop; pieces look generic until a style is chosen, with a transformation flare.
  - Roster portraits pulse red while a piece is in combat; the lane tag follows permanent lane changes and flashes; holding a gambit card (or right-click) opens it enlarged and pauses the game.
  - Measured (800 matches, seed 29000): White 45.8% (target 48–52, open), median 14.5 min, p90 23.8. Light testing per Cheppy; full testing pass later.

## 2026-10-09

- **The Grand Board: chess look pass** (branch `test-product-2`, direction in [CHESS.md](CHESS.md) "Look"). Why: Cheppy found the game unpolished and still dressed in the old spirit-shop and Wonderland theme.
  - Interface: new palette (ebony, walnut, mahogany, ivory, bone, brass; baize green for selected; slate for Black; clock red only for danger). Checkerboard title screen with a new tagline, ivory primary buttons, chess-clock Act timer, brass Tempo meter. Seal stamp, butterflies, ritual rings and the old font removed.
  - 3D board: stone chessboard ground, marble lanes with brass borders (no coloured stripes), castle bases, sunken checkered courts for jungle clearings, iron gates and light mist on sealed clearings (no domes), a stone canal with bridges, a formal garden (hedges, chess topiary, balustrades, cypress) replacing forest and mushrooms, warmer lighting. Piece badges stack instead of piling up.
  - Measured: draw calls −4.5% (desktop) and −10% (phone) at the wide shot. No gameplay change.
- **Wider lanes, bigger map, soft collision** (branch `test-product-2`). Why: Cheppy found lanes too narrow to spectate; pieces were passing through each other.
  - Map scaled ×1.3 (size 1300); lane half-width 40 → 72. Map-scale distances in tuning and AI scaled by the same factor.
  - Soft collision (`src/sim/collision.ts`): units push apart by body size and mass (pieces > pawns > pawnlings); structures don't move. Deterministic. Tests in `tests/collision.test.ts`.
  - 3D world follows the map size and lane width (`src/render/broadcast/scale.ts`).
  - Measured (800 matches, seed 29000): White 46.9% (target 48–52, open), median 15.9 min, p90 28.2. Before: 48.1%. Compute 0.207 ms/tick, a little over the 0.25 target on one long run. Ablation suggests collision between same-team units lowers White's rate; probably noise plus a small bias, not yet confirmed.
- **Report overhaul** (branch `test-product-2`). Why: Cheppy wanted graphs, a Deadlock-style result splash up front, and swipeable tabs for different status reports.
  - Data: `buildSummary` in `src/analysis/summary.ts` (rows, team totals, MVP, awards, 10 s series, timeline, objectives). Every number traces to the event log (`tests/summary.test.ts`). MVP score = 3·kills + 1.5·assists + 40·damage share + 15·healing share + 25·objective share − 2·deaths.
  - Screens: a scroll-snap pager with tabs Result, Economy, Combat, Objectives, Pieces, Replay and Log (swipe, arrows, keys). Result splash: Checkmate banner, both scoreboards (style emblem, rank, K/D/A, damage, healing, gold, items), MVP crown, award chips, team-total bars. Charts are in-house SVG (no new dependency): gold lead, gold by team and source, rank over time, damage by type, damage taken vs healing, kills, pieces alive, fights, Bastion/Throne/Check timeline, gambits and Tempo split.
  - Known gaps: pawns-alive and shielding are not in the log; starting lane is inferred; the Replay page still draws the old island map; "Same seed" returns to setup with default styles.
- **Chess feedback round 1** (branch `test-product-2`). Why: Cheppy found the screen cluttered, enemy styles hard to tell apart, and wanted the game to pause at fork ranks.
  - Forks now pause the game (Rank 4 and 8) until the player chooses; "Let the AI choose" button; no timeout (reversal recorded in the source of truth). The sim halts `step` when a White fork opens (`MatchConfig.pauseForForks`, on in the app, off for balance runs); `autoForks` command.
  - Style distinction: 15 style emblems and colours (`src/render/emblems.ts`), a signature prop per style on the 3D pieces, style-coloured ground rings, emblems on both rosters, and a piece card (tap or hold a portrait, or tap a piece).
  - Calm HUD: slim top row with cycling speed and camera controls, no rank pips, gambit cards show name and cost, no health bars on full-health pawns, fewer ambient effects.
  - Measured: draw calls +5%, triangles +3.5% at the wide shot. No sim balance change.

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
