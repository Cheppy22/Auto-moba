# Spec: Piece builds with Techniques (2026-10-18)

Status: **draft for approval** (nothing built). Written by Opus (planner) after owner feedback on items. Belongs to [CHESS.md](CHESS.md). Replaces, once approved and built, the item parts of [ITEMS.md](ITEMS.md) and the 1C Armory in [SPEC-TOURNAMENT-ARMORY-2026-10-13.md](SPEC-TOURNAMENT-ARMORY-2026-10-13.md).

**Owner feedback this answers (2026-10-18):** "Not really a fan of the offense/defense/utility split. The items themselves seem unoriginal or uninspired and hard to tell what makes a difference. I like to imagine you choose a tree that's mostly RNG. You have limited agency, but you can still make somewhat informed decisions and influence the build of your pieces. Keyword here is **piece builds**."

## Decisions for the owner

Say "all as recommended" or change any of them.

1. **Replace the 36 items and the Offense / Defense / Utility paths with Techniques. Recommend yes.** A Technique is a card that changes how one of a piece's skills or attacks works ("L-Leap also hits two more pieces where he lands"), not a pile of stats. Each piece gets **pick 1 of 3** once at Setup and once at every Act break. The offer is random; you choose which one, and you can see the numbers before you take it. Pieces still get stronger on their own as they rank up, so the stats you lose from items come back automatically.
2. **Gold stays, but only to bend the luck. Recommend yes.** Each piece still earns its own gold and still ranks up from it. At the Act break a piece spends gold on **Reroll** (draw three new cards) or **Upgrade** (make a held Technique stronger). Nothing is bought during an Act, so the jungle shops and the Keeper's stock close.
3. **Techniques use the six gambit schools as their families. Recommend yes.** March, Initiative, Fortress, Sacrifice, Position and Clock already have colours, marks and glossary entries. One set of words for cards and builds. The Mind / Body / Soul item categories go.
4. **The Rank 8 fork joins the Technique pool. Recommend yes.** Only 13% of pieces ever reach Rank 8, so 30 of the best "changes how it plays" effects are almost never seen. They become archetype Techniques offered from Rank 4 on. Reaching Rank 8 instead makes that piece's next offer all top grade. One fewer pause mid-Act.
5. **In a Tournament run, Techniques reset every match (as items do now). The heirloom prize becomes "one piece keeps one Technique for the rest of the run". Recommend yes.** Archetypes and relics still carry, as now.
6. **Build it on a proposal branch first,** playable at `/proposal/`, the way the AAA proposal was. You play it, then it replaces items on `/v2/`. **Recommend yes.**
7. **Not now:** Techniques shared between two pieces ("pair moves") and team bonuses for stacking one school. Revisit after you have played it.

**Effort:** about **20 agent-days** (13.5 raw, padded 1.5× per the working agreement), plus about 4 hours of balance machine time.

## BLUF

- **Why today's items fall flat:** 15 of the 36 items are in no piece's build at all, the Wanderer's Boots open all 60 build lists, and by the end of a match items have added a median **+63% to a piece's main damage stat and +24% to its health**: power you cannot see, with rules ("every 8s, deal 40 Soul damage") nobody notices in a phone-sized fight. The Offense / Defense / Utility path is a switch that picks one of three fixed shopping lists.
- **What replaces them:** **Techniques**, Hades-style boons fitted to each piece's own skills, offered 1 of 3 at Setup and every Act break, in three grades, with **Combinations** (Vampire Survivors-style evolutions) when two named Techniques meet on one piece. Mostly luck in what you are offered; your skill is in what you take, what you reroll and what you upgrade.
- **Readable on purpose:** every card shows the slot it changes, a "plays like" line, real before → after numbers for that piece, an estimate from the last Act ("212 hits last Act: about 53 extra strikes"), and what Combination it leads to. At the next break each held Technique shows what it actually did ("Family Fork: 1,840 damage, hit 2 pieces 9 times").
- **Fits what is built:** it reuses the Act-break sheet (the Armory tab becomes **Builds**), the relic card's design and "What changes" ledger, the fork preview's stat engine, the item trigger engine, the gambit schools, Rank 4 archetypes and the run rules.

---

## 1. Diagnosis

Measured on this branch (Long Board, Classical, AI vs AI, 30 matches, seeds 29000–29029, 2026-10-18): median match 12.5 min with 2 Act breaks; Rank 2 at 2.3 min, Rank 4 at 6.5 min (95% of pieces), Rank 8 at 15.6 min (13% of pieces); about 94 item purchases a match (52 tier 1, 33 tier 2, 9 Masterworks), 72% of them during Acts. Item stats at match end (12 matches): a median piece holds 5 items, worth **+24% health** and **+63% of its main damage stat** (Blade or Soul) over its base.

