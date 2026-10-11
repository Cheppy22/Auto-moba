# HANDOFF — Auto-MOBA chess variant (branch `test-product-2`)

Live: https://cheppy22.github.io/Auto-moba/v2/ (main game at the root URL). Default look: Tournament Table variant c; old Grand Board at `?look=grand` (to be deleted with the map overhaul); `?variant=a|b`, `?frame=square|diamond`, `?hud=old|new` for comparison. Spec: `docs/CHESS.md`. Overnight log: `docs/OVERNIGHT-2026-10-11.md`.

## Status

Playable chess auto-battler: 5 pieces per side, pawnlings/pawns, Bastions, Check/Checkmate, gambit schools + Openings, archetype at Rank 4, all 23 relics (draft at each Act break), Act bell + break sheet (Report / Orders with pawn counts / Relics), combat feedback, fixed whole-board camera by default, sound, match intro, report with graphs and damage mitigated. Look: Tournament Table variant c "Spotlight Arena" (low-poly humanoid pieces, chessboard on a table, relief/terraces visual only) with the new phone HUD (court bar on top, piece row + card drawer at the bottom, dead-piece trays), lane camera (tap lane to lean in, drag along lane, pinch/wheel zoom), 3-page setup (paths with first buys, board with piece descriptors + synergy, Opening with example hands), 6.7 s versus-card intro. White/Black balance is on target (49.6–51.4%).

## Done recently (2026-10-11, all pushed)

- **Afternoon:** table-look variants (a/b/c) + lane camera, owner picked **c as default**; new phone HUD; 3-page setup overhaul (+ fork-sheet landscape fix, report swipe fix); versus-card intro with 3D portraits; HUD reports the drawer footprint so the board frames around it. **Long Board map spec** written (`docs/MAP-LONGBOARD-2026-10-11.md`, diagram `docs/img/map-longboard.svg`) — awaiting owner approval.

- **Overnight balance pass** (`docs/BALANCE-2026-10-11.md`): bias root cause fixed (Mid pawnling waves started staggered, Black always led wave 1; `waves.midLeadUnits` → 0). White 49.6% / 51.4% relics off, 50.4% / 51.1% both-AI relics (seeds 29000 / 31000). Relic AI picks spread (every relic 14–55%); four relic and six style numbers tuned.
- **Overnight QA** (`docs/QA-2026-10-11.md`): 8 matches played, 22 bugs logged (0 blocker, 0 high), 10 fixed; 12 open (3 Med).
- **Code cleanup phases 0–3** (`docs/REVIEW-2026-10-11-code.md`): dead code, auction/holy items, sim/analysis dedupe; net −464 lines; `npm run baseline` (`tools/baseline.ts`, `tests/baseline.expected.json`) proves identical games — re-written after the merge to the current behaviour and verified identical against the pre-merge build.
- Earlier on 10-11: polish pass (board camera default, pawn counts in Orders, sounds, 4 bugs, readability), Tournament Table prototype, relic wave 2, relic aim fix, match intro, Black gambit banner, damage mitigated.

## Next steps

The approved order of work after the Long Board is in `docs/FABLE-REVIEW-1-2026-10-11.md` section 5 (Tournament run, interactive armory, Blitz/Classical, named opponents, art swings, onboarding, audio, platform last). Each needs its own spec for approval first.

1. **Long Board map overhaul** — once the owner approves the six decisions in the spec: 5 phases behind `?map=long` (sim map + walkable + pathing; high-ground rules + AI; table render + camera; 800-match balance with a deliberate baseline re-record; switch default + e2e + docs), about 5–6 days with 2–3 agents. Highest risk: AI rotation/pathing.
2. QA open items: King's Ransom offered by the tailored slot while far ahead; auto-actions (Standing Order, Pawn Structure, pawn plan, Rally) need a note; new HUD side shape: aim banner covers Black's base at 800×520, Black tokens 38 px (< 44); intro portraits small on phones; old-look Black portraits murky.
3. Balance follow-ups: second style pass (Ram, Errant, Usurper, Lancer, Shadow), relic value runs, third seed for Wing Gambit / Royal Keep.
4. Code cleanup phases 4–6 (big-function rewrites, speed, tests) — after the map overhaul (it rewrites render/ui/sim map code anyway); delete the Grand Board renderer (~10.6k lines) then.
5. Synergy notes on setup page 2 are thin (only King + Bishop produce any) — richer synergy would need design.

## Open decisions

- Long Board: approve the six decisions (speed ×1.2, retire Grand Board look, Reach + Sight high-ground rules, grove floors open all match, one shop Square per side, build behind `?map=long`).
- Intro: flip the header to Black-left/White-right to match the rows? Lighten the ~85% dim?
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
