# Auto-MOBA: source of truth

**This is the one living description of the game as it is built now.** If another doc or a task conflicts with this file, this file wins until Cheppy changes it.

- What changed and when: [CHANGELOG.md](CHANGELOG.md). Never put history in this file.
- How the code is organized: [ARCHITECTURE.md](ARCHITECTURE.md).
- Dated specs and reports this file links to: [ITEMS.md](ITEMS.md), [PLAYTEST.md](PLAYTEST.md), [BALANCE_REPORT.md](BALANCE_REPORT.md), [BROADCAST.md](BROADCAST.md), [WONDERLAND.md](WONDERLAND.md).
- Old design docs, kept for history only: [archive/](archive/).

## Update rules (every session must follow these)

1. If a change alters how the game works, **edit the matching section here**. Overwrite the old text; don't append "was X, now Y" notes.
2. **Every** change gets one entry at the top of [CHANGELOG.md](CHANGELOG.md): date, what changed, why, and any measured effect.
3. If you reverse an earlier decision, add a row to "Reversed decisions" below so nobody brings it back.
4. Numbers that go stale (balance results, match length) live in the "Last measured" block. Re-measure instead of trusting them.

## Working agreement with the owner (Cheppy)

- **Answers:** bottom line first; short and skimmable (at most 6 paragraphs); end with **To Do** and **Important Notes** bullets.
- **Plain language:** the owner is a novice coder. Say what needs deciding or doing, not how code works.
- **Approval:** strategy and technical proposals wait for approval before building. Routine work goes as a quick plan, then execute.
- **Documents:** draft in chat; write a file only when asked. Specs another model implements go in `docs/`.
- **Complex work:** show labeled steps or roles, and run parallel agents on separate folders.
- **Errors:** flag your own mistakes immediately.
- **Git:**
  - Work on branch `test-product`, and never open a PR unless asked.
  - Push with `git push -u origin test-product`, retrying on network errors.
  - End commit messages with the attribution lines from the latest system reminder.
- **Models:** the session stays on Opus, which designs, writes specs, reviews and integrates. It delegates through subagents: Sonnet builds features, and Haiku does mechanical bulk work (renames, sweeps, formatting), which is always reviewed before commit. Say which agent and model did each piece.
- **Publishing:** GitHub Pages deploys from `test-product`. The Pages source must be set to "GitHub Actions". Site: https://cheppy22.github.io/Auto-moba/.
- **Run it:** see [README.md](../README.md). `npm run check` runs typecheck, lint, prettier and unit tests; `npx playwright test` runs the browser tests.

## Identity

- **Pitch:** a single-player auto-battler MOBA. You pick one hero and a lane on a 5v5 team of AI, then shape the match through items, upgrades, shop suggestions and timing.
- **Setting:** a pocket dimension pulling from many places and times (xxxHolic). Spirits and esoteric entities everywhere; every wish has a price. Wonderland is the newest realm it pulls from, with Lewis Carroll's two Alice books and Tenniel's illustrations as the only sources (spec: [WONDERLAND.md](WONDERLAND.md)).
- **Why the teams fight:** the pocket dimension is a Looking-Glass chessboard in the back room of a wish-shop. Everyone who fell down the rabbit hole made a wish, and the price is to serve as a piece in the game between the White Queen and the Red Queen. Team A (yours) is the **White Court** and Team B is the **Red Court**; interface text keeps "your team" and "the enemy" where those read better.
- **References:** Guildrun (build depth, role-bending builds); Deadlock (shop, item categories, boss guardian, minimap feel).
- **Look:** Dishonored-inspired with xxxHolic: ink and lacquer surfaces, brass and washi accents, seal red, spirit violet, ofuda paper tags, glass HUD panels, Japanese seal glyphs (対価詛). Wonderland adds card suits, clock faces, keyholes and a low-contrast checkerboard floor under the bases (never in item category colors). Art is drawn by code: sigils and shapes, no image files. Quality bar: "AAA grade", polished, easy to follow, information shown unintrusively.

## The game

### Format and win condition

