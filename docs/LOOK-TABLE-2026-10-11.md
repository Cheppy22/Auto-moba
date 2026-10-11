# Look: "Tournament Table" prototype (2026-10-11)

Status: **variant c, Spotlight Arena, is the default look (owner decision, 2026-10-11)**, replacing the Grand Board garden look. No URL params needed. `?variant=a|b` picks the other variants, `?frame=square|diamond` overrides the framing, `?look=grand` shows the old Grand Board (legacy, comparison only, to be deleted), `?hud=old` forces the old corner HUD. Built from the critic review ([REVIEW-2026-10-11-design.md](REVIEW-2026-10-11-design.md), "Tournament Table") with one owner change: **pieces stay humanoid** (no Staunton miniatures), fleshed out so every piece and style is distinct.

How to see the others: add `?variant=a` or `?variant=b` to the game URL. Debug line-up of every style: `?lineup` (whole-board scale), `?lineup=close` (lean in on White's rows), `?lineup=closeb` (Black's rows). The line-up replaces the match's units in the view only.

## Variants (round 2, 2026-10-11)

Owner feedback on round 1: right direction; show 2–3 variants; make the map bigger on screen; pieces need contrast or contour (their colours blended at distance); pieces 20–25% smaller, verticality on the map, bigger Bastions and Thrones. All three variants share the fixes below and differ in mood, palette, value structure, contour treatment, framing and camera tilt. The owner picked **c** on 2026-10-11 (the table below keeps the comparison).

|                                   | **a · Tournament Night** (recommended)                                                | **b · Club Daylight**                                                                   | **c · Spotlight Arena**                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mood                              | Round 1's walnut hall at night                                                        | Bright club room, light ash table                                                       | Black hall, near-black slate under a spotlight                              |
| Ground (value)                    | Cool taupe checker #75726b / #43413d, deep bottle felt #2c4a43 (all mid-dark)         | Pale grey stone #a3a7aa / #7b8085, slate-blue felt #56728e (light)                      | Slate #3b4047 / #2b2f35, graphite-teal felt #1e2d30 (dark)                  |
| White                             | Ivory with self-light (stays bright in shade), thin dark ink (1.2 px), gold base ring | Ivory, heavy dark ink (2 px), cream base disc                                           | Ivory, glowing gold contour (1.2 px), gold rim light, additive gold ring    |
| Black                             | Ebony, cobalt contour (1.5 px) and cool rim light, blue base ring                     | Ebony, dark ink (1.6 px) and pale rim light, black base disc                            | Gunmetal body, glowing cyan contour and strong cyan rim, additive cyan ring |
| Framing                           | Diamond (camera behind White's corner, White's base bottom centre)                    | **Square** (camera on White's rank-1 edge: White's base bottom-left, the MOBA map view) | Diamond                                                                     |
| Portrait tilt                     | 48°                                                                                   | 64°                                                                                     | 54°                                                                         |
| Board at 390×844 (new HUD)        | 382×407 px: 47% of the screen, 74% of the free band's height                          | 379×343 px: 40%, 62% (but the square fills its box: ~1.4× the diamond's board area)     | 382×442 px: 51%, 80%                                                        |
| Board at 844×390 / 1440×900       | 61% / 72%                                                                             | 43% / 63%                                                                               | 59% / 74%                                                                   |
| King / pawn / pawnling at 390×844 | 25 / 11 / 7 px                                                                        | 24–26 / 9–12 / 6–8 px                                                                   | 24–25 / 10–11 / 7 px                                                        |

Board % = the bounding box of the lanes and bases (`window.__tvBoard()` in dev) over the screen. With the court-bar HUD the free band at 390×844 is 553 px tall (top 155, bottom 136). Round 1 framed the board in 28% of the screen at 390×844, 41% at 844×390 and 52% at 1440×900.

- **a** keeps round 1's identity and separates teams with three cues that each work alone: value (bright ivory on a cool mid-dark ground, ebony lifted by a cobalt edge), a team-coloured ring under every piece and pawn, and a team-coloured outline. Calmest read at phone scale; the terraces read best under its low warm light. **Recommended.**
- **b** is the "board game box": light ground, every piece inked like a printed counter, and the square framing turns the board into the classic MOBA map (Left lane up the left edge, Right lane along the bottom, Mid on the diagonal) with real chess orientation (a–h left to right, rank 1 nearest). The clearest White / Black read of the three; the board is wider than tall, so portrait leaves wood bands above and below, and its steep tilt flattens the relief.
- **c** is the loudest and most readable at a glance (gold against cyan, both glowing on near-black) with the biggest diamond board, but it drifts toward a neon arena and Black stops being black.
- `&frame=square` or `&frame=diamond` overrides any variant's framing (for comparing).

