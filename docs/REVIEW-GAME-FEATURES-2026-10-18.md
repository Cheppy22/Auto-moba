# Game review: features and play (2026-10-18)

Features reviewer's report on the chess variant, build `f9fd7f5` (branch `wip/techniques-ui-a`: 8 Openings with opening cards, 24 gambit cards in 6 schools, items retired, Techniques with the Act-break Builds tab and Pick for me). A second reviewer covers visuals and UX in parallel; this report covers what the game does and how it plays. Scored against the AA bar of 8 from [FABLE-REVIEW-1-2026-10-11.md](FABLE-REVIEW-1-2026-10-11.md). Screenshots: `docs/img/review-2026-10-18/`.

**In progress, not scored down:** Setup's First moves page (read only), the report and end-report Technique tallies, Spoils and Run kit card faces, Adjourn's Builds tab (phase 5b, another agent).

## BLUF

1. **About 6 / 10 against the AA bar of 8** (Fable pass 2: 6). The game is far richer than at pass 2 (24 cards, 84 Techniques, 8 Openings, named courts, a build choice at every break) and the screens teach themselves well. The loop still does not reward the player's live decisions.
2. **Biggest problem: playing cards does not win more.** On the same 200 seeds a player who never plays a card wins **50.5%**; one who plays a card a minute wins **49.2%** (AI vs AI 48.0%; target for the card player 55–60%). Pass 2's "live play is thin" has become "live play is optional".
3. **Build picks are formulaic.** The AI's card score has no term for how strong a card is: it fills empty slots and chases Combinations. My own reasoned picks matched "AI suggests" in 14 of 15 decisions, and where no Combination is in play the three cards score within about 0.5 of each other, so the marked card is close to a coin flip.
4. **Openings are unbalanced since Techniques arrived:** an Opening's schools also double that side's Technique draws, so the Initiative Openings win 57–58% and the default Italian Game 44%, the English 43% (800 matches).
5. **Fix first (both small):** enemy cards (Check, Pin, Fork) cannot be aimed by tapping the enemy's portrait in the court bar, so the Scandinavian's opening card was never played in 17 tries; and in Blitz a Combination completed at the last break is promised for "the next offer", which never comes.

## How this was reviewed

- **Played in the browser** with Playwright scripts that tap the real screens (cards and aims, fork sheet, Builds tab, relics, Resume, report), stepping the clock between decisions:
  - Phone 390×844, Exhibition, Blitz (the phone default), Italian Game, intro and hints on, Pick for me on: White won by Checkmate at 10:42 in Act 3; 33 card plays tried.
  - Desktop 1440×900, Exhibition, Classical, Scandinavian, Pick for me off, my own build picks: White won by Checkmate at 15:27 in Act 4.
  - Phone Tournament, Blitz: Draw, round 1, Spoils, reload and Continue, round 2 (see finding 11).
  - A focused check of enemy-card aiming on phone and desktop.
  - Software WebGL, so frame rates mean nothing. The scripts play cards by a simple rule (opening card first, then whatever fits the board), not by expert judgement.
- **Sim probes** (Long Board, 2 workers, about ±7 points at 200): card-a-minute player (`--white-player --white-every 60`, seeds 33000+), idle player (`--white-player --no-gambits-A`, same seeds), Blitz AI vs AI (200), and a 40-run Tournament ladder. Also read: the merged tree's 800-match confirm (seed 29000), which has the same sim as this build (phase 5a changed no sim code; the baseline is identical).
- **Code read** where play could not tell: the build AI and Pick for me (`src/sim/builds.ts`), the Spoils AI (`src/sim/run/rewards.ts`), the court-bar portraits (`src/ui/hud/BlackCourt.tsx`).

## Scores

1 to 10; the AA bar is 8. "Pass 2" is Fable's score on 2026-10-13 where the area existed.