1. **Items are mostly stats.** Every tier-2 and Masterwork item leads with two large numbers ("+600 health, +24 armor", "+60 Soul power, +14% cooldown reduction"). The rule after it is often a small number on a timer: Boiler Heart's "every 8s in combat, deal 40 Soul damage around you", Riveted Plate's "−5% damage taken", Pocket Reliquary's "every 10s, a shield of 20 + 40% Soul power". In a fight where a piece is 20–30 px tall, none of this can be seen; the effect shows up only as "this piece got tougher".
2. **Most items never come up.** Across all 60 build lists (5 pieces × 4 path sets × 3 paths), 14 of 15 tier-1 items and Runaway's Greaves appear in **none**: they are bought only as parts or as the AI's counter item. **Wanderer's Boots are first in all 60.** Cogged Edge is in 26. So the "choice" is mostly the same ten items in different orders.
3. **The path is a list, not a build.** Offense / Defense / Utility picks one of three hand-written six-item lists. It does not change what a piece does, only which stat it stacks. The words also clash with the archetypes (a Light Bishop on "Offense" buys Séance Prism and Wishgranter's Receipt).
4. **The AI buys by rote.** `nextPurchase` (`src/sim/ai/shopping.ts`) walks the list in order, buys an affordable part when the whole item is not, slips in Riveted Plate or Spirit Lens against the enemy's damage mix, and otherwise fills with the priciest tier-2 item of the piece's main category. Before Rank 4 a piece that will become a Regent (a Soul mage) buys the Queen's Blade list (Cogged Edge, Duelist's Form), which its archetype then cuts by 15%.
5. **Attunement and the colour theory serve a shop, not a piece.** The six-of-a-category attunement cannot be reached (the parts overlap; four is the most, BALANCE-2026-10-14). The Mind / Body / Soul hues explain what a tile feeds, which a shopping grid needs and a piece build does not.
6. **Gold is invisible power.** It buys items during Acts at shops the player never sees, and at the break by a 36-tile grid the player mostly skips (the AI shops untouched pieces on Resume). The money question today has one answer: buy the next thing on the list.
7. **The best effects are hidden at Rank 8.** The Rank 8 fork options are the most play-changing content in the game (Split Shot, Thousand Cuts, Shockwave, Hunter of Pieces, Queen of Ashes), and 87% of pieces never reach Rank 8.
8. **Words left over from the main game:** item text still says "heroes", "minions" and "the rest of the phase".

## 2. Reference systems

Fit test for each: phone first, five pieces per side, the player never controls a piece live, decisions happen at Setup, Rank 4 and the Act break, about 2 breaks in Blitz and 2–4 in Classical.

- **Teamfight Tactics items (8 components, 36 finished, carousel).** Components drop at random, any two make a finished item, and the recipe grid is learnable, which is great readability. The carousel (everyone picks from a shared ring) turns luck into a contested pick. **Borrow:** a small, learnable set of building blocks that combine into named results. **Not:** TFT's finished items are still mostly stats with one rule, the exact complaint, and placing 2-component recipes across five pieces is fiddly on a phone. A carousel needs several human players.
- **Hades boons, Daedalus hammers, duo boons.** Pick 1 of 3 after a room; every boon attaches to a slot (Attack, Special, Cast, Dash), so one boon per slot, and it changes how that move works (Zeus makes your Cast a lightning bolt). Rarity (Common to Heroic) is the same effect with bigger numbers; Poms upgrade a held boon; the hammer rewrites a weapon's behaviour; duo boons appear when two gods' boons meet. **Borrow almost all of it:** slots per skill, effect-first cards, grades, upgrades, combinations, god weighting (here: schools). **Not:** a boon every room (we have one offer per piece per break) and dash-feel boons (we have no live control).
- **Vampire Survivors evolutions.** A weapon plus a named passive, both held, evolve into a stronger form; the chart is simple and the moment is a jackpot. **Borrow:** Combinations: two named Techniques on one piece guarantee a third card that upgrades one of them into a new form. **Not:** the hidden-recipe discovery; we show the recipe on the card.
- **Slay the Spire card rewards and upgrades.** Pick 1 of 3 or **skip**; upgrades at campfires cost a rest. Skipping is a real choice because a lean deck is stronger. **Borrow:** "Pass" (take gold instead) and the upgrade-as-a-cost decision. **Not:** a deck; a piece's build is a few slots, not 30 cards.
- **League Arena augments.** Every augment round offers three augments of **one shared tier** (silver, gold, prismatic), with rerolls. Comparing three cards of the same tier is easy: you compare effects, not numbers. **Borrow:** one grade per offer, and a reroll. **Not:** stat-check augments ("+20% attack speed") and the live duel focus.
- **Balatro jokers.** A handful of slots; jokers combine (one feeds the next) and some scale through a run; every trigger flashes a number as it scores, so you always know what each joker earned. **Borrow:** per-Technique tallies ("what it did") and a few Techniques that grow over a match. **Not:** multiplicative chains that break balance; our fights are simulated against an AI that must also build.
- **Deadlock (the current armory).** Three categories by tier, flex slots, a shop you walk to. It made the 1C armory tidy, but it is a catalog: 36 tiles to read at every break on a phone, and the player's skill is knowing the catalog. **Keep:** the six-slot cap and the piece strip. **Retire:** shopping.
- **Path of Exile and Last Epoch skill trees (contrast only).** Hundreds of fixed nodes; depth comes from planning a route. On a phone, for five pieces, with matches that reset, that is a spreadsheet, and fixed trees get solved and copied. **Avoid:** a fixed tree. The "tree" the owner imagines is better made by luck: what you are offered grows from what you took.
- **Backpack Battles.** Auto-battles where the build is a grid of items with adjacency bonuses; after a fight each item shows its damage. **Borrow:** the post-fight "this item did X" readout. **Not:** spatial packing, which is fiddly at 390 px for five pieces.

## 3. Candidate systems

