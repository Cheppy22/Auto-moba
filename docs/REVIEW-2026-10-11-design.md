# Design review: look, readability and the commander loop (2026-10-11)

Reviewer: Opus, acting as game critic and art/UX director. Build `5627502` (branch `test-product-2`), played through Playwright at 390×844 portrait, 844×390 landscape and 1440×900 desktop, seed 42, defaults everywhere (the "new player who taps Begin" path). No code was changed. Screenshots (prefix `p-` portrait, `l-` landscape, `d-` desktop) are in the session scratchpad `review/` folder; they are not in the repo.

## BLUF

1. **You can't read the board on a phone.** Pieces are 8–15 px tall on the default and wide shots, White's ivory pieces sit on cream roads, and the badges (rank numerals, style emblems) are bigger than the models. You read the game through the rosters, not the board (`p-04`, `p-08`).
2. **The map fights the pieces.** Six big checkered jungle discs and busy green garden are the loudest things on screen; lanes are pale and unlabelled, Bastions look like Rooks, and the island floats in a starfield instead of a tournament hall (`d-03-intro-1`, `p-03-intro-3`).
3. **The commander loop is mostly text.** The break sheet and relics are long walls of words with no map, and nothing links "you lost every fight on the Right lane" to a fix. Live, the idle player sat at 100/100 Tempo and fielded 0 pawns for the whole match, and nothing said so (`p-16-*`, `p-18-*`, `p-13`).
4. **Top recommendation:** a **"Tournament Table" overhaul**: a fixed war-table camera that shows the whole board, a literal Grand Board map (felt lanes on a chessboard, dark walnut frame), and **tabletop-miniature pieces** (Staunton silhouettes on team-rimmed bases, about 2.5× today's on-screen size). Do Phase 0 quick fixes first (1–2 days); prototype one scene before you commit.
5. **Keep:** the palette and typography, the bell and halt, the fork sheet, the coach callouts, the Result splash. **Cut:** auto-cutting camera as the default, the grass-and-starfield setting, badge stacks on far shots, and the duplicate wording in relics.

## How it plays today (critic's first pass)

- **Title and setup** look premium: serif small caps, ebony and brass, clear "Begin" (`p-01`, `p-02`). The setup is honest but dense: a new player meets Openings, schools, paths and lanes before seeing a single piece. Opening blurbs are cut off with "…" in portrait (`p-02`), and landscape cuts off the Bishop and Knight cards (`l-02-setup`). The title copy says "You choose their styles", but styles are chosen at Rank 4.
- **Match intro:** I never saw it. In all three runs the 3D scene took long enough to build that the 7.6 s tour had finished before the first frame drew (software GL, so it's worse than a phone, but the risk is real on slow phones). The intro timer should start on the first rendered frame.
- **Early lane play:** the portrait wide view is beautiful from far away, but the pieces are specks with a "1" floating over each (`p-03-intro-3`). Auto camera then cuts to a close fight (`p-05`), which is readable but tells you nothing about the other two lanes.
- **Who's winning:** the score "4 / 8" never says what it counts (Adjourn reveals 6 kills vs 15). The lane strip (three 95×8 px bars) is the right idea but too small to notice (`p-12`). The rosters carry the truth: White Rank 2 against Black Rank 3–4 by the end of Act 1 (`p-13`).
- **Bell:** the countdown pulse is good. "Bell pending" grey is barely visible (`p-13`, `l-13`); the full halt grey reads well in landscape (`l-16-break-report`). Three text bands stack at the top during the tolls ("The bell tolls — 1 of 3" plus "Team fight · Right", `p-14`). All three cards repeat "play is stopped for the bell" (`p-15`).
- **Break sheet:** the Report is the best screen in the game: plain callouts, "Lanes at the bell", how pieces fell, side-by-side numbers (`p-16`). But it's a 3-screen scroll with no picture of the board, and the advice ("Keep it beside its allies") isn't a button. Orders is 5 path toggles plus a lane board scrolled out of view (`p-17`). Relics are three 60-word cards; the sticky offer strip overlaps card text when scrolled (`p-18-break-relics-2`), and Sortie says "Rally." twice. Black's freshly drafted relic is already listed on the first break, in second person ("Pick one card from your Opening's schools…"), although the spec says Black's pick is shown on resume (`p-16-break-report-2`).
- **Forks:** clean sheet, good copy, emblem per style (`p-06`). Two forks arrived about a second apart (Queen, then Knight); there's no hint of which style suits this match or counters Black's.
- **Report:** a strong Result splash (`p-21`, `d-21`). The charts are clear, but they use generic orange, blue, red and green outside the palette (`d-22-report-combat`). The Replay map doesn't look like the board (square lanes, legacy violet and red discs) and its legend still lists "recalls", a cut feature (`p-22-report-replay`). Nothing says why you lost or what to try next.
- **Desktop:** the HUD keeps phone sizes at 1440×900: a 20 px clock, 55 px rosters and lots of empty space (`d-05`). The free camera zooms into the scenery with no near limit (`d-09`).
- **Audio:** there is none. No clock tick, no bell, no capture clack. That's the single cheapest "feel" upgrade available.

## Scorecard

| Area                         | Grade | One line                                                            |
| ---------------------------- | ----- | ------------------------------------------------------------------- |
| UI style (type, palette)     | A-    | Coherent "tournament hall"; best asset you have                     |
| Board readability (phone)    | D     | Specks and badges; ivory on cream; Bastion vs Rook confusion        |
| Character design             | C+    | Charming up close (`l-10`), invisible at play distance              |
| Map composition              | C     | Pretty, but the courts and grass outshout the lanes; no lane labels |
| HUD hierarchy                | B-    | Tidy; side rosters eat 28% of portrait width; desktop not scaled    |
| Commander loop (break sheet) | B-    | Right content, wrong form: text, not a plan                         |
| Relics comprehension         | C     | Too many words, no picture of what they touch                       |
| Feedback and juice           | C     | Good bell; weak pending grey; no sound; no capture moment           |
| Onboarding                   | D+    | No first-match guidance; Tempo cap and pawns go unnoticed           |
| Report                       | B     | Thorough and honest; needs a "story" page and palette fixes         |

## Findings by area: Keep, Cut, Polish

### 1. Readability: who's who, where the fights are, who's winning

- **Keep:** team colours ivory against slate; health rings and lane letters on rosters; the lane momentum idea; "Out of position" and "Traded" on fallen tiles.
- **Cut:** rank-number bubbles over every piece on far shots (they read as a field of "1"s, `p-03-intro-1`); style emblems in-world on far shots (they turn the base into badge soup, `p-08`).
- **Polish:** raise the far-shot boost (today capped at 1.65×) so pieces are at least 24 CSS px tall on phone; give every piece a dark ink outline and a team base disc (brass rim for White, silver for Black); make lane roads a mid-tone so ivory pops; give Bastions a different silhouette from the Rook (squat keep with a banner, no crenellated cylinder); label the score ("Captures 4–8"); triple the lane strip's size and put it under the clock with L/M/R words.

### 2. Character design (humanoid chess pieces, 15 style flairs)

- **Keep:** the idea that style changes the silhouette (Knight Errant's green shield and lance reads well up close, `l-10`); ink-outline toon shading; team schemes.
- **Cut:** fine detail that never survives phone scale (faces, hair, boots); walk cycles that read as jitter at 10 px.
- **Polish:** big-head proportions (head about 1/3 of height); exaggerate each piece type's crown (King's cross twice as tall, Queen's coronet points, Bishop's slit mitre, Rook flat and wide, Knight's horse head in profile); one bold style colour block per piece, not several small ones.
- **Verdict:** humanoids are appealing in close-ups (`l-10`, `p-10`), but the camera spends 90% of the match far away, where a humanoid is a smudge and a Staunton profile is instantly a "King". See the overhaul options.

### 3. Map ("Grand Board" chess garden)

- **Keep:** the brass and ivory lane borders, the reflecting canals, the throne platforms (`l-11` shows a lovely base), the low-poly topiary.
- **Cut:** the floating island in a starfield (`d-08`): it's the old island look, not a tournament hall; the full-saturation grass with a dense path grid (visual noise everywhere off-lane); checkered courts that are bigger and higher-contrast than the lanes.
- **Polish:** lower the grass saturation and brightness about 30%; make court checkers lower-contrast than the lanes; add file and rank notation and lane names (Left / Mid / Right) painted at the lane mouths; put a walnut table and soft vignette under the board instead of space.
- **Root cause to note:** the map grew to 1950 units (×1.5 twice) while units kept their size, so pieces are about 3% of map width. Any camera that shows the whole board will show specks unless pieces are drawn at "miniature scale" (bigger than their hit size).

### 4. HUD and UI

- **Keep:** the corner layout idea, the serif small-caps type, the ivory primary buttons, the 40 px+ touch targets (cards, lane buttons and the fork sheet all pass), and the aim panel with three big lane buttons (`p-11`).
- **Cut:** a third "Act 1" banner on top of notices; the triple "play is stopped for the bell"; side-column rosters in portrait (110 of 390 px).
- **Polish:** scale the HUD up at desktop widths (clock, rosters and cards about 1.4×); stack top notices in one queue (one band at a time); cards with long names wrap or shrink ("Sanctua…", `p-05`); a **Tempo full** glow plus one line ("Tempo full: play a card or field a pawn").

### 5. Commander loop (break sheet, relics, forks, gambit hand)

- **Keep:** the bell, halt, sheet and Resume rhythm (it gives the game a heartbeat); the tailored relic with "Offered because…"; "Let the AI choose" everywhere; Black's court list in Adjourn (`p-20`).
- **Cut:** relic Rewards/Counter text on the face of the card (keep it behind "details"); the "Rally." prefix inside effect text; Black's relic on the first break before White picks (spec says reveal on resume).
- **Polish:**
  - Open the Report with a **situation board**: a small top-down diagram with the 3 lanes, Bastions standing, where each of your pieces fell (×), and Black's lane layout. One picture replaces two screens of rows.
  - Turn callouts into **actions**: "Your Knight was focused 3× → [Move Knight to Left]" or "[See relics for this]".
  - Merge Orders and relic aiming into one **Plan** tab: the lane board with pieces on top and lane relics as seals on their lane.
  - Relic cards: a headline verb ("Defend a falling lane"), one line of effect, a small diagram of what it binds (lane, piece or quota), numbers in small print, details collapsed.
  - Forks: mark one option "Suggested" with a reason ("Black's Queen is a Huntress: Paladin shields"), and batch forks that land within 10 s into one sheet.
- **Live hand:** in a full match with defaults the player never had a reason to tap. Tempo sat at 100 and pawns stayed at 0/8 (`p-12` to `p-21`). Either the hand earns attention (nudge, Tempo-full glow, Black banner says "Black is ahead on pawns") or pawns move into Orders as a standing quota (Pawn Structure as a base feature). This is an owner decision below.

### 6. Feedback and juice

- **Keep:** the clock pulse, the toll ring, the halt slow-down, fight verdict tags, Black gambit banner, "why it fell".
- **Polish:** pending grey at 50% (the open decision "stronger grey": yes); add sound (wood clacks on hits, a capture clack and slide, a brass bell for tolls, a soft chess-clock tick in the last 10 s, a felt thump for gambits); a **capture moment**: a fallen piece tips over and slides to a capture tray at the screen edge, which doubles as the score and the respawn timer.

### 7. Onboarding

- **Polish:** the first match runs with three one-time coach tips (on Begin: "You're the commander: plan at the bell, watch in between"; first Tempo 50: "Field a pawn or play a card"; first break: "Read the Report, then take a relic"); setup shows only lanes plus Begin on the first match, with Openings and paths behind "More options"; the intro timer starts on the first rendered frame.

### 8. Report

- **Keep:** the Result splash, MVP and awards, the gold lead chart with markers (`l-22-report-economy`).
- **Cut:** "recalls" in the Replay legend; off-palette chart colours.
- **Polish:** add a "**Story**" page first: three turning points from the event log ("2:45 Right Bastion fell; Black led from here"), the relic and Opening each side took, and one lesson. Redraw the Replay map as the real board. Recolour the charts to ivory, slate, brass, clock red and baize.

## Overhaul options (budget available)

### A. Camera model

| Option                                                                                                                                                                                                                                                                                                                                      | Commander fit                         | Phone fit                             | Effort |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------- | ------ |
| A1. Keep the broadcast director (auto cuts) and tune it                                                                                                                                                                                                                                                                                     | Low: you watch a TV feed, not a board | Medium                                | S      |
| **A2. War table (recommended):** one fixed 3/4 overhead view of the whole board, fitted to the screen's shape (portrait: White bottom, Black top). Pieces at miniature scale. Tap a lane to "lean in" (about 2× zoom on that lane), tap again to sit back. The director becomes an optional "Highlights" picture-in-picture for big fights. | High: a general's map table           | High: everything always visible       | M–L    |
| A3. Three-lane multiview: three thin lane cameras side by side                                                                                                                                                                                                                                                                              | Medium                                | Medium: jungle and geography are lost | L      |

**Pick A2.** A commander needs the whole board at a glance, and A2 also makes the board diagram, lane strip and relic aiming all point at the same picture.

### B. Piece art direction

| Option                                                                                                                                                                                                                                                                                                | Read at 20 px                             | Appeal                                  | Effort                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| B1. Refine the humanoids (big heads, bolder crowns)                                                                                                                                                                                                                                                   | Fair                                      | Good                                    | M                                                    |
| **B2. Tabletop miniatures (recommended):** Staunton-profile pieces in ivory and ebony on round bases with a team rim and a style-coloured ring; style flair as a sculpted topper or held item (≤25% of the silhouette). They move like hand-moved minis: glide, hop and lean, tip over when captured. | Excellent: everyone knows a chess profile | High, distinctive, "premium board game" | M (simpler rigs than humanoids; no limbs to animate) |
| B3. Stylised low-poly chibi heroes wearing chess crowns                                                                                                                                                                                                                                               | Good                                      | Generic MOBA                            | L                                                    |

**Pick B2.** It turns the smallness problem into the theme (you are looking at a board), it's cheaper to animate and render, and the 15 styles survive as toppers and base rings.

### C. HUD layout (portrait first)

| Option                                                                                                                                                                                                                                                                                               | Effort |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1. Polish the current corners                                                                                                                                                                                                                                                                       | S      |
| **C2. Clock and court bar (recommended):** top: a chess clock, the capture trays (score) and a big lane strip. Bottom: White's five portraits in one row with the hand as a pull-up drawer above it. Black's five sit as small tokens beside the top tray. Frees the 28% side columns for the board. | M      |
| C3. Landscape-first side panel, portrait as a fallback                                                                                                                                                                                                                                               | M      |

**Pick C2.** It's paired with A2, and the board gets the full width.

### D. Map composition

| Option                                                                                                                                                                                                                                                                                                                | Effort                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D1. Re-tint and de-noise the current garden                                                                                                                                                                                                                                                                           | S                                                                          |
| **D2. Literal Grand Board (recommended):** the playfield is one big chessboard in mid-tones; lanes are dark baize-felt runners edged in brass; jungle courts are recessed squares, not discs; the garden shrinks to a hedge frame; a walnut table and a soft hall vignette sit underneath. Same sim layout, new skin. | L                                                                          |
| D3. Shrink the world (map back toward 1300 units)                                                                                                                                                                                                                                                                     | Gameplay and balance change; only if D2 plus miniature scale is not enough |

## Art direction brief: "Tournament Table" (for the builder)

- **Value rule (most important):** pieces own the extremes (ivory at about 90% lightness, ebony at about 15%); the ground stays in the middle band (25–65%). Nothing on the ground is brighter than the ivory roads are today.
- **Palette:** keep the UI tokens (Ebony #14110e, Walnut #2a1e16, Ivory #efe6d2, Brass #c9a35a, Silver-slate #9aa5b8, Clock red #b8392c). Board: light squares #b9a888, dark squares #5b4733; lane felt #1f3b2e with brass #c9a35a edges; table #241912; jungle recesses one step darker than the board. Grass and topiary at most 35% saturation, frame only.
- **Materials:** polished boxwood/ivory and ebony (soft specular, no textures), brass trim, felt (matte), stone (matte). One warm key light plus a cool rim light so ebony pieces keep an edge.
- **Silhouette rules:** five unique profiles at 16 px. Height ratio King 1.0, Queen 0.95, Bishop 0.85, Knight 0.8, Rook 0.7 (wide), pawn 0.5, pawnling 0.35. The Bastion must not share the Rook's crenellated outline. Style flair stays at or under 25% of the silhouette, plus the style colour on the base ring.
- **Scale rules (phone, 390 px wide, default war-table view):** pieces at least 24 CSS px tall, pawns at least 14, pawnlings at least 9; bases at least 18 px across. At most one badge per piece (rank numeral on the base, not floating); emblems only when leaning in or selected; badges no taller than 60% of the piece.
- **Team rules:** body colour plus base rim (White: ivory and brass, Black: ebony and silver). Team colour never depends on the style colour.
- **Motion rules:** pieces glide with a small hop (0.25 s ease-out) and lean into attacks; a capture is a tip-over and a slide to the capture tray (0.6 s); no camera cuts unless the player taps; HUD transitions take 200 ms or less; reduced motion drops hops and slides to fades.
- **Sound rules:** wood, felt, brass and clock only; no music under play; the bell stays the loudest sound.

## Roadmap

Impact H/M/L, effort S/M/L. "Sonnet" means a builder working from a spec; "Opus" means art direction or a design spec first.

| #   | Phase 0: quick fixes (1–2 days)                                                                             | Impact | Effort | Depends | Agent  |
| --- | ----------------------------------------------------------------------------------------------------------- | ------ | ------ | ------- | ------ |
| 0.1 | Lane roads to mid-tone; ink outline and team base disc on pieces; far-shot boost to 2.5×                    | H      | S      | —       | Sonnet |
| 0.2 | Hide rank bubbles and emblems on far shots; one badge per piece                                             | H      | S      | —       | Sonnet |
| 0.3 | Pending grey to 50%; one top notice band; no triple "stopped" text                                          | M      | S      | —       | Sonnet |
| 0.4 | Tempo-full glow plus one-line nudge                                                                         | M      | S      | —       | Sonnet |
| 0.5 | Relic fixes: sticky strip overlap, "Rally." duplicate, Black's relic hidden until resume, third-person text | M      | S      | —       | Sonnet |
| 0.6 | Desktop HUD scale-up; free-camera near limit                                                                | M      | S      | —       | Sonnet |
| 0.7 | Score label; bigger labelled lane strip; setup copy and blurb truncation; intro starts on first frame       | M      | S      | —       | Sonnet |
| 0.8 | Report: palette-true charts, Replay map redraw, drop "recalls"                                              | L      | S      | —       | Sonnet |

| #   | Phase 1: commander loop (1–2 weeks)                             | Impact | Effort | Depends | Agent                    |
| --- | --------------------------------------------------------------- | ------ | ------ | ------- | ------------------------ |
| 1.1 | Situation board at the top of the Report                        | H      | M      | —       | Opus spec, Sonnet build  |
| 1.2 | Callouts with action buttons; Plan tab (Orders plus relic aims) | H      | M      | 1.1     | Opus spec, Sonnet build  |
| 1.3 | Relic card rewrite (headline, one line, bind diagram)           | H      | S      | —       | Opus copy, Sonnet build  |
| 1.4 | Fork "Suggested" pick; batch forks within 10 s                  | M      | S      | —       | Sonnet                   |
| 1.5 | Sound pass (about 12 sounds, wood/felt/brass/clock)             | H      | M      | —       | Opus brief, Sonnet build |
| 1.6 | First-match coach tips; slim first-time setup                   | M      | M      | —       | Sonnet                   |
| 1.7 | Report "Story" page (turning points, lesson)                    | M      | M      | —       | Opus rules, Sonnet build |

| #   | Phase 2: Tournament Table overhaul (3–5 weeks)                                                | Impact | Effort | Depends  | Agent                            |
| --- | --------------------------------------------------------------------------------------------- | ------ | ------ | -------- | -------------------------------- |
| 2.0 | Art bible plus a one-lane prototype scene (miniatures on felt, war-table camera) for sign-off | H      | M      | Phase 0  | Opus                             |
| 2.1 | War-table camera (fit-to-screen, lean-in per lane, Highlights PiP)                            | H      | L      | 2.0      | Opus spec, Sonnet build          |
| 2.2 | Miniature pieces: 5 Staunton bodies, 15 toppers, bases, hop/lean/tip motion                   | H      | L      | 2.0      | Opus art direction, Sonnet build |
| 2.3 | Grand Board map re-skin (board, felt lanes, recessed courts, walnut table)                    | H      | L      | 2.0      | Opus art direction, Sonnet build |
| 2.4 | HUD C2 (clock, capture trays, court bar, hand drawer)                                         | H      | M      | 2.1      | Sonnet                           |
| 2.5 | Capture moment and capture tray as the score                                                  | M      | M      | 2.2, 2.4 | Sonnet                           |
| 2.6 | Phone readability check: measure piece px on 390×844 and fix until the brief's numbers pass   | H      | S      | 2.1–2.3  | Sonnet                           |

## Decisions for the owner

| #   | Question                                                                                                 | My recommendation                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commit to the "Tournament Table" look (A2, B2, C2, D2)?                                                  | **Yes, but prototype first** (step 2.0, about a week) and decide on the prototype, not on this doc.                                                  |
| 2   | Replace the humanoid pieces with tabletop miniatures? (reverses the 2026-10-09 look)                     | **Yes.** Humanoids only shine in close-ups the camera rarely shows; the style props carry over as toppers.                                           |
| 3   | Default camera: fixed war table, with the auto director as an optional "Highlights" window?              | **Yes.** The commander should see the whole board; the director's cuts hide two lanes at a time.                                                     |
| 4   | Live pawns: keep the Field Pawn button, or make lane pawn quotas a standard Orders setting at the break? | **Make quotas standard in Orders** (Pawn Structure as the base rule) and keep Field Pawn as a manual extra. The idle test fielded 0 pawns all match. |
| 5   | Forks mid-Act: keep pausing per fork, or batch them?                                                     | **Batch** forks within 10 s into one sheet, with a "Suggested" pick.                                                                                 |
| 6   | Add sound?                                                                                               | **Yes**, a small wood/brass/clock set. It's the cheapest feel upgrade available.                                                                     |

## Smaller issues spotted

- Black roster tile went blank (no timer) during the halt while Black's Queen was dead (`run1/p-15-bell-halt`); White's dead tiles show timers.
- Queen's default build path is Defense ("Buys health and armor first") although she is "The Carry" (`p-02`, `p-17`). Intended?
- Black's relic text on the Report uses "your Opening … Italian Game" while Black played French Defence (`p-16-break-report-2`).
- Gambit card "Pawn Sacrifice" shows "no pawn to sacrifice" all match because no pawns were ever fielded: a hint that pawns are invisible to new players (`p-08`).

## Screenshot index (best evidence)

| Problem                                      | Files                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| Specks and badge soup on phone               | `p-03-intro-3`, `p-08-wide`, `l-08-wide`                        |
| Ivory pieces on cream roads; Bastion vs Rook | `d-04-early-default`, `p-05-hud-live`                           |
| Map noise, starfield island                  | `d-08-wide`, `d-03-intro-1`                                     |
| Weak pending grey; stacked top bands         | `p-13-bell-pending`, `p-14-bell-toll`, `l-16-break-report`      |
| Break sheet as text; relic overlap           | `p-16-break-report`, `p-18-break-relics-2`, `l-18-break-relics` |
| Idle player: Tempo 100, pawns 0/8            | `p-12-bell-countdown`, `p-20-adjourn`                           |
| What already looks great                     | `p-01-title`, `p-06-fork`, `l-10-follow-queen`, `p-21-result`   |
| Replay map mismatch                          | `p-22-report-replay`                                            |
