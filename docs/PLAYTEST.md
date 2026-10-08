# Playtest 1: issues and fixes

Played on 2026-10-07 by driving the real build in Chromium. Three sessions:

- desktop 1280×800: Cartographer, Left lane, 3 phases
- phone portrait 390×844: Navigator, Mid lane, 2 phases
- phone landscape 844×390: Oiran, Right lane, 1 phase

Each session went through the title screen, codex, draft, upgrades, shop, the live map, a shop suggestion, a recall, the report and its Details. I also ran 56 headless player matches (28 with a hands-off player, 28 with a player who buys only between phases) to measure what the player's own choices are worth.

Severity: **P0** breaks balance or a core loop · **P1** confusing or broken UI · **P2** polish or design.

The issues are only identified here; nothing is fixed yet. Each entry says what to build.

---

## P0: core loop

### 1. The player's hero never buys during a phase

- **Evidence:** across 28 headless matches, a hands-off player's team won **14%**. A player who buys only between phases won **46%**, close to AI parity. Unspent gold at phase end had a median of 3,900g (hands-off) and 1,800g (prep buyer). In the desktop report the player had 1 item while AI teammates had 4–6.
- **Cause:** AI shopping skips the player's hero: `src/sim/match.ts:271` (`!u.hero.isPlayer`) and `src/sim/ai/strategic.ts:576` (shop trips).
- **Fix:**
  - Add an **Auto-buy** toggle to the player card, on by default, stored in `HeroState.autoBuy`.
  - When it is on, treat the player's hero like an AI hero for `aiShop` at base or a stall, and for shop-trip candidates. Manual buying still works.
  - When it is off, keep today's behaviour.
  - Show the next build item as a small icon beside the gold on the player card, so the player can see what auto-buy is saving for.

### 2. The player's hero never recalls to heal

- **Evidence:** the player's hero spent 11–12% of its time walking home at low health. It recorded 0 recalls in 56 matches, and the timeline shows it holding position at 32% health.
- **Cause:** `strategic.ts:267` and `:274` exclude `isPlayer` from `startRecall`.
- **Fix:**
  - Let the player's hero use the heal recall (the first branch).
  - Keep the shop-recall branch only when Auto-buy is on.
  - Open the shop automatically only on recalls the player started. Add an `auto` flag to `RecallState` and check it in `src/app/loop.ts`.

### 3. You cannot shop while dead

- **Evidence:** the player is dead 21–26% of the time and the Shop button is greyed out. Gold sits unspent through the respawn timer.
- **Cause:** `shopAccess` in `src/sim/shop.ts` requires `u.alive`.
- **Fix:**
  - While a hero is dead, grant `base: true` for the base catalog (tiers 1–2).
  - Enable the Shop button during respawn.
  - Pause the clock in the shop as usual.

### 4. Tier 3 can be bought from anywhere between phases

- **Evidence:** during the break between phases, the Keeper banner lists three tier-3 items, and the prep shop sells them.
- **Cause:** `shopAccess` returns `keeper: true` in the prep phase. That bypasses the rule that tier 3 is sold only at the jungle stalls.
- **Fix:**
  - In prep, return `{ base: true, keeper: false, jungle: false }`.
  - Change the prep banner to "Keeper roams near <place> next phase."
  - Update `tests/special.test.ts` ("standing next to the keeper…") if it relies on prep access.

### 5. The match snowballs with no comeback

- **Evidence:** in the desktop session the kill score went from 16–19 to 20–32 within phase 3.
- **Cause:** `gold.comebackBounty` exists in `tuning.json` but no code reads it.
- **Fix:**
  - When a hero is killed, add a bounty of `comebackBounty × max(0, victimTeamNetWorth − killerTeamNetWorth) / 1000`. Set it to 40.
  - Rerun `npm run balance` and check the p90 match length stays under 21 minutes.

---

## P1: interface

### 6. Upgrade cards are clipped on phones

