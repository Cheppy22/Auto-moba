# Techniques phase 0: what items add, and the Rank growth that replaces them (2026-10-18)

Phase 0 of [SPEC-PIECE-BUILDS-2026-10-18.md](SPEC-PIECE-BUILDS-2026-10-18.md) (4.8 step 1). Branch `wip/techniques-core`, Long Board, AI vs AI. Linked from [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md).

## BLUF

- **Items add far more than the spec's guess.** At the start of Act 3 (median piece at Rank 5) items give **+24% health and +60% to the piece's main damage stat**; by Act 4, +39% and +86%. They leave the other damage stat alone (median +0%).
- **Replacement growth, per Rank above 1: health +15.5%, main damage stat +45%**; the other of Blade and Soul keeps today's 4.5% (`builds.rankGrowth`). Today `ranks.growth` is 4.5% on all three while items are live; the spec guessed 9%.
- **It applies only when items are off** (`MatchConfig.items: false`, `npm run balance -- --no-items`). Nothing changes in today's game.
- **Probe, items off with this growth vs today (200 matches each, same seeds):** White 50.5% (today 51.0%), median **14.6 min** (today 13.1), p90 23.0 (18.5), kills 25.0 (22.4).
- **Growth alone cannot close the last 1.5 minutes.** Raising damage from 35% to 45% left the median at 14.5–14.6 in every probe; the long matches are ones where the Throne falls and the King holds on. That points at play without shops (pieces no longer leave lanes to buy) and the endgame, not at stats. Phase 4/6 should look there, not raise growth further.
- **Piece types differ:** Queens and Knights get almost no health from items (+6%) and Rooks no damage (+0%); one curve for all moves power between them. Phase 6 watches piece win rates.

## How it was measured

