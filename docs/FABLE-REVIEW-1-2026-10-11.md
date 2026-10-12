# Fable review 1 (2026-10-11)

Planning assessment of the chess variant (branch `test-product-2`, build `0ae8789`) against the owner's target: a AA-quality game with an addicting loop and a striking, unique look, on mobile and desktop browsers. Reviewer: Fable (planner session). Belongs to [CHESS.md](CHESS.md). Decisions in section 4 were approved by Cheppy on 2026-10-11.

**Owner answers that frame this review:** quality bar is Guildrun and Slay the Spire; free web game first; **no meta progression** (the source of truth already shelves it); local-first; match length open; more live agency welcome; Spotlight Arena (variant c) stays until a far better candidate arrives; the Long Board proceeds in its approved order.

## 1. BLUF

1. Against a AA bar the build sits at about **5.5 / 10**. Setup, intro and the report are past AA. The gap is the loop: live play is thin, there is one AI level and no reason to return, and the platform layer (install, offline, save, iOS) does not exist.
2. Art is coherent and tasteful but not yet striking: the board floats in black void and the low-poly miniatures are generic.
3. Approved plan: a **Tournament run** (matches chained against named opponents, nothing persists after the run), an **interactive armory** at breaks, **Blitz and Classical** session lengths, **named opponents**, three art swings (fill the hall, capture spectacle, an ink-and-brass post-process prototype), onboarding, then audio, then platform last. The Long Board keeps its approved order.

## 2. Evidence

Three matches played through Playwright (software WebGL) on the default path (Quick start, defaults): phone portrait 390×844 seed 42 (White, 7:28, 2 Acts), landscape phone 844×390 seed 7 (to the first break), desktop 1440×900 seed 11 (White, 12:02, 3 Acts). Every screen was visited: title, the three setup pages, versus card, live HUD, hand and card info, lane aim, lane lean, piece card, Adjourn, fork sheet, the three break tabs, relic pick, the result splash and the six report pages. Screenshots are in the session scratchpad, not in the repo. The two Playwright specs known to fail on this branch were not counted.

## 3. Ratings

Scale 1 to 10. **AA bar is 8**; "Bar" says what 8 looks like.

| Area                                     | Score | Bar                                                                | Verdict                                                                                                                               |
| ---------------------------------------- | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-match (setup, intro)                 | 8     | Pre-filled, teaches by browsing, a hype moment                     | Best part of the game. The versus card lands.                                                                                         |
| Live play agency                         | 4     | A meaningful choice every 60–90 s with a visible payoff            | Cards cost 30–45, Tempo starts at 30 and auto pawns drain it. About one card per 40 s; the rest is watching.                          |
| Act break (report, orders, relics)       | 7     | The Slay the Spire moment: a pick that changes how the match plays | Right structure, good callouts. Relics are small percentages in paragraphs; nothing feels like a swing.                               |
| Session length and shape                 | 5     | A phone session under 10 min, a desktop session about 15           | Median 15 min, one mode. The 2-Act 7:28 match felt right on the phone.                                                                |
| Replayability and mastery                | 4     | A reason to play match 20                                          | One AI level, no difficulty, no modes, no daily. Variety exists (15 styles, 23 relics, 5 Openings) but nothing pulls the player back. |
| Board readability (phone)                | 5     | Who is fighting whom at a glance                                   | Pieces 15–25 px. Fights read as glow blobs. Top chrome takes about 22% of portrait height. Gold vs cyan does its job.                 |
| Art direction, uniqueness                | 6     | A thumbnail that is recognisably this game                         | The tournament-hall identity is real and consistent. The board floats in black void; the low-poly miniatures are generic.             |
| Feedback and juice                       | 5     | Captures, rank-ups and Checkmate feel physical                     | Fight tags, fall lines and capture trays are smart. No capture animation, no hit-stop; Checkmate is a text card.                      |
| Audio                                    | 3     | A music bed, hall ambience, 20+ cues                               | Six synthesized cues. No music.                                                                                                       |
| Onboarding                               | 2     | The first match teaches Tempo, gambits, forks and relics in play   | None. Ten new nouns on the title screen.                                                                                              |
| Post-match report                        | 8     | A story page and a scoreboard                                      | Over-delivered for AA: seven pages of charts.                                                                                         |
| Platform (PWA, offline, save, perf, iOS) | 3     | Installable, offline, resumes a match, 60 fps on mid-range Android | No manifest, no service worker, no icon, fonts fetched from Google, no save. iOS never run. 1.6 MB build with one 760 KB chunk.       |
| AI opponent and difficulty               | 5     | Opponents with faces, tiers to climb                               | Balanced and competent (White 49.6–51.4% AI vs AI). Faceless, single tier.                                                            |
| Balance and sim tooling                  | 8     | Deterministic, measured                                            | Baseline replays, 800-match runs, pairwise tools. Strong.                                                                             |
| Code health                              | 7     | Lean, tested, no dead weight                                       | 51k lines including the 10.6k-line legacy Grand Board renderer, two failing e2e specs, the largest chunk not split.                   |

## 4. Recommendations and decisions

Variants were offered per area. **Bold rows are approved** (Cheppy, 2026-10-11). Effort is agent-days.

### 4.1 Loop and agency