- You control 1 hero on a 5v5 team; the other 9 are AI. Both teams are AI-driven; you influence yours.
- **Win:** destroy the enemy **King** (White King, Red King; internally still the guardian), a bound spirit in each base. That is **Checkmate**, shown on the end screen as "Checkmate: the White Court wins" (or the Red Court). Kings have rage stages and, from phase 7, leave their bases. Minions are drawn as pawns and towers stay stone lanterns.

### Draft and lanes

- **14 heroes, each unique per match** (never two copies). **You pick first from all 14**, then choose a lane. The AI then fills both teams from the rest. Re-picking a hero the AI took swaps it out of the AI teams.
- **Dispositions:** every hero is a **Farmer, Attacker or Defender**. A disposition tilts behavior (farmers favor camps and farming, attackers push and hunt, defenders guard towers); none is exclusive. Each hero also has a personality (reckless, cautious, opportunist, steadfast) that shapes retreat and fight thresholds.
- **Lanes:** 2 heroes in the Left lane, 2 in the Right lane, 1 in Mid. Mid goes to an attacker where possible; a pair gets different dispositions where possible. In a pair the first farmer is the jungler.
- **Names:** the lanes are called Left, Mid and Right in every interface. (Internal ids are still `top`, `mid` and `bot`.)
- **Hero codex:** on the title screen and in the draft, it explains each hero and their abilities.

### Map

- A 3D island (three.js, the only view): bases on raised daises at opposite corners, lanes as valley roads, cliffs and forest outside the walkable shapes, a river crossing Mid with fords, and jungle clearings sealed by mist and ofuda until their phase opens them. Units walk inside the walkable shapes in `src/sim/world/terrain.ts`; cliffs match those edges. Height is visual only.
- **Jungle areas** connect to lanes through gates. The 3-lane skeleton is fixed; jungle zones open in mirrored pairs over phases 1–3 (shown as "Uncharted" until then) with randomized biomes (five: Midnight Station, Hollow Foundry, Drowned Shrine, Tea Party Glade and Croquet Rose Garden). Mirrored pairing is a fairness requirement (guarded by `tests/symmetry.test.ts`).
- **Two jungle shops** sit diagonally: Western Stall (bottom-left of the screen) and Eastern Stall (top-right), mirrored for fairness. Standing at one lets a hero buy the base catalog and tier 3.
- **Cheshire Keeper:** a roaming NPC (a crescent grin on the map, labelled "Cheshire", that fades in and out as it moves) that stocks a few tier-3 items during a phase and moves each phase. It is reached on foot. The Keeper teleport no longer exists.
- **Recall** goes only to base (3 s), is interrupted by damage, and auto-opens the shop for the player's own recalls.

### Phases and pace

- Phases last about 4 minutes (240 s) of play; there is no phase cap. The median match is about 12–16 minutes.
- **Pressure events** stack from phase 4: Thinning Veil (phase 4, healing reduced map-wide), Spirit Tide (5, jungle camps push into lanes), The Cheshire Keeper Calls In Debts (6, cursed items double in power and flaw), The Kings Wake (7+, both Kings leave their bases and fight in the lanes; this ends the game).
- **Between phases:** phase report, then pick 1 of 3 ability upgrades, then shop (tiers 1–2 only), then any curse offer. Heroes keep their position and health and shop remotely.
- **Speed:** pause, 1×, 2×, 4×, 8×. The match is paused while the shop is open.
- **Respawn:** starts short, grows during a phase, carries over between phases.
- **Growth:** no XP or levels. Heroes grow by phase stat growth (8% health, Blade damage and Soul power per phase), items and ability upgrades.

### Structures

- Tower health is 3600 (inner towers ×1.25); tower damage 100.
- Heroes deal ×0.5 damage to towers and guardians, and any tower or guardian can lose at most 9% of its max health per second. Reason: four heroes once razed a whole lane in 15 seconds.
- Minions deal growing damage to structures each phase.

### Jungle events

Timed events pull heroes out of lanes. They are announced 10 s ahead, run, then end; nothing crosses a phase. Definitions are data in `content/events/jungle.json`.

