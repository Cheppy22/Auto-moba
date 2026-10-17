# Auto-MOBA decision log

> **Archived.** Merged into [SOURCE_OF_TRUTH.md](../SOURCE_OF_TRUTH.md).

This is a memory document for a new session. It records **what was decided and why** across the project. It does not cover code architecture; for that, see `docs/DESIGN.md` and `docs/BUILD_NOTES.md`. Newer decisions override older ones; superseded calls are marked ~~struck~~.

## How the owner works

These are standing instructions from the owner, Cheppy.

- **Answer style:**
  - Put the bottom line first.
  - Keep answers short and skimmable, at most 6 paragraphs.
  - End every answer with **To Do** and **Important Notes** bullets.
- **Plain language:** the owner is a novice coder. Tell them what they need to decide or do, not how the code works.
- **Wait for approval:** strategy and technical proposals wait for approval before building. Routine work goes as quick plan, then execute.
- **Drafts in chat:** draft documents in chat, and write files only when asked. Design specs meant for another model to implement go in `docs/` (for example `PLAYTEST.md` and `ITEMS.md`).
- **Name the steps:** for complex work, show a labeled division of labor and run parallel agents on separate folders.
- **Flag your own errors** immediately.
- **Git:**
  - Work on branch `test-product`, and never open a PR unless asked.
  - Push with `git push -u origin test-product` and retry on network errors.
  - End commit messages with the attribution lines from the latest system reminder.
- **Model split:** the owner switches models by task.
  - **Opus:** design, playtesting and specs.
  - **Sonnet:** implementation.
  - Say when a hand-off point is reached.
- **Publishing:** GitHub Pages deploys from `test-product`, and the Pages source must be set to "GitHub Actions". The site is https://cheppy22.github.io/Auto-moba/.

## Game identity

- **Concept:** a single-player auto-battler MOBA. You draft one hero, pick a lane, and the AI plays it. You shape the match through shopping, upgrades, suggestions and timing.
- **References:** Guildrun (auto-battler) and Deadlock (shop, minimap and map feel).
- **Theme:** the xxxHolic pocket dimension, wishes have a price, plus an esoteric, interdimensional mood.
- **Visual direction:** Dishonored-inspired, mixed with xxxHolic. Ink and lacquer surfaces, brass and washi accents, a seal red, spirit violet, ofuda paper tags, glass HUD panels and Japanese seal glyphs (対価詛).
- **Quality bar:** the owner asked for "AAA grade": polished, easy to follow, information shown unintrusively.

## Map

- **Layout:** the map is top to bottom, with your base at the bottom and the enemy base at the top. The HUD sits in the dead corners around a round playfield. ~~The square map was replaced by a round one.~~
- **Lanes:** three lanes named **Left, Mid and Right**, never top/bot in the interface. The side lanes curve, Deadlock-minimap style.
- **Jungle:** separate jungle areas with clear lane-to-jungle gates. Jungle zones open in later phases (shown as "Uncharted" until then).
- **Jungle shops:** ~~Keeper teleport~~ was removed and replaced by **two jungle shops**. They sit **diagonally**, in the bottom-left and top-right of the screen, mirrored for fairness.
- **Shop suggestions:** clicking a shop on the map adds it to your hero's suggestion queue (up to 3). It is a **suggestion, not a command**: rescues and defending outrank it. A toast shows the travel time.
- **Jungle events:** several kinds (Fox Wedding, Hundred Demons, Wishing Well, Hungry Oni). When one starts, a Send/Ignore prompt lets you send your hero; it does not pause the game.

## Heroes, draft and lanes

- **Roster:** 14 heroes, **each unique per match** (only one copy per match).
- **Draft order:** **you pick first from all 14.** The AI then fills both teams; re-picking a hero the AI took swaps it out. ~~Earlier the AI drafted 9 first and you chose from the 5 left.~~
- **Lanes per team:** 2 Left, 2 Right and 1 Mid. Mid goes to an attacker where possible. In each lane pair, the first farmer is the jungler.
- **Dispositions:** **Farmer, Attacker and Defender** replaced ~~the "usually X lane" preference~~. They tilt behavior: farmers favor camps and farming, attackers push and hunt, defenders guard towers. None of them is exclusive.
- **Push/defend choice:** ~~a player toggle~~, removed. The Farm toggle stays for non-farmers.
- **Hero codex:** on the title screen and in the draft, explaining each hero and their abilities.

## Items and shop

- **Categories:**
  - **Mind** is technique and skill with a weapon: Blade damage, attack speed and move speed.
  - **Body** is the vessel: health, armor, regen and shields.
  - **Soul** is the spirit, with a price: Soul power, resist and cooldowns.
