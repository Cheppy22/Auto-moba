# Fable review 1 (2026-10-11, amended 2026-10-13)

Planning assessment of the chess variant (branch `test-product-2`) against the owner's target: a AA-quality game with an addicting loop and a striking, unique look, on mobile and desktop browsers. Reviewer: Fable (planner session). Belongs to [CHESS.md](CHESS.md).

Two passes so far. **Pass 1** (2026-10-11, build `0ae8789`) rated the square-map build and set the plan. **Pass 2** (2026-10-13, build `cb5f979`) reviewed the Long Board build, audited pass 1's assumptions and amended the plan. Every decision below is the current one; the amendment history is in section 7.

**Owner answers that frame this review:** quality bar is Guildrun and Slay the Spire; free web game first; **no meta progression** (the source of truth already shelves it); local-first; match length open; more live agency welcome; the Long Board, full screen with a free camera and the Slate garden / Lamplit parterre themes, is the look (it superseded "Spotlight Arena variant c stays" on 2026-10-12; variant c remains only on `?map=square`).

## 1. BLUF

1. Against a AA bar the build sits at about **6 / 10** (5.5 at pass 1). Setup, intro, the report and the sim tooling are past AA. The gap is still the loop: live play is thin, there is one AI level and no reason to return, and the platform layer (install, offline, save, iOS) does not exist.
2. The Long Board was the right order. It changed the sim (180° fairness, high ground, line of sight) and, with the combat spacing pass, halved kills per match, so fights read. The void is gone. Art is now 7 on a phone, 6 on desktop; pieces are still generic low-poly.
3. Approved plan, in order: **Tempo tune** (numbers only, first), **Tournament run** and **interactive armory** with an early glossary, **Blitz and Classical** (redefined as pace, not shorter Acts) and **named opponents**, the art and readability pass (**capture spectacle** with a life pass, desktop framing, portrait chrome compaction, the ink-and-brass prototype), onboarding, then audio, then platform last.

## 2. Evidence

Both passes played the default path (Quick start, defaults) through Playwright on software WebGL, so frame rates mean nothing and a real-phone check is still outstanding.

| Pass | Build     | Matches                                                                                                                                                  | Checks                                                                                        |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1    | `0ae8789` | Phone 390×844 seed 42 (White, 7:28, 2 Acts); landscape 844×390 seed 7 (to the first break); desktop 1440×900 seed 11 (White, 12:02, 3 Acts). Square map. | 263 unit tests pass; two Playwright specs known to fail, not counted.                         |
| 2    | `cb5f979` | Phone 390×844 seed 42 (White, 18:44, 5 Acts); desktop 1440×900 seed 11 (White, 10:48, 3 Acts). Long Board, full screen, theme a.                         | `npm run check` 298 tests pass; `npx playwright test` 42 of 42 pass (18.9 min, machine idle). |

Every screen was visited in each pass: title, the three setup pages, versus card, live HUD, hand and card info, lane aim, lane lean, piece card, Adjourn, fork sheet, the three break tabs, relic pick, the result splash and the six report pages. Screenshots stayed in the session scratchpad. The deployed site at `/v2/` cannot be reached from the planning container; the owner checks it.

## 3. Ratings

Scale 1 to 10. **AA bar is 8**; "Bar" says what 8 looks like. "Now" is pass 2, verified by play unless marked est.