| Event                | What happens                                                                                        | Reward                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Fox Wedding          | A procession of lantern spirits and a bride walks between two slots; ignored by minions and towers. | Gold per bearer; 2 points for the bride.                                |
| Hundred-Demon Parade | 7 neutral demons march down a side lane toward one base, attacking everyone.                        | Team with more hero kills (at least 3): 3 points and 100 gold per hero. |
| Wishing Well         | Hold it with no enemy hero near for 8 s.                                                            | Team buff (+10% Blade and Soul power, 90 s) and 1 point.                |
| Hungry Oni           | Elite neutral with a telegraphed ground slam every 7 s; leaves after 100 s.                         | 150 gold to the killing team, 150 more to the killer, 4 points.         |
| Unbirthday Tea Party | Like the Wishing Well: hold the tea table with no enemy hero near for 8 s.                          | Team buff (+12% attack speed, +6% move speed, 90 s) and 1 point.        |
| The Jabberwock       | Hungry Oni family from phase 3: ×1.25 health and slam damage.                                       | 200 gold to the killing team, 200 more to the killer, 5 points.         |

- Single-site events (Well, Tea Party, Oni, Jabberwock) use slots equidistant from both bases; procession routes and parade lanes are random, so fair in expectation.
- The player can answer an event with a **Send/Ignore** prompt (8 s). Send makes the hero favor that event. The prompt does not pause the match.

### Obelisks

Minor random objectives that give team points plus a small buff, gold, or a **25% discount on one tier-3 item** (at the jungle shops).

### Items and shop

- **Categories:**
  - **Mind** is technique and skill with a weapon: Blade damage, attack speed, move speed.
  - **Body** is the vessel: health, armor, regeneration, shields.
  - **Soul** is the spirit, with a price: Soul power, resist, cooldowns.