|                           | **A. Recipe items** (TFT)                                                                               | **B. Techniques** (Hades + VS)                                                                                                                    | **C. Rank tree** (talent tree, lit at random)                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| How a build is made       | 8 components drop (camps, kills, the break); any two on one piece combine into one of 36 finished items | Per piece: pick 1 of 3 Techniques at Setup and each break; one per slot (attack, each skill, signature, trait); two named ones make a Combination | Each archetype has a 12–15 node tree; at each break 3 nodes next to what you hold light up at random; pick one |
| Player agency             | Which piece gets which component; when to combine                                                       | Which card; reroll, upgrade or pass with the piece's gold; aim for a Combination                                                                  | Which lit node; the route is visible ahead                                                                     |
| Luck                      | Component drops                                                                                         | The offer, its grade                                                                                                                              | Which nodes light                                                                                              |
| Readability               | Good recipe grid; effects stay stat-heavy                                                               | Each card names the skill it changes, real numbers, what it did last Act                                                                          | Good on desktop; a tree per piece is cramped on a phone                                                        |
| Changes how a piece plays | Weakly (finished items are stats + a rule)                                                              | Strongly (each card rewrites a skill or attack)                                                                                                   | Strongly, but the same route every match once solved                                                           |
| AI difficulty             | Medium (placement and combine timing)                                                                   | Low (score three cards; same pattern as relic picks)                                                                                              | Low                                                                                                            |
| Reuse of built code / UI  | Item engine, Armory grid                                                                                | Item trigger engine, fork preview, relic cards and ledger, Armory piece strip, Act-break flow, schools, Rank 8 content                            | Fork preview, relic cards                                                                                      |
| Content to write          | 8 components + 36 combos (mostly rewrites)                                                              | 48 new Techniques; 30 Rank 8 options and 6 cursed items moved in                                                                                  | 15 trees × 12–15 nodes (about 200 nodes)                                                                       |
| Effort (padded)           | about 16 agent-days                                                                                     | about 20 agent-days                                                                                                                               | about 24 agent-days                                                                                            |
| Risk                      | Same "items are stats" complaint returns                                                                | Power curve without item stats; tap count at the break                                                                                            | Solved routes, low replay; content size                                                                        |

**Recommendation: B, Techniques.** Reasons:

1. It is exactly "mostly RNG offers, limited but meaningful choices": the offer is luck, the pick, the reroll, the upgrade and the pass are yours, and the Combination chart lets you steer toward a plan.
2. Every card changes how a piece plays, because it is attached to one of that piece's own skills. A Knight's build reads as "Family Fork, Ambush, Smothered Mate", not "+50 Blade".
3. It fits what is built: the Act break already stops play for decisions; the relic cards already teach pick 1 of 3 with real numbers; Rank 4 already opens a signature skill; the schools already have colours and glossary words; the trigger engine already runs execute, cheat death, every-Nth-hit and cooldown resets.
4. It is cheap for the AI to play well: three cards scored by the same kind of rule as relic picks and Rank 8 forks.
5. It is long-lasting: content grows by adding cards to pools, with no recipe matrix to rebalance.

**The money question.** Gold stays per piece and keeps doing its main job, which is Ranks (Rank is lifetime gold earned, unchanged). It is spent only at the Act break, on luck and growth: **Reroll** a piece's offer, **Upgrade** a held Technique one grade, or bank it. A **Pass** turns an offer into gold. So gold is the lever on luck, the way TFT gold is a choice between rolling and levelling. No shopping during Acts: the AI's shop trips and recall-to-spend end, the shop Squares stop being shops and the Keeper sells nothing.

**The Offense / Defense / Utility split goes.** A piece's lean comes from what it takes, shown by the school marks on its slots. Setup page 1 (Build paths) becomes **First moves** (pick each piece's first Technique). The fork sheet's Offense / Defense / Utility tag becomes the school mark.

## 4. The recommended system: Techniques

### 4.1 Rules (one sentence each)

