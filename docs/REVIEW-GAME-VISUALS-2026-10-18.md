# Review: game visuals and UX (2026-10-18)

This is the visuals and UX half of the full game review; features and gameplay are covered in a separate report. Build reviewed: `origin/wip/techniques-ui-a` at `f9fd7f5` (Long Board, themes a/b, Ink, free camera, capture spectacle, 8 Openings, Act-break Builds tab). Reviewer: Claude (Opus), visuals/UX role. Bar: the Fable review's AA bar of 8 ([FABLE-REVIEW-1-2026-10-11.md](FABLE-REVIEW-1-2026-10-11.md)).

**In progress, not scored down:** Setup **First moves** page, report **Technique tallies**, **Spoils** Technique card faces, and the Adjourn **Builds** tab (all phase 5b).

## BLUF

1. **About 7 out of 10 overall (Fable pass 2 was about 6).** Menus and sheets are at or near AA. Setup, versus card, card sheet, fork sheet, Builds tab, relic cards and report share one walnut-and-brass language, and the Checkmate beat is a real moment.
2. **The map is still the weakest area (6.5).** The materials now match (felt lanes, stone roads, stone kerbs, brass medallions). But the loudest shapes on the board are empty places: five black locked-clearing discs and a Pit that reads as a hole. Bastions look like cottages and pieces are 15–25 px, so who is fighting whom is still hard to read at a glance.
3. **"The whole screen is the map, with a free camera" has landed.** Phone portrait shows the full board between two thin HUD bands; desktop uses a side-on view across the width. Fable's "vertical strip on desktop" is gone.
4. **Bugs are small and cheap (7 found):** text cut off ("Choose Battering R…", "SWEEPING …"), sheets and toasts sitting on other HUD parts, lane labels hidden under pieces, see-through fixed headers, a stale "purchases" label, and a Blitz line that says "No Checkmate" when Blitz matches do end in Checkmate.
5. **Biggest design lever: give each colour one meaning.** School colours, damage-type colours, brass, "selected" green and "bad" red all reuse the same hues. A single Technique card can show five colours that each mean something different.

## Scores

Scale 1–10; AA bar is 8. "Fable p2" is the Fable pass-2 score (2026-10-13) for the closest matching row, or "—" if there is none. "est." means judged from stills and video on software rendering, not from play on a real device.

| Area                                              | Fable p2                  | Now                     | One line                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-match (title, setup, versus card)             | 8                         | 8                       | Opening page and versus card are strong; the title's lower half is a loose cluster of controls.                                                                                                                        |
| Live HUD, phone portrait                          | 6 (readability)           | 6.5                     | The two-row top bar landed. Chrome still takes 29% of the height, 37–39% with the hand open; names are 10.5 px.                                                                                                        |
| Live HUD, desktop                                 | 5                         | 6.5                     | The side-on view uses the width and the corner HUD is tidy. Pieces are small; the frame shows a lot of empty floor and forest.                                                                                         |
| Live HUD, phone landscape                         | —                         | 6                       | Board, roster column and drawer fit; pieces are 10–15 px and Black's portraits are 38 px wide.                                                                                                                         |
| Map art and legibility                            | 7 phone / 6 desktop (art) | 6.5                     | Consistent materials, gate arches meet the groves. Black voids dominate, road outlines look computed, Bastions look like houses.                                                                                       |
| Visual cohesion (one design language)             | —                         | 7                       | Cards, relics, Techniques and sheets share one frame and type. Colour meanings collide (D5).                                                                                                                           |
| Cards, piece card, fork sheet                     | —                         | 7.5                     | Clear sheets with real numbers and model portraits. Some labels are cut off (B1).                                                                                                                                      |
| Act break and Builds tab                          | 7 (Act break)             | 7.5 phone / 6 landscape | Pick for me, starred pieces, "Picked for you" and before → after ledgers read well. Landscape is cramped (D9); the active tab is hard to see (D8).                                                                     |
| Feedback and motion (capture, rank-up, Checkmate) | 5                         | 7 (est.)                | The Checkmate beat (letterbox, push-in, topple, gold light) is AA. At the default zoom a capture reads mostly through the toast, a light pillar and the roster tile (D1).                                              |
| Post-match report                                 | 8                         | 8                       | Still over-delivers. The Replay page looks like another game and uses old words (B4, D12).                                                                                                                             |
| Tournament screens (Draw, Run kit)                | —                         | 7.5                     | The Draw ladder with seals, portraits and mottos is handsome; the fixed Pace footer overlaps content (B3). Spoils faces are in progress.                                                                               |
| Accessibility (contrast, targets, motion, colour) | —                         | 7                       | Body text contrast is high (ivory on walnut 13:1, bone on walnut 8.7:1). Reduced motion is honoured in the 3D view and HUD. Some targets are 26–40 px (D13). Schools show glyph plus colour, not colour alone.         |
| Camera and controls                               | —                         | 7                       | Free camera, follow and lane camera work; the follow view frames a lot of dead floor (D11).                                                                                                                            |
| Loading and performance feel                      | —                         | 7 (est.)                | Title in 0.6 s warm (3 s cold, dev server); board ready about 10 s after Begin on software rendering. Frame times measured here (120–440 ms) are software-render numbers under load and say nothing about real phones. |

