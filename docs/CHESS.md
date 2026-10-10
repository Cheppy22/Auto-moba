# Chess variant spec (branch `test-product-2`, 2026-10-08)

An experimental twist on Auto-MOBA. **On this branch this file overrides [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)** wherever they disagree. Live at https://cheppy22.github.io/Auto-moba/v2/.

## Owner decisions (Cheppy, 2026-10-08)

| Question                  | Decision                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme                     | Chess. Two teams, **White** (team A, the player, bottom) and **Black** (team B, AI, top).                                                                      |
| Roster                    | Five pieces per team, one of each: **King, Queen, Rook, Bishop, Knight**. The 14 heroes are cut.                                                               |
| Player character          | **None.** The whole team is the player. All ten pieces are AI-driven.                                                                                          |
| Lane minions              | Stay, renamed **pawnlings** (the old minion waves). **Pawns** are elite units you buy with Tempo: up to 8 on the field in the early game. Pawns never promote. |
| King death ends the game? | No. See Check and Checkmate.                                                                                                                                   |
| Lane towers               | Renamed **Bastions**.                                                                                                                                          |
| First move                | Both sides start at the same instant.                                                                                                                          |
| Between-phase screens     | Cut. Acts end with the bell and a break sheet instead ("Act break" below).                                                                                     |
| Level-ups                 | Automatic **Ranks 1–8**, plus two **fork** choices (Rank 4 and 8). **The game pauses for a fork** until the player chooses. Rank is easy to read on units.     |
| Gambits                   | A **random hand** of orders, for replayability.                                                                                                                |
| Jungle shops              | Stay.                                                                                                                                                          |

## Match flow

1. **Title → Setup board.** The player picks an **Opening** (which schools of gambits the hand favours), and for each of White's five pieces a **build path** (Offense, Defense, Utility), then assigns lanes: 2 Left, 2 Right, 1 Mid. Everything is pre-filled with sensible defaults, so "Begin" works immediately. Black's setup is picked by the AI (seeded) and shown on the enemy roster once the match starts.
2. **Live, in Acts.** The match runs in **Acts** of 240 s (the old phases): Acts open jungle clearings, move the Keeper, schedule obelisks and events, and switch on pressure events. Each Act ends with **the bell**: the board greys while it waits for calm, tolls three times, slows to a stop, and a break sheet (Act report and Orders) waits for the player. The next Act starts when the sheet closes. See "Act break" below.
3. **During play the player:** plays **Gambits**, answers **forks**, moves the camera, and may press **Adjourn** (pause) to re-assign lanes or paths and read the Armory.
4. **End:** Checkmate screen and the match report.

## Pieces

Both teams field the same five pieces, so balance lives in roles, styles, paths and gambits, never in team asymmetry. Content numbers are owned by the content designer and go in `content/pieces/*.json`; the design sheet with every style, fork and path is [PIECES.md](PIECES.md).

| Piece  | Job                                                   | Move flavor                                | Styles (starting skill)                                                           |
| ------ | ----------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| King   | Commander: slow, tough, auras that lift nearby allies | One step at a time; Castling with the Rook | **Warlord** (frontline aura) / **Sovereign** (shields) / **Usurper** (drain)      |
| Queen  | Carry: strongest late, mobile in any direction        | Long dashes in 8 directions                | **Regent** (area mage) / **Duelist** (melee carry) / **Huntress** (sniper)        |
| Rook   | Tank and siege: holds a lane, breaks structures       | Straight-line charges                      | **Bastion** (wall/taunt) / **Battering Ram** (structures) / **Vanguard** (engage) |
| Bishop | Caster and healer on the diagonals                    | Long diagonal beams                        | **Light** (healer) / **Shadow** (damage over time) / **Zealot** (battle priest)   |
| Knight | Assassin and roamer; leaps over terrain               | L-shaped leaps over cliffs                 | **Lancer** (dive) / **Errant** (jungle, split push) / **Paladin** (peel)          |

