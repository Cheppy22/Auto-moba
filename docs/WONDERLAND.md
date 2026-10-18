# Wonderland blend spec (2026-10-07)

Approved by Cheppy on 2026-10-07: **medium blend**, **adopt the Red Queen vs. White Queen framing**, and the change table as proposed. This file is the hand-off spec for implementation (Sonnet). Game numbers don't change unless stated; it is mostly names, flavor text and art built from code.

## Rules

- **Sources:** Lewis Carroll's two Alice books and John Tenniel's original illustrations (public domain) only.
  - No Disney or Burton material: no names like Absolem, Tarrant Hightopp, Mirana or Iracebeth, no pink-and-purple striped Cheshire Cat, no Disney costume designs.
  - xxxHolic stays "inspired by": no CLAMP character names.
- **Medium blend:** the setting stays the occult pocket dimension. Wonderland is the newest realm it pulls from, and the frame that holds it together. 10 of the 14 heroes stay as they are.
- **Colors:** the Mind/Body/Soul hues, brass, seal red, warm white for true damage and the team colors stay locked. Team A stays teal and Team B stays red. White isn't usable for Team A because warm white already means true damage.
- **Internal ids:** renamed heroes get new ids (see below). Lanes, `guardian`, `tower` and `minion` keep their internal names; only the display text changes.

## Framing: the board

- The pocket dimension is a **Looking-Glass chessboard** in the back room of a wish-shop. Everyone who falls down the rabbit hole made a wish, and the price is to serve as a piece in the game between the **White Queen** and the **Red Queen**.
- **Team A (yours) is the White Court; Team B is the Red Court.** Interface text keeps "your team" and "the enemy" where those are clearer. Court names appear on the title screen, the draft, the phase report header and the end screen.
- **Chess pieces:**
  - The guardian becomes the **King** (White King, Red King). This applies to display text everywhere: HUD, reports, event log, codex and pressure events.
  - Minions are drawn as **pawns**.
  - Towers stay stone lanterns, which keeps an xxxHolic anchor.
- **Win:** destroying the enemy King is **Checkmate**, shown on the end screen as "Checkmate: the White Court wins" (or the Red Court).
- **Pressure event phase 7:** "Restless Guardians" becomes **"The Kings Wake"** (description: "Both Kings leave their bases and fight in the lanes."). Same rule, `roamingGuardians`.
- **Keeper:** becomes **the Cheshire Keeper**. It appears grin-first, fades out when it moves each phase, and its map label is "Cheshire". The art is a crescent grin with two eyes in brass and violet (a plain Tenniel tabby, never stripes). Shop and stock behavior are unchanged.

## Heroes: 4 reskins

Kits, numbers, dispositions, personalities and build lists don't change. Rename the id, the file names in `content/heroes/` and `content/upgrades/`, and every reference (tests, tools, docs).

| Old (id)                                         | New id        | Name and title                                   | Blurb                                                                                 | Abilities (old → new)                                                                                                                                 | Sigil glyph      |
| ------------------------------------------------ | ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Last Train (`revenant`), attacker                | `rabbit`      | The White Rabbit, Herald Who Is Always Late      | A herald in a waistcoat, late for the same appointment for a hundred and fifty years. | Rail Dash → **I'm Late!** · Third Rail → **Pocket-Watch Strike** · Last Whistle → **No Time to Say Hello** · Express Service → **The Appointed Hour** | `watch` (new)    |
| Hatsu, the Rickshaw Ghost (`rickshaw`), farmer   | `hatter`      | The Hatter, Host of the Six O'Clock Table        | He quarrelled with Time, so it is always six o'clock and always tea time.             | Fare Flame → **Scalding Pour** · Ghost-Lantern Field → **Endless Table** · Wheel of Fog → **Move Down!** · Final Fare → **Six O'Clock Forever**       | `teacup` (new)   |
| Ashen Smelter (`smelter`), attacker              | `queen`       | The Queen of Hearts, Sovereign of the Card Court | A playing-card queen with one answer to every difficulty.                             | Slag Strike → **Flamingo Mallet** · Bellows Shield → **Card Guard** · Furnace Roar → **Off With Their Heads!** · Molten Ritual → **Royal Temper**     | `heart` (new)    |
| The Hollow Cartographer (`cartographer`), farmer | `caterpillar` | The Caterpillar, Sage of the Mushroom            | A large blue caterpillar on a mushroom, smoking a hookah and asking who you are.      | Meridian Line → **Who Are You?** · Fold the Map → **Chrysalis** · Hollow Ink → **Hookah Haze** · Atlas Collapse → **One Side Smaller**                | `mushroom` (new) |