## Findings, ranked by player impact

Screenshots and videos are in `docs/img/review-2026-10-18/visuals/` (file names below). Size: **S** = under half a day, **M** = 1–2 days, **L** = 3 days or more.

### Bugs (broken layout, overlaps, cut-off text, wrong words)

**B1. Labels cut off with "…" in the fork sheet, Builds tab and piece card. S.**
`fork-phone-truncated.jpg`, `builds-phone.jpg`, `builds-phone-scrolled.jpg`, `builds-landscape.jpg`, `builds-landscape-header-overlap.jpg`.

- **What's wrong:** At 390 px the fork tab reads "Batteri…" and the main button reads "Choose Battering R…". On the phone Builds tab the third button reads "Let the AI cho…". In landscape Builds the buttons read "Take Through Li…" and "Take Lantern of …". Slot tiles read "SWEEPIN…", "DIAGONAL BEA…" and "ROYAL LUN…".
- **Why it matters:** These are the names the player is choosing between, so the decision screens are exactly where clipping hurts most.
- **Fix:** Let tab labels and slot names wrap to two lines. Make button text "Take" or "Choose" with the name on a second line, or just "Take this card".

**B2. Lane labels hidden under pieces and the Throne. S.**
`follow-labels-phone.jpg`, `throne-labels-zoom-themeb-ink.jpg`, `live-desktop.jpg`.

- **What's wrong:** LEFT / MID / RIGHT are painted on the ground right beside the Throne, where every piece stands at the start and after each respawn. They show as "MIL" and "GHT", and MID sits under the King's crown icon. On desktop "RIGHT" is hidden behind a Bastion.
- **Why it matters:** The source of truth says map labels are drawn last and nudged on collision. Here they are covered at the exact spot players look first.
- **Fix:** Move each label up its lane, past the first Bastion, or draw it in the label layer with the existing nudge-or-skip rule.

**B3. Fixed panels and toasts sit on top of other content. S.**
`fork-desktop-overlaps.jpg`, `draw-phone-pace-overlap.jpg`, `builds-landscape-header-overlap.jpg`, `desktop-token-frozen-over-score.jpg`.

- **What's wrong:**
  - Desktop: the fork sheet covers the Gambits drawer but leaves "BITS 2" showing beside it.
  - Desktop: the toast "Black played Pin on your Rook" is covered by a Black relic icon.
  - Draw page: the fixed "PACE" footer label floats over the scrolled court text without a backdrop.
  - Landscape break sheet: "The bell has rung" sits over content scrolling underneath it.
  - When the game pauses for a fork, a capture token freezes mid-flight over "BLACK PTS".
- **Why it matters:** Overlaps make the build look unfinished, even though each one is small.
- **Fix:** Give fixed headers and footers a solid background. Hide or fold the drawer while a fork sheet is open. Place toasts below the relic row. Let the token finish its flight (or snap it to the tray) when play pauses.

**B4. Wrong or stale words on screen. S.**
`setup-opening-phone.jpg`, `report-phone.jpg`, `report-replay-desktop.jpg`.

- **What's wrong:**
  - The Blitz line on Setup and the Draw says "3 Acts, about 10 min. No Checkmate: decided on points." It reads as "Blitz has no Checkmate", yet our Blitz match ended "CHECKMATE · 2 Acts of Blitz".
  - The report's Replay legend still says "purchases", but nothing is sold any more.
- **Why it matters:** Players believe what the rules text says.
- **Fix:** Change the Blitz line to "No Checkmate by the end of Act 3? Decided on points." Change "purchases" to "Techniques". The features reviewer should confirm the Blitz rule itself.

