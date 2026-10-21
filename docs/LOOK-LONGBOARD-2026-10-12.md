# Look: the Long Board's visual language (2026-10-12)

Status: the Long Board is the default map (2026-10-12), drawn full screen. Style a (Slate garden) is the default theme and b (Lamplit parterre) a theme the player picks on the Title or in Adjourn (remembered; `?mapstyle=a|b` overrides it); both follow the rules below. The phase-3 look is deleted. The square board is unchanged. Code: `src/render/table/longlook.ts` (styles, painter, gate arches and hedges), `relief.ts` (`LongRelief` with one flat lip), `board.ts`, `fx.ts` (eye badge).

Owner feedback it answers: "Map size is good, but the visual flair lacks polish. There isn't a lot of visual cohesion or design logic around the symbols and places on the map. Side Roads fail to mesh with farms."

## The rules: one meaning per look

| Look                                                  | Means                                | Used for                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Felt**                                              | A lane: waves and Bastions walk here | The three lanes only                                                                                                                               |
| **Flagstone** (one stone, one running-bond pattern)   | Any other walkable ground            | River Road, Sally Paths and their spurs, verges, gate paths to the clearings, the Squares, the grove yards (a darker course of the same stone)     |
| **Stone lip** (one pale coping colour)                | A change of height                   | The kerb round every walkable edge, the terrace cliff tops, the treads across the 12 lane ramps, Bastion plinths, gate arches                      |
| **Brass medallion** (ring + round badge with an icon) | A place you can use or fight over    | Clearings (paw), the Pit and the small clearings (star), the two bases                                                                             |
| **Stone lid with a brass seal**                       | A place that is not open yet         | Closed clearings: a dressed stone lid at flagstone brightness, a brass keyhole seal in the middle; it slides off and fades when the clearing opens |
| **Raked sand** (lit ring)                             | The arena                            | The Pit's sunken floor, with a ring of lamplight inside its wall                                                                                   |
| **Floor tiles** (calm, low contrast)                  | Dead space: nothing walks here       | Everything between the walkable shapes, one shade per terrace (home terrace lighter); the darkest value on the board belongs to dead space only    |
| **Trees, hedges, water**                              | Decoration                           | Only on dead space: pines (and hedges in b) ring the groves, water fills the river band                                                            |

- **Brass is reserved** for medallions (and a closed clearing's seal), the bases, the frame inlay, notation and lane names. Ramps, kerbs, plinths and paths never use brass.
- **Near-black is dead space** (2026-10-20, visuals review D2): no place on the board is drawn darker than the floor tiles, so the loudest shapes are places you use, never empty ones. That is why a closed clearing is a stone lid and the Pit a sand arena.
- **Structures read as chess** (review D3): a Bastion is a rook tower (round shaft, team band and cap, merlons, team banner), a Throne a crowned keep (octagonal keep, battlements, a glowing crown on its roof). Code: `models.ts`.
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
