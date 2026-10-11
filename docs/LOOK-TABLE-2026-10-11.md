# Look: "Tournament Table" prototype (2026-10-11)

Status: **prototype for owner sign-off, round 2: three variants to pick from**, behind `?look=table` (`&variant=a|b|c`, default `a`). The default look is unchanged. Built from the critic review ([REVIEW-2026-10-11-design.md](REVIEW-2026-10-11-design.md), "Tournament Table") with one owner change: **pieces stay humanoid** (no Staunton miniatures), fleshed out so every piece and style is distinct.

How to see it: add `?look=table` to the game URL (`&variant=b` or `&variant=c` for the other two). Debug line-up of every style: `?look=table&lineup` (whole-board scale), `&lineup=close` (lean in on White's rows), `&lineup=closeb` (Black's rows). The line-up replaces the match's units in the view only.

## Variants (round 2, 2026-10-11)

Owner feedback on round 1: right direction; show 2–3 variants; make the map bigger on screen; pieces need contrast or contour (their colours blended at distance); then (later the same day) pieces 20–25% smaller, verticality on the map, bigger Bastions and Thrones so the map feels larger. All three variants share the fixes below and differ in mood, palette, contour treatment and camera tilt.

|                            | **a · Tournament Night** (recommended)                                     | **b · Club Daylight**                                          | **c · Spotlight Arena**                                                              |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mood                       | Round 1's walnut hall at night, board pushed darker and greyer             | Bright club room: grey-blue hall, light ash table              | Black hall, near-black slate board under a spotlight                                 |
| Ground                     | Desaturated mid-dark squares #6f675a / #4c463e, deep bottle felt #2c4a43   | Cool grey stone #a3a7aa / #7b8085, mid slate-blue felt #56728e | Slate #3b4047 / #2b2f35, graphite-teal felt #1e2d30, bright brass lane edges         |
| White                      | Ivory, thin **dark ink** contour (1.15 px), **gold base ring**             | Ivory, **heavy dark ink** (2 px), cream base disc              | Ivory, **glowing gold contour** (1.2 px) and gold rim light, additive gold ring      |
| Black                      | Ebony, thin **cobalt contour** (1 px) + cool rim light, **blue base ring** | Ebony, dark ink (1.6 px) + pale rim light, black base disc     | Lifted gunmetal body, **glowing cyan contour** + strong cyan rim, additive cyan ring |
| Portrait tilt              | 48°                                                                        | 40°                                                            | 54°                                                                                  |
| Board on screen at 390×844 | 46% of the screen (47% of its height)                                      | 40% (41%)                                                      | 51% (52%)                                                                            |

Round 1 at 390×844 framed the board in **28% of the screen (30% of its height)**, measured the same way (bounding box of the lanes and bases). Landscape 844×390: round 1 41%, now 42% / 44% / 41% (a / b / c). Desktop 1440×900: round 1 52%, now 61% / 58% / 63%.

- **a** keeps round 1's identity and fixes the blending with three cues that each work alone: value (ivory on mid-dark, ebony lifted by a cobalt edge), a team-coloured ring under every piece and pawn, and an outline in a team colour. It is the calmest read at phone scale. **Recommended.**
- **b** is the "board game box" read: light ground, every piece inked like a printed counter. Clean in daylight and on bright phones; Black reads least strongly of the three on the slate felt, and its tilt is the lowest (smallest board).
- **c** is the loudest and the most readable at a glance (gold against cyan, both glow on near-black), and has the biggest board (steepest tilt), but it drifts from the warm tournament-table identity toward a neon arena, and Black stops being black (gunmetal with cyan edges).

### Shared fixes (every variant)

- **Bigger board:** the camera fits the board inside the new phone HUD's free space: it reads `--hud-top` / `--hud-bottom` (and `--hud-left` / `--hud-right`) from the root element and falls back to 90 px / 150 px in portrait (full width for the board), re-checking once a second. Portrait is width-bound, so the gain comes from a steeper tilt per variant and from fitting the lanes to their centre line plus a piece width (only a sliver of felt at the two outer lane corners can touch the screen edge). Landscape and desktop search the variant's tilt range for the tilt that frames the board biggest.
- **Contour:** inverted-hull outlines on every piece **and** on the instanced pawns and pawnlings, in a per-team colour and a fixed CSS-pixel width; a team base ring (instanced, one draw call) under every piece and pawn; per-team rim light; contact shadows strength per variant.
- **Smaller pieces:** on-screen height is about 78% of round 1 (King 26 px at 390×844, was 33–34); the view corrects the world size for the tilt so the size is the same whatever the screen shape. Pawns, pawnlings and bases follow.
- **Relief (verticality):** lanes are the floor; the chessboard squares between them stand up as raised blocks (a two-height checker, 32 / 42 units, bevelled); bases are two-tier daises (22 / 42); jungle courts are stepped pits (−9 / −18) under their iron gates; every Bastion stands on a raised marble tile (14) edged in brass. View only: units sample the same height grid, so they climb the ramps and step into courts; the sim stays flat. One 150×150 grid mesh with smooth normals carries the painted top (`src/render/table/relief.ts`).
- **Landmarks:** Bastions drawn 1.45× and Thrones 1.4× round 1's size.
- **The sim map is unchanged** (size, lanes, walk shapes): "bigger map" is on screen only.

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

Ramps: blocks bevel up over 46 units from the walkable edge; dais and court steps blend over about 18 units.

## What it is

- One real chessboard on a walnut table in a dark tournament hall, under a **fixed war-table camera** that frames the whole board (portrait: White at the bottom; landscape and desktop: White on the left).
- Lanes are **felt runners edged in brass** over an 8×8 board in mid tones; jungle courts are **recessed squares** (iron gates while closed); bases are brass-ringed marble medallions; notation a–h / 1–8 on the frame; LEFT / MID / RIGHT painted at White's lane mouths.
- Pieces are **chunky, faceted humanoids** (flat-shaded low poly, in the spirit of Absolver and Risk of Rain 2) at **miniature scale**, on round bases with a team-metal rim and a style-coloured top, over a team-coloured ring.
- **Follow** (camera button or portrait tap) leans in on the followed piece (about 2.4×); Auto and Free show the whole board.

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

Round 2, variant `a` (fixed whole-board view, seed 42, 0:40 into Act 1, CSS px foot to crown): 390×844 King 26, Queen 25, Bishop 23, Knight 22, Rook 20, pawn 11, pawnling 7.3; 844×390 King 27–30, pawn 11–14; 1440×900 King 54, pawn 22–23. Variants `b` and `c` measure within about a pixel of `a` (King 24–25 px at 390×844). Board box with `window.__tvBoard()` in dev.

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

## Performance

Round 2 (phone viewport, big fight): 89–121 draw calls and about 73k triangles; the relief grid is about 45k of them in one draw call, the pawn outlines add 6 calls and the base rings 1. Still no per-frame allocations; not yet profiled on a real phone.

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
6. Retire or keep the old view (`src/render/broadcast`), and move the line-up to a dev-only route.