### Shared fixes (every variant)

- **Bigger board:** the camera fits the board inside the HUD's free space. It reads `--hud-top`, `--hud-bottom`, `--hud-left` and `--hud-right` (CSS px on the root element, published by the court-bar HUD) once a second and refits when they change; before they exist it assumes that HUD's usual bands (portrait 155 / 136 px, full width; landscape top 57 and White's column 80 on the left; desktop top 72, left 102). In landscape and desktop the HUD reports the collapsed gambit drawer's footprint as `--hud-bottom` (60 px at 844×390, 73 px at 1440×900), so the near board corner is never under the drawer. Portrait is width-bound: the gain comes from the steeper tilt per variant and from fitting the lanes to their centre line plus a piece width. Landscape and desktop search the variant's tilt range for the tilt that frames the board biggest. The sim map is unchanged.
- **Lane lean-in (QA Q8 fixed):** a tap on a lane or its L / M / R chip leans the table camera in on that lane's middle (about 1.9× closer, the default look's lean), centred in the HUD's free band; tap it again, tap off the lanes, or press Escape to sit back.
- **Lane camera:** while leaned in, a one-finger or mouse drag slides the view along that lane's path (grab-the-board: the point under the finger stays under it, projected on the lane's direction), clamped to the lane's two ends; shift-wheel does the same. Pinch or the mouse wheel zooms between the lean-in distance and a closer limit (0.24 of the whole-board distance, about 4×); zooming out past the lean-in distance sits back to the whole board. Tilt and height stay fixed; the camera eases (faster while a finger is down) and never drifts. A press only pans after 8 px, so taps on pieces and lanes still work. Code: `src/render/table/lanecam.ts`; the view fires `table-sitback` on the canvas and `src/ui/Broadcast.tsx` (one line) clears the lane focus on it.
- **Contour:** inverted-hull outlines on every piece and on the instanced pawns and pawnlings, in a per-team colour and a fixed CSS-pixel width; a team base ring (instanced, one draw call) under every piece and pawn; per-team rim light and self-light; contact shadow strength per variant.
- **Smaller pieces:** about 75–78% of round 1's on-screen height (King 24–26 px at 390×844, was 33–34); the view corrects the world size for the tilt, so the size is the same whatever the screen shape.
- **Relief (verticality):** lanes are the floor; the chessboard squares between them stand up as terraces (a two-height checker, 32 / 42 units) with steep, flat-shaded faceted sides (bevel 22 units); bases are two-tier daises (22 / 42); jungle courts are stepped pits (−9 / −18) under their iron gates; every Bastion stands on a raised marble tile (14) edged in brass. View only: units sample the same heights, so they climb onto the daises and step into the courts. One 150×150 grid mesh (each cell split along its flatter diagonal, so 45° cliffs stay straight both ways) carries the painted top (`src/render/table/relief.ts`, `board.ts`).
- **Landmarks:** Bastions drawn 1.45× and Thrones 1.4× round 1's size; lane names moved clear of White's dais.

### Relief data (for a later high-ground rule)

The relief is visual only today: units walk it as flat ground (the view just lifts them to the surface). All height data lives in `src/render/table/relief.ts`: `RELIEF` (levels), `AREA_HEIGHT` and `Relief.areaAt(simX, simY)` (the named area under a sim point, stepped, no bevels), `Relief.atSim(simX, simY)` (the smooth drawn height). A gameplay proposal can reuse `areaAt` as-is or move it into the sim.

| Area           | Where (sim units)                                                                               | Level (world units, lanes = 0) |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `lane`         | Lane corridors, court paths, shops and Keeper spots (the walk shapes)                           | 0                              |
| `block-high`   | Off-lane board, on squares where file + rank is even                                            | +42                            |
| `block-low`    | Off-lane board, the other squares                                                               | +32                            |
| `dais`         | Base disc, up to the walk radius (225)                                                          | +22                            |
| `dais-inner`   | Inner base tier, radius 112 (spawn and Throne)                                                  | +42                            |
| `bastion-tile` | Square of half side 62 under each Bastion site (lane points at the tower fractions, both sides) | +14                            |
| `court-step`   | Jungle court square (half side 0.92 × court radius), outer ring                                 | −9                             |
| `court-floor`  | Inner court square (58% of that)                                                                | −18                            |
| `frame`        | Outside the 8×8 board                                                                           | 0                              |

Ramps: terraces bevel up over 22 units from the walkable edge; dais and court steps blend over about 18 units. `areaAt` is covered by `tests/tablecam.test.ts`.