| Area                                     | Pass 1 | Now                 | Bar                                                                | Verdict (pass 2)                                                                                                                                                               |
| ---------------------------------------- | ------ | ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-match (setup, intro)                 | 8      | 8                   | Pre-filled, teaches by browsing, a hype moment                     | Unchanged. The versus card lands.                                                                                                                                              |
| Live play agency                         | 4      | 4                   | A meaningful choice every 60–90 s with a visible payoff            | Unchanged. Two of three cards read "not enough Tempo" at 1:30 into Act 1 with Tempo 25–30 (cards cost 10–45, start is 30). The cheapest fix is numbers.                        |
| Act break (report, orders, relics)       | 7      | 7                   | The Slay the Spire moment: a pick that changes how the match plays | Unchanged. Relics are small percentages in paragraphs; nothing feels like a swing.                                                                                             |
| Session length and shape                 | 5      | 5                   | A phone session under 10 min, a desktop session about 15           | Median 14.8 min (800 matches) but the tail is longer: seed 42 went 7:28 → 18:44 with kills halved and the Throne at 3800. One mode.                                            |
| Replayability and mastery                | 4      | 4                   | A reason to play match 20                                          | Unchanged. One AI level, no modes, no daily.                                                                                                                                   |
| Board readability (phone)                | 5      | 6                   | Who is fighting whom at a glance                                   | The default frame shows White's half with pieces at 20–30 px, lean-in at 40 px; fights no longer blob. The three HUD rows still take 22% of portrait height.                   |
| Board readability (desktop)              | —      | 5                   | Same                                                               | New row. A 1:2 board on a 16:10 screen is a vertical strip; the default frame's lower half is empty home-terrace tiles. The square diamond used desktop better.                |
| Art direction, uniqueness                | 6      | 7 phone / 6 desktop | A thumbnail that is recognisably this game                         | The void is gone; one visual language (felt, flagstone, stone lip, brass medallions) gives the garden board an identity. Theme b is stronger on a phone. Pieces still generic. |
| Feedback and juice                       | 5      | 5                   | Captures, rank-ups and Checkmate feel physical                     | Unchanged. With kills halved each capture is rarer, which raises the value of 4B.                                                                                              |
| Audio                                    | 3      | 3                   | A music bed, hall ambience, 20+ cues                               | Six synthesized cues. No music.                                                                                                                                                |
| Onboarding                               | 2      | 2                   | The first match teaches Tempo, gambits, forks and relics in play   | None. Ten new nouns on the title screen; the Long Board adds high ground, the eye badge and line of sight.                                                                     |
| Post-match report                        | 8      | 8                   | A story page and a scoreboard                                      | Over-delivered for AA.                                                                                                                                                         |
| Platform (PWA, offline, save, perf, iOS) | 3      | 3                   | Installable, offline, resumes a match, 60 fps on mid-range Android | No manifest, service worker, icon or save; fonts from Google. iOS never run. The woods added 35% triangles (phone 117k), to thin before any post-process.                      |
| AI opponent and difficulty               | 5      | 5                   | Opponents with faces, tiers to climb                               | Balanced (White 49.2% / 51.8%) and now judges fights (no tower dives, odds-based retreats). Faceless, single tier.                                                             |
| Balance and sim tooling                  | 8      | 8                   | Deterministic, measured                                            | Baseline replays on both maps, 800-match runs, `combat-check`. Strong.                                                                                                         |
| Code health                              | 7      | 8                   | Lean, tested, no dead weight                                       | Grand Board deleted (src 46.6k lines, net −8.1k), 42 of 42 specs pass. The largest chunk is still not split.                                                                   |

## 4. Recommendations and decisions

Variants were offered per area. **Bold rows are approved** by Cheppy (pass 1 on 2026-10-11, amendments on 2026-10-13). Effort is agent-days.

### 4.0 Tempo tune (about half a day, numbers only) — approved 10-13, goes first

Higher starting Tempo and cheaper Act 1 cards so the first card plays inside the first 60 s; folded into the next balance run. Addresses live agency without 1A. Pass 1 under-weighted this: both playtests show the hand unplayable for most of Act 1.

### 4.1 Loop and agency

| Variant                   | What                                                                                                                                                                                               | Days | Decision                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1A Commander Plus         | Cheaper, faster cards, one flippable live standing order per lane, a "decision due" cue                                                                                                            | 3    | Not now. The Tempo tune takes its cheapest part; revisit after 1B.                                                         |
| **1B Tournament run**     | A run is 3–5 matches against escalating named opponents. Court, archetypes and relics carry within the run; a loss ends it; **nothing persists after the run** (so this is not meta progression).  | 8    | **Approved.** Ships with the **tappable glossary** (1 day), pulled forward from onboarding because the run adds new nouns. |
| **1C Interactive armory** | At breaks the player shops for each piece from the 36 items, 6 slots, Deadlock style. The build path becomes the AI's suggestion, not the rule. Guildrun-style role-bending builds come from here. | 6    | **Approved.**                                                                                                              |
| 1D Live hero control      | Direct control of one piece                                                                                                                                                                        | 10+  | Rejected: reverses the branch's founding decision.                                                                         |