| Variant                   | What                                                                                                                                                                                               | Days | Decision                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------- |
| 1A Commander Plus         | Cheaper, faster cards (10–20 Tempo, +2/s), one flippable live standing order per lane, a "decision due" cue                                                                                        | 3    | Not now. Polish to revisit after 1B.               |
| **1B Tournament run**     | A run is 3–5 matches against escalating named opponents. Court, archetypes and relics carry within the run; a loss ends it; **nothing persists after the run** (so this is not meta progression).  | 8    | **Approved.**                                      |
| **1C Interactive armory** | At breaks the player shops for each piece from the 36 items, 6 slots, Deadlock style. The build path becomes the AI's suggestion, not the rule. Guildrun-style role-bending builds come from here. | 6    | **Approved.**                                      |
| 1D Live hero control      | Direct control of one piece                                                                                                                                                                        | 10+  | Rejected: reverses the branch's founding decision. |

### 4.2 Session shape

| Variant                    | What                                                                                   | Days                 | Decision                       |
| -------------------------- | -------------------------------------------------------------------------------------- | -------------------- | ------------------------------ |
| 2A Keep 4 × 240 s          | As is                                                                                  | 0                    | No.                            |
| **2B Blitz and Classical** | Blitz: 3 Acts of 150 s, about 8 min, the phone default. Classical: today's 240 s Acts. | 3 plus a balance run | **Approved.**                  |
| 2C Short Act 1             | Act 1 at 150 s as a scouting Act, the rest 240 s                                       | 2                    | Fallback if 2B breaks balance. |

### 4.3 Mastery without meta progression

| Variant                | What                                                                                                                                         | Days | Decision                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------- |
| 3A Difficulty tiers    | Club, Master, Grandmaster: Black's Tempo income, relic AI quality, counter-Opening picks                                                     | 3    | Not now. Cheap; revisit after 3B. |
| **3B Named opponents** | 8–12 hand-authored Black courts, each with a name, portrait, fixed Opening and style set and one signature relic. They are the ladder of 1B. | 5    | **Approved.**                     |
| 3C Daily seed          | One seed a day with a local best                                                                                                             | 2    | Later.                            |
| 3D Async ghost courts  | Export a setup as a code; import a friend's as Black. No server.                                                                             | 3    | Later.                            |

### 4.4 Art direction (variant c stays; swings on top)

| Variant                           | What                                                                                                                                                     | Days                   | Decision                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| **4A Fill the hall**              | Lamps, audience silhouettes, dust in the spotlight, the table edge visible on desktop. Kills the void.                                                   | 3                      | **Approved.**                                                                              |
| **4B Capture spectacle**          | A fallen piece is knocked off the board into its tray; rank-up flare; the Rank 4 archetype swap is a visible transformation; Checkmate topples the King. | 5                      | **Approved.** The signature moment.                                                        |
| **4C Ink and brass post-process** | Outline plus paper-grain toon pass so thumbnails are unmistakable.                                                                                       | 4 plus phone perf risk | **Approved as a one-scene prototype first.** Ship only if it holds the phone frame budget. |
| 4D Long Board as the art swing    | Elevation, river, two boards end to end                                                                                                                  | 10                     | Already approved separately; see 4.8.                                                      |

### 4.5 Onboarding (about 3 days) — approved

A three-nudge first match (Tempo at full, the first fork, the first break), a tappable glossary on every new noun (Tempo, gambit, fork, relic, pawn, pawnling, Act, Bastion, Throne, Check), and a "what just happened" line after the first capture.

### 4.6 Audio (about 4 days) — approved, not a priority

Generative hall ambience and a sparse music bed in Web Audio, capture and Checkmate stingers, a sound per gambit school. If the code-only art rule bends anywhere, bend it for audio files first.

### 4.7 Platform (about 6 days) — approved, done last

Web manifest, service worker, app icon, self-hosted fonts, save and resume a match locally, split the 760 KB chunk, a real iOS Safari and mid-range Android pass with a frame budget, and portrait chrome compaction (merge the three top rows into two).

### 4.8 The Long Board

A counter-proposal (re-sequence behind the loop work and cut the Reach and Sight rules from the first build) was offered and **declined**: the Long Board keeps its approved order and scope ([MAP-LONGBOARD-2026-10-11.md](MAP-LONGBOARD-2026-10-11.md)).

## 5. Order of work

1. **Long Board** (approved earlier; about 5–6 calendar days with 2–3 agents).
2. **Loop:** 1B Tournament run and 1C Interactive armory.
3. **Session and opponents:** 2B Blitz and Classical, 3B Named opponents (the 1B ladder needs them).
4. **Art:** 4A Fill the hall, 4B Capture spectacle, 4C post-process prototype.
5. **Onboarding.**
6. **Audio.**
7. **Platform,** last.

Each item is a strategy change and gets its own spec in `docs/` for approval before building, per the working agreement. Balance-touching items (1B, 1C, 2B, 3B) each end with the 800-match run.

## 6. Smaller issues seen while playing

- Cards sit at "not enough Tempo" for most of Act 1; the first playable moment is late.
- Relic text folds Rewards and Counter, but the one-line effect still reads as a stat note rather than a plan.
- Fork options are text only; no numbers, no preview of the model change.
- The desktop board leaves most of the screen black; the lean-in view (about 1.9×) is where the pieces look best.
- Checkmate is a text card with no board moment.
- `index.html` has no icon (`href="data:,"`) and loads fonts from Google, so the game cannot start offline.
