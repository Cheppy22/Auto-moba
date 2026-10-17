# Spec: Tournament run, interactive armory, glossary (2026-10-13)

Status: **approved by Cheppy 2026-10-13** (all ten decisions as recommended, with one change to decision 8: a **best finish** line is kept on the device, e.g. "Best: reached the Final"; it carries no power, so it is not meta progression). **The glossary is built (2026-10-13).** **Armory phases 0–1 built (2026-10-14):** the hoarding is confirmed and its cause found (phase 0, in [BALANCE-2026-10-14.md](BALANCE-2026-10-14.md) "Armory phases 0–1"); the sim's break shop, plans, `buy`/`sell`/`setPlan`/`autoShop` commands and `Match.armoryView` are in (`src/sim/armory.ts`). **Armory tab built (phase 2, 2026-10-14):** the fourth break-sheet tab, Adjourn plan ghosts and the Orders plan warning (`src/ui/hud/ArmoryTab.tsx`; screenshots `docs/img/armory-*.png`). **1C is built (phases 3–4, 2026-10-14):** balanced with no price changes (AI vs AI 51.5% White over 800, median 12.8 min; no greedy preset above 60%), plus three owner-approved fixes (shop trip ignores pawnlings, counter items stay out of custom plans, cards never below 3 Tempo); runs in [BALANCE-2026-10-14.md](BALANCE-2026-10-14.md) "Armory phase 3". **Tournament run (1B) phases 1–2 built (2026-10-14):** the sim (`MatchConfig.start`, run relic cap 5, `lockStyles`, `adjudicate`; `src/sim/runRules.ts`), the run steps, generated opponents and rewards (`src/sim/run/`, `content/tournament.json`), run state in the session and the device save with a best-finish line (`src/ui/session.tsx`, `src/ui/run/save.ts`), tests `tests/run.test.ts` and `tests/run-save.test.ts`, and a headless check (`npm run tournament`); Classical only. **Phase 3 built (2026-10-14):** Title (Tournament, Continue, Exhibition, best-finish line), Draw, run strip and Run kit, Spoils, result buttons, Run summary, glossary entries for the run nouns, `tests/e2e/tournament.spec.ts` (screenshots `docs/img/tournament-*.png`). **Phase 4 (balance) done (2026-10-15):** round table tuned with an opponent relic cap per round, AI card reserve 40 → 50, the AI reward pick weighs book moves, relic snowball measured (cap kept at 5 pending the owner); runs in [BALANCE-2026-10-15.md](BALANCE-2026-10-15.md). Rules in [CHESS.md](CHESS.md) "Tournament run". Covers the approved items **1B Tournament run** and **1C Interactive armory**, plus the **tappable glossary** that ships with 1B ([FABLE-REVIEW-1-2026-10-11.md](FABLE-REVIEW-1-2026-10-11.md) 4.1, 4.5, section 5). Belongs to [CHESS.md](CHESS.md). Written by Opus (planner); built by Sonnet agents in the phases below.
Status: **approved by Cheppy 2026-10-13** (all ten decisions as recommended, with one change to decision 8: a **best finish** line is kept on the device, e.g. "Best: reached the Final"; it carries no power, so it is not meta progression). **The glossary is built (2026-10-13).** **Armory phases 0–1 built (2026-10-14):** the hoarding is confirmed and its cause found (phase 0, in [BALANCE-2026-10-14.md](BALANCE-2026-10-14.md) "Armory phases 0–1"); the sim's break shop, plans, `buy`/`sell`/`setPlan`/`autoShop` commands and `Match.armoryView` are in (`src/sim/armory.ts`). **Armory tab built (phase 2, 2026-10-14):** the fourth break-sheet tab, Adjourn plan ghosts and the Orders plan warning (`src/ui/hud/ArmoryTab.tsx`; screenshots `docs/img/armory-*.png`). **1C is built (phases 3–4, 2026-10-14):** balanced with no price changes (AI vs AI 51.5% White over 800, median 12.8 min; no greedy preset above 60%), plus three owner-approved fixes (shop trip ignores pawnlings, counter items stay out of custom plans, cards never below 3 Tempo); runs in [BALANCE-2026-10-14.md](BALANCE-2026-10-14.md) "Armory phase 3". **Tournament run (1B) phases 1–2 built (2026-10-14):** the sim (`MatchConfig.start`, run relic cap 5, `lockStyles`, `adjudicate`; `src/sim/runRules.ts`), the run steps, generated opponents and rewards (`src/sim/run/`, `content/tournament.json`), run state in the session and the device save with a best-finish line (`src/ui/session.tsx`, `src/ui/run/save.ts`), tests `tests/run.test.ts` and `tests/run-save.test.ts`, and a headless check (`npm run tournament`); Classical only. **Phase 3 built (2026-10-14):** Title (Tournament, Continue, Exhibition, best-finish line), Draw, run strip and Run kit, Spoils, result buttons, Run summary, glossary entries for the run nouns, `tests/e2e/tournament.spec.ts` (screenshots `docs/img/tournament-*.png`). **3B Named opponents built (2026-10-17, proposal branch):** ten hand-made courts in `content/courts.json` replace the generated stand-ins ("Opponents: the stand-in until 3B" below is now the fallback only); see [CHESS.md](CHESS.md) "Tournament run". Phase 4 (balance) is not built; rules in [CHESS.md](CHESS.md) "Tournament run". Covers the approved items **1B Tournament run** and **1C Interactive armory**, plus the **tappable glossary** that ships with 1B ([FABLE-REVIEW-1-2026-10-11.md](FABLE-REVIEW-1-2026-10-11.md) 4.1, 4.5, section 5). Belongs to [CHESS.md](CHESS.md). Written by Opus (planner); built by Sonnet agents in the phases below.