- A **Technique** is a card that changes how one part of a piece works; its text names that part.
- Every piece has **six slots**: **Attack** (its basic hits), **Skill I, II and III** (its three base skills, by name), **Signature** (its Rank 4 archetype skill; opens at Rank 4) and **Trait** (always on).
- A slot holds one Technique; a card for a filled slot says "Replaces …" and swaps it.
- Each Technique belongs to one of the six **schools** and shows its colour and mark.
- Each piece gets an **offer** of three cards at Setup and at every Act break, and takes one.
- An offer is drawn with the seeded `build` stream: one card from the piece's own pool, one from the common pool, one wild card (a ready Combination, else any pool).
- Cards from the Opening's two schools are drawn twice as often, and cards from a school the piece already holds 1.5× as often (at most ×3 in all).
- A Technique the piece holds is never offered again, and an offer never holds two cards for the same slot.
- Every offer has one **grade** for all three cards: **Plain**, **Sharp (!)** or **Brilliant (!!)**; Sharp numbers are 1.5× Plain's bonus, Brilliant 2×.
- **Upgrade** raises one held Technique a grade, for that piece's gold, at a break.
- **Reroll** draws a new offer for that piece, for its gold; each further reroll of the same piece at the same break costs more.
- **Pass** declines the offer and gives the piece gold instead.
- A **Combination** needs two named Techniques on the same piece; once both are held it is the wild card of that piece's next offer, and taking it upgrades the first parent into the new form in its slot (the second stays).
- **Dubious (?!)** Techniques (Sacrifice school) give a large effect at a stated price.
- **Archetype Techniques** (today's Rank 8 options) are offered only to a piece of that archetype and take its Signature slot.
- Reaching **Rank 8** makes that piece's next offer Brilliant.
- At a break the player may pick for any piece; on **Resume** the AI picks for every piece not decided, as the armory does today.
- Black and AI-vs-AI pieces pick by the AI rule (4.5).
- Techniques start working when the next Act starts (the Setup pick at the first tick).
- Pieces grow by Rank: `ranks.growth` rises to replace the stats items gave (4.8).
- No items, no shops, no attunement: gold is spent only at the break.

### 4.2 Player flow (phone portrait 390×844 first)

1. **Setup, page 1: First moves** (replaces Build paths). One tab per piece (the five chips as today). Three Plain cards from the piece's own and common pools, the AI's pick pre-selected with the brass "AI suggests" pip. Each card: school mark and colour, the slot chip ("Changes: L-Leap"), name, one-line **plays like**, the rule with numbers for this piece, and "Leads to: Smothered Mate (with Ambush)". Quick start and Begin work at once. In a run, a piece with an heirloom Technique shows it as already taken, and its first move is drawn for another slot.
2. **Live.** No new HUD. The **piece card** lists its slots ("Attack · Wind-up !", "Skill I · Family Fork") with school marks and grade marks. The Rank-up chip and the Rank 4 fork sheet are unchanged; the Rank 4 sheet adds one line, "Opens the Signature slot". A Combination becoming ready shows a quiet rank-chip-style notice ("Knight: Smothered Mate ready at the break").
3. **Act break: Builds tab** (replaces Armory; tabs Report · Orders · Builds · Relics).
   - **Piece strip** (reused from the Armory): glyph, gold, a brass dot while its offer is open; the piece with a ready Combination first, then the most gold.
   - **Slot row**: six tiles (held Technique with its mark and grade, empty slot outline with the slot's name, Signature locked with "Rank 4" before then). Tap a held tile: its rule, **what it did last Act**, and **Upgrade · 600** with the before → after numbers.
   - **Three offer cards**, drawn face down and turned over one after another (the relic deal), side by side with a swipe (the next one peeks in). Each card: grade mark, school, slot chip or "Replaces Wind-up", name, plays like, rule, a **What changes** ledger with this piece's real numbers (before → after), a **Last Act** estimate when the card scales with something counted, and the Combination line. **Take** on each.
   - Under the cards: **Reroll · 200 gold**, **Pass · +150 gold**, **Let the AI choose** (this piece) and **AI picks for all**, and the line "Pieces you leave are picked for by the AI when you resume."
   - Landscape 844×390 and desktop: two columns (strip and slots left, cards right), as the Armory.
4. **Report tab** adds **What your Techniques did**: the top three Techniques of the Act by measured effect, one line each.
5. **Adjourn**: Builds read-only (slots and what each did so far), replacing the read-only Armory.
6. **End report**, Pieces page: each piece's build with per-Technique totals for the match.
7. **Run**: the Spoils heirloom card shows a Technique; the Run kit lists heirlooms per piece.

### 4.3 Content set

Starting numbers are Plain grade and are guesses for the balance run. Slots: **A** Attack, **I / II / III** the base skills, **S** Signature, **T** Trait. Engine needs are marked (new) where an addition from 4.7 is used.

**Common pool (18, any piece; Attack or Trait), three per school**

| School       | Technique          | Slot | Effect (Plain)                                                                                                           | Plays like                                       |
| ------------ | ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| March        | **Escort**         | T    | Your pawns and pawnlings within 200 deal +15% damage and take −10% (new: pawn filter on auras)                           | A wave leader: it wants to walk with its lane    |
| March        | **Battering Hits** | A    | Hits on Bastions and Thrones deal +25% (the 9%/s cap still holds)                                                        | A sieger that turns every push into a dent       |
| March        | **Push On**        | T    | After it hits a structure, +15% move and attack speed for 4 s                                                            | Keeps rolling from one Bastion to the next       |
| Initiative   | **Hunter's Mark**  | A    | Its first hit on an enemy piece marks it: +10% damage taken from all your pieces for 4 s (10 s per target)               | Points the team at one target                    |
| Initiative   | **Ambush**         | A    | Its first hit after 3 s out of combat deals +60% damage                                                                  | Opens fights from the side                       |
| Initiative   | **Wind-up**        | A    | Every 4th hit strikes twice (from Piston Gauntlet)                                                                       | Steady extra damage for fast attackers           |
| Fortress     | **The Vault**      | T    | Once per life, lethal damage leaves it at 1 health inside a 300 shield for 2 s (from Pocket Vault Shell)                 | Survives the one dive that should have killed it |
| Fortress     | **Toll**           | T    | When an enemy piece hits it, it and allies within 150 gain a 70 shield (14 s) (from Ward-Bell Cuirass)                   | Every hit on the front line protects the back    |
| Fortress     | **Deep Breath**    | T    | After 4 s out of combat, regains 2% max health a second (from Iron Lung)                                                 | Stays in lane instead of walking home            |
| Sacrifice ?! | **Blood Price**    | T    | +20% damage; loses 1% max health a second in combat                                                                      | Hits hard, must win fast                         |
| Sacrifice ?! | **Desperado**      | T    | Below 40% health +35% attack speed and +15% damage; its retreat line is halved                                           | Fights to the end instead of breaking off        |
| Sacrifice ?! | **Poisoned Piece** | T    | When it dies, the enemy piece that killed it takes 25% of this piece's max health as true damage; it respawns 20% slower | Makes diving it expensive                        |
| Position     | **Slip**           | T    | Dropping below 50% health dashes it 80 away from its attacker (12 s) (from Windstep Geta)                                | Escapes the first burst                          |
| Position     | **Pin**            | A    | Every 4th hit on a piece slows it 40% for 1.5 s                                                                          | Holds a target in place for the team             |
| Position     | **Shove**          | A    | Hits on pieces knock them back three times as far (knockback rule, at most 18 units)                                     | Peels attackers off allies, breaks enemy lines   |
| Clock        | **Tempo Thief**    | T    | Each enemy piece it helps kill gives your team +4 Tempo (new: Tempo effect)                                              | Turns its kills into cards                       |
| Clock        | **Spare Minute**   | T    | Every 20 s its cooldowns tick 2 s (from Bottled Hour)                                                                    | More skills, more often                          |
| Clock        | **Time Pressure**  | A    | Each hit on a piece cuts its own cooldowns by 0.3 s                                                                      | The more it hits, the more it casts              |

**Piece pools (20, four per piece type; change a named skill)**

| Piece  | Technique          | Slot               | School     | Effect (Plain)                                                                                              | How the piece plays differently                   |
| ------ | ------------------ | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| King   | **King's Walk**    | I One Step         | Initiative | One Step taunts its target for 1 s                                                                          | The King pulls the enemy carry onto himself       |
| King   | **Rallying Cry**   | II Rally           | Position   | Rally's speed-up becomes +25% for 4 s and frees allies from slows                                           | Turns a heal into a charge or an escape           |
| King   | **Shared Guard**   | III Royal Guard    | Fortress   | Royal Guard also shields the most wounded ally piece within 200 for 60% as much                             | A King who guards others, not himself             |
| King   | **Tithe**          | T                  | Clock      | Every pawnling your side kills within 250 of the King gives +0.5 Tempo                                      | A King who belongs in a busy lane                 |
| Queen  | **Through Line**   | I Royal Lunge      | Initiative | Royal Lunge dashes through its target and hits every enemy within 60 of where she lands (new: landing area) | Dives a clump, not one target                     |
| Queen  | **Echoing Decree** | II Sweeping Decree | Clock      | Sweeping Decree strikes again 1 s later at 50% (new: recast)                                                | Double zone control from range                    |
| Queen  | **Counter-Gambit** | III Withdraw       | Position   | Withdraw readies Royal Lunge at once (new: ready a skill)                                                   | She slips out and strikes straight back           |
| Queen  | **Long Range**     | A                  | Position   | +25% attack range; her hits slow 10% for 1 s                                                                | Kites from farther back                           |
| Rook   | **Rook Lift**      | I File Charge      | Position   | File Charge goes 50% farther and knocks its target back 40                                                  | Splits the enemy line on engage                   |
| Rook   | **Living Wall**    | II Stone Skin      | Fortress   | Stone Skin also shields allies within 150 for half as much                                                  | A tank whose shield is the team's                 |
| Rook   | **Quake**          | III Rampart Slam   | Position   | Rampart Slam no longer needs 2 enemies and stuns for 0.5 s                                                  | A lone Rook still locks a lane                    |
| Rook   | **Seventh Rank**   | T                  | March      | In the enemy half of the board, +15% damage and +15% armor                                                  | Pays the Rook for pushing deep                    |
| Bishop | **Long Diagonal**  | I Diagonal Beam    | Initiative | Diagonal Beam reaches 40% farther and also hits everything within 40 of its target                          | Poke from out of reach                            |
| Bishop | **Twin Blessing**  | II Blessing        | Fortress   | Blessing heals the two most wounded pieces                                                                  | A healer for a two-piece lane                     |
| Bishop | **Interdiction**   | III Censure        | Position   | Censure's slow lasts 3 s and also cuts attack speed 25%                                                     | Shuts down the enemy's diver                      |
| Bishop | **Fianchetto**     | T                  | Position   | Against a target on a lower tier, +20% damage (on top of the slope rule)                                    | Wants the high ground; the eye badge matters more |
| Knight | **Family Fork**    | I L-Leap           | Initiative | L-Leap's strike also hits up to 2 other enemy pieces within 100 of where he lands                           | Jumps into the middle of a fight, not its edge    |
| Knight | **Stampede**       | II Trample         | March      | Trample no longer needs 2 enemies and deals +50% to pawns and pawnlings                                     | Clears waves; splits pushes                       |
| Knight | **Hit and Run**    | III Spur Away      | Clock      | Spur Away readies L-Leap at once (new: ready a skill)                                                       | Leaps out and straight back in                    |
| Knight | **Zwischenzug**    | A                  | Clock      | After each skill, his next hit deals +40% damage                                                            | Skill, hit, skill, hit                            |

**Archetype pool (30, moved from the Rank 8 forks; Signature slot).** The two Rank 8 options of each of the 15 archetypes, unchanged in effect, offered from Rank 4 to a piece of that archetype, at the offer's grade (Plain = today's numbers). Examples: Huntress **Split Shot** (every 3rd attack also hits every enemy within 160 for 40% Blade), Duelist **Thousand Cuts** (every 4th hit deals 50% Blade as true damage), Vanguard **Shockwave**, Errant **Hunter of Pieces**, Regent **Queen of Ashes**, Usurper **Regicide**. Content moves from `styles[].forks['8']` to the Technique file; the effects already run.

**Dubious (6, moved from the cursed items).** The Hungry Mask, Borrowed Years, Lantern of the Drowned, Pact of Ash, Drink Me and Eat Me become Sacrifice Techniques (Trait), their boon and flaw both shown up front ("+20% move speed, +15% attack speed. The price: max health −15%"). They join the common pool, and the trailing side's offers draw them twice as often (the comeback role the curse offer had).

**Combinations (10).** Parent 1 is upgraded into the Combination in its slot; parent 2 stays.

| Combination           | Piece  | Parents                       | Effect                                                                           | What changes                              |
| --------------------- | ------ | ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| **Royal Fork**        | Knight | Family Fork + Hunter's Mark   | Every piece L-Leap hits is marked, and the mark lasts 6 s                        | One leap marks the whole back line        |
| **Smothered Mate**    | Knight | Family Fork + Ambush          | A kill with L-Leap readies it at once                                            | Chain dives through a weakened team       |
| **Windmill**          | any    | Wind-up + Time Pressure       | Every 4th hit strikes twice and cuts its cooldowns by 1 s                        | Fast attackers become skill engines       |
| **Castle Wall**       | Rook   | Living Wall + Toll            | Stone Skin shields allies at full strength and taunts enemies within 120 for 1 s | The Rook's guard turns the fight onto him |
| **Zugzwang**          | Queen  | Echoing Decree + Pin          | Enemies hit by both strikes of Sweeping Decree are stunned for 0.5 s             | Two strikes become a lockdown             |
| **Sanctified**        | Bishop | Twin Blessing + Deep Breath   | Blessing also gives its targets 2% max health a second for 4 s                   | Healing that keeps working after the cast |
| **Discovered Attack** | Bishop | Long Diagonal + Hunter's Mark | A beam that hits a marked piece also strikes the nearest other enemy piece       | The Bishop chains onto the team's target  |
| **Royal Court**       | King   | Rallying Cry + Shared Guard   | Rally also shields every piece it heals for 40 + 30% Soul                        | The King's heal becomes a team shield     |
| **Swindle**           | any    | Desperado + Slip              | Below 40% health it dashes away once, then fights at +35% attack speed for 6 s   | Escapes, then turns the fight             |
| **Steamroller**       | Rook   | Rook Lift + Battering Hits    | File Charge can target a Bastion and hits it for 150% Blade                      | The Rook opens sieges himself             |

**How builds read in play (examples):**

- **Lancer Knight:** First move Ambush, break 1 Family Fork, break 2 Smothered Mate. A diver who opens from the jungle edge and keeps leaping while kills land.
- **Paladin Knight:** Toll, Hit and Run, then Aegis Knight (archetype). A bodyguard who jumps to the hurt ally, shields, spurs out and comes back.
- **Huntress Queen:** Wind-up, Time Pressure, Windmill, then Split Shot. A backline machine gun that also clears waves.
- **Bastion Rook:** Quake, Living Wall, Toll, then Castle Wall. The lane does not move while he stands in it.
- **Shadow Bishop:** Long Diagonal, Hunter's Mark, Discovered Attack. Poke that hunts the marked target from out of reach.
- **Same Rook, different luck:** Rook Lift, Battering Hits, Steamroller, Seventh Rank. A siege Rook who pushes deep and charges Bastions.

### 4.4 Grades, offer odds and gold

| Offer at                       | Plain | Sharp (!) | Brilliant (!!) |
| ------------------------------ | ----- | --------- | -------------- |
| Setup (first move)             | 100%  | —         | —              |
| Break 1                        | 75%   | 22%       | 3%             |
| Break 2                        | 55%   | 35%       | 10%            |
| Break 3 and later              | 40%   | 40%       | 20%            |
| After the piece reaches Rank 8 | —     | —         | 100%           |

- The grade is rolled once per offer (Arena style), so the three cards are compared on what they do. A Combination arrives at the higher grade of its two parents.
- **Gold (starting numbers):** Reroll 200, then +100 for each further reroll of that piece at that break; Upgrade Plain → Sharp 600, Sharp → Brilliant 1,200; Pass gives +150. A piece earns about 320 gold a minute (Rank 4, 2,100 lifetime gold, at 6.5 min), so at break 1 a piece holds about 1,300: one upgrade, or a couple of rerolls. Gold not spent carries to the next break.
- Rank thresholds and gold income are unchanged (`ranks.goldThresholds`, bounties, camps).
- The Development relic (+15% gold) now means more rerolls and upgrades as well as faster Ranks; watch it in the balance run.

### 4.5 Informed decisions (what the player sees before choosing)

- **Real numbers for this piece.** `Match.techniquePreview(heroId, techniqueId, grade)` runs the sim's own stat and skill rules on a copy of the piece (the way `forkPreview` does in `src/sim/preview.ts`) and returns before → after stats and the changed skill's cooldown, power, reach and area. The card renders it as the relic card's **What changes** ledger (`src/ui/relicPlan.ts` style, green up, seal red down).
- **Last Act estimate.** When a card scales with something the Act report counts (hits, skill casts, kills, damage taken, structure hits), the card adds one line from the piece's own last Act: "212 hits last Act: about 53 extra strikes". The Act report gains per-piece hit and cast counts for this.
- **What it did.** Damage, healing and shields from a Technique are attributed to it where they are applied (trigger instances already carry their source id), counted per Act and per match. Held Techniques show it on the Builds tab ("Family Fork: 1,840 damage; hit 2 pieces 9 times"), the Report lists the top three, the end report lists all.
- **Where it leads.** Each card names the Combinations it is a parent of and whether the other parent is held. The slot row shows a small "1 away" chip on a held Technique whose partner is missing. This is the mostly-luck tree: you see the next branch but not whether you will be offered it.
- **Plain words.** Card text uses this branch's nouns (pieces, pawnlings, Acts) and the existing markup (`{m|}` Blade, `{b|}` health, `{s|}` Soul, `{r|}` rule words); a unit test checks every number in a card's text comes from its own parameters, as for relic headlines.

### 4.6 AI behaviour

- **Pick.** Score each card: grade value (1 / 1.5 / 2) + 1.0 if it fills an empty slot (−0.5 if it replaces) + 0.6 × fit with the piece's archetype axes (the damage / toughness / support axes `src/sim/ranks.ts` already computes for forks) + 0.4 per school match (Opening schools, schools already held) + 1.5 for a Combination + 0.3 if it is a parent whose partner can still be offered + seeded jitter 0–0.3 (`ai` stream). Take the best.
- **Gold, after the pick:** upgrade the held Technique with the most measured effect last Act on the side's top-damage piece first, while gold allows; reroll only when the best card scores under 1.2 and the piece can still afford an upgrade after it; pass only when no card fits (all would replace a Combination).
- **Before Rank 4,** "fit" uses the piece's base kit; afterwards its archetype.
- **"AI suggests"** marks the card the AI would take, and **Let the AI choose** takes exactly that, so they never disagree.
- **Named courts** keep their character: each court's five first moves are fixed in `content/courts.json` (replacing its paths), and its offers weight its Opening's schools as every side does.
- **Determinism:** the new `build` stream (streams are hashed by name, so the others do not shift); both sides' offers are drawn in a fixed order (White then Black, pieces in slot order) when the break starts; Black's offers are drawn from Black's own seat (`seatLanes` rule for any lane tie).

### 4.7 Sim and engine changes

- `content/techniques.json` and a `TechniqueSchema` (id, name, school, slot, piece or archetype or common, grades as a multiplier on the effect's bonus, `mods`, `triggers`, ability tweaks like today's rank bonuses, `parents` for Combinations, `dubious` with its price, `playsLike`, `desc`).
- `HeroState.techniques: { id, grade }[]` replaces `items` and `plan`; `computeStats` reads Techniques where it read items; attunement is removed.
- **Engine additions** (small, each unit-tested): a `cast` trigger (fires when a named skill is cast), a `recast` effect (the same skill again after a delay at a share of its power), a `ready` effect (clears one named skill's cooldown), a `tempo` effect (gives the team Tempo), an area at the landing point of a dash, and a pawn filter for auras.
- **Commands** (recorded like every command): `takeTechnique { heroId, cardIndex }`, `passOffer { heroId }`, `rerollOffer { heroId }`, `upgradeTechnique { heroId, techniqueId }`, `autoBuild { heroId | null }`; White only, Setup and break only.
- **Break order:** `enterBreak` → lane re-plan → relic offers → **build offers** for both sides → Black's AI picks → sheet; on `resumeAct` the AI picks for White's undecided pieces, then `enterAct`. Headless: both sides pick at once, White first.
- **Read-only:** `Match.buildView(heroId)` (slots, offer, costs, what each did) and `Match.techniquePreview`.
- **Removed from the sim:** live shopping, the `visitShop` goal and recall-to-spend, the break shop, `adaptTarget` (counter items), attunement, the Keeper's stock, the obelisk Masterwork discount (its reward becomes a free reroll for each of that side's pieces at the next break), the curse offer (its role moves to Dubious weighting).
- Baselines (`tests/baseline*.expected.json`) are re-recorded once, on purpose, after the balance run.

### 4.8 Balance plan (budget from CLAUDE.md)

1. **Measure first (no runs beyond a 200-match probe):** the stats items give at each break (median and p90 per piece type, as the 12-match probe did at match end: +24% health, +63% main damage), and convert them into `ranks.growth` (today 4.5% a Rank). Starting guess: about 9% a Rank, applied to health, Blade and Soul.
2. **Tune with 200-match probes** (direction only, ±7 points): White win rate, median length, first Bastion, kills; every Technique's pick rate when offered (target 10–60%), held win rate (44–58%), Combination rate (target: at least one Combination on 30–60% of White's pieces by the last break in Classical).
3. **Confirm:** `npm run balance -- --matches 800 --seed 29000 --quiet --workers 2` (Long Board). **Also seed 31000,** because this touches rules and the map's shops.
4. **Player-facing:** one 200-match `--white-player --white-every 60` probe; plus "choice matters": AI picks vs random picks for White (at least +3 points, the relic test), and a greedy preset (all Initiative, all Fortress) not above 60%.
5. **Blitz** (phones' default): one 200-match `--pace blitz` probe (median about 8–10 min).
6. **Tournament:** one `npm run tournament -- --runs 100 --seed 29000 --white-player --white-every 60 --workers 2 --ladder` to check the round table still lands (Club about 66%, Final about 41%).

- **Knobs:** grade multipliers, upgrade and reroll costs, `ranks.growth`, Combination numbers. Ask before any run beyond this budget.

### 4.9 Tournament run

- **Carries (unchanged):** court (Opening, lanes), archetypes, relics.
- **Resets:** Techniques, grades, gold, Ranks (as items do now).
- **Heirloom (changed):** "one piece keeps one Technique it held at the end of this match, Plain grade, from the start of every later match" (offered for the piece with the fewest Techniques, from what it held). The AI's Spoils pick values an heirloom Technique like a tier-2 heirloom today (about 900 gold against the book move's 500).
- **Run save** bumps to version 2; a version-1 save (heirloom items) is dropped with the existing warning.
- **Courts:** `path` in `content/courts.json` becomes `firstMove` per piece.

