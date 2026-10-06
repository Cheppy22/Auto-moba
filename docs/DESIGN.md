# Auto-MOBA — Design Baseline v1

Locked game decisions as of 2026-10-06. If a task conflicts with this file, this file wins until Cheppy changes it.
Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

## Pitch

A single-player autobattler MOBA. You pick one hero and a lane on a 5v5 team of AI, then shape the match through items, upgrades, posture and deals with the keeper.

## Setting

A pocket dimension pulling from many places and times (xxxHolic reference). Spirits and esoteric entities everywhere. Every wish has a price. Why the teams fight: deferred.

## References

- **Guildrun:** build depth and role-bending builds.
- **Deadlock:** the shop, item categories and the boss guardian.

## Decisions

| Area             | Decision                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format           | Single-player. You build 1 hero on a 5v5 team; the other 9 heroes are AI.                                                                                                                                                                                                                                                                                                                   |
| Draft            | Both teams are visible. You pick a hero, then a lane. The same hero can appear on both teams, never twice on one.                                                                                                                                                                                                                                                                           |
| Win              | Destroy the enemy guardian, a bound spirit in each base.                                                                                                                                                                                                                                                                                                                                    |
| Phases           | About 4 minutes each, about 12 minutes total over 3 phases. There is no phase cap.                                                                                                                                                                                                                                                                                                          |
| Map growth       | The 3-lane skeleton is fixed. Phases 1–3 open randomized biome areas, and the jungle changes each phase.                                                                                                                                                                                                                                                                                    |
| Pressure         | From phase 4, a fixed stacking order (below).                                                                                                                                                                                                                                                                                                                                               |
| In-phase control | Posture (Push / Farm / Defend) as weighted suggestions, plus recall to the base shop (instant) or to the keeper (longer).                                                                                                                                                                                                                                                                   |
| Personality      | Each hero has a default posture and a trait that changes how it follows a posture, never whether.                                                                                                                                                                                                                                                                                           |
| Between phases   | Phase Report, then pick 1 of 3 upgrades, then shop, auction bid and curse offer. Heroes keep their position and hp and shop remotely.                                                                                                                                                                                                                                                       |
| Shop             | Mind / Body / Soul categories (Mind: Blade damage and attack speed; Body: health, armor, regeneration; Soul: Soul power, resistance, cooldowns). Owning 2, 4 or 6 items of one category grants an attunement bonus (highest tier only; cursed items count, the Holy item does not; numbers in `content/tuning.json`). Some items combine with specific partners, and items upgrade by tier. |
| Cursed items     | Offered to the furthest-behind hero on the losing team (below 75% of average net worth), at most one per phase. The flaw type is visible and the exact flaw is hidden. Curses are permanent, can be refused, and AI heroes take them too.                                                                                                                                                   |
| Holy item        | One per match, sealed team auction using team points plus the player's gold. Points are worth more than gold. Awarded before phase 3 to the hero the winning team picks. Losers get 50% of their gold back.                                                                                                                                                                                 |
| Fallen Saint     | A hero may hold holy and cursed items at once.                                                                                                                                                                                                                                                                                                                                              |
| Obelisks         | Minor random objectives that give team points plus a small buff, gold or a shop unlock.                                                                                                                                                                                                                                                                                                     |
| Respawn          | Starts short, grows during a phase, carries over between phases.                                                                                                                                                                                                                                                                                                                            |
| Reports          | Data and factual badges only, never conclusions or advice. Team view, hero view, map replay.                                                                                                                                                                                                                                                                                                |
| AI difficulty    | One, neutral, for v1.                                                                                                                                                                                                                                                                                                                                                                       |
| Art              | Occult sigils and shapes drawn by code. No image files.                                                                                                                                                                                                                                                                                                                                     |
| Balance targets  | Every hero at a 40–60% win rate; median match 11–14 minutes.                                                                                                                                                                                                                                                                                                                                |

## Pressure events

| Phase | Event (stacks with earlier ones) | Effect                                               |
| ----- | -------------------------------- | ---------------------------------------------------- |
| 4     | Thinning Veil                    | Healing reduced across the whole map                 |
| 5     | Spirit Tide                      | Jungle camps push into the lanes                     |
| 6     | Keeper Calls In Debts            | Cursed items double in both power and flaw           |
| 7+    | Restless Guardians               | Guardians leave their bases and fight; ends the game |

## Reports

- Show data and patterns. Never headlines, conclusions or advice; learning what patterns mean is part of the game.
- **Team view:** both teams' stats side by side.
- **Hero view:** factual badges ("Tankiest", "Most objective damage", "Most damage taken from Soul"), damage and gold breakdowns.
- **Map replay:** the hero's path, fights with outcomes, and purchase timing.

## Shelved

- Meta-progression between matches
- Lane identity (era-themed lanes)
- "The Core" alternate mode: circle map, fog phases, random obelisks, final arena fight decides the winner
- Lore: why the teams fight