## What it is

- One real chessboard on a walnut table in a dark tournament hall, under a **fixed war-table camera** that frames the whole board (portrait: White at the bottom; landscape and desktop: White on the left).
- Lanes are **felt runners edged in brass** over an 8×8 board in mid tones; jungle courts are **recessed squares** (iron gates while closed); bases are brass-ringed marble medallions; notation a–h / 1–8 on the frame; LEFT / MID / RIGHT painted at White's lane mouths.
- Pieces are **chunky, faceted humanoids** (flat-shaded low poly, in the spirit of Absolver and Risk of Rain 2) at **miniature scale**, on round bases with a team-metal rim and a style-coloured top, over a team-coloured ring.
- **Follow** (camera button or portrait tap) leans in on the followed piece (about 2.4×); the Board camera leans in on a tapped lane and pans along it (see "Lane camera" above); Auto and Free show the whole board.

## Palette and materials

The table below is round 1 (variant `a` keeps the hall, frame, brass and team colours; its board and felt are darker and greyer). Every variant's full palette lives in `src/render/table/palette.ts` (`LOOKS`).

| Use                                            | Value                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Hall gradient                                  | #0c0a0b → #2a1d15                                                 |
| Table walnut (lamp pool)                       | #5a3b26 → #0e0a08                                                 |
| Frame walnut / brass inlay                     | #4d311e–#5c3b24 / #7d6232                                         |
| Board squares (mid band)                       | #978466 / #66513b                                                 |
| Lane felt (centre / edge)                      | #4a7a61 / #3d6b54 / #2f5644                                       |
| Brass bead and lane edge                       | #c9a35a                                                           |
| Courts (one step darker)                       | #4b3a2a / #3a2c20                                                 |
| White: body / shade / trim / cloth / rim light | #f2e9d6 / #cdbf9e / brass #c9a35a / #e3d3ae / warm #e8b85a        |
| Black: body / shade / trim / cloth / rim light | #2b2725 / #1b1817 / silver #c3ccd8 / slate #3c4660 / cool #9fb8ff |
| Neutrals (terracotta)                          | #b0714a, eyes #ffd36a                                             |

- Value rule kept: pieces own the extremes (ivory ~90%, ebony ~15%); board and felt stay in the middle band, so White never sits on a cream road.
- Materials: one Phong vertex-colour material with `flatShading` (soft specular, no textures) for everything modelled, plus a fresnel rim (strong and cool on Black so ebony keeps an edge, weak and warm on White) and unlit "glow" vertices for gems, flames and orbs. The board top is one painted canvas texture.
- Light: warm cream hemisphere over walnut bounce, a warm key from White's front-left, a cool back light behind the board. Real shadows on desktop only; blob shadows everywhere.

## Silhouettes (figure units, King = 100)

| Piece    | Height | Silhouette                                                                           |
| -------- | ------ | ------------------------------------------------------------------------------------ |
| King     | 1.00   | Bell robe, ermine mantle, beard, **tall brass cross** on the crown, cape             |
| Queen    | 0.95   | **Widest flared gown**, slim waist, **seven-spike coronet with a ball**              |
| Bishop   | 0.88   | Narrow column robe, **cleft mitre** (two leaves, ball on top), crozier               |
| Knight   | 0.86   | Armoured legs, **horse-head helm with a long muzzle**, ears and a mane crest         |
| Rook     | 0.76   | **Widest body** (block torso, pauldrons), **crenellated tower helm** with visor slit |
| Pawn     | ~0.44  | Armoured pawn soldier: ball helm with crest, kite shield, spear                      |
| Pawnling | ~0.28  | A Staunton pawn on stubby legs (ranged ones wear a cone hat)                         |

Structures never borrow a piece outline: **Bastion** = squat keep under a hipped roof with a tall pennant (no crenels); **Throne** = stepped octagonal dais, tall-backed throne, a giant glowing crown and two banners.

## Styles (one bold colour block + signature gear)