| Area                                 | Pass 2 | Now   | Verdict                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-time experience, onboarding    | 2      | **6** | Real teaching now: versus card, five once-only hints (high ground, captures, the fork, the break walk-through), glossary underlines, "New here? Italian Game or Caro-Kann". Still ten-plus nouns before the first match and no "what just happened" after a loss.                                           |
| Setup (Openings, lanes, First moves) | 8      | **7** | Openings page is clear (eight rows, verdict strip, More with example hands). Lane board and synergy notes work. Docked one point because the Opening choice is unbalanced and the recommended default is the weakest pick (finding 4). First moves is read only (in progress).                              |
| Live play agency (cards, Tempo)      | 4      | **4** | Cards are playable from second 0 and a player can play one every 15–30 s, but the measured payoff is zero (finding 1). Aiming enemy cards from the portraits fails (finding 2).                                                                                                                             |
| Gambit cards and the six schools     | —      | **5** | Schools read well and the opening card makes an Opening felt on second 1. But five piece cards are near dead and three cards dominate (finding 6).                                                                                                                                                          |
| Rank 4 archetype choice              | —      | **6** | The fork sheet is good: plays-like line, stat before → after, the new skill, pauses the match. The options are not balanced (Huntress 60% vs Duelist 37%), and nothing tells the player which archetype fits the Techniques it already holds (finding 8).                                                   |
| Act break (report, Orders, relics)   | 7      | **7** | The Builds tab gives the break a second real decision, the coach callouts are specific ("Your Rook was focused by three or more pieces 2×"). The relic draft repeats Sortie (finding 9).                                                                                                                    |
| Techniques (piece builds)            | —      | **6** | Cards are readable: slot, plays-like, the rule at this grade, real before → after numbers, "89 hits last Act: about 22 extra strikes", Combination lines. Builds differ by piece. But picks are formulaic, misfit cards get suggested, gold piles up and the AI never rerolls or passes (findings 3, 5, 7). |
| Pick for me                          | —      | **5** | On by default and fast: one tap per break if you want. Its suggestions carry the weaknesses of the AI score, and the stars mostly flag the offer's grade, not a pick that is hard or important (finding 3).                                                                                                 |
| Match pacing and endings             | 5      | **6** | Blitz played in 10:42, Classical in 15:27; median 13.3 min, p90 20.8 over 800. Checkmate has a beat and a clear result card. Blitz ends on points 36% of the time (design 10).                                                                                                                              |
| Tournament run                       | —      | **6** | Named courts with mottos, seals and portraits, a ladder, Spoils, a saved run with Continue. The later rounds are easier than meant, and the book move is never worth taking (finding 11).                                                                                                                   |
| Post-match report                    | 8      | **8** | Still over-delivers: result, economy, combat, objectives, per-piece pages with Techniques and a timeline, replay, log.                                                                                                                                                                                      |
| AI opponent and difficulty curve     | 5      | **5** | One AI level. The courts give faces; the AI judges fights. It never rerolls or passes, under-plays piece cards, and the ladder's difficulty is flat to inverted.                                                                                                                                            |
| Replayability and mastery            | 4      | **6** | 24 cards × 8 Openings × 84 Techniques × 10 courts gives real variety; Combinations give something to chase. Mastery is capped while cards do not change results.                                                                                                                                            |
| **Overall**                          | **6**  | **6** | Content and clarity are near AA; the payoff for skill is not.                                                                                                                                                                                                                                               |

## Findings, ranked by player impact

### Bugs (broken)

**1. Enemy cards cannot be aimed by tapping the enemy's portrait (S).**

- Seen: aiming Check, the hint says "Tap a Black piece". Tapping a Black portrait in the court bar opens that piece's card instead of playing Check; the card stays aimed. The desktop run, with the Scandinavian (its opening card is Check), tapped portraits 17 times in Act 1 and never played it. A focused check with Pin on seed 42 gave the same result on phone and desktop: 0 cards played, the piece card open, the aim still waiting. Screenshot: `desktop-check-aim-opens-piece-card.png`, `phone-enemy-token-tap.png`.
- Why it matters: Check, Pin and Fork are a third of the Initiative school and two Openings' opening cards. On a phone, tapping a 20–30 px moving piece in the 3D view is the only way left. `session.aimUnit` already supports portraits (its comment says a Black portrait plays an enemy card); the court bar's `BlackCourt.tsx` calls `openCard` and never `aimUnit`. The browser test for this (`view.spec.ts`) sets the camera by hand and taps the 3D piece, so it never noticed.
- Fix: in `BlackCourt.tsx`, try `s.aimUnit(u.id, 'B')` first and open the card only when it returns false; add a browser test that aims Check from a portrait. Size **S**.

**2. Blitz promises Combinations that can never arrive (S).**