- Rewrite ability texts and the hero's upgrade names and flavor in the new voice; keep every number and markup token.
- `era` field: "Looking-Glass" for all four.
- Sigil hues: rabbit 45 (watch gold), hatter 160, queen 350, caterpillar 225. Nudge any that clash with a remaining hero's hue.
- Add the four glyphs to `SigilSpec['glyph']` and `drawGlyph` in `src/render/sigils.ts`: a pocket watch, a teacup, a heart and a mushroom. Line art in the same stroke style as the existing glyphs.
- The Queen of Hearts is a card queen, not a chess queen, so she can be drafted by either court.

## Biomes: 2 new (data only)

Copy the stat tiers of an existing biome so camp power doesn't drift. Both join the random biome pool; the mirrored pairing rule is unchanged.

| Id         | Name                | Palette (ground / accent / glow)  | Camps (small ×2 / medium / elite)               | Camp reward theme                    | Stat tiers copied from |
| ---------- | ------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------------ | ---------------------- |
| `teaparty` | Tea Party Glade     | `#2a2018` / `#c98a4a` / `#f3d29a` | Dormice / March Hare / The Stopped Clock        | Attack speed buff (time runs faster) | `station`              |
| `roses`    | Croquet Rose Garden | `#251418` / `#c0404e` / `#f08a96` | Card Gardeners / Flamingo / The Knave of Hearts | Blade damage buff                    | `foundry`              |

Blurbs:

- Tea Party Glade: "A long table laid for tea that never ends. Camps here quicken your hands."
- Croquet Rose Garden: "White roses painted red, hedgehogs for balls. Camps here sharpen your blade."

## Jungle events: 2 new (reuse existing families)

| Id               | Family | Name                 | What happens                                                                                                         | Numbers                                                                                                                    |
| ---------------- | ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `unbirthday_tea` | `well` | Unbirthday Tea Party | A tea table appears. Hold it with no enemy hero near for 8 s and your team gets an unbirthday present.               | Same as Wishing Well except buffs `atkSpeed ×1.12` and `moveSpeed ×1.06` for 90 s, 1 point. Weight 2.                      |
| `jabberwock`     | `oni`  | The Jabberwock       | "Beware the Jabberwock, my son!" An elite with jaws that bite and claws that catch slams the ground after a warning. | Hungry Oni ×1.25 health and slam damage. Rewards 200 to the team and 200 to the killer, 5 points. `fromPhase` 3, weight 1. |

- The well and oni families already support these fields, so no engine code is needed. If a field is missing, stop and report rather than adding engine code.
- Add both to the jungle events table in the source of truth.

## Items

- **The Single Cut → Vorpal Blade.** Its execute rule stays the same; the flavor becomes "One, two! One, two! And through and through." Rename the id to `vorpal_blade` and update the build lists.
- **Two new cursed items, Drink Me and Eat Me,** fitted to the existing cursed-item schema and flaw format ("The price: …"), at the same power as the current cursed items:
  - **Drink Me** (shrink): boon +20% move speed and +15% attack speed; price −15% max health.
  - **Eat Me** (grow): boon +25% max health and +10 armor; price −15% move speed.
- No other renames in this pass.

## Art built from code

Changes to the 2D renderer (`src/render/icons.ts`, `renderer.ts`) and the 3D Broadcast models (`src/render/broadcast/models.ts`):

- **Guardian → King:** a crowned chess-king silhouette in team color, with the existing rage glow.
- **Minion → pawn:** a small chess-pawn silhouette; ranged pawns carry a tiny card.
- **Keeper → Cheshire grin:** it replaces the gold butterfly, with an occasional fade in and out.
- **Base platforms:** a checkerboard floor in ink and lacquer tones (low contrast; must not fight lane readability).
- **Ornaments:** card suits, clock faces and keyholes may appear in UI flourishes (title screen, report header, codex), never in item category colors.

## Docs to update

- **Source of truth:**
  - Identity: setting, plus a one-line note on the board framing.
  - Format and win condition: King and Checkmate.
  - Map: Keeper becomes the Cheshire Keeper.
  - Phases: The Kings Wake.
  - Jungle events table.
  - Look: add card suits, clocks, keyholes and checkerboard.
  - Shelved: remove "lore for why the teams fight".
  - Reversed decisions: add "Why the teams fight is deliberately undecided → White Queen vs. Red Queen chess game".
- **Changelog** entry. Link this spec from the source of truth.

## Order and checks

1. Land after the Broadcast view (it shares `models.ts` and the Keeper and guardian art).
2. Hero ids change the draft order and seeded rolls, so expect golden and determinism fixtures to need regenerating. Regenerate them; don't hand-edit them.
3. Run `npm run check`, `npx playwright test`, and `npm run balance -- --matches 800 --seed 29000 --quiet`, because the new biomes and events change the jungle mix. Update "Last measured" in the source of truth.
