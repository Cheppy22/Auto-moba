# Overnight AAA proposal (2026-10-17)

Branch `proposal/aaa-overnight`, built overnight by the lead session and nine agents against the Fable review ([FABLE-REVIEW-1-2026-10-11.md](FABLE-REVIEW-1-2026-10-11.md)). **Shipped to `/v2/` on 2026-10-18** (owner: "It's amazing. Keep it."). The illustrated walkthrough with a playable build is published as an artifact (link in HANDOFF.md).

## What the branch adds

| Area                     | What changed                                                                                                                                                       | Status                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Capture spectacle        | Hit-stop, knocked-flying captures, token into the capture tray, rank-up flares, Rank 4 transformation, Checkmate topple with letterbox; weather, birds, water life | Recommend ship           |
| Audio                    | Generative music bed, two garden ambiences, 32 cues, four-slider mixer; mix measured on AAC: −15.3 LUFS busy, −6.0 dBTP                                            | Needs the owner's ears   |
| Look                     | Woods 115.5k → 84.6k phone triangles; side-on default on wide screens; Ink style post-process behind a switch                                                      | Ship; Ink stays optional |
| Onboarding and HUD       | Five first-match hints, Replay tutorial; phone top bar three rows → two (19.2% → 13.5% of a 390 px screen)                                                         | Recommend ship           |
| Platform                 | Manifest and icons, self-hosted fonts, offline service worker, update prompt, resume a match after reload, 16% less code before the Title                          | Recommend ship           |
| Named courts (3B)        | Ten hand-made Tournament courts with seals, portraits, mottos, Openings and signature relics                                                                       | Recommend ship           |
| Relic and fork picks     | Relic offers as big cards with a plan line and before → after numbers; fork tabs with model, stats before → after and skill numbers                                | Recommend ship           |
| Blitz and Classical (2B) | Blitz: 3 Acts, Throne 3000, Endgame from Act 2, points decision; Classical unchanged; Blitz default on phones; 1600 matches: White 49.8%, median 10.3 min          | Recommend ship           |
| QA pass                  | Courts keep their signature relic; update bar placement; tap targets; tests aware of the Checkmate beat; court tuning                                              | Fixed                    |

Measured details: [BALANCE-2026-10-15.md](BALANCE-2026-10-15.md) (Blitz, AI Tempo split, courts), [CHANGELOG.md](CHANGELOG.md) (2026-10-17 entries), [CHESS.md](CHESS.md) (rules and interface).

## Owner decisions

1. Ship the branch to `/v2/` (all, or area by area).
2. Listen to `docs/audio/aaa-mix.m4a` at 0–18 s, 19 s, 27 s, 41–46 s and 54 s.
3. Keep Ink style optional until it is checked on a real phone.
4. Keep the Blitz Endgame at Act 2 (one number: `blitz.endgameAct`).
5. Idle players win 39% in Blitz: leave it or soften Blitz Black.

## Known gaps

No real-phone frame-rate check; audio measured but not heard; fork models are portraits, not turning models; the Spoils screen still uses the small relic seal; on a landscape phone the theme and Ink switches sit below the fold; licensed audio files need Mixkit allowed in the network settings or files from the owner.
