# HANDOFF — Auto-MOBA chess variant (branch `test-product-2`)

Live: https://cheppy22.github.io/Auto-moba/v2/ (main game at the root URL). Spec: `docs/CHESS.md`.

## Status

Playable chess auto-battler: 5 pieces per side, pawnlings/pawns, Bastions, Check/Checkmate, gambit schools + Openings, archetype fork at Rank 4, Grand Board look, humanoid pieces, report with graphs, and (2026-10-10) the **Act break**: bell countdown, grey wait for calm (cap 30 s), 3 tolls, slow halt, break sheet (Report coach notes + Orders), AI re-plan, next Act on resume.

## Done recently

2026-10-11 (overnight balance pass, report `docs/BALANCE-2026-10-11.md`, 4 commits, not pushed): **White/Black bias root cause fixed** (`waves.midLeadUnits` 292.5 → 0: Black always led the first Mid wave); relics off White 49.6% (800, seed 29000; was 45.8%), both-AI relics 50.4% / 51.1% (seeds 29000 / 31000). **Relic AI picks spread** (tailored bonus 1.0 → 0.5, pawn-heavy = one pawn per two cards, tags on Strong Square, Battery, Standing Order, Crown Jewel, Pawn Structure): every relic picked 14–55%. Four relic numbers trimmed (Half-Open File, Crown Jewel, Development, Standing Order). Six style numbers (Shadow, Regent helped; Errant, Ram, Usurper, Lancer did not move). New tools: `balance --tag`, `tools/merge-runs.ts`.

2026-10-11 (latest): **relic wave 2**: the remaining 15 relics incl. Sealed Move (card + trigger, fires once per Act), Pawn Structure (lane quotas + Tempo reserve), Battery (3/1/1 lanes; Resume is refused until lanes are legal) and Sortie; code in `src/sim/relicsLive.ts`, `relics.ts`, `draft.ts`, UI in `RelicsTab.tsx`. 40-match sanity: both AI White 37.5%, A=ai only 42.5%, B=ai only 27.5% (relics still favour Black).

2026-10-11 (earlier, all pushed to `test-product-2`): **relic aim fix** (`hintFits` in `src/sim/draft.ts`: problem notes aim only `protect`/`defense` relics; offence/carry relics aim by the AI rule; this was a real bug but it did not close the White gap); **match intro** (about 7.6 s: Openings card, both courts with piece tags, lane pass; Skip; `?intro=off` for tests) and **Black gambit banner** ("Black played Check on your Bishop", slate theme, one at a time); **full-screen Act break sheet**; **damage mitigated** (below).

2026-10-10: **Damage mitigated** stat: `mitigated` on the `damage` event (set in `dealDamage`), per-piece and team totals in the end report (Mit column, Iron Wall award, Combat chart, 10 s series) and in the Act break "side by side" table; `MVP_WEIGHTS` untouched.

2026-10-10 (later): **relic wave 1** built per `docs/RELICS.md`: a third break-sheet tab (Relics: pick 1 of 3 with a tailored first card, aim, "Let the AI choose", re-aim at later breaks), Black drafts by an AI rule, a held-relic seal row under each roster, eight relics in `content/relics.json` (Half-Open File, Closed Position, Crown Jewel, Development, Pawn Majority, Pawn Lever, Opening Theory, Standing Order), `relic` rng stream, balance flags `--relics` and `--relic-pool`. Tier 3 items are now called **Masterworks**. Code: `src/sim/relics.ts`, `src/sim/draft.ts`, `src/sim/callouts.ts` (moved from analysis), `src/ui/hud/RelicsTab.tsx`, `src/ui/hud/RelicRow.tsx`.

Map x1.5, humanoid models, combat flash, lane tags, gambit long-press, schools wave 1, Openings, Rank 4 archetype, Act break (commit 631521f). 2026-10-10: **combat feedback** (fight verdict tags, why a piece fell, gambit impact lines and Report tally, lane momentum strip and "Lanes at the bell"); spec in `docs/CHESS.md` "Combat feedback", code in `src/sim/feedback.ts`, `src/sim/impact.ts`, `src/analysis/feedback.ts`, `src/ui/hud/Notes.tsx`, `src/ui/hud/LaneBars.tsx`.

## Next steps

1. Owner reviews the Act break and the new combat feedback on a phone (countdown flashes, toll pulses, grey halt, verdict tags and the lane strip were never viewed live on a device).
2. Relics: all 23 built and first-tuned (2026-10-11 balance pass). Still open: relic value runs (`--relics A=ai,B=none` / `A=random,B=none` vs none, 800 each) and a third seed for Wing Gambit and Royal Keep.
3. Gambit waves 2 (Clock school, English Opening) and 3, redesigned toward set-at-the-break cards (Standing Order is the model: a card bound at the break, always on, half strength).
4. Minimap with pings (the combat feedback covers the read-the-board part; pings are still open).
5. Dedicated testing pass (task #56): full Playwright, 800-match balance (relic runs: `--relics A=ai,B=ai`, `A=none`, `A=random`, one `--relic-pool` per family), school counters, stuck check incl. Barricade; tune `feedback` thresholds in `content/tuning.json` and the relic numbers in `content/relics.json`.

## Open decisions

Install the Karpathy coding guidelines (multica-ai/andrej-karpathy-skills) into the global `~/.claude/CLAUDE.md` (pending; see the note in the chat: the auto-mode safety check blocked the write); relic numbers (wave 1 untuned); minimap/evaluation bar/gauntlet mode; stronger grey at "Bell pending"; callout thresholds and `feedback` thresholds (guesses).

## Gotchas

- Balance (2026-10-11): White on target (49.6–51.1%). Style outliers left: Errant, Battering Ram, Usurper, Shadow high (57–61%); Lancer low (~40%); next levers listed in `docs/BALANCE-2026-10-11.md`. Relic held-win rates on ~100 holders swing ±10 points between seeds (Wing Gambit, Royal Keep): use a third seed before changing them. Rule for new relics: a problem note may only aim `protect`/`defense` relics.
- The machine is shared: run balance with `--workers 2`, one job at a time. `tests/terrain.test.ts` and `tests/lane-share.test.ts` have hard-coded 60/120 s timeouts that fail under load; rerun them alone.
- Git habits: uncommitted agent work is backed up to `wip/*` branches (temp index plus `git commit-tree`) rather than committed half-built; the stop hook nags until the build lands. `.claude/worktrees/` is excluded in `.git/info/exclude` so agent worktrees never get committed.
- Pages: push to `test-product-2` relays to `test-product`, which builds both sites.
- Owner rules: short answers, no heavy testing per change (one `npm run check` per push), never open a PR unless asked, update docs per CLAUDE.md.
- Paused work on `test-product` (3D polish stash, Team A bias) is untouched.
- Backup branch `wip/act-break` on origin can be deleted (the proxy refused the delete).
