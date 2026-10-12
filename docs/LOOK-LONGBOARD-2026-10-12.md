# Look: the Long Board's visual language (2026-10-12)

Status: built behind `?map=long`. `?mapstyle=a` (the default) and `?mapstyle=b` both follow the rules below; `?mapstyle=old` shows the phase-3 look for comparison. The square board is unchanged. Code: `src/render/table/longlook.ts` (styles, painter, gate arches and hedges), `relief.ts` (`LongRelief` with one flat lip), `board.ts`, `fx.ts` (eye badge).

Owner feedback it answers: "Map size is good, but the visual flair lacks polish. There isn't a lot of visual cohesion or design logic around the symbols and places on the map. Side Roads fail to mesh with farms."

## The rules: one meaning per look

| Look                                                  | Means                                | Used for                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Felt**                                              | A lane: waves and Bastions walk here | The three lanes only                                                                                                                           |
| **Flagstone** (one stone, one running-bond pattern)   | Any other walkable ground            | River Road, Sally Paths and their spurs, verges, gate paths to the clearings, the Squares, the grove yards (a darker course of the same stone) |
| **Stone lip** (one pale coping colour)                | A change of height                   | The kerb round every walkable edge, the terrace cliff tops, the treads across the 12 lane ramps, Bastion plinths, gate arches                  |
| **Brass medallion** (ring + round badge with an icon) | A place you can use or fight over    | Clearings (paw; a dark cover with a keyhole until they open), shop Squares (gem), the Pit and the Keeper's spots (star), the two bases         |
| **Floor tiles** (calm, low contrast)                  | Dead space: nothing walks here       | Everything between the walkable shapes, one shade per terrace (home terrace lighter)                                                           |
| **Trees, hedges, water**                              | Decoration                           | Only on dead space: pines (and hedges in b) ring the groves, water fills the river band                                                        |

- **Brass is reserved** for medallions, the bases, the frame inlay, notation and lane names. Ramps, kerbs, plinths and paths never use brass.
- **Badges sit on the near edge** of their ring (towards the player), so a camp or a marching wave never hides them.
- **Paths and farms are one route:** wherever a path meets a grove there is a gap in the ring with a stone gate arch, and a paved threshold that widens into the grove (the grove floor is walkable, so the paving shows real ground). The arches are found from the sim's own walkable shapes (wherever a path crosses the grove's edge), so they always match the real gates.
- **Eye badge** (high-ground edge): an ivory eye on a dark round badge with a gold ring, 17 px on a phone (was 11), gently pulsing (still when the player prefers reduced motion).
- **Grove pines** are 15% bigger than in phase 3 in both styles.

## Two styles (same rules, different mood)

|               | **a · Slate garden** (default)              | **b · Lamplit parterre**                                |
| ------------- | ------------------------------------------- | ------------------------------------------------------- |
| Mood          | Cool night, quiet; the lanes and roads glow | Warm lamplight, a formal garden                         |
| Floor tiles   | Blue-grey slate, square, hairline joints    | Dark umber tiles with small inset stones at the corners |
| Lanes         | Teal felt (the table look's)                | Bottle-green card-table felt                            |
| Roads / yards | Pale limestone; yards in moss-green setts   | Honey sandstone; yards in terracotta brick              |
| Grove ring    | Pines (two rows where there is room)        | A clipped hedge with pines behind it                    |
| Water         | Deep blue-teal                              | Ink blue                                                |