- **Evidence:** in portrait the outer cards run off both screen edges and the middle card covers the left card's text. In landscape the cards are cut top and bottom and "Take this" is hidden. Below 900px wide the hand cannot be read.
- **Fix** (`src/ui/Prep.tsx`, `css/screens.css`):
  - Under 900px wide or 500px tall, drop the fan. Use a horizontal scroll-snap row of unrotated cards, each at least 220px wide, sized to fit the panel.
  - Keep the fan on desktop, but cap the overlap so every card shows at least 85% of its text.

### 7. Upgrade cards show no numbers

- **Evidence:** "Meridian Line deals 30% more" doesn't say 30% more than what. The bottom 60% of every card is empty.
- **Fix:** show the before and after value from the ability definition, for example "54 → 70 damage" or "cooldown 14s → 10.5s". Use the empty space for the ability's own description in dim text.

### 8. Landscape shop hides the Buy button

- **Evidence:** at 844×390 the detail panel's Buy button is cut off under "Start phase".
- **Fix:**
  - The prep panel must scroll as a whole, or the detail panel must be a fixed-height column with Buy pinned inside it.
  - Add a landscape e2e check that `getByTestId('buy')` is visible.

### 9. Portrait shop: the docked detail covers tile names

- **Evidence:** the second row of tier-1 tiles ("Whetstone Drill", "Kata Scroll") is hidden behind the bottom dock.
- **Fix:** give the tile scroller `padding-bottom` equal to the dock's height.

### 10. Tier 3 is below the fold, even at a jungle stall

- **Evidence:** the auto-opened shop at the Eastern Stall shows tier 3 cut off at the bottom, yet tier 3 is the reason to go there. Its price tags are clipped.
- **Fix:**
  - When the shop opens at a jungle stall, show the tier-3 row first, or scroll to it, under a header "Sold here: tier 3".
  - Elsewhere, label the tier-3 row "Jungle stalls only" and dim its tiles.

### 11. The shop opens with an empty detail panel

- **Evidence:** "Select an item to read what it does" takes half the screen.
- **Fix:** preselect the hero's next build item (`nextPurchase`) and tag it "Recommended". Outline the tiles the player can afford.

### 12. The report doesn't mark you

- **Evidence:** the player's row looks like every other row. On landscape only 2 rows fit.
- **Fix:**
  - Put the player's row first, with a gold outline and a "you" tag.
  - On short screens, fold the takeaways into one line that expands on tap.

### 13. Portrait report columns are cut off

- **Evidence:** Damage and Items are cut at the right edge with no scroll cue. Only 4 enemy rows are visible, so check whether the 5th row is clipped.
- **Fix:**
  - Under 500px wide, show Hero, K/D/A and Gold only. Tapping a row expands it to show damage and items.
  - Add an e2e check that 10 `report-hero-*` rows exist.

### 14. The Details log shows internal IDs

- **Evidence:** lines such as "tower (bot #1) belonging to team B", "Hollow Foundry opened at tlc" and "Team B claimed ob_tlc: unlock:hundred_hand_ledger".
- **Fix** (`src/analysis` event text):
  - lanes: top/mid/bot → Left/Mid/Right
  - teams: A/B → "your team" / "the enemy"
  - slot ids → their names, or "left jungle"
  - obelisk effects: `unlock:<id>` → "25% off <item name> at the jungle stalls"

### 15. The score and phase result are unexplained

- **Evidence:** the HUD pills read 13 and 32 with no label. The report never says who won the phase or why points changed.
- **Fix:**
  - Add a label and tooltip to the pills ("Points: kills, towers, objectives").
  - Add a fourth takeaway, for example "Phase won by the enemy: +12 points (8 kills, 1 tower)."

### 16. React key error with duplicate items

- **Evidence:** console error "two or more children with the same key 'rusted_cleaver'" in `PlayerCard` (`src/ui/Hud.tsx:324`) once you own 2 of the same item.
- **Fix:** key by index (`${id}:${i}`) there and in any other item list, such as the scoreboard icons.

### 17. Escape doesn't close overlays

