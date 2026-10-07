# Auto-MOBA

A single-player autobattler MOBA set in an xxxHolic-style pocket dimension. You pick one hero and a lane on a 5v5 team of AI, then shape the match through what you buy, the upgrades you pick, shop and event suggestions and when to recall. Heroes fight on their own.

- **Source of truth** (how the game works now): [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md)
- **Changelog** (what changed and when): [docs/CHANGELOG.md](docs/CHANGELOG.md)
- Architecture and milestone tasks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Dated specs and reports: [items](docs/ITEMS.md), [playtest](docs/PLAYTEST.md), [balance](docs/BALANCE_REPORT.md)
- Old design docs, for history: [docs/archive/](docs/archive/)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command                             | What it does                                                          |
| ----------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                     | Typecheck, lint (layer boundaries), format check, unit tests          |
| `npm run e2e`                       | Browser smoke test (Playwright, Chromium)                             |
| `npm run build`                     | Typecheck and production build                                        |
| `npm run sim -- 42`                 | Run one headless AI-only match for seed 42 and print a summary        |
| `npm run balance -- --matches 1000` | Parallel batch runner; writes `out/balance.md` and `out/balance.json` |
| `npm run balance:pairwise -- 24`    | Hero-versus-hero matrix (5 of one hero per side)                      |

Balance experiments without editing content (tools only): `BALANCE_SCALE='{"miko":0.9}'`, `BALANCE_PATCH='{"miko":{"personality":"cautious"}}'`, `BALANCE_TUNING='{"curse":{"threshold":0}}'`.

## Layout

```
content/    JSON: heroes, items (incl. cursed and holy), upgrades, biomes, pressure, badges, map, tuning
src/sim/    deterministic simulation (no browser code; the only way in is src/sim/index.ts)
src/analysis/  event log -> report models (stats, fights, badges, paths)
src/render/ Canvas drawing: map, sigils, replay
src/ui/     Preact screens: draft, prep, HUD, reports
src/app/    wiring: content loading, frame clock
tools/      Node: headless match, balance runner, pairwise matrix
tests/      unit, determinism, golden, content, boundary, symmetry, analysis, e2e
```

Every match is reproducible: the same seed and the same commands produce the same event log (`Match.exportReplay()` / `Match.fromReplay()`).