- `npx tsx tools/item-power.ts --matches 60 --seed 29000` (new tool): 60 AI-vs-AI matches, seeds 29000–29059, median 12.8 min. Every piece is read at the start of each Act after the first (after the break shop, so what it carries into the Act) and at match end: its stats on the sim's own rules (`computeStats`) with its items (cursed ones included) and with none, live buffs left out.
- **Main damage** is Blade or Soul power, whichever the piece has more of without items. **Damage output** and **toughness** are the AI's own power measures (`src/sim/ai/power.ts`): attack damage × attack speed plus skill power, and health × armor and resist.
- **Growth equivalent:** the growth per Rank `g'` with `1 + g'(r - 1) = (1 + 0.045 (r - 1)) × item multiplier`, fitted by least squares over all Act-start reads (r = the piece's Rank).
- **Probes:** `npm run balance -- --matches 200 --seed 29000 --quiet --workers 2 --map long --no-items`, the growth set with `BALANCE_TUNING`; today's game with the same command without `--no-items`. 200 matches is direction only (±7 points).

## What items add (median, p90 in brackets)

| When        | Reads | Rank | Items | Health       | Main damage  | Damage output | Toughness |
| ----------- | ----- | ---- | ----- | ------------ | ------------ | ------------- | --------- |
| Act 2 start | 600   | 3    | 4     | +14% (+32%)  | +29% (+62%)  | +29%          | +23%      |
| Act 3 start | 550   | 5    | 5     | +24% (+53%)  | +60% (+117%) | +60%          | +34%      |
| Act 4 start | 230   | 6    | 5     | +39% (+105%) | +86% (+180%) | +91%          | +54%      |
| Act 5 start | 50    | 7    | 6     | +83% (+168%) | +98% (+187%) | +116%         | +115%     |
| Match end   | 600   | 6    | 5     | +28% (+87%)  | +65% (+154%) | +78%          | +42%      |

- The match-end row matches the spec's 12-match diagnosis (+24% health, +63% main damage).
- **By piece type** (all Act-start reads, median): King +29% health / +41% main damage, Queen +6% / +63%, Rook +26% / +0%, Bishop +23% / +61%, Knight +6% / +44%.
- **The other damage stat** (Soul for a Blade piece, Blade for a Soul piece): median +0% for King, Queen and Bishop (p90 +64%, +73%, +31%); Rooks and Knights have none.

## Growth that gives the same stats without items

| Fitted to                           | Growth per Rank |
| ----------------------------------- | --------------- |
| Health                              | 15.6%           |
| Main damage                         | 25.4%           |
| Damage output (attack speed too)    | 29.2%           |
| Toughness (armor and resist too)    | 20.6%           |
| Power (√ damage output × toughness) | 23.3%           |

## Probes: items off (200 matches each, seeds 29000–29199)

| Growth per Rank (health / damage)          | White | Median min | p90 min | Kills | At Rank 8 |
| ------------------------------------------ | ----- | ---------- | ------- | ----- | --------- |
| **Today: items on, 4.5% / 4.5%**           | 51.0% | 13.1       | 18.5    | 22.4  | 17.6%     |
| 15.5% / 25%, Blade and Soul (the stat fit) | 56.3% | 17.0       | 26.4    | 24.3  | 38.0%     |
| 15.5% / 35%, Blade and Soul                | 49.0% | 14.5       | 24.0    | 24.2  | 29.9%     |
| 15.5% / 45%, Blade and Soul                | 56.5% | 14.5       | 21.5    | 25.8  | 27.9%     |
| 15.5% / 35%, main stat only                | 56.1% | 16.7       | 26.6    | 25.6  | 38.8%     |
| **15.5% / 45%, main stat only (chosen)**   | 50.5% | 14.6       | 23.0    | 25.0  | 26.8%     |

- **The stat fit alone makes matches 4 minutes longer.** Items are worth more than their stats: their rules (splash, true damage, execute, shields, cooldowns) and attack speed are not in a health-and-damage curve, so damage has to grow faster than the stat fit says.
- **Main stat only** follows what items did (they left the other stat at +0%). Growing both stats inflates what a piece never built: a King's Soul feeds his Royal Guard and Rally, so his shields and heals grew at Soul's rate and long endgames got longer (most matches over 20 minutes were "Throne fell, King killed later").
- **Chosen: 15.5% health, 45% main damage stat, 4.5% the other.** It gives today's White share and the shortest tail of the main-stat runs. A Rank 5 piece then has ×1.62 health and ×2.8 main damage (today ×1.18 from Ranks, ×1.46 and ×1.89 with its items).
- **Left over:** median +1.5 min, p90 +4.5 min, and Rank 8 reached by 27% of pieces instead of 18% (longer matches earn more gold). More damage did not move the median (35% and 45% both 14.5), so the cause is not stats; see BLUF.

## For later phases

- Phase 4 turns this curve on for every match (or folds it into `ranks.growth` per stat) when items retire.
- Phase 6 re-measures with Techniques on (`--techniques --no-items`), with the budget in CLAUDE.md. Techniques add power of their own, so expect the damage growth to come down. Watch Queens and Knights (less toughness than with items), Rooks (more damage) and the length of endgames after a Throne falls.

## Phases 2–3: the full card set (2026-10-18)

Branch `wip/techniques-content`. All 84 Techniques, both sides AI, `--techniques --no-items --map long` (items off, Rank growth health +15.5% and main damage stat +40% per Rank), seed 29000, 2 workers. 200 matches is direction only (±7 points).

| Run                                           | Matches | White     | Median min | p90 min  | Kills | At Rank 8 |
| --------------------------------------------- | ------- | --------- | ---------- | -------- | ----- | --------- |
| Today: items on, no Techniques                | 200     | 51.0%     | 13.1       | 18.5     | 22.4  | 17.6%     |
| Phase 0: items off, no Techniques             | 200     | 50.5%     | 14.6       | 23.0     | 25.0  | 26.8%     |
| p1: Techniques, items off (as built)          | 200     | 50.5%     | 12.4       | 19.7     | 22.9  | 17.5%     |
| **Confirm: Techniques, items off (as built)** | 800     | **50.1%** | **12.6**   | **18.9** | 23.3  | 17.1%     |

- **BLUF: in range on the first probe, so nothing was tuned.** White 50.1% over 800 (inside 48–52%, so no second seed), median 12.6 min, p90 18.9. Techniques close the phase 0 gap: the median is under today's (12.6 against 13.1) and the p90 0.4 min longer, not 4.5.
- **Confirm run** (`npm run balance -- --matches 800 --seed 29000 --quiet --workers 2 --map long --techniques --no-items`): first Bastion 2.2 min; Rank 4 first reached at 5.1 min, Rank 8 at 13.8; longest match 38.5 min. Per match 33.4 cards taken, 38.3 upgrades, **0.1 rerolls and 0 passes**: the AI rerolls only when its best card scores under 1.2, and a card that fills an empty slot already scores 2, so gold goes to upgrades. White pieces holding a Combination at match end: 31.5% (target 30–60%).
- **Picks by school:** Initiative 28.3%, Position 26.1%, Fortress 15.4%, March 12.6%, Clock 10.5%, Sacrifice 7.0% (Sacrifice has no piece or archetype cards).
- **Picked far more than the 10–60% target:** Shared Guard 92%, Family Fork 87%, Rallying Cry 85%, Echoing Decree 81%. All four lead to a Combination (the AI adds +0.6 for a parent, +1 once the partner is held, and the partner is drawn 4× as often); Royal Court (Rallying Cry + Shared Guard, both King cards) is held by about half of all Kings at match end, so King builds look alike. **Far less:** Time Pressure 2.9%, Tithe 3.1%, Tempo Thief 3.9%, Eat Me 5.7%, The Vault 6.7%, Slip 7.6%, Usurper's Luck 9.9%. The Tempo cards fit no piece's lean (Tempo counts as utility), and Time Pressure shares the Attack slot with Wind-up (50%).
- **Held win rates outside 44–58%** (at least 100 holders): Soul Harvest (Shadow Bishop) 74% (106), Split Shot (Huntress Queen) 70% (120), Pact of Ash 60% (101), Siegebreaker (Errant Knight) 58% (122) high; Slip 39% (113), Sanctified 40% (107), Deep Breath 43% (265), Swindle 44% (153) low. Held win rate also reflects who is winning (a piece that lives longer keeps its cards), so read these as leads for phase 6.
- **Player probe** (`--white-player --white-every 60`, same flags, 200): White **53.5%**, median 12.4 min, p90 19.8; Combination on 31.0% of White's pieces. Today's game with items reads 55.5% (wave 3 merge; target 55–60%), so the card-a-minute player keeps its edge within noise. White's pieces pick by the same AI rule here, so this checks the gambit player, not the build choices (the spec's AI-vs-random and greedy-preset tests are phase 6).
- p1 (200) agreed: White 50.5%, median 12.4, Combination 31.9%, the same four cards over 80%.
