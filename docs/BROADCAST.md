# Broadcast view spec (2026-10-07)

A 3D spectator view of the match, drawn with three.js, that you can switch on next to the 2D map. The camera behaves like an NFL broadcast: a high wide shot when nothing is happening, and a sideline camera that dollies and zooms onto important plays, with a lower-third caption naming the play.

Approved by Cheppy on 2026-10-07: three.js dependency; art built from code (no model or image files); physics is visual only.

## Rules

- **Render only.** Nothing in `src/sim` changes. The view reads `Snapshot` and new `GameEvent`s, exactly like the 2D renderer. Visual physics (ragdolls, debris, knockback wobble) can never affect the match.
- **2D stays the default.** The 2D map keeps shop clicking, labels and the phone layout. Broadcast is a toggle.
- **Lazy loaded.** three.js loads only when the view is first switched on, so the 2D game's load time doesn't change.
- **Art from code.** Procedural geometry and canvas textures only. Hero sigils reuse `drawSigil` painted onto a canvas texture.

## Files

| File                               | Owner      | What                                                                             |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `src/render/broadcast/types.ts`    | design     | Shared types: `Shot`, `PlayKind`, `CamMode`, `BroadcastFrame`.                   |
| `src/render/broadcast/director.ts` | director   | Pure play-picking logic. No three.js, no DOM. Unit-tested in Node.               |
| `src/render/broadcast/scene.ts`    | scene      | `BroadcastView`: three.js renderer, world, units, camera rig, free controls.     |
| `src/render/broadcast/models.ts`   | scene      | Procedural meshes for heroes, minions, towers, guardian, camps, obelisk, keeper. |
| `src/render/broadcast/physics.ts`  | scene      | Visual-only ragdoll and debris integrator (no physics library).                  |
| `src/render/broadcast/index.ts`    | scene      | Re-exports `Director`, `BroadcastView` and the types (the lazy-import entry).    |
| `src/render/broadcast/kit.ts`      | scene      | Shared GPU resources: toon ramp, ink-outline hulls, code-painted textures.       |
| `src/render/broadcast/arena.ts`    | scene      | The map: ground, lanes, slots, walls, gates, bases, shops, rim, starfield.       |
| `src/render/broadcast/camera.ts`   | scene      | Camera rig: auto easing and cuts, follow, free (`MapControls`), shake.           |
| `src/render/broadcast/fx.ts`       | scene      | Health bars, attack streaks, jungle-event rings.                                 |
| `src/ui/Stage.tsx`, HUD, session   | integrator | Toggle, camera mode buttons, caption overlay, lazy import, fallback.             |
| `tests/director.test.ts`           | director   | Director unit tests.                                                             |

## Director (`director.ts`)

```ts
export class Director {
  constructor(content: Content);
  /** Call once per frame with the events emitted since the last call. */
  update(snap: Snapshot, events: NewEvents): Shot;
  reset(): void;
}
```

- Deterministic in game ticks (`snap.tick`); never reads the wall clock.
- **Candidates each update**, scored by priority (higher wins):
  - `guardian` 90: a guardian below 100% and taking hero damage, or out of its base (phase 7+).
  - `structure` 85: a `structureDown` event; hold on the rubble about 4 s. Hard cut.
  - `multikill` 80: 2+ hero deaths within 6 s in one area.
  - `teamfight` 70: 3+ living heroes per side within about 260 units of each other (cluster by distance).
  - `kill` 60: a single hero death (`death` event with `kind: 'hero'`); hold about 3 s on the spot.
  - `event` 50: an active jungle event in `snap.events` with heroes inside its radius (Oni, Well and so on). Caption uses the event name.
  - `skirmish` 40: 1–2 heroes per side fighting (heroes with `target` set to an enemy hero, or `flash` true near an enemy hero).
  - `player` 20: the player's hero when it's in a fight or low on health.
  - `wide` 0: the whole map. Caption null.
- **Broadcast feel:**
  - Minimum hold of 60 ticks (3 s) on a shot. Only a candidate at least 15 priority higher may preempt it.
  - Linger 40 ticks after a play ends before going wide.
  - The focus point is the centroid of the subjects; the radius covers the subjects plus a margin (min 140, max about 520).
  - `cut: true` only for structure falls and when the new focus is more than about 450 units away; otherwise the scene dollies.
- **Captions:** short, title case, with the area: "Team fight · Mid", "Tower falls · Left", "Double kill · Right jungle", "Hungry Oni", "Guardian under siege". The area comes from the nearest lane (internal `top`/`mid`/`bot` show as Left/Mid/Right), "jungle" when far from lanes, and "base" near a base.

## Scene (`scene.ts`, `models.ts`, `physics.ts`)

```ts
export class BroadcastView {
  constructor(canvas: HTMLCanvasElement, content: Content); // throws if WebGL is unavailable
  draw(snap: Snapshot, events: NewEvents, frame: BroadcastFrame): void;
  resize(): void;
  dispose(): void;
}
```

- **World mapping:** sim `(x, y)` maps to three `(x - size/2, 0, y - size/2)`, with Y up. Team A's base sits nearest the default camera, like the bottom of the 2D map.
- **Look:** ink and lacquer at night. Dark lacquer ground disc, faint violet seal rings, lanes as worn paths, open jungle slots tinted by `biome.palette`, low walls with gate gaps (match `gateGeometry` in `renderer.ts`). Starfield void, light fog. Toon materials plus an inverted-hull ink outline on units and structures. Team colors come from `PALETTE` in `theme.ts`.
- **Units:**
  - Heroes: a small robed figure (body, head, team sash) with a floating sigil disc made from `drawSigil` on a canvas texture.
  - Minions: an instanced paper lantern or doll per team.
  - Towers: stone lanterns (tōrō).
  - Guardian: a large floating shrine spirit.
  - Camps: neutral spirit blobs. Obelisk: a standing stone. Keeper: a gold butterfly.
  - Health bars face the camera above heroes and structures. The player's hero gets a gold ground ring.
- **Motion:** positions interpolate `px→x` by `alpha`. Heroes face their movement direction, bob while walking, lunge on `flash`, and flinch when health drops.
- **Visual physics** (`physics.ts`, a simple integrator with gravity, ground bounce, friction, spin and a sleep threshold):
  - Hero death becomes a ragdoll: the figure splits into body, head and sigil parts, thrown away from the killer, settling and fading after about 3 s.
  - Tower and guardian destruction collapses into debris chunks.
  - Minion death is a small paper burst.
  - Fixed time step, capped number of live bodies, and nothing in it is read by the sim.
- **Camera rig:**
  - `auto` mode: ease (critically damped) toward `shot`. The wide shot is a high skycam over the whole map; play shots are a lower sideline angle from team A's side with a slight drift, framed so `radius` fits. `cut: true` snaps.
  - `follow` mode: track `followId` at a medium sideline angle.
  - `free` mode: `MapControls` (drag to pan, wheel or pinch to zoom, right-drag to rotate), clamped to the arena.
- **Performance:** device pixel ratio at most 1.5, one directional light with shadows on desktop only, instancing for minions, about 60 fps with 100 units on a mid phone as the target.

## Interface (integrator)

- A **Map / Broadcast** toggle in the speed panel. In Broadcast, three camera buttons: **Auto**, **Follow**, **Free**.
- A lower-third caption bar (bottom centre, glass panel, seal-red accent) shows `shot.caption` and fades when null.
- If WebGL fails, fall back to the 2D map with a toast.
- Escape and the shop work the same in both views.