- **36 items:** 12 per category over three tiers (5 tier 1, 4 tier 2, 3 tier 3). Tier 2 combines two tier-1 parts; tier 3 combines one or two tier-2 parts. Prices run about 250–350, 800–1000 and 1700–2100. Six item slots.
- **Items have character:** at most two stats plus **one named rule**. Tier 3 items are **Relics** whose rules change how a hero plays (cheat death, execute, cleave, cooldown resets, team shields, self-cost auras). The sheet is in [ITEMS.md](ITEMS.md); the numbers live in `content/items/*.json`.
- **Attunement:** owning 2, 4 and 6 items of one category gives titled bonuses.
- **Where to buy:** tiers 1–2 at base and at the jungle shops; **tier 3 only at the jungle shops** (and from the Keeper's stock). Never in the between-phase shop. A dead hero can still buy base items.
- **Auto-buy:** the player's hero buys its build list on its own by default, as AI heroes do. It can be turned off; manual buying always works. The next build item shows beside the gold.
- **Shop UI:** Deadlock style. Click an item to read it, then confirm the purchase. The detail panel is always on screen. The recommended next item is preselected.
- **Shop suggestions:** tapping a shop pin (or a shop in the shop panel) queues it (up to 3) as a **suggestion, not a command**. Rescuing allies and defending outrank it. A toast shows the travel time.
- **Colors (the item color theory):**
  - Each category owns one hue: Mind is cobalt steel, Body is moss, Soul is lantern violet. No other part of the game uses those hues.
  - Brightness shows tier: tier 1 muted, tier 2 full, Relic brightest with a brass rim.
  - Brass means gold and rarity, seal red means anything that costs you, warm white means true damage.
  - Descriptions color the stat words, never the grammar. Rule names are brass small caps.
  - The color follows the stat, not the item: move speed is Mind-colored even on a Body item.
  - Markup: `{m|}` mind, `{b|}` body, `{s|}` soul, `{t|}` true, `{g|}` gold, `{p|}` price, `{r|}` rule. Text contrast is at least 5.7:1 and color is never the only signal.
  - The palette is in [ITEMS.md](ITEMS.md); the tokens are in `src/ui/css/tokens.css`.

### Cursed and holy items

- **Cursed items** (six, including **Drink Me**: +20% move speed and +15% attack speed for −15% max health; and **Eat Me**: +25% max health and +10 armor for −15% move speed): offered to the furthest-behind hero on the losing team (below 75% of average net worth), at most one per phase, from phase 2. The flaw type is visible and the exact flaw is hidden until accepted. Curses are permanent, can be refused, and AI heroes take them too. Every flaw text starts "The price:".
- **When a hero takes one,** a clear map notification, a screen pulse for your own hero, and a pulsing aura for the rest of the match make it obvious.
- **Holy item:** one per match, intended to be won in a sealed auction. **The auction is switched off** (`auction.enabled: false`); the code and tests remain, so holy items are not currently awarded.
- A hero may hold holy and cursed items at once (the "Fallen Saint").

### AI behavior

Each hero re-plans about once per second and scores goals (farm lane, push tower, defend, clear camp, join fight, hunt, take obelisk, contest event, visit shop, retreat) as a base value times its disposition weights, with a small bonus for its current goal.

- **Early game:** constant skirmishing from the start, never idling at spawn.
- **Fight assessment:** a hero counts itself in the fight math. This is why farmers now join fights and allies rescue the ganked.
- **Rescue:** heroes within about 900 units join a winnable fight and commit on arrival. Healers walk toward hurt allies. Rescues into Mid from other lanes are discounted so Mid doesn't swallow every fight.
- **Healing:** a hero below 45% health with no enemy close recalls; hurt heroes avoid starting fights. The player's hero recalls too.
- **Anti-feeding:**
  - Two deaths without a kill (or deaths minus kills of 3 or more) puts a hero in **wary mode**: no hunting, less pushing, more farming and defending, and a counter-item bought first.
  - Three deaths in a row **swaps lanes** with the best teammate.
- **Team siege:** with 4 or more heroes alive, as many as the enemy and healthy, the team converges on the enemy lane with the fewest towers (or the exposed guardian), staging until two heroes gather or a wave arrives.
- **Lane discipline:** lane-bound goals follow the lane path, not the shortest path through the middle. Mid's share of hero time stays around a quarter.
- **Base defense:** threats near the guardian pull defenders at high priority.
- **Shopping:** AI heroes recall to base to spend gold and walk to a jungle shop when they can afford a tier-3 item.
- **Comeback:** killing a hero on the richer team pays a bonus bounty.

### Reports

- Data and factual badges only, never conclusions or advice; learning what patterns mean is part of the game.
- One screen after each phase: three or four takeaway lines, one 10-hero scoreboard (your row first), and a collapsed Details section with hero view, path replay and an event log written in plain words (Left/Mid/Right, "your team"/"the enemy", item names).

### Interface

- **Phone first:** portrait and landscape both work; the HUD sits in the map corners and doesn't cover lanes.
- **Upgrades** appear as a hand of cards with before→after numbers (a scroll-snap row on phones).
- **Your hero** has a gold ring and a pulsing halo at phase start and on respawn; tapping your portrait flashes it.
- **Map labels** are drawn last and nudged or skipped on collision.
- Escape closes overlays; an unspent-gold reminder appears before starting a phase; the Shop tab shows your gold.
- **View** (spec: [BROADCAST.md](BROADCAST.md)): the three.js 3D view is the only game view. The 2D map is removed. Jungle shops are tapped as HTML pins over the 3D view.
  - **Auto** camera works like an NFL broadcast: a high wide shot when it's quiet, a sideline camera that dollies onto the most important play (guardian siege, tower falls, multi-kills, team fights, kills, jungle events, skirmishes), and a lower-third caption naming the play.
  - **Follow** tracks your hero; tap any roster portrait to follow that hero instead. **Free** lets you drag, zoom and turn the camera.
  - Art is built from code. Physics (ragdolls, debris) is visual only and never affects the match. If WebGL is missing, the game shows a clear message instead of a picture.

## Balance targets and method

- **Targets:** hero win rates 45–55%, Team A about 50%, median match about 12–16 minutes, Mid about a quarter to a third of hero time.
- **Method:** `npm run balance -- --matches 800 --seed 29000 --quiet` writes `out/balance.md`. `npm run diagnose` measures engagement, healing, rescues, feeding and tier-3 buys. `tools/lane-share.ts` measures lane share. Test hero scaling with the `BALANCE_SCALE` environment variable, then bake it into `content/heroes/*.json`.
- **Noise:** 400 matches gives about ±3.5% per hero. Decide on 800.
- **Last measured** (after the Wonderland content pass, 800 matches, seed 29000): heroes 43.3–57.7%, Team A 52.8%, median 16.0 minutes (p90 22.1). Outside the 44–56% band: Rabbit 57.7%, Hatter 56.8% (high) and Sweep 43.3% (low); not yet retuned. Drink Me and Eat Me teams won 40.2% and 45.6% when accepted (about 200 cases each). Item numbers are untuned.

## Known weaknesses and open questions

- **Balance:** a few heroes (Oiran, the White Rabbit, the Queen of Hearts, Ronin) die 8 or more times per match, mostly durability balance. Matches got longer after the tower change (median about 16 minutes); the owner accepted this pending playtest feedback.
- **Relics:** it hasn't been verified that every Relic rule fires in real simulated matches; each is unit-tested individually.
- **Hands-off player:** your team's win rate with a player who never touches the shop was 36–50% over 28 matches (14% before auto-buy). Re-check.
- **Interface gaps:**
  - The event prompt doesn't pause the match and always says "starting".
  - Phone roster icons are shrunk, not moved to the corner bands.
  - Report takeaways fold only in landscape.
  - The portrait shop's docked panel may still cover tiles.
- **Untested:** real phones and iOS Safari. The Pages blank-page report from early on was never confirmed resolved.
- **Undecided:** a sixth hero per team so Mid also has a pair; ability text using the same color markup (recommended).
- **Engagement:** the in-phase decision space is still thin: suggestions, recall, farm toggle, event prompts. Does the player feel in control?
- **Missing:** audio, keyboard shortcuts, save and load, a download button for replay export.

## Shelved on purpose

Meta-progression between matches; era-themed lane identity; "The Core" alternate mode (circle map, fog phases, final arena fight); multiple AI difficulty levels (one neutral level for now).

## Reversed decisions (don't bring these back)

| Old decision                                              | Replaced by                                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Square map with right-angle lanes                         | Rounded map with curved side lanes                                                                          |
| Teleport to the Keeper                                    | Removed; the Keeper is reached on foot                                                                      |
| Two jungle shops both on the Left side                    | Diagonal pair (bottom-left and top-right)                                                                   |
| Tier 3 sold between phases and by obelisk unlock          | Tier 3 only at jungle shops (and the Keeper's stock); obelisk gives 25% off                                 |
| Sealed team auction for the holy item                     | Switched off with a flag                                                                                    |
| Posture picker (Push/Farm/Defend)                         | Dispositions; only a Farm toggle remains, hidden for farmers                                                |
| "Usually X lane" hero preference                          | Farmer/Attacker/Defender dispositions                                                                       |
| AI drafts 9 heroes first, you choose from the rest        | You pick first from all 14                                                                                  |
| Duplicate heroes allowed                                  | One of each hero per match                                                                                  |
| Category names Blade/Flesh/Soul                           | Mind/Body/Soul                                                                                              |
| Player's hero never buys or recalls on its own            | Auto-buy and heal recall for the player (toggleable)                                                        |
| Towers: 3000 health, heroes at full damage                | 3600 health, ×0.5 hero damage, 9% per second cap                                                            |
| Reports as separate team, hero and totals views           | One scoreboard screen with a collapsed Details section                                                      |
| Canvas 2D only, no drawing library                        | 2D map plus a lazy-loaded three.js Broadcast view                                                           |
| 2D map as the default view, with a Map / Broadcast toggle | The 3D terrain is the only view; the 2D map is deleted                                                      |
| Why the teams fight is deliberately undecided             | White Queen vs. Red Queen chess game on a Looking-Glass board (White Court and Red Court, Kings, Checkmate) |

## Where to look first (for code work)

1. `src/sim/ai/strategic.ts` and `src/sim/behavior.ts`: most of the AI heuristics; constants are inline or in `content/tuning.json` under `ai`.
2. `src/sim/phase.ts` and `src/sim/commands.ts`: every rule the player can trip.
3. `src/sim/combat.ts`: damage, effects, item triggers and custom behaviors.
4. `src/sim/shop.ts` and `src/sim/ai/shopping.ts`: access rules and AI purchases.
5. `src/analysis/index.ts`: report numbers and event text.
6. Determinism: any new `Map` or `Object.entries` iteration in `src/sim` must have a stable order; lint bans `Math.random`, `Date.now` and platform globals there.
