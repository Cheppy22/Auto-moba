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

1. **Title → Setup board (three pages).** A select-and-swipe flow: swipe on touch, Back / Next buttons, arrow keys on desktop, a 1-2-3 step indicator, and **Quick start** (Begin with the defaults) from any page. Everything is pre-filled, so Begin works at once. Black's setup is picked by the AI (seeded) and shown on the enemy roster once the match starts.
   1. **Build paths.** One tab per piece (all five on screen), each with its three paths (Offense, Defense, Utility; the natural path is pre-selected and marked). A path shows what it leans on, stat-leaning bars (damage / toughness / support, from the build list's item stats) and the **typical first three buys**, replayed from the AI shopper's logic (`firstBuys` in `src/ui/setup/data.ts` follows `nextPurchase`: build list in order, an affordable component when the whole item is not, starting gold from tuning). The AI may add a counter item against the enemy's damage mix, which is why the label says "typical".
   2. **Board arrangement.** A mini board: tap a piece then a lane, or drag it onto a lane (Left 2, Mid 1, Right 2; a full lane swaps). Below it, **lane synergy** notes for two pieces sharing a lane (ally heal or shield skills, ally auras, a tough melee front with a ranged piece behind), derived from content, information only; nothing is shown when nothing is notable. Then a descriptor per piece: collapsed it shows the role (the piece's title, "The Carry"), disposition (from the piece's content `disposition`), attack kind and lane; expanded it shows the three base skills, the passive and the playstyle line.
   3. **Opening.** Pick one of the Openings (favoured schools shown as the existing school markings, one-line summary). **More** opens an explanation, how it plays, the schools it is good against and weak against (by card effect, the pairings in "Gambit schools") and **Example hands**: three sample hands of three cards drawn with the Opening's real weights (card weight, doubled for its schools) by a display-only PRNG, never the sim's streams. Then **Begin**.
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

- **Pawnlings** are the old lane minions under a new name: waves spawn and march every lane exactly as minion waves did (same tuning), except that both teams' waves now start level in every lane, Mid included (`waves.midLeadUnits` 0; the old Mid stagger always gave Black the first Mid wave, see [BALANCE-2026-10-11.md](BALANCE-2026-10-11.md)). They're the lane's steady fodder and gold. Neutral units (Spirit Tide, jungle events) stay.
- **Pawns** are elite foot soldiers the team **fields with Tempo** (`pawns.cost`, default 15). Fielding one is a permanent button next to the gambit hand, not a card: pick a lane, the pawn spawns at the base and marches it, fighting like a tougher pawnling (about 3× a pawnling's health and damage, scaling per Act).
- **Cap:** at most **8 living pawns** per team in the early game (Acts 1–3). From Act 4 the cap rises by 2 per Act (10, 12, …) — owner may veto this.
- A dead pawn is gone; field another. No respawn and **no promotion**.
- Tempo now pays for both pawns and gambits; that trade-off is the point. Teams start with `gambits.tempoStart` (enough for about 2 pawns).
- Black's AI fields pawns too (and both teams in headless runs with `autoGambits`).
- **Standing pawn plan (White, 2026-10-11).** Orders at each Act break has **Pawns per lane**: three steppers (Left / Mid / Right, total at most the pawn cap of the next Act). During the Act a pawn is fielded on its own in the lane with the biggest gap whenever Tempo is at least the pawn cost plus a **reserve of 20** (kept back so gambits stay playable; shown in the text). A new match starts with 2 / 2 / 2 so a player who never taps still fields pawns; set 0 / 0 / 0 to field none. **Field Pawn stays** as a manual extra (the cap still applies). No pawns are fielded from the first toll to the resume. The plan is `MatchState.pawnPlan` (set by the `setPawnPlan` command, in `src/sim/pawnPlan.ts`; the fielding rule is shared with Pawn Structure in `src/sim/relicsLive.ts`). It only exists once the player sets it: Black's and AI-White's fielding (`aiGambits`) are untouched, so AI-vs-AI matches are identical with or without this feature.
  - **Pawn Structure is strictly better**: it lets you pick the reserve (0, 20 or 40) and its auto pawns cost 2 less. While it is held it takes over, the plan sleeps, and Orders shows a line saying so.
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

1. **Countdown (visual, plus a soft clock tick in the last 5 s; see Sound).** The Act clock flashes with a small notice at 1:00, 0:30 and 0:10 ("1:00 to the bell"). In the last 5 seconds it pulses on every second, each pulse bigger and stronger than the last.
2. **Bell pending (0:00).** The board desaturates about 50% (smooth CSS filter on the 3D canvas, `bell.pendingSaturation` 0.5) and a small line reads "Bell pending — waiting for the board to calm". Play continues normally and the old Act's rules stay in force.
3. **Calm.** The board is calm when none of the ten pieces is in combat for 2 s (the same signal as `SnapUnit.inCombat`: damage dealt or taken within 1.5 s). Pawnlings, pawns and structures are ignored. If it is not calm 30 s after 0:00, the bell tolls anyway.
4. **Three tolls**, 1 s apart, each a growing pulse on the clock plus a ring of light at the screen edge and a bell strike (each louder). Once tolling starts it is committed: a new fight does not stop it. No new pawnling wave spawns from the first toll on.
5. **Halt.** The sim runs a short halt stage (`haltTicks`, 15 ticks). The app scales its step rate from 1 to 0 across it (about 1.5 s of wall clock, ease-out), the colour drains to full grey, and the 3D view slows its animation clocks (walk cycles, effects, water) by the same factor. No unit is moved, teleported or reset at any point.
6. **Break sheet.** When fully stopped a full-screen sheet slides up from the bottom (no time limit, like forks). Tabs: **Report** (two or three plain-language coach callouts from this Act, ranked by severity, and "this Act" numbers for White and Black side by side: Tempo earned, damage dealt, damage mitigated, piece deaths, Bastions destroyed, obelisks claimed, camps cleared, gambits played; from the second break also Black's held relics, never the one Black took at this break: it is shown when the next Act starts), **Orders** (lanes, **pawns per lane** and build paths for White's pieces; lanes and paths are the same controls as Adjourn, and the lane board lets the Battery lane hold three) and **Relics** (the relic draft, below). The button "Resume — Act N" closes it, and stays locked until a relic is taken (when the draft has offers). If a fork is pending when play stops, the fork sheet shows first. The gambit hand and Field Pawn are inert while stopped.
7. **Resume.** `endAct` runs when the break starts (the old Act's timed objectives close); `enterAct` runs on resume with a full 4:00 clock and its events. The first pawnling wave of the new Act spawns 1 s after resume, so each Act opens with a fresh clash.
8. **AI re-plan.** At each break Black's AI may (75% chance, seeded `ai` stream) move its most beaten piece (at least 2 deaths this Act, ties by lower damage) to the lane that went best for the team, swapping with the steadiest piece there so lanes keep their formation (2 Left / 2 Right / 1 Mid, or 3/1/1 while Battery is held). In headless and AI-vs-AI runs White's AI does the same.
9. **Last Act.** If the Act that reaches 0:00 is the last (`maxPhases`), there is no break: the match ends as a draw as before.

- **Headless runs** (`MatchConfig.pauseForBreak` false, the default) still play pending, tolls and halt in the sim, but the break resolves at once: both AIs re-plan and the next Act starts. The browser game sets `pauseForBreak` so `Match.step` returns 0 on the sheet until the `resumeAct` command.
- **Coach callouts** (rules in `src/sim/callouts.ts`, re-exported by `src/analysis/callouts.ts`) are deterministic rules over the Act report (`Snapshot.act.report`, built in `src/sim/actReport.ts`): a Throne or Bastion lost, a piece dying 2+ times (and to whom), a Tempo gap of 40+, Tempo left unused, a lane losing 1.5+ more pawnlings per wave, a piece with under 10% of the team's piece damage, and a few wins (Bastion taken, enemy piece falling twice). Only rules that are true of the numbers fire.

### Relics (all 23 built 2026-10-11)

At every Act break White drafts one relic (pick 1 of 3, hold up to 3, permanent, effects from the next Act) and Black does the same by an AI rule. The third break-sheet tab is **Relics**: three cards (family colour and seal, one-line effect, the plan it rewards, its counter, and for the tailored card why it was offered), lane or piece chips to aim bound relics, "Let the AI choose", and the relics you hold, which can be re-aimed for free at any later break. Held relics show as a small seal row under each roster (tap for text); Black's new relic stays hidden (sheet and seal row) until the next Act starts, then it is announced. Black's relic text is written for Black: it names Black's Opening ("French Defence's two schools"), not White's, and a Rally relic's "Rally." prefix is dropped because its chip says so. Relic cards fold Rewards and Counter behind a details line on every layout. The full design, the relic list and the numbers are in [RELICS.md](RELICS.md); data in `content/relics.json`, rules in `src/sim/relics.ts` (effects) and `src/sim/draft.ts` (offers, picks, AI). Tier 3 items were renamed **Masterworks** (labels only) so "relic" means this system.

Wave 2 (the other 15) adds relics that are set at the break and then play themselves: **Sealed Move** (a card from your Opening's schools plus a trigger; once per Act it plays on its own for 10 Tempo less, waits 5 s short of Tempo, then lapses), **Pawn Structure** (a pawn quota per lane up to the pawn cap and a Tempo reserve of 0, 20 or 40; auto pawns cost 2 less), **Strong Square** (a banner at the lane's crossing), **Sortie** (a rotation when a Bastion falls below half), and the Tempo and structure relics (Spare Tempo, Compensation, Quiet Move, Pawn Chain, Curtain Wall, Royal Keep, Wing Gambit, Knight's Tour, King's Ransom, Guarded Piece). Four relics are **Rally** (Closed Position, King's Ransom, Compensation, Sortie): they work only while the side is behind, read once at the start of the break. **Battery** changes Orders: with it held a side may field 3/1/1 lanes (three pieces in the bound lane, one in each other); without it lanes are 2 Left / 2 Right / 1 Mid. Taking or aiming Battery moves the pieces for you, and Resume is locked until the lanes are legal. Relic bonuses are bounded: pawn-cap bonuses total at most +2, Pawn Chain at most +12%, lane move speed from relics and cards at most +30%, Tempo cap 130 with Spare Tempo and its Act-start bonus at most +10. Build notes: [RELICS.md](RELICS.md) "Wave 2 build notes".

## Combat feedback (2026-10-10)

Owner-approved. The player is a commander: the decisions happen at setup and at the Act break, so combat feedback exists to help read the board and plan, never to react. It is **information only** (no balance or behaviour change; the sim's positions are identical with or without it) and deliberately quiet: no floating damage numbers. Numbers live in `content/tuning.json` → `feedback`; the sim side is `src/sim/feedback.ts` (hits, death cause, fights, lane momentum) and `src/sim/impact.ts` (gambit measurement); wording is in `src/analysis/feedback.ts`.

1. **Fight verdicts.** A fight is a cluster of pieces in combat (the `inCombat` signal, within `fight.radius` of each other) that holds at least one piece of each side. It ends `fight.endSec` after no such cluster is in combat (with the 1.5 s combat timer, about 3 s after the last blow) and emits `fightEnd`: zone (Left/Mid/Right lane, jungle, or a base), world position, pieces per side, pieces each side **lost**, pawnlings and elite pawns lost per side, Bastion/Throne damage each side took. A fight with no piece lost is a skirmish: no tag. Otherwise a small verdict tag fades in at the fight's position in the 3D view for about 4 s: "Left lane — won 3 for 1" (your kills for your losses), "Mid — lost 0 for 2", "Right lane — even trade, 1 for 1". Open fights are closed when the Act ends and at checkmate.
2. **Why a piece fell.** Each piece keeps its last `death.windowSec` (5 s) of hits (merged per attacker per 0.2 s, at most 64). On death the cause is the first that applies: **burst** (at least `burstFrac` of max health inside `burstSec`), **focus** (at least `focusAttackers` distinct enemy pieces hit it), **out of position** (no allied piece or structure within `isolatedRadius`, or farther than `laneOffMax` from its assigned lane with no ally piece near), **outnumbered** (more enemy pieces than allied pieces, itself included, within `nearRadius`), else **traded**. The `death` event carries `fall` (cause, killer piece, up to three attacking pieces by damage); the piece keeps it while it waits to respawn. Shown as a toast "Your Rook fell — focused by Queen, Knight", and on the fallen piece's roster tile as the killer's icon and the cause word beside the respawn timer.
3. **Gambit impact.** Every played card is measured while it is active (`gambitEnd` event). Only what the sim can attribute is shown: damage turned away by Hold the File and Outpost (computed from the armor bonus), healing by Sanctuary, the multiplier's own share of damage for Pawn Storm, Check, Queen's Gambit (net of the backlash), Siege and Exchange, Bastion damage for Advance, Siege and Pawn Sacrifice, enemy units that reached a Barricade's wall, Tempo drained by Poisoned Pawn. A card with nothing attributable (Regroup, Open File, Castle, Fork) shows how long it ran. Piece kills and losses beside the card's effect are always added. A line shows near the hand for about 3 s when the effect ends ("Outpost — turned away about 286 damage"). The Report keeps a per-card tally for the Act: plays, Tempo spent, result.
4. **Lane momentum.** `Snapshot.momentum` per lane, -1 (Black) to 1 (White): the point where the two pawnling fronts meet (weight 0.5), Bastion health left on each side (0.3) and net piece kills in that lane over the last 30 s (0.2). Drawn as three small tug-of-war bars L / M / R under the Act clock (ivory is White's push, slate Black's; the seam glides, no numbers). The same bars, labelled, open the Report as "Lanes at the bell".

- **One calm lane.** Fight tags, falls and gambit lines share a cap of two at a time, newest wins; none appear while the bell has halted play.
- **Report additions.** "Fights this Act: won 3, lost 2, even 1" with the biggest fight; "How your pieces fell" (causes per piece); the per-card Tempo tally. New coach callouts: "You lost every fight on the Right lane" (two or more decisive fights, none won), "You won every fight on …", and per piece with a cause twice or more: "Your Bishop died 3× out of position — consider moving it Mid" (the lane where White is strongest at the bell), burst, focused and outnumbered variants. A cause callout replaces the plain "died N×" one for that piece.

## Combat spacing and AI judgement (2026-10-11)

Owner reports: fights read as one blob; pieces chased into Bastions at low health, took 2v1s and did not run when hurt. Numbers are in `content/tuning.json` → `spacing` and `judgement`; code in `src/sim/spacing.ts`, `src/sim/ai/judgement.ts`, `src/sim/behavior.ts` and `src/sim/collision.ts`. All deterministic (no random draws).

**Spacing**

- **Attack slots.** Every tick, each attacker within reach of its target plus `approach` (90) gets its own slot on a ring around the target: melee attackers (reach up to `meleeMaxRange` 50) just inside their reach (`meleeInset` 5), ranged attackers at a **standoff** of `rangedFrac` (85%) of their reach. One team's attackers on one target form a fan with a gap between bodies (`meleeGap` 3, `rangedGap` 10), laid out in the order they stand around the target so nobody crosses it, centred between where they already are and their own base (`sideBias` 0.6). Two sides fighting each other form two facing lines. A slot inside a wall falls back to the attacker's own bearing. Attackers walk straight at a far target and into their slot near it; between blows a unit in reach eases into its slot (`driftSpeed` 0.6, if at least `driftMin` 3 away).
- **Personal space.** While either of two teammates fights (has a target or was hit in the last 1.5 s), their bodies keep an extra margin (`combatSpace`: piece 3, pawn 2, pawnling 1.5).
- **Knockback.** A piece's hit worth at least `knockback.minFrac` (8%) of the victim's max health nudges a piece, pawn or pawnling straight away from the attacker by `perFrac` × that share, at most `max` (6) units in all per tick. The nudge is queued and applied with the body collisions, only along a clear walkable line (never through walls). The `damage` event carries `kb` (the distance) when it happens.
- **Path followers route around walls** back to their path (a pawnling pulled into the jungle by a chase used to get stuck on a cliff).

**Judgement (pieces)**

- **Retreat line by role** (`retreatHp`): King 15%, Queen 12%, Rook 10%, Bishop 18%, Knight 12% (+12 points when wary). Below it, with any enemy piece, structure in reach or stronger pawns near, a piece **breaks off** (flee) unless a kill is sure, walks home along its lane and hits back only at what is already in reach (a ranged piece kites). It turns back only once `retreatExitHp` (12 points) above the line, or when no enemy is near.
- **Odds.** The local power ratio (allies vs enemies within the fight radius; pieces, pawns, pawnlings and structures, an enemy structure busy with pawns at `busyStructure` 35%) below `badOdds` (0.45) means flee, whatever the temperament: an even 2v1 is never taken. Exception: a **sure kill** (the target falls to the damage that can reach it within `finishSec`, 1.5 s).
- **Flee hysteresis.** A flight lasts at least `fleeMinSec` (2 s) and ends only when the odds clear the hold line and the bad-odds line by `fleeExit` (×1.3). An outmatched piece that is not hurt (45% health or more) **falls back** to just behind the nearest own Bastion of its lane, or its Throne (goal `regroup`, walked down its lane), instead of going home. (A first version picked any lane's structure and a cross-map path, which pulled fights into Mid: hero damage in Mid 52% vs 25% before; now 38%.)
- **Tower dives.** A piece never follows an enemy piece into enemy Bastion or Throne range (plus `diveMargin` 30), nor chases one that would reach that cover before it is caught, unless it has at least `diveHp` (60%) health, the structure is shooting a pawn or pawnling, and the kill is sure. Hunts skip a piece sheltering under its own structure.
- **Running down the hurt.** A piece keeps chasing an enemy piece below `chaseHurtHp` (35%) up to `chaseHurt` (×1.8) its usual leash, dive rules still applying. Goal scoring treats enemy pieces that are recalling or walking home hurt as out of play (pushes and sieges start when they are away).
- **Pacing.** Pieces now die much less often (about 28 kills per match instead of 55), so the Throne has 3800 health (was 6800) and respawns are longer (18 s + 6 s per Act + 0.12 s per second into the Act, at most 70 s; was 10 / 4 / 0.1 / 60). Results in [BALANCE-2026-10-11.md](BALANCE-2026-10-11.md) "Combat spacing and AI judgement".
- **Fair turn order.** Units act in a sweep that starts at `tick % n` and now runs forward on even ticks and backward on odd ones (`turnIndex` in `src/sim/ctx.ts`; also used by `tickUnitState`). The old forward-only sweep let White (whose units are made first) act first in almost every tick; with knockback and judgement deciding mid-sweep that alone gave White about 59% of wins (Black-first sweep: the bias flipped).
- **Snapshot:** `SnapUnit.engage` (pieces: `fight`, `hold`, `flee`) so the view can mark a piece breaking off.
- **Check:** `npm run combat-check -- --matches 200 --seed 29000` (`tools/combat-check.ts`) reports stuck units (wanting to move but standing still for more than 10 s outside combat and base), spacing (blob share, gap to the nearest teammate, melee attackers on their own side) and judgement (deaths in tower range, low-health fighting in tower range, causes, fight/flee flip-flops).

## Interface

Mobile first (portrait 390×844, landscape 844×390, desktop). The 3D island stays; the HUD sits in the corners.

- **Setup board:** Opening picker (blurbs wrap to three lines), five piece cards (path toggle; no style yet; each piece starts on its natural path, so the Queen, "The Carry", starts on Offense, the King and Rook on Defense, the Bishop on Utility, the Knight on Offense) and three lane slots. One "Begin" button.
- **Match intro:** after Begin the sim waits (app only, the sim is unaware) while a full-screen **versus card** shows over the dimmed board, about 6.7 s in all (4 s with reduced motion). Header: White's Opening against Black's ("Italian Game vs French Defence", each with its two school marks, or "Balanced"). Below it one column per lane, **Left · Mid · Right**, split by divider lines; **Black's pieces fill the top row and White's the bottom row**, so each piece faces its lane opponent across the middle (Left and Right hold two pieces per side, Mid one). Each piece is a **portrait of its own 3D model** in the look in play (the Tournament Table's low-poly figure in the chosen variant, or the old look's humanoid), drawn once offscreen by `src/render/portraits.ts` and cached, with its name and role under it; before Rank 4 pieces have no style, so the portraits show the generic piece in team colours (a flat glyph stands in if WebGL is missing). Black's side uses the HUD's slate, White's ivory and brass. Timeline (ms after the clock starts): header fades in 0–600; all ten pieces fade and settle in together 300–1500 (White rises 22 px, Black settles down 22 px); dividers draw 800–1700, lane names fade in 1000–1700; hold until 5900; the card dissolves into the board and the HUD fades in 5900–6700. Reduced motion: no movement, one 0.6 s fade in, hold, a 0.5 s fade out at 3.5–4.0 s. The clock starts when the 3D view has drawn its first frame and the portraits are ready (the scene can take seconds to build on a slow phone), with a longest wait of 15 s, and at once if WebGL is missing. A tap anywhere (ignored in the first 400 ms), Skip or Escape ends it at once and normal camera control returns; behind the card the camera sits in its whole-board frame (there is no camera tour any more). `?intro=off` disables it (end-to-end tests).
- **Black gambit banner:** when Black plays a gambit a slate banner with the gambit's school mark shows at the top for about 3 s ("Black played Barricade on Left lane", "Black played Check on your Knight", "Black played Queen's Gambit"). One shows at a time, up to three wait; White's own plays show nothing.
- **Live HUD (calm):** one slim top row — Act clock and score, a cycling speed chip (1×, 2×, 4×, 8×, paused), a cycling camera button (**Board** / Auto / Follow / Free) and **Adjourn**; under the clock a **lane strip** of three tappable chips (L / M / R, each with its momentum bar); both rosters in the side columns (portrait, health ring, lane tag, rank **numeral**, and the **style emblem**, for Black too); **gambit hand** (cards show name and cost; the reason when unusable; hold a card for its full text), **Tempo meter** and **Field Pawn** (`alive/cap · cost`) at the bottom. Banners and rank chips are small and fade in about 2–3 s; one top band at a time (the auto camera's caption waits while the bell rings, and the three gambit cards stay dim without repeating "play is stopped for the bell"). **Tempo full** (at the cap and unspent for 5 s): the meter glows and a line says "Tempo full — field pawns or play a card". Tapping a piece in the 3D view also opens its piece card.
- **New HUD, "court bar" (2026-10-11):** the default (every look except `?look=grand`), selectable on the legacy Grand Board look with `?hud=new`; `?hud=old` forces the corner HUD above (which stays the default on `?look=grand`). No side rosters. **Top bars:** Act clock with the score (labelled "White pts" / "Black pts": objective points from camps and events), then Pause (the speed chip) / Camera / Adjourn; under them the **capture trays** flank the lane strip (L / M / R chips, still tappable to lean in); under that **Black's five pieces as tokens** (piece icon, health ring, rank, a dimmed ring with × while down; tap one for its piece card) and Black's relic seals. **Capture trays** show the pieces that are down right now: the left tray holds Black pieces White has taken, the right tray White pieces Black has taken, each icon with its respawn timer (× when it will not return). An icon slides in when the piece falls and out when it respawns; with reduced motion it just appears and goes. The score numerals stay the points. **One notice band at a time:** the bell line while the bell is on; otherwise a single notice (Black's gambit, Check, a bell alert, a rank-up) at a time, the rest wait in a short queue (most urgent first, stale after 9 s), and the auto camera's caption shows only when nothing else waits. **Bottom:** your five pieces in **one row** (the same tiles as the old roster: portrait, health and combat ring, lane tag, rank, style emblem, name, killer and cause plus a respawn timer when down; tap to follow, tap again or hold for the card) with your relic seals under it (popover opens upward), and above it the **gambit drawer**. Collapsed, the drawer is one slim bar: a **Gambits** toggle with the number of playable cards, the Tempo meter and Field Pawn; the Tempo-full nudge floats just above it. Tapping the toggle or swiping the bar up opens it: the hand (long-press for the full card; each card's name has the whole top line with the cost, the school and piece marks sit below it, so no name is cut; expiry bars) rises above the bar over the board, and the bar never moves. Starting an aim folds the drawer away (the aim tray, toasts and fall lines float where the hand was); opening a piece card closes it and vice versa. Touch targets are at least 44 px (relic seals and lane chips included).
  - **Shapes.** `stack` (portrait, and any window narrower than 1.3 : 1): the three top rows above, the drawer bar over the row of five tiles at the bottom. `side` (landscape phone, desktop): one slim top row (clock, score, trays, lanes, Black's tokens, controls; the seals of Black hang under it), your five pieces as a column down the **left edge**, the drawer bottom-right; the board keeps the full height, since the diamond board leaves the sides and corners free. Desktop (1440×900) scales the HUD about 1.3×.
  - **Room taken, for the camera.** The page root gets CSS custom properties in px, updated on resize and layout changes: `--hud-top` (bottom edge of the top bars) and `--hud-bottom` (height of the collapsed bottom stack; opening the drawer changes nothing; it grows by the seal row once a relic is held). In the `side` shape `--hud-left` is the width of your column and `--hud-bottom` is the collapsed drawer's footprint (its bar's height plus margin, measured from the bar's top edge to the screen bottom), so the camera frames the board clear of the bottom-right drawer; `--hud-right` is always 0. The vars are removed when the HUD goes away.
- **Camera (2026-10-11):** the default is **Board**, a fixed war-table view of the whole board (the old wide shot, held: portrait with White at the bottom, landscape with the bases left and right). **Tap a lane** in the 3D view (or its chip in the lane strip) to lean in (about 1.9× on that lane); tap the same lane again, a spot off the lanes, its chip, or press Escape to sit back; another lane switches. Pieces keep their card on tap. The camera button also offers **Auto** (the broadcast director, unchanged), **Follow** (tap a roster portrait; tap again or hold for the **piece card**) and **Free** (never closer than 220 units). The fork sheet still follows the choosing piece and then restores the old camera. Reverses "auto camera by default".
- **Readability (2026-10-11):** pieces are enlarged on far shots (boost up to 2.5×, from 1200 units of distance); rank badges hide on a piece shorter than 20 px, style emblems below 34 px, and badges are never bigger than half the piece (a pending fork always keeps its badge); every piece stands on a brass (White) or silver (Black) base rim over a dark disc; roads are a mid-tone sand marble so ivory pieces stand out; courts have lower-contrast checkers and the garden is greyer; Bastions are square keeps with merlons, a long banner and a team ring, no longer like the Rook's round tower; "Bell pending" drains the board to 50% colour (`bell.pendingSaturation`).
- **Sound (2026-10-11):** a small set made with the Web Audio API (no files, `src/ui/sound.ts`): three **bell tolls** (low brass, each louder; the loudest sound), a soft **clock tick** on each of the last 5 seconds before the bell, a wooden **clack** when a piece falls (not at 4× or 8×; at most one per 90 ms), a **brass chime** when a relic is taken or a fork is chosen, a felt **thud** when White plays a gambit, and a dry **tap** on every control. Default **on** at a modest level. Browsers allow audio only after a tap or key, so nothing plays before the first one. A **Sound on / off** switch sits on the Title and in Adjourn; the choice is kept in localStorage (`automoba.sound`, read and written in try/catch). Visual ticks and pulses stay.
- **Fork sheet (pauses the game):** a bottom sheet on phones, docked right in landscape, bottom-centre on desktop. One fork at a time: piece, style, "Rank 4 · Choose a path", both options with full text and an Offense/Defense/Utility leaning tag, "N more waiting", and **Let the AI choose**. The camera follows the choosing piece and is restored afterwards.
- **Act break sheet (stops the game):** a full-screen sheet (content centred, max 720 px wide) with Report, Orders (lanes, pawns per lane, paths) and Relics tabs and a big "Resume — Act N" button (locked until a relic is taken); works at 390×844 portrait and on landscape phones. The Report also holds Lanes at the bell, Fights, How your pieces fell and the gambit tally. Details in "Act break" and "Combat feedback".
- **Combat feedback (live):** a lane momentum strip (three small tappable bars) under the Act clock; fight verdict tags pinned to the fight in the 3D view; a line above the hand for falls ("Your Rook fell — focused by Queen, Knight") and for what a gambit did; a fallen piece's roster tile shows its killer's icon and the cause. At most two of these show at once. Details in "Combat feedback".
- **Piece card:** piece and team, style name and description, path, lane, kills/deaths, rank pips with the next rank or fork, forks taken, current items.
- **Gambit targeting:** tap a card. Lane cards show three big Left / Mid / Right buttons; point and enemy cards are aimed by tapping the 3D view (ground pick or piece pick); a Cancel chip backs out.
- **Adjourn panel:** paused. Lanes (move pieces between lanes), paths, the **Armory** (each piece's items and next buy, read-only), mini scoreboard, the Sound switch. Resume.
- **End report:** a horizontal pager. The front page is the **Result splash** (Checkmate banner, both team scoreboards, MVP, award chips, team totals, New match / Same seed); swipe or use the tab bar for Economy, Combat, Objectives, Pieces, Replay and Log, which hold the graphs (chart colours come from the interface palette: slate, copper, baize, brass, bone, periwinkle and clock red; the Replay legend no longer lists recalls). Data from `buildSummary` (`src/analysis/summary.ts`); factual only, no advice.
  - **Damage mitigated** (2026-10-10): damage a piece did not take, counted where damage is applied (`dealDamage`): the cut from armor or resist and any damage-taken multiplier below 1 (Sanctuary, Closed Position, Guarded Piece and the like), plus what shields absorbed. Overkill is not counted, a multiplier above 1 (Check) counts as nothing, and only pieces are tracked. It rides on the `damage` event (`mitigated`). The report has a "Mit" column in each scoreboard, a Mitigated team total, an **Iron Wall** award (most mitigated), a third bar in the Combat page's taken/healing chart and a "Damage mitigated over time" chart (10 s samples); the Pieces page shows it per piece. Not part of the MVP score.
- Cut: draft, upgrade cards, between-phase shop, shop pins and suggestion queue, auto-buy and Farm toggles, recall button, curse and event prompts (the AI decides curses for both teams).

## Look: "Tournament Table", variant c "Spotlight Arena" (default since 2026-10-11)

The chess branch drops the xxxHolic and Wonderland dressing (violet ink, seal-red stamps, kanji, butterflies, ritual rings, mushrooms, tea-party and rose-garden discs). The default look is the **Tournament Table**: one real chessboard on a table in a black hall, seen from a fixed war-table camera, with low-poly humanoid pieces. Full spec, palettes, silhouettes, scale rules and relief heights: [LOOK-TABLE-2026-10-11.md](LOOK-TABLE-2026-10-11.md); code in `src/render/table/`.

**URL switches** (all optional; no params = variant c, its own framing, new HUD):

- `?variant=a|b` picks Tournament Night or Club Daylight instead of c. `?frame=square|diamond` overrides the framing (c is a diamond: camera behind White's corner; b is a square).
- `?look=grand` is the old Grand Board garden look (legacy, comparison only, to be deleted). It draws with the old broadcast view and keeps the old corner HUD (`?hud=new` still forces the new one there).
- `?hud=old` forces the old corner HUD on the table look; `?hud=new` forces the court-bar HUD anywhere.

**Variant c, Spotlight Arena:** a black hall with near-black slate squares (#3b4047 / #2b2f35) and graphite-teal lane felt, lit by a spotlight. White is ivory with a glowing gold contour and rim light; Black is gunmetal with a glowing cyan contour and strong cyan rim; each piece stands on an additive team ring (gold or cyan). Portrait tilt 54°. The ground stays in one dark value band so the pieces own the extremes and read at phone scale.

**Interface palette** (tokens in `src/ui/css/tokens.css`, unchanged):

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
- **Type:** the serif small caps, with chess notation as quiet decoration (a–h and 1–8 on the board frame, algebraic notation in the log where it fits). The **Act timer** reads as a chess clock; the score as captured material.
- Contrast >= 5.7:1 for text; tap targets >= 40 px (44 px in the new HUD).

**3D board:**

- One 8x8 chessboard on a table, framed in walnut with a–h / 1–8 notation. Lanes are felt runners edged in brass; the squares between them stand up as terraces, bases are two-tier daises, jungle courts are stepped pits under iron gates when sealed, Bastions stand on raised brass-edged tiles. The relief is view only (units sample the same heights); the heights are listed in the look doc.
- Pieces are chunky, faceted **humanoids** (flat-shaded low poly) at miniature scale, each piece and style with its own silhouette and gear; pawns are armoured pawn soldiers and pawnlings small pawn figures. Every piece and pawn carries a team contour and a team base ring. Pieces keep their emblems and badges; badges never outgrow the piece and hide when it is small.
- The camera is fixed over the whole board (portrait: White at the bottom; landscape and desktop: White on the left), fitted into the space the HUD leaves free. Tapping a lane leans in; while leaned in, drag slides along the lane and pinch or wheel zooms (see "Camera" under Interface).

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
- Units have body radii and push each other apart (`collision` in `content/tuning.json`; masses piece 3, pawn 2, pawnling 1, neutral 4). Bastions, Thrones, obelisks and the Keeper never move and push others out. Teammates in a fight keep extra personal space; see "Combat spacing and AI judgement".