- Seen: Blitz has two breaks. At the second break the King took Rallying Cry while holding Shared Guard; the card said "Completes a pair with Shared Guard: Royal Court comes in this piece's next offer". There is no next offer in Blitz; the match ended with both parents and no Royal Court. The same holds for the Rank 8 "next offer is Brilliant" rule. Screenshot: `phone-break2-builds.png` (Queen's "Leads to" lines), `phone-report-result.png` (King: King's Walk, Shared Guard, Rallying Cry).
- Why it matters: Combinations are the build's payoff, and Blitz is the phone default. Only 23% of White's pieces end a Blitz match with a Combination (34.5% in Classical).
- Fix: at the last break of a Blitz match, deal a ready Combination at once (as the wild card of this offer, or the moment both parents are held), or hide the promise. Size **S**.

**3. Three Technique names clash with gambit cards (S).**

- Seen: Pin, Desperado and Zugzwang are both gambit cards and Techniques, in different schools (gambit Pin is Initiative, Technique Pin is Position; Desperado Initiative vs Sacrifice; the Technique Zugzwang is a Combination). Setup's First moves showed "Pin · Position · Attack" in a match whose hand held the Pin card. Screenshot: `phone-setup-first-moves.png`.
- Why it matters: school colours and glossary words are meant to mean one thing; a player reading "Pin" cannot tell which rule applies.
- Fix: rename the three Techniques (for example Pinning Blows, Last Stand, Bind). Size **S**.

**4. Smaller bugs.**

- The Scandinavian's More panel shows the Initiative glyph twice in "Even against ⚔ ⚔ Fortress", and the console logs a duplicate-key warning for it three times (`OpeningPage.tsx`, the verdict glyphs are keyed by school and the school appears twice). Screenshot: `desktop-opening-more.png`. De-duplicate the list and key by index. **S**.
- A player who decides every piece by hand keeps every piece's gold: Resume only spends gold for untouched pieces. In the desktop run (all pieces picked by hand, upgrades not bought) the pieces sat on 4,000–6,600 gold each by the third break. The bottom line says so, but a player who wants to pick cards and still have upgrades bought has no way to ask for it. Offer "Spend my gold on upgrades" (or keep auto-upgrades unless the player buys or rerolls). **S**.

### Design (works, but weak)

**1. Cards do not change results (L).**

- Seen: same seeds (33000–33199): idle player **50.5%**, card-a-minute player **49.2%**, AI vs AI 48.0% (800). The idle player fields 72 pawns a match, the card player 58.5 and about 17 cards: the cards' Tempo would otherwise have bought about 14 pawns, and the cards win nothing more than those pawns. On 2026-10-13 the same comparison read 49.5% idle against 55–59% for the card player. Known issue confirmed: the player win rate is below the 55–60% target (47.7% before, 49.2% now).
- Why it matters: cards are the only decision during an Act. If ignoring them costs nothing, the player is a spectator between breaks, which is pass 2's lowest score (live agency 4).
- Fix (needs a probe): make a card worth more than the pawn its Tempo buys. Options, cheapest first: raise card effects again (the 2026-10-14 ×1.5 worked), or make the White auto-pawn plan less efficient than hand play (for example auto pawns cost 18, hand-fielded 15); then measure idle vs card player on paired seeds until the gap is 6–10 points. Size **M** to tune, **L** if cards need redesign.

**2. Openings are unbalanced, and the recommended default is the weakest (M).**