## BLUF

- **Armory (1C):** at every Act break a new **Armory** tab lets you shop for each piece from all 36 items (6 slots, Deadlock-style grid). The build path becomes the AI's suggestion: you can change any piece's planned build, and the piece follows your plan when it shops on its own during the Act. If you skip the tab, the AI shops for you, exactly as Black does.
- **Tournament (1B):** a run is **4 matches** against named courts that get harder each round. Your court, archetypes and relics carry from match to match; items, gold and Ranks reset. After each win you pick **1 of 3 rewards**. One loss ends the run. When the run ends, nothing is kept.
- **Glossary:** every game word (Tempo, fork, relic, Bastion, …) gets a dotted brass underline; tap it for a one-sentence definition. A full Rules list sits on the Title and in Adjourn.
- **Found while writing this (measured):** on the Long Board pieces hoard gold and almost never buy a Masterwork. In 12 AI-vs-AI matches (seeds 29000–29011), median unspent gold per piece at the break was 411 (Act 1), 924 (Act 2), **2,503 (Act 3)** and 4,109 (Act 4); **2 of 60 pieces owned a Masterwork at the Act 3 break**, and the median piece held 4 of 6 items. The armory turns that banked gold into choices, which also makes it the biggest balance risk here.
- **Effort:** about **15 agent-days** (glossary 1, armory 6, tournament 8), plus about 10 hours of machine time for balance runs. Build after the Tempo tune (4.0), in the order glossary, armory, tournament.

## Decisions for the owner

Each has a recommendation. Say "all as recommended" or change any number.

1. **Masterworks at the break? Recommend yes.** Today Masterworks are sold only at the jungle shops, and pieces almost never get there (2 of 60 own one by Act 3). Selling them at the break makes the best items real choices. It reverses "Tier 3 only at jungle shops" on this branch; the jungle shops stay for buying during an Act.
2. **Where the shop lives: a new 4th tab, Armory** (Report, Orders, Armory, Relics), not inside Orders, which is already long on a phone. It never locks Resume: any piece you did not shop for gets the AI's purchases when you press Resume, and Black shops at every break by the same AI.
3. **Run length: 4 matches** (Club, County, Semifinal, Final). Three feels too short to build anything; five is too long for a phone (about 45 min in Blitz, 75 in Classical).
4. **What carries between matches:** court (Opening, lanes, paths), archetypes (from match 2 a piece takes its run archetype at Rank 4 by itself, with no pause; you can change it between matches) and relics (you can hold up to **5** in a run instead of 3). **What resets:** items, gold, Ranks, Tempo, pawns, health.
5. **Reward after each win: pick 1 of 3**, always one of each kind: a **relic**, an **heirloom** (one piece starts every later match with a given cheap item) or a **book move** (one gambit card is drawn twice as often for the rest of the run).
6. **One loss ends the run.** A match that ends without Checkmate is **adjudicated**: more enemy Bastions destroyed wins, then more Throne health left; a dead tie counts as a loss. No retries, except that a match interrupted by closing the page restarts from its beginning.
7. **Opponents until 3B ships:** generated courts with names, harder each round because Black starts with relics and extra Tempo (table in 1B). 3B later swaps in the hand-made courts without changing anything else.
8. **Saving:** the run is saved between matches (on this device only); a match in progress is not (that is the platform pass, 4.7). After the run nothing is kept except one **best finish** line on this device (owner change, 2026-10-13); it gives no power.
9. **Title screen:** **Tournament** becomes the main button; a single match stays as **Exhibition**.
10. **Build order: glossary, then armory, then tournament.** The armory changes every match's balance, and the run's difficulty has to be tuned on top of it, not before.