- A piece has **3 base abilities**; its **style adds the 4th** (its signature skill) plus a stat tilt and passive. All abilities stay auto-cast, as now.
- **Build path** picks the piece's item build list (Mind/Body/Soul items as now). Pieces buy on their own, like the AI heroes do today.
- AI disposition defaults: King defender, Queen attacker, Rook defender, Bishop farmer, Knight farmer (jungler). Lane assignment comes from setup, not disposition.

## Ranks and forks

- **Rank 1–8**, from lifetime gold earned (thresholds in `tuning.json` → `ranks.goldThresholds`, 8 entries starting at 0). Replaces per-phase stat growth.
- Each rank-up applies stat growth (`ranks.growth`, % health, Blade damage, Soul power) and the style's **rank bonus** for that rank (Ranks 2, 3, 5, 6, 7), automatically. A small non-blocking chip says so ("Bishop · Rank 5: Radiance").
- **Pieces are generic until Rank 4.** Ranks 1–3 use the piece's base kit (3 abilities) and generic rank bonuses. **Rank 4 is the archetype choice:** the piece picks one of its three styles (signature 4th ability, stat tilt, passives, style flair, style-specific build list from then on). **Rank 8** keeps a two-option fork from the chosen style. Rank bonuses 5–7 are style-specific.
- **Both choices pause the match** for White (the fork sheet shows 3 archetypes at Rank 4, 2 options at Rank 8); no timeout; **Let the AI choose** picks for all. Black's AI picks at once (by path, team needs and keeping every style in use). In headless runs White resolves like Black after `ranks.forkSec`.
- **Readability:** every piece shows its rank as a numeral badge on its health bar (and pips 1–8 on the roster); a pending fork makes the badge pulse.

## Pawnlings and pawns

