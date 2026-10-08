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
| Between-phase screens     | Cut. The match runs continuously ("Doctrine and Gambits" below).                                                                                               |
| Level-ups                 | Automatic **Ranks 1–8**, plus two **fork** choices (Rank 4 and 8). **The game pauses for a fork** until the player chooses. Rank is easy to read on units.     |
| Gambits                   | A **random hand** of orders, for replayability.                                                                                                                |
| Jungle shops              | Stay.                                                                                                                                                          |

## Match flow

1. **Title → Setup board.** For each of White's five pieces the player picks a **starting style** (3 per piece) and a **build path** (Offense, Defense, Utility), then assigns lanes: 2 Left, 2 Right, 1 Mid. Everything is pre-filled with sensible defaults, so "Begin" works immediately. Black's setup is picked by the AI (seeded) and shown on the enemy roster once the match starts.
2. **Live, continuously.** No pause screens. Internally the match still runs in **Acts** of 240 s (the old phases): Acts open jungle clearings, move the Keeper, schedule obelisks and events, and switch on pressure events. An Act change shows a banner ("Act 3") and never stops play.
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
- **Forks at Rank 4 and 8:** two options from the style. **When a White piece reaches a fork rank the match pauses** (the sim stops stepping) and a fork sheet lists every pending White fork; play resumes when all are answered. There is no timeout for the player; a **"Let the AI choose"** button picks for all of them. Black's forks are picked by the AI at once. In headless runs (no player) White's forks resolve like Black's after `ranks.forkSec`.
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

## Interface

Mobile first (portrait 390×844, landscape 844×390, desktop). The 3D island stays; the HUD sits in the corners.

- **Setup board:** five piece cards (style picker, path toggle) and three lane slots to drop them in. One "Begin" button.
- **Live HUD:** Act clock and score (top); White's roster with rank pips, health and lane (left column); Black's roster (right); **gambit hand + Tempo meter + Field Pawn button** (pawn count / cap; tap, then pick Left / Mid / Right) (bottom); **fork sheet** that pauses the game (see Ranks and forks); **Adjourn** button (top right, next to speed). Camera Auto / Follow (tap a roster portrait) / Free.
- **Gambit targeting:** tap a card. Lane cards show three big Left / Mid / Right buttons; point and enemy cards are aimed by tapping the 3D view (ground pick or piece pick); a Cancel chip backs out.
- **Adjourn panel:** paused. Lanes (move pieces between lanes), paths, the **Armory** (each piece's items and next buy, read-only), mini scoreboard. Resume.
- **End screen:** "Checkmate: White wins" (or Black) and the existing report.
- Cut: draft, upgrade cards, between-phase shop, shop pins and suggestion queue, auto-buy and Farm toggles, recall button, curse and event prompts (the AI decides curses for both teams).

## Look

- White (ivory, pearl, brass) vs Black (ebony, obsidian, silver). The island ground becomes a chessboard: ivory and ebony tile halves, raised roads, the bases as throne daises. Jungle biomes and events stay as they are.
- Pieces are characters shaped like chess pieces (crowned King, Queen with a coronet, tower-bodied Rook, mitred Bishop, horse-headed Knight), each with a style accent. Pawns are armoured pawn soldiers; pawnlings are smaller, simpler pawn figures.

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

// MatchConfig
{ seed: number; setup?: { A?: SetupEntry[]; B?: SetupEntry[] }; autoGambits?: { A: boolean; B: boolean } }

// Snapshot additions
SnapUnit: piece: PieceId | null; style: string | null; path: Path | null; rank: number; forkPending: boolean; pawn: boolean; lane: LaneId | null;
Snapshot: act: number; tempo: Record<PlayTeam, number>; hand: SnapGambit[];   // White's hand
          pawns: Record<PlayTeam, { alive: number; cap: number; cost: number }>;
          forks: SnapFork[];                                                    // White's pending forks
          check: Record<PlayTeam, boolean>; throneDown: Record<PlayTeam, boolean>;
SnapGambit { slot; cardId; name; desc; cost; target: 'lane' | 'point' | 'enemy' | 'none'; piece: PieceId | null; usable; reason; ticksLeft; refillTicks: number | null }
SnapFork   { heroId; piece: PieceId; rank: 4 | 8; options: { id; name; desc }[]; ticksLeft }

// 3D view (src/render/broadcast/scene.ts)
BroadcastView.pickGround(clientX, clientY): { x: number; y: number } | null   // sim coords
BroadcastView.pickUnit(clientX, clientY): number | null                        // unit id
```

New events: `rankUp { id, rank, bonus }`, `fork { id, rank, optionId, auto }`, `gambit { team, cardId, lane?, x?, y?, targetId? }`, `check { team }`, `throneDown { team }`, `checkmate { winner }`.

## Visual distinction and a calmer screen (owner feedback, 2026-10-08)

- **Style must be readable on sight, for both teams.** Every one of the 15 styles gets: a distinct **emblem** (a simple glyph in a style colour) shown next to the rank badge on the piece's bar, on the roster portraits of **both** teams and in tooltips; a **signature accessory/prop** on the 3D piece (different silhouette, not just a colour); and a style-coloured ground ring. Tapping any piece or roster portrait (including Black's) opens a small **piece card**: style name and one-line description, path, rank, items.
- **Calm HUD:** the screen is cluttered at all times, so the default view shows less: full-health pawnlings and pawns have no health bars; pieces keep a thin bar with emblem and rank; gambit cards show name and cost only (full text on tap or hold); roster cells drop the 8 rank pips (numeral only); speed and camera controls collapse to compact controls; banners and chips stack and fade faster; scenery and effects stay out of the lanes. Information appears when it matters (damaged, selected, fork pending, low health) rather than all the time.