### 4.10 Migration

| Today                                                                                        | After                                                                                                 | Notes                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 36 items (`content/items/mind.json`, `body.json`, `soul.json`)                               | Retired                                                                                               | Six item rules move into the common pool (Wind-up, The Vault, Toll, Deep Breath, Slip, Spare Minute); their trigger shapes are reused as written |
| 6 cursed items, the curse offer                                                              | 6 Dubious Techniques                                                                                  | Effects reused; flaw shown up front                                                                                                              |
| Build paths Offense / Defense / Utility (`Path`, `setPath`, path lists in pieces and styles) | Retired                                                                                               | Setup page 1 becomes First moves; Orders loses Paths                                                                                             |
| Armory tab, `buy` / `sell` / `setPlan` / `autoShop`, `src/sim/armory.ts`                     | Builds tab, new commands                                                                              | Piece strip, slot row, two-column layouts and the "picked for you on Resume" rule are reused                                                     |
| Live shops: base, jungle Squares, Keeper stock, `visitShop`, `shopTripRadius`                | Retired                                                                                               | Squares stay as map places; their gem medallion goes (one meaning per look)                                                                      |
| Attunement (`tuning.attunement`)                                                             | Retired                                                                                               |                                                                                                                                                  |
| Rank 8 fork (pause, sheet)                                                                   | Archetype Techniques; Rank 8 = Brilliant next offer                                                   | Content moved, effects unchanged                                                                                                                 |
| Item colour theory (Mind cobalt, Body moss, Soul violet as categories)                       | School colours on cards                                                                               | The stat-word colours in descriptions stay (they follow the stat)                                                                                |
| Heirloom item                                                                                | Heirloom Technique                                                                                    | Save version 2                                                                                                                                   |
| Obelisk "25% off a Masterwork"                                                               | A free reroll for each piece at the next break                                                        |                                                                                                                                                  |
| Glossary: Build path, Armory, Plan, Parts, AI suggests, Masterwork                           | Technique, Slot (redefined), Grade, Upgrade, Reroll, Combination, Dubious, Builds; Heirloom redefined | `tests/glossary.test.ts` rules apply                                                                                                             |