- **Pawnlings** are the old lane minions under a new name: waves spawn and march every lane exactly as minion waves did (same tuning). They're the lane's steady fodder and gold. Neutral units (Spirit Tide, jungle events) stay.
- **Pawns** are elite foot soldiers the team **fields with Tempo** (`pawns.cost`, default 15). Fielding one is a permanent button next to the gambit hand, not a card: pick a lane, the pawn spawns at the base and marches it, fighting like a tougher pawnling (about 3× a pawnling's health and damage, scaling per Act).
- **Cap:** at most **8 living pawns** per team in the early game (Acts 1–3). From Act 4 the cap rises by 2 per Act (10, 12, …) — owner may veto this.
- A dead pawn is gone; field another. No respawn and **no promotion**.
- Tempo now pays for both pawns and gambits; that trade-off is the point. Teams start with `gambits.tempoStart` (enough for about 2 pawns).
- Black's AI fields pawns too (and both teams in headless runs with `autoGambits`).
- Pawn kills pay a small bounty to the killer's team; pawnling bounties stay as minion bounties were.

## Structures, Check and Checkmate

- **Bastions** are the lane towers (2 per lane per team, same rules: 3600 health, inner ×1.25, ×0.5 piece damage, 9%/s cap).
- The base structure is the **Throne** (the old guardian). It never leaves its base.
- **Check:** when a King dies while its Throne stands, its team is in Check until he respawns: King respawn ×1.5 and the team deals −10% damage.
- **Throne fallen:** a destroyed Throne doesn't end the game, but that team's King can no longer respawn.
- **Checkmate:** a team loses the moment its Throne is down **and** its King is dead (either order).
- **Endgame** (replaces The Kings Wake, from Act 7): Thrones take +50% damage and all respawns are +50%, so matches end.
- Other pressure events (Thinning Veil, Spirit Tide, Calls In Debts) stay.

## Gambits

- Each team has **Tempo** 0–100 (`gambits.tempo`): +1 per second, + per piece kill, + per Bastion, small + per pawn kill. Spent on gambits and on fielding pawns.
- Each team holds a **hand of 3** cards drawn from its deck with the seeded `gambit` random stream. The deck holds the universal cards plus the signature card of each **living** piece (a held card whose piece is dead is unusable until it respawns).
- A played card is replaced after `gambits.refillSec` (6 s). An unplayed card expires after `gambits.expireSec` (40 s) and is replaced, so the hand keeps changing.
- **Black plays gambits with an AI heuristic.** In headless runs both teams use it (`MatchConfig.autoGambits`). In the browser White's gambits come only from the player.
- Starting card list (numbers in `content/gambits.json`):

| Card           | Piece  | Target | Effect                                                                   |
| -------------- | ------ | ------ | ------------------------------------------------------------------------ |
| Advance        | —      | lane   | Pieces and pawns in that lane push; +10% move speed, 20 s                |
| Hold the File  | —      | lane   | Pieces in that lane defend; +15% armor and resist, 20 s                  |
| Regroup        | —      | point  | Every living piece gathers at the point, 15 s                            |
| Pawn Storm     | —      | lane   | That lane's pawns +50% damage and move speed, 15 s                       |
| Check          | —      | enemy  | Marks an enemy piece: +20% damage taken, visible to all, 8 s             |
| Castle         | King   | none   | King and Rook swap places instantly                                      |
| Queen's Gambit | Queen  | none   | Queen +40% damage for 12 s, then −20% for 6 s                            |
| Siege          | Rook   | enemy  | Rook and its lane focus a Bastion or Throne; +30% structure damage, 10 s |
| Sanctuary      | Bishop | point  | A zone that heals allies 4% max health per second, 6 s                   |
| Fork           | Knight | enemy  | Knight leaps to an enemy piece within reach and stuns it 1 s             |

## Gambit schools (2026-10-10)

Every gambit belongs to one of six **schools**. Each card shows its school's colour and glyph (**school markings**).

| School     | Job                                                   | Colour, glyph                 | Countered by (effects) |
| ---------- | ----------------------------------------------------- | ----------------------------- | ---------------------- |
| March      | Push lanes with pawns and pawnlings, break structures | brass, pawn with arrow        | Fortress, Position     |
| Initiative | Pick off or lock down enemy pieces                    | ruby, crossed swords          | Fortress               |
| Fortress   | Hold, absorb, save                                    | slate blue, tower             | Sacrifice, Initiative  |
| Sacrifice  | Give something up now for a bigger swing              | amethyst, broken pawn         | Clock, Position        |
| Position   | Reshape the board for a while                         | baize green, flag on a square | Initiative             |
| Clock      | Bend the Tempo economy and gather information         | bone, clock face              | March                  |

- **Counters work through effects, never by cancelling a card.** Each pairing below is designed into the cards' effects and checked with school-vs-school balance runs:
  - **Fortress vs March:** armor/resist and Bastion shields soak a push longer than its buff lasts.
  - **Position vs March:** Barricade blocks the lane's gate or bridge, so a pushing wave stalls or reroutes; Outpost holds a choke.
  - **Fortress vs Initiative:** shields, heals and Castle save the marked or pinned piece.
  - **Sacrifice vs Fortress:** burst damage (Pawn Sacrifice) and the team damage spike (Exchange) break shields and armor that are built for sustained pressure.
  - **Initiative vs Fortress:** picking off the healer or King before the defence holds.
  - **Clock vs Sacrifice:** Tempo drain and forced discards stop the expensive swing card from being played in time.
  - **Position vs Sacrifice:** Barricade and Regroup keep pieces away from where the swing lands.
  - **Initiative vs Position:** Check, Fork and Pin kill or lock the pieces holding an Outpost or Barricade.
  - **March vs Clock:** steady cheap pressure wins while Clock spends Tempo on information instead of force.
- **Openings** (picked at setup; Black's AI picks one too, revealed on contact): each weights the random draws toward two schools (×2). Italian (balanced, the default), Sicilian (Initiative + March), French (Fortress + Position), King's Gambit (Sacrifice + March). English (Clock + Position) arrives with wave 2.
- **Line bonus:** not yet.
- **Cards by school** (★ = wave 1, new):
  - March: Advance, Pawn Storm, Siege (Rook). Wave 3: Breakthrough.
  - Initiative: Check, Fork (Knight). Wave 3: Pin, Desperado.
  - Fortress: Hold the File, Castle (King), Sanctuary (Bishop). Wave 3: Fortify.
  - Sacrifice: Queen's Gambit (Queen), ★Pawn Sacrifice (10 + one of your pawns: a burst on the nearest enemy Bastion in that lane), ★Exchange (20: a piece gives up 25% of its health; your team +15% damage for 10 s), ★Poisoned Pawn (15: mark a pawn for 20 s; whoever kills it is slowed and Black loses 10 Tempo).
  - Position: Regroup, ★Barricade (25: seal a gate path or bridge for 20 s), ★Open File (20: allies +25% move speed in one lane for 15 s), ★Outpost (30: a banner; allies near it get +armor and resist for 25 s).
  - Clock (wave 2): Zugzwang, Time Trouble, Opening Book, Blitz.
- **Testing** goes a few schools at a time: the balance tool can restrict both decks to chosen schools.

## Act break (2026-10-10)

Owner-approved sequence at the end of every Act except the last (timings in `content/tuning.json` → `bell`):

1. **Countdown (UI only, no audio).** The Act clock flashes with a small notice at 1:00, 0:30 and 0:10 ("1:00 to the bell"). In the last 5 seconds it pulses on every second, each pulse bigger and stronger than the last.
2. **Bell pending (0:00).** The board desaturates about 30% (smooth CSS filter on the 3D canvas) and a small line reads "Bell pending — waiting for the board to calm". Play continues normally and the old Act's rules stay in force.
3. **Calm.** The board is calm when none of the ten pieces is in combat for 2 s (the same signal as `SnapUnit.inCombat`: damage dealt or taken within 1.5 s). Pawnlings, pawns and structures are ignored. If it is not calm 30 s after 0:00, the bell tolls anyway.
4. **Three tolls**, 1 s apart, each a growing pulse on the clock plus a ring of light at the screen edge. Once tolling starts it is committed: a new fight does not stop it. No new pawnling wave spawns from the first toll on.
5. **Halt.** The sim runs a short halt stage (`haltTicks`, 15 ticks). The app scales its step rate from 1 to 0 across it (about 1.5 s of wall clock, ease-out), the colour drains to full grey, and the 3D view slows its animation clocks (walk cycles, effects, water) by the same factor. No unit is moved, teleported or reset at any point.
6. **Break sheet.** When fully stopped a full-screen sheet slides up from the bottom (no time limit, like forks). Tabs: **Report** (two or three plain-language coach callouts from this Act, ranked by severity, and "this Act" numbers for White and Black side by side: Tempo earned, damage dealt, piece deaths, Bastions destroyed, obelisks claimed, camps cleared, gambits played; from the second break also Black's held relics), **Orders** (lanes and build paths for White's pieces, the same controls as Adjourn) and **Relics** (the relic draft, below). The button "Resume — Act N" closes it, and stays locked until a relic is taken (when the draft has offers). If a fork is pending when play stops, the fork sheet shows first. The gambit hand and Field Pawn are inert while stopped.
7. **Resume.** `endAct` runs when the break starts (the old Act's timed objectives close); `enterAct` runs on resume with a full 4:00 clock and its events. The first pawnling wave of the new Act spawns 1 s after resume, so each Act opens with a fresh clash.
8. **AI re-plan.** At each break Black's AI may (75% chance, seeded `ai` stream) move its most beaten piece (at least 2 deaths this Act, ties by lower damage) to the lane that went best for the team, swapping with the steadiest piece there so lanes stay 2 Left / 2 Right / 1 Mid. In headless and AI-vs-AI runs White's AI does the same.
9. **Last Act.** If the Act that reaches 0:00 is the last (`maxPhases`), there is no break: the match ends as a draw as before.

- **Headless runs** (`MatchConfig.pauseForBreak` false, the default) still play pending, tolls and halt in the sim, but the break resolves at once: both AIs re-plan and the next Act starts. The browser game sets `pauseForBreak` so `Match.step` returns 0 on the sheet until the `resumeAct` command.
- **Coach callouts** (rules in `src/sim/callouts.ts`, re-exported by `src/analysis/callouts.ts`) are deterministic rules over the Act report (`Snapshot.act.report`, built in `src/sim/actReport.ts`): a Throne or Bastion lost, a piece dying 2+ times (and to whom), a Tempo gap of 40+, Tempo left unused, a lane losing 1.5+ more pawnlings per wave, a piece with under 10% of the team's piece damage, and a few wins (Bastion taken, enemy piece falling twice). Only rules that are true of the numbers fire.

### Relics (wave 1 built 2026-10-10)

At every Act break White drafts one relic (pick 1 of 3, hold up to 3, permanent, effects from the next Act) and Black does the same by an AI rule. The third break-sheet tab is **Relics**: three cards (family colour and seal, one-line effect, the plan it rewards, its counter, and for the tailored card why it was offered), lane or piece chips to aim bound relics, "Let the AI choose", and the relics you hold, which can be re-aimed for free at any later break. Held relics show as a small seal row under each roster (tap for text); Black's new relic is announced when the next Act starts. The full design, the relic list and the numbers are in [RELICS.md](RELICS.md); data in `content/relics.json`, rules in `src/sim/relics.ts` (effects) and `src/sim/draft.ts` (offers, picks, AI). Tier 3 items were renamed **Masterworks** (labels only) so "relic" means this system.

## Combat feedback (2026-10-10)

Owner-approved. The player is a commander: the decisions happen at setup and at the Act break, so combat feedback exists to help read the board and plan, never to react. It is **information only** (no balance or behaviour change; the sim's positions are identical with or without it) and deliberately quiet: no floating damage numbers. Numbers live in `content/tuning.json` → `feedback`; the sim side is `src/sim/feedback.ts` (hits, death cause, fights, lane momentum) and `src/sim/impact.ts` (gambit measurement); wording is in `src/analysis/feedback.ts`.

1. **Fight verdicts.** A fight is a cluster of pieces in combat (the `inCombat` signal, within `fight.radius` of each other) that holds at least one piece of each side. It ends `fight.endSec` after no such cluster is in combat (with the 1.5 s combat timer, about 3 s after the last blow) and emits `fightEnd`: zone (Left/Mid/Right lane, jungle, or a base), world position, pieces per side, pieces each side **lost**, pawnlings and elite pawns lost per side, Bastion/Throne damage each side took. A fight with no piece lost is a skirmish: no tag. Otherwise a small verdict tag fades in at the fight's position in the 3D view for about 4 s: "Left lane — won 3 for 1" (your kills for your losses), "Mid — lost 0 for 2", "Right lane — even trade, 1 for 1". Open fights are closed when the Act ends and at checkmate.
2. **Why a piece fell.** Each piece keeps its last `death.windowSec` (5 s) of hits (merged per attacker per 0.2 s, at most 64). On death the cause is the first that applies: **burst** (at least `burstFrac` of max health inside `burstSec`), **focus** (at least `focusAttackers` distinct enemy pieces hit it), **out of position** (no allied piece or structure within `isolatedRadius`, or farther than `laneOffMax` from its assigned lane with no ally piece near), **outnumbered** (more enemy pieces than allied pieces, itself included, within `nearRadius`), else **traded**. The `death` event carries `fall` (cause, killer piece, up to three attacking pieces by damage); the piece keeps it while it waits to respawn. Shown as a toast "Your Rook fell — focused by Queen, Knight", and on the fallen piece's roster tile as the killer's icon and the cause word beside the respawn timer.
3. **Gambit impact.** Every played card is measured while it is active (`gambitEnd` event). Only what the sim can attribute is shown: damage turned away by Hold the File and Outpost (computed from the armor bonus), healing by Sanctuary, the multiplier's own share of damage for Pawn Storm, Check, Queen's Gambit (net of the backlash), Siege and Exchange, Bastion damage for Advance, Siege and Pawn Sacrifice, enemy units that reached a Barricade's wall, Tempo drained by Poisoned Pawn. A card with nothing attributable (Regroup, Open File, Castle, Fork) shows how long it ran. Piece kills and losses beside the card's effect are always added. A line shows near the hand for about 3 s when the effect ends ("Outpost — turned away about 286 damage"). The Report keeps a per-card tally for the Act: plays, Tempo spent, result.
4. **Lane momentum.** `Snapshot.momentum` per lane, -1 (Black) to 1 (White): the point where the two pawnling fronts meet (weight 0.5), Bastion health left on each side (0.3) and net piece kills in that lane over the last 30 s (0.2). Drawn as three small tug-of-war bars L / M / R under the Act clock (ivory is White's push, slate Black's; the seam glides, no numbers). The same bars, labelled, open the Report as "Lanes at the bell".

- **One calm lane.** Fight tags, falls and gambit lines share a cap of two at a time, newest wins; none appear while the bell has halted play.
- **Report additions.** "Fights this Act: won 3, lost 2, even 1" with the biggest fight; "How your pieces fell" (causes per piece); the per-card Tempo tally. New coach callouts: "You lost every fight on the Right lane" (two or more decisive fights, none won), "You won every fight on …", and per piece with a cause twice or more: "Your Bishop died 3× out of position — consider moving it Mid" (the lane where White is strongest at the bell), burst, focused and outnumbered variants. A cause callout replaces the plain "died N×" one for that piece.

## Interface

Mobile first (portrait 390×844, landscape 844×390, desktop). The 3D island stays; the HUD sits in the corners.

- **Setup board:** Opening picker, five piece cards (path toggle; no style yet) and three lane slots. One "Begin" button.
- **Match intro:** after Begin the sim waits (app only, the sim is unaware) while the camera shows the board for about 7.6 s: an Openings card ("White — Italian Game" against "Black — Sicilian Defence", each with its two favoured school marks, or "Balanced"), a pass over each court with a "Rook · Left" tag joined to every piece, then a pass over Left, Mid and Right with a White-vs-Black header per lane. Tap anywhere, Skip or Escape ends it at once and normal camera control returns. With reduced motion the camera does not move: the card, then every tag and lane header on the overview, about 3.8 s. `?intro=off` disables it (end-to-end tests).
- **Black gambit banner:** when Black plays a gambit a slate banner with the gambit's school mark shows at the top for about 3 s ("Black played Barricade on Left lane", "Black played Check on your Knight", "Black played Queen's Gambit"). One shows at a time, up to three wait; White's own plays show nothing.
- **Live HUD (calm):** one slim top row — Act clock and score, a cycling speed chip (1×, 2×, 4×, 8×, paused), a cycling camera button (Auto / Follow / Free) and **Adjourn**; both rosters in the side columns (portrait, health ring, lane tag, rank **numeral**, and the **style emblem**, for Black too); **gambit hand** (cards show name and cost; the reason when unusable; hold a card for its full text), **Tempo meter** and **Field Pawn** (`alive/cap · cost`) at the bottom. Banners and rank chips are small and fade in about 2–3 s. Camera Auto / Follow (tap a roster portrait; tap again or hold for the **piece card**) / Free. Tapping a piece in the 3D view also opens its piece card.
- **Fork sheet (pauses the game):** a bottom sheet on phones, docked right in landscape, bottom-centre on desktop. One fork at a time: piece, style, "Rank 4 · Choose a path", both options with full text and an Offense/Defense/Utility leaning tag, "N more waiting", and **Let the AI choose**. The camera follows the choosing piece and is restored afterwards.
- **Act break sheet (stops the game):** a full-screen sheet (content centred, max 720 px wide) with Report, Orders and Relics tabs and a big "Resume — Act N" button (locked until a relic is taken); works at 390×844 portrait and on landscape phones. The Report also holds Lanes at the bell, Fights, How your pieces fell and the gambit tally. Details in "Act break" and "Combat feedback".
- **Combat feedback (live):** a lane momentum strip (three small bars) under the Act clock; fight verdict tags pinned to the fight in the 3D view; a line above the hand for falls ("Your Rook fell — focused by Queen, Knight") and for what a gambit did; a fallen piece's roster tile shows its killer's icon and the cause. At most two of these show at once. Details in "Combat feedback".
- **Piece card:** piece and team, style name and description, path, lane, kills/deaths, rank pips with the next rank or fork, forks taken, current items.
- **Gambit targeting:** tap a card. Lane cards show three big Left / Mid / Right buttons; point and enemy cards are aimed by tapping the 3D view (ground pick or piece pick); a Cancel chip backs out.
- **Adjourn panel:** paused. Lanes (move pieces between lanes), paths, the **Armory** (each piece's items and next buy, read-only), mini scoreboard. Resume.
- **End report:** a horizontal pager. The front page is the **Result splash** (Checkmate banner, both team scoreboards, MVP, award chips, team totals, New match / Same seed); swipe or use the tab bar for Economy, Combat, Objectives, Pieces, Replay and Log, which hold the graphs. Data from `buildSummary` (`src/analysis/summary.ts`); factual only, no advice.
- Cut: draft, upgrade cards, between-phase shop, shop pins and suggestion queue, auto-buy and Farm toggles, recall button, curse and event prompts (the AI decides curses for both teams).

## Look: "The Grand Board" (art direction, 2026-10-09)

The chess branch drops the xxxHolic and Wonderland dressing (violet ink, seal-red stamps, kanji, butterflies, ritual rings, mushrooms, tea-party and rose-garden discs). It looks like a tournament hall and a formal palace garden built on a giant chessboard.

**Interface palette** (tokens in `src/ui/css/tokens.css`):

| Token        | Use                                       | Value   |
| ------------ | ----------------------------------------- | ------- |
| Ebony        | page background, deepest panels           | #14110e |
| Walnut       | panels, cards                             | #2a1e16 |
| Mahogany     | raised panels, hover                      | #3d281c |
| Ivory        | primary text, White team, primary buttons | #efe6d2 |
| Bone         | secondary text                            | #cbbd9f |
| Brass        | rims, dividers, highlights, gold          | #c9a35a |
| Baize        | selected / active state (tournament felt) | #23503c |
| Silver-slate | Black team                                | #9aa5b8 |
| Clock red    | danger only: Check, low health, errors    | #b8392c |

- Item category colours (Mind, Body, Soul) and style emblem colours keep their own hues; nothing else uses them.
- **Buttons** are ivory or ebony tiles with a brass rim; the primary action is an ivory tile with ebony text; selected options sit on baize green. Clock red is for danger, never for "Begin".
- **Background:** a low-contrast checkerboard with a warm vignette; no rings, stamps, kanji or butterflies.
- **Type:** keep the serif small caps; add chess notation as quiet decoration (file letters a–h and rank numbers on board edges, algebraic notation in the log where it fits).
- **Act timer** reads as a chess clock; the score as captured material.
- Contrast ≥ 5.7:1 for text; tap targets ≥ 40px.

**3D board:**

- Walkable ground is polished stone chessboard (ivory and ebony squares at one consistent scale). Lanes are inlaid marble roads with thin brass borders; no coloured centre stripes. Lane identity, if needed, comes from notation marks at the lane edges.
- Bases are castle throne platforms (stone walls, steps, banners in team colours).
- Off the walkable ground is a formal palace garden: clipped yew hedges, topiary shaped as chess pieces, marble balustrades along the drops, gravel, a few cypress and box trees. No mushrooms, autumn trees or random props.
- Jungle clearings are sunken checkered courts with low stone walls. Sealed clearings show closed iron gates and a light ground mist, not domes.
- The river is a stone-banked reflecting canal with bridges where lanes cross.
- Pieces keep their models, emblems and props. Badges must not pile up when pieces bunch (merge, offset or hide overlapping ones).
- Lighting is warm hall or late-afternoon garden light, calmer and less saturated than before.
- Pieces are characters shaped like chess pieces (crowned King, Queen with a coronet, tower-bodied Rook, mitred Bishop, horse-headed Knight), each with a style accent. Pawns are armoured pawn soldiers; pawnlings are smaller pawn figures.

## Removed on this branch

The 14 heroes and their upgrades; draft and lane pick; the player hero and every player-only rule (auto-buy toggle, recall, Farm toggle, suggestions, event Send/Ignore, the curse prompt); between-phase report, upgrade and shop screens; roaming guardians (The Kings Wake); the holy auction code stays switched off.

## Balance targets

- AI vs AI (both auto-gambits): White 48–52%, median match 12–16 min, every style picked by the AI at least 15% of the time when it's free to choose.
- Gambit value: White with auto-gambits vs White with none should gain 8–15 win-rate points (they matter but aren't mandatory).

## Code contracts

Agents build to these names. Internals are free.

```ts
// content/pieces/<id>.json — PieceSchema in src/sim/content/schema.ts
type PieceId = 'king' | 'queen' | 'rook' | 'bishop' | 'knight';
type Path = 'offense' | 'defense' | 'utility';

// Commands (src/sim/types.ts)
| { type: 'setupTeam'; pieces: { piece: PieceId; style: string; path: Path; lane: LaneId }[] } // setup only
| { type: 'chooseFork'; heroId: number; optionId: string }   // optionId 'auto' = the AI's pick
| { type: 'playGambit'; slot: number; lane?: LaneId; x?: number; y?: number; targetId?: number }
| { type: 'setLane'; heroId: number; lane: LaneId }   // live or adjourned
| { type: 'setPath'; heroId: number; path: Path }
| { type: 'fieldPawn'; lane: LaneId }                 // costs pawns.cost Tempo; respects the cap
| { type: 'resumeAct' }                               // leaves the Act break sheet

// MatchConfig
{ seed: number; setup?: { A?: SetupEntry[]; B?: SetupEntry[] }; autoGambits?: { A: boolean; B: boolean };
  pauseForBreak?: boolean }   // true: the Act break waits for resumeAct (the app); false: resolves at once

// Snapshot additions
SnapUnit: piece: PieceId | null; style: string | null; path: Path | null; rank: number; forkPending: boolean; pawn: boolean; lane: LaneId | null;
Snapshot: act: { n; remainingSec; bell: 'none' | 'pending' | 'tolling' | 'halt' | 'break'; toll?; haltProgress?; report? };
          tempo: Record<PlayTeam, number>; hand: SnapGambit[];   // White's hand
          pawns: Record<PlayTeam, { alive: number; cap: number; cost: number }>;
          forks: SnapFork[];                                                    // White's pending forks
          check: Record<PlayTeam, boolean>; throneDown: Record<PlayTeam, boolean>;
SnapGambit { slot; cardId; name; desc; cost; target: 'lane' | 'point' | 'enemy' | 'none'; piece: PieceId | null; usable; reason; ticksLeft; refillTicks: number | null }
SnapFork   { heroId; piece: PieceId; rank: 4 | 8; options: { id; name; desc }[]; ticksLeft }

// 3D view (src/render/broadcast/scene.ts)
BroadcastView.pickGround(clientX, clientY): { x: number; y: number } | null   // sim coords
BroadcastView.pickUnit(clientX, clientY): number | null                        // unit id
```

New events: `bell { stage, toll?, act }`, `rankUp { id, rank, bonus }`, `fork { id, rank, optionId, auto }`, `gambit { team, cardId, lane?, x?, y?, targetId? }`, `check { team }`, `throneDown { team }`, `checkmate { winner }`.

## Visual distinction and a calmer screen (owner feedback, 2026-10-08)

- **Style must be readable on sight, for both teams.** Every one of the 15 styles gets: a distinct **emblem** (a simple glyph in a style colour) shown next to the rank badge on the piece's bar, on the roster portraits of **both** teams and in tooltips; a **signature accessory/prop** on the 3D piece (different silhouette, not just a colour); and a style-coloured ground ring. Tapping any piece or roster portrait (including Black's) opens a small **piece card**: style name and one-line description, path, rank, items.
- **Calm HUD:** the screen is cluttered at all times, so the default view shows less: full-health pawnlings and pawns have no health bars; pieces keep a thin bar with emblem and rank; gambit cards show name and cost only (full text on tap or hold); roster cells drop the 8 rank pips (numeral only); speed and camera controls collapse to compact controls; banners and chips stack and fade faster; scenery and effects stay out of the lanes. Information appears when it matters (damaged, selected, fork pending, low health) rather than all the time.

## Map scale and spacing (2026-10-09)

- The map is 1950 units across (×1.5 again on 2026-10-10). Lanes are 180 wide (half-width 90). Unit sizes are unchanged; `movement.speedMul` 1.5 keeps travel time about the same.
- Units have body radii and push each other apart (`collision` in `content/tuning.json`; masses piece 3, pawn 2, pawnling 1, neutral 4). Bastions, Thrones, obelisks and the Keeper never move and push others out.