| Style         | Colour    | Gear and shape language                                                                    |
| ------------- | --------- | ------------------------------------------------------------------------------------------ |
| Warlord       | red       | War banner on the back (tallest point of any piece), spiked pauldrons, double axe; angular |
| Sovereign     | gold      | Stand-up collar fan, orb staff, **three shields orbiting**; round, regal                   |
| Usurper       | magenta   | Jagged cloak, spiked collar, curved blade, glowing chalice; jagged                         |
| Regent        | teal      | Star collar, ringed staff, **two orbs orbiting**; round                                    |
| Duelist       | pink      | Sweeping plume, sash, rapier and parrying dagger; thin, pointed                            |
| Huntress      | green     | Hooded cloak, quiver, **longbow**; long vertical arc                                       |
| Bastion       | steel     | **Pavise taller than the rook** with a brass cross, steel helm band; flat, square          |
| Battering Ram | brown     | Curled horns, **battering log carried forward**; horizontal thrust                         |
| Vanguard      | blue      | Long glaive with a pennant, chevron shield, crest fin; diagonal                            |
| Light         | pale gold | **Radiant sun disc behind the head**, lantern crozier; radiant                             |
| Shadow        | violet    | Tattered over-robe, veil, crescent-bladed staff, wisps orbiting; curved                    |
| Zealot        | orange    | **Flame atop the mitre**, steel pauldrons, flaming flail, book; flame shapes               |
| Lancer        | cyan      | **Couched lance** (longest forward reach), vamplate, crest, round shield; long line        |
| Errant        | olive     | Pack and bedroll, greatsword across the back, buckler, hanging lantern; bulky back         |
| Paladin       | pale blue | **Great wings**, winged round shield, warhammer; wide wing shapes                          |

Before Rank 4 a piece wears only team colours (team cloth instead of the style colour, no gear); at Rank 4 it swells and flashes in the style colour as the gear appears.

## Scale rules (measured)

Round 2, variant `a` with the court-bar HUD (fixed whole-board view, seed 42, 0:40 into Act 1, CSS px foot to crown): 390×844 King 25, Queen 24, Bishop 22, Knight 22, Rook 19, pawn 11, pawnling 7; 844×390 King 31, pawn 12–17; 1440×900 King 57, pawn 21–25. Variants `b` and `c` measure within about 1–2 px of `a` (see the variants table). Board box with `window.__tvBoard()` in dev.

Round 1 (prototype):

|                 | 390×844 | 844×390 | 1440×900 |
| --------------- | ------- | ------- | -------- |
| King            | 33–34   | 35–37   | 70–71    |
| Queen           | 29–32   | ~37     | ~70      |
| Bishop / Knight | ~29–30  | 29–38   | 59–68    |
| Rook (wide)     | 25–27   | 30–31   | 56–57    |
| Pawn            | 14.5    | 14.7    | 29       |
| Pawnling        | 9.4     | 9.5     | 19       |

The current look shows the same pieces at about 9–16 px on its default camera at 0:40 in portrait (12–17 px in landscape) and 8–12 px on wide shots, so the table look is about 2.2–2.5× taller on a phone. Badges never outgrow the piece: one rank numeral on the base front (8 px, at most 30% of the piece), style emblems only when leaning in or on the followed piece; health bars are 2.4 px tall and no wider than the piece; buildings show a bar only once damaged.

- Pieces are drawn bigger than their sim footprint, so the view **spreads crowded pieces** a little (visual offset up to 46 units, eased; pushed off Bastions and Thrones). The sim never sees it; picking and effects use the drawn position.
- Portrait is width-limited (the diamond board is as wide as it is tall). Round 2 spends the spare height on a steeper tilt and leaves the top and bottom bands to the phone HUD.

## Motion rules

- Walk: chunky hop-step (body bob on each step, lean into the run, cape trails).
- Attack: **anticipation** (wind-up in the last ~40% of the predicted interval between blows), a 60 ms snap, an 80 ms **impact hold**, then a 0.3 s ease back, with a small squash. Gestures per piece/style: strike, thrust, cast, shoot (bow draw), slam.
- Hit: white flash, knock-back and squash. Capture: the piece **topples backwards**, bounces, slides and sinks (0.9 s) with a burst of faceted chips. Respawn: drops onto the board and squashes on landing.
- Pawns and pawnlings hop and lean (instanced, no limbs); structures darken and redden as they lose health and burst into stone and roof chips when they fall; the camera shakes only on structure falls and Checkmate.

## Effects: combat hits and teleport home (2026-10-11)

Render only (`src/render/table/combatfx.ts`, `view.ts`, `piece.ts`, `fx.ts`); the sim is untouched. Every effect is team-coloured (White gold, Black cyan in variant c), additive, pooled and capped, and costs nothing while idle. Four instanced layers (rings, light columns, slash arcs, streak lines) add four draw calls only while something is on screen.

**Hits (a piece is struck).** The victim reacts when the blow lands: at the swing's snap for melee (60 ms), when the bolt arrives for ranged. Calm by design: no numbers, each effect fades in 0.25-0.5 s, damage-over-time ticks (under 2% of max health, not a basic attack) show nothing.