### 4.2 Session shape

| Variant                    | What                                                                                                                                                                                                                                                                                                                                                      | Days                 | Decision                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- |
| 2A Keep one mode           | As is                                                                                                                                                                                                                                                                                                                                                     | 0                    | No.                          |
| **2B Blitz and Classical** | **Redefined 10-13.** Blitz keeps 240 s Acts and changes pace, not Act length: at most 3 Acts, Endgame rules from Act 3, Throne 3000; the phone default. Classical is today's match. A 200-match probe before committing. (The pass-1 "3 × 150 s" is withdrawn: the first Bastion falls at 2.2 min, so a 150 s Act 1 would end before any structure fell.) | 3 plus a balance run | **Approved as redefined.**   |
| 2C Short Act 1             | Act 1 at 150 s as a scouting Act, the rest 240 s                                                                                                                                                                                                                                                                                                          | 2                    | Fallback if the probe fails. |

### 4.3 Mastery without meta progression

| Variant                | What                                                                                                                                         | Days | Decision                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------- |
| 3A Difficulty tiers    | Club, Master, Grandmaster: Black's Tempo income, relic AI quality, counter-Opening picks                                                     | 3    | Not now. Cheap; revisit after 3B. |
| **3B Named opponents** | 8–12 hand-authored Black courts, each with a name, portrait, fixed Opening and style set and one signature relic. They are the ladder of 1B. | 5    | **Approved.**                     |
| 3C Daily seed          | One seed a day with a local best                                                                                                             | 2    | Later.                            |
| 3D Async ghost courts  | Export a setup as a code; import a friend's as Black. No server.                                                                             | 3    | Later.                            |

### 4.4 Art and readability pass (the Long Board look stays; swings on top)

| Item                              | What                                                                                                                                                                                                                                                                                                                                                                                         | Days                   | Decision                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| **4B Capture spectacle**          | A fallen piece is knocked flying and its token lands in the HUD capture tray (there is no board edge any more); rank-up flare; the Rank 4 archetype swap is a visible transformation; Checkmate topples the King. Includes the **life pass** that replaced 4A: weather, birds, banners, light drift, life in the woods and on the lake (1–2 days; phase 5 already added the woods and lake). | 6                      | **Approved.** The signature moment; rarer captures make each one worth more.                 |
| **4D Desktop framing**            | A side-on default on wide screens (White left, Black right) so the 1:2 board uses the width; the portrait frame stays on phones per the owner's choice. Prototype both, pick one.                                                                                                                                                                                                            | 1                      | **Approved 10-13.**                                                                          |
| **4E Portrait chrome compaction** | The three top HUD rows become two. Moved here from platform: with a full-screen map this is the biggest phone readability lever.                                                                                                                                                                                                                                                             | 1                      | **Approved 10-13.**                                                                          |
| **4F Woods triangle budget**      | Thin the woods (phase 5 added 35% triangles) before any post-process ships.                                                                                                                                                                                                                                                                                                                  | 0.5                    | **Approved 10-13.**                                                                          |
| **4C Ink and brass post-process** | Outline plus paper-grain toon pass so thumbnails are unmistakable. Screen-space, so the free camera does not change its cost; the paper grain must be checked at close zoom.                                                                                                                                                                                                                 | 4 plus phone perf risk | **Approved as a one-scene prototype first.** Ship only if it holds the phone frame budget.   |
| 4A Fill the hall (pass 1)         | Lamps, audience, a visible table edge                                                                                                                                                                                                                                                                                                                                                        | —                      | **Withdrawn 10-13:** contradicted the full-screen map; its remainder is the life pass in 4B. |