- **Evidence:** Escape does nothing in the Codex.
- **Fix:** close on Escape for the codex, shop, player-card popup and Details. Use one `keydown` listener in `App.tsx` that dispatches to whichever overlay is open.

### 18. The player-card popup covers the left lane

- **Evidence:** on desktop the ability list hides the whole left lane.
- **Fix:** make the popup compact (abilities as one line each), close it when the map is tapped, and cap its height at 40vh.

### 19. Your hero is hard to find

- **Evidence:** "YOU" is about 8px text. On phones your hero is about 14px and blends into allies.
- **Fix:**
  - Pulse a 2× halo for 3 seconds at phase start and on respawn.
  - Draw a permanent thin gold ring on your hero.
  - Tapping your portrait flashes the halo.

### 20. Map labels collide

- **Evidence:** the Western Stall label is covered by units, "Keeper" overlaps "Fox Wedding", and "UNCHARTED" sits in the middle of the jungle on phones.
- **Fix** (`src/render/renderer.ts`):
  - Draw labels last.
  - Skip a label whose box overlaps another label, or moves it down by 10px.
  - Hide "Uncharted" under 600px and draw the locked slots dimmer.

### 21. Portrait roster columns sit on the lane ends

- **Fix:** shrink roster icons to 26px under 420px wide and anchor them in the corner bands outside the ground circle (`.corner.bl`, `.corner.br`).

---

## P2: design and pace

### 22. The draft offers only 5 of 14 heroes

- **Evidence:** the AI drafts 9 heroes before the player sees the list.
- **Fix:** let the player pick first from all 14 heroes, then the AI fills both teams. If the heroes picked before the player should stay hidden, keep the enemy row hidden until the player picks.

### 23. The enemy team in the draft is icons only

- **Fix:** show names and dispositions in the enemy team, matching the "Your team" column.

### 24. A far shop suggestion pulls the hero across the map

- **Evidence:** suggesting the Eastern Stall sent the Left-lane hero across the whole map mid-phase, with no warning.
- **Fix:**
  - When the player taps a stall, show a toast such as "Eastern Stall: ~25s away, leaves the Left lane".
  - Let rescue and defend candidates outrank a suggestion: lower `suggestScore` below `rescueScore × urgency`.

### 25. No reminder of unspent gold between phases

- **Fix:**
  - Badge the Shop tab with the gold available ("1,992g").
  - When the player starts a phase with 800g or more and a free slot, show an inline "You have 1,992g unspent. Shop first?" with Shop and Start anyway.

### 26. Pace and agency

- **Evidence:** a phase is 4 minutes of mostly watching, and matches run 12–20 minutes.
- **Fix:**
  - Add an 8× speed option.
  - Add a mid-phase decision prompt when a jungle event starts, for example "Fox Wedding: send your hero?" with Yes and No buttons that pause for 5 seconds. It maps to a one-off suggestion.
  - Consider shortening `phaseSeconds` to 180.

### 27. Several screens show a large empty panel

- **Evidence:** in the draft, "Pick a hero to read what they do" fills two thirds of the screen.
- **Fix:** preselect the first available hero and show their detail.

---

## Suggested order for implementation

1. Items 1–4 (sim and loop). Then rerun `npm run diagnose` and `npm run balance`, plus a hands-off player check with the script at the end of this doc.
2. Items 16 and 8 (a console error and a hidden Buy button).
3. Items 6, 9, 10–13 and 17 (shop, cards, report).
4. Items 14, 15 and 18–21 (readability).
5. Items 5 and 22–27 (design). Check with the user before item 26.

## How to repeat the hands-off check

Run 28 matches with `Match.create(content, { seed: 61000 + k, player: { heroId, role } })`. Each match:

- In prep, pick the first upgrade, issue `refuseCurse`, then `startPhase`.
- Step the match 20 ticks at a time.
- Record the player team's win rate and the player's gold at the end of each phase.

The target after item 1 is a team win rate of 45–55% with Auto-buy on.
