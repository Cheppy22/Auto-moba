# HANDOFF — Auto-MOBA chess variant (branch `test-product-2`)

Live: https://cheppy22.github.io/Auto-moba/v2/ (main game at the root URL). Spec: `docs/CHESS.md`.

## Status

Playable chess auto-battler: 5 pieces per side, pawnlings/pawns, Bastions, Check/Checkmate, gambit schools + Openings, archetype fork at Rank 4, Grand Board look, humanoid pieces, report with graphs, and (2026-10-10) the **Act break**: bell countdown, grey wait for calm (cap 30 s), 3 tolls, slow halt, break sheet (Report coach notes + Orders), AI re-plan, next Act on resume.

## Done recently

2026-10-11 (latest): **relic wave 2** built: all 23 relics exist (Sealed Move, Pawn Structure, Battery, Sortie and eleven more; see `docs/RELICS.md` "Wave 2 build notes"). Code: `src/sim/relicsLive.ts` (live relic tick), `relics.ts` (lookups), `draft.ts` (AI aiming for Sealed Move and Pawn Structure, Battery lane fitting). Relics tab: pickers, steppers, "3 offers" strip. Battery makes 3/1/1 legal and Resume refuses illegal lanes. 40-match sanity only (White 37.5% both AI; relics move results a lot, so the tuning pass matters).

2026-10-10: **Damage mitigated** stat: `mitigated` on the `damage` event (set in `dealDamage`), per-piece and team totals in the end report (Mit column, Iron Wall award, Combat chart, 10 s series) and in the Act break "side by side" table; `MVP_WEIGHTS` untouched.

2026-10-10 (later): **relic wave 1** built per `docs/RELICS.md`: a third break-sheet tab (Relics: pick 1 of 3 with a tailored first card, aim, "Let the AI choose", re-aim at later breaks), Black drafts by an AI rule, a held-relic seal row under each roster, eight relics in `content/relics.json` (Half-Open File, Closed Position, Crown Jewel, Development, Pawn Majority, Pawn Lever, Opening Theory, Standing Order), `relic` rng stream, balance flags `--relics` and `--relic-pool`. Tier 3 items are now called **Masterworks**. Code: `src/sim/relics.ts`, `src/sim/draft.ts`, `src/sim/callouts.ts` (moved from analysis), `src/ui/hud/RelicsTab.tsx`, `src/ui/hud/RelicRow.tsx`.

Map x1.5, humanoid models, combat flash, lane tags, gambit long-press, schools wave 1, Openings, Rank 4 archetype, Act break (commit 631521f). 2026-10-10: **combat feedback** (fight verdict tags, why a piece fell, gambit impact lines and Report tally, lane momentum strip and "Lanes at the bell"); spec in `docs/CHESS.md` "Combat feedback", code in `src/sim/feedback.ts`, `src/sim/impact.ts`, `src/analysis/feedback.ts`, `src/ui/hud/Notes.tsx`, `src/ui/hud/LaneBars.tsx`.

## Next steps

1. Owner reviews the Act break and the new combat feedback on a phone (countdown flashes, toll pulses, grey halt, verdict tags and the lane strip were never viewed live on a device).
2. Gambit waves 2 (Clock school, English Opening) and 3: a redesign proposal toward set-at-the-break cards (Standing Order, Sealed Move and Pawn Structure are the models) plus a live-hand trim (hand of 2, slower churn; see the appendix in `docs/RELICS.md`). Write the proposal first, then build once Cheppy approves.
3. Minimap with pings (the combat feedback covers the read-the-board part; pings are still open).
4. Dedicated testing pass (task #56, now covering all 23 relics, built but only sanity-run): full Playwright, 800-match balance (relic runs: `--relics A=ai,B=ai`, `A=none`, `A=random`, one `--relic-pool` per family), school counters, stuck check incl. Barricade; tune `feedback` thresholds in `content/tuning.json` and the relic numbers in `content/relics.json`.

## Open decisions

Relic numbers (all 23 untuned: Sortie picked far too often by the AI, Pawn Structure and Battery almost never; White 37.5% in a 40-match both-AI run); minimap/evaluation bar/gauntlet mode; stronger grey at "Bell pending"; callout thresholds and `feedback` thresholds (guesses).

## Gotchas

- White win rate below target (~45%, 800 matches seed 29000); Act-break sanity run 42.5% on 40 matches (noise). Style outliers: shadow, ram, errant, regent high; sovereign, light, duelist, zealot low.
- Pages: push to `test-product-2` relays to `test-product`, which builds both sites.
- Owner rules: short answers, no heavy testing per change (one `npm run check` per push), never open a PR unless asked, update docs per CLAUDE.md.
- Paused work on `test-product` (3D polish stash, Team A bias) is untouched.
- Backup branch `wip/act-break` on origin can be deleted (the proxy refused the delete).