**B5. The empty capture tray looks broken. S.**
`desktop-topbar-zoom.jpg`, `live-landscape.jpg`.

- **What's wrong:** On desktop and landscape, the top bar shows a dashed empty circle in a box until the first capture.
- **Why it matters:** It looks like a missing image.
- **Fix:** Hide the tray until something lands in it, or show a faint "No captures yet".

**B6. Report tabs cut off on phones with no scroll hint. S.**
`report-phone.jpg`.

- **What's wrong:** The tab row ends in "Objecti" at 390 px.
- **Fix:** Add a fade on the right edge, as the hand row has, or use shorter tab names on phones.

**B7. "Lanes at the bell" bars cut off on the phone break Report. S.**
`break-report-phone.jpg`, `break-lane-labels-zoom.jpg`.

- **What's wrong:** The LEFT / MID / RIGHT labels lose their first letter at the left edge, the three rows touch with no gap, and the bars run past the right edge of the sheet.
- **Why it matters:** It is the first chart on the first tab of every break.
- **Fix:** Give the label column a fixed width inside the sheet's padding, add a 4 px row gap, and size the bars to the remaining width.

### Polish and design

**D1. Fights and captures are hard to read at the default zoom. M.**
`live-mid-phone.jpg`, `live-desktop.jpg`, `capture-sequence-phone.jpg`, video `capture-phone.mp4`.

- **What's wrong:**
  - Pieces are about 15–20 px tall on a 390 px phone and 20–25 px on a 1440 px desktop.
  - In the capture clip, the Bishop's fall reads through the toast ("Your Bishop fell — worn down by the board"), a white light pillar and the roster tile turning to "0:23 Traded". The knocked-flying body and the token flight are a few pixels at this zoom.
- **Why it matters:** Fable's AA line for readability is "who is fighting whom at a glance". The capture spectacle was built to be the signature moment, but most players will watch at this default zoom.
- **Fix:**
  - Scale pieces up by about 1.3–1.5× only when the camera is far out (by camera distance), and put a team-coloured base disc under each piece.
  - On a White capture with Auto off, flash a ring where it happened and briefly enlarge the tray token on landing.
  - Consider Auto camera on by default on phones.

**D2. The map's loudest shapes are empty places. M.**
`map-zoom-phone.jpg`, `live-start-phone.jpg`, `live-themeb-ink-phone.jpg`.

- **What's wrong:** The five locked clearings are black discs with keyholes, and the Pit is a large black disc ringed in brass. Together they are the darkest, highest-contrast shapes on the board, and they sit right in the middle.
- **Why it matters:** This is the root of the owner's "no design logic around the symbols and places" feeling. The board's focal point is "nothing here yet". The look doc's own rule is "one meaning per look", but black currently means both "dead space" and "a place you'll fight over".
- **Fix:**
  - Draw locked clearings as a stone lid at flagstone brightness with a brass seal; they open by sliding the lid away.
  - Give the Pit a sunken arena floor (sand or felt) with a lit ring.
  - Keep near-black for dead space only.

**D3. Bastions look like cottages and the Throne looks like a box on a cake. M.**
`map-zoom-phone.jpg`, `throne-labels-zoom-themeb-ink.jpg`.

- **What's wrong:** Bastions are small houses with pyramid roofs. The Throne is a white block on an octagonal plinth.
- **Why it matters:** This is a chess game and these are the objectives you destroy, but none of the board's structures read as chess.
- **Fix:** Use a crenellated rook-tower silhouette for Bastions, with team colour on the banner and cap, and a crowned keep for Thrones. They can stay low-poly and code-built.

**D4. Road outlines still look computed, not designed. M–L.**
`map-zoom-phone.jpg`, `live-desktop.jpg`.