- **Attunement:** bonuses at 2, 4 and 6 items of one category, each with a title.
- **Item sheet v2 (`docs/ITEMS.md`):** 36 items, each with at most 2 stats plus **one named rule**. Tier 3 items are **Relics** with rules that change play (cheat death, execute, cleave, cooldown resets, team shields, self-cost auras).
- **Color theory:**
  - Each category owns one hue: Mind is cobalt steel (214°), Body is moss (85°), Soul is lantern violet (264°). No other part of the game uses those hues.
  - Brightness shows tier: tier 1 muted, tier 2 full, Relic brightest with a brass rim.
  - Reserved colors: brass for gold and rarity, seal red for anything that costs you, warm white for true damage.
  - Text colors the stat words, never the grammar. Rule names are brass small caps, and every color has at least 5.7:1 contrast.
  - Markup: `{m|}` mind, `{b|}` body, `{s|}` soul, `{t|}` true, `{g|}` gold, `{p|}` price, `{r|}` rule. Cursed flaws start with "The price:".
- **Shop UI:** Deadlock style. Click an item to see its details, then confirm the purchase. The detail panel is always visible: beside the grid on desktop, docked at the bottom on phones. The recommended next item is preselected.
- **Shop pauses the match:** recalling home auto-opens the shop, but only on recalls you start yourself.
- **Tier 3 is sold only at the jungle shops,** and not in the prep shop between phases. The Keeper's roaming stock can also sell it. An obelisk now gives 25% off an item instead of unlocking it.
- **Auto-buy:** on by default for your hero. You can turn it off, and the next build item shows beside your gold.
- **Shopping while dead:** allowed, base items only.
- **Bid/auction for holy items:** ~~a sealed bid~~, **switched off** with a flag. The code is kept to bring it back later.
- **Cursed items:** when your team acquires one, a clear map notification and flash appear.

## AI behavior

- **Early game:** constant poking and prodding from the start, never idling at spawn. A stale-path bug and an oversized guardian-threat radius caused the idling, and both are fixed.
- **Mid lane:** limited over-fighting there. Rescues into mid from other lanes are discounted.
- **Fight assessment:** heroes count **themselves** in the fight math. This fixed farmers never engaging and nobody rescuing ganked allies.
- **Rescue:** heroes within about 900 units join a winnable fight. Joiners commit instead of stalling on arrival, and healers walk toward hurt allies.
- **Healing:** heroes recall when below 45% health with no enemy close, and avoid starting fights while hurt. Your hero recalls too.
- **Feeding prevention:**
  - Two deaths without a kill, or deaths minus kills of 3 or more, puts a hero in **wary mode**: no hunting, less pushing, more farming and defending, and a counter-item first.
  - Three deaths in a row **swaps lanes** with the best teammate.
- **Comeback:** a bounty for killing heroes on the richer team. A bug that had zeroed the kill-streak bonus is fixed.

## Pace, towers and structures

- **Towers were too fragile.** The report was 4 heroes taking both Left towers in 15 seconds.
- **The fix:**
  - tower health 3600, inner towers ×1.25
  - heroes deal ×0.5 damage to structures
  - towers and guardians can lose at most 9% of max health per second
- **Cost:** matches run longer, with a median around 15–16 minutes. The owner accepted this pending playtest feedback.
- **Speed:** 1×, 2×, 4× and 8×, plus pause. A phase lasts 240 seconds. Shortening phases was considered and not done, because of balance risk.

## Interface decisions

- **Phone first:** portrait and landscape both work. The HUD is decluttered and nested in the map corners so it doesn't cover lanes.
- **Upgrades:** shown as a hand of cards with before→after numbers. On phones they become a scrolling row.
- **Post-phase report:** consolidated into one screen.
  - Takeaways: towers, fights, economy, and who won the phase and why.
  - One 10-hero scoreboard with your row first and highlighted.
  - A collapsed Details section with readable event text: Left/Mid/Right, "your team" and "the enemy", item names instead of ids.
- **Your hero:** marked by a gold ring and a pulsing halo at phase start and on respawn. Tapping your portrait flashes it.
- **Map labels:** drawn last and skipped or nudged when they collide.
- **Escape** closes overlays.
- **Unspent-gold reminder** before starting a phase.

## Balance targets and method

- **Targets:**
  - hero win rates within 45–55%
  - Team A about 50%
  - median match about 12–16 minutes
  - mid lane about a third of hero time
- **Method:**
  - Tools: `npm run balance -- --matches 800`, `npm run diagnose`, and the lane-share tool.
  - Hero scaling is tested with an environment variable and then **baked into the hero files**.
  - Runs of 400 matches are too noisy (about ±3.5% per hero); decide on 800.
- **Last measured:** heroes 44.5–54.8%, Team A 52.4%, median 16.0 minutes. Item numbers are untuned.

## Open questions and known gaps

- **Player-team check:** the hands-off player-team win rate ranged 36–50%, measured over only 28 matches. Re-check it.
- **Event prompt:** the jungle-event prompt doesn't pause the match and always says "starting".
- **Phone layout:** roster icons are only shrunk, not moved to the corner bands. Report takeaways fold only in landscape.
- **Relics:** it hasn't been verified that every Relic rule fires in real simulated matches.
- **Ability text:** recommended to adopt the same color markup; not done yet.
- **Sixth hero for mid:** asked earlier, never decided.
- **Devices:** not tested on a real phone or iOS Safari.