---

## 1C Interactive armory

### Rules (one sentence each)

- At every Act break each of your pieces can buy and sell items with its own gold, from all 36 items, wherever it stands on the board.
- A piece holds 6 items; buying an item uses up the parts it is built from (and their price comes off), as in the jungle shops today.
- A piece cannot own two copies of one item (the AI already never does).
- Selling refunds half the price (`shop.sellRefund`, as now); cursed items cannot be sold.
- Each piece has a **plan** of six items: its build path's list until you change it, then yours.
- During an Act pieces still shop on their own at base and at the jungle shops, buying their plan in order.
- If you leave a piece untouched at a break, the AI spends its gold on Resume; a piece you bought or sold for keeps whatever gold you left it.
- Black shops at every break with the same AI; its new items show on its piece cards when the next Act starts.
- Changing a piece's path in Orders resets its plan to the new path's list (with a one-line warning when you had changed it).
- From Rank 4 a piece with an unchanged plan follows its archetype's list, as today; a changed plan stays yours.

### Player flow (phone portrait first)

The break sheet gets four tabs: **Report · Orders · Armory · Relics**. The Armory tab shows a brass dot while any piece has 300 gold or more unspent.

**Armory tab, portrait 390×844** (top to bottom, inside the existing sheet):

1. **Piece strip:** your five pieces as chips (icon, gold, "4/6"). Tap to switch. The first chip selected is the piece with the most gold.
2. **Slots row:** six tiles. Owned items are solid; empty slots show the next planned items as ghost tiles (dim, dashed rim). Tap an owned item to see it and **Sell (+425)**; tap a ghost to see it and **Change** it.
3. **Category tabs:** Mind / Body / Soul (category colour and glyph, as in the item colour theory).
4. **Grid:** three rows by tier: 5 tier-1 tiles, 4 tier-2 tiles, 3 Masterworks (brass rim). 358 px of width / 5 = about 70 px a tile, at least 44 px tall. Each tile: icon, price after the parts you own come off, and small marks: **owned** (tick), **in plan** (ring), **AI suggests** (a brass pip on the AI's next buy). Unaffordable tiles are dimmed with the price kept readable; tiles that cannot be bought (duplicate, no slot) say why in the detail panel.
5. **Detail panel** (docked above the Resume button, as the old shop's): name, tier, the item's rich text, "Built from" with ticks on owned parts, and two buttons: **Buy · 850** (primary) and **Put in plan** (secondary; replaces the selected ghost, or the last unbought plan item).
6. Under the grid: **Let the AI shop** (this piece) and **AI shops for all** (small text buttons), and one line of text: "Untouched pieces shop on their own when you resume."

**Landscape 844×390:** two columns: left (piece chips stacked, slots below), right (category tabs, grid, detail panel). **Desktop:** the same two columns in the 720 px sheet.

**Elsewhere:**

- **Adjourn → Armory** stays read-only (shopping is a break decision) but now shows each piece's plan as ghosts after its items.
- **Setup page 1 (Build paths)** keeps the paths and "typical first three buys"; the label reads "The AI's suggested build; change it at any Act break."
- **Piece card** shows items and the next planned item.

### Economy

- Gold stays **per piece** (no team purse): earned by that piece as now (`giveGold`), so Ranks are unchanged.
- No new gold comes from the armory; it only lets banked gold be spent. Measured stock to spend: median 411 / 924 / 2,503 / 4,109 per piece at the breaks after Acts 1–4.
- The obelisk Masterwork discount (`shop.unlockDiscount`) applies at the break too.
- Prices and recipes are unchanged (`content/items/*.json`).

### Sim changes

- `src/sim/shop.ts`: a new access mode `where: 'break'` (all tiers, no Keeper stock), valid only while `bell.stage === 'break'`; a duplicate check in `quote`.
- `HeroState.plan: string[] | null` (null = follow the path). `buildListOf` (`src/sim/pieces.ts`) returns the plan when set; nothing else in the AI shopper changes.
- New commands (recorded in the replay like every command, so replays stay exact):
  - `{ type: 'buy'; heroId: number; item: string }` and `{ type: 'sell'; heroId: number; item: string }`: White, break only.
  - `{ type: 'setPlan'; heroId: number; plan: string[] | null }`: break only; 6 known item ids or null.
  - `{ type: 'autoShop'; heroId: number | null }`: the AI shops now for one piece or all.
- `MatchState.armory: { touched: number[] }` (White's hero ids bought or sold for at this break; cleared on resume).
- **Break order:** `enterBreak` → lane re-plan → relic offers → **Black's break shop** (`aiShop` with `where: 'break'`, all five pieces in slot order) → sheet. On `resumeAct`: White's untouched pieces run the same break shop, then `enterAct`. Headless (`pauseForBreak` false): both teams break-shop at once, White first then Black, after the relic picks.
- `Match.armoryQuote(heroId, item)` (read-only, for the UI, like `nextBuy`).
- AI-vs-AI matches change (both sides now shop at breaks), so `tests/baseline*.expected.json` are re-recorded on purpose after the balance run.

### UI changes

- `src/ui/hud/BreakSheet.tsx`: the fourth tab; new `src/ui/hud/ArmoryTab.tsx` (piece strip, slots, grid, detail); reuses `ItemIcon`, `RichText`, `itemCategory` and the `items.css` tile styles.
- `src/ui/Adjourn.tsx`: plan ghosts in the read-only Armory.
- `src/ui/Orders.tsx`: the plan-reset warning on a path change.

### AI

- **Black and hands-off White:** the existing `nextPurchase` loop with break access. Because Masterworks are now reachable, the AI's "save for a Masterwork" branch finally pays out at the break.
- **The suggestion** shown to the player is exactly what the AI would buy next (`nextPurchase` with break access), so "AI suggests" and "Let the AI shop" never disagree.
- No change to the counter-item rule (`adaptTarget`): it still inserts riveted plate or spirit lens against the enemy's damage mix, now visible as the suggestion.

### Balance plan (Long Board, 800 matches each, `--workers 2`, about 55 min a run)

1. **Before:** today's numbers on seed 29000 after the Tempo tune (gold at each break, Masterworks owned, median length, kills, first Bastion). `npm run diagnose` already counts tier-3 buys; add "gold unspent at the break".
2. **Break shop for both AIs:** `npm run balance -- --matches 800 --seed 29000 --quiet --map long`, then seed 31000. Targets: White 48–52%, median 12–16 min, every Masterwork bought by some piece in at least 5% of matches.
3. **Greedy builds:** a tool flag `--plans A=<preset>` that gives White fixed plans (all-Mind Queen, all-Body Rook, 6-of-a-category attunement stacks) against AI Black, 400 matches each. Flag any preset above 60% White.

- **Watch:** matches getting shorter (Masterworks at the Act 2 break are a power spike), first Bastion earlier than 2 min, Development and gold relics becoming stronger now that gold always turns into power.
- **Knobs if needed:** Masterwork prices, a break markup (for example +10% at the break), `shop.slots`.

### Test plan

- Unit (`tests/armory.test.ts`): break access sells all tiers only at the break; duplicates refused; parts consumed and discounted; sell refunds half, cursed items refused; `setPlan` drives `nextPurchase`; untouched pieces shop on resume, touched ones keep their gold; Black's break shop is the same for White seated in `top` as for Black in `bot` (180° rule, `tests/symmetry.test.ts`); replay of a match with buys and sells is identical.
- Baseline re-recorded once, after balance, on purpose.
- Browser (`tests/e2e/armory.spec.ts`): reach a break, open Armory, buy, sell, change a plan, resume; at 390×844, 844×390 and 1440×900 nothing overflows sideways and every tile is at least 44 px.

### Phases (agent-days)

| Phase | What                                                                                                                        | Days  |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| 0     | Confirm the hoarding numbers over 800 matches and why (likely the shop trip rarely wins the AI's goal scoring); report only | 0.5   |
| 1     | Sim: break access, plan, commands, break shop for both sides, headless order, unit tests                                    | 1.5   |
| 2     | UI: Armory tab (portrait, landscape, desktop), Adjourn ghosts, Orders warning                                               | 2     |
| 3     | Balance runs 1–3, tune, re-record baselines                                                                                 | 1.5   |
| 4     | Browser tests, docs (CHESS.md Act break, SOURCE_OF_TRUTH items, reversed-decision row)                                      | 0.5   |
|       | **Total**                                                                                                                   | **6** |

### Risks

- **Power spike** at the Act 2–3 breaks from banked gold; mitigated by measuring first and the price knobs.
- **Long break sheet:** four tabs and a 12-tile grid on a phone. Mitigated by the auto-shop fallback, so ignoring the tab is always safe.
- **Expert builds beat the AI** by a wide margin: acceptable (that is the agency), but greedy presets above 60% get a look.
- **Hidden cause of the hoarding** might be an AI bug that should be fixed for live play too; phase 0 says which.

---

## 1B Tournament run

### Rules (one sentence each)

- A run is 4 matches against 4 named courts, in order: Club, County, Semifinal, Final.
- You play White every match; the opponent is Black.
- Win a match to go on; lose one and the run is over.
- A match that ends without Checkmate is adjudicated: the side that destroyed more Bastions wins, then the side whose Throne has more health left; a dead tie is a loss.
- Your court carries: Opening, lanes and paths are pre-filled from the last match and can be changed between matches.
- Archetypes carry: from match 2 each piece that chose an archetype takes it again at Rank 4 by itself (a small chip says so), and you can change or clear it between matches; Rank 8 forks still pause every match.
- Relics carry: held relics start the next match active from Act 1, bound to the same lane or the same piece; in a run you can hold up to 5.
- Items, gold, Ranks, Tempo, pawns and health reset every match.
- After each win you pick 1 of 3 rewards: a relic, an heirloom or a book move.
- Opponents get harder each round (starting relics, extra Tempo, a counter-Opening from the Semifinal).
- The run is saved between matches on this device; when it ends, win or lose, nothing is kept.
- Exhibition (a single match, as today) stays.

### Player flow (phone first)

1. **Title.** Buttons: **Tournament** (primary), **Exhibition**, **Rules** (the glossary), Sound, Theme. With a saved run the primary button is **Continue: Round 2 vs The Brasswick Club** and Tournament asks "Abandon your current run?" first.
2. **Draw** (new screen). "The tournament draw": four rows, one per round: round name, court name, a court seal (a generated glyph until 3B gives portraits), and for the first round its Opening and schools; later rounds show the name only until you reach them. Under it, once 2B ships, the **pace** switch (Blitz / Classical; Blitz pre-selected on phones, Classical on desktop) with one line each; locked for the run. Button: **Set up your court.**
3. **Setup** (the existing three pages, pre-filled). In match 1 the defaults; later the last match's court. A thin **run strip** on top: round ("Round 2 of 4 · County"), your relics as seals, heirlooms and archetypes as small marks; tap the strip to open the **Run kit** sheet (archetype per piece with "choose at Rank 4" as an option, relic aims as on the Relics tab, heirlooms read-only). Black's side is the opponent's court, not a seeded AI setup.
4. **Versus card.** Header "Round 2 · County: Italian Game vs The Brasswick Club's French Defence"; Black's relics (if any) as seals under its row.
5. **Match.** As now. Banners and the Report say the court's name where they say "Black" today ("The Brasswick Club played Barricade").
6. **Result.** Win: the result splash with **Continue the run** as the primary button (the report pages still swipe; **Same seed** is hidden in a run). Loss: the splash with **See your run** as primary.
7. **Spoils** (new screen, after a win). "Round 2 won." First, the **next opponent** card (name, Opening and its two schools, the relics it starts with), so you can pick against it. Then three reward cards side by side (a scroll-snap row on phones, like the upgrade cards): one relic, one heirloom, one book move; **Let the AI choose** below. Picking one plays the chime and goes to Setup.
8. **Run summary** (new screen, after a loss or the Final). Title "Champion" or "Out in the Semifinal". The four rounds with result, length, "adjudicated" mark and that match's MVP; your court with archetypes; the relics, heirlooms and book moves you picked; one line "Nothing from this run carries into the next one." Buttons: **New run**, **Exhibition**, **Title**. The save is deleted here.

### Rewards

| Kind      | What the card offers                                                                                                  | Limit                    |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Relic     | One named relic you do not hold, aimed on the Run kit sheet; active from Act 1                                        | Counts toward the 5 held |
| Heirloom  | "Your Rook starts every later match with Riveted Plate" (a tier-1 or tier-2 item up to 1,000 gold, for a named piece) | One per piece            |
| Book move | "Fork is drawn twice as often for the rest of the run" (stacks with the Opening's ×2)                                 | One per card             |

- Offers are seeded by the run seed and the round, so a saved run shows the same cards after a reload.
- With 5 relics held the relic card offers to **swap** one.
- AI choice (and headless runs): a relic while fewer than 5 are held, else an heirloom for the piece with the fewest items, else a book move from the Opening's schools.

### Opponents: the stand-in until 3B

A generator builds the four courts when the run starts (seeded, so the draw stays the same after a reload). Each is an `OpponentDef`, the same shape 3B's hand-made courts will use.

| Round        | Name                             | Black starts with | Black Tempo at start | Opening                                              |
| ------------ | -------------------------------- | ----------------- | -------------------- | ---------------------------------------------------- |
| 1. Club      | from a pool of ~20 club names    | no relic          | +0                   | seeded                                               |
| 2. County    | from the pool                    | 1 relic           | +5                   | seeded                                               |
| 3. Semifinal | from the pool                    | 2 relics          | +10                  | one that does well against yours (`openingMatchups`) |
| 4. Final     | always "The Black Queen's Court" | 3 relics          | +15                  | one that does well against yours                     |

- Starting relics are picked by Black's relic AI from a seeded offer and aimed by its usual rules.
- Names are invented chess-club names ("The Brasswick Club", "Lady Marlow's Court", "Old Tenby Chess Hall"), never real clubs. Pool in `content/tournament.json` with the round table.
- **How 3B slots in:** 3B replaces `generateOpponents(seed)` with a pick from 8–12 authored `OpponentDef`s (portrait, fixed Opening, fixed styles through `forceStyles.B`, a signature relic). The run, the screens and the save do not change.

### Blitz and Classical

- 1B ships before 2B, so the first build plays Classical only and hides the pace switch. **2B built 2026-10-17 (proposal):** the Draw has the switch; rules in [CHESS.md](CHESS.md) "Blitz and Classical".
- When 2B ships the run picks a pace once at the Draw (Blitz default on phones, Classical on desktop) and every match uses it.
- Blitz has at most 3 Acts, so 2 breaks per match (2 relic drafts, 2 armory visits) against about 3 in Classical; with the 5-relic cap a Blitz run still reaches a full relic row by the Final.
- If Blitz ends Act 3 without Checkmate, adjudication decides it (the same rule as Classical's last Act). 2B may define its own end; the run uses whatever the match reports as a winner.

### Data shapes

```ts
// src/sim/run/types.ts (pure, seeded, no DOM: the headless tool plays runs too)
interface OpponentDef {
  id: string; name: string; round: 1 | 2 | 3 | 4;
  setup: TeamSetup;                                // Opening + five pieces (path, lane)
  styles?: Partial<Record<PieceId, string>>;       // 3B: fixed archetypes (forceStyles.B)
  relics: CarriedRelic[];                          // starting relics
  tempoBonus: number;
  portrait?: string; signatureRelic?: string;      // 3B
}
interface CarriedRelic { id: string; lane: LaneId | null; piece: PieceId | null; card: string | null; trigger: SealedTrigger | null; quota: PawnQuota | null }
type Reward =
  | { kind: 'relic'; relic: string; replaces?: string }
  | { kind: 'heirloom'; piece: PieceId; item: string }
  | { kind: 'book'; card: string };
interface RunState {
  v: 1; seed: number; pace: 'classical' | 'blitz';
  round: number;                                   // 0..3
  opponents: OpponentDef[];
  court: TeamSetup;
  archetypes: Partial<Record<PieceId, string>>;
  relics: CarriedRelic[];                          // at most 5
  heirlooms: Partial<Record<PieceId, string>>;
  books: string[];
  results: { opponent: string; won: boolean; minutes: number; adjudicated: boolean; mvp: PieceId | null }[];
  offers: Reward[] | null;                         // open Spoils screen
  status: 'between' | 'playing' | 'champion' | 'out';
}

// MatchConfig additions (src/sim/types.ts)
start?: { A?: TeamStart; B?: TeamStart };
interface TeamStart { relics?: CarriedRelic[]; heirlooms?: Partial<Record<PieceId, string>>; books?: string[]; tempoBonus?: number }
lockStyles?: { A?: Partial<Record<PieceId, string>> };   // White's Rank 4 resolves at once to this style
adjudicate?: boolean;                                     // a match without Checkmate gets a winner
```

- Save: `localStorage['automoba.run']` = `RunState` as JSON, read and written in try/catch (`src/ui/run/save.ts`); a bad or old (`v`) save is dropped with a console warning, never a crash. Written on entering Spoils, Setup and each match start (`status: 'playing'`, so a reload restarts that round from its start with the same seed).
- Relics bound to a piece are carried by piece type (`PieceId`), because unit ids change between matches.

### Sim changes

- `MatchConfig.start`: held relics placed at match start (`relics.held`) with effects from Act 1; heirloom items added to `HeroState.items` at spawn; book cards' weight ×2 in the deck; Tempo bonus added to `gambits.tempoStart`.
- Relic hold cap read from the config (3, or 5 in a run); a draft at the cap is a replace-or-decline, as the 4th draft is today.
- `lockStyles.A`: White's Rank 4 resolves at once to that style (like `forceStyles`, with the rank chip "Queen · Rank 4: Duelist (your run)"); Rank 8 still pauses.
- `adjudicate`: at the last Act's 0:00 the winner is decided by Bastions destroyed, then Throne health; a tie stays a draw (and the run counts it as a loss).
- `src/sim/run/`: `generateOpponents`, `rewardOffers`, `applyReward`, `nextMatchConfig(run)` and `recordResult(run, match)`: pure functions over `RunState`, seeded from the run seed (match seed = hash of run seed and round).
- Without `start`, `lockStyles` and `adjudicate` a match is exactly as before, so Exhibition and the baselines do not move.

### UI changes

- `src/ui/Title.tsx`: Tournament / Continue / Exhibition / Rules.
- New `src/ui/run/`: `Draw.tsx`, `Spoils.tsx`, `RunStrip.tsx` + `RunKit.tsx` (on the setup pages), `RunSummary.tsx`, `save.ts`. Session gains `run: RunState | null` and `startRun`, `continueRun`, `pickReward`, `endRun`.
- `src/ui/report/pages/ResultPage.tsx`: run buttons; Same seed hidden in a run.
- Court names in banners, versus card and Report through `courtName` (`src/analysis/text.ts`).

### AI

- Black's court comes from the `OpponentDef` (Opening and setup fixed; archetypes free until 3B fixes them).
- Black picks its starting relics with the existing relic AI (`src/sim/draft.ts`), from a seeded offer.
- White in headless runs picks rewards by the rule above and keeps its archetypes.
- No new difficulty system: the escalation is only the round table (3A difficulty tiers stay "not now").

### Balance plan

Machine time: about 55 min per 800 matches with `--workers 2`.

1. **Round ladder:** a `--round 1|4` flag for `npm run balance` that applies that round's Black start and a typical White carry (round 1: nothing; round 4: 3 relics, 1 heirloom, 1 book move, sampled from simulated runs). 800 matches each, seed 29000. Targets for AI White (hands-off): round 1 wins 55–65%, round 4 wins 35–45%.
2. **Whole runs:** `npm run balance -- --runs 200 --seed 29000` plays 200 full runs with AI White. Target: 10–20% of runs end Champion (a skilled player should do better; Slay the Spire's first wins are rare too).
3. **Reward value:** 400 matches each with White given only a relic, only an heirloom, or only a book move; no kind should be worth more than 2× another's win-rate gain (noisy at 400; decide on the pattern, not the decimal).
4. **Exhibition unchanged:** `npm run baseline` passes without re-recording.

- **Knobs:** the round table (relics, Tempo), the 5-relic cap, the heirloom price limit.

### Test plan

- Unit (`tests/run.test.ts`): the draw is the same for the same seed; win → Spoils → next round; loss → out; the Final win → champion; adjudication order; relics carried by piece type; the cap of 5 with swaps; heirlooms in the items at spawn; book weight ×2; `lockStyles` resolves Rank 4 at once and still pauses Rank 8; save round-trip, bad save dropped; a match with no run fields matches the baseline.
- Browser (`tests/e2e/run.spec.ts`): a test-only `?run=test` hook ends a match with a set winner; walk Title → Draw → Setup → match → Spoils → round 2 → loss → summary; reload between matches continues the run; at 390×844, 844×390 and 1440×900 nothing overflows and the reward row snaps on phones.

### Phases (agent-days)

| Phase | What                                                                                                            | Days  |
| ----- | --------------------------------------------------------------------------------------------------------------- | ----- |
| 1     | Sim: `start`, relic cap, `lockStyles`, `adjudicate`; `src/sim/run/` (opponents, rewards, run steps); unit tests | 2     |
| 2     | Run state in the session, save and load                                                                         | 1     |
| 3     | UI: Title, Draw, run strip and Run kit, Spoils, result buttons, Run summary (phone, landscape, desktop)         | 3     |
| 4     | Headless run tool, balance runs 1–4, tune the round table                                                       | 1     |
| 5     | Browser tests, docs (CHESS.md match flow, SOURCE_OF_TRUTH: "Identity" pitch and a run section)                  | 1     |
|       | **Total**                                                                                                       | **8** |

### Risks

- **Run too long on a phone** in Classical (about an hour for four matches); Blitz (2B) is the real fix, so 1B before 2B means desktop-length runs for a while.
- **Snowball:** 5 relics plus heirlooms may outgrow the opponents' fixed escalation; the round ladder run measures it, and the round table is the knob.
- **Restart abuse:** reloading restarts a losing match. Accepted: single player, no rewards outside the run.
- **"Is this meta progression?"** No: everything is gone when the run ends, and the summary says so.
- **Names:** generated court names must not match real clubs; the pool is reviewed once.

---

## Glossary taps

### What it is

- Every game noun on a screen where the player reads (setup, break sheet, armory, run screens, piece card, Adjourn, report) is a **term**: tap it for one sentence; **More** expands to two or three.
- A **Rules** page (from the Title and from Adjourn) lists every term, grouped: Match, Board, Pieces, Gambits, Run, Armory.
- Live play: only the piece card and the hold-to-read card text carry terms. Floating tags, banners and notices do not (too small and too brief).

### Terms

- **From the review:** Tempo, gambit, fork, relic, pawn, pawnling, Act, Bastion, Throne, Check, high ground, eye badge, line of sight.
- **Also needed:** Checkmate, Opening, school, Rank, archetype, Rally, bell, grove, Square (shop), Masterwork, attunement, build path.
- **Run:** Tournament, round, court, Spoils, heirloom, book move, adjudication, Blitz, Classical.
- **Armory:** Armory, plan, slot, parts (built from), AI suggests.

Example entries (the whole list is written in phase 1 and checked by the owner):

- **Tempo:** your team's spending meter (0–100); it fills over time and from kills, and pays for gambits and pawns.
- **Eye badge:** this piece is attacking a target below it, so it hits 20% harder (and a ranged piece reaches farther).
- **Adjudication:** a match that ends without Checkmate goes to the side that destroyed more Bastions.

### How it looks

- A term is drawn in the surrounding text's colour with a **1 px dotted brass underline** (offset 3 px). Only its first appearance in each panel is marked, so text never turns into a sea of underlines. The tap area is padded to 44 px tall without moving the text.
- Tap → a small glass popover (ebony panel, brass hairline, like the HUD panels) anchored above or below the word and kept on screen: the term in brass small caps, the sentence in ivory, **More** and up to three "See also" chips. Max 280 px wide. Tap outside or Escape closes it; it never pauses or unpauses anything.
- Keyboard: terms are focusable buttons; Enter opens, Escape closes. Screen readers read the term, then "definition".

### Where definitions live

- `content/glossary.json`: `{ id, term, aliases[], short, more?, see?[], group }`, validated by a zod schema in `src/sim/content/schema.ts`.
- In TSX: `<Term id="tempo">Tempo</Term>`. In content text (relics, items, gambits): a new markup `{w|tempo|Tempo}` handled by `RichText`, stripped by `plainText()`.
- Unit test: every `<Term>` and `{w|…}` id exists; every `short` is one sentence of at most 25 words; no two terms share an alias.

### Phases (agent-days)

| What                                                                   | Days  |
| ---------------------------------------------------------------------- | ----- |
| `Term` component, popover, Rules page, markup, schema, tests           | 0.5   |
| Writing ~45 entries (owner reads them once) and marking up the screens | 0.5   |
| **Total**                                                              | **1** |

### Risks

- Underline clutter on dense screens (relic cards): first-appearance-only and a cap of 3 marked terms per card.
- Definitions drifting from the rules: entries name no numbers that tuning can change, except where the number is the point (the eye badge's 20%), and the test fails if a term is removed from the game's text.

---

## Effort total

| Item              | Agent-days |
| ----------------- | ---------- |
| Glossary          | 1          |
| 1C Armory         | 6          |
| 1B Tournament run | 8          |
| **Total**         | **15**     |

Plus about 10 hours of balance runs (armory 3 runs, tournament 4 runs and 200 whole runs), one at a time with `--workers 2` on the shared machine.

## Docs to update when built

- [CHESS.md](CHESS.md): Match flow (Tournament, Exhibition), Act break (Armory tab), Interface (glossary).
- [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md): Items and shop (break shop, plan), the pitch line, and a Reversed decisions row for "Tier 3 only at jungle shops" if decision 1 is approved.
- [CHANGELOG.md](CHANGELOG.md): one entry per phase that ships.
