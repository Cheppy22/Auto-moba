# HANDOFF — Auto-MOBA chess variant (branch `test-product-2`)

Live: https://cheppy22.github.io/Auto-moba/v2/ (main game at the root URL). Tournament Table preview: add `?look=table`. Spec: `docs/CHESS.md`. Overnight log: `docs/OVERNIGHT-2026-10-11.md`.

## Status

Playable chess auto-battler: 5 pieces per side, pawnlings/pawns, Bastions, Check/Checkmate, gambit schools + Openings, archetype at Rank 4, all 23 relics (draft at each Act break), Act bell + break sheet (Report / Orders with pawn counts / Relics), combat feedback, fixed whole-board camera by default, sound, match intro, report with graphs and damage mitigated. Two looks: Grand Board (default) and Tournament Table (`?look=table`, low-poly, owner wants it as the default after picking a variant). White/Black balance is on target (49.6–51.4%).

## Done recently (2026-10-11, all pushed)

- **Overnight balance pass** (`docs/BALANCE-2026-10-11.md`): bias root cause fixed (Mid pawnling waves started staggered, Black always led wave 1; `waves.midLeadUnits` → 0). White 49.6% / 51.4% relics off, 50.4% / 51.1% both-AI relics (seeds 29000 / 31000). Relic AI picks spread (every relic 14–55%); four relic and six style numbers tuned.
- **Overnight QA** (`docs/QA-2026-10-11.md`): 8 matches played, 22 bugs logged (0 blocker, 0 high), 10 fixed; 12 open (3 Med).
- **Code cleanup phases 0–3** (`docs/REVIEW-2026-10-11-code.md`): dead code, auction/holy items, sim/analysis dedupe; net −464 lines; `npm run baseline` (`tools/baseline.ts`, `tests/baseline.expected.json`) proves identical games — re-written after the merge to the current behaviour and verified identical against the pre-merge build.
- Earlier on 10-11: polish pass (board camera default, pawn counts in Orders, sounds, 4 bugs, readability), Tournament Table prototype, relic wave 2, relic aim fix, match intro, Black gambit banner, damage mitigated.

## Next steps

1. **Owner decisions** (see Open decisions).
2. Finish the stopped work, if the owner wants it relaunched: table variants (`wip/table-variants`, round 2 committed on `worktree-agent-a0bcf22a84531793b`), new phone HUD (`wip/hud-new`), setup 3-page overhaul (`wip/setup-overhaul`). All three were stopped from the owner's side on 2026-10-11 before finishing.
3. Then: intro rework (5–8 s versus card: Black top row, White bottom, lane columns), roll out the chosen table variant as default + new HUD.
4. QA open items (top): table-look lane lean-in does nothing; table portrait board only ~45% of the height; King's Ransom offered by the tailored slot while far ahead; setup shows 2 of 5 piece cards with no scroll cue; score "0 / 13" unlabeled; auto-actions (Standing Order, Pawn Structure, pawn plan, Rally) need a note.
5. Balance follow-ups: second style pass (Ram, Errant, Usurper, Lancer, Shadow — levers in the balance report), relic value runs (`--relics A=ai,B=none` / `A=random,B=none`), third seed for Wing Gambit / Royal Keep.
6. Code cleanup phases 4–6 (rewrites of the big functions, speed, tests) — after the table look and HUD land, since they rewrite render/ui.
7. High-ground gameplay proposal (verticality is visual for now).

## Open decisions

- Relaunch the three stopped agents (table variants, new HUD, setup overhaul)?
- Pick the table-look variant (after the variants agent finishes).
- Opening names on the new intro card: keep or drop.
- Karpathy coding guidelines in global `~/.claude/CLAUDE.md`: blocked by the auto-mode safety check; needs a permission rule or a manual paste.

## Gotchas

- Machine is 4 cores and shared by agents: run balance with `--workers 2`, one job at a time; browser tests time out under load (rerun alone). `tests/terrain.test.ts` and `tests/lane-share.test.ts` have hard-coded 60/120 s timeouts.
- Two Playwright specs fail on this branch: mobile landscape (fork sheet ~8 px too tall at 844×390, "Let the AI choose" 80% in view — small CSS fix in `src/ui/css/responsive.css`) and report landscape (swipe/arrow doesn't switch to Economy; cause unknown). Report desktop can hang under load.
- Never use `pkill -f` / `pgrep -f` patterns that can match your own shell command (it killed the shell twice). Kill by PID.
- Agent worktrees live in `.claude/worktrees/` (ignored by git via `.git/info/exclude` and by ESLint). Parallel Playwright runs need distinct `PW_PORT`s.
- Uncommitted agent work is backed up to `wip/*` branches (temp index + `git commit-tree`), not committed half-built.
- Pages: push to `test-product-2` relays to `test-product`, which builds both sites.
- Owner rules: BLUF, short answers, one `npm run check` per push, never open a PR unless asked, update docs per CLAUDE.md.
- Paused work on `test-product` (3D polish stash, Team A bias) is untouched. Old `wip/*` backup branches can be deleted.
