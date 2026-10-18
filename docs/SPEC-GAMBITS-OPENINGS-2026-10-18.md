# More gambits and Openings (spec, 2026-10-18)

> **Status: approved by Cheppy 2026-10-18 (all decisions as recommended).** Built on branch `proposal/next`, playable at `/proposal/` before it ships.

Status: **proposal, waiting for owner approval.** No code changed. Branch `test-product-2`; rules today are in [CHESS.md](CHESS.md) "Gambits" and "Gambit schools". Owner request: "add more gambits, openings… more gambit types and associated openers", going back to the original proposal.

## Decisions for the owner (read this first)

**Bottom line:** the original plan (2026-10-10) had six card schools with four cards each and five Openings. The game shipped only the first wave: 16 cards, and the sixth school, **Clock**, has no cards at all, although it already has a colour, a glyph, a sound and two counter rules. Finish that plan (8 new cards, every school at 4), add 4 Openings named after real ones (8 in all), and give each Opening one card it always opens with. About **7 agent-days**, or about 3 calendar days with parallel agents.

1. **Build the Clock school with the four original cards** (Zugzwang, Time Trouble, Opening Book, Increment). The original fourth card was called "Blitz"; it becomes **Increment** because Blitz is now the short match pace. **Recommend: yes.** It is the one card type the original had that the game lacks, and the setup screen already promises it ("Good against Clock").
2. **Add the original wave-3 cards:** Breakthrough (March), Pin and Desperado (Initiative), Fortify (Fortress). Every school then has 4 cards, 24 in all. **Recommend: yes.** Initiative has only 2 cards today, and "Bastion shields" are in the counter text but no card gives one.
3. **Add four Openings: English (from the original), Scandinavian, King's Indian, Caro-Kann**, 8 in all. **Recommend: yes.** Each school then sits in 2–3 Openings and every Opening has a clear verdict against each school. Left out: Ruy Lopez, London, Dutch, Queen's Gambit Declined (reasons in section 2C).
4. **Every Opening opens with one named card** (its **opening card**: Sicilian opens with Fork). It is in your first hand and does not expire until you play it or Act 1 ends. The Italian Game instead deals three different schools. **Recommend: yes.** Openings only change draw odds today, which you can't feel during play; this gives each one a visible first minute and costs no new balance knob.
5. **Zugzwang makes the enemy discard its dearest card**, and Black can do this to you. **Recommend: yes, as the original said** ("forced discards"). The banner names the card. If it feels bad in play, the fallback is a softer version (enemy cards cost +8 for 12 s).
6. **Four named courts switch to the new Openings:** Clockmaker's Circle → English, Lady Marlow's Court → Caro-Kann, The Black Queen's Court → Scandinavian, The Mirrorgate Society → King's Indian. **Recommend: yes.** Each one fits its motto. The round table (difficulty) is unchanged, but the Tournament ladder gets re-measured.
7. **Keep out for now:** a seventh school, the original "Line bonus" (a bonus for playing two of your Opening's schools in a row; it was never defined) and Refute (one card cancelling another; you overruled it on 2026-10-10). **Recommend: keep all three out.** Revisit the Line bonus once the 24 cards have been played.
8. **Test budget:** the full CLAUDE.md budget, including the second 800-match run (new cards are a rules change) and one Tournament ladder probe, is about 4 hours of runs. **Recommend: approve.**

## 1. Today vs the original vision

The original is the 2026-10-10 spec (commit `1151da2`, "gambit schools, Refute, Openings") and its same-day amendment (`c578596`, counters through effects). Before that, [PIECES.md](PIECES.md) "four doctrines" sketched team plans with a counter loop.

|                      | Original vision (2026-10-10)                                                                                                                 | Today                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schools              | 6: March, Initiative, Fortress, Sacrifice, Position, **Clock** ("wave 2")                                                                    | 6 named, **5 with cards**. Clock has its colour (bone), glyph, sound cue and counter rows, but **0 cards**                                                                                           |
| Cards per school     | Waves 1–3: about 4 per school, 24 in all (Clock: Zugzwang, Time Trouble, Opening Book, Blitz; wave 3: Breakthrough, Pin, Desperado, Fortify) | 16: March 3, Initiative **2**, Fortress 3, Sacrifice 4, Position 4, Clock **0**. Waves 2 and 3 were never built                                                                                      |
| Openings             | 5: Italian, Sicilian, French, King's Gambit, **English** (Clock + Position, "with wave 2")                                                   | 4 (no English)                                                                                                                                                                                       |
| What an Opening does | Two schools drawn twice as often; a **Line bonus** listed as "not yet"                                                                       | Two schools drawn twice as often, nothing else. Nothing happens at match start                                                                                                                       |
| How counters work    | First **Refute** (a card cancels an active enemy card); replaced the same day by **effects only**, 9 school pairs                            | Effects only, the same 9 pairs; setup shows one verdict per enemy school. **The two Clock pairs have no cards behind them**, so "Good against Clock" (Sicilian) and the like can't happen in a match |
| What the AI does     | "Black plays gambits with an AI heuristic"; Black picks an Opening                                                                           | `aiCardPick`: a plan per card, plays the best one scoring at least 1, inside the **87% pawns / 13% cards** Tempo split; Black's Opening is random (seeded), named courts have a fixed one            |
| Team plans           | Four doctrines (Iron Court, Queen's Guard, Siege Train, Assassins' Guild) that beat each other in a loop                                     | Partly live as the ten named courts                                                                                                                                                                  |

**What the original had that the game lacks:** the whole Clock school (the only card type that works on Tempo and the hand instead of the board), four cards that fill out thin schools, the English Opening, and the idea that an Opening is more than a draw weight (the Line bonus).

## 2. Proposal

### 2A. Gambit types: finish the six schools (no seventh)

The counter table stays exactly as approved (9 pairs). The new cards are built to make the pairs true:

| Pair                  | Made true by                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Clock > Sacrifice** | Time Trouble (no Tempo left for the big swing card), Zugzwang (the swing card is discarded)                |
| **March > Clock**     | Breakthrough and Advance: cheap bodies on the board while Clock spends Tempo on Increment and Opening Book |
| Fortress > March      | Fortify (a Bastion shield outlasts a push), with Hold the File                                             |
| Sacrifice > Fortress  | Pawn Sacrifice's hit (about 3,060) breaks Fortify's shield (720 on an outer Bastion)                       |
| Initiative > Fortress | Desperado: a hurt piece bursts the healer before the defence holds                                         |
| Initiative > Position | Pin holds an Outpost or Barricade holder still while Check and Fork finish it                              |

**Why no seventh school:** six schools with four cards each fill a 3-card hand well; a seventh would need new counter pairs, a new colour and glyph, and would thin every Opening's share. Depth over sprawl.

### 2B. New cards (8)

All are universal cards (no piece needed), weight 1.5 like wave 1, and inside today's cost range (7–30). Numbers are first guesses for the probes.

**Clock** (bone, clock face): bend the Tempo economy and the hands.

| Card             | Cost | Target | Effect (one sentence)                                                                                          | Numbers (`params`)                | Chess flavour                                                           |
| ---------------- | ---- | ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| **Zugzwang**     | 13   | none   | The enemy discards its dearest card in hand (17 Tempo or more), and that slot refills after 15 s instead of 6. | `minCost` 17, `refillSec` 15      | Every move they have makes things worse, so the best one is taken away. |
| **Time Trouble** | 17   | none   | The enemy loses 20 Tempo now and earns Tempo 30% slower for 20 s.                                              | `drain` 20, `incomeMul` 0.7, 20 s | Their clock is running low.                                             |
| **Opening Book** | 10   | none   | Your other two cards are redealt from your Opening's two schools (any school for the Italian Game).            | —                                 | You play from preparation.                                              |
| **Increment**    | 7    | none   | For 30 s, each card you play gives back 5 Tempo (a card never nets below 3).                                   | `refund` 5, 30 s                  | Fischer increment: time added with every move.                          |

**March** (one more):

| Card             | Cost | Target | Effect                                                                   | Numbers        | Chess flavour                                |
| ---------------- | ---- | ------ | ------------------------------------------------------------------------ | -------------- | -------------------------------------------- |
| **Breakthrough** | 13   | lane   | Your next pawnling wave in that lane comes with 3 extra melee pawnlings. | `extraMelee` 3 | A pawn break: more pawns than they can stop. |

Three pawnlings are about one elite pawn (a pawn is about 3× a pawnling), but they don't count toward the pawn cap: the card for when your lanes are full. It reuses Wing Gambit's extra-pawnling rule.

**Initiative** (two more):

| Card          | Cost | Target                      | Effect                                                                                                         | Numbers                                        | Chess flavour                                                 |
| ------------- | ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| **Pin**       | 17   | enemy piece                 | The enemy piece cannot move for 3 s, and the enemy piece nearest behind it (within 300) is slowed 40% for 3 s. | `rootSec` 3, `behindR` 300, `slowMul` 0.6      | A pinned piece can't move without exposing the one behind it. |
| **Desperado** | 13   | your piece under 40% health | It deals 60% more damage for 6 s; if it falls in that time, your team gets 10 Tempo back.                      | `damageMul` 1.6, 6 s, `hpMax` 0.4, `refund` 10 | A piece that is lost anyway takes something with it.          |

A pinned piece can still attack and cast. The engine's slows stop at a floor, so Pin needs a real "can't move" flag (implementer's note).

**Fortress** (one more):

| Card        | Cost | Target | Effect                                                                                                         | Numbers               | Chess flavour               |
| ----------- | ---- | ------ | -------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------- |
| **Fortify** | 17   | lane   | Your front Bastion in that lane (or the Throne if none stand) gets a shield of 20% of its max health for 20 s. | `shieldPct` 0.2, 20 s | Overprotect the key square. |

720 on an outer Bastion, 900 on an inner one, 760 on the Throne. It uses the unit shields items already give.

**Why each one earns its place:** Zugzwang and Time Trouble are the only answers to Queen's Gambit and Exchange that don't need a fight. Opening Book and Increment turn the hand itself into a decision (dig for a card, or chain a burst). Breakthrough is the only thing to spend Tempo on when the pawn cap is full. Pin and Desperado double the thinnest school. Fortify is the only card that protects a structure.

**Schools after the change:** March 4 (Advance, Pawn Storm, Siege, Breakthrough) · Initiative 4 (Check, Fork, Pin, Desperado) · Fortress 4 (Hold the File, Castle, Sanctuary, Fortify) · Sacrifice 4 (unchanged) · Position 4 (unchanged) · Clock 4.

### 2C. Openings: 8, each with an opening card

**One rule for every Opening:** its two schools are drawn twice as often (as today), and its **opening card** is in your first hand. That card does not expire until you play it or Act 1 ends; after that it is an ordinary card in the deck. It costs its normal price. Black's AI follows the same rule. The Italian Game has no opening card: its first hand holds three different schools.

| Opening                   | Schools                | Opens with     | Good against        | Even against                 | Weak against | Suits                                                                                 |
| ------------------------- | ---------------------- | -------------- | ------------------- | ---------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Italian Game (default)    | none (balanced)        | three schools  | —                   | —                            | —            | A first match, or not knowing the court                                               |
| Sicilian Defence          | Initiative + March     | Fork           | Clock               | Position                     | Fortress     | Players who want early fights and picks                                               |
| French Defence            | Fortress + Position    | Hold the File  | March               | Sacrifice                    | Initiative   | Patient defenders                                                                     |
| King's Gambit             | Sacrifice + March      | Pawn Sacrifice | —                   | Fortress, Clock              | Position     | All-in pushers who give pawns for Bastions                                            |
| **English Opening** (new) | Clock + Position       | Increment      | Sacrifice           | March                        | Initiative   | Card players who like managing Tempo and playing many cheap cards                     |
| **Scandinavian** (new)    | Initiative + Clock     | Check          | Sacrifice, Position | Fortress                     | March        | Aggressive players: the Queen comes out early; beaten by steady pushers               |
| **King's Indian** (new)   | Sacrifice + Initiative | Exchange       | Fortress            | Position                     | Clock        | Counter-punchers: let them build, then break the defence                              |
| **Caro-Kann** (new)       | Fortress + Clock       | Fortify        | —                   | March, Initiative, Sacrifice | —            | Cautious players: no bad matchup, no easy one; the safe pick against an unknown court |

- Verdicts follow today's rule (`openingMatchups`): each enemy school gets one verdict, never two. They were computed from the approved counter table.
- **Spread:** each school is in 2–3 Openings (March 2, Initiative 3, Fortress 2, Sacrifice 2, Position 2, Clock 3).
- **Left out:** **Ruy Lopez** (Position + Initiative): good against three schools, which would read as the "best" pick, and a fourth Initiative Opening (kept in reserve, opening card Pin). **London System** (Fortress + March): weak against three schools. **Dutch:** three good and three weak, no clear plan. **Queen's Gambit Declined:** the Queen's card already owns that name.
- **The opening cards fit:** Pawn Sacrifice for the King's Gambit (f4 gives a pawn), Exchange for the King's Indian (the exchange sacrifice), Check for the Scandinavian (the Queen's early check), Fortify for the Caro-Kann (a solid pawn chain).

## 3. Card economy fit

- **Cost curve:** new cards cost 7–17, inside today's 7–30. The cheapest card is still 7. With Opening Theory, Increment drops to the minimum of 3; Increment's give-back never takes a card below a net 3 Tempo, so the `gambits.minCost` rule holds.
- **AI Tempo split (87% pawns / 13% cards): unchanged.** New cards count as card spending at the price paid. Increment's give-back counts as income, not negative spending. Time Trouble lowers the enemy's Tempo, not its spending shares. The opening card is an ordinary card in the split.
- **Black's gambit banner:** the same banner with the school mark. New lines: "Black played Zugzwang: your Fork is discarded", "Black played Time Trouble: you lose 20 Tempo", "Black played Pin on your Knight", "Black played Fortify on Left lane". A line about something you lose takes seal red (the "costs you" colour). In a run, "Black" reads as the court's name, as today.
- **Named courts:** four switch Opening (decision 6). Clockmaker's Circle ("Move on the tick"; Quiet Move) → English. Lady Marlow's Court ("every card at exactly the right moment"; Opening Theory) → Caro-Kann. The Black Queen's Court ("The Queen leads") → Scandinavian. The Mirrorgate Society ("happiest when its King is in danger") → King's Indian. The other six keep theirs, so all eight Openings are used. A run saved before the change plays its later rounds with the new court Openings.
- **Tournament Spoils book moves:** no rule change. The pool is "a card from the court's Opening schools that is not a book move yet", so it now includes the new cards (Clock cards for English, Scandinavian and Caro-Kann courts).
- **Relics that touch cards:**
  - Opening Theory works on the new schools as they are.
  - Sealed Move cannot hold Increment or Opening Book: they change your own hand or income, so there is nothing to aim.
  - Standing Order keeps its four lane cards (no Breakthrough).
  - The relic AI's school tags gain `clock` on Spare Tempo, Quiet Move and Sealed Move, so Clock Openings have relics to lean on.
- **Blitz:** no rule change. The opening card lasts through Act 1, a third of a Blitz match. The old "Blitz" card name is gone (it is Increment), so the word means only the pace.

## 4. Interface (phone first)

- **Hand:** still three cards. Every card already shows its school glyph and colour, so a sixth colour adds no clutter, and the glyph keeps colour from being the only signal. The opening card carries a small brass "Opening" corner and an "Act 1" pin in place of its expiry bar. Its long-press sheet says "Your Opening's card: kept until you play it or Act 1 ends".
- **Opening picker (Setup page 3):** 8 compact rows instead of 4 tall cards. Each row is about 56 px: the name, the two school glyphs and "Opens with Fork". Eight rows take about 450 px at 390×844; the list scrolls while the pace switch and Begin stay pinned at the bottom. The picked row opens a one-line verdict strip of glyphs only ("Good ▲ · Weak ▼"). **More** keeps today's full explanation, verdicts and example hands. A line at the top reads "New here? Italian Game or Caro-Kann". Landscape and desktop use two columns of four.
- **Pre-filled Opening:** your last pick, remembered on this device; Italian on a first visit. Today a random Opening is pre-filled, which could hand a novice the King's Indian.
- **Versus card:** under each side's Opening, a small "Opens with …". Black's Opening is already revealed there, so this hides nothing new.
- **Card info and Rules:**
  - The Rules page (Title and Adjourn) gains **All cards**: a row of six school chips (44 px each, fits 390 px), each showing its four cards with cost and one line.
  - Live play adds nothing.
  - One glossary word is added: **opening card**. The `school` word already names all six.
- **Effects in the 3D view:**
  - Pin: a brass pin ring on the target and a thin line to the piece behind it.
  - Fortify: a stone shield ring on the Bastion, with a shield segment on its bar.
  - Breakthrough: a banner bearer leads the bigger wave.
  - Desperado: a red rim on the piece.
  - The four Clock cards have no board effect; they show on the Tempo meter (drain, +5 pips) and in the hand (discard, redeal).
- **Gambit impact lines** (combat feedback):
  - Time Trouble: "drained 26 Tempo".
  - Zugzwang: "discarded Fork".
  - Increment: "gave back 15 Tempo".
  - Opening Book: "redealt 2 cards".
  - Pin: "held the Knight 3 s".
  - Fortify: "shield soaked 640 damage".
  - Breakthrough: "3 extra pawnlings, 410 Bastion damage".
  - Desperado: "+380 damage" and, if the piece fell, "+10 Tempo".
- **Sound:** the existing `clock` school cue gets its first use.

## 5. AI

- **`aiCardPick`:** no change to how it picks. The best-fitting card scoring at least 1 is played, inside the Tempo split and the 40 reserve. Each new card gets its own `plan` case:
  - **Time Trouble:** when the enemy holds 45+ Tempo (it is about to buy); higher in a fight.
  - **Zugzwang:** when the enemy holds a card worth 17+ and has nearly enough Tempo to play it. The AI reads the enemy's hand the way it already reads every unit's position, and the same rule serves both sides.
  - **Increment:** with 60+ Tempo and at least one other card in hand whose plan fires.
  - **Opening Book:** when neither other card has had a plan for 15 s and the AI holds 50+ Tempo.
  - **Breakthrough:** the lane where its pieces push and the enemy's front Bastion is weakest.
  - **Pin:** like Check, an enemy piece in a fight with 2 or more of its pieces near.
  - **Desperado:** its piece under 40% health, in a fight, with an enemy piece in reach.
  - **Fortify:** its front Bastion under 80% health with 2+ enemy pieces or 4+ units near.
  - Each plan must fire in a staged unit test and stay quiet otherwise.
- **The opening card:** the AI holds it like any card and plays it when its plan fires. If it never does, it expires when Act 1 ends.
- **Opening choice:** Exhibition Black stays random among the 8 (seeded, as today). Named courts keep a fixed Opening. The counter-Opening pick still applies only to the generated stand-in courts (if `courts.json` is missing) and works over 8 Openings with no change (`openingEdge`).
- **Known weak spot:** the AI gets less from Increment and Opening Book than a thinking player does. Measured in the player probe; if the card-playing player rises above 60%, lower those two cards' draw weight to 1.

## 6. Balance plan, tests, phases, risks

**Every AI-vs-AI match changes** (new cards in both decks, and Black's random Opening pick now covers 8), so `npm run baseline` is re-recorded on purpose. New cards are a rules change, so the second 800-match seed is required.

**Runs** (CLAUDE.md budget; 200 matches is about ±7 points and 7–8 min on 2 workers):

| #   | Run                                                                                            | Why                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | 200, Clock vs Sacrifice decks (`--schools-A clock --schools-B sacrifice`, a new per-side flag) | Clock > Sacrifice is real                                                                |
| 2   | 200, March vs Clock decks                                                                      | March > Clock is real                                                                    |
| 3   | 200, all 24 cards, AI vs AI                                                                    | Tune numbers (repeat at most twice)                                                      |
| 4   | 200, `--white-player --white-every 60`                                                         | Player-facing check: target 55–60% (59% today)                                           |
| 5   | 200, idle player (`--white-player --no-gambits-A`)                                             | Target 45–52% (about 44% today)                                                          |
| 6   | 800, seed 29000, `--quiet --workers 2`                                                         | Confirm: White 48–52%, median 12–16 min                                                  |
| 7   | 800, seed 31000                                                                                | Required (rules change)                                                                  |
| 8   | 200, `--pace blitz`                                                                            | Blitz median 8–10 min, points decisions about 20%                                        |
| 9   | Tournament ladder, 100 runs, `--white-player --white-every 60 --ladder`                        | Four courts changed Opening: rounds 55–65 / between / between / 35–45%, Champions 10–20% |

- From the two 800s (no extra runs): each Opening's win rate per side (about 200 appearances each; flag outside 44–56%), each card's plays per match and its impact line, AI cards per Act (keep about 3.5) and Tempo on cards (about 13%).
- Total: about 3,600 matches plus the ladder, about 3 hours of runs (about 4 with the 1.5× pad).
- A new balance flag, `--openings A=id,B=id`, lets a probe pin both Openings if one stands out.

**Tests:**

- **Unit:** each card's effect; each AI plan (fires when staged, quiet otherwise); the minimum 3 with Increment and Opening Theory together; Zugzwang's 15 s refill; Time Trouble's income window; the opening card (dealt, kept through Act 1, expires when Act 2 starts, Italian's three schools); content checks (every school in at least 2 Openings, no verdict in two lists, courts point at real Openings); Sealed Move excludes Increment and Opening Book; glossary numbers.
- **Browser:** Setup page 3 at 390×844, 844×390 and desktop (8 rows, pinned Begin); hand (opening-card corner); gambit sheet; Black banner for Zugzwang and Time Trouble; Rules → All cards; Tournament spec (court Openings); smoke. Before reporting, run `npm run check`, `npm run baseline` and the touched specs. Run the full `npx playwright test` once, before announcing it live.

**Build phases** (agent-days padded 1.5×):

| Phase | Work                                                                                                                   | Agent-days    |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------- |
| A     | Clock school: 4 cards (sim, AI plans, impact lines, banner text, Tempo-meter and hand effects, tests)                  | 2             |
| B     | Wave 3: Breakthrough, Pin (with the can't-move flag), Desperado, Fortify (sim, AI plans, 3D effects, tests)            | 2             |
| C     | Openings: 4 new, opening card rule, courts, Setup page 3 rows, versus card line, Rules → All cards, glossary (needs A) | 2             |
| D     | Balance runs 1–9, one tuning pass, docs (CHESS.md, SOURCE_OF_TRUTH, CHANGELOG, balance report)                         | 1.5           |
|       | **Total**                                                                                                              | **about 7.5** |

A and B can run in parallel; both touch `src/sim/gambits.ts` and `content/gambits.json`, so they merge by hand. C starts after A. That's about 3 calendar days.

**Risks:**

- **The player edge grows** because the AI under-uses Increment and Opening Book. Mitigation: weight 1 for those two (one number each).
- **Time Trouble against the AI's pawn plan:** the AI's Tempo sits at 40–55, so a 20 drain stops its pawns for about 20 s. It may be strong against Black in Classical. Probe 4 shows it; the knob is `drain`.
- **Zugzwang feels bad** when Black takes your saved card. Fallback in decision 5.
- **Fewer signature cards per hand** (5 of 24 instead of 5 of 16). Piece cards get rarer; if they feel missing, raise their weight 1.5 → 2.
- **Setup page 3 gets crowded on phones.** The compact rows are the fix; the browser spec checks that Begin stays visible.
- **Saved matches from before the change** won't replay to the same position; they are dropped with a note (today's Resume rule). Saved runs keep their courts but take the new court Openings.

## Doc follow-ups once built

- CHESS.md "Gambits", "Gambit schools" and "Tournament run" (courts).
- SOURCE_OF_TRUTH's dated docs list (this file is already linked).
- A balance report for the runs.
- No reversed decision: Refute stays out, and the counter table is unchanged.