- **What's wrong:** The river road and sally paths have jagged, shard-like edges and zig-zags. The dead pockets between them look like broken glass. The gate arches where paths meet groves work well; the owner's "side roads don't mesh with farms" is half solved.
- **Why it matters:** These shapes come straight from the walkable outlines, so the board reads as a navigation mesh rather than a garden.
- **Fix:** In the render only (the sim's walkable shapes stay as they are), round or chamfer path corners. Fill small leftover pockets with lawn or hedge so dead space comes in a few calm blocks.

**D5. Colour meanings collide. M (design decision plus CSS).**
`builds-landscape.jpg`, `builds-landscape-header-overlap.jpg`, `card-sheet-phone.jpg`.

- **What's wrong:**
  - March school is `#c9a35a`, the same as brass, which the look doc reserves for places and chrome.
  - Clock school is `#cbbd9f`, the same as body text.
  - Position green is close to the baize "selected" green.
  - Sacrifice purple matches the purple used for Soul numbers.
  - Initiative red is close to "the price" and "bad" red.
  - On the Builds cards, numbers are coloured by damage type (blue 80%, purple +15% Soul, green 40% health) inside cards whose borders use school colours, with a brass "Picked for you" on top.
- **Why it matters:** When every hue means three things, colour stops helping, and the Technique cards (the new core decision) suffer most.
- **Fix:** Write a one-page colour map:
  - Six school hues used nowhere else.
  - One green for "better" and one red for "worse" in ledgers.
  - Damage types shown by a small icon or word, not a colour.
  - Brass only for places, chrome and the AI's pick.

**D6. Portrait chrome still takes about a third of the phone. M.**
`live-mid-phone.jpg`, `hand-phone.jpg`, `hand-open-360.jpg`.

- **What's wrong:** The top bands take 105 px and the bottom bands 139 px: 29% of 844 px with the hand closed, 36% with it open, 39% at 360×800. The "Auto pawns On" pill also floats over the board above the hand.
- **Fix:** While the hand is open, fold the White roster row into a thin strip (portrait plus ring only), and move the Auto pawns switch into the drawer header.

**D7. Type sizes drift below the scale. S–M.**

- **What's wrong:** `tokens.css` defines a 12 px floor (`--fs-xs`), but about 60 rules hard-code 8–11.5 px (hud.css, hud2.css, setup.css, report.css, feedback.css). On a phone, roster names are 10.5 px, "WHITE"/"BLACK" under the score 9.5 px, and slot and timer labels 10 px.
- **Fix:** Replace hard-coded sizes with tokens and hold 12 px as the phone minimum. Where space is tight, use a short word or an icon rather than a smaller font.

**D8. The active tab is hard to see in the break sheet. S.**
`builds-landscape.jpg`, `break-report-landscape.jpg`.

- **What's wrong:** Report / Orders / Builds / Relics differ only by a slightly brighter label.
- **Fix:** Reuse the setup step chips' treatment (filled brass background) or the report's brass underline.

**D9. The landscape break sheet is cramped. M.**
`builds-landscape.jpg`, `builds-landscape-bottom.jpg`, `relics-landscape.jpg`.

- **What's wrong:** At 844×390 the cards get about 240 px of height between the header and the 50 px "Take a relic to resume" bar, so card text and Take buttons are cut and the content needs scrolling.
- **Fix:**
  - In landscape, collapse the header into the tab row ("Act 1 complete" left, tabs right).
  - Move Resume into that row.
  - Give the cards the full height and let only the card row scroll.

**D10. Adjourn in landscape is mostly settings. S.**
`adjourn-landscape.jpg`.

- **What's wrong:** Sound, Mixer, three theme chips, Replay tutorial and the score cards push the Lanes / Builds / Rules content to the fold.
- **Fix:** Put the board theme, Ink, sound and tutorial controls in a Settings tab.

**D11. Following a piece frames a lot of dead floor. S–M.**
`follow-labels-phone.jpg`, `fork-desktop.jpg`.

- **What's wrong:** Following the King on a phone puts the Throne in the top half and pine woods in the bottom half. Desktop follow views are mostly slate floor.
- **Fix:** Keep the follow target inside the board's walkable bounds, and zoom the follow camera a little closer on desktop.

**D12. The report's Replay page looks like a different game. M.**
`report-replay-desktop.jpg`.

- **What's wrong:** It shows a flat brown schematic in a third of the page, and the rest of the page is empty.
- **Fix:** Draw the replay map in the board's palette (felt lanes, stone roads, brass medallions) and size it to the page.

**D13. Several tap targets are under 44 px. S.**

- **What's wrong:**
  - Auto pawns switch: 36 px tall.
  - Report page dots: 26 px.
  - Piece card close: 40 px.
  - Orders pawn-plan minus and plus buttons: 40 px.
  - Landscape Black portraits: 38 px wide.
  - Lane bars: 39 px wide.
  - Fork relic icons: 36×32 px.
  - Glossary words inside sentences: about 20 px tall (acceptable inside text, but they sit very close together).
- **Fix:** Pad the hit area to 44 px with a pseudo-element; the drawn size doesn't need to change.

**D14. The title's lower half is a loose cluster. S.**
`title-phone.jpg`.

- **What's wrong:** Sound, Mixer, a left-aligned "Replay tutorial" button (the only element off the centre line), two theme chips, Ink and the seed box stack up under the main buttons.
- **Fix:** Group them in one "Settings" row that opens a small sheet; keep only Tournament, Exhibition and Rules prominent.

**D15. Small jargon on tiles. S.**
`piece-card-phone.jpg`, `builds-landscape.jpg`.

- **What's wrong:** "1 away" on a slot tile means one Technique from a Combination, which isn't clear without the detail. "Traded" in red on a roster tile is easy to misread as an error.
- **Fix:** Use "Pair: 1 more" (or a link icon with a tooltip), and "Down 0:23" for a fallen piece.

## What's already great (don't regress these)

- **One frame language for decisions:** the card sheet, fork sheet, relic cards, Technique cards, piece card and report all use the walnut panel, brass rule, IM Fell small-caps headings and Spectral body (`card-sheet-phone.jpg`, `fork-desktop.jpg`, `relics-landscape.jpg`).
- **Checkmate beat:** letterbox, push-in on the losing King, the topple, gold light and the "CHECKMATE / White wins" lower third, then the result. Short, skippable, and it honours reduced motion (`checkmate-sequence-phone.jpg`, `checkmate-phone.mp4`).
- **Versus card and Draw ladder:** 3D portraits in team finishes, heraldic seals, mottos (`versus-phone.jpg`, `draw-phone-pace-overlap.jpg`).
- **Informed choices:** before → after ledgers with this piece's real numbers on fork tabs and Technique cards, "Last Act" estimates, "Completes a pair", and the chess grade marks (!, ?!) (`fork-phone-truncated.jpg`, `builds-phone.jpg`).
- **Pick for me:** the starred "worth a look" pieces and the "Picked for you" ribbon make a heavy screen safe to skip. On the phone the Builds tab reads top to bottom in one clear order: pieces, slots, offer cards, Reroll / Pass / AI, Resume (`builds-phone.jpg`).
- **Orders tab:** a clean lane board, Black's court list and pawn plan in one column (`break-orders-phone.jpg`).
- **Full-screen board with a free camera,** the side-on desktop view, and theme b's warm palette, which matches the walnut-and-brass HUD best (`live-desktop.jpg`, `live-themeb-ink-phone.jpg`).
- **Reduced motion is handled everywhere it matters:** the eye badge, teleport, knock-back, life pass and Checkmate length.
- **Contrast of body text** is high throughout (13:1 ivory and 8.7:1 bone on walnut).
- **Report:** the scoreboard, awards and Pieces timeline are still the best screens in the game (`report-desktop.jpg`).

## How this was tested

- **Build:** `f9fd7f5` on the Vite dev server, driven by Playwright scripts (Chromium, software WebGL) under the shared heavy-run lock. Seed 42 Exhibition with default Opening and Blitz; seed 7 Tournament with the `?run=test` hook for the round end.
- **Viewports:** 390×844 and 360×800 portrait (touch), 844×390 landscape (touch), 1440×900 desktop.
- **Themes:** Slate garden with Ink off, and Lamplit parterre with Ink on (390, all live screens).
- **Screens visited:** title, Rules (Words, All cards), Setup (3 pages), versus card, live HUD, hand, card long-press sheet, follow camera, piece card with slot detail, Rank 4 fork sheet (two tabs), Act break (Report, Orders, Builds with slot detail and scroll, Relics), Adjourn (3 tabs), Checkmate beat, report (7 pages), Tournament Draw, Run kit, round report, Spoils.
- **Videos:** a capture and the Checkmate beat (phone).
- **Numbers:** an in-page audit listed every visible button under 44 px and text under 11 px. Its automatic contrast pass misread gradient buttons, so the contrast figures above are computed by hand from the palette in `src/ui/css/tokens.css` and `src/ui/schools.tsx`.
- **Other stills, for reference:** `piece-card-slot-phone.jpg` (slot detail), `follow-themeb-ink-phone.jpg` (theme b with Ink, close up), `run-kit-phone.jpg`, and `spoils-phone-in-progress.jpg` (Spoils faces are in progress).
- **Not done:** a real phone, the rank-up flare on video, the square map, and a full `npx playwright test` (this was a review with no code changes).