**Reversed-decision rows to add when built** (SOURCE_OF_TRUTH "Reversed decisions"):

1. 36 items in Mind / Body / Soul with attunement → Techniques by gambit school (this spec).
2. Build paths (Offense / Defense / Utility) pick a piece's item list → First moves and Technique offers.
3. Interactive armory at every Act break (1C), Masterworks at the break → Builds tab; no items.
4. Jungle shops stay (CHESS.md owner table, 2026-10-08) → no shops; Squares are map places only.
5. Rank 8 fork pauses the match → Rank 8 options are archetype Techniques; Rank 8 gives a Brilliant offer.
6. Heirloom item spoils → heirloom Technique.
7. Counter item (riveted plate or spirit lens) → none.
8. Cursed items offered to the trailing piece → Dubious Techniques weighted toward the trailing side.

Docs to update when built: CHESS.md (Pieces, Ranks and forks, Act break, Tournament run, Interface: setup, piece card, fork sheet), SOURCE_OF_TRUTH ("Items and shop", "Cursed items", AI Shopping), ITEMS.md moved to `docs/archive/` with a pointer here, ARCHITECTURE.md (new files).

### 4.11 Test plan

- **Unit:** offers are the same for the same seed and change with it; slot rules (one per slot, replace, Signature locked before Rank 4); a Combination is offered once both parents are held and upgrades parent 1; grade odds by break over 10,000 draws; Rank 8 gives a Brilliant offer; reroll, upgrade and pass costs and gold; the AI pick is deterministic and the "AI suggests" card equals "Let the AI choose"; untouched White pieces are picked for on Resume; every engine addition (`cast`, `recast`, `ready`, `tempo`, landing area, pawn filter); attribution totals add up to the damage dealt; `techniquePreview` equals the stats after taking the card; every number in a card's text comes from its parameters; White in `top` builds exactly like Black in `bot` (`tests/symmetry.test.ts`); a replay with build commands is identical; run save version 2 and the heirloom carry.
- **Baselines:** re-recorded once after balance, on purpose (`npm run baseline`).
- **Browser:** `tests/e2e/builds.spec.ts` (Setup First moves; at a break take, reroll, upgrade, pass, resume; at 390×844, 844×390 and 1440×900 nothing overflows sideways and targets are at least 44 px); the touched specs (setup, armory spec retired, tournament Spoils, onboarding's break walk), smoke; full `npx playwright test` once before announcing it live.

### 4.12 Build phases (agent-days, raw; total padded 1.5×)

| Phase | What                                                                                                                                         | Days                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 0     | Measure item power per break; set `ranks.growth`; write the number sheet                                                                     | 0.5                 |
| 1     | Sim core: schema, slots, grades, offers (`build` stream), commands, AI pick and gold rules, attribution, preview, headless order; unit tests | 3                   |
| 2     | Engine additions (cast trigger, recast, ready, Tempo effect, landing area, pawn aura filter)                                                 | 1                   |
| 3     | Content: 48 new Techniques, 30 archetype and 6 Dubious moved, 10 court first moves, glossary                                                 | 2                   |
| 4     | Retire items, shops, Armory, paths, attunement, counter items, Keeper stock, curse offer; obelisk reward; run save v2                        | 1.5                 |
| 5     | UI: Builds tab, Setup First moves, piece card slots, fork sheet line, Adjourn, Report and end-report tallies, Spoils and Run kit             | 3                   |
| 6     | Balance (4.8) and baseline re-record                                                                                                         | 1.5                 |
| 7     | Browser tests, onboarding walk text, docs and reversed rows                                                                                  | 1                   |
|       | **Total raw / padded**                                                                                                                       | **13.5 / about 20** |

Order: on a proposal branch (decision 6); phases 0–4 before any screen work, because the sim has to balance without items before the UI is worth polishing.

### 4.13 Risks

- **Power curve without item stats.** Items gave +24% health and +63% main damage by the end. Mitigation: measure first and move it into Rank growth (phase 0), then tune with probes.
- **Taps at the break.** Five offers plus a relic on a phone. Mitigation: the AI picks for every piece left on Resume; "AI picks for all"; the piece with a ready Combination is shown first so the one big decision is never missed.
- **Too much luck.** A bad offer for the carry. Mitigation: reroll, pass and the school weighting; the AI-vs-random test (at least +3 points) proves choices matter.
- **Some Techniques are dull or too strong.** Mitigation: per-Technique pick and held win rates in the probes; an outlier gets one number changed.
- **New engine rules (recast, ready) misfire.** Mitigation: unit tests per addition and the attribution tally, which shows a Technique that never fires.
- **The AI changes lanes behaviour** once shop trips and recall-to-spend go (pieces stay in lanes longer). Mitigation: the seed 31000 confirm run and the lane-share check; it removes a known cause of hoarding rather than adding one.
- **Colour clash:** Sacrifice's amethyst sits near the Soul stat violet. Mitigation: school cards always carry the school glyph and name; stat words stay inside the text only.