- **Outline flash:** the victim's contour turns to the attacker's team colour and swells to about 2.1x for 0.26 s (a per-piece width multiplier on the shared ink shader, so one team's piece does not thicken another's).
- **Squash and recoil:** the figure squashes (about 9% shorter, 6% wider), rocks back and is shoved up to 7 units along the line of the blow; strength scales with the hit's share of max health (0.6 to 1.5).
- **Ring pop:** a ring on the floor in the attacker's colour, larger than the team halo so it shows over it. Normal hit 0.3 s; **big hit** (12% of max health or more): bigger ring plus a short light column; **kill:** the largest ring and a taller column (the existing chip burst, flare and camera nudge stay).
- **Melee swings:** a crescent slash sweeps across the victim at chest height (alternating direction) and a 0.2 s tracer line runs attacker to victim. Ranged attacks keep their bolts.
- **Engagement threads:** while two pieces are in combat a faint line on the floor joins each piece to the piece it targets, one lane per side so a duel shows both colours. Hidden when the pieces touch (the slash tells it then). Pieces only (not pawns, pawnlings or structures).
- **Clumps:** the health bars of piled-up pieces are lifted one bar-step at a time (walking front to back on screen) so they never overlap; the decluttering of drawn positions is unchanged.

**Teleport (recall, and any other jump of 220+ units: Castle, Fork).** The view detects the jump in the piece's position, so it needs no event and covers every teleport.

- **Channel (recall in progress, 3 s from `tuning.recall.baseSec`):** a ring closes in on the base (2.7x to 1.3x), a light column grows from knee to above the head, a scan ring climbs the piece twice a second, a facet rises every 0.3 s. Cut short (the sim clears the recall): the ring flashes inward and dies.
- **Departure (0.4 s, held at the spot):** the piece stretches into a thin tall column of light and its base shrinks away; a light column shoots up, two rings flare out, 12 team-coloured facets rise.
- **Arrival (0.45 s at the base):** facets fly in from around the dais and shrink into the piece, a column of light collapses onto it, two rings pulse out across the dais, and the piece condenses out of a thin column (reverse of the departure).
- Total about 0.85 s from the sim's teleport to a settled piece at base.

**Reduced motion** (`prefers-reduced-motion`): no recoil, squash, slashes, ring pops, columns or facets. A hit only flashes the outline; a teleport is one soft ring and a 0.4 s fade out and a 0.45 s fade in (the piece's opacity; the first fade compiles a transparent shader variant once); the channel is a steady ring and column.

**Budget:** rings 40, columns 24, slashes 20, streaks 56, pending hits 32, facets 220 (shared). Nothing allocates per frame (pooled items, reused scratch objects). Dev helpers (dev server only): `window.__tvHit(attackerId, victimId, frac, lethal, melee)`, `window.__tvDt` (fixed effect time per frame) with `window.__tvBudget` (seconds to run, then freeze), `__tvStats()` also returns `fx` (live effects per layer) and `frames`.

## Performance

Round 2 (big fight at 2:02, seed 42): phone 390×844 about 120 draw calls and 76k triangles (the relief grid is 45k of them in one draw call; pawn outlines add 6 calls, base rings 1); desktop 1440×900 with the shadow pass 146 calls and 91k triangles. The lane camera allocates nothing per frame (typed arrays built once, reused scratch objects). Not yet profiled on a real phone (software GL only in the container).

Round 1:

- One draw call (plus an outline) per piece; everything else is instanced: pawnlings, pawns, bases, blob shadows, chips, bolts, buildings and neutrals are one draw call per kind and side. One shared material program for all modelled things.
- Measured: about 78 draw calls and 22k triangles in an early skirmish on a phone viewport; 92 calls and 28k triangles in a late big fight; 117 calls and 45k triangles on desktop with the shadow pass. The board top is one 2048² (phone) or 3072² (desktop) texture; no per-frame allocations in the unit loop.
- Not yet profiled on a real mid-range phone (only software GL in the container).

## What a full rollout still needs

1. ~~HUD: C2 layout for portrait~~ Done (2026-10-11, the court-bar HUD: see CHESS.md "Interface"); capture trays show the pieces that are down, the lane chips lean in.
2. Capture moment: slide fallen pieces into a capture tray at the board edge; reduced-motion fades.
3. Gambit and zone effects re-tuned to the miniature scale (they still use the old sizes), plus faceted versions of the Check crown and flares.
4. Neutral camps and event creatures designed per camp (they are three generic terracotta sizes now); Keeper and obelisks are placeholders.
5. Real-device performance pass, intro tour reframed for the fixed camera, sound pass (wood, felt, brass, clock).
6. Delete the old view (`src/render/broadcast`, reachable as `?look=grand` until then), the old corner HUD, and move the line-up to a dev-only route.
