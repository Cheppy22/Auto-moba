# HANDOFF — Auto-MOBA chess variant (branch `test-product-2`)

Live: https://cheppy22.github.io/Auto-moba/v2/ (main game at the root URL). Spec: `docs/CHESS.md`.

## Status

Playable chess auto-battler: 5 pieces per side, pawnlings/pawns, Bastions, Check/Checkmate, gambit schools + Openings, archetype fork at Rank 4, Grand Board look, humanoid pieces, report with graphs, and (2026-10-10) the **Act break**: bell countdown, grey wait for calm (cap 30 s), 3 tolls, slow halt, break sheet (Report coach notes + Orders), AI re-plan, next Act on resume.

## Done recently

Map x1.5, humanoid models, combat flash, lane tags, gambit long-press, schools wave 1, Openings, Rank 4 archetype, Act break (commit 631521f). 2026-10-10: **combat feedback** (fight verdict tags, why a piece fell, gambit impact lines and Report tally, lane momentum strip and "Lanes at the bell"); spec in `docs/CHESS.md` "Combat feedback", code in `src/sim/feedback.ts`, `src/sim/impact.ts`, `src/analysis/feedback.ts`, `src/ui/hud/Notes.tsx`, `src/ui/hud/LaneBars.tsx`.

## Next steps

1. Owner reviews the Act break and the new combat feedback on a phone (countdown flashes, toll pulses, grey halt, verdict tags and the lane strip were never viewed live on a device).
2. Relic draft: list for owner approval (a relic list doc may be in progress), then add as a third tab in the break sheet.
3. Gambit waves 2 (Clock school, English Opening) and 3, redesigned toward pre-armed set-up cards (play before the Act, not mid-fight).
4. Minimap with pings (the combat feedback covers the read-the-board part; pings are still open).
5. Dedicated testing pass (task #56): full Playwright, 800-match balance, school counters, stuck check incl. Barricade; tune `feedback` thresholds in `content/tuning.json`.

## Open decisions

Relic content; minimap/evaluation bar/gauntlet mode; stronger grey at "Bell pending"; callout thresholds and `feedback` thresholds (guesses).

## Gotchas

- White win rate below target (~45%, 800 matches seed 29000); Act-break sanity run 42.5% on 40 matches (noise). Style outliers: shadow, ram, errant, regent high; sovereign, light, duelist, zealot low.
- Pages: push to `test-product-2` relays to `test-product`, which builds both sites.
- Owner rules: short answers, no heavy testing per change (one `npm run check` per push), never open a PR unless asked, update docs per CLAUDE.md.
- Paused work on `test-product` (3D polish stash, Team A bias) is untouched.
- Backup branch `wip/act-break` on origin can be deleted (the proxy refused the delete).