### 4.5 Onboarding (about 2 days after the glossary moves to 1B) — approved

A three-nudge first match (Tempo at full, the first fork, the first break) and a "what just happened" line after the first capture. The glossary covers Tempo, gambit, fork, relic, pawn, pawnling, Act, Bastion, Throne, Check, high ground, the eye badge and line of sight.

### 4.6 Audio (about 4 days) — approved, not a priority

Generative hall ambience and a sparse music bed in Web Audio, capture and Checkmate stingers, a sound per gambit school. If the code-only art rule bends anywhere, bend it for audio files first.

### 4.7 Platform (about 5 days) — approved, done last

Web manifest, service worker, app icon, self-hosted fonts, save and resume a match locally, split the largest chunk, a real iOS Safari and mid-range Android pass with a frame budget. (Chrome compaction moved to 4E.)

### 4.8 The Long Board

Pass 1 offered a counter-proposal (re-sequence behind the loop work, cut the high-ground rules from the first build); the owner declined it and the map shipped first, phases 1–5, on 2026-10-12 ([MAP-LONGBOARD-2026-10-11.md](MAP-LONGBOARD-2026-10-11.md), [LOOK-LONGBOARD-2026-10-12.md](LOOK-LONGBOARD-2026-10-12.md), [BALANCE-2026-10-12.md](BALANCE-2026-10-12.md)). Pass 2's verdict: the owner was right. The map changed the sim, not just the look, and the loop work now starts on a board that reads.

## 5. Order of work

1. **Tempo tune** (4.0), with its balance run.
2. **Loop:** 1B Tournament run with the glossary, 1C Interactive armory.
3. **Session and opponents:** 2B Blitz and Classical (probe first), 3B Named opponents.
4. **Art and readability:** 4B Capture spectacle with the life pass, 4D desktop framing, 4E chrome compaction, 4F woods budget, 4C post-process prototype.
5. **Onboarding.**
6. **Audio.**
7. **Platform,** last.

Each item is a strategy change and gets its own spec in `docs/` for approval before building, per the working agreement. Balance-touching items (4.0, 1B, 1C, 2B, 3B) each end with the 800-match run on the Long Board.

## 6. Smaller issues seen while playing

- Cards sit at "not enough Tempo" for most of Act 1; the first playable moment is late (fixed by 4.0).
- Relic text folds Rewards and Counter, but the one-line effect still reads as a stat note rather than a plan.
- Fork options are text only; no numbers, no preview of the model change.
- Desktop default frame: the lower half of the screen is empty home-terrace tiles (fixed by 4D).
- Checkmate is a text card with no board moment (fixed by 4B).
- `index.html` has no icon (`href="data:,"`) and loads fonts from Google, so the game cannot start offline (platform).
- The eye badge (high-ground edge) was not noticed in either pass-2 match; worth a glossary entry and a first-time nudge.

## 7. Amendment history

- **2026-10-11, pass 1** (build `0ae8789`): ratings and the first plan; the Long Board counter-proposal declined.
- **2026-10-12, build session:** Long Board phases 1–5 shipped (default map, full screen, free camera, themes, Grand Board deleted); combat spacing and AI judgement (kills 55 → 28 per match). The build session wrote an update for discussion: estimated score moves, three conflicts with the plan (4A vs full screen, 4B's tray, variant c superseded), two additions (Tempo tune, early glossary) and three questions.
- **2026-10-13, pass 2** (build `cb5f979`): fresh playtest, assumption audit and amendments, all approved by the owner. Pass 1 was wrong that the Long Board was spectacle with low loop value, wrong that "Fill the hall" was the fix for the void, wrong on Blitz as 3 × 150 s, and under-weighted the Tempo tune; it was right that the free camera does not change 4C's cost and that live agency would not move. Answers to the build session's questions: the score moves hold at the lower end of its estimates (readability 6 on phone, 5 on desktop; art 7 phone, 6 desktop; code 8); the free camera does not change the art plan, the woods' triangles do; Blitz is redefined as pace, not Act length. The handoff's stale note about two failing Playwright specs was removed.
