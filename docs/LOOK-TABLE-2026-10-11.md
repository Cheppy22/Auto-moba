# Look: "Tournament Table" prototype (2026-10-11)

Status: **prototype for owner sign-off**, behind `?look=table`. The default look is unchanged. Built from the critic review ([REVIEW-2026-10-11-design.md](REVIEW-2026-10-11-design.md), "Tournament Table") with one owner change: **pieces stay humanoid** (no Staunton miniatures), fleshed out so every piece and style is distinct.

How to see it: add `?look=table` to the game URL. Debug line-up of every style: `?look=table&lineup` (whole-board scale), `&lineup=close` (lean in on White's rows), `&lineup=closeb` (Black's rows). The line-up replaces the match's units in the view only.

## What it is

- One real chessboard on a walnut table in a dark tournament hall, under a **fixed war-table camera** that frames the whole board (portrait: White at the bottom; landscape and desktop: White on the left).
- Lanes are **felt runners edged in brass** over an 8×8 board in mid tones; jungle courts are **recessed squares** (iron gates while closed); bases are brass-ringed marble medallions; notation a–h / 1–8 on the frame; LEFT / MID / RIGHT painted at White's lane mouths.
- Pieces are **chunky, faceted humanoids** (flat-shaded low poly, in the spirit of Absolver and Risk of Rain 2) at **miniature scale**: drawn about 3.3× their old world size, on round bases with a team-metal rim and a style-coloured top.
- **Follow** (camera button or portrait tap) leans in on the followed piece (about 2.4×); Auto and Free show the whole board.

## Palette and materials

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

Fixed whole-board view, seed 42, 0:40 into Act 1 (`window.__tvMeasure()` in dev; CSS px, foot to crown):

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
- Portrait is width-limited (the diamond board is as wide as it is tall), so there is spare height above and below the board: that's where a C2-style HUD (clock and capture trays on top, portraits in a row at the bottom) would go instead of the side columns.

## Motion rules

- Walk: chunky hop-step (body bob on each step, lean into the run, cape trails).
- Attack: **anticipation** (wind-up in the last ~40% of the predicted interval between blows), a 60 ms snap, an 80 ms **impact hold**, then a 0.3 s ease back, with a small squash. Gestures per piece/style: strike, thrust, cast, shoot (bow draw), slam.
- Hit: white flash, knock-back and squash. Capture: the piece **topples backwards**, bounces, slides and sinks (0.9 s) with a burst of faceted chips. Respawn: drops onto the board and squashes on landing.
- Pawns and pawnlings hop and lean (instanced, no limbs); structures darken and redden as they lose health and burst into stone and roof chips when they fall; the camera shakes only on structure falls and Checkmate.

## Performance

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