- Seen (800 matches, both sides pooled): Scandinavian 58.3%, King's Indian 56.7%, Sicilian 51.8%, French 49.7%, Caro-Kann 49.1%, King's Gambit 48.2%, **Italian 44.3%**, **English 42.6%**. The Setup page says "New here? Italian Game or Caro-Kann". Before Techniques (Openings phase C alone) the Italian read 52.8–53.4% and the English 51–52%.
- Why: an Opening's two schools also double that side's Technique draws (`builds.weights.opening` 2), and Initiative Techniques are the strongest group (28.8% of all picks). The Italian has no schools, so it gets no Technique boost at all; Initiative Openings get the best one. The Opening page never says this: its text is "tilts which gambit cards you are dealt" (`desktop-opening-more.png`), so the biggest effect of the choice is hidden.
- Fix: decouple Techniques from the Opening (draw Techniques by the piece's held schools only), or give the Italian an equal perk, then re-run the 800. Size **M**.

**3. Build picks are formulaic, and Pick for me cannot tell a strong card from a weak one (M).**

- Seen: the AI's card score is grade + 1 for filling an empty slot + small bonuses for fit, school and Combination parents + ±0.3 random jitter (`scoreCard`). There is no term for what a card does. Examples:
  - Phone break 1, Bishop: Interdiction 3.14, The Hungry Mask 3.22, Pin 3.13: the pick is jitter. It picked The Hungry Mask (+67.5% Blade, a Dubious price) for a Soul healer.
  - Desktop break 2, Shadow Bishop (Brilliant offer): AI suggests Wind-up ("every 4th hit strikes again for 200% Blade"; the Bishop has 35 Blade) over Unending Night (her signature 14 s → 9.6 s), because Wind-up is a Windmill parent. Screenshot: `desktop-builds-windup-on-bishop.png`.
  - My own picks with Pick for me off (Combination first, then "completes a pair", then fill a slot) matched the AI's pick in 14 of 15 decisions.
  - The star's reasons were "a Sharp offer" or "your top-damage piece" in every break of the phone run; a large score spread means the AI is sure, which is when the player's look matters least.
- Why it matters: the owner asked for "mostly RNG, limited but informed agency". The informing is excellent (numbers, plays-like, last-Act lines); the decision itself is usually obvious (chase the pair) or arbitrary (near-equal fills). That is "limited", but not yet "agency".
- Fix: add a measured value per card (damage, healing or win-rate share per Act from the balance runs, stored in content) to the score; star an offer where two cards are close in value but differ in kind (a real choice), not where one card wins by far. Size **M**.

**4. Gold has nothing to buy late, and the AI never rerolls or passes (S).**

- Seen: per match 0.1 rerolls and 0 passes (800 matches). A card that fills an empty slot scores at least 2 and the AI rerolls only below 1.2, so with six slots it never rerolls; it passes only when every card would replace a Combination. Gold left after the break grows: median 347 at break 1, 810 at break 3, 1,782 at break 4, 3,504 at break 5. Known issue confirmed.
- Why it matters: Reroll and Pass are two of the four Builds buttons; neither is ever modelled for the player, and late gold is dead weight.
- Fix: let the AI reroll when its best card is under a value bar (not a slot bar) once the measured value exists; add a late sink (for example a second offer for 1,500 gold, or "upgrade the offer's grade"). Size **S**.

**5. Combination parents are over-picked; some Combinations are weak (M).**

- Seen (800): Shared Guard picked 88% when offered, Family Fork 84%, Echoing Decree 84%, Rallying Cry 82%; every Combination 99–100% when offered. Royal Court is held by about half of Kings, so King builds converge. Held win rates: Windmill 58%, but Swindle 39%, Steamroller 41%, Smothered Mate 45%, Zugzwang 45%. Known issue confirmed.
- Fix: lower the parent bonus once the partner is unlikely (`parent` 0.6 → 0.3), and tune the weak Combinations up before the strong ones down. Size **M** (numbers plus an 800).

**6. Dead and dominant gambit cards (M).**

- Seen (plays per match per side, 800 AI vs AI; player stand-in in brackets): Castle 0.03 (0.03), Fork 0.02 (0.29), Queen's Gambit 0.03 (0.34), Sanctuary 0.06 (0.16), Pawn Storm 0.10 (0.12), Siege 0.11 (0.18), Increment 0.19 (0.01). Top: Pawn Sacrifice 1.5, Open File 1.25, Zugzwang 1.2, Poisoned Pawn 1.0. Black's Sicilian opening card (Fork) is almost never played, so its slot idles all Act 1.
- Why it matters: the five piece cards are the cards with the most character (the Queen's Gambit, Castling, the Knight's Fork) and the AI almost never shows them to the player.
- Fix: give the AI plans for the piece cards (Castle when the King is low and the Rook healthy, Fork on a low enemy in reach, Queen's Gambit when the Queen is in a fight) and trim Pawn Sacrifice (cost 7 → 10 or a lower burst). Size **M**.

**7. Dubious Techniques are under-picked but win when held (S).**

- Seen: The Hungry Mask 9.5% pick rate, 61.5% win when held; Drink Me 8.1% / 62.3%; Eat Me 5.0% / 55%; Pact of Ash 13.3% / 57.8%. Low-pick Tempo cards: Time Pressure 6.5%, Tithe 6.1%, Slip 7.0%, The Vault 7.8%.
- Fix: part of design 3 (a value term); then retune the four near-dead cards. Size **S**.

**8. Rank 4 archetypes are unbalanced (M).**

- Seen (800, win rate when taken): Queen Huntress 60.2% vs Duelist 36.6%; Bishop Light 56.6% and Shadow 55.9% vs Zealot 39.0%; Knight Errant 55.6% vs Lancer and Paladin 48%. The fork sheet (`desktop-rank4-fork.png`) shows stats and the new skill but not which archetype fits the Techniques the piece already holds.
- Fix: tune Duelist and Zealot up; add a one-line "fits your Techniques: …" note to each option (the AI already computes this lean). Size **M**.

**9. The relic draft keeps offering Sortie (S).**

- Seen: Sortie was offered 1,826 times in 800 matches; every other relic 380–650. It is the tailored card after losing Bastions ("Offered because you lost 2 Bastions"), and it wins 44.3% when held. Both of my phone breaks offered it. Screenshot: `phone-break1-relics-sortie.png`.
- Fix: rotate the tailored slot through the relics that answer the same problem (Curtain Wall, Royal Keep), or skip a relic offered at the last break. Size **S**.

**10. Blitz: over a third of matches end on points, and it may lean Black (S to M).**

- Seen: Blitz AI vs AI, 200 matches (seeds 33000+): White **47.5%** (the earlier probe on seeds 29000+ read 45.5%; together about 46.5% over 400, ±5), median 11.3 min, p90 13.1, **36% decided on points** (25% in the earlier probe; the 2026-10-17 proposal moved Endgame to Act 2 because the Act 3 version decided 28.5% on points). Combinations on 23% of White's pieces (Classical 34.5%).
- Why it matters: Blitz is the phone default. A match that ends on a Bastion count at 0:00 of Act 3 is a weaker ending than Checkmate, and a third of phone matches end that way.
- Fix: a stronger Endgame in Blitz (Throne damage +50% → +75%, or Thrones 3000 → 2700), then one 200 probe for points share (target under 20%) and a second seed on White's share. Size **S** to tune.

**11. Tournament: later rounds are easier than meant; the book move is never worth taking (S).**

- Seen: PENDING_LADDER. Let the AI choose takes the heirloom over the book move every time by construction (`aiHeirloomGold` 900 vs `aiBookGold` 500, and an heirloom is always on offer), so "book move never picked" is confirmed. The book move itself only doubles draw odds for two schools, the effect the Openings spec called something "a player cannot feel in play".
- Fix: make the book move concrete (for example "your Opening card returns at the start of every Act"), then let the AI value it honestly; retune the round table. Size **S**.

**12. On an upright phone the Builds cards start below the fold (S).**

- Seen: at the first break the strip, the "Worth a look" line, the six-slot row and the break walk-through box fill the screen; only the top of the first card shows. Screenshot: `phone-break1-builds-pickforme.png`. (Layout belongs to the UX reviewer; noted here because it hides the decision.)
- Fix: fold the slot row to one line of chips until tapped. Size **S**.

## Known issues from recent reports

| Issue                                           | Verdict                                | Evidence                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Player win rate below the 55–60% target (47.7%) | **Confirmed, and worse than it looks** | 49.2% card player vs 50.5% idle on the same seeds: cards add nothing (design 1).                                                             |
| Blitz 45.5% White                               | **Partly confirmed**                   | 47.5% on new seeds; about 46.5% over 400, inside noise of 48 but low on both. The bigger Blitz problem is 36% decided on points (design 10). |
| Book move never picked                          | **Confirmed by construction**          | Heirloom 900 vs book 500 in `rewards.ts`; an heirloom is always offered (design 11).                                                         |
| Combination parents over-picked                 | **Confirmed**                          | Shared Guard 88%, Family Fork 84%, Echoing Decree 84%, Rallying Cry 82%; Combinations 99–100% (design 5).                                    |
| AI never rerolls or passes                      | **Confirmed, by rule**                 | 0.1 rerolls, 0 passes a match; any slot-filling card scores ≥2 against a reroll bar of 1.2 (design 4).                                       |

## What is already AA

- The break's information design: coach callouts, the gambit ledger ("Pawn Sacrifice 7 Tempo: 3,182 Bastion damage"), the Technique card's before → after ledger and last-Act lines.
- The report.
- The fork sheet and the opening card rule (an Opening is felt on second 1).
- Pacing: Blitz near 10 minutes and Classical near 15 match the owner's targets.

## Recommended order

1. Bugs 1–3 (all **S**, one agent, half a day).
2. Design 1 (cards matter) with paired idle/card probes; it gates every later balance number.
3. Design 2 (Openings) and design 3 (card value in the AI score), together: both change Technique draws and picks; one 800 confirms both.
4. Designs 4–9 as a tuning pass with the 800.
5. Tournament round table (design 11) last, after the above settle.
